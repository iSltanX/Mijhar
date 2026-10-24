// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// مسار الكتابة إلى الحافظة (T-11.3، HYP-18، BLK-CLIPBOARD-DENIED) بجدول evidence/T-0.5: writeText أولًا، ثم البديل execCommand('copy') من حقل مؤقت في جذر الظل، ولا نجاح
// بلا نجاح فعلي، والفشل بسببه. الحقل المؤقت يُزال دائمًا ولا يبقى صندوق نص في الصفحة.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clipboardReason, copyText } from '../../../../src/modules/e/copy-prompt';

const TEXT = '# برومبت\n\nنص عربي مع `code` ورابط https://github.com/octo/demo';

function host(): ShadowRoot {
  const el = document.createElement('div');
  document.body.append(el);
  return el.attachShadow({ mode: 'open' });
}

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined): void {
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: writeText ? { writeText } : undefined });
}

function stubExec(result: boolean | Error): ReturnType<typeof vi.fn> {
  const exec = vi.fn((command: string) => {
    if (result instanceof Error) throw result;
    // يُنسخ ما في الحقل المحدد وقت الاستدعاء.
    copied.push((document.activeElement?.shadowRoot?.activeElement as HTMLTextAreaElement | null)?.value ?? '');
    return command === 'copy' && result;
  });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: exec });
  return exec;
}
const copied: string[] = [];

afterEach(() => {
  copied.length = 0;
  document.body.replaceChildren();
  Reflect.deleteProperty(document, 'execCommand');
  Reflect.deleteProperty(window.navigator, 'clipboard');
});

describe('copyText', () => {
  it('writeText تنجح: يُكتب النص نفسه كاملًا ولا يُمَس البديل', async () => {
    const write = vi.fn(async () => {});
    stubClipboard(write);
    const exec = stubExec(true);
    const shadow = host();
    expect(await copyText(TEXT, shadow)).toEqual({ ok: true, via: 'clipboard' });
    expect(write).toHaveBeenCalledWith(TEXT);
    expect(exec).not.toHaveBeenCalled();
    expect(shadow.querySelector('textarea')).toBeNull();
  });

  it('writeText تُرفض (NotAllowedError) فينجح البديل من حقل في جذر الظل: نجاح فعلي بطريقته، والحقل يُزال والتركيز يعود', async () => {
    stubClipboard(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });
    const exec = stubExec(true);
    const shadow = host();
    const button = document.createElement('button');
    shadow.append(button);
    button.focus();
    const result = await copyText(TEXT, shadow);
    expect(result).toEqual({ ok: true, via: 'fallback' });
    expect(exec).toHaveBeenCalledWith('copy');
    expect(copied[0]).toBe(TEXT);
    // الحقل لم يُنشأ في مستند الصفحة بل في جذر الظل، وأُزيل بعد النسخ.
    expect(document.querySelector('textarea')).toBeNull();
    expect(shadow.querySelector('textarea')).toBeNull();
    expect(shadow.activeElement).toBe(button);
  });

  it('الطريقتان تفشلان: فشل بسبب الرفض ثم فشل البديل، ولا نجاح', async () => {
    stubClipboard(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
    });
    stubExec(false);
    const shadow = host();
    const result = await copyText(TEXT, shadow);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('رفض المتصفح الكتابة إلى الحافظة');
      expect(result.reason).toContain('فشل البديل');
    }
    expect(shadow.querySelector('textarea')).toBeNull();
  });

  it('execCommand ترمي: فشل لا استثناء', async () => {
    stubClipboard(undefined);
    stubExec(new Error('boom'));
    const result = await copyText(TEXT, host());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('واجهة الحافظة غير متاحة في هذا السياق');
  });

  it('لا navigator.clipboard (سياق لا يسمح بها): يُجرَّب البديل أولًا ثم يُعلن السبب', async () => {
    stubClipboard(undefined);
    const exec = stubExec(true);
    expect(await copyText(TEXT, host())).toEqual({ ok: true, via: 'fallback' });
    expect(exec).toHaveBeenCalledTimes(1);
  });
});

describe('clipboardReason', () => {
  it('أسماء الأخطاء الموثّقة في T-0.5 بأسبابها', () => {
    expect(clipboardReason({ name: 'NotAllowedError' })).toContain('رفض المتصفح');
    expect(clipboardReason({ name: 'SecurityError' })).toContain('رفض المتصفح');
    expect(clipboardReason({ name: 'ClipboardUnavailable' })).toContain('غير متاحة');
    expect(clipboardReason({ name: 'DataError' })).toBe('تعذّرت الكتابة إلى الحافظة (DataError)');
    expect(clipboardReason(undefined)).toBe('تعذّرت الكتابة إلى الحافظة');
  });
});

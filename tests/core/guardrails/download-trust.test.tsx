// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// AD-33 (I-1) وAC-F7 (٤) شق الوحدة: زرّا التنزيل القائمان في الصفحة يقبلان نقرة المستخدم الموثوقة وحدها. النقر البرمجي (click() أو حدث مُنشأ
// بسكربت، كما يفعل سكربت في عالم الصفحة يبلغ جذر الظل المفتوح) لا ينزّل شيئًا، والنقرة الموثوقة تنزّل كما كانت بالنص والاسم نفسيهما.
//  - download-prompt: البديل اليدوي في «نسخ البرومبت» بعد فشل الحافظة (MJ20).
//  - builder-download: «نزّل كملف .md» في شريط حزمة السياق (MJ15).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContextBuilderModule } from '../../../src/modules/e/builder';
import { createCopyPromptModule } from '../../../src/modules/e/copy-prompt';
import type { CopyFn } from '../../../src/modules/e/copy-prompt';
import { trustedClick } from '../../shared/trusted-click';
import { flush, hostsOf, mountModules } from '../../modules/d/helpers';
import { E_FIXTURE, loadFile } from '../../modules/e/helpers';
import { COPY_HOST, NOW, SAMPLES, mountOn, view } from '../../modules/e/copy-prompt/helpers';

afterEach(() => vi.restoreAllMocks());

const recorder = () => {
  const downloaded: Array<{ text: string; name: string }> = [];
  const download = vi.fn(async (text: string, name: string) => {
    downloaded.push({ text, name });
    return 'downloaded' as const;
  });
  return { downloaded, download };
};

/** النقرات البرمجية الممكنة لسكربت في الصفحة. */
function untrustedClicks(el: HTMLElement): void {
  el.click();
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
  el.dispatchEvent(new PointerEvent('click', { bubbles: true, composed: true }));
}

describe('AD-33: download-prompt («نسخ البرومبت»)', () => {
  it('النقر البرمجي لا ينزّل؛ والنقرة الموثوقة تنزّل البرومبت باسمه كما كانت', async () => {
    const r = recorder();
    const fail: CopyFn = async () => ({ ok: false, reason: 'رفض المتصفح الكتابة إلى الحافظة (اختبار)' });
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy: fail, download: r.download, settings: { template: () => 'auto', lineLimit: () => 400 }, now: () => NOW })]);
    const ui = view();
    expect(hostsOf(COPY_HOST)).toHaveLength(1);
    await ui.click('[data-action="copy-prompt"]');
    const button = ui.q<HTMLButtonElement>('[data-action="download-prompt"]') as HTMLButtonElement;
    expect(button).not.toBeNull();

    untrustedClicks(button);
    await flush();
    expect(r.download).not.toHaveBeenCalled();
    expect(ui.q('[data-download="downloaded"]')).toBeNull();

    trustedClick(button);
    await flush();
    expect(r.download).toHaveBeenCalledTimes(1);
    expect(r.downloaded[0]?.name).toBe('mijhar-prompt-next-step-octo-demo-4242.md');
    expect(ui.q('[data-download="downloaded"]')).not.toBeNull();
    manager.stop();
  });
});

describe('AD-33: builder-download (حزمة السياق)', () => {
  it('النقر البرمجي لا ينزّل؛ والنقرة الموثوقة تنزّل نص المعاينة كما كانت', async () => {
    const r = recorder();
    loadFile(E_FIXTURE);
    const copy = vi.fn(async () => 'copied' as const);
    const { manager } = await mountModules([createContextBuilderModule({ now: () => NOW, copy, download: r.download })]);
    const root = hostsOf('e.builder')[0]?.shadowRoot as ShadowRoot;
    (root.querySelector('[data-action="builder-toggle"]') as HTMLElement).click();
    await flush();
    const button = root.querySelector('[data-action="builder-download"]') as HTMLButtonElement;
    const preview = (root.querySelector('[data-preview]') as HTMLTextAreaElement).value;

    untrustedClicks(button);
    await flush();
    expect(r.download).not.toHaveBeenCalled();
    expect(root.querySelector('[data-download-state]')).toBeNull();

    trustedClick(button);
    await flush();
    expect(r.download).toHaveBeenCalledTimes(1);
    expect(r.downloaded[0]?.text).toBe(preview);
    expect(root.querySelector('[data-download-state="downloaded"]')).not.toBeNull();
    manager.stop();
  });
});

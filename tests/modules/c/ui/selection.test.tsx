// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/mijhar-demo/issues/7"}
// ترجمة النص المحدد (AC-C1: «نص محدد»): زر «ترجمة المحدد» عند تحديد نص إنجليزي داخل نص مرسوم، ولا ترجمة قبل ضغطه؛ والبطاقة بالأصل والترجمة؛
// والعناصر المحمية داخل التحديد تعود كما كانت؛ وغيرها (عربي، خارج .markdown-body، تحديد مطوي) لا زر له؛ وEscape يغلق دون مساس بالصفحة.
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INTEGRITY_WARNING } from '../../../../src/modules/c/masking';
import { FakeTranslationEngine, setTranslationService } from '../../../../src/modules/c/ui';
import { FIXTURE, flush, hosts, loadHtml, mountTranslate, pageHtml } from './helpers';
import type { Live } from './helpers';

let live: Live | null = null;
beforeEach(() => loadHtml(FIXTURE));
afterEach(() => {
  document.getSelection()?.removeAllRanges();
  live?.manager.stop();
  live = null;
  setTranslationService(null);
});

const host = (): HTMLElement | null => hosts('c.ui.selection')[0] ?? null;
const root = (): ShadowRoot => host()!.shadowRoot!;
const button = (): HTMLButtonElement | null => host()?.shadowRoot?.querySelector<HTMLButtonElement>('[data-action="translate-selection"]') ?? null;
const card = (): HTMLElement | null => host()?.shadowRoot?.querySelector<HTMLElement>('.sel-card') ?? null;

async function select(from: Node, fromOffset: number, to: Node, toOffset: number): Promise<void> {
  const range = document.createRange();
  range.setStart(from, fromOffset);
  range.setEnd(to, toOffset);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  await act(async () => {
    document.dispatchEvent(new Event('selectionchange'));
    await flush(40);
  });
}
const textNode = (selector: string, index = 0): Text => [...document.querySelector(selector)!.childNodes].filter((n): n is Text => n.nodeType === 3)[index]!;

describe('زر «ترجمة المحدد»', () => {
  it('يظهر عند تحديد نص إنجليزي داخل نص مرسوم، ولا يُستدعى المحرك قبل ضغطه', async () => {
    const engine = new FakeTranslationEngine();
    live = await mountTranslate({ service: engine });
    const node = textNode('[data-case="c1-p1"]');
    await select(node, 0, node, 20);
    expect(host()).not.toBeNull();
    expect(button()!.textContent).toBe('ترجمة المحدد');
    expect(engine.calls).toBe(0);
    expect(card()).toBeNull();
  });

  it('الضغط يترجم المحدد وحده ويعرض الأصل والترجمة في بطاقة، وزر الإغلاق وEscape يغلقانها', async () => {
    const engine = new FakeTranslationEngine();
    live = await mountTranslate({ service: engine });
    const node = textNode('[data-case="p-sentences"]');
    await select(node, 0, node, 'The side panel opens from the toolbar.'.length);
    await act(async () => {
      button()!.click();
      await flush(40);
    });
    expect(engine.calls).toBe(1);
    expect(engine.received[0]).toBe('The side panel opens from the toolbar.');
    const c = card()!;
    expect(c.getAttribute('role')).toBe('dialog');
    expect(c.querySelector('[data-section="original"]')!.textContent).toBe('The side panel opens from the toolbar.');
    expect(c.querySelector('[data-section="translation"]')!.textContent).toBe('ترجمة: The side panel opens from the toolbar.');
    expect(c.querySelector('[data-section="translation"]')!.getAttribute('dir')).toBe('rtl');
    expect(root().activeElement).toBe(c);
    await act(async () => {
      c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
      await flush(10);
    });
    expect(host()).toBeNull();
  });

  it('تحديد يعبر code ورابطًا: يُحميان ويعودان كما كانا في الترجمة', async () => {
    const engine = new FakeTranslationEngine();
    live = await mountTranslate({ service: engine });
    const p = document.querySelector('[data-case="p-code-link"]')!;
    await select(p.firstChild!, 0, p.lastChild!, p.lastChild!.textContent!.length);
    await act(async () => {
      button()!.click();
      await flush(40);
    });
    expect(engine.received[0]).toMatch(/Run ⟦CODE_0⟧ first, then see the ⟦LINK_1⟧ for details\.$/);
    const prot = [...card()!.querySelectorAll<HTMLElement>('[data-section="translation"] .prot')].map((el) => [el.localName, el.getAttribute('data-type'), el.textContent, el.getAttribute('href')]);
    expect(prot).toEqual([
      ['code', 'CODE', 'npm install', null],
      ['a', 'LINK', 'installation guide', 'https://github.com/octo/mijhar-demo/blob/main/INSTALL.md'],
    ]);
  });

  it('تحديد يعبر فقرات: كل فقرة سطر في الإرسال ولا شيء يسقط', async () => {
    const engine = new FakeTranslationEngine();
    live = await mountTranslate({ service: engine });
    await select(textNode('[data-case="c1-p1"]'), 0, textNode('[data-case="c1-p2"]'), 3);
    await act(async () => {
      button()!.click();
      await flush(40);
    });
    expect(engine.received[0]).toContain('\n');
    expect(engine.received[0]).toContain('I can reproduce this with');
    expect(engine.received[0]).toMatch(/\nSee$/);
  });

  it('محرك يخل بالرموز: يبقى الأصل مع التنبيه الحرفي ولا يُعرض نص مشوَّه', async () => {
    const engine = new FakeTranslationEngine({ mode: 'drop' });
    live = await mountTranslate({ service: engine });
    const p = document.querySelector('[data-case="p-code-link"]')!;
    await select(p.firstChild!, 0, p.lastChild!, p.lastChild!.textContent!.length);
    await act(async () => {
      button()!.click();
      await flush(40);
    });
    const c = card()!;
    expect(c.getAttribute('data-status')).toBe('kept');
    expect(c.querySelector('[data-section="notice"]')!.textContent).toBe(INTEGRITY_WARNING);
    expect(c.querySelector('[data-section="translation"]')).toBeNull();
  });

  it('محرك غير متاح: السبب في البطاقة بلا استدعاء؛ وتعطله: رسالة الخطأ', async () => {
    const unavailable = new FakeTranslationEngine({ availability: { state: 'unavailable', reason: 'النموذج غير منزَّل' } });
    live = await mountTranslate({ service: unavailable });
    const node = textNode('[data-case="c1-p1"]');
    await select(node, 0, node, 20);
    await act(async () => {
      button()!.click();
      await flush(40);
    });
    expect(card()!.getAttribute('data-status')).toBe('unavailable');
    expect(card()!.textContent).toContain('المحرك غير متاح: النموذج غير منزَّل');
    expect(unavailable.calls).toBe(0);
    live.manager.stop();
    const failing = new FakeTranslationEngine({ mode: 'error' });
    live = await mountTranslate({ service: failing });
    await select(node, 0, node, 20);
    await act(async () => {
      button()!.click();
      await flush(40);
    });
    expect(card()!.getAttribute('data-status')).toBe('error');
    expect(card()!.textContent).toContain('تعذّرت الترجمة');
  });
});

describe('ما لا يُعرض له زر', () => {
  it('نص عربي، أو خارج .markdown-body، أو تحديد مطوي أو أقصر من ثلاثة أحرف، أو والمحرك غائب', async () => {
    const engine = new FakeTranslationEngine();
    live = await mountTranslate({ service: engine });
    const arabic = textNode('[data-case="p-arabic"]');
    await select(arabic, 0, arabic, 20);
    expect(host()).toBeNull();
    const header = document.querySelector('#repository-container-header a')!.firstChild!;
    await select(header, 0, header, 5);
    expect(host()).toBeNull();
    const english = textNode('[data-case="c1-p1"]');
    await select(english, 0, english, 2);
    expect(host()).toBeNull();
    await select(english, 3, english, 3);
    expect(host()).toBeNull();
    live.manager.stop();
    live = await mountTranslate({ service: null });
    await select(english, 0, english, 20);
    expect(host()).toBeNull();
    expect(engine.calls).toBe(0);
  });

  it('إزالة التحديد تخفي الزر', async () => {
    live = await mountTranslate({ service: new FakeTranslationEngine() });
    const node = textNode('[data-case="c1-p1"]');
    await select(node, 0, node, 20);
    expect(button()).not.toBeNull();
    document.getSelection()!.removeAllRanges();
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
      await flush(40);
    });
    expect(host()).toBeNull();
  });
});

describe('لا أثر في الصفحة', () => {
  it('الزر والبطاقة وإغلاقهما وإيقاف الوحدة: الصفحة حرفيًا كما كانت', async () => {
    const pristine = pageHtml();
    live = await mountTranslate({ service: new FakeTranslationEngine() });
    const node = textNode('[data-case="c1-p1"]');
    await select(node, 0, node, 20);
    await act(async () => {
      button()!.click();
      await flush(40);
    });
    expect(card()).not.toBeNull();
    live.manager.stop();
    live = null;
    expect(host()).toBeNull();
    expect(pageHtml()).toBe(pristine);
  });
});

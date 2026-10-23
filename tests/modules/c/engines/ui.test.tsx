// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/mijhar-demo/issues/7"}
// TEST-TR-04 (AC-C4 وAC-C1) عبر واجهة الترجمة كما تُشحن، بمحرك DEC-03 المختار (selectLocalEngine) فوق صنف Translator وهمي:
//  - حالات AC-C1 الأربع على المحرك (فقرة README وتعليق ووصف مشكلة ونص محدد)، ولا إنشاء مترجم ولا ترجمة قبل الضغط؛
//  - عند غياب المحرك (Edge: 'unavailable'، Firefox: لا Translator API) حالة صريحة وبديل «نسخ النص المقنَّع»، بلا أي اتصال.
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_MESSAGES, selectLocalEngine, TranslatorApiEngine } from '../../../../src/modules/c/engines';
import { setTranslationService } from '../../../../src/modules/c/ui';
import type { TranslationService } from '../../../../src/modules/c/ui';
import { FIXTURE, barBefore, bars, barNote, flush, hosts, loadHtml, mountTranslate, pageHtml, phase, press, protectedIn, translationFor, translations } from '../ui/helpers';
import type { Live } from '../ui/helpers';
import { FakeTranslatorApi } from './fake-translator';

let live: Live | null = null;
const network = { fetch: vi.fn(), xhr: vi.fn(), beacon: vi.fn() };
beforeEach(() => {
  loadHtml(FIXTURE);
  vi.stubGlobal('fetch', network.fetch);
  vi.stubGlobal('XMLHttpRequest', network.xhr);
  Object.defineProperty(navigator, 'sendBeacon', { value: network.beacon, configurable: true });
});
afterEach(() => {
  document.getSelection()?.removeAllRanges();
  live?.manager.stop();
  live = null;
  setTranslationService(null);
  vi.unstubAllGlobals();
  for (const spy of Object.values(network)) spy.mockReset();
});

const README = '[data-case="readme"]';
const ISSUE = '[data-case="issue-description"]';
const COMMENT1 = '[data-case="comment-body-1"]';
const noNetwork = (): void => {
  expect(network.fetch).not.toHaveBeenCalled();
  expect(network.xhr).not.toHaveBeenCalled();
  expect(network.beacon).not.toHaveBeenCalled();
};

async function mountWith(engine: TranslationService, copied?: string[]): Promise<Live> {
  live = await mountTranslate({ service: engine, ...(copied ? { copy: async (text: string) => void copied.push(text) } : {}) });
  return live;
}

const selHost = (): HTMLElement | null => hosts('c.ui.selection')[0] ?? null;
const selRoot = (): ShadowRoot => selHost()!.shadowRoot!;
async function selectText(selector: string, length: number): Promise<void> {
  const node = [...document.querySelector(selector)!.childNodes].find((n): n is Text => n.nodeType === 3)!;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, length);
  document.getSelection()!.removeAllRanges();
  document.getSelection()!.addRange(range);
  await act(async () => {
    document.dispatchEvent(new Event('selectionchange'));
    await flush(40);
  });
}
async function clickIn(root: ShadowRoot, action: string, wait = 40): Promise<void> {
  await act(async () => {
    root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.click();
    await flush(wait);
  });
}

describe('AC-C1 على محرك DEC-03 (Translator API، الحزمة downloadable)', () => {
  it('قبل أي ضغط: الأشرطة ظاهرة، ولا مترجم يُنشأ ولا نص يُرسل', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    await mountWith(selectLocalEngine({ Translator: fake.asGlobal() }));
    expect(bars()).toHaveLength(5);
    await flush(30);
    expect(fake.createCalls).toBe(0);
    expect(fake.received).toEqual([]);
    for (const bar of bars()) expect(phase(bar)).toBe('idle');
  });

  it('فقرة README وتعليق ووصف مشكلة: تُترجم عند الضغط، والعناصر المحمية تعود كما هي، والمحرك لم يرَ ⟦…⟧', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    await mountWith(selectLocalEngine({ Translator: fake.asGlobal() }));
    for (const [selector, blocks] of [[README, 17], [COMMENT1, 2], [ISSUE, 2]] as const) {
      const before = fake.received.length;
      await press(barBefore(selector), 'translate', 80);
      expect(phase(barBefore(selector)), selector).toBe('done');
      expect(fake.received.length - before, selector).toBe(blocks);
    }
    expect(fake.createCalls).toBe(1);
    expect(fake.received.some((text) => /[⟦⟧]/.test(text))).toBe(false);
    expect(fake.received.some((text) => /\{\d+\}/.test(text))).toBe(true);
    expect(translations()).toHaveLength(21);
    const p = translationFor('[data-case="p-code-link"]')!;
    expect(protectedIn(p).map((x) => x.text)).toEqual(['npm install', 'installation guide']);
    const c1 = translationFor('[data-case="c1-p1"]')!;
    expect(protectedIn(c1).map((x) => x.text)).toContain('v2.0.1-rc.3');
    expect(barNote(barBefore(README))).toBe('تُرجمت 17 من 17 فقرة.');
    noNetwork();
  });

  it('نص محدد: «ترجمة المحدد» يترجم بالمحرك نفسه وتعرض البطاقة الترجمة', async () => {
    const fake = new FakeTranslatorApi({ state: 'available' });
    await mountWith(selectLocalEngine({ Translator: fake.asGlobal() }));
    await selectText('[data-case="p-sentences"]', 'The side panel opens from the toolbar.'.length);
    expect(fake.received).toEqual([]);
    await clickIn(selRoot(), 'translate-selection');
    expect(fake.received).toEqual(['The side panel opens from the toolbar.']);
    expect(selRoot().querySelector('[data-section="translation"]')!.textContent).toBe('ترجمة: The side panel opens from the toolbar.');
    noNetwork();
  });

  it('خطأ المحرك (NotSupportedError مرتين) يُعلَن في الشريط ويمكن إعادة الضغط فينجح', async () => {
    const fake = new FakeTranslatorApi({ createFailures: ['NotSupportedError', 'NotSupportedError'] });
    await mountWith(new TranslatorApiEngine(fake.asGlobal(), { retryDelayMs: 0 }));
    const bar = barBefore(COMMENT1);
    await press(bar, 'translate', 60);
    expect(phase(bar)).toBe('error');
    expect(barNote(bar)).toContain(ENGINE_MESSAGES.notReady);
    await press(bar, 'translate', 60);
    expect(phase(bar)).toBe('done');
  });
});

describe('AC-C4: غياب المحرك ← حالة صريحة وبديل «نسخ النص المقنَّع» بلا اتصال', () => {
  it.each([
    ['Edge: Translator API تعلن unavailable', () => ({ Translator: new FakeTranslatorApi({ state: 'unavailable' }).asGlobal() }), ENGINE_MESSAGES.pairUnavailable],
    ['Firefox: لا Translator API', () => ({}), ENGINE_MESSAGES.noEngine],
  ])('%s', async (_name, scope, reason) => {
    const copied: string[] = [];
    await mountWith(selectLocalEngine(scope()), copied);
    const pristine = pageHtml();
    const bar = barBefore(README);
    expect(barNote(bar)).toBe(`المحرك غير متاح: ${reason}`);
    expect(bar.shadowRoot!.querySelector('[data-action="copy-masked"]')!.textContent!.trim()).toBe('نسخ النص المقنَّع');
    await press(bar, 'translate');
    expect(translations()).toHaveLength(0);
    await press(bar, 'copy-masked');
    expect(copied).toHaveLength(1);
    const text = copied[0]!;
    expect(text.split('\n\n')).toHaveLength(17);
    expect(text).toMatch(/⟦CODE_\d+⟧/);
    for (const secret of ['npm install', 'pnpm install', 'TARGET', 'readerMode', '@octocat', 'src/components/common/Explain.tsx', 'https://github.com']) expect(text, secret).not.toContain(secret);
    expect(barNote(bar)).toContain('نُسخ النص المقنَّع (17 فقرة)');
    expect(pageHtml()).toBe(pristine);
    noNetwork();
  });

  it('بطاقة التحديد: السبب وزر النسخ، والمنسوخ التحديد مقنَّعًا', async () => {
    const copied: string[] = [];
    await mountWith(selectLocalEngine({}), copied);
    const p = document.querySelector('[data-case="c1-p1"]')!;
    const range = document.createRange();
    range.setStart(p.firstChild!, 0);
    range.setEnd(p.lastChild!, p.lastChild!.textContent!.length);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    await act(async () => {
      document.dispatchEvent(new Event('selectionchange'));
      await flush(40);
    });
    await clickIn(selRoot(), 'translate-selection');
    expect(selRoot().querySelector('[data-section="notice"]')!.textContent).toBe(`المحرك غير متاح: ${ENGINE_MESSAGES.noEngine}`);
    await clickIn(selRoot(), 'copy-masked');
    // macOS مصطلح في قائمة «لا تُترجم» فيُقنَّع هو أيضًا.
    expect(copied).toEqual(['I can reproduce this with ⟦CODE_0⟧ on ⟦TERM_1⟧ and the fix is not in that build yet.']);
    expect(selRoot().querySelector('[data-section="copy-note"]')!.textContent).toContain('نُسخ النص المقنَّع (1 فقرة)');
    noNetwork();
  });
});

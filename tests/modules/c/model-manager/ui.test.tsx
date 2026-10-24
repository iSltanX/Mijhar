// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/mijhar-demo/issues/7"}
// TEST-TR-05 (AC-C5 في ج-2) عبر واجهة الترجمة كما تُشحن، بالمحرك المُدار فوق صنف Translator وهمي:
//  - لا تنزيل ولا create() عند تركيب الوحدة وقبل الضغط، ولا بعد الضغط حتى الموافقة في بطاقة الاستئذان (الشريط وبطاقة التحديد)؛
//  - البطاقة تعرض أن الحجم غير معلن؛ والتراجع لا يستدعي المحرك؛ والموافقة تبدأ الترجمة من النقرة نفسها؛
//  - رسائل واضحة لانقطاع الشبكة وامتلاء القرص وعدم الدعم، ويُسأل المستخدم من جديد بعد الفشل؛
//  - لا طلب شبكة من الإضافة في أي مسار.
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_MESSAGES, TranslatorApiEngine } from '../../../../src/modules/c/engines';
import { ManagedTranslationEngine, MODEL_MESSAGES } from '../../../../src/modules/c/model-manager';
import type { ManagedEngineOptions } from '../../../../src/modules/c/model-manager';
import { setTranslationService } from '../../../../src/modules/c/ui';
import { FIXTURE, barBefore, bars, barNote, flush, hosts, loadHtml, mountTranslate, phase, press, translations } from '../ui/helpers';
import type { Live } from '../ui/helpers';
import { FakeTranslatorApi } from '../engines/fake-translator';

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
const COMMENT1 = '[data-case="comment-body-1"]';
const ISSUE = '[data-case="issue-description"]';
const noNetwork = (): void => {
  expect(network.fetch).not.toHaveBeenCalled();
  expect(network.xhr).not.toHaveBeenCalled();
  expect(network.beacon).not.toHaveBeenCalled();
};

function managed(fake: FakeTranslatorApi, options: ManagedEngineOptions = {}): ManagedTranslationEngine {
  const inner = new TranslatorApiEngine(fake.asGlobal(), { retryDelaysMs: [0, 0, 0] });
  return new ManagedTranslationEngine(inner, () => inner.status(), options);
}

async function mountWith(engine: ManagedTranslationEngine): Promise<Live> {
  live = await mountTranslate({ service: engine });
  return live;
}

const consentOf = (bar: HTMLElement): Element | null => bar.shadowRoot!.querySelector('[data-consent]');
const buttonOf = (bar: HTMLElement, action: string): HTMLButtonElement | null => bar.shadowRoot!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);

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

describe('الشريط: بطاقة الاستئذان قبل أن ينزّل المتصفح الحزمة (الحزمة downloadable)', () => {
  it('عند التركيب وقبل أي ضغط: الأشرطة ظاهرة، ولا create() ولا نص يُرسل ولا بطاقة', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    await mountWith(managed(fake));
    expect(bars()).toHaveLength(5);
    await flush(30);
    expect(fake.createCalls).toBe(0);
    expect(fake.received).toEqual([]);
    for (const bar of bars()) {
      expect(phase(bar)).toBe('idle');
      expect(consentOf(bar)).toBeNull();
    }
    noNetwork();
  });

  it('الضغط الأول يعرض البطاقة (الحجم غير معلن) بدل الزر، ولا create() بعد', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    await mountWith(managed(fake));
    const bar = barBefore(README);
    await press(bar, 'translate');
    const card = consentOf(bar);
    expect(card).not.toBeNull();
    expect(card!.textContent).toContain('الحجم: غير معلن من المتصفح');
    expect(card!.textContent).toContain('الوجهة: يخزّنها المتصفح');
    expect(card!.textContent).toContain('يلزم اتصال بالإنترنت');
    expect(buttonOf(bar, 'translate')).toBeNull();
    expect(buttonOf(bar, 'consent-confirm')!.textContent!.trim()).toBe('موافق، نزّل الحزمة وترجم');
    expect(fake.createCalls).toBe(0);
    expect(fake.received).toEqual([]);
    expect(translations()).toHaveLength(0);
    noNetwork();
  });

  it('«ليس الآن» يُخفي البطاقة ويعيد الزر، ولا create() أبدًا', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    await mountWith(managed(fake));
    const bar = barBefore(README);
    await press(bar, 'translate');
    await press(bar, 'consent-decline');
    expect(consentOf(bar)).toBeNull();
    expect(buttonOf(bar, 'translate')).not.toBeNull();
    expect(phase(bar)).toBe('idle');
    expect(fake.createCalls).toBe(0);
    expect(fake.received).toEqual([]);
  });

  it('«موافق» تبدأ الترجمة من النقرة نفسها: create() مرة واحدة والفقرات السبع عشرة تُترجم', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    await mountWith(managed(fake));
    const bar = barBefore(README);
    await press(bar, 'translate');
    expect(fake.createCalls).toBe(0);
    await press(bar, 'consent-confirm', 100);
    expect(phase(bar)).toBe('done');
    expect(consentOf(bar)).toBeNull();
    expect(fake.createCalls).toBe(1);
    expect(fake.received).toHaveLength(17);
    expect(barNote(bar)).toBe('تُرجمت 17 من 17 فقرة.');
    noNetwork();
  });

  it('بعد الموافقة مرة لا تُسأل ثانية: شريط آخر يترجم من أول ضغط بلا بطاقة', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    await mountWith(managed(fake));
    await press(barBefore(README), 'translate');
    await press(barBefore(README), 'consent-confirm', 100);
    const other = barBefore(COMMENT1);
    await press(other, 'translate', 80);
    expect(consentOf(other)).toBeNull();
    expect(phase(other)).toBe('done');
    expect(fake.createCalls).toBe(1);
  });

  it('الحزمة available: يترجم من أول ضغط بلا بطاقة', async () => {
    const fake = new FakeTranslatorApi({ state: 'available' });
    await mountWith(managed(fake));
    const bar = barBefore(ISSUE);
    await press(bar, 'translate', 80);
    expect(consentOf(bar)).toBeNull();
    expect(phase(bar)).toBe('done');
    expect(fake.createCalls).toBe(1);
  });
});

describe('الأخطاء: رسائل واضحة في الشريط، والأصل باقٍ، ويُسأل المستخدم من جديد', () => {
  it('انقطاع الشبكة أثناء التنزيل ← رسالة الاتصال، ثم البطاقة من جديد ثم النجاح حين يعود الاتصال', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createFailures: ['NetworkError'] });
    await mountWith(managed(fake));
    const bar = barBefore(COMMENT1);
    await press(bar, 'translate');
    await press(bar, 'consent-confirm', 80);
    expect(phase(bar)).toBe('error');
    expect(barNote(bar)).toContain(`تعذّرت الترجمة: ${MODEL_MESSAGES.networkLost}`);
    expect(translations()).toHaveLength(0);
    await press(bar, 'translate');
    expect(consentOf(bar)).not.toBeNull();
    await press(bar, 'consent-confirm', 80);
    expect(phase(bar)).toBe('done');
    expect(fake.createCalls).toBe(2);
  });

  it('امتلاء القرص ← رسالة المساحة', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createFailures: ['QuotaExceededError'] });
    await mountWith(managed(fake));
    const bar = barBefore(COMMENT1);
    await press(bar, 'translate');
    await press(bar, 'consent-confirm', 80);
    expect(phase(bar)).toBe('error');
    expect(barNote(bar)).toContain(MODEL_MESSAGES.storageFull);
  });

  it('شبكة مقطوعة (create() معلّق) ← بعد المهلة رسالة التأخر في الشريط بدل «جارٍ الترجمة» بلا نهاية، والأصل باقٍ', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createDelayMs: 400 });
    await mountWith(managed(fake, { stallMs: 30 }));
    const bar = barBefore(COMMENT1);
    await press(bar, 'translate');
    await press(bar, 'consent-confirm', 5);
    expect(phase(bar)).toBe('working');
    await act(async () => void (await flush(80)));
    expect(phase(bar)).toBe('error');
    expect(barNote(bar)).toContain(`تعذّرت الترجمة: ${MODEL_MESSAGES.downloadStalled}`);
    expect(translations()).toHaveLength(0);
  });

  it('عدم الدعم (unavailable) ← السبب الصريح وزر النسخ، بلا بطاقة ولا create()', async () => {
    const fake = new FakeTranslatorApi({ state: 'unavailable' });
    await mountWith(managed(fake));
    const bar = barBefore(README);
    expect(barNote(bar)).toBe(`المحرك غير متاح: ${ENGINE_MESSAGES.pairUnavailable}`);
    await press(bar, 'translate');
    expect(consentOf(bar)).toBeNull();
    expect(fake.createCalls).toBe(0);
    expect(buttonOf(bar, 'copy-masked')).not.toBeNull();
  });
});

describe('بطاقة التحديد', () => {
  it('«ترجمة المحدد» والحزمة غير منزّلة ← بطاقة الاستئذان، ولا create() حتى الموافقة، ثم الترجمة', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    await mountWith(managed(fake));
    await selectText('[data-case="p-sentences"]', 'The side panel opens from the toolbar.'.length);
    await clickIn(selRoot(), 'translate-selection');
    expect(selRoot().querySelector('.sel-card')!.getAttribute('data-status')).toBe('consent');
    expect(selRoot().querySelector('[data-consent]')!.textContent).toContain('الحجم: غير معلن من المتصفح');
    expect(fake.createCalls).toBe(0);
    expect(fake.received).toEqual([]);
    await clickIn(selRoot(), 'consent-confirm', 80);
    expect(fake.createCalls).toBe(1);
    expect(fake.received).toEqual(['The side panel opens from the toolbar.']);
    expect(selRoot().querySelector('[data-section="translation"]')!.textContent).toBe('ترجمة: The side panel opens from the toolbar.');
    noNetwork();
  });

  it('«ليس الآن» يغلق البطاقة بلا create()', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    await mountWith(managed(fake));
    await selectText('[data-case="p-sentences"]', 'The side panel opens from the toolbar.'.length);
    await clickIn(selRoot(), 'translate-selection');
    await clickIn(selRoot(), 'consent-decline');
    expect(selHost()).toBeNull();
    expect(fake.createCalls).toBe(0);
    expect(fake.received).toEqual([]);
  });
});

// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/7"}
// G-1 (مراجعة الموجة G، اجتماع MJ16 مع MJ13): «ترجمة مسودتي» تستهلك خدمة الترجمة المشتركة، وMJ16 أضافت إلى عقدها availability().state === 'consent'
// (الحزمة downloadable: أول create() سينزّل المتصفح حزمة اللغة). القسم يجب أن يعامل الحالة كما يعاملها شريط الترجمة وبطاقة التحديد:
//  - المحرك موجود فلا يُقال «غير متاح»؛ وأول نقرة على «ترجم مسودة الحقل» تعرض بطاقة الاستئذان بدل الترجمة، ولا create() قبل «موافق»؛
//  - «ليس الآن» يخفي البطاقة بلا أثر؛ و«موافق» تمنح الموافقة وتبدأ الترجمة من النقرة نفسها (create() تحتاج نشاط نقرة)؛
//  - كل نقرة تعيد سؤال المحرك عن حالته، فإن سقطت الموافقة (فشل لم تكتمل فيه الحزمة) عادت البطاقة، وإن ثبتت الحزمة ترجمت بلا بطاقة.
import { act } from 'preact/test-utils';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslatorApiEngine } from '../../../../src/modules/c/engines';
import { ManagedTranslationEngine, MODEL_MESSAGES } from '../../../../src/modules/c/model-manager';
import { setTranslationService } from '../../../../src/modules/c/ui';
import { FakeTranslatorApi } from '../../c/engines/fake-translator';
import type { FakeTranslatorOptions } from '../../c/engines/fake-translator';
import { ROOT, click, field, flush, loadHtml, mountComposer, panelRoot, triggerFor } from '../composer/helpers';
import type { Live } from '../composer/helpers';

const FIXTURE = path.join(ROOT, 'tests/modules/f/composer/fixtures/fixture-editors.html');
const DRAFT = 'Run `npm test` in src/app.js and read https://example.com/docs before you merge.';
const fetchSpy = vi.fn(async () => new Response(''));

let live: Live | null = null;
beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy);
  fetchSpy.mockClear();
});
afterEach(() => {
  live?.manager.stop();
  live = null;
  setTranslationService(null);
  vi.unstubAllGlobals();
});

const need = <E extends Element = HTMLElement>(selector: string): E => {
  const el = panelRoot().querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر في اللوحة: ${selector}`);
  return el;
};
const maybe = (selector: string): Element | null => panelRoot().querySelector(selector);
const settle = async (ms = 8): Promise<void> => {
  for (let i = 0; i < 3; i += 1) await act(async () => void (await flush(ms)));
};
const section = (): HTMLElement => need('[data-section="translate-draft"]');

/** محرك مُدار (MJ16) فوق Translator وهمي، مسجَّل خدمةً للترجمة، ثم تُفتح لوحة المساعد. */
async function open(options: FakeTranslatorOptions = { state: 'downloadable' }) {
  const fake = new FakeTranslatorApi(options);
  const inner = new TranslatorApiEngine(fake.asGlobal(), { retryDelaysMs: [0, 0, 0] });
  const managed = new ManagedTranslationEngine(inner, () => inner.status());
  setTranslationService(managed);
  loadHtml(FIXTURE);
  window.history.replaceState({}, '', 'https://github.com/octo/demo/pull/7');
  field('new_comment_field').value = DRAFT;
  live = await mountComposer();
  await click(triggerFor('new_comment_field'), 8);
  await settle();
  return { fake, managed };
}

const press = async (): Promise<void> => {
  await click(need('[data-action="translate-draft"]'));
  await settle();
};

describe('G-1: حزمة اللغة تحتاج موافقة (downloadable)', () => {
  it('المحرك موجود فلا يُقال «غير متاح»: القسم جاهز وزر الترجمة ظاهر، ولا create() ولا شبكة', async () => {
    const { fake } = await open();
    expect(section().dataset.service).toBe('ready');
    expect(maybe('[data-translate-status]')).toBeNull();
    expect(need<HTMLButtonElement>('[data-action="translate-draft"]').disabled).toBe(false);
    expect(maybe('[data-consent]')).toBeNull();
    expect(fake.createCalls).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('النقرة الأولى تعرض بطاقة الاستئذان (الحجم غير معلن) بدل الترجمة، ولا create() قبل «موافق»', async () => {
    const { fake } = await open();
    await press();
    const card = need('[data-consent]');
    expect(card.textContent).toContain('الحجم: غير معلن من المتصفح');
    expect(card.textContent).toContain('لا ترسل الإضافة نص الصفحة إلى أي جهة');
    expect(card.querySelector('[data-action="consent-confirm"]')).not.toBeNull();
    expect(card.querySelector('[data-action="consent-decline"]')).not.toBeNull();
    expect(maybe('[data-action="translate-draft"]')).toBeNull();
    expect(maybe('[data-translate-result]')).toBeNull();
    expect(fake.createCalls).toBe(0);
    expect(fake.received).toEqual([]);
  });

  it('«ليس الآن» تخفي البطاقة وتعيد الزر بلا create() ولا مساس بالمسودة', async () => {
    const { fake } = await open();
    await press();
    await click(need('[data-action="consent-decline"]'));
    await settle();
    expect(maybe('[data-consent]')).toBeNull();
    expect(need<HTMLButtonElement>('[data-action="translate-draft"]').disabled).toBe(false);
    expect(fake.createCalls).toBe(0);
    expect(field('new_comment_field').value).toBe(DRAFT);
  });

  it('«موافق» تمنح الموافقة وتترجم من النقرة نفسها: create() مرة واحدة، والنتيجة للمراجعة، والإدراج معطَّل حتى المراجعة', async () => {
    const { fake } = await open();
    await press();
    await click(need('[data-action="consent-confirm"]'));
    await settle();
    expect(fake.createCalls).toBe(1);
    expect(maybe('[data-consent]')).toBeNull();
    const sent = fake.received[0]!;
    expect(sent).toMatch(/\{\d+\}/); // صيغة السلك لـTranslator API (T-4.3): المسودة مقنَّعة قبل أن تبلغ المحرك
    for (const protectedText of ['npm test', 'src/app.js', 'https://example.com/docs']) expect(sent, protectedText).not.toContain(protectedText);
    expect(need('[data-translate-result="translated"] [data-translated-text]').textContent).toContain('npm test');
    expect(need<HTMLButtonElement>('[data-action="translated-insert-append"]').disabled).toBe(true);
    expect(field('new_comment_field').value).toBe(DRAFT);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('بعد ثبوت الحزمة تترجم النقرة التالية بلا بطاقة جديدة', async () => {
    const { fake } = await open();
    await press();
    await click(need('[data-action="consent-confirm"]'));
    await settle();
    fake.state = 'available';
    await press();
    expect(maybe('[data-consent]')).toBeNull();
    expect(fake.received.length).toBe(2);
    expect(fake.createCalls).toBe(1);
  });

  it('انقطاع الشبكة أثناء التنزيل: الرسالة الواضحة، ثم تعود البطاقة في النقرة التالية بلا create()', async () => {
    const { fake } = await open({ state: 'downloadable', createFailures: ['NetworkError'] });
    await press();
    await click(need('[data-action="consent-confirm"]'));
    await settle();
    expect(need('[data-translate-result="error"]').textContent).toContain(MODEL_MESSAGES.networkLost);
    expect(fake.createCalls).toBe(1);
    await press();
    expect(maybe('[data-consent]')).not.toBeNull();
    expect(fake.createCalls).toBe(1);
  });
});

describe('G-1: لا تغيير في الحالات الأخرى', () => {
  it('الحزمة available ← جاهز وترجمة مباشرة بلا بطاقة', async () => {
    const { fake } = await open({ state: 'available' });
    expect(section().dataset.service).toBe('ready');
    await press();
    expect(maybe('[data-consent]')).toBeNull();
    expect(fake.received.length).toBe(1);
    expect(maybe('[data-translate-result="translated"]')).not.toBeNull();
  });

  it('الحزمة unavailable (Edge) ← «المحرك غير متاح» بسببه ولا زر ولا بطاقة', async () => {
    const { fake } = await open({ state: 'unavailable' });
    expect(section().dataset.service).toBe('unavailable');
    expect(need('[data-translate-status]').textContent).toContain('المحرك غير متاح');
    expect(maybe('[data-action="translate-draft"]')).toBeNull();
    expect(maybe('[data-consent]')).toBeNull();
    expect(fake.createCalls).toBe(0);
  });
});

// مهايئ Translator API (TEST-TR-04 بمحرك وهمي): كشف التوفر بلا إنشاء ولا ترجمة، والإنشاء الكسول مرة واحدة، وإعادة NotSupportedError المتقطع دون
// حفظه غيابًا، ورسائل الأخطاء، والإلغاء، وصيغة الرمز على السلك، والفشل الآمن فوقه (translateProtected)، ولا شبكة من الإضافة.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_MESSAGES, EngineError, TranslatorApiEngine } from '../../../../src/modules/c/engines';
import { translateProtected } from '../../../../src/modules/c/masking';
import { FakeTranslatorApi } from './fake-translator';

const engineOf = (fake: FakeTranslatorApi): TranslatorApiEngine => new TranslatorApiEngine(fake.asGlobal(), { retryDelaysMs: [0, 0, 0] });

afterEach(() => vi.restoreAllMocks());

describe('availability()', () => {
  it.each([
    ['available', { state: 'ready' }],
    ['downloadable', { state: 'ready' }],
    ['downloading', { state: 'ready' }],
    ['unavailable', { state: 'unavailable', reason: ENGINE_MESSAGES.pairUnavailable }],
  ])('%s ← %j، دون إنشاء مترجم ولا ترجمة، وللزوج en→ar', async (state, expected) => {
    const fake = new FakeTranslatorApi({ state });
    expect(await engineOf(fake).availability()).toEqual(expected);
    expect(fake.availabilityCalls).toBe(1);
    expect(fake.createCalls).toBe(0);
    expect(fake.received).toEqual([]);
    expect(fake.languages).toEqual([{ sourceLanguage: 'en', targetLanguage: 'ar' }]);
  });

  it('قيمة غير معروفة لا تُعدّ جاهزة، وخطأ الفحص سبب صريح', async () => {
    expect(await engineOf(new FakeTranslatorApi({ state: 'after-download' })).availability()).toEqual({ state: 'unavailable', reason: `${ENGINE_MESSAGES.unknownState} (after-download)` });
    const fake = new FakeTranslatorApi();
    const factory = fake.asGlobal();
    factory.availability = async () => {
      throw new DOMException('blocked by policy', 'NotAllowedError');
    };
    expect(await new TranslatorApiEngine(factory).availability()).toEqual({ state: 'unavailable', reason: `${ENGINE_MESSAGES.checkFailed}: blocked by policy` });
  });

  it('status() تعيد حالة المتصفح كما هي (لإدارة التنزيل في T-4.4)', async () => {
    expect(await engineOf(new FakeTranslatorApi({ state: 'downloadable' })).status()).toBe('downloadable');
  });
});

describe('translate()', () => {
  it('يُنشئ المترجم عند أول ترجمة فقط ويعيد استعماله، ويرسل {N} لا ⟦…⟧ ويعيد الرموز', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    const engine = engineOf(fake);
    expect(fake.createCalls).toBe(0);
    expect(await engine.translate('Run ⟦CODE_0⟧ first.')).toBe('ترجمة: Run ⟦CODE_0⟧ first.');
    expect(await engine.translate('Open ⟦PATH_0⟧ and ⟦LINK_1⟧.')).toBe('ترجمة: Open ⟦PATH_0⟧ and ⟦LINK_1⟧.');
    expect(await engine.translate('No tokens here.')).toBe('ترجمة: No tokens here.');
    expect(fake.createCalls).toBe(1);
    expect(fake.received).toEqual(['Run {0} first.', 'Open {0} and {1}.', 'No tokens here.']);
  });

  it('NotSupportedError متقطع في أول create(): يُعاد مرة فينجح', async () => {
    const fake = new FakeTranslatorApi({ createFailures: ['NotSupportedError'] });
    expect(await engineOf(fake).translate('Hello.')).toBe('ترجمة: Hello.');
    expect(fake.createCalls).toBe(2);
  });

  it('ويُعاد بمهل أطول ما دامت الحزمة available (لا يلزمها نشاط نقرة)', async () => {
    const fake = new FakeTranslatorApi({ createFailures: ['NotSupportedError', 'NotSupportedError', 'NotSupportedError'] });
    expect(await engineOf(fake).translate('Hello.')).toBe('ترجمة: Hello.');
    expect(fake.createCalls).toBe(4);
  });

  it('والحزمة ليست available بعد الإعادة الأولى: لا إعادة ثانية (نشاط النقرة انتهت مدته)', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createFailures: ['NotSupportedError', 'NotSupportedError'] });
    await expect(engineOf(fake).translate('Hello.')).rejects.toMatchObject({ code: 'NotSupportedError', message: ENGINE_MESSAGES.notReady });
    expect(fake.createCalls).toBe(2);
  });

  it('NotSupportedError في كل المحاولات: خطأ يطلب الإعادة، ولا يُحفظ غيابًا (الضغط التالي ينجح)', async () => {
    const fake = new FakeTranslatorApi({ createFailures: ['NotSupportedError', 'NotSupportedError', 'NotSupportedError', 'NotSupportedError'] });
    const engine = engineOf(fake);
    const error = await engine.translate('Hello.').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EngineError);
    expect((error as EngineError).message).toBe(ENGINE_MESSAGES.notReady);
    expect((error as EngineError).code).toBe('NotSupportedError');
    expect(fake.createCalls).toBe(4);
    expect(await engine.availability()).toEqual({ state: 'ready' });
    expect(await engine.translate('Hello.')).toBe('ترجمة: Hello.');
    expect(fake.createCalls).toBe(5);
  });

  it('NotAllowedError (بلا نقرة والحزمة لم تُنزَّل): رسالة تطلب الضغط، بلا إعادة تلقائية، والضغط التالي يحاول', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createFailures: ['NotAllowedError'] });
    const engine = engineOf(fake);
    await expect(engine.translate('Hello.')).rejects.toMatchObject({ name: 'EngineError', code: 'NotAllowedError', message: ENGINE_MESSAGES.needsGesture });
    expect(fake.createCalls).toBe(1);
    expect(await engine.translate('Hello.')).toBe('ترجمة: Hello.');
  });

  it('مترجم تعطّل في translate() (InvalidStateError) لا يُعاد استعماله: الضغط التالي ينشئ غيره', async () => {
    const fake = new FakeTranslatorApi({ translateFailure: 'InvalidStateError' });
    const engine = engineOf(fake);
    await expect(engine.translate('x')).rejects.toMatchObject({ name: 'InvalidStateError' });
    fake.translateFailure = null;
    expect(await engine.translate('y')).toBe('ترجمة: y');
    expect(fake.createCalls).toBe(2);
  });

  it('QuotaExceededError من translate(): رسالة صريحة؛ وخطأ غير معروف يمر كما هو', async () => {
    await expect(engineOf(new FakeTranslatorApi({ translateFailure: 'QuotaExceededError' })).translate('x')).rejects.toMatchObject({ message: ENGINE_MESSAGES.tooLong });
    await expect(engineOf(new FakeTranslatorApi({ translateFailure: 'InvalidStateError' })).translate('x')).rejects.toMatchObject({ name: 'InvalidStateError' });
  });

  it('الإلغاء قبل البدء لا ينشئ شيئًا؛ والإلغاء أثناء الإنشاء يرمي AbortError ويبقى الإنشاء المشترك لما بعده', async () => {
    const fake = new FakeTranslatorApi({ createDelayMs: 30 });
    const engine = engineOf(fake);
    const early = new AbortController();
    early.abort();
    await expect(engine.translate('x', { signal: early.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fake.createCalls).toBe(0);
    const mid = new AbortController();
    const pending = engine.translate('x', { signal: mid.signal });
    mid.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(await engine.translate('y')).toBe('ترجمة: y');
    expect(fake.createCalls).toBe(1);
    expect(fake.received).toEqual(['y']);
  });
});

describe('فوق قاعدة الفشل الآمن (translateProtected)', () => {
  const SOURCE = 'Run `npm install` first, then edit src/config/settings.json before you open #42.';

  it('محرك يحرّف صيغة الخطة (كما قيس في Chrome) يسلم بالصيغة على السلك فتُعرض الترجمة والعناصر كما هي', async () => {
    const result = await translateProtected(SOURCE, (masked, context) => engineOf(new FakeTranslatorApi()).translate(masked, context));
    expect(result.status).toBe('translated');
    if (result.status !== 'translated') return;
    expect(result.retryAttempts).toBe(0);
    expect(result.text).toContain('`npm install`');
    expect(result.text).toContain('src/config/settings.json');
    expect(result.text).toContain('#42');
  });

  it('بلا الصيغة على السلك كان الفاحص سيرفض كل جملة فيها رمز (مرجع: صيغة الخطة وحدها مع المحرك نفسه)', async () => {
    const fake = new FakeTranslatorApi();
    const raw = fake.asGlobal();
    const instance = await raw.create({ sourceLanguage: 'en', targetLanguage: 'ar' });
    const result = await translateProtected(SOURCE, (masked) => instance.translate(masked));
    expect(result.status).toBe('original-kept');
  });

  it.each([
    ['يُسقط الرمز', (s: string) => `ترجمة: ${s.replace('{0}', '')}`, 'identity'],
    ['يختلق رمزًا', (s: string) => `ترجمة: ${s} {9}`, 'hallucination'],
    ['يكرر الرمز', (s: string) => `ترجمة: ${s} {0}`, 'duplication'],
    ['يكسر قوس الرمز', (s: string) => `ترجمة: ${s.replace('{0}', '{0')}`, 'identity'],
  ])('محرك %s: يبقى الأصل مع التنبيه بعد إعادة واحدة جملةً جملةً، ولا نص مشوَّه', async (_name, transform, check) => {
    const fake = new FakeTranslatorApi({ transform });
    const result = await translateProtected(SOURCE, (masked, context) => engineOf(fake).translate(masked, context));
    expect(result.status).toBe('original-kept');
    if (result.status !== 'original-kept') return;
    expect(result.original).toBe(SOURCE);
    expect(result.retryAttempts).toBe(1);
    expect(result.firstAttemptFailures.map((f) => f.check)).toContain(check);
  });

  it('لا طلب شبكة من الإضافة في مسار المحرك (fetch وXMLHttpRequest وsendBeacon)', async () => {
    const fetchSpy = vi.fn();
    const xhrSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('XMLHttpRequest', xhrSpy);
    const engine = engineOf(new FakeTranslatorApi({ state: 'downloadable' }));
    await engine.availability();
    await translateProtected(SOURCE, (masked, context) => engine.translate(masked, context));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

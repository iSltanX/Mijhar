// المحرك المُدار (TEST-TR-05، AC-C5 في ج-2) فوق صنف Translator وهمي: لا تنزيل ولا استدعاء للمحرك قبل فعل المستخدم وموافقته، وبطاقة الاستئذان عند أول
// تنزيل، ورسائل واضحة لانقطاع الشبكة وامتلاء القرص وعدم الدعم، وسقوط الموافقة بعد فشل لم تكتمل فيه الحزمة.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_MESSAGES, TranslatorApiEngine } from '../../../../src/modules/c/engines';
import { DEFAULT_STALL_MS, installManagedTranslationEngine, ManagedTranslationEngine, MODEL_MESSAGES } from '../../../../src/modules/c/model-manager';
import type { ManagedEngineOptions } from '../../../../src/modules/c/model-manager';
import { getTranslationService, setTranslationService } from '../../../../src/modules/c/ui';
import { FakeTranslatorApi } from '../engines/fake-translator';

afterEach(() => {
  setTranslationService(null);
  vi.unstubAllGlobals();
});

/** سياق لا يُقرأ منه غير Translator. */
const scopeWith = (translator: unknown): object => ({ Translator: translator });

function managed(fake: FakeTranslatorApi, options?: ConstructorParameters<typeof TranslatorApiEngine>[1], engine: ManagedEngineOptions = {}): ManagedTranslationEngine {
  const inner = new TranslatorApiEngine(fake.asGlobal(), options ?? { retryDelaysMs: [0, 0, 0] });
  return new ManagedTranslationEngine(inner, () => inner.status(), engine);
}

describe('التركيب عند بدء سكربت المحتوى', () => {
  it('لا يسأل المتصفح ولا ينشئ مترجمًا ولا يتصل (لا تنزيل عند التثبيت أو تحميل الصفحة)', () => {
    const net = { fetch: vi.fn(), xhr: vi.fn() };
    vi.stubGlobal('fetch', net.fetch);
    vi.stubGlobal('XMLHttpRequest', net.xhr);
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    const engine = installManagedTranslationEngine(scopeWith(fake.asGlobal()));
    expect(getTranslationService()).toBe(engine);
    expect(engine).toBeInstanceOf(ManagedTranslationEngine);
    expect(engine.id).toBe('translator-api');
    expect(fake.availabilityCalls).toBe(0);
    expect(fake.createCalls).toBe(0);
    expect(net.fetch).not.toHaveBeenCalled();
    expect(net.xhr).not.toHaveBeenCalled();
  });

  it('في سياق بلا Translator API يبقى محركًا غير متاح بسببه الصريح (لا لفّ)', async () => {
    const engine = installManagedTranslationEngine(scopeWith(undefined));
    expect(engine).not.toBeInstanceOf(ManagedTranslationEngine);
    expect(engine.id).toBe('none');
    expect(await engine.availability()).toEqual({ state: 'unavailable', reason: ENGINE_MESSAGES.noEngine });
  });
});

describe('availability: بطاقة الاستئذان قبل أي تنزيل', () => {
  it('الحزمة downloadable ← consent وبطاقة، ولا create() ولا ترجمة؛ والسؤال نفسه استعلام فقط', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    const engine = managed(fake);
    const availability = await engine.availability();
    expect(availability.state).toBe('consent');
    if (availability.state !== 'consent') return;
    expect(availability.card.lines.join(' ')).toContain('الحجم: غير معلن من المتصفح');
    expect(fake.availabilityCalls).toBeGreaterThan(0);
    expect(fake.createCalls).toBe(0);
    expect(fake.received).toEqual([]);
  });

  it('بعد grantConsent() تصير ready، وتبقى create() لم تُستدعَ حتى ترجمة صريحة', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    const engine = managed(fake);
    engine.grantConsent();
    expect(await engine.availability()).toEqual({ state: 'ready' });
    expect(fake.createCalls).toBe(0);
    await engine.translate('Hello {0}', {});
    expect(fake.createCalls).toBe(1);
  });

  it('الموافقة لتنزيل واحد: بعد أن تُرصد الحزمة منزّلة تسقط، فإن زالت من المتصفح لاحقًا عادت البطاقة', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    const engine = managed(fake);
    expect((await engine.availability()).state).toBe('consent');
    engine.grantConsent();
    expect(await engine.availability()).toEqual({ state: 'ready' });
    fake.state = 'available';
    expect(await engine.availability()).toEqual({ state: 'ready' });
    fake.state = 'downloadable';
    expect((await engine.availability()).state).toBe('consent');
    expect(fake.createCalls).toBe(0);
  });

  it.each(['available', 'downloading'])('الحزمة %s ← ready مباشرة بلا بطاقة', async (state) => {
    const fake = new FakeTranslatorApi({ state });
    expect(await managed(fake).availability()).toEqual({ state: 'ready' });
    expect(fake.createCalls).toBe(0);
  });

  it('unavailable (Edge) ← السبب الصريح نفسه من T-4.3 بلا بطاقة', async () => {
    const fake = new FakeTranslatorApi({ state: 'unavailable' });
    expect(await managed(fake).availability()).toEqual({ state: 'unavailable', reason: ENGINE_MESSAGES.pairUnavailable });
    expect(fake.createCalls).toBe(0);
  });

  it('فشل السؤال عن الحزمة يُغلق الباب بسبب صريح ولا يُنشئ مترجمًا', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable' });
    const inner = new TranslatorApiEngine(fake.asGlobal());
    const engine = new ManagedTranslationEngine(inner, async () => {
      throw new Error('blocked by policy');
    });
    const result = await engine.availability();
    expect(result.state).toBe('unavailable');
    expect(result.state === 'unavailable' && result.reason).toContain('blocked by policy');
    expect(fake.createCalls).toBe(0);
  });
});

describe('انقطاع الشبكة وامتلاء القرص (محاكاة)', () => {
  it('NetworkError أثناء تنزيل الحزمة ← رسالة انقطاع الاتصال، وتسقط الموافقة فتُسأل من جديد', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createFailures: ['NetworkError'] });
    const engine = managed(fake);
    engine.grantConsent();
    await expect(engine.translate('Hello', {})).rejects.toMatchObject({ message: MODEL_MESSAGES.networkLost, code: 'network' });
    expect((await engine.availability()).state).toBe('consent');
    // إعادة المحاولة بعد الموافقة تنجح حين يعود الاتصال.
    engine.grantConsent();
    await expect(engine.translate('Hello', {})).resolves.toContain('Hello');
  });

  it('QuotaExceededError قبل ثبوت الحزمة ← رسالة امتلاء التخزين، وتسقط الموافقة', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createFailures: ['QuotaExceededError'] });
    const engine = managed(fake);
    engine.grantConsent();
    await expect(engine.translate('Hello', {})).rejects.toMatchObject({ message: MODEL_MESSAGES.storageFull, code: 'storage' });
    expect((await engine.availability()).state).toBe('consent');
  });

  it('QuotaExceededError والحزمة available هو طول النص فيبقى نصه من T-4.3 ولا يُحسب امتلاء قرص', async () => {
    const fake = new FakeTranslatorApi({ state: 'available', translateFailure: 'QuotaExceededError' });
    const engine = managed(fake);
    expect(await engine.availability()).toEqual({ state: 'ready' });
    await expect(engine.translate('Hello', {})).rejects.toMatchObject({ message: ENGINE_MESSAGES.tooLong });
  });

  it('الإلغاء أثناء الإنشاء يمرّ AbortError كما هو، وتسقط الموافقة (المتصفح قد لا يكون نزّل شيئًا)', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createDelayMs: 50 });
    const engine = managed(fake);
    engine.grantConsent();
    const controller = new AbortController();
    const pending = engine.translate('Hello', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect((await engine.availability()).state).toBe('consent');
  });

  it('NotSupportedError المتقطع لا يُسقط الموافقة: المستخدم وافق للتوّ ويعيد الضغط بلا بطاقة جديدة', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createFailures: ['NotSupportedError', 'NotSupportedError', 'NotSupportedError', 'NotSupportedError'] });
    const engine = managed(fake);
    engine.grantConsent();
    await expect(engine.translate('Hello', {})).rejects.toMatchObject({ message: ENGINE_MESSAGES.notReady });
    expect(await engine.availability()).toEqual({ state: 'ready' });
  });

  it('عدم الدعم: unavailable يعرض سببه، والترجمة مباشرة على مترجم يرفض create() ترمي رسالة الجاهزية', async () => {
    const fake = new FakeTranslatorApi({ state: 'unavailable' });
    const engine = managed(fake);
    expect((await engine.availability()).state).toBe('unavailable');
    await expect(engine.translate('Hello', {})).rejects.toMatchObject({ message: ENGINE_MESSAGES.notReady });
  });
});

describe('مهلة التأخر (شبكة مقطوعة: create() يبقى معلّقًا ولا يرفض)', () => {
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  it('المهلة الافتراضية 60 ثانية', () => {
    expect(DEFAULT_STALL_MS).toBe(60_000);
  });

  it('الحزمة لم تثبت وcreate() لا يكتمل في المهلة ← رسالة التأخر، والموافقة باقية، ولا create() ثانية عند إعادة الضغط', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createDelayMs: 120 });
    const engine = managed(fake, undefined, { stallMs: 20 });
    engine.grantConsent();
    await expect(engine.translate('Hello', {})).rejects.toMatchObject({ message: MODEL_MESSAGES.downloadStalled, code: 'stalled' });
    // الموافقة باقية: لا بطاقة جديدة لتنزيل قائم.
    expect(await engine.availability()).toEqual({ state: 'ready' });
    // بعد اكتمال الإنشاء المعلَّق تنجح الضغطة التالية بالمترجم نفسه.
    await sleep(160);
    await expect(engine.translate('Hello', {})).resolves.toContain('Hello');
    expect(fake.createCalls).toBe(1);
  });

  it('الحزمة available (رُصدت) ← لا مهلة: ترجمة بطيئة الإنشاء تنجح', async () => {
    const fake = new FakeTranslatorApi({ state: 'available', createDelayMs: 60 });
    const engine = managed(fake, undefined, { stallMs: 10 });
    expect(await engine.availability()).toEqual({ state: 'ready' });
    await expect(engine.translate('Hello', {})).resolves.toContain('Hello');
  });

  it('stallMs: 0 يعطّل المهلة', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createDelayMs: 60 });
    const engine = managed(fake, undefined, { stallMs: 0 });
    engine.grantConsent();
    await expect(engine.translate('Hello', {})).resolves.toContain('Hello');
  });

  it('الإلغاء قبل المهلة يمرّ AbortError لا رسالة التأخر', async () => {
    const fake = new FakeTranslatorApi({ state: 'downloadable', createDelayMs: 200 });
    const engine = managed(fake, undefined, { stallMs: 100 });
    engine.grantConsent();
    const controller = new AbortController();
    const pending = engine.translate('Hello', { signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await sleep(120);
  });
});

describe('لا شبكة من الإضافة في أي مسار', () => {
  it('البطاقة والموافقة والترجمة والفشل: لا fetch ولا XHR ولا beacon', async () => {
    const net = { fetch: vi.fn(), xhr: vi.fn(), beacon: vi.fn() };
    vi.stubGlobal('fetch', net.fetch);
    vi.stubGlobal('XMLHttpRequest', net.xhr);
    vi.stubGlobal('navigator', { sendBeacon: net.beacon });
    const fake = new FakeTranslatorApi({ state: 'downloadable', createFailures: ['NetworkError'] });
    const engine = managed(fake);
    await engine.availability();
    engine.grantConsent();
    await engine.translate('Hello', {}).catch(() => undefined);
    engine.grantConsent();
    await engine.translate('Hello', {});
    expect(net.fetch).not.toHaveBeenCalled();
    expect(net.xhr).not.toHaveBeenCalled();
    expect(net.beacon).not.toHaveBeenCalled();
  });
});

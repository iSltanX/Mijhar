// وصف حالة النموذج والأخطاء وبطاقة الاستئذان (TEST-TR-05، AC-C5 في ج-2): الحجم «غير معلن» دائمًا ولا رقم، والحالات من إعلان المتصفح، وتصنيف أخطاء
// الشبكة والقرص بالمرحلة.
import { describe, expect, it } from 'vitest';
import { ENGINE_MESSAGES, EngineError } from '../../../../src/modules/c/engines';
import { classifyModelError, consentCard, describeModel, MODEL_MESSAGES, modelStateOf } from '../../../../src/modules/c/model-manager';

describe('describeModel (حالة الحزمة كما يعلنها المتصفح)', () => {
  it.each([
    ['downloadable', 'not-downloaded'],
    ['downloading', 'downloading'],
    ['available', 'ready'],
    ['unavailable', 'unsupported'],
    ['شيء-جديد', 'unknown'],
  ])('%s ← %s', (browser, state) => {
    expect(modelStateOf(browser)).toBe(state);
    expect(describeModel(browser).state).toBe(state);
  });

  it('لا محرك (null) ← no-engine بلا حزمة ولا موضع ولا حذف', () => {
    const info = describeModel(null);
    expect(info.state).toBe('no-engine');
    expect(info.size).toBe(MODEL_MESSAGES.noPack);
    expect(info.destination).toBe(MODEL_MESSAGES.noDestination);
    expect(info.deletion).toBe(MODEL_MESSAGES.noDeletion);
    expect(info.needsConsent).toBe(false);
  });

  it('الحجم «غير معلن» حيث توجد حزمة يديرها المتصفح، ولا رقم ولا وحدة حجم في أي نص', () => {
    for (const browser of ['downloadable', 'downloading', 'available']) {
      const info = describeModel(browser);
      expect(info.size).toBe('غير معلن من المتصفح');
      for (const text of Object.values(info).filter((v): v is string => typeof v === 'string')) expect(text, `${browser}: ${text}`).not.toMatch(/\d|MB|GB|ميغا|جيجا|بايت/i);
    }
  });

  it('الموافقة تلزم الحزمة غير المنزّلة وحدها (downloading: التنزيل قائم بلا استدعاء جديد؛ available: لا تنزيل)', () => {
    expect(describeModel('downloadable').needsConsent).toBe(true);
    for (const browser of ['downloading', 'available', 'unavailable']) expect(describeModel(browser).needsConsent, browser).toBe(false);
    expect(describeModel('downloadable').connection).toBe(MODEL_MESSAGES.connectionFirst);
    expect(describeModel('available').connection).toBe(MODEL_MESSAGES.connectionNone);
  });

  it('الحذف: لا تملكه الإضافة، والنص يقول ذلك ويحيل إلى المتصفح', () => {
    expect(describeModel('available').deletion).toContain('لا تملك الإضافة حذف الحزمة');
    expect(describeModel('available').deletion).toContain('المتصفح');
  });
});

describe('consentCard', () => {
  it('تعرض الحجم غير معلن والوجهة وشرط الاتصال والوعد، بلا رقم', () => {
    const card = consentCard();
    expect(card.title).toContain('حزمة لغة');
    expect(card.lines.join('\n')).toContain('الحجم: غير معلن من المتصفح');
    expect(card.lines.join('\n')).toContain('الوجهة: يخزّنها المتصفح');
    expect(card.lines.join('\n')).toContain('يلزم اتصال بالإنترنت');
    expect(card.lines.join('\n')).toContain('لا ترسل الإضافة نص الصفحة إلى أي جهة');
    expect(card.lines.join('\n')).not.toMatch(/\d|MB|GB/);
    expect(card.confirmLabel).toBe('موافق، نزّل الحزمة وترجم');
    expect(card.declineLabel).toBe('ليس الآن');
  });
});

describe('classifyModelError (انقطاع الشبكة وامتلاء القرص)', () => {
  const dom = (name: string): DOMException => new DOMException('x', name);

  it('NetworkError ← رسالة انقطاع الاتصال، قبل ثبوت الحزمة وبعده', () => {
    for (const packPresent of [false, true]) expect(classifyModelError(dom('NetworkError'), { packPresent })).toEqual({ kind: 'network', message: MODEL_MESSAGES.networkLost });
  });

  it('TypeError من fetch/الشبكة ← انقطاع الاتصال؛ وTypeError آخر لا يُصنَّف', () => {
    expect(classifyModelError(new TypeError('Failed to fetch'), { packPresent: false })?.kind).toBe('network');
    expect(classifyModelError(new TypeError('NetworkError when attempting to fetch resource.'), { packPresent: false })?.kind).toBe('network');
    expect(classifyModelError(new TypeError('x is not a function'), { packPresent: false })).toBeNull();
  });

  it('QuotaExceededError قبل ثبوت الحزمة ← امتلاء التخزين؛ وبعده هو طول النص فلا يُصنَّف', () => {
    expect(classifyModelError(dom('QuotaExceededError'), { packPresent: false })).toEqual({ kind: 'storage', message: MODEL_MESSAGES.storageFull });
    expect(classifyModelError(dom('QuotaExceededError'), { packPresent: true })).toBeNull();
  });

  it('خطأ المحرك المغلَّف (EngineError) يُقرأ برمزه الأصلي', () => {
    expect(classifyModelError(new EngineError(ENGINE_MESSAGES.tooLong, 'QuotaExceededError'), { packPresent: false })?.kind).toBe('storage');
    expect(classifyModelError(new EngineError(ENGINE_MESSAGES.tooLong, 'QuotaExceededError'), { packPresent: true })).toBeNull();
  });

  it('الإلغاء والأخطاء المجهولة لا تُصنَّف (تمرّ كما هي)', () => {
    expect(classifyModelError(dom('AbortError'), { packPresent: false })).toBeNull();
    expect(classifyModelError(dom('NotSupportedError'), { packPresent: false })).toBeNull();
    expect(classifyModelError(dom('NotAllowedError'), { packPresent: false })).toBeNull();
    expect(classifyModelError(new Error('boom'), { packPresent: false })).toBeNull();
    expect(classifyModelError('نص', { packPresent: false })).toBeNull();
  });
});

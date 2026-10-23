// TEST-TR-02A إلى 02E (AC-C2): الفحوص الأربعة لفاحص الرموز على مخرجات محرك وهمي محقونة.
// تثبت رفض المخرج المشوَّه في الحالات المحقونة، ولا تثبت جودة الترجمة نفسها.
import { describe, expect, it } from 'vitest';
import { maskText } from '../../../../src/modules/c/masking/mask';
import { partsToHtml, partsToText, TokenIntegrityError, unmask } from '../../../../src/modules/c/masking/unmask';
import { TokenIntegrityValidator } from '../../../../src/modules/c/masking/validator';
import type { IntegrityCheck } from '../../../../src/modules/c/masking/types';

// «Call `foo()` then `bar()` and open src/app.ts»: ⟦CODE_0⟧ و⟦CODE_1⟧ و⟦PATH_2⟧.
const SOURCE = 'Call `foo()` then `bar()` and open src/app.ts';
const { masked, expectedTokens } = maskText(SOURCE, { terms: [] });
const validator = new TokenIntegrityValidator(expectedTokens);
const failedChecks = (translated: string): IntegrityCheck[] => validator.validate(translated).failures.map((f) => f.check);

describe('الصيغة المقنَّعة المفترضة للاختبارات', () => {
  it('ثلاثة رموز بالأسماء المعتمدة', () => {
    expect(masked).toBe('Call ⟦CODE_0⟧ then ⟦CODE_1⟧ and open ⟦PATH_2⟧');
  });
});

describe('TEST-TR-02A — الحالة السليمة', () => {
  const translated = 'استدعِ ⟦CODE_0⟧ ثم ⟦CODE_1⟧ وافتح ⟦PATH_2⟧';

  it('تعود الرموز بالعدد والهوية نفسيهما فيقبل الفاحص', () => {
    expect(validator.validate(translated)).toEqual({ ok: true, failures: [] });
  });

  it('تُستبدل بعناصرها الأصلية المعزولة بـdir="ltr" دون محارف خفية', () => {
    const parts = unmask(translated, expectedTokens);
    expect(partsToText(parts)).toBe('استدعِ `foo()` ثم `bar()` وافتح src/app.ts');
    const protectedParts = parts.filter((p) => p.kind === 'protected');
    expect(protectedParts.map((p) => p.value)).toEqual(['`foo()`', '`bar()`', 'src/app.ts']);
    expect(protectedParts.every((p) => p.kind === 'protected' && p.dir === 'ltr')).toBe(true);
    expect(partsToText(parts)).not.toMatch(/[‎‏⁦-⁩]/);
  });

  it('HTML الناتج يعزل كل جزء محمي بـdir="ltr" ويهرّب القيم', () => {
    const risky = maskText('Run `<img src=x onerror=1>` now', { terms: [] });
    const html = partsToHtml(unmask('شغّل ⟦CODE_0⟧ الآن', risky.expectedTokens));
    expect(html).toBe(
      'شغّل <span class="mijhar-bidi-isolate" data-mijhar-injected="true" data-mijhar-protected="CODE" dir="ltr">`&lt;img src=x onerror=1&gt;`</span> الآن',
    );
  });

  it('تبديل ترتيب الرموز لا يُرفض (العقد عدد وهوية لا موضع)', () => {
    expect(validator.validate('⟦PATH_2⟧ افتح ثم ⟦CODE_1⟧ و⟦CODE_0⟧').ok).toBe(true);
  });
});

describe('TEST-TR-02B — فقدان رمز', () => {
  const translated = 'استدعِ ⟦CODE_0⟧ ثم وافتح ⟦PATH_2⟧'; // حُذف ⟦CODE_1⟧

  it('يرفض الفاحص ويسمّي الرمز المفقود', () => {
    const report = validator.validate(translated);
    expect(report.ok).toBe(false);
    expect(failedChecks(translated)).toEqual(['count', 'identity']);
    expect(report.failures.find((f) => f.check === 'identity')?.tokens).toEqual(['⟦CODE_1⟧']);
  });

  it('فك التقنيع يُرفض ولا يُنتج نصًا مشوَّهًا', () => {
    expect(() => unmask(translated, expectedTokens)).toThrow(TokenIntegrityError);
  });
});

describe('TEST-TR-02C — تكرار رمز', () => {
  const translated = 'استدعِ ⟦CODE_0⟧ ثم ⟦CODE_1⟧ و⟦CODE_0⟧ وافتح ⟦PATH_2⟧';

  it('يرفض الفاحص ويسمّي الرمز المكرر', () => {
    const report = validator.validate(translated);
    expect(report.ok).toBe(false);
    expect(failedChecks(translated)).toEqual(['count', 'duplication']);
    expect(report.failures.find((f) => f.check === 'duplication')?.tokens).toEqual(['⟦CODE_0⟧']);
  });

  it('لا يُكرَّر الكود: فك التقنيع مرفوض', () => {
    expect(() => unmask(translated, expectedTokens)).toThrow(TokenIntegrityError);
  });

  it('مكرر مع فقدان آخر يحفظ العدد لكن تسقط الهوية والتكرار معًا', () => {
    const swapped = '⟦CODE_0⟧ ⟦CODE_0⟧ ⟦PATH_2⟧'; // العدد 3 يساوي المتوقع، لكن ⟦CODE_1⟧ مفقود و⟦CODE_0⟧ مكرر
    expect(failedChecks(swapped)).toEqual(['identity', 'duplication']);
  });
});

describe('TEST-TR-02D — تحريف هوية رمز', () => {
  it.each([
    ['أقواس ASCII', '[CODE_0]'],
    ['ترجمة اسم النوع', '⟦كود_0⟧'],
    ['أرقام هندية', '⟦CODE_٠⟧'],
    ['اسم بلا أقواس', 'CODE_0'],
    ['حالة أحرف مختلفة', '⟦code_0⟧'],
    ['مسافات داخل الأقواس', '⟦ CODE_0 ⟧'],
    ['قوس إغلاق مفقود', '⟦CODE_0'],
    ['شرطة سفلية بدل رقم', '⟦CODE_⟧'],
  ])('%s: %s', (_label, mangled) => {
    const translated = `استدعِ ${mangled} ثم ⟦CODE_1⟧ وافتح ⟦PATH_2⟧`;
    const report = validator.validate(translated);
    expect(report.ok).toBe(false);
    expect(failedChecks(translated)).toContain('identity');
    expect(() => unmask(translated, expectedTokens)).toThrow(TokenIntegrityError);
  });

  it('رمز محرَّف لا يُستبدل بعنصره بالتخمين: لا يخرج أي نص من فك التقنيع', () => {
    let produced: unknown = null;
    try {
      produced = unmask('استدعِ [CODE_0] ثم ⟦CODE_1⟧ وافتح ⟦PATH_2⟧', expectedTokens);
    } catch {
      /* المتوقع */
    }
    expect(produced).toBeNull();
  });
});

describe('TEST-TR-02E — رمز غريب غير مسجل', () => {
  it('ظهور ⟦CODE_99⟧ مع اكتمال الرموز المسجلة يرفض بفحص الاختلاق والعدد', () => {
    const translated = 'استدعِ ⟦CODE_0⟧ ثم ⟦CODE_1⟧ وافتح ⟦PATH_2⟧ و⟦CODE_99⟧';
    const report = validator.validate(translated);
    expect(report.ok).toBe(false);
    expect(failedChecks(translated)).toEqual(['count', 'hallucination']);
    expect(report.failures.find((f) => f.check === 'hallucination')?.tokens).toEqual(['⟦CODE_99⟧']);
    expect(() => unmask(translated, expectedTokens)).toThrow(TokenIntegrityError);
  });

  it('رمز غريب بدل رمز مسجل يحفظ العدد لكن تسقط الهوية والاختلاق', () => {
    const translated = 'استدعِ ⟦CODE_0⟧ ثم ⟦CODE_99⟧ وافتح ⟦PATH_2⟧';
    expect(failedChecks(translated)).toEqual(['identity', 'hallucination']);
  });

  it.each([
    ['قوس إغلاق زائد بعد رمز سليم', 'استدعِ ⟦CODE_0⟧⟧ ثم ⟦CODE_1⟧ وافتح ⟦PATH_2⟧'],
    ['قوس فتح زائد قبل رمز سليم', 'استدعِ ⟦⟦CODE_0⟧ ثم ⟦CODE_1⟧ وافتح ⟦PATH_2⟧'],
  ])('%s: الرموز المسجلة كلها حاضرة لكن القوس اليتيم مختلَق فيُرفض', (_label, translated) => {
    expect(validator.validate(translated).ok).toBe(false);
    expect(failedChecks(translated)).toEqual(['hallucination']);
    expect(() => unmask(translated, expectedTokens)).toThrow(TokenIntegrityError);
  });

  it('نص لا رموز مسجلة له يرفض أي رمز يظهر فيه', () => {
    const none = maskText('Plain words only', { terms: [] });
    const v = new TokenIntegrityValidator(none.expectedTokens);
    expect(v.validate('كلمات فقط').ok).toBe(true);
    expect(v.validate('كلمات ⟦CODE_0⟧ فقط').failures.map((f) => f.check)).toEqual(['count', 'hallucination']);
    expect(v.validate('كلمات ⟧ فقط').failures.map((f) => f.check)).toEqual(['hallucination']);
  });
});

// صيغة الرمز على السلك (wire.ts): التحويل ذهابًا وإيابًا لا يخمّن ولا يخفي فشلًا عن الفاحص الرباعي (TEST-TR-04 مع TEST-TR-02).
import { describe, expect, it } from 'vitest';
import { encodeTokens } from '../../../../src/modules/c/engines';
import { maskText, TokenIntegrityValidator } from '../../../../src/modules/c/masking';

describe('encodeTokens', () => {
  it('يحوّل ⟦TYPE_N⟧ إلى {N} ويعيدها حرفيًا', () => {
    const codec = encodeTokens('Run ⟦CODE_0⟧ then open ⟦PATH_1⟧.');
    expect(codec.format).toBe('brace');
    expect(codec.wire).toBe('Run {0} then open {1}.');
    expect(codec.decode('شغّل {0} ثم افتح {1}.')).toBe('شغّل ⟦CODE_0⟧ ثم افتح ⟦PATH_1⟧.');
  });

  it('فهارس جملة من فقرة (إعادة الترجمة جملةً جملةً) تبقى بأرقامها الأصلية', () => {
    const codec = encodeTokens('Then edit ⟦PATH_3⟧ and ⟦CODE_4⟧.');
    expect(codec.wire).toBe('Then edit {3} and {4}.');
    expect(codec.decode('ثم عدّل {4} و{3}.')).toBe('ثم عدّل ⟦CODE_4⟧ و⟦PATH_3⟧.');
  });

  it('نص بلا رموز يُرسل كما هو ولا يُفك فيه شيء', () => {
    const codec = encodeTokens('Plain {0} text.');
    expect(codec.format).toBeNull();
    expect(codec.wire).toBe('Plain {0} text.');
    expect(codec.decode('نص {0}')).toBe('نص {0}');
  });

  it('شكل {N} في النص الأصيل يمنع الصيغة فتُختار [[N]]؛ والصيغتان معًا تُرسلان النص بصيغة الخطة', () => {
    const brace = encodeTokens('Use {0} as the placeholder in ⟦CODE_0⟧.');
    expect(brace.format).toBe('double-bracket');
    expect(brace.wire).toBe('Use {0} as the placeholder in [[0]].');
    expect(brace.decode('استعمل {0} في [[0]].')).toBe('استعمل {0} في ⟦CODE_0⟧.');
    const both = encodeTokens('Use {0} and [[1]] in ⟦CODE_0⟧.');
    expect(both.format).toBeNull();
    expect(both.wire).toBe('Use {0} and [[1]] in ⟦CODE_0⟧.');
  });

  it('رمز بغير شكل ⟦TYPE_N⟧ يُبقي النص بصيغة الخطة', () => {
    expect(encodeTokens('Odd ⟦x⟧ and ⟦CODE_0⟧').format).toBeNull();
  });

  it('المحرَّف لا يُفك: يسقط في الفاحص (فقد أو اختلاق أو تكرار)، ولا يُعرض', () => {
    const { masked, expectedTokens } = maskText('Run `npm test` before you push.');
    const validator = new TokenIntegrityValidator(expectedTokens);
    const codec = encodeTokens(masked);
    expect(codec.wire).toMatch(/\{0\}/);
    expect(validator.validate(codec.decode('شغّل {0} قبل الدفع.')).ok).toBe(true);
    const lost = validator.validate(codec.decode('شغّل {0 قبل الدفع.'));
    expect(lost.ok).toBe(false);
    expect(lost.failures.map((f) => f.check)).toContain('identity');
    const invented = validator.validate(codec.decode('شغّل {0} و{7} قبل الدفع.'));
    expect(invented.failures.map((f) => f.check)).toContain('hallucination');
    const twice = validator.validate(codec.decode('شغّل {0} ثم {0}.'));
    expect(twice.failures.map((f) => f.check)).toContain('duplication');
    const arabicDigit = validator.validate(codec.decode('شغّل {٠} قبل الدفع.'));
    expect(arabicDigit.failures.map((f) => f.check)).toContain('identity');
  });
});

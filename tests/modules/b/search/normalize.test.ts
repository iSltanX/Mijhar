// توحيد نص البحث (src/modules/b/search/normalize.ts): الاستعلام والفهرس بالدالة نفسها فلا يفلت تطابق بسبب تشكيل أو همزة أو تعريف.
import { describe, expect, it } from 'vitest';
import { normalizeText, queryWords, tokens } from '../../../../src/modules/b/search/normalize';

describe('normalizeText', () => {
  it('يحذف التشكيل والتطويل ويوحّد الألف والياء والتاء المربوطة', () => {
    expect(normalizeText('مُسْتَوْدَعٌ')).toBe(normalizeText('مستودع'));
    expect(normalizeText('الإصدار')).toBe(normalizeText('الاصدار'));
    expect(normalizeText('أرشفة')).toBe(normalizeText('ارشفه'));
    expect(normalizeText('مَدَى')).toBe(normalizeText('مدي'));
    expect(normalizeText('كـــوميت')).toBe('كوميت');
  });

  it('الإنجليزية صغيرة، وعلامات الترقيم والاتجاه والمحارف الخفية فواصل أو تُحذف', () => {
    expect(normalizeText('Pull-Request!')).toBe('pull request');
    expect(normalizeText('Two‑factor authentication (2FA)')).toBe('two factor authentication 2fa');
    expect(normalizeText('‏مستودع‎')).toBe('مستودع');
    expect(normalizeText('  Squash   and merge ')).toBe('squash and merge');
  });

  it('الأرقام العربية والفارسية تصير لاتينية', () => {
    expect(normalizeText('٢فا ۲ ٣')).toBe('2فا 2 3');
  });

  it('نص فارغ أو علامات فقط يعطي سلسلة فارغة', () => {
    expect(normalizeText('')).toBe('');
    expect(normalizeText('؟!…')).toBe('');
  });
});

describe('tokens وqueryWords', () => {
  it('«ال» التعريف لا تمنع المطابقة: كلمة بصيغتين', () => {
    expect(tokens('المستودع الجديد')).toEqual(['المستودع', 'مستودع', 'الجديد', 'جديد']);
    expect(queryWords('المستودع')).toEqual([['المستودع', 'مستودع']]);
    expect(queryWords('commit الفرع')).toEqual([['commit'], ['الفرع', 'فرع']]);
  });

  it('كلمة قصيرة تبدأ بـ«ال» لا تُقطع (الله، الي…)', () => {
    expect(queryWords('الي')).toEqual([['الي']]);
  });

  it('استعلام فارغ بلا كلمات', () => {
    expect(queryWords('   ')).toEqual([]);
  });
});

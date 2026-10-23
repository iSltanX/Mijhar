// قيمة قد لا تتوفر في الصفحة. الغياب حالة صريحة بسبب مكتوب، وتُعرض «غير متاح»: لا قيمة مخمّنة ولا استنتاج من غياب عبارة
// (evidence/T-0.3: «لا يُستنتج من غياب العبارة»). تشترك فيها بطاقة حالة طلب الدمج (T-5.1) وملخص المقارنة (T-5.4).

export const UNAVAILABLE_TEXT = 'غير متاح';

export type Value<T> = { readonly available: true; readonly value: T } | { readonly available: false; readonly reason: string };

export const have = <T>(value: T): Value<T> => ({ available: true, value });

export const missing = (reason: string): Value<never> => ({ available: false, reason });

/** يحوّل عددًا مكتوبًا في الصفحة («5,381» أو «1.2k» لا يُقبل) إلى عدد صحيح، أو null إن لم يكن أرقامًا وفواصل فقط. */
export function parseCount(text: string | null | undefined): number | null {
  if (text == null) return null;
  const cleaned = text.replace(/[\s‎‏ ]/g, '');
  if (!/^\d{1,3}(,\d{3})*$|^\d+$/.test(cleaned)) return null;
  return Number(cleaned.replace(/,/g, ''));
}

/** نص قصير مضغوط المسافات بلا علامات الاتجاه. */
export function squash(text: string | null | undefined): string {
  return (text ?? '').replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/\s+/g, ' ').trim();
}

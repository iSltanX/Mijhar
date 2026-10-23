// ربط عناوين القوالب وتسميات حقول النماذج بحقول المساعد الخمسة (المتوقع والفعلي وخطوات التكرار والبيئة والأدلة). مطابقة كلمات مفتاحية بالإنجليزية والعربية؛
// ما لا يطابق شيئًا يبقى بلا مقابل ولا يُخمَّن له حقل. الترتيب مقصود: «Steps to reproduce» تحوي «reproduce» فتُصنَّف خطوات قبل أن يلتقطها غيرها.
import { FIELD_IDS } from '../composer/template';
import type { FieldId } from '../composer/template';

const PATTERNS: ReadonlyArray<readonly [FieldId, RegExp]> = [
  ['steps', /steps?|reproduc|repro\b|how to (test|verify|reproduce)|test(ing)? plan|verification|خطوات|إعادة (ال)?إنتاج|التكرار|كيفية التحقق|طريقة التحقق/i],
  ['expected', /expected|desired|should (happen|be)|المتوقع/i],
  ['actual', /actual|current (behaviou?r|state)|observed|what (happened|actually)|description|summary|problem|\bbug\b|الفعلي|ما حدث|الوصف|المشكلة|ملخص/i],
  ['environment', /environment|version|platform|system|browser|\bos\b|operating|setup|configuration|البيئة|الإصدار|النظام/i],
  ['evidence', /evidence|screenshots?|logs?\b|attachments?|additional (context|info)|proof|الأدلة|لقطات|سجل|مرفقات/i],
];

/** الحقل الذي يقابل نصًا (عنوان أو تسمية)، أو null. */
export function conceptOf(text: string): FieldId | null {
  const clean = text.replace(/[*_`#:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  for (const [id, pattern] of PATTERNS) if (pattern.test(clean)) return id;
  return null;
}

export { FIELD_IDS };
export type { FieldId };

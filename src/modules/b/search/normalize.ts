// توحيد نص البحث بالعربية والإنجليزية (F-B6): الاستعلام والفهرس يمرّان بالدالة نفسها فيتطابقان مهما اختلفت الكتابة.
//  - يُحذف التشكيل والتطويل وعلامات الاتجاه والمحارف الخفية؛ وتوحَّد الألف (أ إ آ ٱ ← ا) والياء المقصورة (ى ← ي) والتاء المربوطة (ة ← ه).
//  - الأرقام العربية والفارسية ← لاتينية، والحروف الإنجليزية صغيرة، وكل ما ليس حرفًا ولا رقمًا فاصل (يُطوى إلى مسافة).
//  - «ال» التعريف في أول الكلمة لا تمنع المطابقة: «المستودع» و«مستودع» رمزان متكافئان (tokens وqueryWords تعيدان الصيغتين).
// النطاقات بمحارف الهروب الصريحة لا بمحارف عربية مباشرة، فلا تلتبس في المحرر ويسهل التحقق منها.

const DIACRITICS = /[ً-ٰٟۖ-ۭـ]/g;
const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/g;
const NON_WORD = /[^\p{L}\p{N}]+/gu;
const ALEF_VARIANTS = /[أإآٱ]/g;
const ALEF_MAKSURA = /ى/g;
const TA_MARBUTA = /ة/g;

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_INDIC = '۰۱۲۳۴۵۶۷۸۹';
/** «ال» التعريف. */
const DEFINITE = 'ال';

function digits(text: string): string {
  let out = '';
  for (const ch of text) {
    const arabic = ARABIC_INDIC.indexOf(ch);
    const persian = PERSIAN_INDIC.indexOf(ch);
    out += arabic >= 0 ? String(arabic) : persian >= 0 ? String(persian) : ch;
  }
  return out;
}

/** النص بعد التوحيد: مسافات مفردة بين الكلمات، بلا علامات ترقيم. */
export function normalizeText(text: string): string {
  return digits(text)
    .replace(INVISIBLE, '')
    .replace(DIACRITICS, '')
    .replace(ALEF_VARIANTS, 'ا')
    .replace(ALEF_MAKSURA, 'ي')
    .replace(TA_MARBUTA, 'ه')
    .toLowerCase()
    .replace(NON_WORD, ' ')
    .trim();
}

const withoutDefinite = (word: string): string => (word.length > 3 && word.startsWith(DEFINITE) ? word.slice(2) : word);

/** كلمات النص الموحَّد، وكل كلمة عربية تبدأ بـ«ال» تُضاف معها صيغتها بلا التعريف. */
export function tokens(normalized: string): string[] {
  const out = new Set<string>();
  for (const word of normalized.split(' ')) {
    if (!word) continue;
    out.add(word);
    out.add(withoutDefinite(word));
  }
  return [...out];
}

/** كلمات الاستعلام: لكل كلمة صيغتها وصيغتها بلا «ال»، فتطابق أيًّا منهما. */
export function queryWords(query: string): string[][] {
  return normalizeText(query)
    .split(' ')
    .filter(Boolean)
    .map((word) => [...new Set([word, withoutDefinite(word)])]);
}

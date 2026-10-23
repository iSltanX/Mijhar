// تحويل الأرقام إلى المشرقية (T-2.6، F-A6) حصريًا في النثر العربي الخالص. دوال نقية لا تمس DOM.
// العقدة النصية «نثر عربي خالص» إن كان فيها حرف عربي ورقم، ولم يكن فيها حرف لاتيني ولا موضع عزل (مسار أو إصدار أو مرجع #123
// أو إشارة). فما فيه كود أو معرّف أو SHA (حروف لاتينية) لا يُمس كله. وهذا يضمن أيضًا ألا يقسم معالج العزل عقدةً حوّلها المحرك.
// وداخل النثر تبقى كما هي: تواريخ ISO والنسب والأعداد المنقوطة (الإصدارات والكسور العشرية) و#123.
import { hasIsolateRun } from '../isolation/patterns';

export const EASTERN_DIGITS = '٠١٢٣٤٥٦٧٨٩';

const ARABIC_LETTER = /(?=\p{L})\p{Script=Arabic}/u;
const LATIN_LETTER = /(?=\p{L})\p{Script=Latin}/u;
const ASCII_DIGIT = /[0-9]/;

// المستثنى أولًا في البديلة: ما يطابقه يُنسخ كما هو، والأرقام المنفردة الباقية تُحوَّل.
const DIGITS = /(\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?|\d+(?:[.,]\d+)*\s?[%٪]|\d+(?:\.\d+)+|#\d+)|(\d+)/g;

export function isPureArabicProse(text: string): boolean {
  return ASCII_DIGIT.test(text) && ARABIC_LETTER.test(text) && !LATIN_LETTER.test(text) && !hasIsolateRun(text);
}

/** يحوّل الأرقام الغربية إلى مشرقية في النص كله ما عدا المستثنى. */
export function toEasternDigits(text: string): string {
  return text.replace(DIGITS, (match, keep: string | undefined) => (keep !== undefined ? match : match.replace(/\d/g, (d) => EASTERN_DIGITS[Number(d)] as string)));
}

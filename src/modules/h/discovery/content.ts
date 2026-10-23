// «محتوى عربي»: خاصية لنص (وصف مشروع مثلًا) هي أن حروفه عربية، تُقاس من النص نفسه وحده ولا شيء غيره.
// ممنوع أن يدخل هنا اسم صاحب الحساب أو اسم مستخدمه أو موقعه (F-H6): الدالة لا تأخذ إلا نصًّا.
const ARABIC_LETTER = /[ؠ-يٮ-ۓۺ-ۿݐ-ݿࢠ-ࣿ]/gu;
const LETTER = /\p{L}/gu;

export interface ScriptShare {
  readonly arabicLetters: number;
  readonly letters: number;
  /** نسبة الحروف العربية من كل الحروف (٠ إلى ١). */
  readonly share: number;
}

export function arabicScriptShare(text: string): ScriptShare {
  const arabicLetters = text.match(ARABIC_LETTER)?.length ?? 0;
  const letters = text.match(LETTER)?.length ?? 0;
  return { arabicLetters, letters, share: letters === 0 ? 0 : arabicLetters / letters };
}

/** حد النص العربي: ثلاثة حروف عربية على الأقل وأربعون بالمئة من حروفه. */
export const ARABIC_MIN_LETTERS = 3;
export const ARABIC_MIN_SHARE = 0.4;

export function isArabicContent(text: string): boolean {
  const { arabicLetters, share } = arabicScriptShare(text);
  return arabicLetters >= ARABIC_MIN_LETTERS && share >= ARABIC_MIN_SHARE;
}

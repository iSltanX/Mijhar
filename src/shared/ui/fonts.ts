// خطّا هوية الواجهة مضمّنان في الحزمة (القسم 01 الهوية في ملف Figma): Cairo للعناوين، وAlmarai للنص. ملفات woff2 في fonts/ بتراخيصها
// (assets/fonts، ويتحقق منها scripts/fonts/verify.mjs). قبل هذا كانت الرموز تسمّيهما بالاسم وحده فيظهران حيث ثُبّتا على الجهاز فقط.
//  - التسجيل بـFontFace في document.fonts لا بعنصر أنماط: لا تُحقن ورقة أنماط في مستند GitHub (shadow.ts)، والأوجه المسجّلة في المستند
//    تسري داخل جذور الظل كلها. والملف لا يُحمَّل إلا حين يُرسم نص به.
//  - العنوان من runtime.getURL (صفحات الإضافة وسكربت المحتوى؛ والخطوط web_accessible لـgithub.com). وCSP صفحة GitHub لا تمنع خطوط
//    الإضافة في المتصفحات الأربعة (HYP-16، evidence/T-2.3).
//  - أسماء العائلتين مميّزة: «Mijhar Cairo» في الوحدة (أ) مقيّد بالحروف العربية لنص الصفحة، فلا تُشارك الاسم.
//  - خارج سياق إضافة (اختبار) أو بلا FontFace: لا شيء، فيبقى الاسم المثبت ثم خط النظام كما في الرموز.

export const UI_FONT_DISPLAY = 'Mijhar UI Cairo';
export const UI_FONT_TEXT = 'Mijhar UI Almarai';

export interface UiFontFile {
  readonly family: typeof UI_FONT_DISPLAY | typeof UI_FONT_TEXT;
  /** المسار داخل الحزمة. */
  readonly file: string;
  readonly weight: '400' | '700';
}

/** الأوزان المستعملة في الواجهة: 400 و700 (و600 يأخذ 700). */
export const UI_FONTS: readonly UiFontFile[] = [
  { family: UI_FONT_DISPLAY, file: 'fonts/Cairo-Regular.woff2', weight: '400' },
  { family: UI_FONT_DISPLAY, file: 'fonts/Cairo-Bold.woff2', weight: '700' },
  { family: UI_FONT_TEXT, file: 'fonts/Almarai-Regular.woff2', weight: '400' },
  { family: UI_FONT_TEXT, file: 'fonts/Almarai-Bold.woff2', weight: '700' },
];

type UrlFor = (file: string) => string;

interface RuntimeLike {
  getURL?(path: string): string;
}

function extensionUrlFor(): UrlFor | null {
  const g = globalThis as { browser?: { runtime?: RuntimeLike }; chrome?: { runtime?: RuntimeLike } };
  const runtime = g.browser?.runtime ?? g.chrome?.runtime;
  const getURL = runtime?.getURL;
  return typeof getURL === 'function' ? (file) => getURL.call(runtime, file) : null;
}

const registered = new WeakSet<Document>();

/** يسجّل أوجه الخطين في document.fonts مرة لكل مستند، ويعيد عدد ما سُجّل. لا يرمي. */
export function registerUiFonts(doc: Document, urlFor: UrlFor | null = extensionUrlFor()): number {
  if (!urlFor || registered.has(doc)) return 0;
  const View = doc.defaultView as (Window & typeof globalThis) | null;
  const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
  if (!View || typeof View.FontFace !== 'function' || !fonts) return 0;
  registered.add(doc);
  let count = 0;
  for (const font of UI_FONTS) {
    try {
      fonts.add(new View.FontFace(font.family, `url("${urlFor(font.file)}") format("woff2")`, { weight: font.weight, style: 'normal', display: 'swap' }));
      count += 1;
    } catch {
      // متصفح يرفض الوجه: يبقى الاسم المثبت ثم خط النظام.
    }
  }
  return count;
}

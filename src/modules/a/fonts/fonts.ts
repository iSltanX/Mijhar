// الخطوط العربية المضمّنة وضبط الطباعة (T-2.3، F-A3). الخطوط الثلاثة woff2 داخل الحزمة (fonts/ مع نص رخصة كل خط)، تُحمَّل
// بـ@font-face من عنوان الإضافة دون أي اتصال بنطاق خطوط خارجي، بنطاق unicode-range عربي فلا يتغير خط الحروف اللاتينية والكود.
// إن منعت سياسة CSP للصفحة تحميلها (HYP-16، BLK-CSP-FONT) سقط المتصفح إلى الخط التالي في القائمة، وهو خط GitHub نفسه: لا كسر.
// الحجم وارتفاع السطر وتباعد الفقرات على الكتل العربية وحدها (التي قلبتها ميزة الاتجاه أو يعرضها GitHub rtl)، بلا تباعد حروف.
// دوال نقية تُنتج CSS؛ والملفات وتراخيصها يتحقق منها scripts/fonts/verify.mjs (AC-A3).
import { DIR_ATTR } from '../direction/processor';

export const TYPOGRAPHY_KEY = 'modules.a.fonts.options';

export type EmbeddedFontId = 'plex' | 'cairo' | 'noto';
export type FontChoice = EmbeddedFontId | 'system';

export interface FontFile {
  /** المسار داخل الحزمة. */
  readonly file: string;
  /** وزن ثابت أو مدى لخط متغير. */
  readonly weight: string;
}

export interface EmbeddedFont {
  readonly id: EmbeddedFontId;
  readonly label: string;
  /** اسم العائلة في @font-face: مميَّز فلا يلتبس بخط مثبت في النظام بالاسم نفسه. */
  readonly family: string;
  readonly files: readonly FontFile[];
  readonly license: { readonly spdx: 'OFL-1.1'; readonly file: string };
}

export const EMBEDDED_FONTS: Readonly<Record<EmbeddedFontId, EmbeddedFont>> = {
  plex: {
    id: 'plex',
    label: 'IBM Plex Sans Arabic',
    family: 'Mijhar IBM Plex Sans Arabic',
    files: [
      { file: 'fonts/IBMPlexSansArabic-Regular.woff2', weight: '400' },
      { file: 'fonts/IBMPlexSansArabic-Bold.woff2', weight: '700' },
    ],
    license: { spdx: 'OFL-1.1', file: 'fonts/OFL-IBMPlexSansArabic.txt' },
  },
  cairo: {
    id: 'cairo',
    label: 'Cairo',
    family: 'Mijhar Cairo',
    files: [
      { file: 'fonts/Cairo-Regular.woff2', weight: '400' },
      { file: 'fonts/Cairo-Bold.woff2', weight: '700' },
    ],
    license: { spdx: 'OFL-1.1', file: 'fonts/OFL-Cairo.txt' },
  },
  noto: {
    id: 'noto',
    label: 'Noto Sans Arabic',
    family: 'Mijhar Noto Sans Arabic',
    files: [{ file: 'fonts/NotoSansArabic-Variable.woff2', weight: '100 900' }],
    license: { spdx: 'OFL-1.1', file: 'fonts/OFL-NotoSansArabic.txt' },
  },
};

export const FONT_CHOICES: readonly FontChoice[] = ['plex', 'cairo', 'noto', 'system'];
export const FONT_LABELS: Readonly<Record<FontChoice, string>> = {
  plex: EMBEDDED_FONTS.plex.label,
  cairo: EMBEDDED_FONTS.cairo.label,
  noto: EMBEDDED_FONTS.noto.label,
  system: 'خط النظام (بلا خط مضمّن)',
};

/** الحروف العربية وملحقاتها وأشكال العرض، وZWNJ وZWJ. */
export const ARABIC_UNICODE_RANGE = 'U+0600-06FF, U+0750-077F, U+0870-089F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFF, U+200C-200D';

/** قائمة خطوط GitHub نفسها بعد الخط المضمّن، فيبقى لكل ما ليس عربيًا خطه. */
export const GITHUB_SANS = 'var(--fontStack-sansSerif, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji")';

export interface Typography {
  readonly family: FontChoice;
  /** حجم الخط بالنسبة المئوية: 100 إلى 130 بخطوة 5. */
  readonly scale: number;
  /** ارتفاع السطر: 1.6 إلى 2.0 بخطوة 0.1. */
  readonly lineHeight: number;
  /** تباعد الفقرات مضاعفًا لهامش GitHub (16px): 0.5 إلى 2.0 بخطوة 0.25. */
  readonly spacing: number;
}

export const DEFAULT_TYPOGRAPHY: Typography = { family: 'plex', scale: 100, lineHeight: 1.8, spacing: 1 };
export const TYPOGRAPHY_LIMITS = {
  scale: { min: 100, max: 130, step: 5 },
  lineHeight: { min: 1.6, max: 2.0, step: 0.1 },
  spacing: { min: 0.5, max: 2.0, step: 0.25 },
} as const;

const onStep = (value: number, { min, max, step }: { min: number; max: number; step: number }): boolean => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min - 1e-9 || value > max + 1e-9) return false;
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
};

export function isTypography(value: unknown): value is Typography {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((key) => !['family', 'scale', 'lineHeight', 'spacing'].includes(key))) return false;
  return (
    typeof v.family === 'string' &&
    (FONT_CHOICES as readonly string[]).includes(v.family) &&
    onStep(v.scale as number, TYPOGRAPHY_LIMITS.scale) &&
    onStep(v.lineHeight as number, TYPOGRAPHY_LIMITS.lineHeight) &&
    onStep(v.spacing as number, TYPOGRAPHY_LIMITS.spacing)
  );
}

const quote = (value: string): string => `"${value.replace(/["\\]/g, '')}"`;

/** قواعد @font-face لخط مضمّن؛ urlFor يحوّل مسار الحزمة إلى عنوان (runtime.getURL في الصفحة، ونسبي في صفحات الإضافة). */
export function fontFaceCss(font: EmbeddedFont, urlFor: (file: string) => string): string {
  return font.files
    .map(
      ({ file, weight }) =>
        `@font-face{font-family:${quote(font.family)};src:url(${quote(urlFor(file))}) format("woff2");font-weight:${weight};font-style:normal;font-display:swap;unicode-range:${ARABIC_UNICODE_RANGE}}`,
    )
    .join('\n');
}

/** قائمة font-family: الخط المختار ثم خطوط GitHub (أو خطوط GitHub وحدها لخط النظام). */
export function familyStack(choice: FontChoice, fallback = GITHUB_SANS): string {
  return choice === 'system' ? fallback : `${quote(EMBEDDED_FONTS[choice].family)}, ${fallback}`;
}

// الكتل العربية: الخارجية فقط (p داخل li يرث حجم li فلا يتضاعف). قاعدتان لكل خاصية: ما قلبته الإضافة (اتجاهه من CSS فلا تطابقه
// :dir) وما يعرضه GitHub rtl بسمة dir.
const OUTER = ':is(p, li, td, th):not(:is(li, td, th) *)';
const FLIPPED = `[${DIR_ATTR}="rtl"]${OUTER}`;
const NATIVE = `.markdown-body ${OUTER}:dir(rtl)`;

/** CSS صفحة GitHub: الخطوط وضبط الكتل العربية. */
export function pageTypographyCss(typography: Typography, urlFor: (file: string) => string): string {
  const rules: string[] = [];
  if (typography.family !== 'system') {
    rules.push(fontFaceCss(EMBEDDED_FONTS[typography.family], urlFor));
    rules.push(`.markdown-body, .markdown-title, [${DIR_ATTR}="rtl"]{font-family:${familyStack(typography.family)}}`);
  }
  const block = `font-size:calc(1em * ${typography.scale / 100});line-height:${typography.lineHeight};letter-spacing:0`;
  rules.push(`${FLIPPED}{${block}}`, `${NATIVE}{${block}}`);
  const margin = `margin-bottom:calc(var(--base-size-16, 16px) * ${typography.spacing})`;
  rules.push(`p[${DIR_ATTR}="rtl"]{${margin}}`, `.markdown-body p:dir(rtl){${margin}}`);
  return rules.join('\n');
}

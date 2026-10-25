// تاريخ سريان سياسة الخصوصية — مصدره الواحد سطر «تاريخ السريان» في قسم الرأس من Docs/Site/privacy.md (AD-35، AD-40). دوالّ نقية بلا آثار
// يستعملها مولّد PRIVACY.md (scripts/privacy.mjs) وأمر التثبيت (scripts/privacy-effective.mjs)؛ ويعيد الموقع قراءة السطر نفسه في مولّده.
const SOURCE = 'Docs/Site/privacy.md';
export const EFFECTIVE_PLACEHOLDER = '⟨تاريخ النشر⟩';
export const PUBLISH_TIME_ZONE = 'Asia/Riyadh';
const LINE_RE = /^- \*\*تاريخ السريان:\*\* (.+)$/m;
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export function isValidISODate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** تاريخ اللحظة المعطاة بتوقيت السعودية (UTC+3 بلا توقيت صيفي) بصيغة YYYY-MM-DD. */
export function riyadhDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PUBLISH_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** «2 نوفمبر 2026» — صيغة التواريخ في نصوص الموقع (`Docs/Site/spec.md` §7). */
export function formatArabicDate(iso) {
  if (!isValidISODate(iso)) throw new Error(`تاريخ غير صالح: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * القيمة في المصدر: تاريخ YYYY-MM-DD، أو `null` ما دام `⟨تاريخ النشر⟩`. ويفشل على أي قيمة أخرى، وعلى غياب السطر ما لم يُمرَّر
 * `{ required: false }` (مصادر الاختبار المصغّرة في `privacy.mjs`؛ ووجوده في المصدر الحقيقي يحرسه `tests/build/privacy-effective.test.ts`).
 */
export function effectiveDateOf(source, { required = true } = {}) {
  const m = LINE_RE.exec(source);
  if (!m) {
    if (!required) return null;
    throw new Error(`لا سطر «تاريخ السريان» في قسم الرأس من ${SOURCE}`);
  }
  const value = m[1].trim();
  if (value === EFFECTIVE_PLACEHOLDER) return null;
  if (!isValidISODate(value)) throw new Error(`«تاريخ السريان» في ${SOURCE} ليس YYYY-MM-DD صالحًا ولا ${EFFECTIVE_PLACEHOLDER}: ${value}`);
  return value;
}

export function setEffectiveDate(source, iso) {
  if (!isValidISODate(iso)) throw new Error(`تاريخ غير صالح: ${iso}`);
  effectiveDateOf(source); // يتحقق أن السطر موجود وصالح قبل الاستبدال
  return source.replace(LINE_RE, `- **تاريخ السريان:** ${iso}`);
}

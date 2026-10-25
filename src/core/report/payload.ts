// «الإبلاغ عن مشكلة» (AC-10.3، DEC-12 ي-1، MJ26): جسم البلاغ بعقد قناة iSltanX/app-reports (v1) كما يُرسَل، وما يُعرض منه قبل الإرسال، ونسخته نصًّا.
// منطق خالص بلا واجهات المتصفح ولا شبكة. و«ما يُعرض هو ما يُرسَل»: صفوف المعاينة تُشتق من الجسم المبني نفسه لا من النموذج، فلا يفترقان بحقل.
// وما لا يُرسَل أبدًا: محتوى صفحة ورابطها، واسم مستودع، ورمز ومفتاح، ومعرّف للمستخدم أو الجهاز. لا حقل لها هنا أصلًا؛ والتشخيص قيم تقنية من
// المتصفح والإضافة بأشكال ضيقة (diagnosticsOf)، والوصف وحده نص المستخدم الذي كتبه ويراه.

/** معرّف مِجهَر في القناة المشتركة (وسم product:mijhar). ثابت لا يُعاد تسميته. */
export const PRODUCT_ID = 'mijhar';

/** سقوف العقد التي تفحصها الواجهة قبل الإرسال؛ والخادم يفرضها. */
export const LIMITS = { description: 2000, diagnostics: 16 * 1024 } as const;

export const REPORT_KINDS = ['bug', 'suggestion', 'other'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export interface ReportForm {
  readonly kind: ReportKind;
  readonly description: string;
}

/** ما يجمعه diagnostics.ts من الإضافة والمتصفح، لا من الصفحات. */
export interface Diagnostics {
  readonly appVersion: string;
  readonly os: string;
  readonly osVersion: string;
  readonly arch: string;
  readonly browser: string;
  readonly browserVersion: string;
  /** حزمة البناء: chromium أو firefox. */
  readonly buildTarget: string;
  /** مكان اللوحة: native أو drawer. */
  readonly surface: string;
  /** حروف الوحدات الموقوفة (a..h)، أو فارغة. */
  readonly disabledUnits: readonly string[];
  /** نسخة غير منشورة (تثبيت مطوّر): يضيف وسم test عند المالك. */
  readonly test: boolean;
}

/** الجسم بعقد v1، بأسماء حقوله حرفًا. */
export interface ReportPayload {
  readonly product: typeof PRODUCT_ID;
  readonly app_version: string;
  readonly os: string;
  readonly os_version: string;
  readonly arch: string;
  readonly locale: 'ar';
  readonly kind: ReportKind;
  readonly description: string;
  readonly diagnostics: Readonly<Record<string, string>>;
  readonly test?: true;
}

const TOKEN = /^[A-Za-z0-9 ._()+,-]*$/;
/** أشكال القيم التقنية: اسم بحروف لاتينية ومسافات، وإصدار بأرقام ونقاط، ومعرّف قصير. وما خرج عن شكله «unknown» لا نصًّا حرًّا. */
const NAME = /^[A-Za-z][A-Za-z ]*$/;
const VERSION = /^\d+(\.\d+)*$/;
const IDENT = /^[a-z][a-z0-9_]*$/;
const narrow = (value: string, max: number, shape: RegExp): string => {
  const v = value.trim();
  return v && v.length <= max && shape.test(v) ? v : 'unknown';
};
const UNIT = /^[a-h]$/;

export function diagnosticsOf(d: Diagnostics): Record<string, string> {
  const units = [...new Set(d.disabledUnits.filter((u) => UNIT.test(u)))].sort();
  return {
    browser: narrow(d.browser, 32, NAME),
    browser_version: narrow(d.browserVersion, 32, VERSION),
    build_target: d.buildTarget === 'firefox' ? 'firefox' : 'chromium',
    surface: d.surface === 'drawer' ? 'drawer' : 'native',
    disabled_units: units.length ? units.join(',') : 'none',
  };
}

export type FormError = 'empty' | 'too-long' | 'kind';

export function formError(form: ReportForm): FormError | null {
  if (!REPORT_KINDS.includes(form.kind)) return 'kind';
  const text = form.description.trim();
  if (!text) return 'empty';
  if (text.length > LIMITS.description) return 'too-long';
  return null;
}

export function buildPayload(form: ReportForm, d: Diagnostics): ReportPayload {
  const error = formError(form);
  if (error) throw new Error(`بلاغ غير صالح: ${error}`);
  return {
    product: PRODUCT_ID,
    app_version: narrow(d.appVersion, 32, VERSION),
    os: narrow(d.os, 16, IDENT),
    os_version: narrow(d.osVersion, 32, VERSION),
    arch: narrow(d.arch, 16, IDENT),
    locale: 'ar',
    kind: form.kind,
    description: form.description.trim(),
    diagnostics: diagnosticsOf(d),
    ...(d.test ? { test: true as const } : {}),
  };
}

const KIND_TEXT: Readonly<Record<ReportKind, string>> = { bug: 'خلل', suggestion: 'اقتراح', other: 'أخرى' };

export interface ReviewRow {
  readonly label: string;
  readonly value: string;
  /** اسم الحقل في الجسم المرسل كما هو. */
  readonly field: string;
}

/** كل ما في الجسم صفًّا صفًّا (إلا الوصف، فيُعرض في حقله كما كتبه المستخدم): لا حقل يُرسل ولا يُعرض. */
export function reviewRows(p: ReportPayload): ReviewRow[] {
  const rows: ReviewRow[] = [
    { label: 'المنتج', value: p.product, field: 'product' },
    { label: 'النوع', value: `${KIND_TEXT[p.kind]} (${p.kind})`, field: 'kind' },
    { label: 'إصدار مِجهَر', value: p.app_version, field: 'app_version' },
    { label: 'المتصفح', value: `${p.diagnostics.browser} ${p.diagnostics.browser_version}`, field: 'diagnostics.browser · browser_version' },
    { label: 'حزمة البناء', value: p.diagnostics.build_target ?? '', field: 'diagnostics.build_target' },
    { label: 'النظام', value: `${p.os} ${p.os_version} · ${p.arch}`, field: 'os · os_version · arch' },
    { label: 'لغة الواجهة', value: p.locale, field: 'locale' },
    { label: 'مكان اللوحة', value: p.diagnostics.surface ?? '', field: 'diagnostics.surface' },
    { label: 'الوحدات الموقوفة', value: p.diagnostics.disabled_units ?? '', field: 'diagnostics.disabled_units' },
  ];
  if (p.test) rows.push({ label: 'بلاغ تجريبي', value: 'نعم: نسخة غير منشورة من مِجهَر', field: 'test' });
  return rows;
}

/** «انسخ البلاغ» (العقد): الجسم نفسه منسَّقًا. */
export const serialise = (p: ReportPayload): string => JSON.stringify(p, null, 2);

/** حقول العقد العليا المسموحة، وتتحقق منها الخلفية قبل الإرسال فلا يمرّ إليها جسم صاغته صفحة أخرى بحقل زائد. */
const TOP_FIELDS = ['product', 'app_version', 'os', 'os_version', 'arch', 'locale', 'kind', 'description', 'diagnostics', 'test'];
const DIAG_FIELDS = ['browser', 'browser_version', 'build_target', 'surface', 'disabled_units'];

/** يتحقق من جسم وصل في رسالة إلى الخلفية: شكل العقد وحقول مِجهَر وحدها وسقوفها. */
export function isReportPayload(value: unknown): value is ReportPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some((k) => !TOP_FIELDS.includes(k))) return false;
  const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;
  if (p.product !== PRODUCT_ID || p.locale !== 'ar') return false;
  if (!str(p.app_version, 32) || !str(p.os, 16) || !str(p.os_version, 32) || !str(p.arch, 16)) return false;
  if (!REPORT_KINDS.includes(p.kind as ReportKind)) return false;
  if (typeof p.description !== 'string' || p.description.trim() !== p.description || !p.description || p.description.length > LIMITS.description) return false;
  if (p.test !== undefined && p.test !== true) return false;
  const d = p.diagnostics;
  if (typeof d !== 'object' || d === null || Array.isArray(d)) return false;
  const entries = Object.entries(d as Record<string, unknown>);
  if (entries.some(([k, v]) => !DIAG_FIELDS.includes(k) || !str(v, 48) || !TOKEN.test(v as string))) return false;
  return JSON.stringify(d).length <= LIMITS.diagnostics;
}

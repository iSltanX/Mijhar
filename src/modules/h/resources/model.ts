// نموذج دليل موارد التعلّم العربية (T-9.5، F-H5): مورد بتاريخ آخر تحقق وحالة ومصدر تحقق، وملف التصدير والاستيراد، ومدققاتهما.
// القائمة المضمّنة في src/data/resources/resources.json تعمل دون اتصال؛ وما يضيفه المستخدم أو يعدّله يُحفظ محليًا فوقها.
import { classifyPath } from '../../../core/detector/page-types';

export const RESOURCE_FORMAT = 'mijhar-resources';
export const RESOURCE_SCHEMA_VERSION = 1;

/** active: غير مؤرشف على GitHub؛ archived: مؤرشف؛ unverified: لم يُتحقق منه؛ unreachable: تعذّر الوصول عند آخر فحص (لا يعني الحذف). */
export const RESOURCE_STATUSES = ['active', 'archived', 'unverified', 'unreachable'] as const;
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];

export const STATUS_LABELS: Readonly<Record<ResourceStatus, string>> = {
  active: 'نشط',
  archived: 'مؤرشف',
  unverified: 'لم يُتحقق منه',
  unreachable: 'تعذّر التحقق',
};

export interface Resource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly category: string;
  readonly description: string;
  /** YYYY-MM-DD، أو null إن لم يُتحقق منه قط. */
  readonly lastVerified: string | null;
  readonly status: ResourceStatus;
  /** آخر دفع إلى المستودع (YYYY-MM-DD) عند آخر فحص GitHub. */
  readonly lastPush?: string | null;
  readonly license?: string | null;
  /** كيف تُحقق منه: يظهر للمستخدم لتوثيق المصدر. */
  readonly source: string;
  readonly origin: 'builtin' | 'user';
  /** رابط جديد اقترحه الفحص حين نُقل المستودع أو أُعيدت تسميته؛ لا يُطبَّق دون تأكيد. */
  readonly movedTo?: string | null;
  readonly note?: string | null;
}

export interface Category {
  readonly id: string;
  readonly title: string;
}

export interface ReviewInfo {
  readonly status: string;
  readonly date: string;
  readonly method: string;
  readonly note: string;
}

export interface ResourceFile {
  readonly format: typeof RESOURCE_FORMAT;
  readonly schemaVersion: typeof RESOURCE_SCHEMA_VERSION;
  readonly categories: readonly Category[];
  readonly resources: readonly Resource[];
  readonly review?: ReviewInfo;
  readonly exportedAt?: string;
}

export const MAX_TITLE = 160;
export const MAX_DESCRIPTION = 600;
export const MAX_URL = 500;
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isString = (v: unknown, max: number): v is string => typeof v === 'string' && v.trim() !== '' && v.length <= max;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** رابط https بلا بيانات اعتماد. يعيد null إن كان سليمًا، وإلا سبب الرفض. */
export function urlProblem(value: string): string | null {
  if (value.length > MAX_URL) return 'الرابط أطول من الحد.';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'الرابط غير صالح.';
  }
  if (url.protocol !== 'https:') return 'يُقبل رابط https فقط.';
  if (url.username || url.password) return 'الرابط يحمل بيانات اعتماد.';
  return null;
}

/** مستودع على github.com بالضبط (owner/repo)، أو null. الروابط الخارجية والمستخدمون والمنظمات والصفحات الأخرى لا تُفحص آليًا. */
export function githubRepoOf(url: string): { owner: string; repo: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return null;
    const route = classifyPath(parsed.pathname);
    return route.owner && route.repo ? { owner: route.owner, repo: route.repo } : null;
  } catch {
    return null;
  }
}

/** أخطاء التحقق من مورد (فارغة = سليم). */
export function resourceProblems(value: unknown): string[] {
  if (!isObject(value)) return ['العنصر ليس كائنًا.'];
  const problems: string[] = [];
  if (typeof value.id !== 'string' || !ID_PATTERN.test(value.id)) problems.push('معرّف غير صالح (أحرف إنجليزية صغيرة وأرقام وشرطات).');
  if (!isString(value.title, MAX_TITLE)) problems.push('عنوان فارغ أو أطول من الحد.');
  if (typeof value.url !== 'string') problems.push('الرابط مفقود.');
  else {
    const problem = urlProblem(value.url);
    if (problem) problems.push(problem);
  }
  if (!isString(value.category, 40)) problems.push('تصنيف فارغ.');
  if (typeof value.description !== 'string' || value.description.length > MAX_DESCRIPTION) problems.push('وصف غير صالح.');
  if (!(value.lastVerified === null || isIsoDate(value.lastVerified))) problems.push('تاريخ آخر تحقق غير صالح (YYYY-MM-DD أو null).');
  if (!(RESOURCE_STATUSES as readonly unknown[]).includes(value.status)) problems.push('حالة غير معروفة.');
  if (value.lastVerified === null && value.status !== 'unverified' && value.status !== 'unreachable') problems.push('حالة محققة بلا تاريخ تحقق.');
  if (typeof value.source !== 'string') problems.push('مصدر التحقق مفقود.');
  if (value.origin !== 'builtin' && value.origin !== 'user') problems.push('أصل المورد غير معروف.');
  for (const key of ['lastPush', 'movedTo', 'note', 'license'] as const) {
    const v = value[key];
    if (v !== undefined && v !== null && typeof v !== 'string') problems.push(`الحقل ${key} غير صالح.`);
  }
  if (typeof value.lastPush === 'string' && !isIsoDate(value.lastPush)) problems.push('تاريخ آخر دفع غير صالح.');
  if (typeof value.movedTo === 'string' && urlProblem(value.movedTo)) problems.push('رابط النقل غير صالح.');
  return problems;
}

export const isResource = (value: unknown): value is Resource => resourceProblems(value).length === 0;

export type ParsedFile = { readonly ok: true; readonly file: ResourceFile; readonly invalid: ReadonlyArray<{ readonly index: number; readonly id: string | null; readonly problems: readonly string[] }> } | { readonly ok: false; readonly error: string };

/** يفحص ملف استيراد (نصًّا أو كائنًا). ملف تالف بنيويًا يُرفض كله؛ وعناصر غير صالحة تُعزل مع أسبابها ولا تدخل. */
export function parseResourceFile(input: unknown): ParsedFile {
  let data: unknown = input;
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input);
    } catch {
      return { ok: false, error: 'الملف ليس JSON صالحًا.' };
    }
  }
  if (!isObject(data)) return { ok: false, error: 'محتوى الملف ليس كائنًا.' };
  if (data.format !== RESOURCE_FORMAT) return { ok: false, error: `صيغة الملف غير معروفة (المتوقع ${RESOURCE_FORMAT}).` };
  if (!Number.isInteger(data.schemaVersion) || (data.schemaVersion as number) < 1) return { ok: false, error: 'إصدار المخطط غير صالح.' };
  if ((data.schemaVersion as number) > RESOURCE_SCHEMA_VERSION) return { ok: false, error: `الملف بإصدار مخطط أحدث (${String(data.schemaVersion)}) من المدعوم (${RESOURCE_SCHEMA_VERSION}); حدّث الإضافة.` };
  if (!Array.isArray(data.resources)) return { ok: false, error: 'قائمة الموارد مفقودة.' };
  const categories = Array.isArray(data.categories) ? data.categories.filter((c): c is Category => isObject(c) && isString(c.id, 40) && isString(c.title, 120)) : [];
  const resources: Resource[] = [];
  const invalid: Array<{ index: number; id: string | null; problems: string[] }> = [];
  const seen = new Set<string>();
  data.resources.forEach((item, index) => {
    const problems = resourceProblems(item);
    const id = isObject(item) && typeof item.id === 'string' ? item.id : null;
    if (!problems.length && id && seen.has(id)) problems.push('معرّف مكرر داخل الملف.');
    if (problems.length) invalid.push({ index, id, problems });
    else {
      seen.add(id as string);
      resources.push(item as Resource);
    }
  });
  const review = isObject(data.review) && typeof data.review.status === 'string' ? (data.review as unknown as ReviewInfo) : undefined;
  return { ok: true, file: { format: RESOURCE_FORMAT, schemaVersion: RESOURCE_SCHEMA_VERSION, categories, resources, ...(review ? { review } : {}) }, invalid };
}

export interface ResourceDraft {
  readonly title: string;
  readonly url: string;
  readonly category: string;
  readonly description: string;
}

export function draftProblems(draft: ResourceDraft): string[] {
  const problems: string[] = [];
  if (!isString(draft.title, MAX_TITLE)) problems.push('اكتب عنوانًا (حتى 160 حرفًا).');
  const url = urlProblem(draft.url.trim());
  if (url) problems.push(url);
  if (!isString(draft.category, 40)) problems.push('اختر تصنيفًا.');
  if (draft.description.length > MAX_DESCRIPTION) problems.push('الوصف أطول من الحد.');
  return problems;
}

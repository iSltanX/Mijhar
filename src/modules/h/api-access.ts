// الوصول إلى api.github.com للوحدة (ح) عبر طبقة API العامة في الخلفية (AD-24): القراءة تُرسل برسالة إلى الخلفية التي تملك PublicApiClient
// الوحيد وحالته (حد الطلبات وRetry-After وETag) وتتحقق من الصلاحية قبل كل طلب، فلا عميل ثانٍ في صفحة الإضافة ولا مسار موازٍ. الرسالة تحمل
// المسار وحده؛ فلا ترويسة ولا رمز يعبر إلى الصفحة، وأي رمز وصول مستقبلي (T-5.5) يبقى في الخلفية.
// ولا يصدر طلب بلا نقر صريح من المستخدم (يضمنه المستدعي: لا استدعاء إلا من معالج نقر). وطلب الصلاحية الاختيارية يبقى في الصفحة لأنه
// فعل مستخدم لا تقبله إلا صفحة إضافة. واجهة الصلاحيات (permissions) متاحة في صفحات الإضافة (اللوحة الأصلية والإعدادات) لا في سكربت
// المحتوى ولا الدرج المحقون فيه؛ فهناك available = false ولا يُرسل شيء، وتُعرض إرشادات فتح اللوحة. (جلب من github.com نفسه لا يحتاج هذه
// الصلاحية، وهو مسار آخر في sources.ts.)
import { runtimePort } from '../../core/api/port';
import type { PublicApiPort } from '../../core/api/port';
import type { PublicApiFailure, PublicApiResult } from '../../core/api/client';
import { extensionApi } from '../../core/ui-host/browser-api';
import type { ExtensionApi } from '../../core/ui-host/browser-api';
import { ApiGithubPermission } from '../../core/ui-host/permissions';

export interface GithubApiAccess {
  readonly available: boolean;
  has(): Promise<boolean>;
  /** يُستدعى متزامنًا من معالج نقر (المتصفح يرفض الطلب خارج فعل المستخدم). */
  request(): Promise<boolean>;
  /**
   * قراءة GET بمسار عام (isPublicPath) من طبقة الخلفية؛ تعيد نتيجتها المصنَّفة ولا ترمي لفشل الشبكة أو الصلاحية أو الحد.
   * ترمي ApiUnavailableHereError حيث لا واجهة صلاحيات (الصفحة والدرج).
   */
  get<T>(path: string): Promise<PublicApiResult<T>>;
  subscribe(listener: (granted: boolean) => void): () => void;
}

export class ApiUnavailableHereError extends Error {
  readonly code = 'api-unavailable-here';
  constructor() {
    super('الوصول إلى GitHub API غير متاح في هذا السياق؛ افتح لوحة مِجهَر الجانبية أو صفحة الإعدادات');
    this.name = 'ApiUnavailableHereError';
  }
}

export const UNAVAILABLE_ACCESS: GithubApiAccess = {
  available: false,
  has: async () => false,
  request: async () => false,
  get: async () => {
    throw new ApiUnavailableHereError();
  },
  subscribe: () => () => {},
};

/** port: منفذ الخلفية (للاختبار). الافتراضي منفذ الرسائل runtimePort إلى الخلفية. */
export function githubApiAccess(api?: ExtensionApi | null, port?: PublicApiPort): GithubApiAccess {
  let resolved: ExtensionApi | null | undefined = api;
  if (resolved === undefined) {
    try {
      resolved = extensionApi();
    } catch {
      resolved = null;
    }
  }
  const permissions = resolved?.permissions;
  if (!resolved || !permissions) return UNAVAILABLE_ACCESS;
  const permission = new ApiGithubPermission(permissions);
  const background = port ?? runtimePort(resolved.runtime);
  return {
    available: true,
    has: () => permission.has(),
    request: () => permission.request(),
    get: (path) => background.get(path),
    subscribe: (listener) => permission.subscribe(listener),
  };
}

export type ApiFailure = 'permission' | 'unavailable' | 'rate-limit' | 'not-found' | 'http' | 'network';

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T; readonly status: number }
  /** retryAt: متى يجوز إعادة المحاولة (ms) حين تعلنه الطبقة (Retry-After أو تجدد الحد). */
  | { readonly ok: false; readonly reason: ApiFailure; readonly status?: number; readonly retryAt?: number };

const REASON: Readonly<Record<PublicApiFailure, ApiFailure>> = {
  permission: 'permission',
  'rate-limit': 'rate-limit',
  'not-found': 'not-found',
  forbidden: 'http',
  http: 'http',
  network: 'network',
  'invalid-path': 'http',
};

/** يقرأ JSON عبر طبقة الخلفية ويصنّف الفشل: لا استثناء يتسرب إلى الواجهة. */
export async function apiJson<T>(access: GithubApiAccess, path: string): Promise<ApiResult<T>> {
  let result: PublicApiResult<T>;
  try {
    result = await access.get<T>(path);
  } catch (error) {
    return { ok: false, reason: error instanceof ApiUnavailableHereError ? 'unavailable' : 'network' };
  }
  if (result.ok) return { ok: true, data: result.data, status: result.status };
  return { ok: false, reason: REASON[result.failure], ...(result.status === null ? {} : { status: result.status }), ...(result.retryAt === null ? {} : { retryAt: result.retryAt }) };
}

/** صياغة موحدة لأسباب فشل الفحص: كلها تعلن أن الفحص لم يكتمل ولا تجزم بغياب شيء. */
export const FAILURE_TEXT: Readonly<Record<ApiFailure, string>> = {
  permission: 'لم تُمنح صلاحية GitHub API الاختيارية؛ الفحص لم يكتمل.',
  unavailable: 'يتطلب الفحص صلاحية GitHub API الاختيارية ويُجرى من لوحة مِجهَر الجانبية أو صفحة الإعدادات؛ الفحص لم يكتمل.',
  'rate-limit': 'بلغ GitHub حد الطلبات المسموح (أو طلب الانتظار)؛ الفحص لم يكتمل. أعد المحاولة لاحقًا.',
  'not-found': 'تعذّر الوصول إلى المسار المطلوب (404)؛ قد يعود ذلك إلى مستودع خاص أو إلى غياب المجلد في الفرع الافتراضي، ولا يمكن التمييز بينهما. الفحص لم يكتمل.',
  http: 'ردّ GitHub بخطأ؛ الفحص لم يكتمل.',
  network: 'تعذّر الاتصال بـGitHub؛ الفحص لم يكتمل.',
};

/** نص سبب الفشل؛ ومع موعد إعادة معلن (Retry-After أو تجدد الحد) يذكر الساعة بدل «لاحقًا». */
export function failureText(reason: ApiFailure, retryAt?: number): string {
  if (reason !== 'rate-limit' || retryAt === undefined) return FAILURE_TEXT[reason];
  const at = new Date(retryAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `بلغ GitHub حد الطلبات المسموح (أو طلب الانتظار)؛ الفحص لم يكتمل. أعد المحاولة بعد ${at}.`;
}

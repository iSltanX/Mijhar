// الوصول إلى api.github.com للوحدة (ح): كل طلب يمر بـfetchApiGithub (البوابة الوحيدة، T-1.4) بعد التحقق من الصلاحية الاختيارية،
// ولا يصدر طلب بلا نقر صريح من المستخدم (يضمنه المستدعي: لا استدعاء إلا من معالج نقر).
// واجهة الصلاحيات (permissions) متاحة في صفحات الإضافة (اللوحة الأصلية والإعدادات) لا في سكربت المحتوى ولا الدرج المحقون فيه؛ فهناك
// available = false ولا يُرسل شيء، وتُعرض إرشادات فتح اللوحة. (جلب من github.com نفسه لا يحتاج هذه الصلاحية، وهو مسار آخر في sources.ts.)
import { extensionApi } from '../../core/ui-host/browser-api';
import type { ExtensionApi } from '../../core/ui-host/browser-api';
import { ApiGithubPermission, PermissionNotGrantedError, fetchApiGithub } from '../../core/ui-host/permissions';

export interface GithubApiAccess {
  readonly available: boolean;
  has(): Promise<boolean>;
  /** يُستدعى متزامنًا من معالج نقر (المتصفح يرفض الطلب خارج فعل المستخدم). */
  request(): Promise<boolean>;
  /** يرمي PermissionNotGrantedError دون إرسال شيء إن لم تُمنح الصلاحية. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
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
  fetch: async () => {
    throw new ApiUnavailableHereError();
  },
  subscribe: () => () => {},
};

export function githubApiAccess(api?: ExtensionApi | null, fetchImpl?: typeof fetch): GithubApiAccess {
  let resolved: ExtensionApi | null | undefined = api;
  if (resolved === undefined) {
    try {
      resolved = extensionApi();
    } catch {
      resolved = null;
    }
  }
  const permissions = resolved?.permissions;
  if (!permissions) return UNAVAILABLE_ACCESS;
  const permission = new ApiGithubPermission(permissions);
  return {
    available: true,
    has: () => permission.has(),
    request: () => permission.request(),
    fetch: (path, init) => fetchApiGithub(path, init, { permissions, ...(fetchImpl ? { fetch: fetchImpl } : {}) }),
    subscribe: (listener) => permission.subscribe(listener),
  };
}

export type ApiFailure = 'permission' | 'unavailable' | 'rate-limit' | 'not-found' | 'http' | 'network';

export type ApiResult<T> = { readonly ok: true; readonly data: T; readonly status: number } | { readonly ok: false; readonly reason: ApiFailure; readonly status?: number };

/** يقرأ JSON من api.github.com ويصنّف الفشل: لا استثناء يتسرب إلى الواجهة. */
export async function apiJson<T>(access: GithubApiAccess, path: string): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await access.fetch(path, { headers: { Accept: 'application/vnd.github+json' } });
  } catch (error) {
    if (error instanceof PermissionNotGrantedError) return { ok: false, reason: 'permission' };
    if (error instanceof ApiUnavailableHereError) return { ok: false, reason: 'unavailable' };
    return { ok: false, reason: 'network' };
  }
  const { status } = response;
  if (status === 404) return { ok: false, reason: 'not-found', status };
  if (status === 429 || (status === 403 && response.headers.get('x-ratelimit-remaining') === '0')) return { ok: false, reason: 'rate-limit', status };
  if (!response.ok) return { ok: false, reason: 'http', status };
  try {
    return { ok: true, data: (await response.json()) as T, status };
  } catch {
    return { ok: false, reason: 'http', status };
  }
}

/** صياغة موحدة لأسباب فشل الفحص: كلها تعلن أن الفحص لم يكتمل ولا تجزم بغياب شيء. */
export const FAILURE_TEXT: Readonly<Record<ApiFailure, string>> = {
  permission: 'لم تُمنح صلاحية GitHub API الاختيارية؛ الفحص لم يكتمل.',
  unavailable: 'يتطلب الفحص صلاحية GitHub API الاختيارية ويُجرى من لوحة مِجهَر الجانبية أو صفحة الإعدادات؛ الفحص لم يكتمل.',
  'rate-limit': 'بلغ GitHub حد الطلبات المسموح؛ الفحص لم يكتمل. أعد المحاولة بعد دقيقة.',
  'not-found': 'تعذّر الوصول إلى المسار المطلوب (404)؛ قد يعود ذلك إلى مستودع خاص أو إلى غياب المجلد في الفرع الافتراضي، ولا يمكن التمييز بينهما. الفحص لم يكتمل.',
  http: 'ردّ GitHub بخطأ؛ الفحص لم يكتمل.',
  network: 'تعذّر الاتصال بـGitHub؛ الفحص لم يكتمل.',
};

// منفذ الطبقة العامة لسكربت المحتوى: سكربت المحتوى لا يملك واجهة permissions ولا يطلب api.github.com بنفسه، فيرسل رسالة إلى
// الخلفية التي تملك PublicApiClient وتتحقق من الصلاحية قبل كل طلب (EXECUTION_PLAN.md: «من الخلفية»). وصفحات الإضافة تستعمل
// المنفذ المباشر على العميل نفسه.
//  - الرسائل من سياقات الإضافة وحدها (لا externally_connectable)، والمسارات تُفحص في العميل (isPublicPath).
import { API_GITHUB_PERMISSION } from '../ui-host/permissions';
import type { ExtensionApi, PermissionsApi } from '../ui-host/browser-api';
import type { PagedResult, PublicApiClient, PublicApiResult } from './client';
import type { RateLimit } from './rate-limit';

export const PUBLIC_API_MESSAGE = 'mijhar/public-api';

/** حقول القوائم المغلّفة التي يعرف المنفذ استخراجها (لا دوال تعبر الرسائل). */
export type PagedKey = 'check_runs' | 'statuses' | null;

export type PublicApiRequest =
  | { readonly type: typeof PUBLIC_API_MESSAGE; readonly op: 'status' }
  | { readonly type: typeof PUBLIC_API_MESSAGE; readonly op: 'get'; readonly path: string }
  | { readonly type: typeof PUBLIC_API_MESSAGE; readonly op: 'get-all'; readonly path: string; readonly key: PagedKey; readonly maxPages: number };

export interface PublicApiStatus {
  /** هل صلاحية api.github.com الاختيارية ممنوحة الآن. */
  readonly granted: boolean;
  readonly rate: RateLimit | null;
}

export interface PublicApiPort {
  status(): Promise<PublicApiStatus>;
  get<T>(path: string): Promise<PublicApiResult<T>>;
  getAll<T>(path: string, key: PagedKey, maxPages?: number): Promise<PublicApiResult<PagedResult<T>>>;
}

export function isPublicApiRequest(message: unknown): message is PublicApiRequest {
  if (typeof message !== 'object' || message === null) return false;
  const m = message as { type?: unknown; op?: unknown; path?: unknown };
  if (m.type !== PUBLIC_API_MESSAGE) return false;
  if (m.op === 'status') return true;
  return (m.op === 'get' || m.op === 'get-all') && typeof m.path === 'string';
}

/** يستخرج عناصر صفحة من جسمها: مصفوفة مباشرة أو حقل key، وtotal_count إن وُجد. */
export function pickPage<T>(body: unknown, key: PagedKey): { items: readonly T[]; total: number | null } {
  if (Array.isArray(body)) return { items: body as T[], total: null };
  const record = (body ?? {}) as Record<string, unknown>;
  const items = key && Array.isArray(record[key]) ? (record[key] as T[]) : [];
  return { items, total: typeof record.total_count === 'number' ? record.total_count : null };
}

/** المنفذ المباشر: في الخلفية وصفحات الإضافة حيث permissions متاحة. */
export function directPort(client: PublicApiClient, permissions: PermissionsApi): PublicApiPort {
  return {
    status: async () => ({ granted: await permissions.contains(API_GITHUB_PERMISSION), rate: client.rate() }),
    get: (path) => client.get(path),
    getAll: (path, key, maxPages = 3) => client.getAll(path, (body) => pickPage(body, key), maxPages),
  };
}

/** يعالج رسالة المنفذ في الخلفية. لا يرمي: الفشل نتيجة مصنَّفة. */
export async function handlePublicApiRequest(request: PublicApiRequest, port: PublicApiPort): Promise<PublicApiStatus | PublicApiResult<unknown>> {
  if (request.op === 'status') return port.status();
  if (request.op === 'get') return port.get(request.path);
  return port.getAll(request.path, request.key, Math.min(Math.max(1, request.maxPages), 10));
}

/** منفذ سكربت المحتوى: يرسل إلى الخلفية. فشل الرسالة نفسه (خلفية غير متاحة) يُعاد فشلًا مصنَّفًا. */
export function runtimePort(runtime: Pick<ExtensionApi['runtime'], 'sendMessage'>, now: () => number = () => Date.now()): PublicApiPort {
  const send = async <R>(request: PublicApiRequest, fallback: (message: string) => R): Promise<R> => {
    try {
      const response = await runtime.sendMessage(request);
      return (response ?? fallback('لم تردّ الخلفية')) as R;
    } catch (error) {
      return fallback(error instanceof Error ? error.message : String(error));
    }
  };
  const failure = <T>(message: string): PublicApiResult<T> => ({ ok: false, failure: 'network', status: null, message: `تعذّر الوصول إلى خلفية الإضافة: ${message}`, retryAt: null, readAt: now(), rate: null });
  return {
    status: () => send<PublicApiStatus>({ type: PUBLIC_API_MESSAGE, op: 'status' }, () => ({ granted: false, rate: null })),
    get: <T>(path: string) => send<PublicApiResult<T>>({ type: PUBLIC_API_MESSAGE, op: 'get', path }, failure),
    getAll: <T>(path: string, key: PagedKey, maxPages = 3) => send<PublicApiResult<PagedResult<T>>>({ type: PUBLIC_API_MESSAGE, op: 'get-all', path, key, maxPages }, failure),
  };
}

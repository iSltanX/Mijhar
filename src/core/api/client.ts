// طبقة طلبات GitHub REST العامة بلا مصادقة (T-5.2). تعمل في الخلفية وفي صفحات الإضافة، وكل طلب يمر بـfetchApiGithub (البوابة الوحيدة
// إلى api.github.com، T-1.4) فلا يخرج طلب دون الصلاحية الاختيارية الممنوحة بنقر صريح.
//  - GET وحده، ولمسارات /repos/… و/rate_limit وحدها؛ ولا ترويسة Authorization أبدًا (الطلبات الموثَّقة طبقة أخرى في T-5.5).
//  - ترويسات x-ratelimit-* تُقرأ من كل استجابة؛ وعند النفاد لا يُرسل شيء حتى reset (لا طلب يُهدر ولا يُفترض رقم)، وبعد رفض بموعد
//    إعادة (retry-after) لا يُرسل شيء قبله من أي مستهلك للعميل (VR-07).
//  - طلبات شرطية بـETag (If-None-Match) تقلل النقل؛ وهي تُحتسب من الحد الأساسي للطلبات العامة (VER-12، ومقيس في T-0.3)، فلا يُدّعى
//    أنها توفّر الحد.
//  - الفشل نتيجة مصنَّفة بسببها لا استثناء يتسرب، ولا يُعرض فشلٌ نجاحًا.
import { PermissionNotGrantedError, fetchApiGithub } from '../ui-host/permissions';
import type { PermissionsApi } from '../ui-host/browser-api';
import { RateLimitTracker, readRateLimit } from './rate-limit';
import type { RateLimit } from './rate-limit';

export const API_VERSION = '2022-11-28';

export type PublicApiFailure = 'permission' | 'rate-limit' | 'not-found' | 'forbidden' | 'http' | 'network' | 'invalid-path';

export interface PublicApiSuccess<T> {
  readonly ok: true;
  readonly status: number;
  readonly data: T;
  /** أُعيدت من النسخة المحفوظة بعد 304 (لم يتغير المورد منذ آخر قراءة). */
  readonly fromCache: boolean;
  readonly readAt: number;
  readonly rate: RateLimit | null;
}

export interface PublicApiError {
  readonly ok: false;
  readonly failure: PublicApiFailure;
  readonly status: number | null;
  readonly message: string;
  /** متى يجوز إعادة المحاولة (ms) حين يُعرف من الترويسات. */
  readonly retryAt: number | null;
  readonly readAt: number;
  readonly rate: RateLimit | null;
}

export type PublicApiResult<T> = PublicApiSuccess<T> | PublicApiError;

export interface PagedResult<T> {
  readonly items: readonly T[];
  /** total_count إن أعلنته الاستجابة. */
  readonly total: number | null;
  /** لم تُقرأ كل الصفحات (بلغ الحد الأقصى للصفحات أو total أكبر مما قُرئ). */
  readonly partial: boolean;
  readonly pages: number;
}

export interface PublicApiClientOptions {
  readonly permissions: PermissionsApi;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** عدد الموارد المحفوظة بـETag. الافتراضي 200. */
  readonly cacheSize?: number;
}

const PATH = /^\/(?:repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.%~@:+-]+)*|rate_limit)(?:\?[A-Za-z0-9_.%=&,:-]*)?$/;

/** هل المسار مما تقبله الطبقة العامة: /repos/<owner>/<repo>/… أو /rate_limit، بلا أصل ولا مقاطع «..». */
export const isPublicPath = (path: string): boolean => PATH.test(path) && !path.split(/[/?]/).includes('..');

interface Cached {
  readonly etag: string;
  readonly data: unknown;
}

export class PublicApiClient {
  private readonly tracker = new RateLimitTracker();
  private readonly cache = new Map<string, Cached>();
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly now: () => number;
  private readonly cacheSize: number;

  constructor(private readonly options: PublicApiClientOptions) {
    this.fetchImpl = options.fetch;
    this.now = options.now ?? (() => Date.now());
    this.cacheSize = options.cacheSize ?? 200;
  }

  /** آخر حدّ معلن للمورد core، أو null قبل أول استجابة. */
  rate(): RateLimit | null {
    return this.tracker.snapshot('core');
  }

  async get<T>(path: string, signal?: AbortSignal): Promise<PublicApiResult<T>> {
    const now = this.now();
    const fail = (failure: PublicApiFailure, message: string, status: number | null = null, retryAt: number | null = null): PublicApiError => ({
      ok: false,
      failure,
      status,
      message,
      retryAt,
      readAt: this.now(),
      rate: this.rate(),
    });
    if (!isPublicPath(path)) return fail('invalid-path', `مسار غير مقبول في الطبقة العامة: ${path}`);
    const blocked = path === '/rate_limit' ? null : this.tracker.blockedUntil('core', now);
    if (blocked !== null) return fail('rate-limit', 'بلغ حد الطلبات العامة؛ لم يُرسل الطلب', 403, blocked);

    const cached = this.cache.get(path);
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION };
    if (cached) headers['If-None-Match'] = cached.etag;
    let response: Response;
    try {
      response = await fetchApiGithub(path, { method: 'GET', headers, credentials: 'omit', ...(signal ? { signal } : {}) }, { permissions: this.options.permissions, ...(this.fetchImpl ? { fetch: this.fetchImpl } : {}) });
    } catch (error) {
      if (error instanceof PermissionNotGrantedError) return fail('permission', error.message);
      return fail('network', error instanceof Error ? error.message : String(error));
    }
    const readAt = this.now();
    const rate = readRateLimit(response.headers, readAt);
    this.tracker.update(rate);
    const { status } = response;

    if (status === 304 && cached) {
      this.touch(path, cached);
      return { ok: true, status, data: cached.data as T, fromCache: true, readAt, rate };
    }
    if (status === 404) return fail('not-found', 'المورد غير موجود أو غير عام (404)', status);
    if (status === 429 || (status === 403 && rate?.remaining === 0)) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const retryAt = Number.isFinite(retryAfter) && retryAfter > 0 ? readAt + retryAfter * 1000 : rate?.reset ? rate.reset * 1000 : null;
      if (retryAt !== null) this.tracker.cooldown('core', retryAt);
      return fail('rate-limit', await messageOf(response, 'بلغ حد الطلبات'), status, retryAt);
    }
    if (status === 403) return fail('forbidden', await messageOf(response, 'رفض GitHub الطلب (403)'), status);
    if (!response.ok) return fail('http', await messageOf(response, `HTTP ${status}`), status);
    let data: T;
    try {
      data = (await response.json()) as T;
    } catch {
      return fail('http', 'استجابة ليست JSON', status);
    }
    const etag = response.headers.get('etag');
    if (etag) this.touch(path, { etag, data });
    return { ok: true, status, data, fromCache: false, readAt, rate };
  }

  /**
   * يقرأ قائمة مقسمة على صفحات (per_page=100) حتى maxPages. pick يستخرج العناصر من جسم الصفحة (مصفوفة مباشرة أو حقلًا فيها مثل
   * check_runs)، وtotal_count إن وُجد. أي فشل في صفحة يُعاد كما هو؛ والنجاح يعلن إن كانت القائمة جزئية.
   */
  async getAll<T>(path: string, pick: (body: unknown) => { items: readonly T[]; total: number | null }, maxPages = 3, signal?: AbortSignal): Promise<PublicApiResult<PagedResult<T>>> {
    const items: T[] = [];
    let total: number | null = null;
    let last: PublicApiSuccess<unknown> | null = null;
    const sep = path.includes('?') ? '&' : '?';
    let page = 1;
    for (; page <= maxPages; page += 1) {
      const result = await this.get<unknown>(`${path}${sep}per_page=100&page=${page}`, signal);
      if (!result.ok) return result;
      last = result;
      const picked = pick(result.data);
      total ??= picked.total;
      items.push(...picked.items);
      if (picked.items.length < 100 || (total !== null && items.length >= total)) break;
    }
    const pages = Math.min(page, maxPages);
    const partial = total !== null ? items.length < total : page > maxPages;
    return { ok: true, status: last?.status ?? 200, data: { items, total, partial, pages }, fromCache: false, readAt: last?.readAt ?? this.now(), rate: this.rate() };
  }

  private touch(path: string, entry: Cached): void {
    this.cache.delete(path);
    this.cache.set(path, entry);
    while (this.cache.size > this.cacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}

async function messageOf(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message ? body.message : fallback;
  } catch {
    return fallback;
  }
}

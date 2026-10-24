// طبقة طلبات GitHub REST (T-5.2) ومعها الطلبات الموثَّقة الاختيارية (T-5.5). تعمل في الخلفية وفي صفحات الإضافة، وكل طلب يمر بـfetchApiGithub
// (البوابة الوحيدة إلى api.github.com، T-1.4) فلا يخرج طلب دون الصلاحية الاختيارية الممنوحة بنقر صريح.
//  - GET وحده، ولمسارات /repos/… و/rate_limit وبحث المشكلات المحصور بمستودع واحد (/search/issues?q=repo:…) وحدها.
//  - الرمز (T-5.5، AD-24): مصدره token في خيارات العميل، ولا يُمرَّر إلا لعميل الخلفية؛ ترويسة Authorization يضيفها العميل هنا وحده، ولا يعود
//    الرمز في نتيجة ولا رسالة خطأ. وللموثَّق متعقّب حد وذاكرة ETag منفصلان عن العام، وتُفرَّغ ذاكرته بتغيّر الرمز أو مسحه (فلا تُخدم نسخة
//    مستودع خاص لقراءة بلا رمز)؛ ورفض الرمز (401) فشل معلن لا رجوع صامت إلى الوصول المجهول (evidence/T-0.5).
//  - ترويسات x-ratelimit-* تُقرأ من كل استجابة؛ وعند النفاد لا يُرسل شيء حتى reset (لا طلب يُهدر ولا يُفترض رقم)، وبعد رفض بموعد
//    إعادة (retry-after) لا يُرسل شيء قبله من أي مستهلك للعميل (VR-07). والحد لكل مورد: core للمسارات، وsearch للبحث (حد مستقل).
//  - طلبات شرطية بـETag (If-None-Match) تقلل النقل؛ وهي تُحتسب من الحد الأساسي للطلبات العامة (VER-12، ومقيس في T-0.3)، فلا يُدّعى
//    أنها توفّر الحد.
//  - الفشل نتيجة مصنَّفة بسببها لا استثناء يتسرب، ولا يُعرض فشلٌ نجاحًا.
import { PermissionNotGrantedError, fetchApiGithub } from '../ui-host/permissions';
import type { PermissionsApi } from '../ui-host/browser-api';
import { RateLimitTracker, readRateLimit } from './rate-limit';
import type { RateLimit } from './rate-limit';

export const API_VERSION = '2022-11-28';

/** unauthorized: رفض GitHub الرمز المحفوظ (401)؛ token: تعذّرت قراءة الرمز المحفوظ نفسه. */
export type PublicApiFailure = 'permission' | 'rate-limit' | 'not-found' | 'forbidden' | 'unauthorized' | 'token' | 'http' | 'network' | 'invalid-path';

export interface PublicApiSuccess<T> {
  readonly ok: true;
  readonly status: number;
  readonly data: T;
  /** أُعيدت من النسخة المحفوظة بعد 304 (لم يتغير المورد منذ آخر قراءة). */
  readonly fromCache: boolean;
  readonly readAt: number;
  readonly rate: RateLimit | null;
  /** حاضر حين أُرسل الطلب بالرمز (لا يحمل الرمز نفسه). */
  readonly authenticated?: true;
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
  readonly authenticated?: true;
  /** MJ18 (T-11.1، T-11.5): ترويسة x-accepted-github-permissions في رفض 403 بالرمز (الصلاحية التي تقبلها النقطة)، كما هي. */
  readonly accepted?: string;
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

/** مصدر الرمز المحفوظ (T-5.5): في الخلفية وحدها. null = لا رمز؛ والرمي = تعذّرت قراءته (فشل معلن، لا وصول مجهول). */
export type TokenSource = () => Promise<string | null>;

/** حالة الوصول الموثَّق كما تُعرض خارج الخلفية: بلا الرمز نفسه. */
export interface AuthState {
  readonly authenticated: boolean;
  /** موعد انتهاء الرمز (ms) من ترويسة github-authentication-token-expiration في آخر استجابة موثَّقة، إن عُلم. */
  readonly expiresAt: number | null;
}

export interface PublicApiClientOptions {
  readonly permissions: PermissionsApi;
  /** الرمز الاختياري. يُمرَّر لعميل الخلفية وحده. */
  readonly token?: TokenSource;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** عدد الموارد المحفوظة بـETag. الافتراضي 200. */
  readonly cacheSize?: number;
}

const PATH = /^\/(?:repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.%~@:+-]+)*|rate_limit)(?:\?[A-Za-z0-9_.%=&,:-]*)?$/;
// بحث المشكلات المحصور بمستودع واحد وحده (أعداد وسوم المبتدئين في الوحدة (ح)): q يبدأ بـrepo:<owner>/<repo> مرمَّزًا، وبعده عبارات البحث، ثم per_page.
const SEARCH_PATH = /^\/search\/issues\?q=repo%3A[A-Za-z0-9_.-]+%2F[A-Za-z0-9_.-]+(?:%20[A-Za-z0-9_.%-]+)*(?:&per_page=\d{1,3})?$/;

/** هل المسار مما تقبله الطبقة العامة: /repos/<owner>/<repo>/… أو /rate_limit أو بحث مشكلات مستودع واحد، بلا أصل ولا مقاطع «..». */
export const isPublicPath = (path: string): boolean => (PATH.test(path) || SEARCH_PATH.test(path)) && !path.split(/[/?]/).includes('..');

/** مورد الحد الذي يُحتسب عليه المسار (x-ratelimit-resource): البحث مستقل عن core. */
const resourceOf = (path: string): string => (path.startsWith('/search/') ? 'search' : 'core');

interface Cached {
  readonly etag: string;
  readonly data: unknown;
}

type Mode = 'public' | 'token';

/** يحذف الرمز من نص (رسالة خطأ أو ردّ) إن ظهر فيه، احتياطًا: لا يُعرض الرمز في رسالة ولا سجل (AC-5.5 ‏(٣)). */
export function redactToken(text: string, token: string | null): string {
  return token && token.length >= 8 ? text.split(token).join('‹الرمز›') : text;
}

/** موعد انتهاء الرمز كما تعلنه الترويسة («2026-10-30 14:25:10 UTC»)، أو null. */
export function readTokenExpiry(headers: Pick<Headers, 'get'>): number | null {
  const raw = headers.get('github-authentication-token-expiration')?.trim();
  if (!raw) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/.test(raw) ? `${raw.replace(' ', 'T').replace(' UTC', '')}Z` : raw;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export class PublicApiClient {
  private readonly trackers: Record<Mode, RateLimitTracker> = { public: new RateLimitTracker(), token: new RateLimitTracker() };
  private readonly caches: Record<Mode, Map<string, Cached>> = { public: new Map(), token: new Map() };
  /** آخر رمز استُعمل (في ذاكرة الخلفية وحدها) ليُكشف تغيّره أو مسحه فتُفرَّغ حالة الموثَّق. */
  private lastToken: string | null = null;
  private expiresAt: number | null = null;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly now: () => number;
  private readonly cacheSize: number;

  constructor(private readonly options: PublicApiClientOptions) {
    this.fetchImpl = options.fetch;
    this.now = options.now ?? (() => Date.now());
    this.cacheSize = options.cacheSize ?? 200;
  }

  private get mode(): Mode {
    return this.lastToken ? 'token' : 'public';
  }

  /** آخر حدّ معلن للمورد core في وضع الوصول الحالي (بالرمز أو بدونه)، أو null قبل أول استجابة. */
  rate(): RateLimit | null {
    return this.trackers[this.mode].snapshot('core');
  }

  /** هل يوجد رمز الآن وموعد انتهائه إن عُلم. لا يعيد الرمز. */
  async auth(): Promise<AuthState> {
    const token = await this.currentToken().catch(() => this.lastToken);
    return { authenticated: Boolean(token), expiresAt: token ? this.expiresAt : null };
  }

  /** يقرأ الرمز من مصدره؛ وتغيّره أو مسحه يفرّغ ذاكرة الموثَّق ومتعقّبه وموعد انتهائه. */
  private async currentToken(): Promise<string | null> {
    const token = this.options.token ? ((await this.options.token()) || null) : null;
    if (token !== this.lastToken) {
      this.caches.token.clear();
      this.trackers.token = new RateLimitTracker();
      this.expiresAt = null;
      this.lastToken = token;
    }
    return token;
  }

  async get<T>(path: string, signal?: AbortSignal): Promise<PublicApiResult<T>> {
    let token: string | null;
    let tokenError: string | null = null;
    try {
      token = await this.currentToken();
    } catch (error) {
      token = null;
      tokenError = error instanceof Error ? error.name : 'Error';
    }
    const mode: Mode = token ? 'token' : 'public';
    const tracker = this.trackers[mode];
    const cache = this.caches[mode];
    const auth = token ? ({ authenticated: true } as const) : {};
    const fail = (failure: PublicApiFailure, message: string, status: number | null = null, retryAt: number | null = null, accepted: string | null = null): PublicApiError => ({
      ok: false,
      failure,
      status,
      message: redactToken(message, token),
      retryAt,
      readAt: this.now(),
      rate: tracker.snapshot('core'),
      ...auth,
      ...(accepted ? { accepted } : {}),
    });
    // تعذّر قراءة الرمز المحفوظ لا يعني «لا رمز»: لا يُرسل طلب مجهول بدله.
    if (tokenError !== null) return { ok: false, failure: 'token', status: null, message: `تعذّرت قراءة رمز الوصول المحفوظ (${tokenError})؛ لم يُرسل الطلب`, retryAt: null, readAt: this.now(), rate: null };
    if (!isPublicPath(path)) return fail('invalid-path', `مسار غير مقبول في الطبقة العامة: ${path}`);
    const resource = resourceOf(path);
    const blocked = path === '/rate_limit' ? null : tracker.blockedUntil(resource, this.now());
    if (blocked !== null) return fail('rate-limit', token ? 'بلغ حد الطلبات الموثَّقة؛ لم يُرسل الطلب' : 'بلغ حد الطلبات العامة؛ لم يُرسل الطلب', 403, blocked);

    const cached = cache.get(path);
    const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cached) headers['If-None-Match'] = cached.etag;
    let response: Response;
    try {
      response = await fetchApiGithub(path, { method: 'GET', headers, credentials: 'omit', ...(signal ? { signal } : {}) }, { permissions: this.options.permissions, ...(this.fetchImpl ? { fetch: this.fetchImpl } : {}) });
    } catch (error) {
      if (error instanceof PermissionNotGrantedError) return fail('permission', error.message);
      return fail('network', error instanceof Error ? error.message : String(error));
    }
    // ردّ متأخر لرمز تغيّر أثناء الطلب لا يدخل ذاكرة الرمز الجديد ولا متعقّبه.
    const current = token === this.lastToken;
    const readAt = this.now();
    const rate = readRateLimit(response.headers, readAt);
    if (current) tracker.update(rate);
    const { status } = response;
    if (token && current) this.expiresAt = readTokenExpiry(response.headers) ?? this.expiresAt;

    if (status === 304 && cached) {
      if (current) this.touch(cache, path, cached);
      return { ok: true, status, data: cached.data as T, fromCache: true, readAt, rate, ...auth };
    }
    if (status === 401 && token) return fail('unauthorized', 'رفض GitHub رمز الوصول المحفوظ (401): غير صالح أو منتهٍ أو ملغى. بدّله أو امسحه من الإعدادات؛ ولم يُعَد الطلب بلا رمز', status);
    if (status === 404) return fail('not-found', token ? 'المورد غير موجود أو لا يشمله الرمز (404)' : 'المورد غير موجود أو غير عام (404)', status);
    if (status === 429 || (status === 403 && rate?.remaining === 0)) {
      const retryAfter = Number(response.headers.get('retry-after'));
      const retryAt = Number.isFinite(retryAfter) && retryAfter > 0 ? readAt + retryAfter * 1000 : rate?.reset ? rate.reset * 1000 : null;
      if (retryAt !== null && current) tracker.cooldown(resource, retryAt);
      return fail('rate-limit', await messageOf(response, 'بلغ حد الطلبات'), status, retryAt);
    }
    if (status === 403) {
      // نقص صلاحية لنقطة بعينها (evidence/T-0.5): الترويسة تسمّي الصلاحية المطلوبة.
      const needed = token ? response.headers.get('x-accepted-github-permissions')?.trim() : null;
      const message = await messageOf(response, 'رفض GitHub الطلب (403)');
      return fail('forbidden', needed ? `${message} (الصلاحية المطلوبة: ${needed})` : message, status, null, needed || null);
    }
    if (!response.ok) return fail('http', await messageOf(response, `HTTP ${status}`), status);
    let data: T;
    try {
      data = (await response.json()) as T;
    } catch {
      return fail('http', 'استجابة ليست JSON', status);
    }
    const etag = response.headers.get('etag');
    if (etag && current) this.touch(cache, path, { etag, data });
    return { ok: true, status, data, fromCache: false, readAt, rate, ...auth };
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
    const auth = last?.authenticated ? ({ authenticated: true } as const) : {};
    return { ok: true, status: last?.status ?? 200, data: { items, total, partial, pages }, fromCache: false, readAt: last?.readAt ?? this.now(), rate: this.rate(), ...auth };
  }

  private touch(cache: Map<string, Cached>, path: string, entry: Cached): void {
    cache.delete(path);
    cache.set(path, entry);
    while (cache.size > this.cacheSize) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
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

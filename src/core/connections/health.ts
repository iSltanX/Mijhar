// صحة الاتصالات (T-11.1، AC-11.1 ‏(١) و(٢)): الحالة تحددها استجابة فعلية لا وجود نص في الحقل. دوال نقية تأخذ الوقت مُدخلًا.
//  - التحقق الصريح: GET /rate_limit بالسرّ من الخلفية (لا يُحتسب من الحد، evidence/T-0.3). 200 بالرمز = سليم؛ 401 = منتهٍ (أو ملغى)؛
//    حد نافد = متجاوز الحد بموعده؛ صلاحية api.github.com غير ممنوحة = غير متحقق منه بسببه؛ وتعذّر الوصول = غير متاح.
//  - الاستعمال: كل استجابة موثَّقة لميزة تحدّث الحالة: قبول = سليم، و401 = منتهٍ، ونفاد = متجاوز الحد، و403 تسمّي ترويستها صلاحية قراءة
//    يستطيع المستخدم إضافتها = ناقص الصلاحيات (بالصلاحية والمستودع). وما لا يُصلحه المستخدم (Checks لا تُتاح للرموز دقيقة الحبيبات،
//    evidence/T-0.5) ليس نقصًا في الرمز بل «غير متاح بالرمز» تعلنه الميزة نفسها (T-11.5). و404 بالرمز ملتبس (لا يشمله الرمز أو غير موجود)
//    فلا يغيّر صحة الاتصال.
//  - السجل مربوط بوقت حفظ السرّ: استبداله أو حذفه يُسقط الحالة السابقة («غير متحقق منه» أو «غير مربوط»)، وموعد الانتهاء المعلن
//    (github-authentication-token-expiration) إن مضى صار منتهيًا بلا طلب.
import type { PublicApiResult } from '../api/client';
import type { ConnectionId } from './definitions';
import type { SecretInfo, SecretPlace } from './secrets';

export type Health = 'none' | 'unverified' | 'healthy' | 'expired' | 'insufficient' | 'rate-limited' | 'unavailable';
export type RecordedHealth = Exclude<Health, 'none'>;

export const HEALTH_STATES: readonly Health[] = ['none', 'unverified', 'healthy', 'expired', 'insufficient', 'rate-limited', 'unavailable'];

export const HEALTH_LABEL: Readonly<Record<Health, string>> = {
  none: 'غير مربوط',
  unverified: 'غير متحقق منه',
  healthy: 'سليم',
  expired: 'منتهٍ',
  insufficient: 'ناقص الصلاحيات',
  'rate-limited': 'متجاوز الحد',
  unavailable: 'غير متاح',
};

export type HealthTone = 'success' | 'danger' | 'warning' | 'info' | 'muted';

export const HEALTH_TONE: Readonly<Record<Health, HealthTone>> = {
  none: 'muted',
  unverified: 'info',
  healthy: 'success',
  expired: 'danger',
  insufficient: 'warning',
  'rate-limited': 'warning',
  unavailable: 'danger',
};

/** تفاصيل الحالة: أرقام وأسباب بلا أي سرّ. */
export interface HealthDetail {
  readonly limit?: number | null;
  readonly remaining?: number | null;
  /** موعد انتهاء السرّ (ms) كما أعلنته آخر استجابة موثَّقة. */
  readonly expiresAt?: number | null;
  /** لا يُرسل طلب قبله (ms). */
  readonly retryAt?: number | null;
  /** صلاحية القراءة الناقصة بمعامل GitHub (actions، contents…). */
  readonly permission?: string;
  /** المستودع الذي ظهر فيه النقص (owner/repo). */
  readonly where?: string;
  /** رمز الاستجابة إن وُجد. */
  readonly status?: number | null;
  /** سبب قصير معروض (رسائل العميل منقّحة من السرّ أصلًا). */
  readonly reason?: string;
}

export interface HealthRecord {
  readonly id: ConnectionId;
  /** وقت حفظ السرّ الذي قيست له الحالة. */
  readonly savedAt: number;
  readonly health: RecordedHealth;
  readonly checkedAt: number;
  readonly detail: HealthDetail;
}

/** حالة اتصال كما تُعرض خارج الخلفية: بلا السرّ. */
export interface ConnectionStatus {
  readonly id: ConnectionId;
  readonly place: SecretPlace | null;
  readonly savedAt: number | null;
  readonly health: Health;
  readonly checkedAt: number | null;
  readonly detail: HealthDetail;
}

export type Verdict = { readonly health: RecordedHealth; readonly detail: HealthDetail };

const failureReason = (result: Extract<PublicApiResult<unknown>, { ok: false }>): string => result.message;

/** حكم طلب التحقق الصريح (/rate_limit). expiresAt من حالة الخلفية بعد الطلب. */
export function verdictFromVerification(result: PublicApiResult<unknown>, expiresAt: number | null): Verdict {
  if (result.ok) {
    if (!result.authenticated) return { health: 'unverified', detail: { reason: 'لم تجد الخلفية السرّ المحفوظ، فأُرسل الطلب بلا رمز؛ أعد التحقق.' } };
    return { health: 'healthy', detail: { limit: result.rate?.limit ?? null, remaining: result.rate?.remaining ?? null, expiresAt } };
  }
  switch (result.failure) {
    case 'permission':
      return { health: 'unverified', detail: { reason: 'لم يُتحقق منه: يحتاج صلاحية api.github.com الاختيارية أولًا، ولن يُستعمل قبلها.' } };
    case 'unauthorized':
      return { health: 'expired', detail: { status: result.status, expiresAt } };
    case 'rate-limit':
      return { health: 'rate-limited', detail: { status: result.status, retryAt: result.retryAt } };
    default:
      return { health: 'unavailable', detail: { status: result.status, reason: failureReason(result) } };
  }
}

/**
 * الصلاحيات التي تقبلها نقطة النهاية من ترويسة x-accepted-github-permissions («pull_requests=read; contents=read»: أيّها يكفي)، أو []
 * لترويسة غائبة أو «allows_permissionless_access».
 */
export function acceptedPermissions(header: string | null | undefined): string[] {
  if (!header) return [];
  return header
    .split(/[;,]/)
    .map((part) => part.trim().split('=')[0]?.trim() ?? '')
    .filter((name) => /^[a-z_]+$/.test(name) && name !== 'allows_permissionless_access');
}

/** المستودع من مسار /repos/<owner>/<repo>/…، أو null. */
export function repoOfPath(path: string): string | null {
  const m = /^\/repos\/([^/?]+)\/([^/?]+)/.exec(path);
  return m ? `${decodeURIComponent(m[1] ?? '')}/${decodeURIComponent(m[2] ?? '')}` : null;
}

export interface UsageOptions {
  /** صلاحيات القراءة التي يستطيع المستخدم إضافتها للرمز (READ_PERMISSIONS). نقص غيرها ليس نقصًا في الرمز. */
  readonly fixable: readonly string[];
  readonly expiresAt: number | null;
}

/** حكم استجابة ميزة أُرسلت بالسرّ، أو null حين لا تغيّر صحة الاتصال. current: الحالة المسجلة لهذا السرّ نفسه. */
export function verdictFromUsage(path: string, result: PublicApiResult<unknown>, current: RecordedHealth | null, options: UsageOptions): Verdict | null {
  if (!result.authenticated) return null;
  if (result.ok) {
    // قبول طلب لا يمحو نقص صلاحية سُجّل لنقطة أخرى: يبقى حتى تحقق صريح.
    if (current === 'insufficient') return null;
    return { health: 'healthy', detail: { limit: result.rate?.limit ?? null, remaining: result.rate?.remaining ?? null, expiresAt: options.expiresAt } };
  }
  switch (result.failure) {
    case 'unauthorized':
      return { health: 'expired', detail: { status: result.status, expiresAt: options.expiresAt } };
    case 'rate-limit':
      return { health: 'rate-limited', detail: { status: result.status, retryAt: result.retryAt } };
    case 'forbidden': {
      const fixable = acceptedPermissions(result.accepted).filter((p) => options.fixable.includes(p));
      const permission = fixable[0];
      if (!permission) return null;
      return { health: 'insufficient', detail: { status: result.status, permission, ...(repoOfPath(path) ? { where: repoOfPath(path) as string } : {}) } };
    }
    default:
      return null;
  }
}

/** الحالة الآن من السرّ المحفوظ وسجل صحته. */
export function resolveStatus(id: ConnectionId, info: SecretInfo | null, record: HealthRecord | null, now: number): ConnectionStatus {
  const base = { id, place: info?.place ?? null, savedAt: info?.savedAt ?? null };
  if (!info) return { ...base, health: 'none', checkedAt: null, detail: {} };
  if (!record || record.id !== id || record.savedAt !== info.savedAt) {
    return { ...base, health: 'unverified', checkedAt: null, detail: { reason: 'محفوظ ولم يُتحقق منه بعد؛ لا يُعدّ سليمًا قبل طلب تحقق.' } };
  }
  const { expiresAt, retryAt } = record.detail;
  if (typeof expiresAt === 'number' && now >= expiresAt) return { ...base, health: 'expired', checkedAt: record.checkedAt, detail: { ...record.detail, reason: 'مضى موعد انتهائه المعلن.' } };
  if (record.health === 'rate-limited' && typeof retryAt === 'number' && now >= retryAt) {
    return { ...base, health: 'unverified', checkedAt: record.checkedAt, detail: { reason: 'انقضى موعد إعادة المحاولة بعد تجاوز الحد؛ تحقق من جديد.' } };
  }
  return { ...base, health: record.health, checkedAt: record.checkedAt, detail: record.detail };
}

/** هل يُعدّ الاتصال مربوطًا لميزة: سرّ محفوظ لم ينتهِ. ما سوى ذلك (نقص صلاحية أو حد) تعلنه الميزة نفسها بحالة وصولها (T-11.5). */
export const isLinked = (health: Health): boolean => health !== 'none' && health !== 'expired';

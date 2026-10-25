// إرسال البلاغ من خلفية الإضافة (AC-10.3، DEC-12 ي-1، MJ26): طلب واحد إلى خادم القناة بعقد v1، بعد تأكيد المستخدم وحده، وبصلاحية مضيفه الاختيارية.
// الخادم بلا CORS (العقد)، فالطلب يصل من الخلفية لأن صلاحية المضيف الممنوحة ترفع قيد الأصل؛ وبلا صلاحية لا يُرسل شيء. ومفتاح Idempotency-Key معرّف
// عشوائي تولّده صفحة البلاغ مرة لكل بلاغ وتعيده في كل محاولة، فردٌّ ضاع بعد أن فُتح البلاغ يُجاب بالرقم نفسه؛ ولا يعرّف المستخدم ولا جهازه.
// ولا يُرسل مع البلاغ رمز ولا مفتاح ولا ترويسة غير Content-Type وIdempotency-Key، ولا إعادة تلقائية.
import type { ReportPayload } from './payload';

export const REPORTS_ORIGIN = 'https://app-reports.isultantf.workers.dev';
export const REPORTS_ENDPOINT = `${REPORTS_ORIGIN}/v1/reports`;
export const REPORTS_HOST_PATTERN = `${REPORTS_ORIGIN}/*`;
export const SEND_TIMEOUT_MS = 30_000;

export type SendFailure = 'permission' | 'network' | 'timeout' | 'invalid' | 'too-large' | 'unsupported' | 'rate-limited' | 'server' | 'unexpected';
export type SendOutcome =
  | { readonly ok: true; readonly id: number; readonly replayed: boolean }
  | { readonly ok: false; readonly failure: SendFailure; readonly retryAfterSeconds?: number; readonly status: number | null };

/** هل تنفع إعادة المحاولة بالبلاغ نفسه؟ (جدول الردود في العقد). */
export const retryable = (failure: SendFailure): boolean => ['permission', 'network', 'timeout', 'rate-limited', 'server', 'unexpected'].includes(failure);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const isIdempotencyKey = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

export function parseRetryAfter(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : undefined;
}

/** يفسّر الرد بجدول العقد. */
export async function classify(response: Response): Promise<SendOutcome> {
  const { status } = response;
  if (status === 201 || status === 200) {
    const body = (await response.json().catch(() => null)) as { id?: unknown } | null;
    const id = body?.id;
    if (typeof id === 'number' && Number.isInteger(id) && id > 0) return { ok: true, id, replayed: status === 200 };
    return { ok: false, failure: 'unexpected', status };
  }
  if (status === 400) return { ok: false, failure: 'invalid', status };
  if (status === 413) return { ok: false, failure: 'too-large', status };
  if (status === 415) return { ok: false, failure: 'unsupported', status };
  if (status === 429) {
    const after = parseRetryAfter(response.headers.get('retry-after'));
    return { ok: false, failure: 'rate-limited', status, ...(after === undefined ? {} : { retryAfterSeconds: after }) };
  }
  if (status >= 500) return { ok: false, failure: 'server', status };
  return { ok: false, failure: 'unexpected', status };
}

export interface SendDeps {
  readonly fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** صلاحية مضيف القناة ممنوحة الآن؟ تُقرأ لحظة الطلب. */
  readonly granted: () => Promise<boolean>;
  readonly timeoutMs?: number;
}

export async function sendReport(payload: ReportPayload, key: string, deps: SendDeps): Promise<SendOutcome> {
  if (!(await deps.granted().catch(() => false))) return { ok: false, failure: 'permission', status: null };
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, deps.timeoutMs ?? SEND_TIMEOUT_MS);
  try {
    const response = await deps.fetch(REPORTS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(payload),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    return await classify(response);
  } catch {
    return { ok: false, failure: timedOut ? 'timeout' : 'network', status: null };
  } finally {
    clearTimeout(timer);
  }
}

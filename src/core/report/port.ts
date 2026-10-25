// رسالة إرسال البلاغ بين صفحة الإعدادات والخلفية (MJ26). الخلفية وحدها ترسل، وتقبل الرسالة من صفحة الإضافة وحدها (من sender لا من الرسالة)،
// وتتحقق من الجسم بشكل العقد وحقول مِجهَر وحدها ومن مفتاح Idempotency-Key قبل أي طلب؛ فلا يرسل سكربت محتوى ولا صفحة غيرها بلاغًا.
import { REPORTS_HOST_PATTERN, isIdempotencyKey, sendReport } from './client';
import type { SendDeps, SendOutcome } from './client';
import { isReportPayload } from './payload';
import type { ReportPayload } from './payload';

export const REPORT_MESSAGE = 'mijhar/report';

export interface ReportSendMessage {
  readonly type: typeof REPORT_MESSAGE;
  readonly op: 'send';
  readonly payload: ReportPayload;
  readonly key: string;
}

export const isReportRequest = (message: unknown): message is { type: typeof REPORT_MESSAGE } =>
  typeof message === 'object' && message !== null && (message as { type?: unknown }).type === REPORT_MESSAGE;

/** ما يلزم الإرسال من صلاحيات: مضيف القناة، وفي Firefox موافقة «البيانات التقنية والتفاعل» الاختيارية معه (التشخيص). */
export const reportPermissions = (target: 'chromium' | 'firefox'): { origins: string[]; data_collection?: string[] } =>
  target === 'firefox' ? { origins: [REPORTS_HOST_PATTERN], data_collection: ['technicalAndInteraction'] } : { origins: [REPORTS_HOST_PATTERN] };

export type ReportResponse = SendOutcome | { readonly ok: false; readonly failure: 'refused'; readonly status: null };

/** hasSecret: فاحص صيغ الأسرار المعروفة (privacy-check)؛ نص فيه ما يطابقها يُرفض هنا أيضًا وإن تجاوز منع الصفحة (MJ26، مراجعة ذاتية). */
export async function handleReportRequest(message: unknown, fromExtensionPage: boolean, deps: SendDeps, hasSecret: (text: string) => boolean = () => false): Promise<ReportResponse> {
  const m = message as Partial<ReportSendMessage>;
  if (!fromExtensionPage || m.op !== 'send' || !isReportPayload(m.payload) || !isIdempotencyKey(m.key) || hasSecret(m.payload.description)) return { ok: false, failure: 'refused', status: null };
  return sendReport(m.payload, m.key, deps);
}

/** منفذ صفحة الإعدادات إلى الخلفية. */
export function runtimeReportPort(runtime: { sendMessage(message: unknown): Promise<unknown> }) {
  return {
    send: (payload: ReportPayload, key: string): Promise<ReportResponse> =>
      runtime.sendMessage({ type: REPORT_MESSAGE, op: 'send', payload, key } satisfies ReportSendMessage).then(
        (r) => (r && typeof r === 'object' && 'ok' in r ? (r as ReportResponse) : { ok: false, failure: 'network', status: null }),
        () => ({ ok: false, failure: 'network', status: null }) as const,
      ),
  };
}

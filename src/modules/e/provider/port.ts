// رسائل طبقة المزوّد بين الخلفية وصفحاتها وسكربت المحتوى (T-11.6). لا سرّ يعبرها: المفتاح يُقرأ في الخلفية وحدها لكل طلب، والرد بلا المفتاح.
//  - status: المزوّد ووجهته وصلاحية مضيفه وحالة المفتاح والمودل وقائمة المودلات بمصدرها ووقت قراءتها (لا طلب شبكة).
//  - verify: طلب التحقق المعلن (قائمة المودلات) من صفحة الإعدادات بنقر المستخدم.
//  - analyze: طلب تحليل واحد بعد موافقة المستخدم بنقرة موثوقة في القسم (AD-27)، بالمحتوى المنقّح الذي رآه والمودل الذي رآه.
//  - cancel: إيقاف طلب جارٍ.
import type { ExtensionApi } from '../../../core/ui-host/browser-api';
import type { ConnectionStatus } from '../../../core/connections/health';
import type { AnalysisReply, ModelsList, ProviderFailure, ProviderResult } from './types';

export const PROVIDER_MESSAGE = 'mijhar/provider';

export type ProviderOp = 'status' | 'verify' | 'analyze' | 'cancel';

export interface AnalyzeInput {
  /** معرّف يولّده القسم لطلبه (لإيقافه). */
  readonly requestId: string;
  /** القسم الذي طُلب منه (checks أو pr أو issue): طلب واحد جارٍ لكل قسم في التبويب. */
  readonly section: string;
  /** المودل الذي عرضته الموافقة؛ إن تغيّر قبل الإرسال لا يُرسل شيء. */
  readonly model: string;
  readonly system: string;
  readonly prompt: string;
}

export type ProviderRequest =
  | { readonly type: typeof PROVIDER_MESSAGE; readonly op: 'status' }
  | { readonly type: typeof PROVIDER_MESSAGE; readonly op: 'verify' }
  | ({ readonly type: typeof PROVIDER_MESSAGE; readonly op: 'analyze' } & AnalyzeInput)
  | { readonly type: typeof PROVIDER_MESSAGE; readonly op: 'cancel'; readonly requestId: string };

/** المزوّد المختار كما يُعرض (بلا مفتاح). */
export interface ProviderInfo {
  readonly id: string;
  readonly title: string;
  readonly host: string;
  readonly origin: string;
  readonly keyPrefix: string;
  readonly verifyRequest: string;
}

export interface ProviderStatus {
  readonly provider: ProviderInfo;
  /** صلاحية مضيف المزوّد الاختيارية ممنوحة الآن. */
  readonly permission: boolean;
  /** حالة مفتاح المزوّد من سجل الاتصالات (بلا المفتاح)، أو null إن تعذّرت قراءتها. */
  readonly key: ConnectionStatus | null;
  /** المودل الذي يُرسل إليه الآن، أو null حين لم تُقرأ قائمة المودلات ولم يُختر مودل. */
  readonly model: { readonly id: string; readonly displayName: string } | null;
  /** اختيار المستخدم ('' = الافتراضي من القائمة). */
  readonly choice: string;
  readonly models: ModelsList | null;
  /** لا يُرسل طلب تحليل قبله (ms) كما أعلنه المزوّد، أو null. */
  readonly retryAt: number | null;
}

/** نتيجة تحليل كما تُعرض: الرد ووجهته ووقته. */
export interface AnalysisOutcome extends AnalysisReply {
  readonly provider: string;
  readonly host: string;
  readonly requestedAt: number;
  readonly completedAt: number;
}

export type VerifyResponse = ProviderResult<ModelsList>;
export type AnalyzeResponse = ProviderResult<AnalysisOutcome>;

const OPS: readonly ProviderOp[] = ['status', 'verify', 'analyze', 'cancel'];

export const isProviderRequest = (message: unknown): message is ProviderRequest =>
  typeof message === 'object' && message !== null && (message as ProviderRequest).type === PROVIDER_MESSAGE && OPS.includes((message as ProviderRequest).op);

export interface ProviderPort {
  status(): Promise<ProviderStatus | null>;
  verify(): Promise<VerifyResponse>;
  analyze(input: AnalyzeInput): Promise<AnalyzeResponse>;
  cancel(requestId: string): Promise<void>;
}

const unreachable = (failure: ProviderFailure, message: string): { ok: false; failure: ProviderFailure; status: null; message: string; retryAt: null } => ({ ok: false, failure, status: null, message, retryAt: null });

/** منفذ الصفحات وسكربت المحتوى: رسائل إلى الخلفية. تعذّر الرسالة نفسها فشل معلن لا نجاح. */
export function runtimeProviderPort(runtime: Pick<ExtensionApi['runtime'], 'sendMessage'>): ProviderPort {
  const send = async <R>(request: ProviderRequest, fallback: R): Promise<R> => {
    try {
      const response = await runtime.sendMessage(request);
      return (response ?? fallback) as R;
    } catch {
      return fallback;
    }
  };
  return {
    status: () => send<ProviderStatus | null>({ type: PROVIDER_MESSAGE, op: 'status' }, null),
    verify: () => send<VerifyResponse>({ type: PROVIDER_MESSAGE, op: 'verify' }, unreachable('network', 'تعذّر الوصول إلى خلفية الإضافة')),
    analyze: (input) => send<AnalyzeResponse>({ type: PROVIDER_MESSAGE, op: 'analyze', ...input }, unreachable('network', 'تعذّر الوصول إلى خلفية الإضافة؛ لم يُرسل شيء')),
    cancel: async (requestId) => {
      await send<unknown>({ type: PROVIDER_MESSAGE, op: 'cancel', requestId }, null);
    },
  };
}

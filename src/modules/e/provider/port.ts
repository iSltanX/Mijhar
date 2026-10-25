// رسائل طبقة المزوّد بين الخلفية وصفحاتها وسكربت المحتوى (T-11.6، T-11.10). لا سرّ يعبرها: مفتاح كل مزوّد يُقرأ في الخلفية وحدها من مخزنه لكل طلب،
// والرد بلا المفتاح.
//  - status: مزوّد بعينه (أو المختار) ووجهته وصلاحيتاه وحالة مفتاحه ومودله وقائمة مودلاته بمصدرها ووقت قراءتها، وحالة مفاتيح بقية المزوّدين (لا طلب شبكة).
//  - verify: طلب التحقق المعلن (قائمة النماذج) لمزوّد بعينه من صفحة الإعدادات بنقر المستخدم: «احفظ وتحقق» و«تحقق من المفتاح»، وزر + بجانب حقل
//    النموذج حين لا قائمة مقروءة (الطلب نفسه، بلا اقتراح في الحقل).
//  - probe: «اختبر النموذج» الاختياري للنموذج المكتوب (DEC-13 ن-5)، بنقر المستخدم وبنص ثابت بلا محتوى من الصفحات؛ ليس شرطًا للحفظ ولا للتحليل.
//  - analyze: طلب تحليل واحد بعد موافقة المستخدم بنقرة موثوقة في القسم (AD-27)، بالمحتوى المنقّح والمزوّد والمودل التي رآها.
//  - cancel: إيقاف طلب جارٍ.
import type { ExtensionApi } from '../../../core/ui-host/browser-api';
import type { ConnectionStatus, Health } from '../../../core/connections/health';
import type { AnalysisReply, ModelTest, ModelsList, ProviderFailure, ProviderInfo, ProviderResult } from './types';

export const PROVIDER_MESSAGE = 'mijhar/provider';

export type ProviderOp = 'status' | 'verify' | 'probe' | 'analyze' | 'cancel';

export interface AnalyzeInput {
  /** معرّف يولّده القسم لطلبه (لإيقافه). */
  readonly requestId: string;
  /** القسم الذي طُلب منه (checks أو pr أو issue): طلب واحد جارٍ لكل قسم في التبويب. */
  readonly section: string;
  /** المزوّد الذي عرضته الموافقة؛ إن تغيّر المزوّد المختار قبل الإرسال لا يُرسل شيء. */
  readonly provider: string;
  /** المودل الذي عرضته الموافقة؛ إن تغيّر قبل الإرسال لا يُرسل شيء. */
  readonly model: string;
  readonly system: string;
  readonly prompt: string;
}

type Message<T> = { readonly type: typeof PROVIDER_MESSAGE } & T;

export type ProviderRequest =
  | Message<{ readonly op: 'status'; readonly provider?: string }>
  | Message<{ readonly op: 'verify'; readonly provider: string; readonly suggest?: boolean }>
  | Message<{ readonly op: 'probe'; readonly provider: string; readonly model: string }>
  | Message<{ readonly op: 'analyze' } & AnalyzeInput>
  | Message<{ readonly op: 'cancel'; readonly requestId: string }>;

export type { ProviderInfo };

/** مزوّد آخر في السجل كما تذكره البطاقة («OpenAI — لا مفتاح»): اسمه وحالة مفتاحه وحدها. */
export interface ProviderSummary {
  readonly id: string;
  readonly title: string;
  readonly host: string;
  /** صحة مفتاحه، أو null إن تعذّرت قراءتها. */
  readonly health: Health | null;
}

export interface ProviderStatus {
  readonly provider: ProviderInfo;
  /** هو المزوّد المختار للتحليل الآن. */
  readonly selected: boolean;
  /** ما يشترطه التحليل عنده من صلاحيات ممنوح الآن: صلاحية مضيفه، ومعها في Firefox موافقة مشاركة محتوى المواقع. */
  readonly permission: boolean;
  /** صلاحية مضيفه الاختيارية وحدها. */
  readonly hostPermission: boolean;
  /** موافقة مشاركة محتوى المواقع المشتركة بين المزوّدين (Firefox)، أو null حيث لا يشترطها المتصفح. */
  readonly contentPermission: boolean | null;
  /** حالة مفتاحه من سجل الاتصالات (بلا المفتاح)، أو null إن تعذّرت قراءتها. */
  readonly key: ConnectionStatus | null;
  /** النموذج الذي يُرسل إليه التحليل الآن: ما في حقل النموذج كما هو وإن لم يكن في القائمة (DEC-13 ن-5)، أو null حين يكون الحقل فارغًا (BLK-MODEL-COMPAT). */
  readonly model: { readonly id: string; readonly displayName: string } | null;
  /** ما في حقل النموذج لهذا المزوّد ('' = فارغ). */
  readonly choice: string;
  /** قائمة نماذجه المقروءة في الجلسة (للمساعدة بزر +)، أو null. */
  readonly models: ModelsList | null;
  /** نتيجة آخر «اختبر النموذج» إن كانت للنموذج الذي في الحقل وبالمفتاح المحفوظ الآن، وإلا null. */
  readonly test: ModelTest | null;
  /** لا يُرسل طلب تحليل قبله (ms) كما أعلنه المزوّد، أو null. */
  readonly retryAt: number | null;
  /** كل المزوّدين في السجل بحالة مفاتيحهم، بترتيب السجل. */
  readonly providers: readonly ProviderSummary[];
}

/** نتيجة تحليل كما تُعرض: الرد ووجهته ووقته. */
export interface AnalysisOutcome extends AnalysisReply {
  readonly provider: string;
  readonly host: string;
  readonly requestedAt: number;
  readonly completedAt: number;
}

export type VerifyResponse = ProviderResult<ModelsList>;
/** نتيجة الاختبار حين أُرسل طلبه (قبول أو رفض أو لم يُحسم)؛ وفشل محلي حين لم يُرسل شيء (لا مفتاح، موعد إعادة معلن، صلاحية…). */
export type ProbeResponse = { readonly ok: true; readonly data: ModelTest } | Extract<ProviderResult<never>, { ok: false }>;
export type AnalyzeResponse = ProviderResult<AnalysisOutcome>;

const OPS: readonly ProviderOp[] = ['status', 'verify', 'probe', 'analyze', 'cancel'];

export const isProviderRequest = (message: unknown): message is ProviderRequest =>
  typeof message === 'object' && message !== null && (message as ProviderRequest).type === PROVIDER_MESSAGE && OPS.includes((message as ProviderRequest).op);

export interface ProviderPort {
  /** حالة مزوّد بعينه، أو المختار إن لم يُذكر. */
  status(provider?: string): Promise<ProviderStatus | null>;
  /** suggest=false: جلب القائمة لزر + دون اقتراح نموذج في الحقل الفارغ. */
  verify(provider: string, options?: { readonly suggest?: boolean }): Promise<VerifyResponse>;
  probe(provider: string, model: string): Promise<ProbeResponse>;
  analyze(input: AnalyzeInput): Promise<AnalyzeResponse>;
  cancel(requestId: string): Promise<void>;
}

const unreachable = (failure: ProviderFailure, message: string): { ok: false; failure: ProviderFailure; status: null; message: string; retryAt: null } => ({ ok: false, failure, status: null, message, retryAt: null });

/** لم تصل الرسالة أي مستمع: لم يبدأ شيء. وما سواه (أُغلق المنفذ قبل الرد، أو رد فارغ) قد يلي إرسالًا إلى المزوّد (MJ-TA-H01). */
const notDelivered = (error: unknown): boolean => /Receiving end does not exist|Extension context invalidated/i.test(error instanceof Error ? error.message : String(error));

/** منفذ الصفحات وسكربت المحتوى: رسائل إلى الخلفية. تعذّر الرسالة نفسها فشل معلن لا نجاح. */
export function runtimeProviderPort(runtime: Pick<ExtensionApi['runtime'], 'sendMessage'>): ProviderPort {
  /** fallback: حين لم تصل الرسالة؛ وlost: حين وصلت وانقطعت القناة قبل الرد (افتراضًا fallback لما لا يرسل شيئًا إلى المزوّد). */
  const send = async <R>(request: ProviderRequest, fallback: R, lost: R = fallback): Promise<R> => {
    try {
      const response = await runtime.sendMessage(request);
      return (response ?? lost) as R;
    } catch (error) {
      return notDelivered(error) ? fallback : lost;
    }
  };
  return {
    status: (provider) => send<ProviderStatus | null>({ type: PROVIDER_MESSAGE, op: 'status', ...(provider ? { provider } : {}) }, null),
    verify: (provider, options) =>
      send<VerifyResponse>({ type: PROVIDER_MESSAGE, op: 'verify', provider, ...(options?.suggest === false ? { suggest: false } : {}) }, unreachable('network', 'تعذّر الوصول إلى خلفية الإضافة')),
    probe: (provider, model) => send<ProbeResponse>({ type: PROVIDER_MESSAGE, op: 'probe', provider, model }, unreachable('network', 'تعذّر الوصول إلى خلفية الإضافة')),
    analyze: (input) =>
      send<AnalyzeResponse>(
        { type: PROVIDER_MESSAGE, op: 'analyze', ...input },
        unreachable('network', 'تعذّر الوصول إلى خلفية الإضافة؛ لم يُرسل شيء'),
        unreachable('network', 'انقطع الاتصال بخلفية الإضافة قبل أن تردّ، فتعذّر التأكد إن كان الطلب قد أُرسل إلى المزوّد. أعد المحاولة إن احتجت.'),
      ),
    cancel: async (requestId) => {
      await send<unknown>({ type: PROVIDER_MESSAGE, op: 'cancel', requestId }, null);
    },
  };
}

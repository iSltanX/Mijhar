// أنواع طبقة مزوّد التحليل (T-11.6، F-E9): عقد المحوّل ونتائج طلباته، بلا واجهة ولا سرّ. يستوردها الخلفية والإعدادات وسكربت المحتوى.
// لا سعر ولا تكلفة في أي نوع هنا (AD-31): التسعير والفوترة بين المستخدم والمزوّد.

/** مودل كما تعيده نقطة المودلات لدى المزوّد وقت التشغيل؛ لا يُثبَّت مودل في الشيفرة. */
export interface ProviderModel {
  readonly id: string;
  readonly displayName: string;
  /** وقت إصدار المودل كما أعلنه المزوّد (ISO)، أو null. */
  readonly createdAt: string | null;
  /** فئة المودل كما يعلنها المزوّد (sonnet، haiku…)، أو null؛ ولا تُستنتج من المعرّف. */
  readonly line: string | null;
  /** أقصى max_tokens يقبله المودل، أو null. */
  readonly maxTokens: number | null;
  readonly maxInputTokens: number | null;
  /** active أو deprecated (المتقاعد لا يُعرض). */
  readonly lifecycle: string | null;
}

/** قائمة المودلات بمصدرها ووقت قراءتها (AC-E9 (٣)). */
export interface ModelsList {
  readonly provider: string;
  readonly models: readonly ProviderModel[];
  readonly readAt: number;
  /** العنوان الذي قُرئت منه. */
  readonly source: string;
  /** أعلن المزوّد صفحات أخرى لم تُقرأ. */
  readonly partial: boolean;
}

/**
 * أسباب الفشل المصنَّفة. محلية (لم يُرسل طلب): permission وno-key وkey-read وexpired-key وbusy وcooldown وmodel-changed وinvalid-request.
 * ومن المزوّد: unauthorized (401) وforbidden (403) وnot-found وtoo-large وinvalid وrate-limit (429) وoverloaded (529 أو 5xx) وhttp وnetwork وaborted.
 */
export type ProviderFailure =
  | 'permission'
  | 'no-key'
  | 'key-read'
  | 'expired-key'
  | 'busy'
  | 'cooldown'
  | 'model-changed'
  | 'invalid-request'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'too-large'
  | 'invalid'
  | 'rate-limit'
  | 'overloaded'
  | 'http'
  | 'network'
  | 'aborted';

export type ProviderResult<T> =
  | { readonly ok: true; readonly status: number; readonly data: T }
  | {
      readonly ok: false;
      readonly failure: ProviderFailure;
      /** رمز الاستجابة إن صدر طلب، وإلا null (لم يُرسل شيء). */
      readonly status: number | null;
      /** سبب قصير منقّح من المفتاح. */
      readonly message: string;
      /** لا يُرسل طلب قبله (ms) كما أعلنه المزوّد في ترويساته، أو null. */
      readonly retryAt: number | null;
    };

/** ما يُرسل في طلب التحليل: نص البرومبت المنقّح من الطبقة المشتركة وتعليمات صيغة الرد، بمودل محدد. */
export interface AnalysisRequest {
  readonly model: string;
  readonly system: string;
  readonly prompt: string;
  /** حد طول الرد المطلوب في واجهة الرسائل (إلزامي فيها)، مقصورًا على ما يعلنه المودل؛ ليس سقف إنفاق. */
  readonly maxTokens: number;
}

export interface AnalysisReply {
  readonly text: string;
  /** المودل كما أعلنه الرد. */
  readonly model: string;
  /** سبب توقف التوليد كما أعلنه المزوّد (end_turn، max_tokens…). */
  readonly stopReason: string | null;
  /** أعداد الرموز كما أعلنها الرد (معلومة، لا تكلفة). */
  readonly usage: { readonly input: number | null; readonly output: number | null } | null;
}

/** طلب مسموح بوجهة المحوّل وحدها: يرمي لعنوان خارجها، ولا يُرسل شيئًا دون صلاحية المضيف الممنوحة. */
export type GatedFetch = (path: string, init: RequestInit) => Promise<Response>;

export interface ProviderCall {
  readonly key: string;
  readonly fetch: GatedFetch;
  readonly now: () => number;
  readonly signal?: AbortSignal;
}

/** محوّل مزوّد: يُسجَّل في السجل (registry.ts)، وإضافة غيره لا تمس شيفرة الأقسام (AC-E9 (٦)). */
export interface ProviderAdapter {
  readonly id: string;
  /** اسم المزوّد المعروض («Anthropic»). */
  readonly title: string;
  /** المضيف الوحيد الذي يُرسل إليه المفتاح والمحتوى. */
  readonly host: string;
  /** نمط صلاحية المضيف الاختيارية (optional_host_permissions). */
  readonly origin: string;
  /** بادئة المفتاح المعروضة في الحقل («sk-ant-»). */
  readonly keyPrefix: string;
  /** وصف طلب التحقق المعلن قبل الحفظ (AC-E9 (١)). */
  readonly verifyRequest: string;
  /** يفحص صيغة المفتاح محليًا دون إرسال. */
  checkKey(input: string): { readonly ok: true; readonly key: string } | { readonly ok: false; readonly reason: string };
  /** قائمة المودلات وقت التشغيل؛ وهي طلب التحقق المعلن نفسه. */
  listModels(call: ProviderCall): Promise<ProviderResult<ModelsList>>;
  analyze(call: ProviderCall, request: AnalysisRequest): Promise<ProviderResult<AnalysisReply>>;
}

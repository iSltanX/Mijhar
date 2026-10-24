// أنواع طبقة مزوّد التحليل (T-11.6، T-11.10، F-E9): وصف المزوّد وعقد المحوّل ونتائج طلباته، بلا واجهة ولا سرّ. يستوردها الخلفية والإعدادات وسكربت المحتوى.
// لا سعر ولا تكلفة في أي نوع هنا (AD-31): التسعير والفوترة بين المستخدم والمزوّد.

/** صيغة مفتاح المزوّد كما تُفحص محليًا قبل أي طلب. */
export interface KeyFormat {
  /** الصيغة المقبولة كاملة. */
  readonly pattern: RegExp;
  /** بادئات مفاتيح معروفة لا تصلح للتحليل وسبب رفض كلٍّ منها (مفتاح إدارة مثلًا). */
  readonly rejects: readonly { readonly prefix: string; readonly reason: string }[];
  /** سبب الرفض لما لا يطابق الصيغة. */
  readonly mismatch: string;
}

/** سياسة المزوّد في استعمال البيانات كما أعلنها في صفحته الرسمية، بتاريخ قراءتها؛ ولا يدّعي مِجهَر عنها ما لم يعلنه المزوّد. */
export interface ProviderPolicy {
  readonly url: string;
  /** اسم الصفحة المعروض («privacy.claude.com»). */
  readonly label: string;
  readonly readOn: string;
  /** ما تقوله الصفحة في جملة. */
  readonly summary: string;
}

/**
 * وصف مزوّد في السجل الوصفي (AC-E10 (١)): ما يُعرف عنه دون محوّله، فيصل سكربت المحتوى واللوحة والإعدادات بلا ترويسة ولا مسار ولا طلب.
 * والمحوّل (ProviderAdapter) في الخلفية وحدها.
 */
export interface ProviderDescriptor {
  readonly id: string;
  /** اسم المزوّد المعروض («Anthropic»). */
  readonly title: string;
  /** المضيف الوحيد الذي يُرسل إليه مفتاحه والمحتوى. */
  readonly host: string;
  /** نمط صلاحية المضيف الاختيارية (optional_host_permissions). */
  readonly origin: string;
  /** بادئة المفتاح المعروضة في الحقل («sk-ant-»). */
  readonly keyPrefix: string;
  /** ما يُلصق في الحقل ومن أين («مفتاح Anthropic API من Claude Console»). */
  readonly keyName: string;
  readonly keyFormat: KeyFormat;
  /** وصف طلب التحقق المعلن قبل الحفظ (AC-E9 (١)). */
  readonly verifyRequest: string;
  /** وصف طلب فحص التوافق الصريح حين لا تعلن واجهة المزوّد توافق مودل (DEC-13 ن-3)، أو null حين لا يدعمه المحوّل. */
  readonly probeRequest: string | null;
  readonly policy: ProviderPolicy;
}

/** المزوّد كما يعبر الرسائل ويُعرض (بلا نمط الصيغة، فهو يُفحص في الإعدادات من الوصف نفسه). */
export type ProviderInfo = Omit<ProviderDescriptor, 'keyFormat'>;

/**
 * توافق المودل مع التحليل (DEC-13 ن-3): declared = أعلنته واجهة المزوّد الرسمية؛ checked = ثبت بفحص صريح بدأه المستخدم؛ unknown = لم تعلنه
 * الواجهة ولم يثبت، فلا يُعرض خيارًا للتحليل. لا يُستنتج التوافق من اسم المودل ولا معرّفه.
 */
export type ModelCompatibility = 'declared' | 'checked' | 'unknown';

/** مودل كما تعيده نقطة المودلات لدى المزوّد وقت التشغيل؛ لا يُثبَّت مودل في الشيفرة. */
export interface ProviderModel {
  readonly id: string;
  readonly displayName: string;
  /** وقت إصدار المودل كما أعلنه المزوّد (ISO)، أو null. */
  readonly createdAt: string | null;
  /** فئة المودل كما يعلنها المزوّد، أو null؛ ولا تُستنتج من المعرّف. للعرض وحده. */
  readonly line: string | null;
  /** أقصى max_tokens يقبله المودل، أو null. */
  readonly maxTokens: number | null;
  readonly maxInputTokens: number | null;
  /** active أو deprecated (المتقاعد لا يُعرض). */
  readonly lifecycle: string | null;
  readonly compatibility: ModelCompatibility;
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
 * أسباب الفشل المصنَّفة. محلية (لم يُرسل طلب): permission وno-key وkey-read وexpired-key وbusy وcooldown وmodel-changed وprovider-changed
 * وincompatible وinvalid-request. ومن المزوّد: unauthorized (401) وforbidden (403) وnot-found وtoo-large وinvalid وrate-limit (429) وoverloaded
 * (529 أو 5xx) وhttp وnetwork وaborted.
 */
export type ProviderFailure =
  | 'permission'
  | 'no-key'
  | 'key-read'
  | 'expired-key'
  | 'busy'
  | 'cooldown'
  | 'model-changed'
  | 'provider-changed'
  | 'incompatible'
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

/** ما يعطيه الخدمةُ المحوّلَ لطلب واحد: مفتاح مزوّده وحده (بوابة bindKey) وطلبٌ مقصور على مضيفه. */
export interface ProviderCall {
  readonly key: string;
  readonly fetch: GatedFetch;
  readonly now: () => number;
  readonly signal?: AbortSignal;
}

/**
 * محوّل مزوّد: يُسجَّل في سجل الخلفية (registry.ts) ووصفه في السجل الوصفي (catalog.ts)، وإضافة غيره لا تمس شيفرة الأقسام (AC-E10 (١)).
 * والترويسات والمسارات هنا وحدها، فلا تصل حزمة غير الخلفية (I-2).
 */
export interface ProviderAdapter {
  readonly descriptor: ProviderDescriptor;
  /** قائمة المودلات وقت التشغيل بتوافق كلٍّ منها كما تعلنه الواجهة الرسمية؛ وهي طلب التحقق المعلن نفسه. */
  listModels(call: ProviderCall): Promise<ProviderResult<ModelsList>>;
  analyze(call: ProviderCall, request: AnalysisRequest): Promise<ProviderResult<AnalysisReply>>;
  /** فحص التوافق الصريح لمودل لم تعلن الواجهة توافقه، بطلب معلن بلا محتوى من الصفحات يبدؤه المستخدم (DEC-13 ن-3). غيابه: لا فحص. */
  probe?(call: ProviderCall, model: string): Promise<ProviderResult<true>>;
}

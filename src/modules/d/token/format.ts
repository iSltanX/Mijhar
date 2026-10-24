// رمز GitHub الاختياري للقراءة (T-5.5): الصيغة المقبولة وقائمة الصلاحيات الدنيا كما أثبتتها evidence/T-0.5 (AC-S5.3).
//  - يُقبل الرمز دقيق الحبيبات (github_pat_…) وحده: صلاحياته تُختار لكل مستودع ولكل نقطة «Read-only»، أما الرمز الكلاسيكي فلا يُقيَّد
//    بالقراءة في المستودعات الخاصة (نطاق repo يشمل غيرها) فلا يُقبل؛ وكذلك رموز OAuth والتطبيقات.
//  - القائمة للقراءة وحدها، ولا تذكر أي صلاحية غيرها (AC-D7): Checks غير متاحة للرموز دقيقة الحبيبات أصلًا، فتُعلن فحوص التطبيقات
//    غير Actions في المستودعات الخاصة غير متاحة بالرمز.

export const FINE_GRAINED_PREFIX = 'github_pat_';

// github_pat_ ثم 82 حرفًا اليوم (22 + «_» + 59)؛ ويُتسامح في الطول لأن GitHub لا يلتزم به علنًا.
const FINE_GRAINED = /^github_pat_[A-Za-z0-9_]{40,240}$/;
const OTHER_GITHUB = /^(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}$/;

export type TokenFormat = { readonly ok: true; readonly token: string } | { readonly ok: false; readonly reason: 'empty' | 'not-fine-grained' | 'format' };

/** يفحص صيغة ما أُدخل دون إرساله إلى أي مكان. المسافات حوله تُحذف. */
export function checkTokenFormat(input: string): TokenFormat {
  const token = input.trim();
  if (!token) return { ok: false, reason: 'empty' };
  if (FINE_GRAINED.test(token)) return { ok: true, token };
  if (OTHER_GITHUB.test(token)) return { ok: false, reason: 'not-fine-grained' };
  return { ok: false, reason: 'format' };
}

export const TOKEN_FORMAT_MESSAGES: Readonly<Record<Exclude<TokenFormat, { ok: true }>['reason'], string>> = {
  empty: 'الحقل فارغ.',
  'not-fine-grained': 'هذا رمز كلاسيكي أو رمز تطبيق، ولا يُقبل: لا يمكن قصره على القراءة في المستودعات الخاصة. أنشئ رمزًا دقيق الحبيبات (Fine-grained) يبدأ بـgithub_pat_.',
  format: 'لا يطابق صيغة الرمز دقيق الحبيبات (github_pat_…). تأكد أنك نسخته كاملًا.',
};

export interface ReadPermission {
  /** الاسم كما يظهر في صفحة إنشاء الرمز على GitHub. */
  readonly name: string;
  /** اسم معامل الصلاحية في رابط قالب إنشاء الرمز (docs.github.com: «Pre-filling fine-grained token details using URL parameters»). */
  readonly param: string;
  readonly why: string;
}

/** الصلاحيات الدنيا لكل نقطة تقرؤها مِجهَر (evidence/T-0.5: x-accepted-github-permissions مع قبول الطلب برمز القراءة). كلها Read-only. */
export const READ_PERMISSIONS: readonly ReadPermission[] = [
  { name: 'Metadata', param: 'metadata', why: 'بيانات المستودع الأساسية؛ يضيفها GitHub تلقائيًا' },
  { name: 'Contents', param: 'contents', why: 'الفروع وحمايتها والملفات والمقارنة' },
  { name: 'Pull requests', param: 'pull_requests', why: 'حالة طلب الدمج وقابليته للدمج' },
  { name: 'Commit statuses', param: 'statuses', why: 'حالات الالتزام المجمَّعة' },
  { name: 'Actions', param: 'actions', why: 'مهام Actions وخطواتها في المستودعات الخاصة' },
  { name: 'Issues', param: 'issues', why: 'المشكلات وأعداد وسومها' },
];

export const READ_ACCESS_LEVEL = 'Read-only';

/** ما لا يُتاح بالرمز مهما كانت صلاحياته (evidence/T-0.5). */
export const TOKEN_LIMITS: readonly string[] = [
  'فحوص التطبيقات غير Actions (check-runs) في المستودعات الخاصة: تتطلب صلاحية Checks، ولا تتيحها GitHub للرموز دقيقة الحبيبات؛ فتُعلَن غير متاحة.',
  'نص سجل المهمة عبر API يُحوَّل إلى رابط موقَّع خارج api.github.com فلا يُطلب؛ ويُقرأ السجل من صفحة المهمة نفسها (شرح سجل الفحص).',
];

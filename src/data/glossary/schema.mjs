// مخطط بيانات القاموس (T-3.1): المجموعات المضبوطة والحقول المطلوبة وأنماط المحاكاة الممنوعة.
// ملف .mjs ليقرأه سكربت التحقق مباشرة في Node، وتشتق منه الأنواع في types.ts.

export const SCHEMA_VERSION = 1;

export const CATEGORIES = /** @type {const} */ (['account', 'repo', 'git', 'security', 'deploy', 'collab', 'settings']);

/** الحساسية: ما يلزم الانتباه قبل الضغط. */
export const SAFETY_LEVELS = /** @type {const} */ (['آمن', 'حساس', 'خطر']);

export const REVERSIBILITY = /** @type {const} */ (['نعم', 'جزئيًا', 'لا']);

/**
 * أدنى صلاحية على المستودع (أو المنظمة) يحتاجها الإجراء الأساسي.
 * None: لا صلاحية مستودع (إجراء على الحساب أو الواجهة). Owner: مالك الحساب أو المنظمة لا دور مستودع.
 */
export const PERMISSION_LEVELS = /** @type {const} */ (['None', 'Read', 'Triage', 'Write', 'Maintain', 'Admin', 'Owner']);

/** element: عنصر واجهة يُربط بتوقيع دلالي؛ concept: مصطلح بلا عنصر محدد في الصفحة. */
export const ENTRY_KINDS = /** @type {const} */ (['element', 'concept']);

/** أدوار ARIA/HTML المقبولة في التوقيع الدلالي. */
export const SIGNATURE_ROLES = /** @type {const} */ ([
  'button',
  'link',
  'tab',
  'menuitem',
  'checkbox',
  'switch',
  'textbox',
  'combobox',
  'heading',
  'region',
  'status',
  'img',
  'list',
  'table',
]);

/** أنواع الصفحات التي يظهر فيها العنصر؛ any للعناصر المشتركة بين الصفحات. */
export const PAGE_KINDS = /** @type {const} */ ([
  'any',
  'dashboard',
  'profile',
  'repo-home',
  'repo-files',
  'issues',
  'issue',
  'pull-requests',
  'pull-request',
  'actions',
  'releases',
  'security',
  'insights',
  'settings-repo',
  'settings-account',
  'search',
  'notifications',
  'new-repo',
]);

/** حالة التحقق من وثائق GitHub لتصريحات الصلاحية والتراجع. */
export const VERIFICATION_STATUSES = /** @type {const} */ (['verified', 'unverified']);

export const DOCS_URL_PREFIX = 'https://docs.github.com/en/';

/** الحقول المطلوبة في كل مدخل بترتيبها المعتمد في الملف. */
export const REQUIRED_FIELDS = /** @type {const} */ ([
  'id',
  'kind',
  'ar',
  'en',
  'category',
  'brief',
  'medium',
  'detailed',
  'safety',
  'reversible',
  'permission',
  'whenToUse',
  'reversalLimits',
  'docsUrl',
  'verification',
  'signature',
]);

/** حقول اختيارية: example مطلوب للمصطلحات الأساسية؛ permissionNote تفصيل نصي للصلاحية. */
export const OPTIONAL_FIELDS = /** @type {const} */ (['example', 'permissionNote']);

/**
 * عبارات المحاكاة الممنوعة في أي حقل نصي. كل نمط يُفحص بلا حساسية لحالة الأحرف.
 * تشمل أسماء المشروع السابق وأمثلته الشخصية، وصيغ «في هذه المحاكاة» وما يماثلها.
 */
export const SIMULATION_PATTERNS = /** @type {const} */ ([
  'محاك',
  'المحاكي',
  'ghsim',
  'simulat',
  'Raff',
  'رفّ',
  'iSltanX',
  'مشروع تعليمي',
  'التطبيق التعليمي',
  'نسخة تعليمية',
  'بيانات نموذجية',
  'بيانات تجريبية',
  'لا يُنفَّذ فعليًا',
  'لا يحدث شيء فعلي',
  'لا يُرسَل شيء',
  'لا تُرسَل أي',
  'لا يُحذف أي شيء فعليًا',
  'ضمن العرض التجريبي',
  'في هذا العرض',
  'التجربة التعليمية',
]);

/** حدود الأطوال بالمحارف لضبط التحرير: المختصر جملة قصيرة، والمتوسط والمفصّل أطول منه. */
export const LENGTH_LIMITS = /** @type {const} */ ({
  brief: { min: 10, max: 160 },
  medium: { min: 40, max: 600 },
  detailed: { min: 80, max: 1400 },
  whenToUse: { min: 15, max: 400 },
  reversalLimits: { min: 15, max: 600 },
  example: { min: 10, max: 500 },
});

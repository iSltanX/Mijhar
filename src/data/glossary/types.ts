// أنواع بيانات القاموس (T-3.1)، مشتقة من المجموعات المضبوطة في schema.mjs فلا يتباعد النوع عن الملف.
import type {
  CATEGORIES,
  ENTRY_KINDS,
  PAGE_KINDS,
  PERMISSION_LEVELS,
  REVERSIBILITY,
  SAFETY_LEVELS,
  SIGNATURE_ROLES,
  VERIFICATION_STATUSES,
} from './schema.mjs';

export type Category = (typeof CATEGORIES)[number];
export type Safety = (typeof SAFETY_LEVELS)[number];
export type Reversible = (typeof REVERSIBILITY)[number];
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];
export type EntryKind = (typeof ENTRY_KINDS)[number];
export type SignatureRole = (typeof SIGNATURE_ROLES)[number];
export type PageKind = (typeof PAGE_KINDS)[number];
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/**
 * توقيع دلالي لعنصر واجهة: ما يُطابَق به في الصفحة دون الاعتماد على أسماء الأصناف (CSS) المتغيرة.
 * فرضية تُختبر في T-3.2 على fixture-github-ui-sample.html وعلى صفحات حية؛ ولا يُلصق شرح عند ضعف الثقة.
 */
export interface SemanticSignature {
  /** النصوص الظاهرة أو aria-label كما تعرضها واجهة GitHub الإنجليزية، مطابقة كاملة بلا حساسية لحالة الأحرف. */
  readonly labels: readonly string[];
  readonly roles: readonly SignatureRole[];
  readonly pages: readonly PageKind[];
  /** أنماط مسار href نسبية (تعبير نمطي كنص) تُرجِّح المطابقة؛ اختيارية. */
  readonly hrefPatterns?: readonly string[];
}

export interface Verification {
  readonly status: VerificationStatus;
  /** تاريخ آخر مطابقة للتصريحات (الصلاحية والتراجع) على المصدر، بصيغة YYYY-MM-DD. */
  readonly checkedOn: string;
  /** ملاحظة قصيرة عمّا طُوبق أو ما لم يتأكد منه. */
  readonly note: string;
}

export interface GlossaryEntry {
  readonly id: string;
  readonly kind: EntryKind;
  readonly ar: string;
  readonly en: string;
  readonly category: Category;
  readonly brief: string;
  readonly medium: string;
  readonly detailed: string;
  readonly example?: string;
  readonly safety: Safety;
  readonly reversible: Reversible;
  readonly permission: PermissionLevel;
  readonly permissionNote?: string;
  readonly whenToUse: string;
  readonly reversalLimits: string;
  readonly docsUrl: string | null;
  readonly verification: Verification;
  readonly signature: SemanticSignature | null;
}

export interface GlossaryMeta {
  readonly schemaVersion: number;
  /** العدد المعلن للمدخلات؛ يطابق الفعلي في الملف وفي README. */
  readonly count: number;
  readonly generatedFrom: string;
}

export interface GlossaryData {
  readonly meta: GlossaryMeta;
  readonly entries: readonly GlossaryEntry[];
}

export interface LexiconTerm {
  readonly en: string;
  /** الصيغة العربية المعتمدة (بتعريف). */
  readonly ar: string;
  /** جذور يجب أن يحمل أحدها العربي السابق لـ«(English)» في النص، بلا التعريف ولا لواصق الجمع. */
  readonly stems: readonly string[];
  /** صيغ عربية غير معتمدة وُجدت في المصدر؛ تُستبدل في النقل وتُمنع بعده. */
  readonly variants: readonly string[];
  /** أسماء إنجليزية بديلة تُطابَق بالمصطلح نفسه (مثل PAT). */
  readonly aliases?: readonly string[];
}

export interface Lexicon {
  readonly terms: readonly LexiconTerm[];
  /** مصطلحات تبقى بالإنجليزية في الشرح والترجمة. */
  readonly keepEnglish: readonly string[];
}

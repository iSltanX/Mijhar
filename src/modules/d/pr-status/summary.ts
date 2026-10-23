// بنية ملخص حالة طلب الدمج (T-5.1). كل حقل Value: قيمة مقروءة من الصفحة أو غياب بسبب، فلا تُعرض قيمة مخمّنة (AC-D1).
import type { CategoryCounts, Classification } from './categories';
import type { Value } from './value';

export type PrState = 'open' | 'draft' | 'merged' | 'closed';

export const PR_STATE_LABELS: Readonly<Record<PrState, string>> = {
  open: 'مفتوح',
  draft: 'مسودة',
  merged: 'مدموج',
  closed: 'مغلق',
};

export interface BranchRef {
  readonly branch: string;
  /** owner/repo إن ذُكر في تلميح الفرع («Watad-Project/Watad:main»)، وإلا null. */
  readonly repo: string | null;
}

/** approved وchanges-requested وreview-required من صندوق الدمج (للمسجَّل)؛ وcommented وawaiting وnone من قائمة المراجعين في الشريط الجانبي (لكل زائر). */
export type ReviewState = 'approved' | 'changes-requested' | 'review-required' | 'commented' | 'awaiting' | 'none';

export const REVIEW_LABELS: Readonly<Record<ReviewState, string>> = {
  approved: 'معتمد',
  'changes-requested': 'طُلبت تغييرات',
  'review-required': 'مطلوب مراجعة',
  commented: 'تعليقات مراجعة بلا قرار',
  awaiting: 'بانتظار مراجعة مطلوبة',
  none: 'لا مراجعات',
};

export interface ReviewInfo {
  readonly state: ReviewState;
  /** العبارة التي قُرئت من الصفحة. */
  readonly evidence: string;
  readonly source: 'mergebox' | 'sidebar';
}

export type CheckSource = 'mergebox' | 'status-details' | 'checks-tab';

export interface CheckItem {
  readonly name: string;
  /** معرّف check run من رابط /job/<id> أو check_run_id، إن وُجد. */
  readonly id: string | null;
  readonly classification: Classification;
  /** true/false من شارة «Required» في صندوق الدمج (للمسجَّل)، وnull حين لا يعرضه DOM. */
  readonly required: boolean | null;
  readonly detail: string | null;
  readonly source: CheckSource;
}

export interface RollupInfo {
  /** «95 / 118 checks OK» كما في aria-label الرمز المجمَّع. */
  readonly label: string;
  /** ما يدلّ عليه لون الرمز: ناجح، فاشل، معلّق، أو غير معروف. */
  readonly tone: 'success' | 'danger' | 'pending' | 'unknown';
  readonly passed: number | null;
  readonly total: number | null;
}

export interface ChecksSection {
  readonly items: readonly CheckItem[];
  readonly counts: CategoryCounts;
  /** مصدر الصفوف، أو 'rollup' حين لا يوجد غير الرمز المجمَّع، أو 'none'. */
  readonly source: CheckSource | 'rollup' | 'none';
  readonly rollup: Value<RollupInfo>;
  /** رابط جزء status-details لالتزام الرأس، إن عرضته الصفحة ولم تُقرأ صفوفه بعد. */
  readonly detailsUrl: string | null;
  /** هل عرض DOM شارة «Required» لتمييز الإلزامي من الاختياري. */
  readonly requiredKnown: boolean;
  /** قُرئ مصدر صفوف ولم يُرصد فيه فحص: لا فحوص مُبلَّغ عنها، وليس «قيد التشغيل». */
  readonly noneReported: boolean;
  /** سبب تعذّر جلب الصفوف، إن حاول الموديول وفشل. */
  readonly error: string | null;
}

export interface PrSummary {
  readonly number: Value<number>;
  readonly state: Value<PrState>;
  readonly head: Value<BranchRef>;
  readonly base: Value<BranchRef>;
  /** true: الفرع متأخر عن الهدف. لا قيمة false: لا يُستنتج التحديث من غياب العبارة. */
  readonly behind: Value<boolean>;
  readonly commits: Value<number>;
  readonly files: Value<number>;
  readonly additions: Value<number>;
  readonly deletions: Value<number>;
  readonly reviews: Value<ReviewInfo>;
  /** true: يوجد تعارض يجب حله؛ false: صرّح صندوق الدمج بعدم وجوده. */
  readonly conflicts: Value<boolean>;
  readonly checks: ChecksSection;
  readonly headSha: string | null;
}

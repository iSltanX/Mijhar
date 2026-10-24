// أقسام التحليل الثلاثة (T-11.7، F-D9): فشل الفحص في شرح سجل الفحص، ومراجعة التغييرات في بطاقة طلب الدمج، وفهم المشكلة في صفحتها. لكل قسم
// ميزته في سجل الاتصالات (بوابته)، وقالب البرومبت من T-11.4، والمهمة في سطر، وعناوين ما يُعرض. لا محوّل ولا مزوّد هنا: القسم يطلب من الخلفية
// عبر طبقة المزوّد، فإضافة مزوّد لا تمس هذا الملف ولا ما يعرضه (AC-E9 (٦)).
import type { FeatureId } from '../../../core/connections/features';
import type { PromptId } from '../../e/prompt-templates';

export type AnalysisSectionId = 'checks' | 'pr' | 'issue';

export interface AnalysisSectionDef {
  readonly id: AnalysisSectionId;
  readonly feature: FeatureId;
  /** نص الخيار في القسم. */
  readonly action: string;
  /** عنوان النتيجة. */
  readonly heading: string;
  readonly template: PromptId;
  readonly task: string;
  /** عنوان ما يقترحه النموذج من بنود. */
  readonly findings: string;
  /** عنوان الخطوات. */
  readonly steps: string;
}

export const ANALYSIS_SECTIONS: Readonly<Record<AnalysisSectionId, AnalysisSectionDef>> = {
  checks: {
    id: 'checks',
    feature: 'd.analysis.checks',
    action: 'حلّل الفشل واقترح الإصلاح',
    heading: 'تحليل مقترح من المزوّد',
    template: 'diagnose',
    task: 'حلّل فشل الفحص: السبب المحتمل بدليله، والإصلاح، والخطوة التالية.',
    findings: 'السبب المحتمل',
    steps: 'الإصلاح والخطوة التالية',
  },
  pr: {
    id: 'pr',
    feature: 'd.analysis.pr',
    action: 'راجع تغييرات الطلب',
    heading: 'مراجعة مقترحة من المزوّد',
    template: 'review',
    task: 'راجع تغييرات طلب الدمج: نقاط المراجعة والمخاطر بأدلتها، وما يحتاج تحققًا قبل الدمج.',
    findings: 'نقاط المراجعة',
    steps: 'قبل الدمج',
  },
  issue: {
    id: 'issue',
    feature: 'd.analysis.issue',
    action: 'افهم المشكلة والخطوة التالية',
    heading: 'تحليل مقترح للمشكلة',
    template: 'understand',
    task: 'افهم المشكلة: ما المطلوب ولماذا، وما ينقص من معلومات، والخطوة التالية.',
    findings: 'فهم المشكلة',
    steps: 'الخطوة التالية',
  },
};

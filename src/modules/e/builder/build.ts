// توليد حزمة السياق نصًا (Markdown) من المجموع والاختيار (T-6.1، F-E1 وF-E2). دالة نقية بلا شبكة ولا حالة، فتُعاد عند كل تبديل (PB-05).
// منذ T-11.2 تعرض الحزمة بنية طبقة السياق المشتركة (modules/e/context) ولا تبني لنفسها: الاختيار والاقتطاع بحد أسطر معلن وعدّ المقتطع
// والأجزاء نفسها في الطبقة، والحزمة تمرّر حدودها المعتمدة (DEFAULT_LIMITS) وسياسة الأسرار flag (AD-28: لافتة T-6.3 وإخلاؤها كما هما).
// وقسم «ما تعذّر جمعه أو اقتُطع لطوله» إلزامي في الحزمة دائمًا، ويجمع فجوات الجمع واقتطاعات التنقيح.
import { ITEM, buildContext, contextItems, gapsSection, partHeading, sectionLines, utcStamp } from '../context';
import type { ContextSource, ContextStructure, Gap, Limits as ContextLimits, Snippet } from '../context';

/** حدود أسطر كتل الحزمة. */
export type Limits = Pick<ContextLimits, 'description' | 'comment' | 'error' | 'snippet'>;

/** أضيق من PP-03 لأن الحزمة تُراجَع في معاينتها قبل النسخ؛ وهي المعتمدة منذ T-6.1. */
export const DEFAULT_LIMITS: Limits = { description: 40, comment: 25, error: 20, snippet: 30 };

export interface BuiltBundle {
  readonly text: string;
  /** كل ما يظهر في قسم «ما تعذّر جمعه أو اقتُطع لطوله»: فجوات الجمع ثم الاقتطاعات. */
  readonly gaps: readonly Gap[];
}

/** أجزاء الطبقة التي لا تعرضها الحزمة ولا قائمة اختيارها (يستهلكها البرومبت). */
const NOT_IN_BUNDLE = new Set<string>([ITEM.status, ITEM.log, ITEM.changes]);

/** عناصر قائمة اختيار الحزمة المتاحة في المجموع (الاختيار الافتراضي: كلها). */
export function availableItems(source: ContextSource, snippets: readonly Snippet[]): string[] {
  return contextItems(source, snippets).filter((id) => !NOT_IN_BUNDLE.has(id));
}

/** بنية الطبقة كما تعرضها الحزمة وقوالبها الأربعة: اختيارها وحدودها، والأسرار تُرصد ولا تُحجب. */
export const bundleContext = (source: ContextSource, snippets: readonly Snippet[], selected: ReadonlySet<string>, limits: Limits = DEFAULT_LIMITS): ContextStructure =>
  buildContext(source, { snippets, selected, limits, secrets: 'flag' });

export function footerLines(collectedAt?: number): string[] {
  return ['---', `جُمعت محليًا من الصفحة المفتوحة${collectedAt !== undefined ? ` (${utcStamp(collectedAt)})` : ''} ولم تُرسل إلى أي جهة. راجعها قبل مشاركتها: قد تحوي بيانات خاصة.`];
}

export function buildBundle(source: ContextSource, snippets: readonly Snippet[], selected: ReadonlySet<string>, limits: Limits = DEFAULT_LIMITS, collectedAt?: number): BuiltBundle {
  const { parts, gaps } = bundleContext(source, snippets, selected, limits);
  const lines: string[] = [`# حزمة سياق: ${parts.subject}`, ''];
  const facts = [...parts.repo, ...parts.branch];
  if (facts.length) lines.push(...facts, '');
  for (const part of [parts.description, parts.comments, parts.checks, parts.error, parts.snippets]) {
    if (part) lines.push(...sectionLines(partHeading(part), part.body));
  }
  lines.push(...gapsSection(gaps));
  // سطر فارغ قبل الفاصل: القسم الإلزامي ينتهي بسطر فارغ فيكتفى به كما كان.
  lines.push(...footerLines(collectedAt));
  return { text: lines.join('\n'), gaps };
}

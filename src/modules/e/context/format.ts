// صيغة Markdown المشتركة لأجزاء بنية السياق (نُقلت من منشئ الحزمة كما هي): الاقتباس والسياج وعنوان الجزء وسطر الفجوة والقسم الإلزامي.
// تستعملها الحزمة وقوالبها الأربعة وقوالب البرومبت الخمسة، فلا يبني أي منها اقتباسًا أو سياجًا أو سطر فجوة خاصًّا به.
import type { ContextPageKind, Gap } from './collect';

/** سياج شيفرة أطول من أي سلسلة علامات ` في النص، فلا يُكسر. */
export function fence(text: string, lang = ''): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const mark = '`'.repeat(longest + 1);
  return `${mark}${lang}\n${text}\n${mark}`;
}

export const quote = (text: string): string =>
  text
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n');

const KIND_TEXT: Readonly<Record<Gap['kind'], string>> = { collapsed: 'مطوي', 'not-loaded': 'غير محمّل', unavailable: 'غير متاح', truncated: 'اقتُطع' };

export function gapLine(gap: Gap): string {
  return `- **${gap.part}** (${KIND_TEXT[gap.kind]}): ${gap.reason}${gap.cut ? ` — حُذف ${gap.cut.lines} سطرًا من ${gap.cut.of}` : ''}`;
}

export const GAPS_HEADING = 'ما تعذّر جمعه أو اقتُطع لطوله';

/** وقت بالدقيقة بتوقيت UTC: «2026-10-24 09:30 UTC». */
export const utcStamp = (at: number): string => `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

export const PAGE_TEXT: Readonly<Record<ContextPageKind, string>> = { pr: 'طلب الدمج', issue: 'المشكلة', job: 'مهمة Actions', diff: 'صفحة الفروق' };

/** جزء من بنية السياق: عنوانه الأساسي وتفصيله (العدد أو الملخص بين قوسين) وسطور متنه (بلا العنوان ولا سطر فارغ أخير). */
export interface Part {
  readonly heading: string;
  /** يُلحق بالعنوان بين قوسين («2 من 3»)، أو null. */
  readonly detail: string | null;
  readonly body: readonly string[];
}

/** العنوان الافتراضي للجزء: الأساسي ثم تفصيله بين قوسين. */
export const partHeading = (part: Part, heading = part.heading): string => (part.detail ? `${heading} (${part.detail})` : heading);

/** قسم بعنوانه: `## عنوان` ثم سطر فارغ ثم المتن ثم سطر فارغ. */
export function sectionLines(heading: string, body: readonly string[]): string[] {
  return [`## ${heading}`, '', ...body, ''];
}

/** القسم الإلزامي «ما تعذّر جمعه أو اقتُطع لطوله»، بعنوانه الافتراضي أو عنوان القالب. */
export function gapsSection(gaps: readonly Gap[], heading = GAPS_HEADING): string[] {
  return sectionLines(heading, gaps.length ? gaps.map(gapLine) : ['- لا شيء: جُمع كل ما اختير كاملًا من الصفحة.']);
}

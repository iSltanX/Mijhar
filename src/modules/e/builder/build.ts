// توليد حزمة السياق نصًا (Markdown) من المجموع والاختيار (T-6.1، F-E1 وF-E2). دالة نقية بلا شبكة ولا حالة، فتُعاد عند كل تبديل
// (PB-05). كل كتلة طويلة تُقتطع بحد أسطر معلن، ويُسجَّل الاقتطاع بعدد الأسطر المحذوفة؛ وقسم «ما تعذّر جمعه أو اقتُطع لطوله» إلزامي
// في الحزمة دائمًا، ويجمع فجوات الجمع واقتطاعات البناء.
import type { ContextSource, Gap } from './collect';

export interface Snippet {
  readonly id: string;
  readonly text: string;
  /** من أين أُخذ («تعليق octo-dev»، «الصفحة»). */
  readonly where: string;
}

/** معرّفات عناصر قائمة الاختيار. التعليقات والمقتطفات بمعرّفاتها. */
export const ITEM = {
  repo: 'repo',
  branch: 'branch',
  title: 'title',
  description: 'description',
  checks: 'checks',
  error: 'error',
  comment: (id: string) => `comment:${id}`,
  snippet: (id: string) => `snippet:${id}`,
} as const;

export interface Limits {
  readonly description: number;
  readonly comment: number;
  readonly error: number;
  readonly snippet: number;
}

/** حدود الأسطر لكل كتلة. */
export const DEFAULT_LIMITS: Limits = { description: 40, comment: 25, error: 20, snippet: 30 };

export interface BuiltBundle {
  readonly text: string;
  /** كل ما يظهر في قسم «ما تعذّر جمعه أو اقتُطع لطوله»: فجوات الجمع ثم الاقتطاعات. */
  readonly gaps: readonly Gap[];
}

export const GAPS_HEADING = 'ما تعذّر جمعه أو اقتُطع لطوله';

/** كل العناصر المتاحة في المجموع (الاختيار الافتراضي: كلها). */
export function availableItems(source: ContextSource, snippets: readonly Snippet[]): string[] {
  const ids: string[] = [];
  if (source.repo) ids.push(ITEM.repo);
  if (source.branch) ids.push(ITEM.branch);
  if (source.title) ids.push(ITEM.title);
  if (source.description) ids.push(ITEM.description);
  for (const c of source.comments) ids.push(ITEM.comment(c.id));
  if (source.checks) ids.push(ITEM.checks);
  if (source.errorExcerpt.length) ids.push(ITEM.error);
  for (const s of snippets) ids.push(ITEM.snippet(s.id));
  return ids;
}

function clip(text: string, max: number): { text: string; cut: { lines: number; of: number } | null } {
  const lines = text.split('\n');
  if (lines.length <= max) return { text, cut: null };
  return { text: lines.slice(0, max).join('\n'), cut: { lines: lines.length - max, of: lines.length } };
}

/** سياج شيفرة أطول من أي سلسلة علامات ` في النص، فلا يُكسر. */
export function fence(text: string, lang = ''): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const mark = '`'.repeat(longest + 1);
  return `${mark}${lang}\n${text}\n${mark}`;
}

const quote = (text: string): string =>
  text
    .split('\n')
    .map((l) => (l ? `> ${l}` : '>'))
    .join('\n');

const KIND_TEXT: Readonly<Record<Gap['kind'], string>> = { collapsed: 'مطوي', 'not-loaded': 'غير محمّل', unavailable: 'غير متاح', truncated: 'اقتُطع' };

export function gapLine(gap: Gap): string {
  return `- **${gap.part}** (${KIND_TEXT[gap.kind]}): ${gap.reason}${gap.cut ? ` — حُذف ${gap.cut.lines} سطرًا من ${gap.cut.of}` : ''}`;
}

const PAGE_TEXT: Readonly<Record<ContextSource['kind'], string>> = { pr: 'طلب الدمج', issue: 'المشكلة', job: 'مهمة Actions' };

export function buildBundle(source: ContextSource, snippets: readonly Snippet[], selected: ReadonlySet<string>, limits: Limits = DEFAULT_LIMITS, collectedAt?: number): BuiltBundle {
  const lines: string[] = [];
  const cuts: Gap[] = [];
  const has = (id: string) => selected.has(id);

  lines.push(`# حزمة سياق: ${source.title && has(ITEM.title) ? source.title : PAGE_TEXT[source.kind]}`);
  lines.push('');
  const facts: string[] = [];
  if (source.repo && has(ITEM.repo)) facts.push(`- المستودع: \`${source.repo}\` — https://github.com/${source.repo}`, `- ${PAGE_TEXT[source.kind]}${source.number !== null ? ` #${source.number}` : ''}: ${source.url}`);
  if (source.branch && has(ITEM.branch)) {
    const { head, base, headSha } = source.branch;
    facts.push(`- الفرع: \`${head ?? 'غير متاح'}\` ← \`${base ?? 'غير متاح'}\``, `- التزام الرأس: \`${headSha ?? 'غير متاح'}\``);
  }
  if (facts.length) lines.push(...facts, '');

  if ((source.title && has(ITEM.title)) || (source.description && has(ITEM.description))) {
    lines.push('## العنوان والوصف', '');
    if (source.title && has(ITEM.title)) lines.push(`**${source.title}**`, '');
    if (source.description && has(ITEM.description)) {
      const c = clip(source.description, limits.description);
      lines.push(quote(c.text), '');
      if (c.cut) cuts.push({ part: 'الوصف', kind: 'truncated', reason: `بحد ${limits.description} سطرًا`, cut: c.cut });
    }
  }

  const comments = source.comments.filter((c) => has(ITEM.comment(c.id)));
  if (comments.length) {
    lines.push(`## التعليقات المختارة (${comments.length} من ${source.comments.length})`, '');
    for (const comment of comments) {
      lines.push(`### ${comment.author ?? 'بلا اسم'}${comment.at ? ` — ${comment.at}` : ''}`, '');
      const c = clip(comment.text, limits.comment);
      lines.push(quote(c.text), '');
      if (c.cut) cuts.push({ part: `تعليق ${comment.author ?? comment.id}`, kind: 'truncated', reason: `بحد ${limits.comment} سطرًا`, cut: c.cut });
    }
  }

  if (source.checks && has(ITEM.checks)) {
    lines.push(`## نتائج الفحوص${source.checks.summary ? ` (${source.checks.summary})` : ''}`, '');
    for (const item of source.checks.items) {
      lines.push(`- ${item.failed ? '✗' : '•'} ${item.label}: \`${item.name}\`${item.required === true ? ' — إلزامي' : ''}${item.detail ? ` — ${item.detail}` : ''}`);
    }
    lines.push('');
  }
  if (source.errorExcerpt.length && has(ITEM.error)) {
    const c = clip(source.errorExcerpt.join('\n'), limits.error);
    lines.push('## مقتطف الخطأ', '', fence(c.text), '');
    if (c.cut) cuts.push({ part: 'مقتطف الخطأ', kind: 'truncated', reason: `بحد ${limits.error} سطرًا`, cut: c.cut });
  }

  const chosen = snippets.filter((s) => has(ITEM.snippet(s.id)));
  if (chosen.length) {
    lines.push(`## مقتطفات الأدلة (${chosen.length})`, '');
    chosen.forEach((snippet, i) => {
      const c = clip(snippet.text, limits.snippet);
      lines.push(`### ${i + 1}. من ${snippet.where}`, '', fence(c.text), '');
      if (c.cut) cuts.push({ part: `مقتطف ${i + 1}`, kind: 'truncated', reason: `بحد ${limits.snippet} سطرًا`, cut: c.cut });
    });
  }

  const gaps = [...source.gaps, ...cuts];
  lines.push(`## ${GAPS_HEADING}`, '');
  lines.push(...(gaps.length ? gaps.map(gapLine) : ['- لا شيء: جُمع كل ما اختير كاملًا من الصفحة.']));
  lines.push('', `---`, `جُمعت محليًا من الصفحة المفتوحة${collectedAt !== undefined ? ` (${new Date(collectedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC)` : ''} ولم تُرسل إلى أي جهة. راجعها قبل مشاركتها: قد تحوي بيانات خاصة.`);
  return { text: lines.join('\n'), gaps };
}

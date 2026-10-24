// توليد حزمة السياق نصًا (Markdown) من المجموع والاختيار (T-6.1، F-E1 وF-E2). دالة نقية بلا شبكة ولا حالة، فتُعاد عند كل تبديل
// (PB-05). كل كتلة طويلة تُقتطع بحد أسطر معلن، ويُسجَّل الاقتطاع بعدد الأسطر المحذوفة؛ وقسم «ما تعذّر جمعه أو اقتُطع لطوله» إلزامي
// في الحزمة دائمًا، ويجمع فجوات الجمع واقتطاعات البناء.
// الأجزاء (buildParts) تُبنى مرة واحدة هنا، وتستهلكها الحزمة العامة (buildBundle) وقوالبها الأربعة (T-6.2، modules/e/templates) بعناوينها
// هي: فلا يبني أي قالب اقتطاعًا ولا اقتباسًا ولا سياجًا خاصًّا به (لا مسار موازٍ).
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

export const PAGE_TEXT: Readonly<Record<ContextSource['kind'], string>> = { pr: 'طلب الدمج', issue: 'المشكلة', job: 'مهمة Actions' };

/** جزء من الحزمة: عنوانه الافتراضي وسطور متنه (بلا العنوان ولا سطر فارغ أخير). غائب (null) إن لم يُختر أو لم يتوفر. */
export interface Part {
  readonly heading: string;
  readonly body: readonly string[];
}

export interface BundleParts {
  /** «حزمة سياق: …» أو اسم الصفحة إن لم يُختر العنوان. */
  readonly title: string;
  /** سطور المستودع والرابط (قائمة نقطية بلا عنوان). */
  readonly repo: readonly string[];
  /** سطور الفرع والتزام الرأس. */
  readonly branch: readonly string[];
  /** العنوان بخط عريض ثم الوصف مقتبسًا. */
  readonly description: Part | null;
  readonly comments: Part | null;
  readonly checks: Part | null;
  readonly error: Part | null;
  readonly snippets: Part | null;
  /** ما اقتُطع أثناء البناء (يُضاف إلى فجوات الجمع في القسم الإلزامي). */
  readonly cuts: readonly Gap[];
}

export function buildParts(source: ContextSource, snippets: readonly Snippet[], selected: ReadonlySet<string>, limits: Limits = DEFAULT_LIMITS): BundleParts {
  const cuts: Gap[] = [];
  const has = (id: string) => selected.has(id);

  const repo: string[] = [];
  if (source.repo && has(ITEM.repo)) repo.push(`- المستودع: \`${source.repo}\` — https://github.com/${source.repo}`, `- ${PAGE_TEXT[source.kind]}${source.number !== null ? ` #${source.number}` : ''}: ${source.url}`);
  const branch: string[] = [];
  if (source.branch && has(ITEM.branch)) {
    const { head, base, headSha } = source.branch;
    branch.push(`- الفرع: \`${head ?? 'غير متاح'}\` ← \`${base ?? 'غير متاح'}\``, `- التزام الرأس: \`${headSha ?? 'غير متاح'}\``);
  }

  let description: Part | null = null;
  if ((source.title && has(ITEM.title)) || (source.description && has(ITEM.description))) {
    const body: string[] = [];
    if (source.title && has(ITEM.title)) body.push(`**${source.title}**`);
    if (source.description && has(ITEM.description)) {
      const c = clip(source.description, limits.description);
      if (body.length) body.push('');
      body.push(quote(c.text));
      if (c.cut) cuts.push({ part: 'الوصف', kind: 'truncated', reason: `بحد ${limits.description} سطرًا`, cut: c.cut });
    }
    description = { heading: 'العنوان والوصف', body };
  }

  let comments: Part | null = null;
  const chosenComments = source.comments.filter((c) => has(ITEM.comment(c.id)));
  if (chosenComments.length) {
    const body: string[] = [];
    for (const comment of chosenComments) {
      if (body.length) body.push('');
      body.push(`### ${comment.author ?? 'بلا اسم'}${comment.at ? ` — ${comment.at}` : ''}`, '');
      const c = clip(comment.text, limits.comment);
      body.push(quote(c.text));
      if (c.cut) cuts.push({ part: `تعليق ${comment.author ?? comment.id}`, kind: 'truncated', reason: `بحد ${limits.comment} سطرًا`, cut: c.cut });
    }
    comments = { heading: `التعليقات المختارة (${chosenComments.length} من ${source.comments.length})`, body };
  }

  let checks: Part | null = null;
  if (source.checks && has(ITEM.checks)) {
    checks = {
      heading: `نتائج الفحوص${source.checks.summary ? ` (${source.checks.summary})` : ''}`,
      body: source.checks.items.map((item) => `- ${item.failed ? '✗' : '•'} ${item.label}: \`${item.name}\`${item.required === true ? ' — إلزامي' : ''}${item.detail ? ` — ${item.detail}` : ''}`),
    };
  }

  let error: Part | null = null;
  if (source.errorExcerpt.length && has(ITEM.error)) {
    const c = clip(source.errorExcerpt.join('\n'), limits.error);
    error = { heading: 'مقتطف الخطأ', body: [fence(c.text)] };
    if (c.cut) cuts.push({ part: 'مقتطف الخطأ', kind: 'truncated', reason: `بحد ${limits.error} سطرًا`, cut: c.cut });
  }

  let snippetPart: Part | null = null;
  const chosen = snippets.filter((s) => has(ITEM.snippet(s.id)));
  if (chosen.length) {
    const body: string[] = [];
    chosen.forEach((snippet, i) => {
      const c = clip(snippet.text, limits.snippet);
      if (body.length) body.push('');
      body.push(`### ${i + 1}. من ${snippet.where}`, '', fence(c.text));
      if (c.cut) cuts.push({ part: `مقتطف ${i + 1}`, kind: 'truncated', reason: `بحد ${limits.snippet} سطرًا`, cut: c.cut });
    });
    snippetPart = { heading: `مقتطفات الأدلة (${chosen.length})`, body };
  }

  return {
    title: `حزمة سياق: ${source.title && has(ITEM.title) ? source.title : PAGE_TEXT[source.kind]}`,
    repo,
    branch,
    description,
    comments,
    checks,
    error,
    snippets: snippetPart,
    cuts,
  };
}

/** قسم بعنوانه: `## عنوان` ثم سطر فارغ ثم المتن ثم سطر فارغ. */
export function sectionLines(heading: string, body: readonly string[]): string[] {
  return [`## ${heading}`, '', ...body, ''];
}

/** فجوات الجمع ثم اقتطاعات البناء (الترتيب الذي يظهر في الواجهة وفي الحزمة). */
export const allGaps = (source: ContextSource, parts: BundleParts): readonly Gap[] => [...source.gaps, ...parts.cuts];

/** القسم الإلزامي «ما تعذّر جمعه أو اقتُطع لطوله»، بعنوانه الافتراضي أو عنوان القالب. */
export function gapsSection(gaps: readonly Gap[], heading = GAPS_HEADING): string[] {
  return sectionLines(heading, gaps.length ? gaps.map(gapLine) : ['- لا شيء: جُمع كل ما اختير كاملًا من الصفحة.']);
}

export function footerLines(collectedAt?: number): string[] {
  return ['---', `جُمعت محليًا من الصفحة المفتوحة${collectedAt !== undefined ? ` (${new Date(collectedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC)` : ''} ولم تُرسل إلى أي جهة. راجعها قبل مشاركتها: قد تحوي بيانات خاصة.`];
}

export function buildBundle(source: ContextSource, snippets: readonly Snippet[], selected: ReadonlySet<string>, limits: Limits = DEFAULT_LIMITS, collectedAt?: number): BuiltBundle {
  const parts = buildParts(source, snippets, selected, limits);
  const lines: string[] = [`# ${parts.title}`, ''];
  const facts = [...parts.repo, ...parts.branch];
  if (facts.length) lines.push(...facts, '');
  for (const part of [parts.description, parts.comments, parts.checks, parts.error, parts.snippets]) {
    if (part) lines.push(...sectionLines(part.heading, part.body));
  }
  const gaps = allGaps(source, parts);
  lines.push(...gapsSection(gaps));
  // سطر فارغ قبل الفاصل: القسم الإلزامي ينتهي بسطر فارغ فيكتفى به كما كان.
  lines.push(...footerLines(collectedAt));
  return { text: lines.join('\n'), gaps };
}

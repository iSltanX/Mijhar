// طبقة السياق المشتركة (T-11.2) — المرحلة الثالثة: الباني. يأخذ المجموع بعد المنقّح وحده (formatParts لا يقبل إلا SanitizedContext، وbuildContext
// يستدعي المنقّح أولًا) ويخرج بنية سياق واحدة يستهلكها كل قسم:
//  - أجزاء جاهزة للعرض Markdown: المصدر والعنوان والوصف والتعليقات والفحوص ومقتطف الخطأ والأدلة (كما كانت تبنيها الحزمة، فلا يتغير مخرجها
//    ولا مخرج قوالبها الأربعة، AD-28)، ومعها الفحوص الفاشلة والحالة والموانع ومقتطفات السجل وما استخرجه محلله والتغييرات وروابط الأدلة.
//  - جرد لكل جزء: جُمع بعدده، أو لم يُختر، أو لم يصل بسببه.
//  - الفجوات: فجوات الجمع ثم ما اقتُطع بعدد أسطره؛ وتقرير الأسرار (ما حُجب أو رُصد).
// حزمة السياق (T-6.1) وقوالبها (T-6.2) وقوالب البرومبت (T-11.4) تعرض هذه البنية ولا تبني أجزاءً لنفسها (AD-22، TEST-CTX-05).
import { FILE_KIND_LABELS } from '../../d/compare/file-kinds';
import { METHOD_NOTICE } from '../../d/blockers/explain';
import type { Blocker } from '../../d/blockers/explain';
import { NO_ROOT_CAUSE_TEXT } from '../../d/log-parser/parse';
import type { CheckLine, ContextPageKind, ContextSource, Gap, Snippet } from './collect';
import { PAGE_TEXT, fence, quote } from './format';
import type { Part } from './format';
import { sanitize } from './sanitize';
import type { Limits, SanitizeOptions, SanitizedContext, SecretsReport } from './sanitize';

export interface ContextParts {
  /** عنوان الصفحة إن اختير، وإلا اسم نوعها («طلب الدمج»). */
  readonly subject: string;
  /** سطور المستودع والرابط (قائمة نقطية بلا عنوان). */
  readonly repo: readonly string[];
  /** سطور الفرع والتزام الرأس (أو طرفي المقارنة والالتزام). */
  readonly branch: readonly string[];
  /** العنوان بخط عريض ثم الوصف مقتبسًا. */
  readonly description: Part | null;
  readonly comments: Part | null;
  readonly checks: Part | null;
  /** الفاشلة وحدها من الفحوص المقروءة. */
  readonly failedChecks: Part | null;
  readonly error: Part | null;
  readonly snippets: Part | null;
  readonly status: Part | null;
  /** الطبقة الأولى من محلل السجل: الرسائل الحرفية بموضعها. */
  readonly log: Part | null;
  /** الطبقتان الثانية والثالثة: السبب المثبت بنمطه ودليله، والاحتمالات موسومة. */
  readonly causes: Part | null;
  readonly changes: Part | null;
  readonly links: Part | null;
}

export type PartKey = 'source' | 'description' | 'comments' | 'checks' | 'error' | 'snippets' | 'status' | 'log' | 'changes' | 'links';

export const PART_KEYS: readonly PartKey[] = ['source', 'description', 'comments', 'checks', 'error', 'snippets', 'status', 'log', 'changes', 'links'];

export type PartState =
  | { readonly state: 'collected'; readonly count: number; readonly note: string | null }
  | { readonly state: 'excluded'; readonly reason: string }
  | { readonly state: 'missing'; readonly reason: string };

export interface ContextStructure {
  readonly kind: ContextPageKind;
  readonly url: string;
  readonly subject: string;
  readonly parts: ContextParts;
  /** ما جُمع وما لم يُختر وما لم يصل بسببه، لكل جزء. */
  readonly inventory: Readonly<Record<PartKey, PartState>>;
  /** فجوات الجمع ثم ما اقتُطع أثناء التنقيح بعدد أسطره: بنود قسم «ما تعذّر جمعه» في الحزمة و«المعلومات الناقصة» في البرومبت. */
  readonly gaps: readonly Gap[];
  readonly secrets: SecretsReport;
  readonly limits: Limits;
  readonly collectedAt: number | null;
}

export interface ContextOptions extends SanitizeOptions {
  readonly snippets?: readonly Snippet[];
  readonly collectedAt?: number;
}

const iso = (at: number): string => `${new Date(at).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const checkLine = (item: CheckLine): string => `- ${item.failed ? '✗' : '•'} ${item.label}: \`${item.name}\`${item.required === true ? ' — إلزامي' : ''}${item.detail ? ` — ${item.detail}` : ''}`;

function totalsText(totals: { files: number | null; additions: number | null; deletions: number | null }): string | null {
  const parts = [totals.files !== null ? `${totals.files} ملفًا` : null, totals.additions !== null ? `+${totals.additions}` : null, totals.deletions !== null ? `−${totals.deletions}` : null].filter(Boolean);
  return parts.length ? parts.join('، ') : null;
}

function statusPart(s: SanitizedContext): Part | null {
  if (!s.status) return null;
  const { report } = s.status;
  const body: string[] = [`- حالة الطلب: ${s.status.state ?? 'غير متاحة في الصفحة'}`];
  if (s.status.review) body.push(`- المراجعات: ${s.status.review}`);
  const lines = (b: Blocker, tag: string): string[] => [
    `- **${tag}**: ${b.title}`,
    ...b.evidence.map((e) => `  - ${e.where}${e.source === 'api' ? ' (API)' : ''}: «${e.text}»${e.note ? ` — ${e.note}` : ''}`),
  ];
  for (const b of report.blockers) body.push(...lines(b, 'يمنع'));
  for (const b of report.attention) body.push(...lines(b, 'قد يمنع'));
  if (report.state === 'explained' && !report.blockers.length && !report.attention.length) body.push('- لا مانع دمج في الأدلة المقروءة.');
  for (const note of report.notes) body.push(`- ${note}`);
  body.push(`- مصدر الأدلة: ${s.status.apiReadAt !== null ? `الصفحة وGitHub API (قُرئت ${iso(s.status.apiReadAt)})` : 'الصفحة وحدها'}.`, `- ${METHOD_NOTICE}`);
  const counted = report.blockers.length + report.attention.length;
  return { heading: 'الحالة والموانع', detail: counted ? `${report.blockers.length} يمنع، ${report.attention.length} قد يمنع` : null, body };
}

function logParts(s: SanitizedContext): { log: Part | null; causes: Part | null } {
  if (!s.log) return { log: null, causes: null };
  const { analysis, excerpt } = s.log;
  const a = analysis.availability;
  const detail = a.state === 'full' ? `قُرئ ${a.lines} سطرًا` : a.state === 'truncated' ? `مقتطع: قُرئ ${a.readLines}${a.totalLines !== null ? ` من ${a.totalLines}` : ''} سطرًا` : 'السجل غير متاح: التنبيهات الظاهرة وحدها';
  let log: Part | null = null;
  if (excerpt !== null) log = { heading: 'مقتطفات السجل', detail, body: [fence(excerpt)] };
  else if (a.state !== 'unavailable') log = { heading: 'مقتطفات السجل', detail, body: ['- لم تُرصد في السجل المقروء رسالة خطأ ولا سطر طابق نمطًا.'] };

  const body: string[] = [];
  const { step, exitCode, exitLine } = analysis.location;
  const stepText = step ? (step.name && step.number !== null ? `${step.number}. ${step.name}` : (step.name ?? `الخطوة ${step.number}`)) : null;
  if (stepText || exitCode !== null) body.push(`- موضع الفشل: ${[stepText, exitCode !== null ? `كود الخروج ${exitCode}${exitLine !== null ? ` (السطر ${exitLine})` : ''}` : null].filter(Boolean).join('، ')}`);
  if (analysis.rootCauses.length) {
    for (const c of analysis.rootCauses) {
      body.push(
        `- **سبب مثبت بنمط** «${c.patternTitle}»: ${c.cause}${c.detail ? ` — ${c.detail}` : ''}`,
        `  - الدليل${c.evidence.line !== null ? ` (السطر ${c.evidence.line})` : ''}${c.evidence.origin === 'annotation' ? ' من تنبيه' : ''}: «${c.evidence.text}»`,
      );
    }
  } else body.push(`- ${NO_ROOT_CAUSE_TEXT}.`);
  for (const p of analysis.possibilities) body.push(`- **${p.tag}**: ${p.text} (بُني على: ${p.basis}${p.quote ? `؛ السطر ${p.quote.line}: «${p.quote.text}»` : ''})`);
  return { log, causes: { heading: 'ما استخرجه محلل السجل', detail: null, body } };
}

function changesPart(s: SanitizedContext): Part | null {
  if (!s.changes) return null;
  const { totals, files, patch } = s.changes;
  const body = files.map((f) => `- \`${f.path}\` (${FILE_KIND_LABELS[f.kind]}${f.additions !== null && f.deletions !== null ? `، +${f.additions} −${f.deletions}` : ''})`);
  const counts = totalsText(totals);
  if (!files.length && counts) body.push(`- ${counts} (${s.kind === 'pr' ? 'من ترويسة الطلب؛ أسماء الملفات وأسطرها في تبويب «Files changed» لم تُجمع من صفحة المحادثة' : 'كما تعرضها الصفحة'}).`);
  if (patch !== null) body.push('', fence(patch, 'diff'));
  return body.length ? { heading: 'التغييرات', detail: counts, body } : null;
}

function linksPart(s: SanitizedContext): Part | null {
  const links: string[] = [];
  if (s.repo) {
    links.push(`- ${PAGE_TEXT[s.kind]}${s.number !== null ? ` #${s.number}` : ''}: ${s.url}`);
    if (s.branch?.headSha && s.kind !== 'diff') links.push(`- التزام الرأس: https://github.com/${s.repo}/commit/${s.branch.headSha}`);
  }
  for (const c of s.comments) if (/^issuecomment-\d+$/.test(c.id)) links.push(`- تعليق ${c.author ?? 'بلا اسم'}: ${s.url}#${c.id}`);
  for (const item of s.checks?.items ?? []) if (item.failed && item.url) links.push(`- سجل ${item.name}: ${item.url}`);
  return links.length ? { heading: 'روابط الأدلة', detail: String(links.length), body: links } : null;
}

/** أجزاء العرض من المجموع المنقّح وحده. */
export function formatParts(s: SanitizedContext): ContextParts {
  const repo: string[] = [];
  if (s.repo) repo.push(`- المستودع: \`${s.repo}\` — https://github.com/${s.repo}`, `- ${PAGE_TEXT[s.kind]}${s.number !== null ? ` #${s.number}` : ''}: ${s.url}`);
  const branch: string[] = [];
  if (s.branch) {
    const { head, base, headSha } = s.branch;
    if (s.kind !== 'diff') branch.push(`- الفرع: \`${head ?? 'غير متاح'}\` ← \`${base ?? 'غير متاح'}\``, `- التزام الرأس: \`${headSha ?? 'غير متاح'}\``);
    else {
      if (head || base) branch.push(`- المقارنة: \`${head ?? 'غير متاح'}\` ← \`${base ?? 'غير متاح'}\``);
      if (headSha) branch.push(`- الالتزام: \`${headSha}\``);
    }
  }

  let description: Part | null = null;
  if (s.title || s.description !== null) {
    const body: string[] = [];
    if (s.title) body.push(`**${s.title}**`);
    if (s.description !== null) {
      if (body.length) body.push('');
      body.push(quote(s.description));
    }
    description = { heading: 'العنوان والوصف', detail: null, body };
  }

  let comments: Part | null = null;
  if (s.comments.length) {
    const body: string[] = [];
    for (const comment of s.comments) {
      if (body.length) body.push('');
      body.push(`### ${comment.author ?? 'بلا اسم'}${comment.at ? ` — ${comment.at}` : ''}`, '', quote(comment.text));
    }
    comments = { heading: 'التعليقات المختارة', detail: `${s.comments.length} من ${s.available.comments}`, body };
  }

  let checks: Part | null = null;
  let failedChecks: Part | null = null;
  if (s.checks) {
    checks = { heading: 'نتائج الفحوص', detail: s.checks.summary || null, body: s.checks.items.map(checkLine) };
    const failed = s.checks.items.filter((i) => i.failed);
    failedChecks = { heading: 'الفحوص الفاشلة', detail: `${failed.length} من ${s.checks.items.length}`, body: failed.length ? failed.map(checkLine) : ['- لا فحص فاشل في الصفوف المقروءة.'] };
  }

  const error: Part | null = s.error !== null ? { heading: 'مقتطف الخطأ', detail: null, body: [fence(s.error)] } : null;

  let snippets: Part | null = null;
  if (s.snippets.length) {
    const body: string[] = [];
    s.snippets.forEach((snippet, i) => {
      if (body.length) body.push('');
      body.push(`### ${i + 1}. من ${snippet.where}`, '', fence(snippet.text));
    });
    snippets = { heading: 'مقتطفات الأدلة', detail: String(s.snippets.length), body };
  }

  return {
    subject: s.title ?? PAGE_TEXT[s.kind],
    repo,
    branch,
    description,
    comments,
    checks,
    failedChecks,
    error,
    snippets,
    status: statusPart(s),
    ...logParts(s),
    changes: changesPart(s),
    links: linksPart(s),
  };
}

const ABSENT: Readonly<Record<'checks' | 'error' | 'log' | 'changes' | 'comments', Readonly<Record<ContextPageKind, string>>>> = {
  checks: { pr: 'لا تعرض الصفحة صفوف الفحوص', issue: 'صفحة المشكلة لا تحمل فحوصًا', job: 'لم تُقرأ خطوات المهمة من الصفحة', diff: 'صفحة الفروق لا تعرض نتائج الفحوص' },
  error: { pr: 'لا فحص فاشل في الصفوف المقروءة', issue: 'صفحة المشكلة لا تحمل فحوصًا فاشلة', job: 'لا تنبيه خطأ في صفحة المهمة', diff: 'صفحة الفروق لا تعرض أخطاء فحوص' },
  log: {
    pr: 'نص سجل الفحص لا تعرضه صفحة الطلب، ولم يُمرَّر إلى الطبقة سجل مقروء',
    issue: 'لا سجل فحص في صفحة المشكلة',
    job: 'نص السجل لم يُقرأ: يُقرأ بنقر «اقرأ سجل الخطوة الفاشلة» في «شرح سجل الفحص»، ولم يُمرَّر إلى الطبقة',
    diff: 'لا سجل فحص في صفحة الفروق',
  },
  changes: { pr: 'لم تُقرأ أعداد التغييرات من ترويسة الطلب', issue: 'صفحة المشكلة لا تحمل تغييرات', job: 'صفحة المهمة لا تعرض التغييرات', diff: 'لم تُقرأ ملفات متغيرة في الصفحة' },
  comments: { pr: 'لا تعليقات ظاهرة في الصفحة', issue: 'لا تعليقات ظاهرة في الصفحة', job: 'لا نقاش في صفحة المهمة', diff: 'لا نقاش في صفحة الفروق' },
};

const NOT_SELECTED: PartState = { state: 'excluded', reason: 'لم يُختر' };

function inventoryOf(s: SanitizedContext, parts: ContextParts): Record<PartKey, PartState> {
  const collected = (count: number, note: string | null = null): PartState => ({ state: 'collected', count, note });
  const missing = (reason: string): PartState => ({ state: 'missing', reason });
  const gap = (...names: string[]): string | null => s.gaps.filter((g) => names.includes(g.part)).map((g) => g.reason).join('؛ ') || null;
  const { available } = s;
  const logGap = gap('السجل') ?? (s.kind === 'job' ? gap('مقتطف الخطأ') : null);
  return {
    source: s.repo ? collected(1) : available.repo ? NOT_SELECTED : missing('لم يُقرأ المستودع من مسار الصفحة'),
    description: parts.description ? collected(1) : available.title || available.description ? NOT_SELECTED : missing(gap('الوصف') ?? `${PAGE_TEXT[s.kind]} بلا عنوان ولا وصف في الصفحة`),
    comments: s.comments.length ? collected(s.comments.length, s.comments.length < available.comments ? `${s.comments.length} من ${available.comments}` : null) : available.comments ? NOT_SELECTED : missing(gap('التعليقات') ?? ABSENT.comments[s.kind]),
    checks: s.checks ? collected(s.checks.items.length, gap('نتائج الفحوص')) : available.checks ? NOT_SELECTED : missing(gap('نتائج الفحوص') ?? ABSENT.checks[s.kind]),
    error: s.error !== null ? collected(s.error.split('\n').length) : available.error ? NOT_SELECTED : missing(gap('مقتطف الخطأ') ?? ABSENT.error[s.kind]),
    snippets: s.snippets.length ? collected(s.snippets.length) : available.snippets ? NOT_SELECTED : missing('لم يُضف مقتطف دليل من تحديد في الصفحة'),
    status: s.status ? collected(s.status.report.blockers.length + s.status.report.attention.length) : available.status ? NOT_SELECTED : missing(s.kind === 'pr' ? 'لم تُقرأ حالة الطلب' : 'حالة الدمج وموانعه تخص صفحة طلب الدمج'),
    log: parts.log && s.log ? collected(s.log.analysis.messages.length, gap('السجل')) : available.log && !s.log ? NOT_SELECTED : missing(logGap ?? ABSENT.log[s.kind]),
    changes: s.changes && parts.changes
      ? collected(s.changes.files.length || (s.changes.totals.files ?? 0), s.changes.files.length ? gap('التغييرات', 'أسطر الفروق') : 'أعداد من ترويسة الطلب؛ أسماء الملفات وأسطرها في تبويب «Files changed»')
      : available.changes && !s.changes
        ? NOT_SELECTED
        : missing(gap('التغييرات') ?? ABSENT.changes[s.kind]),
    links: parts.links ? collected(parts.links.body.length) : missing('لا رابط دليل: لم يُختر المصدر ولا تعليق ولا فحص فاشل برابط'),
  };
}

/** الطبقة كاملة على مجموع: المنقّح ثم الباني. لا طريق إلى الأجزاء إلا بعد المنقّح. */
export function buildContext(source: ContextSource, options: ContextOptions = {}): ContextStructure {
  const s = sanitize(source, options.snippets ?? [], options);
  const parts = formatParts(s);
  return {
    kind: s.kind,
    url: s.url,
    subject: parts.subject,
    parts,
    inventory: inventoryOf(s, parts),
    gaps: [...s.gaps, ...s.cuts],
    secrets: s.secrets,
    limits: s.limits,
    collectedAt: options.collectedAt ?? null,
  };
}

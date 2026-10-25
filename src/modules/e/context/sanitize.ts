// طبقة السياق المشتركة (T-11.2) — المرحلة الثانية: المنقّح. يمرّ عليه كل محتوى قبل أي استخدام، بثلاث خطوات بالترتيب:
//  1. الاختيار: ما اختير وحده (معرّفات ITEM؛ وغياب الاختيار = كل المتاح، كما في البرومبت بلا قائمة اختيار).
//  2. الاقتطاع: كل كتلة طويلة تُقتطع بحد أسطر معلن (PP-03: 400 سطر لكل قسم افتراضيًا؛ والحزمة تمرّر حدودها الأضيق المعتمدة)، ويُسجَّل
//     المقتطع بعدد أسطره المحذوفة ومن كم، فلا يُقتطع شيء بصمت.
//  3. الأسرار: فاحص القائمة المعرّفة نفسه (T-6.3، privacy-check) على كل نص فيما اختير، ومنه الفجوات وأسماء الأجزاء:
//     - mask (الافتراضي، لكل ما يُنسخ برومبتًا أو يُرسل): يحجب كل موضع مطابق ويعدّه بجزئه ونمطه، فلا يبقى في المخرج سرّ مطابق (AC-E8).
//     - flag (حزمة السياق، AD-28): لا يغيّر النص ويعدّ المواضع؛ فالحزمة تُعرض في معاينة قابلة للتعديل فوقها لافتة T-6.3 وإخلاؤها «لا يزيل
//       أي نص»، وفاحصها يظلّل ما يرصده بموضعه في النص الذي سيُنسخ.
// دالة نقية بلا شبكة ولا حالة.
import type { Blocker } from '../../d/blockers/explain';
import type { LogAnalysis } from '../../d/log-parser/parse';
import { groupMessages } from '../../d/log-parser/view';
import { scanText } from '../privacy-check/scan';
import type { Finding } from '../privacy-check/scan';
import type { ChangedFile, Changes, CommentInfo, ContextPageKind, ContextSource, Gap, PrStatus, Snippet } from './collect';
import { LINE_LIMIT_DEFAULT } from './settings';

/** معرّفات ما يدخل السياق. التعليقات والمقتطفات بمعرّفاتها. */
export const ITEM = {
  repo: 'repo',
  branch: 'branch',
  title: 'title',
  description: 'description',
  checks: 'checks',
  error: 'error',
  status: 'status',
  log: 'log',
  changes: 'changes',
  comment: (id: string) => `comment:${id}`,
  snippet: (id: string) => `snippet:${id}`,
} as const;

/** كل ما يتاح في المجموع، بترتيب ثابت: أجزاء حزمة السياق أولًا (ترتيب قائمة اختيارها)، ثم الحالة والسجل والتغييرات. */
export function contextItems(source: ContextSource, snippets: readonly Snippet[]): string[] {
  const ids: string[] = [];
  if (source.repo) ids.push(ITEM.repo);
  if (source.branch) ids.push(ITEM.branch);
  if (source.title) ids.push(ITEM.title);
  if (source.description) ids.push(ITEM.description);
  for (const c of source.comments) ids.push(ITEM.comment(c.id));
  if (source.checks) ids.push(ITEM.checks);
  if (source.errorExcerpt.length) ids.push(ITEM.error);
  for (const s of snippets) ids.push(ITEM.snippet(s.id));
  if (source.status) ids.push(ITEM.status);
  if (source.log) ids.push(ITEM.log);
  if (source.changes) ids.push(ITEM.changes);
  return ids;
}

/** حد الأسطر لكل كتلة: الوصف، وكل تعليق، ومقتطف الخطأ، وكل مقتطف دليل، ومقتطفات السجل، وأسطر الفروق. */
export interface Limits {
  readonly description: number;
  readonly comment: number;
  readonly error: number;
  readonly snippet: number;
  readonly log: number;
  readonly changes: number;
}

/** PP-03: 400 سطر لكل قسم. */
export const CONTEXT_LIMITS: Limits = {
  description: LINE_LIMIT_DEFAULT,
  comment: LINE_LIMIT_DEFAULT,
  error: LINE_LIMIT_DEFAULT,
  snippet: LINE_LIMIT_DEFAULT,
  log: LINE_LIMIT_DEFAULT,
  changes: LINE_LIMIT_DEFAULT,
};

/** حدود كلها بحد واحد (قيمة إعداد PP-03). */
export const limitsOf = (lines: number): Limits => ({ description: lines, comment: lines, error: lines, snippet: lines, log: lines, changes: lines });

export type SecretPolicy = 'mask' | 'flag';

/** ما رصده الفاحص في جزء بنمط واحد. */
export interface SecretHit {
  readonly part: string;
  readonly patternId: string;
  readonly label: string;
  readonly count: number;
}

export interface SecretsReport {
  readonly policy: SecretPolicy;
  /** mask: ما حُجب؛ flag: ما رُصد وبقي كما هو. */
  readonly hits: readonly SecretHit[];
  readonly total: number;
}

export interface SanitizeOptions {
  /** ما يدخل (معرّفات ITEM)؛ غيابه = كل المتاح. */
  readonly selected?: ReadonlySet<string>;
  /** حدود الأسطر؛ وما لم يُذكر فحدّه PP-03. */
  readonly limits?: Partial<Limits>;
  /** الافتراضي mask. */
  readonly secrets?: SecretPolicy;
}

export interface SanitizedLog {
  /** الطبقات الثلاث كما أعادها المحلل (T-5.3). */
  readonly analysis: LogAnalysis;
  /** الطبقة الأولى نصًّا (الرسائل الحرفية بموضعها وأسطرها المحيطة) مقتطعًا بحده، أو null إن لم تُرصد رسالة. */
  readonly excerpt: string | null;
}

export interface SanitizedChanges {
  readonly totals: Changes['totals'];
  readonly files: readonly Omit<ChangedFile, 'patch'>[];
  readonly complete: boolean;
  /** أسطر الفروق مجتمعة بترويسة كل ملف، مقتطعة بحدها، أو null حين لا تعرضها الصفحة. */
  readonly patch: string | null;
}

/** المجموع بعد المنقّح: ما اختير وحده، مقتطعًا ومفحوصًا. الغائب أو غير المختار null أو فارغ. */
export interface SanitizedContext {
  readonly kind: ContextPageKind;
  readonly url: string;
  readonly number: number | null;
  readonly repo: string | null;
  readonly title: string | null;
  readonly branch: ContextSource['branch'];
  readonly description: string | null;
  readonly comments: readonly CommentInfo[];
  readonly checks: ContextSource['checks'];
  /** مقتطف الخطأ سطورًا مجتمعة مقتطعة، أو null. */
  readonly error: string | null;
  readonly snippets: readonly Snippet[];
  readonly status: PrStatus | null;
  readonly log: SanitizedLog | null;
  readonly changes: SanitizedChanges | null;
  /** قيم GitHub في مقتطف الخطأ وفي الحالة والموانع كما وردت، بلا صياغة مِجهَر (F-04)؛ للمختار منهما وحده، محجوبةً كأصلها دون أن
   *  تُعدّ أسرارها مرة ثانية. */
  readonly verbatim: { readonly error: readonly string[]; readonly status: readonly string[] };
  /** ما كان متاحًا في المجموع قبل الاختيار (للجرد: «لم يُختر» غير «لم يصل»)، بلا أي محتوى. */
  readonly available: Readonly<Record<'repo' | 'branch' | 'title' | 'description' | 'checks' | 'error' | 'status' | 'log' | 'changes', boolean>> & { readonly comments: number; readonly snippets: number };
  /** فجوات الجمع (كلها، اختير جزؤها أم لا). */
  readonly gaps: readonly Gap[];
  /** ما اقتطعه المنقّح، بترتيب الأجزاء. */
  readonly cuts: readonly Gap[];
  readonly limits: Limits;
  readonly secrets: SecretsReport;
}

function clip(text: string, max: number): { text: string; cut: { lines: number; of: number } | null } {
  const lines = text.split('\n');
  if (lines.length <= max) return { text, cut: null };
  return { text: lines.slice(0, max).join('\n'), cut: { lines: lines.length - max, of: lines.length } };
}

const ORIGIN: Readonly<Record<LogAnalysis['messages'][number]['origin'], string>> = { 'error-marker': '##[error]', 'pattern-line': 'سطر طابق نمطًا', annotation: 'تنبيه' };

/** الطبقة الأولى من التحليل نصًّا: لكل كتلة رسائل متجاورة (بتجميع شرح السجل نفسه) موضعها ثم أسطرها بأرقامها، والسطر المقصود بعلامة >. */
function logExcerpt(log: LogAnalysis): string | null {
  const out: string[] = [];
  for (const block of groupMessages(log.messages)) {
    if (out.length) out.push('');
    const numbers = block.messages.map((m) => m.line).filter((n): n is number => n !== null);
    const origins = [...new Set(block.messages.map((m) => ORIGIN[m.origin]))].join('، ');
    out.push(`# ${block.messages[0]?.step ?? 'خطوة غير معروفة'}${numbers.length ? ` — ${numbers.length > 1 ? 'الأسطر' : 'السطر'} ${numbers.join('، ')}` : ''} (${origins})`);
    if (block.lines.length) for (const c of block.lines) out.push(`${c.focus ? '>' : ' '} ${c.number} | ${c.text}`);
    else for (const m of block.messages) for (const line of m.text.split('\n')) out.push(`> ${line}`);
  }
  return out.length ? out.join('\n') : null;
}

/** ما يحلّ محل الموضع المحجوب في mask. */
export const maskOf = (patternId: string): string => `[محجوب: ${patternId}]`;

/** MJ26 («الإبلاغ عن مشكلة»): أسماء صيغ الأسرار المعروفة في نص حر يكتبه المستخدم، بفاحص المنقّح نفسه لا بمسار موازٍ؛ لا يغيّر النص ولا يحجب. */
export const secretKinds = (text: string): string[] => [...new Set(scanText(text).map((f) => f.label))];

/** يحجب كل موضع مطابق (والمتراكبان موضع واحد)، ويبلغ كل مرصود. */
function maskText(text: string, onFind: (finding: Finding) => void): string {
  const found = scanText(text);
  if (!found.length) return text;
  let out = '';
  let at = 0;
  let span: { start: number; end: number; id: string } | null = null;
  const flush = (): void => {
    if (!span) return;
    out += text.slice(at, span.start) + maskOf(span.id);
    at = span.end;
    span = null;
  };
  for (const finding of found) {
    onFind(finding);
    if (span && finding.start < span.end) span.end = Math.max(span.end, finding.end);
    else {
      flush();
      span = { start: finding.start, end: finding.end, id: finding.patternId };
    }
  }
  flush();
  return out + text.slice(at);
}

/** نسخة من بيانات بسيطة (كائنات ومصفوفات) بعد تمرير كل نص فيها على `fn`. */
function mapStrings<T>(value: T, fn: (text: string) => string): T {
  if (typeof value === 'string') return fn(value) as T;
  if (Array.isArray(value)) return value.map((v: unknown) => mapStrings(v, fn)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)])) as T;
  return value;
}

function visitStrings(value: unknown, fn: (text: string) => void): void {
  if (typeof value === 'string') fn(value);
  else if (Array.isArray(value)) for (const v of value) visitStrings(v, fn);
  else if (value && typeof value === 'object') for (const v of Object.values(value)) visitStrings(v, fn);
}

export function sanitize(source: ContextSource, snippets: readonly Snippet[], options: SanitizeOptions = {}): SanitizedContext {
  const limits: Limits = { ...CONTEXT_LIMITS, ...options.limits };
  const policy = options.secrets ?? 'mask';
  const has = (id: string): boolean => !options.selected || options.selected.has(id);

  // 1-2. الاختيار ثم الاقتطاع، بترتيب الأجزاء (فيظهر ما اقتُطع بالترتيب نفسه في الواجهة وفي المخرج).
  const cuts: Gap[] = [];
  const clipped = (text: string, max: number, part: string): string => {
    const c = clip(text, max);
    if (c.cut) cuts.push({ part, kind: 'truncated', reason: `بحد ${max} سطرًا`, cut: c.cut });
    return c.text;
  };
  const description = source.description && has(ITEM.description) ? clipped(source.description, limits.description, 'الوصف') : null;
  const comments = source.comments.filter((c) => has(ITEM.comment(c.id))).map((c) => ({ ...c, text: clipped(c.text, limits.comment, `تعليق ${c.author ?? c.id}`) }));
  const error = source.errorExcerpt.length && has(ITEM.error) ? clipped(source.errorExcerpt.join('\n'), limits.error, 'مقتطف الخطأ') : null;
  const chosen = snippets.filter((s) => has(ITEM.snippet(s.id))).map((s, i) => ({ ...s, text: clipped(s.text, limits.snippet, `مقتطف ${i + 1}`) }));

  let log: SanitizedLog | null = null;
  if (source.log && has(ITEM.log)) {
    const raw = logExcerpt(source.log);
    log = { analysis: source.log, excerpt: raw === null ? null : clipped(raw, limits.log, 'مقتطفات السجل') };
    if (source.log.moreMessages) cuts.push({ part: 'مقتطفات السجل', kind: 'truncated', reason: `عُرضت أول ${source.log.messages.length} رسالة، وبقيت ${source.log.moreMessages} لم تُعرض` });
    if (source.log.moreRootCauses) cuts.push({ part: 'الأسباب المثبتة', kind: 'truncated', reason: `عُرض أول ${source.log.rootCauses.length} سبب، وبقي ${source.log.moreRootCauses} لم يُعرض` });
  }

  let changes: SanitizedChanges | null = null;
  if (source.changes && has(ITEM.changes)) {
    const lines: string[] = [];
    for (const f of source.changes.files) if (f.patch) lines.push(`diff --git a/${f.path} b/${f.path}`, f.patch);
    changes = {
      totals: source.changes.totals,
      files: source.changes.files.map(({ patch: _patch, ...file }) => file),
      complete: source.changes.complete,
      patch: lines.length ? clipped(lines.join('\n'), limits.changes, 'أسطر الفروق') : null,
    };
  }

  // 3. الأسرار، جزءًا جزءًا.
  const hits = new Map<string, { part: string; patternId: string; label: string; count: number }>();
  const count = (part: string, f: Finding): void => {
    const key = `${part}|${f.patternId}`;
    const hit = hits.get(key);
    if (hit) hit.count += 1;
    else hits.set(key, { part, patternId: f.patternId, label: f.label, count: 1 });
  };
  const pass = <T>(value: T, part: string): T => {
    if (policy === 'mask') return mapStrings(value, (text) => maskText(text, (f) => count(part, f)));
    visitStrings(value, (text) => {
      for (const f of scanText(text)) count(part, f);
    });
    return value;
  };
  // نسخ حرفية لنصوص مرّت على pass: تُحجب مثلها ولا تُعدّ، فلا يتغير عدد الأسرار ولا البرومبت.
  const muted = <T>(value: T): T => (policy === 'mask' ? mapStrings(value, (text) => maskText(text, () => {})) : value);
  const status = source.status && has(ITEM.status) ? source.status : null;
  const quotedOf = (list: readonly Blocker[]): string[] => list.flatMap((b) => b.evidence.flatMap((e) => e.quoted ?? []));
  const withoutQuoted = (list: readonly Blocker[]): Blocker[] => list.map((b) => ({ ...b, evidence: b.evidence.map(({ quoted: _quoted, ...e }) => e) }));

  const verbatim = {
    error: error === null ? [] : (source.verbatim?.error ?? []).filter((v) => error.includes(v)),
    status: status === null ? [] : [...(source.verbatim?.review ? [source.verbatim.review] : []), ...quotedOf(status.report.blockers), ...quotedOf(status.report.attention)],
  };

  const SOURCE = 'المصدر';
  const GAPS = 'ما تعذّر جمعه';
  const result: SanitizedContext = {
    kind: source.kind,
    url: pass(source.url, SOURCE),
    number: source.number,
    repo: source.repo && has(ITEM.repo) ? pass(source.repo, SOURCE) : null,
    title: source.title && has(ITEM.title) ? pass(source.title, 'العنوان') : null,
    branch: source.branch && has(ITEM.branch) ? pass(source.branch, SOURCE) : null,
    description: description === null ? null : pass(description, 'الوصف'),
    comments: pass(comments, 'التعليقات'),
    checks: source.checks && has(ITEM.checks) ? pass(source.checks, 'نتائج الفحوص') : null,
    error: error === null ? null : pass(error, 'مقتطف الخطأ'),
    snippets: pass(chosen, 'مقتطفات الأدلة'),
    status: status === null ? null : pass({ ...status, report: { ...status.report, blockers: withoutQuoted(status.report.blockers), attention: withoutQuoted(status.report.attention) } }, 'الحالة والموانع'),
    log: log === null ? null : pass(log, 'السجل'),
    changes: changes === null ? null : pass(changes, 'التغييرات'),
    verbatim: muted(verbatim),
    available: {
      repo: Boolean(source.repo),
      branch: Boolean(source.branch),
      title: Boolean(source.title),
      description: Boolean(source.description),
      checks: Boolean(source.checks),
      error: source.errorExcerpt.length > 0,
      status: Boolean(source.status),
      log: Boolean(source.log),
      changes: Boolean(source.changes),
      comments: source.comments.length,
      snippets: snippets.length,
    },
    gaps: pass(source.gaps, GAPS),
    cuts: pass(cuts, GAPS),
    limits,
    secrets: { policy, hits: [], total: 0 },
  };
  const all = [...hits.values()];
  return { ...result, secrets: { policy, hits: all, total: all.reduce((n, h) => n + h.count, 0) } };
}

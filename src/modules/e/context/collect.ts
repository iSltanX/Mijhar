// طبقة السياق المشتركة (T-11.2، F-E6) — المرحلة الأولى: الجامع. يقرأ الصفحة المفتوحة بحسب نوعها (مشكلة، طلب دمج، فحوص، ملف/فروق) من DOM
// وحده، بلا أي طلب شبكة، ولا رمز ولا سرّ (سكربت المحتوى لا يملكهما)، ويعيد استخدام قرّاء الوحدة (د) ولا يعيد بناءهم: ملخص الحالة والتصنيفات
// السبعة (T-5.1)، وتفسير الموانع ومصدره ودمج قراءة API (T-5.2)، وقارئ صفحة المهمة ومحلل السجل بطبقاته الثلاث (T-5.3)، وقارئ المقارنة (T-5.4).
// وما يأتي من خارج الصفحة (نص سجل قرأه قسم بنقر المستخدم، أو قراءة API بالرمز أو الصلاحية الاختيارية) يُمرَّر إليه «إضافاتٍ» ولا يجلبه.
//  - قراءة API (AD-30، H-1): تُقبل بربطها بالمستودع والفرع والالتزام الظاهرة الآن (compareBinding، كبطاقة الحالة)، وقراءة لغيرها لا تدخل البنية
//    ويُعلن أنها لالتزام آخر؛ وحالة وصول كل جزء منها (accessText) في الحالة والجرد و«المعلومات الناقصة»، وما لم يُقرأ «غير معروف» (AC-D8).
//  - طلب الدمج: المستودع والرابط والفرعان والتزام الرأس، والعنوان والوصف والتعليقات الظاهرة، ونتائج الفحوص ومقتطف الخطأ، والحالة والموانع، وأعداد التغييرات.
//  - المشكلة: العنوان والوصف والتعليقات. صفحة مهمة Actions: الخطوات بنتائجها والتنبيهات مقتطفًا للخطأ.
//  - الفروق (مقارنة أو التزام أو ملفات طلب): الطرفان أو الالتزام، والملفات بنوعها وأسطرها، وأسطر الفروق حيث تعرضها الصفحة.
// وكل ما لم يُجمع يُسجَّل «فجوةً» بسببه: تعليق مطوي، وعناصر خط زمني لم تُحمَّل، وقائمة فحوص مطوية، وسجل محجوب أو لم يُقرأ، وملفات لم تُحمَّل.
// الجامع وحده يقرأ محتوى الصفحة في الوحدة (هـ)، ولا قسم يجمع لنفسه (AD-22، TEST-CTX-05).
import type { PageState, SelectorEntry, SelectorsRegistry } from '../../../core';
import { explainBlockers, readDomEvidence } from '../../d/blockers/explain';
import type { BlockersReport } from '../../d/blockers/explain';
import { collapsedInfo } from '../../d/blockers/freshness';
import { mergeApi } from '../../d/blockers/merge';
import type { ApiPrData } from '../../d/blockers/api-read';
import { readCompare } from '../../d/compare/extract';
import { cleanPath } from '../../d/compare/file-kinds';
import type { FileKind } from '../../d/compare/file-kinds';
import { isJobPath, readJobPage } from '../../d/log-parser/job-page';
import { analyzeLog } from '../../d/log-parser/parse';
import type { AnnotationInput, LogAnalysis, LogSource, StepRef } from '../../d/log-parser/parse';
import { CATEGORY_LABELS } from '../../d/pr-status/categories';
import { readPrSummary } from '../../d/pr-status/extract';
import { PR_STATE_LABELS, REVIEW_LABELS } from '../../d/pr-status/summary';
import { squash } from '../../d/pr-status/value';
import type { Value } from '../../d/pr-status/value';
import { UNKNOWN_TEXT, accessText } from '../../d/status/access';
import type { AccessKind } from '../../d/status/access';
import { FIELD_TEXT, compareBinding, shortSha } from '../../d/status/binding';
import type { ReadBinding } from '../../d/status/binding';

/** أنواع الصفحات الأربعة: طلب دمج، ومشكلة، وفحوص (صفحة مهمة Actions)، وفروق (مقارنة أو التزام أو ملفات طلب). */
export type ContextPageKind = 'pr' | 'issue' | 'job' | 'diff';

/** محددات الجامع نفسه؛ ومعها محددات قرّاء الوحدة (د) التي يستدعيها، في COLLECTOR_SELECTORS (index.ts). */
export const CONTEXT_SELECTORS: readonly SelectorEntry[] = [
  {
    key: 'e.title',
    description: 'عنوان المشكلة أو طلب الدمج',
    candidates: ['[data-testid="issue-title"]', '[data-component="PageHeader"] .markdown-title', '.js-issue-title', 'h1 .markdown-title'],
  },
  {
    key: 'e.body',
    description: 'وصف المشكلة أو طلب الدمج (التعليق الأول)',
    candidates: ['[data-testid="issue-body"] [data-testid="markdown-body"]', '#issue-body-viewer [data-testid="markdown-body"]', '.js-command-palette-pull-body .js-comment-body'],
  },
  {
    key: 'e.comment',
    description: 'حاوية تعليق في الخط الزمني (لا الوصف)',
    candidates: ['.react-issue-comment', '.js-comment-container:not(.js-command-palette-pull-body)'],
  },
  {
    key: 'e.timeline.hidden',
    description: 'زر «Load more» لعناصر خط زمني مخفية لم تُحمَّل',
    candidates: ['.js-ajax-pagination', '[data-testid="issue-timeline-load-more-container"]', 'button.ajax-pagination-btn'],
  },
];

export interface CommentInfo {
  readonly id: string;
  readonly author: string | null;
  /** datetime كما في الصفحة، إن وُجد. */
  readonly at: string | null;
  readonly text: string;
}

export interface CheckLine {
  readonly name: string;
  readonly label: string;
  readonly failed: boolean;
  readonly required: boolean | null;
  readonly detail: string | null;
  /** رابط تعرضه الصفحة نفسها لهذا الصف (سجل خطوة المهمة)، مطلقًا؛ أو null. */
  readonly url: string | null;
}

export type GapKind = 'collapsed' | 'not-loaded' | 'unavailable' | 'truncated';

export interface Gap {
  /** الجزء المعني («التعليقات»، «نتائج الفحوص»…). */
  readonly part: string;
  readonly kind: GapKind;
  readonly reason: string;
  /** للاقتطاع: عدد الأسطر المحذوفة ومن كم. */
  readonly cut?: { readonly lines: number; readonly of: number };
}

/** مقتطف دليل أضافه المستخدم من تحديده في الصفحة (selection.ts). */
export interface Snippet {
  readonly id: string;
  readonly text: string;
  /** من أين أُخذ («تعليق octo-dev»، «الصفحة»). */
  readonly where: string;
}

/** جزء من قراءة API بحالة وصوله (AC-D8). */
export interface ApiPartAccess {
  readonly part: 'pull' | 'checks' | 'required';
  readonly kind: AccessKind;
  /** جملة الحالة كما في البطاقة (accessText)؛ وكل حالة غير «قُرئت» تعلن قيمه «غير معروف». */
  readonly text: string;
}

/** قراءة API الممرَّرة إلى الجامع: لأي مستودع وفرع والتزام قُرئت ومتى، وهل هي لما تعرضه الصفحة الآن، وحالة وصول كل جزء (AD-30). */
export interface ApiAccess {
  readonly binding: ReadBinding;
  /** لما تعرضه الصفحة الآن (المستودع والفرع والالتزام)؛ وإلا لم تدخل البنية. */
  readonly matched: boolean;
  /** ما تغيّر أو جُهل حين لا تطابق («الالتزام»…). */
  readonly changed: readonly string[];
  readonly parts: readonly ApiPartAccess[];
  /** سطر الربط: المستودع والفرع والالتزام ووقت القراءة، وما لم يُعرف «غير معروف». */
  readonly summary: string;
}

/** حالة طلب الدمج وموانعه كما يقرؤها قرّاء الوحدة (د). */
export interface PrStatus {
  /** حالة الطلب بالعربية («مفتوح»…)، أو null إن لم تُقرأ. */
  readonly state: string | null;
  /** حالة المراجعات وعبارتها كما في الصفحة، أو null. */
  readonly review: string | null;
  /** تفسير الموانع بأدلته المنقولة (T-5.2)، ومصادره (الصفحة وحدها أو معها API). */
  readonly report: BlockersReport;
  /** وقت قراءة API إن قُرئت لرأس الصفحة نفسه (شارة المصدر والتقادم)، وإلا null. */
  readonly apiReadAt: number | null;
  /** قراءة API الممرَّرة بربطها وحالة وصول أجزائها (AD-30)، أو null حين لم تُمرَّر قراءة. */
  readonly api: ApiAccess | null;
}

export interface ChangedFile {
  readonly path: string;
  readonly kind: FileKind;
  /** null حين لا تعرض الصفحة أسطر هذا الملف. */
  readonly additions: number | null;
  readonly deletions: number | null;
  /** أسطر الفروق كما تعرضها الصفحة («+» و«-» ومسافة، وسطر الكتلة @@)، أو null حين لا تعرضها. */
  readonly patch: string | null;
}

export interface Changes {
  /** الأرقام كما تعرضها الصفحة (ترويسة الطلب أو جملة المقارنة)، وnull لما لا تعرضه. */
  readonly totals: { readonly files: number | null; readonly additions: number | null; readonly deletions: number | null };
  /** الملفات المقروءة؛ فارغة في صفحة محادثة الطلب (أسماؤها في تبويب «Files changed»). */
  readonly files: readonly ChangedFile[];
  /** قُرئت كل الملفات بأسطرها فطابقت أرقام الصفحة. */
  readonly complete: boolean;
}

export interface ContextSource {
  readonly kind: ContextPageKind;
  /** owner/repo. */
  readonly repo: string | null;
  /** رابط الصفحة بلا جزء (#) ولا استعلام. */
  readonly url: string;
  readonly number: number | null;
  readonly title: string | null;
  readonly branch: { readonly head: string | null; readonly base: string | null; readonly headSha: string | null } | null;
  readonly description: string | null;
  readonly comments: readonly CommentInfo[];
  readonly checks: { readonly items: readonly CheckLine[]; readonly summary: string } | null;
  readonly errorExcerpt: readonly string[];
  /** قيم GitHub في errorExcerpt وفي سطر المراجعات كما وردت، بلا صياغة مِجهَر حولها؛ منها وحدها يُقبل اقتباس النموذج دليلًا (F-04). */
  readonly verbatim?: { readonly error: readonly string[]; readonly review: string | null };
  /** حالة الطلب وموانعه (طلب الدمج وحده). */
  readonly status: PrStatus | null;
  /** تحليل السجل بطبقاته الثلاث (T-5.3) إن مُرِّر نص السجل (أو غيابه بسببه) في الإضافات؛ وإلا null. */
  readonly log: LogAnalysis | null;
  readonly changes: Changes | null;
  readonly gaps: readonly Gap[];
}

/** نص سجل قرأه قسمٌ بفعل المستخدم (شرح سجل الفحص في صفحة المهمة مثلًا)، أو غيابه بسببه. الجامع لا يجلب سجلًا. */
export interface LogExtra {
  readonly text: string | null;
  readonly unavailableReason?: string;
  readonly source?: LogSource;
  readonly step?: StepRef | null;
  readonly truncatedBySource?: string | null;
}

/** ما يُمرَّر إلى الجامع من خارج الصفحة؛ كلاهما اختياري ولا يتوقف الجمع على غيابه. */
export interface CollectExtras {
  readonly log?: LogExtra | null;
  /** قراءة API لطلب الدمج (T-5.2 أو برمز T-5.5)؛ لا تدخل إلا إن كانت للمستودع والفرع والالتزام الظاهرة (VR-03، AD-30). */
  readonly api?: ApiPrData | null;
}

const BLOCK = new Set(['P', 'DIV', 'UL', 'OL', 'PRE', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TR', 'TABLE', 'SECTION', 'DETAILS', 'SUMMARY', 'HR']);

/**
 * نص عنصر Markdown مقروء: سطر لكل كتلة، و«- » لكل بند، وكتل الشيفرة كما هي بمسافاتها؛ ومسافات النص العادي تُطوى كما يطويها HTML.
 * لا innerText (غير متاح في كل بيئة ولا يحفظ البنود).
 */
export function blockText(root: Element): string {
  let out = '';
  const breakLine = (): void => {
    if (out && !out.endsWith('\n')) out += '\n';
  };
  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      let text = (node.textContent ?? '').replace(/\s+/g, ' ');
      if (!out || out.endsWith('\n')) text = text.replace(/^ /, '');
      out += text;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEMPLATE' || el.getAttribute('aria-hidden') === 'true') return;
    if (el.tagName === 'BR') {
      out += '\n';
      return;
    }
    if (el.tagName === 'PRE') {
      breakLine();
      out += `\n${(el.textContent ?? '').replace(/\n$/, '')}\n\n`;
      return;
    }
    if (el.tagName === 'LI') {
      breakLine();
      out += '- ';
      for (const child of el.childNodes) walk(child);
      breakLine();
      return;
    }
    const block = BLOCK.has(el.tagName);
    if (block) {
      breakLine();
      out += '\n';
    }
    for (const child of el.childNodes) walk(child);
    if (block) {
      breakLine();
      out += '\n';
    }
  };
  walk(root);
  return out
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const timelineHidden = (doc: Document, selectors: SelectorsRegistry): Gap[] => {
  const gaps: Gap[] = [];
  for (const el of selectors.resolveAll(doc, 'e.timeline.hidden')) {
    const text = squash(el.textContent);
    const count = /(\d[\d,]*)\s+(?:hidden|remaining)\s+items?/i.exec(text)?.[1];
    gaps.push({
      part: 'التعليقات',
      kind: 'not-loaded',
      reason: count ? `${count.replace(/,/g, '')} عنصرًا مخفيًا في الخط الزمني لم تحمّله الصفحة («Load more»)` : 'عناصر مخفية في الخط الزمني لم تحمّلها الصفحة («Load more»)، وعددها غير معروض',
    });
  }
  return gaps;
};

const isMinimized = (container: Element): boolean => Boolean(container.querySelector('.minimized-comment, [data-testid="comment-minimized"], [data-testid="minimized-comment"]'));

function readComments(doc: Document, selectors: SelectorsRegistry): { comments: CommentInfo[]; gaps: Gap[] } {
  const comments: CommentInfo[] = [];
  const gaps: Gap[] = [];
  selectors.resolveAll(doc, 'e.comment').forEach((container, index) => {
    const author = squash(container.querySelector('a.author, [data-testid="avatar-link"]')?.textContent) || null;
    const id = container.querySelector('[id^="issuecomment-"]')?.id ?? container.getAttribute('data-gid') ?? `comment-${index + 1}`;
    if (isMinimized(container)) {
      gaps.push({ part: 'التعليقات', kind: 'collapsed', reason: `تعليق مطوي${author ? ` لـ${author}` : ''} (أخفاه صاحبه أو المشرف) لم يُجمع؛ افتحه في الصفحة ثم أعد الجمع` });
      return;
    }
    const body = container.querySelector('.js-comment-body, [data-testid="markdown-body"]');
    const text = body ? blockText(body) : '';
    if (!text) return;
    comments.push({ id, author, at: container.querySelector('relative-time[datetime]')?.getAttribute('datetime') ?? null, text });
  });
  return { comments, gaps: [...gaps, ...timelineHidden(doc, selectors)] };
}

const canonical = (href: string): string => {
  const url = new URL(href);
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
};

function base(doc: Document, selectors: SelectorsRegistry, page: PageState, kind: ContextPageKind) {
  const titleEl = selectors.resolve(doc, 'e.title')?.element;
  const bodyEl = selectors.resolve(doc, 'e.body')?.element;
  const gaps: Gap[] = [];
  const description = bodyEl ? blockText(bodyEl) || null : null;
  // للمشكلة وطلب الدمج وحدهما وصف؛ صفحتا المهمة والفروق بلا وصف فلا يُعلن غيابه.
  const described = kind === 'pr' || kind === 'issue';
  if (described && !bodyEl) gaps.push({ part: 'الوصف', kind: 'unavailable', reason: 'لم يظهر الوصف في الصفحة' });
  else if (described && !description) gaps.push({ part: 'الوصف', kind: 'unavailable', reason: 'الوصف فارغ في الصفحة' });
  return {
    repo: page.owner && page.repo ? `${page.owner}/${page.repo}` : null,
    url: canonical(page.href),
    number: page.number,
    title: squash(titleEl?.textContent) || null,
    description,
    gaps,
  };
}

const valueOf = <T>(v: Value<T>): T | null => (v.available ? v.value : null);

/** يحلّل السجل الممرَّر بطبقاته الثلاث، ويعيد ما يلزم إعلانه عنه: غيابه بسببه، أو اقتطاعه بعدد ما قُرئ. */
function readLog(extra: LogExtra, annotations: readonly AnnotationInput[]): { log: LogAnalysis; gaps: Gap[] } {
  const log = analyzeLog({
    text: extra.text,
    ...(extra.unavailableReason ? { unavailableReason: extra.unavailableReason } : {}),
    source: extra.source ?? 'step-log',
    step: extra.step ?? null,
    annotations,
    truncatedBySource: extra.truncatedBySource ?? null,
  });
  const gaps: Gap[] = [];
  const { availability } = log;
  if (availability.state === 'unavailable') gaps.push({ part: 'السجل', kind: 'unavailable', reason: availability.reason });
  if (availability.state === 'truncated') {
    const { totalLines, readLines } = availability;
    gaps.push({ part: 'السجل', kind: 'truncated', reason: availability.reason, ...(totalLines !== null && totalLines > readLines ? { cut: { lines: totalLines - readLines, of: totalLines } } : {}) });
  }
  return { log, gaps };
}

const API_PARTS: ReadonlyArray<{ readonly part: ApiPartAccess['part']; readonly text: string }> = [
  { part: 'pull', text: 'بيانات الطلب من API (قابلية الدمج وحالته)' },
  { part: 'checks', text: 'الفحوص من API (ومنها ما تطويه الصفحة)' },
  { part: 'required', text: 'الفحوص الإلزامية من حماية الفرع' },
];
const API_GAP = 'بيانات API';

/**
 * ربط قراءة API بما تعرضه الصفحة الآن وحالة وصول أجزائها (AD-30): القبول بالمستودع والفرع والالتزام معًا (compareBinding كبطاقة الحالة)، وقراءة
 * لغيرها تُعلن «لالتزام آخر» ولا تدخل؛ وكل جزء لم يُقرأ فجوةٌ بجملة حالته («غير معروف»). قراءة لم تُمرَّر لا تُغيّر شيئًا.
 */
function bindApi(offered: ApiPrData | null | undefined, page: ReadBinding): { api: ApiPrData | null; access: ApiAccess | null; gaps: Gap[] } {
  if (!offered) return { api: null, access: null, gaps: [] };
  const read = offered.binding;
  const match = offered.pull.available ? compareBinding(read, page) : null;
  const matched = Boolean(match?.same);
  const changed = match && !match.same ? match.changed.map((f) => FIELD_TEXT[f]) : [];
  // قراءة فشل جزؤها الأول (بيانات الطلب) تعلن حالته وحده كما في البطاقة؛ وما بعده لم يُطلب.
  const shown = offered.access.pull.kind === 'read' ? API_PARTS : API_PARTS.slice(0, 1);
  const parts = shown.map(({ part, text }) => ({ part, kind: offered.access[part].kind, text: accessText(text, offered.access[part]) }));
  const gaps: Gap[] = [];
  if (offered.pull.available && !matched) {
    const where = (b: ReadBinding, unknown: string): string => `${shortSha(b.commit) ?? unknown}${b.branch ? ` على ${b.branch}` : ''}`;
    gaps.push({
      part: API_GAP,
      kind: 'unavailable',
      reason: `قراءة API لالتزام آخر (${where(read, UNKNOWN_TEXT)}) غير الظاهر الآن (${where(page, 'رأس الصفحة غير معروف')})؛ تغيّر ${changed.join(' و')}، فلم تدخل الفحوص ولا الموانع وقيمها ${UNKNOWN_TEXT}`,
    });
  } else for (const p of parts) if (p.kind !== 'read') gaps.push({ part: API_GAP, kind: 'unavailable', reason: p.text });
  const at = read.readAt !== null ? ` (قُرئت ${new Date(read.readAt).toISOString().slice(0, 16).replace('T', ' ')} UTC)` : '';
  const summary = `قراءة API لـ\`${read.repo ?? UNKNOWN_TEXT}\` على الفرع \`${read.branch ?? UNKNOWN_TEXT}\` والالتزام \`${shortSha(read.commit) ?? UNKNOWN_TEXT}\`${at}${matched ? '' : `: لالتزام آخر غير الظاهر الآن، فلم تدخل (تغيّر ${changed.join(' و') || 'الالتزام'})`}.`;
  return { api: matched ? offered : null, access: { binding: read, matched, changed, parts, summary }, gaps };
}

function collectPr(doc: Document, selectors: SelectorsRegistry, page: PageState, extras: CollectExtras): ContextSource {
  const b = base(doc, selectors, page, 'pr');
  const dom = readPrSummary(doc, selectors, { pageNumber: page.number });
  // هوية القراءة (VR-03، AD-30): قراءة API لمستودع أو فرع أو التزام غير الظاهر لا تدخل الملخص ولا الموانع، كما في بطاقة الحالة.
  const bound = bindApi(extras.api, { repo: b.repo, branch: dom.head.available ? dom.head.value.branch : null, commit: dom.headSha, readAt: null });
  const { api } = bound;
  const summary = mergeApi(dom, api);
  const { comments, gaps: commentGaps } = readComments(doc, selectors);
  const gaps: Gap[] = [...b.gaps, ...commentGaps];
  const head = summary.head.available ? summary.head.value.branch : null;
  const baseRef = summary.base.available ? summary.base.value.branch : null;
  if (!summary.headSha) gaps.push({ part: 'الفرع والالتزام', kind: 'unavailable', reason: 'التزام الرأس لا تعرضه الصفحة' });
  const logRead = extras.log ? readLog(extras.log, []) : null;

  const { checks } = summary;
  let checkPart: ContextSource['checks'] = null;
  const errorExcerpt: string[] = [];
  const errorVerbatim: string[] = [];
  if (checks.items.length) {
    const items = checks.items.map((item): CheckLine => ({
      name: item.name,
      label: CATEGORY_LABELS[item.classification.category] + (item.classification.note ? ` (${item.classification.note})` : ''),
      failed: item.classification.category === 'failure',
      required: item.required,
      detail: item.detail,
      url: null,
    }));
    const counts = Object.entries(checks.counts)
      .filter(([, n]) => n > 0)
      .map(([category, n]) => `${CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]} ${n}`)
      .join('، ');
    checkPart = { items, summary: counts };
    for (const item of items.filter((i) => i.failed)) {
      errorExcerpt.push(`${item.name}: ${item.detail ?? 'فشل بلا تفصيل في الصفحة'}`);
      errorVerbatim.push(item.name, ...(item.detail ? [item.detail] : []));
    }
    if (items.some((i) => i.failed) && !logRead) gaps.push({ part: 'مقتطف الخطأ', kind: 'not-loaded', reason: 'نص سجل الفحص الفاشل لا تعرضه صفحة الطلب؛ افتح صفحة المهمة وجهّز الحزمة منها، أو أضف مقتطف السجل دليلًا' });
  } else if (checks.detailsUrl) {
    gaps.push({ part: 'نتائج الفحوص', kind: 'not-loaded', reason: 'صفوف الفحوص لم تحمّلها الصفحة بعد (تُقرأ في بطاقة حالة الطلب)' });
  } else if (!checks.noneReported) {
    gaps.push({ part: 'نتائج الفحوص', kind: 'unavailable', reason: checks.rollup.available ? `لا صفوف فحوص في الصفحة؛ الرمز المجمَّع وحده: ${checks.rollup.value.label}` : 'لا تعرض الصفحة صفوف الفحوص' });
  }
  const collapsed = collapsedInfo(summary, api);
  if (collapsed) gaps.push({ part: 'نتائج الفحوص', kind: 'collapsed', reason: `قائمة الفحوص مطوية أو ناقصة: قُرئ ${collapsed.read} من ${collapsed.expected}${collapsed.label ? ` («${collapsed.label}»)` : ''}؛ ما لم يُقرأ لا يُعدّ ناجحًا` });
  if (logRead) gaps.push(...logRead.gaps);
  gaps.push(...bound.gaps);

  const review = valueOf(summary.reviews);
  const status: PrStatus = {
    state: summary.state.available ? PR_STATE_LABELS[summary.state.value] : null,
    review: review ? `${REVIEW_LABELS[review.state]} («${review.evidence}»)` : null,
    report: explainBlockers(summary, readDomEvidence(doc, selectors), api),
    apiReadAt: api?.pull.available ? api.readAt : null,
    api: bound.access,
  };
  const totals = { files: valueOf(summary.files), additions: valueOf(summary.additions), deletions: valueOf(summary.deletions) };
  const changes: Changes | null = totals.files === null && totals.additions === null && totals.deletions === null ? null : { totals, files: [], complete: false };

  const verbatim = { error: errorVerbatim, review: review ? review.evidence : null };
  return { kind: 'pr', ...b, branch: { head, base: baseRef, headSha: summary.headSha }, comments, checks: checkPart, errorExcerpt, verbatim, status, log: logRead?.log ?? null, changes, gaps };
}

function collectIssue(doc: Document, selectors: SelectorsRegistry, page: PageState): ContextSource {
  const b = base(doc, selectors, page, 'issue');
  const { comments, gaps } = readComments(doc, selectors);
  return { kind: 'issue', ...b, branch: null, comments, checks: null, errorExcerpt: [], status: null, log: null, changes: null, gaps: [...b.gaps, ...gaps] };
}

const GITHUB = 'https://github.com';

function collectJob(doc: Document, selectors: SelectorsRegistry, page: PageState, extras: CollectExtras): ContextSource {
  const b = base(doc, selectors, page, 'job');
  const job = readJobPage(doc, selectors);
  const gaps: Gap[] = [];
  const items = job.steps.map((step): CheckLine => ({
    name: `${step.number}. ${step.name}`,
    label: step.conclusion ?? 'غير معروف',
    failed: step.conclusion === 'failure',
    required: null,
    detail: null,
    url: step.logUrl ? new URL(step.logUrl, GITHUB).href : null,
  }));
  const errorExcerpt: string[] = [];
  const errorVerbatim: string[] = [];
  for (const a of job.annotations) {
    const where = a.step ? `${a.step.number !== null ? `الخطوة ${a.step.number}` : 'خطوة'}${a.step.name ? `: ${a.step.name}` : ''}${a.line !== null ? `، السطر ${a.line}` : ''}` : null;
    errorExcerpt.push(`[${a.level}]${where ? ` (${where})` : ''} ${a.message}`);
    errorVerbatim.push(...(a.step?.name ? [a.step.name] : []), a.message);
  }
  // سجل ممرَّر نصُّه يغني عن إعلان أنه لم يُقرأ؛ وسجل ممرَّر غيابُه يُعلن بسببه.
  const logRead = extras.log ? readLog(extras.log, job.annotations) : null;
  if (logRead?.log.availability.state === 'full' || logRead?.log.availability.state === 'truncated') gaps.push(...logRead.gaps);
  else if (job.signInForLogs) gaps.push({ part: 'مقتطف الخطأ', kind: 'unavailable', reason: 'نص السجل محجوب عن غير المسجَّل في هذه الصفحة' });
  else if (logRead) gaps.push(...logRead.gaps);
  else if (job.failedSteps.length) gaps.push({ part: 'مقتطف الخطأ', kind: 'not-loaded', reason: `نص سجل الخطوات الفاشلة (${job.failedSteps.map((s) => s.number).join('، ')}) لا يُقرأ أثناء البناء؛ اقرأه بـ«شرح سجل الفحص» ثم أضف المقتطف دليلًا` });
  const title = b.title ?? (squash(doc.title.split('·')[0]) || null);
  // رقم التشغيل في المسار ليس رقم مشكلة: الرابط يكفي.
  return {
    kind: 'job',
    ...b,
    number: null,
    title,
    branch: null,
    comments: [],
    checks: items.length ? { items, summary: `${job.failedSteps.length} خطوة فاشلة من ${items.length}` } : null,
    errorExcerpt,
    verbatim: { error: errorVerbatim, review: null },
    status: null,
    log: logRead?.log ?? null,
    changes: null,
    gaps,
  };
}

/** أسطر الفروق لكل ملف في تخطيط Rails (خلايا .blob-code-inner بعلامتها، وسطر الكتلة @@) بمساره. تخطيط React لا يعرضها فلا يُخمَّن شيء. */
function readPatches(doc: Document, selectors: SelectorsRegistry): Map<string, string> {
  const patches = new Map<string, string>();
  for (const header of selectors.resolveAll(doc, 'd.compare.file')) {
    const raw = header.getAttribute('data-path') ?? header.getAttribute('data-tagsearch-path');
    const path = raw ? cleanPath(raw) : '';
    if (!path || patches.has(path)) continue;
    const file = header.closest('.file, copilot-diff-entry') ?? header.parentElement;
    const lines: string[] = [];
    for (const cell of file?.querySelectorAll('.blob-code-inner') ?? []) {
      const text = (cell.textContent ?? '').replace(/\r?\n$/, '');
      lines.push(cell.classList.contains('blob-code-hunk') ? text.trim() : `${cell.getAttribute('data-code-marker') ?? ' '}${text}`);
    }
    if (lines.length) patches.set(path, lines.join('\n'));
  }
  return patches;
}

function collectDiff(doc: Document, selectors: SelectorsRegistry, page: PageState): ContextSource {
  const b = base(doc, selectors, page, 'diff');
  const summary = readCompare(doc, selectors, page.href);
  const patches = readPatches(doc, selectors);
  const files = summary.files.map((f): ChangedFile => ({ ...f, patch: patches.get(f.path) ?? null }));
  const gaps: Gap[] = [...b.gaps];
  const pageFiles = valueOf(summary.page.files);
  if (!files.length) gaps.push({ part: 'التغييرات', kind: pageFiles ? 'not-loaded' : 'unavailable', reason: pageFiles ? `تعلن الصفحة ${pageFiles} ملفًا متغيرًا ولم يُحمَّل منها شيء بعد` : 'لم تُقرأ ملفات متغيرة في الصفحة' });
  else if (!summary.reconciliation.complete) {
    gaps.push({
      part: 'التغييرات',
      kind: 'not-loaded',
      reason: pageFiles !== null ? `قُرئ ${files.length} ملفًا من ${pageFiles} تعرضها الصفحة أو لم تُعرض أسطر بعضها؛ مرّر في الصفحة ثم أعد الجمع` : 'لا تعرض الصفحة عدد الملفات المتغيرة فلا يُعرف أقُرئت كلها',
    });
  }
  const noPatch = files.filter((f) => f.patch === null).length;
  if (noPatch) gaps.push({ part: 'أسطر الفروق', kind: 'not-loaded', reason: `أسطر الفروق لا تعرضها الصفحة لـ${noPatch} من ${files.length} ملفًا (فروق كبيرة لم تُحمَّل، أو تخطيط لا يعرضها)` });
  const head = valueOf(summary.head);
  const baseRef = valueOf(summary.base);
  const sha = /\/commit\/([0-9a-f]{7,40})\/?$/i.exec(new URL(page.href).pathname)?.[1] ?? null;
  const title = b.title ?? (squash(doc.title.split('·')[0]) || null);
  return {
    kind: 'diff',
    ...b,
    title,
    branch: head || baseRef || sha ? { head, base: baseRef, headSha: sha } : null,
    comments: [],
    checks: null,
    errorExcerpt: [],
    status: null,
    log: null,
    changes: { totals: { files: pageFiles, additions: valueOf(summary.page.additions), deletions: valueOf(summary.page.deletions) }, files, complete: summary.reconciliation.complete },
    gaps,
  };
}

/** نوع الصفحة في الطبقة، أو null لصفحة لا سياق لها. */
export function pageKind(page: Pick<PageState, 'type' | 'href'>): ContextPageKind | null {
  switch (page.type) {
    case 'pr':
      return 'pr';
    case 'issue':
      return 'issue';
    case 'actions-run':
      return isJobPath(page.href) ? 'job' : null;
    case 'compare':
    case 'commit':
    case 'pr-files':
      return 'diff';
    default:
      return null;
  }
}

/** يجمع سياق الصفحة بحسب نوعها. لا يرمي: ما تعذّر يصير فجوة. والإضافات (سجل مقروء، قراءة API) اختيارية. */
export function collectContext(doc: Document, selectors: SelectorsRegistry, page: PageState, kind: ContextPageKind, extras: CollectExtras = {}): ContextSource {
  if (kind === 'pr') return collectPr(doc, selectors, page, extras);
  if (kind === 'job') return collectJob(doc, selectors, page, extras);
  if (kind === 'diff') return collectDiff(doc, selectors, page);
  return collectIssue(doc, selectors, page);
}

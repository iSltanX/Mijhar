// جمع سياق الصفحة المفتوحة لحزمة السياق (T-6.1، F-E1): من DOM وحده، بلا أي طلب شبكة، ولا رمز ولا سرّ (سكربت المحتوى لا يملكهما).
// طلب الدمج: المستودع والرابط والفرعان والتزام الرأس (ملخص T-5.1)، والعنوان والوصف والتعليقات الظاهرة، ونتائج الفحوص ومقتطف الخطأ.
// المشكلة: العنوان والوصف والتعليقات. صفحة مهمة Actions: الخطوات بنتائجها والتنبيهات مقتطفًا للخطأ (قارئ T-5.3).
// وكل ما لم يُجمع يُسجَّل «فجوةً» بسببه: تعليق مطوي، وعناصر خط زمني لم تُحمَّل، وقائمة فحوص مطوية، وسجل محجوب أو لم يُقرأ (F-E2).
import type { PageState, SelectorEntry, SelectorsRegistry } from '../../../core';
import { collapsedInfo } from '../../d/blockers/freshness';
import { readJobPage } from '../../d/log-parser/job-page';
import { CATEGORY_LABELS } from '../../d/pr-status/categories';
import { readPrSummary } from '../../d/pr-status/extract';
import { squash } from '../../d/pr-status/value';

export type ContextPageKind = 'pr' | 'issue' | 'job';

export const BUILDER_SELECTORS: readonly SelectorEntry[] = [
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
  readonly gaps: readonly Gap[];
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
  if (kind !== 'job' && !bodyEl) gaps.push({ part: 'الوصف', kind: 'unavailable', reason: 'لم يظهر الوصف في الصفحة' });
  else if (kind !== 'job' && !description) gaps.push({ part: 'الوصف', kind: 'unavailable', reason: 'الوصف فارغ في الصفحة' });
  return {
    repo: page.owner && page.repo ? `${page.owner}/${page.repo}` : null,
    url: canonical(page.href),
    number: page.number,
    title: squash(titleEl?.textContent) || null,
    description,
    gaps,
  };
}

function collectPr(doc: Document, selectors: SelectorsRegistry, page: PageState): ContextSource {
  const b = base(doc, selectors, page, 'pr');
  const summary = readPrSummary(doc, selectors, { pageNumber: page.number });
  const { comments, gaps: commentGaps } = readComments(doc, selectors);
  const gaps: Gap[] = [...b.gaps, ...commentGaps];
  const head = summary.head.available ? summary.head.value.branch : null;
  const baseRef = summary.base.available ? summary.base.value.branch : null;
  if (!summary.headSha) gaps.push({ part: 'الفرع والالتزام', kind: 'unavailable', reason: 'التزام الرأس لا تعرضه الصفحة' });

  const { checks } = summary;
  let checkPart: ContextSource['checks'] = null;
  const errorExcerpt: string[] = [];
  if (checks.items.length) {
    const items = checks.items.map((item): CheckLine => ({
      name: item.name,
      label: CATEGORY_LABELS[item.classification.category] + (item.classification.note ? ` (${item.classification.note})` : ''),
      failed: item.classification.category === 'failure',
      required: item.required,
      detail: item.detail,
    }));
    const counts = Object.entries(checks.counts)
      .filter(([, n]) => n > 0)
      .map(([category, n]) => `${CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]} ${n}`)
      .join('، ');
    checkPart = { items, summary: counts };
    for (const item of items.filter((i) => i.failed)) errorExcerpt.push(`${item.name}: ${item.detail ?? 'فشل بلا تفصيل في الصفحة'}`);
    if (items.some((i) => i.failed)) gaps.push({ part: 'مقتطف الخطأ', kind: 'not-loaded', reason: 'نص سجل الفحص الفاشل لا تعرضه صفحة الطلب؛ افتح صفحة المهمة وجهّز الحزمة منها، أو أضف مقتطف السجل دليلًا' });
  } else if (checks.detailsUrl) {
    gaps.push({ part: 'نتائج الفحوص', kind: 'not-loaded', reason: 'صفوف الفحوص لم تحمّلها الصفحة بعد (تُقرأ في بطاقة حالة الطلب)' });
  } else if (!checks.noneReported) {
    gaps.push({ part: 'نتائج الفحوص', kind: 'unavailable', reason: checks.rollup.available ? `لا صفوف فحوص في الصفحة؛ الرمز المجمَّع وحده: ${checks.rollup.value.label}` : 'لا تعرض الصفحة صفوف الفحوص' });
  }
  const collapsed = collapsedInfo(summary, null);
  if (collapsed) gaps.push({ part: 'نتائج الفحوص', kind: 'collapsed', reason: `قائمة الفحوص مطوية أو ناقصة: قُرئ ${collapsed.read} من ${collapsed.expected}${collapsed.label ? ` («${collapsed.label}»)` : ''}؛ ما لم يُقرأ لا يُعدّ ناجحًا` });

  return { kind: 'pr', ...b, branch: { head, base: baseRef, headSha: summary.headSha }, comments, checks: checkPart, errorExcerpt, gaps };
}

function collectIssue(doc: Document, selectors: SelectorsRegistry, page: PageState): ContextSource {
  const b = base(doc, selectors, page, 'issue');
  const { comments, gaps } = readComments(doc, selectors);
  return { kind: 'issue', ...b, branch: null, comments, checks: null, errorExcerpt: [], gaps: [...b.gaps, ...gaps] };
}

function collectJob(doc: Document, selectors: SelectorsRegistry, page: PageState): ContextSource {
  const b = base(doc, selectors, page, 'job');
  const job = readJobPage(doc, selectors);
  const gaps: Gap[] = [];
  const items = job.steps.map((step): CheckLine => ({ name: `${step.number}. ${step.name}`, label: step.conclusion ?? 'غير معروف', failed: step.conclusion === 'failure', required: null, detail: null }));
  const errorExcerpt: string[] = [];
  for (const a of job.annotations) {
    const where = a.step ? `${a.step.number !== null ? `الخطوة ${a.step.number}` : 'خطوة'}${a.step.name ? `: ${a.step.name}` : ''}${a.line !== null ? `، السطر ${a.line}` : ''}` : null;
    errorExcerpt.push(`[${a.level}]${where ? ` (${where})` : ''} ${a.message}`);
  }
  if (job.signInForLogs) gaps.push({ part: 'مقتطف الخطأ', kind: 'unavailable', reason: 'نص السجل محجوب عن غير المسجَّل في هذه الصفحة' });
  else if (job.failedSteps.length) gaps.push({ part: 'مقتطف الخطأ', kind: 'not-loaded', reason: `نص سجل الخطوات الفاشلة (${job.failedSteps.map((s) => s.number).join('، ')}) لا يُقرأ أثناء البناء؛ اقرأه بـ«شرح سجل الفحص» ثم أضف المقتطف دليلًا` });
  const title = b.title ?? (squash(doc.title.split('·')[0]) || null);
  // رقم التشغيل في المسار ليس رقم مشكلة: الرابط يكفي.
  return { kind: 'job', ...b, number: null, title, branch: null, comments: [], checks: items.length ? { items, summary: `${job.failedSteps.length} خطوة فاشلة من ${items.length}` } : null, errorExcerpt, gaps };
}

/** يجمع سياق الصفحة بحسب نوعها. لا يرمي: ما تعذّر يصير فجوة. */
export function collectContext(doc: Document, selectors: SelectorsRegistry, page: PageState, kind: ContextPageKind): ContextSource {
  if (kind === 'pr') return collectPr(doc, selectors, page);
  if (kind === 'job') return collectJob(doc, selectors, page);
  return collectIssue(doc, selectors, page);
}

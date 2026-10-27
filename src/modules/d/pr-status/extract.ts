// قراءة ملخص حالة طلب الدمج من DOM صفحة المحادثة (T-5.1)، على ما تثبته evidence/T-0.3 وعلى صفحة PR حقيقية محفوظة
// (fixtures/spikes/gh-pr-watad-80.html). لا طلبات هنا: ما لا تعرضه الصفحة يبقى «غير متاح» بسببه.
//  - بلا تسجيل دخول: رأس الصفحة (الفرعان وعدد الالتزامات والحالة) وعدّادات التبويبات والأسطر ورمز الحالة المجمَّع لكل التزام.
//  - صندوق الدمج (المسجَّل فقط): التعارضات والمراجعات والتأخر وصفوف الفحوص وشارة Required.
//  - جزء status-details: صفوف الفحوص بلا تسجيل دخول، يجلبه الموديول بطلب بنفس الأصل (parseStatusDetails).
// المحددات كلها في PR_STATUS_SELECTORS (BLK-DOM-SELECTOR): الأول أساسي والبقية بدائل، وتغيّرها يُرقَّع هنا وحده.
import type { SelectorEntry, SelectorsRegistry } from '../../../core';
import { classifyDomCheck, countCategories } from './categories';
import type { BranchRef, CheckItem, CheckSource, ChecksSection, PrState, PrSummary, ReviewInfo, ReviewState, RollupInfo } from './summary';
import { have, missing, parseCount, squash } from './value';
import type { Value } from './value';

export const PR_STATUS_SELECTORS: readonly SelectorEntry[] = [
  {
    key: 'd.pr.header',
    description: 'ترويسة طلب الدمج (العنوان والحالة والفرعان)؛ يُدرج الملخص بعدها',
    candidates: ['[data-component="PageHeader"]', '#partial-discussion-header', '.gh-header'],
  },
  {
    key: 'd.pr.header-summary',
    description: 'سطر «wants to merge N commits into base from head»',
    candidates: ['[data-component="PageHeader.Description"]', '.gh-header-meta', '#partial-discussion-header'],
  },
  {
    key: 'd.pr.state',
    description: 'شارة حالة الطلب (Open/Draft/Merged/Closed)',
    candidates: ['[data-component="StateLabel"]', '.gh-header-meta .State', '.State'],
  },
  {
    key: 'd.pr.branch-name',
    description: 'اسما الفرعين في الترويسة: الهدف (base) أولًا ثم المصدر (head)',
    candidates: ['[data-component="PageHeader.Description"] [data-component="BranchName"]', '[data-component="BranchName"]', '.commit-ref a, .commit-ref'],
  },
  {
    key: 'd.pr.tab-commits',
    description: 'تبويب الالتزامات بعدّاده',
    candidates: ['#prs-commits-anchor-tab', 'a.tabnav-tab[href$="/commits"]', 'a[href$="/commits"][id*="commits"]'],
  },
  {
    key: 'd.pr.tab-files',
    description: 'تبويب الملفات المتغيرة بعدّاده',
    candidates: ['#prs-files-anchor-tab', 'a.tabnav-tab[href$="/files"]', 'a[href$="/files"][id*="files"]'],
  },
  {
    key: 'd.pr.counter',
    description: 'عدّاد داخل تبويب',
    candidates: ['[data-component="CounterLabel"]', '.Counter'],
  },
  {
    key: 'd.pr.reviewers',
    description: 'قائمة المراجعين في الشريط الجانبي (تظهر لكل زائر) بحالة كل مراجع في تلميحه',
    candidates: ['form[aria-label="Select reviewers"]', '#partial-discussion-sidebar .sidebar-assignee form', '.sidebar-reviewers'],
  },
  {
    key: 'd.pr.rollup',
    description: 'رمز الحالة المجمَّع لالتزام في المحادثة (details.commit-build-statuses)',
    candidates: ['details.commit-build-statuses'],
  },
  {
    key: 'd.pr.mergebox',
    description: 'صندوق الدمج (يظهر للمسجَّل فقط)',
    candidates: ['[data-testid="mergebox-partial"]', '#partial-pull-merging', '.merge-pr'],
  },
  {
    key: 'd.pr.embedded-data',
    description: 'بيانات الصفحة المضمّنة (بيانات الطلب المنظّمة)',
    candidates: ['script[data-target="react-app.embeddedData"]'],
  },
  {
    key: 'd.pr.check-row',
    description: 'صف فحص داخل صندوق الدمج أو جزء status-details',
    candidates: ['.merge-status-item', '[data-testid="mergebox-partial"] li', '[data-testid="mergebox-partial"] [role="listitem"]'],
  },
];

const NOT_ON_PAGE = 'غير معروض في هذه الصفحة';
const NEEDS_SIGN_IN = 'يعرضه GitHub للمسجَّل في صندوق الدمج فقط';

// ---- الرأس ----

interface Embedded {
  readonly number: number | null;
  readonly state: string | null;
  readonly headBranch: string | null;
  readonly baseBranch: string | null;
  readonly headOwner: string | null;
  readonly headSha: string | null;
}

/** بيانات الطلب المنظّمة المضمّنة في صفحة React إن وُجدت (payload.pullRequestsLayoutRoute.pullRequest)، وإلا null. */
export function readEmbedded(doc: Document, selectors: SelectorsRegistry): Embedded | null {
  const script = selectors.resolve(doc, 'd.pr.embedded-data')?.element;
  const text = script?.textContent;
  if (!text) return null;
  try {
    const pull = (JSON.parse(text) as { payload?: { pullRequestsLayoutRoute?: { pullRequest?: Record<string, unknown> } } }).payload?.pullRequestsLayoutRoute?.pullRequest;
    if (!pull || typeof pull !== 'object') return null;
    const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
    return {
      number: typeof pull.number === 'number' ? pull.number : null,
      state: str(pull.state),
      headBranch: str(pull.headBranch),
      baseBranch: str(pull.baseBranch),
      headOwner: str(pull.headRepositoryOwnerLogin),
      headSha: str(pull.headSha),
    };
  } catch {
    return null;
  }
}

function readState(doc: Document, selectors: SelectorsRegistry, embedded: Embedded | null): Value<PrState> {
  const label = selectors.resolve(doc, 'd.pr.state')?.element;
  const status = label?.getAttribute('data-status') ?? '';
  const byStatus: Record<string, PrState> = { pullOpened: 'open', pullDraft: 'draft', pullMerged: 'merged', pullClosed: 'closed' };
  const fromStatus = byStatus[status];
  if (fromStatus) return have(fromStatus);
  const text = squash(label?.textContent).toLowerCase();
  if (text) {
    // «Open» لا تعني «مفتوح غير مسودة» في الشارات القديمة، لكنها كل ما تقوله الصفحة.
    for (const [word, state] of [['draft', 'draft'], ['merged', 'merged'], ['closed', 'closed'], ['open', 'open']] as const) {
      if (text === word || text.startsWith(`${word} `)) return have(state);
    }
  }
  if (embedded?.state) {
    const mapped = ({ OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' } as Record<string, PrState>)[embedded.state.toUpperCase()];
    if (mapped) return have(mapped);
  }
  return missing('لم تُعثر على شارة الحالة في الترويسة');
}

function tooltipRepo(anchor: Element, doc: Document, branch: string): string | null {
  const id = anchor.getAttribute('aria-describedby');
  const text = id ? squash(doc.getElementById(id)?.textContent) : '';
  const cut = text.lastIndexOf(':');
  if (cut > 0 && text.slice(cut + 1) === branch) return text.slice(0, cut);
  return null;
}

function readBranches(doc: Document, selectors: SelectorsRegistry, embedded: Embedded | null): { base: Value<BranchRef>; head: Value<BranchRef> } {
  const names = selectors.resolveAll(doc, 'd.pr.branch-name');
  const ref = (element: Element | undefined): BranchRef | null => {
    const branch = squash(element?.textContent);
    return element && branch ? { branch, repo: tooltipRepo(element, doc, branch) } : null;
  };
  let base = ref(names[0]);
  let head = ref(names[1]);
  if (!base && embedded?.baseBranch) base = { branch: embedded.baseBranch, repo: null };
  if (!head && embedded?.headBranch) head = { branch: embedded.headBranch, repo: embedded.headOwner };
  return {
    base: base ? have(base) : missing('لم يُعثر على اسم فرع الهدف في الترويسة'),
    head: head ? have(head) : missing('لم يُعثر على اسم فرع المصدر في الترويسة'),
  };
}

const MERGE_SENTENCE = /(?:wants to merge|merged|requested to merge)\s+([\d,]+)\s+commits?\s+into/i;

function counterOf(doc: Document, selectors: SelectorsRegistry, key: string): Value<number> {
  const tab = selectors.resolve(doc, key)?.element;
  if (!tab) return missing(NOT_ON_PAGE);
  const counter = selectors.resolve(tab, 'd.pr.counter')?.element;
  if (!counter) return missing('لا عدّاد ظاهر في التبويب');
  const n = parseCount(counter.textContent);
  return n === null ? missing(`العدّاد «${squash(counter.textContent)}» ليس عددًا كاملًا`) : have(n);
}

function readCommits(doc: Document, selectors: SelectorsRegistry): Value<number> {
  const fromSentence = MERGE_SENTENCE.exec(squash(selectors.resolve(doc, 'd.pr.header-summary')?.element.textContent));
  const n = fromSentence ? parseCount(fromSentence[1]) : null;
  return n !== null ? have(n) : counterOf(doc, selectors, 'd.pr.tab-commits');
}

const LINES_CHANGED = /Lines changed:\s*([\d,]+)\s+additions?\s*&\s*([\d,]+)\s+deletions?/i;

function readLines(doc: Document, selectors: SelectorsRegistry): { additions: Value<number>; deletions: Value<number> } {
  const header = selectors.resolve(doc, 'd.pr.header')?.element ?? doc.body;
  for (const el of header.querySelectorAll('.sr-only, [class*="sr-only"]')) {
    const m = LINES_CHANGED.exec(squash(el.textContent));
    if (m) {
      const additions = parseCount(m[1]);
      const deletions = parseCount(m[2]);
      if (additions !== null && deletions !== null) return { additions: have(additions), deletions: have(deletions) };
    }
  }
  // التخطيط القديم: #diffstat بخانتي text-diff-added/deleted.
  const added = doc.querySelector('#diffstat .text-diff-added, #diffstat .color-fg-success')?.textContent?.replace(/^[+\s]+/, '');
  const removed = doc.querySelector('#diffstat .text-diff-deleted, #diffstat .color-fg-danger')?.textContent?.replace(/^[-−–\s]+/, '');
  const a = parseCount(added);
  const d = parseCount(removed);
  if (a !== null && d !== null) return { additions: have(a), deletions: have(d) };
  return { additions: missing(NOT_ON_PAGE), deletions: missing(NOT_ON_PAGE) };
}

// ---- صندوق الدمج ----

const text = (el: Element | null | undefined): string => squash(el?.textContent);

function readMergeboxReviews(box: Element): Value<ReviewInfo> {
  const t = text(box);
  const pick = (state: ReviewState, evidence: string | undefined): Value<ReviewInfo> => (evidence ? have({ state, evidence, source: 'mergebox' }) : missing(NOT_ON_PAGE));
  const changes = /Changes requested/i.exec(t)?.[0];
  if (changes) return pick('changes-requested', changes);
  const required = /Review required|At least \d+ approving reviews? (?:is|are) required[^.]*/i.exec(t)?.[0];
  if (required) return pick('review-required', required);
  const approved = /Changes approved|\d+ approving reviews?(?! (?:is|are) required)/i.exec(t)?.[0];
  if (approved) return pick('approved', approved);
  return missing('صندوق الدمج لا يذكر حالة المراجعات');
}

/**
 * قائمة المراجعين في الشريط الجانبي (صفحة PR حقيقية محفوظة لغير مسجَّل): لكل مراجع رابط #review-status-<login> وتلميح بحالته
 * («X requested changes» و«X left review comments» رُصدتا حرفيًا، و«approved» من واجهة GitHub المعروفة، ولم تُرصد «Awaiting requested review»).
 * طلب التغييرات يغلب الاعتماد، والاعتماد يغلب التعليقات، ولا مراجعين يعني «لا مراجعات» إن ذكرت الصفحة «No reviews» صراحةً.
 */
function readSidebarReviews(form: Element, doc: Document): Value<ReviewInfo> {
  const tips: string[] = [];
  for (const anchor of form.querySelectorAll('a[id^="review-status-"]')) {
    const tip = squash(doc.getElementById(anchor.getAttribute('aria-labelledby') ?? '')?.textContent);
    if (tip) tips.push(tip);
  }
  const first = (re: RegExp): string | undefined => tips.find((tip) => re.test(tip));
  const changes = first(/requested changes/i);
  if (changes) return have({ state: 'changes-requested', evidence: changes, source: 'sidebar' });
  const approved = first(/\bapproved\b/i);
  if (approved) return have({ state: 'approved', evidence: approved, source: 'sidebar' });
  const commented = first(/left review comments|\bcommented\b/i);
  if (commented) return have({ state: 'commented', evidence: commented, source: 'sidebar' });
  const awaiting = first(/awaiting|requested (?:a )?review|review requested/i);
  if (awaiting) return have({ state: 'awaiting', evidence: awaiting, source: 'sidebar' });
  if (!tips.length && /No reviews/i.test(text(form))) return have({ state: 'none', evidence: 'No reviews', source: 'sidebar' });
  return missing('قائمة المراجعين لا تذكر حالة قابلة للقراءة');
}

function readReviews(box: Element | null, doc: Document, selectors: SelectorsRegistry): Value<ReviewInfo> {
  // صندوق الدمج هو المرجع للمسجَّل، وإلا فالشريط الجانبي الذي يظهر لكل زائر.
  if (box) {
    const fromBox = readMergeboxReviews(box);
    if (fromBox.available) return fromBox;
  }
  const sidebar = selectors.resolve(doc, 'd.pr.reviewers')?.element;
  if (sidebar) return readSidebarReviews(sidebar, doc);
  return box ? missing('صندوق الدمج لا يذكر حالة المراجعات ولا قائمة مراجعين في الصفحة') : missing(NEEDS_SIGN_IN);
}

function readConflicts(box: Element | null): Value<boolean> {
  if (!box) return missing(NEEDS_SIGN_IN);
  const t = text(box);
  if (/This branch has conflicts that must be resolved/i.test(t)) return have(true);
  if (/no conflicts with the base branch/i.test(t)) return have(false);
  return missing('صندوق الدمج لا يذكر حالة التعارضات');
}

function readBehind(box: Element | null): Value<boolean> {
  if (!box) return missing(NEEDS_SIGN_IN);
  if (/out-of-date with the base branch/i.test(text(box))) return have(true);
  // غياب العبارة لا يعني أن الفرع محدَّث (T-0.3)، فلا قيمة false.
  return missing('لا يعلن صندوق الدمج تأخرًا، وغياب العبارة لا يثبت أن الفرع محدَّث');
}

// ---- الفحوص ----

const CHECK_ID = /(?:\/job\/|check_run_id=)(\d+)/;

function rowIcon(row: Element): Element | null {
  return row.querySelector('svg[aria-label]') ?? row.querySelector('svg');
}

const REQUIRED_BADGE = 'Required';

/**
 * شارة «Required» عنصرًا مستقلًا في صف صندوق الدمج (CODEX-002): عنصر بلا أبناء نصه «Required» وحده، خارج اسم الفحص ووصفه ورابطه. الكلمة في
 * اسم فحص («Required dependencies») أو وصفه لا تثبت إلزامًا.
 */
function hasRequiredBadge(row: Element, name: Element | null, description: Element | null): boolean {
  for (const el of row.querySelectorAll('span, div, small, b, i, em, label')) {
    if (el.children.length || text(el) !== REQUIRED_BADGE) continue;
    if (name?.contains(el) || description?.contains(el) || el.closest('a')) continue;
    return true;
  }
  return false;
}

function parseRow(row: Element, source: CheckSource): CheckItem | null {
  const svg = rowIcon(row);
  if (!svg) return null;
  const nameEl = row.querySelector('strong');
  const strong = text(nameEl);
  const full = text(row);
  const sep = full.indexOf(' — ');
  const name = strong || (sep > 0 ? full.slice(0, sep) : '');
  if (!name) return null;
  // الوصف: عنصر الوصف لا الرابط (الذي قد يحمل title باسم الفحص) ولا الشارة (GEMINI-003).
  const descEl = [...row.querySelectorAll('.text-small, .color-fg-muted, :not(a)[title]')].find((el) => !el.closest('a') && text(el) !== REQUIRED_BADGE) ?? null;
  const description = text(descEl) || (sep > 0 ? full.slice(sep + 3) : full.slice(name.length).trim());
  const href = row.querySelector('a[href]')?.getAttribute('href') ?? '';
  // جزء status-details لا يذكر الإلزامي أصلًا؛ وفي صندوق الدمج الشارة وحدها دليله.
  const required = source !== 'status-details' && hasRequiredBadge(row, nameEl, descEl) ? true : null;
  return {
    name,
    id: CHECK_ID.exec(href)?.[1] ?? null,
    classification: classifyDomCheck({ iconClass: svg.getAttribute('class'), label: svg.getAttribute('aria-label'), description: description || full }),
    required,
    detail: description || null,
    source,
  };
}

/** صفوف الفحوص في جزء status-details (HTML يجلبه الموديول بنفس الأصل). الجزء لا يذكر الإلزامي، فrequired = null. */
export function parseStatusDetails(root: ParentNode): CheckItem[] {
  const items: CheckItem[] = [];
  for (const row of root.querySelectorAll('.merge-status-item')) {
    const item = parseRow(row, 'status-details');
    if (item) items.push(item);
  }
  return items;
}

function readMergeboxChecks(box: Element): CheckItem[] {
  const rows = box.querySelectorAll('.merge-status-item, li, [role="listitem"]');
  const items: CheckItem[] = [];
  for (const row of rows) {
    if (row.querySelector('.merge-status-item, li, [role="listitem"]') && row.matches('li, [role="listitem"]')) continue;
    const item = parseRow(row, 'mergebox');
    if (item) items.push(item);
  }
  return items;
}

const ROLLUP_LABEL = /(\d+)\s*\/\s*(\d+)\s+checks?\s+OK/i;

function toneOf(summary: Element | null): RollupInfo['tone'] {
  const cls = `${summary?.getAttribute('class') ?? ''} ${summary?.querySelector('svg')?.getAttribute('class') ?? ''}`;
  if (cls.includes('color-fg-success')) return 'success';
  if (cls.includes('color-fg-danger')) return 'danger';
  if (cls.includes('pending') || cls.includes('color-fg-attention')) return 'pending';
  return 'unknown';
}

function readRollup(doc: Document, selectors: SelectorsRegistry, headSha: string | null): { rollup: Value<RollupInfo>; detailsUrl: string | null } {
  const all = selectors.resolveAll<HTMLElement>(doc, 'd.pr.rollup');
  if (!all.length) return { rollup: missing('لا رمز حالة مجمَّع في المحادثة'), detailsUrl: null };
  const urlOf = (el: Element): string | null => el.getAttribute('data-deferred-details-content-url');
  // رمز التزام الرأس: بمطابقة sha إن عُرف، وإلا آخر رمز في المحادثة (الالتزامات مرتبة زمنيًا).
  const chosen = (headSha ? all.find((el) => urlOf(el)?.includes(`/commit/${headSha}`)) : all[all.length - 1]) ?? null;
  if (!chosen) return { rollup: missing('رمز التزام الرأس غير ظاهر في المحادثة'), detailsUrl: null };
  const summary = chosen.querySelector('summary');
  const label = squash(summary?.querySelector('svg')?.getAttribute('aria-label'));
  const m = ROLLUP_LABEL.exec(label);
  if (!label) return { rollup: missing('الرمز المجمَّع بلا وصف'), detailsUrl: urlOf(chosen) };
  return {
    rollup: have({ label, tone: toneOf(summary), passed: m ? Number(m[1]) : null, total: m ? Number(m[2]) : null }),
    detailsUrl: urlOf(chosen),
  };
}

export interface FetchedChecks {
  readonly items: readonly CheckItem[];
  readonly error: string | null;
}

export function readChecks(doc: Document, selectors: SelectorsRegistry, headSha: string | null, fetched?: FetchedChecks | null): ChecksSection {
  const box = selectors.resolve(doc, 'd.pr.mergebox')?.element ?? null;
  const { rollup, detailsUrl } = readRollup(doc, selectors, headSha);
  const boxItems = box ? readMergeboxChecks(box) : [];

  let items: readonly CheckItem[] = [];
  let source: ChecksSection['source'] = rollup.available ? 'rollup' : 'none';
  let noneReported = false;
  let error = fetched?.error ?? null;
  if (boxItems.length) {
    items = boxItems;
    source = 'mergebox';
  } else if (fetched && !fetched.error) {
    items = fetched.items;
    source = fetched.items.length ? 'status-details' : source;
    // CODEX-001: ردّ بلا صفوف مفهومة (صفحة دخول أو تخطيط آخر) ليس «لا فحوص»: الرمز المجمَّع نفسه يدل على فحوص. الصفر يثبت فقط حين يعلنه الرمز.
    if (!fetched.items.length) {
      if (rollup.available && rollup.value.total === 0) noneReported = true;
      else error = 'لم يُفهم ردّ تفاصيل الفحوص: لا صفوف فحوص فيه، والرمز المجمَّع يدل على فحوص';
    }
  }
  return {
    items,
    counts: countCategories(items.map((i) => i.classification)),
    source,
    rollup,
    detailsUrl: items.length || noneReported ? null : detailsUrl,
    requiredKnown: boxItems.length > 0,
    noneReported,
    error,
  };
}

// ---- الملخص ----

export interface ReadOptions {
  /** ما جلبه الموديول من status-details (أو سبب فشله). */
  readonly fetched?: FetchedChecks | null;
  /** رقم الطلب من مسار الصفحة، يُستعمل حين لا تضمّن الصفحة بياناتها المنظّمة. */
  readonly pageNumber?: number | null;
}

export function readPrSummary(doc: Document, selectors: SelectorsRegistry, options: ReadOptions = {}): PrSummary {
  const embedded = readEmbedded(doc, selectors);
  const box = selectors.resolve(doc, 'd.pr.mergebox')?.element ?? null;
  const { base, head } = readBranches(doc, selectors, embedded);
  const lines = readLines(doc, selectors);
  const known = embedded?.number ?? options.pageNumber ?? null;
  const number: Value<number> = known !== null ? have(known) : missing(NOT_ON_PAGE);
  return {
    number,
    state: readState(doc, selectors, embedded),
    head,
    base,
    behind: readBehind(box),
    commits: readCommits(doc, selectors),
    files: counterOf(doc, selectors, 'd.pr.tab-files'),
    additions: lines.additions,
    deletions: lines.deletions,
    reviews: readReviews(box, doc, selectors),
    conflicts: readConflicts(box),
    checks: readChecks(doc, selectors, embedded?.headSha ?? null, options.fetched),
    headSha: embedded?.headSha ?? null,
  };
}

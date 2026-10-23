// وصف الصفحة المفتوحة كما تحتاجه واجهات الوحدات (ز) و(ح): المستودع ونوع الصفحة ورقمها والالتزام والمرجع والمسار ونطاق الأسطر.
// يُبنى من الرابط وحده (اللوحة الأصلية لا ترى DOM الصفحة)، ثم يُغنى من DOM حين يتوفر (سكربت المحتوى والدرج).
// مصادر الإثراء ثابتة القياس في evidence/T-0.4/report.md ‏(AC-S4.1): meta octolytics-dimension-repository_nwo، وبيانات
// react-app.embeddedData ‏(codeViewLayoutRoute.refInfo/path) في صفحة الملف، وسمات data-* في صفحات الفروق.
import { classifyPath, GITHUB_ORIGIN } from '../../core/detector/page-types';
import type { PageType } from '../../core/detector/page-types';

/** sha: الاسم هو معرّف الالتزام نفسه؛ ref: فرع أو وسم (لا يُميَّز بينهما في الصفحة)؛ unknown: لم يُستخرج من DOM. */
export type RefKind = 'sha' | 'ref' | 'unknown';

export interface LineRange {
  readonly start: number;
  readonly end: number;
}

export type DiffSide = 'L' | 'R';

export interface DiffSelection extends LineRange {
  /** معرّف ملف الفرق في الرابط: diff-<SHA-256 للمسار>. */
  readonly anchor: string;
  readonly side: DiffSide;
}

export interface PageInfo {
  readonly href: string;
  readonly type: PageType;
  readonly owner: string | null;
  readonly repo: string | null;
  /** رقم المشكلة أو طلب الدمج. */
  readonly number: number | null;
  /** معرّف الالتزام في صفحة الالتزام. */
  readonly sha: string | null;
  /** «‹المرجع›/‹المسار›» كما في الرابط بعد blob/، مفكوك الترميز. */
  readonly blobRest: string | null;
  readonly ref: string | null;
  readonly refKind: RefKind;
  readonly path: string | null;
  /** تحديد الأسطر في صفحة الملف (#L10-L25). */
  readonly lines: LineRange | null;
  /** تحديد في صفحة فروق (#diff-…R10). */
  readonly diff: DiffSelection | null;
  /** مسار ملف الفرق المحدَّد؛ لا يُعرف إلا من DOM. */
  readonly diffPath: string | null;
  readonly title: string | null;
}

const SHA = /^[0-9a-f]{7,40}$/i;
const FULL_SHA = /^[0-9a-f]{40}$/i;
const LINE_HASH = /^#L(\d+)(?:C\d+)?(?:-L(\d+)(?:C\d+)?)?$/;
const DIFF_HASH = /^#(diff-[0-9a-f]+)([LR])(\d+)(?:-[LR]?(\d+))?$/i;

const decode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

export const isSha = (value: string): boolean => SHA.test(value);

function orderedRange(a: number, b: number): LineRange {
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** تحديد الأسطر من هاش الرابط، أو null. */
export function parseLineHash(hash: string): LineRange | null {
  const match = LINE_HASH.exec(hash);
  if (!match) return null;
  const start = Number(match[1]);
  return orderedRange(start, match[2] === undefined ? start : Number(match[2]));
}

export function parseDiffHash(hash: string): DiffSelection | null {
  const match = DIFF_HASH.exec(hash);
  if (!match) return null;
  const start = Number(match[3]);
  const range = orderedRange(start, match[4] === undefined ? start : Number(match[4]));
  return { anchor: (match[1] as string).toLowerCase(), side: (match[2] as string).toUpperCase() as DiffSide, ...range };
}

const EMPTY: Omit<PageInfo, 'href' | 'type' | 'title'> = {
  owner: null,
  repo: null,
  number: null,
  sha: null,
  blobRest: null,
  ref: null,
  refKind: 'unknown',
  path: null,
  lines: null,
  diff: null,
  diffPath: null,
};

/** يبني وصف الصفحة من الرابط وحده. المرجع والمسار من أول مقطع بعد blob/: تخمين يصيب إلا في فرع اسمه فيه شرطة مائلة. */
export function pageInfoFromUrl(href: string, title: string | null = null): PageInfo {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { ...EMPTY, href, type: 'external', title };
  }
  if (url.origin !== GITHUB_ORIGIN) return { ...EMPTY, href: url.href, type: 'external', title };
  const route = classifyPath(url.pathname);
  const segments = url.pathname.split('/').filter(Boolean).map(decode);
  let sha: string | null = null;
  let blobRest: string | null = null;
  let ref: string | null = null;
  let refKind: RefKind = 'unknown';
  let path: string | null = null;
  if (route.type === 'commit' && segments[3] !== undefined && SHA.test(segments[3])) sha = segments[3].toLowerCase();
  if (route.type === 'blob' && segments.length > 4) {
    blobRest = segments.slice(3).join('/');
    ref = segments[3] ?? null;
    path = segments.slice(4).join('/');
    if (ref !== null && FULL_SHA.test(ref)) refKind = 'sha';
  }
  return {
    href: url.href,
    type: route.type,
    owner: route.owner,
    repo: route.repo,
    number: route.number,
    sha,
    blobRest,
    ref,
    refKind,
    path,
    lines: route.type === 'blob' ? parseLineHash(url.hash) : null,
    diff: route.type === 'pr-files' || route.type === 'commit' ? parseDiffHash(url.hash) : null,
    diffPath: null,
    title,
  };
}

interface EmbeddedRefInfo {
  name?: unknown;
  currentOid?: unknown;
}

function embeddedBlob(doc: Document): { name: string; oid: string | null; path: string | null } | null {
  for (const script of doc.querySelectorAll('script[data-target="react-app.embeddedData"]')) {
    try {
      const payload = (JSON.parse(script.textContent ?? '') as { payload?: { codeViewLayoutRoute?: { refInfo?: EmbeddedRefInfo; path?: unknown } } }).payload;
      const layout = payload?.codeViewLayoutRoute;
      const name = layout?.refInfo?.name;
      if (typeof name !== 'string' || !name) continue;
      const oid = layout?.refInfo?.currentOid;
      return { name, oid: typeof oid === 'string' ? oid : null, path: typeof layout?.path === 'string' ? layout.path : null };
    } catch {
      // نص غير JSON أو بنية غير متوقعة: يُجرَّب غيره ثم يبقى ما في الرابط.
    }
  }
  return null;
}

const DIFF_PATH_ATTRS = ['data-tagsearch-path', 'data-file-path', 'data-path'];

/** مسار ملف الفرق الحاوي لمعرّف التحديد (الأسطر نفسها أو ملفها الذي معرّفه diff-<hash>). */
export function diffPathOf(doc: Document, selection: DiffSelection): string | null {
  const exact = `${selection.anchor}${selection.side}${selection.start}`;
  const candidates = [doc.getElementById(exact), doc.getElementById(selection.anchor)];
  for (const element of candidates) {
    if (!element) continue;
    for (const attr of DIFF_PATH_ATTRS) {
      const holder = element.closest(`[${attr}]`);
      const value = holder?.getAttribute(attr);
      if (value) return value;
    }
  }
  return null;
}

/** يغني وصف الصفحة بما في DOM. لا يغيّر شيئًا في الصفحة. */
export function enrichFromDocument(info: PageInfo, doc: Document): PageInfo {
  if (info.type === 'external') return info;
  let next: PageInfo = { ...info, title: doc.title || info.title };
  if (!next.owner || !next.repo) {
    const nwo = doc.querySelector('meta[name="octolytics-dimension-repository_nwo"]')?.getAttribute('content');
    const [owner, repo] = nwo?.split('/') ?? [];
    if (owner && repo) next = { ...next, owner, repo };
  }
  if (next.type === 'blob') {
    const embedded = embeddedBlob(doc);
    if (embedded) {
      const path = embedded.path ?? next.path;
      next = {
        ...next,
        ref: embedded.name,
        refKind: embedded.oid && embedded.name.toLowerCase() === embedded.oid.toLowerCase() ? 'sha' : 'ref',
        path,
        blobRest: path ? `${embedded.name}/${path}` : next.blobRest,
      };
    }
  }
  if (next.diff) next = { ...next, diffPath: diffPathOf(doc, next.diff) };
  return next;
}

/** «‹owner›/‹repo›» أو null. */
export const repoSlug = (info: Pick<PageInfo, 'owner' | 'repo'>): string | null => (info.owner && info.repo ? `${info.owner}/${info.repo}` : null);

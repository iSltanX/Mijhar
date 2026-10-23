// ما يحفظه زر الحفظ السريع من الصفحة المفتوحة: يُبنى من وصف الصفحة (PageInfo) وحده في اللوحة الأصلية، ويُغنى في الصفحة نفسها
// بموضع التمرير وفرع طلب الدمج من DOM. مصادر الفرع مقيسة في evidence/T-0.4/report.md ‏(AC-S4.1): refInfo.name في صفحة الملف (وقد
// يكون وسمًا أو التزامًا فيُحفظ «مرجعًا»)، وheadBranch في بيانات محادثة PR المضمّنة، و‎.head-ref في صفحة ملفات PR القديمة. صفحة
// الالتزام لا تحدد فرعًا فلا يُخمَّن.
import { isSha } from '../../../shared/page';
import type { PageInfo, RefKind } from '../../../shared/page';
import { THREAD_PAGES, isRepoPage } from '../notes/targets';
import type { BookmarkDraft, BookmarkLevel, BookmarkPosition } from './types';

export function levelOf(page: PageInfo): BookmarkLevel {
  if (!isRepoPage(page)) return 'page';
  if (page.type === 'blob') return page.lines ? 'line' : 'file';
  if (page.diff && (page.type === 'pr-files' || page.type === 'commit')) return 'line';
  if (page.type === 'commit') return 'commit';
  if ((THREAD_PAGES as readonly string[]).includes(page.type)) return 'thread';
  return 'repo';
}

function treeRef(page: PageInfo): { ref: string; kind: RefKind } | null {
  if (page.type !== 'tree') return null;
  try {
    const segments = new URL(page.href).pathname.split('/').filter(Boolean);
    const ref = segments[3] ? decodeURIComponent(segments[3]) : null;
    return ref ? { ref, kind: /^[0-9a-f]{40}$/i.test(ref) ? 'sha' : 'ref' } : null;
  } catch {
    return null;
  }
}

/** فرع رأس طلب الدمج من DOM: بيانات المحادثة المضمّنة ثم ‎.head-ref، أو null. */
export function prBranchFromDocument(doc: Document): string | null {
  for (const script of doc.querySelectorAll('script[data-target="react-app.embeddedData"]')) {
    try {
      const payload = (JSON.parse(script.textContent ?? '') as { payload?: { pullRequestsLayoutRoute?: { pullRequest?: { headBranch?: unknown } } } }).payload;
      const head = payload?.pullRequestsLayoutRoute?.pullRequest?.headBranch;
      if (typeof head === 'string' && head) return head;
    } catch {
      // بيانات غير مقروءة: يُجرَّب غيرها.
    }
  }
  const ref = doc.querySelector('.head-ref')?.textContent?.replace(/\s+/g, '').trim();
  return ref || null;
}

export interface ScrollState {
  readonly y: number;
  readonly max: number;
}

/** موضع التمرير الحالي في نافذة، أو null بلا نافذة. */
export function scrollOf(view: Window | null | undefined): ScrollState | null {
  if (!view) return null;
  const doc = view.document.documentElement;
  return { y: Math.max(0, Math.round(view.scrollY)), max: Math.max(0, doc.scrollHeight - view.innerHeight) };
}

function positionOf(page: PageInfo, scroll: ScrollState | null): BookmarkPosition | null {
  if (page.type === 'blob' && page.lines) return { kind: 'lines', start: page.lines.start, end: page.lines.end };
  if (page.diff) return { kind: 'lines', start: page.diff.start, end: page.diff.end, side: page.diff.side };
  if (scroll && scroll.y > 0) return { kind: 'scroll', y: scroll.y, ratio: scroll.max > 0 ? Math.min(1, Math.round((scroll.y / scroll.max) * 1000) / 1000) : 0 };
  return null;
}

export interface CaptureExtras {
  /** DOM الصفحة إن توفر (الصفحة نفسها والدرج)؛ اللوحة الأصلية لا تراه. */
  readonly doc?: Document | null;
  readonly scroll?: ScrollState | null;
}

/** مسودة رابط محفوظ للصفحة، أو null لصفحة خارج github.com. */
export function bookmarkDraftFromPage(page: PageInfo, extras: CaptureExtras = {}): BookmarkDraft | null {
  if (page.type === 'external' || !page.href.startsWith('https://github.com/')) return null;
  let branch: string | null = null;
  let refKind: RefKind = 'unknown';
  if (page.type === 'blob' && page.ref) {
    branch = page.ref;
    refKind = page.refKind === 'unknown' ? (isSha(page.ref) && page.ref.length === 40 ? 'sha' : 'ref') : page.refKind;
  } else if (page.type === 'tree') {
    const tree = treeRef(page);
    if (tree) ({ ref: branch, kind: refKind } = tree);
  } else if ((THREAD_PAGES as readonly string[]).includes(page.type) && page.type !== 'issue' && extras.doc) {
    branch = prBranchFromDocument(extras.doc);
    if (branch) refKind = 'ref';
  }
  return {
    url: page.href,
    title: page.title,
    owner: page.owner,
    repo: page.repo,
    branch,
    refKind,
    level: levelOf(page),
    position: positionOf(page, extras.scroll ?? null),
  };
}

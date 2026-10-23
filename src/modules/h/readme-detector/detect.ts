// كاشف README العربي (T-9.1، F-H1). دالة نقية على ما قُرئ من الصفحة: صفوف شجرة الجذر الظاهرة وروابط README الأساسي.
// الأنماط مقيسة في evidence/T-0.4/report.md ‏(AC-S4.3): اسم الملف ^readme[._-](ar|ara|arabic)([._-][a-z]{2})?\.(md|…)$ بلا حساسية
// لحالة الأحرف، وللرابط الاسم نفسه أو [/_-]ar(-xx)?.md في نهايته. النتيجة لا تجزم بغياب شيء: «لم يُعثر ضمن النطاق» مع بيان النطاق.
export interface TreeEntry {
  readonly name: string;
  readonly href: string;
  readonly kind: 'file' | 'dir';
}

export interface PageLink {
  readonly text: string;
  readonly href: string;
}

export interface ReadmeScan {
  /** صفوف شجرة الجذر الظاهرة؛ فارغة وtreeFound=false إن لم تُقرأ بنية الشجرة من الصفحة. */
  readonly entries: readonly TreeEntry[];
  readonly treeFound: boolean;
  /** روابط README الأساسي المعروض في الصفحة. */
  readonly links: readonly PageLink[];
  readonly readmeFound: boolean;
  /** اقتطاع القائمة إن أُعلن في الصفحة (الظاهر منها والإجمالي إن عُرف). */
  readonly truncation: { readonly shown: number; readonly total: number | null } | null;
}

export interface ArabicReadmeMatch {
  readonly name: string;
  readonly href: string;
  readonly source: 'tree' | 'readme-link';
}

export type DetectionState = 'found' | 'not-found-in-scope' | 'unreadable';

export interface ReadmeDetection {
  readonly state: DetectionState;
  readonly matches: readonly ArabicReadmeMatch[];
  readonly truncation: ReadmeScan['truncation'];
  /** مجلدات في الجذر قد تحوي ترجمات ولم تُفتح. */
  readonly unopenedFolders: readonly string[];
  /** ما فُحص فعلًا، لعرضه في بيان النطاق. */
  readonly scope: { readonly treeEntries: number; readonly readmeLinks: number; readonly readmeShown: boolean };
}

const EXTENSIONS = 'md|markdown|rst|txt|adoc';
export const ARABIC_FILE_NAME = new RegExp(`^readme[._-](ar|ara|arabic)([._-][a-z]{2})?\\.(${EXTENSIONS})$`, 'i');
const ARABIC_PATH_TAIL = new RegExp(`(?:^|/)readme[._-](?:ar|ara|arabic)(?:[._-][a-z]{2})?\\.(?:${EXTENSIONS})$|[/_-]ar(?:-[a-z]{2})?\\.(?:md|markdown)$|(?:^|/)(?:ar|ara|arabic|ar-[a-z]{2})/readme(?:\\.[a-z]+)?$`, 'i');
const ARABIC_FOLDER = /^(ar|ara|arabic|ar-[a-z]{2})$/i;
const ARABIC_LABEL = /^\s*(arabic|العربية|اللغة العربية|عربي|عربى|ar)\s*$/i;
/** مجلدات الجذر التي تُحفظ فيها الترجمات عادةً. */
export const TRANSLATION_FOLDERS = /^(docs?|i18n|l10n|locales?|translations?|lang(uages?)?|ar|arabic)$/i;

const GITHUB = 'https://github.com';
const FILE_VIEW = ['blob', 'raw'];

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** رابط داخل المستودع نفسه إلى ملف أو مجلد (blob أو tree أو raw)، مطلقًا، أو null. */
export function repoFileUrl(href: string, base: string, owner: string, repo: string): { url: URL; path: string; view: string } | null {
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (url.origin !== GITHUB) return null;
  const segments = url.pathname.split('/').filter(Boolean).map(decode);
  if (segments.length < 4 || segments[0]?.toLowerCase() !== owner.toLowerCase() || segments[1]?.toLowerCase() !== repo.toLowerCase()) return null;
  const view = segments[2] ?? '';
  if (!(FILE_VIEW.includes(view) || view === 'tree')) return null;
  return { url, path: segments.slice(3).join('/'), view };
}

const basename = (path: string): string => path.split('/').filter(Boolean).pop() ?? path;

export interface DetectContext {
  readonly owner: string;
  readonly repo: string;
  /** عنوان الصفحة؛ أساس حل الروابط النسبية. */
  readonly base: string;
}

/** يطبّق الأنماط على ما قُرئ. لا يطلب شيئًا. */
export function detectArabicReadme(scan: ReadmeScan, context: DetectContext): ReadmeDetection {
  const matches = new Map<string, ArabicReadmeMatch>();
  for (const entry of scan.entries) {
    if (entry.kind === 'file' && ARABIC_FILE_NAME.test(entry.name)) {
      const target = repoFileUrl(entry.href, context.base, context.owner, context.repo);
      if (target) matches.set(target.url.href, { name: entry.name, href: target.url.href, source: 'tree' });
    }
  }
  for (const link of scan.links) {
    const target = repoFileUrl(link.href, context.base, context.owner, context.repo);
    if (!target) continue;
    const isDir = target.view === 'tree';
    const byPath = ARABIC_PATH_TAIL.test(target.path);
    const byLabel = ARABIC_LABEL.test(link.text) && (isDir ? ARABIC_FOLDER.test(basename(target.path)) : /\.(?:md|markdown|rst|txt|adoc)$/i.test(target.path));
    if ((byPath || byLabel) && !matches.has(target.url.href)) matches.set(target.url.href, { name: basename(target.path), href: target.url.href, source: 'readme-link' });
  }
  const unopenedFolders = scan.entries.filter((e) => e.kind === 'dir' && TRANSLATION_FOLDERS.test(e.name)).map((e) => e.name);
  const found = [...matches.values()];
  const state: DetectionState = found.length ? 'found' : scan.treeFound || scan.readmeFound ? 'not-found-in-scope' : 'unreadable';
  return {
    state,
    matches: found,
    truncation: scan.truncation,
    unopenedFolders,
    scope: { treeEntries: scan.entries.length, readmeLinks: scan.links.length, readmeShown: scan.readmeFound },
  };
}

// تصنيف مسار GitHub إلى نوع صفحة. دالة نقية بلا DOM، فتُختبر على قائمة مسارات مباشرة.
// الجدول مقصود به أنواع تحتاجها الوحدات الثماني؛ ما عداه 'other' (يُعرف أنه GitHub ولا يُعرف نوعه).

export type PageType =
  | 'home'
  | 'profile'
  | 'repo'
  | 'tree'
  | 'blob'
  | 'issue-list'
  | 'issue'
  | 'issue-new'
  | 'pr-list'
  | 'pr'
  | 'pr-files'
  | 'pr-commits'
  | 'pr-checks'
  | 'compare'
  | 'commit'
  | 'actions'
  | 'actions-run'
  | 'discussion-list'
  | 'discussion'
  | 'releases'
  | 'search'
  | 'settings'
  | 'other'
  | 'external';

export const PAGE_TYPES: readonly PageType[] = [
  'home', 'profile', 'repo', 'tree', 'blob', 'issue-list', 'issue', 'issue-new', 'pr-list', 'pr', 'pr-files',
  'pr-commits', 'pr-checks', 'compare', 'commit', 'actions', 'actions-run', 'discussion-list', 'discussion',
  'releases', 'search', 'settings', 'other', 'external',
];

/** low: المسار يطابق ولم يُؤكَّد بنية الصفحة؛ high: المسار والبنية متفقان. */
export type Confidence = 'high' | 'low';

export interface RouteMatch {
  readonly type: PageType;
  readonly owner: string | null;
  readonly repo: string | null;
  readonly number: number | null;
}

export const GITHUB_ORIGIN = 'https://github.com';

// أول مقطع في المسار حين لا يكون اسم مستخدم أو منظمة. قائمة غير شاملة: ما فاتها يُصنَّف 'profile' بثقة low
// لأن محدد confirm.profile لن يطابق، فلا يُدّعى فيها يقين.
const RESERVED_ROOTS: ReadonlySet<string> = new Set([
  'about', 'account', 'apps', 'codespaces', 'collections', 'contact', 'copilot', 'dashboard', 'enterprise', 'events',
  'explore', 'features', 'gist', 'issues', 'join', 'login', 'logout', 'marketplace', 'new', 'notifications',
  'organizations', 'orgs', 'pricing', 'pulls', 'readme', 'search', 'security', 'sessions', 'settings', 'signup',
  'site', 'sponsors', 'stars', 'topics', 'trending', 'users', 'watching',
]);

const NUMERIC = /^\d+$/;

const other = (owner: string | null = null, repo: string | null = null): RouteMatch => ({ type: 'other', owner, repo, number: null });

const safeDecode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

export function classifyPath(pathname: string): RouteMatch {
  const segments = pathname.split('/').filter(Boolean).map(safeDecode);
  const [first, second, third, fourth, fifth] = segments;
  if (first === undefined) return { type: 'home', owner: null, repo: null, number: null };

  if (RESERVED_ROOTS.has(first.toLowerCase())) {
    const root = first.toLowerCase();
    if (root === 'search') return { type: 'search', owner: null, repo: null, number: null };
    if (root === 'settings') return { type: 'settings', owner: null, repo: null, number: null };
    return other();
  }
  if (second === undefined) return { type: 'profile', owner: first, repo: null, number: null };

  const scoped = (type: PageType, number: number | null = null): RouteMatch => ({ type, owner: first, repo: second, number });
  if (third === undefined) return scoped('repo');

  switch (third) {
    case 'tree':
      return scoped('tree');
    case 'blob':
      return scoped('blob');
    case 'issues':
      if (fourth === undefined) return scoped('issue-list');
      if (fourth === 'new') return scoped('issue-new');
      if (NUMERIC.test(fourth)) return scoped('issue', Number(fourth));
      return other(first, second);
    case 'pulls':
      return scoped('pr-list');
    case 'pull': {
      if (fourth === 'new') return scoped('compare');
      if (fourth === undefined || !NUMERIC.test(fourth)) return other(first, second);
      const number = Number(fourth);
      if (fifth === 'files' || fifth === 'changes') return scoped('pr-files', number);
      if (fifth === 'commits') return scoped('pr-commits', number);
      if (fifth === 'checks') return scoped('pr-checks', number);
      return scoped('pr', number);
    }
    case 'compare':
      return scoped('compare');
    case 'commit':
      return fourth === undefined ? other(first, second) : scoped('commit');
    case 'actions':
      if (fourth === 'runs' && fifth !== undefined && NUMERIC.test(fifth)) return scoped('actions-run', Number(fifth));
      return scoped('actions');
    case 'discussions':
      if (fourth !== undefined && NUMERIC.test(fourth)) return scoped('discussion', Number(fourth));
      return scoped('discussion-list');
    case 'releases':
      return scoped('releases');
    default:
      return other(first, second);
  }
}

/** لصفحات غير github.com (لا يعمل سكربت المحتوى فيها عمليًا، لكن الدالة لا تفترض ذلك). */
export const EXTERNAL_ROUTE: RouteMatch = { type: 'external', owner: null, repo: null, number: null };

export interface PageState {
  readonly href: string;
  readonly type: PageType;
  readonly owner: string | null;
  readonly repo: string | null;
  readonly number: number | null;
  readonly confidence: Confidence;
  /** الحاوية الرئيسية وقت الاكتشاف (تتغير هويتها بتنقل Turbo). */
  readonly contentRoot: Element | null;
}

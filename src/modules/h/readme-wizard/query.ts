// الخطوة الأولى في معالج الاقتراح المسؤول (T-9.2، F-H2): رابط بحث يمنع التكرار في المشكلات وطلبات الدمج المفتوحة والمغلقة للمستودع
// الحالي. الاستعلام الكامل يظهر للمستخدم ويعدّله، ويُفحص آليًا قبل اعتماد القالب وقبل كل فتح (AC-H2): صياغته العامة بمدقق البحث
// (discovery/validate.ts)، ثم عوامل OR بين is:issue وis:pr (بلا OR يصير الشرطان «و» فلا نتيجة)، وتقييده بالمستودع الحالي، وعدم قصره
// على المفتوحة أو المغلقة، وترميز الرابط ذهابًا وإيابًا. دوال نقية: لا تفتح شيئًا ولا ترسل شيئًا.
import { validateQuery } from '../discovery/validate';
import type { QueryIssue } from '../discovery/validate';

export const ISSUES_SEARCH = 'https://github.com/search';

/** كلمات البحث عن طلب سابق لـREADME عربي أو ترجمته. */
export const DUPLICATE_TERMS = ['arabic', 'عربي', 'العربية', 'translation'] as const;

/** القالب: المستودع الحالي، ومشكلات أو طلبات دمج، مفتوحة ومغلقة (بلا قيد حالة)، تذكر README وإحدى الكلمات. */
export function duplicateQuery(owner: string, repo: string): string {
  return `repo:${owner}/${repo} (is:issue OR is:pr) readme (${DUPLICATE_TERMS.join(' OR ')})`;
}

/** رابط البحث في المشكلات وطلبات الدمج (type=issues يشمل الاثنين)، مرمَّزًا بـURLSearchParams. */
export function duplicateSearchUrl(query: string): string {
  const url = new URL(ISSUES_SEARCH);
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'issues');
  return url.href;
}

export type DuplicateIssueCode = 'missing-repo' | 'other-repo' | 'missing-kind' | 'kinds-without-or' | 'state-limited' | 'encoding';

export interface DuplicateCheck {
  /** لا أخطاء: يُعتمد الاستعلام ويُفعَّل رابط الفتح. */
  readonly ok: boolean;
  readonly issues: ReadonlyArray<QueryIssue | { readonly code: DuplicateIssueCode; readonly severity: 'error' | 'warning'; readonly message: string }>;
  /** الرابط حين يُعتمد، وإلا null. */
  readonly url: string | null;
  readonly operators: number;
}

const tokens = (query: string): string[] => query.replace(/[()]/g, ' ').split(/\s+/).filter(Boolean);

/** هل is:issue وis:pr في مجموعة أقواس واحدة يفصلهما OR (أو الاستعلام كله بلا أقواس وبينهما OR). */
function kindsJoinedByOr(query: string): boolean {
  const groups = [...query.matchAll(/\(([^()]*)\)/g)].map((m) => m[1] as string);
  const scopes = groups.length ? groups : [query];
  return scopes.some((scope) => /(^|\s)-?is:(issue|pr)\s+OR\s+-?is:(issue|pr)(\s|$)/i.test(scope.trim()) && /is:issue/i.test(scope) && /is:pr/i.test(scope));
}

/** فحص آلي للاستعلام قبل اعتماده؛ owner/repo المستودع المفتوح. */
export function checkDuplicateQuery(query: string, owner: string, repo: string): DuplicateCheck {
  const base = validateQuery(query, 'issues');
  const issues: Array<DuplicateCheck['issues'][number]> = [...base.issues];
  const words = tokens(query);
  const repos = words.filter((w) => /^repo:/i.test(w)).map((w) => w.slice(5).toLowerCase());
  const slug = `${owner}/${repo}`.toLowerCase();
  if (!repos.length) issues.push({ code: 'missing-repo', severity: 'error', message: `أضف repo:${owner}/${repo} ليقتصر البحث على هذا المستودع.` });
  else if (!repos.includes(slug)) issues.push({ code: 'other-repo', severity: 'error', message: `الاستعلام يبحث في مستودع غير المفتوح (${owner}/${repo}).` });
  const hasIssue = words.some((w) => w.toLowerCase() === 'is:issue');
  const hasPr = words.some((w) => w.toLowerCase() === 'is:pr');
  if (!hasIssue || !hasPr) issues.push({ code: 'missing-kind', severity: 'error', message: 'يلزم is:issue وis:pr معًا ليشمل البحث المشكلات وطلبات الدمج.' });
  else if (!kindsJoinedByOr(query)) issues.push({ code: 'kinds-without-or', severity: 'error', message: 'اجمع is:issue وis:pr بـOR داخل قوسين: (is:issue OR is:pr)؛ بدونها يطلب GitHub العنصر مشكلةً وطلب دمج معًا فلا نتيجة.' });
  if (words.some((w) => /^-?(is:(open|closed|merged|unmerged)|state:)/i.test(w))) {
    issues.push({ code: 'state-limited', severity: 'warning', message: 'قيد الحالة يقصر البحث على المفتوحة أو المغلقة؛ الطلب السابق قد يكون مغلقًا.' });
  }
  let url: string | null = null;
  const errors = issues.some((i) => i.severity === 'error');
  if (!errors) {
    const built = duplicateSearchUrl(query);
    const parsed = new URL(built);
    const roundTrip = parsed.searchParams.get('q') === query && parsed.searchParams.get('type') === 'issues';
    if (!roundTrip || /[\s"()<>]/.test(parsed.search)) issues.push({ code: 'encoding', severity: 'error', message: 'تعذّر ترميز الاستعلام في الرابط ترميزًا يعيده كما هو.' });
    else url = built;
  }
  return { ok: url !== null, issues, url, operators: base.operators };
}

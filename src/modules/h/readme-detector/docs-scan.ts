// فحص مجلد docs/ عند الطلب (T-9.1، AC-H1): طلبات api.github.com بنقر صريح وبالصلاحية الاختيارية وحدها، حتى ثلاثة طلبات
// (docs/ ثم مجلدا لغة فيه على الأكثر). كل فشل (رفض أو حد طلبات أو خطأ أو 404) يعلن «لم يكتمل» ولا يجزم بغياب الملف؛
// وحتى القراءة الكاملة لـdocs/ لا تعني غياب توثيق عربي في موضع آخر.
import { FAILURE_TEXT, apiJson, failureText } from '../api-access';
import type { ApiFailure, GithubApiAccess } from '../api-access';
import { ARABIC_FILE_NAME } from './detect';
import type { ArabicReadmeMatch } from './detect';

export const MAX_SCAN_REQUESTS = 3;
const LANGUAGE_FOLDER = /^(ar|ara|arabic|ar-[a-z]{2})$/i;
const ARABIC_DOC_FILE = /^(?:readme[._-])?(?:ar|ara|arabic)(?:[._-][a-z]{2})?\.(?:md|markdown|rst|txt|adoc)$|^.+[_-]ar(?:-[a-z]{2})?\.(?:md|markdown)$/i;

interface ContentItem {
  readonly name: string;
  readonly path: string;
  readonly type: string;
  readonly html_url?: string;
}

export type DocsScanResult =
  /** partial: لم يكتمل فحص بقية مجلدات اللغة (حد الطلبات أو تعذّر مجلد)، وما في matches وُجد فعلًا. */
  | { readonly state: 'found'; readonly matches: readonly ArabicReadmeMatch[]; readonly requests: number; readonly partial?: string }
  | { readonly state: 'none-in-docs'; readonly requests: number; readonly listed: number; readonly message: string }
  | { readonly state: 'incomplete'; readonly reason: ApiFailure | 'declined' | 'unexpected'; readonly requests: number; readonly message: string };

const NONE_MESSAGE = 'لم يُعثر على ملف عربي ضمن محتويات docs/ (قُرئت قائمتها وما فيها من مجلدات لغة). هذا لا يعني أن للمستودع توثيقًا عربيًا أو لا؛ فقد يكون في موضع آخر.';

const isItems = (value: unknown): value is ContentItem[] => Array.isArray(value) && value.every((v) => typeof v === 'object' && v !== null && typeof (v as ContentItem).name === 'string');

const itemUrl = (owner: string, repo: string, item: ContentItem): string => item.html_url ?? `https://github.com/${owner}/${repo}/blob/HEAD/${item.path}`;

/**
 * يفحص docs/. يُستدعى من معالج نقر وحده، وأول ما فيه طلب الصلاحية (بلا await قبله: المتصفح يرفض الطلب بعده).
 * إن كانت الصلاحية ممنوحة سلفًا أعاد request() صحيحًا دون نافذة.
 */
export async function scanDocsFolder(access: GithubApiAccess, owner: string, repo: string): Promise<DocsScanResult> {
  if (!access.available) return { state: 'incomplete', reason: 'unavailable', requests: 0, message: FAILURE_TEXT.unavailable };
  const granted = await access.request();
  if (!granted) return { state: 'incomplete', reason: 'declined', requests: 0, message: 'رفضتَ الصلاحية؛ الفحص لم يكتمل ولم يصدر أي طلب.' };

  let requests = 0;
  const matches = new Map<string, ArabicReadmeMatch>();
  const read = async (path: string): Promise<{ ok: true; items: ContentItem[] } | { ok: false; result: DocsScanResult }> => {
    requests += 1;
    const response = await apiJson<unknown>(access, `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`);
    if (!response.ok) return { ok: false, result: { state: 'incomplete', reason: response.reason, requests, message: failureText(response.reason, response.retryAt) } };
    if (!isItems(response.data)) return { ok: false, result: { state: 'incomplete', reason: 'unexpected', requests, message: 'ردّ GitHub بصيغة غير متوقعة (ربما docs ملف لا مجلد)؛ الفحص لم يكتمل.' } };
    return { ok: true, items: response.data };
  };

  const top = await read('docs');
  if (!top.ok) return top.result;
  let listed = top.items.length;
  const languageFolders: ContentItem[] = [];
  for (const item of top.items) {
    if (item.type === 'file' && (ARABIC_FILE_NAME.test(item.name) || ARABIC_DOC_FILE.test(item.name))) matches.set(item.path, { name: item.name, href: itemUrl(owner, repo, item), source: 'tree' });
    else if (item.type === 'dir' && LANGUAGE_FOLDER.test(item.name)) languageFolders.push(item);
  }
  // GEMINI-014: ما وُجد قبل نفاد الحد أو تعذّر مجلد لاحق يُعرض (مع بيان أن الفحص لم يكتمل)، لا يُسقط.
  const stop = (result: Extract<DocsScanResult, { state: 'incomplete' }>): DocsScanResult => (matches.size ? { state: 'found', matches: [...matches.values()], requests, partial: result.message } : result);
  for (const folder of languageFolders) {
    if (requests >= MAX_SCAN_REQUESTS) return stop({ state: 'incomplete', reason: 'unexpected', requests, message: `بلغ الفحص حد ${MAX_SCAN_REQUESTS} طلبات قبل فتح كل مجلدات اللغة؛ الفحص لم يكتمل.` });
    const inner = await read(`docs/${encodeURIComponent(folder.name)}`);
    if (!inner.ok) return stop(inner.result as Extract<DocsScanResult, { state: 'incomplete' }>);
    listed += inner.items.length;
    for (const item of inner.items) {
      if (item.type === 'file' && /^readme(\.[a-z]+)?$/i.test(item.name.replace(/\.(md|markdown|rst|txt|adoc)$/i, ''))) matches.set(item.path, { name: item.path.replace(/^docs\//, ''), href: itemUrl(owner, repo, item), source: 'tree' });
    }
  }
  return matches.size ? { state: 'found', matches: [...matches.values()], requests } : { state: 'none-in-docs', requests, listed, message: NONE_MESSAGE };
}

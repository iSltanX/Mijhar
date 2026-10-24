// قراءة ما تحتاجه المعاينة (T-11.8، الخطوتان ١ و٢): المستودع وفرعه الأساس والتزامه والملف الواحد ببصمته، عبر طبقة القراءة وحدها (PublicApiPort:
// رسائل إلى عميل الخلفية الوحيد، AD-24) بالرمز للقراءة إن وُجد أو بلا رمز؛ فلا يحمل أي طلب هنا صلاحية كتابة (AC-F7 (١)) ولا يُكتب شيء.
// الملف يُقرأ نصًّا صالحًا UTF-8 بنهايات أسطر موحّدة، وما سواه لا يُقترح تعديله (DEC-11 ط-1).
import type { PublicApiPort } from '../../../core/api/port';
import { base64ToUtf8, isBaseBranchName, lineEnding, pathProblem, textProblem, toLf } from '../../../core/guardrails';
import type { LineEnding } from '../../../core/guardrails';

export interface RepoInfo {
  readonly defaultBranch: string;
  readonly private: boolean;
}

export interface BaseInfo {
  readonly branch: string;
  readonly sha: string;
}

export interface FileInfo {
  /** النص بنهايات LF (ما يُعاين ويُحرَّر). */
  readonly text: string;
  readonly ending: LineEnding;
  /** null: الملف غير موجود في الأساس فيُنشأ. */
  readonly sha: string | null;
}

export interface Prepared {
  readonly owner: string;
  readonly repo: string;
  readonly info: RepoInfo;
  readonly base: BaseInfo;
  readonly path: string;
  readonly file: FileInfo;
  readonly readAt: number;
}

export type ReadResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

const SHA = /^[0-9a-f]{40}$/;
const enc = encodeURIComponent;
const encPath = (path: string): string => path.split('/').map(enc).join('/');

function failure(result: { failure: string; message: string; status: number | null }, what: string): string {
  switch (result.failure) {
    case 'permission':
      return `لم يُقرأ ${what}: صلاحية api.github.com الاختيارية غير ممنوحة؛ امنحها من «الإعدادات والخصوصية». لم يُرسل شيء.`;
    case 'not-found':
      return `لم يُعثر على ${what}، أو أنه في مستودع خاص لا يشمله رمز القراءة (404).`;
    case 'rate-limit':
      return `لم يُقرأ ${what}: بلغ حد الطلبات؛ أعد المحاولة لاحقًا.`;
    default:
      return `لم يُقرأ ${what}: ${result.message}`;
  }
}

export async function readRepo(api: PublicApiPort, owner: string, repo: string): Promise<ReadResult<RepoInfo>> {
  const result = await api.get<{ default_branch?: unknown; private?: unknown }>(`/repos/${enc(owner)}/${enc(repo)}`);
  if (!result.ok) return { ok: false, message: failure(result, 'المستودع') };
  const branch = result.data.default_branch;
  if (typeof branch !== 'string' || !isBaseBranchName(branch)) return { ok: false, message: 'لم يُعرف الفرع الافتراضي للمستودع.' };
  return { ok: true, value: { defaultBranch: branch, private: result.data.private === true } };
}

export async function readBase(api: PublicApiPort, owner: string, repo: string, branch: string): Promise<ReadResult<BaseInfo>> {
  if (!isBaseBranchName(branch)) return { ok: false, message: 'اسم الفرع الأساس غير صالح.' };
  const result = await api.get<{ object?: { sha?: unknown; type?: unknown } }>(`/repos/${enc(owner)}/${enc(repo)}/git/ref/heads/${encPath(branch)}`);
  if (!result.ok) return { ok: false, message: failure(result, `الفرع ${branch}`) };
  const sha = result.data.object?.sha;
  if (typeof sha !== 'string' || !SHA.test(sha)) return { ok: false, message: `لم يُعرف التزام رأس الفرع ${branch}.` };
  return { ok: true, value: { branch, sha } };
}

export async function readFile(api: PublicApiPort, owner: string, repo: string, path: string, ref: string): Promise<ReadResult<FileInfo>> {
  const problem = pathProblem(path);
  if (problem) return { ok: false, message: problem };
  const result = await api.get<{ type?: unknown; encoding?: unknown; content?: unknown; sha?: unknown }>(`/repos/${enc(owner)}/${enc(repo)}/contents/${encPath(path)}?ref=${enc(ref)}`);
  if (!result.ok) {
    if (result.failure === 'not-found') return { ok: true, value: { text: '', ending: 'lf', sha: null } };
    return { ok: false, message: failure(result, `الملف ${path}`) };
  }
  const { type, encoding, content, sha } = result.data;
  if (Array.isArray(result.data) || type !== 'file') return { ok: false, message: `«${path}» ليس ملفًا واحدًا (مجلد أو رابط).` };
  if (encoding !== 'base64' || typeof content !== 'string' || typeof sha !== 'string' || !SHA.test(sha)) return { ok: false, message: `لم يُقرأ نص «${path}» (ملف كبير أو غير نصي).` };
  const text = base64ToUtf8(content);
  if (text === null) return { ok: false, message: `«${path}» ليس نصًا بترميز UTF-8؛ خارج نطاق التعديل النصي.` };
  const ending = lineEnding(text);
  if (ending === null) return { ok: false, message: `«${path}» بنهايات أسطر مختلطة؛ لا يُعاين فرقه بأمانة.` };
  const issue = textProblem(text);
  if (issue) return { ok: false, message: issue };
  return { ok: true, value: { text: toLf(text), ending, sha } };
}

/** الخطوتان ١ و٢: المستودع ثم الأساس (المختار أو الافتراضي) ثم الملف منه. أول تعذّر يوقف ما بعده. */
export async function prepare(api: PublicApiPort, owner: string, repo: string, path: string, base: string | null, now: () => number = () => Date.now()): Promise<ReadResult<Prepared>> {
  const problem = pathProblem(path);
  if (problem) return { ok: false, message: problem };
  const info = await readRepo(api, owner, repo);
  if (!info.ok) return info;
  const head = await readBase(api, owner, repo, base || info.value.defaultBranch);
  if (!head.ok) return head;
  const file = await readFile(api, owner, repo, path, head.value.sha);
  if (!file.ok) return file;
  return { ok: true, value: { owner, repo, info: info.value, base: head.value, path, file: file.value, readAt: now() } };
}

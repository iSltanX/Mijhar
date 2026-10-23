// قراءة ملفات المشروع من github.com نفسه (T-9.3): GET إلى github.com/<owner>/<repo>/raw/HEAD/<path> الذي يحوّل إلى
// raw.githubusercontent.com والنص مقروء بـCORS (evidence/T-0.4: 614–974 مللي ثانية). لا صلاحية api.github.com هنا.
// المواضع المرشحة مرتبة؛ والتخمين يخطئ أحيانًا (flask وfree-programming-books في T-0.4)، فمواضع الروابط الظاهرة في الصفحة تسبقه
// حين يتوفر DOM، ويُعلن ما جُرِّب ولم يُعثر عليه. فشل غير 404 (شبكة أو خطأ خادم) لا يُعدّ «غير موجود».
export type FileKind = 'readme' | 'contributing' | 'conduct' | 'pr-template';

export const FILE_KINDS: readonly FileKind[] = ['readme', 'contributing', 'conduct', 'pr-template'];

export const FILE_LABELS: Readonly<Record<FileKind, string>> = {
  readme: 'README',
  contributing: 'CONTRIBUTING',
  conduct: 'CODE_OF_CONDUCT',
  'pr-template': 'قالب طلب الدمج',
};

export const CANDIDATE_PATHS: Readonly<Record<FileKind, readonly string[]>> = {
  readme: ['README.md', 'readme.md', 'Readme.md', 'README.markdown', 'README.rst'],
  contributing: ['CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md', 'CONTRIBUTING.rst', 'contributing.md'],
  conduct: ['CODE_OF_CONDUCT.md', '.github/CODE_OF_CONDUCT.md', 'docs/CODE_OF_CONDUCT.md', 'code_of_conduct.md'],
  'pr-template': ['.github/PULL_REQUEST_TEMPLATE.md', '.github/pull_request_template.md', 'PULL_REQUEST_TEMPLATE.md', 'pull_request_template.md', 'docs/pull_request_template.md'],
};

export const MAX_FILE_BYTES = 400_000;

export type TextResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'not-found' | 'http' | 'network' | 'too-large'; readonly status?: number };

export type FetchText = (url: string) => Promise<TextResult>;

/** الافتراضي: fetch من السياق الحالي. الاستجابة 404 صفحة HTML كاملة (نحو 266 KB)، فيُفحص status قبل القراءة. */
export const defaultFetchText: FetchText = async (url) => {
  try {
    const response = await fetch(url, { redirect: 'follow' });
    if (response.status === 404) return { ok: false, reason: 'not-found', status: 404 };
    if (!response.ok) return { ok: false, reason: 'http', status: response.status };
    if ((response.headers.get('content-type') ?? '').includes('text/html')) return { ok: false, reason: 'http', status: response.status };
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_FILE_BYTES) return { ok: false, reason: 'too-large' };
    const text = await response.text();
    return text.length > MAX_FILE_BYTES ? { ok: false, reason: 'too-large' } : { ok: true, text };
  } catch {
    return { ok: false, reason: 'network' };
  }
};

export const rawUrl = (owner: string, repo: string, path: string): string =>
  `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/raw/HEAD/${path.split('/').map(encodeURIComponent).join('/')}`;

const HINT_PATTERNS: Readonly<Record<FileKind, RegExp>> = {
  readme: /(^|\/)readme(\.[a-z]+)?$/i,
  contributing: /(^|\/)contributing(\.[a-z]+)?$/i,
  conduct: /(^|\/)code[_-]of[_-]conduct(\.[a-z]+)?$/i,
  'pr-template': /(^|\/)pull_request_template(\.[a-z]+)?$/i,
};

/**
 * مواضع تظهر روابطها في الصفحة المفتوحة (جدول الجذر وتبويبات النظرة العامة) لكل نوع. المرجع ملتبس حين يحوي الفرع شرطة مائلة،
 * فيؤخذ المسار بعد أول مقطع من blob/ ويبقى التخمين بعده احتياطًا.
 */
export function pathHintsFromDocument(doc: Document, owner: string, repo: string): Partial<Record<FileKind, string[]>> {
  const out: Partial<Record<FileKind, string[]>> = {};
  const prefix = `/${owner}/${repo}/blob/`.toLowerCase();
  for (const a of doc.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    let pathname: string;
    try {
      pathname = new URL(a.href || a.getAttribute('href') || '', 'https://github.com').pathname;
    } catch {
      continue;
    }
    if (!pathname.toLowerCase().startsWith(prefix)) continue;
    const rest = pathname.slice(prefix.length).split('/').map((s) => decodeURIComponent(s));
    const path = rest.slice(1).join('/');
    if (!path) continue;
    for (const kind of FILE_KINDS) {
      if (!HINT_PATTERNS[kind].test(path)) continue;
      const list = (out[kind] ??= []);
      if (!list.includes(path)) list.push(path);
    }
  }
  return out;
}

export interface ProjectFile {
  readonly kind: FileKind;
  readonly path: string;
  readonly url: string;
  readonly text: string;
}

export interface MissingFile {
  readonly kind: FileKind;
  /** المواضع التي جُرِّبت فأجابت 404 كلها. */
  readonly tried: readonly string[];
}

export interface FailedFile {
  readonly kind: FileKind;
  readonly reason: 'http' | 'network' | 'too-large';
  readonly path: string;
}

export interface ProjectRead {
  readonly files: readonly ProjectFile[];
  readonly missing: readonly MissingFile[];
  readonly failed: readonly FailedFile[];
  readonly requests: number;
}

export async function readProjectFiles(owner: string, repo: string, fetchText: FetchText = defaultFetchText, hints: Partial<Record<FileKind, readonly string[]>> = {}): Promise<ProjectRead> {
  const files: ProjectFile[] = [];
  const missing: MissingFile[] = [];
  const failed: FailedFile[] = [];
  let requests = 0;
  for (const kind of FILE_KINDS) {
    const paths = [...new Set([...(hints[kind] ?? []), ...CANDIDATE_PATHS[kind]])];
    const tried: string[] = [];
    let settled = false;
    for (const path of paths) {
      requests += 1;
      const url = rawUrl(owner, repo, path);
      const result = await fetchText(url);
      if (result.ok) {
        files.push({ kind, path, url, text: result.text });
        settled = true;
        break;
      }
      if (result.reason === 'not-found') {
        tried.push(path);
        continue;
      }
      failed.push({ kind, reason: result.reason, path });
      settled = true;
      break;
    }
    if (!settled) missing.push({ kind, tried });
  }
  return { files, missing, failed, requests };
}

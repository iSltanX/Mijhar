// نطاق الكتابة الوحيد (T-11.8، DEC-11 ط-1، AC-F6): ملف واحد نصي في طلب دمج واحد. خطة الكتابة بنية مغلقة يتحقق منها هنا كل من يلمسها (الواجهة
// قبل عرض النطاق، والخلفية قبل أي طلب)، فلا يُكتب إلا ما رآه المستخدم في الفرق ووافق عليه:
//  - المستودع والفرع الأساس والتزامه كما قُرئ وقت المعاينة، والفرع الجديد، ومسار الملف وبصمته (أو null لملف جديد)، والمحتوى الجديد كاملًا،
//    وعنوان الطلب (وهو رسالة الالتزام) ونصه ومسودته.
//  - المسار نصي بامتداد توثيق أو إعداد ظاهر وحده: لا شيفرة، ولا ما يشغّله GitHub (.github/workflows و.github/actions)، ولا ملف أسرار (.env).
//    فلا يتحول المسار إلى بيئة برمجة ولا إلى تنفيذ (DEC-11: استُبعد ط-2).
//  - لا يُستنتج شيء من محتوى الصفحة ولا من ردّ مزوّد: الخطة من القراءة ومن تحرير المستخدم وحدهما (AC-F7 (٢) و(٣)).

export interface WritePlan {
  readonly owner: string;
  readonly repo: string;
  /** الفرع الأساس الذي يتفرع منه الجديد ويُفتح الطلب إليه. */
  readonly base: string;
  /** التزام رأس الأساس كما قُرئ وقت المعاينة: يتفرع منه الفرع الجديد، فلا يُكتب فوق ما لم يُعاين. */
  readonly baseSha: string;
  /** الفرع الجديد. */
  readonly branch: string;
  readonly path: string;
  /** بصمة الملف كما قُرئت؛ null لملف غير موجود يُنشأ. */
  readonly fileSha: string | null;
  /** المحتوى الجديد كاملًا كما سيُكتب. */
  readonly content: string;
  /** عنوان طلب الدمج، وهو رسالة الالتزام. */
  readonly title: string;
  readonly body: string;
  readonly draft: boolean;
}

/** أقصى حجم للملف قبل التعديل وبعده (حروفًا): ملف نصي يُعاين فرقه كاملًا. */
export const MAX_TEXT_CHARS = 100_000;
export const MAX_TEXT_LINES = 5_000;
export const MAX_TITLE = 120;
export const MAX_BODY = 1_000;

/** امتدادات التوثيق والإعداد الظاهر المقبولة. */
export const TEXT_EXTENSIONS: readonly string[] = ['md', 'markdown', 'txt', 'text', 'rst', 'adoc', 'asciidoc', 'org', 'json', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'properties'];
/** أسماء ملفات نصية بلا امتداد مقبول. */
export const TEXT_NAMES: readonly string[] = ['README', 'CONTRIBUTING', 'CHANGELOG', 'AUTHORS', 'NOTICE', 'CODE_OF_CONDUCT', 'SECURITY', 'SUPPORT', '.editorconfig', '.gitignore', '.gitattributes'];

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const SHA = /^[0-9a-f]{40}$/;
const NEW_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
// الأساس يأتي من GitHub (الفرع الافتراضي أو ما كتبه المستخدم): يُقبل ما تقبله git دون محارف التحكم والمسافات وما يحظره check-ref-format.
const BASE_BRANCH = /^[^\s~^:?*[\\\x00-\x1f\x7f]{1,255}$/;
const PATH_SEGMENT = /^[^\x00-\x1f\x7f\\/:*?"<>|]{1,255}$/;
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f]/;

/** قواعد git المشتركة لاسم فرع (git check-ref-format): لا «..» ولا «//» ولا «@{» ولا مقطع يبدأ بنقطة أو ينتهي بـ.lock. */
function refShapeOk(name: string): boolean {
  if (name.includes('..') || name.includes('//') || name.includes('@{') || name.endsWith('/') || name.endsWith('.') || name.startsWith('/')) return false;
  return name.split('/').every((s) => s !== '' && !s.startsWith('.') && !s.endsWith('.lock'));
}

export const isNewBranchName = (name: string): boolean => NEW_BRANCH.test(name) && refShapeOk(name);
export const isBaseBranchName = (name: string): boolean => BASE_BRANCH.test(name) && refShapeOk(name);
export const isRepoSlug = (owner: string, repo: string): boolean => OWNER.test(owner) && REPO.test(repo) && repo !== '.' && repo !== '..';

/** سبب رفض المسار، أو null إن كان ملفًا نصيًا في النطاق. */
export function pathProblem(path: string): string | null {
  if (!path || path.length > 255) return 'المسار فارغ أو أطول من 255 حرفًا.';
  const segments = path.split('/');
  if (segments.some((s) => !PATH_SEGMENT.test(s) || s === '.' || s === '..')) return 'المسار غير صالح: مقطع فارغ أو «.» أو «..» أو محرف غير مقبول.';
  if (segments.some((s) => s === '.git')) return 'لا يُعدَّل شيء داخل .git.';
  const lower = path.toLowerCase();
  if (lower.startsWith('.github/workflows/') || lower.startsWith('.github/actions/')) return 'ملفات .github/workflows و.github/actions يشغّلها GitHub؛ خارج نطاق التعديل النصي.';
  const name = segments[segments.length - 1] as string;
  if (/^\.env(\.|$)/i.test(name)) return 'ملفات .env قد تحمل أسرارًا؛ خارج النطاق.';
  if (TEXT_NAMES.includes(name)) return null;
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (!ext && TEXT_NAMES.includes(name.toUpperCase())) return null;
  if (TEXT_EXTENSIONS.includes(ext)) return null;
  return `«${name}» ليس ملف توثيق أو إعداد نصيًا معروفًا؛ النطاق ملف نصي واحد (${TEXT_EXTENSIONS.map((e) => `.${e}`).join(' ')}).`;
}

export const isTextPath = (path: string): boolean => pathProblem(path) === null;

/** سبب رفض النص (محتوى ملف قبل التعديل أو بعده)، أو null. */
export function textProblem(text: string): string | null {
  if (text.length > MAX_TEXT_CHARS) return `الملف أكبر من ${MAX_TEXT_CHARS} حرف؛ خارج نطاق التعديل النصي المعاين.`;
  if (text.includes('\u0000')) return 'الملف ليس نصًا (فيه محرف NUL).';
  if (text.split('\n').length > MAX_TEXT_LINES) return `الملف أطول من ${MAX_TEXT_LINES} سطر.`;
  return null;
}

/** سبب رفض عنوان الطلب، أو null. */
export function titleProblem(title: string): string | null {
  const t = title.trim();
  if (!t) return 'عنوان الطلب فارغ.';
  if (t.length > MAX_TITLE) return `عنوان الطلب أطول من ${MAX_TITLE} حرفًا.`;
  if (/[\r\n]/.test(title) || CONTROL.test(title)) return 'عنوان الطلب سطر واحد بلا محارف تحكم.';
  return null;
}

export type PlanCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const fail = (reason: string): PlanCheck => ({ ok: false, reason });

/** يتحقق من الخطة كاملة: شكلها وكل حقل فيها. لا شبكة. */
export function checkPlan(value: unknown): PlanCheck {
  if (typeof value !== 'object' || value === null) return fail('لا خطة كتابة.');
  const p = value as Partial<Record<keyof WritePlan, unknown>>;
  const keys = Object.keys(value).sort().join(',');
  if (keys !== 'base,baseSha,body,branch,content,draft,fileSha,owner,path,repo,title') return fail('خطة الكتابة بحقول غير متوقعة.');
  if (typeof p.owner !== 'string' || typeof p.repo !== 'string' || !isRepoSlug(p.owner, p.repo)) return fail('المستودع غير صالح.');
  if (typeof p.base !== 'string' || !isBaseBranchName(p.base)) return fail('الفرع الأساس غير صالح.');
  if (typeof p.baseSha !== 'string' || !SHA.test(p.baseSha)) return fail('التزام الأساس غير معروف.');
  if (typeof p.branch !== 'string' || !isNewBranchName(p.branch)) return fail('اسم الفرع الجديد غير صالح: حروف لاتينية وأرقام و. _ - / بلا «..».');
  if (p.branch === p.base) return fail('الفرع الجديد هو الأساس نفسه؛ لا كتابة على الأساس.');
  if (typeof p.path !== 'string') return fail('مسار الملف غير صالح.');
  const pathIssue = pathProblem(p.path);
  if (pathIssue) return fail(pathIssue);
  if (p.fileSha !== null && (typeof p.fileSha !== 'string' || !SHA.test(p.fileSha))) return fail('بصمة الملف غير صالحة.');
  if (typeof p.content !== 'string') return fail('المحتوى غير صالح.');
  const textIssue = textProblem(p.content);
  if (textIssue) return fail(textIssue);
  if (typeof p.title !== 'string') return fail('عنوان الطلب غير صالح.');
  const titleIssue = titleProblem(p.title);
  if (titleIssue) return fail(titleIssue);
  if (typeof p.body !== 'string' || p.body.length > MAX_BODY || CONTROL.test(p.body.replace(/\r?\n/g, ''))) return fail('نص الطلب غير صالح.');
  if (typeof p.draft !== 'boolean') return fail('حالة المسودة غير صالحة.');
  return { ok: true };
}

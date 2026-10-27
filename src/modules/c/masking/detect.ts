// اكتشاف العناصر المحمية داخل نص عادي. محافظ عمدًا: ما لا يُجزم بأنه كود أو مسار أو رابط يُترك للمترجم،
// فالخطأ في الاتجاه المحافظ يُترجم نصًا كان يجب حفظه، والخطأ في الاتجاه المعاكس يحجب ترجمة سليمة.
// لا يُكتشف عمدًا الشكل الحرّ word/word (مثل and/or وowner/repo)، فلا قاعدة تفصله عن أزواج الكلمات العادية.

import type { TokenType } from './types';

export interface Detected {
  readonly start: number;
  readonly end: number;
  readonly type: TokenType;
}

interface Detector {
  readonly type: TokenType;
  readonly pattern: RegExp;
  /** يقتطع من المطابقة ما لا ينتمي إليها (علامات ترقيم لاحقة)؛ يعيد الطول المحتفظ به. */
  readonly trim?: (match: string) => number;
}

// الأقدم في المصفوفة يغلب عند تساوي بداية المطابقتين وطولهما، والأطول يغلب أولًا.
const FILE_EXTENSIONS =
  'md|mdx|json|jsonc|ts|tsx|js|jsx|mjs|cjs|css|scss|html|htm|yml|yaml|toml|lock|py|rb|go|rs|java|kt|swift|c|h|cpp|cs|php|sh|bash|zsh|txt|xml|svg|png|jpg|jpeg|gif|webp|pdf|zip|tar|gz|env|ini|cfg|conf|sql|vue|svelte|log|csv';

// مجلدات جذر شائعة لا تلتبس بكلمات النثر؛ تجعل المسار بلا امتداد قابلًا للجزم به.
const ROOT_DIRS = 'src|lib|dist|build|docs|tests?|scripts|bin|packages|node_modules|vendor|fixtures|evidence|tools';

const BEFORE = String.raw`(?<![\w@./:\\-])`;

/** يزيل علامات الترقيم اللاحقة، وقوسًا إغلاقيًا لا قوس فتح مقابلًا له داخل المطابقة. */
function trimTrailingPunctuation(match: string): number {
  let end = match.length;
  for (;;) {
    const last = match[end - 1];
    if (last === undefined) return end;
    if ('.,;:!?\'"'.includes(last)) end -= 1;
    else if (last === ')' && count(match.slice(0, end), '(') < count(match.slice(0, end), ')')) end -= 1;
    else if (last === ']' && count(match.slice(0, end), '[') < count(match.slice(0, end), ']')) end -= 1;
    else return end;
  }
}

function count(text: string, ch: string): number {
  let n = 0;
  for (const c of text) if (c === ch) n += 1;
  return n;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FLAGS = String.raw`(?:\s+(?:--?[A-Za-z][\w-]*(?:=(?:"[^"\n]*"|'[^'\n]*'|[^\s"']+))?|"[^"\n]*"|'[^'\n]*'))*`;

// الأدوات وأوامرها الفرعية المعروفة.
const SUBCOMMANDS: Readonly<Record<string, readonly string[]>> = {
  git: ['add', 'bisect', 'blame', 'branch', 'checkout', 'cherry-pick', 'clean', 'clone', 'commit', 'config', 'diff', 'fetch', 'init', 'log', 'merge', 'mv', 'pull', 'push', 'rebase', 'remote', 'reset', 'restore', 'revert', 'rm', 'show', 'stash', 'status', 'submodule', 'switch', 'tag', 'worktree'],
  npm: ['audit', 'ci', 'exec', 'i', 'init', 'install', 'link', 'pack', 'publish', 'remove', 'run', 'start', 'test', 'uninstall', 'update'],
  pnpm: ['add', 'audit', 'build', 'dlx', 'exec', 'i', 'install', 'publish', 'remove', 'run', 'start', 'test', 'update'],
  yarn: ['add', 'build', 'dlx', 'install', 'publish', 'remove', 'run', 'start', 'test', 'upgrade'],
  gh: ['api', 'auth', 'codespace', 'extension', 'gist', 'issue', 'pr', 'release', 'repo', 'run', 'workflow'],
  docker: ['build', 'compose', 'exec', 'images', 'login', 'logs', 'network', 'ps', 'pull', 'push', 'rm', 'rmi', 'run', 'start', 'stop', 'volume'],
  pip: ['freeze', 'install', 'list', 'show', 'uninstall'],
  pip3: ['freeze', 'install', 'list', 'show', 'uninstall'],
  cargo: ['add', 'build', 'check', 'clippy', 'fmt', 'init', 'install', 'new', 'publish', 'run', 'test'],
  brew: ['install', 'uninstall', 'update', 'upgrade'],
  apt: ['install', 'remove', 'update', 'upgrade'],
  'apt-get': ['install', 'remove', 'update', 'upgrade'],
  kubectl: ['apply', 'create', 'delete', 'describe', 'exec', 'get', 'logs', 'rollout'],
};

const COMMAND_PATTERN = new RegExp(
  `\\b(?:${Object.entries(SUBCOMMANDS)
    .map(([tool, subs]) => `${escapeRegExp(tool)}\\s+(?:${subs.map(escapeRegExp).join('|')})(?![\\w-])`)
    .join('|')})${FLAGS}|\\bnpx\\s+[\\w@][\\w@/.-]*${FLAGS}`,
  'g',
);

const DETECTORS: readonly Detector[] = [
  // روابط http(s) وmailto وعناوين البريد.
  { type: 'LINK', pattern: /\b(?:https?:\/\/|mailto:)[^\s<>"'`⟦⟧]+/g, trim: trimTrailingPunctuation },
  { type: 'LINK', pattern: /(?<![\w.@-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![\w@-])/g, trim: trimTrailingPunctuation },
  // مسارات ويندوز.
  { type: 'PATH', pattern: /(?<![\w])[A-Za-z]:\\[^\s<>"'|?*`⟦⟧]+/g, trim: trimTrailingPunctuation },
  // مسار يبدأ بـ / أو ./ أو ../ أو ~/ ويليه مقطع واحد على الأقل.
  { type: 'PATH', pattern: new RegExp(`${BEFORE}(?:~|\\.{1,2})?(?:/[\\w.@+-]+)+/?`, 'g'), trim: trimTrailingPunctuation },
  // مسار نسبي بمقطعين فأكثر ينتهي بامتداد معروف أو بشرطة مائلة أخيرة: src/core/registry.ts وsrc/core/
  {
    type: 'PATH',
    pattern: new RegExp(`${BEFORE}[\\w@+-][\\w.@+-]*(?:/[\\w.@+-]+)+(?:\\.(?:${FILE_EXTENSIONS})\\b|/(?=\\s|$))`, 'g'),
    trim: trimTrailingPunctuation,
  },
  // مسار يبدأ بمجلد جذر معروف حتى بلا امتداد: dist/chromium وsrc/core/index
  {
    type: 'PATH',
    pattern: new RegExp(`${BEFORE}(?:${ROOT_DIRS})(?:/[\\w.@+-]+)+/?`, 'g'),
    trim: trimTrailingPunctuation,
  },
  // ملفات النقاط: .gitignore و.github/workflows/ci.yml
  { type: 'PATH', pattern: /(?<![\w/.@-])\.[A-Za-z][\w-]*(?:\.[\w-]+)*(?:\/[\w.@+-]+)*/g, trim: trimTrailingPunctuation },
  // اسم ملف مجرد بامتداد معروف: package.json وvite.config.ts
  { type: 'PATH', pattern: new RegExp(`${BEFORE}[\\w+-][\\w+-]*(?:\\.[\\w+-]+)*\\.(?:${FILE_EXTENSIONS})\\b`, 'g') },
  // أوامر: أداة + أمر فرعي معروف + أعلام وسلاسل مقتبسة تليه. الأمر الفرعي من قائمة مغلقة حتى لا تُبتلع جملة مثل «use git for».
  // علامة ترقيم بعد آخر علم («(git checkout --branch=main).») من الجملة لا من الأمر (GEMINI-020).
  { type: 'CMD', pattern: COMMAND_PATTERN, trim: trimTrailingPunctuation },
  // curl وwget لا أمر فرعي لهما: يلزم بعدهما علم أو رابط.
  { type: 'CMD', pattern: /\b(?:curl|wget)\s+(?:-{1,2}[A-Za-z][\w-]*|https?:\/\/\S+)(?:\s+(?:-{1,2}[A-Za-z][\w-]*(?:=\S+)?|"[^"\n]*"|'[^'\n]*'|https?:\/\/[^\s<>"'`⟦⟧]+))*/g, trim: trimTrailingPunctuation },
  // إشارات: owner/repo#123 ثم #123 ثم SHA ثم @user وفرق @org/team
  { type: 'REF', pattern: /(?<![\w/])[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*#\d+\b/g },
  { type: 'REF', pattern: /(?<![\w&#])#\d+\b/g },
  { type: 'REF', pattern: /\b(?=[0-9a-f]*[0-9])(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g },
  { type: 'USER', pattern: /(?<![\w@./-])@[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\/[A-Za-z0-9._-]+)?/g, trim: trimTrailingPunctuation },
];

/** مطابقة المصطلحات: الأطول أولًا، بحدود كلمة تعتمد على أحرف Unicode لا على \b. */
function termPattern(terms: readonly string[]): RegExp | null {
  const unique = [...new Set(terms.filter((t) => t.length > 0))].sort((a, b) => b.length - a.length);
  if (unique.length === 0) return null;
  const body = unique.map(escapeRegExp).join('|');
  return new RegExp(`(?<![\\p{L}\\p{N}_])(?:${body})(?![\\p{L}\\p{N}_])`, 'gu');
}

/**
 * يجمع كل المطابقات ثم يحسم التداخل: الأبكر بداية، وعند التساوي الأطول، وعند التساوي أيضًا الأقدم ترتيبًا.
 * المصطلحات تأتي آخر الأولويات، فكلمة داخل رابط أو مسار لا تُقتطع منه.
 */
export function detectProtected(text: string, terms: readonly string[]): Detected[] {
  const found: (Detected & { readonly rank: number })[] = [];
  DETECTORS.forEach((detector, rank) => {
    for (const m of text.matchAll(detector.pattern)) {
      const raw = m[0];
      const length = detector.trim ? detector.trim(raw) : raw.length;
      if (length === 0 || m.index === undefined) continue;
      found.push({ start: m.index, end: m.index + length, type: detector.type, rank });
    }
  });
  const termRegex = termPattern(terms);
  if (termRegex) {
    for (const m of text.matchAll(termRegex)) {
      if (m.index !== undefined) found.push({ start: m.index, end: m.index + m[0].length, type: 'TERM', rank: DETECTORS.length });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end || a.rank - b.rank);
  const result: Detected[] = [];
  let cursor = 0;
  for (const d of found) {
    if (d.start < cursor) continue;
    result.push({ start: d.start, end: d.end, type: d.type });
    cursor = d.end;
  }
  return result;
}

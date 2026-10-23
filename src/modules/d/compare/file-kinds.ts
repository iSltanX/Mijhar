// تصنيف نوع الملف في المقارنة (F-D6): كود، اختبارات، اعتماديات، سير عمل، توثيق، وأخرى لما عداها حتى تجتمع الأعداد كلها.
// التصنيف من مسار الملف وحده (قاعدة ثابتة بلا تخمين من المحتوى)، وأسبقيته بترتيب KINDS: سير العمل ثم الاعتماديات ثم الاختبارات ثم التوثيق ثم الكود.

export const FILE_KINDS = ['code', 'tests', 'dependencies', 'workflows', 'docs', 'other'] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const FILE_KIND_LABELS: Readonly<Record<FileKind, string>> = {
  code: 'كود',
  tests: 'اختبارات',
  dependencies: 'اعتماديات',
  workflows: 'سير عمل',
  docs: 'توثيق',
  other: 'أخرى',
};

const WORKFLOW_PATH = /(^|\/)\.github\/(workflows|actions)\//i;
const WORKFLOW_FILE = /(^|\/)(\.gitlab-ci\.yml|azure-pipelines\.ya?ml|jenkinsfile|\.travis\.yml|bitbucket-pipelines\.yml|appveyor\.yml)$/i;
const WORKFLOW_DIR = /(^|\/)\.circleci\//i;

const DEPENDENCY_FILES = new Set([
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
  'requirements.txt', 'pipfile', 'pipfile.lock', 'poetry.lock', 'pyproject.toml', 'uv.lock',
  'go.mod', 'go.sum', 'cargo.toml', 'cargo.lock', 'gemfile', 'gemfile.lock', 'composer.json', 'composer.lock',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'gradle.lockfile', 'podfile', 'podfile.lock',
  'pubspec.yaml', 'pubspec.lock', 'packages.config', 'mix.exs', 'mix.lock', 'deno.lock', 'flake.lock',
]);
const DEPENDENCY_REQ = /(^|\/)requirements[\w.-]*\.txt$/i;

const TEST_DIR = /(^|\/)(tests?|__tests__|spec|specs|e2e|__mocks__|__snapshots__|fixtures|testdata)\//i;
// ملفات الاختبار بتسميتها: x.test.js وx.spec.ts وx_test.go وtest_x.py وx.test-d.ts (تعريفات tsd)، وtest.js وtests.py وحدها (تسمية شائعة لملف اختبار وحيد).
const TEST_FILE = /(\.|_|-)(test|spec|tests|e2e)(-d)?\.[\w]+$|(^|\/)(test|tests|spec)\.\w+$|(^|\/)test_[\w.-]+\.\w+$|(^|\/)[\w.-]+_test\.\w+$/i;

const DOC_EXT = /\.(md|mdx|markdown|rst|adoc|txt)$/i;
const DOC_FILE = /(^|\/)(readme|license|licence|changelog|contributing|code_of_conduct|security|authors|notice|copying)(\.[\w]+)?$/i;
const DOC_DIR = /(^|\/)(docs?|documentation)\//i;

const CODE_EXT = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'vue', 'svelte', 'astro',
  'py', 'pyi', 'rb', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'swift', 'm', 'mm', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'cs', 'fs',
  'php', 'pl', 'lua', 'r', 'dart', 'ex', 'exs', 'erl', 'hs', 'clj', 'zig', 'nim', 'jl',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'sql', 'html', 'htm', 'css', 'scss', 'sass', 'less', 'graphql', 'gql', 'proto', 'sol',
]);

/** يزيل علامات الاتجاه التي يضيفها GitHub حول المسار ويوحّد الفواصل. */
export function cleanPath(path: string): string {
  return path.replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/\\/g, '/').replace(/^\/+/, '').trim();
}

export function classifyFile(rawPath: string): FileKind {
  const path = cleanPath(rawPath);
  const base = (path.split('/').pop() ?? '').toLowerCase();
  if (WORKFLOW_PATH.test(path) || WORKFLOW_FILE.test(path) || WORKFLOW_DIR.test(path)) return 'workflows';
  if (DEPENDENCY_FILES.has(base) || DEPENDENCY_REQ.test(path)) return 'dependencies';
  if (TEST_DIR.test(path) || TEST_FILE.test(path)) return 'tests';
  if (DOC_EXT.test(base) || DOC_FILE.test(path) || DOC_DIR.test(path)) return 'docs';
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : '';
  if (CODE_EXT.has(ext)) return 'code';
  return 'other';
}

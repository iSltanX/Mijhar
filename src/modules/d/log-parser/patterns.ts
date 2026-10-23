// قائمة الأنماط الحتمية لمحلل سجل الفحص (T-5.3، F-D5). الطبقة الثانية («السبب الجذري المثبت») لا تُملأ إلا بتطابق نمط من هذه
// القائمة؛ فكل نمط نصٌّ تطبعه أداة بعينها حين يقع الخطأ نفسه، لا تخمين من كلمات عامة. وما يحتمل أكثر من سبب (كود الخروج 137،
// أعطال الشبكة) ليس هنا: يذهب إلى الطبقة الثالثة موسومًا «احتمال يحتاج تحققًا» (possibilities.ts).
// تُختبر الأنماط واحدًا واحدًا على أسطر تمثّل مخرجات أدواتها (tests/modules/d/log-parser.test.ts).

export interface PatternHit {
  /** ما يميّز هذا التطابق عن غيره من النمط نفسه (ملف وسطر، أو اسم وحدة)، لإسقاط المكرر. */
  readonly key: string;
  /** السبب بالعربية، مشتقًا من نص السطر وحده. */
  readonly cause: string;
}

export interface LogPattern {
  readonly id: string;
  /** اسم النمط كما يظهر بجوار السبب. */
  readonly title: string;
  /** الأداة التي تطبع النص؛ للتوثيق. */
  readonly tool: string;
  match(line: string): PatternHit | null;
}

const pattern = (id: string, title: string, tool: string, re: RegExp, hit: (m: RegExpExecArray) => PatternHit | null): LogPattern => ({
  id,
  title,
  tool,
  match(line) {
    const m = re.exec(line);
    return m ? hit(m) : null;
  },
});

const at = (file: string | undefined, line: string | undefined): string => (file ? `${file}${line ? `:${line}` : ''}` : '');

export const LOG_PATTERNS: readonly LogPattern[] = [
  pattern(
    'typescript-error',
    'خطأ مترجم TypeScript',
    'tsc',
    /(?:^|\s)(?:(?<file>[^\s():]+\.(?:[cm]?tsx?|vue))(?:\((?<line>\d+),(?<col>\d+)\)|:(?<line2>\d+):(?<col2>\d+))\s*[-:]?\s*)?error\s+(?<code>TS\d{4,5}):\s*(?<msg>.+)$/,
    (m) => {
      const g = m.groups ?? {};
      const where = at(g.file, g.line ?? g.line2);
      return { key: `${g.code}@${where}`, cause: `فشلت ترجمة TypeScript بالخطأ ${g.code}${where ? ` في ${where}` : ''}: ${g.msg?.trim()}` };
    },
  ),
  pattern('rust-error', 'خطأ مترجم Rust', 'rustc', /^error\[(?<code>E\d{4})\]:\s*(?<msg>.+)$/, (m) => ({
    key: `${m.groups?.code}:${m.groups?.msg}`,
    cause: `فشلت ترجمة Rust بالخطأ ${m.groups?.code}: ${m.groups?.msg}`,
  })),
  pattern('python-syntax', 'خطأ صياغة Python', 'python', /^\s*(?<kind>SyntaxError|IndentationError|TabError):\s*(?<msg>.+)$/, (m) => ({
    key: `${m.groups?.kind}:${m.groups?.msg}`,
    cause: `توقف Python بخطأ صياغة (${m.groups?.kind}): ${m.groups?.msg}`,
  })),
  pattern('node-module-not-found', 'وحدة Node.js غير موجودة', 'node', /(?:Error: )?Cannot find (?:module|package) '(?<name>[^']+)'/, (m) => ({
    key: m.groups?.name ?? '',
    cause: `لم يجد Node.js الوحدة «${m.groups?.name}» عند تشغيلها`,
  })),
  pattern('python-module-not-found', 'وحدة Python غير مثبتة', 'python', /ModuleNotFoundError: No module named '(?<name>[^']+)'/, (m) => ({
    key: m.groups?.name ?? '',
    cause: `لم يجد Python الوحدة «${m.groups?.name}»: غير مثبتة في بيئة التشغيل`,
  })),
  pattern('pip-no-distribution', 'حزمة pip غير متاحة بالإصدار المطلوب', 'pip', /ERROR: No matching distribution found for (?<req>\S+)/, (m) => ({
    key: m.groups?.req ?? '',
    cause: `لم يجد pip توزيعًا يطابق «${m.groups?.req}»`,
  })),
  pattern(
    'npm-ci-out-of-sync',
    'ملف القفل غير متزامن',
    'npm ci',
    /`npm ci` can only install packages when your package\.json and package-lock\.json(?: or npm-shrinkwrap\.json)? are in sync/,
    () => ({ key: 'lock', cause: 'رفض `npm ci` التثبيت لأن package.json وpackage-lock.json غير متزامنين' }),
  ),
  pattern('npm-eresolve', 'تعارض اعتماديات npm', 'npm', /npm (?:ERR!|error) code ERESOLVE/, () => ({ key: 'eresolve', cause: 'تعذّر على npm حل شجرة الاعتماديات (ERESOLVE): اعتماديات متعارضة' })),
  pattern('command-not-found', 'أمر غير موجود', 'shell', /(?:^|:\s)(?<cmd>[\w./+-]+): (?:command )?not found$/, (m) => ({
    key: m.groups?.cmd ?? '',
    cause: `الأمر «${m.groups?.cmd}» غير موجود في بيئة المشغّل`,
  })),
  pattern('node-heap-oom', 'نفاد ذاكرة Node.js', 'node', /JavaScript heap out of memory|Reached heap limit Allocation failed/, () => ({ key: 'heap', cause: 'نفدت ذاكرة كومة Node.js فتوقفت العملية' })),
  pattern('disk-full', 'امتلاء القرص', 'os', /No space left on device|\bENOSPC\b/, () => ({ key: 'disk', cause: 'امتلأ قرص المشغّل (No space left on device)' })),
  pattern(
    'job-timeout',
    'تجاوز مهلة المهمة',
    'GitHub Actions',
    /The job running on runner .+ has exceeded the maximum execution time of (?<min>\d+) minutes/,
    (m) => ({ key: 'timeout', cause: `أوقف GitHub Actions المهمة لتجاوزها مهلتها القصوى (${m.groups?.min} دقيقة)` }),
  ),
  pattern('operation-cancelled', 'إلغاء العملية', 'GitHub Actions', /^The operation was canceled\.$/, () => ({ key: 'cancel', cause: 'أُلغيت المهمة قبل اكتمالها (The operation was canceled)' })),
  pattern('integration-permission', 'صلاحية رمز سير العمل', 'GitHub API', /Resource not accessible by integration/, () => ({
    key: 'integration',
    cause: 'رفض GitHub طلبًا من سير العمل لأن رمزه (GITHUB_TOKEN) لا يملك الصلاحية اللازمة',
  })),
  pattern('eslint-errors', 'أخطاء ESLint', 'eslint', /✖ (?<n>\d+) problems? \((?<e>\d+) errors?, (?<w>\d+) warnings?\)/, (m) =>
    Number(m.groups?.e) > 0 ? { key: 'eslint', cause: `أبلغ ESLint عن ${m.groups?.e} خطأ (${m.groups?.n} مشكلة إجمالًا)` } : null,
  ),
  pattern('test-failures', 'اختبارات فاشلة', 'jest / vitest / pytest', /^\s*(?:Tests:\s+(?<jest>\d+) failed|Test Files\s+(?<vitest>\d+) failed|=+ (?<pytest>\d+) failed)/, (m) => {
    const n = m.groups?.jest ?? m.groups?.vitest ?? m.groups?.pytest;
    const unit = m.groups?.vitest ? 'ملف اختبار' : 'اختبار';
    return { key: 'tests', cause: `فشل ${n} ${unit} بحسب ملخص أداة الاختبار` };
  }),
  pattern('go-test-fail', 'اختبار Go فاشل', 'go test', /^--- FAIL: (?<name>\S+)/, (m) => ({ key: m.groups?.name ?? '', cause: `فشل اختبار Go «${m.groups?.name}»` })),
  pattern('git-merge-conflict', 'تعارض دمج Git', 'git', /^CONFLICT \([^)]+\): Merge conflict in (?<file>.+)$/, (m) => ({
    key: m.groups?.file ?? '',
    cause: `تعارض دمج في ${m.groups?.file}`,
  })),
  pattern('docker-pull-limit', 'حد سحب Docker Hub', 'docker', /toomanyrequests: You have reached your pull rate limit/, () => ({
    key: 'docker',
    cause: 'رفض Docker Hub سحب الصورة لبلوغ حد السحب',
  })),
];

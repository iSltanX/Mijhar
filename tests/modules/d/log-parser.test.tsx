// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911"}
// TEST-LOG-01 (AC-D5): محلل سجل الفحص بثلاث طبقات على السجل المرجعي (fixtures/logs/fixture-action-logs-with-secrets.txt):
//  الطبقة الأولى الرسالة الحرفية وموضعها (الخطوة وكود الخروج والأسطر المحيطة)؛ الثانية لا تُملأ إلا بنمط حتمي معرّف وإلا عبارة الغياب؛
//  الثالثة موسومة «احتمال يحتاج تحققًا»؛ لا تختلط الطبقات؛ والسجل المقتطع أو غير المتاح يُعلَن.
// ومعه الوحدة d.log على صفحة مهمة حقيقية محفوظة لغير مسجَّل (fixtures/logs/gh-job-failed.html).
import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import {
  JOB_PAGE_SELECTORS,
  LOG_PATTERNS,
  LogAnalysisView,
  LogHttpError,
  NO_ROOT_CAUSE_TEXT,
  POSSIBILITY_TAG,
  analyzeLog,
  createLogModule,
  isJobPath,
  readJobPage,
  stripTimestamp,
} from '../../../src/modules/d/log-parser';
import type { FetchLog, LogAnalysis } from '../../../src/modules/d/log-parser';
import { ROOT, flush, hostsOf, loadHtml, loadHtmlText, mountModules, readFixture, selectorsWith, shadowText } from './helpers';

const LOGS = `${ROOT}/fixtures/logs`;
const REFERENCE = readFixture(`${LOGS}/fixture-action-logs-with-secrets.txt`);
const UNMATCHED = readFixture(`${LOGS}/fixture-action-log-unmatched.txt`);
const JOB_PAGE = `${LOGS}/gh-job-failed.html`;
const referenceLines = REFERENCE.trimEnd().split('\n').map(stripTimestamp);

const renderView = (analysis: LogAnalysis): HTMLElement => {
  const box = document.createElement('div');
  render(<LogAnalysisView analysis={analysis} />, box);
  return box;
};
const layer = (box: Element, name: string): Element => box.querySelector(`[data-layer="${name}"]`) as Element;
const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('السجل المرجعي (500 سطر: خطأ بناء TypeScript و##[error] ورمز مختلَق)', () => {
  const analysis = analyzeLog({ text: REFERENCE, source: 'step-log' });

  it('يُقرأ كاملًا: 500 سطر بلا اقتطاع', () => {
    expect(analysis.availability).toEqual({ state: 'full', lines: 500 });
  });

  it('الطبقة الأولى: رسالة ##[error] بنصها وموضعها (الخطوة من عنوان المجموعة، وكود الخروج، والسطر، والأسطر المحيطة)', () => {
    expect(analysis.location.exitCode).toBe(2);
    expect(analysis.location.exitLine).toBe(490);
    const marker = analysis.messages.find((m) => m.origin === 'error-marker');
    expect(marker).toMatchObject({ text: 'Process completed with exit code 2.', line: 490, step: 'Run npm run build' });
    expect(marker?.context.find((l) => l.focus)?.number).toBe(490);
    expect(marker?.context.map((l) => l.number)).toEqual([485, 486, 487, 488, 489, 490, 491, 492]);
    // كل سطر في السياق منقول حرفيًا (بلا الطابع الزمني).
    for (const line of marker?.context ?? []) expect(line.text).toBe(referenceLines[line.number - 1]?.replace(/^##\[(?:error|warning)\]/, ''));
  });

  it('الطبقة الأولى تضم أسطر أخطاء المترجم بنصها الحرفي ورقمها', () => {
    const lines = analysis.messages.filter((m) => m.origin === 'pattern-line');
    expect(lines.map((m) => m.line)).toEqual([481, 482, 483]);
    for (const m of lines) expect(m.text).toBe(referenceLines[(m.line ?? 0) - 1]);
    expect(lines.every((m) => m.step === 'Run npm run build')).toBe(true);
  });

  it('الطبقة الثانية: ثلاثة أسباب من نمط TypeScript الحتمي، ودليل كل منها سطره', () => {
    expect(analysis.rootCauses.map((c) => [c.patternId, c.evidence.line])).toEqual([
      ['typescript-error', 481],
      ['typescript-error', 482],
      ['typescript-error', 483],
    ]);
    expect(analysis.rootCauses[0]?.cause).toContain('TS2322');
    expect(analysis.rootCauses[0]?.cause).toContain('src/settings/panel.ts:42');
    expect(analysis.rootCauses[0]?.detail).toBe("Type 'string' is not assignable to type 'number'.");
    expect(analysis.rootCauses[2]?.cause).toContain('TS2307');
    for (const c of analysis.rootCauses) expect(referenceLines).toContain(c.evidence.text);
  });

  it('الطبقة الثالثة: كل احتمال موسوم ومعه أساسه، ولا يكرر سببًا من الثانية', () => {
    expect(analysis.possibilities.length).toBeGreaterThan(0);
    for (const p of analysis.possibilities) {
      expect(p.tag).toBe(POSSIBILITY_TAG);
      expect(p.basis.length).toBeGreaterThan(3);
      expect(analysis.rootCauses.some((c) => c.cause === p.text)).toBe(false);
    }
    // التحذير الذي سبق الفشل احتمال لا سبب.
    expect(analysis.possibilities.find((p) => p.quote?.text.includes('set-output'))?.quote?.line).toBe(480);
  });

  it('سطر الرمز المختلَق ليس خطأً ولا سببًا (لا يُستنتج منه شيء)', () => {
    const tokenLine = referenceLines.findIndex((l) => l.includes('ghp_')) + 1;
    expect(tokenLine).toBe(457);
    expect(analysis.messages.some((m) => m.line === tokenLine)).toBe(false);
    expect(analysis.rootCauses.some((c) => c.evidence.line === tokenLine)).toBe(false);
  });

  it('العرض: ثلاثة أقسام مفصولة بعناوينها، ولا يظهر نص طبقة في أخرى', () => {
    const box = renderView(analysis);
    const [l1, l2, l3] = ['literal', 'root-cause', 'possibility'].map((n) => layer(box, n));
    expect(box.querySelectorAll('[data-layer]')).toHaveLength(3);
    expect(text(l1)).toContain('الرسالة الحرفية وموضعها');
    expect(text(l1)).toContain('Process completed with exit code 2.');
    expect(text(l2)).toContain('السبب الجذري المثبت');
    expect(l2?.querySelectorAll('[data-pattern="typescript-error"]')).toHaveLength(3);
    // الرسائل المتجاورة في كتلة واحدة: أسطر المترجم 481–483 و##[error] في 490 سياقاتها متداخلة فلا يتكرر سطر.
    const numbers = [...(l1?.querySelectorAll('.d-ln') ?? [])].map((n) => Number(n.textContent));
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(l1?.querySelectorAll('[data-messages]')).toHaveLength(1);
    expect(l1?.querySelector('[data-messages]')?.getAttribute('data-messages')).toBe('4');
    expect([...(l1?.querySelectorAll('[data-focus="true"] .d-ln') ?? [])].map((n) => n.textContent)).toEqual(['481', '482', '483', '490']);
    expect(text(l2)).not.toContain(NO_ROOT_CAUSE_TEXT);
    expect(l3?.querySelectorAll('li')).toHaveLength(analysis.possibilities.length);
    for (const li of l3?.querySelectorAll('li') ?? []) expect(text(li)).toContain(POSSIBILITY_TAG);
    // لا وسم احتمال في الحقائق ولا في السبب المثبت، ولا نص احتمال فيهما.
    for (const el of [l1, l2]) {
      expect(text(el)).not.toContain(POSSIBILITY_TAG);
      for (const p of analysis.possibilities) expect(text(el)).not.toContain(p.text);
    }
    for (const c of analysis.rootCauses) expect(text(l1)).not.toContain(c.cause);
    // موضع الخطأ ظاهر: الخطوة وكود الخروج.
    expect(text(box.querySelector('[data-field="exit-code"]'))).toContain('2');
    expect(box.querySelector('[data-log-state]')).toBeNull();
  });
});

describe('الاقتطاع وعدم الإتاحة يُعلنان', () => {
  it('سجل أطول من الحد: يُحلَّل آخره ويُعلَن الاقتطاع بعدد ما قُرئ، ولا يضيع اسم الخطوة', () => {
    const analysis = analyzeLog({ text: REFERENCE, source: 'step-log', maxLines: 100 });
    expect(analysis.availability).toMatchObject({ state: 'truncated', readLines: 100, totalLines: 500 });
    expect(analysis.rootCauses).toHaveLength(3);
    expect(analysis.messages.find((m) => m.origin === 'error-marker')?.step).toBe('Run npm run build');
    const box = renderView(analysis);
    const banner = box.querySelector('[data-log-state="truncated"]');
    expect(text(banner)).toContain('مقتطع');
    expect(text(banner)).toContain('100');
    expect(text(banner)).toContain('500');
  });

  it('اقتطاع يعلنه المصدر أو السجل نفسه', () => {
    expect(analyzeLog({ text: 'a\nb\n', source: 'step-log', truncatedBySource: 'حدّ الجلب' }).availability).toMatchObject({ state: 'truncated', reason: 'حدّ الجلب' });
    const own = analyzeLog({ text: 'This step has been truncated due to its large size. Download the full logs from the menu once the workflow run has completed.\n', source: 'step-log' });
    expect(own.availability.state).toBe('truncated');
  });

  it('سجل غير متاح: يُعلَن بسببه، والطبقة الأولى من التنبيهات موسومة بمصدرها، والثانية عبارة الغياب', () => {
    const analysis = analyzeLog({
      text: null,
      unavailableReason: 'يحجبه GitHub عن غير المسجَّل',
      source: 'annotations',
      annotations: [{ message: 'Process completed with exit code 1.', level: 'failure', step: { name: 'Compile & Hygiene', number: 14 }, line: 2364 }],
    });
    expect(analysis.availability).toEqual({ state: 'unavailable', reason: 'يحجبه GitHub عن غير المسجَّل' });
    expect(analysis.location).toMatchObject({ exitCode: 1, step: { name: 'Compile & Hygiene', number: 14 } });
    expect(analysis.messages).toEqual([{ text: 'Process completed with exit code 1.', line: 2364, origin: 'annotation', step: '14. Compile & Hygiene', context: [] }]);
    expect(analysis.rootCauses).toEqual([]);
    const box = renderView(analysis);
    expect(text(box.querySelector('[data-log-state="unavailable"]'))).toContain('غير متاح');
    expect(text(layer(box, 'root-cause').querySelector('[data-no-root-cause]'))).toBe(NO_ROOT_CAUSE_TEXT);
    expect(text(layer(box, 'literal'))).toContain('من التنبيهات الظاهرة لا من نص السجل');
  });
});

describe('فشل بلا نمط معرّف', () => {
  const analysis = analyzeLog({ text: UNMATCHED, source: 'step-log' });

  it('الطبقة الثانية فارغة فتظهر عبارة الغياب حرفيًا، والرسالة الحرفية وكود الخروج حاضران', () => {
    expect(analysis.rootCauses).toEqual([]);
    expect(analysis.location.exitCode).toBe(1);
    expect(analysis.messages.map((m) => m.text)).toEqual(['Process completed with exit code 1.']);
    const box = renderView(analysis);
    expect(text(layer(box, 'root-cause'))).toContain(NO_ROOT_CAUSE_TEXT);
  });

  it('الأسطر التي تذكر الفشل قبل الخروج تُقترح في الطبقة الثالثة لا الثانية', () => {
    const quotes = analysis.possibilities.map((p) => p.quote?.text ?? '');
    expect(quotes).toContain('Verification failed: 2 of 12 endpoints returned unexpected payloads');
    expect(analysis.possibilities.every((p) => p.tag === POSSIBILITY_TAG)).toBe(true);
  });
});

describe('قائمة الأنماط الحتمية', () => {
  const cases: [string, string][] = [
    ["src/a.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.", 'typescript-error'],
    ["src/a.tsx:10:5 - error TS2304: Cannot find name 'foo'.", 'typescript-error'],
    ['error TS6053: File not found.', 'typescript-error'],
    ['error[E0425]: cannot find value `x` in this scope', 'rust-error'],
    ['SyntaxError: invalid syntax', 'python-syntax'],
    ["Error: Cannot find module 'left-pad'", 'node-module-not-found'],
    ["ModuleNotFoundError: No module named 'requests'", 'python-module-not-found'],
    ['ERROR: No matching distribution found for torch==9.9.9', 'pip-no-distribution'],
    ['npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.', 'npm-ci-out-of-sync'],
    ['npm ERR! code ERESOLVE', 'npm-eresolve'],
    ['/home/runner/work/_temp/x.sh: line 2: pnpm: command not found', 'command-not-found'],
    ['/bin/sh: 1: yarn: not found', 'command-not-found'],
    ['FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory', 'node-heap-oom'],
    ['write /tmp/x: No space left on device', 'disk-full'],
    ["Error: ENOSPC: System limit for number of file watchers reached, watch '/workspace/project/src'", 'file-watcher-limit'],
    ['The job running on runner GitHub Actions 12 has exceeded the maximum execution time of 360 minutes.', 'job-timeout'],
    ['The operation was canceled.', 'operation-cancelled'],
    ['HttpError: Resource not accessible by integration', 'integration-permission'],
    ['✖ 4 problems (3 errors, 1 warning)', 'eslint-errors'],
    ['Tests:       2 failed, 40 passed, 42 total', 'test-failures'],
    [' Test Files  1 failed | 12 passed (13)', 'test-failures'],
    ['========= 3 failed, 120 passed in 12.3s =========', 'test-failures'],
    ['--- FAIL: TestParse (0.00s)', 'go-test-fail'],
    ['CONFLICT (content): Merge conflict in src/a.ts', 'git-merge-conflict'],
    ['toomanyrequests: You have reached your pull rate limit. You may increase the limit by authenticating', 'docker-pull-limit'],
  ];
  const idOf = (line: string): string | null => LOG_PATTERNS.find((p) => p.match(line))?.id ?? null;

  it.each(cases)('«%s» ← %s', (line, id) => {
    expect(idOf(line)).toBe(id);
  });

  it('كل نمط في القائمة مُختبَر بسطر واحد على الأقل', () => {
    const covered = new Set(cases.map(([, id]) => id));
    expect(LOG_PATTERNS.map((p) => p.id).filter((id) => !covered.has(id))).toEqual([]);
  });

  it('لا تطابق كلمات عامة: «error» أو «failed» أو ESLint بلا أخطاء', () => {
    for (const line of ['Improve error handling in parser', 'Retrying failed download (1/3)', '✖ 1 problem (0 errors, 1 warning)', 'error: something went wrong', 'Exit code 137', 'curl: (6) Could not resolve host: example.invalid']) {
      expect(idOf(line), line).toBeNull();
    }
  });

  it('كود الخروج 137 وعطل الشبكة احتمالان موسومان لا سببان', () => {
    const analysis = analyzeLog({ text: 'curl: (6) Could not resolve host: registry.example.invalid\n##[error]Process completed with exit code 137.\n', source: 'step-log' });
    expect(analysis.rootCauses).toEqual([]);
    expect(analysis.possibilities.map((p) => p.basis)).toContain('كود الخروج 137 = 128 + 9');
    expect(analysis.possibilities.map((p) => p.quote?.text)).toContain('curl: (6) Could not resolve host: registry.example.invalid');
  });
});

describe('الوحدة d.log على صفحة مهمة حقيقية محفوظة (microsoft/vscode، لغير مسجَّل)', () => {
  const selectors = () => selectorsWith(JOB_PAGE_SELECTORS);

  it('قراءة الصفحة: 20 خطوة، والفاشلة 14 «Compile & Hygiene» برابط سجلها، وتنبيه الفشل بموضعه، و«Sign in to view logs»', () => {
    loadHtml(JOB_PAGE);
    const page = readJobPage(document, selectors());
    expect(page.steps).toHaveLength(20);
    expect(page.failedSteps.map((s) => [s.number, s.name])).toEqual([[14, 'Compile & Hygiene']]);
    expect(page.failedSteps[0]?.logUrl).toMatch(/\/checks\/120256773911\/logs\/14$/);
    expect(page.annotations).toEqual([{ message: 'Process completed with exit code 1.', level: 'failure', step: expect.objectContaining({ number: 14, name: 'Compile & Hygiene' }), line: 2364 }]);
    expect(page.signInForLogs).toBe(true);
    expect(isJobPath(location.href)).toBe(true);
    expect(isJobPath('https://github.com/o/r/actions/runs/1')).toBe(false);
  });

  it('لغير المسجَّل: البطاقة قبل حاوية السجلات، والسجل غير متاح بسبب الحجب، ولا زر ولا أي طلب، وتُزال بالإيقاف', async () => {
    loadHtml(JOB_PAGE);
    const before = document.documentElement.outerHTML;
    const requested: string[] = [];
    const fetchLog: FetchLog = async (url) => {
      requested.push(url);
      return { text: '', truncated: null };
    };
    const { manager, errors } = await mountModules([createLogModule({ fetchLog, debounceMs: 5 })]);
    expect(errors).toEqual([]);
    const [host] = hostsOf('d.log');
    expect(host?.nextElementSibling?.id).toBe('logs');
    const card = host?.shadowRoot as ShadowRoot;
    expect(text(card.querySelector('[data-log-state="unavailable"]'))).toContain('Sign in to view logs');
    expect(text(card.querySelector('[data-layer="literal"]'))).toContain('Process completed with exit code 1.');
    expect(text(card.querySelector('[data-field="step"]'))).toContain('Compile & Hygiene');
    expect(text(card.querySelector('[data-no-root-cause]'))).toBe(NO_ROOT_CAUSE_TEXT);
    expect(card.querySelector('[data-action="read-step-log"]')).toBeNull();
    expect(requested).toEqual([]);
    manager.stop();
    expect(hostsOf('d.log')).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  const signedIn = (): void => {
    // المسجَّل: لا رابط «Sign in to view logs» (الصفحة نفسها بلا هذا الرابط).
    loadHtmlText(readFixture(JOB_PAGE).replace(/<a[^>]*href="\/login[^"]*"[^>]*>Sign in to view logs<\/a>/g, ''));
  };

  it('للمسجَّل: الزر يقرأ سجل الخطوة الفاشلة بنقر صريح وحده، فتمتلئ الطبقات من نصه', async () => {
    signedIn();
    const requested: string[] = [];
    const fetchLog: FetchLog = async (url) => {
      requested.push(url);
      return { text: REFERENCE, truncated: null };
    };
    const { manager } = await mountModules([createLogModule({ fetchLog, debounceMs: 5 })]);
    const card = hostsOf('d.log')[0]?.shadowRoot as ShadowRoot;
    expect(requested).toEqual([]);
    expect(text(card.querySelector('[data-log-state="unavailable"]'))).toContain('لم يُقرأ بعد');
    (card.querySelector('[data-action="read-step-log"]') as HTMLButtonElement).click();
    await flush(20);
    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatch(/\/checks\/120256773911\/logs\/14$/);
    expect(card.querySelector('[data-log-source="step-log"]')).not.toBeNull();
    expect(card.querySelectorAll('[data-layer="root-cause"] [data-pattern="typescript-error"]')).toHaveLength(3);
    expect(card.querySelector('[data-log-state]')).toBeNull();
    expect(card.querySelector('[data-action="read-step-log"]')).toBeNull();
    manager.stop();
  });

  it('للمسجَّل بلا صلاحية: 404 يُعلَن حجبًا ولا يُعرض سبب', async () => {
    signedIn();
    const fetchLog: FetchLog = async () => {
      throw new LogHttpError(404);
    };
    const { manager } = await mountModules([createLogModule({ fetchLog, debounceMs: 5 })]);
    const card = hostsOf('d.log')[0]?.shadowRoot as ShadowRoot;
    (card.querySelector('[data-action="read-step-log"]') as HTMLButtonElement).click();
    await flush(20);
    expect(text(card.querySelector('[data-log-state="unavailable"]'))).toContain('حجبه GitHub (HTTP 404)');
    expect(text(card.querySelector('[data-no-root-cause]'))).toBe(NO_ROOT_CAUSE_TEXT);
    manager.stop();
  });

  it('صفحة مهمة بلا خطوة فاشلة ولا تنبيه فشل: لا بطاقة', async () => {
    loadHtmlText(
      readFixture(JOB_PAGE)
        .replace(/data-conclusion="failure"/g, 'data-conclusion="success"')
        .replace(/<annotation-message[\s\S]*?<\/annotation-message>/g, ''),
    );
    const { manager } = await mountModules([createLogModule({ debounceMs: 5 })]);
    expect(hostsOf('d.log')).toHaveLength(0);
    expect(shadowText(hostsOf('d.log')[0])).toBe('');
    manager.stop();
  });
});

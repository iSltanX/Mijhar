#!/usr/bin/env node
// e2e الوحدة (د) في المتصفحات الفعلية (لا يُشغَّل ضمن vitest): الشيفرة التي تُشحن (createPrStatusModule وcreateCompareModule) بتخطيط حقيقي.
//   TEST-PR-01 (AC-D1): صفحة PR حقيقية محفوظة (Watad-Project/Watad#80) وعينة PR المعقدة: الحقول وغير المتاح والفحوص بفصل الإلزامي،
//     وجزء status-details عبر fetch وDOMParser حقيقيين من خادم محلي بنفس الأصل (بلا شبكة خارجية)، وفشل الجلب يُعلَن ولا يُعرض نجاحًا.
//   TEST-PR-02 (AC-D2): التصنيفات السبعة بنصها في البطاقة (عينة معقدة بالسبعة، وجزء status-details).
//   TEST-DIFF-01 (AC-D6): ثلاث صفحات مقارنة (فرعان، التزامان، وسمان) وصفحة التزام حقيقية محفوظة بتخطيط الفروقات الفعلي: مطابقة الإحصاء
//     للصفحة، وانفصال قسم الأثر بنيويًا وبصريًا (الحدود والخلفية المحسوبتان) ووسمه «يحتاج مراجعة بشرية».
// الاستعمال: node tests/modules/d/browser/run.mjs [chrome edge brave firefox] [--out-dir evidence]
// كل متصفح بملف تعريف مؤقت جديد؛ المتصفحات تباعًا؛ العينات تُخدم من 127.0.0.1 (الصفحات الحقيقية تطلب أنماط github.githubassets.com).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { machineInfo, openBrowser, serveDir, waitFor, writeJson } from '../../../../scripts/spikes/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const SERVE = path.join(ROOT, 'dist/mj8-d-browser');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

const PR = [
  { name: 'real-pr', file: 'fixtures/spikes/gh-pr-watad-80.html', href: 'https://github.com/Watad-Project/Watad/pull/80', repo: 'Watad-Project/Watad' },
  { name: 'complex-pr', file: 'tests/modules/d/fixtures/fixture-pr-complex.html', href: 'https://github.com/octo/demo/pull/4242', repo: 'octo/demo' },
];
const COMPARE = [
  { name: 'compare-branches', file: 'tests/modules/d/fixtures/fixture-compare-branches.html', href: 'https://github.com/octo/demo/compare/main...feature%2Fui-refresh', kind: 'branches', files: 30, additions: 4301, deletions: 733, kinds: { code: 21, tests: 6, dependencies: 1, workflows: 1, docs: 1, other: 0 } },
  { name: 'compare-commits', file: 'tests/modules/d/fixtures/fixture-compare-commits.html', href: 'https://github.com/octo/demo/compare/98ea6bc...86a863a', kind: 'commits', files: 27, additions: 4268, deletions: 726, kinds: { code: 21, tests: 6, dependencies: 0, workflows: 0, docs: 0, other: 0 } },
  { name: 'compare-tags', file: 'tests/modules/d/fixtures/fixture-compare-tags.html', href: 'https://github.com/octo/demo/compare/v1.4.0...v1.5.0', kind: 'tags', files: 12, additions: 1891, deletions: 387, kinds: { code: 8, tests: 4, dependencies: 0, workflows: 0, docs: 0, other: 0 } },
  // صفحة التزام حقيقية محفوظة بتخطيط الفروقات الفعلي، تُركَّب عليها الوحدة بعنوان مقارنة: التحقق من الاستخراج على بنية GitHub لا على كتابتنا.
  { name: 'real-commit-as-compare', file: 'fixtures/spikes/gh-commit-bms-1.html', href: 'https://github.com/ahrrfy/business_management_system/compare/98ea6bc...86a863a', kind: 'commits', files: 27, additions: 4268, deletions: 726, kinds: { code: 21, tests: 6, dependencies: 0, workflows: 0, docs: 0, other: 0 } },
];

async function bundle() {
  fs.rmSync(SERVE, { recursive: true, force: true });
  await build({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    mode: 'chromium',
    logLevel: 'warn',
    build: { outDir: SERVE, lib: { entry: path.join(HERE, 'entry.ts'), formats: ['iife'], name: 'MijharDBundle', fileName: () => 'mijhar-d.js' } },
  });
  for (const page of [...PR, ...COMPARE]) fs.copyFileSync(path.join(ROOT, page.file), path.join(SERVE, `${page.name}.html`));
  // جزء status-details لكل التزام تعرضه صفحتا PR: يُخدم بالمسار نفسه الذي تطلبه الوحدة بنفس الأصل.
  const fragment = fs.readFileSync(path.join(ROOT, 'tests/modules/d/fixtures/fixture-status-details.html'), 'utf8');
  for (const page of PR) {
    const html = fs.readFileSync(path.join(ROOT, page.file), 'utf8');
    for (const sha of new Set([...html.matchAll(/\/commit\/([0-9a-f]{40})\/status-details/g)].map((m) => m[1]))) {
      const dir = path.join(SERVE, page.repo, 'commit', sha);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'status-details'), fragment);
    }
  }
  return fs.readFileSync(path.join(SERVE, 'mijhar-d.js'), 'utf8');
}

function inject(code) {
  const s = document.createElement('script');
  s.textContent = code;
  document.head.appendChild(s);
  return Boolean((window.wrappedJSObject ?? window).MijharD);
}
const kick = (a) => (window.wrappedJSObject ?? window).MijharD.call(a.name, a.arg === undefined ? '' : JSON.stringify(a.arg));
const poll = () => {
  const W = window.wrappedJSObject ?? window;
  return W.__mjDone ? W.__mjResult : null;
};
async function run(b, fn, arg) {
  if (b.ff) return b.ff.exec(`return (${fn.toString()})(arguments[0]);`, [arg ?? null]);
  return b.page.evaluate(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`);
}
async function call(b, name, arg) {
  await run(b, kick, { name, arg });
  const raw = await waitFor(() => run(b, poll), 20000, 50);
  if (raw === null || raw === undefined) throw new Error(`لم تنتهِ ${name}`);
  const value = JSON.parse(raw);
  if (value && value.error) throw new Error(`${name}: ${value.error}`);
  return value;
}

const checks = [];
const check = (browser, page, name, ok, detail) => {
  checks.push({ browser, page, name, ok: Boolean(ok), detail });
  if (!ok) console.error(`  ✗ ${browser} · ${page} · ${name}: ${JSON.stringify(detail)}`);
};
const CATEGORIES = ['ناجح', 'فاشل', 'قيد التشغيل', 'متجاوز', 'ملغى', 'لم يُشغَّل', 'غير معروف'];

const code = await bundle();
const server = await serveDir(SERVE);
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: 'ملف تعريف مؤقت جديد بلا إضافات وبلا واجهة (headless)، وخادم محلي بنفس الأصل لجزء status-details؛ الشيفرة كما تُشحن', results: [] };
const screensDir = outDir ? path.join(outDir, 'T-5.1/screens') : null;
const compareScreensDir = outDir ? path.join(outDir, 'T-5.4/screens') : null;
for (const dir of [screensDir, compareScreensDir]) if (dir) fs.mkdirSync(dir, { recursive: true });

try {
  for (const key of keys) {
    const b = await openBrowser(key);
    const r = { browser: b.label, version: b.version, pages: {} };
    const L = b.label;
    try {
      // ----- بطاقة حالة طلب الدمج -----
      for (const page of PR) {
        await b.open(`${server.url}/${page.name}.html`);
        await run(b, inject, code);
        const p = await call(b, 'mountPr', { href: page.href });
        r.pages[page.name] = p;
        check(L, page.name, 'مضيف واحد بعد ترويسة الطلب وبطاقة بعنوانها', p.hosts === 1 && p.afterHeader && p.hasCard && p.title === 'ملخص حالة طلب الدمج', { hosts: p.hosts, afterHeader: p.afterHeader, title: p.title });
        check(L, page.name, 'لا ادعاء «جاهز للدمج»', p.claimsReady === false, p.claimsReady);
        check(L, page.name, 'البطاقة داخل العرض بلا تمرير أفقي', p.layout && p.layout.width <= p.layout.vw && !p.layout.overflowX, p.layout);
        check(L, page.name, 'التصنيفات السبعة بنصها وترتيبها', JSON.stringify(p.chipLabels) === JSON.stringify(CATEGORIES), p.chipLabels);
        if (page.name === 'real-pr') {
          check(L, page.name, 'الحالة والفرعان من الصفحة', p.state === 'مفتوح' && p.branches.text.includes('feature/contractor-work-tabs') && p.branches.text.includes('main') && !p.branches.unavailable, { state: p.state, branches: p.branches });
          check(L, page.name, 'الالتزامات 8 والملفات 56 والأسطر +5,381/−1', p.commits.text === '8' && p.files.text === '56' && p.lines.text.includes('5,381') && p.lines.text.includes('1'), { commits: p.commits, files: p.files, lines: p.lines });
          check(L, page.name, 'المراجعات من الشريط الجانبي (طُلبت تغييرات)', !p.reviews.unavailable && p.reviews.text === 'طُلبت تغييرات', p.reviews);
          check(L, page.name, 'التعارضات والتأخر «غير متاح» لغير المسجَّل (صندوق الدمج للمسجَّل فقط)', p.conflicts.unavailable && p.behind.unavailable && p.conflicts.text === 'غير متاح', { conflicts: p.conflicts, behind: p.behind });
          check(L, page.name, 'طلب واحد بنفس الأصل لجزء status-details لالتزام الرأس', p.requests.length === 1 && /\/commit\/[0-9a-f]{40}\/status-details\?popover=true$/.test(p.requests[0]), p.requests);
          check(L, page.name, 'الفحوص من الجزء بالتصنيفات (6 صفوف) والإلزامي «غير متاح»', p.groups.join() === 'all' && p.requiredUnavailable && p.chips['success#0'] === 2 && p.chips['failure#0'] === 1 && p.chips['skipped#0'] === 1 && p.chips['running#0'] === 1 && p.chips['cancelled#0'] === 1, { groups: p.groups, chips: p.chips });
        } else {
          check(L, page.name, 'الحالة والفرعان والمستودع', p.state === 'مفتوح' && p.branches.text.includes('feature/ui-refresh'), p.branches);
          check(L, page.name, 'الالتزامات 3 والملفات 12 والأسطر +1,204/−87', p.commits.text === '3' && p.files.text === '12' && p.lines.text.includes('1,204') && p.lines.text.includes('87'), { commits: p.commits, files: p.files, lines: p.lines });
          check(L, page.name, 'المراجعات والتعارض والتأخر من صندوق الدمج', p.reviews.text === 'مطلوب مراجعة' && p.conflicts.text === 'يوجد تعارض يجب حله' && p.behind.text === 'متأخر عن فرع الهدف', { reviews: p.reviews, conflicts: p.conflicts, behind: p.behind });
          check(L, page.name, 'فصل الإلزامية عن الاختيارية', p.groups.join() === 'required,optional' && !p.requiredUnavailable, p.groups);
          check(L, page.name, 'التصنيفات السبعة كلها حاضرة بأعدادها (الإلزامية 4 والاختيارية 5)', p.chips['success#0'] === 1 && p.chips['failure#0'] === 1 && p.chips['running#0'] === 1 && p.chips['not-run#0'] === 1 && p.chips['success#1'] === 1 && p.chips['failure#1'] === 1 && p.chips['skipped#1'] === 1 && p.chips['cancelled#1'] === 1 && p.chips['unknown#1'] === 1, p.chips);
          check(L, page.name, 'لا طلب شبكة (الصفوف في الصفحة)', p.requests.length === 0, p.requests);
        }
        const stop = await call(b, 'stop');
        check(L, page.name, 'الإيقاف يزيل المضيف ويعيد DOM حرفيًا', stop.hosts === 0 && stop.identical, stop);
      }

      // فشل جلب التفاصيل يُعلَن ولا يُعرض نجاحًا.
      await b.open(`${server.url}/real-pr.html`);
      await run(b, inject, code);
      const failed = await call(b, 'mountPr', { href: PR[0].href, failFetch: true });
      r.pages['real-pr-fetch-failed'] = failed;
      check(L, 'real-pr', 'فشل الجلب: «غير متاح» بسببه ولا فحوص مزعومة', failed.checksState === 'error' && failed.checksText.includes('HTTP 503') && failed.checksText.includes('غير متاح') && Object.keys(failed.chips).length === 0, failed.checksText);
      await call(b, 'stop');

      // ----- المقارنة -----
      for (const page of COMPARE) {
        await b.open(`${server.url}/${page.name}.html`);
        await run(b, inject, code);
        const c = await call(b, 'mountCompare', { href: page.href });
        r.pages[page.name] = c;
        check(L, page.name, 'نوع المقارنة', c.kind === page.kind, { expected: page.kind, got: c.kind, label: c.kindLabel });
        check(L, page.name, 'أرقام الصفحة (الملفات والأسطر) تظهر كما هي', c.pageFiles === String(page.files) && c.pageLines.includes(page.additions.toLocaleString('en-US')) && c.pageLines.includes(page.deletions.toLocaleString('en-US')), { files: c.pageFiles, lines: c.pageLines });
        check(L, page.name, 'إحصاء الملفات المقروءة يطابق الصفحة والجدول يجمع إلى أرقامها', c.agreement === 'match' && c.completeness === 'complete' && c.rows.total?.[0] === String(page.files) && c.rows.total?.[1] === `+${page.additions.toLocaleString('en-US')}` && c.rows.total?.[2] === `−${page.deletions.toLocaleString('en-US')}`, { agreement: c.agreement, completeness: c.completeness, total: c.rows.total });
        check(L, page.name, 'تصنيف النوع: أعداد كل نوع', Object.entries(page.kinds).every(([k, n]) => c.rows[k]?.[0] === String(n)), c.rows);
        check(L, page.name, 'قسم الأثر مضيف شقيق منفصل لا متداخل، موسوم «يحتاج مراجعة بشرية»', c.hosts === 2 && c.siblings && !c.nested && !c.factsInImpact && c.impactTag === 'يحتاج مراجعة بشرية', { hosts: c.hosts, siblings: c.siblings, nested: c.nested, tag: c.impactTag });
        check(L, page.name, 'الانفصال البصري: حدّ متقطع وخلفية مختلفة للأثر', c.border.facts === 'solid' && c.border.impact === 'dashed' && c.background.facts !== c.background.impact, { border: c.border, background: c.background });
        check(L, page.name, 'لا ملاحظات أثر في قسم الحقائق ولا جدول أنواع في قسم الأثر', !c.factsHasImpactList && !c.impactHasTable, { factsHasImpactList: c.factsHasImpactList, impactHasTable: c.impactHasTable });
        check(L, page.name, 'القسمان داخل العرض بلا تمرير أفقي', c.factsRect <= c.vw && !c.overflowX, { factsRect: c.factsRect, vw: c.vw, overflowX: c.overflowX });
        const stop = await call(b, 'stop');
        check(L, page.name, 'الإيقاف يزيل المضيفين ويعيد DOM حرفيًا', stop.hosts === 0 && stop.identical, stop);
      }

      // ----- لقطات الشاشة (عائلة Chromium) بعد فحوص DOM الحرفية: Playwright يضيف style="" على حقول الإدخال أثناء اللقطة -----
      if (screensDir && b.page) {
        for (const [name, href, file] of [['real-pr', PR[0].href, 'real-pr'], ['complex-pr', PR[1].href, 'complex-pr']]) {
          await b.open(`${server.url}/${file}.html`);
          await run(b, inject, code);
          await call(b, 'mountPr', { href });
          await b.page.evaluate(() => document.querySelector('mijhar-host[data-mijhar-host="d.pr-status"]')?.scrollIntoView({ block: 'start' }));
          await b.page.screenshot({ path: path.join(screensDir, `${key}-${name}.png`) });
          await call(b, 'stop');
        }
        await b.open(`${server.url}/compare-branches.html`);
        await run(b, inject, code);
        await call(b, 'mountCompare', { href: COMPARE[0].href });
        await b.page.evaluate(() => document.querySelector('mijhar-host[data-mijhar-host="d.compare"]')?.scrollIntoView({ block: 'start' }));
        await b.page.screenshot({ path: path.join(compareScreensDir, `${key}-compare-branches.png`) });
        await call(b, 'stop');
      }
      const mine = checks.filter((c) => c.browser === L);
      console.error(`${L} ${b.version}: ${mine.filter((c) => c.ok).length}/${mine.length} فحصًا`);
    } catch (e) {
      r.error = String(e.stack ?? e);
      console.error(`${L}: ${e}`);
      check(L, '-', 'اكتمال التشغيل', false, r.error);
    } finally {
      await b.close();
    }
    output.results.push(r);
  }
} finally {
  await server.close();
}
output.checks = checks;
const failed = checks.filter((c) => !c.ok);
console.error(`المجموع: ${checks.length - failed.length}/${checks.length} فحصًا اجتاز`);
if (outDir) {
  // نتائج البطاقة (T-5.1) والمقارنة (T-5.4) في ملفين منفصلين لكل مهمة دليلها.
  const isCompare = (name) => name.startsWith('compare') || name === 'real-commit-as-compare';
  const part = (compare) => ({
    ...output,
    results: output.results.map((r) => ({ ...r, pages: Object.fromEntries(Object.entries(r.pages).filter(([name]) => isCompare(name) === compare)) })),
    checks: checks.filter((c) => isCompare(c.page) === compare || c.page === '-'),
  });
  writeJson(path.join(outDir, 'T-5.1/browser-results.json'), part(false));
  writeJson(path.join(outDir, 'T-5.4/browser-results.json'), part(true));
}
if (failed.length) process.exitCode = 1;

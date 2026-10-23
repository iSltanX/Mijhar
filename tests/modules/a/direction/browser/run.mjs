#!/usr/bin/env node
// قياس الوحدة (أ) الفعلية في المتصفحات (لا يُشغَّل ضمن vitest)، بظروف خط أساس T-0.1 نفسها (القسم 6.13؛ scripts/spikes/t01-baseline.mjs):
// ملف تعريف مؤقت جديد بلا إضافات وبلا واجهة، وخادم محلي معزول الأصل (COOP/COEP)، وثلاثة تشغيلات تسخين تُهمل ثم ثلاثون قياسًا.
//   PB-02 (T-2.1): DirectionProcessor.scan(document) على fixture-50-comments.html؛ بارد (أول استدعاء بعد تحميل جديد) ودافئ.
//   PB-01 (T-2.7): إيقاف الوحدة (الاتجاه وإخفاء التشكيل للاختبار) على READMEين حقيقيين، وإيقاف الإعدادين وهما مركَّبان.
//   TEST-RTL-01 في المتصفح: الاتجاه المحسوب لكل كتلة في fixture-mixed-rtl-readme.html، وفعالية القلب بأنماط GitHub على عينات حقيقية.
// الاستعمال: node tests/modules/a/direction/browser/run.mjs [chrome edge brave firefox] [--out-dir evidence]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { machineInfo, openBrowser, serveDir, stats, writeJson } from '../../../../../scripts/spikes/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SERVE = path.join(ROOT, 'dist/mj6-browser');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];
const WARMUP = 3;
const RUNS = 30;

async function bundle() {
  fs.rmSync(SERVE, { recursive: true, force: true });
  await build({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    mode: 'chromium',
    logLevel: 'warn',
    build: { outDir: SERVE, lib: { entry: path.join(HERE, 'entry.ts'), formats: ['iife'], name: 'MijharABundle', fileName: () => 'mijhar-a.js' } },
  });
  for (const file of fs.readdirSync(path.join(ROOT, 'fixtures/spikes'))) {
    if (file.endsWith('.html')) fs.copyFileSync(path.join(ROOT, 'fixtures/spikes', file), path.join(SERVE, file));
  }
  fs.copyFileSync(path.join(ROOT, 'tests/modules/a/direction/fixtures/fixture-mixed-rtl-readme.html'), path.join(SERVE, 'fixture-mixed-rtl-readme.html'));
  return fs.readFileSync(path.join(SERVE, 'mijhar-a.js'), 'utf8');
}

// في Firefox تعمل الدوال في صندوق المحتوى، فالكائن في wrappedJSObject.
function inject(code) {
  const s = document.createElement('script');
  s.textContent = code;
  document.head.appendChild(s);
  return Boolean((window.wrappedJSObject ?? window).MijharA);
}
const call = (name) => new Function('arg', `const A = (window.wrappedJSObject ?? window).MijharA; return JSON.parse(JSON.stringify(A.${name}(arg)));`);
const scan = call('directionScan');
const reset = call('directionReset');
const mountAll = call('mountModule');
const disable = call('timeDisable');
const settingsOff = call('timeSettingsOff');
const oracle = call('oracle');
const effective = call('effective');

// new Function لا تُسلسَل في Marionette كما في Playwright؛ نمرّر نصها.
async function run(b, fn, arg) {
  if (b.ff) return b.ff.exec(`return (${fn.toString()})(arguments[0]);`, [arg ?? null]);
  return b.page.evaluate(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`);
}

const code = await bundle();
const server = await serveDir(SERVE, { isolate: true });
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: { warmup: WARMUP, runs: RUNS, profile: 'ملف تعريف مؤقت جديد بلا إضافات، بلا واجهة (headless)، وخادم محلي معزول الأصل', code: 'الوحدة (أ) كما تُشحن: DirectionProcessor وcreateModuleA وTextTransformRegistry' }, results: [] };
try {
  for (const key of keys) {
    const b = await openBrowser(key);
    const r = { browser: b.label, version: b.version };
    try {
      await b.open(`${server.url}/fixture-50-comments.html`);
      r.timer = await run(b, () => {
        let min = Infinity;
        for (let i = 0; i < 200000 && min > 0.001; i += 1) { const a = performance.now(); let c = performance.now(); while (c === a) c = performance.now(); min = Math.min(min, c - a); }
        return { crossOriginIsolated: self.crossOriginIsolated, resolutionMs: min };
      });

      // PB-02 بارد ودافئ.
      const cold = [];
      let meta = null;
      for (let i = 0; i < WARMUP + RUNS; i += 1) {
        await b.open(`${server.url}/fixture-50-comments.html`);
        await run(b, inject, code);
        meta = await run(b, scan);
        if (i >= WARMUP) cold.push(meta.ms);
      }
      const warm = [];
      for (let i = 0; i < WARMUP + RUNS; i += 1) {
        await run(b, reset);
        const m = await run(b, scan);
        if (i >= WARMUP) warm.push(m.ms);
      }
      r.pb02 = { fixture: 'fixtures/spikes/fixture-50-comments.html', blocksFlipped: meta.flipped, listsFlipped: meta.lists, cold: { ...stats(cold), values: cold }, warm: { ...stats(warm), values: warm } };

      // PB-01: إيقاف الوحدة، ثم إيقاف الإعدادين وهي مركَّبة.
      r.pb01 = {};
      for (const fixture of ['gh-readme-js-algorithms-ar.html', 'gh-readme-shakkala.html']) {
        await b.open(`${server.url}/${fixture}`);
        await run(b, inject, code);
        const moduleOff = [];
        const settingOff = [];
        let lastModule = null;
        let lastSetting = null;
        let mounted = null;
        for (let i = 0; i < WARMUP + RUNS; i += 1) {
          mounted = await run(b, mountAll, 'all');
          lastModule = await run(b, disable);
          if (i >= WARMUP) moduleOff.push(lastModule.ms);
          await run(b, mountAll, 'all');
          lastSetting = await run(b, settingsOff, ['diacritics-test', 'direction']);
          if (i >= WARMUP) settingOff.push(lastSetting.ms);
        }
        r.pb01[fixture] = {
          mounted,
          module: { leftovers: lastModule.leftovers, identical: lastModule.identical, restoredText: lastModule.restoredText, skipped: lastModule.skipped, ...stats(moduleOff), values: moduleOff },
          settings: { leftovers: lastSetting.leftovers, identical: lastSetting.identical, restoredText: lastSetting.restoredText, skipped: lastSetting.skipped, ...stats(settingOff), values: settingOff },
        };
      }

      // TEST-RTL-01 في المتصفح.
      await b.open(`${server.url}/fixture-mixed-rtl-readme.html`);
      await run(b, inject, code);
      const o = await run(b, oracle);
      const failures = o.rows.filter((row) => (row.expect === 'rtl' ? row.after.direction !== 'rtl' : JSON.stringify(row.after) !== JSON.stringify(row.before)));
      r.oracle = { cases: o.rows.length, rtl: o.rows.filter((row) => row.expect === 'rtl').length, failures, off: o.off, restoredSame: o.restoredSame, rows: o.rows };
      r.effective = {};
      for (const fixture of ['fixture-50-comments.html', 'gh-issue-etos-1.html', 'gh-issue-winscreen-1.html', 'gh-readme-js-algorithms-ar.html', 'gh-readme-shakkala.html', 'gh-commits-bms.html', 'gh-commit-bms-1.html']) {
        await b.open(`${server.url}/${fixture}`);
        await run(b, inject, code);
        r.effective[fixture] = await run(b, effective);
      }
      const eff = Object.values(r.effective);
      console.error(`${b.label} ${b.version}: timer ${r.timer.resolutionMs}ms isolated=${r.timer.crossOriginIsolated} · PB-02 cold ${r.pb02.cold.median.toFixed(3)}/${r.pb02.cold.p95.toFixed(3)} warm ${r.pb02.warm.median.toFixed(3)}/${r.pb02.warm.p95.toFixed(3)} (${meta.flipped} كتلة) · PB-01 ${Object.entries(r.pb01).map(([k, v]) => `${k.slice(10, 22)} وحدة ${v.module.median.toFixed(3)} إعداد ${v.settings.median.toFixed(3)} بقايا ${v.module.leftovers + v.settings.leftovers} مطابق ${v.module.identical && v.settings.identical}`).join(' · ')} · العينة ${r.oracle.cases - r.oracle.failures.length}/${r.oracle.cases} · فعّال ${eff.reduce((n, e) => n + e.computedRtl, 0)}/${eff.reduce((n, e) => n + e.flipped, 0)}`);
    } catch (e) {
      r.error = String(e.stack ?? e);
      console.error(`${b.label}: ${e}`);
    } finally {
      await b.close();
    }
    output.results.push(r);
  }
} finally {
  await server.close();
}
if (outDir) {
  writeJson(path.join(outDir, 'T-2.1/raw/browser.json'), { ...output, results: output.results.map((r) => ({ browser: r.browser, version: r.version, timer: r.timer, pb02: r.pb02, oracle: r.oracle && { ...r.oracle, rows: undefined }, effective: r.effective, error: r.error })) });
  writeJson(path.join(outDir, 'T-2.7/raw/browser.json'), { ...output, results: output.results.map((r) => ({ browser: r.browser, version: r.version, timer: r.timer, pb01: r.pb01, error: r.error })) });
  writeJson(path.join(outDir, 'T-2.1/raw/oracle-rows.json'), output.results.map((r) => ({ browser: r.browser, rows: r.oracle?.rows })));
}

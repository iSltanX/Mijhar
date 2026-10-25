#!/usr/bin/env node
// TEST-PERF-01 (MJ26، T-10.1، AC-10.1): ميزانيات PB-06 وPB-07 وميل الذاكرة عبر ثلاثين تنقل Turbo على الوحدات الحقيقية مجتمعةً، في المتصفحات الأربعة،
// بظروف القسم 6.14: ملف تعريف مؤقت جديد بلا إضافات أخرى، وثلاثة تشغيلات تسخين تُهمل ثم ثلاثون قياسًا، والوسيط والمئين 95 والتوزيع، والحدّان من
// الشيفرة (tests/content/browser/perf-entry.ts). الحزمة: dist/<الهدف> كما هي وcontent.js مستبدَل بنقطة القياس (startContent نفسه بالوحدات المشحونة).
// صفحات GitHub عامة حقيقية محفوظة (fixtures/spikes) تُخدم محليًا بعناوينها، ولا شبكة خارجية (كمشغّلي MJ15).
//   PB-06: كل صفحة من الثلاث (مستودع، طلب دمج، مشكلة) تُحمَّل 33 مرة، مرة والوحدات الثماني مفعّلة ومرة معطّلة.
//   PB-07 والذاكرة: 3 + 30 تنقلًا على نمط Turbo (استبدال body وpushState ثم turbo:render وturbo:load) بين خمس صفحات؛ وبعد كل تنقل جمع القمامة وقراءة
//   كومة JS (Chromium: CDP Runtime.getHeapUsage) أو ذاكرة عملية المحتوى المقيمة (Firefox: ChromeUtils.requestProcInfo)، كما في T-0.1. ويُقارن الميل
//   بالمئين 95 لميل خط الأساس في T-0.1 (توزيعه بإعادة المعاينة bootstrap لسلسلته المسجلة في evidence/T-0.1/raw/baseline.json).
// الاستعمال: node tests/content/browser/perf-check.mjs [chrome edge brave firefox] [--out <ملف json>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { BROWSERS, ROOT, chromiumSession, firefoxSession, sleep, waitUntil } from '../../modules/d/token/browser/drivers.mjs';
import { machineInfo, stats } from '../../../scripts/spikes/lib.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
// --memory-only N M: الذاكرة وحدها بتسخين N تنقلًا ثم M تنقلًا مقيسًا (لاختبار الاستقرار بعد دورات الصفحات الخمس)، بلا PB-06.
const memIndex = args.indexOf('--memory-only');
const memoryOnly = memIndex === -1 ? null : { warmup: Number(args[memIndex + 1]), runs: Number(args[memIndex + 2]) };
if (memIndex !== -1) args.splice(memIndex, 3);
const keys = args.length ? args.filter((a) => BROWSERS[a]) : ['chrome', 'edge', 'brave', 'firefox'];
const WARMUP = 3;
const RUNS = 30;
const UNITS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

const SAMPLES = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/spikes/samples.json'), 'utf8')).samples;
const byName = (name) => SAMPLES.find((s) => s.name === name);
const PAGES = Object.fromEntries(SAMPLES.map((s) => [new URL(s.url).pathname, fs.readFileSync(path.join(ROOT, s.file), 'utf8')]));
const PB06 = { repo: byName('repo-arabic-stop-words'), pr: byName('pr-watad-80'), issue: byName('issue-etos-1') };
const NAV = ['repo-arabic-stop-words', 'pr-watad-80', 'issue-etos-1', 'issue-winscreen-1', 'readme-js-algorithms-ar'].map(byName);
const githubReply = (pathname) => (PAGES[pathname] ? { status: 200, type: 'text/html; charset=utf-8', body: PAGES[pathname] } : { status: 404, type: 'text/plain', body: 'not found' });
const apiReply = () => ({ message: 'Not Found' });

async function perfBuild(target) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-perf-${target}-`));
  fs.cpSync(path.join(ROOT, 'dist', target), dir, { recursive: true });
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-perf-entry-${target}-`));
  await build({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    mode: target,
    logLevel: 'warn',
    build: { outDir, emptyOutDir: true, lib: { entry: path.join(ROOT, 'tests/content/browser/perf-entry.ts'), formats: ['iife'], name: 'MijharContentPerf', fileName: () => 'content.js' } },
  });
  fs.copyFileSync(path.join(outDir, 'content.js'), path.join(dir, 'content.js'));
  fs.rmSync(outDir, { recursive: true, force: true });
  return dir;
}

const DUMP = `document.dispatchEvent(new Event('mijhar-perf-dump')); const v = document.documentElement.getAttribute('data-mijhar-perf'); return v ? JSON.parse(v) : null;`;

/** الميل الخطي (ميغابايت لكل تنقل) لسلسلة. */
function slope(series) {
  const n = series.length;
  const xs = series.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = series.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (series[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return num / den;
}
/** توزيع ميل خط الأساس بإعادة معاينة أزواج (التنقل، القراءة) 2000 مرة ببذرة ثابتة، والمئين 95. */
function bootstrapP95(series) {
  let seed = 260125;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const pairs = series.map((y, x) => [x, y]);
  const slopes = [];
  for (let k = 0; k < 2000; k += 1) {
    const sample = pairs.map(() => pairs[Math.floor(rand() * pairs.length)]);
    const mx = sample.reduce((a, [x]) => a + x, 0) / sample.length;
    const my = sample.reduce((a, [, y]) => a + y, 0) / sample.length;
    let num = 0;
    let den = 0;
    for (const [x, y] of sample) {
      num += (x - mx) * (y - my);
      den += (x - mx) ** 2;
    }
    if (den > 0) slopes.push(num / den);
  }
  slopes.sort((a, b) => a - b);
  return { p95: slopes[Math.floor(slopes.length * 0.95)], median: slopes[Math.floor(slopes.length / 2)], n: slopes.length };
}

async function setUnits(d, on) {
  const states = await d.options(`return [...document.querySelectorAll('[data-unit]')].map((row) => ({ unit: row.getAttribute('data-unit'), checked: row.querySelector('[role="switch"], input[type="checkbox"]')?.getAttribute('aria-checked') ?? String(row.querySelector('input[type="checkbox"]')?.checked ?? '') }));`);
  for (const unit of UNITS) {
    const row = states.find((s) => s.unit === unit);
    const checked = row?.checked === 'true';
    if (checked !== on) await d.click(`#mj-unit-${unit}`);
  }
  await sleep(400);
  return d.options(`return [...document.querySelectorAll('[data-unit]')].map((row) => row.querySelector('[role="switch"], input[type="checkbox"]')?.getAttribute('aria-checked') ?? String(row.querySelector('input[type="checkbox"]')?.checked ?? ''));`);
}

async function measureLoads(d, sample) {
  const values = [];
  const active = [];
  for (let i = 0; i < WARMUP + RUNS; i += 1) {
    await d.openGithub(sample.url);
    const r = await waitUntil(async () => {
      const v = await d.github(DUMP);
      return v && v.reconciles?.length ? v : null;
    }, 10000);
    if (!r) throw new Error(`لم تكتمل أول مطابقة في ${sample.url}`);
    if (i >= WARMUP) {
      values.push(r.reconciles[0].endAt - r.startedAt);
      active.push(r.reconciles[0].active || r.reconciles[0].mounted);
    }
  }
  return { ...stats(values), values, modulesMounted: [...new Set(active)] };
}

async function navigationRun(d, heap, warmup = WARMUP, runs = RUNS) {
  await d.openGithub(NAV[0].url);
  await waitUntil(async () => (await d.github(DUMP))?.reconciles?.length, 10000);
  const series = [];
  const durations = [];
  let before = (await d.github(DUMP)).reconciles.length;
  for (let i = 0; i < warmup + runs; i += 1) {
    const next = NAV[(i + 1) % NAV.length];
    const html = PAGES[new URL(next.url).pathname];
    await d.github(`
      const doc = new DOMParser().parseFromString(${JSON.stringify(html)}, 'text/html');
      document.title = doc.title;
      document.body.replaceWith(document.adoptNode(doc.body));
      history.pushState({}, '', ${JSON.stringify(new URL(next.url).pathname)});
      document.dispatchEvent(new Event('turbo:render', { bubbles: true }));
      document.dispatchEvent(new Event('turbo:load', { bubbles: true }));
      return true;
    `);
    const r = await waitUntil(async () => {
      const v = await d.github(DUMP);
      return v && v.reconciles.length > before ? v : null;
    }, 8000);
    await sleep(350);
    const all = (await d.github(DUMP)).reconciles;
    const navs = all.slice(before).filter((x) => x.reason === 'navigation');
    before = all.length;
    if (i >= warmup) {
      durations.push(...(navs.length ? [navs[0].ms] : []));
      series.push(await heap());
    }
    if (!r) durations.push(Number.NaN);
  }
  const clean = durations.filter((x) => Number.isFinite(x));
  return { pb07: { ...stats(clean), values: clean, missed: durations.length - clean.length }, memory: { series, startMB: series[0], endMB: series.at(-1), slopeMBPerNav: slope(series) } };
}

const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/T-0.1/raw/baseline.json'), 'utf8'));
const results = [];
for (const key of keys) {
  const target = BROWSERS[key].target;
  const extDir = await perfBuild(target);
  const session = target === 'firefox' ? await firefoxSession({ extDir, githubReply, apiReply }) : await chromiumSession(key, { extDir, githubReply, apiReply });
  const { d } = session;
  const r = { key, browser: BROWSERS[key].label, version: session.browserVersion };
  try {
    let cdp = null;
    const heap =
      target === 'firefox'
        ? () =>
            session.chrome(`return (async () => {
              Cu.forceGC(); Cu.forceCC(); Cu.forceGC();
              const info = await ChromeUtils.requestProcInfo();
              const url = gBrowser.selectedBrowser.currentURI.spec;
              const child = info.children.find((c) => (c.windows ?? []).some((w) => (w.documentURI?.spec ?? '').startsWith('https://github.com/')));
              return child ? child.memory / 2 ** 20 : null;
            })();`)
        : async () => {
            cdp ??= await session.context.newCDPSession(session.githubPage);
            await cdp.send('HeapProfiler.collectGarbage');
            const { usedSize } = await cdp.send('Runtime.getHeapUsage');
            return usedSize / 2 ** 20;
          };
    r.unitsOn = await setUnits(d, true);
    if (memoryOnly) {
      const on = await navigationRun(d, heap, memoryOnly.warmup, memoryOnly.runs);
      r.memoryOnly = { ...memoryOnly, enabled: on.memory, pb07: on.pb07 };
      await setUnits(d, false);
      r.memoryOnly.disabled = (await navigationRun(d, heap, memoryOnly.warmup, memoryOnly.runs)).memory;
      await setUnits(d, true);
      const base = baseline.results.find((b) => b.browser === BROWSERS[key].label)?.memory;
      if (base) r.memoryOnly.baselineP95 = bootstrapP95(base.withProto.series).p95;
      console.log(`${r.browser} ${r.version}: ذاكرة بعد تسخين ${memoryOnly.warmup} و${memoryOnly.runs} تنقلًا: الميل مفعّلة ${on.memory.slopeMBPerNav.toFixed(4)} ومعطّلة ${r.memoryOnly.disabled.slopeMBPerNav.toFixed(4)} MB/تنقل (أساس p95 ${r.memoryOnly.baselineP95?.toFixed(4)})`);
      throw Object.assign(new Error('done'), { done: true });
    }
    r.pb06 = { enabled: {}, disabled: {} };
    for (const [kind, sample] of Object.entries(PB06)) r.pb06.enabled[kind] = { url: sample.url, ...(await measureLoads(d, sample)) };
    const nav = await navigationRun(d, heap);
    r.pb07 = nav.pb07;
    r.memory = { enabled: nav.memory };
    r.unitsOff = await setUnits(d, false);
    for (const [kind, sample] of Object.entries(PB06)) r.pb06.disabled[kind] = { url: sample.url, ...(await measureLoads(d, sample)) };
    const navOff = await navigationRun(d, heap);
    r.memory.disabled = navOff.memory;
    r.pb07Disabled = navOff.pb07;
    await setUnits(d, true);
    const base = baseline.results.find((b) => b.browser === BROWSERS[key].label)?.memory;
    if (base) {
      const p95 = bootstrapP95(base.withProto.series);
      r.memory.baseline = { source: 'evidence/T-0.1/raw/baseline.json (withProto)', slopeMBPerNav: base.withProto.slopeMBPerNav, bootstrap: p95 };
      r.memory.withinBaselineP95 = r.memory.enabled.slopeMBPerNav <= p95.p95;
    }
    r.blocked = [...session.network.blocked];
    const fmt = (x) => (x ? `${x.median.toFixed(2)}/${x.p95.toFixed(2)}` : '—');
    console.log(`${r.browser} ${r.version}: PB-06 مفعّلة مستودع ${fmt(r.pb06.enabled.repo)} PR ${fmt(r.pb06.enabled.pr)} مشكلة ${fmt(r.pb06.enabled.issue)} · معطّلة ${fmt(r.pb06.disabled.repo)} ${fmt(r.pb06.disabled.pr)} ${fmt(r.pb06.disabled.issue)} · PB-07 ${fmt(r.pb07)} · ميل الذاكرة ${r.memory.enabled.slopeMBPerNav.toFixed(4)} MB/تنقل (أساس p95 ${r.memory.baseline?.bootstrap.p95.toFixed(4)})`);
  } catch (error) {
    if (!error?.done) {
      r.error = String(error?.stack ?? error);
      console.error(`${r.browser}: ${r.error}`);
    }
  } finally {
    await session.close();
    fs.rmSync(extDir, { recursive: true, force: true });
  }
  results.push(r);
}

const report = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: { warmup: WARMUP, runs: RUNS, profile: 'ملف تعريف مؤقت جديد بلا إضافات أخرى، بلا واجهة (headless)', pages: 'fixtures/spikes (صفحات GitHub عامة محفوظة) تُخدم محليًا بعناوينها، بلا شبكة خارجية ولا أنماط GitHub الخارجية', bounds: 'tests/content/browser/perf-entry.ts' }, results };
if (outFile) fs.writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);
process.exit(results.some((r) => r.error) ? 1 : 0);

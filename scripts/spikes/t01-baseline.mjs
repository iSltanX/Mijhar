#!/usr/bin/env node
// تجربة T-0.1 (MJ4): خط أساس PB-01 وPB-02 وميل الذاكرة عبر ثلاثين تنقلًا على النموذج الأولي (AC-S1.4)،
// بظروف القسم 6.13: ملف تعريف جديد بلا إضافات، ثلاثة تشغيلات تسخين تُهمل، ثلاثون قياسًا، الوسيط والمئين 95 والتوزيع،
// والقياس بـperformance.now() بين حدثين معرّفين في الشيفرة.
//   PB-02: من استدعاء direction.apply() حتى عودته، على fixture-50-comments.html (بارد: أول استدعاء بعد تحميل جديد؛ دافئ: بعد التسخين في الصفحة نفسها).
//   PB-01: من استدعاء disableAll() حتى عودته، على README حقيقيين محفوظين بكل ما يفعّله النموذج (الاتجاه والعزل والتشكيل).
//   الذاكرة: 30 تنقلًا داخل صفحة واحدة (استبدال المحتوى ثم إزالة أثر النموذج وتطبيقه)، مع النموذج وبدونه، بعد جمع القمامة.
// الاستعمال: node scripts/spikes/t01-baseline.mjs [chrome edge brave firefox] --out evidence/T-0.1/raw/baseline.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineInfo, openBrowser, serveDir, sleep, stats, writeJson } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIX = path.join(ROOT, 'fixtures/spikes');
const PROTO = fs.readFileSync(path.join(ROOT, 'scripts/spikes/proto/mijhar-proto.js'), 'utf8');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];
const WARMUP = 3;
const RUNS = 30;

function inject(code) {
  const s = document.createElement('script');
  s.textContent = code;
  document.head.appendChild(s);
  return Boolean((window.wrappedJSObject ?? window).MijharProto);
}

function timeApply() {
  const M = (window.wrappedJSObject ?? window).MijharProto;
  const t0 = performance.now();
  const changed = M.direction.apply(document);
  const t1 = performance.now();
  return { ms: t1 - t0, changed, isolated: document.querySelectorAll('span[data-mijhar-injected]').length };
}
function removeDirection() {
  (window.wrappedJSObject ?? window).MijharProto.direction.remove();
  return true;
}
function enableAll() {
  const M = (window.wrappedJSObject ?? window).MijharProto;
  const changed = M.direction.apply(document);
  const nodes = M.diacritics.enable();
  return { changed, nodes };
}
function timeDisable() {
  const M = (window.wrappedJSObject ?? window).MijharProto;
  const t0 = performance.now();
  const r = M.disableAll();
  const t1 = performance.now();
  const leftovers = document.querySelectorAll('[data-mijhar-dir], span[data-mijhar-injected], #mijhar-reading-styles').length;
  return { ms: t1 - t0, restored: r.restored, leftovers };
}

// صفحة التنقل: محتوى العينات يُحمَّل مرة ثم يُبدَّل في حاوية واحدة كما يبدّل Turbo/React المحتوى.
async function prepareNav(urls) {
  const W = window.wrappedJSObject ?? window;
  const bodies = [];
  for (const u of urls) {
    const html = await (await fetch(u)).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const parts = [...doc.querySelectorAll('.markdown-body')].map((e) => e.outerHTML);
    bodies.push(parts.join('\n'));
  }
  W.__navBodies = bodies;
  document.body.innerHTML = '<main id="nav-root"></main>';
  return bodies.map((b) => b.length);
}
function navigate({ i, withProto }) {
  const W = window.wrappedJSObject ?? window;
  const M = W.MijharProto;
  if (withProto && M.enabled) M.disableAll();
  else if (withProto) M.direction.remove();
  document.getElementById('nav-root').innerHTML = W.__navBodies[i % W.__navBodies.length];
  if (withProto) {
    M.direction.apply(document);
    M.diacritics.enable();
  }
  return document.querySelectorAll('#nav-root *').length;
}

function regression(ys) {
  const n = ys.length;
  const xs = ys.map((_, i) => i + 1);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return num / den;
}

// بناء عينة الخمسين تعليقًا من أجسام تعليقات حقيقية محفوظة (تُكرَّر حتى 50).
async function buildFiftyComments(b, serverUrl) {
  const file = path.join(FIX, 'fixture-50-comments.html');
  if (fs.existsSync(file)) return;
  await b.open(`${serverUrl}/gh-issue-etos-1.html`);
  const collect = () => [...document.querySelectorAll('[data-testid="markdown-body"], .comment-body.markdown-body')].map((e) => e.outerHTML);
  const pool = [...(await b.evaluate(collect))];
  for (const name of ['gh-issue-winscreen-1.html', 'gh-pr-watad-80.html']) {
    await b.open(`${serverUrl}/${name}`);
    pool.push(...(await b.evaluate(collect)));
  }
  const comments = Array.from({ length: 50 }, (_, i) => `<div class="timeline-comment" data-n="${i + 1}"><div class="comment-body markdown-body" dir="auto">${pool[i % pool.length].replace(/^<[^>]+>|<\/[^>]+>$/g, '')}</div></div>`);
  fs.writeFileSync(file, `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="utf-8"><title>fixture-50-comments (MJ4/T-0.1)</title>\n<link rel="stylesheet" href="https://github.githubassets.com/assets/primer-primitives.css"></head>\n<body>\n<!-- عينة للقياس فقط: خمسون تعليقًا أجسامها مأخوذة من تعليقات GitHub حقيقية في gh-issue-etos-1 وgh-issue-winscreen-1 وgh-pr-watad-80 (تُكرَّر بالترتيب). -->\n${comments.join('\n')}\n</body>\n</html>\n`);
}

async function heapMB(b) {
  if (b.ff) {
    // Firefox: ذاكرة عملية المحتوى المقيمة بعد جمع القمامة (ChromeUtils.requestProcInfo)، لا كومة JS وحدها.
    return b.ff.execAsync(`
      const done = arguments[arguments.length - 1];
      Cu.forceGC(); Cu.forceCC();
      ChromeUtils.requestProcInfo().then((info) => {
        const url = gBrowser.selectedBrowser.currentURI.spec;
        const child = info.children.find((c) => (c.windows ?? []).some((w) => (w.documentURI?.spec ?? '').startsWith(url.split('/').slice(0, 3).join('/'))));
        done(child ? child.memory / 2 ** 20 : null);
      }, () => done(null));
    `, [], 'chrome');
  }
  const cdp = b.__cdp ?? (b.__cdp = await b.page.context().newCDPSession(b.page));
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  return usedSize / 2 ** 20;
}

const server = await serveDir(FIX, { isolate: true });
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: { warmup: WARMUP, runs: RUNS, profile: 'ملف تعريف مؤقت جديد بلا إضافات، بلا واجهة (headless)' }, results: [] };
try {
  for (const key of keys) {
    const b = await openBrowser(key);
    const r = { browser: b.label, version: b.version };
    try {
      await buildFiftyComments(b, server.url);
      // دقة المؤقت المقيسة في الصفحة (أصغر فرق غير صفري بين قراءتين متتاليتين).
      await b.open(`${server.url}/fixture-50-comments.html`);
      r.timer = await b.evaluate(() => {
        let min = Infinity;
        for (let i = 0; i < 200000 && min > 0.001; i += 1) { const a = performance.now(); let c = performance.now(); while (c === a) c = performance.now(); min = Math.min(min, c - a); }
        return { crossOriginIsolated: self.crossOriginIsolated, resolutionMs: min };
      });
      // PB-02 بارد: أول استدعاء بعد تحميل جديد.
      const cold = [];
      let meta = null;
      for (let i = 0; i < WARMUP + RUNS; i += 1) {
        await b.open(`${server.url}/fixture-50-comments.html`);
        await b.evaluate(inject, PROTO);
        const m = await b.evaluate(timeApply);
        if (i >= WARMUP) cold.push(m.ms);
        meta = m;
      }
      // PB-02 دافئ: في الصفحة نفسها بعد التسخين.
      const warm = [];
      for (let i = 0; i < WARMUP + RUNS; i += 1) {
        await b.evaluate(removeDirection);
        const m = await b.evaluate(timeApply);
        if (i >= WARMUP) warm.push(m.ms);
      }
      r.pb02 = { fixture: 'fixtures/spikes/fixture-50-comments.html', blocksChanged: meta.changed, isolatedSpans: meta.isolated, cold: { ...stats(cold), values: cold }, warm: { ...stats(warm), values: warm } };
      // PB-01: إزالة الأثر على README حقيقيين.
      r.pb01 = {};
      for (const fixture of ['gh-readme-js-algorithms-ar.html', 'gh-readme-shakkala.html']) {
        await b.open(`${server.url}/${fixture}`);
        await b.evaluate(inject, PROTO);
        const vals = [];
        let last = null;
        let enabled = null;
        for (let i = 0; i < WARMUP + RUNS; i += 1) {
          enabled = await b.evaluate(enableAll);
          const m = await b.evaluate(timeDisable);
          if (i >= WARMUP) vals.push(m.ms);
          last = m;
        }
        r.pb01[fixture] = { enabled, restoredDiacriticNodes: last.restored, leftovers: last.leftovers, ...stats(vals), values: vals };
      }
      // الذاكرة: 30 تنقلًا بلا نموذج ثم معه، في صفحة جديدة لكل منهما.
      r.memory = {};
      for (const withProto of [false, true]) {
        await b.open(`${server.url}/fixture-editor.html`);
        await b.evaluate(inject, PROTO);
        await b.evaluateAsync(prepareNav, ['gh-readme-js-algorithms-ar.html', 'gh-issue-etos-1.html', 'gh-readme-shakkala.html', 'gh-pr-watad-80.html', 'gh-issue-winscreen-1.html'].map((f) => `${server.url}/${f}`));
        const series = [];
        const start = await heapMB(b);
        for (let i = 0; i < 30; i += 1) {
          await b.evaluate(navigate, { i, withProto });
          series.push(await heapMB(b));
        }
        r.memory[withProto ? 'withProto' : 'withoutProto'] = { startMB: start, endMB: series.at(-1), slopeMBPerNav: series.every((v) => v != null) ? regression(series) : null, series };
      }
      console.error(`${b.label}: timer ${r.timer.resolutionMs}ms isolated=${r.timer.crossOriginIsolated} · PB-02 cold median ${r.pb02.cold.median.toFixed(2)}ms p95 ${r.pb02.cold.p95.toFixed(2)} · warm median ${r.pb02.warm.median.toFixed(2)} · PB-01 ${Object.entries(r.pb01).map(([k, v]) => `${k.slice(10, 20)} ${v.median.toFixed(2)}`).join(' ')} · mem slope ${r.memory.withoutProto.slopeMBPerNav?.toFixed(3)} / ${r.memory.withProto.slopeMBPerNav?.toFixed(3)}`);
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
if (outFile) writeJson(outFile, output);

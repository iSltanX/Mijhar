#!/usr/bin/env node
// قياس ميزات MJ7 في المتصفحات الأربعة على شيفرة الإضافة نفسها محقونةً في عينات محلية (لا يُشغَّل ضمن vitest)، بظروف T-0.1:
// ملف تعريف مؤقت جديد بلا إضافات وبلا واجهة، وخادم محلي معزول الأصل، وثلاثة تشغيلات تسخين تُهمل ثم ثلاثون قياسًا لـPB-01.
//   TEST-RTL-02: الاتجاه المحسوب لما يُعزل، وثبات النص، والمنسوخ (اختصار وأمر نسخ) مطابق والوحدة مفعّلة ومعطّلة.
//   TEST-RTL-04: عشرون تبديلًا في textarea بعد كتابة بأمر التحرير، ثم التراجع والإعادة.
//   TEST-RTL-05A/05B/05C والسحب و05E: في العارض (DEC-02 أ-2) على fixture-diacritics-live: النسخ يحمل الأصل، والبحث الأصلي.
//   TEST-RTL-06: الأرقام في الحالات المعرّفة، والتلميح الهجري مقابل Intl للتواريخ المرجعية بكل تعديل، وتوفر التقويم، وPB-01.
// الاستعمال: node tests/modules/a/browser/bundle-run.mjs [chrome edge brave firefox] [--out <ملف json>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { machineInfo, openBrowser, serveDir, sleep, stats, writeJson } from '../../../../scripts/spikes/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const SERVE = path.join(ROOT, 'dist/mj7-browser');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];
const WARMUP = 3;
const RUNS = 30;
const CASES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/a/cases.json'), 'utf8'));
const ALL = ['direction', 'isolation', 'fonts', 'digits', 'hijri', 'editor-toggle'];
const DIACRITICS = /[ً-ٰٟ]/g;

async function bundle() {
  fs.rmSync(SERVE, { recursive: true, force: true });
  await build({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    mode: 'chromium',
    logLevel: 'warn',
    build: { outDir: SERVE, lib: { entry: path.join(HERE, 'bundle-entry.ts'), formats: ['iife'], name: 'MijharA7Bundle', fileName: () => 'mijhar-a7.js' } },
  });
  fs.copyFileSync(path.join(ROOT, 'tests/modules/a/direction/fixtures/fixture-mixed-rtl-readme.html'), path.join(SERVE, 'fixture-mixed-rtl-readme.html'));
  for (const file of ['fixture-diacritics-live.html', 'gh-readme-js-algorithms-ar.html']) fs.copyFileSync(path.join(ROOT, 'fixtures/spikes', file), path.join(SERVE, file));
  return fs.readFileSync(path.join(SERVE, 'mijhar-a7.js'), 'utf8');
}

// الإضافات على عينة README: حالات الأرقام والتواريخ المرجعية داخل حاوية Markdown، ومحرر بشريط أدوات.
const EXTRAS = [
  '<div class="markdown-body" id="mj7-cases">',
  ...CASES.digits.map(([id, html]) => `<div data-digits="${id}">${html}</div>`),
  `<p dir="auto" id="mj7-dates">تواريخ مرجعية: ${CASES.referenceDates.map(([dt]) => `<relative-time data-ref datetime="${dt}">${dt.slice(0, 10)}</relative-time>`).join(' و')}</p>`,
  '</div>',
  '<div id="mj7-editor-box"><markdown-toolbar for="mj7-editor"></markdown-toolbar><textarea id="mj7-editor" style="width:600px;height:200px;font:14px/1.5 monospace"></textarea></div>',
].join('');

function inject(code) {
  const s = document.createElement('script');
  s.textContent = code;
  document.head.appendChild(s);
  return Boolean((window.wrappedJSObject ?? window).MijharA7);
}
function addExtras(html) {
  document.body.insertAdjacentHTML('beforeend', html);
  return document.querySelectorAll('[data-digits]').length;
}
// استدعاء دالة من window.MijharA7 في عالم الصفحة، وإعادة نتيجتها مسلسلة (Firefox: صندوق المحتوى يرى الكائن عبر wrappedJSObject).
const call = (name) => new Function('arg', `const A = (window.wrappedJSObject ?? window).MijharA7; const r = A.${name}(...(Array.isArray(arg) ? arg : [arg])); return r === undefined ? null : JSON.parse(JSON.stringify(r));`);

async function run(b, fn, arg) {
  if (b.ff) return b.ff.exec(`return (${fn.toString()})(arguments[0]);`, [arg ?? null]);
  return b.page.evaluate(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`);
}

function intlExpected([refs, offset, calendar]) {
  return refs.map((dt) => new Intl.DateTimeFormat(`ar-SA-u-ca-${calendar}-nu-latn`, { dateStyle: 'full' }).format(new Date(Date.parse(dt) + offset * 86400000)));
}

// ---------- الحافظة والبحث (من scripts/spikes/t01-diacritics.mjs) ----------

async function readClipboardChromium() {
  try {
    const items = await navigator.clipboard.read();
    const out = {};
    for (const item of items) for (const type of item.types) out[type] = await (await item.getType(type)).text();
    return out;
  } catch (e) {
    return { error: String(e) };
  }
}
const FF_CLIPBOARD = `
  const read = (flavor) => {
    try {
      const t = Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);
      t.init(null);
      t.addDataFlavor(flavor);
      Services.clipboard.getData(t, Ci.nsIClipboard.kGlobalClipboard, gBrowser.selectedBrowser.browsingContext.currentWindowContext);
      const data = {};
      t.getTransferData(flavor, data);
      return data.value.QueryInterface(Ci.nsISupportsString).data;
    } catch (e) { return null; }
  };
  return { 'text/plain': read('text/plain'), 'text/html': read('text/html') };
`;
// مفتاح Meta في WebDriver (U+E03D)، أي ⌘ في macOS.
const META = '\uE03D';
async function copyWith(b, method) {
  if (b.ff) {
    if (method === 'shortcut') await b.ff.actions([{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value: META }, { type: 'keyDown', value: 'c' }, { type: 'keyUp', value: 'c' }, { type: 'keyUp', value: META }] }]);
    else await b.ff.exec('window.goDoCommand("cmd_copy");', [], 'chrome');
    await sleep(300);
    return b.ff.exec(FF_CLIPBOARD, [], 'chrome');
  }
  if (method === 'shortcut') {
    const cdp = await b.page.context().newCDPSession(b.page);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 4, key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, commands: ['copy'] });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 4, key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67 });
  } else {
    await b.evaluate(() => document.execCommand('copy'));
  }
  await sleep(300);
  return b.evaluate(readClipboardChromium);
}
function findChromium(q) {
  getSelection().removeAllRanges();
  window.scrollTo(0, 0);
  return window.find(q, false, false, true, false, false, false);
}
const FF_FIND = `
  const [q, matchDiacritics] = arguments;
  const done = arguments[arguments.length - 1];
  const finder = gBrowser.selectedBrowser.finder;
  finder.matchDiacritics = matchDiacritics;
  const l = { onFindResult(r) { finder.removeResultListener(l); done(r.result); }, onMatchesCountResult() {}, onHighlightFinished() {}, onCurrentSelection() {} };
  finder.addResultListener(l);
  finder.fastFind(q, false, false);
`;
function resetFind() {
  getSelection().removeAllRanges();
  window.scrollTo(0, 0);
  return true;
}
async function find(b, q, matchDiacritics = false) {
  if (b.ff) {
    // كل بحث من أول الصفحة بلا تحديد سابق، كما في Chromium (fastFind يبدأ من التحديد الحالي).
    await run(b, resetFind);
    const found = (await b.ff.execAsync(FF_FIND, [q, matchDiacritics], 'chrome', 10000)) === 0; // FIND_FOUND = 0
    await b.ff.exec('gBrowser.selectedBrowser.finder.matchDiacritics = false; return true;', [], 'chrome');
    return found;
  }
  return run(b, findChromium, q);
}
const WORDS = ['كتب', 'المطور', 'كَتَبَ', 'المُطَوِّرُ'];

// ---------- التشغيل ----------

const code = await bundle();
const server = await serveDir(SERVE, { isolate: true });
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: { warmup: WARMUP, runs: RUNS, profile: 'ملف تعريف مؤقت جديد بلا إضافات، بلا واجهة (headless)، وخادم محلي معزول الأصل', code: 'الوحدة (أ) كما تُشحن: createModuleA وميزات MJ7 والعارض (view.ts)' }, results: [] };
try {
  for (const key of keys) {
    const b = await openBrowser(key);
    const r = { browser: b.label, version: b.version };
    try {
      if (!b.ff) await b.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.url });
      const page = `${server.url}/fixture-mixed-rtl-readme.html`;
      const fresh = async (url = page) => {
        await b.open(url);
        await run(b, inject, code);
        if (url === page) await run(b, addExtras, EXTRAS);
      };

      // TEST-RTL-02 وTEST-RTL-06 وTEST-RTL-04.
      await fresh();
      r.calendars = await run(b, call('calendars'));
      // العزل وحده مع الاتجاه: ثبات النص يُقاس بلا الأرقام (تغيّر النص المعروض عمدًا).
      await run(b, call('mount'), [['direction', 'isolation']]);
      r.isolation = await run(b, call('isolation'));
      r.isolation.off = await run(b, call('timeDisable'));
      await run(b, call('mount'), [ALL]);
      const ids = CASES.digits.map(([id]) => id);
      const shown = await run(b, call('digits'), [ids]);
      r.digits = { cases: ids.length, failures: CASES.digits.filter(([id, , expected]) => shown[id] !== expected).map(([id, , expected]) => ({ id, expected, shown: shown[id] })) };
      r.hijri = { calendar: r.calendars.chosen, offsets: {} };
      const refs = CASES.referenceDates.map(([dt]) => dt);
      for (const offset of CASES.offsets) {
        await run(b, call('setSetting'), ['modules.a.hijri.options', { offset, numerals: 'latn' }]);
        const tips = await run(b, call('hijriTooltips'));
        const expected = r.calendars.chosen ? await run(b, intlExpected, [refs, offset, r.calendars.chosen]) : refs.map(() => null);
        r.hijri.offsets[offset] = { matches: tips.filter((t, i) => t.text === expected[i]).length, total: refs.length, timeIntact: tips.every((t) => t.timeIntact), sample: tips[0]?.text };
      }
      const anchorTips = await (async () => {
        await run(b, call('setSetting'), ['modules.a.hijri.options', { offset: 0, numerals: 'latn' }]);
        return run(b, call('hijriTooltips'));
      })();
      r.hijri.anchors = CASES.referenceDates.map(([dt, expected], i) => ({ datetime: dt, expected, shown: anchorTips[i]?.text, equal: anchorTips[i]?.text === expected }));
      r.editor = await run(b, call('editor'));
      if (b.ff && !r.editor.undo?.ran) {
        // Firefox: ⌘Z ثم ⇧⌘Z بمفاتيح WebDriver (يمرّان بأمر التحرير الأصلي كما قيس في T-0.1).
        await run(b, call('focusEditor'));
        const keys = (shift, key) => [{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value: META }, ...(shift ? [{ type: 'keyDown', value: '\uE008' }] : []), { type: 'keyDown', value: key }, { type: 'keyUp', value: key }, ...(shift ? [{ type: 'keyUp', value: '\uE008' }] : []), { type: 'keyUp', value: META }] }];
        await b.ff.actions(keys(false, 'z'));
        const afterUndo = await run(b, call('editorValue'));
        await b.ff.actions(keys(true, 'z'));
        const afterRedo = await run(b, call('editorValue'));
        r.editor.undo = { ran: true, via: 'shortcut', emptied: afterUndo.empty };
        r.editor.redo = { ran: true, via: 'shortcut', restored: afterRedo.full };
      }

      // المنسوخ مطابق والوحدة مفعّلة ومعطّلة (AC-A2).
      r.copy = {};
      for (const name of ['p-arabic-with-path', 'p-starts-with-path']) {
        const on = {};
        for (const method of ['shortcut', 'command']) {
          await run(b, call('selectContents'), [`[data-case="${name}"]`]);
          on[method] = (await copyWith(b, method))['text/plain'];
        }
        r.copy[name] = { on };
      }
      const offModule = await run(b, call('timeDisable'));
      r.isolationOff = offModule;
      for (const name of Object.keys(r.copy)) {
        await run(b, call('selectContents'), [`[data-case="${name}"]`]);
        const off = (await copyWith(b, 'shortcut'))['text/plain'];
        const entry = r.copy[name];
        entry.off = off;
        entry.equal = entry.on.shortcut === off && entry.on.command === off;
        entry.bidiControls = /[؜‎‏‪-‮⁦-⁩]/.test(`${entry.on.shortcut}${entry.on.command}`);
      }

      // PB-01: إيقاف الوحدة بميزاتها كلها، وإيقاف خيار الأرقام وحده وهو مركَّب.
      r.pb01 = {};
      for (const [label, url] of [['cases', page], ['gh-readme-js-algorithms-ar', `${server.url}/gh-readme-js-algorithms-ar.html`]]) {
        await fresh(url);
        const moduleOff = [];
        const digitsOff = [];
        let lastModule = null;
        let lastDigits = null;
        for (let i = 0; i < WARMUP + RUNS; i += 1) {
          await run(b, call('mount'), [ALL]);
          lastModule = await run(b, call('timeDisable'));
          if (i >= WARMUP) moduleOff.push(lastModule.ms);
          await run(b, call('mount'), [ALL]);
          lastDigits = await run(b, call('timeSettingOff'), ['digits']);
          if (i >= WARMUP) digitsOff.push(lastDigits.ms);
        }
        r.pb01[label] = {
          module: { leftovers: lastModule.leftovers, identical: lastModule.identical, restoredText: lastModule.restoredText, skipped: lastModule.skipped, ...stats(moduleOff), values: moduleOff },
          digits: { easternLeft: lastDigits.leftovers, restoredText: lastDigits.restoredText, skipped: lastDigits.skipped, thenModuleIdentical: lastDigits.afterModuleOff.identical, ...stats(digitsOff), values: digitsOff },
        };
      }

      // العارض: 05A و05B و05C والسحب و05E.
      await b.open(`${server.url}/fixture-diacritics-live.html`);
      await run(b, inject, code);
      r.reader = { setup: await run(b, call('readerSetup')), copy: {}, find: {} };
      for (const id of ['05A', '05B']) {
        const expected = await run(b, call('readerSelect'), [id, false]);
        const entry = { expected, expectedDiacritics: (expected.match(DIACRITICS) ?? []).length };
        for (const method of ['shortcut', 'command']) {
          const shownText = await run(b, call('readerSelect'), [id, true]);
          const clip = await copyWith(b, method);
          const plain = clip['text/plain'] ?? '';
          const html = clip['text/html'] ?? '';
          entry[method] = {
            selectionHadDiacritics: DIACRITICS.test(shownText),
            plainEqual: plain === expected,
            plainDiacritics: (plain.match(DIACRITICS) ?? []).length,
            htmlDiacritics: (html.match(DIACRITICS) ?? []).length,
            htmlTags: ['strong', 'code', 'a', 'li'].filter((t) => new RegExp(`<${t}[\\s>]`, 'i').test(html)),
            ...(plain === expected ? {} : { plain }),
          };
          DIACRITICS.lastIndex = 0;
        }
        await run(b, call('readerSelect'), [id, true]);
        const drag = await run(b, call('readerDrag'));
        entry.drag = { plainEqual: drag.plain === expected, htmlDiacritics: (drag.html.match(DIACRITICS) ?? []).length };
        r.reader.copy[id] = entry;
      }
      r.reader.counters = await run(b, call('readerState'));
      for (const hidden of [true, false]) {
        await run(b, call('readerSelect'), ['05A', hidden]);
        const state = hidden ? 'hidden' : 'shown';
        r.reader.find[state] = {};
        for (const w of WORDS) {
          r.reader.find[state][w] = b.ff ? { default: await find(b, w, false), matchDiacritics: await find(b, w, true) } : await find(b, w);
        }
      }
      const pb = Object.entries(r.pb01).map(([k, v]) => `${k}: وحدة ${v.module.median.toFixed(3)}/${v.module.p95.toFixed(3)} مطابق ${v.module.identical} · أرقام ${v.digits.median.toFixed(3)}/${v.digits.p95.toFixed(3)} بقايا ${v.digits.easternLeft}`).join(' · ');
      const h = Object.entries(r.hijri.offsets).map(([o, v]) => `${o}:${v.matches}/${v.total}`).join(' ');
      const rc = Object.entries(r.reader.copy).map(([id, v]) => `${id} ${v.shortcut.plainEqual}/${v.command.plainEqual}/${v.drag.plainEqual}`).join(' ');
      console.error(`${b.label} ${b.version}: عزل ${r.isolation.spans.filter((s) => s.direction === 'ltr' && s.unicodeBidi === 'isolate').length}/${r.isolation.spans.length} قائمة ${r.isolation.existing.filter((s) => s.direction === 'ltr').length}/${r.isolation.existing.length} نص ${r.isolation.textSame} · نسخ ${Object.values(r.copy).map((c) => c.equal).join('/')} · أرقام ${r.digits.cases - r.digits.failures.length}/${r.digits.cases} · هجري ${r.calendars.chosen} ${h} · محرر إخفاق ${r.editor.failures?.length} تراجع ${r.editor.undo?.emptied}/${r.editor.redo?.restored} · ${pb} · عارض ${rc}`);
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
else console.log(JSON.stringify(output, null, 2));

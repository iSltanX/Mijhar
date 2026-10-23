#!/usr/bin/env node
// تجربة T-0.1 (MJ4): إخفاء التشكيل الموضعي على fixture-diacritics-live.html بالنموذج الأولي (AC-S1.3):
// الحالات السبع TEST-RTL-05A..05G ومسارات النسخ (الاختصار، وأمر «نسخ» في القائمة) والسحب والبحث الأصلي،
// في Chrome وEdge وBrave وFirefox بلا واجهة وبحافظة المتصفح الداخلية (لا تُمس حافظة النظام).
// النسخ في الوضع يُقارن بالنسخ نفسه والوضع معطّل: التطابق = نجاح.
// الاستعمال: node scripts/spikes/t01-diacritics.mjs [chrome edge brave firefox] --out evidence/T-0.1/raw/diacritics.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, serveDir, sleep, writeJson } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROTO = fs.readFileSync(path.join(ROOT, 'scripts/spikes/proto/mijhar-proto.js'), 'utf8');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

// ---------- دوال تُنفَّذ في الصفحة (تعمل في Chromium وفي صندوق Marionette في Firefox) ----------
function inject(code) {
  const s = document.createElement('script');
  s.textContent = code;
  document.head.appendChild(s);
  return Boolean((window.wrappedJSObject ?? window).MijharProto);
}

// التحديد بإزاحات على النص المعروض الحالي؛ spec = { start: [selector, offset], end: [selector, offset], mapOriginal }
function select(spec) {
  const DIAC = /[ً-ٰٟ]/;
  const nodeOf = (sel) => {
    const el = document.querySelector(sel);
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    return w.nextNode();
  };
  // إزاحة في النص المنزوع ← إزاحة في النص الحالي (المشكول حين يكون الوضع معطّلًا).
  const toCurrent = (node, strippedOffset) => {
    if (!spec.mapOriginal) return strippedOffset;
    const t = node.nodeValue;
    let k = 0;
    for (let i = 0; i < t.length; i += 1) {
      if (DIAC.test(t[i])) continue;
      if (k === strippedOffset) return i;
      k += 1;
    }
    return t.length;
  };
  const a = nodeOf(spec.start[0]);
  const b = nodeOf(spec.end[0]);
  const r = document.createRange();
  r.setStart(a, toCurrent(a, spec.start[1]));
  r.setEnd(b, toCurrent(b, spec.end[1]));
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  return sel.toString();
}

function protoCall(op) {
  const W = window.wrappedJSObject ?? window;
  const P = W.MijharProto;
  if (op === 'enable') return P.diacritics.enable();
  if (op === 'disable') { const r = P.diacritics.disable(); return { restored: r.restored, skipped: r.skipped }; }
  if (op === 'stats') return { copyHandled: P.stats.copyHandled, dragHandled: P.stats.dragHandled, ownWrites: P.stats.ownWrites, foreignWrites: P.stats.foreignWrites };
  return null;
}

function syntheticDrag() {
  const dt = new DataTransfer();
  const target = getSelection().getRangeAt(0).startContainer.parentElement;
  target.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
  const plain = dt.getData('text/plain');
  return { syntheticPlain: plain, diacritics: (plain.match(/[\u064B-\u065F\u0670]/g) ?? []).length, htmlHasDiacritics: /[\u064B-\u065F\u0670]/.test(dt.getData('text/html')) };
}

function execCopy() {
  return document.execCommand('copy');
}

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

// الحالات الحية: 05D و05F و05G وأشكال الاستبدال/الفصل.
function liveCases() {
  const W = window.wrappedJSObject ?? window;
  const P = W.MijharProto;
  const GH = W.GH;
  const strip = (t) => t.replace(/[ً-ٰٟ]/g, '');
  const text = (id) => document.querySelector(`#${id} p`).textContent;
  const original = {};
  for (const id of ['c1', 'c4', 'c5', 'c6', 'c7']) original[id] = text(id);
  const out = {};
  // 05D: تحديث حي بنص مختلف ثم إيقاف.
  P.diacritics.enable();
  GH.update('c1', 'النَّصُّ الجَدِيدُ المُحَدَّثُ');
  P.diacritics.disable();
  out['05D'] = { final: text('c1'), pass: text('c1') === 'النَّصُّ الجَدِيدُ المُحَدَّثُ' };
  GH.update('c1', original.c1);
  // 05F: تحديث حي بنص يساوي النص المنزوع ثم إيقاف.
  P.diacritics.enable();
  const strippedShown = text('c4');
  GH.update('c4', strip(original.c4));
  P.diacritics.disable();
  out['05F'] = { shownWhileOn: strippedShown === strip(original.c4), final: text('c4'), pass: text('c4') === strip(original.c4) };
  GH.update('c4', original.c4);
  // 05G: كل تراتيب ثلاث كتابات (عقد مختلفة وعقدة واحدة مرتين) مع إيقاف في كل موضع قبل تسليم السجلات.
  const writes = [['c5', 'كتابة أولى من GitHub'], ['c6', 'كتابة ثانية من GitHub'], ['c5', 'كتابة ثالثة من GitHub على العقدة نفسها']];
  const perms = (arr) => (arr.length <= 1 ? [arr] : arr.flatMap((x, i) => perms([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p])));
  const orders = [];
  for (const order of perms([0, 1, 2])) {
    for (let at = 0; at <= order.length; at += 1) orders.push({ order, at });
  }
  let pass = 0;
  const failures = [];
  for (const { order, at } of orders) {
    for (const id of ['c5', 'c6', 'c7']) GH.update(id, original[id]);
    P.diacritics.enable();
    const expected = { c5: strip(original.c5), c6: strip(original.c6), c7: original.c7 };
    // قبل الإيقاف تُعرض منزوعة؛ ما يكتبه GitHub يبقى؛ ما لم يُكتب يُستعاد مشكولًا بعد الإيقاف.
    const written = new Set();
    order.forEach((w, i) => {
      if (i === at) P.diacritics.disable();
      GH.update(writes[w][0], writes[w][1]);
      written.add(writes[w][0]);
      expected[writes[w][0]] = writes[w][1];
    });
    if (at === order.length) P.diacritics.disable();
    // ما كُتب قبل الإيقاف يبقى نص GitHub؛ وما لم يُكتب: يُستعاد الأصل إن كان الإيقاف بعد كل الكتابات، وإلا يُستعاد الأصل ثم يكتب GitHub فوقه.
    for (const id of ['c5', 'c6', 'c7']) if (!written.has(id)) expected[id] = original[id];
    const final = { c5: text('c5'), c6: text('c6'), c7: text('c7') };
    const ok = final.c5 === expected.c5 && final.c6 === expected.c6 && final.c7 === expected.c7;
    if (ok) pass += 1;
    else failures.push({ order: order.join(''), disableAt: at, final, expected });
  }
  for (const id of ['c5', 'c6', 'c7']) GH.update(id, original[id]);
  out['05G'] = { orders: orders.length, pass, failures: failures.slice(0, 3) };
  // استبدال العقدة وفصلها (استثناءات الاستعادة).
  P.diacritics.enable();
  GH.replace('c5', 'عقدة جديدة استبدلها GitHub');
  const before = P.exceptions.length;
  P.diacritics.disable();
  out.replace = { final: text('c5'), pass: text('c5') === 'عقدة جديدة استبدلها GitHub', exceptionsAdded: P.exceptions.length - before };
  GH.replace('c5', original.c5);
  return out;
}

// البحث في Chromium: window.find (المحرك نفسه الذي يستعمله شريط البحث، والواجهة لا تُشغَّل آليًا).
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

const SELECTIONS = {
  '05A': { start: ['#c2 p', 4], end: ['#c2 p', 14] },
  '05B': { start: ['#c3 p', 2], end: ['#c3 p:last-of-type', 5] },
};
const htmlText = (html) => (html ?? '').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const arabicSeq = (html) => (htmlText(html).match(/[\u0600-\u06FF\u064B-\u065F\u0670]/g) ?? []).join('');
const tags = (html) => ['strong', 'code', 'a', 'li'].filter((t) => new RegExp(`<${t}[\\s>]`, 'i').test(html ?? ''));

async function copyWith(b, method) {
  if (b.ff) {
    if (method === 'shortcut') await b.ff.actions([{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value: '' }, { type: 'keyDown', value: 'c' }, { type: 'keyUp', value: 'c' }, { type: 'keyUp', value: '' }] }]);
    else await b.ff.exec('window.goDoCommand("cmd_copy");', [], 'chrome');
    await sleep(300);
    return b.ff.exec(FF_CLIPBOARD, [], 'chrome');
  }
  if (method === 'shortcut') {
    const cdp = await b.page.context().newCDPSession(b.page);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 4, key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, commands: ['copy'] });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 4, key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67 });
  } else {
    await b.evaluate(execCopy);
  }
  await sleep(300);
  return b.evaluate(readClipboardChromium);
}

const server = await serveDir(path.join(ROOT, 'fixtures/spikes'));
const results = [];
try {
  for (const key of keys) {
    const b = await openBrowser(key);
    const r = { browser: b.label, version: b.version, copy: {}, drag: null, find: {}, live: null };
    try {
      if (!b.ff) await b.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.url });
      const load = async () => {
        await b.open(`${server.url}/fixture-diacritics-live.html`);
        await sleep(300);
        await b.evaluate(inject, PROTO);
      };
      // النسخ: 05A و05B (و05C من قناة html في 05B)، بطريقتين.
      for (const method of ['shortcut', 'menu-command']) {
        for (const [id, spec] of Object.entries(SELECTIONS)) {
          await load();
          const selOff = await b.evaluate(select, { ...spec, mapOriginal: true });
          const off = await copyWith(b, method);
          await b.evaluate(protoCall, 'enable');
          const selOn = await b.evaluate(select, { ...spec, mapOriginal: false });
          const on = await copyWith(b, method);
          const stats = await b.evaluate(protoCall, 'stats');
          const entry = {
            selectedOff: selOff,
            selectedOn: selOn,
            plainOff: off['text/plain'] ?? off.error ?? null,
            plainOn: on['text/plain'] ?? on.error ?? null,
            plainEqual: Boolean(off['text/plain']) && off['text/plain'] === on['text/plain'],
            handlerRan: stats.copyHandled > 0,
            htmlTextEqual: Boolean(off['text/html']) && htmlText(off['text/html']) === htmlText(on['text/html']),
            htmlArabicEqual: Boolean(off['text/html']) && arabicSeq(off['text/html']) === arabicSeq(on['text/html']),
            htmlOff: (off['text/html'] ?? '').slice(0, 900),
            htmlOn: (on['text/html'] ?? '').slice(0, 900),
            htmlTagsOff: tags(off['text/html']),
            htmlTagsOn: tags(on['text/html']),
            diacriticsInPlainOn: ((on['text/plain'] ?? '').match(/[ً-ٰٟ]/g) ?? []).length,
          };
          r.copy[`${id}/${method}`] = entry;
          console.error(`${b.label} ${id}/${method}: plain=${entry.plainEqual} htmlArabic=${entry.htmlArabicEqual} htmlText=${entry.htmlTextEqual} tags=${entry.htmlTagsOn.join('+')} handler=${entry.handlerRan}`);
        }
      }
      // السحب: السحب الأصلي لتحديد نصي لا يبدأ عبر الأتمتة (مقيس في Chrome بواجهة وبلا واجهة)، فيُفحص معالج dragstart بحدث مصطنع.
      await load();
      await b.evaluate(protoCall, 'enable');
      await b.evaluate(select, { ...SELECTIONS['05A'], mapOriginal: false });
      r.drag = await b.evaluate(syntheticDrag);
      r.drag.native = 'لم يُجرَ: السحب الأصلي لتحديد نصي لا يبدأ بأحداث الفأرة المصطنعة (Playwright وMarionette)';
      // البحث الأصلي (05E): الوضع معطّل ثم مفعّل، بكلمة بلا تشكيل وبها.
      for (const mode of ['off', 'on']) {
        await load();
        if (mode === 'on') await b.evaluate(protoCall, 'enable');
        for (const q of ['كتب', 'كَتَبَ', 'المطور', 'المُطَوِّرُ']) {
          if (b.ff) {
            const def = await b.ff.execAsync(FF_FIND, [q, false], 'chrome');
            const strict = await b.ff.execAsync(FF_FIND, [q, true], 'chrome');
            r.find[`${mode}:${q}`] = { default: def === 0 || def === 2, matchDiacritics: strict === 0 || strict === 2 };
          } else {
            r.find[`${mode}:${q}`] = { windowFind: await b.evaluate(findChromium, q) };
          }
        }
      }
      // الحالات الحية.
      await load();
      r.live = await b.evaluate(liveCases);
      console.error(`${b.label} live: 05D=${r.live['05D'].pass} 05F=${r.live['05F'].pass} 05G=${r.live['05G'].pass}/${r.live['05G'].orders} replace=${r.live.replace.pass}`);
    } catch (e) {
      r.error = String(e.stack ?? e);
      console.error(`${b.label}: ${e}`);
    } finally {
      await b.close();
    }
    results.push(r);
  }
} finally {
  await server.close();
}
const output = { measuredAt: new Date().toISOString(), fixture: 'fixtures/spikes/fixture-diacritics-live.html', proto: 'scripts/spikes/proto/mijhar-proto.js', results };
if (outFile) writeJson(outFile, output);
else console.log(JSON.stringify(output, null, 2));

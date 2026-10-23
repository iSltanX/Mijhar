#!/usr/bin/env node
// تجربة T-0.1 (MJ4): سلوك textarea الأصلي عند تبديل dir عشرين مرة (AC-S1.2) في المتصفحات الأربعة،
// على fixtures/spikes/fixture-editor.html: القيمة والتحديد واتجاهه وscrollTop، ثم التراجع والإعادة بعد كتابة حقيقية.
// المحرر الحي في GitHub قيس في جلسة مسجّلة (raw/editor-session.json)؛ هذا يقيس طبقة المتصفح وحدها.
// الاستعمال: node scripts/spikes/t01-editor-local.mjs [chrome edge brave firefox] --out evidence/T-0.1/raw/editor-local.json
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, serveDir, sleep, writeJson } from './lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

function prepare() {
  const t = document.getElementById('ed');
  const lines = [];
  for (let i = 1; i <= 40; i += 1) lines.push(i % 2 ? `سطر ${i} عربي مع src/app/main.ts و#12` : `Line ${i} English text`);
  t.value = lines.join('\n');
  t.focus();
  return t.value.length;
}

function toggles(restore) {
  const t = document.getElementById('ed');
  t.focus();
  t.setSelectionRange(120, 160, 'backward');
  t.scrollTop = 150;
  const base = [t.selectionStart, t.selectionEnd, t.selectionDirection, t.scrollTop].join(',');
  const value = t.value;
  const order = ['rtl', 'ltr', 'auto'];
  const failed = [];
  for (let i = 0; i < 20; i += 1) {
    const s = t.selectionStart, e = t.selectionEnd, d = t.selectionDirection, top = t.scrollTop;
    t.setAttribute('dir', order[i % 3]);
    if (restore) { t.setSelectionRange(s, e, d); t.scrollTop = top; }
    void t.offsetHeight; // فرض التخطيط بعد كل تبديل
    const now = [t.selectionStart, t.selectionEnd, t.selectionDirection, t.scrollTop].join(',');
    if (now !== base || t.value !== value) failed.push({ i: i + 1, now });
  }
  return { base, failures: failed.length, failed: failed.slice(0, 3) };
}

function caretToEnd() {
  const t = document.getElementById('ed');
  t.focus();
  t.setSelectionRange(t.value.length, t.value.length);
  window.__before = t.value;
  return true;
}

function afterTypingThenToggle() {
  const t = document.getElementById('ed');
  window.__typed = t.value;
  for (let i = 0; i < 20; i += 1) t.setAttribute('dir', ['rtl', 'ltr', 'auto'][i % 3]);
  return { typed: t.value.slice(window.__before.length), unchanged: t.value === window.__typed };
}

function state() {
  const t = document.getElementById('ed');
  return { equalsBefore: t.value === window.__before, equalsTyped: t.value === window.__typed };
}

function execUndoRedo() {
  const t = document.getElementById('ed');
  t.focus();
  document.execCommand('undo');
  const undo = t.value === window.__before;
  document.execCommand('redo');
  const redo = t.value === window.__typed;
  return { undo, redo };
}

const server = await serveDir(path.join(ROOT, 'fixtures/spikes'));
const results = [];
try {
  for (const key of keys) {
    const b = await openBrowser(key);
    const r = { browser: b.label, version: b.version };
    try {
      await b.open(`${server.url}/fixture-editor.html`);
      await sleep(300);
      await b.evaluate(prepare);
      r.noRestore = await b.evaluate(toggles, false);
      r.withRestore = await b.evaluate(toggles, true);
      await b.evaluate(caretToEnd);
      if (b.ff) await b.ff.actions([{ type: 'key', id: 'kb', actions: [...' تجربة'].flatMap((c) => [{ type: 'keyDown', value: c }, { type: 'keyUp', value: c }]) }]);
      else await b.page.keyboard.type(' تجربة');
      r.typing = await b.evaluate(afterTypingThenToggle);
      // التراجع بالاختصار حتى يعود النص كما قبل الكتابة، ثم الإعادة حتى يعود المكتوب (عدد الخطوات يتبع تجميع المتصفح للكتابة).
      const press = async (cmd) => {
        if (b.ff) {
          const keys = cmd === 'undo' ? ['\uE03D', 'z'] : ['\uE03D', '\uE008', 'z'];
          await b.ff.actions([{ type: 'key', id: 'kb', actions: [...keys.map((v) => ({ type: 'keyDown', value: v })), ...keys.reverse().map((v) => ({ type: 'keyUp', value: v }))] }]);
        } else {
          const cdp = await b.page.context().newCDPSession(b.page);
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: cmd === 'undo' ? 4 : 12, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, commands: [cmd] });
          await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: cmd === 'undo' ? 4 : 12, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
        }
        await sleep(80);
      };
      let undoSteps = 0;
      while (undoSteps < 20 && !(await b.evaluate(state)).equalsBefore) { await press('undo'); undoSteps += 1; }
      const undone = (await b.evaluate(state)).equalsBefore;
      let redoSteps = 0;
      while (redoSteps < 20 && !(await b.evaluate(state)).equalsTyped) { await press('redo'); redoSteps += 1; }
      r.undoShortcut = { undoSteps, undone, redoSteps, redone: (await b.evaluate(state)).equalsTyped, dirAfter: await b.evaluate(() => document.getElementById('ed').getAttribute('dir')) };
      // مسار أمر التحرير (قائمة Edit): حلقة execCommand مماثلة.
      r.undoCommand = await b.evaluate(() => {
        const t = document.getElementById('ed');
        t.focus();
        let u = 0;
        while (u < 20 && t.value !== window.__before) { document.execCommand('undo'); u += 1; }
        const undone = t.value === window.__before;
        let rr = 0;
        while (rr < 20 && t.value !== window.__typed) { document.execCommand('redo'); rr += 1; }
        return { undoSteps: u, undone, redoSteps: rr, redone: t.value === window.__typed };
      });
      console.error(`${b.label}: noRestore ${r.noRestore.failures} withRestore ${r.withRestore.failures} undoShortcut ${JSON.stringify(r.undoShortcut)} undoCommand ${JSON.stringify(r.undoCommand)}`);
    } catch (e) {
      r.error = String(e);
      console.error(`${b.label}: ${e}`);
    } finally {
      await b.close();
    }
    results.push(r);
  }
} finally {
  await server.close();
}
if (outFile) writeJson(outFile, { measuredAt: new Date().toISOString(), fixture: 'fixtures/spikes/fixture-editor.html', results });

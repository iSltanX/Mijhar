#!/usr/bin/env node
// TEST-RTL-04 (AC-A4، سجل التراجع): هل يبقى التراجع عن كتابة سابقة ممكنًا بعد تغيير اتجاه textarea، في المتصفحات الأربعة؟
// الكتابة بأمر التحرير insertText (سجل التراجع الأصلي)، ثم أحد التغييرات، ثم ⌘Z (مفاتيح حقيقية) وأمر التراجع (Chromium:
// execCommand؛ Firefox: cmd_undo من قائمة Edit). على fixtures/spikes/fixture-editor.html بملف تعريف مؤقت.
// الاستعمال: node tests/modules/a/browser/editor-undo.mjs [chrome edge brave firefox] [--out <ملف json>]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineInfo, openBrowser, serveDir, sleep, writeJson } from '../../../../scripts/spikes/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

// التغيير بعد الكتابة: بلا تغيير، ثم dir لا يغيّر الاتجاه المحسوب، ثم تبديل واحد، ثم عشرون كما يفعل الزر (مع إعادة التحديد)، ثم CSS.
const VARIANTS = ['none', 'dir-same', 'dir-once', 'toggle-20', 'style-once'];

function prepare(variant) {
  const t = document.getElementById('ed');
  t.value = '';
  t.removeAttribute('dir');
  t.style.direction = '';
  t.focus();
  document.execCommand('insertText', false, 'سطر أول بالعربية\nline two in English');
  const typed = t.value.length;
  if (variant === 'dir-same') t.setAttribute('dir', 'ltr');
  if (variant === 'dir-once') t.setAttribute('dir', 'rtl');
  if (variant === 'style-once') t.style.direction = 'rtl';
  if (variant === 'toggle-20') {
    for (let i = 0; i < 20; i += 1) {
      const s = t.selectionStart;
      const e = t.selectionEnd;
      const d = t.selectionDirection;
      t.setAttribute('dir', ['rtl', 'ltr', 'auto'][i % 3]);
      if (t.selectionStart !== s || t.selectionEnd !== e || t.selectionDirection !== d) t.setSelectionRange(s, e, d);
      void t.offsetHeight;
    }
  }
  void t.offsetHeight;
  t.focus();
  return typed;
}
const length = () => document.getElementById('ed').value.length;

async function undo(b, method) {
  if (method === 'shortcut') {
    if (b.ff) {
      await b.ff.actions([{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value: '' }, { type: 'keyDown', value: 'z' }, { type: 'keyUp', value: 'z' }, { type: 'keyUp', value: '' }] }]);
    } else {
      const cdp = await b.page.context().newCDPSession(b.page);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 4, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, commands: ['undo'] });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 4, key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90 });
    }
  } else if (b.ff) await b.ff.exec('window.goDoCommand("cmd_undo"); return true;', [], 'chrome');
  else await b.evaluate(() => document.execCommand('undo'));
  await sleep(150);
  return b.evaluate(length);
}

const server = await serveDir(path.join(ROOT, 'fixtures/spikes'));
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), fixture: 'fixtures/spikes/fixture-editor.html', variants: VARIANTS, results: [] };
try {
  for (const key of keys) {
    const b = await openBrowser(key);
    const r = { browser: b.label, version: b.version, undone: {} };
    try {
      for (const variant of VARIANTS) {
        r.undone[variant] = {};
        for (const method of ['shortcut', 'command']) {
          await b.open(`${server.url}/fixture-editor.html`);
          const typed = await b.evaluate(prepare, variant);
          const after = await undo(b, method);
          r.undone[variant][method] = after === 0 ? 'تراجع' : after === typed ? 'لم يتراجع' : `جزئي ${after}/${typed}`;
        }
      }
      console.error(`${b.label} ${b.version}: ${VARIANTS.map((v) => `${v} ${r.undone[v].shortcut}/${r.undone[v].command}`).join(' · ')}`);
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

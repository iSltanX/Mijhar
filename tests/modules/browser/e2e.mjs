// مساعد مشترك لتشغيلات e2e في المتصفحات (MJ10): حزمة اختبار تُبنى بـvite وتُحقن في صفحة تخدمها 127.0.0.1، ثم تُستدعى دوالها
// بالاسم، ومدخلات حقيقية تُرسل من خارج الصفحة (لوحة مفاتيح ولمس) لا أحداث مُصطنعة داخلها.
//  - عائلة Chromium عبر Playwright (page.keyboard وpage.touchscreen).
//  - Firefox عبر Marionette (WebDriver actions).
// مدخل الحزمة يعرض window.MijharE2E.call(name, argJson) كما في tests/modules/b/card/browser/entry.ts.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { waitFor } from '../../../scripts/spikes/lib.mjs';

/** يبني مدخل اختبار إلى iife ويعيد نصه. extraFiles: ملفات تُنسخ إلى مجلد التقديم (name ← مسار). */
export async function bundleEntry({ root, entry, serveDir, extraFiles = {} }) {
  fs.rmSync(serveDir, { recursive: true, force: true });
  await build({
    root,
    configFile: path.join(root, 'vite.config.ts'),
    mode: 'chromium',
    logLevel: 'warn',
    build: { outDir: serveDir, lib: { entry, formats: ['iife'], name: 'MijharE2EBundle', fileName: () => 'bundle.js' } },
  });
  for (const [name, file] of Object.entries(extraFiles)) fs.copyFileSync(path.join(root, file), path.join(serveDir, name));
  return fs.readFileSync(path.join(serveDir, 'bundle.js'), 'utf8');
}

// تُمرَّر نصًّا إلى الصفحة (fn.toString())، فلا تشير إلى متغيرات خارجها.
export function injectFn(code) {
  const s = document.createElement('script');
  s.textContent = code;
  document.head.appendChild(s);
  return Boolean((window.wrappedJSObject ?? window).MijharE2E);
}
const kickFn = (a) => (window.wrappedJSObject ?? window).MijharE2E.call(a.name, a.arg === undefined ? '' : JSON.stringify(a.arg));
const pollFn = () => {
  const W = window.wrappedJSObject ?? window;
  return W.__mjDone ? W.__mjResult : null;
};

export async function run(b, fn, arg) {
  if (b.ff) return b.ff.exec(`return (${fn.toString()})(arguments[0]);`, [arg ?? null]);
  return b.page.evaluate(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`);
}

export async function inject(b, code) {
  return run(b, injectFn, code);
}

export async function call(b, name, arg, timeout = 20000) {
  await run(b, kickFn, { name, arg });
  const raw = await waitFor(() => run(b, pollFn), timeout, 40);
  if (raw === null || raw === undefined) throw new Error(`لم تنتهِ ${name}`);
  const value = JSON.parse(raw);
  if (value && value.error) throw new Error(`${name}: ${value.error}`);
  return value;
}

const WD = { Tab: '', Enter: '', Escape: '', Shift: '', Alt: '', Control: '', Meta: '', Backspace: '', Delete: '', Space: ' ', ArrowLeft: '', ArrowRight: '', ArrowUp: '', ArrowDown: '', Home: '', End: '' };
const wdKey = (name) => WD[name] ?? (/^Key([A-Z])$/.test(name) ? name.slice(3).toLowerCase() : name);

/** ضغطة مفتاح حقيقية بمعدّلات اختيارية: 'Tab' و'Shift+Tab' و'Alt+KeyH' و'Enter' و'Space' و'Escape' و'g'. */
export async function press(b, combo) {
  if (b.page) {
    await b.page.keyboard.press(combo);
    return;
  }
  const parts = combo.split('+');
  const key = wdKey(parts.pop());
  const mods = parts.map(wdKey);
  const actions = [...mods.map((value) => ({ type: 'keyDown', value })), { type: 'keyDown', value: key }, { type: 'keyUp', value: key }, ...[...mods].reverse().map((value) => ({ type: 'keyUp', value }))];
  await b.ff.actions([{ type: 'key', id: 'keyboard', actions }]);
}

/** يكتب نصًّا حقيقيًا حرفًا حرفًا في العنصر المركَّز. */
export async function typeText(b, text) {
  if (b.page) {
    await b.page.keyboard.type(text);
    return;
  }
  const actions = [...text].flatMap((ch) => (ch === '\n' ? [{ type: 'keyDown', value: WD.Enter }, { type: 'keyUp', value: WD.Enter }] : [{ type: 'keyDown', value: ch }, { type: 'keyUp', value: ch }]));
  await b.ff.actions([{ type: 'key', id: 'keyboard', actions }]);
}

/** لمسة حقيقية عند إحداثي في نافذة العرض. */
export async function tap(b, x, y) {
  if (b.page) {
    await b.page.touchscreen.tap(x, y);
    return;
  }
  await b.ff.actions([
    {
      type: 'pointer',
      id: 'finger',
      parameters: { pointerType: 'touch' },
      actions: [{ type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y), origin: 'viewport' }, { type: 'pointerDown', button: 0 }, { type: 'pause', duration: 40 }, { type: 'pointerUp', button: 0 }],
    },
  ]);
}

/** نقرة فأرة حقيقية عند إحداثي. */
export async function click(b, x, y) {
  if (b.page) {
    await b.page.mouse.click(x, y);
    return;
  }
  await b.ff.actions([
    {
      type: 'pointer',
      id: 'mouse',
      parameters: { pointerType: 'mouse' },
      actions: [{ type: 'pointerMove', duration: 0, x: Math.round(x), y: Math.round(y), origin: 'viewport' }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }],
    },
  ]);
}

/**
 * صفحات GitHub الحقيقية المحفوظة تحمل سكربتاتها فتعمل على 127.0.0.1، وقد تعيد رسم الصفحة عند اللمس أو النقر. Chromium: تُحجب سكربتات
 * ما عدا 127.0.0.1 بعد الفتح (blockExternalScripts) وتبقى الأنماط. Firefox (Marionette) لا يحجب انتقائيًا، فتُقصر مدخلات اللمس والنقر
 * على العينات المحلية، وتبقى الصفحات الحقيقية لمدخلات لوحة المفاتيح وقياس الهندسة.
 */
export const hermeticOptions = (_key, options = {}) => options;

/** Chromium: يحجب سكربتات الصفحات من غير 127.0.0.1 (تبقى الأنماط)؛ Firefox: لا شيء. */
export async function blockExternalScripts(b) {
  if (!b.context) return;
  await b.context.route('**/*', (route) => {
    const request = route.request();
    const local = new URL(request.url()).hostname.startsWith('127.');
    return request.resourceType() === 'script' && !local ? route.abort() : route.continue();
  });
}

export const settle = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

/** مسجّل فحوص: يطبع الفاشل فورًا ويحتفظ بالكل. */
export function recorder() {
  const checks = [];
  return {
    checks,
    check(browser, page, name, ok, detail) {
      checks.push({ browser, page, name, ok: Boolean(ok), detail });
      if (!ok) console.error(`  ✗ ${browser} · ${page} · ${name}: ${JSON.stringify(detail)?.slice(0, 600)}`);
    },
  };
}

#!/usr/bin/env node
// تجربة T-0.2 (MJ4): محركات الترجمة المحلية عبر المتصفحات (AC-S2.1..S2.4).
// تبني إضافة قياس من scripts/spikes/t02-ext (لا تُشحن) وتحمّلها في ملف تعريف مؤقت لكل متصفح، ثم تقيس:
//  - Translator API: availability() وcreate() في سكربت المحتوى (بلا تفاعل ثم بنقرة حقيقية)، ووثيقة offscreen، وصفحة الإضافة، والخلفية.
//  - مسار ONNX: transformers.js وonnxruntime-web محليان داخل الإضافة (لا شيفرة بعيدة)، والنموذج من مرآة محلية تخزّن نسخة
//    من huggingface.co عند أول طلب (فيُنزَّل مرة واحدة)، مع سجل الملفات المطلوبة فعلًا وأحجامها، وزمن التحميل والترجمة وقمة RSS.
//  - جلب مضيف النموذج المعلن بلا صلاحية اختيارية ثم بعد منحها.
//  - Firefox: browser.trial.ml بعد منح trialML (من سياق chrome، لأن نافذة الاستئذان لا تُشغَّل آليًا).
// الاستعمال: node scripts/spikes/t02-engines.mjs [chrome edge brave firefox] --pkgs <مجلد الحزم> --cache <مجلد ذاكرة النموذج> --out evidence/T-0.2/raw/engines.json
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, launchFirefox, sampleRss, sleep, waitFor, writeJson } from './lib.mjs';
import { mask } from './t02-validator.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const take = (flag) => { const i = args.indexOf(flag); return i === -1 ? undefined : args.splice(i, 2)[1]; };
const outFile = take('--out');
const PKGS = take('--pkgs');
const CACHE = take('--cache');
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];
const REF = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/spikes/t02-reference.json'), 'utf8'));
const MASKED = REF.sentences.map((s) => mask(s));

// ---------- بناء الإضافة ----------
const BUILD = path.join(CACHE, '..', 't02-build');
function build(variant) {
  const dir = path.join(BUILD, variant);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'ort'), { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts/spikes/t02-ext'))) fs.copyFileSync(path.join(ROOT, 'scripts/spikes/t02-ext', f), path.join(dir, f));
  const tdist = path.join(PKGS, 'huggingface-transformers-4.3.1/package/dist');
  fs.copyFileSync(path.join(tdist, 'transformers.js'), path.join(dir, 'lib/transformers.js'));
  const odist = path.join(PKGS, fs.readdirSync(PKGS).find((d) => d.startsWith('onnxruntime-web-') && !d.endsWith('.tgz')), 'package/dist');
  for (const f of fs.readdirSync(odist).filter((n) => /^ort-wasm-simd-threaded.*\.(mjs|wasm)$/.test(n))) fs.copyFileSync(path.join(odist, f), path.join(dir, 'ort', f));
  const firefox = variant.startsWith('firefox');
  const manifest = {
    manifest_version: 3,
    name: 'mijhar-t02-spike',
    version: '0.0.1',
    permissions: firefox ? ['storage'] : ['offscreen', 'storage'],
    host_permissions: ['http://127.0.0.1/*', ...(variant.endsWith('granted') ? ['https://huggingface.co/*', 'https://*.hf.co/*'] : [])],
    optional_host_permissions: ['https://huggingface.co/*', 'https://*.hf.co/*'],
    background: firefox ? { scripts: ['bg.js'] } : { service_worker: 'bg.js' },
    content_scripts: [{ matches: ['http://127.0.0.1/*'], js: ['translator-test.js', 'cs.js'] }],
  };
  if (firefox) {
    manifest.browser_specific_settings = { gecko: { id: 'mijhar-t02@spike.local' } };
    manifest.optional_permissions = ['trialML'];
  }
  // CSP الافتراضية لصفحات الإضافة تمنع WebAssembly (مقيس)؛ فالنسخة الأساسية تعلن 'wasm-unsafe-eval' صراحة، و*-default-csp بلا إعلان.
  if (!variant.endsWith('default-csp')) manifest.content_security_policy = { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

// ---------- المرآة المحلية للنموذج والعينة ----------
const requests = [];
async function startMirror() {
  fs.mkdirSync(CACHE, { recursive: true });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/page.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>mj t02 content page</p></body></html>');
      return;
    }
    const m = /^\/(Xenova\/opus-mt-en-ar)\/resolve\/main\/(.+)$/.exec(url.pathname);
    if (!m) { res.writeHead(404).end(); return; }
    const file = path.join(CACHE, m[2]);
    let fromCache = fs.existsSync(file);
    if (!fromCache) {
      const upstream = await fetch(`https://huggingface.co/${m[1]}/resolve/main/${m[2]}`);
      if (!upstream.ok) {
        requests.push({ path: m[2], status: upstream.status, upstream: true });
        res.writeHead(upstream.status).end();
        return;
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(await upstream.arrayBuffer()));
    }
    const size = fs.statSync(file).size;
    requests.push({ path: m[2], status: 200, bytes: size, fromCache });
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': size, 'access-control-allow-origin': '*' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}

const parse = (s) => (s ? JSON.parse(s) : null);

async function chromiumRun(key, mirror) {
  const r = { browser: key };
  const ext = build('chromium');
  // بواجهة: Translator.create() يفشل بلا واجهة (NotSupportedError) ويعمل بواجهة (مقيس في Chrome).
  const b = await launchChromium(key, { extension: ext, headless: false });
  r.version = b.version;
  try {
    const id = b.extensionId;
    const ep = await b.context.newPage();
    await ep.goto(`chrome-extension://${id}/page.html`);
    await ep.waitForFunction(() => document.documentElement.dataset.ready === '1');
    // قبل أي تنزيل: الخلفية وoffscreen وصفحة الإضافة بلا تفاعل.
    r.background = await ep.evaluate(() => window.mj.background());
    r.offscreenBefore = await ep.evaluate(() => window.mj.offscreen());
    r.extensionPage = { noActivationBefore: await ep.evaluate(() => window.mj.translatorNoActivation()) };
    // سكربت المحتوى: بلا تفاعل ثم بنقرة حقيقية (تنزيل حزمة اللغة).
    const page = await b.context.newPage();
    await page.goto(`${mirror.url}/page.html`);
    await waitFor(() => page.evaluate(() => document.documentElement.dataset.mjCsNoActivation), 120000, 500);
    r.contentScript = {
      init: parse(await page.evaluate(() => document.documentElement.dataset.mjCsInit)),
      noActivation: parse(await page.evaluate(() => document.documentElement.dataset.mjCsNoActivation)),
    };
    if (r.contentScript.init?.Translator === 'function') {
      await page.click('#mj-cs-act');
      await waitFor(() => page.evaluate(() => document.documentElement.dataset.mjCs), 900000, 1000);
      r.contentScript.withActivation = parse(await page.evaluate(() => document.documentElement.dataset.mjCs));
      r.contentScript.activationAtClick = await page.evaluate(() => document.documentElement.dataset.mjCsActivationAtClick);
    }
    // بعد التنزيل: offscreen وصفحة الإضافة بلا تفاعل ثم بتفاعل (مع الجمل المقنّعة للمدقق).
    await ep.bringToFront();
    r.offscreen = await ep.evaluate(() => window.mj.offscreen());
    r.extensionPage.noActivation = await ep.evaluate(() => window.mj.translatorNoActivation());
    await ep.evaluate((s) => window.mj.armActivation(s), MASKED.map((m) => m.masked));
    await ep.click('#act');
    r.extensionPage.withActivation = await ep.evaluate(() => window.mj.activationResult());
    r.permissions = await ep.evaluate(() => window.mj.permissions());
    r.hfFetchNoPermission = await ep.evaluate(() => window.mj.hfFetch());
    // ONNX.
    requests.length = 0;
    const rss = sampleRss(b.profileDir);
    const before = (await import('./lib.mjs')).processTreeRss(b.profileDir);
    r.onnx = await ep.evaluate((a) => window.mj.onnx(a), { remoteHost: `${mirror.url}/`, paragraphs: REF.paragraphs, sentences: MASKED.map((m) => m.masked) });
    r.onnx.rss = { beforeTotalMB: before.total, beforeMaxMB: before.max, ...rss.stop() };
    r.onnx.requests = [...requests];
  } catch (e) {
    r.error = String(e.stack ?? e);
  } finally {
    await b.close();
  }
  // CSP الافتراضية: هل يعمل WebAssembly في صفحة الإضافة بلا إعلان 'wasm-unsafe-eval'؟
  const b3 = await launchChromium(key, { extension: build('chromium-default-csp') });
  try {
    const ep = await b3.context.newPage();
    await ep.goto(`chrome-extension://${b3.extensionId}/page.html`);
    await ep.waitForFunction(() => document.documentElement.dataset.ready === '1');
    const d = await ep.evaluate((a) => window.mj.onnx(a), { remoteHost: `${mirror.url}/`, paragraphs: [], sentences: [] });
    r.onnxDefaultCsp = { loadError: d.loadError?.slice(0, 400) ?? null, loaded: !d.loadError };
  } finally {
    await b3.close();
  }
  if (key === 'chrome') {
    // الصلاحية الاختيارية «ممنوحة»: نسخة بصلاحية المضيف مطلوبة (نافذة الاستئذان لا تُشغَّل آليًا).
    const b2 = await launchChromium(key, { extension: build('chromium-granted') });
    try {
      const ep = await b2.context.newPage();
      await ep.goto(`chrome-extension://${b2.extensionId}/page.html`);
      await ep.waitForFunction(() => document.documentElement.dataset.ready === '1');
      r.hfFetchGranted = await ep.evaluate(() => window.mj.hfFetch());
      r.permissionsGranted = await ep.evaluate(() => window.mj.permissions());
    } finally {
      await b2.close();
    }
  }
  return r;
}

const FF_UUID = 'return WebExtensionPolicy.getByID(arguments[0])?.mozExtensionHostname ?? null;';
const FF_GRANT = `
  const [id, perms, origins] = arguments;
  const done = arguments[arguments.length - 1];
  const { ExtensionPermissions } = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs');
  const ext = WebExtensionPolicy.getByID(id).extension;
  ExtensionPermissions.add(id, { permissions: perms, origins }, ext).then(() => done(true), (e) => done(String(e)));
`;
const FF_PREFS = `
  const names = Services.prefs.getChildList('browser.ml.').concat(Services.prefs.getChildList('extensions.ml.'));
  const out = {};
  for (const n of names.sort()) {
    const t = Services.prefs.getPrefType(n);
    out[n] = t === Services.prefs.PREF_BOOL ? Services.prefs.getBoolPref(n) : t === Services.prefs.PREF_INT ? Services.prefs.getIntPref(n) : Services.prefs.getStringPref(n);
  }
  return out;
`;
const FF_SET = `
  const [name, value] = arguments;
  if (typeof value === 'boolean') Services.prefs.setBoolPref(name, value);
  else if (typeof value === 'number') Services.prefs.setIntPref(name, value);
  else Services.prefs.setStringPref(name, value);
  return true;
`;

async function firefoxRun(mirror) {
  const r = { browser: 'firefox' };
  const ff = await launchFirefox();
  r.version = ff.version;
  const pageCall = (expr, arg) => ff.execAsync(`const done = arguments[arguments.length - 1]; Promise.resolve((window.wrappedJSObject ?? window).${expr}(arguments[0])).then((v) => done(JSON.parse(JSON.stringify(v ?? null))), (e) => done({ error: String(e) }));`, [arg ?? null], 'content', 900000);
  try {
    // CSP الافتراضية أولًا (تثبيت مؤقت بالمعرّف نفسه يُستبدل بعده).
    {
      const idD = await ff.installAddon(build('firefox-default-csp'));
      const uuidD = await ff.exec(FF_UUID, [idD], 'chrome');
      await ff.execAsync(FF_GRANT, [idD, [], ['http://127.0.0.1/*']], 'chrome');
      await ff.navigate(`moz-extension://${uuidD}/page.html`);
      await sleep(1500);
      const d = await pageCall('mj.onnx', { remoteHost: `${mirror.url}/`, paragraphs: [], sentences: [] });
      r.onnxDefaultCsp = { loadError: d.loadError?.slice(0, 400) ?? d.importError ?? null, loaded: !d.loadError && !d.importError };
      // مغادرة صفحة الإضافة قبل إعادة التثبيت حتى لا يُتلف سياق التصفح.
      await ff.navigate('about:blank');
    }
    const id = await ff.installAddon(build('firefox'));
    const uuid = await ff.exec(FF_UUID, [id], 'chrome');
    // Firefox MV3: صلاحيات المضيف اختيارية حتى تُمنح؛ تُمنح لأصل العينة المحلية ليعمل سكربت المحتوى.
    r.grantLocal = await ff.execAsync(FF_GRANT, [id, [], ['http://127.0.0.1/*']], 'chrome');
    // سكربت المحتوى.
    await ff.navigate(`${mirror.url}/page.html`);
    await sleep(2500);
    r.contentScript = { init: parse(await ff.exec('return document.documentElement.dataset.mjCsInit ?? null;')), noActivation: parse(await ff.exec('return document.documentElement.dataset.mjCsNoActivation ?? null;')) };
    // صفحة الإضافة.
    await ff.navigate(`moz-extension://${uuid}/page.html`);
    await sleep(1500);
    r.extensionPage = { noActivation: await pageCall('mj.translatorNoActivation') };
    r.permissions = await pageCall('mj.permissions');
    r.hfFetchNoPermission = await pageCall('mj.hfFetch');
    r.grantOrigins = await ff.execAsync(FF_GRANT, [id, [], ['https://huggingface.co/*', 'https://*.hf.co/*']], 'chrome');
    r.hfFetchGranted = await pageCall('mj.hfFetch');
    // ONNX.
    requests.length = 0;
    const rss = sampleRss(ff.profileDir);
    r.onnx = await pageCall('mj.onnx', { remoteHost: `${mirror.url}/`, paragraphs: REF.paragraphs, sentences: MASKED.map((m) => m.masked) });
    r.onnx.rss = rss.stop();
    r.onnx.requests = [...requests];
    // trial.ml.
    r.ml = { prefsDefault: await ff.exec(FF_PREFS, [], 'chrome') };
    await ff.navigate(`moz-extension://${uuid}/ml.html`);
    await sleep(1000);
    r.ml.probeBeforeGrant = await pageCall('mjMl.probe');
    r.ml.grant = await ff.execAsync(FF_GRANT, [id, ['trialML'], []], 'chrome');
    await ff.navigate(`moz-extension://${uuid}/ml.html`);
    await sleep(1000);
    r.ml.probeAfterGrant = await pageCall('mjMl.probe');
    const request = { taskName: 'translation', modelId: 'Xenova/opus-mt-en-ar', modelHub: 'huggingface', dtype: 'q8', input: MASKED[0].masked };
    r.ml.runDefaultPrefs = await pageCall('mjMl.run', request);
    // التفضيلات: تفعيل المحرك ثم إعادة المحاولة.
    r.ml.setPrefs = {};
    for (const [n, v] of [['browser.ml.enable', true], ['extensions.ml.enabled', true]]) r.ml.setPrefs[n] = await ff.exec(FF_SET, [n, v], 'chrome');
    await ff.navigate(`moz-extension://${uuid}/ml.html`);
    await sleep(1000);
    r.ml.probeAfterPrefs = await pageCall('mjMl.probe');
    const rssMl = sampleRss(ff.profileDir);
    r.ml.runEnabled = await pageCall('mjMl.run', request);
    r.ml.runEnabled.rss = rssMl.stop();
    if (!r.ml.runEnabled.error) {
      r.ml.sentences = [];
      for (const m of MASKED) r.ml.sentences.push(await pageCall('mjMl.run', { ...request, input: m.masked }));
    }
    r.ml.prefsAfter = await ff.exec(FF_PREFS, [], 'chrome');
  } catch (e) {
    r.error = String(e.stack ?? e);
  } finally {
    await ff.close();
  }
  return r;
}

const mirror = await startMirror();
const output = { measuredAt: new Date().toISOString(), masked: MASKED, results: [] };
try {
  for (const key of keys) {
    const res = key === 'firefox' ? await firefoxRun(mirror) : await chromiumRun(key, mirror);
    output.results.push(res);
    console.error(`${key}: ${JSON.stringify({ cs: res.contentScript?.withActivation?.create ?? res.contentScript?.init?.Translator, off: res.offscreen?.result?.create ?? res.offscreen?.result?.Translator, page: res.extensionPage?.withActivation?.create ?? res.extensionPage?.noActivation?.Translator, onnxLoad: res.onnx?.loadMs ?? res.onnx?.loadError?.slice(0, 80), err: res.error?.slice(0, 120) })}`);
    if (outFile) writeJson(outFile, output);
  }
} finally {
  await mirror.close();
}

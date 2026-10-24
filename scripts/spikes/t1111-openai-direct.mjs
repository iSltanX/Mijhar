#!/usr/bin/env node
// قياس الوصول المباشر إلى واجهة OpenAI من خلفية الإضافة (MJ24، T-11.11، AC-E11 (١)، HYP-20) في Chrome وEdge وBrave وFirefox:
// إضافة اختبار (scripts/spikes/t1111-ext، لا تُشحن) بمفتاح غير صالح عمدًا وبلا أي محتوى من أي صفحة. الطلبان من الخلفية:
//   GET  /v1/models      (طلب التحقق المعلن في المحوّل)
//   POST /v1/responses   (نقطة التحليل، بنص «ping» وحده وmax_output_tokens: 16 وstore: false)
// والمتوقع إن كان الوصول المباشر ممكنًا: يصل الطلب ويُقرأ الرد (401 بجسم خطأ JSON) بلا فشل CORS. وللمقارنة تشغيل ثانٍ بلا صلاحية المضيف
// في المانيفست (ضابط سلبي: يبين أن النجاح مصدره الصلاحية الممنوحة لا غياب CORS عن الصفحات).
// الاستعمال: node scripts/spikes/t1111-openai-direct.mjs [chrome edge brave firefox] [--out evidence/T-11.11/raw/direct-access.json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launchChromium, launchFirefox, writeJson } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.join(HERE, 't1111-ext');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];
const INVALID_KEY = ['sk', 'invalid', 'mijhar', 'mj24', 'probe'].join('-');
const PROBES = [
  { name: 'GET /v1/models (التحقق المعلن)', method: 'GET', path: '/v1/models', headers: { authorization: `Bearer ${INVALID_KEY}` } },
  { name: 'POST /v1/responses (نقطة التحليل، «ping» وحده)', method: 'POST', path: '/v1/responses', headers: { authorization: `Bearer ${INVALID_KEY}`, 'content-type': 'application/json' }, body: { model: 'probe-model', input: 'ping', max_output_tokens: 16, store: false } },
];

function extensionDir(family, granted) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-t1111-${family}-`));
  for (const file of fs.readdirSync(EXT)) fs.copyFileSync(path.join(EXT, file), path.join(dir, file));
  const manifest = {
    manifest_version: 3,
    name: 'mijhar-t1111-spike',
    version: '0.0.1',
    ...(granted ? { host_permissions: ['https://api.openai.com/*'] } : {}),
    ...(family === 'firefox' ? { background: { scripts: ['background.js'] }, browser_specific_settings: { gecko: { id: 't1111@mijhar.invalid', data_collection_permissions: { required: ['none'] } } } } : { background: { service_worker: 'background.js' } }),
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

async function chromiumRun(key, granted) {
  const dir = extensionDir('chromium', granted);
  const b = await launchChromium(key, { extension: dir });
  const r = { browser: BROWSERS[key].label, version: b.version, hostPermission: granted ? 'في المانيفست' : 'غائبة (ضابط سلبي)' };
  try {
    const page = await b.context.newPage();
    await page.goto(`chrome-extension://${b.extensionId}/page.html`);
    r.probe = await page.evaluate((probes) => chrome.runtime.sendMessage({ t1111: true, probes }), PROBES);
  } catch (error) {
    r.error = String(error?.stack ?? error).split('\n').slice(0, 3).join(' | ');
  } finally {
    await b.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return r;
}

async function firefoxRun(granted) {
  const dir = extensionDir('firefox', granted);
  const ff = await launchFirefox();
  const r = { browser: 'Firefox', version: ff.version, hostPermission: granted ? 'في المانيفست' : 'غائبة (ضابط سلبي)' };
  try {
    const id = await ff.installAddon(dir);
    const host = await ff.exec('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [id], 'chrome');
    await ff.navigate(`moz-extension://${host}/page.html`);
    r.grantedAtRuntime = await ff.exec('return browser.runtime.getManifest().host_permissions ?? null;').catch(() => null);
    r.probe = await ff.execAsync('const [p, done] = arguments; (globalThis.browser ?? window.wrappedJSObject?.browser).runtime.sendMessage({ t1111: true, probes: p }).then(done, (e) => done({ threw: String(e) }));', [PROBES], 'content', 60000);
  } catch (error) {
    r.error = String(error?.stack ?? error).split('\n').slice(0, 3).join(' | ');
  } finally {
    await ff.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return r;
}

const run = { measuredAt: new Date().toISOString(), host: 'https://api.openai.com', key: 'غير صالح عمدًا (مختلَق)، بلا أي محتوى؛ النص «ping» وحده', runs: [] };
for (const key of keys) {
  for (const granted of [true, false]) {
    const r = key === 'firefox' ? await firefoxRun(granted) : await chromiumRun(key, granted);
    run.runs.push(r);
    const summary = (r.probe?.results ?? []).map((x) => `${x.name.split(' ')[0]} ${x.name.split(' ')[1]} → ${x.ok ? `${x.status} ${x.type}${x.error ? ` ${x.error.type}/${x.error.code}` : ''}` : `فشل ${x.threw?.name}: ${x.threw?.message}`}`).join(' | ');
    console.error(`${r.browser} ${r.version ?? ''} [صلاحية المضيف: ${r.hostPermission}] (${r.probe?.context ?? '—'}): ${summary || r.error || r.probe?.threw}`);
  }
}
if (outFile) writeJson(outFile, run);
else console.log(JSON.stringify(run, null, 2));

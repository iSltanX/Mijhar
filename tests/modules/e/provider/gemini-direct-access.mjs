#!/usr/bin/env node
// قياس الوصول المباشر إلى واجهة Google Gemini من خلفية الإضافة (MJ25، T-11.12، AC-E12 (١)، HYP-21) على نمط T-0.5 (scripts/spikes/t05-browser.mjs):
// إضافة اختبار مؤقتة (تُكتب في مجلد مؤقت ولا تُشحن) تُحمَّل في Chrome وEdge وBrave وFirefox بملف تعريف مؤقت، وتطلب خلفيتها https://generativelanguage.googleapis.com
// بمفتاح غير صالح عمدًا وبلا أي محتوى (نص «ping» وحده في طلب التوليد) وبصلاحية مضيف واحدة، وتُقرأ الاستجابة: هل يصل الطلب بلا وسيط؟ وهل يُقرأ ردّه
// ورمز حالته وجسم خطئه وترويساته؟ والمفتاح في ترويسة الطلب لا في عنوانه (AC-E12 (٤)).
// الطلبان: GET /v1beta/models (طلب التحقق المعلن) وPOST /v1beta/models/<مودل وهمي>:generateContent (التحليل). لا مفتاح حقيقي هنا ولا مودل حقيقي.
// الاستعمال: node tests/modules/e/provider/gemini-direct-access.mjs [chrome edge brave firefox] [--out evidence/T-11.12/direct-access.json]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BROWSERS, launchChromium, launchFirefox, sleep, waitFor, writeJson } from '../../../../scripts/spikes/lib.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

const HOST = 'generativelanguage.googleapis.com';
// مفتاح غير صالح عمدًا (ليس مفتاحًا لأحد).
const INVALID_KEY = ['AIza', 'Sy', 'INVALID-mijhar-t1112-probe-0000000'].join('');
const PROBES = [
  { name: 'تحقق: GET models (بلا محتوى)', method: 'GET', url: `https://${HOST}/v1beta/models?pageSize=1`, body: null },
  { name: 'تحليل: POST generateContent (نص «ping» وحده)', method: 'POST', url: `https://${HOST}/v1beta/models/mijhar-invalid-model:generateContent`, body: { contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 16 } } },
];

const BACKGROUND = `
const api = globalThis.browser ?? globalThis.chrome;
const err = (e) => ({ name: e?.name ?? null, message: String(e?.message ?? e).slice(0, 300) });
async function probe(request) {
  try {
    const started = Date.now();
    const response = await fetch(request.url, {
      method: request.method,
      headers: { 'x-goog-api-key': request.key, ...(request.body ? { 'content-type': 'application/json' } : {}) },
      body: request.body ? JSON.stringify(request.body) : undefined,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
    const headers = {};
    for (const name of ['content-type', 'access-control-allow-origin', 'retry-after', 'x-goog-request-params', 'server-timing', 'vary']) headers[name] = response.headers.get(name);
    let body = null;
    try { body = await response.json(); } catch {}
    const e = body?.error ?? null;
    return {
      name: request.name, status: response.status, type: response.type, ms: Date.now() - started, headers,
      error: e ? { code: e.code ?? null, status: e.status ?? null, message: String(e.message ?? '').slice(0, 200), details: Array.isArray(e.details) ? e.details.map((d) => ({ type: d['@type'] ?? null, reason: d.reason ?? null, domain: d.domain ?? null, keys: Object.keys(d) })) : null } : null,
      bodyKeys: body && typeof body === 'object' ? Object.keys(body) : null,
      urlCarriesKey: request.url.includes(request.key),
    };
  } catch (e) {
    return { name: request.name, threw: err(e) };
  }
}
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.probe !== 'gemini') return undefined;
  Promise.all(message.requests.map(probe)).then(sendResponse, (e) => sendResponse({ threw: err(e) }));
  return true;
});
`;

function extensionDir(family) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-gemini-${family}-`));
  fs.writeFileSync(path.join(dir, 'background.js'), BACKGROUND);
  fs.writeFileSync(path.join(dir, 'page.html'), '<!doctype html><meta charset="utf-8"><title>probe</title><body>probe</body>');
  const manifest = {
    manifest_version: 3,
    name: 'mijhar-gemini-direct-access-probe',
    version: '0.0.1',
    host_permissions: [`https://${HOST}/*`],
    ...(family === 'firefox'
      ? { background: { scripts: ['background.js'] }, browser_specific_settings: { gecko: { id: 'gemini-probe@mijhar.invalid', data_collection_permissions: { required: ['none'] } } } }
      : { background: { service_worker: 'background.js' } }),
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

const requests = () => PROBES.map((p) => ({ ...p, key: INVALID_KEY }));

async function chromiumRun(key) {
  const dir = extensionDir('chromium');
  const b = await launchChromium(key, { extension: dir });
  const r = { browser: BROWSERS[key].label, version: b.version, context: 'service worker الخلفية' };
  try {
    const page = await b.context.newPage();
    await page.goto(`chrome-extension://${b.extensionId}/page.html`);
    const worker = await waitFor(() => b.context.serviceWorkers().find((w) => w.url().includes(b.extensionId)), 15000);
    if (!worker) throw new Error('لم تعمل خلفية الإضافة');
    r.results = await page.evaluate((reqs) => new Promise((resolve) => chrome.runtime.sendMessage({ probe: 'gemini', requests: reqs }, resolve)), requests());
  } catch (error) {
    r.error = String(error).slice(0, 300);
  } finally {
    await b.close();
  }
  return r;
}

async function firefoxRun() {
  const dir = extensionDir('firefox');
  const ff = await launchFirefox();
  const r = { browser: 'Firefox', version: ff.version, context: 'صفحة الخلفية' };
  try {
    const id = await ff.installAddon(dir);
    const host = await ff.exec('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [id], 'chrome');
    await ff.navigate(`moz-extension://${host}/page.html`);
    await sleep(500);
    r.results = await ff.execAsync(`const [reqs, done] = arguments; (globalThis.browser ?? window.wrappedJSObject?.browser).runtime.sendMessage({ probe: 'gemini', requests: reqs }).then(done, (e) => done({ threw: String(e) }));`, [requests()], 'content', 60000);
  } catch (error) {
    r.error = String(error).slice(0, 300);
  } finally {
    await ff.close();
  }
  return r;
}

const run = { measuredAt: new Date().toISOString(), host: HOST, key: 'غير صالح عمدًا (مختلَق، ليس مفتاح أحد)', content: 'لا محتوى: «ping» وحده في طلب التوليد', runs: [] };
for (const key of keys) {
  const r = key === 'firefox' ? await firefoxRun() : await chromiumRun(key);
  run.runs.push(r);
  const line = (r.results ?? []).map((x) => (x.threw ? `${x.name}: رمى ${x.threw.message}` : `${x.name}: ${x.status} ${x.type} ${x.error?.status ?? ''}`)).join(' | ');
  console.error(`${r.browser} ${r.version ?? ''}: ${r.error ?? line}`);
}
if (outFile) writeJson(outFile, run);
else console.log(JSON.stringify(run, null, 2));

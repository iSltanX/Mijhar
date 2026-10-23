#!/usr/bin/env node
// تجارب المتصفحات الفعلية لـT-1.3 (لا تُشغَّل ضمن vitest):
//  - TEST-CORE-04 (AC-1.3): تغيّر مفتاح وحدة في سياق يظهر في بقية السياقات المفتوحة. صفحتا إضافة وسكربت محتوى فعلي
//    على صفحة github.com معترَضة (عينة fixtures/pages/pr.html). Chrome وEdge وBrave.
//  - TEST-STORAGE-02 / HYP-06: هل تُطلب unlimitedStorage وقت التشغيل؟ ثلاثة متغيرات: baseline وoptional وdeclared،
//    مع قياس رسالة خطأ الحصة وذرّية الدفعة، في Chrome وEdge وBrave وFirefox.
// الاستعمال: node tests/core/storage/browser/run.mjs [chrome|edge|brave|firefox ...] [--out <مجلد>] [--render-only]
//   --render-only: يعيد توليد browser-report.md من browser-results.json دون تشغيل متصفح.
// كل متصفح بملف تعريف مؤقت جديد يُحذف عند الانتهاء؛ المتصفحات تباعًا؛ لا شبكة (طلبات github.com تُخدَم من العينة المحلية).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../../scripts/load-check.mjs';
import { VARIANTS, buildTestExtension } from './build.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fixtureHtml = (name) => fs.readFileSync(path.join(ROOT, 'fixtures/pages', `${name}.html`), 'utf8');

async function waitUntil(read, timeoutMs = 5000, stepMs = 50) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
};

// ---------- عائلة Chromium ----------

async function withChromium(key, extDir, fn) {
  const { executable } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-core-test-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executable,
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  try {
    const browser = context.browser();
    const browserVersion = browser?.version();
    const cdp = await browser.newBrowserCDPSession();
    let id;
    try {
      ({ id } = await cdp.send('Extensions.loadUnpacked', { path: extDir }));
    } catch (error) {
      return { browserVersion, loadError: error.message };
    }
    const loadInfo = await chromiumLoadInfo(context, id);
    return { browserVersion, loadInfo, ...(await fn({ context, id })) };
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

// حالة الإضافة وأخطاء المانيفست وتحذيراته كما يراها المتصفح (كما في scripts/load-check.mjs).
async function chromiumLoadInfo(context, id) {
  const page = await context.newPage();
  try {
    await page.goto('chrome://extensions');
    return await page.evaluate(async (extensionId) => {
      const all = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
      const found = all.find((e) => e.id === extensionId);
      if (!found) return null;
      return {
        state: found.state,
        manifestErrors: (found.manifestErrors ?? []).map((e) => e.message),
        runtimeErrors: (found.runtimeErrors ?? []).map((e) => e.message),
        installWarnings: (found.installWarnings ?? []).map((w) => w.message),
        permissions: found.permissions,
      };
    }, id);
  } finally {
    await page.close();
  }
}

async function chromiumExperiments({ context, id }, variant) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/page.html`);
  const out = {};
  out.probe = await page.evaluate(() => globalThis.__mj.probe());
  out.quota = await page.evaluate(() => globalThis.__mj.quotaExperiment(12));
  if (variant === 'baseline') out.layerQuota = await page.evaluate(() => globalThis.__mj.layerQuotaExperiment(12));
  if (variant === 'optional') {
    await page.evaluate(() => globalThis.__mj.clearRequestResult());
    await page.click('#request');
    out.request = (await waitUntil(() => page.evaluate(() => globalThis.__mj.requestResult()), 10000)) ?? { timeout: 'لم تُحسم الوعد خلال 10 ثوانٍ (قد تنتظر نافذة موافقة)' };
    await page.evaluate(() => globalThis.__mj.clearRequestResult());
    await page.click('#request-control');
    out.requestControl = (await waitUntil(() => page.evaluate(() => globalThis.__mj.requestResult()), 10000)) ?? { timeout: 'لم تُحسم الوعد خلال 10 ثوانٍ' };
    out.probeAfterRequest = await page.evaluate(() => globalThis.__mj.probe());
    out.quotaAfterRequest = await page.evaluate(() => globalThis.__mj.quotaExperiment(12));
  }
  await page.close();
  return out;
}

// TEST-CORE-04: صفحتا إضافة + سكربت محتوى.
async function core04({ context, id }) {
  const origin = `chrome-extension://${id}`;
  const result = { contexts: ['صفحة إضافة 1 (تبويب)', 'صفحة إضافة 2 (تبويب)', 'سكربت محتوى على صفحة github.com معترَضة'] };
  await context.route('https://github.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml('pr') }));

  const p1 = await context.newPage();
  await p1.goto(`${origin}/page.html`);
  const p2 = await context.newPage();
  await p2.goto(`${origin}/page.html`);
  result.init = await Promise.all([p1.evaluate(() => globalThis.__mj.init()), p2.evaluate(() => globalThis.__mj.init())]);

  const gh = await context.newPage();
  await gh.goto('https://github.com/octo/demo/pull/42');
  result.contentScriptReady = Boolean(await waitUntil(() => gh.locator('html[data-mj-content="ready"]').count(), 10000));
  const injected = () => gh.locator('[data-mijhar-injected="a"]').count();
  result.initialInjected = await waitUntil(injected, 5000);

  const remoteEvent = (page, key, value) =>
    waitUntil(() => page.evaluate(([k, v]) => globalThis.__mj.events().some((e) => e.key === k && e.value === v && e.source === 'remote'), [key, value]), 5000, 25);

  // 1) إيقاف a من الصفحة 1.
  await Promise.all([p1.evaluate(() => globalThis.__mj.clearEvents()), p2.evaluate(() => globalThis.__mj.clearEvents())]);
  await p1.evaluate(() => globalThis.__mj.set('modules.a.enabled', false));
  result.page2ReceivedRemoteOff = Boolean(await remoteEvent(p2, 'modules.a.enabled', false));
  result.contentScriptUnmounted = Boolean(await waitUntil(async () => (await injected()) === 0, 5000, 25));
  result.page2ValueOff = await p2.evaluate(() => globalThis.__mj.get('modules.a.enabled'));
  result.domClean = await gh.evaluate(() => !document.body.hasAttribute('data-mijhar-a') && !document.querySelector('[data-mijhar-injected]'));

  // 2) تفعيلها من الصفحة 2: تصل الصفحة 1 والمحتوى.
  await p2.evaluate(() => globalThis.__mj.set('modules.a.enabled', true));
  result.page1ReceivedRemoteOn = Boolean(await remoteEvent(p1, 'modules.a.enabled', true));
  result.contentScriptRemounted = Boolean(await waitUntil(async () => (await injected()) === 1, 5000, 25));

  // 3) عشر تبديلات متناوبة من الصفحتين: تتقارب كل السياقات إلى القيمة الأخيرة. تُقاس زمن وصول الحدث.
  const latencies = { page: [], dom: [] };
  let expected = true;
  for (let i = 0; i < 10; i += 1) {
    expected = !expected;
    const [writer, reader] = i % 2 === 0 ? [p1, p2] : [p2, p1];
    await reader.evaluate(() => globalThis.__mj.clearEvents());
    const t0 = Date.now();
    await writer.evaluate((v) => globalThis.__mj.set('modules.a.enabled', v), expected);
    await waitUntil(() => reader.evaluate((v) => globalThis.__mj.events().some((e) => e.value === v), expected), 5000, 10);
    latencies.page.push(Date.now() - t0);
    await waitUntil(async () => (await injected()) === (expected ? 1 : 0), 5000, 10);
    latencies.dom.push(Date.now() - t0);
  }
  await sleep(300);
  const finals = await Promise.all([p1.evaluate(() => globalThis.__mj.get('modules.a.enabled')), p2.evaluate(() => globalThis.__mj.get('modules.a.enabled'))]);
  result.finalValues = finals;
  result.finalInjected = await injected();
  result.consistentAfterToggles = finals[0] === expected && finals[1] === expected && result.finalInjected === (expected ? 1 : 0);
  result.latencyMs = { pageToPageMedian: median(latencies.page), pageToContentDomMedian: median(latencies.dom), samples: latencies };

  // 4) إعادة التحميل: الحالة محفوظة.
  await gh.reload();
  result.afterReload = await waitUntil(async () => (await injected()) === (expected ? 1 : 0), 8000, 50);
  result.persistsAfterReload = Boolean(result.afterReload) && (await gh.locator('html[data-mj-content="ready"]').count()) === 1;
  result.contentErrors = await gh.evaluate(() => document.documentElement.getAttribute('data-mj-error'));
  result.pass = Boolean(
    result.contentScriptReady && result.page2ReceivedRemoteOff && result.contentScriptUnmounted && result.domClean && result.page1ReceivedRemoteOn && result.contentScriptRemounted && result.consistentAfterToggles && result.persistsAfterReload && !result.contentErrors,
  );
  result.notRun = ['لوحة جانبية (sidePanel): لا تُفتح دون فعل مستخدم فعلي؛ تُغطيها T-1.4 (TEST-CORE-05 وTEST-CORE-06)', 'نافذة ثانية منفصلة: التبويبات تشترك في ملف التعريف نفسه ومسار البث نفسه'];
  return result;
}

async function runChromium(key, results) {
  const label = BROWSERS[key].label;
  results[key] = { label, variants: {} };
  for (const variant of VARIANTS) {
    const extDir = await buildTestExtension('chromium', variant);
    const run = await withChromium(key, extDir, async (handle) => {
      const data = await chromiumExperiments(handle, variant);
      if (variant === 'baseline') data.core04 = await core04(handle);
      return data;
    });
    results[key].browserVersion = run.browserVersion;
    results[key].variants[variant] = run;
    console.log(`${label} ${run.browserVersion ?? ''} / ${variant}: ${run.loadError ? `رفض التحميل: ${run.loadError}` : 'تمت التجارب'}${run.core04 ? ` · TEST-CORE-04 ${run.core04.pass ? 'اجتاز' : 'فشل'}` : ''}`);
  }
}

// ---------- Firefox (Marionette) ----------

function marionette(socket) {
  let pending = Buffer.alloc(0);
  const waiters = [];
  let id = 0;
  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      const header = /^(\d+):/.exec(pending.subarray(0, 12).toString('latin1'));
      if (!header) return;
      const start = header[0].length;
      const length = Number(header[1]);
      if (pending.length < start + length) return;
      const body = pending.subarray(start, start + length).toString('utf8');
      pending = pending.subarray(start + length);
      waiters.shift()?.(JSON.parse(body));
    }
  });
  const next = () => new Promise((resolve) => waiters.push(resolve));
  return {
    handshake: next,
    async send(name, params = {}) {
      const message = JSON.stringify([0, ++id, name, params]);
      socket.write(`${Buffer.byteLength(message)}:${message}`);
      const [, , error, result] = await next();
      if (error) throw new Error(error.message ?? JSON.stringify(error));
      return result;
    },
  };
}

async function withFirefox(extDir, fn) {
  const { executable } = BROWSERS.firefox;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-core-test-'));
  fs.writeFileSync(path.join(profileDir, 'user.js'), 'user_pref("marionette.port", 0);\n');
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  let socket;
  try {
    const portFile = path.join(profileDir, 'MarionetteActivePort');
    const port = await waitUntil(() => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8')), 20000, 100);
    if (!port) return { loadError: 'لم يفتح Firefox منفذ Marionette' };
    socket = net.connect(port, '127.0.0.1');
    const client = marionette(socket);
    await client.handshake();
    const { capabilities } = await client.send('WebDriver:NewSession', { capabilities: {} });
    let id;
    try {
      ({ value: id } = await client.send('Addon:Install', { path: extDir, temporary: true }));
    } catch (error) {
      return { browserVersion: capabilities.browserVersion, loadError: error.message };
    }
    await client.send('Marionette:SetContext', { value: 'chrome' });
    const info = await client.send('WebDriver:ExecuteScript', {
      script: `const policy = WebExtensionPolicy.getByID(arguments[0]); const ext = policy?.extension; return { host: policy?.mozExtensionHostname ?? null, warnings: (ext?.warnings ?? []).map(String), errors: (ext?.errors ?? []).map(String) };`,
      args: [id],
    });
    await client.send('Marionette:SetContext', { value: 'content' });
    return { browserVersion: capabilities.browserVersion, manifestMessages: info.value, ...(await fn({ client, host: info.value.host, id })) };
  } finally {
    socket?.destroy();
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(10000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited;
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

async function firefoxExperiments({ client, host }, variant) {
  const out = {};
  await client.send('WebDriver:Navigate', { url: `moz-extension://${host}/page.html` });
  await waitUntil(async () => (await client.send('WebDriver:ExecuteScript', { script: 'return Boolean(window.__mj)' })).value, 5000, 100);
  const run = async (name, ...args) => {
    await client.send('WebDriver:ExecuteScript', { script: 'window.__mj.runToDom(arguments[0], arguments[1]); return true;', args: [name, args[0] ?? null] });
    const text = await waitUntil(async () => (await client.send('WebDriver:ExecuteScript', { script: 'return document.documentElement.getAttribute("data-mj-out")' })).value, 60000, 100);
    return text ? JSON.parse(text) : { timeout: true };
  };
  out.probe = await run('probe');
  out.quota = await run('quotaExperiment', 12);
  if (variant === 'baseline') {
    out.layerQuota = await run('layerQuota', 12);
    // Firefox لم يُنتج خطأ حصة عند 12 ميغابايت: يُقاس حجم أكبر ليُعرف إن كان ثمة سقف.
    out.quotaLarge = await run('quotaExperiment', 96);
  }
  if (variant === 'optional') {
    await client.send('WebDriver:ExecuteScript', { script: 'window.__mj.clearRequestResult(); return true;' });
    const { value: element } = await client.send('WebDriver:FindElement', { using: 'css selector', value: '#request' });
    await client.send('WebDriver:ElementClick', { id: element['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(element)[0] });
    const read = async () => (await client.send('WebDriver:ExecuteScript', { script: 'const r = window.__mj.requestResult(); return r ? JSON.stringify(r) : null' })).value;
    const text = await waitUntil(read, 10000, 100);
    out.request = text ? JSON.parse(text) : { timeout: 'لم تُحسم الوعد خلال 10 ثوانٍ (قد تنتظر نافذة موافقة)' };
    await client.send('WebDriver:ExecuteScript', { script: 'window.__mj.clearRequestResult(); return true;' });
    const { value: control } = await client.send('WebDriver:FindElement', { using: 'css selector', value: '#request-control' });
    await client.send('WebDriver:ElementClick', { id: control['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(control)[0] });
    const controlText = await waitUntil(read, 10000, 100);
    out.requestControl = controlText ? JSON.parse(controlText) : { timeout: 'لم تُحسم الوعد خلال 10 ثوانٍ' };
    out.probeAfterRequest = await run('probe');
    out.quotaAfterRequest = await run('quotaExperiment', 12);
  }
  return out;
}

async function runFirefox(results) {
  results.firefox = { label: 'Firefox', variants: {} };
  for (const variant of VARIANTS) {
    const extDir = await buildTestExtension('firefox', variant);
    const run = await withFirefox(extDir, (handle) => firefoxExperiments(handle, variant));
    results.firefox.browserVersion = run.browserVersion;
    results.firefox.variants[variant] = run;
    console.log(`Firefox ${run.browserVersion ?? ''} / ${variant}: ${run.loadError ? `رفض التحميل: ${run.loadError}` : 'تمت التجارب'}`);
  }
}

// ---------- التشغيل ----------

const args = process.argv.slice(2);
const renderOnlyIndex = args.indexOf('--render-only');
const renderOnly = renderOnlyIndex !== -1;
if (renderOnly) args.splice(renderOnlyIndex, 1);
const outIndex = args.indexOf('--out');
const outDir = path.resolve(outIndex === -1 ? path.join(ROOT, 'evidence/T-1.3') : args.splice(outIndex, 2)[1]);
const keys = args.length ? args : Object.keys(BROWSERS);
const unknown = keys.filter((k) => !BROWSERS[k]);
if (unknown.length) {
  console.error(`متصفح غير معروف: ${unknown.join(' ')} (المتاح: ${Object.keys(BROWSERS).join(' ')})`);
  process.exit(1);
}

const results = {};
for (const key of renderOnly ? [] : keys) {
  if (!fs.existsSync(BROWSERS[key].executable)) {
    results[key] = { label: BROWSERS[key].label, skipped: `غير مثبت: ${BROWSERS[key].executable}` };
    continue;
  }
  try {
    await (key === 'firefox' ? runFirefox(results) : runChromium(key, results));
  } catch (error) {
    results[key] = { ...(results[key] ?? { label: BROWSERS[key].label }), error: String(error?.stack ?? error) };
    console.error(`${BROWSERS[key].label}: ${error?.message ?? error}`);
  }
}
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, 'browser-results.json');
const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const merged = { date: new Date().toISOString().slice(0, 10), ...previous, ...results };
fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'browser-report.md'), renderReport(merged));
console.log(`كُتبت النتائج الخام والتقرير في ${path.relative(ROOT, outDir)}`);

// ---------- التقرير ----------

function renderReport(all) {
  const order = ['chrome', 'edge', 'brave', 'firefox'].filter((k) => all[k]);
  const yes = (v) => (v ? 'نعم' : 'لا');
  const cell = (v) => (v === undefined || v === null ? '—' : String(v).replace(/\|/g, '\\|').replace(/\n/g, ' '));
  const short = (v, n = 90) => cell(typeof v === 'string' ? (v.length > n ? `${v.slice(0, n)}…` : v) : JSON.stringify(v)?.slice(0, n));
  const lines = [
    '# تجارب المتصفحات الفعلية لـT-1.3 (`tests/core/storage/browser/run.mjs`)',
    '',
    `- التاريخ: ${all.date}. المتصفحات تباعًا بملف تعريف مؤقت لكل تشغيل؛ لا شبكة (طلبات github.com تُخدَم من العينة المحلية).`,
    '- الإضافة الاختبارية (لا تُشحن) تُبنى بـ`tests/core/storage/browser/build.mjs` وتستعمل طبقتي التخزين والإعدادات الحقيقيتين من `src/core`.',
    '- النتائج الخام: [`browser-results.json`](browser-results.json).',
    '',
    '## TEST-CORE-04 — بث تغيّر مفتاح وحدة بين السياقات (`AC-1.3`)',
    '',
    'السياقات: صفحتا إضافة (تبويبان) وسكربت محتوى فعلي على صفحة `https://github.com/octo/demo/pull/42` تُخدَم من `fixtures/pages/pr.html`. تُبدَّل `modules.a.enabled` من سياق فيُلاحَظ الأثر في الآخرين (حدث remote في الصفحة الأخرى وإزالة/إعادة حقن الوحدة في DOM سكربت المحتوى).',
    '',
    '| المتصفح | الإصدار | النتيجة | وصل الإيقاف للصفحة الثانية | أُزيلت الوحدة من سكربت المحتوى | وصل التفعيل للصفحة الأولى | أُعيد حقنها | تقارب بعد 10 تبديلات متناوبة | تبقى بعد إعادة التحميل | الوسيط صفحة←صفحة (مللي) | الوسيط صفحة←DOM المحتوى (مللي) |',
    '| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];
  for (const key of order) {
    const r = all[key];
    const c = r.variants?.baseline?.core04;
    if (!c) {
      lines.push(`| ${r.label} | ${cell(r.browserVersion)} | ${key === 'firefox' ? 'لم يُجرَ: الخطة تحصر TEST-CORE-04 في Chrome وEdge وBrave' : 'لم يُجرَ'} | — | — | — | — | — | — | — | — |`);
      continue;
    }
    lines.push(`| ${r.label} | ${cell(r.browserVersion)} | ${c.pass ? '**اجتاز**' : '**فشل**'} | ${yes(c.page2ReceivedRemoteOff)} | ${yes(c.contentScriptUnmounted && c.domClean)} | ${yes(c.page1ReceivedRemoteOn)} | ${yes(c.contentScriptRemounted)} | ${yes(c.consistentAfterToggles)} | ${yes(c.persistsAfterReload)} | ${cell(c.latencyMs?.pageToPageMedian)} | ${cell(c.latencyMs?.pageToContentDomMedian)} |`);
  }
  lines.push('', 'لم يُجرَ: اللوحة الجانبية (`sidePanel`) لأنها لا تُفتح دون فعل مستخدم فعلي (تغطيها `T-1.4` في `TEST-CORE-05` و`TEST-CORE-06`)؛ ونافذة ثانية منفصلة (تشترك التبويبات في ملف التعريف ومسار البث نفسه).', '');

  lines.push(
    '## HYP-06 — هل تُطلب `unlimitedStorage` وقت التشغيل؟ (`TEST-STORAGE-02`)',
    '',
    'ثلاثة متغيرات للمانيفست: **baseline** (`storage` وحدها) و**optional** (`unlimitedStorage` و`alarms` الشاهد في `optional_permissions`) و**declared** (`unlimitedStorage` في `permissions`). الطلب يجري داخل معالج نقر فعلي (`activation` تعني `navigator.userActivation.isActive` وقت النقر)؛ والشاهد `alarms` يُطلب بالمسار نفسه ليثبت أن فعل المستخدم وصل.',
    '',
    '| المتصفح | تحميل المتغير optional | طلب `unlimitedStorage` | الشاهد `alarms` | الحصة بلا إعلان (baseline) | خطأ تجاوز الحصة | الدفعة المتجاوزة ذرّية؟ | بعد الطلب المحاوَل | إعلانها أساسية (declared) |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
  );
  for (const key of order) {
    const r = all[key];
    const base = r.variants?.baseline;
    const opt = r.variants?.optional;
    const dec = r.variants?.declared;
    if (!base) {
      lines.push(`| ${r.label} | لم يُجرَ | — | — | — | — | — | — | — |`);
      continue;
    }
    const load = key === 'firefox' ? (opt?.manifestMessages?.warnings?.length ? 'تحذير مانيفست: غير مسموحة اختيارية' : 'بلا تحذير') : opt?.loadInfo?.manifestErrors?.length || opt?.loadInfo?.installWarnings?.length ? 'أخطاء/تحذيرات' : 'يُقبل بلا خطأ ولا تحذير';
    const request = opt?.request ? (opt.request.granted ? `مُنحت (activation=${opt.request.activation})` : `رُفضت (activation=${opt.request.activation}): ${short(opt.request.error, 70)}`) : '—';
    const control = opt?.requestControl ? (opt.requestControl.granted ? `مُنحت (activation=${opt.requestControl.activation})` : `رُفضت: ${short(opt.requestControl.error, 50)}`) : '—';
    const quotaBytes = base.probe?.quotaBytes;
    const q = base.quota;
    const over = typeof q?.batchOverQuota === 'object' ? `${q.batchOverQuota.name}: ${q.batchOverQuota.message}` : q?.batchOverQuota === 'نجحت' ? 'لا خطأ (نجحت الكتابة)' : '—';
    const atomic = typeof q?.batchOverQuota === 'object' ? yes(q.keysAfterBatch.length === 0 && q.keepIntact && !q.overflowWritten) : 'لا ينطبق (لم يُرفض شيء)';
    const capped = typeof q?.batchOverQuota === 'object';
    const after = !capped ? 'لا سقف أصلًا' : opt?.quotaAfterRequest ? (typeof opt.quotaAfterRequest.batchOverQuota === 'object' ? 'الحصة كما هي (تجاوزها ما زال يفشل)' : 'رُفع السقف') : '—';
    const declared = dec?.quota ? (dec.quota.batchOverQuota === 'نجحت' ? (capped ? 'رُفع السقف (نجحت 12 ميغابايت)' : 'نجحت 12 ميغابايت (لا سقف في baseline أيضًا)') : 'ما زال يفشل') : '—';
    lines.push(`| ${r.label} ${cell(r.browserVersion)} | ${load} | ${request} | ${control} | ${quotaBytes ? `${quotaBytes} بايت` : 'بلا QUOTA_BYTES'} | ${short(over, 80)} | ${atomic} | ${after} | ${declared} |`);
  }
  if (all.firefox?.variants?.optional?.requestControl?.error) lines.push('', 'ملاحظة Firefox: الشاهد `alarms` ليس صلاحية اختيارية في Firefox أيضًا (يرفضه بخطأ نوع)، فلا يصلح شاهدًا هناك؛ ورفض `unlimitedStorage` ثابت بتحذير المانيفست وبخطأ النوع ذاته مع `activation=true`.');
  const ff = all.firefox?.variants?.baseline?.quotaLarge;
  if (ff) lines.push('', `Firefox بلا إعلان: كُتبت دفعة بحجم 96 ميغابايت (${ff.bytesAfterBatch} بايت محفوظة) ${ff.batchOverQuota === 'نجحت' ? 'بلا خطأ؛ فلا سقف ظاهرًا في المدى المقيس' : 'وفشلت'}، والمقيس لا يثبت غياب كل سقف (قد يحدّه القرص).`);

  lines.push(
    '',
    '**الحكم على HYP-06:** دُحضت في المتصفحات الأربعة المقيسة. لا تُطلب `unlimitedStorage` وقت التشغيل في أي منها؛ في عائلة Chromium تُرفع الحصة (10 ميغابايت) بإعلانها أساسية فقط، وFirefox لا يُظهر سقفًا في المدى المقيس. لذا لا يعرض الخطأ الصادر عن الطبقة علاج «اطلب التخزين غير المحدود»، ويبقى علاجه التصدير (`src/core/storage/capabilities.ts`).',
    '',
    '## طبقة `Store` الحقيقية فوق `storage.local` الحقيقية (`TEST-STORAGE-02`، الجزء الفعلي)',
    '',
    'كتابة سجل بحجم 12 ميغابايت ثم استيراد سجل بالحجم نفسه، والمتوقع: خطأ `StorageQuotaError` مفهوم، والبيانات السابقة سليمة، ولا يبقى سجل عملية.',
    '',
    '| المتصفح | الكتابة المتجاوزة | بيانات ما قبلها | الاستيراد المتجاوز | بيانات ما قبله | سجل عملية متبقٍّ | التصدير يعمل |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :---: |',
  );
  for (const key of order) {
    const r = all[key];
    const l = r.variants?.baseline?.layerQuota;
    if (!l) {
      lines.push(`| ${r.label} | لم يُجرَ | — | — | — | — | — |`);
      continue;
    }
    const w = typeof l.overQuotaWrite === 'object' ? `\`${l.overQuotaWrite.code}\` (المرحلة ${l.overQuotaWrite.details?.phase}؛ العلاج ${l.overQuotaWrite.details?.remedies?.join('+')}؛ السبب «${l.overQuotaWrite.causeMessage}»)` : 'لا خطأ: لا سقف في هذا المتصفح (نجحت الكتابة)';
    const i = typeof l.overQuotaImport === 'object' ? `\`${l.overQuotaImport.code}\` (المرحلة ${l.overQuotaImport.details?.phase})` : 'لا خطأ: لا سقف (نجح الاستيراد)';
    const kept = (v, ok) => (typeof ok === 'object' ? v : 'لا ينطبق');
    lines.push(`| ${r.label} | ${w} | ${kept(l.notesAfterWrite, l.overQuotaWrite)} | ${i} | ${kept(l.notesAfterImport, l.overQuotaImport)} | ${l.leftoverJournal?.length ? 'نعم' : 'لا'} | ${yes(l.exportStillWorks)} |`);
  }
  lines.push('');
  return lines.join('\n');
}

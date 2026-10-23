#!/usr/bin/env node
// TEST-SEC-01 وTEST-SEC-03 وتدقيق الشبكة لـAC-D7 في المتصفحات الحقيقية على الحزمة المشحونة نفسها (dist/<target> من npm run build).
// لا شبكة خارجية: github.com وapi.github.com يُخدمان محليًا (Playwright route في عائلة Chromium، وخادم HTTPS ووكيل في Firefox)،
// والرمز مختلَق بصيغة حقيقية يُولَّد وقت التشغيل ولا يُكتب في أي دليل (يُفحص الناتج قبل حفظه).
//   0. فحص ساكن: شيفرة الرمز (مفتاح الجلسة وقاعدة IndexedDB وترويسة Authorization) في background.js وoptions.js وحدهما.
//   1. قسم الرمز في الإعدادات: القائمة الدنيا Read-only الست، والقرص متاح في Chromium ومحجوب بقيده في Firefox.
//   2. الحفظ في الجلسة ثم التحقق: /rate_limit بالرمز من الخلفية؛ ولا رمز في DOM الإعدادات بعد الحفظ.
//   3. من عالم سكربت المحتوى (ملفات مسبار تُنفَّذ فيه بـscripting.executeScript): الجلسة غير مقروءة، وstorage.local وIndexedDB بلا رمز،
//      وأحداث storage.onChanged ورسائل runtime.onMessage التي وصلته بلا رمز، وDOM الصفحة وجذور الظل بلا رمز.
//   4. بطاقة طلب الدمج بالرمز: المصدر «DOM + API (بالرمز)»، وكل طلبات api.github.com من الخلفية بالرمز ولا شيء من الصفحة.
//   5. (Chromium) الحفظ على القرص: في IndexedDB الإضافة وحدها لا في الجلسة؛ وسكربت المحتوى لا يجده.
//   6. المسح: الموضعان فارغان، والطلب التالي بلا Authorization، والبطاقة تعلن 404 بلا خطأ موقِف. 7. لا رمز في الكونسول.
// الإصدار المشتق: dist/<target> كما هو مع إضافة scripting وhttps://api.github.com/* إلى الصلاحيات (منح آلي) وثلاثة ملفات مسبار؛ والشيفرة
// المشحونة لا تتغير.
// الاستعمال: node tests/modules/d/token/browser/token-check.mjs [chrome edge brave firefox] [--out-dir evidence/T-5.5]
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../../../scripts/load-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.filter((a) => BROWSERS[a]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(read, timeoutMs = 10000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read().catch(() => null);
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}

// رمز مختلَق بصيغة حقيقية: github_pat_ + 22 + «_» + 59.
const TOKEN = ['github', 'pat', `11BROWSERMIJHARFAKE000_${'xFakeBrowserTokenOnly'.repeat(3).slice(0, 59)}`].join('_');
const TOKEN_RE = /github_pat_[A-Za-z0-9_]{20,}/;
const hasToken = (value) => TOKEN_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));

const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/d/token/fixtures/fixture-token-states.json'), 'utf8'));
const P = FIXTURE.privateRepo;
const PR_URL = `https://github.com/${P.owner}/${P.repo}/pull/${P.number}`;
const PR_PAGE = fs
  .readFileSync(path.join(ROOT, 'tests/modules/d/fixtures/fixture-pr-complex.html'), 'utf8')
  .replaceAll('octo/demo', `${P.owner}/${P.repo}`)
  .replaceAll('octo-dev/demo', `${P.owner}/${P.repo}`)
  .replaceAll('4242', String(P.number))
  .replaceAll('22c15d5f509f0a7076b74b3f0f48a740802103b4', P.headSha);
const STATUS_FRAGMENT = fs.readFileSync(path.join(ROOT, 'tests/modules/d/fixtures/fixture-status-details.html'), 'utf8');

/** ردّ api.github.com: بالرمز ردود العينة، وبرمز آخر 401، وبلا رمز 404 للمستودع الخاص و/rate_limit العام. */
function apiReply(pathAndQuery, authorization) {
  const ok = authorization === `Bearer ${TOKEN}`;
  if (authorization && !ok) return FIXTURE.states.invalid;
  if (pathAndQuery.startsWith('/rate_limit')) return ok ? FIXTURE.states.valid : { status: 200, headers: { 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '59', 'x-ratelimit-reset': '1792768532', 'x-ratelimit-resource': 'core' }, body: { rate: { limit: 60, remaining: 59 } } };
  if (!ok) return FIXTURE.states['not-found'];
  const r = P.responses[pathAndQuery];
  if (r === undefined) return FIXTURE.states['not-found'];
  return typeof r === 'string' ? FIXTURE.states[r] : r;
}

function githubReply(pathname) {
  if (pathname === `/${P.owner}/${P.repo}/pull/${P.number}`) return { status: 200, type: 'text/html; charset=utf-8', body: PR_PAGE };
  if (/\/status-details$/.test(pathname)) return { status: 200, type: 'text/html; charset=utf-8', body: STATUS_FRAGMENT };
  return { status: 404, type: 'text/plain', body: 'not found' };
}

// ---------- مسبار عالم سكربت المحتوى ----------

const PROBE_INSTALL = `(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  if (!globalThis.__mjProbe) {
    const p = (globalThis.__mjProbe = { changes: [], messages: [], read: null });
    api.storage.onChanged.addListener((changes, area) => p.changes.push({ area, json: JSON.stringify(changes) }));
    api.runtime.onMessage.addListener((m) => { p.messages.push(JSON.stringify(m)); return undefined; });
  }
  return 'installed';
})();`;

const PROBE_READ = `(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const p = (globalThis.__mjProbe ??= { changes: [], messages: [], read: null });
  p.read = null;
  (async () => {
    const out = { sessionType: typeof api.storage.session };
    try { out.session = api.storage.session ? JSON.stringify(await api.storage.session.get(null)) : null; } catch (e) { out.sessionError = String((e && e.message) || e); }
    try { out.local = JSON.stringify(await api.storage.local.get(null)); } catch (e) { out.localError = String((e && e.message) || e); }
    out.idb = await new Promise((resolve) => {
      let r;
      try { r = indexedDB.open('mijhar-secrets'); } catch (e) { resolve({ error: String(e) }); return; }
      r.onerror = () => resolve({ error: String(r.error) });
      r.onsuccess = () => {
        const db = r.result;
        const stores = [...db.objectStoreNames];
        if (!stores.includes('secrets')) { db.close(); resolve({ stores, origin: location.origin }); return; }
        const g = db.transaction('secrets').objectStore('secrets').get('githubToken');
        g.onsuccess = () => { resolve({ stores, origin: location.origin, json: JSON.stringify(g.result ?? null) }); db.close(); };
        g.onerror = () => resolve({ stores, error: String(g.error) });
      };
    });
    out.dom = document.documentElement.outerHTML + [...document.querySelectorAll('mijhar-host')].map((h) => (h.shadowRoot ? h.shadowRoot.innerHTML : '')).join('');
    p.read = out;
  })().catch((e) => { p.read = { error: String(e) }; });
  return 'started';
})();`;

const PROBE_RESULT = `JSON.stringify(globalThis.__mjProbe ?? null);`;

/** نسخة من dist/<target> بصلاحيات المنح الآلي وملفات المسبار. */
function derivedCopy(target) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-token-${target}-`));
  fs.cpSync(path.join(ROOT, 'dist', target), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.permissions = [...new Set([...(manifest.permissions ?? []), 'scripting'])];
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.github.com/*'])];
  delete manifest.optional_host_permissions;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(dir, 'mj-probe-install.js'), PROBE_INSTALL);
  fs.writeFileSync(path.join(dir, 'mj-probe-read.js'), PROBE_READ);
  fs.writeFileSync(path.join(dir, 'mj-probe-result.js'), PROBE_RESULT);
  return dir;
}

/** يُنفَّذ في صفحة الإعدادات: ملف مسبار في تبويب github.com، في عالم سكربت المحتوى. */
const RUN_PROBE = `
  const api = globalThis.browser ?? globalThis.chrome ?? (window.wrappedJSObject ?? window).browser;
  const tabs = await api.tabs.query({ url: 'https://github.com/*' });
  if (!tabs.length) return { noTab: true };
  const res = await api.scripting.executeScript({ target: { tabId: tabs[0].id }, files: [arguments[0]] });
  return res && res[0] ? res[0].result ?? null : null;
`;

/** يُنفَّذ في صفحة الإعدادات: ما في الجلسة وIndexedDB الإضافة الآن (وجود الرمز وحده، لا قيمته). */
const READ_EXTENSION_STORES = `
  const api = globalThis.browser ?? globalThis.chrome ?? (window.wrappedJSObject ?? window).browser;
  const session = await api.storage.session.get(null);
  const local = await api.storage.local.get(null);
  const idb = await new Promise((resolve) => {
    const r = indexedDB.open('mijhar-secrets');
    r.onerror = () => resolve({ error: String(r.error) });
    r.onsuccess = () => {
      const db = r.result;
      if (![...db.objectStoreNames].includes('secrets')) { db.close(); resolve({ present: false, stores: [] }); return; }
      const g = db.transaction('secrets').objectStore('secrets').get('githubToken');
      g.onsuccess = () => { resolve({ present: Boolean(g.result && g.result.token === arguments[0]), stores: ['secrets'] }); db.close(); };
    };
  });
  return {
    sessionHasToken: JSON.stringify(session).includes(arguments[0]),
    sessionKeys: Object.keys(session),
    localHasToken: JSON.stringify(local).includes(arguments[0]),
    idb,
  };
`;

const CARD = 'mijhar-host[data-mijhar-host="d.pr-status"]';

/** السيناريو المشترك بين المتصفحات فوق مشغّل d. */
async function scenario(d, target, checks, network) {
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 400)}`}`);
  };
  const apiBefore = () => network.api.length;

  // 1. قسم الرمز (بعد أن يقرأ حالة المخزن).
  await waitUntil(() => d.options(`const v = document.querySelector('[data-token-state]')?.getAttribute('data-token-state'); return v && v !== 'checking' ? v : null;`), 8000);
  const section = await d.options(`
    const s = document.querySelector('[data-section="token"]');
    if (!s) return null;
    return {
      perms: [...s.querySelectorAll('[data-permission]')].map((li) => [li.getAttribute('data-permission'), li.textContent.includes('Read-only')]),
      write: /Read and write|write|Admin/i.test(s.textContent),
      diskDisabled: s.querySelector('input[value="disk"]').disabled,
      diskNote: s.querySelector('[data-disk-note]').getAttribute('data-disk-note'),
      diskText: s.querySelector('[data-disk-note]').textContent,
      sessionChecked: s.querySelector('input[value="session"]').checked,
      state: s.querySelector('[data-token-state]').getAttribute('data-token-state'),
    };
  `);
  check('قسم الرمز في صفحة الإعدادات بقائمة Read-only الست ولا صلاحية كتابة', section?.perms?.length === 6 && section.perms.every(([, ro]) => ro) && !section.write, section);
  check('الافتراضي ذاكرة الجلسة ولا رمز محفوظ', section?.sessionChecked && section.state === 'none', section);
  if (target === 'firefox') check('Firefox: القرص محجوب ويُعلن قيد setAccessLevel', section?.diskDisabled && section.diskNote === 'blocked' && section.diskText.includes('setAccessLevel'), section);
  else check('Chromium: القرص متاح بنص «غير مشفَّر»', section && !section.diskDisabled && section.diskNote === 'available' && section.diskText.includes('غير مشفَّر'), section);

  // صفحة الطلب الخاص والمسبار في عالم سكربت المحتوى.
  await d.openGithub(PR_URL);
  const card = await waitUntil(() => d.github(`return Boolean(document.querySelector('${CARD}')?.shadowRoot?.querySelector('[data-section="api"]'));`), 15000);
  check('بطاقة طلب الدمج مركَّبة في صفحة github.com', card, card);
  const installed = await d.probe('mj-probe-install.js');
  check('المسبار مثبت في عالم سكربت المحتوى', installed === 'installed', installed);

  // 2. الحفظ في الجلسة.
  const rateBefore = apiBefore();
  await d.fill('#mj-token-input', TOKEN);
  await d.click('[data-action="token-save"]');
  const saved = await waitUntil(() => d.options(`return document.querySelector('[data-token-check]')?.getAttribute('data-token-check') ?? null;`), 10000);
  const afterSave = await d.options(`return { state: document.querySelector('[data-token-state]').getAttribute('data-token-state'), input: document.querySelector('#mj-token-input').value.length, check: document.querySelector('[data-token-check]')?.textContent ?? '', html: document.documentElement.outerHTML };`);
  check('الحفظ في الجلسة ثم التحقق: قبِل GitHub الرمز (5000)', saved === 'ok' && afterSave.state === 'session' && afterSave.check.includes('5000'), { saved, state: afterSave?.state, check: afterSave?.check });
  check('بعد الحفظ: الحقل فارغ ولا رمز في DOM صفحة الإعدادات', afterSave.input === 0 && !hasToken(afterSave.html), { input: afterSave.input });
  const rateCalls = network.api.slice(rateBefore);
  check('التحقق /rate_limit من الخلفية بالرمز', rateCalls.length >= 1 && rateCalls.every((c) => c.from === 'background' && c.bearer === true && c.method === 'GET'), rateCalls);
  const stores1 = await d.options(READ_EXTENSION_STORES, [TOKEN]);
  check('الرمز في ذاكرة الجلسة وحدها: لا في storage.local ولا في IndexedDB', stores1.sessionHasToken && !stores1.localHasToken && !stores1.idb.present, stores1);

  // 3. عالم سكربت المحتوى.
  await d.probe('mj-probe-read.js');
  const probe1 = await waitUntil(async () => {
    const raw = await d.probe('mj-probe-result.js');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.read ? parsed : null;
  }, 8000);
  const r1 = probe1?.read ?? {};
  const sessionBlocked = target === 'firefox' ? r1.sessionType === 'undefined' : Boolean(r1.sessionError) && r1.session === undefined;
  check('سكربت المحتوى لا يقرأ storage.session', sessionBlocked, { sessionType: r1.sessionType, sessionError: r1.sessionError, sessionHasToken: hasToken(r1.session) });
  check('سكربت المحتوى: storage.local بلا رمز', r1.local !== undefined && !hasToken(r1.local), { localError: r1.localError, hasToken: hasToken(r1.local) });
  check('سكربت المحتوى: IndexedDB في عالمه لأصل الصفحة وبلا رمز', !hasToken(r1.idb) && !(r1.idb?.stores ?? []).includes('secrets'), { origin: r1.idb?.origin, stores: r1.idb?.stores });
  check('أحداث storage.onChanged ورسائل runtime.onMessage التي وصلت سكربت المحتوى بلا رمز', probe1 && !hasToken(probe1.changes) && !hasToken(probe1.messages), { changes: probe1?.changes?.map((c) => c.area), messages: probe1?.messages?.length });
  check('DOM صفحة GitHub وجذور الظل بلا رمز', r1.dom && !hasToken(r1.dom), { length: r1.dom?.length });

  // 4. البطاقة بالرمز.
  const cardBefore = apiBefore();
  await d.github(`document.querySelector('${CARD}').shadowRoot.querySelector('[data-action="api-read"]').click(); return true;`);
  const source = await waitUntil(() => d.github(`const s = document.querySelector('${CARD}')?.shadowRoot?.querySelector('[data-source]')?.getAttribute('data-source'); return s === 'DOM + API (بالرمز)' ? s : null;`), 12000);
  const cardText = await d.github(`const r = document.querySelector('${CARD}')?.shadowRoot; return { via: Boolean(r?.querySelector('[data-api-via="actions"]')), text: r?.textContent ?? '' };`);
  check('البطاقة: المصدر «DOM + API (بالرمز)» وفحوص Actions للمستودع الخاص بمصدرها', source && cardText.via && cardText.text.includes('الخطوة 3: Run npm run lint'), { source, via: cardText.via });
  const auth = await d.github(`return Boolean(document.querySelector('${CARD}')?.shadowRoot?.querySelector('[data-api-auth="token"]'));`);
  check('لوحة API في البطاقة تعلن القراءة بالرمز (من حالة الخلفية، بلا الرمز)', auth, auth);
  const cardCalls = network.api.slice(cardBefore);
  check('كل طلبات البطاقة إلى api.github.com من الخلفية بالرمز وبـGET، ولا شيء من الصفحة', cardCalls.length >= 5 && cardCalls.every((c) => c.from === 'background' && c.bearer && c.method === 'GET'), cardCalls);
  check('مسارات القراءة وحدها (لا كتابة)', cardCalls.every((c) => /^\/repos\/[^/]+\/[^/]+\/(pulls\/\d+|commits\/[0-9a-f]+\/(check-runs|status)|branches\/[^/]+|actions\/runs(\?|\/\d+\/jobs))/.test(c.path)), cardCalls.map((c) => c.path));
  await d.probe('mj-probe-read.js');
  const probe2 = await waitUntil(async () => {
    const raw = await d.probe('mj-probe-result.js');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.read ? parsed : null;
  }, 8000);
  check('بعد قراءة البطاقة: DOM الصفحة وما وصل سكربت المحتوى بلا رمز', probe2 && !hasToken(probe2.read.dom) && !hasToken(probe2.changes) && !hasToken(probe2.messages), { length: probe2?.read?.dom?.length });

  // 5. القرص (Chromium).
  if (target !== 'firefox') {
    await d.click('input[value="disk"]');
    await d.fill('#mj-token-input', TOKEN);
    await d.click('[data-action="token-save"]');
    const disk = await waitUntil(() => d.options(`return document.querySelector('[data-token-state]')?.getAttribute('data-token-state') === 'disk' ? true : null;`), 8000);
    const stores2 = await d.options(READ_EXTENSION_STORES, [TOKEN]);
    check('الحفظ على القرص: في IndexedDB الإضافة وحدها، لا في الجلسة ولا storage.local', disk && stores2.idb.present && !stores2.sessionHasToken && !stores2.localHasToken, stores2);
    await d.probe('mj-probe-read.js');
    const probe3 = await waitUntil(async () => {
      const raw = await d.probe('mj-probe-result.js');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.read ? parsed : null;
    }, 8000);
    check('سكربت المحتوى لا يجد رمز القرص (IndexedDB عالمه لأصل الصفحة)', probe3 && !hasToken(probe3.read.idb) && !hasToken(probe3.read.local) && probe3.read.idb?.origin === 'https://github.com', { origin: probe3?.read?.idb?.origin, stores: probe3?.read?.idb?.stores });
  }

  // 6. المسح.
  await d.click('[data-action="token-clear"]');
  const cleared = await waitUntil(() => d.options(`return document.querySelector('[data-token-state]')?.getAttribute('data-token-state') === 'none' ? true : null;`), 8000);
  const stores3 = await d.options(READ_EXTENSION_STORES, [TOKEN]);
  check('المسح يمحوه من الجلسة والقرص', cleared && !stores3.sessionHasToken && !stores3.idb.present && !stores3.localHasToken, stores3);
  await d.openGithub(PR_URL);
  const card2 = await waitUntil(() => d.github(`return Boolean(document.querySelector('${CARD}')?.shadowRoot?.querySelector('[data-action="api-read"]'));`), 15000);
  const afterClear = apiBefore();
  if (card2) await d.github(`document.querySelector('${CARD}').shadowRoot.querySelector('[data-action="api-read"]').click(); return true;`);
  const error404 = await waitUntil(() => d.github(`const e = document.querySelector('${CARD}')?.shadowRoot?.querySelector('[data-api-error="pull"]'); return e ? e.textContent : null;`), 12000);
  const sourceAfter = await d.github(`return document.querySelector('${CARD}')?.shadowRoot?.querySelector('[data-source]')?.getAttribute('data-source') ?? null;`);
  const clearCalls = network.api.slice(afterClear);
  check('بعد المسح: الطلب بلا Authorization، والبطاقة تعمل على الصفحة وتعلن 404 بلا خطأ موقِف', card2 && clearCalls.length >= 1 && clearCalls.every((c) => !c.authorization) && String(error404).includes('404') && sourceAfter === 'DOM', { calls: clearCalls, error404, sourceAfter });
}

// ---------- عائلة Chromium ----------

async function chromiumRun(key) {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-token-profile-'));
  const extDir = derivedCopy('chromium');
  const context = await chromium.launchPersistentContext(profileDir, { executablePath: executable, headless: true, viewport: { width: 1280, height: 900 }, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
  const checks = [];
  const network = { api: [], blocked: new Set() };
  const consoleText = [];
  const result = { label, browserVersion: context.browser().version(), checks };
  try {
    await context.route('https://github.com/**', (route) => {
      const r = githubReply(new URL(route.request().url()).pathname);
      return route.fulfill({ status: r.status, contentType: r.type, body: r.body });
    });
    await context.route('https://api.github.com/**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const authorization = request.headers().authorization ?? null;
      const pathAndQuery = url.pathname + url.search;
      network.api.push({ method: request.method(), path: pathAndQuery, from: request.serviceWorker() ? 'background' : 'page', authorization: Boolean(authorization), bearer: authorization === `Bearer ${TOKEN}` });
      const r = apiReply(pathAndQuery, authorization);
      return route.fulfill({ status: r.status, contentType: 'application/json', headers: r.headers ?? {}, body: JSON.stringify(r.body ?? {}) });
    });
    await context.route((url) => url.protocol === 'https:' && !['github.com', 'api.github.com'].includes(url.host), (route) => {
      network.blocked.add(new URL(route.request().url()).host);
      return route.abort();
    });
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: extDir });
    const origin = `chrome-extension://${id}`;
    const watch = (page, name) => page.on('console', (m) => consoleText.push(`${name}: ${m.text()}`));
    const sw = await waitUntil(async () => context.serviceWorkers().find((w) => w.url().startsWith(origin)) ?? null, 8000);
    sw?.on('console', (m) => consoleText.push(`background: ${m.text()}`));
    const options = await context.newPage();
    watch(options, 'options');
    await options.goto(`${origin}/options.html`);
    await options.waitForSelector('#app[data-ready="true"]');
    const github = await context.newPage();
    watch(github, 'github');
    // تعبير نصي يُقيَّم عبر CDP (لا eval داخل الصفحة، فلا تمنعه CSP صفحات الإضافة).
    const expression = (code, a = []) => `(async function () { ${code} }).apply(null, ${JSON.stringify(a)})`;
    const d = {
      options: (code, a = []) => options.evaluate(expression(code, a)),
      github: (code) => github.evaluate(expression(code)),
      async openGithub(url) {
        await github.goto(url);
      },
      async probe(file) {
        return d.options(RUN_PROBE, [file]);
      },
      fill: (selector, text) => options.fill(selector, text),
      click: (selector) => options.click(selector),
    };
    await scenario(d, 'chromium', checks, network);
    const devtools = await context.newPage();
    await devtools.goto('chrome://extensions');
    const info = await devtools.evaluate((extId) => chrome.developerPrivate.getExtensionInfo(extId), id);
    result.extensionErrors = { runtime: (info.runtimeErrors ?? []).map((e) => e.message), manifest: (info.manifestErrors ?? []).map((e) => e.message) };
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = { api: network.api, blockedExternalHosts: [...network.blocked].sort() };
    result.consoleHasToken = hasToken(consoleText.join('\n'));
    result.consoleLines = consoleText.length;
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
    fs.rmSync(extDir, { recursive: true, force: true });
  }
  return result;
}

// ---------- Firefox: Marionette خلف خادم HTTPS ووكيل محليين (نمط tests/modules/browser/integration.mjs) ----------

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
      const text = pending.subarray(start, start + length).toString('utf8');
      pending = pending.subarray(start + length);
      waiters.shift()?.(JSON.parse(text));
    }
  });
  const next = () => new Promise((resolve) => waiters.push(resolve));
  return {
    handshake: next,
    async send(name, params = {}) {
      const message = JSON.stringify([0, ++id, name, params]);
      socket.write(`${Buffer.byteLength(message)}:${message}`);
      const [, , error, value] = await next();
      if (error) throw new Error(`${name}: ${error.error ?? ''} ${error.message ?? ''}`.trim());
      return value;
    },
  };
}

function makeCertificates(workDir) {
  const file = (name) => path.join(workDir, name);
  const openssl = (...a) => execFileSync('openssl', a, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-mj15-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('key.pem'), '-out', file('leaf.csr'), '-subj', '/CN=github.com');
  fs.writeFileSync(file('leaf.ext'), 'subjectAltName=DNS:github.com,DNS:api.github.com\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  openssl('x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-out', file('cert.pem'), '-days', '1', '-extfile', file('leaf.ext'));
  const caDer = fs.readFileSync(file('ca.pem'), 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return { key: fs.readFileSync(file('key.pem')), cert: fs.readFileSync(file('cert.pem')), caDer };
}

async function startServers(workDir, network) {
  const { key, cert, caDer } = makeCertificates(workDir);
  const site = https.createServer({ key, cert }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const url = new URL(req.url, `https://${host}`);
    if (host === 'api.github.com') {
      const authorization = req.headers.authorization ?? null;
      const requestOrigin = req.headers.origin ?? null;
      // طلب الصفحة أو سكربت المحتوى عابر للأصل فيحمل Origin: https://github.com؛ وطلب سياق الإضافة المميَّز (صفحة الخلفية) بلا Origin
      // أو بأصل moz-extension://. ولا تطلب صفحة الإعدادات api.github.com بنفسها (تراسل الخلفية)، فالمميَّز هنا الخلفية.
      network.api.push({ method: req.method, path: url.pathname + url.search, from: requestOrigin === null || requestOrigin.startsWith('moz-extension://') ? 'background' : 'page', origin: requestOrigin, authorization: Boolean(authorization), bearer: authorization === `Bearer ${TOKEN}` });
      const r = apiReply(url.pathname + url.search, authorization);
      res.writeHead(r.status, { 'content-type': 'application/json', ...(r.headers ?? {}) });
      res.end(JSON.stringify(r.body ?? {}));
      return;
    }
    const r = githubReply(url.pathname);
    res.writeHead(r.status, { 'content-type': r.type });
    res.end(r.body);
  });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const sitePort = site.address().port;
  const proxy = http.createServer((req, res) => {
    network.blocked.add(`http ${req.url}`);
    res.writeHead(403);
    res.end();
  });
  proxy.on('connect', (req, client, head) => {
    const host = req.url.split(':')[0];
    if (host !== 'github.com' && host !== 'api.github.com') {
      network.blocked.add(host);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = net.connect(sitePort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  return { caDer, proxyPort: proxy.address().port, close: () => Promise.all([new Promise((r) => site.close(r)), new Promise((r) => proxy.close(r))]) };
}

const firefoxPrefs = (proxyPort) =>
  [
    ['marionette.port', 0],
    ['network.proxy.type', 1],
    ['network.proxy.http', '127.0.0.1'],
    ['network.proxy.http_port', proxyPort],
    ['network.proxy.ssl', '127.0.0.1'],
    ['network.proxy.ssl_port', proxyPort],
    ['network.proxy.no_proxies_on', ''],
    ['network.proxy.allow_hijacking_localhost', true],
    ['network.stricttransportsecurity.preloadlist', false],
    ['network.dns.disablePrefetch', true],
    ['browser.shell.checkDefaultBrowser', false],
    ['datareporting.policy.dataSubmissionEnabled', false],
    ['toolkit.telemetry.reportingpolicy.firstRun', false],
    ['extensions.webextOptionalPermissionPrompts', false],
  ]
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join('\n');

async function firefoxRun() {
  const { executable } = BROWSERS.firefox;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-token-ff-'));
  const profileDir = path.join(workDir, 'profile');
  fs.mkdirSync(profileDir);
  const network = { api: [], blocked: new Set() };
  const servers = await startServers(workDir, network);
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${firefoxPrefs(servers.proxyPort)}\n`);
  const extDir = derivedCopy('firefox');
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const checks = [];
  const result = { label: 'Firefox', checks };
  let socket;
  let consoleText = '';
  try {
    const portFile = path.join(profileDir, 'MarionetteActivePort');
    const port = await waitUntil(async () => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8')), 20000, 100);
    if (!port) throw new Error('لم يفتح Firefox منفذ Marionette');
    socket = net.connect(port, '127.0.0.1');
    const c = marionette(socket);
    await c.handshake();
    const { capabilities } = await c.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
    result.browserVersion = capabilities.browserVersion;
    const { value: id } = await c.send('Addon:Install', { path: extDir, temporary: true });
    let context = 'content';
    const setContext = async (value) => {
      if (context === value) return;
      await c.send('Marionette:SetContext', { value });
      context = value;
    };
    const chromeScript = async (script, a = []) => {
      await setContext('chrome');
      return (await c.send('WebDriver:ExecuteScript', { script, args: a })).value;
    };
    await chromeScript(`Cc['@mozilla.org/security/x509certdb;1'].getService(Ci.nsIX509CertDB).addCertFromBase64(arguments[0], 'C,,'); return true;`, [servers.caDer]);
    const host = await chromeScript('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [id]);
    const origin = `moz-extension://${host}`;
    const handles = {};
    const switchTo = async (name) => {
      await setContext('content');
      await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
    };
    const openTab = async (name, url) => {
      await setContext('content');
      if (!handles[name]) {
        const { handle } = await c.send('WebDriver:NewWindow', { type: 'tab' });
        handles[name] = handle;
      }
      await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
      await c.send('WebDriver:Navigate', { url });
    };
    // سكربت غير متزامن في الصفحة الحالية: الجسم دالة async تُعيد قيمة قابلة للتسلسل؛ والوصول إلى واجهات الصفحة عبر wrappedJSObject.
    const runAsync = async (code, a = []) => {
      await setContext('content');
      const script = `const done = arguments[arguments.length - 1]; const window_ = window; const globalThis_ = window.wrappedJSObject ?? window; (async function () { const window = window_; const document = window_.document; const indexedDB = globalThis_.indexedDB; const location = window_.location; ${code} }).apply(null, Array.prototype.slice.call(arguments, 0, -1)).then((v) => done(v === undefined ? null : JSON.parse(JSON.stringify(v))), (e) => done({ thrown: String(e) }));`;
      return (await c.send('WebDriver:ExecuteAsyncScript', { script, args: a })).value;
    };
    await openTab('options', `${origin}/options.html`);
    await waitUntil(async () => (await runAsync(`return document.querySelector('#app')?.getAttribute('data-ready');`)) === 'true', 10000);
    const element = async (selector) => {
      const { value } = await c.send('WebDriver:FindElement', { using: 'css selector', value: selector });
      return value['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(value)[0];
    };
    const d = {
      async options(code, a = []) {
        await switchTo('options');
        return runAsync(code, a);
      },
      async github(code) {
        await switchTo('github');
        return runAsync(code);
      },
      async openGithub(url) {
        await openTab('github', url);
      },
      async probe(file) {
        await switchTo('options');
        return runAsync(RUN_PROBE, [file]);
      },
      async fill(selector, text) {
        await switchTo('options');
        const el = await element(selector);
        await c.send('WebDriver:ElementClear', { id: el });
        await c.send('WebDriver:ElementSendKeys', { id: el, text });
      },
      async click(selector) {
        await switchTo('options');
        await c.send('WebDriver:ElementClick', { id: await element(selector) });
        await sleep(200);
      },
    };
    await scenario(d, 'firefox', checks, network);
    consoleText = (await chromeScript(`return Services.console.getMessageArray().map((m) => m.message ?? (m.errorMessage ? m.errorMessage + ' @ ' + m.sourceName : String(m)));`)).join('\n');
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = { api: network.api, blockedExternalHosts: [...network.blocked].sort() };
    result.consoleHasToken = hasToken(consoleText);
    socket?.destroy();
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(10000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited;
    await servers.close();
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.rmSync(extDir, { recursive: true, force: true });
  }
  return result;
}

// ---------- الفحص الساكن والتشغيل ----------

function staticCheck() {
  const rows = [];
  const markers = ['mijhar.secret.githubToken', 'mijhar-secrets', 'Authorization', 'Bearer '];
  for (const target of ['chromium', 'firefox']) {
    for (const file of ['background', 'options', 'content', 'sidepanel', 'reader']) {
      const text = fs.readFileSync(path.join(ROOT, 'dist', target, `${file}.js`), 'utf8');
      rows.push({ target, file, found: markers.filter((m) => text.includes(m)) });
    }
  }
  const leaks = rows.filter((r) => ['content', 'sidepanel', 'reader'].includes(r.file) && r.found.length);
  const owners = rows.filter((r) => r.file === 'background' && r.found.length === markers.length);
  return { rows, ok: leaks.length === 0 && owners.length === 2 };
}

const results = { static: staticCheck() };
console.log(`${results.static.ok ? '✓' : '✗'} فحص ساكن: شيفرة الرمز في background.js وoptions.js وحدهما`);
const all = [{ name: 'فحص ساكن', ok: results.static.ok }];
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox']) {
  console.log(`— ${BROWSERS[key].label}`);
  const r = key === 'firefox' ? await firefoxRun() : await chromiumRun(key);
  const add = (name, ok, detail) => {
    r.checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    if (!ok) console.log(`  ✗ ${name} — ${JSON.stringify(detail)?.slice(0, 400)}`);
  };
  add('اكتمل التشغيل بلا خطأ', !r.error, r.error?.split('\n').slice(0, 3).join(' | '));
  add('لا رمز في الكونسول (الصفحة والإعدادات والخلفية)', r.consoleHasToken === false, r.consoleHasToken);
  add('لا طلب إلى api.github.com من الصفحة أو سكربت المحتوى', (r.network?.api ?? []).every((c) => c.from === 'background'), r.network?.api?.filter((c) => c.from !== 'background'));
  if (r.extensionErrors) add('لا أخطاء تشغيل ولا مانيفست للإضافة', r.extensionErrors.runtime.length === 0 && r.extensionErrors.manifest.length === 0, r.extensionErrors);
  results[key] = r;
  const bad = r.checks.filter((c) => !c.ok).length;
  console.log(`${r.label} ${r.browserVersion ?? ''}: ${r.checks.length - bad}/${r.checks.length}`);
  all.push(...r.checks);
}
const serialized = `${JSON.stringify(results, null, 2)}\n`;
if (hasToken(serialized)) {
  console.error('✗ الناتج يحمل الرمز: لا يُحفظ');
  process.exitCode = 1;
} else if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'browser-token-check.json'), serialized);
}
console.log(`المجموع: ${all.filter((c) => c.ok).length}/${all.length}`);
if (all.some((c) => !c.ok)) process.exitCode = 1;

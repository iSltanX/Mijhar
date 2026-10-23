#!/usr/bin/env node
// فحص تكامل الموجة C على الحزمة المشحونة نفسها (dist/chromium وdist/firefox من npm run build)، لا على حزمة اختبار:
// بعد الدمج صار سكربت المحتوى الحقيقي (MJ5) يركّب BUILTIN_MODULES، وفيها الوحدة (أ) الحقيقية (MJ6). لم يختبر أي فرع هذا وحده:
// تجارب MJ5 بثماني وحدات وهمية، وقياس MJ6 بحزمة تحقن الوحدة في الصفحة.
//  1. عينة README المختلطة (fixture-mixed-rtl-readme.html) بدل github.com/octo/mijhar-demo: الوحدة تقلب كتل data-expect="rtl"
//     وحدها، والاتجاه المحسوب rtl، بافتراضيات الإعدادات (لا ربط لـdefineModuleASettings بعد).
//  2. مفتاح «(أ)» من صفحة الإعدادات (MJ5) يوقف الوحدة: لا سمة ولا ورقة أنماط، و<main> يطابق تحليل العينة الخام حرفيًا؛
//     ثم يعيدها.
//  3. الدرج يُفتح بالرسالة فوق الوحدة المركّبة، ولا تمس الوحدة مضيفه.
//  4. العينة نفسها بـCSP style-src 'self': أثر سياسة الصفحة على ورقة <style> التي تضيفها الوحدة.
//  5. تدقيق الشبكة: صفر طلبات إلى api.github.com، ولا مضيف آخر.
// الاستعمال: node evidence/wave-C/integration-check.mjs [chrome edge brave firefox] ← evidence/wave-C/integration.json
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../scripts/load-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(read, timeoutMs = 5000, stepMs = 50) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}

const README = 'tests/modules/a/direction/fixtures/fixture-mixed-rtl-readme.html';
const PAGES = {
  '/octo/mijhar-demo': { file: README },
  '/octo/mijhar-demo-csp': { file: README, csp: "style-src 'self'" },
  '/octo/hostile/pull/1': { file: 'fixtures/adversarial/hostile-pr.html', csp: "style-src 'self'" },
  '/assets/hostile.css': { file: 'fixtures/adversarial/hostile.css', type: 'text/css; charset=utf-8' },
};
const README_URL = 'https://github.com/octo/mijhar-demo';
const CSP_URL = 'https://github.com/octo/mijhar-demo-csp';
const HOSTILE_URL = 'https://github.com/octo/hostile/pull/1';
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const RAW_README = read(README);

// ---------- مجسّات في عالم الصفحة ----------

function directionState() {
  const cases = [...document.querySelectorAll('[data-expect]')];
  const wrong = [];
  let rtlOk = 0;
  for (const el of cases) {
    const attr = el.getAttribute('data-mijhar-dir');
    const computed = getComputedStyle(el).direction;
    if (el.getAttribute('data-expect') === 'rtl') {
      if (attr === 'rtl' && computed === 'rtl') rtlOk += 1;
      else wrong.push(`${el.getAttribute('data-case')}: attr=${attr} computed=${computed}`);
    } else if (attr !== null) wrong.push(`${el.getAttribute('data-case')}: keep لكن attr=${attr}`);
  }
  const drawer = document.querySelector('mijhar-host[data-mijhar-host="drawer"]');
  return {
    cases: cases.length,
    expectRtl: cases.filter((el) => el.getAttribute('data-expect') === 'rtl').length,
    rtlOk,
    flippedAttr: document.querySelectorAll('[data-mijhar-dir]').length,
    origAttr: document.querySelectorAll('[data-mijhar-orig-dir]').length,
    styles: Boolean(document.getElementById('mijhar-reading-styles')),
    wrong,
    drawer: drawer ? { open: drawer.hasAttribute('data-open'), touched: drawer.hasAttribute('data-mijhar-dir') || drawer.hasAttribute('data-mijhar-orig-dir') } : null,
  };
}

function mainMatches(raw) {
  const original = new DOMParser().parseFromString(raw, 'text/html').querySelector('main').outerHTML;
  const live = document.querySelector('main').outerHTML;
  if (original === live) return { equal: true };
  let i = 0;
  while (i < original.length && original[i] === live[i]) i += 1;
  return { equal: false, at: i, original: original.slice(Math.max(0, i - 80), i + 80), live: live.slice(Math.max(0, i - 80), i + 80) };
}

const settled = (s) => s && s.flippedAttr > 0 && s.styles;

// ---------- عائلة Chromium ----------

async function chromiumRun(key) {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-wave-c-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executable,
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const result = { label, steps: {}, console: [] };
  const network = { apiGithub: [], other: [] };
  try {
    const browser = context.browser();
    result.browserVersion = browser.version();
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.host === 'api.github.com') network.apiGithub.push(request.url());
      else if (url.host !== 'github.com' && url.protocol.startsWith('http')) network.other.push(request.url());
    });
    await context.route('https://github.com/**', (route) => {
      const page = PAGES[new URL(route.request().url()).pathname];
      if (!page) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      return route.fulfill({ status: 200, contentType: page.type ?? 'text/html; charset=utf-8', headers: page.csp ? { 'content-security-policy': page.csp } : {}, body: read(page.file) });
    });
    await context.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '"محلي: لا شبكة"' }));
    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
    const origin = `chrome-extension://${id}`;
    const watch = (page, name) => page.on('console', (m) => (m.type() === 'error' || m.text().includes('[mijhar]')) && result.console.push(`${name}: ${m.type()}: ${m.text()}`));

    const gh = await context.newPage();
    watch(gh, 'readme');
    await gh.goto(README_URL);
    const mounted = await waitUntil(async () => settled(await gh.evaluate(directionState)), 10000);
    await sleep(300);
    result.steps.mounted = { settled: Boolean(mounted), ...(await gh.evaluate(directionState)) };

    const options = await context.newPage();
    watch(options, 'options');
    await options.goto(`${origin}/options.html`);
    await options.waitForSelector('#app[data-ready="true"]');
    result.steps.drawer = {
      sent: await options.evaluate((url) => chrome.tabs.query({ url: 'https://github.com/*' }).then((tabs) => Promise.all(tabs.filter((t) => t.url === url).map((t) => chrome.tabs.sendMessage(t.id, { type: 'mijhar:drawer', action: 'open' })))).then((r) => r.length), README_URL),
    };
    await waitUntil(async () => (await gh.evaluate(directionState)).drawer?.open, 5000);
    await sleep(300);
    Object.assign(result.steps.drawer, await gh.evaluate(directionState));

    const checkedBefore = await options.isChecked('#mj-unit-a');
    await options.click('#mj-unit-a');
    await waitUntil(async () => (await gh.evaluate(directionState)).flippedAttr === 0, 5000, 25);
    await sleep(300);
    result.steps.off = { checkedBefore, checked: await options.isChecked('#mj-unit-a'), ...(await gh.evaluate(directionState)), main: await gh.evaluate(mainMatches, RAW_README) };
    await options.click('#mj-unit-a');
    await waitUntil(async () => settled(await gh.evaluate(directionState)), 5000, 25);
    await sleep(300);
    result.steps.on = { checked: await options.isChecked('#mj-unit-a'), ...(await gh.evaluate(directionState)) };
    // اللقطة بعد مقارنة <main>: لقطة Playwright نفسها تضيف style="" إلى مربع المهمة (قيس بلا إضافة).
    fs.mkdirSync(path.join(HERE, 'integration-screens'), { recursive: true });
    await gh.screenshot({ path: path.join(HERE, 'integration-screens', `${key}-readme-drawer.png`) });

    const csp = await context.newPage();
    watch(csp, 'csp');
    await csp.goto(CSP_URL);
    await waitUntil(async () => (await csp.evaluate(directionState)).flippedAttr > 0, 10000);
    await sleep(500);
    result.steps.csp = await csp.evaluate(directionState);

    const hostile = await context.newPage();
    watch(hostile, 'hostile');
    await hostile.goto(HOSTILE_URL);
    await sleep(1000);
    result.steps.hostile = { sheets: await hostile.evaluate(() => ({ styleElements: document.querySelectorAll('style').length, readingStyles: Boolean(document.getElementById('mijhar-reading-styles')), flipped: document.querySelectorAll('[data-mijhar-dir]').length })) };

    const devtools = await context.newPage();
    await devtools.goto('chrome://extensions');
    const info = await devtools.evaluate((extId) => chrome.developerPrivate.getExtensionInfo(extId), id);
    result.extensionErrors = { runtime: (info.runtimeErrors ?? []).map((e) => e.message), manifest: (info.manifestErrors ?? []).map((e) => e.message) };
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = network;
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  return result;
}

// ---------- Firefox: Marionette خلف خادم HTTPS ووكيل محليين (نمط tests/core/ui-host/browser/firefox.mjs) ----------

const SERVED = new Set(['github.com', 'api.github.com']);

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
      if (error) throw new Error(`${name}: ${error.error ?? ''} ${error.message ?? ''}`.trim());
      return result;
    },
  };
}

function makeCertificates(workDir) {
  const file = (name) => path.join(workDir, name);
  const openssl = (...args) => execFileSync('openssl', args, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-wave-c-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('key.pem'), '-out', file('leaf.csr'), '-subj', '/CN=github.com');
  fs.writeFileSync(file('leaf.ext'), 'subjectAltName=DNS:github.com,DNS:api.github.com\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  openssl('x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-out', file('cert.pem'), '-days', '1', '-extfile', file('leaf.ext'));
  const caDer = fs.readFileSync(file('ca.pem'), 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return { key: fs.readFileSync(file('key.pem')), cert: fs.readFileSync(file('cert.pem')), caDer };
}

async function startServers(workDir) {
  const { key, cert, caDer } = makeCertificates(workDir);
  const log = { requests: [], refused: [] };
  const site = https.createServer({ key, cert }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    log.requests.push({ host, path: req.url });
    if (host === 'api.github.com') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('"محلي: لا شبكة"');
      return;
    }
    const page = PAGES[new URL(req.url, 'https://github.com').pathname];
    if (!page) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': page.type ?? 'text/html; charset=utf-8', ...(page.csp ? { 'content-security-policy': page.csp } : {}) });
    res.end(read(page.file));
  });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const sitePort = site.address().port;
  const proxy = http.createServer((req, res) => {
    log.refused.push(`http ${req.url}`);
    res.writeHead(403);
    res.end();
  });
  proxy.on('connect', (req, client, head) => {
    const host = req.url.split(':')[0];
    if (!SERVED.has(host)) {
      log.refused.push(host);
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
  return { log, caDer, proxyPort: proxy.address().port, close: () => Promise.all([new Promise((r) => site.close(r)), new Promise((r) => proxy.close(r))]) };
}

const prefs = (proxyPort) =>
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
  ]
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join('\n');

async function firefoxRun() {
  const { executable } = BROWSERS.firefox;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-wave-c-ff-'));
  const profileDir = path.join(workDir, 'profile');
  fs.mkdirSync(profileDir);
  const servers = await startServers(workDir);
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${prefs(servers.proxyPort)}\n`);
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const result = { label: 'Firefox', steps: {}, console: [] };
  let socket;
  try {
    const portFile = path.join(profileDir, 'MarionetteActivePort');
    const port = await waitUntil(() => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8')), 20000, 100);
    if (!port) throw new Error('لم يفتح Firefox منفذ Marionette');
    socket = net.connect(port, '127.0.0.1');
    const c = marionette(socket);
    await c.handshake();
    const { capabilities } = await c.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
    result.browserVersion = capabilities.browserVersion;
    const { value: id } = await c.send('Addon:Install', { path: path.join(ROOT, 'dist/firefox'), temporary: true });
    let context = 'content';
    const setContext = async (value) => {
      if (context === value) return;
      await c.send('Marionette:SetContext', { value });
      context = value;
    };
    const chrome = async (script, args = []) => {
      await setContext('chrome');
      return (await c.send('WebDriver:ExecuteScript', { script, args })).value;
    };
    await chrome(`Cc['@mozilla.org/security/x509certdb;1'].getService(Ci.nsIX509CertDB).addCertFromBase64(arguments[0], 'C,,'); return true;`, [servers.caDer]);
    const run = async (fn, ...args) => {
      await setContext('content');
      return (await c.send('WebDriver:ExecuteScript', { script: `return (${fn})(...arguments)`, args })).value;
    };
    const runAsync = async (body, args = []) => {
      await setContext('content');
      return (await c.send('WebDriver:ExecuteAsyncScript', { script: `const done = arguments[arguments.length - 1]; Promise.resolve((async () => { ${body} })()).then(done, (e) => done({ thrown: String(e) }))`, args })).value;
    };
    const host = await chrome('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [id]);
    const origin = `moz-extension://${host}`;
    const handles = {};
    const switchTo = async (name) => {
      await setContext('content');
      await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
    };
    const openTab = async (name, url) => {
      await setContext('content');
      const { handle } = await c.send('WebDriver:NewWindow', { type: 'tab' });
      handles[name] = handle;
      await c.send('WebDriver:SwitchToWindow', { handle });
      await c.send('WebDriver:Navigate', { url });
    };
    const click = async (selector) => {
      await setContext('content');
      const { value: el } = await c.send('WebDriver:FindElement', { using: 'css selector', value: selector });
      await c.send('WebDriver:ElementClick', { id: el['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(el)[0] });
    };
    const isChecked = (selector) => run((s) => document.querySelector(s)?.checked ?? null, selector);

    await openTab('readme', README_URL);
    const mounted = await waitUntil(async () => settled(await run(directionState)), 10000, 100);
    await sleep(300);
    result.steps.mounted = { settled: Boolean(mounted), ...(await run(directionState)) };

    await openTab('options', `${origin}/options.html`);
    await waitUntil(async () => (await run(() => document.querySelector('#app')?.getAttribute('data-ready'))) === 'true', 5000, 100);
    const sent = await runAsync(
      `const api = globalThis.browser ?? window.wrappedJSObject?.browser;
       const tabs = await api.tabs.query({ url: 'https://github.com/*' });
       const own = tabs.filter((t) => t.url === arguments[0]);
       for (const t of own) await api.tabs.sendMessage(t.id, { type: 'mijhar:drawer', action: 'open' });
       return own.length;`,
      [README_URL],
    );
    await switchTo('readme');
    await waitUntil(async () => (await run(directionState)).drawer?.open, 5000, 100);
    await sleep(300);
    result.steps.drawer = { sent, ...(await run(directionState)) };

    await switchTo('options');
    const checkedBefore = await isChecked('#mj-unit-a');
    await click('#mj-unit-a');
    await switchTo('readme');
    await waitUntil(async () => (await run(directionState)).flippedAttr === 0, 5000, 50);
    await sleep(300);
    result.steps.off = { checkedBefore, ...(await run(directionState)), main: await run(mainMatches, RAW_README) };
    await switchTo('options');
    result.steps.off.checked = await isChecked('#mj-unit-a');
    await click('#mj-unit-a');
    const checkedOn = await isChecked('#mj-unit-a');
    await switchTo('readme');
    await waitUntil(async () => settled(await run(directionState)), 5000, 50);
    await sleep(300);
    result.steps.on = { checked: checkedOn, ...(await run(directionState)) };

    await openTab('csp', CSP_URL);
    await waitUntil(async () => (await run(directionState)).flippedAttr > 0, 10000, 100);
    await sleep(500);
    result.steps.csp = await run(directionState);

    await openTab('hostile', HOSTILE_URL);
    await sleep(1000);
    result.steps.hostile = { sheets: await run(() => ({ styleElements: document.querySelectorAll('style').length, readingStyles: Boolean(document.getElementById('mijhar-reading-styles')), flipped: document.querySelectorAll('[data-mijhar-dir]').length })) };

    result.console = await chrome(
      `return Services.console.getMessageArray().map((m) => m.message ?? (m.errorMessage ? m.errorMessage + ' @ ' + m.sourceName : String(m))).filter((t) => /mijhar|moz-extension/i.test(t));`,
    );
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = {
      apiGithub: servers.log.requests.filter((r) => r.host === 'api.github.com'),
      other: [],
      githubPages: servers.log.requests.filter((r) => r.host === 'github.com').length,
      refusedHosts: [...new Set(servers.log.refused)],
    };
    socket?.destroy();
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(10000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited;
    await servers.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  return result;
}

const keys = process.argv.slice(2).filter((a) => BROWSERS[a]);
const results = {};
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox']) {
  results[key] = key === 'firefox' ? await firefoxRun() : await chromiumRun(key);
  const r = results[key];
  const s = r.steps;
  console.log(
    `${r.label} ${r.browserVersion ?? ''}: ${r.error ? `خطأ: ${r.error.split('\n')[0]}` : ''}` +
      ` تركيب ${s.mounted?.rtlOk}/${s.mounted?.expectRtl} خطأ ${s.mounted?.wrong?.length}` +
      ` · درج ${s.drawer?.drawer?.open} مُسّ ${s.drawer?.drawer?.touched} (بعده ${s.drawer?.rtlOk}/${s.drawer?.expectRtl})` +
      ` · إيقاف (أ): سمات ${s.off?.flippedAttr}+${s.off?.origAttr} أنماط ${s.off?.styles} main مطابق ${s.off?.main?.equal}` +
      ` · إعادة ${s.on?.rtlOk}/${s.on?.expectRtl}` +
      ` · CSP: سمات ${s.csp?.flippedAttr} محسوب ${s.csp?.rtlOk}/${s.csp?.expectRtl}` +
      ` · api.github.com ${r.network?.apiGithub?.length} · أخرى ${r.network?.other?.length} · أخطاء ${r.console?.length}`,
  );
}
fs.writeFileSync(path.join(HERE, 'integration.json'), `${JSON.stringify(results, null, 2)}\n`);

// مشغّلا المتصفحات لفحوص MJ15 على الحزمة المشحونة (نمط tests/modules/browser/integration.mjs): عائلة Chromium بـPlaywright وroute،
// وFirefox بـMarionette خلف خادم HTTPS ووكيل CONNECT محليين يرفضان كل مضيف آخر. لا شبكة خارجية؛ وكل طلب إلى api.github.com يُسجَّل
// بمصدره (الخلفية أو الصفحة) ووسم ترويسة Authorization (لا قيمتها). وكلاهما يعيد مشغّلًا d بالواجهة نفسها:
//   options(code, args) وgithub(code): جسم دالة async يُقيَّم في صفحة الإعدادات أو تبويب github.com.
//   openGithub(url) · fill(selector, text) وclick(selector) في الإعدادات · clickShadow(host, selector): نقر فعلي (فعل مستخدم) داخل جذر ظل.
//   keyShadow(host, selector, key): ضغطة مفتاح فعلية (Enter أو Space) على عنصر داخل جذر ظل بعد تركيزه (MJ21).
//   probe(file): ملف من الحزمة المشتقة يُنفَّذ في عالم سكربت المحتوى بـscripting.executeScript من صفحة الإعدادات.
// MJ21: extra اختياري { host: (req) => reply } يخدم مضيفات أخرى محليًا (مزوّد التحليل) ويسجّل كل طلب إليها في network.extra بطريقته ومساره
// وترويساته وجسمه؛ وما سواها يبقى محجوبًا. ومن لا يمرّره لا يتغير له شيء.
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

export { BROWSERS };
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitUntil(read, timeoutMs = 10000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read().catch(() => null);
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}

/** نسخة من dist/<target>: الشيفرة كما هي، ومنح api.github.com وscripting آليًا، وملفات إضافية (مسابير) بأسمائها. */
export function derivedCopy(target, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-mj15-${target}-`));
  fs.cpSync(path.join(ROOT, 'dist', target), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.permissions = [...new Set([...(manifest.permissions ?? []), 'scripting'])];
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.github.com/*'])];
  delete manifest.optional_host_permissions;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

/** يُنفَّذ في صفحة الإعدادات: ملف مسبار في تبويب github.com، في عالم سكربت المحتوى. */
export const RUN_PROBE = `
  const api = globalThis.browser ?? globalThis.chrome ?? (window.wrappedJSObject ?? window).browser;
  const tabs = await api.tabs.query({ url: 'https://github.com/*' });
  if (!tabs.length) return { noTab: true };
  const res = await api.scripting.executeScript({ target: { tabId: tabs[0].id }, files: [arguments[0]] });
  return res && res[0] ? res[0].result ?? null : null;
`;

// ---------- عائلة Chromium ----------

export async function chromiumSession(key, { extDir, githubReply, apiReply, authLabel = (v) => (v ? 'present' : null), extra = {} }) {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj15-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, { executablePath: executable, headless: true, viewport: { width: 1280, height: 900 }, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
  const network = { api: [], github: [], blocked: new Set(), extra: [] };
  const consoleText = [];
  await context.route('https://github.com/**', (route) => {
    const url = new URL(route.request().url());
    network.github.push(url.pathname);
    const r = githubReply(url.pathname);
    return route.fulfill({ status: r.status, contentType: r.type, body: r.body });
  });
  await context.route('https://api.github.com/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = request.headers().authorization ?? null;
    const pathAndQuery = url.pathname + url.search;
    network.api.push({ method: request.method(), path: pathAndQuery, from: request.serviceWorker() ? 'background' : 'page', auth: authLabel(authorization) });
    const r = apiReply(pathAndQuery, authorization);
    return route.fulfill({ status: r.status, contentType: 'application/json', headers: r.headers ?? {}, body: JSON.stringify(r.body ?? {}) });
  });
  for (const [host, reply] of Object.entries(extra)) {
    await context.route(`https://${host}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const entry = { host, method: request.method(), path: url.pathname + url.search, headers: await request.allHeaders(), body: request.postData() ?? null, from: request.serviceWorker() ? 'background' : 'page' };
      network.extra.push(entry);
      const r = await reply(entry);
      // اتصال حقيقي (TEST-AI-09): الطلب يمضي من المتصفح نفسه إلى المضيف الحقيقي بلا رد وهمي ولا وكيل، ويُسجَّل رمز ردّه.
      if (r === 'continue') {
        void request.response().then((response) => void (entry.status = response?.status() ?? null), () => void (entry.status = null));
        return route.continue();
      }
      return route.fulfill({ status: r.status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...(r.headers ?? {}) }, body: typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}) });
    });
  }
  await context.route((url) => url.protocol === 'https:' && !['github.com', 'api.github.com', ...Object.keys(extra)].includes(url.host), (route) => {
    network.blocked.add(new URL(route.request().url()).host);
    return route.abort();
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: extDir });
  const origin = `chrome-extension://${id}`;
  const watch = (page, name) => page.on('console', (m) => consoleText.push(`${name}: ${m.text()}`));
  const sw = await waitUntil(async () => context.serviceWorkers().find((w) => w.url().startsWith(origin)) ?? null, 8000);
  sw?.on?.('console', (m) => consoleText.push(`background: ${m.text()}`));
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
      await github.bringToFront();
    },
    probe: (file) => d.options(RUN_PROBE, [file]),
    fill: (selector, text) => options.fill(selector, text),
    click: (selector) => options.click(selector),
    async clickShadow(host, selector) {
      await github.bringToFront();
      await github.locator(`${host} ${selector}`).first().click();
    },
    async keyShadow(host, selector, key) {
      await github.bringToFront();
      await github.locator(`${host} ${selector}`).first().press(key === 'Space' ? ' ' : key);
    },
  };
  return {
    label,
    browserVersion: context.browser().version(),
    d,
    network,
    // سياق Playwright وتبويب github.com (إضافة MJ20): منح قراءة الحافظة والتقاط الشاشات. غائبان في Firefox.
    context,
    githubPage: github,
    consoleText: () => consoleText.join('\n'),
    async extensionErrors() {
      const devtools = await context.newPage();
      await devtools.goto('chrome://extensions');
      const info = await devtools.evaluate((extId) => chrome.developerPrivate.getExtensionInfo(extId), id);
      await devtools.close();
      return { runtime: (info.runtimeErrors ?? []).map((e) => e.message), manifest: (info.manifestErrors ?? []).map((e) => e.message) };
    },
    async close() {
      await context.close();
      fs.rmSync(profileDir, { recursive: true, force: true });
    },
  };
}

// ---------- Firefox ----------

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

function makeCertificates(workDir, extraHosts = []) {
  const file = (name) => path.join(workDir, name);
  const openssl = (...a) => execFileSync('openssl', a, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-mj15-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('key.pem'), '-out', file('leaf.csr'), '-subj', '/CN=github.com');
  const names = ['github.com', 'api.github.com', ...extraHosts].map((h) => `DNS:${h}`).join(',');
  fs.writeFileSync(file('leaf.ext'), `subjectAltName=${names}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`);
  openssl('x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-out', file('cert.pem'), '-days', '1', '-extfile', file('leaf.ext'));
  const caDer = fs.readFileSync(file('ca.pem'), 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return { key: fs.readFileSync(file('key.pem')), cert: fs.readFileSync(file('cert.pem')), caDer };
}

async function startServers(workDir, network, { githubReply, apiReply, authLabel, extra = {} }) {
  const { key, cert, caDer } = makeCertificates(workDir, Object.keys(extra));
  const site = https.createServer({ key, cert }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const url = new URL(req.url, `https://${host}`);
    if (extra[host]) {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', async () => {
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
        // الطلب التمهيدي لـCORS (OPTIONS) يُجاب ولا يُسجَّل: لا ترويسة سرّ فيه ولا جسم.
        if (req.method === 'OPTIONS') {
          res.writeHead(204, cors);
          res.end();
          return;
        }
        const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : null;
        const requestOrigin = req.headers.origin ?? null;
        const entry = { host, method: req.method, path: url.pathname + url.search, headers: { ...req.headers }, body, from: requestOrigin === null || requestOrigin.startsWith('moz-extension://') ? 'background' : 'page' };
        network.extra.push(entry);
        const r = await extra[host](entry);
        res.writeHead(r.status, { 'content-type': 'application/json', ...cors, ...(r.headers ?? {}) });
        res.end(typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {}));
      });
      return;
    }
    if (host === 'api.github.com') {
      const authorization = req.headers.authorization ?? null;
      const requestOrigin = req.headers.origin ?? null;
      // طلب الصفحة أو سكربت المحتوى عابر للأصل فيحمل Origin: https://github.com؛ وطلب سياق الإضافة المميَّز (صفحة الخلفية) بلا Origin
      // أو بأصل moz-extension://. ولا تطلب صفحات الإضافة api.github.com بنفسها (تراسل الخلفية)، فالمميَّز هنا الخلفية.
      network.api.push({ method: req.method, path: url.pathname + url.search, from: requestOrigin === null || requestOrigin.startsWith('moz-extension://') ? 'background' : 'page', origin: requestOrigin, auth: authLabel(authorization) });
      const r = apiReply(url.pathname + url.search, authorization);
      res.writeHead(r.status, { 'content-type': 'application/json', ...(r.headers ?? {}) });
      res.end(JSON.stringify(r.body ?? {}));
      return;
    }
    network.github.push(url.pathname);
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
    if (host !== 'github.com' && host !== 'api.github.com' && !extra[host]) {
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

const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
const SHADOW = 'shadow-6066-11e4-a52e-4f735466cecf';

export async function firefoxSession({ extDir, githubReply, apiReply, authLabel = (v) => (v ? 'present' : null), extra = {} }) {
  const { executable } = BROWSERS.firefox;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj15-ff-'));
  const profileDir = path.join(workDir, 'profile');
  fs.mkdirSync(profileDir);
  const network = { api: [], github: [], blocked: new Set(), extra: [] };
  const servers = await startServers(workDir, network, { githubReply, apiReply, authLabel, extra });
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${firefoxPrefs(servers.proxyPort)}\n`);
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  let socket;
  const close = async () => {
    socket?.destroy();
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(10000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited;
    await servers.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  };
  try {
    const portFile = path.join(profileDir, 'MarionetteActivePort');
    const port = await waitUntil(async () => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8')), 20000, 100);
    if (!port) throw new Error('لم يفتح Firefox منفذ Marionette');
    socket = net.connect(port, '127.0.0.1');
    const c = marionette(socket);
    await c.handshake();
    const { capabilities } = await c.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
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
    // جسم دالة async في الصفحة الحالية؛ والوصول إلى واجهات الصفحة (browser وindexedDB) عبر wrappedJSObject.
    const runAsync = async (code, a = []) => {
      await setContext('content');
      const script = `const done = arguments[arguments.length - 1]; const window_ = window; const globalThis_ = window.wrappedJSObject ?? window; (async function () { const window = window_; const document = window_.document; const indexedDB = globalThis_.indexedDB; const location = window_.location; ${code} }).apply(null, Array.prototype.slice.call(arguments, 0, -1)).then((v) => done(v === undefined ? null : JSON.parse(JSON.stringify(v))), (e) => done({ thrown: String(e) }));`;
      return (await c.send('WebDriver:ExecuteAsyncScript', { script, args: a })).value;
    };
    await openTab('options', `${origin}/options.html`);
    await waitUntil(async () => (await runAsync(`return document.querySelector('#app')?.getAttribute('data-ready');`)) === 'true', 10000);
    const element = async (selector) => {
      const { value } = await c.send('WebDriver:FindElement', { using: 'css selector', value: selector });
      return value[ELEMENT] ?? Object.values(value)[0];
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
      async clickShadow(hostSelector, selector) {
        await switchTo('github');
        // Marionette يمرّر العنصر إلى حافة النافذة فقد تغطيه ترويسة GitHub الثابتة: يُوسَّط أولًا.
        await runAsync(`document.querySelector(arguments[0])?.shadowRoot?.querySelector(arguments[1])?.scrollIntoView({ block: 'center' });`, [hostSelector, selector]);
        const hostEl = await element(hostSelector);
        const { value: shadow } = await c.send('WebDriver:GetShadowRoot', { id: hostEl });
        const shadowId = shadow[SHADOW] ?? Object.values(shadow)[0];
        const { value: inner } = await c.send('WebDriver:FindElementFromShadowRoot', { shadowRoot: shadowId, using: 'css selector', value: selector });
        await c.send('WebDriver:ElementClick', { id: inner[ELEMENT] ?? Object.values(inner)[0] });
        await sleep(100);
      },
      async keyShadow(hostSelector, selector, key) {
        await switchTo('github');
        await runAsync(`document.querySelector(arguments[0])?.shadowRoot?.querySelector(arguments[1])?.scrollIntoView({ block: 'center' });`, [hostSelector, selector]);
        const hostEl = await element(hostSelector);
        const { value: shadow } = await c.send('WebDriver:GetShadowRoot', { id: hostEl });
        const shadowId = shadow[SHADOW] ?? Object.values(shadow)[0];
        const { value: inner } = await c.send('WebDriver:FindElementFromShadowRoot', { shadowRoot: shadowId, using: 'css selector', value: selector });
        // ElementSendKeys يركّز العنصر ثم يرسل ضغطة فعلية: Enter = \uE007، وSpace مسافة.
        await c.send('WebDriver:ElementSendKeys', { id: inner[ELEMENT] ?? Object.values(inner)[0], text: key === 'Enter' ? '\uE007' : ' ' });
        await sleep(100);
      },
    };
    return {
      label: 'Firefox',
      browserVersion: capabilities.browserVersion,
      d,
      network,
      async consoleText() {
        return (await chromeScript(`return Services.console.getMessageArray().map((m) => m.message ?? (m.errorMessage ? m.errorMessage + ' @ ' + m.sourceName : String(m)));`)).join('\n');
      },
      extensionErrors: async () => null,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

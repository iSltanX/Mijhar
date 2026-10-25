#!/usr/bin/env node
// MJ26 (T-10.1): التحقق المعلّق من تدقيق ما قبل الإصدار في Firefox الحقيقي (النافذة الأصلية مرئية، بلا قبول آلي)، على الحزمة المشحونة dist/firefox كما هي.
// على نمط evidence/wave-L/gate/firefox-native-consent/check.mjs (Marionette ووكيل CONNECT يرفض كل مضيف غير المحلية)، ومضيف OpenAI وهمي محلي بمفتاح مختلَق
// يُركَّب وقت التشغيل ولا يُكتب في أي دليل. ثلاثة أجزاء:
//   أ. نافذة الصلاحية (BLK-AUD-02، 92caf1b): «احفظ وتحقق» يطلب المضيف وموافقة محتوى المواقع معًا، و«تحقق من المفتاح» يطلب صلاحية المضيف وحدها؛ ورفضها يعرض
//      «لم تُمنح صلاحية api.openai.com؛ لم يُرسل شيء.» بلا طلب، وقبولها يمنح المضيف وحده (لا websiteContent) ويرسل طلب التحقق المعلن وحده.
//   ب. إيقاظ الخلفية (F-06، 8cd8033): المزوّد يردّ 429 بـRetry-After؛ ثم تُنهى صفحة الخلفية (terminateBackground كما يفعل about:debugging)، وبعد إيقاظها
//      بنقرة «تحقق من المفتاح» يُستعاد الموعد من سجل صحة المفتاح فلا يُرسل تحقق قبله، وتعلن الحالة الموعد؛ وبعد حلوله يُرسل.
//   ج. أكثر من نافذة إعدادات (F-05 وF-07 وCOR-AUD-02 وPI-1): تبويبان للإعدادات؛ المسح والاستبدال وتبديل المزوّد من الثاني ينعكس في الأول عند العودة إليه
//      بلا رسالة لمفتاح أو مزوّد سابق، والقائمة ونتيجة الاختبار تُحذفان من ذاكرة الجلسة عند قراءة الحالة التالية، وطلبا القائمة والاختبار المتزامنان من
//      التبويبين يُكتبان كلاهما، ورمز GitHub يُحفظ ويُمسح من الثاني فتعرضه بطاقة الأول عند العودة (PI-1).
// الاستعمال: node evidence/T-10.1/pending/firefox-check.mjs ← firefox-result.json وscreens/firefox-*.png في المجلد نفسه.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SCREENS = path.join(HERE, 'screens');
const FIREFOX = '/Applications/Firefox.app/Contents/MacOS/firefox';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(read, timeoutMs = 10000, stepMs = 150) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await read().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(stepMs);
  }
}

const KEY = ['sk', 'proj', 'PendingFirefoxFakeKeyOne'.repeat(3)].join('-');
const KEY2 = ['sk', 'proj', 'PendingFirefoxFakeKeyTwo'.repeat(3)].join('-');
const TOKEN = ['github', 'pat', `11PENDINGMIJHARFAKE00_${'xFakePendingCheckOnly'.repeat(3).slice(0, 59)}`].join('_');
const SECRETS = [KEY, KEY2, TOKEN];
const hasSecret = (v) => SECRETS.some((s) => (typeof v === 'string' ? v : JSON.stringify(v ?? null)).includes(s));
const OPENAI = 'api.openai.com';
const RETRY_SECONDS = 25;
const SECONDS = Math.floor(Date.now() / 1000);

// ---------- Marionette ----------
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

// ---------- خوادم محلية: github.com وapi.github.com وapi.openai.com خلف وكيل CONNECT ----------
function certificates(workDir, hosts) {
  const file = (name) => path.join(workDir, name);
  const openssl = (...a) => execFileSync('openssl', a, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-mj26-pending-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('key.pem'), '-out', file('leaf.csr'), '-subj', '/CN=github.com');
  fs.writeFileSync(file('leaf.ext'), `subjectAltName=${hosts.map((h) => `DNS:${h}`).join(',')}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`);
  openssl('x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-out', file('cert.pem'), '-days', '1', '-extfile', file('leaf.ext'));
  return { key: fs.readFileSync(file('key.pem')), cert: fs.readFileSync(file('cert.pem')), caDer: fs.readFileSync(file('ca.pem'), 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '') };
}

/** سلوك المزوّد الوهمي: ok يقبل، وrate يردّ 429 بموعد، وdelay يؤخّر كل رد (لتداخل طلبين). */
const mock = { mode: 'ok', delay: 0 };

async function servers(workDir, network) {
  const HOSTS = ['github.com', 'api.github.com', OPENAI];
  const { key, cert, caDer } = certificates(workDir, HOSTS);
  const site = https.createServer({ key, cert }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const url = new URL(req.url, `https://${host}`);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (host === OPENAI) {
        const auth = req.headers.authorization ?? '';
        const entry = { at: Date.now(), method: req.method, path: url.pathname + url.search, key: auth === `Bearer ${KEY}` ? 'KEY' : auth === `Bearer ${KEY2}` ? 'KEY2' : auth ? 'other' : null, mode: mock.mode, body: body ? JSON.parse(body) : null };
        network.provider.push(entry);
        if (mock.delay) await sleep(mock.delay);
        const json = (status, value, headers = {}) => {
          res.writeHead(status, { 'content-type': 'application/json', ...headers });
          res.end(JSON.stringify(value));
        };
        if (mock.mode === 'rate') return json(429, { error: { type: 'requests', code: 'rate_limit_exceeded', message: 'Rate limit reached for requests.' } }, { 'retry-after': String(RETRY_SECONDS) });
        if (url.pathname === '/v1/models') return json(200, { object: 'list', data: [{ id: 'mock-chat-2', object: 'model', created: SECONDS - 864000, owned_by: 'mock' }] });
        if (url.pathname === '/v1/responses') {
          const sent = entry.body ?? {};
          return json(200, { id: 'resp_mock', object: 'response', status: 'completed', incomplete_details: null, model: sent.model, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: sent.input === 'ping' ? 'pong' : '{}' }] }], usage: { input_tokens: 1, output_tokens: 1 } });
        }
        return json(404, { error: { message: 'not found' } });
      }
      if (host === 'api.github.com') {
        network.api.push({ path: url.pathname, auth: req.headers.authorization === `Bearer ${TOKEN}` ? 'token' : req.headers.authorization ? 'other' : null });
        res.writeHead(200, { 'content-type': 'application/json', 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999', 'x-ratelimit-used': '1', 'x-ratelimit-reset': String(SECONDS + 3600), 'x-ratelimit-resource': 'core' });
        res.end(JSON.stringify({ resources: { core: { limit: 5000, remaining: 4999, used: 1, reset: SECONDS + 3600 } }, rate: { limit: 5000, remaining: 4999, used: 1, reset: SECONDS + 3600 } }));
        return;
      }
      network.github.push(url.pathname);
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    });
  });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const sitePort = site.address().port;
  const proxy = http.createServer((req, res) => {
    network.blocked.add(`http ${req.url}`);
    res.writeHead(403);
    res.end();
  });
  proxy.on('connect', (req, client, head) => {
    const host = req.url.split(':')[0];
    if (!HOSTS.includes(host)) {
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
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  return { caDer, proxyPort: proxy.address().port, close: () => Promise.all([new Promise((r) => site.close(r)), new Promise((r) => proxy.close(r))]) };
}

// لا extensions.webextOptionalPermissionPrompts هنا: النافذة الأصلية بقيمتها الافتراضية.
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
    ['browser.aboutwelcome.enabled', false],
    ['startup.homepage_welcome_url', 'about:blank'],
    ['browser.startup.homepage', 'about:blank'],
  ]
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join('\n');

const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';
const steps = [];
const notes = [];
const check = (part, name, ok, detail) => {
  steps.push({ part, name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  console.log(`  ${ok ? '✓' : '✗'} [${part}] ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 600)}`}`);
};
const notRun = (part, name, why) => {
  steps.push({ part, name, ok: null, notRun: why });
  console.log(`  – لم يُجرَ [${part}] ${name}: ${why}`);
};

async function main() {
  fs.mkdirSync(SCREENS, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj26-pending-ff-'));
  const profileDir = path.join(workDir, 'profile');
  fs.mkdirSync(profileDir);
  const network = { provider: [], api: [], github: [], blocked: new Set() };
  const srv = await servers(workDir, network);
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${prefs(srv.proxyPort)}\n`);
  const child = spawn(FIREFOX, ['-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((r) => child.once('exit', r));
  let socket;
  const close = async () => {
    socket?.destroy();
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(10000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await srv.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  };
  try {
    const portFile = path.join(profileDir, 'MarionetteActivePort');
    const port = await waitUntil(async () => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8')), 30000);
    if (!port) throw new Error('لم يفتح Firefox منفذ Marionette');
    socket = net.connect(port, '127.0.0.1');
    const c = marionette(socket);
    await c.handshake();
    const { capabilities } = await c.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
    let context = 'content';
    const setContext = async (value) => {
      if (context !== value) await c.send('Marionette:SetContext', { value });
      context = value;
    };
    const chrome = async (script, a = []) => {
      await setContext('chrome');
      return (await c.send('WebDriver:ExecuteScript', { script, args: a })).value;
    };
    const chromeAsync = async (code, a = []) => {
      await setContext('chrome');
      const script = `const done = arguments[arguments.length - 1]; (async function () { ${code} }).apply(null, Array.prototype.slice.call(arguments, 0, -1)).then((v) => done(v === undefined ? null : v), (e) => done({ thrown: String(e) }));`;
      return (await c.send('WebDriver:ExecuteAsyncScript', { script, args: a })).value;
    };
    await chrome(`Cc['@mozilla.org/security/x509certdb;1'].getService(Ci.nsIX509CertDB).addCertFromBase64(arguments[0], 'C,,'); return true;`, [srv.caDer]);
    const promptPref = await chrome(`return Services.prefs.getBoolPref('extensions.webextOptionalPermissionPrompts', true);`);
    check('إعداد', 'ملف تعريف جديد بلا قبول آلي: extensions.webextOptionalPermissionPrompts على قيمته الافتراضية (true)', promptPref === true, { promptPref });
    const { value: addonId } = await c.send('Addon:Install', { path: path.join(ROOT, 'dist/firefox'), temporary: true });
    const host = await chrome('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [addonId]);
    const origin = `moz-extension://${host}`;
    const declared = await chrome(`const p = WebExtensionPolicy.getByID(arguments[0]); return { optional: p.extension?.manifest?.optional_host_permissions ?? null, dc: p.extension?.manifest?.browser_specific_settings?.gecko?.data_collection_permissions ?? null, background: p.extension?.manifest?.background ?? null };`, [addonId]);
    check('إعداد', 'الحزمة المشحونة كما هي: api.openai.com اختيارية، وwebsiteContent اختيارية، والخلفية صفحة أحداث (background.scripts)', JSON.stringify(declared.optional ?? []).includes(OPENAI) && JSON.stringify(declared.dc ?? {}).includes('websiteContent') && Array.isArray(declared.background?.scripts), declared);

    await setContext('content');
    const { value: tabA } = await c.send('WebDriver:GetWindowHandle');
    await c.send('WebDriver:Navigate', { url: `${origin}/options.html` });
    let current = tabA;
    const runAsync = async (code, a = []) => {
      await setContext('content');
      const script = `const done = arguments[arguments.length - 1]; const window_ = window; const globalThis_ = window.wrappedJSObject ?? window; (async function () { const window = window_; const document = window_.document; ${code} }).apply(null, Array.prototype.slice.call(arguments, 0, -1)).then((v) => done(v === undefined ? null : JSON.parse(JSON.stringify(v))), (e) => done({ thrown: String(e) }));`;
      return (await c.send('WebDriver:ExecuteAsyncScript', { script, args: a })).value;
    };
    const to = async (handle) => {
      await setContext('content');
      if (current !== handle) await c.send('WebDriver:SwitchToWindow', { handle });
      current = handle;
      await sleep(400);
    };
    const ready = () => waitUntil(async () => (await runAsync(`return document.querySelector('#app')?.getAttribute('data-ready');`)) === 'true', 15000);
    await ready();
    await sleep(1000);
    const freshKeys = await runAsync(`return Object.keys(await globalThis_.browser.storage.local.get(null)).sort();`);
    const element = async (selector) => {
      const { value } = await c.send('WebDriver:FindElement', { using: 'css selector', value: selector });
      return value[ELEMENT] ?? Object.values(value)[0];
    };
    const click = async (handle, selector) => {
      await to(handle);
      await runAsync(`document.querySelector(arguments[0])?.scrollIntoView({ block: 'center' });`, [selector]);
      await c.send('WebDriver:ElementClick', { id: await element(selector) });
    };
    const type = async (handle, selector, text) => {
      await to(handle);
      await runAsync(`const f = document.querySelector(arguments[0]); f.scrollIntoView({ block: 'center' }); f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true }));`, [selector]);
      await c.send('WebDriver:ElementSendKeys', { id: await element(selector), text });
    };
    const selectProvider = (handle, id) =>
      to(handle).then(() => runAsync(`const s = document.querySelector('#mj-provider-select'); s.value = arguments[0]; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`, [id]));
    const card = () =>
      runAsync(`
        const c = document.querySelector('[data-provider-card]');
        if (!c) return null;
        return {
          provider: c.getAttribute('data-provider-card'),
          permission: c.querySelector('[data-provider-permission]')?.getAttribute('data-provider-permission') ?? null,
          key: c.querySelector('[data-key-state]')?.getAttribute('data-key-state') ?? null,
          health: c.querySelector('[data-key-check]')?.getAttribute('data-health') ?? c.querySelector('[data-provider-key]')?.getAttribute('data-health') ?? null,
          message: c.querySelector('[data-key-message]')?.textContent ?? '',
          checkText: c.querySelector('[data-key-check]')?.textContent ?? '',
          confirm: Boolean(c.querySelector('[data-key-confirm]')),
          list: c.querySelector('[data-model-list]')?.getAttribute('data-model-list') ?? null,
          listed: [...c.querySelectorAll('[role="listbox"] [role="option"]')].map((o) => o.getAttribute('data-model')),
          test: c.querySelector('[data-model-test]')?.getAttribute('data-model-test') ?? null,
          testText: c.querySelector('[data-model-test]')?.textContent ?? '',
          field: c.querySelector('[data-model-input]')?.value ?? null,
          busy: c.querySelector('[data-action="key-check"]')?.disabled ?? null,
        };
      `);
    const tokenCard = () => runAsync(`return { state: document.querySelector('[data-token-state]')?.getAttribute('data-token-state') ?? null, confirm: Boolean(document.querySelector('[data-token-confirm]')) };`);
    const perms = () => runAsync(`return JSON.parse(JSON.stringify(await globalThis_.browser.permissions.getAll()));`);
    const statusDirect = () => runAsync(`return await globalThis_.browser.runtime.sendMessage({ type: 'mijhar/provider', op: 'status', provider: 'openai' });`);
    const session = () => runAsync(`return JSON.parse(JSON.stringify(await globalThis_.browser.storage.session.get(['mijhar.provider.models', 'mijhar.provider.tests'])));`);
    const onProvider = () => network.provider.length;

    // النافذة الأصلية في واجهة المتصفح.
    const prompt = () =>
      chrome(`
        const panel = document.getElementById('notification-popup');
        const el = [...(panel?.querySelectorAll('popupnotification') ?? [])].find((x) => !x.hidden) ?? null;
        if (!el) return { open: panel?.state ?? null, shown: false };
        const items = [...el.querySelectorAll('li, .webext-perm-granted, .webext-perm-optional, [class*="perm"] label, moz-checkbox')].map((x) => (x.label ?? x.textContent ?? '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
        return {
          open: panel.state,
          shown: true,
          id: el.id,
          text: el.textContent.replace(/\\s+/g, ' ').trim(),
          items: [...new Set(items)],
          primary: el.querySelector('.popup-notification-primary-button')?.label ?? el.getAttribute('buttonlabel') ?? null,
          secondary: el.querySelector('.popup-notification-secondary-button')?.label ?? el.getAttribute('secondarybuttonlabel') ?? null,
        };
      `);
    const waitPrompt = () =>
      waitUntil(async () => {
        const p = await prompt();
        return p?.shown ? p : null;
      }, 10000);
    const promptButton = async (which) => {
      await setContext('chrome');
      const sel = which === 'primary' ? '#notification-popup popupnotification:not([hidden]) .popup-notification-primary-button' : '#notification-popup popupnotification:not([hidden]) .popup-notification-secondary-button';
      let native = '';
      try {
        const hostId = await element(sel);
        const { value: shadow } = await c.send('WebDriver:GetShadowRoot', { id: hostId });
        const shadowId = shadow['shadow-6066-11e4-a52e-4f735466cecf'] ?? Object.values(shadow)[0];
        const { value: inner } = await c.send('WebDriver:FindElementFromShadowRoot', { shadowRoot: shadowId, using: 'css selector', value: 'button' });
        await c.send('WebDriver:ElementClick', { id: inner[ELEMENT] ?? Object.values(inner)[0] });
        await sleep(600);
        if (!(await prompt())?.shown) return 'نقرة Marionette على زر النافذة الأصلية';
        native = 'النقرة لم تُغلق النافذة';
      } catch (error) {
        native = String(error.message).slice(0, 120);
      }
      const done = await chrome(`const b = document.querySelector(arguments[0]); if (!b) return false; b.click(); return true;`, [sel]);
      return done ? `click() على زر النافذة الأصلية من سياق المتصفح (تعذّرت نقرة Marionette: ${native})` : 'not-found';
    };
    const shoot = async (name) => {
      try {
        await setContext('chrome');
        const { value } = await c.send('WebDriver:TakeScreenshot', { full: false });
        fs.writeFileSync(path.join(SCREENS, `firefox-${name}.png`), Buffer.from(value, 'base64'));
      } catch (error) {
        notes.push(`لقطة ${name}: ${String(error.message).slice(0, 160)}`);
      }
    };
    const until = (want, ms = 12000) =>
      waitUntil(async () => {
        const x = await card();
        return x && want(x) ? x : null;
      }, ms);

    // ======================= أ. نافذة الصلاحية (BLK-AUD-02) =======================
    await selectProvider(tabA, 'openai');
    const start = await until((x) => x.provider === 'openai' && x.permission !== 'checking' && x.key === 'none');
    check('أ. الصلاحية', 'البداية: OpenAI مختار بلا مفتاح ولا صلاحية، ولا طلب إلى المزوّد', start?.permission === 'denied' && onProvider() === 0, start);
    await type(tabA, '#mj-key-input', KEY);
    await click(tabA, '[data-action="key-save"]');
    const p1 = await waitPrompt();
    await sleep(500);
    await shoot('a1-save-prompt');
    check('أ. الصلاحية', '«احفظ وتحقق» يُظهر النافذة الأصلية بمضيف api.openai.com وبند مشاركة محتوى المواقع معًا', Boolean(p1?.shown) && p1.text.includes(OPENAI) && /(website content|محتوى المواقع|محتوى الموقع)/i.test(p1.text), p1 && { text: p1.text.slice(0, 400), items: p1.items });
    notes.push(`أ1 الرفض: ${await promptButton('secondary')}`);
    const a1 = await until((x) => x.key && x.key !== 'none' && x.key !== 'checking' && x.permission === 'denied' && /لم يُتحقق منه/.test(x.message));
    check('أ. الصلاحية', 'رفض نافذة الحفظ: المفتاح محفوظ «لم يُتحقق منه» بلا أي طلب', Boolean(a1) && onProvider() === 0, a1 && { key: a1.key, message: a1.message });

    await click(tabA, '[data-action="key-check"]');
    const p2 = await waitPrompt();
    await sleep(500);
    await shoot('a2-check-prompt-host-only');
    fs.writeFileSync(path.join(HERE, 'firefox-prompt-key-check.json'), `${JSON.stringify(p2, null, 2)}\n`);
    check('أ. الصلاحية', '«تحقق من المفتاح» يُظهر النافذة الأصلية بمضيف api.openai.com وحده، بلا بند مشاركة محتوى المواقع (BLK-AUD-02)', Boolean(p2?.shown) && p2.text.includes(OPENAI) && !/(website content|محتوى المواقع|محتوى الموقع|data collection|جمع البيانات)/i.test(p2.text), p2 && { text: p2.text.slice(0, 400), items: p2.items });
    notes.push(`أ2 الرفض: ${await promptButton('secondary')}`);
    const a2 = await until((x) => x.message.includes(`لم تُمنح صلاحية ${OPENAI}؛ لم يُرسل شيء.`));
    const pa2 = await perms();
    check('أ. الصلاحية', 'رفضها يعرض «لم تُمنح صلاحية api.openai.com؛ لم يُرسل شيء.» بلا أي طلب، ولا صلاحية ممنوحة', Boolean(a2) && onProvider() === 0 && !JSON.stringify(pa2?.origins ?? []).includes(OPENAI), { message: a2?.message, origins: pa2?.origins });

    await click(tabA, '[data-action="key-check"]');
    const p3 = await waitPrompt();
    check('أ. الصلاحية', '«تحقق من المفتاح» ثانيةً يُظهر النافذة نفسها (المضيف وحده)', Boolean(p3?.shown) && !/(website content|محتوى المواقع|محتوى الموقع)/i.test(p3?.text ?? ''), p3 && { text: p3.text.slice(0, 300) });
    notes.push(`أ3 القبول: ${await promptButton('primary')}`);
    const a3 = await until((x) => x.health === 'healthy');
    const pa3 = await perms();
    const verifies = network.provider.map((r) => `${r.method} ${r.path} ${r.key}`);
    check('أ. الصلاحية', 'قبولها يمنح المضيف وحده (لا websiteContent)، ويُرسل طلب التحقق المعلن وحده (GET /v1/models بالمفتاح)، والمفتاح «سليم»', Boolean(a3) && JSON.stringify(pa3?.origins ?? []).includes(OPENAI) && !JSON.stringify(pa3?.data_collection ?? []).includes('websiteContent') && network.provider.length === 1 && network.provider[0].method === 'GET' && network.provider[0].path === '/v1/models' && network.provider[0].key === 'KEY', { verifies, perms: pa3, health: a3?.health });
    await shoot('a3-after-allow');

    // ======================= ب. إيقاظ الخلفية (F-06) =======================
    mock.mode = 'rate';
    const n0 = onProvider();
    await click(tabA, '[data-action="key-check"]');
    const b1 = await until((x) => x.health === 'rate-limited' || /موعد|إعادة المحاولة/.test(`${x.message} ${x.checkText}`));
    const rateAt = Date.now();
    check('ب. الإيقاظ', 'المزوّد يردّ 429 بـRetry-After: طلب واحد، والبطاقة تعلن حد الطلبات وموعده', Boolean(b1) && onProvider() === n0 + 1, b1 && { health: b1.health, message: b1.message, check: b1.checkText });
    const s1 = await statusDirect();
    check('ب. الإيقاظ', 'الحالة من الخلفية قبل الإيقاف تعلن الموعد (retryAt)', typeof s1?.retryAt === 'number' && s1.retryAt > Date.now(), { retryAt: s1?.retryAt });
    const before = await chrome(`return WebExtensionPolicy.getByID(arguments[0]).extension.backgroundState ?? null;`, [addonId]);
    const terminated = await chromeAsync(`const ext = WebExtensionPolicy.getByID(arguments[0]).extension; await ext.terminateBackground({ disableResetIdleForTest: true }); return ext.backgroundState ?? 'unknown';`, [addonId]);
    const stopped = await waitUntil(async () => {
      const state = await chrome(`return WebExtensionPolicy.getByID(arguments[0]).extension.backgroundState ?? null;`, [addonId]);
      return state === 'stopped' ? state : null;
    }, 8000);
    check('ب. الإيقاظ', 'صفحة الخلفية أُنهيت فعلًا (terminateBackground كما في about:debugging) فزالت ذاكرتها', stopped === 'stopped', { before, terminated, stopped });
    mock.mode = 'ok';
    const n1 = onProvider();
    await click(tabA, '[data-action="key-check"]');
    const woke = await waitUntil(async () => {
      const state = await chrome(`return WebExtensionPolicy.getByID(arguments[0]).extension.backgroundState ?? null;`, [addonId]);
      return state === 'running' ? state : null;
    }, 10000);
    const b2 = await until((x) => x.message.includes('أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.') || /موعد/.test(x.message));
    await sleep(800);
    check('ب. الإيقاظ', 'بعد إيقاظ الخلفية بنقرة «تحقق من المفتاح»: لا طلب قبل الموعد، والرسالة «أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.»', woke === 'running' && Boolean(b2) && onProvider() === n1, { woke, message: b2?.message, sent: onProvider() - n1 });
    const s2 = await statusDirect();
    check('ب. الإيقاظ', 'الحالة بعد الإيقاظ تعلن الموعد نفسه مستعادًا من سجل صحة المفتاح', typeof s2?.retryAt === 'number' && Math.abs(s2.retryAt - (s1?.retryAt ?? 0)) < 2000, { before: s1?.retryAt, after: s2?.retryAt });
    await shoot('b-after-wake');
    const wait = rateAt + RETRY_SECONDS * 1000 + 1500 - Date.now();
    if (wait > 0) await sleep(wait);
    const n2 = onProvider();
    await click(tabA, '[data-action="key-check"]');
    const b3 = await until((x) => x.health === 'healthy' && onProvider() > n2, 12000);
    check('ب. الإيقاظ', 'بعد حلول الموعد: «تحقق من المفتاح» يرسل طلبًا واحدًا ويعود المفتاح «سليمًا»', Boolean(b3) && onProvider() === n2 + 1, { sent: onProvider() - n2, health: b3?.health });

    // ======================= ج. أكثر من نافذة إعدادات =======================
    await setContext('content');
    const { handle: tabB } = await c.send('WebDriver:NewWindow', { type: 'tab' });
    await to(tabB);
    await c.send('WebDriver:Navigate', { url: `${origin}/options.html` });
    await ready();
    const cb0 = await until((x) => x.provider === 'openai' && x.key === 'session');
    check('ج. النوافذ', 'التبويب الثاني يقرأ المفتاح المحفوظ نفسه (OpenAI، الجلسة)', Boolean(cb0), cb0);

    // F-07: طلبا القائمة والاختبار متزامنان من التبويبين، فيُكتبان كلاهما في ذاكرة الجلسة.
    await to(tabA);
    await type(tabA, '[data-provider-card] [data-model-input]', 'mock-chat-2');
    await click(tabA, '#mj-conn-provider-key-title');
    await sleep(600);
    mock.delay = 900;
    const n3 = onProvider();
    const raceStart = Date.now();
    // القائمة مقروءة في الجلسة فلا يطلبها زر + ثانية: يُرسل الثاني طلب «حدّث القائمة» نفسه (verify بلا اقتراح) إلى الخلفية ولا ينتظره، ثم ينقر الأول «اختبر النموذج».
    await to(tabB);
    const refresh = await runAsync(`globalThis_.browser.runtime.sendMessage({ type: 'mijhar/provider', op: 'verify', provider: 'openai', suggest: false }); return true;`);
    await click(tabA, '[data-action="model-test"]');
    await sleep(2600);
    mock.delay = 0;
    const raced = network.provider.slice(n3).map((r) => ({ method: r.method, path: r.path, at: r.at }));
    const overlapped = raced.length === 2 && Math.abs(raced[0].at - raced[1].at) < 900;
    const ss1 = await session();
    const st3 = await statusDirect();
    const modelsAt = ss1?.['mijhar.provider.models']?.openai?.readAt ?? null;
    const testAt = ss1?.['mijhar.provider.tests']?.openai?.at ?? null;
    check('ج. النوافذ', 'F-07: القائمة من الثاني والاختبار من الأول متداخلان في الخلفية، وكلاهما كُتب في ذاكرة الجلسة أثناء السباق (لا يمحو أحدهما الآخر)', refresh === true && overlapped && modelsAt > raceStart && testAt > raceStart && st3?.test?.model === 'mock-chat-2', { raced, raceStart, modelsAt, testAt, tests: ss1?.['mijhar.provider.tests']?.openai && { model: ss1['mijhar.provider.tests'].openai.model, verdict: ss1['mijhar.provider.tests'].openai.verdict }, statusTest: st3?.test });

    // F-05 وCOR-AUD-02: المسح من الثاني والعودة إلى الأول.
    await to(tabA);
    await click(tabA, '[data-action="key-clear"]');
    const confirmA = await until((x) => x.confirm);
    await to(tabB);
    await click(tabB, '[data-action="key-clear"]');
    await until((x) => x.confirm);
    await click(tabB, '[data-action="key-clear-confirm"]');
    await until((x) => x.key === 'none');
    const nClear = onProvider();
    await to(tabA);
    const ca1 = await until((x) => x.key === 'none' && !x.confirm, 8000);
    await sleep(600);
    const ss2 = await session();
    check('ج. النوافذ', 'F-05: المسح من التبويب الثاني ينعكس في الأول عند العودة: لا مفتاح، ويُغلق تأكيد المسح المفتوح، ولا رسالة ولا نتيجة للمفتاح الممسوح', Boolean(confirmA) && Boolean(ca1) && !ca1.message && ca1.test === null && (ca1.listed ?? []).length === 0, ca1);
    check('ج. النوافذ', 'COR-AUD-02: القائمة ونتيجة الاختبار للمفتاح الممسوح حُذفتا من ذاكرة الجلسة عند قراءة الحالة التالية، بلا أي طلب', !ss2?.['mijhar.provider.models']?.openai && !ss2?.['mijhar.provider.tests']?.openai && onProvider() === nClear, ss2);
    await shoot('c1-after-clear-elsewhere');

    // الاستبدال من الثاني: مفتاح جديد، فلا يظهر في الأول شيء من القديم.
    await type(tabB, '#mj-key-input', KEY2);
    await click(tabB, '[data-action="key-save"]');
    // «احفظ وتحقق» يطلب المضيف وموافقة محتوى المواقع معًا، والمضيف وحده ممنوح من الجزء أ: تظهر النافذة الأصلية للموافقة فتُقبل.
    const p4 = await waitPrompt();
    if (p4?.shown) notes.push(`ج الاستبدال: ${await promptButton('primary')} (${p4.text.slice(0, 80)})`);
    await to(tabB);
    const cb2 = await until((x) => x.health === 'healthy');
    await to(tabA);
    const ca2 = await until((x) => x.key === 'session' && x.health === 'healthy', 8000);
    check('ج. النوافذ', 'الاستبدال من الثاني (المضيف ممنوح فلا نافذة): التحقق بالمفتاح الجديد وحده، والأول يعرضه «سليمًا» عند العودة بلا رسالة سابقة', Boolean(cb2) && Boolean(ca2) && !ca2.message && network.provider.at(-1)?.key === 'KEY2', { a: ca2, last: network.provider.at(-1) && { path: network.provider.at(-1).path, key: network.provider.at(-1).key } });

    // تبديل المزوّد من الثاني.
    await selectProvider(tabB, 'gemini');
    await until((x) => x.provider === 'gemini');
    await to(tabA);
    const ca3 = await until((x) => x.provider === 'gemini', 8000);
    check('ج. النوافذ', 'تبديل المزوّد إلى Gemini من الثاني ينعكس في الأول، بلا رسالة من OpenAI', Boolean(ca3) && !ca3.message && !/OpenAI/.test(ca3.checkText), ca3);
    await selectProvider(tabA, 'openai');
    await until((x) => x.provider === 'openai');

    // PI-1: رمز GitHub يُحفظ ويُمسح من الثاني.
    await to(tabA);
    const t0 = await tokenCard();
    await type(tabB, '#mj-token-input', TOKEN);
    await click(tabB, '[data-action="token-save"]');
    await waitUntil(async () => (await tokenCard())?.state === 'session', 8000);
    await to(tabA);
    const t1 = await waitUntil(async () => {
      const x = await tokenCard();
      return x?.state === 'session' ? x : null;
    }, 6000);
    check('ج. النوافذ', 'PI-1: رمز GitHub حُفظ من الثاني فتعرضه بطاقة الأول عند العودة إليه دون إعادة تحميل', t0?.state === 'none' && t1?.state === 'session', { before: t0, after: t1 ?? (await tokenCard()) });
    await to(tabB);
    await click(tabB, '[data-action="token-clear"]');
    await click(tabB, '[data-action="token-clear-confirm"]');
    await waitUntil(async () => (await tokenCard())?.state === 'none', 8000);
    await to(tabA);
    const t2 = await waitUntil(async () => {
      const x = await tokenCard();
      return x?.state === 'none' ? x : null;
    }, 6000);
    check('ج. النوافذ', 'PI-1: مسح الرمز من الثاني ينعكس في الأول عند العودة', t2?.state === 'none', t2 ?? (await tokenCard()));
    await shoot('c2-token-after-clear-elsewhere');

    // ======================= د. إزالة الإضافة تمحو تخزينها (privacy.md#retention) =======================
    const used = await runAsync(`return Object.keys(await globalThis_.browser.storage.local.get(null)).sort();`);
    // الإزالة تغلق تبويبات الإضافة كلها، فتُغلق نافذتها إن لم يبقَ فيها غيرها: يُفتح قبلها تبويب محايد يبقى، ويُنتقل إليه بعدها.
    await setContext('content');
    const { handle: keep } = await c.send('WebDriver:NewWindow', { type: 'tab' });
    await c.send('Addon:Uninstall', { id: addonId });
    await sleep(1000);
    await c.send('WebDriver:SwitchToWindow', { handle: keep });
    current = keep;
    const { value: again } = await c.send('Addon:Install', { path: path.join(ROOT, 'dist/firefox'), temporary: true });
    const host2 = await chrome('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [again]);
    await setContext('content');
    const { handle: tabC } = await c.send('WebDriver:NewWindow', { type: 'tab' });
    await to(tabC);
    await c.send('WebDriver:Navigate', { url: `moz-extension://${host2}/options.html` });
    await ready();
    const after = await runAsync(`return { local: Object.keys(await globalThis_.browser.storage.local.get(null)).sort(), session: Object.keys(await globalThis_.browser.storage.session.get(null)).sort() };`);
    check('د. الإزالة', 'إزالة الإضافة (Addon:Uninstall) ثم تثبيتها بالمعرّف نفسه: التخزين كتثبيت جديد، فلا إعداد ولا سرّ ولا حالة مما كُتب قبلها', again === addonId && JSON.stringify(after?.local) === JSON.stringify(freshKeys) && (after?.session ?? []).length === 0 && used.length > freshKeys.length, { fresh: freshKeys, beforeUninstall: used, after });

    const everything = JSON.stringify({ steps, notes });
    check('الأسرار', 'لا مفتاح ولا رمز في أي نتيجة مسجلة، وكل مضيف غير المحلية محجوب ومسرود', !hasSecret(everything), [...network.blocked]);
    return { browser: `Firefox ${capabilities.browserVersion}`, headless: false, promptPref, blocked: [...network.blocked], providerRequests: network.provider.map((r) => `${r.method} ${r.path} ${r.key} (${r.mode})`), githubApi: network.api.map((r) => `${r.path} ${r.auth}`) };
  } finally {
    await close();
  }
}

const meta = await main().catch((error) => {
  console.error(error);
  return { error: String(error?.stack ?? error) };
});
const passed = steps.filter((s) => s.ok === true).length;
const failed = steps.filter((s) => s.ok === false).length;
const skipped = steps.filter((s) => s.ok === null).length;
fs.writeFileSync(path.join(HERE, 'firefox-result.json'), `${JSON.stringify({ at: new Date().toISOString(), ...meta, passed, failed, notRun: skipped, steps, notes }, null, 2)}\n`);
console.log(`${meta.browser ?? 'Firefox'}: ${passed} اجتاز · ${failed} فشل · ${skipped} لم يُجرَ`);
for (const n of notes) console.log(`ملاحظة: ${n}`);
process.exit(failed || meta.error ? 1 : 0);

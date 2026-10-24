#!/usr/bin/env node
// استكمال I-8 من مراجعة الموجة I (evidence/wave-I/review.md): نافذة موافقة Firefox الأصلية لصلاحية مضيف المزوّد وموافقة «مشاركة محتوى المواقع»
// (websiteContent، AD-15)، في ملف تعريف تجريبي جديد **بلا** تفضيل القبول الآلي (extensions.webextOptionalPermissionPrompts يبقى على قيمته الافتراضية)،
// ونافذة Firefox مرئية (بلا -headless). الحزمة المشحونة dist/firefox كما هي بلا تعديل. والمفتاح مختلَق يُولَّد وقت التشغيل، ومضيف المزوّد وGitHub
// يُخدمان محليًا خلف وكيل CONNECT يرفض كل مضيف آخر، فلا مفتاح حقيقي ولا محتوى خاص يصل أي خدمة.
//   1. العرض: نقرة «احفظ المفتاح» (نقرة Marionette على العنصر: حدث مستخدم) تُظهر نافذة الإذن الأصلية في واجهة المتصفح؛ يُقرأ نصها وبنودها من DOM
//      واجهة المتصفح (سياق chrome) وتُلتقط.
//   2. الرفض: زر النافذة الثانوي. البطاقة «غير ممنوحتين»، والمفتاح محفوظ «غير متحقق منه»، وصفر طلبات إلى المزوّد؛ والخلفية ترفض طلب تحليل يُرسل
//      إليها مباشرة (permission) دون طلب.
//   3. القبول: «تحقق من المفتاح» يطلبهما ثانية فتظهر النافذة، وزرها الأساسي. permissions.getAll فيها المضيف وwebsiteContent، والبطاقة «ممنوحتان»،
//      وطلب التحقق المعلن وحده؛ والخلفية تقبل التحليل (إلى المضيف المحلي).
//   4. السحب من إدارة الإضافات في Firefox (about:addons ← «الصلاحيات والبيانات»): مفتاح «مشاركة محتوى المواقع». البطاقة تعود «غير ممنوحتين»
//      والخلفية ترفض التحليل بلا طلب. ثم سحبهما من زر البطاقة نفسها بعد منح جديد.
// الاستعمال: node evidence/T-11.6/firefox-native-consent/check.mjs ← result.json وscreens/ في المجلد نفسه.
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

const KEY = ['sk', 'ant', 'api03', 'FirefoxNativeConsentFakeKey'.repeat(3)].join('-');
const hasKey = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? null)).includes(KEY);
const MODELS = [{ type: 'model', id: 'mock-sonnet-2', display_name: 'Mock Sonnet 2', max_tokens: 64000 }];

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

// ---------- خوادم محلية: github.com وapi.anthropic.com خلف وكيل CONNECT ----------
function certificates(workDir, hosts) {
  const file = (name) => path.join(workDir, name);
  const openssl = (...a) => execFileSync('openssl', a, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-firefox-consent-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('key.pem'), '-out', file('leaf.csr'), '-subj', '/CN=github.com');
  fs.writeFileSync(file('leaf.ext'), `subjectAltName=${hosts.map((h) => `DNS:${h}`).join(',')}\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`);
  openssl('x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-out', file('cert.pem'), '-days', '1', '-extfile', file('leaf.ext'));
  return { key: fs.readFileSync(file('key.pem')), cert: fs.readFileSync(file('cert.pem')), caDer: fs.readFileSync(file('ca.pem'), 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '') };
}

async function servers(workDir, network) {
  const HOSTS = ['github.com', 'api.github.com', 'api.anthropic.com'];
  const { key, cert, caDer } = certificates(workDir, HOSTS);
  const site = https.createServer({ key, cert }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const url = new URL(req.url, `https://${host}`);
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
      if (host === 'api.anthropic.com') {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, cors);
          res.end();
          return;
        }
        network.provider.push({ method: req.method, path: url.pathname + url.search, hasKey: req.headers['x-api-key'] === KEY, authorization: Boolean(req.headers.authorization) });
        if (url.pathname.startsWith('/v1/models')) {
          res.writeHead(200, { 'content-type': 'application/json', ...cors });
          res.end(JSON.stringify({ data: MODELS, has_more: false }));
          return;
        }
        const text = JSON.stringify({ summary: 'رد وهمي محلي.', findings: [], next_steps: [], missing: [] });
        res.writeHead(200, { 'content-type': 'application/json', ...cors });
        res.end(JSON.stringify({ id: 'msg_mock', type: 'message', role: 'assistant', model: 'mock-sonnet-2', content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }));
        return;
      }
      if (host === 'api.github.com') {
        network.api.push(url.pathname);
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end('{"message":"Not Found"}');
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
  console.log(`  ${ok ? '✓' : '✗'} [${part}] ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 500)}`}`);
};
const notRun = (part, name, why) => {
  steps.push({ part, name, ok: null, notRun: why });
  console.log(`  – لم يُجرَ [${part}] ${name}: ${why}`);
};

async function main() {
  fs.mkdirSync(SCREENS, { recursive: true });
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-ff-native-consent-'));
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
    await chrome(`Cc['@mozilla.org/security/x509certdb;1'].getService(Ci.nsIX509CertDB).addCertFromBase64(arguments[0], 'C,,'); return true;`, [srv.caDer]);
    const promptPref = await chrome(`return Services.prefs.getBoolPref('extensions.webextOptionalPermissionPrompts', true);`);
    check('إعداد', 'ملف تعريف جديد بلا قبول آلي: extensions.webextOptionalPermissionPrompts على قيمته الافتراضية (true)', promptPref === true, { promptPref });
    const { value: addonId } = await c.send('Addon:Install', { path: path.join(ROOT, 'dist/firefox'), temporary: true });
    const host = await chrome('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [addonId]);
    const origin = `moz-extension://${host}`;
    const declared = await chrome(`const p = WebExtensionPolicy.getByID(arguments[0]); return { name: p.name, optional: p.extension?.manifest?.optional_host_permissions ?? null, dc: p.extension?.manifest?.browser_specific_settings?.gecko?.data_collection_permissions ?? null };`, [addonId]);
    check('إعداد', 'الحزمة المشحونة كما هي: api.anthropic.com اختيارية، وwebsiteContent اختيارية في الإعلان', JSON.stringify(declared.optional ?? []).includes('api.anthropic.com') && JSON.stringify(declared.dc ?? {}).includes('websiteContent'), declared);

    // التبويبات والسياق.
    await setContext('content');
    const { value: firstHandle } = await c.send('WebDriver:GetWindowHandle');
    await c.send('WebDriver:Navigate', { url: `${origin}/options.html` });
    const runAsync = async (code, a = []) => {
      await setContext('content');
      const script = `const done = arguments[arguments.length - 1]; const window_ = window; const globalThis_ = window.wrappedJSObject ?? window; (async function () { const window = window_; const document = window_.document; ${code} }).apply(null, Array.prototype.slice.call(arguments, 0, -1)).then((v) => done(v === undefined ? null : JSON.parse(JSON.stringify(v))), (e) => done({ thrown: String(e) }));`;
      return (await c.send('WebDriver:ExecuteAsyncScript', { script, args: a })).value;
    };
    const toOptions = async () => {
      await setContext('content');
      await c.send('WebDriver:SwitchToWindow', { handle: firstHandle });
    };
    await waitUntil(async () => (await runAsync(`return document.querySelector('#app')?.getAttribute('data-ready');`)) === 'true', 15000);
    const element = async (selector) => {
      const { value } = await c.send('WebDriver:FindElement', { using: 'css selector', value: selector });
      return value[ELEMENT] ?? Object.values(value)[0];
    };
    const clickOptions = async (selector) => {
      await toOptions();
      await runAsync(`document.querySelector(arguments[0])?.scrollIntoView({ block: 'center' });`, [selector]);
      await c.send('WebDriver:ElementClick', { id: await element(selector) });
    };
    const card = () => runAsync(`const c = document.querySelector('[data-connection="provider-key"]'); return c ? { permission: c.querySelector('[data-provider-permission]')?.getAttribute('data-provider-permission') ?? null, permissionText: c.querySelector('[data-provider-permission]')?.textContent ?? '', key: c.querySelector('[data-key-state]')?.getAttribute('data-key-state') ?? null, health: c.querySelector('[data-key-check]')?.getAttribute('data-health') ?? null, message: [...c.querySelectorAll('.notice[role="status"], .notice[role="alert"], [data-key-message]')].map((n) => n.textContent).join(' | '), revoke: Boolean(c.querySelector('[data-action="key-revoke"]')), revokeEnabled: c.querySelector('[data-action="key-revoke"]')?.disabled === false, html: c.outerHTML } : null;`);
    const perms = () => runAsync(`return JSON.parse(JSON.stringify(await globalThis_.browser.permissions.getAll()));`);
    // التحليل مباشرة عبر رسالة الخلفية (كما يرسلها القسم بعد الموافقة): يثبت المنع في الخلفية لا في الواجهة وحدها.
    const analyzeDirect = () =>
      runAsync(`return await globalThis_.browser.runtime.sendMessage({ type: 'mijhar/provider', op: 'analyze', requestId: 'ff-native-' + Date.now(), section: 'checks', model: 'mock-sonnet-2', system: 'test', prompt: 'نص اختبار محلي بلا محتوى خاص' });`);
    const statusDirect = () => runAsync(`return await globalThis_.browser.runtime.sendMessage({ type: 'mijhar/provider', op: 'status' });`);

    // النافذة الأصلية في واجهة المتصفح.
    const prompt = () =>
      chrome(`
        const panel = document.getElementById('notification-popup');
        const n = PopupNotifications.getNotification('addon-webext-permissions', gBrowser.selectedBrowser) ?? PopupNotifications.panel?.querySelector('popupnotification')?.notification ?? null;
        const el = [...(panel?.querySelectorAll('popupnotification') ?? [])].find((x) => !x.hidden) ?? null;
        if (!el) return { open: panel?.state ?? null, shown: false };
        const items = [...el.querySelectorAll('li, .webext-perm-granted, .webext-perm-optional, [class*="perm"] label, moz-checkbox')].map((x) => (x.label ?? x.textContent ?? '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
        return {
          open: panel.state,
          shown: true,
          id: el.id,
          notificationId: n?.id ?? null,
          header: (el.getAttribute('label') ?? '') + ' ' + (el.querySelector('.popup-notification-description')?.textContent ?? ''),
          text: el.textContent.replace(/\\s+/g, ' ').trim(),
          items: [...new Set(items)],
          primary: el.querySelector('.popup-notification-primary-button')?.label ?? el.getAttribute('buttonlabel') ?? null,
          secondary: el.querySelector('.popup-notification-secondary-button')?.label ?? el.getAttribute('secondarybuttonlabel') ?? null,
        };
      `);
    const promptButton = async (which) => {
      // نقرة على زر النافذة الأصلية نفسها: عنصر واجهة المتصفح بنقرة Marionette، وإن تعذّرت فـclick() على الزر نفسه، ويُسجَّل أيهما جرى.
      await setContext('chrome');
      const sel = which === 'primary' ? '#notification-popup popupnotification:not([hidden]) .popup-notification-primary-button' : '#notification-popup popupnotification:not([hidden]) .popup-notification-secondary-button';
      // أولًا نقرة Marionette (حدث فأرة يركّبه المتصفح) على الزر الأصلي داخل moz-button؛ ثم يُنظر أأُغلقت النافذة.
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
      // لقطة نافذة المتصفح من سياق chrome (تشمل اللوحة المنبثقة إن رسمها المتصفح في النافذة نفسها).
      try {
        await setContext('chrome');
        const { value } = await c.send('WebDriver:TakeScreenshot', { full: false });
        fs.writeFileSync(path.join(SCREENS, `${name}.png`), Buffer.from(value, 'base64'));
        return true;
      } catch (error) {
        notes.push(`لقطة ${name}: ${String(error.message).slice(0, 160)}`);
        return false;
      }
    };
    const shootPanel = async (name) => {
      try {
        await setContext('chrome');
        const id = await element('#notification-popup');
        const { value } = await c.send('WebDriver:TakeScreenshot', { id, full: false });
        fs.writeFileSync(path.join(SCREENS, `${name}.png`), Buffer.from(value, 'base64'));
        return true;
      } catch (error) {
        notes.push(`لقطة اللوحة ${name}: ${String(error.message).slice(0, 160)}`);
        return false;
      }
    };

    // ---------- 1. العرض ----------
    const start = await waitUntil(async () => {
      const x = await card();
      return x && x.permission !== 'checking' ? x : null;
    }, 10000);
    check('العرض', 'قبل الحفظ: البطاقة تعلن موافقة «مشاركة محتوى المواقع» و«غير ممنوحتين»، ولا طلب إلى المزوّد', start?.permission === 'denied' && start.html.includes('websiteContent') && network.provider.length === 0, start && { permission: start.permission, text: start.permissionText });
    await toOptions();
    await c.send('WebDriver:ElementSendKeys', { id: await element('#mj-key-input'), text: KEY });
    await clickOptions('[data-action="key-save"]');
    const shown1 = await waitUntil(async () => {
      const p = await prompt();
      return p?.shown ? p : null;
    }, 10000);
    await sleep(600);
    await shoot('1-native-prompt-window');
    await shootPanel('1-native-prompt-panel');
    fs.writeFileSync(path.join(HERE, 'prompt-1.json'), `${JSON.stringify(shown1, null, 2)}\n`);
    check('العرض', 'نقرة الحفظ تُظهر نافذة الإذن الأصلية في واجهة Firefox (لا قبول آلي)', Boolean(shown1?.shown), shown1);
    const t1 = shown1?.text ?? '';
    check('العرض', 'النافذة تذكر المضيف api.anthropic.com وبند مشاركة محتوى المواقع', /api\.anthropic\.com/.test(t1) && /(website content|محتوى المواقع|محتوى الموقع|Share website)/i.test(t1), { text: t1.slice(0, 400), items: shown1?.items });
    check('العرض', 'قبل أي ردّ على النافذة: صفر طلبات إلى المزوّد', network.provider.length === 0, network.provider);

    // ---------- 2. الرفض ----------
    const denyMethod = await promptButton('secondary');
    notes.push(`الرفض: ${denyMethod}`);
    const afterDeny = await waitUntil(async () => {
      const x = await card();
      return x && x.key && x.key !== 'none' && x.key !== 'checking' && x.permission === 'denied' ? x : null;
    }, 10000);
    await sleep(500);
    const p2 = await perms();
    check('الرفض', `زر النافذة الثانوي («${shown1?.secondary ?? '?'}»): لا صلاحية ولا websiteContent في permissions.getAll`, !JSON.stringify(p2?.origins ?? []).includes('api.anthropic.com') && !JSON.stringify(p2?.data_collection ?? []).includes('websiteContent'), p2);
    check('الرفض', 'البطاقة «غير ممنوحتين»، والمفتاح محفوظ «غير متحقق منه» بلا أي طلب إلى المزوّد', afterDeny?.permission === 'denied' && network.provider.length === 0, afterDeny && { permissionText: afterDeny.permissionText, key: afterDeny.key, message: afterDeny.message });
    await shoot('2-after-deny-options');
    const s2 = await statusDirect();
    const deniedAnalyze = await analyzeDirect();
    // بلا تحقق لم تُقرأ قائمة المودلات، فتمنع الخلفية بسبب المودل قبل الصلاحية؛ وكلاهما منع محلي بلا طلب (status null).
    check('الرفض', 'المنع في الخلفية: الحالة permission=false، وطلب تحليل يُرسل إلى الخلفية مباشرة يُرفض محليًا بلا أي طلب', s2?.permission === false && deniedAnalyze?.ok === false && deniedAnalyze.status === null && ['permission', 'model-changed'].includes(deniedAnalyze.failure) && network.provider.length === 0, { permission: s2?.permission, analyze: deniedAnalyze });

    // ---------- 3. القبول ----------
    await clickOptions('[data-action="key-check"]');
    const shown2 = await waitUntil(async () => {
      const p = await prompt();
      return p?.shown ? p : null;
    }, 10000);
    await sleep(500);
    await shoot('3-native-prompt-again');
    check('القبول', '«تحقق من المفتاح» يطلبهما ثانية فتظهر النافذة الأصلية نفسها', Boolean(shown2?.shown), shown2);
    const allowMethod = await promptButton('primary');
    notes.push(`القبول: ${allowMethod}`);
    const afterAllow = await waitUntil(async () => {
      const x = await card();
      return x?.permission === 'granted' && x.health === 'healthy' ? x : null;
    }, 12000);
    const p3 = await perms();
    check('القبول', `زر النافذة الأساسي («${shown1?.primary ?? '?'}»): المضيف وwebsiteContent في permissions.getAll`, JSON.stringify(p3?.origins ?? []).includes('api.anthropic.com') && JSON.stringify(p3?.data_collection ?? []).includes('websiteContent'), p3);
    const verifies = network.provider.map((r) => `${r.method} ${r.path}`);
    check('القبول', 'البطاقة «ممنوحتان» والمفتاح «سليم» بطلب التحقق المعلن وحده (GET /v1/models بالمفتاح بلا Authorization)', afterAllow && network.provider.length === 1 && network.provider[0].method === 'GET' && network.provider[0].path.startsWith('/v1/models') && network.provider[0].hasKey && !network.provider[0].authorization, { verifies, card: afterAllow && afterAllow.permissionText });
    await shoot('3-after-allow-options');
    const allowedAnalyze = await analyzeDirect();
    check('القبول', 'الخلفية تقبل التحليل بعد المنح: طلب POST واحد إلى المضيف المحلي', allowedAnalyze?.ok === true && network.provider.filter((r) => r.method === 'POST').length === 1, { ok: allowedAnalyze?.ok, failure: allowedAnalyze?.failure, posts: network.provider.filter((r) => r.method === 'POST').length });

    // ---------- 4. السحب من إدارة الإضافات ----------
    const postsBefore = network.provider.filter((r) => r.method === 'POST').length;
    await setContext('content');
    const { handle: addonsTab } = await c.send('WebDriver:NewWindow', { type: 'tab' });
    await c.send('WebDriver:SwitchToWindow', { handle: addonsTab });
    await c.send('WebDriver:Navigate', { url: 'about:addons' });
    await sleep(800);
    const viewOpened = await chrome(
      `const win = gBrowser.selectedBrowser.contentWindow; if (!win?.gViewController) return 'no-controller'; win.gViewController.loadView('addons://detail/' + encodeURIComponent(arguments[0]) + '/permissions'); return true;`,
      [addonId],
    ).catch((e) => String(e.message));
    const toggle = await waitUntil(
      () =>
        chrome(`
          const doc = gBrowser.selectedBrowser.contentDocument;
          const find = (root) => {
            for (const el of root.querySelectorAll('*')) {
              if (el.shadowRoot) { const f = find(el.shadowRoot); if (f) return f; }
            }
            return [...root.querySelectorAll('moz-toggle, input[type="checkbox"]')].map((t) => ({ t, label: (t.label ?? t.getAttribute('label') ?? t.closest('li, label, div')?.textContent ?? '').replace(/\\s+/g, ' ').trim() }));
          };
          const all = [];
          const walk = (root) => { for (const t of root.querySelectorAll('moz-toggle, input[type="checkbox"]')) all.push(t); for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot); };
          walk(doc);
          const rows = all.map((t) => ({ label: (t.label ?? t.getAttribute('label') ?? t.getAttribute('data-l10n-id') ?? t.closest('li, label, div')?.textContent ?? '').replace(/\\s+/g, ' ').trim(), pressed: t.pressed ?? t.checked ?? null, id: t.id ?? '', dataPermission: t.getAttribute('permission-key') ?? t.dataset?.permissionKey ?? t.getAttribute('data-permission') ?? '' }));
          return rows.length ? rows : null;
        `),
      10000,
    );
    // تبويب «الأذونات والبيانات» في صفحة الإضافة ظاهرًا قبل اللقطة.
    const tabShown = await chrome(`
      const doc = gBrowser.selectedBrowser.contentDocument;
      const all = [];
      const walk = (root) => { for (const b of root.querySelectorAll('button[name="permissions"], named-deck-button[name="permissions"]')) all.push(b); for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot); };
      walk(doc);
      if (!all.length) return 'no-tab';
      all[0].click();
      return 'clicked';
    `);
    await sleep(800);
    fs.writeFileSync(path.join(HERE, 'about-addons-permissions.json'), `${JSON.stringify({ viewOpened, tabShown, toggle }, null, 2)}\n`);
    await shoot('4-about-addons-permissions');
    const target = (toggle ?? []).find((r) => /website ?content|محتوى المواقع|websiteContent/i.test(`${r.label} ${r.id} ${r.dataPermission}`));
    if (!target) {
      notRun('السحب', 'مفتاح «مشاركة محتوى المواقع» في about:addons', `لم يُعثر على المفتاح في صفحة الصلاحيات (${JSON.stringify(toggle)?.slice(0, 200)})`);
    } else {
      const flipped = await chrome(
        `
          const doc = gBrowser.selectedBrowser.contentDocument;
          const all = [];
          const walk = (root) => { for (const t of root.querySelectorAll('moz-toggle, input[type="checkbox"]')) all.push(t); for (const el of root.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot); };
          walk(doc);
          const t = all.find((x) => ((x.label ?? x.getAttribute('label') ?? x.getAttribute('data-l10n-id') ?? x.closest('li, label, div')?.textContent ?? '') + ' ' + (x.id ?? '') + ' ' + (x.getAttribute('permission-key') ?? x.dataset?.permissionKey ?? x.getAttribute('data-permission') ?? '')).match(/website ?content|محتوى المواقع|websiteContent/i));
          if (!t) return 'not-found';
          (t.buttonEl ?? t).click();
          return 'clicked';
        `,
      );
      notes.push(`السحب من about:addons: ${flipped} (نقرة click() على مفتاح الصفحة من سياق المتصفح)`);
      await sleep(1200);
      await shoot('4-after-toggle-off');
      const p4 = await perms();
      check('السحب', 'مفتاح «مشاركة محتوى المواقع» في إدارة الإضافات يسحب websiteContent', !JSON.stringify(p4?.data_collection ?? []).includes('websiteContent'), p4);
      await toOptions();
      const afterRevoke = await waitUntil(async () => {
        const x = await card();
        return x?.permission === 'denied' ? x : null;
      }, 8000);
      check('السحب', 'البطاقة في الإعدادات تنعكس «غير ممنوحتين» دون إعادة تحميل', afterRevoke?.permission === 'denied', afterRevoke && afterRevoke.permissionText);
      const s4 = await statusDirect();
      const revokedAnalyze = await analyzeDirect();
      check('السحب', 'الخلفية: الحالة permission=false، وطلب التحليل يُرفض (permission) بلا أي طلب', s4?.permission === false && revokedAnalyze?.ok === false && revokedAnalyze.failure === 'permission' && network.provider.filter((r) => r.method === 'POST').length === postsBefore, { permission: s4?.permission, analyze: revokedAnalyze, posts: network.provider.filter((r) => r.method === 'POST').length });
      await shoot('4-after-revoke-options');
    }

    // ---------- 5. سحبهما من زر البطاقة بعد منح جديد ----------
    await clickOptions('[data-action="key-check"]');
    const shown3 = await waitUntil(async () => {
      const p = await prompt();
      return p?.shown ? p : null;
    }, 10000);
    if (shown3?.shown) {
      await promptButton('primary');
      // المنح يتبعه طلب التحقق والزر معطّل أثناءه (busy): يُنتظر انتهاؤه قبل النقر.
      const ready = await waitUntil(async () => {
        const x = await card();
        return x?.permission === 'granted' && x.health === 'healthy' && x.revokeEnabled ? x : null;
      }, 12000);
      notes.push(`السحب من البطاقة: الزر مفعّل قبل النقر = ${Boolean(ready)}`);
      await clickOptions('[data-action="key-revoke"]');
      const afterCardRevoke = await waitUntil(async () => {
        const x = await card();
        return x?.permission === 'denied' ? x : null;
      }, 8000);
      const cardAfterClick = await card();
      const p5 = await perms();
      const r5 = await analyzeDirect();
      // تشخيص: الاستدعاء نفسه الذي يجريه زر البطاقة (ProviderHostPermission.revoke) مباشرة من صفحة الإعدادات.
      const direct = await runAsync(`try { const r = await globalThis_.browser.permissions.remove({ origins: ['https://api.anthropic.com/*'], data_collection: ['websiteContent'] }); return { result: r, after: JSON.parse(JSON.stringify(await globalThis_.browser.permissions.getAll())) }; } catch (e) { return { thrown: String(e && e.message || e) }; }`);
      const originOnly = await runAsync(`try { const r = await globalThis_.browser.permissions.remove({ origins: ['https://api.anthropic.com/*'] }); return { result: r, after: JSON.parse(JSON.stringify(await globalThis_.browser.permissions.getAll())) }; } catch (e) { return { thrown: String(e && e.message || e) }; }`);
      fs.writeFileSync(path.join(HERE, 'revoke-diagnosis.json'), `${JSON.stringify({ cardAfterClick: cardAfterClick && { permission: cardAfterClick.permission, message: cardAfterClick.message, revokeButton: cardAfterClick.revoke }, before: p5, analyzeAfterClick: r5 && { ok: r5.ok, failure: r5.failure ?? null }, directRemoveBoth: direct, directRemoveOriginOnly: originOnly }, null, 2)}\n`);
      check('السحب', 'زر «اسحب صلاحية api.anthropic.com وموافقة محتوى المواقع» في البطاقة يسحبهما معًا، والخلفية ترفض التحليل بلا طلب', afterCardRevoke && !JSON.stringify(p5?.origins ?? []).includes('api.anthropic.com') && !JSON.stringify(p5?.data_collection ?? []).includes('websiteContent') && r5?.failure === 'permission', { p5, r5 });
    } else {
      notRun('السحب', 'السحب من زر البطاقة', 'لم تظهر النافذة للمنح الثاني');
    }

    const everything = JSON.stringify({ steps, network: { ...network, blocked: [...network.blocked] } });
    check('الأسرار', 'لا مفتاح في أي نتيجة مسجلة، ولا مضيف خارجي (كل ما عدا github.com وapi.github.com وapi.anthropic.com محجوب ومسرود)', !hasKey(everything), [...network.blocked]);
    return { browser: `Firefox ${capabilities.browserVersion}`, headless: false, promptPref, blocked: [...network.blocked], providerRequests: network.provider.map((r) => `${r.method} ${r.path}`) };
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
fs.writeFileSync(path.join(HERE, 'result.json'), `${JSON.stringify({ at: new Date().toISOString(), ...meta, passed, failed, notRun: skipped, steps, notes }, null, 2)}\n`);
console.log(`${meta.browser ?? 'Firefox'}: ${passed} اجتاز · ${failed} فشل · ${skipped} لم يُجرَ`);
for (const n of notes) console.log(`ملاحظة: ${n}`);
process.exit(failed || meta.error ? 1 : 0);

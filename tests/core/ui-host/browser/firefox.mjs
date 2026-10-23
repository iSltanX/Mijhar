// تجارب Firefox لـT-1.4 عبر Marionette. لا يعترض Playwright طلبات Firefox، فيُخدَم github.com وapi.github.com من خادم
// HTTPS محلي بشهادة ذاتية التوقيع خلف وكيل CONNECT محلي يرفض كل مضيف آخر: لا يخرج من ملف التعريف المؤقت أي طلب، ويُعدّ
// كل طلب إلى api.github.com من أي سياق (ترويسة Host) فيكون تدقيق الشبكة كاملًا.
//  - الصلاحية: extensions.webextOptionalPermissionPrompts=false يمنحها دون نافذة، ويبقى شرط فعل المستخدم قائمًا (يُقاس).
//  - الأمر: استدعاء عنصر <key> الذي يسجّله Firefox للاختصار (doCommand) هو مسار الضغطة نفسه بإشارة فعل المستخدم.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { BROWSERS } from '../../../../scripts/load-check.mjs';
import { buildUiHostTestExtension } from './build.mjs';
import { PAGE_KEYS, UI_KEYS, UI_PROPS, contentState, diffSnapshots, drawerFocus, mountedUnits, snapshotPage, snapshotUi } from './probes.mjs';
import { CONTROL_URL, HOSTILE_URL, PAGES, readFixture, waitUntil } from './pages.mjs';

const UNITS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const SERVED = new Set(['github.com', 'api.github.com']);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      if (error) throw new Error(`${name}: ${error.error ?? ''} ${error.message ?? ''}`.trim() || JSON.stringify(error));
      return result;
    },
  };
}

/**
 * شهادة الخادم المحلي: جهة إصدار اختبارية تُضاف موثوقةً في ملف التعريف المؤقت وحده (يُحذف بعد التشغيل)، وشهادة لـgithub.com
 * وapi.github.com موقّعة منها. github.com في قائمة HSTS المضمّنة فلا يقبل Firefox تجاوز خطأ شهادة له.
 */
function makeCertificates(workDir) {
  const file = (name) => path.join(workDir, name);
  const openssl = (...args) => execFileSync('openssl', args, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-ui-host-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('key.pem'), '-out', file('leaf.csr'), '-subj', '/CN=github.com');
  fs.writeFileSync(file('leaf.ext'), 'subjectAltName=DNS:github.com,DNS:api.github.com\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  openssl('x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-out', file('cert.pem'), '-days', '1', '-extfile', file('leaf.ext'));
  const caDer = fs.readFileSync(file('ca.pem'), 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return { key: fs.readFileSync(file('key.pem')), cert: fs.readFileSync(file('cert.pem')), caDer };
}

/** خادم HTTPS للعينات ووكيل CONNECT أمامه. log: كل طلب بمضيفه، وكل CONNECT مرفوض. */
async function startServers(workDir) {
  const { key, cert, caDer } = makeCertificates(workDir);
  const log = { requests: [], refused: [] };
  const site = https.createServer({ key, cert }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    log.requests.push({ host, path: req.url, at: Date.now() });
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
    res.end(readFixture(page.file));
  });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const sitePort = site.address().port;
  const proxy = http.createServer((req, res) => {
    log.refused.push(`http ${req.url}`);
    res.writeHead(403);
    res.end();
  });
  // أنفاق CONNECT الحيّة: تُتلف كلها عند الإغلاق. مقبس نصف مغلق متوقف القراءة (بايتات وصلت من المتصفح بعد أن أنهى الخادم
  // المحلي جهته فارتدّ pipe) لا يُطلق end ولا يُبقي مقبضًا نشطًا، فيبقى _connections=1 فلا يُستدعى رد proxy.close() أبدًا
  // وتخرج Node برمز 13 («unsettled top-level await»).
  const tunnels = new Set();
  const adopt = (socket) => {
    tunnels.add(socket);
    socket.once('close', () => tunnels.delete(socket));
  };
  proxy.on('connect', (req, client, head) => {
    const host = req.url.split(':')[0];
    adopt(client);
    if (!SERVED.has(host)) {
      log.refused.push(host);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      client.resume(); // يُفرَّغ ما يصل بعد الرفض فيبلغ end ويُغلق المقبس
      return;
    }
    const upstream = net.connect(sitePort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    adopt(upstream);
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
    upstream.on('close', () => client.destroy());
    client.on('close', () => upstream.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  return {
    log,
    caDer,
    proxyPort: proxy.address().port,
    close: () => {
      for (const socket of tunnels) socket.destroy();
      return Promise.all([new Promise((r) => site.close(r)), new Promise((r) => proxy.close(r))]);
    },
  };
}

const prefs = (proxyPort) =>
  [
    ['marionette.port', 0],
    ['extensions.webextOptionalPermissionPrompts', false],
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

export async function firefoxRun({ outDir }) {
  const { executable } = BROWSERS.firefox;
  const extDir = await buildUiHostTestExtension('firefox');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-ui-host-ff-'));
  const profileDir = path.join(workDir, 'profile');
  fs.mkdirSync(profileDir);
  const servers = await startServers(workDir);
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${prefs(servers.proxyPort)}\n`);
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const result = { label: 'Firefox', steps: {} };
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
    const { value: id } = await c.send('Addon:Install', { path: extDir, temporary: true });
    await c.send('Marionette:SetContext', { value: 'chrome' });
    await c.send('WebDriver:ExecuteScript', {
      script: `Cc['@mozilla.org/security/x509certdb;1'].getService(Ci.nsIX509CertDB).addCertFromBase64(arguments[0], 'C,,'); return true;`,
      args: [servers.caDer],
    });
    await c.send('Marionette:SetContext', { value: 'content' });

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
    const chromeAsync = async (script, args = []) => {
      await setContext('chrome');
      return (await c.send('WebDriver:ExecuteAsyncScript', { script, args })).value;
    };
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
    const t = async (name, ...args) => {
      await switchTo('test');
      return runAsync(`return globalThis.__t[${JSON.stringify(name)}](...${JSON.stringify(args)});`);
    };
    const screenshot = async (file) => {
      await setContext('content');
      const { value } = await c.send('WebDriver:TakeScreenshot', {});
      fs.mkdirSync(path.join(outDir, 'screens'), { recursive: true });
      fs.writeFileSync(path.join(outDir, 'screens', file), Buffer.from(value, 'base64'));
    };
    const pressEscape = async () => {
      await setContext('content');
      await c.send('WebDriver:PerformActions', { actions: [{ type: 'key', id: 'kbd', actions: [{ type: 'keyDown', value: '' }, { type: 'keyUp', value: '' }] }] });
      await c.send('WebDriver:ReleaseActions');
    };
    // اختصار الإضافة كما يسجّله Firefox: <key> داخل keyset الإضافة في نافذة المتصفح؛ doCommand مسار الضغطة نفسه.
    const shortcut = () =>
      chrome(
        `const w = Services.wm.getMostRecentWindow('navigator:browser');
         const key = w.document.querySelector('keyset[id^="ext-keyset-id-"] > key');
         if (!key) return null;
         const info = { key: key.getAttribute('key'), modifiers: key.getAttribute('modifiers') };
         if (arguments[0]) key.doCommand();
         return info;`,
        [false],
      );
    const pressShortcut = () => chrome(`const w = Services.wm.getMostRecentWindow('navigator:browser'); const key = w.document.querySelector('keyset[id^="ext-keyset-id-"] > key'); key.doCommand(); return true;`);

    // الصفحة الأولى للجلسة تبقى لصفحة الاختبار.
    await setContext('content');
    const current = await c.send('WebDriver:GetWindowHandle');
    handles.test = current?.value ?? current;
    await c.send('WebDriver:Navigate', { url: `${origin}/test.html` });
    await waitUntil(async () => (await run(() => document.documentElement.getAttribute('data-ready'))) === 'true', 5000, 100);

    const githubTab = async (url) => (await t('githubTabs')).find((tab) => tab.url === url);
    const drawerTo = async (name, url, action, expected) => {
      const tab = await githubTab(url);
      await t('drawer', tab.id, action);
      await switchTo(name);
      return waitUntil(async () => (await run(contentState)).drawer === expected, 5000, 100);
    };
    const openGithub = async (name, url) => {
      await openTab(name, url);
      await waitUntil(async () => (await run(contentState)).content === 'ready', 10000, 100);
      await waitUntil(async () => (await run(mountedUnits)).length === 8, 5000, 100);
    };

    // ----- TEST-CORE-05 -----
    const isolation = {};
    for (const [name, url] of [['control', CONTROL_URL], ['hostile', HOSTILE_URL]]) {
      await openGithub(name, url);
      const state0 = await run(contentState);
      const before = await run(snapshotPage, UI_PROPS);
      const opened = await drawerTo(name, url, 'open', 'open');
      await sleep(250);
      const ui = await run(snapshotUi, UI_PROPS);
      const after = await run(snapshotPage, UI_PROPS);
      await screenshot(`firefox-${name}-drawer.png`);
      isolation[name] = { opened: Boolean(opened), state: state0, ui, before, after, pageDiffs: diffSnapshots(before, after, PAGE_KEYS) };
    }
    result.steps.isolation = {
      control: { opened: isolation.control.opened, meta: isolation.control.ui.drawerMeta, fakeMeta: isolation.control.ui.fakeMeta, rect: isolation.control.ui.drawerRect, hit: isolation.control.ui.drawerHit, pageDiffs: isolation.control.pageDiffs },
      hostile: { opened: isolation.hostile.opened, meta: isolation.hostile.ui.drawerMeta, fakeMeta: isolation.hostile.ui.fakeMeta, rect: isolation.hostile.ui.drawerRect, hit: isolation.hostile.ui.drawerHit, pageDiffs: isolation.hostile.pageDiffs, cspBlockedInlineStyle: isolation.hostile.state.bodyOutline !== 'rgb(0, 0, 255)' },
      uiDiffs: diffSnapshots(isolation.control.ui, isolation.hostile.ui, UI_KEYS),
      probes: UI_KEYS.filter((k) => isolation.control.ui[k] !== undefined).length,
      props: UI_PROPS.length,
      sample: { drawerFont: isolation.control.ui.drawer?.['font-family'], drawerBg: isolation.control.ui.drawer?.['background-color'], titleSize: isolation.control.ui.title?.['font-size'], buttonBg: isolation.control.ui.fakeButton?.['background-color'] },
    };
    await switchTo('hostile');
    await c.send('WebDriver:CloseWindow');
    delete handles.hostile;

    // ----- الدرج -----
    const drawer = {};
    await switchTo('control');
    drawer.focusOnOpen = await run(drawerFocus);
    await pressEscape();
    drawer.escapeClosed = Boolean(await waitUntil(async () => (await run(contentState)).drawer === 'closed', 3000, 100));
    drawer.toggleOpens = Boolean(await drawerTo('control', CONTROL_URL, 'toggle', 'open'));
    drawer.toggleCloses = Boolean(await drawerTo('control', CONTROL_URL, 'toggle', 'closed'));
    await drawerTo('control', CONTROL_URL, 'open', 'open');
    await run(() => document.querySelector('mijhar-host[data-mijhar-host="drawer"]').shadowRoot.querySelectorAll('[role="tab"]')[4].click());
    await sleep(200);
    drawer.settingsTabInDrawer = await run(() => {
      const shadow = document.querySelector('mijhar-host[data-mijhar-host="drawer"]').shadowRoot;
      const fields = [...shadow.querySelectorAll('input, textarea, [contenteditable]')].filter((el) => !['checkbox', 'radio'].includes(el.type));
      return { toggles: shadow.querySelectorAll('[data-section="units"] input[role="switch"]').length, textFields: fields.length, grantButton: Boolean(shadow.querySelector('[data-action="grant"]')), openOptions: Boolean(shadow.querySelector('[data-action="open-options"]')) };
    });
    // مفتاح من تبويب الإعدادات داخل الدرج: كتابة سكربت المحتوى إلى التخزين، فتُزال الوحدة (ح) وتعود.
    const drawerToggle = () => run(() => document.querySelector('mijhar-host[data-mijhar-host="drawer"]').shadowRoot.querySelector('label[for="mj-unit-h"]').click());
    await drawerToggle();
    drawer.toggleFromDrawerOff = Boolean(await waitUntil(async () => !(await run(mountedUnits)).includes('h'), 5000, 50));
    await drawerToggle();
    drawer.toggleFromDrawerOn = Boolean(await waitUntil(async () => (await run(mountedUnits)).includes('h'), 5000, 50));
    await run(() => document.querySelector('mijhar-host[data-mijhar-host="drawer"]').shadowRoot.querySelector('button[aria-label="إغلاق الدرج"]').click());
    drawer.closeButton = Boolean(await waitUntil(async () => (await run(contentState)).drawer === 'closed', 3000, 100));
    result.steps.drawer = drawer;

    // ----- TEST-CORE-06: المفاتيح الثمانية -----
    await openTab('options', `${origin}/options.html`);
    await waitUntil(async () => (await run(() => document.getElementById('app')?.getAttribute('data-ready'))) === 'true', 5000, 100);
    const checked = (unit) => run((u) => document.getElementById(`mj-unit-${u}`).checked, unit);
    // الوحدات الوهمية تُدرج محتوى في main فتزيح ما بعدها وقد تُظهر شريط التمرير: الموضع والأبعاد تتغير بالإدراج لا
    // بتسرب نمط، فتُقارن خصائص النمط وحدها.
    const toggles = { perUnit: [] };
    for (const unit of UNITS) {
      await switchTo('options');
      await click(`label[for="mj-unit-${unit}"]`);
      const isChecked = await checked(unit);
      await switchTo('control');
      const gone = await waitUntil(async () => !(await run(mountedUnits)).includes(unit), 5000, 50);
      toggles.perUnit.push({ unit, off: Boolean(gone), checked: isChecked });
    }
    await switchTo('control');
    toggles.allOffMounted = await run(mountedUnits);
    const pageNoUi = await run(snapshotPage, UI_PROPS);
    toggles.leakAllOffVsMounted = diffSnapshots(pageNoUi, isolation.control.before, PAGE_KEYS).filter((d) => !['rect', 'width', 'height'].includes(d.prop));
    toggles.documentSheetsAllOff = pageNoUi.documentSheets;
    toggles.documentSheetsDrawerOpen = isolation.control.after.documentSheets;
    await c.send('WebDriver:Refresh');
    await waitUntil(async () => (await run(contentState)).content === 'ready', 10000, 100);
    await sleep(400);
    toggles.afterReloadMounted = await run(mountedUnits);
    await switchTo('options');
    await c.send('WebDriver:Refresh');
    await waitUntil(async () => (await run(() => document.getElementById('app')?.getAttribute('data-ready'))) === 'true', 5000, 100);
    toggles.afterReloadChecked = [];
    for (const unit of UNITS) toggles.afterReloadChecked.push(await checked(unit));
    for (const unit of UNITS) {
      await switchTo('options');
      await click(`label[for="mj-unit-${unit}"]`);
      await switchTo('control');
      toggles.perUnit.find((p) => p.unit === unit).on = Boolean(await waitUntil(async () => (await run(mountedUnits)).includes(unit), 5000, 50));
    }
    toggles.allOnMounted = await run(mountedUnits);
    result.steps.toggles = toggles;

    // ----- الصلاحية وتدقيق الشبكة -----
    const apiRequests = () => servers.log.requests.filter((r) => r.host === 'api.github.com').length;
    const permission = {};
    const state = async () => {
      await switchTo('options');
      return run(() => document.querySelector('[data-permission-state]')?.getAttribute('data-permission-state'));
    };
    permission.requestsBeforeAnything = apiRequests();
    permission.initialState = await waitUntil(async () => ((await state()) === 'checking' ? null : state()), 3000, 100);
    permission.containsInitially = await t('contains');
    permission.fetchWithout = await t('fetchApi', '/zen');
    await switchTo('options');
    permission.requestWithoutClick = await runAsync(`return browser.permissions.request({ origins: ['https://api.github.com/*'] }).then((g) => ({ granted: g }), (e) => ({ rejected: e.message }));`);
    permission.containsAfterRequestWithoutClick = await t('contains');
    permission.requestsWhileNotGranted = apiRequests();
    await switchTo('options');
    await click('[data-action="grant"]');
    permission.stateAfterClick = await waitUntil(async () => ((await state()) === 'granted' ? 'granted' : null), 3000, 100) ?? (await state());
    permission.containsAfterGrant = await t('contains');
    permission.fetchWith = await t('fetchApi', '/zen');
    permission.requestsAfterGrant = apiRequests();
    await switchTo('options');
    await click('[data-action="revoke"]');
    permission.stateAfterRevoke = await waitUntil(async () => ((await state()) === 'denied' ? 'denied' : null), 3000, 100) ?? (await state());
    permission.containsAfterRevoke = await t('contains');
    permission.fetchAfterRevoke = await t('fetchApi', '/zen');
    permission.requestsAfterRevoke = apiRequests();
    // سحب من إعدادات المتصفح (about:addons ← الأذونات): يظهر في الصفحة عبر onRemoved.
    await switchTo('options');
    await click('[data-action="grant"]');
    await waitUntil(async () => (await state()) === 'granted', 3000, 100);
    await chromeAsync(
      `const [id, done] = arguments; const { ExtensionPermissions } = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs');
       const policy = WebExtensionPolicy.getByID(id);
       ExtensionPermissions.remove(id, { permissions: [], origins: ['https://api.github.com/*'] }, policy.extension).then(() => done(true), (e) => done(String(e)));`,
      [id],
    );
    permission.stateAfterBrowserRevoke = await waitUntil(async () => ((await state()) === 'denied' ? 'denied' : null), 3000, 100) ?? (await state());
    permission.containsAfterBrowserRevoke = await t('contains');
    result.steps.permission = permission;

    // ----- الشريط الجانبي الأصلي -----
    const native = {};
    await switchTo('test');
    await click('#open-native');
    native.openResult = await waitUntil(async () => {
      const out = await run(() => document.getElementById('out').textContent);
      return out && !out.includes('pending') ? JSON.parse(out) : null;
    }, 5000, 100);
    await sleep(800);
    native.sidebarOpen = await t('sidebarOpen');
    native.sidebarView = await t('sidebarView');
    result.steps.native = native;

    // ----- الأمر -----
    const command = {};
    await switchTo('control');
    command.registered = (await t('commands')).find((x) => x.name === 'toggle-panel') ?? null;
    command.keyElement = await shortcut();
    await switchTo('control');
    await pressShortcut();
    await sleep(500);
    command.nativeToggleCloses = (await t('sidebarOpen')) === false;
    await switchTo('control');
    await pressShortcut();
    await sleep(500);
    command.nativeToggleOpens = (await t('sidebarOpen')) === true;
    command.nativeOutcomes = (await t('outcomes')).slice(-2).map((o) => o.outcome);
    await switchTo('options');
    await click('input[name="mj-surface"][value="drawer"]');
    await sleep(400);
    await switchTo('control');
    await pressShortcut();
    command.drawerPref = { drawer: await waitUntil(async () => ((await run(contentState)).drawer === 'open' ? 'open' : null), 3000, 100), sidebarUnchanged: (await t('sidebarOpen')) === true };
    await switchTo('control');
    await pressShortcut();
    command.drawerPrefClosesOnSecond = Boolean(await waitUntil(async () => (await run(contentState)).drawer === 'closed', 3000, 100));
    // خلفية نائمة: يوقظها الأمر، فيُقرأ التفضيل متزامنًا من انعكاس localStorage لا من ذاكرة لم تُحمَّل بعد. لا تنام
    // الخلفية ما دامت صفحة إضافة مفتوحة، فيُغلق الشريط الجانبي وتُنقل صفحتا الاختبار والإعدادات إلى about:blank.
    await chrome(`Services.prefs.setIntPref('extensions.background.idle.timeout', 1000); Services.wm.getMostRecentWindow('navigator:browser').SidebarController.hide(); return true;`);
    for (const name of ['test', 'options']) {
      await switchTo(name);
      await c.send('WebDriver:Navigate', { url: 'about:blank' });
    }
    const backgroundState = () => chrome('return WebExtensionPolicy.getByID(arguments[0]).extension.backgroundState', [id]);
    const asleep = async () => (['suspended', 'stopped'].includes(await backgroundState()) ? backgroundState() : null);
    command.suspendedBeforeWake = await waitUntil(asleep, 8000, 200);
    // الإضافة المؤقتة لا تنام بالمهلة في هذا التشغيل (قيس: تبقى running): يُنهى سياق الخلفية بالطريقة التي تستعملها
    // اختبارات Firefox نفسها، ثم يوقظه الأمر كما يوقظ خلفية نائمة.
    if (!command.suspendedBeforeWake) {
      command.suspendMethod = await chromeAsync(`const [id, done] = arguments; Promise.resolve(WebExtensionPolicy.getByID(id).extension.terminateBackground()).then(() => done('extension.terminateBackground()'), (e) => done('تعذّر: ' + e));`, [id]);
      command.suspendedBeforeWake = (await waitUntil(asleep, 5000, 100)) ?? (await backgroundState());
    } else command.suspendMethod = 'extensions.background.idle.timeout';
    await switchTo('control');
    await pressShortcut();
    command.wakeDrawerPref = { drawer: await waitUntil(async () => ((await run(contentState)).drawer === 'open' ? 'open' : null), 5000, 100), backgroundAfter: await backgroundState(), sidebarOpened: await chrome(`return Services.wm.getMostRecentWindow('navigator:browser').SidebarController.isOpen;`) };
    await switchTo('control');
    await pressShortcut();
    await waitUntil(async () => (await run(contentState)).drawer === 'closed', 3000, 100);
    await chrome(`Services.prefs.clearUserPref('extensions.background.idle.timeout'); return true;`);
    await switchTo('test');
    await c.send('WebDriver:Navigate', { url: `${origin}/test.html` });
    await waitUntil(async () => (await run(() => document.documentElement.getAttribute('data-ready'))) === 'true', 5000, 100);
    await switchTo('options');
    await c.send('WebDriver:Navigate', { url: `${origin}/options.html` });
    await waitUntil(async () => (await run(() => document.getElementById('app')?.getAttribute('data-ready'))) === 'true', 5000, 100);
    await switchTo('options');
    await click('input[name="mj-surface"][value="native"]');
    await sleep(300);
    // إعادة الربط من إعدادات المتصفح: ما تستدعيه صفحة about:addons ← إدارة اختصارات الإضافات.
    command.optionsShowsShortcut = await run(() => document.querySelector('[data-section="shortcut"] kbd')?.textContent ?? null);
    command.reboundVia = await chromeAsync(
      `const [id, done] = arguments; const ext = WebExtensionPolicy.getByID(id).extension;
       ext.shortcuts.updateCommand({ name: 'toggle-panel', shortcut: 'Alt+Shift+M' }).then(() => done('extension.shortcuts.updateCommand (about:addons)'), (e) => done('تعذّر: ' + e));`,
      [id],
    );
    command.afterRebind = (await t('commands')).find((x) => x.name === 'toggle-panel') ?? null;
    command.keyElementAfterRebind = await shortcut();
    await switchTo('options');
    await run(() => window.dispatchEvent(new Event('focus')));
    command.optionsAfterRebind = await waitUntil(async () => {
      const text = await run(() => document.querySelector('[data-section="shortcut"] kbd')?.textContent ?? null);
      return text && text !== command.optionsShowsShortcut ? text : null;
    }, 3000, 100);
    await click('[data-action="shortcuts"]');
    await sleep(800);
    command.shortcutsPageOpened = await chrome(`const w = Services.wm.getMostRecentWindow('navigator:browser'); return w.gBrowser.tabs.map((tab) => tab.linkedBrowser.currentURI.spec).filter((u) => u.startsWith('about:addons'));`);
    await chromeAsync(`const [id, done] = arguments; WebExtensionPolicy.getByID(id).extension.shortcuts.updateCommand({ name: 'toggle-panel', shortcut: 'Alt+G' }).then(() => done(true), () => done(false));`, [id]);
    result.steps.command = command;

    permission.requestsTotal = apiRequests();
    result.network = {
      apiGithub: servers.log.requests.filter((r) => r.host === 'api.github.com'),
      githubPages: servers.log.requests.filter((r) => r.host === 'github.com').length,
      refusedHosts: [...new Set(servers.log.refused)],
    };
    await switchTo('control');
    result.errors = (await run(contentState)).error;
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
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

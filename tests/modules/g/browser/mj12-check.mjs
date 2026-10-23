#!/usr/bin/env node
// فحص MJ12 على الحزمة المشحونة نفسها (dist/chromium وdist/firefox من npm run build)، بلا واجهة، بملف تعريف مؤقت، ولا شبكة خارجية.
// الصفحات تُخدم على https://github.com/... محليًا: Playwright route في عائلة Chromium، وخادم HTTPS ووكيل محليان في Firefox (نمط
// tests/modules/browser/integration.mjs).
//   1. صفحة ملف (النسخة الأولى من عينة drift، عام) بتحديد #L40: زر «أكمل لاحقًا» يحفظ الرابط بحقوله في التخزين الفعلي.
//   2. ملاحظة سطر من بطاقة «ملاحظاتي»: مرساتها في التخزين (نص في العام)، و«مطابق» بعلامة على السطر 40.
//   3. النسخة المنزاحة (+15 سطرًا): «منزاح» مقترحًا على 55 بلا علامة، ثم نقر «انقل» يجعلها مطابقة بعلامة على 55.
//   4. صفحة «غير موجود»: «المورد غير متاح» برابطي الفرع والالتزام. ثم مستودع خاص: بصمة مملّحة بـWeb Crypto في سكربت المحتوى بلا نص في
//      التخزين، و«متغيّر» بلا مقتطف.
//   5. اللوحة (sidepanel.html): مركز «ملاحظاتي وأكمل لاحقًا» يعرض الملاحظتين والرابط ويبحث فيها؛ ومعالج README في تبويب المجتمع.
//   6. تدقيق الشبكة: لا طلب إلى api.github.com، وطلبات github.com وثائق الصفحات وحدها (لا طلب أثناء إعادة التثبيت).
// الاستعمال: node tests/modules/g/browser/mj12-check.mjs [chrome|edge|brave|firefox] [--out-dir evidence/T-8.3]
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../../scripts/load-check.mjs';
import * as drift from '../anchor/drift.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const key = args[0] ?? 'chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(read, timeoutMs = 8000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}

// ---------- الصفحات المخدومة ----------

const BLOB = '/octo/shop/blob/main/src/cart.js';
const SECRET = '/octo/secret/blob/main/src/cart.js';
const COMMUNITY = fs.readFileSync(path.join(ROOT, 'tests/modules/h/fixtures/fixture-community-repo.html'), 'utf8');
// مستودع خاص (repository_public=false): العينة نفسها باسم مستودع آخر.
const privateHtml = (lines) => drift.codeViewHtml(lines, { visibility: 'private', commit: drift.SHA1 }).replaceAll('octo/shop', 'octo/secret');
const served = { blob: drift.codeViewHtml(drift.V1, { commit: drift.SHA1 }), secret: privateHtml(drift.V1) };

function serve(pathname) {
  const html = (body, status = 200) => ({ status, type: 'text/html; charset=utf-8', body });
  if (pathname === BLOB) return html(served.blob, served.blob === drift.NOT_FOUND_HTML ? 404 : 200);
  if (pathname === SECRET) return html(served.secret);
  if (pathname === '/octo/community') return html(COMMUNITY);
  return { status: 404, type: 'text/plain', body: 'not found' };
}

// ---------- داخل الصفحة (تُرسل نصًّا وتُستدعى بمعاملاتها) ----------

function pageState() {
  const host = (name) => document.querySelector(`mijhar-host[data-mijhar-host="${name}"]`);
  const later = host('g-bookmarks')?.shadowRoot;
  const card = host('g')?.shadowRoot;
  return {
    later: Boolean(later?.querySelector('[data-quick-save]')),
    card: Boolean(card?.querySelector('.notes-card')),
    anchorView: card?.querySelector('[data-anchor-view]')?.getAttribute('data-anchor-view') ?? null,
    candidate: card?.querySelector('[data-candidate]')?.getAttribute('data-candidate') ?? null,
    links: [...(card?.querySelectorAll('[data-anchor-link]') ?? [])].map((a) => a.getAttribute('href')),
    snippet: Boolean(card?.querySelector('[data-snippet]')),
    snippetPrivate: Boolean(card?.querySelector('[data-snippet-private]')),
    markers: [...document.querySelectorAll('mijhar-host[data-mijhar-host="g-line-marker"]')].map((m) => m.parentElement?.getAttribute('data-line-number')),
  };
}
function inShadow(hostName, selector, action, value) {
  const el = document.querySelector(`mijhar-host[data-mijhar-host="${hostName}"]`)?.shadowRoot?.querySelector(selector);
  if (!el) return false;
  if (action === 'type') {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else el.click();
  return true;
}
function centerState() {
  return {
    count: document.querySelector('[data-result-count]')?.getAttribute('data-result-count') ?? null,
    kinds: [...document.querySelectorAll('[data-entry-kind]')].map((e) => e.getAttribute('data-entry-kind')).sort(),
  };
}
function clickTab(text) {
  const tab = [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes(text));
  tab?.click();
  return Boolean(tab);
}
function fill(selector, value) {
  const el = document.querySelector(selector);
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}
const scrollTop = () => window.scrollTo(0, 0) ?? true;
const call = (fn, a) => `(${fn})(...${JSON.stringify(a)})`;

// ---------- السيناريو (d: واجهة موحّدة للمشغّلَين) ----------
// d.load(url) · d.state() · d.act(host, selector, action, value) · d.storage() · d.shot(name) · d.openPanel() · d.panel(fn, ...args)
// · d.panelShot(name) · d.mark() / d.githubSince(mark): طلبات github.com بعد علامة بصيغة «النوع المسار».

async function scenario(d, check) {
  const records = async (prefix) => Object.entries(await d.storage()).filter(([k]) => k.startsWith(`mijhar:data:${prefix}`)).map(([, v]) => v);
  const card = () => d.act('g', '.card-bar', 'click');

  // 1. الحفظ السريع.
  await d.load(`https://github.com${BLOB}#L40`);
  const ready = await waitUntil(async () => ((await d.state()).later && (await d.state()).card ? d.state() : null), 12000);
  check('شريط «أكمل لاحقًا» وبطاقة «ملاحظاتي» في صفحة الملف', ready, ready ?? (await d.state()));
  await d.act('g-bookmarks', '[data-action="quick-save"]', 'click');
  const [bookmark] = (await waitUntil(async () => ((await records('bookmarks.')).length ? records('bookmarks.') : null), 5000)) ?? [];
  check('الحفظ السريع كتب الحقول المعرّفة في التخزين الفعلي', bookmark?.owner === 'octo' && bookmark?.repo === 'shop' && bookmark?.branch === 'main' && bookmark?.level === 'line' && bookmark?.position?.start === 40 && bookmark?.status === 'reading' && typeof bookmark?.savedAt === 'string', bookmark);
  await d.act('g-bookmarks', '[data-action="cancel-bookmark"]', 'click');

  // 2. ملاحظة السطر ومرساتها.
  await card();
  await sleep(250);
  await d.act('g', '.notes textarea', 'type', 'تحقق من التقريب هنا');
  await sleep(100);
  await d.act('g', '[data-action="create"]', 'click');
  const matched = await waitUntil(async () => ((await d.state()).anchorView === 'matched' && (await d.state()).markers.length ? d.state() : null), 8000);
  const [anchor] = await records('anchors.');
  check('مرساة السطر في التخزين: نص النطاق وسياقه (مستودع عام) والتزام الصفحة', anchor?.fingerprint?.mode === 'text' && anchor?.fingerprint?.block?.[0] === 'function calculateTotal(items) {' && anchor?.commit === drift.SHA1, anchor);
  check('«مطابق» وعلامة على السطر 40', matched?.markers?.join() === '40', matched ?? (await d.state()));
  await d.shot('matched');

  // 3. النسخة المنزاحة.
  served.blob = drift.codeViewHtml(drift.V2_SHIFTED, { commit: drift.SHA2 });
  const mark = d.mark();
  await d.load(`https://github.com${BLOB}#L40`);
  await waitUntil(async () => (await d.state()).card, 8000);
  await card();
  const shifted = await waitUntil(async () => ((await d.state()).anchorView === 'shifted' ? d.state() : null), 8000);
  await sleep(400);
  const settled = await d.state();
  check('«منزاح» مقترحًا على 55، بلا علامة ولا نقل تلقائي', shifted?.candidate === '55' && settled.markers.length === 0 && settled.anchorView === 'shifted', settled);
  await d.shot('shifted');
  await d.act('g', '[data-action="relocate"][data-line="55"]', 'click');
  const moved = await waitUntil(async () => ((await d.state()).markers.join() === '55' ? d.state() : null), 8000);
  check('نقر «انقل» يجعلها مطابقة بعلامة على 55', moved?.anchorView === 'matched', moved ?? (await d.state()));
  const during = d.githubSince(mark);
  check('لا طلب إلى github.com أثناء إعادة التثبيت غير وثيقة الصفحة', during.every((r) => r.startsWith('document ') || r.endsWith('/favicon.ico')), during);

  // 4. مورد غير متاح.
  served.blob = drift.NOT_FOUND_HTML;
  await d.load(`https://github.com${BLOB}#L55`);
  await waitUntil(async () => (await d.state()).card, 8000);
  await card();
  const gone = await waitUntil(async () => ((await d.state()).anchorView === 'resource-unavailable' ? d.state() : null), 8000);
  check('«المورد غير متاح» برابط الفرع والرابط الثابت', gone?.links?.length === 2 && gone.links[1]?.includes(drift.SHA2), gone ?? (await d.state()));
  await d.shot('resource-unavailable');

  // 4ب. مستودع خاص (DEC-05 ز-1).
  await d.load(`https://github.com${SECRET}#L40`);
  await waitUntil(async () => (await d.state()).card, 8000);
  await card();
  await sleep(250);
  await d.act('g', '.notes textarea', 'type', 'ملاحظة على مستودع خاص');
  await sleep(100);
  await d.act('g', '[data-action="create"]', 'click');
  const privateMatched = await waitUntil(async () => ((await d.state()).anchorView === 'matched' ? d.state() : null), 8000);
  const all = await d.storage();
  const secretAnchors = Object.entries(all).filter(([k, v]) => k.startsWith('mijhar:data:anchors.') && v?.repo === 'secret');
  const secretAnchor = secretAnchors[0]?.[1];
  check(
    'الخاص: بصمة مملّحة (hash) وملح محلي، ولا نص كود في التخزين، و«مطابق»',
    privateMatched && secretAnchor?.fingerprint?.mode === 'hash' && /^[0-9a-f]{64}$/.test(secretAnchor.fingerprint.block[0]) && !JSON.stringify(secretAnchors).includes('calculateTotal') && /^[0-9a-f]{64}$/.test(all['mijhar:data:anchor-salt']?.salt ?? ''),
    { view: privateMatched?.anchorView ?? (await d.state()).anchorView, fingerprint: secretAnchor?.fingerprint },
  );
  served.secret = privateHtml(drift.V4_CHANGED);
  await d.load(`https://github.com${SECRET}#L40`);
  await waitUntil(async () => (await d.state()).card, 8000);
  await card();
  const privateChanged = await waitUntil(async () => ((await d.state()).anchorView === 'changed' ? d.state() : null), 8000);
  check('الخاص المتغيّر: «متغيّر» بلا مقتطف وبلا علامة', privateChanged && !privateChanged.snippet && privateChanged.snippetPrivate && privateChanged.markers.length === 0, privateChanged ?? (await d.state()));
  await d.shot('private-changed');

  // 5. اللوحة: المركز والمعالج.
  await d.openPanel();
  await d.panel(clickTab, 'ملاحظاتي');
  const center = await waitUntil(async () => ((await d.panel(centerState)).count ? d.panel(centerState) : null), 8000);
  check('المركز يعرض الملاحظتين والرابط المحفوظين', center?.count === '3' && center?.kinds?.join() === 'bookmark,note,note', center);
  await d.panel(fill, '#mj-later-search', 'التقريب');
  await sleep(200);
  const searched = await d.panel(centerState);
  check('البحث في المركز يصفّي إلى الملاحظة', searched.kinds.join() === 'note' && searched.count === '1', searched);
  await d.panel(fill, '#mj-later-search', '');
  await sleep(200);
  await d.panelShot('panel-center');
  await d.panel(clickTab, 'المجتمع');
  const wizard = await waitUntil(() => d.panel(() => Boolean(document.querySelector('[data-wizard-empty="no-repo"]'))), 8000);
  check('معالج README في تبويب المجتمع (التبويب النشط صفحة الإضافة: يطلب صفحة مستودع)', wizard, wizard);
  await d.panelShot('panel-community');
}

// ---------- عائلة Chromium ----------

async function chromiumRun() {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj12-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executable,
    headless: true,
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const network = { apiGithub: [], github: [], blocked: new Set() };
  const result = { label, checks: [] };
  const check = makeCheck(result);
  try {
    result.browserVersion = context.browser().version();
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.host === 'api.github.com') network.apiGithub.push(request.url());
      else if (url.host === 'github.com') network.github.push(`${request.resourceType()} ${url.pathname}`);
    });
    await context.route('https://github.com/**', (route) => {
      const r = serve(new URL(route.request().url()).pathname);
      return route.fulfill({ status: r.status, contentType: r.type, body: r.body });
    });
    await context.route('https://api.github.com/**', (route) => route.fulfill({ status: 500, body: '' }));
    await context.route((url) => url.protocol === 'https:' && url.host !== 'github.com' && url.host !== 'api.github.com', (route) => {
      network.blocked.add(new URL(route.request().url()).host);
      return route.abort();
    });
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
    const origin = `chrome-extension://${id}`;
    const options = await context.newPage();
    await options.goto(`${origin}/options.html`);
    await options.waitForSelector('#app[data-ready="true"]');
    const shots = outDir ? path.join(outDir, 'browser-screens') : null;
    if (shots) fs.mkdirSync(shots, { recursive: true });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (m) => m.text().includes('[mijhar]') && errors.push(m.text()));
    let panel = null;
    const d = {
      // الرابط نفسه بهاش تنقّل داخل المستند فلا تُعاد الصفحة؛ about:blank بينهما يفرض تحميل النسخة الجديدة.
      async load(url) {
        await page.goto('about:blank');
        await page.goto(url);
      },
      state: () => page.evaluate(call(pageState, [])),
      act: (...a) => page.evaluate(call(inShadow, a)),
      storage: () => options.evaluate(() => chrome.storage.local.get(null)),
      mark: () => network.github.length,
      githubSince: (mark) => network.github.slice(mark),
      // لقطة الشريط والبطاقة معًا (العينة بلا أنماط GitHub، والصفحة تمرّر إلى سطر الهاش).
      async shot(name) {
        if (!shots) return;
        await page.evaluate(call(scrollTop, []));
        const box = await page.evaluate(() => {
          const hosts = ['g-bookmarks', 'g'].map((n) => document.querySelector(`mijhar-host[data-mijhar-host="${n}"]`)?.getBoundingClientRect()).filter(Boolean);
          const top = Math.min(...hosts.map((r) => r.top));
          const bottom = Math.max(...hosts.map((r) => r.bottom));
          return { x: 0, y: Math.max(0, top - 8), width: document.documentElement.clientWidth, height: Math.min(880, bottom - top + 16) };
        });
        await page.screenshot({ path: path.join(shots, `${key}-${name}.png`), clip: box });
      },
      async openPanel() {
        panel = await context.newPage();
        await panel.setViewportSize({ width: 400, height: 900 });
        await panel.goto(`${origin}/sidepanel.html`);
        await panel.waitForSelector('[role="tab"]');
      },
      panel: (fn, ...a) => panel.evaluate(call(fn, a)),
      async panelShot(name) {
        if (shots) await panel.screenshot({ path: path.join(shots, `${key}-${name}.png`), fullPage: true });
      },
    };
    await scenario(d, check);
    check('لا رسائل خطأ من الإضافة في الصفحة', errors.length === 0, errors);
    const devtools = await context.newPage();
    await devtools.goto('chrome://extensions');
    const info = await devtools.evaluate((extId) => chrome.developerPrivate.getExtensionInfo(extId), id);
    result.extensionErrors = { runtime: (info.runtimeErrors ?? []).map((e) => e.message), manifest: (info.manifestErrors ?? []).map((e) => e.message) };
    check('لا أخطاء تشغيل ولا مانيفست مسجلة للإضافة', !result.extensionErrors.runtime.length && !result.extensionErrors.manifest.length, result.extensionErrors);
  } catch (error) {
    result.error = String(error?.stack ?? error);
    check('اكتمل السيناريو', false, result.error);
  } finally {
    result.network = { apiGithub: network.apiGithub, github: network.github, blockedExternalHosts: [...network.blocked].sort() };
    check('صفر طلبات إلى api.github.com', network.apiGithub.length === 0, network.apiGithub);
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  return result;
}

// ---------- Firefox: Marionette خلف خادم HTTPS ووكيل محليين (منقول من tests/modules/browser/integration.mjs) ----------

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
  const openssl = (...a) => execFileSync('openssl', a, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-mj12-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('key.pem'), '-out', file('leaf.csr'), '-subj', '/CN=github.com');
  fs.writeFileSync(file('leaf.ext'), 'subjectAltName=DNS:github.com,DNS:api.github.com\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  openssl('x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-out', file('cert.pem'), '-days', '1', '-extfile', file('leaf.ext'));
  const caDer = fs.readFileSync(file('ca.pem'), 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return { key: fs.readFileSync(file('key.pem')), cert: fs.readFileSync(file('cert.pem')), caDer };
}

async function startServers(workDir) {
  const { key: tlsKey, cert, caDer } = makeCertificates(workDir);
  const log = { requests: [], refused: [] };
  const site = https.createServer({ key: tlsKey, cert }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const pathname = new URL(req.url, 'https://github.com').pathname;
    log.requests.push({ host, path: pathname, dest: req.headers['sec-fetch-dest'] ?? '' });
    if (host === 'api.github.com') {
      res.writeHead(500);
      res.end();
      return;
    }
    const r = serve(pathname);
    res.writeHead(r.status, { 'content-type': r.type });
    res.end(r.body);
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
  ]
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join('\n');

async function firefoxRun() {
  const { executable } = BROWSERS.firefox;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj12-ff-'));
  const profileDir = path.join(workDir, 'profile');
  fs.mkdirSync(profileDir);
  const servers = await startServers(workDir);
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${firefoxPrefs(servers.proxyPort)}\n`);
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const result = { label: 'Firefox', checks: [] };
  const check = makeCheck(result);
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
    await c.send('WebDriver:SetWindowRect', { width: 1280, height: 900 }).catch(() => null);
    const { value: id } = await c.send('Addon:Install', { path: path.join(ROOT, 'dist/firefox'), temporary: true });
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
    const handles = {};
    const switchTo = async (name) => {
      await setContext('content');
      await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
    };
    const openTab = async (name, url) => {
      await setContext('content');
      if (handles[name]) await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
      else {
        const { handle } = await c.send('WebDriver:NewWindow', { type: 'tab' });
        handles[name] = handle;
        await c.send('WebDriver:SwitchToWindow', { handle });
      }
      await c.send('WebDriver:Navigate', { url });
    };
    const runIn = async (name, fn, a = []) => {
      await switchTo(name);
      return (await c.send('WebDriver:ExecuteScript', { script: `return ${call(fn, a)}`, args: [] })).value;
    };
    const host = await chromeScript('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [id]);
    const origin = `moz-extension://${host}`;
    await openTab('options', `${origin}/options.html`);
    await waitUntil(async () => (await runIn('options', () => document.querySelector('#app')?.getAttribute('data-ready'))) === 'true', 8000, 100);
    const shots = outDir ? path.join(outDir, 'browser-screens') : null;
    if (shots) fs.mkdirSync(shots, { recursive: true });
    const screenshot = async (name, file) => {
      if (!shots) return;
      await switchTo(name);
      const { value } = await c.send('WebDriver:TakeScreenshot', { full: false, hash: false });
      fs.writeFileSync(path.join(shots, `firefox-${file}.png`), Buffer.from(value, 'base64'));
    };
    const d = {
      async load(url) {
        await openTab('page', 'about:blank');
        await openTab('page', url);
      },
      state: () => runIn('page', pageState),
      act: (...a) => runIn('page', inShadow, a),
      async storage() {
        await switchTo('options');
        return (
          await c.send('WebDriver:ExecuteAsyncScript', {
            script: 'const done = arguments[arguments.length - 1]; (globalThis.browser ?? window.wrappedJSObject?.browser).storage.local.get(null).then((v) => done(JSON.parse(JSON.stringify(v))), (e) => done({ thrown: String(e) }));',
            args: [],
          })
        ).value;
      },
      mark: () => servers.log.requests.length,
      githubSince: (mark) => servers.log.requests.slice(mark).filter((r) => r.host === 'github.com').map((r) => `${r.dest === 'document' ? 'document' : r.dest || 'unknown'} ${r.path}`),
      async shot(file) {
        await runIn('page', scrollTop);
        await screenshot('page', file);
      },
      async openPanel() {
        await openTab('panel', `${origin}/sidepanel.html`);
        await waitUntil(() => runIn('panel', () => document.querySelectorAll('[role="tab"]').length > 0), 8000);
      },
      panel: (fn, ...a) => runIn('panel', fn, a),
      panelShot: (file) => screenshot('panel', file),
    };
    await scenario(d, check);
    const consoleErrors = await chromeScript(`return Services.console.getMessageArray().map((m) => m.message ?? (m.errorMessage ? m.errorMessage + ' @ ' + m.sourceName : String(m))).filter((t) => /\\[mijhar\\]/.test(t));`);
    check('لا رسائل خطأ من الإضافة في وحدة تحكم Firefox', consoleErrors.length === 0, consoleErrors);
  } catch (error) {
    result.error = String(error?.stack ?? error);
    check('اكتمل السيناريو', false, result.error);
  } finally {
    const api = servers.log.requests.filter((r) => r.host === 'api.github.com');
    result.network = { apiGithub: api, github: servers.log.requests.filter((r) => r.host === 'github.com').map((r) => `${r.dest} ${r.path}`), blockedExternalHosts: [...new Set(servers.log.refused)].sort() };
    check('صفر طلبات إلى api.github.com', api.length === 0, api);
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

function makeCheck(result) {
  return (name, ok, detail) => {
    result.checks.push({ name, ok: Boolean(ok), detail });
    console.error(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `: ${JSON.stringify(detail)}`}`);
  };
}

const result = key === 'firefox' ? await firefoxRun() : await chromiumRun();
const passed = result.checks.filter((c) => c.ok).length;
console.error(`${result.label} ${result.browserVersion ?? ''}: ${passed}/${result.checks.length}`);
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `browser-check-${key}.json`), JSON.stringify(result, null, 2) + '\n');
}
process.exitCode = passed === result.checks.length ? 0 : 1;

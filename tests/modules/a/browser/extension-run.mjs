#!/usr/bin/env node
// فحص تكامل MJ7 على الحزمة المشحونة نفسها (dist/chromium وdist/firefox من npm run build) في المتصفحات الأربعة، على صفحة GitHub
// محلية تُقدَّم بعنوان https://github.com/octo/mj7-demo وبسياسة CSP الحقيقية لـGitHub (fixtures/github-csp.txt):
//   1. التركيب: العزل وكتلة الأنماط بـ@font-face وزر وضع القراءة وزر المحرر (لا زر في Firefox: غير مدعوم).
//   2. الخطوط تحت CSP الصفحة (HYP-16): حالة FontFace، وانتهاكات CSP، وطلبات الخطوط، والخط المحسوب لفقرة عربية.
//   3. وضع القراءة كاملًا: الزر ← الخلفية تفتح reader.html ← لقطة من التبويب المصدر ← التشكيل مخفي ← النسخ يحمل الأصل؛ وصفحة
//      GitHub لم تتغير نصوصها (اقتباس الرد يقرأ DOM).
//   4. الإعدادات من صفحة الإعدادات: الأرقام المشرقية تشغيلًا وإيقافًا، والخط وإعادته إلى الافتراضي، والتلميح الهجري بمرور حقيقي.
//   5. الشبكة: لا طلب إلى نطاق خطوط خارجي ولا إلى غير github.com.
// الاستعمال: node tests/modules/a/browser/extension-run.mjs [chrome edge brave firefox] [--out <ملف json>]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, launchFirefox, machineInfo, sleep, waitFor, writeJson } from '../../../../scripts/spikes/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];
const CASES = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/a/cases.json'), 'utf8'));
const CSP = fs.readFileSync(path.join(HERE, 'fixtures/github-csp.txt'), 'utf8').trim();
const PAGE_URL = 'https://github.com/octo/mj7-demo';
const FONT_FAMILY = 'Mijhar IBM Plex Sans Arabic';

// الصفحة: README المختلط، ثم حالات الأرقام والتواريخ المرجعية والمحرر، ثم تعليقات العينة المشكولة (c1 إلى c7).
function pageHtml() {
  const readme = fs.readFileSync(path.join(ROOT, 'tests/modules/a/direction/fixtures/fixture-mixed-rtl-readme.html'), 'utf8');
  const live = fs.readFileSync(path.join(ROOT, 'fixtures/spikes/fixture-diacritics-live.html'), 'utf8');
  const comments = [...live.matchAll(/<div class="markdown-body" id="c\d"[\s\S]*?<\/div>\n(?=<div|<textarea)/g)].map((m) => m[0]).join('');
  const extras = [
    '<div class="markdown-body" id="mj7-cases">',
    ...CASES.digits.map(([id, html]) => `<div data-digits="${id}">${html}</div>`),
    `<p dir="auto" id="mj7-dates">تواريخ مرجعية: ${CASES.referenceDates.map(([dt]) => `<relative-time data-ref datetime="${dt}">${dt.slice(0, 10)}</relative-time>`).join(' و')}</p>`,
    '</div>',
    '<div id="mj7-editor-box"><markdown-toolbar for="mj7-editor"></markdown-toolbar><textarea id="mj7-editor" style="width:600px;height:120px"></textarea></div>',
    comments,
  ].join('');
  return readme.replace('</body>', `${extras}</body>`);
}
const HTML = pageHtml();

// ---------- مجسّات في الصفحة ----------

function pageState() {
  const host = (name) => document.querySelectorAll(`mijhar-host[data-mijhar-host="${name}"]`).length;
  const styles = document.getElementById('mijhar-reading-styles')?.textContent ?? '';
  const visibleText = () => {
    let text = '';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement.closest('mijhar-host, script, style')) text += n.data;
    return text;
  };
  const text = visibleText();
  return {
    isolated: document.querySelectorAll('.mijhar-bidi-isolate').length,
    flipped: document.querySelectorAll('[data-mijhar-dir]').length,
    readingHost: host('a.reading'),
    editorHost: host('a.editor-toggle'),
    fontFace: (styles.match(/@font-face/g) ?? []).length,
    fontFiles: [...styles.matchAll(/fonts\/([\w-]+\.woff2)/g)].map((m) => m[1]),
    prose: document.querySelector('[data-digits="prose"]')?.textContent ?? null,
    diacritics: (text.match(/[ً-ٰٟ]/g) ?? []).length,
    eastern: (text.match(/[٠-٩]/g) ?? []).length,
    textLength: text.length,
    arabicFont: getComputedStyle(document.querySelector('[data-case="p-pure-arabic"]')).fontFamily,
  };
}

async function fontsProbe(family) {
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => violations.push({ directive: e.violatedDirective, blocked: e.blockedURI }));
  let loaded = [];
  let error = null;
  try {
    loaded = await document.fonts.load(`16px "${family}"`, 'بسم الله');
  } catch (e) {
    error = String(e);
  }
  await new Promise((r) => setTimeout(r, 800));
  const faces = [...document.fonts].filter((f) => f.family.replace(/"/g, '') === family).map((f) => ({ weight: f.weight, status: f.status }));
  const resources = performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\.(woff2?|ttf|otf)(\?|$)/.test(n));
  return { loaded: loaded.length, error, faces, check: document.fonts.check(`16px "${family}"`, 'بسم'), violations, resources };
}

function hijriExpected([refs, offset]) {
  return refs.map((dt) => new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { dateStyle: 'full' }).format(new Date(Date.parse(dt) + offset * 86400000)));
}
function tooltipText() {
  const host = document.querySelector('mijhar-host[data-mijhar-host="a.hijri"]');
  return host?.hasAttribute('data-open') ? host.shadowRoot.querySelector('.date')?.textContent ?? null : null;
}
function clickReading() {
  document.querySelector('mijhar-host[data-mijhar-host="a.reading"]').shadowRoot.querySelector('button').click();
  return true;
}
function clickEditor() {
  const button = document.querySelector('mijhar-host[data-mijhar-host="a.editor-toggle"]')?.shadowRoot?.querySelector('button');
  if (!button) return null;
  button.click();
  return document.getElementById('mj7-editor').getAttribute('dir');
}

// العارض: حالته، وتحديد كلمة «المطور» في القسم الذي فيه (والتشكيل مخفي).
function readerState() {
  const article = document.querySelector('.reader-article');
  // التشكيل داخل الكود لا يُخفى عمدًا (view.ts)، فيُعدّ خارجه.
  let text = '';
  if (article) {
    const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement.closest('pre, code, kbd, samp')) text += n.data;
  }
  return {
    ready: document.getElementById('app')?.getAttribute('data-ready'),
    sections: article?.querySelectorAll('.reader-section').length ?? 0,
    diacritics: (text.match(/[ً-ٰٟ]/g) ?? []).length,
    diacriticAt: (() => {
      const walker = document.createTreeWalker(article ?? document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const i = n.data.search(/[\u064B-\u065F\u0670]/);
        if (i !== -1) return { parent: n.parentElement.localName, text: n.data.slice(Math.max(0, i - 15), i + 15) };
      }
      return null;
    })(),
    hidden: document.getElementById('mj-hide-diacritics')?.checked ?? null,
    hint: document.querySelector('.reader-hint')?.textContent ?? '',
    alert: document.querySelector('[role="alert"]')?.textContent ?? null,
    title: document.title,
  };
}
function readerSelectWord(word) {
  if (!document.querySelector('.reader-article')) return null;
  const walker = document.createTreeWalker(document.querySelector('.reader-article'), NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const at = n.data.indexOf(word);
    if (at === -1) continue;
    const range = document.createRange();
    range.setStart(n, at);
    range.setEnd(n, at + word.length);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    return getSelection().toString();
  }
  return null;
}
// صفحة الإعدادات: تغيير قيمة select كما يفعل المستخدم (حدث change).
function setSelect([id, value]) {
  const el = document.getElementById(id);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return el.value;
}
function clickIn(selector) {
  document.querySelector(selector).click();
  return document.querySelector(selector).checked ?? true;
}

const settledPage = (s) => s && s.isolated > 0 && s.readingHost === 1 && s.fontFace > 0;

// ---------- الخطوات المشتركة ----------

async function scenario(b, result) {
  const steps = result.steps;
  await b.openGithub();
  await waitFor(async () => settledPage(await b.gh(pageState)), 15000);
  await sleep(300);
  steps.mounted = await b.gh(pageState);
  steps.fonts = await b.ghAsync(fontsProbe, FONT_FAMILY);

  // التلميح الهجري بمرور حقيقي.
  const refs = CASES.referenceDates.map(([dt]) => dt);
  const expected = await b.gh(hijriExpected, [refs, 0]);
  const tips = [];
  for (let i = 0; i < refs.length; i += 1) {
    // التمرير يخفي التلميح عمدًا: يُمرَّر العنصر إلى العرض أولًا ثم يُمرّ عليه.
    await b.gh((selector) => document.querySelector(selector).scrollIntoView({ block: 'center' }), `relative-time[datetime="${refs[i]}"]`);
    await sleep(200);
    await b.hover(`relative-time[datetime="${refs[i]}"]`);
    await sleep(150);
    tips.push(await b.gh(tooltipText));
    await b.hover('#mj7-editor');
  }
  steps.hijri = { matches: tips.filter((t, i) => t === expected[i]).length, total: refs.length, tips, expected };

  // المحرر.
  steps.editor = { host: steps.mounted.editorHost, dirAfterClick: await b.gh(clickEditor) };

  // وضع القراءة.
  const before = await b.gh(pageState);
  await b.gh(clickReading);
  await b.switchToReader();
  await waitFor(async () => (await b.reader(readerState)).sections > 0, 10000);
  await sleep(300);
  const opened = await b.reader(readerState);
  const selected = opened.sections ? await b.reader(readerSelectWord, 'المطور') : null;
  const clip = opened.sections ? await b.copyInReader() : null;
  steps.reader = { ...opened, hint: opened.hint.slice(0, 60), selected, clipboard: clip?.['text/plain'] ?? null, htmlHasDiacritics: /[ً-ٰٟ]/.test(clip?.['text/html'] ?? ''), copyCarriesOriginal: clip?.['text/plain'] === 'المُطَوِّرُ' };
  await b.switchToGithub();
  const after = await b.gh(pageState);
  steps.readerGithubUntouched = { diacriticsBefore: before.diacritics, diacriticsAfter: after.diacritics, textLengthSame: before.textLength === after.textLength };

  // الإعدادات.
  await b.openOptions();
  await waitFor(async () => (await b.options(() => document.getElementById('app')?.getAttribute('data-ready'))) === 'true', 8000);
  const textBefore = (await b.gh(pageState)).textLength;
  await b.options(clickIn, '#mj-a-digits');
  await waitFor(async () => (await b.gh(pageState)).eastern > 0, 5000, 50);
  const on = await b.gh(pageState);
  await b.options(clickIn, '#mj-a-digits');
  await waitFor(async () => (await b.gh(pageState)).eastern === 0, 5000, 50);
  const off = await b.gh(pageState);
  steps.digits = { onProse: on.prose, eastern: on.eastern, offProse: off.prose, offEastern: off.eastern, textLengthSame: off.textLength === textBefore };
  await b.options(setSelect, ['mj-a-font', 'cairo']);
  await waitFor(async () => (await b.gh(pageState)).fontFiles.some((f) => f.startsWith('Cairo')), 5000, 50);
  const cairo = await b.gh(pageState);
  await b.options(clickIn, '[data-action="reset-typography"]');
  await waitFor(async () => (await b.gh(pageState)).fontFiles.some((f) => f.startsWith('IBMPlex')), 5000, 50);
  const reset = await b.gh(pageState);
  steps.typography = { cairoFiles: cairo.fontFiles, resetFiles: reset.fontFiles };
}

// ---------- عائلة Chromium ----------

async function chromiumRun(key) {
  const result = { key, steps: {}, console: [] };
  const b = await launchChromium(key, { extension: path.join(ROOT, 'dist/chromium') });
  result.browser = b.version;
  const network = new Set();
  try {
    const { context } = b;
    const origin = `chrome-extension://${b.extensionId}`;
    context.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:')) return;
      const { origin: o, protocol } = new URL(url);
      network.add(o === 'null' ? `${protocol}…` : o);
    });
    await context.route('https://github.com/**', (route) => {
      if (new URL(route.request().url()).pathname !== '/octo/mj7-demo') return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', headers: { 'content-security-policy': CSP }, body: HTML });
    });
    const gh = await context.newPage();
    let reader = null;
    let options = null;
    for (const page of [gh]) page.on('console', (m) => (m.type() === 'error' || m.text().includes('[mijhar]')) && result.console.push(`github: ${m.text()}`));
    Object.assign(b, {
      openGithub: () => gh.goto(PAGE_URL),
      gh: (fn, arg) => gh.evaluate(fn, arg ?? null),
      ghAsync: (fn, arg) => gh.evaluate(fn, arg ?? null),
      hover: (selector) => gh.hover(selector),
      async switchToReader() {
        reader = context.pages().find((p) => p.url().startsWith(`${origin}/reader.html`)) ?? (await context.waitForEvent('page', { timeout: 10000 }));
        await reader.waitForLoadState('load');
        reader.on('console', (m) => m.type() === 'error' && result.console.push(`reader: ${m.text()}`));
        result.readerUrl = reader.url().replace(origin, 'chrome-extension://<id>');
      },
      reader: (fn, arg) => reader.evaluate(fn, arg ?? null),
      async copyInReader() {
        // لا تُمنح صلاحية قراءة الحافظة لأصل إضافة في Playwright: تُقرأ قناتا حدث copy نفسه في فقاعة window بعد معالج العارض.
        await reader.bringToFront();
        await reader.evaluate(() => window.addEventListener('copy', (e) => (window.__mj7copy = { 'text/plain': e.clipboardData.getData('text/plain'), 'text/html': e.clipboardData.getData('text/html') }), { once: true }));
        const cdp = await context.newCDPSession(reader);
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 4, key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67, commands: ['copy'] });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 4, key: 'c', code: 'KeyC', windowsVirtualKeyCode: 67 });
        await sleep(300);
        return reader.evaluate(() => window.__mj7copy ?? null);
      },
      switchToGithub: () => gh.bringToFront(),
      async openOptions() {
        options = await context.newPage();
        await options.goto(`${origin}/options.html`);
      },
      options: (fn, arg) => options.evaluate(fn, arg ?? null),
    });
    await scenario(b, result);
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = [...network].filter((o) => !o.startsWith('chrome-extension://')).sort();
    await b.close();
  }
  return result;
}

// ---------- Firefox: خادم HTTPS ووكيل محليان وشهادة جذر مؤقتة (نمط evidence/wave-C/integration-check.mjs) ----------

function makeCertificates(workDir) {
  const file = (name) => path.join(workDir, name);
  const openssl = (...a) => execFileSync('openssl', a, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-mj7-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('key.pem'), '-out', file('leaf.csr'), '-subj', '/CN=github.com');
  fs.writeFileSync(file('leaf.ext'), 'subjectAltName=DNS:github.com\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  openssl('x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-out', file('cert.pem'), '-days', '1', '-extfile', file('leaf.ext'));
  return { key: fs.readFileSync(file('key.pem')), cert: fs.readFileSync(file('cert.pem')), caDer: fs.readFileSync(file('ca.pem'), 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '') };
}

async function startServers(workDir) {
  const { key, cert, caDer } = makeCertificates(workDir);
  const log = { requests: [], refused: [] };
  const site = https.createServer({ key, cert }, (req, res) => {
    log.requests.push(req.url);
    if (new URL(req.url, 'https://github.com').pathname !== '/octo/mj7-demo') {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP });
    res.end(HTML);
  });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const proxy = http.createServer((req, res) => {
    log.refused.push(`http ${req.url}`);
    res.writeHead(403).end();
  });
  proxy.on('connect', (req, client, head) => {
    const host = req.url.split(':')[0];
    if (host !== 'github.com') {
      log.refused.push(host);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = net.connect(site.address().port, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  return { log, caDer, proxyPort: proxy.address().port, close: () => Promise.all([new Promise((r) => site.close(r)), new Promise((r) => proxy.close(r))]) };
}

const FF_CLIPBOARD = `
  const read = (flavor) => {
    try {
      const t = Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);
      t.init(null);
      t.addDataFlavor(flavor);
      Services.clipboard.getData(t, Ci.nsIClipboard.kGlobalClipboard, gBrowser.selectedBrowser.browsingContext.currentWindowContext);
      const data = {};
      t.getTransferData(flavor, data);
      return data.value.QueryInterface(Ci.nsISupportsString).data;
    } catch (e) { return null; }
  };
  return { 'text/plain': read('text/plain'), 'text/html': read('text/html') };
`;

async function firefoxRun() {
  const result = { key: 'firefox', steps: {}, console: [] };
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj7-ff-'));
  const servers = await startServers(workDir);
  const ff = await launchFirefox({
    prefs: {
      'network.proxy.type': 1,
      'network.proxy.http': '127.0.0.1',
      'network.proxy.http_port': servers.proxyPort,
      'network.proxy.ssl': '127.0.0.1',
      'network.proxy.ssl_port': servers.proxyPort,
      'network.proxy.no_proxies_on': '',
      'network.proxy.allow_hijacking_localhost': true,
      'network.stricttransportsecurity.preloadlist': false,
      'network.dns.disablePrefetch': true,
    },
  });
  result.browser = ff.version;
  try {
    await ff.exec(`Cc['@mozilla.org/security/x509certdb;1'].getService(Ci.nsIX509CertDB).addCertFromBase64(arguments[0], 'C,,'); return true;`, [servers.caDer], 'chrome');
    const id = await ff.installAddon(path.join(ROOT, 'dist/firefox'));
    const host = await ff.exec('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [id], 'chrome');
    const origin = `moz-extension://${host}`;
    const handles = {};
    const switchTo = async (name) => ff.client.send('WebDriver:SwitchToWindow', { handle: handles[name] });
    const run = (fn, arg) => ff.exec(`return (${fn.toString()})(arguments[0]);`, [arg ?? null]);
    const runAsync = (fn, arg) => ff.execAsync(`const done = arguments[arguments.length - 1]; Promise.resolve((${fn.toString()})(arguments[0])).then(done, (e) => done({ error: String(e) }));`, [arg ?? null], 'content', 30000);
    let current = null;
    const on = async (name, fn, arg) => {
      if (current !== name) {
        await ff.exec('return true;');
        await switchTo(name);
        current = name;
      }
      return run(fn, arg);
    };
    const own = await ff.client.send('WebDriver:GetWindowHandle');
    handles.github = typeof own === 'string' ? own : own.value;
    Object.assign(ff, {
      async openGithub() {
        await ff.navigate(PAGE_URL);
        // التنقل إلى أصل آخر قد يبدّل سياق التصفح في Firefox فيتغير مقبض النافذة: يُقرأ بعده.
        const own = await ff.client.send('WebDriver:GetWindowHandle');
        handles.github = typeof own === 'string' ? own : own.value;
        current = 'github';
      },
      gh: (fn, arg) => on('github', fn, arg),
      async ghAsync(fn, arg) {
        await on('github', () => true);
        return runAsync(fn, arg);
      },
      async hover(selector) {
        await on('github', () => true);
        const { value: el } = await ff.client.send('WebDriver:FindElement', { using: 'css selector', value: selector });
        const ref = el['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(el)[0];
        await ff.actions([{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [{ type: 'pointerMove', duration: 0, origin: { 'element-6066-11e4-a52e-4f735466cecf': ref }, x: 0, y: 0 }] }]);
      },
      async switchToReader() {
        const found = await waitFor(async () => {
          const res = await ff.client.send('WebDriver:GetWindowHandles');
          const all = Array.isArray(res) ? res : res.value;
          return all.find((h) => !Object.values(handles).includes(h));
        }, 10000);
        handles.reader = found;
        await switchTo('reader');
        current = 'reader';
        await waitFor(async () => /reader\.html/.test((await ff.client.send('WebDriver:GetCurrentURL')).value), 10000);
        result.readerUrl = (await ff.client.send('WebDriver:GetCurrentURL')).value.replace(origin, 'moz-extension://<id>');
      },
      reader: (fn, arg) => on('reader', fn, arg),
      async copyInReader() {
        await on('reader', () => true);
        await ff.actions([{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value: '' }, { type: 'keyDown', value: 'c' }, { type: 'keyUp', value: 'c' }, { type: 'keyUp', value: '' }] }]);
        await sleep(300);
        return ff.exec(FF_CLIPBOARD, [], 'chrome');
      },
      switchToGithub: () => on('github', () => true),
      async openOptions() {
        await ff.exec('return true;');
        const { handle } = await ff.client.send('WebDriver:NewWindow', { type: 'tab' });
        handles.options = handle;
        await switchTo('options');
        current = 'options';
        await ff.client.send('WebDriver:Navigate', { url: `${origin}/options.html` });
      },
      options: (fn, arg) => on('options', fn, arg),
    });
    await scenario(ff, result);
    result.console = await ff.exec(`return Services.console.getMessageArray().map((m) => m.message ?? (m.errorMessage ? m.errorMessage + ' @ ' + m.sourceName : String(m))).filter((t) => /mijhar|moz-extension|Content-Security-Policy|font/i.test(t)).slice(-30);`, [], 'chrome');
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    // المرفوض كله خدمات Firefox الخلفية (تحديث وإعدادات عن بعد) لا طلبات الإضافة؛ والوكيل لا يمرر إلا github.com.
    result.network = { githubRequests: servers.log.requests.length, refused: [...new Set(servers.log.refused)] };
    await ff.close();
    await servers.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  return result;
}

const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), page: PAGE_URL, csp: 'ترويسة GitHub الحقيقية (fixtures/github-csp.txt)', results: [] };
for (const key of keys) {
  const r = key === 'firefox' ? await firefoxRun() : await chromiumRun(key);
  output.results.push(r);
  const s = r.steps;
  console.error(
    `${key} ${r.browser ?? ''}: ${r.error ? `خطأ: ${r.error.split('\n')[0]} · ` : ''}تركيب عزل ${s.mounted?.isolated} قراءة ${s.mounted?.readingHost} محرر ${s.mounted?.editorHost}` +
      ` · خطوط ${JSON.stringify(s.fonts?.faces)} check ${s.fonts?.check} انتهاكات ${s.fonts?.violations?.length} موارد ${s.fonts?.resources?.length} خط ${s.mounted?.arabicFont?.slice(0, 40)}` +
      ` · هجري ${s.hijri?.matches}/${s.hijri?.total} · محرر ${s.editor?.dirAfterClick}` +
      ` · عارض أقسام ${s.reader?.sections} تشكيل ${s.reader?.diacritics} نسخ ${s.reader?.copyCarriesOriginal} · GitHub تشكيل ${s.readerGithubUntouched?.diacriticsBefore}=${s.readerGithubUntouched?.diacriticsAfter}` +
      ` · أرقام ${s.digits?.onProse} ← ${s.digits?.offProse} طول ${s.digits?.textLengthSame} · خط ${s.typography?.cairoFiles?.[0]} ← ${s.typography?.resetFiles?.[0]} · شبكة ${JSON.stringify(r.network)}`,
  );
}
if (outFile) writeJson(outFile, output);
else console.log(JSON.stringify(output, null, 2));

#!/usr/bin/env node
// الجولة اليدوية للموجة D (Docs/MJ/waves.json): «جولة سريعة على صفحة README وصفحة PR عامة في Chrome»، بنافذة مرئية
// (headless: false) على الحزمة المشحونة dist/chromium نفسها بعد الدمج (لا اختبارية). الصفحتان حقيقيتان عامتان محفوظتان في
// fixtures/spikes (README «Barqawiz/Shakkala» وطلب الدمج «Watad-Project/Watad#80»)، تُخدَمان محليًا بأصل github.com عبر Playwright
// route فلا شبكة خارجية، وجزء status-details يُخدَم بالمسار الذي تطلبه الوحدة (د). لا صفحات github.com حية.
// ما يُقاس لكل صفحة: المضيفات التي ركّبتها الوحدات المدمجة (ب د ز ح) ونصها الظاهر، وتأثير الوحدة (أ) على الاتجاه، ولقطة النافذة،
// وكل طلب شبكة خرج. وعلى صفحة PR: Alt+H الفعلي لوضع الشرح.
// الاستعمال: node evidence/wave-D/manual-round.mjs ← evidence/wave-D/manual-round.json وmanual-screens/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../scripts/load-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SCREENS = path.join(HERE, 'manual-screens');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const PAGES = {
  '/Barqawiz/Shakkala': { name: 'readme', file: 'fixtures/spikes/gh-readme-shakkala.html' },
  '/Watad-Project/Watad/pull/80': { name: 'pr', file: 'fixtures/spikes/gh-pr-watad-80.html' },
};
const STATUS_DETAILS = /^\/[^/]+\/[^/]+\/commit\/[0-9a-f]{40}\/status-details$/;
const FRAGMENT = read('tests/modules/d/fixtures/fixture-status-details.html');

async function waitUntil(fn, ms, step = 100) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(step);
  }
  return null;
}

// ما تراه الصفحة من الإضافة: المضيفات ونصها الظاهر، وسمات الاتجاه التي وضعتها الوحدة (أ).
const probe = () => {
  const text = (node) => (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const hosts = [...document.querySelectorAll('mijhar-host')].map((host) => {
    const rect = host.getBoundingClientRect();
    // النص الظاهر وحده: بلا <style> المضمّنة في الجذر الظلي.
    const visible = [...(host.shadowRoot?.childNodes ?? [])].filter((node) => node.nodeName !== 'STYLE').map((node) => text(node)).join(' ').replace(/\s+/g, ' ').trim();
    return { id: host.getAttribute('data-mijhar-host'), rect: [rect.x, rect.y, rect.width, rect.height].map(Math.round), text: visible.slice(0, 360), styles: host.getAttribute('data-mijhar-styles') };
  });
  return {
    url: location.pathname,
    hosts,
    directionFlipped: document.querySelectorAll('[data-mijhar-dir="rtl"]').length,
    directionKept: document.querySelectorAll('[data-mijhar-dir]:not([data-mijhar-dir="rtl"])').length,
    readerStyles: Boolean(document.querySelector('#mijhar-reading-styles')),
    title: document.title,
  };
};

const BROWSER = 'chrome';
const { executable, label } = BROWSERS[BROWSER];
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-wave-d-manual-'));
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: executable,
  headless: false,
  viewport: null,
  args: ['--enable-unsafe-extension-debugging', '--window-size=1280,900', '--no-first-run', '--no-default-browser-check'],
  ignoreDefaultArgs: ['--disable-extensions'],
});
const result = { label, mode: 'نافذة مرئية (headless: false)', bundle: 'dist/chromium', pages: {} };
const network = { github: [], apiGithub: [], other: [] };
try {
  const browser = context.browser();
  result.browserVersion = browser.version();
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'chrome-extension:' || url.protocol === 'data:' || url.protocol === 'about:') return;
    if (url.host === 'api.github.com') network.apiGithub.push(request.url());
    else if (url.host === 'github.com') network.github.push(url.pathname);
    else network.other.push(url.host);
  });
  await context.route('https://github.com/**', (route) => {
    const { pathname } = new URL(route.request().url());
    if (STATUS_DETAILS.test(pathname)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: FRAGMENT });
    const page = PAGES[pathname];
    if (!page) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: read(page.file) });
  });
  // أي مضيف آخر (أنماط github.githubassets.com وصور avatars…) يُرفض: لا شبكة خارجية.
  await context.route(/^https?:\/\/(?!github\.com\/)(?!127\.0\.0\.1)(?!localhost)/, (route) => route.abort());

  const cdp = await browser.newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
  result.extensionId = id;
  fs.mkdirSync(SCREENS, { recursive: true });

  const page = context.pages()[0] ?? (await context.newPage());
  // أخطاء الكونسول مصنَّفة بمصدرها: ما يصدر من الإضافة (chrome-extension://) هو المعني؛ والباقي أثر حجب الأصول الخارجية عمدًا وروابط الصفحة المحفوظة.
  const consoleErrors = [];
  page.on('console', (message) => message.type() === 'error' && consoleErrors.push({ text: message.text().slice(0, 160), source: (() => { try { return new URL(message.location().url).protocol === 'chrome-extension:' ? 'extension' : new URL(message.location().url).host || 'page'; } catch { return 'page'; } })() }));
  page.on('pageerror', (error) => consoleErrors.push({ text: String(error).slice(0, 160), source: String(error?.stack ?? '').includes('chrome-extension://') ? 'extension' : 'page-script' }));

  for (const [pathname, { name }] of Object.entries(PAGES)) {
    await page.goto(`https://github.com${pathname}`, { waitUntil: 'load' });
    await page.bringToFront();
    // الوحدات تركّب بعد جاهزية سكربت المحتوى؛ ننتظر استقرار عدد المضيفات.
    await waitUntil(async () => (await page.evaluate(probe)).hosts.length > 0, 10000);
    await sleep(2500);
    const state = await page.evaluate(probe);
    await page.screenshot({ path: path.join(SCREENS, `chrome-${name}.png`) });
    result.pages[name] = { ...state };

    if (name === 'pr') {
      // Alt+H الفعلي: وضع الشرح (الوحدة ب) على صفحة PR.
      const before = (await page.evaluate(probe)).hosts.map((h) => h.id);
      await page.keyboard.press('Alt+KeyH');
      await sleep(800);
      const after = await page.evaluate(probe);
      await page.screenshot({ path: path.join(SCREENS, 'chrome-pr-explain.png') });
      result.pages[name].explain = { hostsBefore: before, hostsAfter: after.hosts.map((h) => h.id), cardText: after.hosts.find((h) => h.id === 'b.card')?.text ?? null };
      await page.keyboard.press('Alt+KeyH');
      await sleep(400);
      result.pages[name].explain.hostsAfterOff = (await page.evaluate(probe)).hosts.map((h) => h.id);
    }
  }
  result.consoleErrors = consoleErrors;
  result.consoleErrorsBySource = consoleErrors.reduce((acc, e) => ({ ...acc, [e.source]: (acc[e.source] ?? 0) + 1 }), {});
} catch (error) {
  result.error = String(error?.stack ?? error);
} finally {
  result.network = { githubRequests: network.github.length, apiGithub: network.apiGithub, otherHosts: [...new Set(network.other)] };
  await context.close();
  fs.rmSync(profileDir, { recursive: true, force: true });
}

fs.writeFileSync(path.join(HERE, 'manual-round.json'), `${JSON.stringify(result, null, 2)}\n`);
for (const [name, state] of Object.entries(result.pages)) {
  console.log(`${label} ${result.browserVersion ?? ''} · ${name}: مضيفات ${JSON.stringify(state.hosts.map((h) => h.id))} · rtl ${state.directionFlipped} · محفوظ ${state.directionKept}${state.explain ? ` · Alt+H: ${JSON.stringify(state.explain.hostsAfter)} ثم ${JSON.stringify(state.explain.hostsAfterOff)}` : ''}`);
}
console.log(`أخطاء الكونسول بمصدرها: ${JSON.stringify(result.consoleErrorsBySource)} · api.github.com: ${result.network.apiGithub.length} · مضيفات أخرى حُجبت: ${JSON.stringify(result.network.otherHosts)}${result.error ? ` · خطأ: ${result.error.split('\n')[0]}` : ''}`);

#!/usr/bin/env node
// فحص الوحدة (ح) عبر طبقة API في الخلفية (AD-24) على الحزمة المشحونة نفسها (dist/chromium من npm run build)، بلا واجهة، بملف تعريف مؤقت ولا
// شبكة خارجية: github.com وapi.github.com يُخدَمان محليًا بـPlaywright route (يشمل طلبات service worker). اللوحة (sidepanel.html) تعمل
// صفحةَ إضافة في تبويب، والتبويب النشط صفحة مستودع على github.com.
//   1. صفر طلبات إلى api.github.com قبل النقر.
//   2. فحص docs/ بنقر: الطلب من service worker (الخلفية) لا من الصفحة، GET بلا Authorization، والنتيجة ورابطها في تبويب جديد.
//   3. النقر الثاني شرطي (If-None-Match) من ETag الخلفية ويُجاب بـ304 والنتيجة نفسها.
//   4. أعداد وسوم المبتدئين: ثلاثة طلبات بحث محصورة بالمستودع من الخلفية.
//   5. 429 بـRetry-After في مستودع: لا طلب ثانٍ من اللوحة ولا من صفحة إضافة أخرى (الحد مشترك في الخلفية).
//   6. تنقل التبويب النشط أثناء فحص بطيء: لا تظهر نتيجة المستودع السابق في الجديد.
// الصلاحية الاختيارية لا تُمنح آليًا في عائلة Chromium (نافذة الطلب، evidence/T-1.4)، فيُشغَّل على نسخة مشتقة من dist/chromium بإضافة
// https://api.github.com/* إلى host_permissions (المسار نفسه في tests/modules/d/browser/mj11-integration.mjs)؛ والشيفرة المشحونة كما هي.
// الاستعمال: node tests/modules/h/browser/background-api-check.mjs [chrome|edge|brave] [--out-dir evidence/wave-E/h-background-api]
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../../scripts/load-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const key = args[0] ?? 'chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(read, timeoutMs = 10000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}

const REPO_PAGE = fs.readFileSync(path.join(ROOT, 'tests/modules/h/fixtures/fixture-community-repo.html'), 'utf8');
const DOCS = [{ name: 'README.ar.md', path: 'docs/README.ar.md', type: 'file', html_url: 'https://github.com/octo/community/blob/main/docs/README.ar.md' }];
const rate = (resource, remaining) => ({ 'x-ratelimit-limit': resource === 'search' ? '10' : '60', 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600), 'x-ratelimit-resource': resource });

/** نسخة من dist/chromium بصلاحية api.github.com ممنوحة عند التثبيت، لقياس ما بعد المنح آليًا. */
function grantedCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-h-bg-'));
  fs.cpSync(path.join(ROOT, 'dist/chromium'), dir, { recursive: true });
  const manifestFile = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.host_permissions = [...(manifest.host_permissions ?? []), 'https://api.github.com/*'];
  delete manifest.optional_host_permissions;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  return dir;
}

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)}`}`);
};

async function main() {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-h-bg-profile-'));
  const extDir = grantedCopy();
  const context = await chromium.launchPersistentContext(profileDir, { executablePath: executable, headless: true, viewport: { width: 1280, height: 900 }, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
  const api = [];
  const others = new Set();
  const result = { label, browserVersion: context.browser().version(), grantMethod: 'نسخة مشتقة من dist/chromium بإضافة https://api.github.com/* إلى host_permissions', checks, api };
  try {
    await context.route('https://github.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: REPO_PAGE }));
    await context.route('https://api.github.com/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = request.headers();
      api.push({ method: request.method(), path: url.pathname + url.search, from: request.serviceWorker() ? 'service-worker' : 'page', ifNoneMatch: headers['if-none-match'] ?? null, authorization: headers.authorization ?? null });
      const json = (status, body, extra = {}) => route.fulfill({ status, contentType: 'application/json', headers: extra, body: JSON.stringify(body) });
      if (url.pathname === '/repos/octo/community/contents/docs') {
        return headers['if-none-match'] === '"d1"' ? route.fulfill({ status: 304, headers: { etag: '"d1"', ...rate('core', 55) } }) : json(200, DOCS, { etag: '"d1"', ...rate('core', 56) });
      }
      if (url.pathname === '/repos/octo/limited/contents/docs') return json(429, { message: 'secondary rate limit' }, { 'retry-after': '120', ...rate('core', 50) });
      if (url.pathname === '/repos/octo/slow/contents/docs') {
        await sleep(2000);
        return json(200, DOCS, rate('core', 40));
      }
      if (url.pathname === '/search/issues') {
        const q = url.searchParams.get('q') ?? '';
        return json(200, { total_count: q.includes('good first issue') ? 12 : q.includes('help wanted') ? 5 : 3 }, rate('search', 8));
      }
      return json(404, { message: 'Not Found' }, rate('core', 40));
    });
    await context.route((url) => url.protocol === 'https:' && url.host !== 'github.com' && url.host !== 'api.github.com', (route) => {
      others.add(new URL(route.request().url()).host);
      return route.abort();
    });
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: extDir });
    const origin = `chrome-extension://${id}`;
    const options = await context.newPage();
    await options.goto(`${origin}/options.html`);
    await options.waitForSelector('#app[data-ready="true"]');
    const errors = [];
    const repo = await context.newPage();
    repo.on('console', (m) => m.text().includes('[mijhar]') && errors.push(m.text()));
    await repo.goto('https://github.com/octo/community');
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 420, height: 1000 });
    panel.on('console', (m) => m.text().includes('[mijhar]') && errors.push(m.text()));
    await panel.goto(`${origin}/sidepanel.html`);
    await panel.waitForSelector('[role="tab"]');
    await panel.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes('المجتمع'))?.click());
    await repo.bringToFront();
    const ready = (slug) => waitUntil(() => panel.evaluate((s) => document.querySelector('[data-view="readme"]')?.textContent.includes(s) && Boolean(document.querySelector('[data-action="scan-docs"]')), slug), 12000);
    check('اللوحة تقرأ المستودع من التبويب النشط', await ready('octo/community'));
    check('قبل أي نقر: صفر طلبات إلى api.github.com', api.length === 0, api);

    const click = (selector) => panel.evaluate((s) => document.querySelector(s)?.click() ?? null, selector);
    const match = () => panel.evaluate(() => { const a = document.querySelector('[data-readme-match]'); return a ? { name: a.getAttribute('data-readme-match'), target: a.getAttribute('target'), rel: a.getAttribute('rel') } : null; });

    // 2. الفحص الأول.
    await click('[data-action="scan-docs"]');
    const found = await waitUntil(match, 8000);
    check('فحص docs/: النتيجة ورابطها في تبويب جديد', found?.name === 'README.ar.md' && found.target === '_blank' && found.rel === 'noopener noreferrer', found);
    check('الطلب الأول من service worker (الخلفية) لا من الصفحة، GET بلا Authorization', api.length === 1 && api[0].from === 'service-worker' && api[0].method === 'GET' && api[0].path === '/repos/octo/community/contents/docs' && api[0].authorization === null, api);

    // 3. النقر الثاني شرطي.
    await panel.reload();
    await panel.waitForSelector('[role="tab"]');
    await panel.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((t) => t.textContent.includes('المجتمع'))?.click());
    await ready('octo/community');
    await click('[data-action="scan-docs"]');
    const again = await waitUntil(match, 8000);
    check('الفحص الثاني (لوحة أعيد فتحها): If-None-Match من ETag الخلفية و304 والنتيجة نفسها', api.length === 2 && api[1].ifNoneMatch === '"d1"' && again?.name === 'README.ar.md', { api, again });

    // 4. أعداد الوسوم.
    const before = api.length;
    await click('[data-action="load-counts"]');
    const counts = await waitUntil(() => panel.evaluate(() => { const c = [...document.querySelectorAll('[data-section="beginner-labels"] [data-count]')].map((e) => e.getAttribute('data-count')); return c.length === 3 ? c : null; }), 8000);
    const search = api.slice(before);
    check('الأعداد: ثلاثة طلبات بحث من الخلفية محصورة بالمستودع', counts?.join() === '12,5,3' && search.length === 3 && search.every((r) => r.from === 'service-worker' && r.path.startsWith('/search/issues?q=repo%3Aocto%2Fcommunity%20') && r.authorization === null), { counts, search });

    // 5. Retry-After.
    await repo.goto('https://github.com/octo/limited');
    check('اللوحة تتبع التبويب النشط إلى مستودع آخر', await ready('octo/limited'));
    const mark = api.length;
    await click('[data-action="scan-docs"]');
    const limited = await waitUntil(() => panel.evaluate(() => document.querySelector('[data-scan-state="incomplete"]')?.textContent ?? null), 8000);
    check('429 بـRetry-After: الفحص لم يكتمل بوقت إعادة المحاولة، وطلب واحد فقط', /حد الطلبات/.test(limited ?? '') && /\d{2}:\d{2}/.test(limited ?? '') && api.length === mark + 1, { limited, api: api.slice(mark) });
    await panel.evaluate(() => document.querySelector('[data-action="scan-docs"]')?.click());
    await sleep(600);
    const refused = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'mijhar/public-api', op: 'get', path: '/repos/octo/elsewhere/pulls/1' }));
    check('بعد الرفض: لا طلب ثانٍ من اللوحة، وصفحة إضافة أخرى تُرفض محليًا بالموعد نفسه', api.length === mark + 1 && refused?.ok === false && refused.failure === 'rate-limit' && refused.retryAt > Date.now(), { api: api.slice(mark), refused });

    // 6. التنقل أثناء فحص بطيء.
    await repo.goto('https://github.com/octo/slow');
    await ready('octo/slow');
    const slowMark = api.length;
    await click('[data-action="scan-docs"]');
    await waitUntil(() => api.length > slowMark, 4000);
    await repo.goto('https://github.com/octo/other');
    await ready('octo/other');
    await sleep(2600);
    const leaked = await panel.evaluate(() => ({ match: Boolean(document.querySelector('[data-readme-match]')), state: document.querySelector('[data-scan-state]')?.getAttribute('data-scan-state') ?? null, scanning: document.querySelector('[data-action="scan-docs"]')?.disabled ?? null }));
    check('تنقل أثناء فحص بطيء: لا نتيجة للمستودع السابق في الجديد ولا زر معطّل', !leaked.match && leaked.state === null && leaked.scanning === false, leaked);

    if (outDir) {
      fs.mkdirSync(outDir, { recursive: true });
      await panel.screenshot({ path: path.join(outDir, `${key}-panel-community.png`), fullPage: true });
    }
    check('كل الطلبات إلى api.github.com من service worker، بلا Authorization', api.every((r) => r.from === 'service-worker' && r.authorization === null), api.filter((r) => r.from !== 'service-worker' || r.authorization));
    check('لا رسائل خطأ من الإضافة', errors.length === 0, errors);
    const devtools = await context.newPage();
    await devtools.goto('chrome://extensions');
    const info = await devtools.evaluate((extId) => chrome.developerPrivate.getExtensionInfo(extId), id);
    const runtime = (info.runtimeErrors ?? []).map((e) => e.message);
    const manifest = (info.manifestErrors ?? []).map((e) => e.message);
    check('لا أخطاء تشغيل ولا مانيفست مسجلة للإضافة', !runtime.length && !manifest.length, { runtime, manifest });
    result.blockedExternalHosts = [...others].sort();
    check('لا مضيف خارجي غير github.com وapi.github.com', others.size === 0, [...others]);
  } catch (error) {
    result.error = String(error?.stack ?? error);
    check('اكتمل السيناريو', false, result.error);
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
    fs.rmSync(extDir, { recursive: true, force: true });
  }
  if (outDir) fs.writeFileSync(path.join(outDir, `${key}-background-api.json`), JSON.stringify(result, null, 2));
  const passed = checks.filter((c) => c.ok).length;
  console.log(`${label} ${result.browserVersion}: ${passed}/${checks.length}`);
  process.exit(passed === checks.length ? 0 : 1);
}

main();

#!/usr/bin/env node
// فحص تكامل MJ8 على الحزمة المشحونة نفسها (dist/chromium وdist/firefox من npm run build)، لا على حزمة اختبار تحقن الوحدة:
// سكربت المحتوى الحقيقي يركّب BUILTIN_MODULES (الوحدة (ب) وبطاقتها، والوحدة (د) بوحدتيها)، والاختصار Alt+H حدث لوحة مفاتيح فعلي،
// والزر يراسل التبويب من صفحة الإضافة، ومفاتيح الوحدات من صفحة الإعدادات الحقيقية. الصفحات تُخدم على https://github.com/... محليًا:
// Playwright route في عائلة Chromium، وخادم HTTPS محلي ووكيل في Firefox (نمط evidence/wave-C/integration-check.mjs).
//   1. عينة واجهة المستودع: Alt+H يفعّل الوضع (٢٠ شارة)، وبطاقة، وAlt+H ثانيةً توقفه.
//   2. رسالة «toggle» من صفحة إضافة إلى التبويب (مسار زر اللوحة الأصلية) تفعّل الوضع وتوقفه، والدرج (الحالة المباشرة) يعمل على الحالة نفسها.
//   3. مفتاح «بطاقة الشرح» من صفحة الإعدادات يوقف الوحدة فلا يعمل الاختصار، ثم يعيدها.
//   4. PR معقدة (صندوق دمج): بطاقة الحالة بحقولها وبفصل الإلزامي عن الاختياري.
//   5. PR حقيقية محفوظة: البطاقة، وطلب واحد إلى github.com نفسه لجزء status-details (المسار الافتراضي الذي يُشحن) يُخدم محليًا.
//   6. صفحة مقارنة: الملخص المؤكد وقسم الأثر المنفصل. 7. مفاتيح الوحدات (د) من الإعدادات تزيل مضيفاتها.
//   8. تدقيق الشبكة: صفر طلبات إلى api.github.com، ولا مضيف خارجي خدمه الاختبار (الأنماط الخارجية للصفحات الحقيقية تُحجب).
// الاستعمال: node tests/modules/browser/integration.mjs [chrome edge brave firefox] [--out-dir evidence]
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../scripts/load-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(read, timeoutMs = 8000, stepMs = 50) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const SAMPLE_URL = 'https://github.com/octo/demo';
const PR_URL = 'https://github.com/octo/demo/pull/4242';
const REAL_PR_URL = 'https://github.com/Watad-Project/Watad/pull/80';
const COMPARE_URL = 'https://github.com/octo/demo/compare/main...feature%2Fui-refresh';
const PAGES = {
  '/octo/demo': { file: 'tests/modules/b/card/fixtures/fixture-github-ui-sample.html' },
  '/octo/demo/pull/4242': { file: 'tests/modules/d/fixtures/fixture-pr-complex.html' },
  '/Watad-Project/Watad/pull/80': { file: 'fixtures/spikes/gh-pr-watad-80.html' },
  '/octo/demo/compare/main...feature%2Fui-refresh': { file: 'tests/modules/d/fixtures/fixture-compare-branches.html' },
};
const STATUS_DETAILS = /^\/Watad-Project\/Watad\/commit\/[0-9a-f]{40}\/status-details$/;
const RAW = Object.fromEntries(Object.entries(PAGES).map(([p, v]) => [p, read(v.file)]));
const FRAGMENT = read('tests/modules/d/fixtures/fixture-status-details.html');

/** ما يخدمه «github.com» المحلي: صفحة أو جزء status-details، وإلا 404. */
function serve(pathname) {
  if (PAGES[pathname]) return { status: 200, type: 'text/html; charset=utf-8', body: RAW[pathname] };
  if (STATUS_DETAILS.test(pathname)) return { status: 200, type: 'text/html; charset=utf-8', body: FRAGMENT };
  return { status: 404, type: 'text/plain', body: 'not found' };
}

// ---------- مجسّات في عالم الصفحة (تعمل في Chromium وفي صندوق Marionette) ----------

function cardState() {
  const hosts = [...document.querySelectorAll('mijhar-host[data-mijhar-host="b.card"]')];
  const root = hosts[0]?.shadowRoot;
  const badges = [...(root?.querySelectorAll('.badge') ?? [])];
  return {
    hosts: hosts.length,
    badges: badges.length,
    entries: badges.map((b) => b.getAttribute('data-entry')),
    bar: root?.querySelector('[data-bar]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    card: root?.querySelector('.card')?.getAttribute('data-entry') ?? null,
    title: root?.querySelector('.card h2')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    enDir: root?.querySelector('.card h2 bdi')?.getAttribute('dir') ?? null,
  };
}
function clickBadge(entry) {
  const badge = document.querySelector('mijhar-host[data-mijhar-host="b.card"]')?.shadowRoot?.querySelector(`.badge[data-entry="${entry}"]`);
  badge?.click();
  return Boolean(badge);
}
function pressEscapeInCard() {
  document.querySelector('mijhar-host[data-mijhar-host="b.card"]')?.shadowRoot?.querySelector('.card')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  return true;
}
function prState() {
  const host = document.querySelector('mijhar-host[data-mijhar-host="d.pr-status"]');
  const root = host?.shadowRoot;
  const t = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const field = (name) => t(root?.querySelector(`[data-field="${name}"] dd`));
  const chips = {};
  for (const group of root?.querySelectorAll('ul[data-group]') ?? []) {
    chips[group.getAttribute('data-group')] = Object.fromEntries([...group.querySelectorAll('.d-chip')].map((c) => [c.getAttribute('data-category'), Number(t(c.querySelector('.n')))]));
  }
  return {
    hosts: document.querySelectorAll('mijhar-host[data-mijhar-host="d.pr-status"]').length,
    card: Boolean(root?.querySelector('[data-card="pr-status"]')),
    state: t(root?.querySelector('.d-state')),
    branches: field('branches'),
    commits: field('commits'),
    files: field('files'),
    lines: field('lines'),
    reviews: field('reviews'),
    conflicts: field('conflicts'),
    behind: field('behind'),
    checksState: root?.querySelector('[data-checks-state]')?.getAttribute('data-checks-state') ?? null,
    requiredUnavailable: Boolean(root?.querySelector('[data-required="unavailable"]')),
    groups: [...(root?.querySelectorAll('div[data-group]') ?? [])].map((g) => g.getAttribute('data-group')),
    chips,
  };
}
function compareState() {
  const hosts = [...document.querySelectorAll('mijhar-host[data-mijhar-host="d.compare"]')];
  const facts = hosts[0]?.shadowRoot?.querySelector('[data-section="facts"]');
  const impact = hosts[1]?.shadowRoot?.querySelector('[data-section="impact"]');
  const t = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return {
    hosts: hosts.length,
    siblings: hosts.length === 2 && hosts[0].parentNode === hosts[1].parentNode,
    agreement: facts?.querySelector('[data-field="read"] dd')?.getAttribute('data-agreement') ?? null,
    completeness: facts?.querySelector('[data-completeness]')?.getAttribute('data-completeness') ?? null,
    pageFiles: t(facts?.querySelector('[data-field="page-files"] dd')),
    total: [...(facts?.querySelectorAll('tfoot td') ?? [])].map((td) => t(td)),
    tag: t(impact?.querySelector('[data-review="human"]')),
    impactBorder: impact ? getComputedStyle(impact).borderTopStyle : null,
  };
}
function hostCounts() {
  return { b: document.querySelectorAll('mijhar-host[data-mijhar-host="b.card"]').length, prStatus: document.querySelectorAll('mijhar-host[data-mijhar-host="d.pr-status"]').length, compare: document.querySelectorAll('mijhar-host[data-mijhar-host="d.compare"]').length, drawer: document.querySelectorAll('mijhar-host[data-mijhar-host="drawer"]').length };
}
function htmlMatches(raw) {
  const original = new DOMParser().parseFromString(raw, 'text/html').documentElement.outerHTML;
  // ورقة أنماط الوحدة (أ) (#mijhar-reading-styles، MJ6) تُدرج في كل صفحة بإعدادات الاتجاه الافتراضية: ليست من هذه المرحلة فتُستثنى.
  const clone = document.documentElement.cloneNode(true);
  clone.querySelector('#mijhar-reading-styles')?.remove();
  // لقطة Playwright (قبل هذا الفحص في السيناريو) تضيف style="" فارغة على حقول الإدخال: أثر الأداة لا الإضافة.
  for (const el of clone.querySelectorAll('[style=""]')) el.removeAttribute('style');
  const live = clone.outerHTML;
  if (original === live) return { equal: true };
  let i = 0;
  while (i < original.length && original[i] === live[i]) i += 1;
  return { equal: false, at: i, original: original.slice(Math.max(0, i - 80), i + 80), live: live.slice(Math.max(0, i - 80), i + 80) };
}

// ---------- السيناريو المشترك بين المتصفحين ----------
// d: واجهة موحّدة: open(name, url) · press(name, 'Alt+KeyH') · page(name, fn, ...args) · options(fn, ...args) · clickOptions(selector) · isChecked(selector)
//    · sendToTab(url, message) (من صفحة الإضافة) · shot(name, file)

async function scenario(d, steps, checks, label) {
  const check = (name, ok, detail) => {
    checks.push({ browser: label, name, ok: Boolean(ok), detail });
    if (!ok) console.error(`  ✗ ${label} · ${name}: ${JSON.stringify(detail)}`);
  };
  const ready = async (url) => waitUntil(async () => (await d.sendToTab(url, { type: 'mijhar:explain', action: 'status' }).catch(() => null))?.active === false, 10000, 100);

  // 1. عينة المستودع والاختصار الفعلي.
  await d.open('sample', SAMPLE_URL);
  steps.ready = Boolean(await ready(SAMPLE_URL));
  check('سكربت المحتوى جاهز والوحدة (ب) تردّ على رسالة الحالة (مفعَّلة، الوضع متوقف)', steps.ready, steps.ready);
  steps.beforeKey = await d.page('sample', cardState);
  check('قبل الاختصار لا مضيف للوحدة (ب)', steps.beforeKey.hosts === 0, steps.beforeKey);
  await d.press('sample', 'Alt+KeyH');
  steps.afterKey = await waitUntil(async () => ((await d.page('sample', cardState)).badges > 0 ? await d.page('sample', cardState) : null), 6000, 100);
  check('Alt+H الفعلي فعّل الوضع: مضيف واحد و٢٠ شارة وشريط الوضع', steps.afterKey?.hosts === 1 && steps.afterKey?.badges === 20 && /20/.test(steps.afterKey?.bar ?? ''), steps.afterKey);
  check('لا شرح لشرك (حذف المستودع)', !steps.afterKey?.entries?.includes('delete_repo'), steps.afterKey?.entries);
  await d.page('sample', clickBadge, 'star');
  steps.card = await waitUntil(async () => ((await d.page('sample', cardState)).card ? await d.page('sample', cardState) : null), 4000, 100);
  check('النقر على الشارة يفتح بطاقة النجمة بصيغة «العربي (English)» والإنجليزي dir=ltr', steps.card?.card === 'star' && steps.card?.title === 'النجمة (Star)' && steps.card?.enDir === 'ltr', steps.card);
  if (d.shot) await d.shot('sample', 'sample-card');
  await d.page('sample', pressEscapeInCard);
  await sleep(200);
  check('Escape يغلق البطاقة', (await d.page('sample', cardState)).card === null, null);
  await d.press('sample', 'Alt+KeyH');
  steps.afterSecondKey = await waitUntil(async () => ((await d.page('sample', cardState)).badges === 0 ? await d.page('sample', cardState) : null), 4000, 100);
  check('Alt+H ثانيةً توقف الوضع وتفرّغ الطبقة', steps.afterSecondKey?.badges === 0, steps.afterSecondKey);

  // 2. رسالة الزر من صفحة الإضافة (مسار اللوحة الأصلية).
  steps.msgOn = await d.sendToTab(SAMPLE_URL, { type: 'mijhar:explain', action: 'toggle' });
  const onState = await waitUntil(async () => ((await d.page('sample', cardState)).badges > 0 ? await d.page('sample', cardState) : null), 4000, 100);
  check('رسالة toggle من صفحة الإضافة تفعّل الوضع (٢٠ شارة) وتعيد active=true', steps.msgOn?.active === true && onState?.badges === 20, { msg: steps.msgOn, badges: onState?.badges });
  steps.msgStatus = await d.sendToTab(SAMPLE_URL, { type: 'mijhar:explain', action: 'status' });
  steps.msgOff = await d.sendToTab(SAMPLE_URL, { type: 'mijhar:explain', action: 'off' });
  await sleep(200);
  check('status وoff: الحالة تتبع وتتوقف الشارات', steps.msgStatus?.active === true && steps.msgOff?.active === false && (await d.page('sample', cardState)).badges === 0, { status: steps.msgStatus, off: steps.msgOff });
  steps.foreign = await d.sendToTab(SAMPLE_URL, { type: 'mijhar:explain', action: 'explode' }).catch((e) => ({ rejected: String(e).slice(0, 80) }));
  check('رسالة بإجراء غريب لا تغيّر الحالة', !steps.foreign || steps.foreign.active === undefined, steps.foreign);

  // 3. مفتاح بطاقة الشرح من صفحة الإعدادات.
  steps.toggleBefore = await d.isChecked('#mj-b-card');
  await d.clickOptions('#mj-b-card');
  await d.press('sample', 'Alt+KeyH');
  await sleep(500);
  steps.disabled = await d.page('sample', cardState);
  steps.disabledMatches = await d.page('sample', htmlMatches, RAW['/octo/demo']);
  check('مفتاح «بطاقة الشرح» مطفأ: لا مضيف ولا شارات والاختصار لا يفعل شيئًا، وDOM الصفحة كما أُرسل', steps.toggleBefore === true && steps.disabled.hosts === 0 && steps.disabled.badges === 0 && steps.disabledMatches.equal, { before: steps.toggleBefore, disabled: steps.disabled, html: steps.disabledMatches });
  await d.clickOptions('#mj-b-card');
  await sleep(300);
  await d.press('sample', 'Alt+KeyH');
  steps.reenabled = await waitUntil(async () => ((await d.page('sample', cardState)).badges > 0 ? await d.page('sample', cardState) : null), 5000, 100);
  check('إعادة تشغيل المفتاح: الاختصار يعمل من جديد', steps.reenabled?.badges === 20, steps.reenabled);
  await d.press('sample', 'Alt+KeyH');

  // 4. PR المعقدة.
  await d.open('pr', PR_URL);
  steps.pr = await waitUntil(async () => ((await d.page('pr', prState)).card ? await d.page('pr', prState) : null), 10000, 100);
  check('PR المعقدة: بطاقة الحالة بالحقول والفرعين', steps.pr?.hosts === 1 && steps.pr.state === 'مفتوح' && steps.pr.branches.includes('feature/ui-refresh') && steps.pr.commits === '3' && steps.pr.files === '12', steps.pr);
  check('المراجعات والتعارض والتأخر من صندوق الدمج', steps.pr?.reviews === 'مطلوب مراجعة' && steps.pr?.conflicts === 'يوجد تعارض يجب حله' && steps.pr?.behind === 'متأخر عن فرع الهدف', steps.pr);
  check('فصل الإلزامية (4) عن الاختيارية (5) والتصنيفات', steps.pr?.groups?.join() === 'required,optional' && steps.pr.chips.required?.success === 1 && steps.pr.chips.required?.['not-run'] === 1 && steps.pr.chips.optional?.unknown === 1 && steps.pr.chips.optional?.cancelled === 1, steps.pr?.chips);
  if (d.shot) await d.shot('pr', 'pr-complex');

  // 5. PR الحقيقية.
  await d.open('real', REAL_PR_URL);
  steps.real = await waitUntil(async () => {
    const s = await d.page('real', prState);
    return s.card && s.checksState === null ? s : null;
  }, 12000, 150);
  check('PR الحقيقية: الفرعان والالتزامات والملفات والأسطر، والمراجعات من الشريط الجانبي، والتعارض والتأخر غير متاحين', steps.real?.branches.includes('feature/contractor-work-tabs') && steps.real.commits === '8' && steps.real.files === '56' && steps.real.lines.includes('5,381') && steps.real.reviews === 'طُلبت تغييرات' && steps.real.conflicts === 'غير متاح' && steps.real.behind === 'غير متاح', steps.real);
  check('الفحوص من جزء status-details: مجموعة واحدة بلا فصل إلزامي (غير متاح) وبـ٦ صفوف مصنَّفة', steps.real?.groups?.join() === 'all' && steps.real.requiredUnavailable && steps.real.chips.all?.success === 2 && steps.real.chips.all?.failure === 1, steps.real?.chips);
  if (d.shot) await d.shot('real', 'pr-real');

  // 6. المقارنة.
  await d.open('compare', COMPARE_URL);
  steps.compare = await waitUntil(async () => ((await d.page('compare', compareState)).hosts === 2 ? await d.page('compare', compareState) : null), 10000, 100);
  check('المقارنة: مضيفان شقيقان، مطابقة كاملة للصفحة، وقسم الأثر موسوم بحدّ متقطع', steps.compare?.siblings && steps.compare.agreement === 'match' && steps.compare.completeness === 'complete' && steps.compare.pageFiles === '30' && steps.compare.total?.[0] === '30' && steps.compare.tag === 'يحتاج مراجعة بشرية' && steps.compare.impactBorder === 'dashed', steps.compare);
  if (d.shot) await d.shot('compare', 'compare-branches');

  // 7. مفاتيح الوحدات (د).
  await d.clickOptions('#mj-d-compare');
  steps.compareOff = await waitUntil(async () => ((await d.page('compare', hostCounts)).compare === 0 ? await d.page('compare', hostCounts) : null), 5000, 100);
  check('مفتاح «ملخص المقارنة» يزيل مضيفيه من الصفحة المفتوحة', steps.compareOff?.compare === 0, steps.compareOff);
  await d.clickOptions('#mj-d-compare');
  steps.compareOn = await waitUntil(async () => ((await d.page('compare', hostCounts)).compare === 2 ? await d.page('compare', hostCounts) : null), 5000, 100);
  check('وإعادته تعيدهما', steps.compareOn?.compare === 2, steps.compareOn);
  await d.clickOptions('#mj-d-pr-status');
  steps.prOff = await waitUntil(async () => ((await d.page('pr', hostCounts)).prStatus === 0 ? await d.page('pr', hostCounts) : null), 5000, 100);
  check('مفتاح «ملخص حالة طلب الدمج» يزيل المضيف', steps.prOff?.prStatus === 0, steps.prOff);
  await d.clickOptions('#mj-d-pr-status');
  steps.prOn = await waitUntil(async () => ((await d.page('pr', hostCounts)).prStatus === 1 ? await d.page('pr', hostCounts) : null), 5000, 100);
  check('وإعادته تعيده', steps.prOn?.prStatus === 1, steps.prOn);
}

// ---------- عائلة Chromium ----------

async function chromiumRun(key) {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj8-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executable,
    headless: true,
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const result = { label, steps: {}, checks: [], console: [] };
  const network = { apiGithub: [], githubPaths: [], blockedHosts: new Set() };
  try {
    const browser = context.browser();
    result.browserVersion = browser.version();
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.host === 'api.github.com') network.apiGithub.push(request.url());
      else if (url.host === 'github.com' && STATUS_DETAILS.test(url.pathname)) network.githubPaths.push(url.pathname);
    });
    await context.route('https://github.com/**', (route) => {
      const r = serve(new URL(route.request().url()).pathname);
      return route.fulfill({ status: r.status, contentType: r.type, body: r.body });
    });
    await context.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '"محلي: لا شبكة"' }));
    // الصفحات الحقيقية المحفوظة تطلب أنماطًا وصورًا من مضيفات GitHub الأخرى: تُحجب فلا شبكة خارجية في الاختبار.
    await context.route((url) => url.protocol === 'https:' && !['github.com', 'api.github.com'].includes(url.host), (route) => {
      network.blockedHosts.add(new URL(route.request().url()).host);
      return route.abort();
    });
    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
    const origin = `chrome-extension://${id}`;
    // أخطاء الصفحة نفسها (أنماط محجوبة، 404 لأيقونة) ليست من الإضافة: يُسجَّل ما كتبته الإضافة أو جاء من نصها.
    const watch = (page, name) => page.on('console', (m) => (m.text().includes('[mijhar]') || m.location().url.startsWith('chrome-extension://')) && result.console.push(`${name}: ${m.type()}: ${m.text()}`));
    const pages = {};
    const optionsPage = await context.newPage();
    watch(optionsPage, 'options');
    await optionsPage.goto(`${origin}/options.html`);
    await optionsPage.waitForSelector('#app[data-ready="true"]');
    const screensDir = outDir ? path.join(outDir, 'T-3.2/integration-screens') : null;
    if (screensDir) fs.mkdirSync(screensDir, { recursive: true });
    const d = {
      async open(name, url) {
        pages[name] ??= await context.newPage();
        watch(pages[name], name);
        await pages[name].goto(url);
        await pages[name].bringToFront();
      },
      async press(name, combo) {
        await pages[name].bringToFront();
        await pages[name].keyboard.press(combo);
      },
      page: (name, fn, arg) => pages[name].evaluate(fn, arg),
      async clickOptions(selector) {
        await optionsPage.bringToFront();
        await optionsPage.click(selector);
        await sleep(200);
        await pages.sample?.bringToFront();
      },
      isChecked: (selector) => optionsPage.isChecked(selector),
      sendToTab: (url, message) =>
        optionsPage.evaluate(
          ([u, m]) => chrome.tabs.query({ url: 'https://github.com/*' }).then((tabs) => Promise.all(tabs.filter((t) => t.url === u).map((t) => chrome.tabs.sendMessage(t.id, m)))).then((r) => r[0]),
          [url, message],
        ),
      async shot(name, file) {
        if (screensDir) await pages[name].screenshot({ path: path.join(screensDir, `${key}-${file}.png`) });
      },
    };
    await scenario(d, result.steps, result.checks, label);
    const devtools = await context.newPage();
    await devtools.goto('chrome://extensions');
    const info = await devtools.evaluate((extId) => chrome.developerPrivate.getExtensionInfo(extId), id);
    result.extensionErrors = { runtime: (info.runtimeErrors ?? []).map((e) => e.message), manifest: (info.manifestErrors ?? []).map((e) => e.message) };
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = { apiGithub: network.apiGithub, statusDetailsRequests: network.githubPaths, blockedExternalHosts: [...network.blockedHosts].sort() };
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  return result;
}

// ---------- Firefox: Marionette خلف خادم HTTPS ووكيل محليين ----------

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
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-mj8-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
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
    const pathname = new URL(req.url, 'https://github.com').pathname;
    log.requests.push({ host, path: pathname });
    if (host === 'api.github.com') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('"محلي: لا شبكة"');
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
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj8-ff-'));
  const profileDir = path.join(workDir, 'profile');
  fs.mkdirSync(profileDir);
  const servers = await startServers(workDir);
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${firefoxPrefs(servers.proxyPort)}\n`);
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const result = { label: 'Firefox', steps: {}, checks: [], console: [] };
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
    const chromeScript = async (script, a = []) => {
      await setContext('chrome');
      return (await c.send('WebDriver:ExecuteScript', { script, args: a })).value;
    };
    await chromeScript(`Cc['@mozilla.org/security/x509certdb;1'].getService(Ci.nsIX509CertDB).addCertFromBase64(arguments[0], 'C,,'); return true;`, [servers.caDer]);
    const runIn = async (fn, ...a) => {
      await setContext('content');
      return (await c.send('WebDriver:ExecuteScript', { script: `return (${fn})(...arguments)`, args: a })).value;
    };
    const runAsync = async (body, a = []) => {
      await setContext('content');
      return (await c.send('WebDriver:ExecuteAsyncScript', { script: `const done = arguments[arguments.length - 1]; Promise.resolve((async () => { ${body} })()).then(done, (e) => done({ thrown: String(e) }))`, args: a })).value;
    };
    const host = await chromeScript('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [id]);
    const origin = `moz-extension://${host}`;
    const handles = {};
    const switchTo = async (name) => {
      await setContext('content');
      await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
    };
    const openTab = async (name, url) => {
      await setContext('content');
      if (handles[name]) {
        await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
      } else {
        const { handle } = await c.send('WebDriver:NewWindow', { type: 'tab' });
        handles[name] = handle;
        await c.send('WebDriver:SwitchToWindow', { handle });
      }
      await c.send('WebDriver:Navigate', { url });
    };
    const KEYS = { Alt: '' };
    await openTab('options', `${origin}/options.html`);
    await waitUntil(async () => (await runIn(() => document.querySelector('#app')?.getAttribute('data-ready'))) === 'true', 8000, 100);
    const d = {
      async open(name, url) {
        await openTab(name, url);
      },
      async press(name, combo) {
        await switchTo(name);
        const [mod, code] = combo.split('+');
        const letter = code.replace('Key', '').toLowerCase();
        await c.send('WebDriver:PerformActions', { actions: [{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value: KEYS[mod] }, { type: 'keyDown', value: letter }, { type: 'keyUp', value: letter }, { type: 'keyUp', value: KEYS[mod] }] }] });
        await c.send('WebDriver:ReleaseActions');
      },
      async page(name, fn, arg) {
        await switchTo(name);
        return arg === undefined ? runIn(fn) : runIn(fn, arg);
      },
      async clickOptions(selector) {
        await switchTo('options');
        await setContext('content');
        const { value: el } = await c.send('WebDriver:FindElement', { using: 'css selector', value: selector });
        await c.send('WebDriver:ElementClick', { id: el['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(el)[0] });
        await sleep(200);
      },
      async isChecked(selector) {
        await switchTo('options');
        return runIn((s) => document.querySelector(s)?.checked ?? null, selector);
      },
      async sendToTab(url, message) {
        await switchTo('options');
        const r = await runAsync(
          `const api = globalThis.browser ?? window.wrappedJSObject?.browser;
           const tabs = await api.tabs.query({ url: 'https://github.com/*' });
           const own = tabs.filter((t) => t.url === arguments[0]);
           if (!own.length) return { noTab: true };
           return await api.tabs.sendMessage(own[0].id, arguments[1]);`,
          [url, message],
        );
        return r && r.noTab ? null : r;
      },
    };
    await scenario(d, result.steps, result.checks, 'Firefox');
    result.console = await chromeScript(`return Services.console.getMessageArray().map((m) => m.message ?? (m.errorMessage ? m.errorMessage + ' @ ' + m.sourceName : String(m))).filter((t) => /mijhar|moz-extension/i.test(t));`);
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = {
      apiGithub: servers.log.requests.filter((r) => r.host === 'api.github.com'),
      statusDetailsRequests: servers.log.requests.filter((r) => r.host === 'github.com' && STATUS_DETAILS.test(r.path)).map((r) => r.path),
      blockedExternalHosts: [...new Set(servers.log.refused)].sort(),
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

const keys = args.filter((a) => BROWSERS[a]);
const results = {};
const allChecks = [];
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox']) {
  results[key] = key === 'firefox' ? await firefoxRun() : await chromiumRun(key);
  const r = results[key];
  // تدقيق الشبكة ورسائل الإضافة يُحسبان فحوصًا مثل غيرهما.
  const add = (name, ok, detail) => {
    r.checks.push({ browser: r.label, name, ok: Boolean(ok), detail });
    if (!ok) console.error(`  ✗ ${r.label} · ${name}: ${JSON.stringify(detail)}`);
  };
  add('اكتمل التشغيل بلا خطأ', !r.error, r.error?.split('\n')[0]);
  add('تدقيق الشبكة: صفر طلبات إلى api.github.com', (r.network?.apiGithub?.length ?? 1) === 0, r.network?.apiGithub);
  add('جزء status-details طُلب مرة واحدة بالضبط من github.com لالتزام الرأس في PR الحقيقية', r.network?.statusDetailsRequests?.length === 1, r.network?.statusDetailsRequests);
  if (r.extensionErrors) add('لا أخطاء تشغيل ولا مانيفست للإضافة', r.extensionErrors.runtime.length === 0 && r.extensionErrors.manifest.length === 0, r.extensionErrors);
  allChecks.push(...r.checks);
  const bad = r.checks.filter((c) => !c.ok).length;
  console.log(`${r.label} ${r.browserVersion ?? ''}: ${r.checks.length - bad}/${r.checks.length} فحصًا · أخطاء الكونسول ${r.console?.length ?? 0}${r.error ? ` · خطأ: ${r.error.split('\n')[0]}` : ''}`);
}
console.log(`المجموع: ${allChecks.filter((c) => c.ok).length}/${allChecks.length} فحصًا اجتاز`);
if (outDir) {
  fs.mkdirSync(path.join(outDir, 'T-3.2'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'T-3.2/integration.json'), `${JSON.stringify(results, null, 2)}\n`);
}
if (allChecks.some((c) => !c.ok)) process.exitCode = 1;

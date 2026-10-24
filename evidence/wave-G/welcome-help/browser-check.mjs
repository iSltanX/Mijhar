#!/usr/bin/env node
// فحص الترحيب ودليل رمز GitHub (AD-29) على الحزمة المشحونة نفسها (dist/chromium من npm run build) في عائلة Chromium، بلا واجهة، بملف تعريف
// مؤقت يُحذف بعده، ولا شبكة خارجية (كل https خارج الإضافة يُرفض ويُسجَّل). التحميل بـCDP Extensions.loadUnpacked يطلق runtime.onInstalled
// بالسبب install كما يحدث للمستخدم عند التثبيت.
//   1. التثبيت يكتب ui.welcome = pending، واللوحة (sidepanel.html) تعرض الترحيب والتبويبات الخمسة ظاهرة.
//   2. الخطوة الثانية: الرمز متاح وله دليل، والمفتاح «لم يُتح بعد»؛ و«كيف أحصل على الرمز؟» يفتح options.html#guide/github-token في تبويب.
//   3. «تخطَّ» ينهيه، وإعادة فتح اللوحة لا تعيده؛ و«جولة الترحيب» تعيده؛ واختيار تبويب ينهيه.
//   4. صفحة الدليل: سبع خطوات برسومها ووسومها، وروابط في تبويب جديد، والرجوع إلى قسم الرمز؛ ولقطات بالوضعين وبعرض 360.
//   5. لا طلب شبكة إلى أي مضيف خارجي، ولا أخطاء تشغيل للإضافة.
// الاستعمال: node evidence/wave-G/welcome-help/browser-check.mjs [chrome|edge|brave ...]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const BROWSERS = {
  chrome: { label: 'Chrome', executable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  edge: { label: 'Edge', executable: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
  brave: { label: 'Brave', executable: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
};
const WELCOME = 'mijhar:data:setting.ui.welcome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(read, timeoutMs = 6000) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await read();
    if (v || Date.now() > end) return v;
    await sleep(100);
  }
}

async function run(key) {
  const { executable, label } = BROWSERS[key];
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-welcome-${key}-`));
  const shots = path.join(HERE, 'screens');
  fs.mkdirSync(shots, { recursive: true });
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: executable,
    headless: true,
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const result = { label, browserVersion: context.browser().version(), checks: [] };
  const check = (name, ok, detail) => result.checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
  const external = [];
  context.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'https:' || u.protocol === 'http:') external.push(r.url());
  });
  await context.route((u) => u.protocol === 'https:' || u.protocol === 'http:', (route) => route.abort());
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
    const origin = `chrome-extension://${id}`;
    const options = await context.newPage();
    await options.goto(`${origin}/options.html`);
    await options.waitForSelector('#app[data-ready="true"]');
    const stored = await waitFor(async () => (await options.evaluate((k) => chrome.storage.local.get(k), WELCOME))[WELCOME]);
    check('التثبيت الأول يكتب ui.welcome = pending', stored === 'pending', stored);

    // ——— اللوحة ———
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 360, height: 900 });
    await panel.goto(`${origin}/sidepanel.html`);
    await panel.waitForSelector('[role="tab"]');
    await panel.waitForSelector('.welcome');
    const s1 = await panel.evaluate(() => ({
      tabs: document.querySelectorAll('[role="tab"]').length,
      step: document.querySelector('.welcome')?.getAttribute('data-welcome-step'),
      inputs: document.querySelectorAll('input, textarea, select').length,
      titleFont: getComputedStyle(document.querySelector('#mj-welcome-title')).fontFamily,
      bodyFont: getComputedStyle(document.querySelector('.welcome .lead')).fontFamily,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    check('اللوحة: الترحيب (الخطوة ١) والتبويبات الخمسة ظاهرة، بلا حقل إدخال ولا تمرير أفقي في 360', s1.tabs === 5 && s1.step === '1' && s1.inputs === 0 && !s1.overflow, s1);
    check('الخطان: العنوان Cairo والنص Almarai (ثم بدائلهما)', /^Cairo/.test(s1.titleFont) && /^Almarai/.test(s1.bodyFont), s1);
    await panel.screenshot({ path: path.join(shots, `${key}-panel-welcome-1.png`), fullPage: true });
    await panel.click('[data-action="welcome-next"]');
    const s2 = await panel.evaluate(() => ({
      step: document.querySelector('.welcome')?.getAttribute('data-welcome-step'),
      focus: document.activeElement?.id,
      token: document.querySelector('[data-connection="github-token"]')?.getAttribute('data-status'),
      key: document.querySelector('[data-connection="provider-key"]')?.textContent,
    }));
    check('الخطوة ٢: التركيز على عنوانها، والرمز متاح، والمفتاح «لم يُتح بعد»', s2.step === '2' && s2.focus === 'mj-welcome-title' && s2.token === 'available' && s2.key?.includes('لم يُتح بعد'), s2);
    await panel.screenshot({ path: path.join(shots, `${key}-panel-welcome-2.png`), fullPage: true });
    const opened = context.waitForEvent('page', { timeout: 6000 }).catch(() => null);
    await panel.click('[data-action="guide-github-token"]');
    const guideTab = await opened;
    if (guideTab) await guideTab.waitForLoadState();
    check('«كيف أحصل على الرمز؟» يفتح options.html#guide/github-token في تبويب جديد', guideTab?.url() === `${origin}/options.html#guide/github-token`, guideTab?.url());
    const stillPending = (await options.evaluate((k) => chrome.storage.local.get(k), WELCOME))[WELCOME];
    check('فتح الدليل لا ينهي الترحيب', stillPending === 'pending', stillPending);

    // ——— صفحة الدليل ———
    if (guideTab) {
      await guideTab.waitForSelector('[data-guide="github-token"]');
      const g = await guideTab.evaluate(() => ({
        steps: document.querySelectorAll('.step').length,
        figures: [...document.querySelectorAll('figure.guide-figure figcaption')].map((f) => f.textContent),
        external: [...document.querySelectorAll('a[href^="http"]')].map((a) => ({ host: new URL(a.href).hostname, target: a.target, rel: a.rel })),
        focus: document.activeElement?.id,
        title: document.title,
        h1: document.querySelectorAll('h1').length,
      }));
      check('الدليل: سبع خطوات، ولكل رسم وسمه، والتركيز على عنوانه، وعنوان صفحة واحد', g.steps === 7 && g.figures.length === 7 && g.focus === 'mj-guide-title' && g.h1 === 1 && g.title.includes('دليل رمز GitHub'), g);
      check('روابط الدليل إلى github.com وdocs.github.com وحدهما، في تبويب جديد بلا opener', g.external.length >= 6 && g.external.every((l) => ['github.com', 'docs.github.com'].includes(l.host) && l.target === '_blank' && l.rel === 'noopener noreferrer'), g.external);
      await guideTab.screenshot({ path: path.join(shots, `${key}-guide-light.png`), fullPage: true });
      await guideTab.emulateMedia({ colorScheme: 'dark' });
      await guideTab.screenshot({ path: path.join(shots, `${key}-guide-dark.png`), fullPage: true });
      await guideTab.setViewportSize({ width: 360, height: 900 });
      const narrow = await guideTab.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      check('الدليل بعرض 360 بلا تمرير أفقي', narrow, null);
      await guideTab.screenshot({ path: path.join(shots, `${key}-guide-360-dark.png`) });
      await guideTab.locator('.step[data-step="1"]').scrollIntoViewIfNeeded();
      await guideTab.screenshot({ path: path.join(shots, `${key}-guide-360-dark-step1.png`) });
      await guideTab.emulateMedia({ colorScheme: 'light' });
      await guideTab.setViewportSize({ width: 1280, height: 900 });
      await guideTab.click('[data-action="guide-back"]');
      await guideTab.waitForSelector('[data-section="token"]');
      await sleep(200);
      const back = await guideTab.evaluate(() => ({ hash: location.hash, focus: document.activeElement?.getAttribute('data-action') }));
      check('الرجوع: #token والتركيز على «كيف تحصل على الرمز؟»', back.hash === '#token' && back.focus === 'token-guide', back);
      await guideTab.locator('[data-section="token"]').screenshot({ path: path.join(shots, `${key}-options-token-entry.png`) });
    }

    // ——— إنهاء الترحيب وعدم تكراره ———
    await panel.click('[data-action="welcome-back"]');
    await panel.click('[data-action="welcome-skip"]');
    await sleep(200);
    const afterSkip = (await options.evaluate((k) => chrome.storage.local.get(k), WELCOME))[WELCOME];
    // 'done' هي القيمة الافتراضية، والمخزن لا يحفظ الافتراضي: يُحذف المفتاح.
    check('«تخطَّ» يعيد الحالة إلى done (يُحذف المفتاح) ويُظهر التبويب', (afterSkip === undefined || afterSkip === 'done') && (await panel.$('.welcome')) === null, afterSkip);
    await panel.reload();
    await panel.waitForSelector('[role="tab"]');
    await sleep(300);
    check('إعادة فتح اللوحة لا تعيد الترحيب', (await panel.$('.welcome')) === null, null);
    await panel.click('#mj-native-tab-settings');
    await panel.waitForSelector('[data-action="welcome-replay"]');
    await panel.locator('[data-section="help"]').screenshot({ path: path.join(shots, `${key}-panel-settings-help.png`) });
    await panel.click('[data-action="welcome-replay"]');
    await panel.waitForSelector('.welcome');
    check('«جولة الترحيب» تعيده من أوله', (await panel.getAttribute('.welcome', 'data-welcome-step')) === '1', null);
    await panel.click('#mj-native-tab-notes');
    await sleep(200);
    const afterTab = (await options.evaluate((k) => chrome.storage.local.get(k), WELCOME))[WELCOME];
    check('اختيار تبويب ينهيه ويفتح التبويب', (afterTab === undefined || afterTab === 'done') && (await panel.getAttribute('#mj-native-tab-notes', 'aria-selected')) === 'true', afterTab);
    await panel.emulateMedia({ colorScheme: 'dark' });
    await panel.click('#mj-native-tab-settings');
    await panel.click('[data-action="welcome-replay"]');
    await panel.waitForSelector('.welcome');
    await panel.screenshot({ path: path.join(shots, `${key}-panel-welcome-1-dark.png`), fullPage: true });

    const devtools = await context.newPage();
    await devtools.goto('chrome://extensions');
    const info = await devtools.evaluate((extId) => chrome.developerPrivate.getExtensionInfo(extId), id);
    const errors = { runtime: (info.runtimeErrors ?? []).map((e) => e.message), manifest: (info.manifestErrors ?? []).map((e) => e.message) };
    check('لا أخطاء تشغيل ولا مانيفست للإضافة', !errors.runtime.length && !errors.manifest.length, errors);
  } catch (error) {
    check('اكتمل السيناريو', false, String(error?.stack ?? error));
  } finally {
    check('صفر طلبات إلى أي مضيف خارجي', external.length === 0, external);
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
  return result;
}

const keys = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome'];
const all = [];
for (const key of keys) {
  const r = await run(key);
  all.push(r);
  const pass = r.checks.filter((c) => c.ok).length;
  console.log(`${r.label} ${r.browserVersion}: ${pass}/${r.checks.length}`);
  for (const c of r.checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : ` — ${JSON.stringify(c.detail)}`}`);
}
fs.writeFileSync(path.join(HERE, 'browser-check.json'), JSON.stringify(all, null, 2));
process.exit(all.every((r) => r.checks.every((c) => c.ok)) ? 0 : 1);

#!/usr/bin/env node
// تجارب المتصفحات الفعلية لـT-1.4 (لا تُشغَّل ضمن vitest)، على الإضافة الاختبارية (build.mjs): الحزمة الحقيقية بثماني
// وحدات وهمية أ–ح وخطافات اختبار.
//  - TEST-CORE-05 (AC-1.4): عزل الأنماط في الاتجاهين على صفحة ضبط وصفحة معادية (fixtures/adversarial)؛ الدرج يعمل في
//    المتصفح، واللوحة الأصلية تُفتح بنقر حيث تُدعم (HYP-14).
//  - TEST-CORE-06 (AC-1.4): كل مفتاح من الثمانية يركّب/يزيل وحدته ويُحفظ ويبقى بعد إعادة التحميل؛ صلاحية api.github.com
//    لا تُطلب إلا بنقر، وتُعرض وتُسحب، وعدّاد طلبات api.github.com صفر ما دامت غير ممنوحة؛ الأمر واختصاره وإعادة ربطه.
// الاستعمال: node tests/core/ui-host/browser/run.mjs [chrome|edge|brave|firefox ...] [--out <مجلد>] [--render-only]
// كل متصفح بملف تعريف مؤقت جديد يُحذف عند الانتهاء؛ المتصفحات تباعًا؛ لا شبكة خارجية: طلبات github.com وapi.github.com
// تُخدَم محليًا (Playwright route في عائلة Chromium، وخادم HTTPS محلي مع network.dns.forceResolve في Firefox).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../../scripts/load-check.mjs';
import { buildUiHostTestExtension } from './build.mjs';
import { CONTROL_URL, HOSTILE_URL, PAGES, readFixture, waitUntil } from './pages.mjs';
import { firefoxRun } from './firefox.mjs';
import { PAGE_KEYS, UI_KEYS, UI_PROPS, contentState, diffSnapshots, drawerFocus, mountedUnits, snapshotPage, snapshotUi } from './probes.mjs';
import { renderReport } from './report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const UNITS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- عائلة Chromium ----------

async function chromiumRun(key) {
  const { executable, label } = BROWSERS[key];
  const extDir = await buildUiHostTestExtension('chromium');
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-ui-host-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executable,
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const result = { label, steps: {} };
  const network = { apiGithub: [], other: [] };
  try {
    const browser = context.browser();
    result.browserVersion = browser.version();
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.host === 'api.github.com') network.apiGithub.push({ url: request.url(), at: Date.now(), from: request.serviceWorker() ? 'service-worker' : 'page' });
      else if (!['github.com'].includes(url.host) && url.protocol.startsWith('http')) network.other.push(request.url());
    });
    await context.route('https://github.com/**', (route) => {
      const page = PAGES[new URL(route.request().url()).pathname];
      if (!page) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      return route.fulfill({ status: 200, contentType: page.type ?? 'text/html; charset=utf-8', headers: page.csp ? { 'content-security-policy': page.csp } : {}, body: readFixture(page.file) });
    });
    await context.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '"محلي: لا شبكة"' }));

    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: extDir });
    const origin = `chrome-extension://${id}`;
    const ext = await context.newPage();
    await ext.goto(`${origin}/test.html`);
    await ext.waitForSelector('html[data-ready="true"]');
    const t = (name, ...args) => ext.evaluate(([n, a]) => globalThis.__t[n](...a), [name, args]);
    const devtools = await context.newPage();
    await devtools.goto('chrome://extensions');
    const developerPrivate = (method, ...args) => devtools.evaluate(([m, a]) => chrome.developerPrivate[m](...a), [method, args]);

    // ----- TEST-CORE-05: العزل -----
    const openGithub = async (url) => {
      const page = await context.newPage();
      await page.goto(url);
      await waitUntil(async () => (await page.evaluate(contentState)).content === 'ready', 10000);
      await waitUntil(async () => (await page.evaluate(mountedUnits)).length === 8, 5000);
      return page;
    };
    const tabOf = async (url) => (await t('githubTabs')).find((tab) => tab.url === url);
    const drawerTo = async (page, url, action, expected) => {
      const tab = await tabOf(url);
      await t('drawer', tab.id, action);
      return waitUntil(async () => (await page.evaluate(contentState)).drawer === expected, 5000);
    };

    const isolation = {};
    for (const [name, url] of [['control', CONTROL_URL], ['hostile', HOSTILE_URL]]) {
      const page = await openGithub(url);
      const before = await page.evaluate(snapshotPage, UI_PROPS);
      const opened = await drawerTo(page, url, 'open', 'open');
      await sleep(250);
      const ui = await page.evaluate(snapshotUi, UI_PROPS);
      const after = await page.evaluate(snapshotPage, UI_PROPS);
      fs.mkdirSync(path.join(outDir, 'screens'), { recursive: true });
      await page.screenshot({ path: path.join(outDir, 'screens', `${key}-${name}-drawer.png`) });
      isolation[name] = { opened: Boolean(opened), state: await page.evaluate(contentState), ui, before, after, pageDiffs: diffSnapshots(before, after, PAGE_KEYS), page };
    }
    const uiDiffs = diffSnapshots(isolation.control.ui, isolation.hostile.ui, UI_KEYS);
    result.steps.isolation = {
      control: { opened: isolation.control.opened, meta: isolation.control.ui.drawerMeta, fakeMeta: isolation.control.ui.fakeMeta, rect: isolation.control.ui.drawerRect, hit: isolation.control.ui.drawerHit, pageDiffs: isolation.control.pageDiffs },
      hostile: { opened: isolation.hostile.opened, meta: isolation.hostile.ui.drawerMeta, fakeMeta: isolation.hostile.ui.fakeMeta, rect: isolation.hostile.ui.drawerRect, hit: isolation.hostile.ui.drawerHit, pageDiffs: isolation.hostile.pageDiffs, cspBlockedInlineStyle: isolation.hostile.state.bodyOutline !== 'rgb(0, 0, 255)' },
      uiDiffs,
      probes: UI_KEYS.filter((k) => isolation.control.ui[k] !== undefined).length,
      props: UI_PROPS.length,
      sample: { drawerFont: isolation.control.ui.drawer?.['font-family'], drawerBg: isolation.control.ui.drawer?.['background-color'], titleSize: isolation.control.ui.title?.['font-size'], buttonBg: isolation.control.ui.fakeButton?.['background-color'] },
    };
    await isolation.hostile.page.close();

    // ----- الدرج: Escape وإعادة التركيز والتبديل (على صفحة الضبط) -----
    const gh = isolation.control.page;
    await gh.bringToFront();
    const drawer = {};
    drawer.focusOnOpen = await gh.evaluate(drawerFocus);
    await gh.keyboard.press('Escape');
    drawer.escapeClosed = Boolean(await waitUntil(async () => (await gh.evaluate(contentState)).drawer === 'closed', 3000));
    drawer.toggleOpens = Boolean(await drawerTo(gh, CONTROL_URL, 'toggle', 'open'));
    drawer.toggleCloses = Boolean(await drawerTo(gh, CONTROL_URL, 'toggle', 'closed'));
    await drawerTo(gh, CONTROL_URL, 'open', 'open');
    await gh.evaluate(() => {
      const shadow = document.querySelector('mijhar-host[data-mijhar-host="drawer"]').shadowRoot;
      shadow.querySelectorAll('[role="tab"]')[4].click();
    });
    drawer.settingsTabInDrawer = await gh.evaluate(() => {
      const shadow = document.querySelector('mijhar-host[data-mijhar-host="drawer"]').shadowRoot;
      const fields = [...shadow.querySelectorAll('input, textarea, [contenteditable]')].filter((el) => !['checkbox', 'radio'].includes(el.type));
      return { toggles: shadow.querySelectorAll('[data-section="units"] input[role="switch"]').length, textFields: fields.length, grantButton: Boolean(shadow.querySelector('[data-action="grant"]')), openOptions: Boolean(shadow.querySelector('[data-action="open-options"]')) };
    });
    // مفتاح من تبويب الإعدادات داخل الدرج: كتابة سكربت المحتوى إلى التخزين، فتُزال الوحدة (ح) وتعود.
    const drawerToggle = () => gh.evaluate(() => document.querySelector('mijhar-host[data-mijhar-host="drawer"]').shadowRoot.querySelector('label[for="mj-unit-h"]').click());
    await drawerToggle();
    drawer.toggleFromDrawerOff = Boolean(await waitUntil(async () => !(await gh.evaluate(mountedUnits)).includes('h'), 5000, 25));
    await drawerToggle();
    drawer.toggleFromDrawerOn = Boolean(await waitUntil(async () => (await gh.evaluate(mountedUnits)).includes('h'), 5000, 25));
    await gh.evaluate(() => document.querySelector('mijhar-host[data-mijhar-host="drawer"]').shadowRoot.querySelector('button[aria-label="إغلاق الدرج"]').click());
    drawer.closeButton = Boolean(await waitUntil(async () => (await gh.evaluate(contentState)).drawer === 'closed', 3000));
    result.steps.drawer = drawer;

    // ----- TEST-CORE-06: مفاتيح الوحدات الثماني -----
    const options = await context.newPage();
    await options.goto(`${origin}/options.html`);
    await options.waitForSelector('#app[data-ready="true"]');
    const toggles = { perUnit: [], network: {} };
    for (const unit of UNITS) {
      await options.click(`#mj-unit-${unit}`);
      const gone = await waitUntil(async () => !(await gh.evaluate(mountedUnits)).includes(unit), 5000, 25);
      toggles.perUnit.push({ unit, off: Boolean(gone), checked: await options.isChecked(`#mj-unit-${unit}`) });
    }
    toggles.allOffMounted = await gh.evaluate(mountedUnits);
    const pageNoUi = await gh.evaluate(snapshotPage, UI_PROPS);
    // الوحدات الوهمية تُدرج محتوى في main فتزيح ما بعدها وقد تُظهر شريط التمرير: الموضع والأبعاد تتغير بالإدراج لا
    // بتسرب نمط، فتُقارن خصائص النمط وحدها.
    toggles.leakAllOffVsMounted = diffSnapshots(pageNoUi, isolation.control.before, PAGE_KEYS).filter((d) => !['rect', 'width', 'height'].includes(d.prop));
    toggles.documentSheetsAllOff = pageNoUi.documentSheets;
    toggles.documentSheetsDrawerOpen = isolation.control.after.documentSheets;
    await gh.reload();
    await waitUntil(async () => (await gh.evaluate(contentState)).content === 'ready', 10000);
    await sleep(400);
    toggles.afterReloadMounted = await gh.evaluate(mountedUnits);
    await options.reload();
    await options.waitForSelector('#app[data-ready="true"]');
    toggles.afterReloadChecked = await Promise.all(UNITS.map((u) => options.isChecked(`#mj-unit-${u}`)));
    for (const unit of UNITS) {
      await options.click(`#mj-unit-${unit}`);
      const back = await waitUntil(async () => (await gh.evaluate(mountedUnits)).includes(unit), 5000, 25);
      toggles.perUnit.find((p) => p.unit === unit).on = Boolean(back);
    }
    toggles.allOnMounted = await gh.evaluate(mountedUnits);
    result.steps.toggles = toggles;

    // ----- الصلاحية الاختيارية وتدقيق الشبكة -----
    const permission = {};
    const state = () => options.getAttribute('[data-permission-state]', 'data-permission-state');
    permission.requestsBeforeAnything = network.apiGithub.length;
    permission.initialState = await waitUntil(async () => ((await state()) === 'checking' ? null : state()), 3000);
    permission.containsInitially = await t('contains');
    permission.fetchWithout = await t('fetchApi', '/zen');
    permission.requestsWhileNotGranted = network.apiGithub.length;
    // لا منح آليًا في عائلة Chromium: نافذة الطلب لا تبلغها CDP، وdeveloperPrivate.addHostPermission لا يمنح الصلاحيات
    // الاختيارية (قيس: يقبل الاستدعاء ولا تتغير contains). المنح والسحب الفعليان: Firefox آليًا، وChromium بنقرة فعلية.
    result.steps.permission = permission;

    // ----- اللوحة الأصلية (HYP-14) -----
    const native = {};
    await ext.bringToFront();
    await ext.click('#open-native');
    native.openResult = await waitUntil(async () => {
      const out = await t('out');
      return out && !out.includes('pending') ? JSON.parse(out) : null;
    }, 5000);
    await sleep(500);
    native.contexts = (await t('contexts'))?.filter((c) => c.type === 'SIDE_PANEL') ?? null;
    const panelTab = await context.newPage();
    await panelTab.goto(`${origin}/sidepanel.html`);
    await panelTab.waitForSelector('#app[data-ready="true"]');
    native.panelPageTabs = await panelTab.$$eval('[role="tab"]', (els) => els.map((e) => e.getAttribute('aria-label') ?? e.textContent));
    await panelTab.click('[role="tab"]:nth-child(5)');
    native.panelSettings = { toggles: await panelTab.locator('[data-section="units"] input[role="switch"]').count(), permissionSection: await panelTab.locator('[data-section="permission"] [data-permission-state]').count(), shortcut: await panelTab.locator('[data-section="shortcut"] kbd').textContent().catch(() => null) };
    await panelTab.close();
    result.steps.native = native;

    // ----- الأمر: المعالج نفسه دون فعل مستخدم، والتفضيل، والاختصار وإعادة ربطه -----
    const command = {};
    const ghTab = await tabOf(CONTROL_URL);
    await gh.bringToFront();
    // (أ) من صفحة الاختبار عبر رسالة: إشارة فعل المستخدم التي يضعها Playwright تنتقل مع الرسالة، فتُفتح الأصلية.
    await t('command', { id: ghTab.id, windowId: ghTab.windowId });
    await sleep(300);
    command.nativePrefWithActivation = { outcome: (await t('outcomes')).at(-1), drawer: (await gh.evaluate(contentState)).drawer };
    // (ب) من داخل الخلفية مباشرة بلا فعل مستخدم: يرفض المتصفح الفتح فيُفتح الدرج، والاستدعاء الثاني يغلقه.
    const worker = context.serviceWorkers().find((w) => w.url().startsWith(origin));
    if (worker) {
      await worker.evaluate((tab) => globalThis.__mjTest.command(tab), { id: ghTab.id, windowId: ghTab.windowId });
      command.nativePrefNoGesture = { drawer: await waitUntil(async () => ((await gh.evaluate(contentState)).drawer === 'open' ? 'open' : null), 3000), outcome: (await worker.evaluate(() => globalThis.__mjTest.outcomes())).at(-1) };
      await worker.evaluate((tab) => globalThis.__mjTest.command(tab), { id: ghTab.id, windowId: ghTab.windowId });
      command.secondCommandCloses = Boolean(await waitUntil(async () => (await gh.evaluate(contentState)).drawer === 'closed', 3000));
    } else command.nativePrefNoGesture = 'لم يُجرَ: service worker غير ظاهر لـPlaywright';
    await options.bringToFront();
    await options.click('input[name="mj-surface"][value="drawer"]');
    await sleep(400);
    await ext.bringToFront();
    await ext.click('#open-native');
    command.nativeWhenDrawerPreferred = await waitUntil(async () => {
      const out = await t('out');
      return out && !out.includes('pending') ? JSON.parse(out) : null;
    }, 5000);
    await t('command', { id: ghTab.id, windowId: ghTab.windowId });
    command.drawerPref = { drawer: await waitUntil(async () => ((await gh.evaluate(contentState)).drawer === 'open' ? 'open' : null), 3000), outcome: (await t('outcomes')).at(-1) };
    await t('command', { id: ghTab.id, windowId: ghTab.windowId });
    await waitUntil(async () => (await gh.evaluate(contentState)).drawer === 'closed', 3000);
    // service worker متوقف ثم يوقظه الأمر بذاكرة فارغة: التفضيل محفوظ في المتصفح (setOptions) لا في ذاكرة الخلفية.
    // يُستدل على إعادة التشغيل بسجل النتائج: يعيش في ذاكرة الخلفية، فيبدأ فارغًا بعد إيقافها.
    const outcomesBeforeStop = (await t('outcomes')).length;
    const swSession = await context.newCDPSession(ext);
    await swSession.send('ServiceWorker.enable');
    await swSession.send('ServiceWorker.stopAllWorkers');
    await sleep(500);
    await t('command', { id: ghTab.id, windowId: ghTab.windowId });
    const afterRestart = await t('outcomes');
    command.drawerPrefAfterWorkerRestart = { workerRestarted: afterRestart.length < outcomesBeforeStop, outcomesBefore: outcomesBeforeStop, outcomesAfter: afterRestart.length, drawer: await waitUntil(async () => ((await gh.evaluate(contentState)).drawer === 'open' ? 'open' : null), 5000), outcome: afterRestart.at(-1) };
    await t('command', { id: ghTab.id, windowId: ghTab.windowId });
    await swSession.detach().catch(() => {});
    await options.bringToFront();
    await options.click('input[name="mj-surface"][value="native"]');
    await sleep(400);
    await ext.bringToFront();
    await ext.click('#open-native');
    command.nativeRestored = await waitUntil(async () => {
      const out = await t('out');
      return out && !out.includes('pending') ? JSON.parse(out) : null;
    }, 5000);
    command.registered = (await t('commands')).find((c) => c.name === 'toggle-panel') ?? null;
    await options.bringToFront();
    command.optionsShowsShortcut = await options.locator('[data-section="shortcut"] kbd').textContent().catch(() => null);
    try {
      await developerPrivate('updateExtensionCommand', { extensionId: id, commandName: 'toggle-panel', keybinding: 'Alt+Shift+M' });
      command.reboundVia = 'chrome.developerPrivate.updateExtensionCommand (صفحة chrome://extensions/shortcuts)';
    } catch (error) {
      command.reboundVia = `تعذّر: ${error.message}`;
    }
    command.afterRebind = (await t('commands')).find((c) => c.name === 'toggle-panel') ?? null;
    await options.evaluate(() => window.dispatchEvent(new Event('focus')));
    command.optionsAfterRebind = await waitUntil(async () => {
      const text = await options.locator('[data-section="shortcut"] kbd').textContent().catch(() => null);
      return text && text !== command.optionsShowsShortcut ? text : null;
    }, 3000);
    const opened = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await options.click('[data-action="shortcuts"]');
    const shortcutsPage = await opened;
    command.shortcutsPageUrl = shortcutsPage ? (await shortcutsPage.waitForLoadState().catch(() => {}), shortcutsPage.url()) : null;
    await developerPrivate('updateExtensionCommand', { extensionId: id, commandName: 'toggle-panel', keybinding: 'Alt+G' }).catch(() => {});
    command.keystroke = 'لم يُجرَ آليًا: ضغطات CDP لا تبلغ مسرّعات المتصفح في macOS (قيس في تجربة مستكشفة)؛ يُجرى بضغطة فعلية';
    result.steps.command = command;

    // ----- آخرًا: النقر على «امنح الصلاحية» يفتح طلب المتصفح (لا يُقبل آليًا فيبقى معلّقًا) -----
    await options.bringToFront();
    await options.click('[data-action="grant"]');
    await sleep(1500);
    permission.clickStartsRequest = { buttonDisabledWhilePending: await options.isDisabled('[data-action="grant"]'), state: await state(), contains: await t('contains'), note: 'نافذة طلب المتصفح ظاهرة ولا تُقبل آليًا؛ يبقى الطلب معلّقًا' };
    permission.requestsTotal = network.apiGithub.length;
    result.network = { apiGithub: network.apiGithub, other: network.other };
    result.errors = (await gh.evaluate(contentState)).error;
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  return result;
}

// ---------- التشغيل ----------

const args = process.argv.slice(2);
const renderOnlyIndex = args.indexOf('--render-only');
const renderOnly = renderOnlyIndex !== -1;
if (renderOnly) args.splice(renderOnlyIndex, 1);
const outIndex = args.indexOf('--out');
const outDir = path.resolve(outIndex === -1 ? path.join(ROOT, 'evidence/T-1.4') : args.splice(outIndex, 2)[1]);
const keys = args.length ? args : Object.keys(BROWSERS);
const unknown = keys.filter((k) => !BROWSERS[k]);
if (unknown.length) {
  console.error(`متصفح غير معروف: ${unknown.join(' ')} (المتاح: ${Object.keys(BROWSERS).join(' ')})`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, 'browser-results.json');
const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
const results = {};
for (const key of renderOnly ? [] : keys) {
  if (!fs.existsSync(BROWSERS[key].executable)) {
    results[key] = { label: BROWSERS[key].label, skipped: `غير مثبت: ${BROWSERS[key].executable}` };
    continue;
  }
  const started = Date.now();
  results[key] = key === 'firefox' ? await firefoxRun({ outDir }) : await chromiumRun(key);
  results[key].durationMs = Date.now() - started;
  console.log(`${BROWSERS[key].label} ${results[key].browserVersion ?? ''}: ${results[key].error ? `خطأ: ${results[key].error.split('\n')[0]}` : 'تمت التجارب'}`);
}
const merged = { ...previous, ...results, date: new Date().toISOString().slice(0, 10) };
fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'browser-report.md'), renderReport(merged));
console.log(`كُتبت النتائج الخام والتقرير في ${path.relative(ROOT, outDir)}`);

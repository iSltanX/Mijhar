#!/usr/bin/env node
// تجربة T-0.5 (MJ11) في المتصفحات: إضافة اختبار (scripts/spikes/t05-ext، لا تُشحن) تُحمَّل في Chrome وEdge وBrave وFirefox بملف تعريف
// مؤقت، ويُفتح فيها صفحة GitHub عامة حية. تقيس:
//   AC-S5.1 (HYP-18): الكتابة إلى الحافظة من سكربت المحتوى بنقر مستخدم فعلي (حدث إدخال موثوق)، وبلا نقر، وبعد انقضاء التفعيل العابر،
//     وفي تبويب غير أمامي، وبديل execCommand في الصفحة وفي جذر الظل، ومن الخلفية، ومن صفحة الإضافة؛ بنسختين من المانيفست: بلا
//     clipboardWrite (كالمنتج) وبه. ويُقرأ ما وصل إلى حافظة المتصفح للتحقق، ويُقاس عدّاد حافظة النظام قبل وبعد (لا تُمس حافظة المالك).
//   HYP-07 (AC-S5.3): setAccessLevel لمنطقتي local وsession، ورؤية سكربت المحتوى لقيمة قبل الضبط وبعده.
//   AC-S5.2 (HYP-17) بلا مفتاح: طلب https://api.anthropic.com/v1/messages بمفتاح غير صالح عمدًا ونص «ping» وحده من سكربت المحتوى وصفحة
//     الإضافة والخلفية، بترويسة anthropic-dangerous-direct-browser-access وبدونها: هل يصل الطلب ويُقرأ الرد (CORS) وما يطلبه الخادم.
//     وبمفتاح تجريبي (T05_PROVIDER_KEY_FILE: مسار ملف فيه المفتاح؛ لا يُطبع ولا يُكتب في أي نتيجة): نجاح الطلب والبث وعدّ الرموز.
// الاستعمال: node scripts/spikes/t05-browser.mjs [chrome edge brave firefox] [--out evidence/T-0.5/raw/browser.json]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BROWSERS, launchChromium, launchFirefox, sleep, waitFor, writeJson } from './lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.join(HERE, 't05-ext');
const READER = path.join(HERE, 't05-reader');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const variantIndex = args.indexOf('--variants');
const variants = variantIndex === -1 ? ['base', 'clipboardWrite'] : args.splice(variantIndex, 2)[1].split(',');
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];
const PAGE = 'https://github.com/octocat/Hello-World';
const PROVIDER = 'https://api.anthropic.com/v1/messages';
const INVALID_KEY = 'sk-ant-invalid-mijhar-t05-probe';
const keyFile = process.env.T05_PROVIDER_KEY_FILE;
const realKey = keyFile && fs.existsSync(keyFile) ? fs.readFileSync(keyFile, 'utf8').trim() : null;
const MODEL = process.env.T05_PROVIDER_MODEL ?? 'claude-haiku-5-5';

/** هل تبدأ حافظة النظام ببادئة التجربة؟ جواب نعم/لا وحده، ولا يُقرأ المحتوى خارج هذا السؤال ولا يُطبع. */
const systemHasTestText = () =>
  execFileSync('osascript', ['-l', 'JavaScript', '-e', 'ObjC.import("AppKit"); const s = $.NSPasteboard.generalPasteboard.stringForType($.NSPasteboardTypeString); const t = (s && !s.isNil()) ? ObjC.unwrap(s) : ""; t.startsWith("mijhar-t05:") ? "yes" : "no"'], { encoding: 'utf8' }).trim() === 'yes';

/** عدّاد تغيّر حافظة النظام (لا المحتوى). يتغيّر أيضًا بنشاط المالك على الجهاز، فيُقرن بالسؤال أعلاه. */
const changeCount = () => Number(execFileSync('osascript', ['-l', 'JavaScript', '-e', 'ObjC.import("AppKit"); $.NSPasteboard.generalPasteboard.changeCount'], { encoding: 'utf8' }).trim());

function extensionDir(family, variant) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-t05-${family}-${variant}-`));
  for (const file of fs.readdirSync(EXT)) fs.copyFileSync(path.join(EXT, file), path.join(dir, file));
  const manifest = {
    manifest_version: 3,
    name: 'mijhar-t05-spike',
    version: '0.0.1',
    permissions: ['storage', ...(variant === 'clipboardWrite' ? ['clipboardWrite'] : [])],
    host_permissions: ['https://github.com/*', 'https://api.anthropic.com/*'],
    content_scripts: [{ matches: ['https://github.com/*'], js: ['content.js'], run_at: 'document_idle' }],
    ...(family === 'firefox' ? { background: { scripts: ['background.js'] }, browser_specific_settings: { gecko: { id: 't05@mijhar.invalid', data_collection_permissions: { required: ['none'] } } } } : { background: { service_worker: 'background.js' } }),
  };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

const providerHeaders = (key, direct) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', ...(direct ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {}) });
const PING = { model: MODEL, max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] };
const invalidProbe = { url: PROVIDER, body: PING, variants: [{ name: 'بلا ترويسة الوصول المباشر', headers: providerHeaders(INVALID_KEY, false) }, { name: 'مع anthropic-dangerous-direct-browser-access', headers: providerHeaders(INVALID_KEY, true) }] };
const realPageProbe = realKey ? { url: PROVIDER, body: PING, variants: [{ name: 'مفتاح صالح · صفحة الإضافة · بلا ترويسة الوصول المباشر', headers: providerHeaders(realKey, false) }, { name: 'مفتاح صالح · صفحة الإضافة · مع الترويسة', headers: providerHeaders(realKey, true) }] } : null;
const realProbes = realKey
  ? [
      { url: PROVIDER, body: PING, variants: [{ name: 'مفتاح صالح · بلا ترويسة الوصول المباشر', headers: providerHeaders(realKey, false) }, { name: 'مفتاح صالح · مع الترويسة', headers: providerHeaders(realKey, true) }] },
      { url: PROVIDER, body: { ...PING, stream: true }, variants: [{ name: 'مفتاح صالح · بث', headers: providerHeaders(realKey, true) }] },
      { url: 'https://api.anthropic.com/v1/messages/count_tokens', body: { model: MODEL, messages: PING.messages }, variants: [{ name: 'عدّ الرموز', headers: providerHeaders(realKey, true) }] },
      { url: 'https://api.anthropic.com/v1/models', method: 'GET', variants: [{ name: 'قائمة المودلات', headers: { 'x-api-key': realKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }] },
    ]
  : [];
/** لا يُكتب المفتاح في أي نتيجة ولو سهوًا. */
const redact = (value) => (realKey ? JSON.parse(JSON.stringify(value).split(realKey).join('«مفتاح محجوب»')) : value);

const CLICK_STEPS = ['write', 'exec', 'exec-shadow'];

// ---------- عائلة Chromium ----------

async function chromiumRun(key, variant) {
  const dir = extensionDir('chromium', variant);
  const b = await launchChromium(key, { extension: dir });
  const r = { browser: BROWSERS[key].label, version: b.version, variant, steps: {} };
  try {
    // قراءة ما وصل إلى حافظة المتصفح من إضافة ثانية مستقلة بصلاحية clipboardRead (t05-reader): لا تُمنح صفحة GitHub ولا الإضافة
    // المقيسة أي صلاحية حافظة، فمنح CDP لصلاحية يرفض ما سواها ويلوّث القياس (رُصد في تشغيل أول).
    const cdp = await b.context.browser().newBrowserCDPSession();
    const { id: readerId } = await cdp.send('Extensions.loadUnpacked', { path: READER });
    const reader = await b.context.newPage();
    await reader.goto(`chrome-extension://${readerId}/reader.html`);
    const page = await b.context.newPage();
    const response = await page.goto(PAGE, { waitUntil: 'domcontentloaded' });
    r.page = { url: PAGE, status: response?.status(), permissionsPolicy: response?.headers()['permissions-policy'] ?? null };
    await page.waitForSelector('#mj-t05', { state: 'attached', timeout: 20000 });
    const results = () => page.evaluate(() => JSON.parse(document.getElementById('mj-t05')?.getAttribute('data-results') ?? '{}'));
    const readBack = async () => {
      await reader.bringToFront();
      const value = await reader.evaluate(() => globalThis.readClipboard());
      await page.bringToFront();
      return value;
    };
    const click = async (name) => page.locator('#mj-t05').locator(`#t05-${name}`).click();
    r.steps.auto = { ...(await waitFor(async () => (await results()).auto, 5000)), readBack: await readBack() };
    for (const name of CLICK_STEPS) {
      await page.bringToFront();
      await click(name);
      r.steps[name] = { ...(await waitFor(async () => (await results())[name], 5000)), readBack: await readBack() };
    }
    await click('late');
    await sleep(7000);
    r.steps.late = { ...(await waitFor(async () => (await results()).late, 3000)), readBack: await readBack() };
    // تبويب غير أمامي: صفحة أخرى في الأمام ثم نقر فعلي على الأولى.
    const other = await b.context.newPage();
    await other.goto('about:blank');
    await other.bringToFront();
    const before = (await results()).write?.at;
    await click('write');
    r.steps.writeBackgroundTab = { ...(await waitFor(async () => {
      const w = (await results()).write;
      return w && w.at !== before ? w : null;
    }, 5000)), note: 'نقر Playwright على صفحة ليست في الأمام', readBack: await readBack() };
    // نافذة غير مركَّزة حقًا: Playwright يحاكي التركيز لكل صفحة بلا واجهة (hasFocus = true)، فتُعطَّل المحاكاة لهذه الصفحة عبر CDP
    // والصفحة الأخرى في الأمام، ثم نقر فعلي.
    const pageCdp = await b.context.newCDPSession(page);
    await pageCdp.send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await other.bringToFront();
    const beforeUnfocused = (await results()).write?.at;
    await click('write');
    r.steps.writeUnfocused = { ...(await waitFor(async () => {
      const w = (await results()).write;
      return w && w.at !== beforeUnfocused ? w : null;
    }, 5000)), note: 'محاكاة التركيز معطَّلة (Emulation.setFocusEmulationEnabled = false) وصفحة أخرى في الأمام', readBack: await readBack() };
    await pageCdp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await page.bringToFront();
    await click('background');
    r.steps.background = await waitFor(async () => (await results()).background, 5000);
    // صفحة الإضافة.
    const ext = await b.context.newPage();
    await ext.goto(`chrome-extension://${b.extensionId}/page.html`);
    await ext.bringToFront();
    await ext.click('#write');
    r.steps.extensionPage = { ...(await waitFor(() => ext.evaluate(() => JSON.parse(document.body.getAttribute('data-results') ?? '{}').write), 5000)), readBack: await readBack() };

    if (variant === 'base') {
      // HYP-07: مستوى وصول التخزين.
      const bg = (message) => ext.evaluate((m) => chrome.runtime.sendMessage(m), message);
      const contentRead = async (phase) => {
        await page.evaluate((p) => document.getElementById('mj-t05').setAttribute('data-storage-phase', p), phase);
        await click('storage');
        return waitFor(async () => (await results())[`storage-${phase}`], 5000);
      };
      r.storage = { write: await bg({ t05: 'storage', step: 'write' }) };
      r.storage.default = await contentRead('default');
      r.storage.restrict = await bg({ t05: 'storage', step: 'restrict' });
      r.storage.afterRestrict = await contentRead('restricted');
      r.storage.open = await bg({ t05: 'storage', step: 'open' });
      r.storage.afterOpen = await contentRead('opened');
      r.storage.clear = await bg({ t05: 'storage', step: 'clear' });

      // AC-S5.2 بمفتاح غير صالح: سكربت المحتوى وصفحة الإضافة والخلفية.
      await page.evaluate((probe) => document.getElementById('mj-t05').setAttribute('data-provider-probe', JSON.stringify(probe)), invalidProbe);
      await click('provider');
      r.provider = { content: await waitFor(async () => (await results()).provider, 15000) };
      await page.evaluate(() => document.getElementById('mj-t05').removeAttribute('data-provider-probe'));
      await ext.evaluate((probe) => document.body.setAttribute('data-provider-probe', JSON.stringify(probe)), invalidProbe);
      await ext.click('#provider');
      r.provider.extensionPage = await waitFor(() => ext.evaluate(() => JSON.parse(document.body.getAttribute('data-results') ?? '{}').provider), 15000);
      r.provider.background = await bg({ t05: 'provider', probe: invalidProbe });
      // بمفتاح صالح (إن أُتيح): الخلفية، وصفحة الإضافة (لا سكربت المحتوى: لا يصل إليه سرّ في الخطة).
      r.provider.backgroundWithKey = [];
      for (const probe of realProbes) r.provider.backgroundWithKey.push(await bg({ t05: 'provider', probe }));
      if (realPageProbe) {
        await ext.evaluate(() => document.body.removeAttribute('data-results'));
        await ext.evaluate((probe) => document.body.setAttribute('data-provider-probe', JSON.stringify(probe)), realPageProbe);
        await ext.click('#provider');
        r.provider.extensionPageWithKey = await waitFor(() => ext.evaluate(() => JSON.parse(document.body.getAttribute('data-results') ?? '{}').provider), 20000);
      }
    }
  } catch (error) {
    r.error = String(error?.stack ?? error).split('\n').slice(0, 3).join(' | ');
  } finally {
    await b.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return r;
}

// ---------- Firefox ----------

const FF_CLIPBOARD = `
  const t = Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);
  t.init(null);
  t.addDataFlavor('text/plain');
  try {
    Services.clipboard.getData(t, Ci.nsIClipboard.kGlobalClipboard, gBrowser.selectedBrowser.browsingContext.currentWindowContext);
    const data = {};
    t.getTransferData('text/plain', data);
    return { text: data.value.QueryInterface(Ci.nsISupportsString).data };
  } catch (e) { return { error: String(e) }; }
`;

async function firefoxRun(variant) {
  const dir = extensionDir('firefox', variant);
  const ff = await launchFirefox();
  const r = { browser: 'Firefox', version: ff.version, variant, steps: {} };
  const c = ff.client;
  const handles = {};
  const tab = async (name, url, focus = true) => {
    await ff.exec('return true;');
    if (!handles[name]) {
      const { handle } = await c.send('WebDriver:NewWindow', { type: 'tab', focus });
      handles[name] = handle;
    }
    await c.send('WebDriver:SwitchToWindow', { handle: handles[name], focus });
    if (url) await ff.navigate(url);
  };
  // أوامر WebDriver تعمل في السياق الحالي: قراءة الحافظة تنقله إلى chrome، فيُعاد إلى content قبل كل بحث أو تبديل.
  const content = () => ff.exec('return true;');
  const switchTo = async (name, focus = true) => {
    await content();
    return c.send('WebDriver:SwitchToWindow', { handle: handles[name], focus });
  };
  const elementId = (v) => v['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(v)[0];
  const clickShadow = async (selector) => {
    await content();
    const { value: host } = await c.send('WebDriver:FindElement', { using: 'css selector', value: '#mj-t05' });
    const { value: shadow } = await c.send('WebDriver:GetShadowRoot', { id: elementId(host) });
    const { value: el } = await c.send('WebDriver:FindElementFromShadowRoot', { shadowRoot: shadow['shadow-6066-11e4-a52e-4f735466cecf'] ?? Object.values(shadow)[0], using: 'css selector', value: selector });
    await c.send('WebDriver:ElementClick', { id: elementId(el) });
  };
  const clickLight = async (selector) => {
    await content();
    const { value: el } = await c.send('WebDriver:FindElement', { using: 'css selector', value: selector });
    await c.send('WebDriver:ElementClick', { id: elementId(el) });
  };
  const results = () => ff.exec(`return JSON.parse(document.getElementById('mj-t05')?.getAttribute('data-results') ?? '{}');`);
  const readBack = () => ff.exec(FF_CLIPBOARD, [], 'chrome');
  try {
    const id = await ff.installAddon(dir);
    const host = await ff.exec('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [id], 'chrome');
    // مقبض التبويب لا النافذة: GetWindowHandle في سياق content (في سياق chrome يعيد نافذة المتصفح).
    await content();
    handles.main = (await c.send('WebDriver:GetWindowHandle')).value;
    await ff.navigate(PAGE);
    r.page = { url: PAGE };
    await waitFor(async () => (await ff.exec(`return Boolean(document.getElementById('mj-t05'));`)), 20000);
    r.steps.auto = { ...(await waitFor(async () => (await results()).auto, 5000)), readBack: await readBack() };
    for (const name of CLICK_STEPS) {
      await switchTo('main');
      await clickShadow(`#t05-${name}`);
      r.steps[name] = { ...(await waitFor(async () => (await results())[name], 5000)), readBack: await readBack() };
    }
    await clickShadow('#t05-late');
    await sleep(7000);
    r.steps.late = { ...(await waitFor(async () => (await results()).late, 3000)), readBack: await readBack() };
    // تبويب غير أمامي: تبويب آخر في الأمام، ثم نقر على الأول دون جلبه (focus: false). إن تعذّر على WebDriver يُسجَّل سببه ويستمر.
    try {
      await tab('other', 'about:blank', true);
      await switchTo('main', false);
      const before = (await results()).write?.at;
      await clickShadow('#t05-write');
      r.steps.writeBackgroundTab = { ...(await waitFor(async () => {
        const w = (await results()).write;
        return w && w.at !== before ? w : null;
      }, 5000)), note: 'نقر WebDriver على تبويب لم يُجلب إلى الأمام (focus: false)', readBack: await readBack() };
    } catch (error) {
      r.steps.writeBackgroundTab = { ok: null, notRun: `لم يُجرَ: ${String(error).slice(0, 160)}` };
    }
    await switchTo('main', true);
    await clickShadow('#t05-background');
    r.steps.background = await waitFor(async () => (await results()).background, 5000);
    // صفحة الإضافة.
    await tab('ext', `moz-extension://${host}/page.html`, true);
    await clickLight('#write');
    r.steps.extensionPage = { ...(await waitFor(() => ff.exec(`return JSON.parse(document.body.getAttribute('data-results') ?? '{}').write;`), 5000)), readBack: await readBack() };

    if (variant === 'base') {
      const bg = (message) => ff.execAsync(`const [m, done] = arguments; (globalThis.browser ?? window.wrappedJSObject?.browser).runtime.sendMessage(m).then(done, (e) => done({ threw: String(e) }));`, [message], 'content', 60000);
      const contentRead = async (phase) => {
        await switchTo('main');
        await ff.exec(`document.getElementById('mj-t05').setAttribute('data-storage-phase', arguments[0]);`, [phase]);
        await clickShadow('#t05-storage');
        const value = await waitFor(async () => (await results())[`storage-${phase}`], 5000);
        await switchTo('ext');
        return value;
      };
      await switchTo('ext');
      r.storage = { write: await bg({ t05: 'storage', step: 'write' }) };
      r.storage.default = await contentRead('default');
      r.storage.restrict = await bg({ t05: 'storage', step: 'restrict' });
      r.storage.afterRestrict = await contentRead('restricted');
      r.storage.open = await bg({ t05: 'storage', step: 'open' });
      r.storage.afterOpen = await contentRead('opened');
      r.storage.clear = await bg({ t05: 'storage', step: 'clear' });

      await switchTo('main');
      await ff.exec(`document.getElementById('mj-t05').setAttribute('data-provider-probe', arguments[0]);`, [JSON.stringify(invalidProbe)]);
      await clickShadow('#t05-provider');
      r.provider = { content: await waitFor(async () => (await results()).provider, 15000) };
      await ff.exec(`document.getElementById('mj-t05').removeAttribute('data-provider-probe');`);
      await switchTo('ext');
      await ff.exec(`document.body.setAttribute('data-provider-probe', arguments[0]);`, [JSON.stringify(invalidProbe)]);
      await clickLight('#provider');
      r.provider.extensionPage = await waitFor(() => ff.exec(`return JSON.parse(document.body.getAttribute('data-results') ?? '{}').provider;`), 15000);
      r.provider.background = await bg({ t05: 'provider', probe: invalidProbe });
      r.provider.backgroundWithKey = [];
      for (const probe of realProbes) r.provider.backgroundWithKey.push(await bg({ t05: 'provider', probe }));
      if (realPageProbe) {
        await switchTo('ext');
        await ff.exec(`document.body.removeAttribute('data-results'); document.body.setAttribute('data-provider-probe', arguments[0]);`, [JSON.stringify(realPageProbe)]);
        await clickLight('#provider');
        r.provider.extensionPageWithKey = await waitFor(() => ff.exec(`return JSON.parse(document.body.getAttribute('data-results') ?? '{}').provider;`), 20000);
      }
    }
  } catch (error) {
    r.error = String(error?.stack ?? error).split('\n').slice(0, 3).join(' | ');
  } finally {
    await ff.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return r;
}

const run = { measuredAt: new Date().toISOString(), page: PAGE, providerKey: realKey ? 'أتاحه المالك (لا يُكتب هنا)' : 'لم يُتح: الطلبات بمفتاح غير صالح عمدًا ونص «ping» وحده', model: MODEL, pasteboardChangeCountBefore: changeCount(), runs: [] };
for (const key of keys) {
  for (const variant of variants) {
    const countBefore = changeCount();
    const r = key === 'firefox' ? await firefoxRun(variant) : await chromiumRun(key, variant);
    r.pasteboardChangeCount = { before: countBefore, after: changeCount() };
    r.systemClipboardHoldsTestText = systemHasTestText();
    run.runs.push(redact(r));
    const s = r.steps;
    console.error(`${r.browser} ${r.version ?? ''} [${variant}]: auto=${s.auto?.ok} write=${s.write?.ok} exec=${s.exec?.ok} exec-shadow=${s['exec-shadow']?.ok} late=${s.late?.ok} bgTab=${s.writeBackgroundTab?.ok} unfocused=${s.writeUnfocused?.ok ?? '—'} background=${s.background?.ok} extPage=${s.extensionPage?.ok} · حافظة النظام ${r.pasteboardChangeCount.before}←${r.pasteboardChangeCount.after} تحمل نص التجربة: ${r.systemClipboardHoldsTestText}${r.error ? ` خطأ: ${r.error}` : ''}`);
  }
}
run.pasteboardChangeCountAfter = changeCount();
console.error(`عدّاد حافظة النظام: ${run.pasteboardChangeCountBefore} ← ${run.pasteboardChangeCountAfter}`);
if (outFile) writeJson(outFile, run);
else console.log(JSON.stringify(run, null, 2));

#!/usr/bin/env node
// خطّا هوية الواجهة في المتصفحات على الحزمة المشحونة نفسها (dist/<target> من npm run build، بلا أي تعديل): هل يُرسم Cairo المضمّن في
// العناوين وAlmarai المضمّن في النص، لا خط مثبت على الجهاز ولا خط النظام؟ على جهاز ثُبّت فيه Cairo يظهر «Cairo» في الحالتين، فالفيصل
// أن الخط مضمّن (isCustomFont) لا اسمه وحده.
//  - Chrome وEdge وBrave: CDP CSS.getPlatformFontsForNode (الخط المرسوم فعلًا لكل عقدة) في صفحة الإعدادات، واللوحة الجانبية (أول عنوان فيها: الترحيب في ملف تعريف جديد)، وبطاقة
//    ملخص طلب الدمج داخل جذر الظل في صفحة github.com (عينة fixture-pr-complex.html تُخدم محليًا بأصل github.com). ومعها: أوجه
//    «Mijhar UI» في document.fonts، ولا عنصر أنماط للواجهة في مستند GitHub، ولا مضيف خارجي.
//  - Firefox (Marionette لا يكشف الخط المرسوم): الأوجه الأربعة في document.fonts وحالة المستعمل منها loaded، وdocument.fonts.check،
//    وقائمة font-family المحسوبة تبدأ بالعائلة المضمّنة (يكتبها Firefox بلا علامات اقتباس)، في الإعدادات واللوحة وصفحة github.com.
// الاستعمال: node tests/shared/ui/browser/fonts-check.mjs [chrome edge brave firefox] [--out <ملف json>] [--screens <مجلد اللقطات>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { BROWSERS, ROOT, firefoxSession, sleep, waitUntil } from '../../../modules/d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const screensIndex = args.indexOf('--screens');
const screensDir = screensIndex === -1 ? null : path.resolve(args.splice(screensIndex, 2)[1]);
const keys = args.filter((a) => BROWSERS[a]);

const DISPLAY = 'Mijhar UI Cairo';
const TEXT = 'Mijhar UI Almarai';
const PR_PATH = '/octo/demo/pull/4242';
const PR_PAGE = fs.readFileSync(path.join(ROOT, 'tests/modules/d/fixtures/fixture-pr-complex.html'), 'utf8');
const STATUS_FRAGMENT = fs.readFileSync(path.join(ROOT, 'tests/modules/d/fixtures/fixture-status-details.html'), 'utf8');
const CARD = 'mijhar-host[data-mijhar-host="d.pr-status"]';

function githubReply(pathname) {
  if (pathname === PR_PATH) return { status: 200, type: 'text/html; charset=utf-8', body: PR_PAGE };
  if (/\/status-details$/.test(pathname)) return { status: 200, type: 'text/html; charset=utf-8', body: STATUS_FRAGMENT };
  return { status: 404, type: 'text/plain', body: 'not found' };
}
const apiReply = () => ({ status: 404, body: { message: 'Not Found' } });

// في الصفحة: النطاق (المستند أو جذر ظل المضيف)، والعنوان، وأول نص عربي يطلب خط النص (لا عنوان ولا شيفرة).
const SCOPE = (host) => `(${host ? `document.querySelector(${JSON.stringify(host)})?.shadowRoot` : 'document'})`;
const HEADING = (host, selector) => `${SCOPE(host)}?.querySelector(${JSON.stringify(selector)})`;
const TEXT_NODE = (host) => `(() => {
  const scope = ${SCOPE(host)};
  if (!scope) return null;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !/[\\u0600-\\u06FF]{3}/.test(n.textContent) || el.closest('h1, h2, h3, code, kbd, .mono')) continue;
    if (getComputedStyle(el).fontFamily.includes(${JSON.stringify(TEXT)}) || getComputedStyle(el).fontFamily.includes('Almarai')) return el;
  }
  return null;
})()`;
const FACES = `[...document.fonts].filter((f) => /Mijhar UI/.test(f.family)).map((f) => ({ family: f.family.replace(/"/g, ''), weight: f.weight, status: f.status }))`;

// ---------- عائلة Chromium ----------

async function measure(cdp, expression) {
  const { result } = await cdp.send('Runtime.evaluate', { expression });
  if (!result.objectId) return null;
  const { nodeId } = await cdp.send('DOM.requestNode', { objectId: result.objectId });
  const computed = (await cdp.send('CSS.getComputedStyleForNode', { nodeId })).computedStyle.find((p) => p.name === 'font-family')?.value ?? '';
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  const rendered = fonts.map((f) => ({ family: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount }));
  const main = [...rendered].sort((a, b) => b.glyphs - a.glyphs)[0] ?? null;
  return { requested: computed, rendered, main };
}

async function chromiumRun(key) {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-ui-fonts-'));
  const context = await chromium.launchPersistentContext(profileDir, { executablePath: executable, headless: true, viewport: { width: 1280, height: 900 }, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
  const blocked = new Set();
  try {
    await context.route('https://github.com/**', (route) => {
      const r = githubReply(new URL(route.request().url()).pathname);
      return route.fulfill({ status: r.status, contentType: r.type, body: r.body });
    });
    await context.route('https://api.github.com/**', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    await context.route((url) => url.protocol === 'https:' && !['github.com', 'api.github.com'].includes(url.host), (route) => {
      blocked.add(new URL(route.request().url()).host);
      return route.abort();
    });
    const browserCdp = await context.browser().newBrowserCDPSession();
    const { id } = await browserCdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
    const origin = `chrome-extension://${id}`;
    const surfaces = {};
    const open = async (name, url, ready, heading, host = null) => {
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForSelector(ready, { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready);
      await sleep(400);
      await page.evaluate(() => document.fonts.ready);
      const cdp = await context.newCDPSession(page);
      await cdp.send('DOM.enable');
      await cdp.send('CSS.enable');
      await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
      surfaces[name] = {
        heading: await measure(cdp, HEADING(host, heading)),
        text: await measure(cdp, TEXT_NODE(host)),
        faces: await page.evaluate(FACES),
        uiStyleElements: await page.evaluate(() => [...document.querySelectorAll('style, link[rel="stylesheet"]')].filter((s) => /Mijhar UI/.test(s.textContent ?? '')).length),
      };
      if (screensDir) {
        fs.mkdirSync(screensDir, { recursive: true });
        const file = path.join(screensDir, `${key}-${name}.png`);
        if (host) await page.locator(host).first().screenshot({ path: file });
        else await page.screenshot({ path: file });
      }
      await page.close();
    };
    await open('options', `${origin}/options.html#token`, '#app[data-ready="true"]', '#mj-connections-title');
    await open('sidepanel', `${origin}/sidepanel.html`, '#app[data-ready="true"]', 'h1, h2, h3');
    await open('github', `https://github.com${PR_PATH}`, `${CARD}`, '#mj-pr-title', CARD);
    return { label, browserVersion: context.browser().version(), surfaces, blockedExternalHosts: [...blocked].sort() };
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

function chromiumChecks(r) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
  const isCustom = (m, re) => Boolean(m?.main?.custom && re.test(m.main.family));
  for (const [name, s] of Object.entries(r.surfaces)) {
    add(`${name}: العنوان يُرسم بـCairo المضمّن (لا خط مثبت ولا خط النظام)`, isCustom(s.heading, /Cairo/), s.heading);
    add(`${name}: النص يُرسم بـAlmarai المضمّن`, isCustom(s.text, /Almarai/), s.text);
    add(`${name}: الأوجه الأربعة مسجّلة في document.fonts`, s.faces.length === 4, s.faces);
  }
  add('github: لا عنصر أنماط للواجهة في مستند الصفحة (التسجيل بـFontFace)', r.surfaces.github?.uiStyleElements === 0, r.surfaces.github?.uiStyleElements);
  add('لا مضيف خارجي', r.blockedExternalHosts.length === 0, r.blockedExternalHosts);
  return checks;
}

// ---------- Firefox ----------

const FF_STATE = (heading, host) => `
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 400));
  await document.fonts.ready;
  const scope = ${host ? `document.querySelector(${JSON.stringify(host)})?.shadowRoot` : 'document'};
  const h = scope?.querySelector(${JSON.stringify(heading)});
  const t = ${TEXT_NODE(host)};
  const faces = [];
  document.fonts.forEach((f) => { if (/Mijhar UI/.test(f.family)) faces.push({ family: f.family.replace(/"/g, ''), weight: f.weight, status: f.status }); });
  return {
    heading: h ? getComputedStyle(h).fontFamily : null,
    headingWeight: h ? getComputedStyle(h).fontWeight : null,
    text: t ? getComputedStyle(t).fontFamily : null,
    faces,
    check: { display: document.fonts.check('700 16px "${DISPLAY}"'), text: document.fonts.check('400 16px "${TEXT}"') },
    uiStyleElements: [...document.querySelectorAll('style, link[rel="stylesheet"]')].filter((s) => /Mijhar UI/.test(s.textContent ?? '')).length,
  };`;

async function firefoxRun() {
  const session = await firefoxSession({ extDir: path.join(ROOT, 'dist/firefox'), githubReply: (p) => githubReply(p), apiReply });
  try {
    const { d } = session;
    const surfaces = {};
    surfaces.options = await d.options(`location.hash = 'token'; await new Promise((r) => setTimeout(r, 300)); ${FF_STATE('#mj-connections-title', null)}`);
    const origin = await d.options('return location.origin;');
    await d.openGithub(`${origin}/sidepanel.html`);
    await waitUntil(async () => (await d.github(`return document.querySelector('#app')?.getAttribute('data-ready');`)) === 'true', 10000);
    surfaces.sidepanel = await d.github(FF_STATE('h1, h2, h3', null));
    await d.openGithub(`https://github.com${PR_PATH}`);
    await waitUntil(() => d.github(`return Boolean(document.querySelector('${CARD}')?.shadowRoot?.querySelector('#mj-pr-title'));`), 15000);
    surfaces.github = await d.github(FF_STATE('#mj-pr-title', CARD));
    const external = [...session.network.blocked].filter((h) => !/(^|\.)mozilla\.(net|com|org)$/.test(h));
    return { label: 'Firefox', browserVersion: session.browserVersion, surfaces, blockedExternalHosts: external };
  } finally {
    await session.close();
  }
}

function firefoxChecks(r) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
  const loaded = (s, family, weight) => s?.faces?.some((f) => f.family === family && f.weight === weight && f.status === 'loaded');
  for (const [name, s] of Object.entries(r.surfaces)) {
    add(`${name}: العنوان يطلب Cairo المضمّن أولًا ووجهه ${s?.headingWeight ?? '؟'} محمَّل`, String(s?.heading).replace(/"/g, '').startsWith(DISPLAY) && loaded(s, DISPLAY, s?.headingWeight === '400' ? '400' : '700') && s.check.display, s);
    add(`${name}: النص يطلب Almarai المضمّن أولًا ووجه 400 محمَّل`, String(s?.text).replace(/"/g, '').startsWith(TEXT) && loaded(s, TEXT, '400') && s.check.text, s);
    add(`${name}: الأوجه الأربعة مسجّلة في document.fonts`, s?.faces?.length === 4, s?.faces);
  }
  add('github: لا عنصر أنماط للواجهة في مستند الصفحة (التسجيل بـFontFace)', r.surfaces.github?.uiStyleElements === 0, r.surfaces.github?.uiStyleElements);
  add('لا مضيف خارجي للإضافة', r.blockedExternalHosts.length === 0, r.blockedExternalHosts);
  return checks;
}

// ---------- التشغيل ----------

const results = {};
let passed = 0;
let total = 0;
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox']) {
  let r;
  let checks;
  try {
    r = key === 'firefox' ? await firefoxRun() : await chromiumRun(key);
    checks = key === 'firefox' ? firefoxChecks(r) : chromiumChecks(r);
  } catch (error) {
    r = { label: BROWSERS[key].label, error: String(error?.stack ?? error) };
    checks = [{ name: 'اكتمل التشغيل بلا خطأ', ok: false, detail: r.error.split('\n').slice(0, 3).join(' | ') }];
  }
  r.checks = checks;
  results[key] = r;
  console.log(`— ${r.label} ${r.browserVersion ?? ''}`);
  for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : ` — ${JSON.stringify(c.detail)?.slice(0, 300)}`}`);
  if (r.surfaces && key !== 'firefox') for (const [name, s] of Object.entries(r.surfaces)) console.log(`    ${name}: العنوان ${s.heading?.main ? `${s.heading.main.family}${s.heading.main.custom ? ' (مضمّن)' : ' (من النظام)'}` : '—'} · النص ${s.text?.main ? `${s.text.main.family}${s.text.main.custom ? ' (مضمّن)' : ' (من النظام)'}` : '—'}`);
  passed += checks.filter((c) => c.ok).length;
  total += checks.length;
  console.log(`${r.label}: ${checks.filter((c) => c.ok).length}/${checks.length}`);
}
console.log(`المجموع: ${passed}/${total}`);
if (outFile) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, `${JSON.stringify(results, null, 2)}\n`);
}
if (passed !== total) process.exitCode = 1;

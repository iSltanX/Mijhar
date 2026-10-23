#!/usr/bin/env node
// الجولة اليدوية للموجة C (Docs/MJ/waves.json): «فتح اللوحة الجانبية والدرج في Chrome وEdge وBrave بعد الدمج»، بنوافذ مرئية
// (headless: false) لا في وضع بلا نافذة، فتُقاس اللوحة الأصلية معروضةً في النافذة: أبعاد نافذتها وحالة ظهورها ولقطتها، والدرج
// في صفحة GitHub مرئيًّا. على الإضافة الاختبارية لـT-1.4 (tests/core/ui-host/browser/build.mjs) لأن فتح اللوحة الأصلية يشترط
// فعل مستخدم في صفحة إضافة (#open-native في test.html)، والحزمة المشحونة لا تحمل صفحة كهذه.
// ما لا يُجرى آليًا: ضغطة ⌥G الفعلية وقبول نافذة صلاحية api.github.com (لا تبلغهما CDP؛ انظر evidence/T-1.4/report.md).
// الاستعمال: node evidence/wave-C/manual-round.mjs [chrome edge brave] ← evidence/wave-C/manual-round.json وmanual-screens/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../scripts/load-check.mjs';
import { buildUiHostTestExtension } from '../../tests/core/ui-host/browser/build.mjs';
import { CONTROL_URL, PAGES, readFixture, waitUntil } from '../../tests/core/ui-host/browser/pages.mjs';
import { contentState } from '../../tests/core/ui-host/browser/probes.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCREENS = path.join(HERE, 'manual-screens');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const drawerProbe = () => {
  const host = document.querySelector('mijhar-host[data-mijhar-host="drawer"]');
  const panel = host?.shadowRoot?.querySelector('[role="dialog"], aside, .drawer');
  const rect = (panel ?? host)?.getBoundingClientRect();
  const hit = rect ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
  return { open: host?.hasAttribute('data-open') ?? false, rect: rect ? [rect.x, rect.y, rect.width, rect.height].map(Math.round) : null, topmostIsDrawer: hit === host, visibility: document.visibilityState };
};

async function run(key) {
  const { executable, label } = BROWSERS[key];
  const extDir = await buildUiHostTestExtension('chromium', path.join(os.tmpdir(), `mijhar-wave-c-manual-${key}`));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-wave-c-manual-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executable,
    headless: false,
    viewport: null,
    args: ['--enable-unsafe-extension-debugging', '--window-size=1280,860', '--no-first-run', '--no-default-browser-check'],
    ignoreDefaultArgs: ['--disable-extensions'],
  });
  const result = { label };
  try {
    const browser = context.browser();
    result.browserVersion = browser.version();
    await context.route('https://github.com/**', (route) => {
      const page = PAGES[new URL(route.request().url()).pathname];
      if (!page) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
      return route.fulfill({ status: 200, contentType: page.type ?? 'text/html; charset=utf-8', headers: page.csp ? { 'content-security-policy': page.csp } : {}, body: readFixture(page.file) });
    });
    await context.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '"محلي"' }));
    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: extDir });
    const origin = `chrome-extension://${id}`;
    fs.mkdirSync(SCREENS, { recursive: true });

    // الدرج في صفحة GitHub مرئية.
    const gh = context.pages()[0] ?? (await context.newPage());
    await gh.goto(CONTROL_URL);
    await waitUntil(async () => (await gh.evaluate(contentState)).content === 'ready', 10000);
    const ext = await context.newPage();
    await ext.goto(`${origin}/test.html`);
    await ext.waitForSelector('html[data-ready="true"]');
    const t = (name, ...args) => ext.evaluate(([n, a]) => globalThis.__t[n](...a), [name, args]);
    const tab = (await t('githubTabs')).find((x) => x.url === CONTROL_URL);
    await gh.bringToFront();
    await t('drawer', tab.id, 'open');
    await waitUntil(async () => (await gh.evaluate(contentState)).drawer === 'open', 5000);
    await sleep(400);
    result.drawer = await gh.evaluate(drawerProbe);
    await gh.screenshot({ path: path.join(SCREENS, `${key}-drawer.png`) });
    await t('drawer', tab.id, 'close');
    result.drawer.closed = Boolean(await waitUntil(async () => (await gh.evaluate(contentState)).drawer === 'closed', 5000));

    // اللوحة الأصلية بنقر فعلي في صفحة الإضافة، ثم وثيقتها كما تعرضها النافذة.
    await ext.bringToFront();
    const panelPage = context.waitForEvent('page', { predicate: (p) => p.url().endsWith('/sidepanel.html'), timeout: 8000 }).catch(() => null);
    await ext.click('#open-native');
    const opened = await waitUntil(async () => {
      const out = await t('out');
      return out && !out.includes('pending') ? JSON.parse(out) : null;
    }, 5000);
    result.native = { openResult: opened };
    // Playwright لا يعرض وثيقة اللوحة صفحةً: تُقاس من صفحة الإضافة (chrome.extension.getViews، الأصل نفسه)، وتُلتقط عبر CDP.
    await panelPage;
    await sleep(800);
    result.native.panel = await ext.evaluate(() => {
      const view = chrome.extension.getViews().find((w) => w.location.pathname === '/sidepanel.html');
      if (!view) return null;
      const doc = view.document;
      return {
        inner: [view.innerWidth, view.innerHeight],
        visibility: doc.visibilityState,
        ready: doc.querySelector('#app')?.getAttribute('data-ready') ?? null,
        tabs: [...doc.querySelectorAll('[role="tab"]')].map((e) => e.textContent.trim()),
      };
    });
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find((x) => x.url === `${origin}/sidepanel.html`);
    result.native.target = target ? `${target.type} ${target.url}` : null;
    if (target) {
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
      const shot = await new Promise((resolve) => {
        const onMessage = ({ sessionId: from, message }) => {
          const parsed = JSON.parse(message);
          if (from === sessionId && parsed.id === 1) {
            cdp.off('Target.receivedMessageFromTarget', onMessage);
            resolve(parsed.result?.data ?? null);
          }
        };
        cdp.on('Target.receivedMessageFromTarget', onMessage);
        cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }) });
        setTimeout(() => resolve(null), 5000);
      });
      if (shot) fs.writeFileSync(path.join(SCREENS, `${key}-sidepanel.png`), Buffer.from(shot, 'base64'));
      result.native.screenshot = Boolean(shot);
    }
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  return result;
}

const keys = process.argv.slice(2).filter((a) => BROWSERS[a] && a !== 'firefox');
const results = {};
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave']) {
  results[key] = await run(key);
  const r = results[key];
  console.log(
    `${r.label} ${r.browserVersion ?? ''}: ${r.error ? `خطأ: ${r.error.split('\n')[0]} · ` : ''}` +
      `الدرج مفتوح ${r.drawer?.open} مستطيله ${JSON.stringify(r.drawer?.rect)} الأعلى ${r.drawer?.topmostIsDrawer} أُغلق ${r.drawer?.closed}` +
      ` · اللوحة: ${JSON.stringify(r.native?.openResult)} نافذتها ${JSON.stringify(r.native?.panel?.inner)} ${r.native?.panel?.visibility} تبويبات ${r.native?.panel?.tabs?.length}`,
  );
}
fs.writeFileSync(path.join(HERE, 'manual-round.json'), `${JSON.stringify(results, null, 2)}\n`);

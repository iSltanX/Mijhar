#!/usr/bin/env node
// بعد MJ26 (ما بقي «لم يُجرَ آليًا» في T-10.1): في Chrome وEdge وBrave بنافذة مرئية وملف تعريف مؤقت، والحزمة المبنية dist/chromium:
//   أ. زر مِجهَر في شريط الأدوات يُضغط بواجهة الإتاحة في macOS (AXPress، كما يضغطه قارئ الشاشة) فتُفتح اللوحة الجانبية.
//   ب. Control+Shift+G ضغطة نظام حقيقية (System Events) والنافذة في المقدمة: تُفتح اللوحة.
//   ج. Control+Shift+K كذلك: تُفتح اللوحة على تبويب القاموس.
// اللوحة مفتوحة = وثيقة sidepanel.html بين chrome.extension.getViews() من صفحة الإضافة؛ وتُغلق بين البنود بـsidePanel.close. ولا تُرسل الضغطة
// إلا إن كانت عملية المتصفح المؤقت نفسها (unix id) في المقدمة لحظتها، فلا تصل إلى تطبيق آخر. ويُلغى تثبيت الزر في الشريط بإغلاق الملف المؤقت.
// الاستعمال: npm run build && node evidence/release-launch/chromium-toolbar-check.mjs [chrome edge brave] [--explore]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../scripts/load-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AX = path.join(ROOT, 'evidence/release-launch/ax.js');
const args = process.argv.slice(2);
const explore = args.includes('--explore');
const keys = args.filter((a) => BROWSERS[a]);
const list = keys.length ? keys : ['chrome', 'edge', 'brave'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ax = (...a) => execFileSync('osascript', ['-l', 'JavaScript', AX, ...a], { encoding: 'utf8', timeout: 60000 }).trim();
const NAME = 'مِجهَر';
const PAGE = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>mijhar-demo/arabic-docs</title></head><body><main><h1>مستودع تجريبي</h1><p>صفحة ثابتة لفحص زر الشريط والاختصارات.</p></main></body></html>';

function mainPid(profileDir) {
  const lines = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n');
  const hit = lines.find((l) => l.includes(`--user-data-dir=${profileDir}`) && !l.includes('--type='));
  return hit ? Number(hit.trim().split(/\s+/)[0]) : null;
}

const results = [];
for (const key of list) {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-toolbar-'));
  const context = await chromium.launchPersistentContext(profileDir, { executablePath: executable, headless: false, viewport: null, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging', '--no-first-run', '--no-default-browser-check'] });
  const steps = [];
  const check = (name, ok, detail) => {
    steps.push({ name, ok: Boolean(ok), detail });
    console.log(`  ${ok ? '✓' : '✗'} [${label}] ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 500)}`}`);
  };
  try {
    await context.route('https://github.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE }));
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
    const origin = `chrome-extension://${id}`;
    await sleep(1000);
    // تثبيت الزر في الشريط كما يفعل المستخدم من قائمة الإضافات (developerPrivate في صفحة الإضافات).
    const ext = await context.newPage();
    await ext.goto('chrome://extensions/');
    const pinned = await ext.evaluate((extensionId) => new Promise((resolve) => chrome.developerPrivate.updateExtensionConfiguration({ extensionId, pinnedToToolbar: true }, () => resolve(chrome.runtime.lastError?.message ?? 'ok'))), id).catch((e) => String(e));
    await ext.close();
    const probe = await context.newPage();
    await probe.goto(`${origin}/options.html`);
    const github = context.pages().find((p) => p.url() === 'about:blank') ?? (await context.newPage());
    await github.goto('https://github.com/mijhar-demo/arabic-docs');
    await github.bringToFront();
    await sleep(800);
    const pid = mainPid(profileDir);
    check('عملية المتصفح المؤقت معروفة، والزر مثبَّت في الشريط', pid && pinned === 'ok', { pid, pinned });
    if (explore) {
      console.log(ax('dump', String(pid)));
      continue;
    }
    const panel = () => probe.evaluate(() => {
      const view = chrome.extension.getViews().find((v) => v.location.pathname === '/sidepanel.html');
      if (!view) return null;
      const tab = view.document.querySelector('[role="tab"][aria-selected="true"]');
      return { open: true, tab: tab?.id ?? null };
    });
    const until = async (want, ms = 6000) => {
      const end = Date.now() + ms;
      for (;;) {
        const v = await panel().catch(() => null);
        if (want(v) || Date.now() > end) return v;
        await sleep(250);
      }
    };
    const close = async () => {
      const windowId = await probe.evaluate(async () => (await chrome.windows.getLastFocused()).id);
      await probe.evaluate((w) => chrome.sidePanel.close?.({ windowId: w }), windowId).catch(() => null);
      return until((v) => v === null, 4000);
    };

    // أ. الزر
    check('اللوحة مغلقة قبل البدء', (await panel()) === null, await panel());
    const pressed = JSON.parse(ax('press', String(pid), NAME));
    const a = await until((v) => v?.open);
    check('أ. AXPress على زر «مِجهَر» في الشريط يفتح اللوحة الجانبية', pressed.pressed && a?.open, { pressed, panel: a });
    const closedA = await close();

    // ب. Control+Shift+G
    await github.bringToFront();
    const sentB = JSON.parse(ax('keys', String(pid), 'g'));
    const b = await until((v) => v?.open);
    check('ب. Control+Shift+G (ضغطة نظام) يفتح اللوحة', closedA === null && sentB.sent && b?.open, { closedBefore: closedA === null, sent: sentB, panel: b });
    const closedB = await close();

    // ج. Control+Shift+K
    await github.bringToFront();
    const sentC = JSON.parse(ax('keys', String(pid), 'k'));
    const c = await until((v) => v?.open && /glossary/.test(v.tab ?? ''));
    check('ج. Control+Shift+K (ضغطة نظام) يفتح اللوحة على تبويب القاموس', closedB === null && sentC.sent && c?.open && /glossary/.test(c.tab ?? ''), { closedBefore: closedB === null, sent: sentC, panel: c });
  } catch (error) {
    check('تشغيل الفحص', false, String(error?.message ?? error).split('\n')[0]);
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  const passed = steps.filter((s) => s.ok).length;
  console.log(`${label}: ${passed}/${steps.length}`);
  results.push({ browser: label, passed, total: steps.length, steps });
}
if (!explore) fs.writeFileSync(path.join(ROOT, 'evidence/release-launch/chromium-toolbar-result.json'), `${JSON.stringify({ at: new Date().toISOString(), os: 'macOS', results }, null, 2)}\n`);
process.exit(results.every((r) => r.passed === r.total) ? 0 : 1);

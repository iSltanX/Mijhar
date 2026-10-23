#!/usr/bin/env node
// يحمّل dist/chromium/ كإضافة غير معبَّأة في Chrome وEdge وBrave ويقرأ أخطاء المانيفست من chrome://extensions.
// الاستعمال: node scripts/load-check.mjs [chrome|edge|brave ...] [--dist <مجلد>] [--report <ملف.md>]
// كل متصفح يعمل بملف تعريف مؤقت جديد (يُحذف عند الانتهاء)، فلا يُمس ملف تعريف المستخدم ولا نافذة مفتوحة منه.
// التحميل عبر CDP (Extensions.loadUnpacked) لأن --load-extension معطَّل في الإصدارات المعبَّأة الحديثة.
// المتصفحات تُفحص تباعًا لا بالتوازي. لا يُفتح أي موقع، فلا شبكة. Firefox خارج هذا السكربت (EV-06).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const BROWSERS = {
  chrome: { label: 'Chrome', executable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  edge: { label: 'Edge', executable: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
  brave: { label: 'Brave', executable: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
};

const SERVICE_WORKER_WAIT_MS = 5000;

async function waitForServiceWorker(context, extensionId) {
  const prefix = `chrome-extension://${extensionId}/`;
  const find = () => context.serviceWorkers().find((w) => w.url().startsWith(prefix));
  const deadline = Date.now() + SERVICE_WORKER_WAIT_MS;
  while (Date.now() < deadline) {
    const worker = find();
    if (worker) return worker.url();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

export async function checkBrowser(key, distDir) {
  const { label, executable } = BROWSERS[key];
  if (!fs.existsSync(executable)) return { key, label, status: 'skipped', note: `غير مثبت: ${executable}` };

  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-load-check-'));
  // سياق دائم لأن chrome://extensions لا يُفتح في سياق معزول.
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executable,
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  try {
    const browser = context.browser();
    const result = { key, label, browserVersion: browser?.version(), status: 'failed' };
    const cdp = await browser.newBrowserCDPSession();
    let id;
    try {
      ({ id } = await cdp.send('Extensions.loadUnpacked', { path: distDir }));
    } catch (error) {
      return { ...result, note: `رفض التحميل: ${error.message}` };
    }
    result.extensionId = id;

    const page = await context.newPage();
    await page.goto('chrome://extensions');
    const info = await page.evaluate(async (extensionId) => {
      const all = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
      const found = all.find((e) => e.id === extensionId);
      if (!found) return null;
      return {
        name: found.name,
        version: found.version,
        state: found.state,
        disableReasons: Object.entries(found.disableReasons ?? {}).filter(([, on]) => on === true).map(([reason]) => reason),
        manifestErrors: (found.manifestErrors ?? []).map((e) => e.message),
        runtimeErrors: (found.runtimeErrors ?? []).map((e) => e.message),
        installWarnings: (found.installWarnings ?? []).map((w) => w.message),
      };
    }, id);
    if (!info) return { ...result, note: 'الإضافة غير ظاهرة في chrome://extensions بعد التحميل' };
    Object.assign(result, info);

    result.serviceWorker = await waitForServiceWorker(context, id);
    const clean = info.state === 'ENABLED' && !info.manifestErrors.length && !info.runtimeErrors.length && !info.disableReasons.length && result.serviceWorker;
    result.status = clean ? 'ok' : 'failed';
    return result;
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

const list = (items) => (items.length ? items.map((m) => `\`${m}\``).join('؛ ') : 'لا شيء');

export function renderReport(results, distDir) {
  const lines = [
    '# فحص تحميل الحزمة في المتصفحات (`scripts/load-check.mjs`)',
    '',
    `- الحزمة: \`${path.relative(ROOT, distDir) || distDir}\``,
    `- التاريخ: ${new Date().toISOString().slice(0, 10)}`,
    '- الطريقة: تحميل غير معبَّأ عبر `Extensions.loadUnpacked` في ملف تعريف مؤقت، ثم قراءة `chrome.developerPrivate.getExtensionsInfo` من `chrome://extensions`.',
    '',
    '| المتصفح | الإصدار | النتيجة | الحالة | أخطاء المانيفست | أخطاء التشغيل | تحذيرات التثبيت | service worker |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
  ];
  for (const r of results) {
    if (r.status === 'skipped') {
      lines.push(`| ${r.label} | — | لم يُجرَ | — | — | — | — | ${r.note} |`);
      continue;
    }
    const verdict = r.status === 'ok' ? 'نجح' : 'فشل';
    lines.push(`| ${r.label} | ${r.browserVersion ?? '—'} | ${verdict} | ${r.state ?? '—'} | ${list(r.manifestErrors ?? [])} | ${list(r.runtimeErrors ?? [])} | ${list(r.installWarnings ?? [])} | ${r.serviceWorker ? 'بدأ' : r.note ?? 'لم يبدأ'} |`);
  }
  lines.push('', 'Firefox لم يُجرَ: غير مثبت (`EV-06`).', '');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const take = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args.splice(i, 2)[1];
  };
  const distDir = path.resolve(take('--dist') ?? path.join(ROOT, 'dist/chromium'));
  const reportPath = take('--report');
  const keys = args.length ? args : Object.keys(BROWSERS);
  const unknown = keys.filter((k) => !BROWSERS[k]);
  if (unknown.length) {
    console.error(`متصفح غير معروف: ${unknown.join(' ')} (المتاح: ${Object.keys(BROWSERS).join(' ')})`);
    process.exit(1);
  }
  if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
    console.error(`لا manifest.json في ${distDir}؛ شغّل npm run build أولًا`);
    process.exit(1);
  }

  const results = [];
  for (const key of keys) results.push(await checkBrowser(key, distDir));
  const report = renderReport(results, distDir);
  console.log(report);
  if (reportPath) {
    fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
    fs.writeFileSync(reportPath, report);
  }
  if (results.some((r) => r.status === 'failed')) process.exit(1);
}

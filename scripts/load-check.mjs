#!/usr/bin/env node
// يحمّل حزم dist في المتصفحات المثبتة ويقرأ أخطاء المانيفست وحالة التفعيل وبدء الخلفية:
// Chrome وEdge وBrave بحزمة dist/chromium، وFirefox بحزمة dist/firefox.
// الاستعمال: node scripts/load-check.mjs [chrome|edge|brave|firefox ...] [--dist <مجلد dist>] [--report <ملف.md>]
// كل متصفح بملف تعريف مؤقت جديد يُحذف عند الانتهاء، فلا يُمس ملف تعريف المستخدم ولا نافذة مفتوحة منه.
// المتصفحات تُفحص تباعًا لا بالتوازي. لا يُفتح أي موقع، فلا شبكة.
//  - عائلة Chromium: CDP (Extensions.loadUnpacked) ثم chrome.developerPrivate في chrome://extensions،
//    لأن --load-extension معطَّل في الإصدارات المعبَّأة الحديثة.
//  - Firefox: Marionette (Addon:Install مؤقتًا) ثم AddonManager وWebExtensionPolicy في سياق chrome.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const BROWSERS = {
  chrome: { label: 'Chrome', target: 'chromium', executable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  edge: { label: 'Edge', target: 'chromium', executable: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
  brave: { label: 'Brave', target: 'chromium', executable: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
  firefox: { label: 'Firefox', target: 'firefox', executable: '/Applications/Firefox.app/Contents/MacOS/firefox' },
};

const BACKGROUND_WAIT_MS = 5000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(read, timeoutMs = BACKGROUND_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value || Date.now() >= deadline) return value;
    await sleep(100);
  }
}

// ---------- عائلة Chromium ----------

async function checkChromium(key, distDir) {
  const { label, executable } = BROWSERS[key];
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

    const page = await context.newPage();
    await page.goto('chrome://extensions');
    const info = await page.evaluate(async (extensionId) => {
      const all = await chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true, includeTerminated: true });
      const found = all.find((e) => e.id === extensionId);
      if (!found) return null;
      return {
        name: found.name,
        extensionVersion: found.version,
        state: found.state,
        disableReasons: Object.entries(found.disableReasons ?? {}).filter(([, on]) => on === true).map(([reason]) => reason),
        manifestErrors: (found.manifestErrors ?? []).map((e) => e.message),
        runtimeErrors: (found.runtimeErrors ?? []).map((e) => e.message),
        warnings: (found.installWarnings ?? []).map((w) => w.message),
      };
    }, id);
    if (!info) return { ...result, note: 'الإضافة غير ظاهرة في chrome://extensions بعد التحميل' };
    Object.assign(result, info);

    const prefix = `chrome-extension://${id}/`;
    const worker = await waitFor(() => context.serviceWorkers().find((w) => w.url().startsWith(prefix)));
    result.background = worker ? 'service worker بدأ' : null;
    const clean = info.state === 'ENABLED' && !info.manifestErrors.length && !info.runtimeErrors.length && !info.disableReasons.length && worker;
    result.status = clean ? 'ok' : 'failed';
    return result;
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

// ---------- Firefox ----------

// عميل Marionette أدنى: كل رسالة «طول بالبايت:‏JSON»، والأمر [0, id, اسم, معاملات] وجوابه [1, id, خطأ, نتيجة].
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
      if (error) throw new Error(error.message ?? JSON.stringify(error));
      return result;
    },
  };
}

// يُنفَّذ في سياق chrome داخل Firefox؛ يرجع حالة الإضافة المثبَّتة ورسائل المانيفست.
const FIREFOX_PROBE = `
  const extensionId = arguments[0];
  return (async () => {
    const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
    const addon = await AddonManager.getAddonByID(extensionId);
    const policy = WebExtensionPolicy.getByID(extensionId);
    const extension = policy?.extension;
    const text = (items) => (items ?? []).map((m) => (typeof m === 'string' ? m : (m?.message ?? JSON.stringify(m))));
    // أخطاء التشغيل: رسائل وحدة التحكم الصادرة من صفحات الإضافة (مثل «Loading failed for the <script>» لملف خلفية غائب).
    const origin = policy ? new URL(policy.getURL('/')).origin : null;
    const runtime = origin ? Services.console.getMessageArray().map((m) => m.message).filter((m) => m.includes(origin)) : [];
    return {
      name: addon?.name,
      extensionVersion: addon?.version,
      isActive: addon?.isActive,
      appDisabled: addon?.appDisabled,
      userDisabled: addon?.userDisabled,
      isCompatible: addon?.isCompatible,
      backgroundState: extension?.backgroundState ?? null,
      allowedOrigins: extension ? extension.allowedOrigins.patterns.map((p) => p.pattern) : [],
      manifestErrors: text(extension?.errors),
      warnings: text(extension?.warnings),
      runtimeErrors: runtime,
    };
  })();
`;

async function checkFirefox(key, distDir) {
  const { label, executable } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-load-check-'));
  // منفذ Marionette عشوائي يُكتب في MarionetteActivePort بدل منفذ ثابت قد يشغله Firefox آخر.
  fs.writeFileSync(path.join(profileDir, 'user.js'), 'user_pref("marionette.port", 0);\n');
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  let socket;
  try {
    const portFile = path.join(profileDir, 'MarionetteActivePort');
    const port = await waitFor(() => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8')), 20000);
    if (!port) return { key, label, status: 'failed', note: 'لم يفتح Firefox منفذ Marionette' };
    socket = net.connect(port, '127.0.0.1');
    const client = marionette(socket);
    await client.handshake();
    const { capabilities } = await client.send('WebDriver:NewSession', { capabilities: {} });
    const result = { key, label, browserVersion: capabilities.browserVersion, status: 'failed' };

    let id;
    try {
      ({ value: id } = await client.send('Addon:Install', { path: distDir, temporary: true }));
    } catch (error) {
      return { ...result, note: `رفض التحميل: ${error.message}` };
    }

    await client.send('Marionette:SetContext', { value: 'chrome' });
    const probe = () => client.send('WebDriver:ExecuteScript', { script: FIREFOX_PROBE, args: [id] }).then((r) => r.value);
    let info = await probe();
    const deadline = Date.now() + BACKGROUND_WAIT_MS;
    while (info.backgroundState !== 'running' && Date.now() < deadline) {
      await sleep(200);
      info = await probe();
    }
    // مهلة قصيرة ليظهر في وحدة التحكم ما يفشل بعد بدء الخلفية (مثل سكربت غائب).
    await sleep(1000);
    info = await probe();
    const enabled = info.isActive && !info.appDisabled && !info.userDisabled && info.isCompatible;
    Object.assign(result, {
      name: info.name,
      extensionVersion: info.extensionVersion,
      state: enabled ? 'ENABLED' : 'DISABLED',
      manifestErrors: info.manifestErrors,
      runtimeErrors: info.runtimeErrors,
      warnings: info.warnings,
      origins: info.allowedOrigins.filter((o) => !o.startsWith('moz-extension://')),
      background: info.backgroundState === 'running' ? 'الخلفية تعمل' : null,
    });
    const clean = enabled && !info.manifestErrors.length && !info.runtimeErrors.length && info.backgroundState === 'running';
    result.status = clean ? 'ok' : 'failed';
    return result;
  } finally {
    socket?.destroy();
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(10000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited;
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}

export async function checkBrowser(key, distRoot) {
  const { label, target, executable } = BROWSERS[key];
  if (!fs.existsSync(executable)) return { key, label, status: 'skipped', note: `غير مثبت: ${executable}` };
  const distDir = path.join(distRoot, target);
  const result = await (target === 'firefox' ? checkFirefox : checkChromium)(key, distDir);
  const relative = path.relative(ROOT, distDir);
  return { ...result, package: relative.startsWith('..') ? distDir : relative };
}

// ---------- التقرير ----------

const list = (items) => (items?.length ? items.map((m) => `\`${m}\``).join('؛ ') : 'لا شيء');

export function renderReport(results) {
  const lines = [
    '# فحص تحميل الحزم في المتصفحات (`scripts/load-check.mjs`)',
    '',
    `- التاريخ: ${new Date().toISOString().slice(0, 10)}`,
    '- عائلة Chromium: تحميل غير معبَّأ عبر `Extensions.loadUnpacked` في ملف تعريف مؤقت، ثم قراءة `chrome.developerPrivate.getExtensionsInfo` من `chrome://extensions`.',
    '- Firefox: تثبيت مؤقت عبر Marionette (`Addon:Install`) في ملف تعريف مؤقت بلا نافذة، ثم قراءة `AddonManager` و`WebExtensionPolicy` في سياق chrome.',
    '',
    '| المتصفح | الإصدار | الحزمة | النتيجة | الحالة | أخطاء المانيفست | أخطاء التشغيل | التحذيرات | الخلفية |',
    '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |',
  ];
  for (const r of results) {
    if (r.status === 'skipped') {
      lines.push(`| ${r.label} | — | — | لم يُجرَ | — | — | — | — | ${r.note} |`);
      continue;
    }
    const verdict = r.status === 'ok' ? 'نجح' : 'فشل';
    lines.push(`| ${r.label} | ${r.browserVersion ?? '—'} | \`${r.package}\` | ${verdict} | ${r.state ?? '—'} | ${list(r.manifestErrors)} | ${list(r.runtimeErrors)} | ${list(r.warnings)} | ${r.background ?? r.note ?? 'لم تبدأ'} |`);
  }
  const missing = Object.keys(BROWSERS).filter((k) => !results.some((r) => r.key === k));
  if (missing.length) lines.push('', `لم تُفحص: ${missing.map((k) => BROWSERS[k].label).join('، ')} (لم تُطلب في هذا التشغيل).`);
  lines.push('');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const take = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args.splice(i, 2)[1];
  };
  const distRoot = path.resolve(take('--dist') ?? path.join(ROOT, 'dist'));
  const reportPath = take('--report');
  const keys = args.length ? args : Object.keys(BROWSERS);
  const unknown = keys.filter((k) => !BROWSERS[k]);
  if (unknown.length) {
    console.error(`متصفح غير معروف: ${unknown.join(' ')} (المتاح: ${Object.keys(BROWSERS).join(' ')})`);
    process.exit(1);
  }
  for (const target of new Set(keys.map((k) => BROWSERS[k].target))) {
    if (!fs.existsSync(path.join(distRoot, target, 'manifest.json'))) {
      console.error(`لا manifest.json في ${path.join(distRoot, target)}؛ شغّل npm run build أولًا`);
      process.exit(1);
    }
  }

  const results = [];
  for (const key of keys) results.push(await checkBrowser(key, distRoot));
  const report = renderReport(results);
  console.log(report);
  if (reportPath) {
    fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
    fs.writeFileSync(reportPath, report);
  }
  if (results.some((r) => r.status === 'failed')) process.exit(1);
}

// أدوات مشتركة لتجارب الجدوى (MJ4): نماذج قياس مؤقتة لا تُشحن.
// تشغيل المتصفحات المثبتة بملف تعريف مؤقت جديد يُحذف عند الإغلاق، فلا يُمس ملف تعريف المستخدم:
//  - عائلة Chromium عبر playwright-core (CDP).
//  - Firefox عبر Marionette (كما في scripts/load-check.mjs).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

export const BROWSERS = {
  chrome: { label: 'Chrome', family: 'chromium', executable: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' },
  edge: { label: 'Edge', family: 'chromium', executable: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
  brave: { label: 'Brave', family: 'chromium', executable: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' },
  firefox: { label: 'Firefox', family: 'firefox', executable: '/Applications/Firefox.app/Contents/MacOS/firefox' },
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor(read, timeoutMs = 5000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value || Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}

export function tempProfile(tag = 'spike') {
  return fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-${tag}-`));
}

// يفتح متصفحًا من عائلة Chromium بملف تعريف مؤقت؛ close() يغلقه ويحذف الملف.
export async function launchChromium(key, { headless = true, args = [], extension, locale = 'en-US', ...options } = {}) {
  const { executable } = BROWSERS[key];
  const profileDir = tempProfile(key);
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executable,
    headless,
    locale,
    ignoreDefaultArgs: extension ? ['--disable-extensions'] : undefined,
    args: [...(extension ? ['--enable-unsafe-extension-debugging'] : []), ...args],
    viewport: { width: 1280, height: 900 },
    ...options,
  });
  let extensionId;
  if (extension) {
    const cdp = await context.browser().newBrowserCDPSession();
    ({ id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: extension }));
  }
  return {
    context,
    extensionId,
    version: context.browser()?.version(),
    async close() {
      await context.close().catch(() => {});
      fs.rmSync(profileDir, { recursive: true, force: true });
    },
  };
}

// عميل Marionette أدنى: كل رسالة «طول بالبايت:JSON»، والأمر [0, id, اسم, معاملات] وجوابه [1, id, خطأ, نتيجة].
function marionetteClient(socket) {
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
      if (error) throw new Error(`${name}: ${error.message ?? JSON.stringify(error)}`);
      return result;
    },
  };
}

// يفتح Firefox بملف تعريف مؤقت وMarionette؛ prefs تُكتب في user.js قبل التشغيل.
export async function launchFirefox({ headless = true, prefs = {} } = {}) {
  const { executable } = BROWSERS.firefox;
  const profileDir = tempProfile('firefox');
  const lines = { 'marionette.port': 0, 'browser.shell.checkDefaultBrowser': false, 'datareporting.policy.dataSubmissionEnabled': false, 'toolkit.telemetry.reportingpolicy.firstRun': false, 'browser.aboutwelcome.enabled': false, ...prefs };
  fs.writeFileSync(path.join(profileDir, 'user.js'), Object.entries(lines).map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n') + '\n');
  const child = spawn(executable, [...(headless ? ['-headless'] : []), '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const portFile = path.join(profileDir, 'MarionetteActivePort');
  const port = await waitFor(() => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8')), 30000);
  if (!port) throw new Error('لم يفتح Firefox منفذ Marionette');
  const socket = net.connect(port, '127.0.0.1');
  const client = marionetteClient(socket);
  await client.handshake();
  const { capabilities } = await client.send('WebDriver:NewSession', { capabilities: { pageLoadStrategy: 'normal' } });
  let context = 'content';
  const setContext = async (value) => {
    if (value !== context) {
      await client.send('Marionette:SetContext', { value });
      context = value;
    }
  };
  return {
    client,
    version: capabilities.browserVersion,
    profileDir,
    async navigate(url) {
      await setContext('content');
      await client.send('WebDriver:Navigate', { url });
    },
    // سكربت متزامن في سياق الصفحة أو سياق chrome المميّز.
    async exec(script, args = [], where = 'content') {
      await setContext(where);
      return (await client.send('WebDriver:ExecuteScript', { script, args })).value;
    },
    async execAsync(script, args = [], where = 'content', timeout = 60000) {
      await setContext(where);
      await client.send('WebDriver:SetTimeouts', { script: timeout });
      return (await client.send('WebDriver:ExecuteAsyncScript', { script, args })).value;
    },
    async installAddon(dir) {
      return (await client.send('Addon:Install', { path: dir, temporary: true })).value;
    },
    async actions(actions) {
      await setContext('content');
      await client.send('WebDriver:PerformActions', { actions });
      await client.send('WebDriver:ReleaseActions');
    },
    async close() {
      socket.destroy();
      child.kill('SIGTERM');
      await Promise.race([exited, sleep(10000)]);
      if (child.exitCode === null) child.kill('SIGKILL');
      await exited;
      fs.rmSync(profileDir, { recursive: true, force: true });
    },
  };
}

export function machineInfo() {
  const cpus = os.cpus();
  return {
    cpu: cpus[0]?.model,
    cores: cpus.length,
    memoryGB: Math.round(os.totalmem() / 2 ** 30),
    os: `${os.type()} ${os.release()}`,
    node: process.version,
  };
}

export function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
  return {
    n: sorted.length,
    min: sorted[0],
    median: sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
    p95: q(0.95),
    max: sorted[sorted.length - 1],
  };
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

// خادم ملفات ثابت محلي لعينات fixtures (المنفذ عشوائي).
// isolate: ترويستا COOP/COEP لعزل الأصل (crossOriginIsolated) فترتفع دقة performance.now().
export async function serveDir(dir, { isolate = false } = {}) {
  const http = await import('node:http');
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.onnx': 'application/octet-stream' };
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(dir, pathname);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    const headers = { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' };
    if (isolate) Object.assign(headers, { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless' });
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

// متصفح موحّد للتجارب: open(url) ثم evaluate(fn, arg) في المتصفحات الأربعة.
export async function openBrowser(key, options = {}) {
  if (BROWSERS[key].family === 'firefox') {
    const ff = await launchFirefox(options);
    return {
      key,
      label: BROWSERS[key].label,
      version: ff.version,
      ff,
      async open(url) { await ff.navigate(url); },
      async evaluate(fn, arg) { return ff.exec(`return (${fn.toString()})(arguments[0]);`, [arg ?? null]); },
      async evaluateAsync(fn, arg, timeout = 120000) { return ff.execAsync(`const done = arguments[arguments.length - 1]; Promise.resolve((${fn.toString()})(arguments[0])).then(done, (e) => done({ error: String(e) }));`, [arg ?? null], 'content', timeout); },
      close: () => ff.close(),
    };
  }
  const b = await launchChromium(key, options);
  const page = await b.context.newPage();
  return {
    key,
    label: BROWSERS[key].label,
    version: b.version,
    page,
    context: b.context,
    async open(url) { await page.goto(url, { waitUntil: 'load' }); },
    evaluate: (fn, arg) => page.evaluate(fn, arg ?? null),
    evaluateAsync: (fn, arg) => page.evaluate(fn, arg ?? null),
    close: () => b.close(),
  };
}

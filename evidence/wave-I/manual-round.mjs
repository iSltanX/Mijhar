#!/usr/bin/env node
// الجولة اليدوية للموجة I (Docs/MJ/waves.json): «في Chrome بلا أي مفتاح: نقر «نسخ البرومبت» في قسم الفحوص وفي صفحة مشكلة، واللصق في محرر نصي
// للتأكد من المحتوى؛ ثم بمفتاح وهمي: التأكد من ظهور تجربة الموافقة قبل أي طلب.» بنافذة Chrome مرئية (headless: false) ونقرات فأرة وضغطات لوحة
// مفاتيح حقيقية من Playwright، في جزأين:
//  أ. الحزمة المشحونة dist/chromium كما هي، بلا أي مفتاح ولا رمز: «نسخ البرومبت» بنقرة فأرة في صفحة مهمة Actions (قسم الفحوص) وفي صفحة مشكلة؛
//     والمنسوخ يُقرأ من حافظة النظام (pbpaste) ويُلصق بـ⌘V في محرر نصي (textarea في صفحة محلية) فيطابقها ويبدأ بعنوان قالبه. ولا طلب إلى
//     المزوّد ولا إلى api.github.com، وخيار التحليل بوابة معلَّلة بالمفتاح.
//  ب. نسخة مشتقة من dist/chromium تمنح api.anthropic.com وapi.github.com آليًا والشيفرة كما هي (كفحص MJ21): مفتاح وهمي بصيغة حقيقية يُحفظ
//     بالواجهة (طلب التحقق المعلن وحده GET /v1/models إلى مضيف وهمي محلي)، ثم «حلّل…» بنقرة فأرة في قسم الفحوص وفي صفحة المشكلة: تظهر
//     تجربة الموافقة بمزوّدها ومودلها، وصفر طلبات تحليل (POST) قبل «إرسال للتحليل» وبعد «إلغاء».
// لا شبكة خارجية: github.com يُخدم محليًا من العينات، وapi.anthropic.com مضيف وهمي محلي، وكل مضيف آخر يُحجب ويُسجَّل. والمفتاح مختلَق يُولَّد وقت
// التشغيل ولا يُكتب في أي دليل. وحافظة النظام تُحفظ قبل الجولة وتُعاد بعدها.
// الاستعمال: node evidence/wave-I/manual-round.mjs ← evidence/wave-I/manual-round.json وmanual-round-clipboard/ وmanual-screens/
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../scripts/load-check.mjs';
import { sleep, waitUntil } from '../../tests/modules/d/token/browser/drivers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SCREENS = path.join(HERE, 'manual-screens');
const CLIPS = path.join(HERE, 'manual-round-clipboard');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const KEY = ['sk', 'ant', 'api03', 'ManualWaveIFakeKeyOnly'.repeat(3)].join('-');
const SECRET_RE = /sk-ant-api03-[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{20,}/;
const hasSecret = (value) => SECRET_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));

const JOB_URL = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
const ISSUE_URL = 'https://github.com/salktbi902/etos/issues/1';
const PAGES = {
  [new URL(JOB_URL).pathname]: read('fixtures/logs/gh-job-failed.html'),
  [new URL(ISSUE_URL).pathname]: read('fixtures/spikes/gh-issue-etos-1.html'),
};
const MODELS = [{ type: 'model', id: 'mock-sonnet-2', display_name: 'Mock Sonnet 2', max_tokens: 64000 }];

const COPY_HOST = 'mijhar-host[data-mijhar-host="e.copy-prompt"]';
const LOG_HOST = 'mijhar-host[data-mijhar-host="d.log"]';
const ISSUE_HOST = 'mijhar-host[data-mijhar-host="d.analysis"]';
const inShadow = (host, sel) => `document.querySelector('${host}')?.shadowRoot?.querySelector('${sel}')`;

// pbpaste وpbcopy يتبعان لغة البيئة: بلا UTF-8 تصير العربية «?».
const UTF8 = { ...process.env, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
const pbpaste = () => execFileSync('pbpaste', { encoding: 'utf8', env: UTF8 });
const pbcopy = (text) => execFileSync('pbcopy', { input: text, env: UTF8 });

/** نسخة من dist/chromium: الشيفرة كما هي، والمضيفان ممنوحان آليًا (نافذة الإذن لا تُقبل آليًا في عائلة Chromium). */
function derived() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-wave-i-manual-'));
  fs.cpSync(path.join(ROOT, 'dist/chromium'), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.github.com/*', 'https://api.anthropic.com/*'])];
  delete manifest.optional_host_permissions;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return dir;
}

async function session(extDir) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-wave-i-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: BROWSERS.chrome.executable,
    headless: false,
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const network = { github: [], api: [], provider: [], blocked: new Set() };
  await context.route('https://github.com/**', (route) => {
    const url = new URL(route.request().url());
    network.github.push(url.pathname);
    const body = PAGES[url.pathname];
    return body ? route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body }) : route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });
  await context.route('https://api.github.com/**', (route) => {
    const url = new URL(route.request().url());
    network.api.push({ method: route.request().method(), path: url.pathname + url.search });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"message":"Not Found"}' });
  });
  await context.route('https://api.anthropic.com/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = await request.allHeaders();
    network.provider.push({ method: request.method(), path: url.pathname + url.search, from: request.serviceWorker() ? 'background' : 'page', hasKey: headers['x-api-key'] === KEY, authorization: Boolean(headers.authorization) });
    const models = url.pathname.startsWith('/v1/models');
    return route.fulfill({ status: models ? 200 : 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(models ? { data: MODELS, has_more: false } : { type: 'error', error: { type: 'not_found_error', message: 'not found' } }) });
  });
  await context.route((url) => url.protocol === 'https:' && !['github.com', 'api.github.com', 'api.anthropic.com'].includes(url.host), (route) => {
    network.blocked.add(new URL(route.request().url()).host);
    return route.abort();
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: extDir });
  const origin = `chrome-extension://${id}`;
  await waitUntil(async () => context.serviceWorkers().find((w) => w.url().startsWith(origin)) ?? null, 8000);
  const options = await context.newPage();
  await options.goto(`${origin}/options.html`);
  await options.waitForSelector('#app[data-ready="true"]');
  const github = await context.newPage();
  const editor = await context.newPage();
  await editor.setContent('<!doctype html><meta charset="utf-8"><title>محرر نصي</title><textarea id="t" dir="auto" style="width:96vw;height:90vh;font:13px monospace"></textarea>');
  const expression = (code) => `(async function () { ${code} })()`;
  return {
    version: context.browser().version(),
    options,
    github,
    editor,
    network,
    evalGithub: (code) => github.evaluate(expression(code)),
    evalOptions: (code) => options.evaluate(expression(code)),
    async open(url) {
      await github.goto(url);
      await github.bringToFront();
    },
    async close() {
      await context.close();
      fs.rmSync(profileDir, { recursive: true, force: true });
    },
  };
}

const steps = [];
const check = (part, name, ok, detail) => {
  steps.push({ part, name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 400)}`}`);
};
const shot = (page, name) => page.screenshot({ path: path.join(SCREENS, `${name}.png`) });

/** «نسخ البرومبت» بنقرة فأرة، ثم حافظة النظام، ثم اللصق بـ⌘V في المحرر النصي. */
async function copyAndPaste(s, url, label, head, file) {
  await s.open(url);
  const ready = await waitUntil(() => s.evalGithub(`return Boolean(${inShadow(COPY_HOST, '[data-action="copy-prompt"]')});`), 15000);
  pbcopy(`mijhar-wave-i-sentinel-${label}`);
  if (ready) await s.github.locator(`${COPY_HOST} [data-action="copy-prompt"]`).first().click();
  const success = ready && (await waitUntil(async () => ((await s.evalGithub(`return ${inShadow(COPY_HOST, '[data-copy-prompt]')}?.getAttribute('data-state');`)) === 'success' ? true : null), 8000));
  await shot(s.github, `a-${file}-copied`);
  const system = pbpaste();
  await s.editor.bringToFront();
  await s.editor.fill('#t', '');
  await s.editor.focus('#t');
  await s.editor.keyboard.press('Meta+V');
  await sleep(300);
  const pasted = await s.editor.inputValue('#t');
  await shot(s.editor, `a-${file}-pasted`);
  fs.writeFileSync(path.join(CLIPS, `${file}.md`), pasted);
  check('أ', `${label}: نقرة الفأرة تنجح («تم النسخ»)، وحافظة النظام تغيّرت إلى برومبت يبدأ بـ«${head}»`, success && system.startsWith(head), { ready, success, head: system.slice(0, 80) });
  check('أ', `${label}: اللصق بـ⌘V في المحرر النصي يطابق حافظة النظام حرفًا بحرف (${pasted.split('\n').length} سطرًا)، ولا سرّ فيه`, pasted.length > 200 && pasted === system && !hasSecret(pasted), { pasted: pasted.length, system: system.length });
  return pasted;
}

async function partA() {
  console.log('أ. الحزمة المشحونة dist/chromium بلا أي مفتاح:');
  const s = await session(path.join(ROOT, 'dist/chromium'));
  try {
    const job = await copyAndPaste(s, JOB_URL, 'صفحة مهمة Actions (قسم الفحوص)', '# تشخيص الخطأ:', 'job');
    check('أ', 'برومبت الفحوص يحمل نص الخطأ من السجل («exit code 1») و«المعلومات الناقصة»', /exit code 1/i.test(job) && job.includes('## المعلومات الناقصة'), job.slice(0, 200));
    const gate = await s.evalGithub(`const g = ${inShadow(LOG_HOST, '[data-analysis="gate"]')}; return { gate: g?.textContent ?? null, open: Boolean(${inShadow(LOG_HOST, '[data-action="analysis-open"]')}) };`);
    check('أ', 'بلا مفتاح: خيار التحليل في قسم الفحوص بوابة معلَّلة بالمفتاح، ولا زر «حلّل…»', gate?.gate?.includes('مفتاح مزوّد التحليل') && gate.open === false, gate);
    const issue = await copyAndPaste(s, ISSUE_URL, 'صفحة مشكلة', '# فهم المشكلة: Local Debug', 'issue');
    check('أ', 'برومبت المشكلة يحمل عنوانها ورابطها', issue.includes('salktbi902/etos') && issue.includes('Local Debug'), issue.slice(0, 200));
    check('أ', 'لا طلب إلى api.anthropic.com ولا إلى api.github.com طوال الجزء', s.network.provider.length === 0 && s.network.api.length === 0, { provider: s.network.provider, api: s.network.api });
    return { version: s.version, blocked: [...s.network.blocked] };
  } finally {
    await s.close();
  }
}

async function partB() {
  console.log('ب. نسخة مشتقة تمنح المضيفين، بمفتاح وهمي:');
  const dir = derived();
  const s = await session(dir);
  try {
    await s.options.bringToFront();
    await waitUntil(() => s.evalOptions(`return Boolean(document.querySelector('#mj-key-input')) || null;`), 10000);
    await s.options.locator('#mj-key-input').click();
    await s.options.keyboard.type(KEY, { delay: 2 });
    check('ب', 'قبل الحفظ: صفر طلبات إلى المزوّد', s.network.provider.length === 0, s.network.provider);
    await s.options.locator('[data-action="key-save"]').click();
    const saved = await waitUntil(() => s.evalOptions(`const n = document.querySelector('[data-key-check]'); return n?.getAttribute('data-health') === 'healthy' ? { text: n.textContent, html: document.documentElement.outerHTML } : null;`), 12000);
    await shot(s.options, 'b-key-saved');
    await sleep(800);
    const verify = s.network.provider.map((r) => ({ method: r.method, path: r.path, from: r.from }));
    check('ب', 'حفظ المفتاح الوهمي: طلب التحقق المعلن وحده (GET /v1/models من الخلفية بالمفتاح وبلا Authorization)، ولا مفتاح في DOM الإعدادات', saved && !hasSecret(saved.html) && verify.length === 1 && verify[0].method === 'GET' && verify[0].path.startsWith('/v1/models') && verify[0].from === 'background' && s.network.provider[0].hasKey && !s.network.provider[0].authorization, { verify, saved: Boolean(saved) });
    const posts = () => s.network.provider.filter((r) => r.method === 'POST').length;

    for (const [url, host, label, file] of [
      [JOB_URL, LOG_HOST, 'قسم الفحوص', 'job'],
      [ISSUE_URL, ISSUE_HOST, 'صفحة المشكلة', 'issue'],
    ]) {
      await s.open(url);
      const ready = await waitUntil(() => s.evalGithub(`return Boolean(${inShadow(host, '[data-action="analysis-open"]')}) || null;`), 15000);
      check('ب', `${label}: «حلّل…» ظاهر بعد المفتاح، وفتح الصفحة لا يرسل شيئًا`, ready && posts() === 0, { ready, posts: posts() });
      if (ready) await s.github.locator(`${host} [data-action="analysis-open"]`).first().click();
      const consent = await waitUntil(() => s.evalGithub(`const c = ${inShadow(host, '[data-consent]')}; return c ? { lead: c.querySelector('[data-consent-lead]')?.textContent ?? '', content: c.querySelector('[data-consent-row="content"]')?.textContent ?? '', button: c.querySelector('[data-action="consent-confirm"]')?.textContent?.trim() ?? '' } : null;`), 8000);
      await shot(s.github, `b-${file}-consent`);
      check('ب', `${label}: نقرة الفأرة تُظهر تجربة الموافقة (Anthropic وapi.anthropic.com وMock Sonnet 2 وما يُرسل، والزر «إرسال للتحليل») وصفر طلبات تحليل`, consent && consent.lead.includes('Anthropic') && consent.lead.includes('api.anthropic.com') && consent.lead.includes('Mock Sonnet 2') && consent.content.length > 0 && consent.button === 'إرسال للتحليل' && posts() === 0, { consent, posts: posts() });
      if (consent) await s.github.locator(`${host} [data-action="consent-cancel"]`).first().click();
      await sleep(800);
      const closed = await s.evalGithub(`return Boolean(${inShadow(host, '[data-consent]')});`);
      check('ب', `${label}: «إلغاء» يغلق الموافقة ولا يرسل شيئًا`, closed === false && posts() === 0, { closed, posts: posts() });
    }
    const page = await s.evalGithub(`return document.documentElement.outerHTML;`);
    check('ب', 'نهاية الجزء: طلبات المزوّد كلها طلب التحقق الواحد، وصفر طلبات تحليل، ولا مفتاح في صفحة GitHub', s.network.provider.length === 1 && posts() === 0 && !hasSecret(page), s.network.provider.map((r) => `${r.method} ${r.path}`));
    return { version: s.version, blocked: [...s.network.blocked] };
  } finally {
    await s.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

fs.mkdirSync(SCREENS, { recursive: true });
fs.mkdirSync(CLIPS, { recursive: true });
const original = pbpaste();
let a;
let b;
try {
  a = await partA();
  b = await partB();
} finally {
  pbcopy(original);
}
const passed = steps.filter((x) => x.ok).length;
const result = { browser: `Chrome ${a?.version ?? '?'}`, headless: false, at: new Date().toISOString(), passed, total: steps.length, steps, blockedHosts: [...new Set([...(a?.blocked ?? []), ...(b?.blocked ?? [])])] };
fs.writeFileSync(path.join(HERE, 'manual-round.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(`Chrome ${a?.version}: ${passed}/${steps.length}`);
process.exit(passed === steps.length ? 0 : 1);

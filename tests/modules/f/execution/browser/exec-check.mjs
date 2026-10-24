#!/usr/bin/env node
// MJ22 في المتصفحات الحقيقية على الحزمة المشحونة (dist/<target> من npm run build)، بمشغّلي MJ15 (tests/modules/d/token/browser/drivers.mjs): صفحات
// GitHub وواجهة api.github.com تُخدمان محليًا، فلا يخرج طلب ولا يُكتب شيء في GitHub الحقيقي. والرمزان مختلَقان بصيغة حقيقية يُولَّدان وقت التشغيل
// ولا يُكتبان في أي دليل.
//   A. AD-33 (I-1): زرّا التنزيل في الصفحة: النقر البرمجي من عالم الصفحة الرئيسي (click() وحدث مُنشأ) لا ينزّل، ونقرة الفأرة تنزّل كما كانت.
//      download-prompt بعد فشل حافظة حقيقي (نقرة بلا نشاط مستخدم، كما في فحص MJ20)، وbuilder-download في شريط حزمة السياق.
//   B. AC-F6 (TEST-EXEC-02 في متصفح حقيقي):
//      1. لا شيء من مسار الإنجاز في صفحة GitHub: لا خطوة ولا موافقة ولا حقل يصل إليه سكربت الصفحة.
//      2. رسالة تنفيذ من سكربت المحتوى (عالم الإضافة المعزول في صفحة GitHub) ترفضها الخلفية ولا يصدر طلب كتابة.
//      3. (عائلة Chromium) اللوحة الأصلية sidepanel.html: رمزا القراءة والكتابة بالواجهة (لا طلب برمز الكتابة عند حفظه)؛ ثم القراءة برمز القراءة
//         وحده؛ والنقر البرمجي على الموافقة و«نفّذ» لا يغيّر شيئًا ولا يرسل؛ ونقرات الفأرة تكتب ثلاث عمليات برمز الكتابة من الخلفية وحدها، ويُعرض
//         رابط الطلب؛ ولا دمج ولا إغلاق ولا طريقة أخرى. وفي Firefox «لم يُجرَ» بسببه: لوحة sidebar_action لا يقودها Marionette، وصفحتها في تبويب
//         تجعل نفسها التبويب النشط فلا ترى صفحة GitHub.
// الاستعمال: node tests/modules/f/execution/browser/exec-check.mjs [chrome edge brave firefox] [--out-dir evidence/T-11.8] [--shots <مجلد>]
import fs from 'node:fs';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, derivedCopy, firefoxSession, sleep, waitUntil } from '../../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const take = (flag) => {
  const at = args.indexOf(flag);
  return at === -1 ? null : path.resolve(args.splice(at, 2)[1]);
};
const outDir = take('--out-dir');
const shotsDir = take('--shots');
const keys = args.filter((a) => BROWSERS[a]);

const fakePat = (tag) => ['github', 'pat', `11${tag.repeat(4)}EXECCHECK0000000_${`${tag}fakeExecCheckOnly`.repeat(5).slice(0, 59)}`].join('_');
const READ = fakePat('R');
const WRITE = fakePat('W');
const SECRET_RE = /github_pat_[A-Za-z0-9_]{20,}/;
const hasSecret = (value) => SECRET_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PAGES = {
  '/octo/demo/pull/4242': read('tests/modules/e/fixtures/fixture-pr-context.html'),
  '/octo/demo/issues/3': read('tests/core/guardrails/fixtures/fixture-prompt-injection.html'),
};
const STATUS_FRAGMENT = read('tests/modules/d/fixtures/fixture-status-details.html');
const githubReply = (pathname) => {
  if (PAGES[pathname]) return { status: 200, type: 'text/html; charset=utf-8', body: PAGES[pathname] };
  if (/\/status-details$/.test(pathname)) return { status: 200, type: 'text/html; charset=utf-8', body: STATUS_FRAGMENT };
  return { status: 404, type: 'text/plain', body: 'not found' };
};

const BASE = 'a1'.repeat(20);
const FILE = 'b2'.repeat(20);
const COMMIT = 'c3'.repeat(20);
const README = '# Demo\n\nInstall:\n\n    yarn install && yarn dev\n';
const EDITED = README.replace('yarn install && yarn dev', 'pnpm install && pnpm dev');
const b64 = (text) => Buffer.from(text, 'utf8').toString('base64');
const RATE = { resources: { core: { limit: 5000, remaining: 4990, reset: 1, used: 10 } } };
const RATE_HEADERS = { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4990', 'x-ratelimit-reset': '1', 'x-ratelimit-resource': 'core' };
/** واجهة api.github.com المحلية: القراءة الثلاث والعمليات الثلاث (تُميَّز بالمسار). */
const apiReply = (pathAndQuery, authorization) => {
  const repo = '/repos/octo/demo';
  if (pathAndQuery.startsWith('/rate_limit')) return authorization === `Bearer ${READ}` ? { status: 200, body: RATE, headers: RATE_HEADERS } : { status: 401, body: { message: 'Bad credentials' } };
  if (pathAndQuery === repo) return { status: 200, body: { full_name: 'octo/demo', default_branch: 'main', private: false }, headers: RATE_HEADERS };
  if (pathAndQuery === `${repo}/git/ref/heads/main`) return { status: 200, body: { ref: 'refs/heads/main', object: { sha: BASE, type: 'commit' } }, headers: RATE_HEADERS };
  if (pathAndQuery === `${repo}/contents/README.md?ref=${BASE}`) return { status: 200, body: { type: 'file', encoding: 'base64', content: b64(README), sha: FILE }, headers: RATE_HEADERS };
  if (pathAndQuery === `${repo}/git/refs`) return { status: 201, body: { ref: 'refs/heads/x', object: { sha: BASE } } };
  if (pathAndQuery === `${repo}/contents/README.md`) return { status: 201, body: { commit: { sha: COMMIT } } };
  if (pathAndQuery === `${repo}/pulls`) return { status: 201, body: { number: 9, draft: true } };
  return { status: 404, body: { message: 'Not Found' } };
};
const authLabel = (value) => (value ? (value === `Bearer ${WRITE}` ? 'write' : value === `Bearer ${READ}` ? 'read' : 'other') : null);

const BUILDER = 'mijhar-host[data-mijhar-host="e.builder"]';
const COPY = 'mijhar-host[data-mijhar-host="e.copy-prompt"]';
const RB = `document.querySelector('${BUILDER}')?.shadowRoot`;
const RC = `document.querySelector('${COPY}')?.shadowRoot`;

/** مسبار في عالم سكربت المحتوى (عالم الإضافة المعزول في صفحة GitHub): يرسل خطة صالحة إلى الخلفية ويعيد ردها. */
const RUN_FROM_CONTENT = `
(async () => {
  const api = globalThis.browser ?? globalThis.chrome;
  const plan = { owner: 'octo', repo: 'demo', base: 'main', baseSha: '${BASE}', branch: 'mijhar/from-content', path: 'README.md', fileSha: '${FILE}', content: 'x\\n', title: 'docs: x', body: '', draft: true };
  try { return await api.runtime.sendMessage({ type: 'mijhar/execution', op: 'run', plan }); } catch (e) { return { error: String(e) }; }
})();
`;

async function scenario(session, key, checks) {
  const { d, network } = session;
  const chromium = key !== 'firefox';
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 500)}`}`);
  };
  const notRun = (name, why) => {
    checks.push({ name, ok: true, notRun: why });
    console.log(`  – لم يُجرَ: ${name} (${why})`);
  };
  const writes = () => network.api.filter((r) => r.method !== 'GET');
  let downloads = 0;
  session.githubPage?.on('download', () => (downloads += 1));

  // A. زرّا التنزيل (AD-33).
  await d.openGithub('https://github.com/octo/demo/pull/4242');
  const bar = await waitUntil(() => d.github(`return Boolean(${RB}?.querySelector('[data-action="builder-toggle"]'));`), 15000);
  check('شريط حزمة السياق مركَّب في صفحة الطلب', bar, bar);
  await d.clickShadow(BUILDER, '[data-action="builder-toggle"]');
  await waitUntil(() => d.github(`return Boolean(${RB}?.querySelector('[data-action="builder-download"]'));`), 8000);
  await d.github(`const b = ${RB}.querySelector('[data-action="builder-download"]'); b.click(); b.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 })); return true;`);
  await sleep(1500);
  const builderAfterScript = await d.github(`return ${RB}.querySelector('[data-download-state]')?.getAttribute('data-download-state') ?? null;`);
  check('AD-33: builder-download بالنقر البرمجي من عالم الصفحة لا ينزّل شيئًا', builderAfterScript === null && downloads === 0, { builderAfterScript, downloads });
  await d.clickShadow(BUILDER, '[data-action="builder-download"]');
  const builderMouse = await waitUntil(() => d.github(`return ${RB}.querySelector('[data-download-state]')?.getAttribute('data-download-state') ?? null;`), 6000);
  if (chromium) await waitUntil(async () => downloads >= 1 || null, 4000);
  check(`AD-33: builder-download بنقرة الفأرة ينزّل كما كان${chromium ? ' (حدث تنزيل في المتصفح)' : ''}`, builderMouse === 'downloaded' && (!chromium || downloads === 1), { builderMouse, downloads });

  const copyReady = await waitUntil(() => d.github(`return Boolean(${RC}?.querySelector('[data-action="copy-prompt"]'));`), 10000);
  check('زر «نسخ البرومبت» مركَّب', copyReady, copyReady);
  if (chromium) await session.context.clearPermissions();
  await d.github(`
    const host = document.querySelector('${COPY}');
    setTimeout(() => host.shadowRoot.querySelector('[data-action="copy-prompt"]').click(), 8000);
    return true;
  `);
  // صمت تام: كل evaluate يمنح الصفحة نشاط مستخدم فيُفسد فشل الحافظة الحقيقي (درس MJ20).
  await sleep(10000);
  const failed = await waitUntil(() => d.github(`return ${RC}?.querySelector('[data-copy-prompt]')?.getAttribute('data-state') === 'failed' || null;`), 6000, 200);
  check('فشل حافظة حقيقي يُظهر البديل اليدوي (download-prompt)', failed && (await d.github(`return Boolean(${RC}.querySelector('[data-action="download-prompt"]'));`)), failed);
  const before = downloads;
  await d.github(`const b = ${RC}.querySelector('[data-action="download-prompt"]'); b.click(); b.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 })); return true;`);
  await sleep(1500);
  const promptAfterScript = await d.github(`return ${RC}.querySelector('[data-download]')?.getAttribute('data-download') ?? null;`);
  check('AD-33: download-prompt بالنقر البرمجي من عالم الصفحة لا ينزّل شيئًا', promptAfterScript === null && downloads === before, { promptAfterScript, downloads: downloads - before });
  await d.clickShadow(COPY, '[data-action="download-prompt"]');
  const promptMouse = await waitUntil(() => d.github(`return ${RC}.querySelector('[data-download]')?.getAttribute('data-download') ?? null;`), 6000);
  if (chromium) await waitUntil(async () => downloads > before || null, 4000);
  check(`AD-33: download-prompt بنقرة الفأرة ينزّل كما كان${chromium ? ' (حدث تنزيل في المتصفح)' : ''}`, promptMouse === 'downloaded' && (!chromium || downloads === before + 1), { promptMouse, downloads: downloads - before });
  if (chromium) await session.context.grantPermissions(['clipboard-read'], { origin: 'https://github.com' });

  // B1. لا شيء من المسار في صفحة GitHub.
  await d.openGithub('https://github.com/octo/demo/issues/3');
  await waitUntil(() => d.github(`return document.querySelectorAll('mijhar-host').length > 0 || null;`), 15000);
  await sleep(800);
  const inPage = await d.github(`
    const hosts = [...document.querySelectorAll('mijhar-host')];
    return { hosts: hosts.length, exec: hosts.filter((h) => h.shadowRoot?.querySelector('[data-exec-step], [data-consent^="exec"], [data-consent="write-token-save"], #mj-write-input')).map((h) => h.getAttribute('data-mijhar-host')) };
  `);
  check('B1: لا خطوة ولا موافقة ولا حقل من مسار الإنجاز في أي جذر ظل في صفحة GitHub (لا يصل إليه سكربت الصفحة)', inPage?.hosts > 0 && inPage.exec.length === 0, inPage);

  // B2. رسالة تنفيذ من سكربت المحتوى: مرفوضة ولا كتابة.
  const fromContent = await d.probe('mj22-run-from-content.js');
  await sleep(500);
  check('B2: رسالة «run» من سكربت المحتوى في صفحة GitHub ترفضها الخلفية ولا يصدر طلب كتابة', fromContent && fromContent.ok === false && /لوحة مِجهَر الأصلية/.test(fromContent.failure?.message ?? '') && writes().length === 0, { fromContent, writes: writes() });

  if (!chromium) {
    notRun('B3: المسار كاملًا في اللوحة الأصلية', 'Firefox: لوحة sidebar_action لا يقودها Marionette، وsidepanel.html في تبويب تجعل نفسها التبويب النشط فلا ترى صفحة GitHub؛ والمسار مقيس في Chrome وEdge وBrave وبالوحدة');
    return;
  }

  // B3. الرمزان بالواجهة.
  await d.fill('#mj-token-input', READ);
  await d.click('[data-action="token-save"]');
  await waitUntil(() => d.options(`return document.querySelector('[data-connection="github-token"] [data-health]')?.getAttribute('data-health') === 'healthy' || null;`), 10000);
  const requestsBeforeWrite = network.api.length;
  await d.fill('#mj-write-input', WRITE);
  await d.click('[data-consent="write-token-save"]');
  const writeCard = await waitUntil(() => d.options(`const c = document.querySelector('[data-connection="github-write"]'); const s = c?.querySelector('[data-write-state]')?.getAttribute('data-write-state'); return s === 'session' ? { state: s, input: c.querySelector('#mj-write-input').value, html: document.documentElement.outerHTML } : null;`), 8000);
  await sleep(800);
  check('B3: رمز الكتابة يُحفظ في الجلسة بنقرة الفأرة، ويُفرَّغ حقله ولا يظهر في الصفحة، ولا طلب بعده (لا تحقق بطلب قراءة)', writeCard && writeCard.input === '' && !writeCard.html.includes(WRITE) && network.api.length === requestsBeforeWrite, writeCard && { state: writeCard.state, input: writeCard.input, after: network.api.slice(requestsBeforeWrite) });

  // اللوحة الأصلية في تبويب، وصفحة المشكلة هي التبويب النشط.
  const origin = await d.options('return location.origin;');
  const panel = await session.context.newPage();
  await panel.goto(`${origin}/sidepanel.html`);
  await panel.waitForSelector('[role="tab"]');
  // الترحيب يظهر عند أول فتح بعد التثبيت (AD-29)، واختيار تبويب «السياق» ينهيه.
  await panel.locator('[role="tab"]', { hasText: 'السياق' }).first().click();
  await session.githubPage.bringToFront();
  const prepared = await waitUntil(async () => (await panel.locator('[data-action="exec-prepare"]').count()) > 0 || null, 10000);
  check('B3: «تجهيز تعديل» في تبويب «السياق والفحوص» للمستودع المفتوح', prepared, await panel.evaluate(() => document.body.innerText.slice(0, 300)));
  if (!prepared) return;
  const shot = async (name) => {
    if (!shotsDir) return;
    fs.mkdirSync(shotsDir, { recursive: true });
    await panel.locator('.exec').screenshot({ path: path.join(shotsDir, `${key}-${name}.png`) });
  };
  await shot('1-propose');
  const readsFrom = network.api.length;
  await panel.locator('[data-action="exec-prepare"]').click();
  await panel.waitForSelector('[data-exec-step="preview"]', { timeout: 10000 });
  const reads = network.api.slice(readsFrom);
  check('B3: المعاينة بثلاث قراءات GET برمز القراءة وحده من الخلفية', reads.length === 3 && reads.every((r) => r.method === 'GET' && r.auth === 'read' && r.from === 'background'), reads);
  await panel.locator('[data-field="content"]').fill(EDITED);
  const diff = await panel.evaluate(() => [...document.querySelectorAll('[data-diff] .diff-row')].map((r) => `${r.getAttribute('data-kind')}:${r.querySelector('.text')?.textContent}`));
  check('B3: الفرق كاملًا قبل أي اتصال كتابة', diff.includes('del:    yarn install && yarn dev') && diff.includes('add:    pnpm install && pnpm dev') && writes().length === 0, { diff, writes: writes() });
  await shot('2-preview');
  await panel.locator('[data-action="exec-next"]').click();
  await panel.waitForSelector('[data-exec-step="scope"]');
  // محاولة تخطي الموافقة بالنقر البرمجي.
  const skipped = await panel.evaluate(async () => {
    const box = document.querySelector('[data-consent="exec-scope"]');
    const run = document.querySelector('[data-consent="exec-run"]');
    box.click();
    box.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    run.disabled = false;
    run.click();
    run.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 800));
    return { checked: box.checked, step: document.querySelector('[data-exec-step]')?.getAttribute('data-exec-step') };
  });
  check('B3: النقر البرمجي على الموافقة و«نفّذ» (ولو أُزيل تعطيله) لا يغيّر شيئًا ولا يرسل', skipped.checked === false && skipped.step === 'scope' && writes().length === 0, { skipped, writes: writes() });
  await shot('3-scope');
  await panel.locator('[data-consent="exec-scope"]').click();
  await panel.locator('[data-consent="exec-run"]').click();
  await panel.waitForSelector('[data-exec-step="done"]', { timeout: 15000 });
  const done = await panel.evaluate(() => ({ outcome: document.querySelector('[data-outcome]')?.getAttribute('data-outcome'), link: document.querySelector('[data-action="exec-open-pull"]')?.getAttribute('href') ?? null, text: document.querySelector('.exec-result')?.textContent ?? '', html: document.documentElement.outerHTML }));
  const w = writes().map((r) => `${r.method} ${r.path} ${r.auth} ${r.from}`);
  check('B3: بنقرات الفأرة ثلاث عمليات بترتيبها برمز الكتابة من الخلفية وحدها، ولا غيرها', JSON.stringify(w) === JSON.stringify(['POST /repos/octo/demo/git/refs write background', 'PUT /repos/octo/demo/contents/README.md write background', 'POST /repos/octo/demo/pulls write background']), w);
  check('B3: لا طلب قراءة يحمل رمز الكتابة، ولا طريقة غير GET وPOST وPUT', network.api.every((r) => (r.method === 'GET' ? r.auth !== 'write' : r.auth === 'write')) && network.api.every((r) => ['GET', 'POST', 'PUT'].includes(r.method)), network.api);
  check('B3: «ما حدث فعلًا» برابط الطلب، ولا دمج ولا إغلاق، ولا رمز في اللوحة', done.outcome === 'ok' && done.link === 'https://github.com/octo/demo/pull/9' && done.text.includes('لم يُدمج شيء ولم يُغلق شيء') && !hasSecret(done.html), { outcome: done.outcome, link: done.link });
  await shot('4-done');
  await panel.close();
}

async function run(key) {
  const { label, target } = BROWSERS[key];
  const extDir = derivedCopy(target, { 'mj22-run-from-content.js': RUN_FROM_CONTENT });
  const result = { label, checks: [] };
  let session;
  try {
    const options = { extDir, githubReply, apiReply, authLabel };
    session = key === 'firefox' ? await firefoxSession(options) : await chromiumSession(key, options);
    result.browserVersion = session.browserVersion;
    await scenario(session, key, result.checks);
    result.extensionErrors = await session.extensionErrors();
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    if (session) {
      result.network = { api: session.network.api, blockedExternalHosts: [...session.network.blocked].sort() };
      result.consoleHasSecret = hasSecret(await Promise.resolve(session.consoleText()).catch(() => ''));
      await session.close();
    }
    fs.rmSync(extDir, { recursive: true, force: true });
    await sleep(200);
  }
  return result;
}

const results = {};
const all = [];
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox']) {
  console.log(`— ${BROWSERS[key].label}`);
  const r = await run(key);
  const add = (name, ok, detail) => {
    r.checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 400)}`}`);
  };
  add('اكتمل التشغيل بلا خطأ', !r.error, r.error?.split('\n').slice(0, 3).join(' | '));
  add('لا سرّ في الكونسول (الصفحة والإعدادات والخلفية)', r.consoleHasSecret === false, r.consoleHasSecret);
  const PAGE_ASSET_HOSTS = /(^|\.)(githubassets\.com|githubusercontent\.com|mozilla\.org|mozilla\.net|mozilla\.com)$/;
  const foreign = (r.network?.blockedExternalHosts ?? ['؟']).filter((h) => !PAGE_ASSET_HOSTS.test(h));
  add('لا وجهة للإضافة غير github.com وapi.github.com (أصول الصفحات المحفوظة وبنية Mozilla مستثناة)', foreign.length === 0, foreign);
  if (r.extensionErrors) add('لا أخطاء تشغيل ولا مانيفست للإضافة', r.extensionErrors.runtime.length === 0 && r.extensionErrors.manifest.length === 0, r.extensionErrors);
  results[key] = r;
  const bad = r.checks.filter((c) => !c.ok).length;
  console.log(`${r.label} ${r.browserVersion ?? ''}: ${r.checks.length - bad}/${r.checks.length}`);
  all.push(...r.checks);
}
const serialized = `${JSON.stringify(results, null, 2)}\n`;
if (hasSecret(serialized)) {
  console.error('✗ الناتج يحمل سرًّا: لا يُحفظ');
  process.exitCode = 1;
} else if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'browser-exec-check.json'), serialized);
}
console.log(`المجموع: ${all.filter((c) => c.ok).length}/${all.length}`);
if (all.some((c) => !c.ok)) process.exitCode = 1;

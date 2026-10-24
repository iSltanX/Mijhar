#!/usr/bin/env node
// TEST-EXEC-01 (AC-F6، الشق الإيجابي، تكامل + تدقيق شبكة) على GitHub الحقيقي: مستودع تجريبي يملكه المالك ورمز كتابة تجريبي يُدخله المالك بيده.
// متصفح Chrome مرئي بملف تعريف مؤقت يُحذف بعد التشغيل، والحزمة المشحونة نفسها (dist/chromium)، وشبكة حقيقية بلا اعتراض: يُسجَّل كل طلب إلى
// api.github.com بطريقته ومساره ومصدره وحضور ترويسة Authorization (لا قيمتها)، ولا يُطبع الرمز ولا يُكتب في أي دليل.
//   1. صفحة الإعدادات: يلصق المالك رمز الكتابة في بطاقة «صلاحية الكتابة في GitHub» ويضغط الحفظ ويسمح بصلاحية api.github.com (الشيء الوحيد بيده).
//   2. اللوحة الأصلية على المستودع: «جهّز التعديل» (قراءات GET بلا ترويسة Authorization: لا رمز قراءة محفوظ، ولا رمز كتابة فيها)، وسطر يُضاف
//      إلى الملف، والفرق كاملًا قبل أي اتصال كتابة؛ والنقر البرمجي على الموافقة و«نفّذ» لا يرسل شيئًا.
//   3. الموافقة ثم «نفّذ» بنقر الفأرة: ثلاث عمليات لا غير (POST git/refs ثم PUT contents ثم POST pulls) من الخلفية بترويسة Authorization، ورابط الطلب.
//   4. تحقق مستقل من GitHub بلا رمز: الطلب مفتوح غير مدموج، وفرعه وأساسه كما في النطاق، والملف على الفرع هو المحتوى المعاين، وطلب واحد لهذا الفرع.
// لا يُغلق الطلب ولا يُدمج ولا يُحذف الفرع: يبقى للمالك يراجعه ويغلقه بنفسه.
// الاستعمال: node tests/modules/f/execution/browser/exec-live.mjs --repo <owner/name> [--file README.md] [--out-dir evidence/T-11.8]
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { BROWSERS, ROOT, sleep, waitUntil } from '../../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const opt = (flag, fallback = null) => {
  const at = args.indexOf(flag);
  return at === -1 ? fallback : args[at + 1];
};
const slug = opt('--repo');
const file = opt('--file', 'README.md');
const outDir = opt('--out-dir') ? path.resolve(opt('--out-dir')) : null;
if (!slug || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(slug)) {
  console.error('الاستعمال: --repo owner/name');
  process.exit(2);
}
const [owner, repo] = slug.split('/');
const SECRET_RE = /github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,}/;
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const LINE = `مِجهَر TEST-EXEC-01: سطر تجريبي أُضيف بعد معاينة الفرق والموافقة على النطاق (${stamp} UTC).`;

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 600)}`}`);
};
const network = [];
const publicGet = async (p) => {
  const r = await fetch(`https://api.github.com${p}`, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-exec-live-'));
const context = await chromium.launchPersistentContext(profileDir, {
  executablePath: BROWSERS.chrome.executable,
  headless: false,
  viewport: { width: 1280, height: 900 },
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--enable-unsafe-extension-debugging'],
});
const result = { repo: slug, file, startedAt: new Date().toISOString(), checks, network };
try {
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.host !== 'api.github.com') return;
    network.push({ method: request.method(), path: url.pathname + url.search, from: request.serviceWorker() ? 'background' : 'page', authorization: Boolean(request.headers().authorization) });
  });
  context.on('response', (response) => {
    const url = new URL(response.url());
    if (url.host !== 'api.github.com') return;
    const entry = [...network].reverse().find((n) => n.path === url.pathname + url.search && n.status === undefined);
    if (entry) entry.status = response.status();
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist', 'chromium') });
  const origin = `chrome-extension://${id}`;
  result.browserVersion = context.browser().version();

  // 1. الإعدادات: الرمز بيد المالك.
  const options = await context.newPage();
  await options.goto(`${origin}/options.html`);
  await options.waitForSelector('#app[data-ready="true"]');
  await options.locator('[data-connection="github-write"]').scrollIntoViewIfNeeded();
  console.log('\n>>> في نافذة Chrome المفتوحة: الصق رمز الكتابة التجريبي في بطاقة «صلاحية الكتابة في GitHub»، واضغط «احفظ صلاحية الكتابة لهذه الجلسة»، ثم «سماح» في نافذة الصلاحية.\n');
  const saved = await waitUntil(
    () => options.evaluate(() => {
      const c = document.querySelector('[data-connection="github-write"]');
      return c?.querySelector('[data-write-state]')?.getAttribute('data-write-state') === 'session' && c.querySelector('[data-write-permission]')?.getAttribute('data-write-permission') === 'granted' ? true : null;
    }),
    15 * 60_000,
    1000,
  );
  check('1: حفظ المالك رمز الكتابة في الجلسة ومنح صلاحية api.github.com', saved, null);
  if (!saved) throw new Error('لم يُحفظ رمز الكتابة خلال المهلة');
  await sleep(1000);
  check('1: لا طلب إلى api.github.com بعد حفظ رمز الكتابة (لا تحقق بطلب قراءة)', network.length === 0, network);

  // 2. اللوحة الأصلية على المستودع.
  const github = await context.newPage();
  await github.goto(`https://github.com/${owner}/${repo}`);
  const panel = await context.newPage();
  await panel.goto(`${origin}/sidepanel.html`);
  await panel.waitForSelector('[role="tab"]');
  await panel.locator('[role="tab"]', { hasText: 'السياق' }).first().click();
  await github.bringToFront();
  await waitUntil(async () => (await panel.locator('[data-action="exec-prepare"]').count()) > 0 || null, 15000);
  await panel.locator('[data-field="path"]').fill(file);
  await panel.locator('[data-action="exec-prepare"]').click();
  await panel.waitForSelector('[data-exec-step="preview"]', { timeout: 20000 });
  const reads = network.filter((n) => n.method === 'GET');
  check('2: المعاينة بقراءات GET بلا ترويسة Authorization (لا رمز كتابة في أي قراءة)', reads.length >= 3 && reads.every((n) => !n.authorization), reads);
  const original = await panel.locator('[data-field="content"]').inputValue();
  const edited = `${original.replace(/\n*$/, '\n')}\n${LINE}\n`;
  await panel.locator('[data-field="content"]').fill(edited);
  const diff = await panel.evaluate(() => [...document.querySelectorAll('[data-diff] .diff-row')].map((r) => `${r.getAttribute('data-kind')}:${r.querySelector('.text')?.textContent}`));
  check('2: الفرق كاملًا قبل أي اتصال كتابة', diff.includes(`add:${LINE}`) && network.every((n) => n.method === 'GET'), { adds: diff.filter((d) => d.startsWith('add:')), writes: network.filter((n) => n.method !== 'GET') });
  const branch = await panel.locator('[data-field="branch"]').inputValue();
  await panel.locator('[data-field="title"]').fill('docs: Mijhar TEST-EXEC-01 (one line)');
  await panel.locator('[data-action="exec-next"]').click();
  await panel.waitForSelector('[data-exec-step="scope"]');
  const scope = await panel.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-scope] dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent ?? ''])));
  const skipped = await panel.evaluate(async () => {
    const box = document.querySelector('[data-consent="exec-scope"]');
    const run = document.querySelector('[data-consent="exec-run"]');
    box.click();
    run.disabled = false;
    run.click();
    await new Promise((r) => setTimeout(r, 1000));
    return { checked: box.checked, step: document.querySelector('[data-exec-step]')?.getAttribute('data-exec-step') };
  });
  check('2: النقر البرمجي على الموافقة و«نفّذ» لا يغيّر شيئًا ولا يرسل', skipped.checked === false && skipped.step === 'scope' && network.every((n) => n.method === 'GET'), skipped);
  if (outDir) {
    fs.mkdirSync(path.join(outDir, 'live'), { recursive: true });
    await panel.locator('.exec').screenshot({ path: path.join(outDir, 'live', 'scope.png') });
  }

  // 3. الموافقة و«نفّذ» بنقر الفأرة.
  await panel.locator('[data-consent="exec-scope"]').click();
  await panel.locator('[data-consent="exec-run"]').click();
  await panel.waitForSelector('[data-exec-step="done"]', { timeout: 60000 });
  await sleep(1500);
  const done = await panel.evaluate(() => ({ outcome: document.querySelector('[data-outcome]')?.getAttribute('data-outcome'), link: document.querySelector('[data-action="exec-open-pull"]')?.getAttribute('href') ?? null, failure: document.querySelector('[data-failure-step]')?.textContent ?? null }));
  if (outDir) await panel.locator('.exec').screenshot({ path: path.join(outDir, 'live', 'done.png') });
  const writes = network.filter((n) => n.method !== 'GET').map((n) => `${n.method} ${n.path} ${n.from} ${n.authorization ? 'auth' : 'none'} ${n.status ?? '?'}`);
  const expected = [`POST /repos/${owner}/${repo}/git/refs background auth 201`, `PUT /repos/${owner}/${repo}/contents/${file.split('/').map(encodeURIComponent).join('/')} background auth`, `POST /repos/${owner}/${repo}/pulls background auth 201`];
  check('3: ثلاث عمليات لا غير بترتيبها من الخلفية بترويسة Authorization', writes.length === 3 && writes[0] === expected[0] && writes[1].startsWith(expected[1]) && writes[2] === expected[2], writes);
  check('3: ولا طريقة غير GET وPOST وPUT، ولا دمج ولا إغلاق', network.every((n) => ['GET', 'POST', 'PUT'].includes(n.method)) && !network.some((n) => /\/merge|\/pulls\/\d+$/.test(n.path) && n.method !== 'GET'), network.map((n) => `${n.method} ${n.path}`));
  check('3: «ما حدث فعلًا» نجاح برابط الطلب', done.outcome === 'ok' && /^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+$/.test(done.link ?? ''), done);
  result.pull = done.link;

  // 4. تحقق مستقل من GitHub بلا رمز.
  const number = Number(/\/pull\/(\d+)$/.exec(done.link ?? '')?.[1]);
  const pr = await publicGet(`/repos/${owner}/${repo}/pulls/${number}`);
  check('4: الطلب مفتوح وغير مدموج، وفرعه وأساسه كما في النطاق', pr.status === 200 && pr.body.state === 'open' && pr.body.merged === false && pr.body.head?.ref === branch && pr.body.base?.ref === pr.body.base?.repo?.default_branch, pr.status === 200 ? { state: pr.body.state, merged: pr.body.merged, draft: pr.body.draft, head: pr.body.head?.ref, base: pr.body.base?.ref } : pr);
  result.pullState = pr.status === 200 ? { number, state: pr.body.state, merged: pr.body.merged, draft: pr.body.draft, head: pr.body.head?.ref, base: pr.body.base?.ref, changedFiles: pr.body.changed_files, additions: pr.body.additions, deletions: pr.body.deletions } : null;
  check('4: الطلب يغيّر ملفًا واحدًا بسطر مضاف وحده', pr.body?.changed_files === 1 && pr.body?.additions >= 1 && pr.body?.deletions === 0, result.pullState);
  const content = await publicGet(`/repos/${owner}/${repo}/contents/${file}?ref=${encodeURIComponent(branch)}`);
  const onBranch = content.status === 200 ? Buffer.from(content.body.content, 'base64').toString('utf8') : null;
  check('4: الملف على الفرع الجديد هو المحتوى المعاين نفسه', onBranch === edited, { status: content.status, same: onBranch === edited });
  const same = await publicGet(`/repos/${owner}/${repo}/pulls?state=all&head=${owner}:${encodeURIComponent(branch)}`);
  check('4: طلب واحد لهذا الفرع', same.status === 200 && Array.isArray(same.body) && same.body.length === 1, same.status);
  result.scope = scope;
  result.branch = branch;
} catch (error) {
  result.error = String(error?.stack ?? error);
  check('اكتمل التشغيل بلا خطأ', false, result.error.split('\n').slice(0, 3).join(' | '));
} finally {
  await context.close().catch(() => undefined);
  fs.rmSync(profileDir, { recursive: true, force: true });
}
result.finishedAt = new Date().toISOString();
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (SECRET_RE.test(serialized)) {
  console.error('✗ الناتج يحمل سرًّا: لا يُحفظ');
  process.exitCode = 1;
} else if (outDir) {
  fs.mkdirSync(path.join(outDir, 'live'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'live', 'exec-live.json'), serialized);
}
console.log(`المجموع: ${checks.filter((c) => c.ok).length}/${checks.length}`);
if (checks.some((c) => !c.ok)) process.exitCode = 1;

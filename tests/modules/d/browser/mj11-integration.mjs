#!/usr/bin/env node
// فحص تكامل MJ11 على الحزمة المشحونة نفسها (dist/chromium وdist/firefox من npm run build): سكربت المحتوى الحقيقي يركّب BUILTIN_MODULES،
// والخلفية الحقيقية تملك طبقة API العامة. الصفحات تُخدم على https://github.com/... محليًا وapi.github.com بردود مسجلة، فلا شبكة خارجية:
// Playwright route في عائلة Chromium، وخادم HTTPS ووكيل محليان في Firefox (نمط tests/modules/browser/integration.mjs).
//   T-5.2 (TEST-PR-03 وTEST-PR-04): PR معقدة (صندوق دمج): الموانع بأدلتها والتنبيه المنهجي ولا عبارة جاهزية، والشارة «DOM» ووقتها وتنبيه
//     القائمة المطوية؛ وPR حقيقية محفوظة لغير مسجَّل. وتدقيق الشبكة: صفر طلبات إلى api.github.com قبل المنح، ولا زر API.
//     بعد المنح (Firefox: نقر «امنح» في الإعدادات الحقيقية ونوافذ الصلاحيات الاختيارية مطفأة؛ عائلة Chromium: نسخة مشتقة من dist بصلاحية
//     ممنوحة عند التثبيت لأن نافذة الطلب لا تُقبل آليًا، evidence/T-1.4): صفر طلبات قبل النقر على «أكمل من GitHub API العامة»، ثم أربعة
//     طلبات بالضبط من الخلفية، والمصدر «DOM + API» ودليل mergeable_state.
//   T-5.3 (TEST-LOG-01 في المتصفح): صفحة مهمة حقيقية محفوظة لغير مسجَّل: البطاقة قبل حاوية السجلات، والسجل غير متاح بالحجب، ولا زر ولا
//     طلب؛ ونسخة «مسجَّل» من الصفحة: نقر «اقرأ سجل الخطوة الفاشلة» يطلب سجل الخطوة مرة واحدة بنفس الأصل فتمتلئ الطبقات الثلاث.
// الاستعمال: node tests/modules/d/browser/mj11-integration.mjs [chrome edge brave firefox] [--out-dir evidence]
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../../scripts/load-check.mjs';

process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(read, timeoutMs = 8000, stepMs = 50) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const HEAD = '22c15d5f509f0a7076b74b3f0f48a740802103b4';
const PR_URL = 'https://github.com/octo/demo/pull/4242';
const REAL_PR_URL = 'https://github.com/Watad-Project/Watad/pull/80';
const JOB_URL = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
// نسخة «مسجَّل» من صفحة المهمة نفسها (بلا رابط «Sign in to view logs») على مسار تشغيل آخر في المستودع نفسه.
const JOB_SIGNED_URL = 'https://github.com/microsoft/vscode/actions/runs/39905618451/job/120256773911';
const STEP_LOG = '/microsoft/vscode/commit/a296c13d42e2e978f361650a6f42bc33ee86f141/checks/120256773911/logs/14';
const JOB_HTML = read('fixtures/logs/gh-job-failed.html');
const PAGES = {
  '/octo/demo/pull/4242': read('tests/modules/d/fixtures/fixture-pr-complex.html'),
  '/Watad-Project/Watad/pull/80': read('fixtures/spikes/gh-pr-watad-80.html'),
  '/microsoft/vscode/actions/runs/39905618450/job/120256773911': JOB_HTML,
  '/microsoft/vscode/actions/runs/39905618451/job/120256773911': JOB_HTML.replace(/<a[^>]*href="\/login[^"]*"[^>]*>Sign in to view logs<\/a>/g, ''),
};
const STATUS_DETAILS = /^\/Watad-Project\/Watad\/commit\/[0-9a-f]{40}\/status-details$/;
const FRAGMENT = read('tests/modules/d/fixtures/fixture-status-details.html');
const LOG_TEXT = read('fixtures/logs/fixture-action-logs-with-secrets.txt');

/** ما يخدمه «github.com» المحلي. */
function serve(pathname) {
  if (PAGES[pathname]) return { status: 200, type: 'text/html; charset=utf-8', body: PAGES[pathname] };
  if (STATUS_DETAILS.test(pathname)) return { status: 200, type: 'text/html; charset=utf-8', body: FRAGMENT };
  if (pathname === STEP_LOG) return { status: 200, type: 'text/plain; charset=utf-8', body: LOG_TEXT };
  return { status: 404, type: 'text/plain', body: 'not found' };
}

// ردود api.github.com المسجلة (نفس عينة اختبار الوحدة): الطلب dirty، وفحوص بمعرّفات صفوف صندوق الدمج، وحماية الفرع.
const API = {
  '/repos/octo/demo/pulls/4242': { number: 4242, state: 'open', draft: false, merged: false, mergeable: false, mergeable_state: 'dirty', head: { sha: HEAD }, base: { ref: 'main' } },
  [`/repos/octo/demo/commits/${HEAD}/check-runs`]: {
    total_count: 3,
    check_runs: [
      { id: 9001, name: 'ci / lint (pull_request)', status: 'completed', conclusion: 'failure', output: { title: 'Lint failed' } },
      { id: 9004, name: 'ci / build (pull_request)', status: 'in_progress', conclusion: null },
      { id: 9010, name: 'copilot-pull-request-reviewer', status: 'completed', conclusion: 'neutral' },
    ],
  },
  [`/repos/octo/demo/commits/${HEAD}/status`]: { state: 'success', total_count: 1, statuses: [{ context: 'EasyCLA', state: 'success', description: 'All signed' }] },
  '/repos/octo/demo/branches/main': { name: 'main', protected: true, protection: { required_status_checks: { contexts: ['ci / lint (pull_request)', 'ci / build (pull_request)', 'EasyCLA'] } } },
};
let apiRemaining = 60;
function serveApi(pathname) {
  apiRemaining -= 1;
  const headers = { 'content-type': 'application/json; charset=utf-8', 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': String(apiRemaining), 'x-ratelimit-used': String(60 - apiRemaining), 'x-ratelimit-reset': '1792737281', 'x-ratelimit-resource': 'core' };
  const body = API[pathname];
  return body ? { status: 200, headers, body: JSON.stringify(body) } : { status: 404, headers, body: JSON.stringify({ message: 'Not Found' }) };
}

// ---------- مجسّات في عالم الصفحة ----------

function prProbe() {
  const root = document.querySelector('mijhar-host[data-mijhar-host="d.pr-status"]')?.shadowRoot;
  const t = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return {
    card: Boolean(root?.querySelector('[data-card="pr-status"]')),
    source: root?.querySelector('.d-freshness')?.getAttribute('data-source') ?? null,
    times: [...(root?.querySelectorAll('.d-badge time') ?? [])].map((x) => x.getAttribute('datetime')),
    alerts: [...(root?.querySelectorAll('[data-alert]') ?? [])].map((x) => x.getAttribute('data-alert')),
    collapsed: t(root?.querySelector('[data-alert="collapsed"]')),
    blockers: [...(root?.querySelectorAll('[data-blocker]') ?? [])].map((li) => ({ id: li.getAttribute('data-blocker'), certainty: li.getAttribute('data-certainty'), evidence: [...li.querySelectorAll('[data-evidence-source]')].map((e) => `${e.getAttribute('data-evidence-source')}: ${t(e.querySelector('.d-quote'))}`) })),
    notice: t(root?.querySelector('[data-notice="method"]')),
    apiState: root?.querySelector('[data-api-state]')?.getAttribute('data-api-state') ?? null,
    apiButton: Boolean(root?.querySelector('[data-action="api-read"]')),
    checksSource: root?.querySelector('[data-checks-source]')?.getAttribute('data-checks-source') ?? null,
    text: t(root),
  };
}
function clickIn(args) {
  const [host, selector] = args;
  const el = document.querySelector(`mijhar-host[data-mijhar-host="${host}"]`)?.shadowRoot?.querySelector(selector);
  el?.click();
  return Boolean(el);
}
function logProbe() {
  const host = document.querySelector('mijhar-host[data-mijhar-host="d.log"]');
  const root = host?.shadowRoot;
  const t = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return {
    card: Boolean(root?.querySelector('[data-card="log-analysis"]')),
    beforeLogs: host?.nextElementSibling?.id ?? null,
    state: root?.querySelector('[data-log-state]')?.getAttribute('data-log-state') ?? null,
    stateText: t(root?.querySelector('[data-log-state]')),
    source: root?.querySelector('[data-log-source]')?.getAttribute('data-log-source') ?? null,
    layers: [...(root?.querySelectorAll('[data-layer]') ?? [])].map((x) => x.getAttribute('data-layer')),
    literal: t(root?.querySelector('[data-layer="literal"]')),
    patterns: [...(root?.querySelectorAll('[data-layer="root-cause"] [data-pattern]') ?? [])].map((x) => x.getAttribute('data-pattern')),
    noRootCause: t(root?.querySelector('[data-no-root-cause]')),
    possibilities: root?.querySelectorAll('[data-layer="possibility"] li').length ?? 0,
    possibilityTags: [...(root?.querySelectorAll('[data-layer="possibility"] [data-tag="possibility"]') ?? [])].length,
    readButton: Boolean(root?.querySelector('[data-action="read-step-log"]')),
    exitCode: t(root?.querySelector('[data-field="exit-code"] dd')),
    layerBorders: [...(root?.querySelectorAll('[data-layer]') ?? [])].map((x) => getComputedStyle(x).borderTopStyle),
  };
}

const READY = /جاهز للدمج|جاهزة للدمج|ready to merge/i;
const METHOD = 'نجاح الفحوص الآلية يقتصر على ما تغطيه اختبارات CI، ولا يعني جاهزية المشروع أو الإصدار دون مراجعة بشرية.';

// ---------- السيناريو المشترك ----------
// d: open(name, url) · page(name, fn, arg) · clickOptions(selector) · apiRequests() · githubPaths() · shot(name, host, file)

async function scenarioBeforeGrant(d, steps, check) {
  // 1. PR المعقدة: الموانع والشارة، ولا API.
  await d.open('pr', PR_URL);
  steps.pr = await waitUntil(async () => {
    const s = await d.page('pr', prProbe);
    return s.card && s.apiState ? s : null;
  }, 10000, 100);
  const ids = (steps.pr?.blockers ?? []).map((b) => b.id).sort();
  check('TEST-PR-03 · PR المعقدة: الموانع الأربعة «يمنع» والتأخر «قد يمنع»، كلها بأدلة من الصفحة', ids.join() === 'behind,conflicts,required-failed,required-pending,review-required' && steps.pr.blockers.every((b) => b.evidence.length > 0 && b.evidence.every((e) => e.startsWith('dom: '))), steps.pr?.blockers);
  check('TEST-PR-03 · التنبيه المنهجي ظاهر ولا عبارة جاهزية', steps.pr?.notice === METHOD && !READY.test(steps.pr?.text ?? ''), { notice: steps.pr?.notice });
  check('TEST-PR-04 · الشارة: المصدر DOM ووقت آخر قراءة، وتنبيه القائمة المطوية (9 من 12)', steps.pr?.source === 'DOM' && steps.pr.times.length === 1 && steps.pr.collapsed.includes('قُرئ 9 من 12'), { source: steps.pr?.source, times: steps.pr?.times, collapsed: steps.pr?.collapsed });
  check('تدقيق الشبكة · قبل المنح: لا زر API ويُعرض «افتح الإعدادات»', steps.pr?.apiState === 'not-granted' && !steps.pr.apiButton, steps.pr?.apiState);
  if (d.shot) await d.shot('pr', 'd.pr-status', 'pr-complex-blockers');

  // 2. PR الحقيقية لغير مسجَّل.
  await d.open('real', REAL_PR_URL);
  steps.real = await waitUntil(async () => {
    const s = await d.page('real', prProbe);
    return s.card && s.text.includes('ناجح') ? s : null;
  }, 12000, 150);
  check('TEST-PR-03 · PR الحقيقية: طلب التغييرات من الشريط الجانبي «قد يمنع» بدليله، والفحوص الفاشلة بلا معرفة الإلزام «قد يمنع»', JSON.stringify(steps.real?.blockers?.map((b) => [b.id, b.certainty])) === JSON.stringify([['changes-requested', 'may-block'], ['failing-unknown-required', 'may-block']]) && steps.real.blockers[0].evidence[0] === 'dom: Om4rMu requested changes', steps.real?.blockers);
  check('TEST-PR-03 · PR الحقيقية: التنبيه المنهجي وإعلان غياب صندوق الدمج، ولا عبارة جاهزية', steps.real?.notice === METHOD && steps.real.text.includes('صندوق الدمج لا يعرضه GitHub لغير المسجَّل') && !READY.test(steps.real.text), null);
  if (d.shot) await d.shot('real', 'd.pr-status', 'pr-real-blockers');

  // 3. صفحة المهمة لغير مسجَّل.
  await d.open('job', JOB_URL);
  steps.job = await waitUntil(async () => ((await d.page('job', logProbe)).card ? d.page('job', logProbe) : null), 10000, 100);
  check('TEST-LOG-01 · صفحة مهمة حقيقية لغير مسجَّل: البطاقة قبل #logs بثلاث طبقات، والسجل «غير متاح» بالحجب، والتنبيه حرفيًا، وعبارة غياب السبب، ولا زر', steps.job?.beforeLogs === 'logs' && steps.job.layers.join() === 'literal,root-cause,possibility' && steps.job.state === 'unavailable' && steps.job.stateText.includes('Sign in to view logs') && steps.job.literal.includes('Process completed with exit code 1.') && steps.job.noRootCause === 'لا يوجد سبب جذري مثبت من نص السجل وحده' && !steps.job.readButton && steps.job.exitCode === '1', steps.job);
  check('TEST-LOG-01 · الطبقات مفصولة بصريًا: حدّ صلب ومزدوج ومتقطع', JSON.stringify(steps.job?.layerBorders) === JSON.stringify(['solid', 'solid', 'dashed']), steps.job?.layerBorders);
  if (d.shot) await d.shot('job', 'd.log', 'job-signed-out');

  // 4. صفحة المهمة «مسجَّل»: النقر يقرأ سجل الخطوة.
  await d.open('jobSigned', JOB_SIGNED_URL);
  steps.jobSigned = await waitUntil(async () => ((await d.page('jobSigned', logProbe)).readButton ? d.page('jobSigned', logProbe) : null), 10000, 100);
  steps.logRequestsBefore = d.githubPaths().filter((p) => p === STEP_LOG).length;
  check('TEST-LOG-01 · «مسجَّل»: زر القراءة ظاهر، ولا طلب للسجل قبل النقر', steps.jobSigned?.readButton && steps.logRequestsBefore === 0, { button: steps.jobSigned?.readButton, requests: steps.logRequestsBefore });
  await d.click('jobSigned', 'd.log', '[data-action="read-step-log"]');
  steps.jobRead = await waitUntil(async () => {
    const s = await d.page('jobSigned', logProbe);
    return s.source === 'step-log' ? s : null;
  }, 10000, 100);
  check('TEST-LOG-01 · بعد النقر: طلب واحد لسجل الخطوة بنفس الأصل، والطبقة الثانية من نمط TypeScript (3)، والاحتمالات موسومة، وكود الخروج 2', d.githubPaths().filter((p) => p === STEP_LOG).length === 1 && steps.jobRead?.patterns.join() === 'typescript-error,typescript-error,typescript-error' && steps.jobRead.possibilities > 0 && steps.jobRead.possibilityTags === steps.jobRead.possibilities && steps.jobRead.exitCode === '2' && steps.jobRead.state === null, steps.jobRead);
  if (d.shot) await d.shot('jobSigned', 'd.log', 'job-step-log-read');
  steps.apiBeforeGrant = d.apiRequests().length;
  check('تدقيق الشبكة · صفر طلبات إلى api.github.com قبل المنح (كل الصفحات أعلاه)', steps.apiBeforeGrant === 0, d.apiRequests());
}

async function scenarioAfterGrant(d, steps, check) {
  await d.open('prGranted', PR_URL);
  steps.granted = await waitUntil(async () => {
    const s = await d.page('prGranted', prProbe);
    return s.apiButton ? s : null;
  }, 10000, 100);
  await sleep(500);
  steps.apiBeforeClick = d.apiRequests().length;
  check('تدقيق الشبكة · بعد المنح: زر «أكمل من GitHub API العامة» ظاهر، ولا طلب قبل النقر', steps.granted?.apiButton && steps.apiBeforeClick === 0, { button: steps.granted?.apiButton, requests: d.apiRequests() });
  await d.click('prGranted', 'd.pr-status', '[data-action="api-read"]');
  steps.afterApi = await waitUntil(async () => {
    const s = await d.page('prGranted', prProbe);
    return s.source === 'DOM + API' ? s : null;
  }, 10000, 100);
  const paths = d.apiRequests().map((u) => new URL(u, 'https://api.github.com').pathname).sort();
  steps.apiPaths = paths;
  check('تدقيق الشبكة · النقر يطلب أربعة مسارات عامة بالضبط من الخلفية', JSON.stringify(paths) === JSON.stringify(['/repos/octo/demo/branches/main', `/repos/octo/demo/commits/${HEAD}/check-runs`, `/repos/octo/demo/commits/${HEAD}/status`, '/repos/octo/demo/pulls/4242'].sort()), d.apiRequestsDetail?.() ?? d.apiRequests());
  const conflicts = steps.afterApi?.blockers?.find((b) => b.id === 'conflicts');
  check('TEST-PR-04 · بعد API: المصدر «DOM + API» بوقتين، والصفوف من API، وmergeable_state = dirty دليل ثانٍ للتعارض', steps.afterApi?.times.length === 2 && steps.afterApi.checksSource === 'api' && conflicts?.evidence.includes('api: mergeable_state = dirty'), { times: steps.afterApi?.times, conflicts });
  check('TEST-PR-03 · بعد API: التنبيه المنهجي ولا عبارة جاهزية، وneutral لا يُعدّ مانعًا', steps.afterApi?.notice === METHOD && !READY.test(steps.afterApi.text) && !JSON.stringify(steps.afterApi.blockers).includes('copilot'), null);
  if (d.shot) await d.shot('prGranted', 'd.pr-status', 'pr-complex-dom-api');
}

// ---------- عائلة Chromium ----------

/** نسخة من dist/chromium بصلاحية api.github.com ممنوحة عند التثبيت (host_permissions)، لقياس ما بعد المنح آليًا. */
function grantedCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj11-granted-'));
  fs.cpSync(path.join(ROOT, 'dist/chromium'), dir, { recursive: true });
  const manifestFile = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.host_permissions = [...(manifest.host_permissions ?? []), 'https://api.github.com/*'];
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  return dir;
}

async function chromiumContext(key, extensionDir, network, result) {
  const { executable } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj11-'));
  const context = await chromium.launchPersistentContext(profileDir, { executablePath: executable, headless: true, viewport: { width: 1280, height: 900 }, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
  context.on('request', (request) => {
    const url = new URL(request.url());
    if (url.host === 'api.github.com') network.api.push({ url: request.url(), from: request.serviceWorker() ? 'service-worker' : request.frame()?.url()?.split(':')[0] ?? 'other' });
    else if (url.host === 'github.com') network.github.push(url.pathname);
  });
  await context.route('https://github.com/**', (route) => {
    const r = serve(new URL(route.request().url()).pathname);
    return route.fulfill({ status: r.status, contentType: r.type, body: r.body });
  });
  await context.route('https://api.github.com/**', (route) => {
    const r = serveApi(new URL(route.request().url()).pathname);
    return route.fulfill({ status: r.status, headers: r.headers, body: r.body });
  });
  await context.route((url) => url.protocol === 'https:' && !['github.com', 'api.github.com'].includes(url.host), (route) => {
    network.blocked.add(new URL(route.request().url()).host);
    return route.abort();
  });
  const browser = context.browser();
  result.browserVersion = browser.version();
  const cdp = await browser.newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: extensionDir });
  return { context, profileDir, id };
}

async function chromiumRun(key) {
  const { label } = BROWSERS[key];
  const result = { label, steps: {}, checks: [], console: [] };
  const network = { api: [], github: [], blocked: new Set() };
  const check = (name, ok, detail) => {
    result.checks.push({ browser: label, name, ok: Boolean(ok), detail });
    if (!ok) console.error(`  ✗ ${label} · ${name}: ${JSON.stringify(detail)}`);
  };
  const screensDir = outDir ? path.join(outDir, 'MJ11-screens') : null;
  if (screensDir) fs.mkdirSync(screensDir, { recursive: true });
  const driver = (context) => {
    const pages = {};
    const watch = (page, name) => page.on('console', (m) => (m.text().includes('[mijhar]') || m.location().url.startsWith('chrome-extension://')) && result.console.push(`${name}: ${m.type()}: ${m.text()}`));
    return {
      async open(name, url) {
        if (!pages[name]) {
          pages[name] = await context.newPage();
          watch(pages[name], name);
        }
        await pages[name].goto(url);
        await pages[name].bringToFront();
      },
      page: (name, fn, arg) => pages[name].evaluate(fn, arg),
      // نقر فعلي (حدث إدخال موثوق) على عنصر داخل جذر الظل.
      async click(name, host, selector) {
        await pages[name].bringToFront();
        await pages[name].locator(`mijhar-host[data-mijhar-host="${host}"]`).locator(selector).click();
      },
      apiRequests: () => network.api.map((r) => r.url),
      apiRequestsDetail: () => network.api,
      githubPaths: () => network.github,
      async shot(name, host, file) {
        if (screensDir) await pages[name].locator(`mijhar-host[data-mijhar-host="${host}"]`).screenshot({ path: path.join(screensDir, `${key}-${file}.png`) });
      },
    };
  };
  let first;
  let second;
  let grantedDir;
  try {
    first = await chromiumContext(key, path.join(ROOT, 'dist/chromium'), network, result);
    await scenarioBeforeGrant(driver(first.context), result.steps, check);
    const devtools = await first.context.newPage();
    await devtools.goto('chrome://extensions');
    const info = await devtools.evaluate((extId) => chrome.developerPrivate.getExtensionInfo(extId), first.id);
    result.extensionErrors = { runtime: (info.runtimeErrors ?? []).map((e) => e.message), manifest: (info.manifestErrors ?? []).map((e) => e.message) };
    await first.context.close();
    // بعد المنح: نسخة مشتقة بصلاحية ممنوحة عند التثبيت.
    network.api.length = 0;
    grantedDir = grantedCopy();
    second = await chromiumContext(key, grantedDir, network, result);
    result.steps.grantMethod = 'نسخة مشتقة من dist/chromium بإضافة https://api.github.com/* إلى host_permissions (نافذة طلب الصلاحية في عائلة Chromium لا تُقبل آليًا، evidence/T-1.4)';
    await scenarioAfterGrant(driver(second.context), result.steps, check);
    result.steps.apiRequestContexts = [...new Set(network.api.map((r) => r.from))];
    check('تدقيق الشبكة · كل طلبات api.github.com من service worker الخلفية لا من الصفحة', result.steps.apiRequestContexts.length === 1 && result.steps.apiRequestContexts[0] === 'service-worker', network.api);
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = { apiAfterGrant: network.api, stepLogRequests: network.github.filter((p) => p === STEP_LOG).length, blockedExternalHosts: [...network.blocked].sort() };
    for (const c of [first, second]) {
      if (!c) continue;
      await c.context.close().catch(() => {});
      fs.rmSync(c.profileDir, { recursive: true, force: true });
    }
    if (grantedDir) fs.rmSync(grantedDir, { recursive: true, force: true });
  }
  return result;
}

// ---------- Firefox: Marionette خلف خادم HTTPS ووكيل محليين ----------

const SERVED = new Set(['github.com', 'api.github.com']);

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
      if (error) throw new Error(`${name}: ${error.error ?? ''} ${error.message ?? ''}`.trim());
      return result;
    },
  };
}

function makeCertificates(workDir) {
  const file = (name) => path.join(workDir, name);
  const openssl = (...a) => execFileSync('openssl', a, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-mj11-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('key.pem'), '-out', file('leaf.csr'), '-subj', '/CN=github.com');
  fs.writeFileSync(file('leaf.ext'), 'subjectAltName=DNS:github.com,DNS:api.github.com\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  openssl('x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-out', file('cert.pem'), '-days', '1', '-extfile', file('leaf.ext'));
  const caDer = fs.readFileSync(file('ca.pem'), 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return { key: fs.readFileSync(file('key.pem')), cert: fs.readFileSync(file('cert.pem')), caDer };
}

async function startServers(workDir) {
  const { key, cert, caDer } = makeCertificates(workDir);
  const log = { requests: [], refused: [] };
  const site = https.createServer({ key, cert }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const url = new URL(req.url, `https://${host}`);
    log.requests.push({ host, path: url.pathname, search: url.search, authorization: Boolean(req.headers.authorization), cookie: Boolean(req.headers.cookie) });
    if (host === 'api.github.com') {
      const r = serveApi(url.pathname);
      res.writeHead(r.status, r.headers);
      res.end(r.body);
      return;
    }
    const r = serve(url.pathname);
    res.writeHead(r.status, { 'content-type': r.type });
    res.end(r.body);
  });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const sitePort = site.address().port;
  const proxy = http.createServer((req, res) => {
    log.refused.push(`http ${req.url}`);
    res.writeHead(403);
    res.end();
  });
  proxy.on('connect', (req, client, head) => {
    const host = req.url.split(':')[0];
    if (!SERVED.has(host)) {
      log.refused.push(host);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = net.connect(sitePort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  return { log, caDer, proxyPort: proxy.address().port, close: () => Promise.all([new Promise((r) => site.close(r)), new Promise((r) => proxy.close(r))]) };
}

const firefoxPrefs = (proxyPort) =>
  [
    ['marionette.port', 0],
    ['network.proxy.type', 1],
    ['network.proxy.http', '127.0.0.1'],
    ['network.proxy.http_port', proxyPort],
    ['network.proxy.ssl', '127.0.0.1'],
    ['network.proxy.ssl_port', proxyPort],
    ['network.proxy.no_proxies_on', ''],
    ['network.proxy.allow_hijacking_localhost', true],
    ['network.stricttransportsecurity.preloadlist', false],
    ['network.dns.disablePrefetch', true],
    // منح الصلاحية الاختيارية بنقر «امنح» دون نافذة (الطلب نفسه لا يزال يشترط فعل مستخدم).
    ['extensions.webextOptionalPermissionPrompts', false],
    ['browser.shell.checkDefaultBrowser', false],
    ['datareporting.policy.dataSubmissionEnabled', false],
    ['toolkit.telemetry.reportingpolicy.firstRun', false],
  ]
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join('\n');

async function firefoxRun() {
  const { executable } = BROWSERS.firefox;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj11-ff-'));
  const profileDir = path.join(workDir, 'profile');
  fs.mkdirSync(profileDir);
  const servers = await startServers(workDir);
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${firefoxPrefs(servers.proxyPort)}\n`);
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const result = { label: 'Firefox', steps: {}, checks: [], console: [] };
  const check = (name, ok, detail) => {
    result.checks.push({ browser: 'Firefox', name, ok: Boolean(ok), detail });
    if (!ok) console.error(`  ✗ Firefox · ${name}: ${JSON.stringify(detail)}`);
  };
  let socket;
  try {
    const portFile = path.join(profileDir, 'MarionetteActivePort');
    const port = await waitUntil(() => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8')), 20000, 100);
    if (!port) throw new Error('لم يفتح Firefox منفذ Marionette');
    socket = net.connect(port, '127.0.0.1');
    const c = marionette(socket);
    await c.handshake();
    const { capabilities } = await c.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
    result.browserVersion = capabilities.browserVersion;
    const { value: id } = await c.send('Addon:Install', { path: path.join(ROOT, 'dist/firefox'), temporary: true });
    let context = 'content';
    const setContext = async (value) => {
      if (context === value) return;
      await c.send('Marionette:SetContext', { value });
      context = value;
    };
    const chromeScript = async (script, a = []) => {
      await setContext('chrome');
      return (await c.send('WebDriver:ExecuteScript', { script, args: a })).value;
    };
    await chromeScript(`Cc['@mozilla.org/security/x509certdb;1'].getService(Ci.nsIX509CertDB).addCertFromBase64(arguments[0], 'C,,'); return true;`, [servers.caDer]);
    const runIn = async (fn, ...a) => {
      await setContext('content');
      return (await c.send('WebDriver:ExecuteScript', { script: `return (${fn})(...arguments)`, args: a })).value;
    };
    const host = await chromeScript('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [id]);
    const origin = `moz-extension://${host}`;
    const handles = {};
    const switchTo = async (name) => {
      await setContext('content');
      await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
    };
    const openTab = async (name, url) => {
      await setContext('content');
      if (handles[name]) await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
      else {
        const { handle } = await c.send('WebDriver:NewWindow', { type: 'tab' });
        handles[name] = handle;
        await c.send('WebDriver:SwitchToWindow', { handle });
      }
      await c.send('WebDriver:Navigate', { url });
    };
    const elementClick = async (el) => c.send('WebDriver:ElementClick', { id: el['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(el)[0] });
    const d = {
      open: openTab,
      async page(name, fn, arg) {
        await switchTo(name);
        return arg === undefined ? runIn(fn) : runIn(fn, arg);
      },
      // نقر فعلي عبر WebDriver على عنصر داخل جذر الظل.
      async click(name, hostId, selector) {
        await switchTo(name);
        const { value: hostEl } = await c.send('WebDriver:FindElement', { using: 'css selector', value: `mijhar-host[data-mijhar-host="${hostId}"]` });
        const { value: shadow } = await c.send('WebDriver:GetShadowRoot', { id: hostEl['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(hostEl)[0] });
        const { value: el } = await c.send('WebDriver:FindElementFromShadowRoot', { shadowRoot: shadow['shadow-6066-11e4-a52e-4f735466cecf'] ?? Object.values(shadow)[0], using: 'css selector', value: selector });
        await elementClick(el);
      },
      apiRequests: () => servers.log.requests.filter((r) => r.host === 'api.github.com').map((r) => `${r.path}${r.search}`),
      apiRequestsDetail: () => servers.log.requests.filter((r) => r.host === 'api.github.com'),
      githubPaths: () => servers.log.requests.filter((r) => r.host === 'github.com').map((r) => r.path),
    };
    await scenarioBeforeGrant(d, result.steps, check);
    // المنح: نقر «امنح» في صفحة الإعدادات الحقيقية.
    await openTab('options', `${origin}/options.html`);
    await waitUntil(async () => (await runIn(() => document.querySelector('#app')?.getAttribute('data-ready'))) === 'true', 8000, 100);
    const permissionState = () => runIn(() => document.querySelector('[data-permission-state]')?.getAttribute('data-permission-state') ?? null);
    result.steps.stateBeforeGrant = await waitUntil(async () => {
      const state = await permissionState();
      return state && state !== 'checking' ? state : null;
    }, 6000, 100);
    const { value: grant } = await c.send('WebDriver:FindElement', { using: 'css selector', value: '[data-action="grant"]' });
    await elementClick(grant);
    result.steps.grantMethod = 'نقر «امنح» في صفحة الإعدادات الحقيقية (extensions.webextOptionalPermissionPrompts = false)';
    result.steps.grantedState = await waitUntil(async () => {
      const state = await permissionState();
      return state === 'granted' ? state : null;
    }, 6000, 100);
    check('المنح في Firefox بنقر «امنح» نجح', result.steps.grantedState === 'granted', result.steps.grantedState);
    await scenarioAfterGrant(d, result.steps, check);
    const apiLog = servers.log.requests.filter((r) => r.host === 'api.github.com');
    check('تدقيق الشبكة · طلبات api.github.com بلا Authorization ولا ملفات تعريف', apiLog.length > 0 && apiLog.every((r) => !r.authorization && !r.cookie), apiLog);
    result.console = await chromeScript(`return Services.console.getMessageArray().map((m) => m.message ?? (m.errorMessage ? m.errorMessage + ' @ ' + m.sourceName : String(m))).filter((t) => /mijhar|moz-extension/i.test(t));`);
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = {
      api: servers.log.requests.filter((r) => r.host === 'api.github.com'),
      stepLogRequests: servers.log.requests.filter((r) => r.host === 'github.com' && r.path === STEP_LOG).length,
      blockedExternalHosts: [...new Set(servers.log.refused)].sort(),
    };
    socket?.destroy();
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(10000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited;
    await servers.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  return result;
}

const keys = args.filter((a) => BROWSERS[a]);
const results = {};
const allChecks = [];
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox']) {
  apiRemaining = 60;
  results[key] = key === 'firefox' ? await firefoxRun() : await chromiumRun(key);
  const r = results[key];
  const add = (name, ok, detail) => {
    r.checks.push({ browser: r.label, name, ok: Boolean(ok), detail });
    if (!ok) console.error(`  ✗ ${r.label} · ${name}: ${JSON.stringify(detail)}`);
  };
  add('اكتمل التشغيل بلا خطأ', !r.error, r.error?.split('\n')[0]);
  if (r.extensionErrors) add('لا أخطاء تشغيل ولا مانيفست للإضافة', r.extensionErrors.runtime.length === 0 && r.extensionErrors.manifest.length === 0, r.extensionErrors);
  allChecks.push(...r.checks);
  const bad = r.checks.filter((x) => !x.ok).length;
  console.log(`${r.label} ${r.browserVersion ?? ''}: ${r.checks.length - bad}/${r.checks.length} فحصًا · رسائل كونسول الإضافة ${r.console?.length ?? 0}${r.error ? ` · خطأ: ${r.error.split('\n')[0]}` : ''}`);
}
console.log(`المجموع: ${allChecks.filter((x) => x.ok).length}/${allChecks.length} فحصًا اجتاز`);
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'MJ11-integration.json'), `${JSON.stringify(results, null, 2)}\n`);
}
if (allChecks.some((x) => !x.ok)) process.exitCode = 1;

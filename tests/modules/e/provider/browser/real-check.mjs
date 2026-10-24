#!/usr/bin/env node
// TEST-AI-09 (AC-E11 (٥) وAC-E12 (٥)): الاتصال **الحقيقي** بمزوّد تحليل بمفتاح تجريبي يوفّره المالك، من **خلفية الإضافة نفسها** في Chrome على الحزمة
// المشحونة (dist/chromium)، بالواجهة المنفَّذة في الموجة L (DEC-13 ن-5). الطلب إلى المزوّد يمضي من المتصفح إلى مضيفه الحقيقي مباشرة (route.continue: لا رد
// وهمي ولا وكيل Node)؛ وصفحة GitHub عينة عامة محفوظة (مهمة Actions فاشلة في microsoft/vscode، fixtures/logs/gh-job-failed.html)، وapi.github.com وهمي.
// والفرق الوحيد عن الحزمة: صلاحية مضيف المزوّد ممنوحة في نسخة مشتقة من المانيفست، لأن نافذة الإذن لا تُقبل آليًا (تقيسها فحوص النافذة الأصلية).
//   1. حفظ المفتاح بالواجهة ← التحقق المعلن (قائمة النماذج) من الخلفية.
//   2. زر + بنقرة فعلية: قائمة المزوّد الحقيقية للمساعدة، ثم تُغلق.
//   3. كتابة معرّف النموذج يدويًا في الحقل (MODEL) ← «اختبر النموذج» بنقرة فعلية (نص «ping» وحده).
//   4. تحليل واحد على العينة العامة بعد موافقة بنقرة فعلية ← الرد يُفسَّر ويُعرض بأدلته.
// المفتاح يُقرأ من ملف خارج المستودع ولا يُطبع ولا يُكتب في أي ناتج (يُفحص آليًا قبل الحفظ)، ولا يُحفظ نص الطلب ولا الرد.
// الاستعمال: KEY_FILE=<ملف المفتاح> MODEL=<معرّف النموذج> node tests/modules/e/provider/browser/real-check.mjs openai|gemini [--out-dir <مجلد>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, chromiumSession, sleep, waitUntil } from '../../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const PROVIDERS = { openai: { host: 'api.openai.com', title: 'OpenAI' }, gemini: { host: 'generativelanguage.googleapis.com', title: 'Google Gemini' } };
const provider = args[0];
const target = PROVIDERS[provider];
const keyFile = process.env.KEY_FILE;
const MODEL = process.env.MODEL ?? '';
if (!target || !keyFile || !fs.existsSync(keyFile) || !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/.test(MODEL)) {
  console.error('لم يُجرَ: الاستعمال KEY_FILE=<ملف> MODEL=<معرّف> node real-check.mjs openai|gemini');
  process.exit(2);
}
const KEY = fs.readFileSync(keyFile, 'utf8').trim();
const redact = (value) => JSON.parse(JSON.stringify(value ?? null).split(KEY).join('«مفتاح محجوب»'));
const HEADER_NAMES = (headers) => Object.keys(headers).filter((h) => ['authorization', 'x-goog-api-key', 'x-api-key', 'content-type'].includes(h.toLowerCase())).sort();

const JOB_URL = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
const JOB_PAGE = fs.readFileSync(path.join(ROOT, 'fixtures/logs/gh-job-failed.html'), 'utf8');
const githubReply = (pathname) => (pathname === new URL(JOB_URL).pathname ? { status: 200, type: 'text/html; charset=utf-8', body: JOB_PAGE } : { status: 404, type: 'text/plain', body: 'not found' });
const apiReply = () => ({ status: 404, body: { message: 'Not Found' } });
const LOG = 'mijhar-host[data-mijhar-host="d.log"]';
const IN_LOG = (sel) => `document.querySelector('${LOG}')?.shadowRoot?.querySelector('${sel}')`;
const READ = `
  const c = document.querySelector('[data-provider-card]');
  if (!c) return null;
  return {
    provider: c.getAttribute('data-provider-card'),
    health: c.querySelector('[data-provider-key]')?.getAttribute('data-health') ?? null,
    key: c.querySelector('[data-key-state]')?.getAttribute('data-key-state') ?? null,
    field: c.querySelector('[data-model-input]')?.value ?? null,
    list: c.querySelector('[data-model-list]')?.getAttribute('data-model-list') ?? null,
    listed: [...c.querySelectorAll('[role="listbox"] [role="option"]')].map((o) => o.getAttribute('data-model')),
    listText: c.querySelector('[data-model-list]')?.textContent ?? '',
    test: c.querySelector('[data-model-test]')?.getAttribute('data-model-test') ?? null,
    testText: c.querySelector('[data-model-test]')?.textContent ?? '',
    message: c.querySelector('[data-key-message]')?.textContent ?? '',
  };
`;

function derived() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-real-${provider}-`));
  fs.cpSync(path.join(ROOT, 'dist/chromium'), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.github.com/*', `https://${target.host}/*`])];
  delete manifest.optional_host_permissions;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return dir;
}

const result = { test: 'TEST-AI-09', provider: target.title, host: target.host, mode: 'اتصال حقيقي من خلفية الإضافة في المتصفح إلى المضيف الحقيقي مباشرة (لا وكيل ولا رد وهمي)', measuredAt: new Date().toISOString(), model: MODEL, steps: {} };
const extDir = derived();
let session;
try {
  session = await chromiumSession('chrome', { extDir, githubReply, apiReply, extra: { [target.host]: () => 'continue' } });
  result.browser = `Chrome ${session.browserVersion}`;
  const { d, network } = session;
  const card = () => d.options(READ);
  const until = (want, ms = 45000) => waitUntil(async () => {
    const c = await card();
    return c && want(c) ? c : null;
  }, ms);
  const provReqs = () => network.extra.filter((r) => r.host === target.host);
  const shape = (r) => ({ method: r.method, path: r.path.split('?')[0], query: r.path.includes('?') ? r.path.slice(r.path.indexOf('?')) : '', from: r.from, status: r.status ?? null, headers: HEADER_NAMES(r.headers), keyInHeaderOnly: !r.path.includes(KEY) && !(r.body ?? '').includes(KEY), ping: r.method === 'POST' && /"ping"/.test(r.body ?? '') });

  await until((c) => c.health !== 'checking', 15000);
  await d.options(`const s = document.querySelector('#mj-provider-select'); s.value = ${JSON.stringify(provider)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  await until((c) => c.provider === provider && c.key === 'none', 15000);

  // 1. الحفظ والتحقق.
  await d.fill('#mj-key-input', KEY);
  await d.click('[data-action="key-save"]');
  const verified = await until((c) => c.provider === provider && c.health !== 'checking' && c.key === 'session' && (c.health === 'healthy' || c.message.includes('لم يُتحقق')));
  await sleep(500);
  result.steps.verify = { health: verified?.health ?? null, message: verified?.message ?? null, requests: provReqs().map(shape) };

  if (verified?.health === 'healthy') {
    // 2. زر + بنقرة فعلية.
    const before = provReqs().length;
    await d.click('[data-provider-card] [data-action="model-list"]');
    const listed = await until((c) => c.list === 'list' || c.list === 'empty' || c.list === 'failed', 20000);
    result.steps.list = { state: listed?.list ?? null, count: listed?.listed.length ?? 0, modelInList: Boolean(listed?.listed.includes(MODEL)), newRequests: provReqs().length - before };
    await d.click('[data-provider-card] [data-action="model-list"]');

    // 3. كتابة المعرّف يدويًا ثم «اختبر النموذج».
    await d.options(`const f = document.querySelector('[data-model-input]'); f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
    await d.fill('[data-provider-card] [data-model-input]', MODEL);
    await d.click('#mj-conn-provider-key-title');
    const typed = await until((c) => c.field === MODEL, 10000);
    const beforeTest = provReqs().length;
    await d.click('[data-provider-card] [data-action="model-test"]');
    const tested = await until((c) => c.field === MODEL && ['accepted', 'rejected', 'inconclusive', 'unsent'].includes(c.test ?? ''), 60000);
    await sleep(500);
    result.steps.test = { typed: Boolean(typed), verdict: tested?.test ?? null, text: tested?.testText ?? null, requests: provReqs().slice(beforeTest).map(shape) };

    // 4. تحليل واحد على العينة العامة بعد موافقة بنقرة فعلية.
    const beforeAnalysis = provReqs().length;
    await d.openGithub(JOB_URL);
    await waitUntil(() => d.github(`return Boolean(${IN_LOG('[data-action="analysis-open"]')}) || null;`), 20000);
    await d.clickShadow(LOG, '[data-action="analysis-open"]');
    const consent = await waitUntil(() => d.github(`const c = ${IN_LOG('[data-consent]')}; return c ? { lead: c.querySelector('[data-consent-lead]')?.textContent ?? '', destination: c.querySelector('[data-consent-row="destination"]')?.textContent ?? '' } : null;`), 10000);
    result.steps.consent = { ...consent, sentBefore: provReqs().length - beforeAnalysis };
    await d.clickShadow(LOG, '[data-action="consent-confirm"]');
    const outcome = await waitUntil(
      () => d.github(`const l = ${IN_LOG('[data-layer="possibility"]')}; const r = l?.querySelector('[data-analysis="result"]'); const f = l?.querySelector('[data-analysis="failed"]'); return r ? { kind: 'result', meta: r.querySelector('[data-analysis-meta]')?.textContent ?? '', quotes: [...r.querySelectorAll('[data-evidence]')].map((q) => q.getAttribute('data-evidence')), text: r.textContent.slice(0, 600) } : f ? { kind: 'failed', failure: f.getAttribute('data-failure'), text: f.textContent } : null;`),
      180000,
    );
    await sleep(1500);
    result.steps.analysis = { outcome, requests: provReqs().slice(beforeAnalysis).map(shape) };
  } else {
    result.steps.list = result.steps.test = result.steps.analysis = { notRun: 'لم يُجرَ: التحقق لم ينجح' };
  }
  await sleep(300);
  result.extensionErrors = await session.extensionErrors();
  result.consoleHasKey = (await Promise.resolve(session.consoleText()).catch(() => '')).includes(KEY);
  result.allProviderRequestsFromBackground = provReqs().every((r) => r.from === 'background');
  result.keyInUrlOrBody = provReqs().some((r) => r.path.includes(KEY) || (r.body ?? '').includes(KEY));
  result.requestHosts = [...new Set(network.extra.map((r) => r.host))];
  result.blockedHosts = [...network.blocked].sort();
  result.githubApiAuth = network.api.map((c) => c.auth);
} catch (error) {
  result.error = String(error?.stack ?? error).split('\n').slice(0, 3).join(' | ');
} finally {
  if (session) await session.close();
  fs.rmSync(extDir, { recursive: true, force: true });
}
const out = `${JSON.stringify(redact(result), null, 2)}\n`;
if (out.includes(KEY)) {
  console.error('✗ الناتج يحمل المفتاح: لا يُحفظ');
  process.exit(1);
}
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `real-${provider}.json`), out);
}
const a = result.steps.analysis?.outcome;
console.log(`${target.title}: التحقق ${result.steps.verify?.health ?? '—'} · القائمة ${result.steps.list?.state ?? '—'} (${result.steps.list?.count ?? 0}) · الاختبار ${result.steps.test?.verdict ?? '—'} · التحليل ${a?.kind ?? '—'}${a?.kind === 'failed' ? ` (${a.failure})` : ''} · من الخلفية ${result.allProviderRequestsFromBackground} · المفتاح في العنوان أو الجسم ${result.keyInUrlOrBody}${result.error ? ` · خطأ: ${result.error}` : ''}`);
process.exitCode = a?.kind === 'result' && result.steps.test?.verdict === 'accepted' && !result.keyInUrlOrBody && result.allProviderRequestsFromBackground ? 0 : 1;

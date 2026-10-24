#!/usr/bin/env node
// MJ25 (T-11.12، AC-E12 (٥)، TEST-AI-09): الاتصال **الحقيقي** بـGoogle Gemini بمفتاح تجريبي يوفّره المالك، على الحزمة المشحونة dist/chromium في Chrome.
// المفتاح يُقرأ من ملف خارج المستودع (GEMINI_KEY_FILE) ولا يُطبع ولا يُكتب في أي ناتج (يُفحص آليًا). صفحة GitHub محلية (عينة عامة محفوظة: مهمة Actions فاشلة في
// microsoft/vscode، بلا محتوى خاص)، ومضيف Gemini حقيقي: طلبات الإضافة إليه تمرّ بوكيل Node يعيد إرسالها كما هي إلى Google ويعيد ردها (فتبقى مسجَّلة بمصدرها).
//   1. حفظ المفتاح بالواجهة ← التحقق المعلن (GET /v1beta/models) ← قراءة المودلات المتوافقة بالفعل من Google.
//   1ب. DEC-13 ن-5: زر + يعرض القائمة للمساعدة؛ ويُكتب النموذج المطلوب (GEMINI_MODEL) يدويًا في الحقل ويُختبر اختياريًا بنقرة، وقبله نموذج اختياري (GEMINI_STALE_MODEL) قد لا يكون متاحًا لمفتاحه.
//   2. تحليل واحد بعد موافقة بنقرة حقيقية، على العينة العامة، بالنموذج الذي في الحقل ← الرد يُفسَّر ويُعرض.
// ما يخرج إلى Google: طلب التحقق، وطلب التحليل بالمحتوى المنقّح للعينة العامة وحدها. ولا يُحفظ نص الطلب؛ ويُحفظ ما يظهر في الواجهة من رد على العينة.
// الاستعمال: GEMINI_KEY_FILE=/path/to/key node tests/modules/e/provider/gemini-real-check.mjs [--out-dir evidence/T-11.12]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, chromiumSession, sleep, waitUntil } from '../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keyFile = process.env.GEMINI_KEY_FILE;
if (!keyFile || !fs.existsSync(keyFile)) {
  console.error('لم يُجرَ: لا ملف مفتاح (GEMINI_KEY_FILE).');
  process.exit(2);
}
const KEY = fs.readFileSync(keyFile, 'utf8').trim();
const HOST = 'generativelanguage.googleapis.com';
const redact = (value) => JSON.parse(JSON.stringify(value ?? null).split(KEY).join('«مفتاح محجوب»'));

const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/d/token/fixtures/fixture-token-states.json'), 'utf8'));
const JOB_URL = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
const JOB_PAGE = fs.readFileSync(path.join(ROOT, 'fixtures/logs/gh-job-failed.html'), 'utf8');
const githubReply = (pathname) => (pathname === new URL(JOB_URL).pathname ? { status: 200, type: 'text/html; charset=utf-8', body: JOB_PAGE } : { status: 404, type: 'text/plain', body: 'not found' });
const apiReply = (pathAndQuery) => (pathAndQuery.startsWith('/rate_limit') ? FIXTURE.states['not-found'] : FIXTURE.states['not-found']);

/** وكيل إلى Google الحقيقية: يعيد طلب الإضافة كما هو (الترويسات والجسم) ويعيد ردّها. */
const real = [];
async function proxy(entry) {
  const headers = {};
  for (const [name, value] of Object.entries(entry.headers)) if (['x-goog-api-key', 'content-type'].includes(name.toLowerCase())) headers[name] = value;
  const response = await fetch(`https://${HOST}${entry.path}`, { method: entry.method, headers, body: entry.method === 'GET' ? undefined : entry.body ?? undefined });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  real.push({ method: entry.method, path: entry.path.split('?')[0], query: entry.path.includes('?') ? entry.path.slice(entry.path.indexOf('?')) : '', status: response.status, error: parsed?.error ? { code: parsed.error.code, status: parsed.error.status, message: String(parsed.error.message ?? '').slice(0, 200), reasons: (parsed.error.details ?? []).map((d) => d.reason).filter(Boolean) } : null, models: Array.isArray(parsed?.models) ? parsed.models.length : null, nextPage: Boolean(parsed?.nextPageToken) });
  return { status: response.status, body: text };
}

function derived() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj25-real-'));
  fs.cpSync(path.join(ROOT, 'dist/chromium'), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.github.com/*', `https://${HOST}/*`])];
  delete manifest.optional_host_permissions;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return dir;
}

const LOG = 'mijhar-host[data-mijhar-host="d.log"]';
const IN_LOG = (sel) => `document.querySelector('${LOG}')?.shadowRoot?.querySelector('${sel}')`;
const READ_CARD = `
  const c = document.querySelector('[data-provider-card]');
  if (!c) return null;
  return {
    provider: c.getAttribute('data-provider-card'),
    health: c.querySelector('[data-provider-key]')?.getAttribute('data-health') ?? null,
    key: c.querySelector('[data-key-state]')?.getAttribute('data-key-state') ?? null,
    checkText: c.querySelector('[data-key-check]')?.textContent ?? '',
    // DEC-13 ن-5: حقل النموذج اليدوي، وقائمة زر + حين تُفتح، ونتيجة «اختبر النموذج».
    model: c.querySelector('[data-model-input]')?.value ?? null,
    listed: [...c.querySelectorAll('[role="listbox"] [role="option"]')].map((o) => o.getAttribute('data-model')),
    test: c.querySelector('[data-model-test]')?.getAttribute('data-model-test') ?? null,
    testText: c.querySelector('[data-model-test]')?.textContent ?? '',
    blocked: Boolean(c.querySelector('[data-model-blocked]')),
    source: c.querySelector('[data-list-source]')?.textContent ?? '',
    text: (document.querySelector('[data-connection="provider-key"]')?.textContent ?? ''),
  };
`;
const SELECT = (id) => `const s = document.querySelector('#mj-provider-select'); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return true;`;

const result = { test: 'TEST-AI-09', mode: 'اتصال حقيقي بمفتاح تجريبي من المالك (Chrome)', measuredAt: new Date().toISOString(), steps: {} };
let session;
const extDir = derived();
try {
  session = await chromiumSession('chrome', { extDir, githubReply, apiReply, extra: { [HOST]: proxy } });
  result.browser = `Chrome ${session.browserVersion}`;
  const d = session.d;
  const card = () => d.options(READ_CARD);
  const until = (want, ms = 30000) => waitUntil(async () => {
    const c = await card();
    return c && want(c) ? c : null;
  }, ms);
  await until((c) => c.health !== 'checking');
  await d.options(SELECT('gemini'));
  await until((c) => c.provider === 'gemini' && c.key === 'none');
  await d.fill('#mj-key-input', KEY);
  await d.click('[data-action="key-save"]');
  const after = await until((c) => c.provider === 'gemini' && !['none', 'unverified', 'checking'].includes(c.health) && c.key !== 'none', 40000);
  const last = after ?? (await card());
  result.steps.verify = { card: last && { health: last.health, key: last.key, model: last.model, blocked: last.blocked, text: last.health === 'healthy' ? undefined : last.text }, requests: real.filter((r) => r.method === 'GET') };
  if (after?.health === 'healthy' && process.env.GEMINI_MODEL) {
    // زر + بنقرة فعلية: القائمة المقروءة للمساعدة (بلا طلب جديد)، ثم تُغلق.
    await d.click('[data-provider-card] [data-action="model-list"]');
    const listed = await until((c) => c.listed.length > 0, 10000);
    result.steps.list = { count: listed?.listed.length ?? 0, source: listed?.source ?? '' };
    await d.click('[data-provider-card] [data-action="model-list"]');
    // «اختبر النموذج» الاختياري بنقرة للنموذج المكتوب يدويًا: نموذج اختياري قد لا يكون متاحًا لمفتاحه، ثم النموذج المطلوب.
    result.steps.probes = [];
    const testTyped = async (model) => {
      // Element Clear في Marionette لا يرسل حدث input فيعيد الحقل المتحكَّم به قيمته: يُفرَّغ أولًا بحدث input ثم يُكتب بلوحة المفاتيح.
      await d.options(`const f = document.querySelector('[data-provider-card] [data-model-input]'); f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
      await d.fill('[data-provider-card] [data-model-input]', model);
      await d.click('#mj-conn-provider-key-title');
      const before = real.length;
      await d.click('[data-provider-card] [data-action="model-test"]');
      const card2 = await until((c) => c.model === model && c.test && c.test !== 'running', 40000);
      const req = real.slice(before).find((r) => r.method === 'POST');
      return { model, verdict: card2?.test ?? null, status: req?.status ?? null, error: req?.error ?? null, fieldKept: card2?.model === model };
    };
    if (process.env.GEMINI_STALE_MODEL) result.steps.probes.push(await testTyped(process.env.GEMINI_STALE_MODEL));
    result.chosenModel = process.env.GEMINI_MODEL;
    result.steps.probes.push(await testTyped(process.env.GEMINI_MODEL));
    await sleep(500);
    await d.openGithub(JOB_URL);
    await waitUntil(() => d.github(`return Boolean(${IN_LOG('[data-action="analysis-open"]')}) || null;`), 20000);
    await d.clickShadow(LOG, '[data-action="analysis-open"]');
    const consent = await waitUntil(() => d.github(`const c = ${IN_LOG('[data-consent]')}; return c ? { title: c.querySelector('#mj-consent-title')?.textContent ?? '', destination: c.querySelector('[data-consent-row="destination"]')?.textContent ?? '' } : null;`), 10000);
    result.steps.consent = consent;
    await d.clickShadow(LOG, '[data-action="consent-confirm"]');
    const outcome = await waitUntil(() => d.github(`const l = ${IN_LOG('[data-layer="possibility"]')}; const r = l?.querySelector('[data-analysis="result"]'); const f = l?.querySelector('[data-analysis="failed"]'); return r ? { kind: 'result', text: r.textContent, meta: r.querySelector('[data-analysis-meta]')?.textContent ?? '' } : f ? { kind: 'failed', text: f.textContent } : null;`), 120000);
    result.steps.analysis = { outcome, requests: real.filter((r) => r.method === 'POST').slice(-1) };
  } else {
    result.steps.analysis = { notRun: 'لم يُجرَ: التحقق لم ينجح أو لا نموذج مطلوب (GEMINI_MODEL)' };
  }
  await sleep(500);
  result.extensionErrors = await session.extensionErrors();
  result.consoleHasKey = (await Promise.resolve(session.consoleText()).catch(() => '')).includes(KEY);
  result.allRequestsFromBackground = session.network.extra.every((r) => r.from === 'background');
  result.keyInUrlOrBody = session.network.extra.some((r) => r.path.includes(KEY) || (r.body ?? '').includes(KEY));
  result.requestHosts = [...new Set(session.network.extra.map((r) => r.host))];
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
const verified = result.steps.verify?.card?.health === 'healthy';
const analysed = result.steps.analysis?.outcome?.kind === 'result';
console.log(`التحقق: ${verified ? 'سليم' : 'لم ينجح'} · القائمة: ${result.steps.list?.count ?? 0} · الاختبارات: ${(result.steps.probes ?? []).map((p) => `${p.model}=${p.verdict}/${p.status}`).join(',')} · التحليل: ${analysed ? 'نجح' : result.steps.analysis?.outcome?.kind ?? 'لم يُجرَ'}${result.error ? ` · خطأ: ${result.error}` : ''}`);
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'real-connection.json'), out);
}
process.exitCode = verified && analysed && !result.consoleHasKey && !result.keyInUrlOrBody ? 0 : 1;

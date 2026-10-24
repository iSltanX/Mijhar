#!/usr/bin/env node
// DEC-13 ن-5 (حقل النموذج اليدوي وزر + والاختبار الاختياري؛ Model field وO-28) في المتصفحات الحقيقية على الحزمة المشحونة (dist/<target> من npm run build)
// — **محاكاة**: مضيفا OpenAI وGoogle Gemini وهميان محليان (route لا شبكة خارجية)، بمفاتيح مختلَقة تُركَّب وقت التشغيل ولا تُكتب في أي دليل، بمشغّلي MJ15
// (tests/modules/d/token/browser/drivers.mjs). كل نقرة هنا نقرة فعلية (Playwright/Marionette)؛ والحقل يُملأ بلوحة المفاتيح ثم يُغادَر.
//   1. Gemini بمفتاح محفوظ وجلب قائمته متعذّر: زر + يعلن الفشل بإعادة المحاولة والحقل يعمل ويُحفظ؛ وإعادة المحاولة تعرض القائمة، والاختيار يملأ الحقل
//      ويغلقها ويعيد التركيز إليه.
//   2. OpenAI: معرّف يُكتب يدويًا وليس في القائمة يُحفظ بلا طلب عند الكتابة، ويُرسل إليه التحليل بعد الموافقة بلا أي اختبار سابق.
//   3. «اختبر النموذج» لمعرّف آخر خارج القائمة: «رفض» بسبب المزوّد، و«لم يُحسم» لحد الطلبات؛ ولا يغيّر الحقل.
//   4. تبديل المزوّد: حقل كلٍّ ونتيجة اختباره له وحده.
//   5. تحليل بنموذج يرفضه المزوّد: يُعرض سبب الرفض منقّحًا، وطلب واحد بلا إعادة تلقائية ولا تبديل نموذج ولا تحويل إلى مزوّد آخر.
// صلاحيات المضيفات ممنوحة في نسخة مشتقة (نافذة الإذن لا تُقبل آليًا)؛ وفي Firefox موافقة websiteContent تُطلب بنقرة الحفظ كما في الحزمة.
// الاستعمال: node tests/modules/e/provider/browser/model-field-check.mjs [chrome edge brave firefox] [--out-dir evidence/wave-L/model-field]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, firefoxSession, sleep, waitUntil } from '../../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.filter((a) => BROWSERS[a]);

const TOKEN = ['github', 'pat', `11FIELDMIJHARFAKE0000_${'xFakeModelFieldCheckOnly'.repeat(3).slice(0, 59)}`].join('_');
const OPENAI_KEY = ['sk', 'proj', 'ModelFieldCheckFakeKey'.repeat(4)].join('-');
const GEMINI_KEY = ['AIza', 'SyFakeModelFieldCheckKey01234567890'].join('');
const SECRET_RE = /github_pat_[A-Za-z0-9_]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}/;
const hasSecret = (value) => SECRET_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));
const OPENAI_HOST = 'api.openai.com';
const GEMINI_HOST = 'generativelanguage.googleapis.com';
/** معرّفات خارج قائمة المزوّد عمدًا: الأول يقبله، والثاني يرفضه (لم يعد متاحًا)، والثالث يردّ بحد الطلبات. */
const FUTURE = 'gpt-future-x';
const GONE = 'gpt-gone-1';
const BUSY = 'gpt-busy-1';

const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/d/token/fixtures/fixture-token-states.json'), 'utf8'));
const JOB_URL = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
const JOB_PAGE = fs.readFileSync(path.join(ROOT, 'fixtures/logs/gh-job-failed.html'), 'utf8');
const SECONDS = Math.floor(Date.now() / 1000);

const githubReply = (pathname) => (pathname === new URL(JOB_URL).pathname ? { status: 200, type: 'text/html; charset=utf-8', body: JOB_PAGE } : { status: 404, type: 'text/plain', body: 'not found' });
const apiReply = (pathAndQuery, authorization) => (pathAndQuery.startsWith('/rate_limit') && authorization === `Bearer ${TOKEN}` ? FIXTURE.states.valid : FIXTURE.states['not-found']);
const authLabel = (value) => (value ? (value === `Bearer ${TOKEN}` ? 'saved' : 'other') : null);

const analysisText = (prompt) => {
  const quote = prompt.split('\n').find((l) => /exit code/i.test(l))?.replace(/^[>\s|0-9-]+/, '').trim() ?? '';
  return JSON.stringify({ summary: 'فشلت الخطوة 14.', findings: [{ text: 'احتمال: فشل الترجمة في Compile & Hygiene.', evidence: [quote] }], next_steps: ['افتح سجل الخطوة 14.'], missing: ['نص السجل محجوب.'] });
};

function openaiReply(entry) {
  if (entry.path === '/v1/models') {
    return { status: 200, body: { object: 'list', data: [{ id: 'mock-chat-2', object: 'model', created: SECONDS - 864000, owned_by: 'mock' }, { id: 'mock-embed-1', object: 'model', created: SECONDS - 3456000, owned_by: 'mock' }] } };
  }
  if (entry.path === '/v1/responses') {
    const sent = JSON.parse(entry.body ?? '{}');
    if (sent.model === GONE) return { status: 404, body: { error: { type: 'invalid_request_error', code: 'model_not_found', message: `The model \`${GONE}\` does not exist or you do not have access to it.` } } };
    if (sent.model === BUSY) return { status: 429, body: { error: { type: 'requests', code: 'rate_limit_exceeded', message: 'Rate limit reached for requests.' } } };
    const text = sent.input === 'ping' ? 'pong' : analysisText(typeof sent.input === 'string' ? sent.input : '');
    return { status: 200, body: { id: 'resp_mock', object: 'response', status: 'completed', incomplete_details: null, model: sent.model, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 900, output_tokens: 80 } } };
  }
  return { status: 404, body: { error: { type: 'invalid_request_error', code: null, message: 'not found' } } };
}

/** جلب قائمة Gemini معطّل حتى تُعاد المحاولة (يحاكي انقطاعًا مؤقتًا). */
const gemini = { down: true };
function geminiReply(entry) {
  if (entry.path.split('?')[0] === '/v1beta/models' && entry.method === 'GET') {
    if (gemini.down) return { status: 503, body: { error: { code: 503, status: 'UNAVAILABLE', message: 'The service is currently unavailable.' } } };
    return {
      status: 200,
      body: {
        models: [
          { name: 'models/mock-gem-2', displayName: 'Mock Gem 2', inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent'] },
          { name: 'models/mock-gem-embed', displayName: 'Mock Gem Embed', inputTokenLimit: 2048, outputTokenLimit: 1, supportedGenerationMethods: ['embedContent'] },
        ],
      },
    };
  }
  return { status: 404, body: { error: { code: 404, status: 'NOT_FOUND', message: 'not found' } } };
}
const anthropicReply = () => ({ status: 500, body: { type: 'error', error: { type: 'api_error', message: 'لا يجب أن يصل طلب إلى Anthropic في هذا الفحص' } } });

function derived(target) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-model-field-${target}-`));
  fs.cpSync(path.join(ROOT, 'dist', target), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.github.com/*', `https://${OPENAI_HOST}/*`, `https://${GEMINI_HOST}/*`, 'https://api.anthropic.com/*'])];
  delete manifest.optional_host_permissions;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return dir;
}

const LOG = 'mijhar-host[data-mijhar-host="d.log"]';
const IN_LOG = (sel) => `document.querySelector('${LOG}')?.shadowRoot?.querySelector('${sel}')`;
const READ_FIELD = `
  const c = document.querySelector('[data-provider-card]');
  if (!c) return null;
  const f = c.querySelector('[data-model-input]');
  return {
    provider: c.getAttribute('data-provider-card'),
    health: c.querySelector('[data-provider-key]')?.getAttribute('data-health') ?? null,
    key: c.querySelector('[data-key-state]')?.getAttribute('data-key-state') ?? null,
    field: f?.value ?? null,
    fieldDisabled: f?.disabled ?? null,
    focused: document.activeElement === f,
    plusDisabled: c.querySelector('[data-action="model-list"]')?.getAttribute('aria-disabled') === 'true',
    list: c.querySelector('[data-model-list]')?.getAttribute('data-model-list') ?? null,
    listText: c.querySelector('[data-model-list]')?.textContent ?? '',
    listed: [...c.querySelectorAll('[role="listbox"] [role="option"]')].map((o) => o.getAttribute('data-model')),
    blocked: Boolean(c.querySelector('[data-model-blocked]')),
    test: c.querySelector('[data-model-test]')?.getAttribute('data-model-test') ?? null,
    testText: c.querySelector('[data-model-test]')?.textContent ?? '',
  };
`;
const SELECT = (id) => `const s = document.querySelector('#mj-provider-select'); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`;

async function scenario(d, target, checks, network) {
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 500)}`}`);
  };
  const on = (host) => network.extra.filter((r) => r.host === host);
  const analyses = () => on(OPENAI_HOST).filter((r) => r.method === 'POST' && JSON.parse(r.body ?? '{}').input !== 'ping');
  const field = () => d.options(READ_FIELD);
  const until = (want, ms = 12000) => waitUntil(async () => {
    const c = await field();
    return c && want(c) ? c : null;
  }, ms);
  /** يكتب في الحقل بلوحة المفاتيح ثم يغادره (فيُحفظ). Element Clear في Marionette لا يرسل حدث input فيعيد الحقل المتحكَّم به قيمته، فيُفرَّغ أولًا بحدث input. */
  const type = async (value) => {
    await d.options(`const f = document.querySelector('[data-provider-card] [data-model-input]'); f.value = ''; f.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
    await d.fill('[data-provider-card] [data-model-input]', value);
    await d.click('#mj-conn-provider-key-title');
  };

  await d.fill('#mj-token-input', TOKEN);
  await d.click('[data-action="token-save"]');
  await waitUntil(() => d.options(`return document.querySelector('[data-connection="github-token"] [data-health]')?.getAttribute('data-health') === 'healthy' || null;`), 10000);

  // 1. Gemini: جلب القائمة متعذّر والحقل يعمل.
  await d.options(SELECT('gemini'));
  await until((c) => c.provider === 'gemini' && c.key === 'none');
  await d.fill('#mj-key-input', GEMINI_KEY);
  await d.click('[data-action="key-save"]');
  const saved = await until((c) => c.provider === 'gemini' && c.key === 'session' && !c.plusDisabled);
  check('Gemini: المفتاح محفوظ وتحقق الحفظ تعذّر (503)، وزر + متاح والحقل يعمل', Boolean(saved) && on(GEMINI_HOST).length === 1 && saved.fieldDisabled === false, { saved, gemini: on(GEMINI_HOST).length });
  await d.click('[data-provider-card] [data-action="model-list"]');
  const failed = await until((c) => c.list === 'failed');
  check('زر + بنقرة فعلية يرسل طلب القائمة المعلن نفسه، وتعذّره معلن «الحقل يعمل كما هو» بإعادة المحاولة', Boolean(failed) && failed.listText.includes('تعذّر جلب القائمة') && failed.listText.includes('الحقل يعمل كما هو') && failed.listText.includes('أعد المحاولة') && on(GEMINI_HOST).length === 2, { failed, gemini: on(GEMINI_HOST).length });
  await type('gemini-typed-1');
  const typedGemini = await until((c) => c.field === 'gemini-typed-1' && !c.blocked);
  check('الفشل لا يعطّل الحقل: معرّف يُكتب ويُحفظ ويزول تعليل الحقل الفارغ، بلا طلب', Boolean(typedGemini) && on(GEMINI_HOST).length === 2, typedGemini);
  gemini.down = false;
  await d.click('[data-provider-card] [data-action="model-list"]');
  const reopened = await until((c) => c.list === 'failed' || c.list === 'list');
  if (reopened?.list === 'failed') await d.click('[data-provider-card] [data-action="model-list-retry"]');
  const listed = await until((c) => c.list === 'list');
  check('«أعد المحاولة» يجلب القائمة نفسها فتُعرض نماذج Gemini المرشَّحة', Boolean(listed) && listed.listed.join(',') === 'mock-gem-2' && on(GEMINI_HOST).length === 3, { listed, gemini: on(GEMINI_HOST).length });
  await d.click('[data-provider-card] [role="option"][data-model="mock-gem-2"]');
  const chosen = await until((c) => c.field === 'mock-gem-2' && c.list === null);
  check('الاختيار من القائمة يملأ الحقل ويغلق القائمة ويعيد التركيز إلى الحقل', Boolean(chosen) && chosen.focused, chosen);

  // 2. OpenAI: معرّف يدوي خارج القائمة.
  await d.options(SELECT('openai'));
  const noKey = await until((c) => c.provider === 'openai' && c.key === 'none');
  check('OpenAI بلا مفتاح: الحقل يعمل وزر + معطّل بسببه، وحقل Gemini لا يظهر هنا', Boolean(noKey) && noKey.plusDisabled && noKey.field === '' && noKey.fieldDisabled === false, noKey);
  await d.fill('#mj-key-input', OPENAI_KEY);
  await d.click('[data-action="key-save"]');
  await until((c) => c.provider === 'openai' && c.health === 'healthy');
  const beforeTyping = network.extra.length;
  await type(FUTURE);
  const typed = await until((c) => c.field === FUTURE && !c.blocked);
  check('معرّف يُكتب يدويًا وليس في قائمة OpenAI يُحفظ، بلا أي طلب عند الكتابة', Boolean(typed) && network.extra.length === beforeTyping, { typed, requests: network.extra.length - beforeTyping });

  await d.openGithub(JOB_URL);
  await waitUntil(() => d.github(`return Boolean(${IN_LOG('[data-action="analysis-open"]')}) || null;`), 15000);
  await d.clickShadow(LOG, '[data-action="analysis-open"]');
  const consent = await waitUntil(() => d.github(`const c = ${IN_LOG('[data-consent]')}; return c ? { lead: c.querySelector('[data-consent-lead]')?.textContent ?? '' } : null;`), 8000);
  check('الموافقة باقية وتعرض المزوّد والنموذج المكتوب كما هو، ولا طلب قبلها', Boolean(consent) && consent.lead.includes('OpenAI') && consent.lead.includes(FUTURE) && analyses().length === 0, consent);
  await d.clickShadow(LOG, '[data-action="consent-confirm"]');
  const result = await waitUntil(() => d.github(`const r = ${IN_LOG('[data-layer="possibility"] [data-analysis="result"]')}; return r ? { meta: r.querySelector('[data-analysis-meta]')?.textContent ?? '' } : null;`), 10000);
  const first = analyses()[0];
  check('التحليل يُرسل إلى المعرّف المكتوب بلا أي اختبار سابق: طلب واحد من الخلفية بالنموذج نفسه، والنتيجة موسومة به', Boolean(result) && analyses().length === 1 && JSON.parse(first?.body ?? '{}').model === FUTURE && first?.from === 'background' && result.meta.includes(FUTURE) && on(OPENAI_HOST).every((r) => JSON.parse(r.body ?? '{}').input !== 'ping'), { result, analyses: analyses().length });

  // 3. «اختبر النموذج» الاختياري: رفض، ولم يُحسم.
  await type(GONE);
  await until((c) => c.field === GONE);
  await d.click('[data-provider-card] [data-action="model-test"]');
  const rejected = await until((c) => c.test === 'rejected');
  check('«اختبر النموذج» لمعرّف خارج القائمة يرفضه المزوّد: «رفض» بسببه ولا يمنع الحفظ ولا التحليل، والحقل كما كُتب', Boolean(rejected) && rejected.testText.includes('رفض OpenAI النموذج') && rejected.testText.includes('does not exist') && rejected.testText.includes('لا يمنع ذلك الحفظ ولا التحليل') && rejected.field === GONE, rejected);
  await type(BUSY);
  await until((c) => c.field === BUSY && c.test === null);
  await d.click('[data-provider-card] [data-action="model-test"]');
  const busy = await until((c) => c.test === 'inconclusive');
  check('حد الطلبات في الاختبار «لم يُحسم» لا رفض ولا عدم توافق', Boolean(busy) && busy.testText.includes('لم يُحسم الاختبار') && busy.testText.includes('ليس حكمًا على النموذج'), busy);

  // 4. العزل بين المزوّدين.
  await d.options(SELECT('gemini'));
  const geminiBack = await until((c) => c.provider === 'gemini' && c.health !== 'checking');
  check('تبديل المزوّد: حقل Gemini بنموذجه هو، ولا تظهر عنده نتيجة اختبار OpenAI', Boolean(geminiBack) && geminiBack.field === 'mock-gem-2' && geminiBack.test === null, geminiBack);
  await d.options(SELECT('openai'));
  const openaiBack = await until((c) => c.provider === 'openai' && c.health !== 'checking' && c.field === BUSY);
  check('العودة إلى OpenAI: حقله ونتيجة اختباره للنموذج المكتوب كما تُركا', Boolean(openaiBack) && openaiBack.test === 'inconclusive', openaiBack);
  await type(GONE);
  await until((c) => c.field === GONE && c.test === null);

  // 5. تحليل بنموذج يرفضه المزوّد: السبب، ولا إعادة ولا تبديل ولا تحويل.
  await d.openGithub(JOB_URL);
  await waitUntil(() => d.github(`return Boolean(${IN_LOG('[data-action="analysis-open"]')}) || null;`), 15000);
  await d.clickShadow(LOG, '[data-action="analysis-open"]');
  const consent2 = await waitUntil(() => d.github(`const c = ${IN_LOG('[data-consent]')}; return c ? c.querySelector('[data-consent-lead]')?.textContent ?? '' : null;`), 8000);
  await d.clickShadow(LOG, '[data-action="consent-confirm"]');
  const refusal = await waitUntil(() => d.github(`const f = ${IN_LOG('[data-layer="possibility"] [data-analysis="failed"]')}; return f ? { failure: f.getAttribute('data-failure'), text: f.textContent } : null;`), 10000);
  await sleep(1500);
  const gone = analyses().filter((r) => JSON.parse(r.body ?? '{}').model === GONE);
  check('رفض المزوّد النموذج عند التحليل يُعرض بسببه، بطلب واحد بلا إعادة تلقائية ولا تبديل نموذج', Boolean(refusal) && consent2?.includes(GONE) && refusal.text.includes('does not exist') && gone.length === 1 && analyses().length === 2 && !hasSecret(refusal.text), { refusal, gone: gone.length, analyses: analyses().length });
  const after = await field();
  check('ولا تحويل إلى مزوّد آخر: لا طلب إلى Gemini ولا Anthropic بعد الرفض، والحقل باقٍ', on(GEMINI_HOST).length === 3 && on('api.anthropic.com').length === 0 && after?.field === GONE, { gemini: on(GEMINI_HOST).length, anthropic: on('api.anthropic.com').length, field: after?.field });

  // 6. الأسرار والوجهة.
  check('كل طلبات المزوّدين من الخلفية، وكل مفتاح إلى مضيفه وحده في ترويسته', network.extra.every((r) => r.from === 'background') && on(OPENAI_HOST).every((r) => r.headers.authorization === `Bearer ${OPENAI_KEY}` && !r.headers['x-goog-api-key']) && on(GEMINI_HOST).every((r) => r.headers['x-goog-api-key'] === GEMINI_KEY && !r.headers.authorization && !r.path.includes(GEMINI_KEY)), network.extra.map((r) => ({ host: r.host, from: r.from })));
}

async function run(key) {
  const target = BROWSERS[key].target;
  const extDir = derived(target);
  const checks = [];
  const result = { label: BROWSERS[key].label, checks };
  let session;
  gemini.down = true;
  try {
    const options = { extDir, githubReply, apiReply, authLabel, extra: { [OPENAI_HOST]: openaiReply, [GEMINI_HOST]: geminiReply, 'api.anthropic.com': anthropicReply } };
    session = key === 'firefox' ? await firefoxSession(options) : await chromiumSession(key, options);
    result.browserVersion = session.browserVersion;
    await scenario(session.d, target, checks, session.network);
    result.extensionErrors = await session.extensionErrors();
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    if (session) {
      result.network = {
        provider: session.network.extra.map((r) => {
          const body = (() => {
            try {
              return JSON.parse(r.body ?? '{}');
            } catch {
              return {};
            }
          })();
          return { host: r.host, method: r.method, path: r.path.split('?')[0], from: r.from, model: body.model ?? null, ping: body.input === 'ping' || null };
        }),
        blockedExternalHosts: [...session.network.blocked].sort(),
      };
      result.consoleHasSecret = hasSecret(await Promise.resolve(session.consoleText()).catch(() => ''));
      await session.close();
    }
    fs.rmSync(extDir, { recursive: true, force: true });
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
  const bundle = fs.readdirSync(path.join(ROOT, 'dist', BROWSERS[key].target)).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(ROOT, 'dist', BROWSERS[key].target, f), 'utf8')).join('\n');
  const blocked = r.network?.blockedExternalHosts ?? [];
  const pageOwn = blocked.filter((h) => JOB_PAGE.includes(h) && !bundle.includes(h));
  const external = blocked.filter((h) => !pageOwn.includes(h) && !(key === 'firefox' && /(^|\.)mozilla\.(net|com|org)$/.test(h)));
  add('لا وجهة للإضافة غير github.com وapi.github.com ومضيفَي المزوّدين المختارين', external.length === 0, { external, pageOwn });
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
  fs.writeFileSync(path.join(outDir, 'browser-model-field-check.json'), serialized);
}
console.log(`المجموع (محاكاة): ${all.filter((c) => c.ok).length}/${all.length}`);
if (all.some((c) => !c.ok)) process.exitCode = 1;

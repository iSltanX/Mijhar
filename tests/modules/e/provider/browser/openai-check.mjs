#!/usr/bin/env node
// TEST-AI-07 وTEST-PRIV-05 وAC-E11 (٢) إلى (٥) في المتصفحات الحقيقية على الحزمة المشحونة (dist/<target> من npm run build) — **محاكاة**: مضيف OpenAI وهمي محلي
// (api.openai.com يُخدم عبر route لا شبكة خارجية، بمفتاح مختلَق يُولَّد وقت التشغيل ولا يُكتب في أي دليل) بمشغّلي MJ15 (tests/modules/d/token/browser/drivers.mjs):
//   1. بطاقة «مزوّد التحليل»: OpenAI في القائمة بجانب Anthropic؛ وباختياره لا مفتاح له ولا طلب إليه.
//   2. حفظ رمز GitHub ثم مفتاح OpenAI بالواجهة: الطلب الوحيد بعد المفتاح GET /v1/models من الخلفية بترويسة Authorization وحدها؛ والنماذج كلها غير معلنة
//      التوافق (HYP-22): لا اقتراح في الحقل، والحقل الفارغ معلَّل، ولا نموذج مخمَّن.
//   3. DEC-13 ن-5: زر + يعرض القائمة للمساعدة والاختيار يملأ الحقل ويغلقها؛ و«اختبر النموذج» الاختياري بنقرة: POST /v1/responses بـ«ping» وحده.
//   4. صفحة مهمة Actions: الموافقة تذكر OpenAI ومضيفه والنموذج الذي في الحقل، والإرسال بنقرة حقيقية طلب واحد إلى api.openai.com من الخلفية؛ والنتيجة موسومة.
//   5. تدقيق الشبكة: كل طلب إلى api.openai.com وحده، من الخلفية، بـAuthorization: Bearer <مفتاح OpenAI> وحده؛ لا x-api-key ولا رمز GitHub ولا مفتاح Anthropic؛
//      ولا طلب إلى api.anthropic.com؛ ولا مفتاح في طلب إلى GitHub ولا في DOM ولا الكونسول ولا الناتج.
// صلاحيتا api.github.com وapi.openai.com ممنوحتان في نسخة مشتقة (نافذة الإذن لا تُقبل آليًا)؛ وفي Firefox موافقة websiteContent تُطلب بنقرة الحفظ كما في الحزمة.
// الاستعمال: node tests/modules/e/provider/browser/openai-check.mjs [chrome edge brave firefox] [--out-dir evidence/T-11.11]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, firefoxSession, sleep, waitUntil } from '../../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.filter((a) => BROWSERS[a]);

const TOKEN = ['github', 'pat', `11OPENMIJHARFAKE00000_${'xFakeOpenAiCheckOnly'.repeat(3).slice(0, 59)}`].join('_');
const KEY = ['sk', 'proj', 'OpenAiCheckFakeKeyOnly'.repeat(4)].join('-');
const OTHER_KEY = ['sk', 'ant', 'api03', 'OtherProviderFakeKey'.repeat(3)].join('-');
const SECRET_RE = /github_pat_[A-Za-z0-9_]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}/;
const hasSecret = (value) => SECRET_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));

const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/d/token/fixtures/fixture-token-states.json'), 'utf8'));
const JOB_URL = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
const JOB_PAGE = fs.readFileSync(path.join(ROOT, 'fixtures/logs/gh-job-failed.html'), 'utf8');
const SECONDS = Math.floor(Date.now() / 1000);
const MODELS = [
  { id: 'mock-chat-2', object: 'model', created: SECONDS - 864000, owned_by: 'mock' },
  { id: 'mock-embed-1', object: 'model', created: SECONDS - 3456000, owned_by: 'mock' },
];

const githubReply = (pathname) => (pathname === new URL(JOB_URL).pathname ? { status: 200, type: 'text/html; charset=utf-8', body: JOB_PAGE } : { status: 404, type: 'text/plain', body: 'not found' });
const apiReply = (pathAndQuery, authorization) => (pathAndQuery.startsWith('/rate_limit') && authorization === `Bearer ${TOKEN}` ? FIXTURE.states.valid : FIXTURE.states['not-found']);
const authLabel = (value) => (value ? (value === `Bearer ${TOKEN}` ? 'saved' : 'other') : null);

/** رد مضيف OpenAI الوهمي: المودلات، والفحص («ping»)، وتحليل بالبنية المطلوبة يقتبس سطرًا من البرومبت المرسل. */
function openaiReply(entry) {
  if (entry.path === '/v1/models') return { status: 200, body: { object: 'list', data: MODELS } };
  if (entry.path === '/v1/responses') {
    const sent = JSON.parse(entry.body ?? '{}');
    const prompt = typeof sent.input === 'string' ? sent.input : '';
    const quote = prompt.split('\n').find((l) => /exit code/i.test(l))?.replace(/^[>\s|0-9-]+/, '').trim() ?? '';
    const text = sent.input === 'ping' ? 'pong' : JSON.stringify({ summary: 'فشلت الخطوة 14.', findings: [{ text: 'احتمال: فشل الترجمة في Compile & Hygiene.', evidence: [quote] }], next_steps: ['افتح سجل الخطوة 14.'], missing: ['نص السجل محجوب.'] });
    return { status: 200, body: { id: 'resp_mock', object: 'response', status: 'completed', incomplete_details: null, model: sent.model, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 900, output_tokens: 80, total_tokens: 980 } } };
  }
  return { status: 404, body: { error: { type: 'invalid_request_error', code: null, message: 'not found' } } };
}
const anthropicReply = () => ({ status: 500, body: { type: 'error', error: { type: 'api_error', message: 'لا يجب أن يصل طلب إلى Anthropic في هذا الفحص' } } });

/** نسخة من dist/<target>: الشيفرة كما هي، والمضيفان ممنوحان آليًا (لا نافذة إذن)، ولا صلاحية اختيارية. */
function derived(target) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-mj24-${target}-`));
  fs.cpSync(path.join(ROOT, 'dist', target), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.github.com/*', 'https://api.openai.com/*', 'https://api.anthropic.com/*'])];
  delete manifest.optional_host_permissions;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  return dir;
}

const LOG = 'mijhar-host[data-mijhar-host="d.log"]';
const IN_LOG = (sel) => `document.querySelector('${LOG}')?.shadowRoot?.querySelector('${sel}')`;

async function scenario(d, target, checks, network) {
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 500)}`}`);
  };
  const openai = () => network.extra.filter((r) => r.host === 'api.openai.com');
  const posts = () => openai().filter((r) => r.method === 'POST');

  // 1. البطاقة: OpenAI في القائمة؛ واختياره لا يرسل شيئًا.
  const card = await waitUntil(() => d.options(`const c = document.querySelector('[data-connection="provider-key"]'); const g = c?.querySelector('[data-provider-permission]')?.getAttribute('data-provider-permission'); return c && g && g !== 'checking' ? { providers: [...(c.querySelector('[data-provider-select]')?.options ?? [])].map((o) => o.value), cards: document.querySelectorAll('[data-provider-card]').length } : null;`), 10000);
  check('AC-E11: OpenAI في قائمة المزوّد بعد Anthropic (ثم Google Gemini، الموجة L)، في بطاقة «مزوّد التحليل» الواحدة', card?.providers.join(',') === 'anthropic,openai,gemini' && card.cards === 1, card);
  await d.options(`const s = document.querySelector('[data-provider-select]'); s.value = 'openai'; s.dispatchEvent(new Event('change', { bubbles: true })); return true;`);
  const switched = await waitUntil(() => d.options(`const c = document.querySelector('[data-provider-card]'); const s = document.querySelector('[data-provider-select]'); return s?.value === 'openai' && c?.textContent?.includes('api.openai.com') ? { announce: c.querySelector('[data-verify-request]')?.textContent ?? '', placeholder: document.querySelector('#mj-key-input')?.getAttribute('placeholder') ?? '' } : null;`), 8000);
  check('بعد اختيار OpenAI: طلب التحقق المعلن يذكر GET https://api.openai.com/v1/models، ولا طلب إلى أي مزوّد قبل الحفظ', switched?.announce.includes('GET https://api.openai.com/v1/models') && network.extra.length === 0, { switched, requests: network.extra.length });

  // 2. الرمز ثم مفتاح OpenAI بالواجهة.
  await d.fill('#mj-token-input', TOKEN);
  await d.click('[data-action="token-save"]');
  await waitUntil(() => d.options(`return document.querySelector('[data-connection="github-token"] [data-health]')?.getAttribute('data-health') === 'healthy' || null;`), 10000);
  await d.fill('#mj-key-input', KEY);
  await d.click('[data-action="key-save"]');
  const verified = await waitUntil(() => d.options(`const n = document.querySelector('[data-key-check]'); return n?.getAttribute('data-health') === 'healthy' ? { text: n.textContent, html: document.documentElement.outerHTML } : null;`), 12000);
  check('المفتاح «سليم» بعد التحقق، ولا مفتاح في DOM الإعدادات', verified && !hasSecret(verified.html), verified && { text: verified.text });
  await sleep(1500);
  const afterAdd = network.extra.map((r) => ({ host: r.host, method: r.method, path: r.path, from: r.from }));
  check('AC-E11 (٢): بعد إضافة المفتاح طلب واحد هو التحقق المعلن GET /v1/models إلى api.openai.com من الخلفية، ولا تحليل', afterAdd.length === 1 && afterAdd[0].host === 'api.openai.com' && afterAdd[0].method === 'GET' && afterAdd[0].path === '/v1/models' && afterAdd[0].from === 'background', afterAdd);

  // 3. DEC-13 ن-5: لا توافق معلن فلا اقتراح والحقل فارغ معلَّلًا؛ زر + (نقرة فعلية) يعرض القائمة المقروءة للمساعدة، والاختيار يملأ الحقل ويغلقها؛
  //    و«اختبر النموذج» الاختياري بنقرة فعلية: POST /v1/responses بـ«ping» وحده.
  const empty = await waitUntil(() => d.options(`const c = document.querySelector('[data-provider-card]'); const f = c?.querySelector('[data-model-input]'); return f && c.querySelector('[data-model-blocked]') ? { field: f.value, blocked: c.querySelector('[data-model-blocked]').textContent, test: c.querySelector('[data-action="model-test"]')?.getAttribute('title') ?? '', probeButtons: c.querySelectorAll('[data-action="model-probe"]').length } : null;`), 8000);
  check('AC-E11 (٣) وDEC-13 ن-5: القائمة لا تعلن توافقًا فلا نموذج مقترح ولا مخمَّن، والحقل فارغ معلَّلًا، واختبار واحد للنموذج المكتوب ببيان طلبه (ping وحده، store=false) ولا زر لكل نموذج', empty && empty.field === '' && empty.blocked.includes('ولا يُخمَّن نموذج') && empty.test.includes('ping') && empty.test.includes('store=false') && empty.probeButtons === 0, empty);
  await d.click('[data-provider-card] [data-action="model-list"]');
  const listed = await waitUntil(() => d.options(`const o = [...document.querySelectorAll('[data-provider-card] [role="listbox"] [role="option"]')].map((x) => x.getAttribute('data-model')); return o.length ? o : null;`), 8000);
  check('زر + يعرض قائمة OpenAI المقروءة بلا طلب جديد', listed && listed.join(',') === 'mock-chat-2,mock-embed-1' && network.extra.length === 1, { listed, requests: network.extra.length });
  await d.click('[data-provider-card] [role="option"][data-model="mock-chat-2"]');
  const picked = await waitUntil(() => d.options(`const c = document.querySelector('[data-provider-card]'); const f = c.querySelector('[data-model-input]'); return f.value === 'mock-chat-2' && !c.querySelector('[data-model-list]') ? { field: f.value, blocked: Boolean(c.querySelector('[data-model-blocked]')), focused: document.activeElement === f } : null;`), 8000);
  check('الاختيار يملأ الحقل ويغلق القائمة ويعيد التركيز إلى الحقل، ويزول تعليل الحقل الفارغ', picked && !picked.blocked && picked.focused, picked);
  await d.click('[data-provider-card] [data-action="model-test"]');
  const probed = await waitUntil(() => d.options(`const r = document.querySelector('[data-provider-card] [data-model-test]'); return r && r.getAttribute('data-model-test') !== 'running' ? { verdict: r.getAttribute('data-model-test'), text: r.textContent } : null;`), 10000);
  check('«اختبر النموذج» بنقرة فعلية: «قبِل OpenAI النموذج في الاختبار» للنموذج المكتوب', probed && probed.verdict === 'accepted' && probed.text.includes('قبِل OpenAI النموذج في الاختبار'), probed);
  const probeRequest = posts();
  check('طلب الفحص: POST /v1/responses واحد من الخلفية بنص «ping» وحد مخرجات 16 وstore=false، بلا نظام ولا شيء من الصفحات', probeRequest.length === 1 && probeRequest[0].from === 'background' && JSON.stringify(JSON.parse(probeRequest[0].body)) === JSON.stringify({ model: 'mock-chat-2', input: 'ping', max_output_tokens: 16, store: false }), probeRequest.map((r) => r.body));

  // 4. صفحة الفحوص: الموافقة ثم الإرسال.
  await d.openGithub(JOB_URL);
  const option = await waitUntil(() => d.github(`const b = ${IN_LOG('[data-layer="possibility"] [data-action="analysis-open"]')}; return b ? b.textContent : null;`), 15000);
  check('«حلّل الفشل واقترح الإصلاح» داخل الطبقة الثالثة', option === 'حلّل الفشل واقترح الإصلاح', option);
  check('فتح صفحة الفحوص لا يرسل شيئًا إلى المزوّد', network.extra.length === 2, network.extra.length);
  await d.clickShadow(LOG, '[data-action="analysis-open"]');
  const consent = await waitUntil(() => d.github(`const c = ${IN_LOG('[data-consent]')}; return c ? { lead: c.querySelector('[data-consent-lead]')?.textContent ?? '', button: c.querySelector('[data-action="consent-confirm"]')?.textContent?.trim() ?? '', disabled: c.querySelector('[data-action="consent-confirm"]')?.disabled } : null;`), 8000);
  check('الموافقة تذكر المزوّد المختار فعلًا OpenAI ومضيفه والمودل المفحوص، لا Anthropic', consent && consent.lead.includes('OpenAI') && consent.lead.includes('api.openai.com') && consent.lead.includes('mock-chat-2') && !consent.lead.includes('Anthropic') && consent.button === 'إرسال للتحليل' && consent.disabled === false, consent);
  check('فتح الموافقة لا يرسل تحليلًا', posts().length === 1, posts().length);
  await d.clickShadow(LOG, '[data-action="consent-confirm"]');
  await waitUntil(async () => (posts().length >= 2 ? true : null), 10000);
  const result = await waitUntil(() => d.github(`const r = ${IN_LOG('[data-layer="possibility"] [data-analysis="result"]')}; return r ? { text: r.textContent, meta: r.querySelector('[data-analysis-meta]')?.textContent ?? '', literal: ${IN_LOG('[data-layer="literal"]')}?.textContent ?? '' } : null;`), 10000);
  check('نقرة الفأرة الحقيقية: طلب تحليل واحد، والنتيجة في الطبقة الثالثة موسومة بالمودل ولا تدخل الحرفية', posts().length === 2 && result && result.text.includes('احتمال يحتاج تحققًا') && result.meta.includes('mock-chat-2') && !result.literal.includes('احتمال: فشل الترجمة'), { posts: posts().length, result });
  const analysis = posts()[1];
  const sentBody = analysis ? JSON.parse(analysis.body) : {};
  check('جسم التحليل: instructions وinput وmax_output_tokens وstore=false والمودل المعروض، بلا المفتاح ولا الرمز', analysis && sentBody.model === 'mock-chat-2' && typeof sentBody.instructions === 'string' && typeof sentBody.input === 'string' && sentBody.store === false && sentBody.max_output_tokens === 4096 && !analysis.body.includes(KEY) && !analysis.body.includes(TOKEN), analysis && Object.keys(sentBody));

  // 5. تدقيق الشبكة.
  const all = openai();
  check('TEST-PRIV-05: كل طلبات OpenAI (التحقق والفحص والتحليل) من الخلفية بـAuthorization: Bearer <مفتاح OpenAI> وحده، بلا x-api-key ولا رمز GitHub ولا مفتاح Anthropic', all.length === 3 && all.every((r) => r.from === 'background' && r.headers.authorization === `Bearer ${KEY}` && !r.headers['x-api-key'] && !r.headers.cookie && !JSON.stringify(r).includes(TOKEN) && !JSON.stringify(r).includes(OTHER_KEY)), all.map((r) => ({ path: r.path, from: r.from, auth: r.headers.authorization === `Bearer ${KEY}` ? 'key' : r.headers.authorization ? 'other' : null, xApiKey: Boolean(r.headers['x-api-key']) })));
  check('لا طلب إلى api.anthropic.com أبدًا (لا تحويل ولا مشاركة مفتاح)', network.extra.every((r) => r.host === 'api.openai.com'), network.extra.map((r) => r.host));
  check('المفتاح ليس في عنوان أي طلب، ولا في طلب إلى api.github.com (ترويسة غير الرمز)', all.every((r) => !r.path.includes(KEY)) && network.api.every((c) => c.auth !== 'other'), network.api);

  // 6. حذف المفتاح: لا تحليل.
  await d.click('[data-action="key-clear"]');
  await d.click('[data-action="key-clear-confirm"]');
  await waitUntil(() => d.options(`return document.querySelector('[data-key-state]')?.getAttribute('data-key-state') === 'none' || null;`), 8000);
  await d.openGithub(JOB_URL);
  const gated = await waitUntil(() => d.github(`const l = ${IN_LOG('[data-layer="possibility"]')}; return l && l.querySelector('[data-analysis="gate"]') ? { open: Boolean(l.querySelector('[data-action="analysis-open"]')), result: Boolean(l.querySelector('[data-analysis="result"]')), literal: ${IN_LOG('[data-layer="literal"]')}?.textContent ?? '' } : null;`), 15000);
  check('بحذف مفتاح OpenAI: القسم كامل ولا خيار تحليل، ولا طلب جديد إلى المزوّد', gated && !gated.open && !gated.result && gated.literal.includes('Process completed with exit code 1.') && network.extra.length === 3, { gated, requests: network.extra.length });
}

async function run(key) {
  const target = BROWSERS[key].target;
  const extDir = derived(target);
  const checks = [];
  const result = { label: BROWSERS[key].label, checks };
  let session;
  try {
    const options = { extDir, githubReply, apiReply, authLabel, extra: { 'api.openai.com': openaiReply, 'api.anthropic.com': anthropicReply } };
    session = key === 'firefox' ? await firefoxSession(options) : await chromiumSession(key, options);
    result.browserVersion = session.browserVersion;
    await scenario(session.d, target, checks, session.network);
    result.extensionErrors = await session.extensionErrors();
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    if (session) {
      // لا قيم ترويسات ولا أجسام في الناتج: وسوم فقط.
      result.network = {
        api: session.network.api,
        provider: session.network.extra.map((r) => ({ host: r.host, method: r.method, path: r.path, from: r.from, authorization: r.headers.authorization === `Bearer ${KEY}` ? 'openai-key' : r.headers.authorization ? 'other' : null, xApiKey: Boolean(r.headers['x-api-key']), bytes: r.body?.length ?? 0 })),
        github: session.network.github,
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
  // المحجوب يُنسب بدليل: مضيف يرد في HTML صفحة GitHub المحفوظة ولا يرد في أي ملف من حزمة الإضافة هو مورد الصفحة نفسها؛ وطلبات Firefox نفسه (*.mozilla.*) ليست من الإضافة.
  const bundle = fs.readdirSync(path.join(ROOT, 'dist', BROWSERS[key].target)).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(ROOT, 'dist', BROWSERS[key].target, f), 'utf8')).join('\n');
  const blocked = r.network?.blockedExternalHosts ?? [];
  const pageOwn = blocked.filter((h) => JOB_PAGE.includes(h) && !bundle.includes(h));
  const external = blocked.filter((h) => !pageOwn.includes(h) && !(key === 'firefox' && /(^|\.)mozilla\.(net|com|org)$/.test(h)));
  if (r.network) r.network.pageResourceHosts = pageOwn;
  add('لا وجهة للإضافة غير github.com وapi.github.com وapi.openai.com (موارد صفحة GitHub المحفوظة مسرودة منفصلة)', external.length === 0, { external, pageOwn });
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
  fs.writeFileSync(path.join(outDir, 'browser-openai-check.json'), serialized);
}
console.log(`المجموع: ${all.filter((c) => c.ok).length}/${all.length}`);
if (all.some((c) => !c.ok)) process.exitCode = 1;

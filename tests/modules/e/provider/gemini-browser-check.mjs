#!/usr/bin/env node
// MJ25 (T-11.12، AC-E12، TEST-AI-08 وTEST-PRIV-05) في المتصفحات الحقيقية على الحزمة المشحونة (dist/<target> من npm run build) — **محاكاة**: مضيف
// generativelanguage.googleapis.com يُخدم محليًا بردود بأشكالها المقيسة (fixture-provider-mock)، ومعه مضيف Anthropic الوهمي، بمشغّلي MJ15
// (tests/modules/d/token/browser/drivers.mjs). لا شبكة خارجية. الرمز والمفتاحان مختلَقة بصيغ حقيقية تُركَّب وقت التشغيل ولا تُكتب في أي دليل.
//   1. بطاقة «مزوّد التحليل» الموحّدة فيها Anthropic وGoogle Gemini؛ باختيار Gemini: اسمه ومضيفه وطلب التحقق المعلن قبل الحفظ؛ ولا طلب قبل الحفظ.
//   2. حفظ مفتاح Gemini: الطلب الوحيد بعده هو التحقق المعلن GET /v1beta/models من الخلفية، والمفتاح في ترويسة x-goog-api-key لا في العنوان؛ والمرشَّحون
//      بـsupportedGenerationMethods وحدهم (DEC-13 ن-4): لا مودل خيارًا للتحليل قبل الفحص الصريح، وكلٌّ منهم بزر «افحص التوافق».
//   2ب. الفحص الصريح بنقرة: طلب POST واحد من الخلفية بنص «ping» وحده بلا محتوى؛ نجاحه يجعل المودل خيارًا، وفشله (404 «لم يعد متاحًا») لا يجعله.
//   3. حفظ مفتاح Anthropic ثم التبديل إلى Gemini: كلٌّ إلى مضيفه بمفتاحه، لا مفتاح مزوّد عند آخر ولا رمز GitHub عند أيٍّ منهما.
//   4. صفحة مهمة Actions: الموافقة تذكر Google Gemini ومضيفه ومودله؛ ولا طلب تحليل قبلها أو بنقرة برمجية؛ ونقرة حقيقية تُصدر طلب generateContent واحدًا.
//   5. حجب الأمان في الرد: يُعرض سببًا لا تحليلًا، وطلب واحد بلا إعادة تلقائية ولا تحويل إلى مزوّد آخر.
//   6. تدقيق الشبكة: لا وجهة غير github.com وapi.github.com ومضيفَي المزوّدَين؛ ولا سرّ في الكونسول ولا الناتج؛ وحذف المفتاح يُبقي القسم كاملًا بلا تحليل.
// صلاحيات المضيفات ممنوحة آليًا في نسخة مشتقة (نافذة الإذن لا تُقبل آليًا)؛ وطلبها في نقرة الحفظ يقيسه card.test.tsx. وفي Firefox تُطلب موافقة
// «مشاركة محتوى المواقع» (websiteContent) الاختيارية مع نقرة الحفظ كما في الحزمة (AD-15).
// الاستعمال: node tests/modules/e/provider/gemini-browser-check.mjs [chrome edge brave firefox] [--out-dir evidence/T-11.12]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, firefoxSession, sleep, waitUntil } from '../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.filter((a) => BROWSERS[a]);

const HOST = 'generativelanguage.googleapis.com';
const ANTHROPIC_HOST = 'api.anthropic.com';
const TOKEN = ['github', 'pat', `11GEMMIJHARFAKE00000_${'xFakeGeminiCheckOnly'.repeat(3).slice(0, 59)}`].join('_');
const A_KEY = ['sk', 'ant', 'api03', 'GemCheckAnthropicFake'.repeat(3)].join('-');
const KEY = ['AIza', 'Sy', 'GemBrowserCheckFakeKey0000000000x'].join('');
const SECRET_RE = /github_pat_[A-Za-z0-9_]{20,}|sk-ant-api03-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{35}/;
const hasSecret = (value) => SECRET_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));

const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/d/token/fixtures/fixture-token-states.json'), 'utf8'));
const JOB_URL = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
const JOB_PAGE = fs.readFileSync(path.join(ROOT, 'fixtures/logs/gh-job-failed.html'), 'utf8');

const githubReply = (pathname) => (pathname === new URL(JOB_URL).pathname ? { status: 200, type: 'text/html; charset=utf-8', body: JOB_PAGE } : { status: 404, type: 'text/plain', body: 'not found' });
const apiReply = (pathAndQuery, authorization) => (pathAndQuery.startsWith('/rate_limit') && authorization === `Bearer ${TOKEN}` ? FIXTURE.states.valid : FIXTURE.states['not-found']);
const authLabel = (value) => (value ? (value === `Bearer ${TOKEN}` ? 'saved' : 'other') : null);

const GEMINI_MODELS = [
  { name: 'models/mock-gem-2', displayName: 'Mock Gem 2', inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ['generateContent', 'countTokens'] },
  { name: 'models/mock-gem-embed', displayName: 'Mock Gem Embed', inputTokenLimit: 2048, outputTokenLimit: 1, supportedGenerationMethods: ['embedContent'] },
  { name: 'models/mock-gem-flash', displayName: 'Mock Gem Flash', inputTokenLimit: 131072, outputTokenLimit: 8192, supportedGenerationMethods: ['generateContent'] },
];
const ANTHROPIC_MODELS = [{ type: 'model', id: 'mock-sonnet-2', display_name: 'Mock Sonnet 2', line: 'sonnet', lifecycle: 'active', max_tokens: 64000 }];

/** ما يردّه مضيف Gemini الوهمي للتحليل: 'ok' بالبنية المطلوبة تقتبس سطرًا من البرومبت، أو 'blocked' بحجب أمان معلن. */
let geminiMode = 'ok';
function geminiReply(entry) {
  const pathname = entry.path.split('?')[0];
  if (pathname === '/v1beta/models') return { status: 200, body: { models: GEMINI_MODELS } };
  if (/^\/v1beta\/models\/[^/:]+:generateContent$/.test(pathname)) {
    const sent = JSON.parse(entry.body ?? '{}');
    const model = pathname.split('/')[3].split(':')[0];
    // الفحص الصريح: «ping» وحده بلا تعليمات نظام. المودل mock-gem-flash مما لم يعد متاحًا (كما قِيس عند Google).
    if (sent.contents?.[0]?.parts?.[0]?.text === 'ping' && !sent.systemInstruction) {
      if (model === 'mock-gem-flash') return { status: 404, body: { error: { code: 404, status: 'NOT_FOUND', message: 'This model models/mock-gem-flash is no longer available to new users.' } } };
      return { status: 200, body: { candidates: [{ content: { role: 'model', parts: [{ text: 'pong' }] }, finishReason: 'STOP' }], modelVersion: model } };
    }
    if (geminiMode === 'blocked') return { status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } };
    const prompt = JSON.parse(entry.body ?? '{}').contents?.[0]?.parts?.[0]?.text ?? '';
    const quote = prompt.split('\n').find((l) => /exit code/i.test(l))?.replace(/^[>\s|0-9-]+/, '').trim() ?? '';
    const text = JSON.stringify({ summary: 'فشلت الخطوة 14.', findings: [{ text: 'احتمال: فشل الترجمة في Compile & Hygiene.', evidence: [quote] }], next_steps: ['افتح سجل الخطوة 14.'], missing: ['نص السجل محجوب.'] });
    return { status: 200, body: { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 80 }, modelVersion: 'mock-gem-2-001' } };
  }
  return { status: 404, body: { error: { code: 404, status: 'NOT_FOUND', message: 'not found' } } };
}
function anthropicReply(entry) {
  if (entry.path.startsWith('/v1/models')) return { status: 200, body: { data: ANTHROPIC_MODELS, has_more: false } };
  return { status: 404, body: { type: 'error', error: { type: 'not_found_error', message: 'not found' } } };
}

/** نسخة من dist/<target>: الشيفرة كما هي، والمضيفات الثلاثة ممنوحة آليًا (لا نافذة إذن)، ولا صلاحية اختيارية. */
function derived(target) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-mj25-${target}-`));
  fs.cpSync(path.join(ROOT, 'dist', target), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.github.com/*', `https://${ANTHROPIC_HOST}/*`, `https://${HOST}/*`])];
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
    providers: [...(c.querySelector('[data-provider-select]')?.options ?? [])].map((o) => o.value),
    head: c.querySelector('[data-provider-key] h4')?.textContent ?? '',
    health: c.querySelector('[data-provider-key]')?.getAttribute('data-health') ?? null,
    key: c.querySelector('[data-key-state]')?.getAttribute('data-key-state') ?? null,
    host: c.querySelector('[data-provider-meta]')?.textContent ?? '',
    announce: c.querySelector('[data-verify-request]')?.textContent ?? '',
    models: [...(c.querySelector('[data-model-select]')?.options ?? [])].map((o) => o.value).filter(Boolean),
    candidates: [...c.querySelectorAll('[data-action="model-probe"]')].map((b) => b.getAttribute('data-model')),
    blocked: Boolean(c.querySelector('[data-model-blocked]')),
    probeNote: c.querySelector('[data-model-probe]')?.textContent ?? '',
    text: c.textContent ?? '',
    source: c.querySelector('[data-models-source]')?.textContent ?? '',
    others: c.querySelector('[data-other-providers]')?.textContent ?? '',
    cards: document.querySelectorAll('[data-provider-card]').length,
  };
`;
const SELECT = (id) => `const s = document.querySelector('#mj-provider-select'); s.value = ${JSON.stringify(id)}; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); return true;`;

async function scenario(d, target, checks, network) {
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 500)}`}`);
  };
  const on = (host) => network.extra.filter((r) => r.host === host);
  const gemini = () => on(HOST);
  const posts = () => gemini().filter((r) => r.method === 'POST' && !/"text":"ping"/.test(r.body ?? ''));
  const pings = () => gemini().filter((r) => r.method === 'POST' && /"text":"ping"/.test(r.body ?? ''));
  const card = () => d.options(READ_CARD);
  const until = (want, ms = 12000) => waitUntil(async () => {
    const c = await card();
    return c && want(c) ? c : null;
  }, ms);

  // 1. البطاقة.
  const start = await until((c) => c.health !== 'checking');
  check('AC-E10 (٣) وAC-E12: بطاقة «مزوّد التحليل» واحدة، وقائمتها فيها Anthropic وGoogle Gemini المدموجان', start?.cards === 1 && start.providers.join(',') === 'anthropic,gemini', start);
  await d.options(SELECT('gemini'));
  const picked = await until((c) => c.provider === 'gemini' && c.key === 'none');
  check('اختيار Google Gemini: مفتاحه «لا مفتاح»، ومضيفه، وطلب التحقق المعلن قبل الحفظ يذكر الطلب والمضيف ولا يحمل شيئًا من الصفحات', Boolean(picked) && picked.head === 'مفتاح Google Gemini' && picked.host.includes(HOST) && picked.announce.includes(`GET https://${HOST}/v1beta/models`) && picked.announce.includes('لا تبدأ أي تحليل') && !picked.announce.includes(KEY), picked);
  check('لا طلب إلى أي مزوّد قبل الحفظ', network.extra.length === 0, network.extra.length);

  // 2. الرمز ثم مفتاح Gemini.
  await d.fill('#mj-token-input', TOKEN);
  await d.click('[data-action="token-save"]');
  await waitUntil(() => d.options(`return document.querySelector('[data-connection="github-token"] [data-health]')?.getAttribute('data-health') === 'healthy' || null;`), 10000);
  await d.fill('#mj-key-input', KEY);
  await d.click('[data-action="key-save"]');
  const healthy = await until((c) => c.provider === 'gemini' && c.health === 'healthy' && c.candidates.length > 0);
  if (target === 'firefox') {
    const perms = await d.options(`return { all: JSON.parse(globalThis_.JSON.stringify(await globalThis_.browser.permissions.getAll())), shown: document.querySelector('[data-provider-permission]')?.getAttribute('data-provider-permission') ?? null };`);
    check('Firefox (AD-15): نقرة الحفظ منحت موافقة «مشاركة محتوى المواقع» (websiteContent) مع المضيف، والبطاقة «ممنوحتان»', perms?.all?.data_collection?.includes('websiteContent') && perms.shown === 'granted', perms);
  }
  await sleep(1200);
  const [verify] = gemini();
  check('AC-E12 (٢): بعد حفظ المفتاح طلب واحد إلى Gemini هو التحقق المعلن GET /v1beta/models من الخلفية، ولا تحليل', gemini().length === 1 && verify?.method === 'GET' && verify.path === '/v1beta/models' && verify.query === '?pageSize=1000' && verify.from === 'background', gemini().map((r) => ({ m: r.method, p: r.path, q: r.query, from: r.from })));
  check('AC-E12 (٤): المفتاح في ترويسة x-goog-api-key وحدها لا في العنوان ولا الجسم؛ ولا Authorization ولا رمز GitHub ولا مفتاح Anthropic', verify?.headers['x-goog-api-key'] === KEY && !JSON.stringify([verify.path, verify.query, verify.body]).includes(KEY) && !verify.headers.authorization && !verify.headers['x-api-key'] && !JSON.stringify(verify).includes(TOKEN) && !JSON.stringify(verify).includes(A_KEY), { key: verify?.headers['x-goog-api-key'] === KEY ? 'ok' : 'other', auth: Boolean(verify?.headers.authorization) });
  check('AC-E12 (٣) وDEC-13 ن-4: المرشَّحون بـsupportedGenerationMethods وحدهم (بلا مودل التضمين) كلٌّ بزر «افحص التوافق»، ولا مودل خيارًا للتحليل ولا افتراضي قبل الفحص (BLK-MODEL-COMPAT)، والبطاقة تعلن طلب الفحص قبل إرساله', Boolean(healthy) && healthy.candidates.join(',') === 'mock-gem-2,mock-gem-flash' && healthy.models.length === 0 && healthy.blocked && healthy.probeNote.includes('«ping» وحده') && healthy.source.includes(`${HOST}/v1beta/models`), healthy && { candidates: healthy.candidates, models: healthy.models, blocked: healthy.blocked, source: healthy.source });
  check('لا فحص تلقائي: طلب Gemini الوحيد حتى الآن هو التحقق', gemini().length === 1 && pings().length === 0, gemini().length);

  // 2ب. الفحص الصريح بنقرتين: الناجح ثم الفاشل.
  await d.click('[data-action="model-probe"][data-model="mock-gem-2"]');
  const probed = await until((c) => c.provider === 'gemini' && c.models.includes('mock-gem-2'));
  const [ping] = pings();
  check('الفحص الصريح الناجح: طلب POST واحد من الخلفية إلى generateContent للمودل بنص «ping» وحده (لا محتوى ولا تعليمات نظام) والمفتاح في الترويسة وحدها؛ فصار المودل خيارًا', Boolean(probed) && pings().length === 1 && ping.path === '/v1beta/models/mock-gem-2:generateContent' && ping.from === 'background' && ping.headers['x-goog-api-key'] === KEY && JSON.stringify(JSON.parse(ping.body)) === JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 64 } }) && !ping.body.includes('exit code') && !ping.body.includes(TOKEN), { probed: probed && probed.models, ping: ping && { path: ping.path, from: ping.from } });
  await d.click('[data-action="model-probe"][data-model="mock-gem-flash"]');
  const failedProbe = await waitUntil(async () => {
    const c = await card();
    return c && pings().length === 2 && c.text.includes('لم يثبت توافق mock-gem-flash') ? c : null;
  }, 12000);
  check('الفحص الفاشل (404 «لم يعد متاحًا للمستخدمين الجدد»): يُعرض سببه ولا يصير المودل خيارًا؛ والقائمة مودل واحد', Boolean(failedProbe) && failedProbe.text.includes('no longer available') && failedProbe.models.join(',') === 'mock-gem-2' && failedProbe.candidates.join(',') === 'mock-gem-flash', failedProbe && { models: failedProbe.models, candidates: failedProbe.candidates });

  // 3. مفتاح Anthropic وتبديل المزوّد.
  await d.options(SELECT('anthropic'));
  await until((c) => c.provider === 'anthropic' && c.key === 'none');
  await d.fill('#mj-key-input', A_KEY);
  await d.click('[data-action="key-save"]');
  await until((c) => c.provider === 'anthropic' && c.health === 'healthy');
  await sleep(600);
  check('كل مفتاح إلى مضيفه: طلب Anthropic واحد بمفتاحه (x-api-key) إلى مضيفه، ولم يصل Gemini طلب جديد', on(ANTHROPIC_HOST).length === 1 && on(ANTHROPIC_HOST)[0].headers['x-api-key'] === A_KEY && !on(ANTHROPIC_HOST)[0].headers['x-goog-api-key'] && gemini().length === 3, { anthropic: on(ANTHROPIC_HOST).length, gemini: gemini().length });
  await d.options(SELECT('gemini'));
  const back = await until((c) => c.provider === 'gemini' && c.health === 'healthy' && c.models.includes('mock-gem-2'));
  check('العودة إلى Gemini: مفتاحه «سليم» ومودلاته كما هي، وملخص المزوّدين يذكر Anthropic سليمًا؛ والتبديل لا يرسل شيئًا', Boolean(back) && back.models.join(',') === 'mock-gem-2' && back.others.includes('Anthropic') && gemini().length === 3 && on(ANTHROPIC_HOST).length === 1, back && { models: back.models, others: back.others, health: back.health, g: gemini().length, a: on(ANTHROPIC_HOST).length });

  // 4. صفحة الفحوص.
  await d.openGithub(JOB_URL);
  await waitUntil(() => d.github(`return Boolean(${IN_LOG('[data-action="analysis-open"]')}) || null;`), 15000);
  check('فتح صفحة الفحوص لا يرسل شيئًا إلى المزوّدين', network.extra.length === 4, network.extra.length);
  await d.github(`${IN_LOG('[data-action="analysis-open"]')}?.click(); ${IN_LOG('[data-action="analysis-open"]')}?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); return true;`);
  await sleep(700);
  check('AC-E9 (٧): النقر البرمجي من عالم الصفحة لا يفتح الموافقة', !(await d.github(`return Boolean(${IN_LOG('[data-consent]')});`)), null);
  await d.clickShadow(LOG, '[data-action="analysis-open"]');
  const consent = await waitUntil(() => d.github(`const c = ${IN_LOG('[data-consent]')}; return c ? { title: c.querySelector('#mj-consent-title')?.textContent ?? '', lead: c.querySelector('[data-consent-lead]')?.textContent ?? '', destination: c.querySelector('[data-consent-row="destination"]')?.textContent ?? '', text: c.textContent, button: c.querySelector('[data-action="consent-confirm"]')?.textContent?.trim() ?? '', disabled: c.querySelector('[data-action="consent-confirm"]')?.disabled } : null;`), 8000);
  check('الموافقة تذكر المختار فعلًا: Google Gemini ومضيفه ومودله، ولا ذكر لـAnthropic، والزر «إرسال للتحليل»', Boolean(consent) && consent.title === 'إرسال هذا إلى Google Gemini للتحليل؟' && consent.lead.includes(HOST) && consent.lead.includes('Mock Gem 2') && consent.destination.includes('Google Gemini · Mock Gem 2') && !consent.text.includes('Anthropic') && consent.button === 'إرسال للتحليل' && consent.disabled === false, consent);
  check('فتح الموافقة لا يرسل شيئًا', posts().length === 0, posts().length);
  await d.github(`const b = ${IN_LOG('[data-action="consent-confirm"]')}; b?.click(); b?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); b?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true;`);
  await sleep(1200);
  check('AC-E9 (٧): «إرسال للتحليل» بالنقر البرمجي لا يُصدر طلبًا', posts().length === 0, posts().length);
  await d.clickShadow(LOG, '[data-action="consent-confirm"]');
  await waitUntil(async () => (posts().length >= 1 ? true : null), 10000);
  const r1 = await waitUntil(() => d.github(`const r = ${IN_LOG('[data-layer="possibility"] [data-analysis="result"]')}; return r ? { text: r.textContent, meta: r.querySelector('[data-analysis-meta]')?.textContent ?? '' } : null;`), 10000);
  const [post] = posts();
  check('AC-E12 (٢): نقرة حقيقية تُصدر طلب generateContent واحدًا للمودل المعروض من الخلفية، والنتيجة في الطبقة الثالثة موسومة «احتمال» بمودلها ومضيفها', posts().length === 1 && post.path === '/v1beta/models/mock-gem-2:generateContent' && post.from === 'background' && r1 && r1.text.includes('احتمال يحتاج تحققًا') && r1.meta.includes('mock-gem-2-001') && r1.meta.includes(HOST), { posts: posts().length, path: post?.path, r1 });
  check('AC-E12 (٤): المفتاح في الترويسة وحدها؛ والجسم بلا المفتاح ولا الرمز ولا مفتاح Anthropic، وبتعليمات النظام وحد المخرجات', post?.headers['x-goog-api-key'] === KEY && !post.query && !JSON.stringify([post.path, post.query, post.body]).includes(KEY) && !post.body.includes(TOKEN) && !post.body.includes(A_KEY) && JSON.parse(post.body).systemInstruction?.parts?.[0]?.text && JSON.parse(post.body).generationConfig?.maxOutputTokens > 0, { query: post?.query });

  // 5. حجب الأمان.
  geminiMode = 'blocked';
  await d.clickShadow(LOG, '[data-action="analysis-again"]');
  await waitUntil(() => d.github(`return Boolean(${IN_LOG('[data-consent]')}) || null;`), 8000);
  await d.clickShadow(LOG, '[data-action="consent-confirm"]');
  const failed = await waitUntil(() => d.github(`const f = ${IN_LOG('[data-layer="possibility"] [data-analysis="failed"]')}; return f ? { text: f.textContent, result: Boolean(${IN_LOG('[data-analysis="result"]')}) } : null;`), 10000);
  await sleep(1500);
  check('حجب الأمان يُعرض سببًا واضحًا (SAFETY) لا تحليلًا، وطلب واحد بلا إعادة تلقائية ولا تحويل إلى Anthropic', Boolean(failed) && failed.text.includes('حجبت Google') && failed.text.includes('SAFETY') && !failed.result && posts().length === 2 && on(ANTHROPIC_HOST).length === 1, { failed, posts: posts().length, anthropic: on(ANTHROPIC_HOST).length });
  geminiMode = 'ok';

  // 6. تدقيق الشبكة.
  const g = gemini();
  const a = on(ANTHROPIC_HOST);
  check('TEST-PRIV-05: كل طلبات Gemini إلى مضيفه من الخلفية بمفتاحه وحده، بلا مفتاح مزوّد آخر ولا رمز GitHub ولا Authorization', g.length === 5 && g.every((r) => r.from === 'background' && r.headers['x-goog-api-key'] === KEY && !r.headers.authorization && !r.headers['x-api-key'] && !JSON.stringify(r).includes(TOKEN) && !JSON.stringify(r).includes(A_KEY)), g.map((r) => ({ path: r.path, from: r.from })));
  check('TEST-PRIV-05: طلب Anthropic واحد بمفتاحه وحده، بلا مفتاح Gemini ولا الرمز', a.length === 1 && a.every((r) => r.headers['x-api-key'] === A_KEY && !JSON.stringify(r).includes(KEY) && !JSON.stringify(r).includes(TOKEN)), a.length);
  check('لا مفتاح ولا رمز في أي طلب إلى api.github.com (ترويسة غير الرمز)', network.api.every((c) => c.auth !== 'other'), network.api);

  // 7. حذف مفتاح Gemini.
  await d.options(SELECT('gemini'));
  await until((c) => c.provider === 'gemini' && c.key !== 'none');
  await d.click('[data-action="key-clear"]');
  await d.click('[data-action="key-clear-confirm"]');
  await until((c) => c.provider === 'gemini' && c.key === 'none');
  await d.openGithub(JOB_URL);
  const gated = await waitUntil(() => d.github(`const l = ${IN_LOG('[data-layer="possibility"]')}; return l && l.querySelector('[data-analysis="gate"]') ? { text: l.textContent, open: Boolean(l.querySelector('[data-action="analysis-open"]')), result: Boolean(l.querySelector('[data-analysis="result"]')), literal: ${IN_LOG('[data-layer="literal"]')}?.textContent ?? '' } : null;`), 15000);
  check('AC-D9: بحذف مفتاح المختار يبقى القسم كاملًا ولا نص تحليل ولا خيار إرسال، ولا طلب جديد إلى أي مزوّد', gated && !gated.open && !gated.result && gated.literal.includes('Process completed with exit code 1.') && network.extra.length === 6, { gated, requests: network.extra.length });
}

async function run(key) {
  const target = BROWSERS[key].target;
  const extDir = derived(target);
  const checks = [];
  const result = { label: BROWSERS[key].label, checks };
  let session;
  geminiMode = 'ok';
  try {
    const options = { extDir, githubReply, apiReply, authLabel, extra: { [HOST]: geminiReply, [ANTHROPIC_HOST]: anthropicReply } };
    session = key === 'firefox' ? await firefoxSession(options) : await chromiumSession(key, options);
    result.browserVersion = session.browserVersion;
    await scenario(session.d, target, checks, withQuery(session.network));
    result.extensionErrors = await session.extensionErrors();
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    if (session) {
      // لا قيم ترويسات ولا أجسام في الناتج: وسوم فقط.
      const tag = (r) => (r.headers['x-goog-api-key'] === KEY ? 'gemini-key' : r.headers['x-api-key'] === A_KEY ? 'anthropic-key' : r.headers['x-goog-api-key'] || r.headers['x-api-key'] ? 'other' : null);
      result.network = {
        api: session.network.api,
        providers: session.network.extra.map((r) => ({ host: r.host, method: r.method, path: r.path, query: r.query ?? (r.path.includes('?') ? r.path.slice(r.path.indexOf('?')) : ''), from: r.from, key: tag(r), authorization: Boolean(r.headers.authorization), bytes: r.body?.length ?? 0 })),
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

/** يفصل مسار الطلب عن استعلامه (الدرايفر يسجّل المسار والاستعلام معًا) ليُفحص أن المفتاح ليس في أيٍّ منهما. */
function withQuery(network) {
  return new Proxy(network, {
    get(target, prop) {
      if (prop !== 'extra') return target[prop];
      return target.extra.map((r) => {
        if (r.query !== undefined || !r.path.includes('?')) return { ...r, query: r.query ?? '' };
        const at = r.path.indexOf('?');
        return { ...r, path: r.path.slice(0, at), query: r.path.slice(at) };
      });
    },
  });
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
  // المحجوب يُنسب بدليل: مضيف يرد في HTML صفحة GitHub المحفوظة ولا يرد في أي ملف من حزمة الإضافة هو مورد الصفحة نفسها؛ وطلبات Firefox نفسه ليست من الإضافة.
  const bundle = fs.readdirSync(path.join(ROOT, 'dist', BROWSERS[key].target)).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(ROOT, 'dist', BROWSERS[key].target, f), 'utf8')).join('\n');
  const blocked = r.network?.blockedExternalHosts ?? [];
  const pageOwn = blocked.filter((h) => JOB_PAGE.includes(h) && !bundle.includes(h));
  const external = blocked.filter((h) => !pageOwn.includes(h) && !(key === 'firefox' && /(^|\.)mozilla\.(net|com|org)$/.test(h)));
  if (r.network) r.network.pageResourceHosts = pageOwn;
  add(`TEST-PRIV-05: لا وجهة للإضافة غير github.com وapi.github.com و${ANTHROPIC_HOST} و${HOST} (موارد صفحة GitHub المحفوظة مسرودة منفصلة)`, external.length === 0 && (r.network?.providers ?? []).every((p) => [HOST, ANTHROPIC_HOST].includes(p.host)), { external, pageOwn });
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
  fs.writeFileSync(path.join(outDir, 'browser-gemini-check.json'), serialized);
}
console.log(`المجموع (محاكاة): ${all.filter((c) => c.ok).length}/${all.length}`);
if (all.some((c) => !c.ok)) process.exitCode = 1;

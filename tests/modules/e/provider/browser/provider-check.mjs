#!/usr/bin/env node
// TEST-AI-01 وTEST-PRIV-04 وTEST-AI-03 (e2e) وAC-E9 (٧) في المتصفحات الحقيقية على الحزمة المشحونة (dist/<target> من npm run build)، بمشغّلي MJ15
// (tests/modules/d/token/browser/drivers.mjs) ومعهما مضيف المزوّد محليًا (fixture-provider-mock): لا شبكة خارجية، وكل طلب إلى api.anthropic.com
// يُسجَّل بطريقته ومساره وترويساته وجسمه. والرمز والمفتاح مختلَقان بصيغة حقيقية يُولَّدان وقت التشغيل ولا يُكتبان في أي دليل.
//   1. الإعدادات: بطاقة المفتاح تعلن طلب التحقق قبل الحفظ، و«لماذا المفتاح؟» فيها؛ ولا طلب إلى المزوّد قبل الحفظ.
//   2. حفظ الرمز ثم المفتاح بالواجهة: الطلب الوحيد إلى المزوّد بعد إضافة المفتاح هو التحقق المعلن (GET /v1/models)، والمودلات المتوافقة في قائمة
//      المودل داخل بطاقة «مزوّد التحليل» الموحّدة بمصدرها (MJ23، AC-E10 (٣))؛ ولا قسم «إعدادات التحليل» منفصل؛ وفتح صفحة الفحوص لا يرسل شيئًا.
//   3. صفحة مهمة Actions محفوظة: «حلّل…» والإرسال بالنقر البرمجي من عالم الصفحة لا يفتحان شيئًا ولا يرسلان؛ ونقرة الفأرة وEnter وSpace (حقيقية)
//      تُصدر كلٌّ منها طلبًا واحدًا بعد الموافقة، والنتيجة في الطبقة الثالثة موسومة بمودلها ووقتها.
//   4. تدقيق الشبكة: لا وجهة غير github.com وapi.github.com وapi.anthropic.com؛ وطلبات المزوّد من الخلفية بالمفتاح وحده (x-api-key) بلا رمز GitHub
//      ولا Authorization؛ ولا مفتاح في طلب إلى GitHub؛ ولا سرّ في الكونسول ولا الناتج.
//   5. بحذف المفتاح: القسم كامل بلا نص تحليل، والخيار معلَّلًا.
// صلاحيتا api.github.com وapi.anthropic.com ممنوحتان في نسخة مشتقة (نافذة الإذن لا تُقبل آليًا)؛ وطلبها في نقرة الحفظ يقيسه ui.test.tsx.
// وفي Firefox تبقى موافقة «مشاركة محتوى المواقع» (websiteContent) اختيارية كما في الحزمة (AD-15): لا تُمنح قبل الحفظ فتُعرض الصلاحية «غير ممنوحتين»،
// وتطلبها نقرة الحفظ الحقيقية مع المضيف (extensions.webextOptionalPermissionPrompts=false يقبل الطلب بلا نافذة)، ولا تحليل قبلها.
// MJ23 (TEST-AI-10): انحدار Anthropic على البطاقة الموحّدة، والسجل المشحون فيه Anthropic وحده (لا مزوّد بلا محوّل مدموج)، ونص Firefox يذكر تسمية «المطوِّر».
// الاستعمال: node tests/modules/e/provider/browser/provider-check.mjs [chrome edge brave firefox] [--out-dir evidence/T-11.6]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, firefoxSession, sleep, waitUntil } from '../../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.filter((a) => BROWSERS[a]);

const TOKEN = ['github', 'pat', `11PROVMIJHARFAKE00000_${'xFakeProviderCheckOnly'.repeat(3).slice(0, 59)}`].join('_');
const KEY = ['sk', 'ant', 'api03', 'ProvCheckFakeKeyOnly'.repeat(3)].join('-');
const SECRET_RE = /github_pat_[A-Za-z0-9_]{20,}|sk-ant-api03-[A-Za-z0-9_-]{20,}/;
const hasSecret = (value) => SECRET_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));

const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/d/token/fixtures/fixture-token-states.json'), 'utf8'));
const JOB_URL = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
const JOB_PAGE = fs.readFileSync(path.join(ROOT, 'fixtures/logs/gh-job-failed.html'), 'utf8');
const MODELS = [
  { type: 'model', id: 'mock-sonnet-2', display_name: 'Mock Sonnet 2', line: 'sonnet', lifecycle: 'active', max_tokens: 64000 },
  { type: 'model', id: 'mock-haiku-2', display_name: 'Mock Haiku 2', line: 'haiku', lifecycle: 'active', max_tokens: 2048 },
];

const githubReply = (pathname) => (pathname === new URL(JOB_URL).pathname ? { status: 200, type: 'text/html; charset=utf-8', body: JOB_PAGE } : { status: 404, type: 'text/plain', body: 'not found' });
const apiReply = (pathAndQuery, authorization) => (pathAndQuery.startsWith('/rate_limit') && authorization === `Bearer ${TOKEN}` ? FIXTURE.states.valid : FIXTURE.states['not-found']);
const authLabel = (value) => (value ? (value === `Bearer ${TOKEN}` ? 'saved' : 'other') : null);

/** رد المزوّد الوهمي: المودلات، وتحليل بالبنية المطلوبة يقتبس سطرًا من البرومبت المرسل. */
function anthropicReply(entry) {
  if (entry.path.startsWith('/v1/models')) return { status: 200, body: { data: MODELS, has_more: false } };
  if (entry.path === '/v1/messages') {
    const sent = JSON.parse(entry.body ?? '{}');
    const prompt = sent.messages?.[0]?.content ?? '';
    const quote = prompt.split('\n').find((l) => /exit code/i.test(l))?.replace(/^[>\s|0-9-]+/, '').trim() ?? '';
    const text = JSON.stringify({ summary: 'فشلت الخطوة 14.', findings: [{ text: 'احتمال: فشل الترجمة في Compile & Hygiene.', evidence: [quote] }], next_steps: ['افتح سجل الخطوة 14.'], missing: ['نص السجل محجوب.'] });
    return { status: 200, body: { id: 'msg_mock', type: 'message', role: 'assistant', model: sent.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 80 } } };
  }
  return { status: 404, body: { type: 'error', error: { type: 'not_found_error', message: 'not found' } } };
}

/** نسخة من dist/<target>: الشيفرة كما هي، والمضيفان ممنوحان آليًا (لا نافذة إذن)، ولا صلاحية اختيارية. */
function derived(target) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mijhar-mj21-${target}-`));
  fs.cpSync(path.join(ROOT, 'dist', target), dir, { recursive: true });
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.github.com/*', 'https://api.anthropic.com/*'])];
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
  const posts = () => network.extra.filter((r) => r.method === 'POST');

  // 1. الإعدادات.
  const card = await waitUntil(() => d.options(`const c = document.querySelector('[data-connection="provider-key"]'); const g = c?.querySelector('[data-provider-permission]')?.getAttribute('data-provider-permission'); return c && g && g !== 'checking' ? { permission: g, announce: c.querySelector('[data-verify-request]')?.textContent ?? '', guide: c.querySelector('[data-action="provider-key-guide"]')?.getAttribute('href') ?? null, input: Boolean(c.querySelector('#mj-key-input')), content: c.querySelector('[data-content-consent]')?.textContent ?? null, cards: document.querySelectorAll('[data-provider-card]').length, providers: [...(c.querySelector('[data-provider-select]')?.options ?? [])].map((o) => o.value), model: Boolean(c.querySelector('[data-provider-card] [data-model-select]')), rules: Boolean(c.querySelector('[data-provider-rules]')), oldSection: Boolean(document.querySelector('[data-provider-settings]')), title: c.querySelector('h3')?.textContent ?? '' } : null;`), 10000);
  check('بطاقة المفتاح: حقله، وطلب التحقق معلن قبل الحفظ، و«لماذا المفتاح؟» فيها', card?.input && card.announce.includes('GET https://api.anthropic.com/v1/models') && card.announce.includes('لا تبدأ أي تحليل') && card.guide === '#guide/provider-key', card);
  check('AC-E10 (٣): بطاقة «مزوّد التحليل» واحدة فيها قائمة المزوّد (Anthropic وحده المدموج) والمودل والقواعد، ولا قسم «إعدادات التحليل» منفصل', card?.cards === 1 && card.title === 'مزوّد التحليل' && card.providers.join(',') === 'anthropic' && card.model && card.rules && !card.oldSection, card);
  if (target === 'firefox') check('Firefox (AD-15): قبل الحفظ صلاحية المضيف وحدها لا تكفي («غير ممنوحتين»)، والبطاقة تعلن موافقة «مشاركة محتوى المواقع» (websiteContent) الواحدة لكل المزوّدين وتسمية Firefox «مطوِّر الامتداد» (O-25)', card?.permission === 'denied' && card.content?.includes('websiteContent') && card.content.includes('واحدة لكل المزوّدين') && card.content.includes('مطوِّر الامتداد'), card);
  else check('عائلة Chromium: لا موافقة محتوى مواقع تُعلن ولا تُطلب', card?.permission === 'granted' && card.content === null, card);
  check('لا طلب إلى المزوّد قبل الحفظ', network.extra.length === 0, network.extra);

  // 2. الرمز ثم المفتاح بالواجهة.
  await d.fill('#mj-token-input', TOKEN);
  await d.click('[data-action="token-save"]');
  await waitUntil(() => d.options(`return document.querySelector('[data-connection="github-token"] [data-health]')?.getAttribute('data-health') === 'healthy' || null;`), 10000);
  await d.fill('#mj-key-input', KEY);
  await d.click('[data-action="key-save"]');
  const verified = await waitUntil(() => d.options(`const n = document.querySelector('[data-key-check]'); return n?.getAttribute('data-health') === 'healthy' ? { text: n.textContent, html: document.documentElement.outerHTML } : null;`), 12000);
  check('المفتاح «سليم» بعد التحقق، ولا مفتاح في DOM الإعدادات', verified && !hasSecret(verified.html), verified && { text: verified.text });
  if (target === 'firefox') {
    const perms = await d.options(`return { all: JSON.parse(globalThis_.JSON.stringify(await globalThis_.browser.permissions.getAll())), shown: document.querySelector('[data-provider-permission]')?.getAttribute('data-provider-permission') ?? null };`);
    check('Firefox (AD-15): نقرة الحفظ نفسها منحت موافقة «مشاركة محتوى المواقع» (websiteContent) مع صلاحية المضيف، والبطاقة «ممنوحتان»', perms?.all?.data_collection?.includes('websiteContent') && perms.shown === 'granted', perms);
  }
  await sleep(1500);
  const afterAdd = network.extra.map((r) => ({ method: r.method, path: r.path, from: r.from }));
  check('AC-E9 (١): بعد إضافة المفتاح طلب واحد إلى المزوّد هو التحقق المعلن GET /v1/models من الخلفية، ولا تحليل', afterAdd.length === 1 && afterAdd[0].method === 'GET' && afterAdd[0].path === '/v1/models?limit=100' && afterAdd[0].from === 'background', afterAdd);
  const settings = await waitUntil(() => d.options(`const s = document.querySelector('[data-provider-card]'); const o = [...(s?.querySelectorAll('[data-model-select] option') ?? [])].map((x) => x.value).filter(Boolean); return o.length ? { options: o, source: s.querySelector('[data-models-source]')?.textContent ?? '' } : null;`), 8000);
  check('AC-E9 (٣) وAC-E10 (٣): المودلات المتوافقة في البطاقة الموحّدة من المزوّد وقت التشغيل بمصدرها', settings && settings.options.join(',') === 'mock-sonnet-2,mock-haiku-2' && settings.source.includes('api.anthropic.com/v1/models'), settings);

  // 3. صفحة الفحوص.
  await d.openGithub(JOB_URL);
  const option = await waitUntil(() => d.github(`const b = ${IN_LOG('[data-layer="possibility"] [data-action="analysis-open"]')}; return b ? b.textContent : null;`), 15000);
  check('«حلّل الفشل واقترح الإصلاح» داخل الطبقة الثالثة من شرح السجل', option === 'حلّل الفشل واقترح الإصلاح', option);
  check('فتح صفحة الفحوص لا يرسل شيئًا إلى المزوّد', network.extra.length === 1, network.extra.length);

  await d.github(`${IN_LOG('[data-action="analysis-open"]')}?.click(); ${IN_LOG('[data-action="analysis-open"]')}?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); return true;`);
  await sleep(700);
  check('AC-E9 (٧): النقر البرمجي من عالم الصفحة لا يفتح الموافقة', !(await d.github(`return Boolean(${IN_LOG('[data-consent]')});`)), null);
  await d.clickShadow(LOG, '[data-action="analysis-open"]');
  const consent = await waitUntil(() => d.github(`const c = ${IN_LOG('[data-consent]')}; return c ? { lead: c.querySelector('[data-consent-lead]')?.textContent ?? '', button: c.querySelector('[data-action="consent-confirm"]')?.textContent?.trim() ?? '', disabled: c.querySelector('[data-action="consent-confirm"]')?.disabled } : null;`), 8000);
  check('نقرة الفأرة الحقيقية تفتح الموافقة: ما يُرسل ولأي مزوّد ومودل، والزر «إرسال للتحليل»', consent && consent.lead.includes('Anthropic') && consent.lead.includes('api.anthropic.com') && consent.lead.includes('Mock Sonnet 2') && consent.button === 'إرسال للتحليل' && consent.disabled === false, consent);
  check('فتح الموافقة لا يرسل شيئًا', posts().length === 0, posts().length);

  await d.github(`const b = ${IN_LOG('[data-action="consent-confirm"]')}; b?.click(); b?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); b?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true;`);
  await sleep(1200);
  check('AC-E9 (٧): «إرسال للتحليل» بالنقر البرمجي أو حدث مُنشأ من عالم الصفحة لا يُصدر طلبًا', posts().length === 0, posts().length);

  const result = async (n) => {
    await waitUntil(async () => (posts().length >= n ? true : null), 10000);
    return waitUntil(() => d.github(`const r = ${IN_LOG('[data-layer="possibility"] [data-analysis="result"]')}; return r ? { text: r.textContent, meta: r.querySelector('[data-analysis-meta]')?.textContent ?? '', literal: ${IN_LOG('[data-layer="literal"]')}?.textContent ?? '' } : null;`), 10000);
  };
  const again = async () => {
    await d.clickShadow(LOG, '[data-action="analysis-again"]');
    await waitUntil(() => d.github(`return Boolean(${IN_LOG('[data-consent]')}) || null;`), 8000);
  };

  await d.keyShadow(LOG, '[data-action="consent-confirm"]', 'Enter');
  const r1 = await result(1);
  check('Enter الحقيقي على «إرسال للتحليل»: طلب واحد، والنتيجة في الطبقة الثالثة موسومة بمودلها ووقتها', posts().length === 1 && r1 && r1.text.includes('احتمال يحتاج تحققًا') && r1.meta.includes('mock-sonnet-2') && r1.meta.includes('طُلب') && !r1.literal.includes('احتمال: فشل الترجمة'), { posts: posts().length, r1 });
  await again();
  await d.keyShadow(LOG, '[data-action="consent-confirm"]', 'Space');
  const r2 = await result(2);
  check('Space الحقيقي: طلب واحد آخر', posts().length === 2 && Boolean(r2), posts().length);
  await again();
  await d.clickShadow(LOG, '[data-action="consent-confirm"]');
  const r3 = await result(3);
  check('نقرة الفأرة الحقيقية: طلب واحد آخر (ثلاثة لثلاثة تفعيلات)', posts().length === 3 && Boolean(r3), posts().length);

  // 4. تدقيق الشبكة.
  const provider = network.extra;
  check('TEST-PRIV-04: كل طلبات المزوّد إلى api.anthropic.com من الخلفية بالمفتاح وحده (x-api-key)، بلا Authorization ولا رمز GitHub', provider.length === 4 && provider.every((r) => r.host === 'api.anthropic.com' && r.from === 'background' && r.headers['x-api-key'] === KEY && !r.headers.authorization && !JSON.stringify(r).includes(TOKEN)), provider.map((r) => ({ path: r.path, from: r.from, key: r.headers['x-api-key'] === KEY ? 'key' : 'other', auth: Boolean(r.headers.authorization), token: JSON.stringify(r).includes(TOKEN) })));
  check('أجسام طلبات التحليل بلا المفتاح ولا الرمز، وبالمودل المختار', posts().every((r) => !r.body.includes(KEY) && !r.body.includes(TOKEN) && JSON.parse(r.body).model === 'mock-sonnet-2'), posts().map((r) => r.path));
  check('لا مفتاح في أي طلب إلى api.github.com (ترويسة غير الرمز)', network.api.every((c) => c.auth !== 'other'), network.api);

  // 5. حذف المفتاح.
  await d.click('[data-action="key-clear"]');
  await d.click('[data-action="key-clear-confirm"]');
  await waitUntil(() => d.options(`return document.querySelector('[data-key-state]')?.getAttribute('data-key-state') === 'none' || null;`), 8000);
  await d.openGithub(JOB_URL);
  const gated = await waitUntil(() => d.github(`const l = ${IN_LOG('[data-layer="possibility"]')}; return l && l.querySelector('[data-analysis="gate"]') ? { text: l.textContent, open: Boolean(l.querySelector('[data-action="analysis-open"]')), result: Boolean(l.querySelector('[data-analysis="result"]')), literal: ${IN_LOG('[data-layer="literal"]')}?.textContent ?? '' } : null;`), 15000);
  check('AC-D9: بحذف المفتاح يبقى القسم كاملًا ولا نص تحليل، والخيار معلَّلًا بما يحتاجه', gated && !gated.open && !gated.result && gated.text.includes('يحتاج «مفتاح مزوّد التحليل»') && gated.literal.includes('Process completed with exit code 1.'), gated);
  check('بعد الحذف لا طلب جديد إلى المزوّد', network.extra.length === 4, network.extra.length);
}

async function run(key) {
  const target = BROWSERS[key].target;
  const extDir = derived(target);
  const checks = [];
  const result = { label: BROWSERS[key].label, checks };
  let session;
  try {
    const options = { extDir, githubReply, apiReply, authLabel, extra: { 'api.anthropic.com': anthropicReply } };
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
        provider: session.network.extra.map((r) => ({ method: r.method, path: r.path, from: r.from, key: r.headers['x-api-key'] === KEY ? 'saved' : r.headers['x-api-key'] ? 'other' : null, authorization: Boolean(r.headers.authorization), bytes: r.body?.length ?? 0 })),
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
  // المحجوب يُنسب بدليل: مضيف يرد في HTML صفحة GitHub المحفوظة ولا يرد في أي ملف من حزمة الإضافة هو مورد الصفحة نفسها (أنماطها وخطوطها)؛ وطلبات
  // Firefox نفسه (*.mozilla.*) ليست من الإضافة. وما سوى ذلك وجهة للإضافة ويُسقط الفحص.
  const bundle = fs.readdirSync(path.join(ROOT, 'dist', BROWSERS[key].target)).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(ROOT, 'dist', BROWSERS[key].target, f), 'utf8')).join('\n');
  const blocked = r.network?.blockedExternalHosts ?? [];
  const pageOwn = blocked.filter((h) => JOB_PAGE.includes(h) && !bundle.includes(h));
  const external = blocked.filter((h) => !pageOwn.includes(h) && !(key === 'firefox' && /(^|\.)mozilla\.(net|com|org)$/.test(h)));
  if (r.network) r.network.pageResourceHosts = pageOwn;
  add('لا وجهة للإضافة غير github.com وapi.github.com وapi.anthropic.com (موارد صفحة GitHub المحفوظة مسرودة منفصلة)', external.length === 0, { external, pageOwn });
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
  fs.writeFileSync(path.join(outDir, 'browser-provider-check.json'), serialized);
}
console.log(`المجموع: ${all.filter((c) => c.ok).length}/${all.length}`);
if (all.some((c) => !c.ok)) process.exitCode = 1;

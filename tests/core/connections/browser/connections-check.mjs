#!/usr/bin/env node
// TEST-CONN-01 وTEST-CONN-02 وتدقيق الشبكة لـAC-11.1 وAC-D8 في المتصفحات الحقيقية على الحزمة المشحونة نفسها (dist/<target> من npm run build)،
// بمشغّلي MJ15 (tests/modules/d/token/browser/drivers.mjs). لا شبكة خارجية: github.com وapi.github.com يُخدمان محليًا بردود جدول إشارات
// T-0.5 (fixture-token-states.json)، والرمز ومفتاح المزوّد مختلَقان بصيغة حقيقية يُولَّدان وقت التشغيل ولا يُكتبان في أي دليل.
//   0. فحص ساكن: مفاتيح السرّين وقاعدة الأسرار وسجل الصحة وترويسة Authorization في background.js وoptions.js وحدهما.
//   1. سجل الاتصالات في الإعدادات: بطاقتان بنوعهما ووجهتهما وما يحتاجانه؛ مفتاح المزوّد متاح بحقله و«لماذا المفتاح؟» (MJ21، AC-E9 (٨))؛ بيان
//      الحفظ «غير مشفَّر» بلا ادعاء تشفير؛ «كيف تحصل على الرمز؟» في بطاقة الرمز.
//   2. نص غير صالح: لا حفظ ولا طلب، والحالة «غير مربوط».
//   3. الحالات بنصوصها على ردود محقونة: منتهٍ (401)، متجاوز الحد (403 بنفاد وموعد)، غير متاح (503)، ثم سليم (5000)؛ وناقص الصلاحيات من
//      استعمال البطاقة (403 actions=read). وتدقيق الشبكة: كل طلبات السجل GET /rate_limit من الخلفية، واحد لكل تحقق أعلنه المستخدم.
//   4. بوابة الخيار في البطاقة بعد 404 بلا رمز، وزرّها بنقرة فعلية يحفظ الميزة؛ وبعد الربط «عُد إلى …» يعيد إلى تبويب الميزة ويركّز زر القراءة
//      بلا طلب API.
//   5. العزل: مفتاح مزوّد في مفتاحه المستقل بالجلسة؛ سكربت المحتوى لا يقرأ الجلسة ولا يجد سرًّا في storage.local وIndexedDB عالمه ولا
//      الأحداث والرسائل وDOM؛ ومسح الرمز يُبقي المفتاح ويعطّل ما يعتمد على الرمز وحده. 6. لا سرّ في الكونسول ولا الناتج.
// الاستعمال: node tests/core/connections/browser/connections-check.mjs [chrome edge brave firefox] [--out-dir evidence/T-11.1]
import fs from 'node:fs';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, derivedCopy, firefoxSession, sleep, waitUntil } from '../../../modules/d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.filter((a) => BROWSERS[a]);

const TOKEN = ['github', 'pat', `11CONNMIJHARFAKE00000_${'xFakeConnectionsCheck'.repeat(3).slice(0, 59)}`].join('_');
const KEY = ['sk', 'ant', 'api03', 'ConnFakeProviderKeyOnly'.repeat(3)].join('-');
const SECRET_RE = /github_pat_[A-Za-z0-9_]{20,}|sk-ant-api03-[A-Za-z0-9_-]{20,}/;
const hasSecret = (value) => SECRET_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));

const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/d/token/fixtures/fixture-token-states.json'), 'utf8'));
const P = FIXTURE.privateRepo;
const PR_URL = `https://github.com/${P.owner}/${P.repo}/pull/${P.number}`;
const PR_PAGE = fs
  .readFileSync(path.join(ROOT, 'tests/modules/d/fixtures/fixture-pr-complex.html'), 'utf8')
  .replaceAll('octo/demo', `${P.owner}/${P.repo}`)
  .replaceAll('octo-dev/demo', `${P.owner}/${P.repo}`)
  .replaceAll('4242', String(P.number))
  .replaceAll('22c15d5f509f0a7076b74b3f0f48a740802103b4', P.headSha);
const STATUS_FRAGMENT = fs.readFileSync(path.join(ROOT, 'tests/modules/d/fixtures/fixture-status-details.html'), 'utf8');

/** وضع الشبكة الحالي: private (ردود العينة)، expired، rate-limited، unavailable، insufficient (Actions مرفوضة بالرمز). */
let mode = 'private';
const rateLimited = () => {
  const reset = String(Math.floor(Date.now() / 1000) + 3600);
  const r = FIXTURE.states['rate-limited'];
  return { ...r, headers: { ...r.headers, 'x-ratelimit-reset': reset } };
};
const actionsMissing = { ...FIXTURE.states['missing-permission'], headers: { ...FIXTURE.states['missing-permission'].headers, 'x-accepted-github-permissions': 'actions=read' } };

function apiReply(pathAndQuery, authorization) {
  const ok = authorization === `Bearer ${TOKEN}`;
  if (authorization && !ok) return FIXTURE.states.invalid;
  if (mode === 'expired' && ok) return FIXTURE.states.expired;
  if (mode === 'rate-limited') return rateLimited();
  if (mode === 'unavailable') return { status: 503, body: { message: 'Service Unavailable' } };
  if (pathAndQuery.startsWith('/rate_limit')) return ok ? FIXTURE.states.valid : { status: 200, headers: { 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '59', 'x-ratelimit-reset': '1792768532', 'x-ratelimit-resource': 'core' }, body: { rate: { limit: 60, remaining: 59 } } };
  if (!ok) return FIXTURE.states['not-found'];
  if (mode === 'insufficient' && pathAndQuery.includes('/actions/')) return actionsMissing;
  const r = P.responses[pathAndQuery];
  if (r === undefined) return FIXTURE.states['not-found'];
  return typeof r === 'string' ? FIXTURE.states[r] : r;
}

function githubReply(pathname) {
  if (pathname === `/${P.owner}/${P.repo}/pull/${P.number}`) return { status: 200, type: 'text/html; charset=utf-8', body: PR_PAGE };
  if (/\/status-details$/.test(pathname)) return { status: 200, type: 'text/html; charset=utf-8', body: STATUS_FRAGMENT };
  return { status: 404, type: 'text/plain', body: 'not found' };
}

/** وسم ترويسة Authorization لا قيمتها. */
const authLabel = (value) => (value ? (value === `Bearer ${TOKEN}` ? 'saved' : 'other') : null);

// ---------- مسابير عالم سكربت المحتوى (كما في فحص MJ15، والبحث عن السرّين) ----------

const PROBE_INSTALL = `(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  if (!globalThis.__mjConnProbe) {
    const p = (globalThis.__mjConnProbe = { changes: [], messages: [], read: null });
    api.storage.onChanged.addListener((changes, area) => p.changes.push({ area, json: JSON.stringify(changes) }));
    api.runtime.onMessage.addListener((m) => { p.messages.push(JSON.stringify(m)); return undefined; });
  }
  return 'installed';
})();`;

const PROBE_READ = `(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const p = (globalThis.__mjConnProbe ??= { changes: [], messages: [], read: null });
  p.read = null;
  (async () => {
    const out = { sessionType: typeof api.storage.session };
    try { out.session = api.storage.session ? JSON.stringify(await api.storage.session.get(null)) : null; } catch (e) { out.sessionError = String((e && e.message) || e); }
    try { out.local = JSON.stringify(await api.storage.local.get(null)); } catch (e) { out.localError = String((e && e.message) || e); }
    out.idb = await new Promise((resolve) => {
      let r;
      try { r = indexedDB.open('mijhar-secrets'); } catch (e) { resolve({ error: String(e) }); return; }
      r.onerror = () => resolve({ error: String(r.error) });
      r.onsuccess = () => { const db = r.result; const stores = [...db.objectStoreNames]; db.close(); resolve({ stores, origin: location.origin }); };
    });
    out.dom = document.documentElement.outerHTML + [...document.querySelectorAll('mijhar-host')].map((h) => (h.shadowRoot ? h.shadowRoot.innerHTML : '')).join('');
    p.read = out;
  })().catch((e) => { p.read = { error: String(e) }; });
  return 'started';
})();`;

const PROBE_RESULT = `JSON.stringify(globalThis.__mjConnProbe ?? null);`;
const PROBES = { 'mj-conn-probe-install.js': PROBE_INSTALL, 'mj-conn-probe-read.js': PROBE_READ, 'mj-conn-probe-result.js': PROBE_RESULT };

const CARD = 'mijhar-host[data-mijhar-host="d.pr-status"]';
const API = `const api = globalThis.browser ?? globalThis.chrome ?? (window.wrappedJSObject ?? window).browser;`;

/** حالة صفحة الإعدادات: شارة كل اتصال ونص إشعار الرمز. */
const READ_REGISTRY = `
  const card = (id) => document.querySelector('[data-connection="' + id + '"]');
  const badge = (id) => card(id)?.querySelector('[data-health]')?.getAttribute('data-health') ?? null;
  const notice = document.querySelector('[data-token-check]');
  return { token: badge('github-token'), provider: badge('provider-key'), health: notice?.getAttribute('data-health') ?? null, text: notice?.textContent ?? '', html: document.documentElement.outerHTML };
`;

async function scenario(d, target, checks, network) {
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 400)}`}`);
  };
  const registry = () => d.options(READ_REGISTRY);
  const waitHealth = (want) => waitUntil(async () => ((await registry())?.token === want ? registry() : null), 10000);
  /** يعيد رسم القسم (ذهاب إلى الدليل ورجوع) فيقرأ الحالة والطلب المعلّق من الخلفية كما عند فتح الإعدادات. */
  const reopen = async () => {
    await d.options(`location.hash = 'guide/github-token'; return true;`);
    await waitUntil(() => d.options(`return document.querySelector('[data-section="connections"]') ? null : true;`), 5000);
    await d.options(`location.hash = 'token'; return true;`);
    await waitUntil(() => d.options(`const b = document.querySelector('[data-connection="github-token"] [data-health]')?.getAttribute('data-health'); return b && b !== 'checking' ? b : null;`), 8000);
  };
  const status = () => d.options(`${API} return await api.runtime.sendMessage({ type: 'mijhar/connections', op: 'status' });`);

  // 1. السجل.
  await waitUntil(() => d.options(`const b = document.querySelector('[data-connection="github-token"] [data-health]')?.getAttribute('data-health'); return b && b !== 'checking' ? b : null;`), 8000);
  const view = await d.options(`
    const card = (id) => document.querySelector('[data-connection="' + id + '"]');
    const gh = card('github-token'); const pk = card('provider-key');
    return {
      ghBadge: gh?.querySelector('[data-health]')?.getAttribute('data-health'),
      ghKind: gh?.querySelector('[data-connection-kind]')?.textContent ?? '',
      ghNeeds: gh?.querySelector('[data-connection-needs]')?.textContent ?? '',
      guide: gh?.querySelector('a[data-action="token-guide"]')?.getAttribute('href') ?? null,
      pkAvailability: pk?.getAttribute('data-availability'),
      pkInputs: pk ? pk.querySelectorAll('input, textarea').length : -1,
      pkText: pk?.textContent ?? '',
      disclosure: document.querySelector('[data-storage-disclosure]')?.textContent ?? '',
      noClaims: document.querySelector('[data-no-claims]')?.textContent ?? '',
      why: pk?.querySelector('[data-action="provider-key-guide"]')?.getAttribute('href') ?? null,
    };
  `);
  check('بطاقة الرمز: نوعه ووجهته وما يحتاجه، «غير مربوط»، ومدخل «كيف تحصل على الرمز؟»', view?.ghBadge === 'none' && view.ghKind.includes('api.github.com') && view.ghNeeds.includes('صلاحيات قراءة فقط') && view.guide === '#guide/github-token', view);
  check('مفتاح المزوّد متاح (MJ21): حقله و«لماذا المفتاح؟» في بطاقته، ولا تكلفة', !view?.pkAvailability && view.pkInputs > 0 && view.why === '#guide/provider-key' && !/تكلف|سعر/.test(view.pkText), view);
  check('بيان الحفظ: مفتاح مستقل لكل سرّ و«غير مشفَّر» صريحًا، ولا ادعاء تشفير ولا إزالة مضمونة', view?.disclosure.includes('مفتاح تخزين مستقل') && view.disclosure.includes('غير مشفَّر') && view.noClaims.includes('لا يدّعي مِجهَر تشفيرًا') && view.noClaims.includes('ولا يضمن التنقيح'), view && { disclosure: view.disclosure.slice(0, 200) });

  // 2. نص غير صالح.
  const registryStart = network.api.length;
  await d.fill('#mj-token-input', 'not-a-token-at-all');
  await d.click('[data-action="token-save"]');
  await sleep(400);
  const invalid = await registry();
  check('نص غير صالح: لا حفظ ولا طلب، والحالة «غير مربوط»', invalid?.token === 'none' && network.api.length === registryStart, { token: invalid?.token, calls: network.api.slice(registryStart) });

  // 3. الحالات على ردود محقونة.
  mode = 'expired';
  await d.fill('#mj-token-input', TOKEN);
  await d.click('[data-action="token-save"]');
  const expired = await waitHealth('expired');
  check('منتهٍ (401): شارته ونصه بعد التحقق، لا «سليم»', expired?.health === 'expired' && expired.text.includes('401'), { token: expired?.token, text: expired?.text });
  check('بعد الحفظ: لا رمز في DOM الإعدادات', expired && !hasSecret(expired.html), null);
  mode = 'unavailable';
  await d.click('[data-action="token-check"]');
  const unavailable = await waitHealth('unavailable');
  check('غير متاح (503): شارته ونصه', unavailable?.health === 'unavailable' && unavailable.text.includes('تعذّر الوصول إلى GitHub'), { token: unavailable?.token, text: unavailable?.text });
  mode = 'private';
  await d.click('[data-action="token-check"]');
  const healthy = await waitHealth('healthy');
  check('سليم بعد قبول فعلي وحده: الحد 5000', healthy?.health === 'healthy' && healthy.text.includes('5000'), { token: healthy?.token, text: healthy?.text });
  const registryCalls = network.api.slice(registryStart);
  const onlyVerification = (calls, n) => calls.length === n && calls.every((c) => c.path === '/rate_limit' && c.from === 'background' && c.method === 'GET' && c.auth === 'saved');
  check('تدقيق الشبكة: طلبات السجل GET /rate_limit من الخلفية وحدها، واحد لكل تحقق (3)', onlyVerification(registryCalls, 3), registryCalls);

  // صفحة الطلب ومسبار عالم سكربت المحتوى.
  await d.openGithub(PR_URL);
  const card = await waitUntil(() => d.github(`return Boolean(document.querySelector('${CARD}')?.shadowRoot?.querySelector('[data-section="api"]'));`), 15000);
  check('بطاقة طلب الدمج مركَّبة في صفحة github.com', card, card);
  const installed = await d.probe('mj-conn-probe-install.js');
  check('المسبار مثبت في عالم سكربت المحتوى', installed === 'installed', installed);

  // ناقص الصلاحيات من الاستعمال (Actions مرفوضة بالرمز).
  mode = 'insufficient';
  const cardStart = network.api.length;
  await d.clickShadow(CARD, '[data-action="api-read"]');
  const checksKind = await waitUntil(() => d.github(`return document.querySelector('${CARD}')?.shadowRoot?.querySelector('[data-access-part="checks"]')?.getAttribute('data-access-kind') ?? null;`), 12000);
  const cardText = await d.github(`const r = document.querySelector('${CARD}')?.shadowRoot; return { checks: r?.querySelector('[data-access-part="checks"]')?.textContent ?? '', pull: r?.querySelector('[data-access-part="pull"]')?.getAttribute('data-access-kind'), binding: r?.querySelector('[data-binding]')?.textContent ?? '' };`);
  check('البطاقة: الفحوص «ينقص الرمزَ Actions» و«غير معروف»، والطلب مقروء بمستودعه وفرعه والتزامه ووقته', checksKind === 'insufficient' && cardText.checks.includes('Actions') && cardText.checks.includes('غير معروف') && cardText.pull === 'read' && cardText.binding.includes(`${P.owner}/${P.repo}`) && cardText.binding.includes(P.headSha.slice(0, 7)), { checksKind, cardText });
  await reopen();
  const insufficient = await registry();
  check('ناقص الصلاحيات من الاستعمال: شارته ونصه بالصلاحية والمستودع', insufficient?.token === 'insufficient' && insufficient.text.includes('صلاحية Actions (قراءة)') && insufficient.text.includes(`${P.owner}/${P.repo}`), { token: insufficient?.token, text: insufficient?.text });
  check('طلبات البطاقة من الخلفية بالرمز وبـGET وحدها', network.api.slice(cardStart).every((c) => c.from === 'background' && c.method === 'GET' && c.auth === 'saved'), network.api.slice(cardStart));

  // متجاوز الحد آخرًا: بعد ردّ النفاد لا تُرسل الخلفية طلبًا بالرمز قبل موعده (VR-07)، والتحقق نفسه (/rate_limit) مستثنى.
  mode = 'rate-limited';
  const limitStart = network.api.length;
  await d.click('[data-action="token-check"]');
  const limited = await waitHealth('rate-limited');
  check('متجاوز الحد: شارته ونصه بموعد إعادة المحاولة', limited?.health === 'rate-limited' && limited.text.includes('لا يُرسل طلب قبل'), { token: limited?.token, text: limited?.text });
  check('تدقيق الشبكة: تحقق «متجاوز الحد» طلب /rate_limit واحد من الخلفية', onlyVerification(network.api.slice(limitStart), 1), network.api.slice(limitStart));
  mode = 'private';

  // 5. العزل: مفتاح مزوّد في مفتاحه المستقل بالجلسة (يُكتب كما تكتبه بطاقته في صفحة الإعدادات).
  await d.options(`${API} await api.storage.session.set({ 'mijhar.secret.providerKey': { token: arguments[0], savedAt: Date.now() } }); return true;`, [KEY]);
  const sessionKeys = await d.options(`${API} return Object.keys(await api.storage.session.get(null)).sort();`);
  check('السرّان في مفتاحين مستقلين في الجلسة', JSON.stringify(sessionKeys) === JSON.stringify(['mijhar.connections.health', 'mijhar.secret.githubToken', 'mijhar.secret.providerKey']), sessionKeys);
  await d.probe('mj-conn-probe-read.js');
  const probe = await waitUntil(async () => {
    const raw = await d.probe('mj-conn-probe-result.js');
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.read ? parsed : null;
  }, 8000);
  const r1 = probe?.read ?? {};
  const sessionBlocked = target === 'firefox' ? r1.sessionType === 'undefined' : Boolean(r1.sessionError) && r1.session === undefined;
  check('سكربت المحتوى لا يقرأ storage.session (فيها السرّان وسجل الصحة)', sessionBlocked, { sessionType: r1.sessionType, sessionError: r1.sessionError });
  check('سكربت المحتوى: storage.local وIndexedDB عالمه (لأصل الصفحة) وDOM بلا سرّ', r1.local !== undefined && !hasSecret(r1.local) && !(r1.idb?.stores ?? []).includes('secrets') && r1.dom && !hasSecret(r1.dom), { origin: r1.idb?.origin, stores: r1.idb?.stores });
  check('أحداث storage.onChanged ورسائل runtime.onMessage التي وصلت سكربت المحتوى بلا سرّ', probe && !hasSecret(probe.changes) && !hasSecret(probe.messages), { changes: probe?.changes?.map((c) => c.area), messages: probe?.messages?.length });

  // مسح الرمز يعطّل ما يعتمد عليه وحده.
  await d.click('[data-action="token-clear"]');
  const confirm = await d.options(`return document.querySelector('[data-token-confirm] [data-disables]')?.textContent ?? null;`);
  await d.click('[data-action="token-clear-confirm"]');
  await waitHealth('none');
  const afterClear = await d.options(`${API} return Object.keys(await api.storage.session.get(null)).sort();`);
  const statuses = await status();
  const provider = Array.isArray(statuses) ? statuses.find((s) => s.id === 'provider-key') : null;
  check('مسح الرمز: التأكيد يسمّي ما يتعطل وحده، والمفتاح يبقى في مفتاحه، والرمز «غير مربوط»', String(confirm).includes('مستودع خاص') && afterClear.includes('mijhar.secret.providerKey') && !afterClear.includes('mijhar.secret.githubToken') && provider?.health === 'unverified', { confirm, afterClear, provider });
  check('حالة السجل عبر الرسائل بلا سرّ', !hasSecret(statuses), null);

  // 4. البوابة والعودة.
  await d.openGithub(PR_URL);
  await waitUntil(() => d.github(`return Boolean(document.querySelector('${CARD}')?.shadowRoot?.querySelector('[data-action="api-read"]'));`), 15000);
  await d.clickShadow(CARD, '[data-action="api-read"]');
  const gate = await waitUntil(() => d.github(`const g = document.querySelector('${CARD}')?.shadowRoot?.querySelector('[data-gate="d.pr-status.private"]'); return g ? { health: g.getAttribute('data-gate-health'), text: g.textContent, inApi: Boolean(g.closest('[data-section="api"]')) } : null;`), 12000);
  const rest = await d.github(`const r = document.querySelector('${CARD}')?.shadowRoot; return { checks: Boolean(r?.querySelector('[data-section="checks"]')), blockers: Boolean(r?.querySelector('[data-section="blockers"]')), access: r?.querySelector('[data-access-part="pull"]')?.getAttribute('data-access-kind') };`);
  check('404 بلا رمز: «غير متاحة لهذا المستودع» وخيار الربط معلَّلًا في لوحة API وحدها، وبقية البطاقة كاملة', gate?.health === 'none' && gate.inApi && gate.text.includes('رمز GitHub للقراءة') && rest.checks && rest.blockers && rest.access === 'unavailable', { gate, rest });
  await d.clickShadow(CARD, '[data-gate] [data-action="connect"]');
  const pending = await waitUntil(() => d.options(`${API} return await api.runtime.sendMessage({ type: 'mijhar/connections', op: 'pending' });`), 8000);
  check('نقرة «اربط» تحفظ الميزة من القائمة المغلقة مع تبويبها', pending?.feature === 'd.pr-status.private', pending);
  await d.fill('#mj-token-input', TOKEN);
  await d.click('[data-action="token-save"]');
  await waitHealth('healthy');
  await reopen();
  const banner = await d.options(`const b = document.querySelector('[data-return]'); return b ? { state: b.getAttribute('data-return'), text: b.textContent } : null;`);
  check('بعد الربط والتحقق: لافتة «عُد إلى …» باسم الميزة', banner?.state === 'ready' && banner.text.includes('قراءة طلب الدمج وفحوص Actions في مستودع خاص'), banner);
  const returnStart = network.api.length;
  await d.click('[data-action="connection-return"]');
  const focused = await waitUntil(() => d.github(`const r = document.querySelector('${CARD}')?.shadowRoot; const a = r?.activeElement?.getAttribute('data-action'); return a === 'api-read' ? { action: a, auth: Boolean(r.querySelector('[data-api-auth="token"]')) } : null;`), 8000);
  await sleep(300);
  check('العودة إلى تبويب الميزة: زر القراءة مركَّز والقراءة بالرمز متاحة، ولا طلب API', focused?.action === 'api-read' && focused.auth && network.api.length === returnStart, { focused, calls: network.api.slice(returnStart) });

  // تنظيف السرّين.
  await d.click('[data-action="token-clear"]');
  await d.click('[data-action="token-clear-confirm"]');
  await d.options(`${API} await api.storage.session.remove('mijhar.secret.providerKey'); return true;`);
}

async function run(key) {
  const target = BROWSERS[key].target;
  const extDir = derivedCopy(target, PROBES);
  const checks = [];
  const result = { label: BROWSERS[key].label, checks };
  let session;
  mode = 'private';
  try {
    const options = { extDir, githubReply, apiReply, authLabel };
    session = key === 'firefox' ? await firefoxSession(options) : await chromiumSession(key, options);
    result.browserVersion = session.browserVersion;
    await scenario(session.d, target, checks, session.network);
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
  }
  return result;
}

function staticCheck() {
  const rows = [];
  const markers = ['mijhar.secret.githubToken', 'mijhar.secret.providerKey', 'mijhar-secrets', 'mijhar.connections.health', 'Authorization'];
  for (const target of ['chromium', 'firefox']) {
    for (const file of ['background', 'options', 'content', 'sidepanel', 'reader']) {
      const text = fs.readFileSync(path.join(ROOT, 'dist', target, `${file}.js`), 'utf8');
      rows.push({ target, file, found: markers.filter((m) => text.includes(m)) });
    }
  }
  const leaks = rows.filter((r) => ['content', 'sidepanel', 'reader'].includes(r.file) && r.found.length);
  const owners = rows.filter((r) => r.file === 'background' && r.found.length === markers.length);
  return { rows, ok: leaks.length === 0 && owners.length === 2 };
}

const results = { static: staticCheck() };
console.log(`${results.static.ok ? '✓' : '✗'} فحص ساكن: مفاتيح السرّين وسجل الصحة وAuthorization في background.js وoptions.js وحدهما`);
const all = [{ name: 'فحص ساكن', ok: results.static.ok }];
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox']) {
  console.log(`— ${BROWSERS[key].label}`);
  const r = await run(key);
  const add = (name, ok, detail) => {
    r.checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    if (!ok) console.log(`  ✗ ${name} — ${JSON.stringify(detail)?.slice(0, 400)}`);
  };
  add('اكتمل التشغيل بلا خطأ', !r.error, r.error?.split('\n').slice(0, 3).join(' | '));
  add('لا سرّ في الكونسول (الصفحة والإعدادات والخلفية)', r.consoleHasSecret === false, r.consoleHasSecret);
  add('لا طلب إلى api.github.com من الصفحة أو سكربت المحتوى', (r.network?.api ?? []).every((c) => c.from === 'background'), r.network?.api?.filter((c) => c.from !== 'background'));
  // وكيل Firefox يرى طلبات المتصفح نفسه أيضًا (الإعدادات البعيدة وتحديثاتها في *.mozilla.net و*.mozilla.com و*.mozilla.org)؛ وهذه ليست
  // من الإضافة (لا ذكر لها في dist/firefox) فلا تُحسب، وتبقى مسرودة في الناتج.
  const external = (r.network?.blockedExternalHosts ?? []).filter((h) => !(key === 'firefox' && /(^|\.)mozilla\.(net|com|org)$/.test(h)));
  add('لا وجهة خارجية للإضافة غير github.com وapi.github.com', external.length === 0, r.network?.blockedExternalHosts);
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
  fs.writeFileSync(path.join(outDir, 'browser-connections-check.json'), serialized);
}
console.log(`المجموع: ${all.filter((c) => c.ok).length}/${all.length}`);
if (all.some((c) => !c.ok)) process.exitCode = 1;

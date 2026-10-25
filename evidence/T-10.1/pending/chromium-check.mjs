#!/usr/bin/env node
// MJ26 (T-10.1): التحقق المعلّق من تدقيق ما قبل الإصدار في عائلة Chromium الحقيقية (Chrome وEdge وBrave) على الحزمة المشحونة dist/chromium، بـPlaywright
// وCDP ونقرات فعلية. ومضيف OpenAI وهمي محلي (route لا شبكة خارجية) بمفتاح مختلَق يُركَّب وقت التشغيل ولا يُكتب في أي دليل. لكل متصفح:
//   أ. نافذة الصلاحية (BLK-AUD-02): الحزمة كما هي (المضيف اختياري غير ممنوح). تُسجَّل وسائط permissions.request التي تطلقها نقرة «تحقق من المفتاح» (بغلاف
//      يمرّر النداء إلى المتصفح كما هو)، ونتيجتها الفعلية في المتصفح؛ ونافذة Chromium الأصلية لا تُقاد آليًا، فالرفض هنا ما يعيده المتصفح بلا واجهة.
//   ب. إيقاظ عامل الخدمة (F-06): نسخة تمنح المضيف آليًا (الشيفرة كما هي). المزوّد يردّ 429 بـRetry-After؛ ثم يُوقف عامل الخدمة فعلًا (CDP
//      ServiceWorker.stopAllWorkers) ويُثبت أنه عامل جديد بعد الإيقاظ، فلا يُرسل تحقق قبل الموعد وتعلنه الحالة؛ وبعد حلوله يُرسل.
//   ج. أكثر من نافذة إعدادات (F-05 وF-07 وCOR-AUD-02 وPI-1): صفحتا إعدادات في السياق نفسه، والعودة إلى الأولى بـbringToFront (visibilitychange فعلي).
// الاستعمال: node evidence/T-10.1/pending/chromium-check.mjs [chrome edge brave] ← chromium-result.json وscreens/<المتصفح>-*.png
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../scripts/load-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const SCREENS = path.join(HERE, 'screens');
const keys = process.argv.slice(2).filter((a) => BROWSERS[a] && a !== 'firefox');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(read, timeoutMs = 10000, stepMs = 150) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await read().catch(() => null);
    if (v) return v;
    if (Date.now() > end) return null;
    await sleep(stepMs);
  }
}

const KEY = ['sk', 'proj', 'PendingChromiumFakeKeyOne'.repeat(3)].join('-');
const KEY2 = ['sk', 'proj', 'PendingChromiumFakeKeyTwo'.repeat(3)].join('-');
const TOKEN = ['github', 'pat', `11PENDINGMIJHARFAKE00_${'xFakePendingCheckOnly'.repeat(3).slice(0, 59)}`].join('_');
const SECRETS = [KEY, KEY2, TOKEN];
const hasSecret = (v) => SECRETS.some((s) => (typeof v === 'string' ? v : JSON.stringify(v ?? null)).includes(s));
const OPENAI = 'api.openai.com';
const RETRY_SECONDS = 20;
const SECONDS = Math.floor(Date.now() / 1000);

function derived(grantHosts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj26-pending-'));
  fs.cpSync(path.join(ROOT, 'dist/chromium'), dir, { recursive: true });
  if (grantHosts) {
    const file = path.join(dir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.github.com/*', `https://${OPENAI}/*`])];
    manifest.optional_host_permissions = (manifest.optional_host_permissions ?? []).filter((h) => !manifest.host_permissions.includes(h));
    fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  }
  return dir;
}

async function launch(key, extDir, network, mock, { headless = true } = {}) {
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj26-pending-profile-'));
  const context = await chromium.launchPersistentContext(profileDir, { executablePath: BROWSERS[key].executable, headless, viewport: { width: 1280, height: 900 }, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
  await context.route(`https://${OPENAI}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const auth = (await request.allHeaders()).authorization ?? '';
    const body = request.postData();
    const entry = { at: Date.now(), method: request.method(), path: url.pathname, key: auth === `Bearer ${KEY}` ? 'KEY' : auth === `Bearer ${KEY2}` ? 'KEY2' : auth ? 'other' : null, mode: mock.mode, from: request.serviceWorker() ? 'background' : 'page', body: body ? JSON.parse(body) : null };
    network.provider.push(entry);
    if (mock.delay) await sleep(mock.delay);
    const json = (status, value, headers = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', ...headers }, body: JSON.stringify(value) });
    if (mock.mode === 'rate') return json(429, { error: { type: 'requests', code: 'rate_limit_exceeded', message: 'Rate limit reached for requests.' } }, { 'retry-after': String(RETRY_SECONDS) });
    if (url.pathname === '/v1/models') return json(200, { object: 'list', data: [{ id: 'mock-chat-2', object: 'model', created: SECONDS - 864000, owned_by: 'mock' }] });
    if (url.pathname === '/v1/responses') {
      const sent = entry.body ?? {};
      return json(200, { id: 'resp_mock', object: 'response', status: 'completed', incomplete_details: null, model: sent.model, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: sent.input === 'ping' ? 'pong' : '{}' }] }], usage: { input_tokens: 1, output_tokens: 1 } });
    }
    return json(404, { error: { message: 'not found' } });
  });
  await context.route('https://api.github.com/**', (route) => {
    network.api.push(new URL(route.request().url()).pathname);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resources: { core: { limit: 5000, remaining: 4999, used: 1, reset: SECONDS + 3600 } } }) });
  });
  await context.route((url) => url.protocol === 'https:' && ![OPENAI, 'api.github.com'].includes(url.host), (route) => {
    network.blocked.add(new URL(route.request().url()).host);
    return route.abort();
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: extDir });
  const origin = `chrome-extension://${id}`;
  await waitUntil(async () => context.serviceWorkers().find((w) => w.url().startsWith(origin)) ?? null, 8000);
  const open = async (from) => {
    // الصفحة الثانية تبويب في النافذة نفسها (tabs.create من صفحة الإضافة) كما يفتحها المستخدم، فالتبديل بينهما يطلق visibilitychange فعليًا.
    const page = from
      ? (await Promise.all([context.waitForEvent('page'), from.evaluate(() => chrome.tabs.create({ url: 'options.html' }))]))[0]
      : await context.newPage();
    if (!from) await page.goto(`${origin}/options.html`);
    await page.waitForSelector('#app[data-ready="true"]');
    return page;
  };
  return {
    context,
    origin,
    version: context.browser().version(),
    open,
    worker: () => context.serviceWorkers().find((w) => w.url().startsWith(origin)) ?? null,
    async close() {
      await context.close();
      fs.rmSync(profileDir, { recursive: true, force: true });
    },
  };
}

const CARD = `(() => {
  const c = document.querySelector('[data-provider-card]');
  if (!c) return null;
  return {
    provider: c.getAttribute('data-provider-card'),
    permission: c.querySelector('[data-provider-permission]')?.getAttribute('data-provider-permission') ?? null,
    key: c.querySelector('[data-key-state]')?.getAttribute('data-key-state') ?? null,
    health: c.querySelector('[data-key-check]')?.getAttribute('data-health') ?? c.querySelector('[data-provider-key]')?.getAttribute('data-health') ?? null,
    message: c.querySelector('[data-key-message]')?.textContent ?? '',
    checkText: c.querySelector('[data-key-check]')?.textContent ?? '',
    confirm: Boolean(c.querySelector('[data-key-confirm]')),
    listed: [...c.querySelectorAll('[role="listbox"] [role="option"]')].map((o) => o.getAttribute('data-model')),
    test: c.querySelector('[data-model-test]')?.getAttribute('data-model-test') ?? null,
  };
})()`;

async function run(key) {
  const label = BROWSERS[key].label;
  const steps = [];
  const notes = [];
  const check = (part, name, ok, detail) => {
    steps.push({ part, name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} [${label} · ${part}] ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 600)}`}`);
  };
  const versions = {};

  // ======================= أ. نافذة الصلاحية =======================
  {
    const network = { provider: [], api: [], blocked: new Set() };
    const mock = { mode: 'ok', delay: 0 };
    const extDir = derived(false);
    const s = await launch(key, extDir, network, mock);
    versions.browser = s.version;
    try {
      const page = await s.open();
      const card = () => page.evaluate(CARD);
      const until = (want, ms = 12000) => waitUntil(async () => ((x) => (x && want(x) ? x : null))(await card()), ms);
      // نافذة Chromium الأصلية لا تُجيب بلا واجهة ولا تُقاد آليًا (قيس في التشغيل الأول: يبقى الطلب معلّقًا)؛ فالغلاف يسجّل وسائط الطلب الحقيقية التي
      // تطلقها النقرة ثم يجيب «رُفض» (رفض محاكى، موسوم كذلك). والنافذة الأصلية نفسها ورفضها وقبولها مفحوصة في Firefox (firefox-check.mjs).
      await page.evaluate(() => {
        const api = chrome.permissions;
        globalThis.__requests = [];
        api.request = (set) => {
          globalThis.__requests.push({ set: JSON.parse(JSON.stringify(set)), result: 'رفض محاكى' });
          return Promise.resolve(false);
        };
      });
      await page.evaluate(() => {
        const s = document.querySelector('#mj-provider-select');
        s.value = 'openai';
        s.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await until((x) => x.provider === 'openai' && x.key === 'none');
      await page.fill('#mj-key-input', KEY);
      await page.click('[data-action="key-save"]');
      const saved = await until((x) => x.key === 'session' && /لم يُتحقق منه/.test(x.message), 15000);
      const r1 = await page.evaluate(() => globalThis.__requests.slice());
      check('أ. الصلاحية', '«احفظ وتحقق» بنقرة فعلية يطلب صلاحية api.openai.com وحدها في Chromium (لا data_collection)؛ وبعد الرفض المحاكى يُحفظ المفتاح «لم يُتحقق منه» بلا طلب', r1.length === 1 && JSON.stringify(r1[0].set) === JSON.stringify({ origins: [`https://${OPENAI}/*`] }) && Boolean(saved) && network.provider.length === 0, { requests: r1, card: saved && { key: saved.key, message: saved.message } });
      notes.push(`أ (${label}): الرفض محاكى بغلاف permissions.request لأن نافذة Chromium الأصلية لا تُجيب بلا واجهة؛ ووسائط الطلب حقيقية من نقرة فعلية.`);
      if (saved) {
        await page.click('[data-action="key-check"]');
        const denied = await until((x) => x.message.includes(`لم تُمنح صلاحية ${OPENAI}؛ لم يُرسل شيء.`), 15000);
        const r2 = await page.evaluate(() => globalThis.__requests.slice());
        check('أ. الصلاحية', '«تحقق من المفتاح» بنقرة فعلية يطلب المضيف وحده، والرفض (محاكى) يعرض «لم تُمنح صلاحية api.openai.com؛ لم يُرسل شيء.» بلا أي طلب', r2.length === 2 && JSON.stringify(r2[1].set) === JSON.stringify({ origins: [`https://${OPENAI}/*`] }) && Boolean(denied) && network.provider.length === 0, { request: r2[1], message: denied?.message, sent: network.provider.length });
        await page.screenshot({ path: path.join(SCREENS, `${key}-a-denied.png`) });
      } else {
        check('أ. الصلاحية', 'المتصفح بلا واجهة منح الصلاحية أو لم يُجب، فلم يُفحص مسار الرفض', false, saved);
      }
    } finally {
      await s.close();
      fs.rmSync(extDir, { recursive: true, force: true });
    }
  }

  // ======================= ب وج. إيقاظ عامل الخدمة وتعدد النوافذ =======================
  {
    const network = { provider: [], api: [], blocked: new Set() };
    const mock = { mode: 'ok', delay: 0 };
    const extDir = derived(true);
    // بنافذة مرئية: التبديل بين الصفحتين يطلق visibilitychange وfocus فعليين كما يفعل المستخدم (بلا واجهة لا يُعتمد عليهما).
    const s = await launch(key, extDir, network, mock, { headless: false });
    try {
      const A = await s.open();
      await sleep(1000);
      const freshKeys = await A.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).sort());
      const card = (page) => page.evaluate(CARD);
      const until = (page, want, ms = 12000) => waitUntil(async () => ((x) => (x && want(x) ? x : null))(await card(page)), ms);
      const front = async (page) => {
        await page.bringToFront();
        await sleep(500);
      };
      const status = (page) => page.evaluate(() => chrome.runtime.sendMessage({ type: 'mijhar/provider', op: 'status', provider: 'openai' }));
      const session = (page) => page.evaluate(() => chrome.storage.session.get(['mijhar.provider.models', 'mijhar.provider.tests']));
      const sent = () => network.provider.length;
      await A.evaluate(() => {
        const s = document.querySelector('#mj-provider-select');
        s.value = 'openai';
        s.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await until(A, (x) => x.provider === 'openai' && x.permission === 'granted');
      await A.fill('#mj-key-input', KEY);
      await A.click('[data-action="key-save"]');
      const ok0 = await until(A, (x) => x.health === 'healthy');
      check('ب. الإيقاظ', 'المضيف ممنوح: الحفظ يرسل طلب التحقق المعلن وحده من الخلفية والمفتاح «سليم»', Boolean(ok0) && network.provider.length === 1 && network.provider[0].path === '/v1/models' && network.provider[0].from === 'background', network.provider.map((r) => `${r.method} ${r.path} ${r.from}`));

      mock.mode = 'rate';
      const n0 = sent();
      await A.click('[data-action="key-check"]');
      const r1 = await until(A, (x) => x.health === 'rate-limited' || /موعد/.test(`${x.message} ${x.checkText}`));
      const rateAt = Date.now();
      const s1 = await status(A);
      check('ب. الإيقاظ', 'المزوّد يردّ 429 بـRetry-After: طلب واحد، والحالة تعلن الموعد', Boolean(r1) && sent() === n0 + 1 && typeof s1?.retryAt === 'number', { retryAt: s1?.retryAt, message: r1?.message });
      const cdp = await s.context.newCDPSession(A);
      const versions = new Map();
      cdp.on('ServiceWorker.workerVersionUpdated', ({ versions: list }) => {
        for (const v of list) if (v.scriptURL.startsWith(s.origin)) versions.set(v.versionId, v.runningStatus);
      });
      await cdp.send('ServiceWorker.enable');
      const running = await waitUntil(async () => [...versions].find(([, st]) => st === 'running')?.[0] ?? null, 5000);
      if (running) await cdp.send('ServiceWorker.stopWorker', { versionId: running });
      const stopped = await waitUntil(async () => (versions.get(running) === 'stopped' ? 'stopped' : null), 8000);
      check('ب. الإيقاظ', 'عامل خدمة الإضافة أُوقف فعلًا (CDP ServiceWorker.stopWorker، وحالة النسخة stopped)', Boolean(running) && stopped === 'stopped', { running, status: running ? versions.get(running) : null });
      mock.mode = 'ok';
      const n1 = sent();
      await sleep(500);
      await A.click('[data-action="key-check"]');
      const restarted = await waitUntil(async () => ([...versions.values()].includes('running') ? 'running' : null), 10000);
      const r2 = await until(A, (x) => x.message.includes('أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.'), 15000);
      await sleep(600);
      const s2 = await waitUntil(async () => ((v) => (v && typeof v.retryAt === 'number' ? v : null))(await status(A)), 8000);
      check('ب. الإيقاظ', 'بعد إيقاظ العامل الموقوف بنقرة «تحقق من المفتاح» (حالة النسخة running من جديد): لا طلب قبل الموعد، والرسالة «أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.»، والموعد مستعاد من سجل صحة المفتاح', restarted === 'running' && Boolean(r2) && sent() === n1 && typeof s2?.retryAt === 'number' && Math.abs(s2.retryAt - s1.retryAt) < 2000, { restarted, message: r2?.message, sentAfter: sent() - n1, before: s1?.retryAt, after: s2?.retryAt });
      await A.screenshot({ path: path.join(SCREENS, `${key}-b-after-wake.png`) });
      const wait = rateAt + RETRY_SECONDS * 1000 + 1500 - Date.now();
      if (wait > 0) await sleep(wait);
      const n2 = sent();
      await A.click('[data-action="key-check"]');
      const r3 = await until(A, (x) => x.health === 'healthy' && sent() > n2);
      check('ب. الإيقاظ', 'بعد حلول الموعد: طلب واحد ويعود المفتاح «سليمًا»', Boolean(r3) && sent() === n2 + 1, { sent: sent() - n2 });

      // ---------- ج. أكثر من نافذة إعدادات ----------
      const B = await s.open(A);
      // Playwright يحاكي التركيز لكل صفحة فتبقى visibilityState «visible» ولو لم يكن تبويبها نشطًا؛ تُطفأ المحاكاة لهاتين الصفحتين فيصير الظهور
      // والتركيز من المتصفح نفسه عند تبديل التبويب.
      for (const p of [A, B]) await (await s.context.newCDPSession(p)).send('Emulation.setFocusEmulationEnabled', { enabled: false });
      await sleep(300);
      const b0 = await until(B, (x) => x.provider === 'openai' && x.key === 'session');
      check('ج. النوافذ', 'الصفحة الثانية تقرأ المفتاح المحفوظ نفسه', Boolean(b0), b0);
      const vis = await A.evaluate(() => document.visibilityState);
      notes.push(`ج: حالة ظهور الصفحة الأولى بعد فتح الثانية = ${vis}`);

      await front(A);
      await A.fill('[data-provider-card] [data-model-input]', 'mock-chat-2');
      await A.click('#mj-conn-provider-key-title');
      await sleep(500);
      mock.delay = 900;
      const n3 = sent();
      const raceStart = Date.now();
      // القائمة مقروءة في الجلسة فلا يطلبها زر + ثانية: ترسل الثانية طلب «حدّث القائمة» نفسه (verify بلا اقتراح) ولا تنتظره، ثم تنقر الأولى «اختبر النموذج».
      await B.evaluate(() => void chrome.runtime.sendMessage({ type: 'mijhar/provider', op: 'verify', provider: 'openai', suggest: false }));
      await A.click('[data-action="model-test"]');
      await sleep(2600);
      mock.delay = 0;
      const raced = network.provider.slice(n3).map((r) => ({ path: r.path, at: r.at }));
      const ss1 = await session(A);
      const st3 = await status(A);
      const modelsAt = ss1?.['mijhar.provider.models']?.openai?.readAt ?? null;
      const testAt = ss1?.['mijhar.provider.tests']?.openai?.at ?? null;
      check('ج. النوافذ', 'F-07: القائمة من الثانية والاختبار من الأولى متداخلان في الخلفية، وكلاهما كُتب في ذاكرة الجلسة أثناء السباق', raced.length === 2 && Math.abs(raced[0].at - raced[1].at) < 900 && modelsAt > raceStart && testAt > raceStart && st3?.test?.model === 'mock-chat-2', { raced, raceStart, modelsAt, testAt, test: st3?.test });

      await front(A);
      await A.click('[data-action="key-clear"]');
      const confirmA = await until(A, (x) => x.confirm);
      await front(B);
      await B.click('[data-action="key-clear"]');
      await B.click('[data-action="key-clear-confirm"]');
      await until(B, (x) => x.key === 'none');
      const nClear = sent();
      await front(A);
      const a1 = await until(A, (x) => x.key === 'none' && !x.confirm, 8000);
      await sleep(500);
      const ss2 = await session(A);
      check('ج. النوافذ', 'F-05: المسح من الثانية ينعكس في الأولى عند العودة: لا مفتاح، ويُغلق تأكيد المسح، ولا رسالة ولا نتيجة للمفتاح الممسوح', Boolean(confirmA) && Boolean(a1) && !a1.message && a1.test === null && a1.listed.length === 0, a1);
      check('ج. النوافذ', 'COR-AUD-02: القائمة ونتيجة الاختبار للمفتاح الممسوح حُذفتا من ذاكرة الجلسة عند قراءة الحالة التالية، بلا طلب', !ss2?.['mijhar.provider.models']?.openai && !ss2?.['mijhar.provider.tests']?.openai && sent() === nClear, ss2);
      await A.screenshot({ path: path.join(SCREENS, `${key}-c-after-clear-elsewhere.png`) });

      await front(B);
      await B.fill('#mj-key-input', KEY2);
      await B.click('[data-action="key-save"]');
      await until(B, (x) => x.health === 'healthy');
      await front(A);
      const a2 = await until(A, (x) => x.key === 'session' && x.health === 'healthy', 8000);
      check('ج. النوافذ', 'الاستبدال من الثانية: التحقق بالمفتاح الجديد وحده، والأولى تعرضه «سليمًا» بلا رسالة سابقة', Boolean(a2) && !a2.message && network.provider.at(-1)?.key === 'KEY2', { a2, last: network.provider.at(-1)?.key });

      await front(B);
      await B.evaluate(() => {
        const s = document.querySelector('#mj-provider-select');
        s.value = 'gemini';
        s.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await until(B, (x) => x.provider === 'gemini');
      await front(A);
      const a3 = await until(A, (x) => x.provider === 'gemini', 8000);
      check('ج. النوافذ', 'تبديل المزوّد إلى Gemini من الثانية ينعكس في الأولى بلا رسالة من OpenAI', Boolean(a3) && !a3.message, a3);

      const token = (page) => page.evaluate(() => document.querySelector('[data-token-state]')?.getAttribute('data-token-state') ?? null);
      const t0 = await token(A);
      await front(B);
      await B.fill('#mj-token-input', TOKEN);
      await B.click('[data-action="token-save"]');
      const tb = await waitUntil(async () => ((v) => (v === 'session' ? v : null))(await token(B)), 8000);
      notes.push(`ج (${label}): حالة رمز الصفحة الثانية بعد الحفظ = ${tb ?? (await token(B))}`);
      await front(A);
      const t1 = await waitUntil(async () => ((v) => (v === 'session' ? v : null))(await token(A)), 6000);
      check('ج. النوافذ', 'PI-1: رمز GitHub حُفظ من الثانية فتعرضه بطاقة الأولى عند العودة دون إعادة تحميل', t0 === 'none' && t1 === 'session', { t0, t1: t1 ?? (await token(A)) });
      await front(B);
      await B.click('[data-action="token-clear"]');
      await B.click('[data-action="token-clear-confirm"]');
      await waitUntil(async () => (await token(B)) === 'none', 8000);
      await front(A);
      const t2 = await waitUntil(async () => ((v) => (v === 'none' ? v : null))(await token(A)), 6000);
      check('ج. النوافذ', 'PI-1: مسح الرمز من الثانية ينعكس في الأولى عند العودة', t2 === 'none', { t2: t2 ?? (await token(A)) });
      check('الشبكة', 'كل طلب إلى المزوّد من الخلفية، ولا مضيف خارجي غير المعترَض', network.provider.every((r) => r.from === 'background'), { blocked: [...network.blocked], from: [...new Set(network.provider.map((r) => r.from))] });

      // ---------- د. إزالة الإضافة تمحو تخزينها (privacy.md#retention) ----------
      const used = await A.evaluate(async () => Object.keys(await chrome.storage.local.get(null)).sort());
      await A.evaluate(() => chrome.management.uninstallSelf({ showConfirmDialog: false })).catch(() => null);
      await sleep(1500);
      const cdp2 = await s.context.browser().newBrowserCDPSession();
      const { id: again } = await cdp2.send('Extensions.loadUnpacked', { path: extDir });
      const P = await s.context.newPage();
      await P.goto(`chrome-extension://${again}/options.html`);
      await P.waitForSelector('#app[data-ready="true"]');
      const after = await P.evaluate(async () => ({ local: Object.keys(await chrome.storage.local.get(null)).sort(), session: Object.keys(await chrome.storage.session.get(null)).sort() }));
      check('د. الإزالة', 'إزالة الإضافة (management.uninstallSelf) ثم تثبيتها بالمعرّف نفسه: التخزين كتثبيت جديد، فلا إعداد ولا سرّ ولا حالة مما كُتب قبلها', again === s.origin.replace('chrome-extension://', '') && JSON.stringify(after.local) === JSON.stringify(freshKeys) && after.session.length === 0 && used.length > freshKeys.length, { fresh: freshKeys, beforeUninstall: used, after });
    } finally {
      await s.close();
      fs.rmSync(extDir, { recursive: true, force: true });
    }
  }
  check('الأسرار', 'لا مفتاح ولا رمز في أي نتيجة مسجلة', !hasSecret(JSON.stringify({ steps, notes })));
  const passed = steps.filter((x) => x.ok).length;
  const failed = steps.filter((x) => !x.ok).length;
  console.log(`${label} ${versions.browser}: ${passed} اجتاز · ${failed} فشل`);
  return { key, label, version: versions.browser, passed, failed, steps, notes };
}

fs.mkdirSync(SCREENS, { recursive: true });
const results = [];
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave']) {
  results.push(await run(key).catch((error) => ({ key, error: String(error?.stack ?? error), passed: 0, failed: 1 })));
}
fs.writeFileSync(path.join(HERE, 'chromium-result.json'), `${JSON.stringify({ at: new Date().toISOString(), results }, null, 2)}\n`);
for (const r of results) if (r.error) console.error(`${r.key}: ${r.error}`);
process.exit(results.some((r) => r.failed || r.error) ? 1 : 0);

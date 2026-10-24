#!/usr/bin/env node
// الجولة اليدوية للموجة H (Docs/MJ/waves.json): «فتح صفحة الإعدادات في Chrome: إدخال نص غير صالح لا يجعل الحالة «سليم»، وحذف سرّ يعطّل
// ما يعتمد عليه وحده»، بنافذة مرئية (headless: false) ونقرات فأرة وكتابة لوحة مفاتيح حقيقية من Playwright، في جزأين:
//  أ. الحزمة المشحونة dist/chromium نفسها بلا أي تعديل (صلاحية api.github.com الاختيارية غير ممنوحة، كما عند المستخدم قبل منحها): نص غير
//     صالح يُرفض ولا يُطلب شيء، ورمز بصيغة صحيحة يُحفظ «غير متحقق منه» لا «سليم»، ومسحه بتأكيد.
//  ب. نسخة مشتقة من dist/chromium تمنح api.github.com آليًا والشيفرة كما هي (derivedCopy من فحوص MJ15): منتهٍ (401) ثم سليم بعد قبول فعلي،
//     وقراءة البطاقة بالرمز، ثم حذف الرمز ومفتاح مزوّد محفوظ في مفتاحه: يبقى المفتاح، وفي البطاقة يُعرض خيار الربط في لوحة API وحدها
//     وبقية البطاقة كاملة.
// لا شبكة خارجية: github.com وapi.github.com يُخدمان محليًا بردود جدول إشارات T-0.5 (fixture-token-states.json)، وكل مضيف آخر يُحجب ويُسجَّل.
// الرمز والمفتاح مختلَقان بصيغة حقيقية يُولَّدان وقت التشغيل ولا يُكتبان في أي دليل.
// الاستعمال: node evidence/wave-H/manual-round.mjs ← evidence/wave-H/manual-round.json وmanual-screens/
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../scripts/load-check.mjs';
import { derivedCopy, waitUntil, sleep } from '../../tests/modules/d/token/browser/drivers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const SCREENS = path.join(HERE, 'manual-screens');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const TOKEN = ['github', 'pat', `11MANUALMIJHARFAKE0000_${'xFakeManualRoundWaveH'.repeat(3).slice(0, 59)}`].join('_');
const KEY = ['sk', 'ant', 'api03', 'ManualFakeProviderKey'.repeat(3)].join('-');
const SECRET_RE = /github_pat_[A-Za-z0-9_]{20,}|sk-ant-api03-[A-Za-z0-9_-]{20,}/;
const hasSecret = (value) => SECRET_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));

const FIXTURE = JSON.parse(read('tests/modules/d/token/fixtures/fixture-token-states.json'));
const P = FIXTURE.privateRepo;
const PR_URL = `https://github.com/${P.owner}/${P.repo}/pull/${P.number}`;
const PR_PAGE = read('tests/modules/d/fixtures/fixture-pr-complex.html')
  .replaceAll('octo/demo', `${P.owner}/${P.repo}`)
  .replaceAll('octo-dev/demo', `${P.owner}/${P.repo}`)
  .replaceAll('4242', String(P.number))
  .replaceAll('22c15d5f509f0a7076b74b3f0f48a740802103b4', P.headSha);
const STATUS_FRAGMENT = read('tests/modules/d/fixtures/fixture-status-details.html');
const CARD = 'mijhar-host[data-mijhar-host="d.pr-status"]';

let mode = 'private';
function apiReply(pathAndQuery, authorization) {
  const ok = authorization === `Bearer ${TOKEN}`;
  if (authorization && !ok) return FIXTURE.states.invalid;
  if (mode === 'expired' && ok) return FIXTURE.states.expired;
  if (pathAndQuery.startsWith('/rate_limit')) return ok ? FIXTURE.states.valid : { status: 200, headers: { 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '59', 'x-ratelimit-reset': '1792768532', 'x-ratelimit-resource': 'core' }, body: { rate: { limit: 60, remaining: 59 } } };
  if (!ok) return FIXTURE.states['not-found'];
  const r = P.responses[pathAndQuery];
  if (r === undefined) return FIXTURE.states['not-found'];
  return typeof r === 'string' ? FIXTURE.states[r] : r;
}

async function session(extDir) {
  const { executable } = BROWSERS.chrome;
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-wave-h-manual-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executable,
    headless: false,
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const network = { api: [], github: [], blocked: new Set() };
  const consoleText = [];
  await context.route('https://github.com/**', (route) => {
    const url = new URL(route.request().url());
    network.github.push(url.pathname);
    if (url.pathname === `/${P.owner}/${P.repo}/pull/${P.number}`) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PR_PAGE });
    if (/\/status-details$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: STATUS_FRAGMENT });
    return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
  });
  await context.route('https://api.github.com/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const authorization = request.headers().authorization ?? null;
    const pathAndQuery = url.pathname + url.search;
    network.api.push({ method: request.method(), path: pathAndQuery, from: request.serviceWorker() ? 'background' : 'page', auth: authorization ? (authorization === `Bearer ${TOKEN}` ? 'saved' : 'other') : null });
    const r = apiReply(pathAndQuery, authorization);
    return route.fulfill({ status: r.status, contentType: 'application/json', headers: r.headers ?? {}, body: JSON.stringify(r.body ?? {}) });
  });
  await context.route((url) => url.protocol === 'https:' && !['github.com', 'api.github.com'].includes(url.host), (route) => {
    network.blocked.add(new URL(route.request().url()).host);
    return route.abort();
  });
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: extDir });
  const origin = `chrome-extension://${id}`;
  const sw = await waitUntil(async () => context.serviceWorkers().find((w) => w.url().startsWith(origin)) ?? null, 8000);
  sw?.on?.('console', (m) => consoleText.push(`background: ${m.text()}`));
  const options = await context.newPage();
  options.on('console', (m) => consoleText.push(`options: ${m.text()}`));
  await options.goto(`${origin}/options.html#token`);
  await options.waitForSelector('#app[data-ready="true"]');
  const github = await context.newPage();
  github.on('console', (m) => consoleText.push(`github: ${m.text()}`));
  await options.bringToFront();
  return {
    version: context.browser().version(),
    options,
    github,
    network,
    consoleText,
    async close() {
      await context.close();
      fs.rmSync(profileDir, { recursive: true, force: true });
    },
  };
}

const steps = [];
const check = (part, name, ok, detail) => {
  steps.push({ part, name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 300)}`}`);
};

const registry = (page) =>
  page.evaluate(() => {
    const card = (id) => document.querySelector(`[data-connection="${id}"]`);
    const badge = (id) => card(id)?.querySelector('[data-health]')?.getAttribute('data-health') ?? null;
    const badgeText = (id) => card(id)?.querySelector('[data-health]')?.textContent ?? '';
    const notice = document.querySelector('[data-token-check]');
    return {
      token: badge('github-token'),
      tokenLabel: badgeText('github-token'),
      provider: card('provider-key')?.getAttribute('data-availability') ?? null,
      health: notice?.getAttribute('data-health') ?? null,
      notice: notice?.textContent ?? '',
      message: document.querySelector('[data-token-message]')?.textContent ?? '',
      html: document.documentElement.outerHTML,
    };
  });
const waitBadge = (page, want) => waitUntil(async () => ((await registry(page)).token === want ? registry(page) : null), 10000);
const shot = async (page, name, locator) => {
  fs.mkdirSync(SCREENS, { recursive: true });
  const file = path.join(SCREENS, `${name}.png`);
  if (locator) await page.locator(locator).first().screenshot({ path: file });
  else await page.screenshot({ path: file, fullPage: false });
  return path.relative(HERE, file);
};
const showRegistry = (page) => page.locator('[data-connection="github-token"]').scrollIntoViewIfNeeded();
/** كتابة حقيقية في الحقل بلوحة المفاتيح (لا تعبئة برمجية) ثم نقرة فأرة على «احفظ». */
async function typeAndSave(page, text) {
  const field = page.locator('#mj-token-input');
  await field.click();
  await field.press('ControlOrMeta+a');
  await field.press('Backspace');
  await field.pressSequentially(text, { delay: 5 });
  await page.locator('[data-action="token-save"]').click();
}

const result = { date: new Date().toISOString(), browser: null, parts: {} };

// ———— أ. الحزمة المشحونة كما هي ————
console.log('— أ. dist/chromium كما هي (api.github.com غير ممنوحة)');
{
  const s = await session(path.join(ROOT, 'dist/chromium'));
  result.browser = `Chrome ${s.version}`;
  const { options } = s;
  try {
    await showRegistry(options);
    const start = await waitUntil(async () => ((await registry(options)).token ? registry(options) : null), 8000);
    check('أ', 'السجل: رمز GitHub «غير مربوط»، ومفتاح المزوّد «لم يُتح بعد»', start?.token === 'none' && start.provider === 'not-yet', start && { token: start.token, provider: start.provider });
    await shot(options, 'a1-registry-start');

    await typeAndSave(options, 'my-password-123');
    await sleep(500);
    const invalid = await registry(options);
    check('أ', 'نص غير صالح مكتوب بلوحة المفاتيح ونقرة «احفظ»: رسالة رفض، والحالة «غير مربوط» لا «سليم»، ولا طلب', invalid.token === 'none' && invalid.message.length > 0 && invalid.health !== 'healthy' && s.network.api.length === 0, { token: invalid.token, message: invalid.message, api: s.network.api.length });
    await shot(options, 'a2-invalid-text');

    await typeAndSave(options, TOKEN);
    const unverified = await waitBadge(options, 'unverified');
    check('أ', 'رمز بصيغة صحيحة بلا تحقق فعلي (الصلاحية غير ممنوحة): «غير متحقق منه» لا «سليم»، ولا طلب', unverified?.health === 'unverified' && unverified.notice.includes('api.github.com') && s.network.api.length === 0, unverified && { token: unverified.token, notice: unverified.notice, api: s.network.api.length });
    check('أ', 'لا رمز في DOM الإعدادات بعد الحفظ', unverified && !hasSecret(unverified.html), null);
    await shot(options, 'a3-saved-unverified');

    await options.locator('[data-action="token-clear"]').click();
    const confirm = await options.locator('[data-token-confirm]').textContent();
    await shot(options, 'a4-clear-confirm');
    await options.locator('[data-action="token-clear-confirm"]').click();
    const cleared = await waitBadge(options, 'none');
    check('أ', 'المسح بتأكيد يسمّي ما يتعطل وحده ثم «غير مربوط»', cleared?.token === 'none' && String(confirm).includes('مستودع خاص'), { confirm, token: cleared?.token });
    result.parts.a = { api: s.network.api, blocked: [...s.network.blocked], consoleHasSecret: hasSecret(s.consoleText.join('\n')) };
    check('أ', 'لا طلب إلى api.github.com ولا مضيف خارجي، ولا سرّ في الكونسول', s.network.api.length === 0 && s.network.blocked.size === 0 && !result.parts.a.consoleHasSecret, result.parts.a);
  } finally {
    await s.close();
  }
}

// ———— ب. نسخة مشتقة تمنح api.github.com (الشيفرة كما هي) ————
console.log('— ب. نسخة مشتقة من dist/chromium تمنح api.github.com');
{
  const extDir = derivedCopy('chromium');
  const s = await session(extDir);
  const { options, github } = s;
  try {
    // مفتاح مزوّد في مفتاحه المستقل (لا حقل له قبل MJ21؛ يُكتب كما تكتبه صفحة الإعدادات).
    await options.evaluate(async (key) => {
      await chrome.storage.session.set({ 'mijhar.secret.providerKey': { token: key, savedAt: Date.now() } });
    }, KEY);
    await options.reload();
    await options.waitForSelector('#app[data-ready="true"]');
    await showRegistry(options);

    mode = 'expired';
    const before = s.network.api.length;
    await typeAndSave(options, TOKEN);
    const expired = await waitBadge(options, 'expired');
    check('ب', 'رمز يرفضه GitHub (401) بعد طلب تحقق: «منتهٍ» لا «سليم»', expired?.health === 'expired' && expired.notice.includes('401'), expired && { token: expired.token, notice: expired.notice });
    await shot(options, 'b1-expired');

    mode = 'private';
    await options.locator('[data-action="token-check"]').click();
    const healthy = await waitBadge(options, 'healthy');
    check('ب', '«سليم» بعد قبول فعلي وحده (حد 5000)', healthy?.health === 'healthy' && healthy.notice.includes('5000'), healthy && { token: healthy.token, notice: healthy.notice });
    await shot(options, 'b2-healthy');
    const registryCalls = s.network.api.slice(before);
    check('ب', 'طلبات السجل: GET /rate_limit من الخلفية وحدها، واحد لكل تحقق (2)', registryCalls.length === 2 && registryCalls.every((c) => c.method === 'GET' && c.path === '/rate_limit' && c.from === 'background' && c.auth === 'saved'), registryCalls);

    await github.goto(PR_URL);
    await github.bringToFront();
    await github.locator(`${CARD} [data-action="api-read"]`).first().click({ timeout: 15000 });
    const readOk = await waitUntil(() => github.evaluate((sel) => document.querySelector(sel)?.shadowRoot?.querySelector('[data-access-part="pull"]')?.getAttribute('data-access-kind') ?? null, CARD), 12000);
    check('ب', 'البطاقة تقرأ الطلب الخاص بالرمز (نقرة «اقرأ» فعلية)', readOk === 'read', readOk);
    await shot(github, 'b3-card-read-with-token', CARD);

    await options.bringToFront();
    await options.locator('[data-action="token-clear"]').click();
    const confirm = await options.locator('[data-token-confirm]').textContent();
    await options.locator('[data-action="token-clear-confirm"]').click();
    const cleared = await waitBadge(options, 'none');
    const keys = await options.evaluate(async () => Object.keys(await chrome.storage.session.get(null)).sort());
    check('ب', 'حذف الرمز: «غير مربوط»، ومفتاح المزوّد باقٍ في مفتاحه المستقل', cleared?.token === 'none' && keys.includes('mijhar.secret.providerKey') && !keys.includes('mijhar.secret.githubToken') && String(confirm).includes('مستودع خاص'), { keys, confirm });
    await shot(options, 'b4-token-cleared');

    await github.bringToFront();
    await github.reload();
    await github.locator(`${CARD} [data-action="api-read"]`).first().click({ timeout: 15000 });
    const gate = await waitUntil(
      () =>
        github.evaluate((sel) => {
          const r = document.querySelector(sel)?.shadowRoot;
          const g = r?.querySelector('[data-gate="d.pr-status.private"]');
          return g ? { inApi: Boolean(g.closest('[data-section="api"]')), text: g.textContent, checks: Boolean(r.querySelector('[data-section="checks"]')), blockers: Boolean(r.querySelector('[data-section="blockers"]')) } : null;
        }, CARD),
      12000,
    );
    check('ب', 'بعد الحذف: ما يعتمد على الرمز وحده يتعطل (خيار الربط في لوحة API)، وبقية البطاقة (الفحوص والموانع) كاملة', gate?.inApi && gate.checks && gate.blockers && gate.text.includes('رمز GitHub للقراءة'), gate);
    await shot(github, 'b5-card-gate-after-delete', CARD);

    await options.evaluate(async () => chrome.storage.session.remove('mijhar.secret.providerKey'));
    result.parts.b = { api: s.network.api, blocked: [...s.network.blocked], consoleHasSecret: hasSecret(s.consoleText.join('\n')) };
    check('ب', 'كل طلبات api.github.com من الخلفية بـGET، ولا مضيف خارجي، ولا سرّ في الكونسول', s.network.api.every((c) => c.from === 'background' && c.method === 'GET') && s.network.blocked.size === 0 && !result.parts.b.consoleHasSecret, { blocked: result.parts.b.blocked, consoleHasSecret: result.parts.b.consoleHasSecret });
  } finally {
    await s.close();
    fs.rmSync(extDir, { recursive: true, force: true });
  }
}

result.steps = steps;
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (hasSecret(serialized)) {
  console.error('✗ الناتج يحمل سرًّا: لا يُحفظ');
  process.exitCode = 1;
} else fs.writeFileSync(path.join(HERE, 'manual-round.json'), serialized);
const passed = steps.filter((s) => s.ok).length;
console.log(`${result.browser}: ${passed}/${steps.length}`);
if (passed !== steps.length) process.exitCode = 1;

#!/usr/bin/env node
// الجولة اليدوية لبوابة الموجة K (Docs/MJ/waves.json) وجزء المتصفح من TEST-AI-05 — **محاكاة** في Chrome: تبديل المزوّد في بطاقة «مزوّد التحليل» الموحّدة بين
// Anthropic ومحوّل وهمي ثانٍ (Mock B، sim-provider.ts) على بناء محاكاة في مجلد مؤقت: شيفرة src نفسها، ويُحقن المحوّل الوهمي في السجلين الوصفي والمحوّلات وقت
// البناء وحده (إضافة سطر في كلٍّ منهما كما يفعل أي مزوّد يُضاف)، فلا يدخل dist المشحون. ومضيفاهما يُخدمان محليًا (Playwright route)، والمفتاحان
// مختلَقان يُولَّدان وقت التشغيل ولا يُكتبان في أي دليل. النقر والكتابة واختيار المزوّد بأحداث Playwright على الصفحة.
//   1. القائمة فيها المزوّدان؛ حفظ مفتاح Anthropic وتحققه.
//   2. التبديل إلى Mock B: مفتاحه «لا مفتاح» وحالته ونماذجه هو، ومفتاح Anthropic باقٍ «سليم» في ملخص المزوّدين؛ ثم حفظ مفتاحه وتحققه: طلبه بمفتاحه وحده إلى مضيفه.
//   3. الموافقة في صفحة مهمة Actions تذكر Mock B ومضيفه (المختار فعلًا)، والإرسال طلب واحد إلى مضيفه بمفتاحه، ولا شيء إلى Anthropic.
//   4. حذف مفتاح Mock B لا يمس مفتاح Anthropic (storage.session)، والعودة إلى Anthropic تعرض مفتاحه «سليمًا».
//   5. لا مفتاح مزوّد في طلب إلى مضيف غيره، ولا سرّ في الكونسول ولا الناتج.
// الاستعمال: node tests/modules/e/provider/browser/sim-check.mjs [--out-dir evidence/T-11.10]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { ENTRIES, FONTS_DIR, PAGES } from '../../../../../scripts/build.mjs';
import { generateManifest } from '../../../../../src/manifest/generate.mjs';
import { ROOT, chromiumSession, sleep, waitUntil } from '../../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);

const A_KEY = ['sk', 'ant', 'api03', 'SimCheckFakeAnthropicKey'.repeat(3)].join('-');
const B_KEY = `bkey-${'simcheckfake'.repeat(2)}`;
const SIM_HOST = 'api.mock-b.test';
const SECRET_RE = /sk-ant-api03-[A-Za-z0-9_-]{20,}|bkey-[a-z0-9]{12,}/;
const hasSecret = (value) => SECRET_RE.test(typeof value === 'string' ? value : JSON.stringify(value ?? null));
const SIM = path.join(ROOT, 'tests/modules/e/provider/browser/sim-provider.ts');

const JOB_URL = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
const JOB_PAGE = fs.readFileSync(path.join(ROOT, 'fixtures/logs/gh-job-failed.html'), 'utf8');
const MODELS = [{ type: 'model', id: 'mock-sonnet-2', display_name: 'Mock Sonnet 2', lifecycle: 'active', max_tokens: 64000 }];

/** يحقن Mock B سطرًا في السجل الوصفي وسطرًا في سجل المحوّلات، كما تفعل إضافة مزوّد؛ وما عداهما شيفرة src كما هي. */
const simPlugin = {
  name: 'mijhar-sim-provider',
  enforce: 'pre',
  transform(code, id) {
    const file = id.split('?')[0].split(path.sep).join('/');
    const inject = (from, to) => {
      if (!(typeof from === 'string' ? code.includes(from) : from.test(code))) throw new Error(`لم يُعثر على سطر السجل في ${file}`);
      return `import { SIM_B } from ${JSON.stringify(SIM)};\n${code.replace(from, to)}`;
    };
    // يُلحَق Mock B بآخر القائمة أيًّا كان ما دُمج قبله (Anthropic وOpenAI…): لا يرتبط الفحص بنص السطر.
    if (file.endsWith('/src/modules/e/provider/catalog.ts')) return inject(/(PROVIDER_DESCRIPTORS[^=\n]*= \[[^\]]*)\];/, '$1, SIM_B.descriptor];');
    if (file.endsWith('/src/modules/e/provider/registry.ts')) return inject(/(PROVIDER_ADAPTERS[^=\n]*= \[[^\]]*)\];/, '$1, SIM_B];');
    return null;
  },
};

async function simBuild() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj23-sim-'));
  for (const entry of ENTRIES) {
    await build({
      root: ROOT,
      configFile: path.join(ROOT, 'vite.config.ts'),
      mode: 'chromium',
      logLevel: 'warn',
      plugins: [simPlugin],
      build: { outDir: dir, emptyOutDir: false, lib: { entry: path.join(ROOT, entry.source), formats: ['iife'], name: entry.global, fileName: () => `${entry.name}.js` } },
    });
  }
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const manifest = generateManifest('chromium', { version });
  // المضيفات ممنوحة آليًا في نسخة الاختبار (لا نافذة إذن تُقبل آليًا في Chromium)؛ وطلبها في نقرة الحفظ يقيسه card.test.tsx.
  manifest.host_permissions = [...new Set([...(manifest.host_permissions ?? []), 'https://api.github.com/*', 'https://api.anthropic.com/*', `https://${SIM_HOST}/*`])];
  delete manifest.optional_host_permissions;
  fs.writeFileSync(path.join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const page of PAGES) fs.copyFileSync(path.join(ROOT, page.source), path.join(dir, page.file));
  const fonts = path.join(ROOT, FONTS_DIR);
  if (fs.existsSync(fonts)) {
    fs.mkdirSync(path.join(dir, 'fonts'), { recursive: true });
    for (const file of fs.readdirSync(fonts)) if (/\.(woff2|txt)$/.test(file)) fs.copyFileSync(path.join(fonts, file), path.join(dir, 'fonts', file));
  }
  return dir;
}

const githubReply = (pathname) => (pathname === new URL(JOB_URL).pathname ? { status: 200, type: 'text/html; charset=utf-8', body: JOB_PAGE } : { status: 404, type: 'text/plain', body: 'not found' });
const apiReply = () => ({ status: 404, body: { message: 'Not Found' } });
function anthropicReply(entry) {
  if (entry.path.startsWith('/v1/models')) return { status: 200, body: { data: MODELS, has_more: false } };
  if (entry.path === '/v1/messages') return { status: 200, body: { id: 'm', type: 'message', role: 'assistant', model: 'mock-sonnet-2', content: [{ type: 'text', text: '{"summary":"من Anthropic","findings":[],"next_steps":[],"missing":[]}' }], stop_reason: 'end_turn' } };
  return { status: 404, body: {} };
}
const simReply = () => ({ status: 200, body: {} });

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
    // DEC-13 ن-5: حقل النموذج اليدوي (ما يُرسل إليه)، وزر + معطّل بلا مفتاح، والقائمة حين تُفتح.
    model: c.querySelector('[data-model-input]')?.value ?? null,
    listDisabled: c.querySelector('[data-action="model-list"]')?.getAttribute('aria-disabled') === 'true',
    listed: [...c.querySelectorAll('[role="listbox"] [role="option"]')].map((o) => o.getAttribute('data-model')),
    others: c.querySelector('[data-other-providers]')?.textContent ?? '',
    busy: c.querySelector('[data-action="key-save"]')?.disabled ?? null,
  };
`;

async function scenario(session, checks) {
  const { d, network } = session;
  const page = session.context.pages().find((p) => p.url().endsWith('/options.html'));
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 500)}`}`);
  };
  const card = () => d.options(READ_CARD);
  const until = (want, ms = 12000) => waitUntil(async () => {
    const c = await card();
    return c && want(c) ? c : null;
  }, ms);
  const requests = (host) => network.extra.filter((r) => r.host === host);

  // 1.
  const start = await until((c) => c.health !== 'checking');
  // المزوّدون المشحونون (Anthropic ثم ما دُمج بعده) ثم Mock B في آخر القائمة؛ فلا يرتبط الفحص بعدد المدموجين.
  check('القائمة فيها Anthropic أولًا ومحوّل وهمي مدموج في بناء المحاكاة آخرًا، والمختار Anthropic', start?.providers[0] === 'anthropic' && start.providers.at(-1) === 'mock-b' && start.provider === 'anthropic', start);
  await d.fill('#mj-key-input', A_KEY);
  await d.click('[data-action="key-save"]');
  const aHealthy = await until((c) => c.provider === 'anthropic' && c.health === 'healthy' && Boolean(c.model));
  check('Anthropic: مفتاحه «سليم» بطلب تحققه ومودلاته من قائمته', Boolean(aHealthy) && requests('api.anthropic.com').length === 1, { card: aHealthy, requests: requests('api.anthropic.com').length });

  // 2.
  await page.selectOption('#mj-provider-select', 'mock-b');
  const switched = await until((c) => c.provider === 'mock-b' && c.key === 'none');
  check('التبديل إلى Mock B: مفتاحه «لا مفتاح» ومضيفه، وحقل نموذجه فارغ يعمل وزر + معطّل بلا مفتاحه، ومفتاح Anthropic باقٍ «سليم» في ملخص المزوّدين', Boolean(switched) && switched.head === 'مفتاح Mock B' && switched.health === 'none' && switched.host.includes(SIM_HOST) && switched.model === '' && switched.listDisabled === true && switched.others.includes('Anthropic — مفتاح سليم'), switched);
  check('التبديل لا يرسل شيئًا', requests(SIM_HOST).length === 0 && requests('api.anthropic.com').length === 1, network.extra.length);
  await d.fill('#mj-key-input', B_KEY);
  await d.click('[data-action="key-save"]');
  const bHealthy0 = await until((c) => c.provider === 'mock-b' && c.health === 'healthy' && Boolean(c.model));
  await d.click('[data-provider-card] [data-action="model-list"]');
  const bHealthy = await until((c) => c.provider === 'mock-b' && c.listed.length > 0);
  await d.click('[data-provider-card] [data-action="model-list"]');
  const bVerify = requests(SIM_HOST);
  check('Mock B: طلب تحققه إلى مضيفه بمفتاحه وحده، ومفتاحه «سليم»، والحقل مقترح من قائمته هو وزر + يعرض نماذجه هو لا نماذج Anthropic', Boolean(bHealthy0) && bHealthy0.model === 'b-model-2' && Boolean(bHealthy) && bHealthy.listed.join(',') === 'b-model-2,b-model-1' && bVerify.length === 1 && bVerify[0].headers['x-mock-key'] === B_KEY && !bVerify[0].headers['x-api-key'] && bVerify[0].from === 'background', { card: bHealthy, verify: bVerify.map((r) => ({ path: r.path, from: r.from, key: r.headers['x-mock-key'] === B_KEY ? 'B' : 'other' })) });

  // لقطتا البطاقة الموحّدة (O-23 فاتحًا وO-27 داكنًا) للمراجعة البصرية.
  if (outDir) {
    fs.mkdirSync(path.join(outDir, 'screens'), { recursive: true });
    const shot = async (name) => {
      const el = page.locator('[data-connection="provider-key"]');
      await el.scrollIntoViewIfNeeded();
      await el.screenshot({ path: path.join(outDir, 'screens', `${name}.png`) });
    };
    await shot('card-mock-b-light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await sleep(300);
    await shot('card-mock-b-dark');
    await page.emulateMedia({ colorScheme: 'light' });
  }

  // 3.
  await d.openGithub(JOB_URL);
  await waitUntil(() => d.github(`return Boolean(${IN_LOG('[data-action="analysis-open"]')}) || null;`), 15000);
  await d.clickShadow(LOG, '[data-action="analysis-open"]');
  const consent = await waitUntil(() => d.github(`const c = ${IN_LOG('[data-consent]')}; const l = c?.querySelector('[data-consent-lead]')?.textContent ?? ''; return c && l.includes('Mock B') ? { title: c.querySelector('#mj-consent-title')?.textContent ?? '', lead: l, destination: c.querySelector('[data-consent-row="destination"]')?.textContent ?? '', text: c.textContent } : null;`), 10000);
  check('الموافقة تذكر المختار فعلًا: Mock B ومضيفه ومودله، ولا ذكر لـAnthropic', Boolean(consent) && consent.title === 'إرسال هذا إلى Mock B للتحليل؟' && consent.lead.includes(SIM_HOST) && consent.lead.includes('B Model 2') && consent.destination.includes('Mock B · B Model 2') && !consent.text.includes('Anthropic'), consent);
  await d.clickShadow(LOG, '[data-action="consent-confirm"]');
  await waitUntil(() => d.github(`return Boolean(${IN_LOG('[data-analysis="result"]')}) || null;`), 10000);
  const posts = network.extra.filter((r) => r.method === 'POST');
  check('الإرسال طلب واحد إلى مضيف Mock B بمفتاحه وحده، ولا شيء إلى Anthropic', posts.length === 1 && posts[0].host === SIM_HOST && posts[0].headers['x-mock-key'] === B_KEY && !posts[0].headers['x-api-key'] && !(posts[0].body ?? '').includes(A_KEY), posts.map((r) => ({ host: r.host, path: r.path })));

  // 4.
  await page.bringToFront();
  await d.click('[data-action="key-clear"]');
  await d.click('[data-action="key-clear-confirm"]');
  const cleared = await until((c) => c.provider === 'mock-b' && c.key === 'none');
  const session1 = await d.options(`const api = globalThis.chrome; return Object.keys(await api.storage.session.get(null)).filter((k) => k.startsWith('mijhar.secret.')).sort();`);
  check('حذف مفتاح Mock B يخصه: مفتاحه غائب ومفتاح Anthropic باقٍ في مفتاح الجلسة التاريخي', Boolean(cleared) && session1.includes('mijhar.secret.providerKey') && !session1.includes('mijhar.secret.providerKey.mock-b'), session1);
  await page.selectOption('#mj-provider-select', 'anthropic');
  const back = await until((c) => c.provider === 'anthropic' && c.health === 'healthy');
  check('العودة إلى Anthropic: مفتاحه «سليم» ونموذجه في حقله كما هو، وMock B «لا مفتاح» في الملخص', Boolean(back) && back.model === 'mock-sonnet-2' && back.others.includes('Mock B — لا مفتاح'), back);

  // 5.
  const crossed = network.extra.filter((r) => (r.host === SIM_HOST ? JSON.stringify(r).includes(A_KEY) || Boolean(r.headers['x-api-key']) : JSON.stringify(r).includes(B_KEY) || Boolean(r.headers['x-mock-key'])));
  check('لا مفتاح مزوّد في أي طلب إلى مضيف غيره', crossed.length === 0, crossed.map((r) => ({ host: r.host, path: r.path })));
  check('كل طلبات المزوّدين من الخلفية', network.extra.every((r) => r.from === 'background'), network.extra.map((r) => r.from));
  await sleep(300);
}

const checks = [];
const result = { mode: 'محاكاة: بناء مؤقت بمحوّل وهمي ثانٍ محقون وقت البناء، لا الحزمة المشحونة', checks };
let session;
let extDir;
try {
  extDir = await simBuild();
  session = await chromiumSession('chrome', { extDir, githubReply, apiReply, extra: { 'api.anthropic.com': anthropicReply, [SIM_HOST]: simReply } });
  result.browser = `${session.label} ${session.browserVersion}`;
  console.log(`— ${result.browser} (محاكاة)`);
  await scenario(session, checks);
  result.extensionErrors = await session.extensionErrors();
} catch (error) {
  result.error = String(error?.stack ?? error);
} finally {
  if (session) {
    result.network = session.network.extra.map((r) => ({ host: r.host, method: r.method, path: r.path, from: r.from, key: r.headers['x-api-key'] === A_KEY ? 'anthropic' : r.headers['x-mock-key'] === B_KEY ? 'mock-b' : r.headers['x-api-key'] || r.headers['x-mock-key'] ? 'other' : null }));
    result.blocked = [...session.network.blocked].sort();
    result.consoleHasSecret = hasSecret(session.consoleText());
    await session.close();
  }
  if (extDir) fs.rmSync(extDir, { recursive: true, force: true });
}
const add = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 400)}`}`);
};
add('اكتمل التشغيل بلا خطأ', !result.error, result.error?.split('\n').slice(0, 3).join(' | '));
add('لا سرّ في الكونسول', result.consoleHasSecret === false, result.consoleHasSecret);
if (result.extensionErrors) add('لا أخطاء تشغيل ولا مانيفست للإضافة', result.extensionErrors.runtime.length === 0 && result.extensionErrors.manifest.length === 0, result.extensionErrors);
const serialized = `${JSON.stringify(result, null, 2)}\n`;
if (hasSecret(serialized)) {
  console.error('✗ الناتج يحمل سرًّا: لا يُحفظ');
  process.exitCode = 1;
} else if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'browser-sim-check.json'), serialized);
}
const passed = checks.filter((c) => c.ok).length;
console.log(`المجموع (محاكاة): ${passed}/${checks.length}`);
if (passed !== checks.length) process.exitCode = 1;

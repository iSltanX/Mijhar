// فحص G-2 / AD-27 على الحزمة المشحونة (dist/chromium) في متصفح حقيقي من عائلة Chromium، وحزمة اللغة downloadable في ملف تعريف جديد:
// نقرة «موافق» البرمجية من عالم الصفحة الرئيسي مرفوضة حتى داخل نشاط مستخدم (page.evaluate في Playwright يمنح الصفحة نشاطًا لحظة تنفيذه، وهي الحالة التي
// بدأ فيها التنزيل قبل الإصلاح، evidence/wave-G/review/discarded/)، ونقرة الفأرة الفعلية مقبولة. في سطحين: شريط الترجمة (c/ui، ومعه بطاقة التحديد بالمكوّن
// نفسه ConsentPanel) و«ترجمة مسودتي» في مساعد الكتابة (f/phrasebank). كل طلب http(s) غير العينة يُحجب.
// الاستعمال: node trusted-click-check.mjs [chrome|brave] [--out <ملف json>] [--keyboard]
//   --keyboard: «موافق» الأخيرة بلوحة المفاتيح بدل الفأرة (Enter في الشريط وSpace في المساعد): تفعيل الزر من الكيبورد حدث موثوق أيضًا، فلا يُكسر الوصول.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { driver, launchShipped, PAGE, settleBar } from '../../../scripts/network-audit.mjs';
import { launchChromium, sleep, waitFor, writeJson } from '../../../scripts/spikes/lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const kbIndex = args.indexOf('--keyboard');
const keyboard = kbIndex !== -1;
if (keyboard) args.splice(kbIndex, 1);
const key = args[0] ?? 'chrome';
const README = '[data-case="readme"]';
const checks = [];
const check = (surface, name, ok, detail) => {
  checks.push({ surface, name, ok: Boolean(ok), detail: detail ?? null });
  console.log(`${ok ? '✓' : '✗'} [${surface}] ${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};
const availabilityIn = (page) => page.evaluate("typeof Translator === 'function' ? Translator.availability({ sourceLanguage: 'en', targetLanguage: 'ar' }) : Promise.resolve(null)");

/** نقرتان برمجيتان من عالم الصفحة (داخل page.evaluate، أي مع نشاط مستخدم لحظي): click() وMouseEvent مُنشأ. */
const forgeIn = (page, hostSelector, selector) =>
  page.evaluate(
    ({ hostSelector, selector }) => {
      const btn = document.querySelector(hostSelector)?.shadowRoot?.querySelector(selector);
      if (!btn) return { found: false };
      const seen = [];
      const spy = (e) => seen.push(e.isTrusted);
      btn.addEventListener('click', spy);
      const activation = navigator.userActivation.isActive;
      btn.click();
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
      btn.removeEventListener('click', spy);
      return { found: true, isTrusted: seen, userActivationActive: activation };
    },
    { hostSelector, selector },
  );

async function barSurface() {
  const b = await launchShipped(key, { record: false });
  const out = { version: b.version };
  try {
    const d = driver(b.page);
    await b.page.goto(PAGE.href, { waitUntil: 'load' });
    await d.waitBars();
    out.start = await availabilityIn(b.page);
    if (out.start !== 'downloadable') return check('الشريط', 'الحزمة downloadable في ملف التعريف الجديد (شرط الفحص)', false, out.start), out;
    await d.click(README, 'translate');
    await sleep(600);
    check('الشريط', 'نقرة فأرة فعلية على «ترجمة» تعرض بطاقة الاستئذان', Boolean((await d.bar(README))?.consent));
    out.forged = await forgeIn(b.page, 'mijhar-host[data-mijhar-host="c.ui.bar"]', '[data-action="consent-confirm"]');
    await sleep(6000);
    const bar = await d.bar(README);
    out.afterForged = { phase: bar?.phase, consent: Boolean(bar?.consent), translations: bar?.translations, availability: await availabilityIn(b.page) };
    check('الشريط', 'النقرتان البرمجيتان (isTrusted=false، ونشاط المستخدم قائم) لا تبدآن تنزيلًا ولا ترجمة: البطاقة باقية والحزمة downloadable', out.forged.found && out.forged.isTrusted.every((t) => t === false) && out.afterForged.consent && out.afterForged.availability === 'downloadable' && !out.afterForged.translations, { forged: out.forged, after: out.afterForged });
    if (keyboard) {
      // تركيز برمجي على الزر (لا ينقر) ثم Enter حقيقية من لوحة المفاتيح.
      await b.page.locator('mijhar-host[data-mijhar-host="c.ui.bar"] [data-action="consent-confirm"]').first().focus();
      await b.page.keyboard.press('Enter');
    } else await d.click(README, 'consent-confirm');
    const done = await settleBar(d, README, 180000);
    out.afterReal = { phase: done?.phase, translations: done?.translations, arabic: done?.arabic, availability: await availabilityIn(b.page) };
    check('الشريط', keyboard ? 'Enter على «موافق» المركَّز تنزّل الحزمة وتترجم' : 'نقرة فأرة فعلية على «موافق» تنزّل الحزمة وتترجم', done?.phase === 'done' && done.arabic > 0 && out.afterReal.availability === 'available', out.afterReal);
  } catch (error) {
    out.error = String(error.stack ?? error);
    check('الشريط', 'بلا خطأ تشغيل', false, out.error.split('\n')[0]);
  } finally {
    await b.close();
  }
  return out;
}

async function composerSurface() {
  const html = fs.readFileSync(path.join(ROOT, 'tests/modules/f/composer/fixtures/fixture-editors.html'), 'utf8');
  const b = await launchChromium(key, { extension: path.join(ROOT, 'dist/chromium') });
  const out = { version: b.version };
  try {
    await b.context.route(/^https?:\/\//, async (route) => {
      const r = route.request();
      const u = new URL(r.url());
      if (r.isNavigationRequest() && u.origin === 'https://github.com' && u.pathname === '/octo/demo/pull/7') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      return route.abort('blockedbyclient');
    });
    const page = await b.context.newPage();
    await page.goto('https://github.com/octo/demo/pull/7', { waitUntil: 'load' });
    const at = (selector, panel = true) =>
      page.evaluate(
        ({ selector, panel }) => {
          const field = document.getElementById('new_comment_field');
          const toolbar = [...document.querySelectorAll('markdown-toolbar')].find((t) => t.getAttribute('for') === 'new_comment_field');
          const trigger = [...(toolbar ? toolbar.children : [field?.previousElementSibling])].find((el) => el?.getAttribute?.('data-mijhar-host') === 'f.composer.button');
          const host = panel ? document.querySelector('mijhar-host[data-mijhar-host="f.composer.panel"]') : trigger;
          const el = host?.shadowRoot?.querySelector(selector);
          if (!el) return null;
          el.scrollIntoView({ block: 'center', behavior: 'instant' });
          const rc = el.getBoundingClientRect();
          return { x: Math.round(rc.x + rc.width / 2), y: Math.round(rc.y + rc.height / 2) };
        },
        { selector, panel },
      );
    const realClick = async (selector, panel = true) => {
      await at(selector, panel);
      await sleep(150);
      const p = await at(selector, panel);
      if (!p) throw new Error(`لا عنصر: ${selector}`);
      await page.mouse.click(p.x, p.y);
    };
    const state = () =>
      page.evaluate(() => {
        const s = document.querySelector('mijhar-host[data-mijhar-host="f.composer.panel"]')?.shadowRoot?.querySelector('[data-section="translate-draft"]');
        return { consent: Boolean(s?.querySelector('[data-consent]')), result: s?.querySelector('[data-translate-result]')?.getAttribute('data-translate-result') ?? null, translated: s?.querySelector('[data-translated-text]')?.textContent ?? null };
      });
    await waitFor(async () => (await page.evaluate(() => document.querySelectorAll('mijhar-host[data-mijhar-host="f.composer.button"]').length)) > 0 || null, 30000, 200);
    await page.fill('#new_comment_field', 'Run `npm test` in src/app.js and read https://example.com/docs before you merge.');
    out.start = await availabilityIn(page);
    if (out.start !== 'downloadable') return check('المساعد', 'الحزمة downloadable في ملف التعريف الجديد (شرط الفحص)', false, out.start), out;
    await realClick('button', false);
    await waitFor(async () => (await at('[data-action="translate-draft"]')) || null, 15000, 200);
    await realClick('[data-action="translate-draft"]');
    await sleep(800);
    check('المساعد', 'نقرة فأرة فعلية على «ترجم مسودة الحقل» تعرض بطاقة الاستئذان', (await state()).consent);
    out.forged = await forgeIn(page, 'mijhar-host[data-mijhar-host="f.composer.panel"]', '[data-action="consent-confirm"]');
    await sleep(6000);
    out.afterForged = { ...(await state()), availability: await availabilityIn(page) };
    check('المساعد', 'النقرتان البرمجيتان لا تبدآن تنزيلًا ولا ترجمة: البطاقة باقية والحزمة downloadable', out.forged.found && out.forged.isTrusted.every((t) => t === false) && out.afterForged.consent && out.afterForged.availability === 'downloadable' && !out.afterForged.result, { forged: out.forged, after: out.afterForged });
    if (keyboard) {
      // البطاقة تأخذ التركيز على «موافق» حين تظهر (translate-draft.tsx)؛ يُتحقق من ذلك ثم Space حقيقية.
      out.focused = await page.evaluate(() => document.querySelector('mijhar-host[data-mijhar-host="f.composer.panel"]')?.shadowRoot?.activeElement?.getAttribute('data-action') ?? null);
      check('المساعد', 'التركيز على «موافق» حين تظهر البطاقة', out.focused === 'consent-confirm', out.focused);
      await page.keyboard.press('Space');
    } else await realClick('[data-action="consent-confirm"]');
    const done = await waitFor(async () => {
      const s = await state();
      return s.result ? s : null;
    }, 180000, 300);
    out.afterReal = { ...done, availability: await availabilityIn(page) };
    check('المساعد', keyboard ? 'Space على «موافق» المركَّز تنزّل الحزمة وتترجم' : 'نقرة فأرة فعلية على «موافق» تنزّل الحزمة وتترجم', done?.result === 'translated' && /[؀-ۿ]/.test(done.translated ?? '') && out.afterReal.availability === 'available', { result: done?.result, translated: done?.translated?.slice(0, 100), availability: out.afterReal.availability });
  } catch (error) {
    out.error = String(error.stack ?? error);
    check('المساعد', 'بلا خطأ تشغيل', false, out.error.split('\n')[0]);
  } finally {
    await b.close();
  }
  return out;
}

const result = { key, measuredAt: new Date().toISOString(), bar: await barSurface(), composer: await composerSurface() };
result.checks = checks;
if (outFile) writeJson(outFile, result);
const failed = checks.filter((c) => !c.ok).length;
console.log(`${key}: ${checks.length - failed}/${checks.length} اجتازت`);
process.exitCode = failed ? 1 : 0;

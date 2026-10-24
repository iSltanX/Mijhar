// فحص G-1 على الحزمة المشحونة في Chrome وBrave الحقيقيين (حزمة اللغة downloadable في ملف تعريف جديد):
// «ترجمة مسودتي» في مساعد الكتابة ← زر ظاهر لا «المحرك غير متاح» ← نقرة فعلية تعرض بطاقة الاستئذان بلا create() ← «ليس الآن» ← نقرة فعلية على «موافق» تنزّل وتترجم ← نقرة تالية بلا بطاقة.
// الصفحة محلية (fixture-editors.html مقدَّمة من اعتراض الطلب على عنوان github.com)، وكل طلب http(s) آخر يُحجب. الاستعمال: node real-browser-check.mjs [chrome|brave]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChromium, sleep, waitFor, writeJson } from '../../../scripts/spikes/lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const key = process.argv[2] ?? 'chrome';
const HREF = 'https://github.com/octo/demo/pull/7';
const DRAFT = 'Run `npm test` in src/app.js and read https://example.com/docs before you merge.';
const html = fs.readFileSync(path.join(ROOT, 'tests/modules/f/composer/fixtures/fixture-editors.html'), 'utf8');
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};

const b = await launchChromium(key, { extension: path.join(ROOT, 'dist/chromium') });
const blocked = [];
let out = { key, version: b.version };
try {
  await b.context.route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.isNavigationRequest() && url.origin === 'https://github.com' && url.pathname === '/octo/demo/pull/7') {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
      return;
    }
    blocked.push(request.url());
    await route.abort('blockedbyclient');
  });
  const page = await b.context.newPage();
  await page.goto(HREF, { waitUntil: 'load' });
  const availability = () => page.evaluate("typeof Translator === 'function' ? Translator.availability({ sourceLanguage: 'en', targetLanguage: 'ar' }) : Promise.resolve(null)");
  const at = (selector, inPanel = true) =>
    page.evaluate(
      ({ selector, inPanel }) => {
        // زر المساعد الذي يخدم #new_comment_field: في شريط أدواته أو قبل الحقل مباشرة (كما في tests/modules/f/composer/helpers.ts).
        const field = document.getElementById('new_comment_field');
        const toolbar = [...document.querySelectorAll('markdown-toolbar')].find((t) => t.getAttribute('for') === 'new_comment_field');
        const trigger = [...(toolbar ? toolbar.children : [field?.previousElementSibling])].find((el) => el?.getAttribute?.('data-mijhar-host') === 'f.composer.button');
        const host = inPanel ? document.querySelector('mijhar-host[data-mijhar-host="f.composer.panel"]') : trigger;
        const el = host?.shadowRoot?.querySelector(selector);
        if (!el) return null;
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      },
      { selector, inPanel },
    );
  const click = async (selector, inPanel = true) => {
    await at(selector, inPanel);
    await sleep(150);
    const p = await at(selector, inPanel);
    if (!p) throw new Error(`لا عنصر: ${selector}`);
    await page.mouse.click(p.x, p.y);
  };
  const panel = () =>
    page.evaluate(() => {
      const root = document.querySelector('mijhar-host[data-mijhar-host="f.composer.panel"]')?.shadowRoot;
      const section = root?.querySelector('[data-section="translate-draft"]');
      const text = (el) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
      return {
        service: section?.getAttribute('data-service') ?? null,
        status: text(section?.querySelector('[data-translate-status]')),
        button: Boolean(section?.querySelector('[data-action="translate-draft"]')),
        buttonDisabled: section?.querySelector('[data-action="translate-draft"]')?.disabled ?? null,
        consent: text(section?.querySelector('[data-consent]')),
        result: section?.querySelector('[data-translate-result]')?.getAttribute('data-translate-result') ?? null,
        translated: text(section?.querySelector('[data-translated-text]')),
        error: text(section?.querySelector('[data-translate-result="error"]')),
      };
    });

  await waitFor(async () => (await page.evaluate(() => document.querySelectorAll('mijhar-host[data-mijhar-host="f.composer.button"]').length)) > 0 || null, 30000, 200);
  await page.fill('#new_comment_field', DRAFT);
  out.availabilityAtStart = await availability();
  console.log(key, b.version, 'availability عند البدء =', out.availabilityAtStart);
  if (out.availabilityAtStart !== 'downloadable') {
    check('الحزمة downloadable في ملف التعريف الجديد (شرط الفحص)', false, out.availabilityAtStart);
  } else {
    await click('button', false);
    await waitFor(async () => (await at('[data-section="translate-draft"]')) || null, 15000, 200);
    await sleep(800);
    const s1 = await panel();
    out.s1 = s1;
    check('القسم جاهز وزر الترجمة ظاهر ومفعَّل (لا «المحرك غير متاح»)', s1.service === 'ready' && s1.button && s1.buttonDisabled === false && !s1.status, s1);
    check('لا create() عند فتح المساعد: الحزمة ما زالت downloadable', (await availability()) === 'downloadable');

    await click('[data-action="translate-draft"]');
    await sleep(800);
    const s2 = await panel();
    out.s2 = s2;
    check('النقرة الفعلية الأولى تعرض بطاقة الاستئذان (الحجم غير معلن) بدل الترجمة', Boolean(s2.consent?.includes('غير معلن من المتصفح')) && !s2.button && !s2.result, s2.consent);
    check('ولا create() أثناء البطاقة: ما زالت downloadable', (await availability()) === 'downloadable');

    await click('[data-action="consent-decline"]');
    await sleep(600);
    const s3 = await panel();
    out.s3 = s3;
    check('«ليس الآن» تخفي البطاقة وتعيد الزر', !s3.consent && s3.button && !s3.result, s3);
    check('ولا تنزيل بعد «ليس الآن»', (await availability()) === 'downloadable');

    await click('[data-action="translate-draft"]');
    await sleep(600);
    await click('[data-action="consent-confirm"]');
    const t0 = Date.now();
    const done = await waitFor(async () => {
      const p = await panel();
      return p.result ? p : null;
    }, 180000, 300);
    out.s4 = done;
    out.s4ms = Date.now() - t0;
    check('«موافق» بنقرة فعلية تنزّل الحزمة وتترجم: نتيجة للمراجعة', done?.result === 'translated' && /[؀-ۿ]/.test(done.translated ?? '') && (done.translated ?? '').includes('npm test'), { ms: out.s4ms, result: done?.result, translated: done?.translated?.slice(0, 120), error: done?.error });
    check('الحزمة صارت available بعد الموافقة', (await availability()) === 'available');

    await click('[data-action="translate-draft"]');
    const again = await waitFor(async () => {
      const p = await panel();
      return p.result === 'translated' && !p.consent ? p : null;
    }, 60000, 300);
    out.s5 = again;
    check('النقرة التالية تترجم بلا بطاقة جديدة', Boolean(again), again?.consent ?? 'ok');
  }
  out.blockedRequests = blocked;
  check('لا طلب شبكة خارجي أثناء التجربة (المحجوب: العينة وأيقونتها فقط)', blocked.every((u) => /github\.com\/favicon\.ico$/.test(u)), blocked);
} catch (error) {
  out.error = String(error.stack ?? error);
  console.log('خطأ:', out.error);
} finally {
  await b.close();
}
out.checks = checks;
writeJson(path.join(ROOT, `evidence/wave-G/g1-consent-draft/real-browser-${key}.json`), out);
const failed = checks.filter((c) => !c.ok).length || out.error;
console.log(`${checks.length - checks.filter((c) => !c.ok).length}/${checks.length} اجتازت`);
process.exitCode = failed ? 1 : 0;

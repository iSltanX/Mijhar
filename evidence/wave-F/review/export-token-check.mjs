#!/usr/bin/env node
// مراجعة الموجة F (AD-26): تقاطع MJ13 (التصدير) مع MJ15 (الرمز) على الحزمة المشحونة نفسها، وهو الشق الذي لم يُجرَ من TEST-SEC-02
// في فرع MJ15 لأن التصدير لم يكن مدمجًا فيه: «بحث بنمط الرمز ... يشمل التصدير وحزمة السياق والملاحظات».
//   1. تُزرع الملاحظات والروابط من fixture-notes-set.json في storage.local، ويُحفظ رمز بصيغة github_pat_ من قسم الرمز في صفحة الإعدادات
//      بالواجهة نفسها (ذاكرة الجلسة ثم القرص).
//   2. بعد كل حفظ: تنزيل JSON (بلا ملح ثم بالملح) وMarkdown حقيقيان من أدوات البيانات، وتفريغ storage.local كاملًا.
//   3. البحث في كل ذلك عن الرمز حرفيًا وعن أي نمط github_pat_ يعيد صفرًا.
// عائلة Chromium وحدها (Firefox لا يتيح القرص، وشيفرة التصدير واحدة). الاستعمال: node evidence/wave-F/review/export-token-check.mjs [chrome edge brave]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../scripts/load-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SET = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/g/fixtures/fixture-notes-set.json'), 'utf8'));
const D = 'mijhar:data:';
const SEED = {};
for (const note of SET.notes) SEED[`${D}notes.${note.id}`] = note;
for (const bookmark of SET.bookmarks) SEED[`${D}bookmarks.${bookmark.id}`] = bookmark;
SEED[`${D}anchor-salt`] = { salt: 'a'.repeat(64), createdAt: '2026-10-24T00:00:00.000Z' };

// رمز مختلَق بصيغة دقيق الحبيبات (لا يُرسل إلى GitHub: صلاحية api.github.com غير ممنوحة في هذا الملف التعريفي).
const TOKEN = `github_pat_11MIJHARREVIEW0000000000_${'Z9y8X7w6V5u4T3s2R1q0'.repeat(3)}`;
const PATTERN = /github_pat_[A-Za-z0-9_]{20,}/;
const SECTION = '[data-section="module-g-export"]';

const keys = process.argv.slice(2).length ? process.argv.slice(2) : ['chrome'];
let failed = 0;

for (const key of keys) {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-wave-f-export-token-'));
  const context = await chromium.launchPersistentContext(profileDir, { executablePath: executable, headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'], acceptDownloads: true });
  const checks = [];
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : `: ${JSON.stringify(detail)?.slice(0, 300)}`}`);
    if (!ok) failed++;
  };
  console.log(`— ${label} ${context.browser().version()}`);
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
    const options = await context.newPage();
    const open = async () => {
      await options.goto(`chrome-extension://${id}/options.html`);
      await options.waitForSelector('#app[data-ready="true"]');
    };
    await open();
    await options.evaluate((seed) => chrome.storage.local.set(seed), SEED);
    await open();
    await options.waitForSelector(`${SECTION} [data-data-tools="ready"]`, { timeout: 10000 });

    const saveToken = async (place) => {
      await options.click(`input[name="mj-token-place"][value="${place}"]`);
      await options.fill('#mj-token-input', TOKEN);
      await options.click('[data-action="token-save"]');
      await options.waitForSelector(`[data-token-state="${place}"]`, { timeout: 10000 });
    };
    const download = async (action) => {
      const [file] = await Promise.all([options.waitForEvent('download', { timeout: 8000 }), options.click(`${SECTION} [data-action="${action}"]`)]);
      return { name: file.suggestedFilename(), text: fs.readFileSync(await file.path(), 'utf8') };
    };
    const tickSalt = (on) => options.evaluate(([sel, value]) => {
      const el = document.querySelector(`${sel} [data-option="include-salt"]`);
      if (el && el.checked !== value) el.click();
    }, [SECTION, on]);

    for (const place of ['session', 'disk']) {
      await saveToken(place);
      check(`الرمز محفوظ في ${place === 'session' ? 'ذاكرة الجلسة' : 'القرص'} من واجهة الإعدادات`, true);
      const json = await download('export-json');
      await tickSalt(true);
      const salted = await download('export-json');
      await tickSalt(false);
      const md = await download('export-md');
      const local = JSON.stringify(await options.evaluate(() => chrome.storage.local.get(null)));
      const bundle = JSON.parse(json.text);
      check(`[${place}] التصدير حقيقي وكامل (${bundle.notes.length} ملاحظة و${bundle.bookmarks.length} رابطًا)`, bundle.notes.length === SET.notes.length && bundle.bookmarks.length === SET.bookmarks.length, { notes: bundle.notes.length });
      for (const [name, text] of [['JSON بلا ملح', json.text], ['JSON بالملح', salted.text], ['Markdown', md.text], ['storage.local كاملًا (والملاحظات فيه)', local]]) {
        check(`[${place}] ${name}: لا الرمز ولا نمط github_pat_`, !text.includes(TOKEN) && !PATTERN.test(text), { hit: text.match(PATTERN)?.[0]?.slice(0, 16) });
      }
      const dom = await options.evaluate(() => document.documentElement.outerHTML);
      check(`[${place}] DOM صفحة الإعدادات بعد الحفظ والتصدير بلا الرمز`, !dom.includes(TOKEN), null);
    }
    await options.click('[data-action="token-clear"]');
    await options.waitForSelector('[data-token-state="none"]', { timeout: 10000 });
    check('المسح بعد الفحص', true);
  } catch (error) {
    check('اكتمل السيناريو', false, String(error?.stack ?? error));
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  console.log(`${label}: ${checks.filter((c) => c.ok).length}/${checks.length}`);
}
process.exitCode = failed ? 1 : 0;

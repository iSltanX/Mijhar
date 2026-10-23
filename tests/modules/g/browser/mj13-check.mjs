#!/usr/bin/env node
// فحص MJ13 (T-8.4) على الحزمة المشحونة نفسها (dist/chromium وdist/firefox من npm run build)، بلا واجهة، بملف تعريف مؤقت، ولا شبكة: الامتداد الفعلي بخلفيته وتخزينه ورسائله.
//   1. صفحة الإعدادات (options.html) تعرض مكان التخزين وتنبيه الجهاز المشترك بنصه المعتمد وأدوات البيانات؛ والأعداد من التخزين الفعلي (500 عنصر من مجموعة PB-04).
//   2. التصدير: ملفا JSON وMarkdown ينزلان فعلًا على القرص (تنزيل حقيقي)؛ والملح لا يدخل إلا بالاختيار؛ والصفر شبكة.
//   3. الحذف بتأكيد: مستودع ثم... وكله عبر رسائل إلى الخلفية (الكاتب الوحيد، AD-25).
//   4. الاستيراد من ملف حقيقي يُختار بمنتقي الملفات: معاينة ثم دمج؛ تصدير ثم استيراد يعيد كل عناصر المجموعة كما كانت في التخزين؛ ونسخة احتياطية أنشأتها الخلفية.
//   5. ملف تالف يُرفض دون المساس بالتخزين؛ والاستعادة تعيد ما قبل الاستيراد.
//   6. تزامن بين سياقين فعليين (صفحة الإعدادات واللوحة) على الوسيط في الخلفية: استبدال جارٍ ثم تعديل وحذف من سياق آخر ← لا ضياع تعديل ولا عودة ملاحظة محذوفة.
//   7. المسح الكلي بتأكيد صريح: لا سجل ملاحظة ولا مرساة ولا رابط ولا نسخة احتياطية، ويبقى الملح.
//   8. تدقيق الشبكة: لا طلب من صفحات الإضافة إلى أي مضيف خارجي.
// الاستعمال: node tests/modules/g/browser/mj13-check.mjs [chrome|edge|brave|firefox] [--out-dir evidence/T-8.4]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../../scripts/load-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const key = args[0] ?? 'chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitUntil(read, timeoutMs = 8000, stepMs = 100) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}

const SET = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/modules/g/fixtures/fixture-notes-set.json'), 'utf8'));
const SALT = { salt: 'a'.repeat(64), createdAt: '2026-10-23T08:00:00.000Z' };
const D = 'mijhar:data:';

// السجلات المزروعة: ملاحظات ومراسي أسطر الملفات (نص، مستودع عام) ورابط محفوظ وملح.
function seedRecords() {
  const out = {};
  for (const note of SET.notes) {
    out[`${D}notes.${note.id}`] = note;
    if (note.target.level === 'line' && note.target.view === 'blob') {
      const t = note.target;
      out[`${D}anchors.${note.id}`] = {
        noteId: note.id, version: 1, owner: t.owner, repo: t.repo, path: t.path, ref: t.ref, refKind: t.refKind, commit: null, start: t.start, end: t.end,
        visibility: 'public', fingerprint: { mode: 'text', block: ['function a() {}'], before: ['x', 'y'], after: ['z', null] }, missing: null, capturedAt: '2026-10-23T08:00:00.000Z',
      };
    }
  }
  for (const bookmark of SET.bookmarks) out[`${D}bookmarks.${bookmark.id}`] = bookmark;
  out[`${D}anchor-salt`] = SALT;
  return out;
}

const SEED = seedRecords();
const OWNED = /^mijhar:data:(notes|anchors|bookmarks)\./;
const owned = (all) => Object.fromEntries(Object.entries(all).filter(([k]) => OWNED.test(k)).sort(([a], [b]) => a.localeCompare(b)));
const count = (all, prefix) => Object.keys(all).filter((k) => k.startsWith(`${D}${prefix}.`)).length;
const SEED_COUNTS = { notes: count(SEED, 'notes'), anchors: count(SEED, 'anchors'), bookmarks: count(SEED, 'bookmarks') };
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const NOTICE_HEAD = 'تنبيه الخصوصية على الأجهزة المشتركة:';
const NOTICE_TAIL = 'يُنصح بتصدير ملاحظاتك كنسخة احتياطية ثم مسحها من الإضافة قبل مغادرة الجهاز';
const SECTION = '[data-section="module-g-export"]';

function makeCheck(result) {
  return (name, ok, detail) => {
    result.checks.push({ name, ok: Boolean(ok), detail: ok ? undefined : detail });
    if (!ok) console.error(`  ✗ ${name}: ${JSON.stringify(detail)?.slice(0, 500)}`);
  };
}

// ---------- داخل صفحة الإضافة (تُرسل نصًّا وتُستدعى بمعاملاتها) ----------

function sectionState(sel) {
  const root = document.querySelector(sel);
  if (!root) return { present: false };
  const text = (s) => root.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  return {
    present: true,
    warning: text('[data-shared-device-warning]'),
    location: text('[data-storage-location]'),
    tools: root.querySelector('[data-data-tools]')?.getAttribute('data-data-tools') ?? null,
    exportCount: text('[data-export-count]'),
    exportResult: text('[data-result="export"]'),
    importResult: text('[data-result="import"]'),
    importResultTone: root.querySelector('[data-result="import"]')?.getAttribute('role') ?? null,
    rejected: text('[data-result="rejected"]'),
    previewLines: [...root.querySelectorAll('[data-preview-lines] li')].map((l) => l.textContent),
    deleteResult: text('[data-result="delete"]'),
    deleteCount: text('[data-delete-count]'),
    backup: text('[data-backup-info]'),
    disabled: Object.fromEntries([...root.querySelectorAll('[data-action]')].map((b) => [b.getAttribute('data-action'), b.disabled])),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}
function press(sel, action) {
  const el = document.querySelector(`${sel} [data-action="${action}"]`);
  if (!el || el.disabled) return false;
  el.click();
  return true;
}
function tick(sel, option, on) {
  const el = document.querySelector(`${sel} [data-option="${option}"]`);
  if (!el) return false;
  if (el.checked !== on) el.click();
  return true;
}
function choose(sel, name, index) {
  const el = document.querySelectorAll(`${sel} input[name="${name}"]`)[index];
  if (!el) return false;
  el.click();
  return true;
}
function chooseRepo(sel, label) {
  const el = document.querySelector(`${sel} select[aria-label="${label}"]`);
  return el ? { value: el.value, options: [...el.options].map((o) => o.value) } : null;
}
function selectMode(sel, mode) {
  const el = document.querySelector(`${sel} [data-mode="${mode}"]`);
  if (!el) return false;
  el.click();
  return true;
}

// ---------- السيناريو (d: واجهة موحّدة للمشغّلَين) ----------
// d.openOptions() · d.openPanel() · d.opt(fn, ...a) · d.pan(fn, ...a) · d.storage() · d.setStorage(obj) · d.removeKeys(keys) · d.send(which, message) · d.chooseFile(path)
// d.concurrent(items, gapMs) · d.download(trigger) · d.shot(name) · d.urls() · d.narrow(on)

async function scenario(d, check) {
  await d.openOptions();
  await d.setStorage(SEED);
  await d.openOptions();
  const present = await waitUntil(async () => ((await d.opt(sectionState, SECTION)).tools === 'ready' ? d.opt(sectionState, SECTION) : null), 10000);
  check('قسم التخزين والتصدير في صفحة الإعدادات جاهز', present, present ?? (await d.opt(sectionState, SECTION)));
  if (!present) return;
  check('تنبيه الجهاز المشترك بنصه المعتمد ومكان التخزين (storage.local) وانعدام السحابة والحساب', present.warning?.includes(NOTICE_HEAD) && present.warning.includes(NOTICE_TAIL) && present.location?.includes('storage.local') && present.location.includes('لا مزامنة سحابية ولا حساب إضافي'), { warning: present.warning, location: present.location });
  check('الأعداد من التخزين الفعلي (250 ملاحظة و250 رابطًا)', present.exportCount?.includes('250 ملاحظة') && present.exportCount.includes('250 رابطًا'), present.exportCount);
  await d.shot('options-tools');

  // ——— التصدير: تنزيلات حقيقية ———
  const json = await d.download(() => d.opt(press, SECTION, 'export-json'));
  const bundle = JSON.parse(json.text);
  check('تنزيل JSON كامل حقيقي: كل العناصر بلا ملح', json.name.endsWith('.json') && bundle.format === 'mijhar-notes-export' && bundle.notes.length === SEED_COUNTS.notes && bundle.anchors.length === SEED_COUNTS.anchors && bundle.bookmarks.length === SEED_COUNTS.bookmarks && !('salt' in bundle) && !json.text.includes(SALT.salt), { name: json.name, notes: bundle.notes.length, anchors: bundle.anchors.length, bookmarks: bundle.bookmarks.length });
  const md = await d.download(() => d.opt(press, SECTION, 'export-md'));
  check('تنزيل Markdown حقيقي مقروء بلا ملح', md.name.endsWith('.md') && md.text.startsWith('# ملاحظات مِجهَر وروابط «أكمل لاحقًا»') && md.text.includes('### الملاحظات') && !md.text.includes(SALT.salt), md.text.slice(0, 80));
  await d.opt(tick, SECTION, 'include-salt', true);
  const withSalt = await d.download(() => d.opt(press, SECTION, 'export-json'));
  check('الملح يدخل JSON باختيار صريح وحده', JSON.parse(withSalt.text).salt?.salt === SALT.salt, null);
  await d.opt(tick, SECTION, 'include-salt', false);

  // ——— الحذف بتأكيد: مستودع ———
  const repoSel = await d.opt(chooseRepo, SECTION, 'المستودع المراد حذف بياناته');
  const [owner, repo] = repoSel.value.split('/');
  const inRepo = (all) => Object.entries(all).filter(([k, v]) => (/^mijhar:data:notes\./.test(k) && v.target.owner === owner && v.target.repo === repo) || (/^mijhar:data:bookmarks\./.test(k) && v.owner === owner && v.repo === repo));
  const expectedGone = inRepo(SEED).length;
  await d.opt(press, SECTION, 'delete');
  await d.opt(press, SECTION, 'delete-confirm');
  const afterRepo = await waitUntil(async () => { const s = owned(await d.storage()); return inRepo(s).length === 0 ? s : null; }, 8000);
  check('حذف المستودع بتأكيد: ما يخصه وحده (ملاحظات ومراسيها وروابط) ومعه مراسيه', afterRepo && Object.keys(afterRepo).length < Object.keys(owned(SEED)).length && Object.keys(owned(SEED)).length - Object.keys(afterRepo).length >= expectedGone && !Object.keys(afterRepo).some((k) => k.startsWith(`${D}anchors.`) && !afterRepo[`${D}notes.${k.slice(`${D}anchors.`.length)}`]), { expectedGone });
  const stateRepo = await d.opt(sectionState, SECTION);
  check('رسالة الحذف ظاهرة ولا نسخة احتياطية', stateRepo.deleteResult?.includes('حُذف') && !Object.keys(await d.storage()).includes(`${D}export-backup`), stateRepo.deleteResult);
  const afterDeleteStorage = owned(await d.storage());

  // ——— الاستيراد من ملف حقيقي: دمج ثم عودة كل شيء ———
  const file = path.join(os.tmpdir(), `mijhar-mj13-${key}-${Date.now()}.json`);
  fs.writeFileSync(file, json.text);
  await d.chooseFile(file);
  const preview = await waitUntil(async () => { const s = await d.opt(sectionState, SECTION); return s.previewLines.length ? s : null; }, 8000);
  check('المعاينة تعرض ما سيُضاف قبل الاستيراد', preview?.previewLines?.[0]?.includes('أُضيف'), preview?.previewLines);
  await d.opt(selectMode, SECTION, 'merge');
  await d.opt(press, SECTION, 'import');
  const restored = await waitUntil(async () => { const s = owned(await d.storage()); return Object.keys(s).length === Object.keys(owned(SEED)).length ? s : null; }, 10000);
  check('تصدير ثم استيراد (دمج) يعيد كل عناصر المجموعة كما كانت في التخزين الفعلي', restored && same(restored, owned(SEED)), { got: restored ? Object.keys(restored).length : null });
  const afterImport = await d.storage();
  const backupRecord = afterImport[`${D}export-backup`];
  check('النسخة الاحتياطية أنشأتها الخلفية (سجل واحد بالحالة السابقة)', backupRecord?.mode === 'merge' && backupRecord.bundle.notes.length === Object.keys(afterDeleteStorage).filter((k) => k.startsWith(`${D}notes.`)).length, backupRecord && { mode: backupRecord.mode, notes: backupRecord.bundle.notes.length });
  const afterImportState = (await waitUntil(async () => { const s = await d.opt(sectionState, SECTION); return s.backup?.includes('أُخذت قبل') ? s : null; }, 8000)) ?? (await d.opt(sectionState, SECTION));
  check('رسالة الاستيراد ظاهرة والنسخة الاحتياطية معروضة', afterImportState.importResult?.includes('اكتمل الدمج') && afterImportState.backup?.includes('أُخذت قبل آخر دمج'), { r: afterImportState.importResult, b: afterImportState.backup });

  // ——— الاستعادة بتأكيد ———
  await d.opt(press, SECTION, 'restore');
  await d.opt(press, SECTION, 'restore-confirm');
  const afterRestore = await waitUntil(async () => { const s = owned(await d.storage()); return same(s, afterDeleteStorage) ? s : null; }, 10000);
  check('الاستعادة تعيد التخزين إلى ما قبل الاستيراد حرفيًا وتحذف النسخة', afterRestore && !(`${D}export-backup` in (await d.storage())), null);

  // ——— ملف تالف ———
  const bad = JSON.parse(json.text);
  bad.notes[0].target = { level: 'bogus' };
  const badFile = path.join(os.tmpdir(), `mijhar-mj13-bad-${key}-${Date.now()}.json`);
  fs.writeFileSync(badFile, JSON.stringify(bad));
  const beforeBad = await d.storage();
  await d.chooseFile(badFile);
  const rejected = await waitUntil(async () => { const s = await d.opt(sectionState, SECTION); return s.rejected ? s : null; }, 8000);
  check('ملف تالف: يُرفض بسببه ولا زر استيراد', rejected?.rejected?.includes('رُفض الملف ولم تُمس بياناتك الحالية') && rejected.disabled.import === undefined, rejected?.rejected);
  check('ولم يُمس التخزين ولا نسخة احتياطية', same(owned(await d.storage()), owned(beforeBad)) && !(`${D}export-backup` in (await d.storage())), null);
  // رفض الخلفية للملف التالف (تجاوز فحص الواجهة): الرسالة مباشرة.
  const direct = await d.send('opt', { type: 'mijhar/notes-write', op: 'data-import', content: JSON.stringify(bad), mode: 'replace' });
  check('الخلفية نفسها تفحص الملف وترفضه (لا تثق بفحص الواجهة)', direct?.ok === false && /رُفض الملف/.test(direct.error?.message ?? ''), direct);
  check('ولم يُمس التخزين', same(owned(await d.storage()), owned(beforeBad)), null);

  // ——— تزامن حقيقي بين سياقين على الوسيط في الخلفية ———
  await d.openPanel();
  await d.setStorage(SEED);
  // استبدال غير فارغ: تُزال من التخزين خمس ملاحظات وخمسة روابط يعيدها ملف الاستيراد.
  const dropped = [...SET.notes.slice(100, 105).map((n) => `${D}notes.${n.id}`), ...SET.bookmarks.slice(0, 5).map((b) => `${D}bookmarks.${b.id}`)];
  await d.removeKeys(dropped);
  const full = fs.readFileSync(file, 'utf8');
  const N1 = SET.notes[0].id;
  const N2 = SET.notes[1].id;
  // الأولى (استبدال) تُرسل أولًا، وتصل الباقيتان بعدها بقليل من سياق آخر؛ الوسيط ينفّذ بترتيب الوصول لا بالتداخل.
  const [imported, edit, drop] = await d.concurrent(
    [
      { from: 'opt', message: { type: 'mijhar/notes-write', op: 'data-import', content: full, mode: 'replace' } },
      { from: 'pan', message: { type: 'mijhar/notes-write', op: 'note-update', id: N1, patch: { text: 'تعديل المستخدم من اللوحة أثناء الاستبدال' } } },
      { from: 'pan', message: { type: 'mijhar/notes-write', op: 'note-remove', id: N2 } },
    ],
    10,
  );
  const final = await d.storage();
  check('الاستبدال والتعديل والحذف من سياقين: كلها نجحت بترتيب الوسيط', imported?.ok === true && edit?.ok === true && drop?.ok === true, { imported: imported?.ok, edit, drop });
  check('لا ضياع تعديل: تعديل اللوحة ظاهر على ما استُبدل به', final[`${D}notes.${N1}`]?.text === 'تعديل المستخدم من اللوحة أثناء الاستبدال', final[`${D}notes.${N1}`]?.text);
  check('لا عودة لملاحظة محذوفة: سجلها ومرساتها غائبان بعد الاستبدال', !(`${D}notes.${N2}` in final) && !(`${D}anchors.${N2}` in final), null);
  check('والباقي كما في الملف (ما أُزيل أُعيد)', Object.keys(owned(final)).length === Object.keys(owned(SEED)).length - 1 - (SEED[`${D}anchors.${N2}`] ? 1 : 0), Object.keys(owned(final)).length);
  const backup = final[`${D}export-backup`];
  check('النسخة الاحتياطية أنشأتها الخلفية بالحالة قبل الاستبدال (دون الملاحظات الخمس المُزالة)', backup?.mode === 'replace' && backup.bundle.notes.length === SEED_COUNTS.notes - 5 && backup.bundle.bookmarks.length === SEED_COUNTS.bookmarks - 5, backup && { mode: backup.mode, notes: backup.bundle.notes.length });

  // ——— المسح الكلي بتأكيد ———
  await d.openOptions();
  await waitUntil(async () => (await d.opt(sectionState, SECTION)).tools === 'ready', 8000);
  await d.opt(choose, SECTION, 'mj-delete-scope', 1);
  await d.opt(press, SECTION, 'delete');
  const blocked = (await d.opt(sectionState, SECTION)).disabled['delete-confirm'];
  check('المسح الكلي لا ينفَّذ قبل علامة التأكيد الصريحة', blocked === true, blocked);
  await d.opt(tick, SECTION, 'confirm-all', true);
  await d.opt(press, SECTION, 'delete-confirm');
  const wiped = await waitUntil(async () => { const s = await d.storage(); return Object.keys(s).every((k) => !OWNED.test(k) && k !== `${D}export-backup`) ? s : null; }, 10000);
  check('بعد المسح الكلي: لا ملاحظة ولا مرساة ولا رابط ولا نسخة احتياطية، ويبقى الملح', wiped && `${D}anchor-salt` in wiped, wiped && Object.keys(wiped).filter((k) => k.startsWith(D)));
  await d.shot('after-wipe');

  // ——— الشبكة والتخطيط الضيق ———
  const urls = await d.urls();
  check('لا طلب من صفحات الإضافة إلى أي مضيف خارجي', urls.every((u) => /^(chrome-extension|moz-extension|blob|data|about|chrome|edge|brave):/.test(u)), urls.filter((u) => !/^(chrome-extension|moz-extension|blob|data|about|chrome|edge|brave):/.test(u)));
  await d.openOptions();
  await d.setStorage(SEED);
  await d.openOptions();
  await waitUntil(async () => (await d.opt(sectionState, SECTION)).tools === 'ready', 8000);
  await d.narrow(true);
  const narrow = await d.opt(sectionState, SECTION);
  check('تخطيط ضيق (360px): بلا تمرير أفقي', narrow.overflowX <= 1, narrow.overflowX);
  await d.shot('narrow');
  await d.narrow(false);
  fs.rmSync(file, { force: true });
  fs.rmSync(badFile, { force: true });
}

// ---------- عائلة Chromium ----------

async function chromiumRun() {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj13-'));
  const context = await chromium.launchPersistentContext(profileDir, { executablePath: executable, headless: true, viewport: { width: 1280, height: 900 }, ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'], acceptDownloads: true });
  const result = { label, checks: [] };
  const check = makeCheck(result);
  const requests = [];
  try {
    result.browserVersion = context.browser().version();
    context.on('request', (request) => requests.push(request.url()));
    const cdp = await context.browser().newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
    const origin = `chrome-extension://${id}`;
    const shots = outDir ? path.join(outDir, 'browser-screens') : null;
    if (shots) fs.mkdirSync(shots, { recursive: true });
    let options = null;
    let panel = null;
    const run = (page, fn, a) => page.evaluate(`(${fn})(...${JSON.stringify(a)})`);
    const d = {
      async openOptions() {
        await options?.close().catch(() => {});
        options = await context.newPage();
        await options.goto(`${origin}/options.html`);
        await options.waitForSelector('#app[data-ready="true"]');
      },
      async openPanel() {
        panel ??= await context.newPage();
        await panel.goto(`${origin}/sidepanel.html`);
        await panel.waitForSelector('[role="tab"]');
      },
      opt: (fn, ...a) => run(options, fn, a),
      pan: (fn, ...a) => run(panel, fn, a),
      storage: () => options.evaluate(() => chrome.storage.local.get(null)),
      setStorage: (obj) => options.evaluate((o) => chrome.storage.local.set(o), obj),
      removeKeys: (keys) => options.evaluate((k) => chrome.storage.local.remove(k), keys),
      send: (which, message) => (which === 'opt' ? options : panel).evaluate((m) => chrome.runtime.sendMessage(m), message),
      async concurrent(items, gap) {
        const page = (from) => (from === 'opt' ? options : panel);
        const send = (item) => page(item.from).evaluate((m) => chrome.runtime.sendMessage(m), item.message);
        const first = send(items[0]);
        await sleep(gap);
        const rest = await Promise.all(items.slice(1).map(send));
        return [await first, ...rest];
      },
      chooseFile: (file) => options.setInputFiles('#mj-data-file', file),
      async download(trigger) {
        const [download] = await Promise.all([options.waitForEvent('download', { timeout: 8000 }), trigger()]);
        const file = await download.path();
        return { name: download.suggestedFilename(), text: fs.readFileSync(file, 'utf8') };
      },
      async shot(name) {
        if (shots) await options.screenshot({ path: path.join(shots, `${key}-${name}.png`), fullPage: true });
      },
      urls: async () => requests,
      narrow: (on) => options.setViewportSize(on ? { width: 360, height: 700 } : { width: 1280, height: 900 }),
    };
    await scenario(d, check);
    const devtools = await context.newPage();
    await devtools.goto('chrome://extensions');
    const info = await devtools.evaluate((extId) => chrome.developerPrivate.getExtensionInfo(extId), id);
    const errors = { runtime: (info.runtimeErrors ?? []).map((e) => e.message), manifest: (info.manifestErrors ?? []).map((e) => e.message) };
    result.extensionErrors = errors;
    check('لا أخطاء تشغيل ولا مانيفست مسجلة للإضافة', !errors.runtime.length && !errors.manifest.length, errors);
  } catch (error) {
    result.error = String(error?.stack ?? error);
    check('اكتمل السيناريو', false, result.error);
  } finally {
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  return result;
}

// ---------- Firefox ----------

function marionette(socket) {
  let pending = Buffer.alloc(0);
  const waiters = [];
  let id = 0;
  socket.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    for (;;) {
      const header = /^(\d+):/.exec(pending.subarray(0, 12).toString('latin1'));
      if (!header) return;
      const start = header[0].length;
      const length = Number(header[1]);
      if (pending.length < start + length) return;
      const body = pending.subarray(start, start + length).toString('utf8');
      pending = pending.subarray(start + length);
      waiters.shift()?.(JSON.parse(body));
    }
  });
  const next = () => new Promise((resolve) => waiters.push(resolve));
  return {
    handshake: next,
    async send(name, params = {}) {
      const message = JSON.stringify([0, ++id, name, params]);
      socket.write(`${Buffer.byteLength(message)}:${message}`);
      const [, , error, result] = await next();
      if (error) throw new Error(`${name}: ${error.error ?? ''} ${error.message ?? ''}`.trim());
      return result;
    },
  };
}

async function firefoxRun() {
  const { executable } = BROWSERS.firefox;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj13-ff-'));
  const profileDir = path.join(workDir, 'profile');
  const downloads = path.join(workDir, 'downloads');
  fs.mkdirSync(profileDir);
  fs.mkdirSync(downloads);
  const prefs = [
    ['marionette.port', 0],
    ['browser.shell.checkDefaultBrowser', false],
    ['datareporting.policy.dataSubmissionEnabled', false],
    ['toolkit.telemetry.reportingpolicy.firstRun', false],
    ['browser.download.folderList', 2],
    ['browser.download.dir', downloads],
    ['browser.download.useDownloadDir', true],
    ['browser.helperApps.neverAsk.saveToDisk', 'application/json,text/markdown,text/plain,application/octet-stream'],
    // لا شبكة خارجية: وكيل ميت.
    ['network.proxy.type', 1],
    ['network.proxy.http', '127.0.0.1'],
    ['network.proxy.http_port', 9],
    ['network.proxy.ssl', '127.0.0.1'],
    ['network.proxy.ssl_port', 9],
  ]
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join('\n');
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${prefs}\n`);
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const result = { label: 'Firefox', checks: [] };
  const check = makeCheck(result);
  let socket;
  try {
    const portFile = path.join(profileDir, 'MarionetteActivePort');
    const port = await waitUntil(() => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8')), 20000, 100);
    if (!port) throw new Error('لم يفتح Firefox منفذ Marionette');
    socket = net.connect(port, '127.0.0.1');
    const c = marionette(socket);
    await c.handshake();
    const { capabilities } = await c.send('WebDriver:NewSession', { capabilities: { alwaysMatch: {} } });
    result.browserVersion = capabilities.browserVersion;
    await c.send('WebDriver:SetWindowRect', { width: 1280, height: 900 }).catch(() => null);
    const { value: id } = await c.send('Addon:Install', { path: path.join(ROOT, 'dist/firefox'), temporary: true });
    let context = 'content';
    const setContext = async (value) => {
      if (context === value) return;
      await c.send('Marionette:SetContext', { value });
      context = value;
    };
    const chromeScript = async (script, a = []) => {
      await setContext('chrome');
      return (await c.send('WebDriver:ExecuteScript', { script, args: a })).value;
    };
    const host = await chromeScript('return WebExtensionPolicy.getByID(arguments[0]).mozExtensionHostname', [id]);
    const origin = `moz-extension://${host}`;
    const handles = {};
    const switchTo = async (name) => {
      await setContext('content');
      await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
    };
    const openTab = async (name, url) => {
      await setContext('content');
      if (handles[name]) await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
      else {
        const { handle } = await c.send('WebDriver:NewWindow', { type: 'tab' });
        handles[name] = handle;
        await c.send('WebDriver:SwitchToWindow', { handle });
      }
      await c.send('WebDriver:Navigate', { url });
    };
    const runIn = async (name, fn, a = []) => {
      await switchTo(name);
      return (await c.send('WebDriver:ExecuteScript', { script: `return (${fn})(...${JSON.stringify(a)})`, args: [] })).value;
    };
    // واجهة الإضافة في صفحتها (وراء Xray): نداء غير متزامن بمعاملات JSON، ونتيجته JSON.
    const runAsync = async (name, body, a) => {
      await switchTo(name);
      const script = `const done = arguments[arguments.length - 1];
        const ext = globalThis.browser ?? window.wrappedJSObject?.browser ?? window.wrappedJSObject?.chrome;
        const clone = (v) => (typeof cloneInto === 'function' && window.wrappedJSObject ? cloneInto(v, window.wrappedJSObject, { cloneFunctions: false }) : v);
        const out = (v) => JSON.parse(JSON.stringify(v ?? null));
        (async () => { ${body} })().then((v) => done(out(v)), (e) => done({ __error: String(e && e.message || e) }));`;
      const { value } = await c.send('WebDriver:ExecuteAsyncScript', { script: `const args = ${JSON.stringify(a)}; ${script.replace('const done', 'const done')}`, args: [] });
      if (value && value.__error) throw new Error(value.__error);
      return value;
    };
    const d = {
      async openOptions() {
        await openTab('options', `${origin}/options.html`);
        await waitUntil(async () => (await runIn('options', () => document.querySelector('#app')?.getAttribute('data-ready'))) === 'true', 10000, 100);
      },
      async openPanel() {
        await openTab('panel', `${origin}/sidepanel.html`);
        await waitUntil(() => runIn('panel', () => document.querySelectorAll('[role="tab"]').length > 0), 10000, 100);
      },
      opt: (fn, ...a) => runIn('options', fn, a),
      pan: (fn, ...a) => runIn('panel', fn, a),
      storage: () => runAsync('options', 'return await ext.storage.local.get(null);', []),
      setStorage: (obj) => runAsync('options', 'await ext.storage.local.set(clone(args[0])); return true;', [obj]),
      removeKeys: (keys) => runAsync('options', 'await ext.storage.local.remove(clone(args[0])); return true;', [keys]),
      send: (which, message) => runAsync(which === 'opt' ? 'options' : 'panel', 'return await ext.runtime.sendMessage(clone(args[0]));', [message]),
      // Marionette قناة متسلسلة: لا يبدأ أمر قبل انتهاء سابقه، فالرسائل الثلاث تُطلق من نص واحد في صفحة الإعدادات (سياق الإرسال واحد، والوسيط في الخلفية هو نفسه).
      concurrent: (items, gap) =>
        runAsync('options', `const first = ext.runtime.sendMessage(clone(args[0][0].message)); await new Promise((r) => setTimeout(r, args[1])); const rest = args[0].slice(1).map((i) => ext.runtime.sendMessage(clone(i.message))); return await Promise.all([first, ...rest]);`, [items, gap]),
      async chooseFile(file) {
        await switchTo('options');
        const found = await c.send('WebDriver:FindElement', { using: 'css selector', value: '#mj-data-file' });
        const el = found.value ?? found;
        const ref = el['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(el)[0];
        await c.send('WebDriver:ElementSendKeys', { id: ref, text: file });
      },
      async download(trigger) {
        const before = new Set(fs.readdirSync(downloads));
        await trigger();
        const name = await waitUntil(() => fs.readdirSync(downloads).find((f) => !before.has(f) && !f.endsWith('.part') && !f.endsWith('.crdownload')), 10000, 100);
        if (!name) throw new Error('لم يصل التنزيل');
        await sleep(200);
        return { name, text: fs.readFileSync(path.join(downloads, name), 'utf8') };
      },
      async shot(name) {
        if (!outDir) return;
        await switchTo('options');
        const { value } = await c.send('WebDriver:TakeScreenshot', { full: true, hash: false });
        const dir = path.join(outDir, 'browser-screens');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `firefox-${name}.png`), Buffer.from(value, 'base64'));
      },
      urls: async () => (await runIn('options', () => performance.getEntriesByType('resource').map((e) => e.name))).concat(await runIn('panel', () => performance.getEntriesByType('resource').map((e) => e.name)).catch(() => [])),
      narrow: (on) => c.send('WebDriver:SetWindowRect', on ? { width: 420, height: 800 } : { width: 1280, height: 900 }),
    };
    await scenario(d, check);
  } catch (error) {
    result.error = String(error?.stack ?? error);
    check('اكتمل السيناريو', false, result.error);
  } finally {
    socket?.destroy();
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(10000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited;
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  return result;
}

const result = key === 'firefox' ? await firefoxRun() : await chromiumRun();
const failed = result.checks.filter((c) => !c.ok);
console.error(`${result.label} ${result.browserVersion ?? ''}: ${result.checks.length - failed.length}/${result.checks.length} فحصًا`);
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `browser-results-${key}.json`), `${JSON.stringify({ measuredAt: new Date().toISOString(), ...result }, null, 2)}\n`);
}
if (failed.length || result.error) process.exitCode = 1;

#!/usr/bin/env node
// فحص تكامل MJ10 على الحزمة المشحونة نفسها (dist/chromium وdist/firefox من npm run build)، لا على حزمة اختبار تحقن الوحدة: سكربت المحتوى الحقيقي يركّب BUILTIN_MODULES
// (ومعها الوحدات الجديدة b.search وc.ui وf.composer)، والأمر open-glossary مسجَّل فعلًا في المتصفح، واللوحة الأصلية (sidepanel.html) تتلقى الطلب من التخزين.
// الصفحات تُخدم على https://github.com/... محليًا (Playwright route في عائلة Chromium، وخادم HTTPS محلي ووكيل في Firefox، نمط tests/modules/browser/integration.mjs).
//   A. صفحة العينة: الوحدات الجديدة بلا أثر قبل الطلب؛ رسالة locate من صفحة الإضافة (مسار اللوحة الأصلية) تُبرز عنصرًا وتُجيب elsewhere وconcept؛ ومفتاح الوحدة (ب) يوقفها.
//   B. صفحة المحررات (بلاغ جديد): أزرار المساعد الأربعة، ولوحة بكتابة فعلية ومعاينة وإدراج وتراجع، ومفتاح الوحدة (و)، ولا نشر ولا إرسال.
//   C. صفحة إنجليزية: وحدة الترجمة ساكنة تمامًا (لا محرك مسجَّل في الحزمة المشحونة).
//   D. الأوامر: open-glossary مسجَّل باختصاره الافتراضي (commands.getAll) وبوصف عربي؛ وطلب التبويب في التخزين يفتح تبويب القاموس في اللوحة ويركّز البحث، فيعمل بحث فعلي.
//   E. تدقيق الشبكة (صفر طلبات إلى api.github.com)، والصلاحيات كما هي، ولا أخطاء تشغيل للإضافة.
// الاستعمال: node tests/modules/browser/mj10-integration.mjs [chrome edge brave firefox] [--out-dir evidence]
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { BROWSERS } from '../../../scripts/load-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(read, timeoutMs = 8000, stepMs = 50) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value;
    if (Date.now() >= deadline) return value;
    await sleep(stepMs);
  }
}
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const SAMPLE_URL = 'https://github.com/octo/demo';
const EDITORS_URL = 'https://github.com/octo/demo/issues/new';
const ENGLISH_URL = 'https://github.com/octo/mijhar-demo/issues/7';
const PAGES = {
  '/octo/demo': { file: 'tests/modules/b/card/fixtures/fixture-github-ui-sample.html' },
  '/octo/demo/issues/new': { file: 'tests/modules/f/composer/fixtures/fixture-editors.html' },
  '/octo/mijhar-demo/issues/7': { file: 'tests/modules/c/ui/fixtures/fixture-translate-en.html' },
};
const RAW = Object.fromEntries(Object.entries(PAGES).map(([p, v]) => [p, read(v.file)]));

/** ما يخدمه «github.com» المحلي: صفحة، وإلا 404. */
function serve(pathname) {
  if (PAGES[pathname]) return { status: 200, type: 'text/html; charset=utf-8', body: RAW[pathname] };
  return { status: 404, type: 'text/plain', body: 'not found' };
}

const COMMENT_DRAFT = 'First line of my draft.\nSecond line of my draft.\nThird line of my draft.';

// ---------- مجسّات في عالم الصفحة (تعمل في Chromium وفي صندوق Marionette) ----------

function counts() {
  const c = (name) => document.querySelectorAll(`mijhar-host[data-mijhar-host="${name}"]`).length;
  return { card: c('b.card'), highlight: c('b.search.highlight'), bar: c('c.ui.bar'), translation: c('c.ui.translation'), selection: c('c.ui.selection'), composerButtons: c('f.composer.button'), composerPanel: c('f.composer.panel') };
}
function ringAround(selector) {
  const el = document.querySelector(selector);
  const ring = document.querySelector('mijhar-host[data-mijhar-host="b.search.highlight"]')?.shadowRoot?.querySelector('.ring');
  if (!el || !ring) return { around: false };
  const e = el.getBoundingClientRect();
  const r = ring.getBoundingClientRect();
  const near = (a, b) => Math.abs(a - b) <= 2;
  return { around: near(r.left, e.left - 4) && near(r.top, e.top - 4) && near(r.width, e.width + 8) && near(r.height, e.height + 8) };
}
function cardBadges() {
  const root = document.querySelector('mijhar-host[data-mijhar-host="b.card"]')?.shadowRoot;
  return { badges: root?.querySelectorAll('.badge').length ?? 0, focusIndex: root?.activeElement?.getAttribute('data-index') ?? null, haspopup: root?.querySelector('.badge')?.getAttribute('aria-haspopup') ?? null };
}
function watchPublishing() {
  window.__pub = [];
  document.addEventListener('submit', (e) => window.__pub.push(`submit:${e.target.id}`), true);
  document.addEventListener('click', (e) => e.target.closest?.('button[type="submit"], input[type="submit"]') && window.__pub.push(`click:${e.target.id}`), true);
  return true;
}
const takePublishing = () => window.__pub?.splice(0) ?? null;
function triggerClick(id) {
  const f = document.getElementById(id);
  const toolbar = [...document.querySelectorAll('markdown-toolbar')].find((t) => t.getAttribute('for') === id);
  const host = (toolbar ? [...toolbar.children] : [f.previousElementSibling]).find((el) => el?.getAttribute('data-mijhar-host') === 'f.composer.button');
  host?.shadowRoot?.querySelector('button')?.click();
  return Boolean(host);
}
function composerPanel() {
  const root = document.querySelector('mijhar-host[data-mijhar-host="f.composer.panel"]')?.shadowRoot;
  if (!root) return { open: false };
  return {
    open: true,
    focus: root.activeElement?.id ?? null,
    preview: root.querySelector('[data-preview]')?.textContent ?? '',
    status: root.querySelector('.status')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    undoDisabled: root.querySelector('[data-action="undo"]')?.disabled,
    role: root.querySelector('.panel')?.getAttribute('role'),
  };
}
function focusPanelField(name) {
  const root = document.querySelector('mijhar-host[data-mijhar-host="f.composer.panel"]')?.shadowRoot;
  root?.getElementById(`mj-composer-${name}`)?.focus();
  return root?.activeElement?.id ?? null;
}
function panelClick(action) {
  const b = document.querySelector('mijhar-host[data-mijhar-host="f.composer.panel"]')?.shadowRoot?.querySelector(`[data-action="${action}"]`);
  b?.click();
  return Boolean(b);
}
function fieldValue(id) {
  return document.getElementById(id).value;
}
function setCaret(arg) {
  const f = document.getElementById(arg.id);
  f.setSelectionRange(arg.at, arg.at);
  return true;
}
function selectSomeText() {
  const p = document.querySelector('[data-case="p-sentences"]');
  const range = document.createRange();
  range.setStart(p.firstChild, 0);
  range.setEnd(p.firstChild, 30);
  const s = document.getSelection();
  s.removeAllRanges();
  s.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  return s.toString().length;
}
function panelPageState() {
  const selected = document.querySelector('[role="tab"][aria-selected="true"]');
  const results = [...document.querySelectorAll('.gsearch .result')];
  const note = document.querySelector('.gsearch .locate-note');
  return {
    tab: selected?.id?.replace(/^.*-tab-/, '') ?? null,
    focus: document.activeElement?.id ?? null,
    query: document.getElementById('mj-gs-input')?.value ?? null,
    first: results[0]?.getAttribute('data-entry') ?? null,
    via: results[0]?.getAttribute('data-via') ?? null,
    results: results.length,
    note: note ? { status: note.getAttribute('data-status'), text: note.textContent.replace(/\s+/g, ' ').trim() } : null,
    chips: document.querySelectorAll('.gsearch .chip-btn').length,
  };
}
function focusSearch() {
  document.getElementById('mj-gs-input')?.focus();
  return document.activeElement?.id ?? null;
}
function clickLocate() {
  document.querySelector('.gsearch .result [data-action="locate"]')?.click();
  return true;
}
function htmlMatches(raw) {
  const original = new DOMParser().parseFromString(raw, 'text/html').documentElement.outerHTML;
  // ورقة أنماط الوحدة (أ) وكل مضيفات مِجهَر (الوحدات الأخرى المفعَّلة بإعداداتها الافتراضية) ليست من هذا الفحص؛ ولقطة Playwright تضيف style="" فارغة.
  const clone = document.documentElement.cloneNode(true);
  clone.querySelector('#mijhar-reading-styles')?.remove();
  for (const host of clone.querySelectorAll('mijhar-host')) host.remove();
  for (const el of clone.querySelectorAll('[style=""]')) el.removeAttribute('style');
  const live = clone.outerHTML;
  const strip = (html) => html.replace(/ dir="(rtl|ltr|auto)"/g, '');
  if (strip(original) === strip(live)) return { equal: true };
  let i = 0;
  while (i < original.length && original[i] === live[i]) i += 1;
  return { equal: false, at: i, original: original.slice(Math.max(0, i - 80), i + 80), live: live.slice(Math.max(0, i - 80), i + 80) };
}

// ---------- السيناريو المشترك بين المتصفحين ----------
// d: open(name, url) · press(name, 'Alt+KeyH') · type(name, text) · page(name, fn, arg) · options(fn) · clickOptions(selector) · isChecked(selector)
//    · sendToTab(url, message) · ext(op, arg) · tabs/pages: لوحة (sidepanel) تُفتح بـd.open('panel', url)

async function scenario(d, steps, checks, label, origin) {
  const check = (name, ok, detail) => {
    checks.push({ browser: label, name, ok: Boolean(ok), detail });
    if (!ok) console.error(`  ✗ ${label} · ${name}: ${JSON.stringify(detail)?.slice(0, 500)}`);
  };
  const locate = (url, entryId) => d.sendToTab(url, { type: 'mijhar:locate', action: 'show', entryId });
  const zero = (c) => Object.values(c).every((n) => n === 0);

  // ——— A. صفحة العينة ———
  await d.open('sample', SAMPLE_URL);
  const ready = await waitUntil(async () => (await d.sendToTab(SAMPLE_URL, { type: 'mijhar:explain', action: 'status' }).catch(() => null))?.active === false, 10000, 100);
  check('سكربت المحتوى جاهز والوحدة (ب) تردّ على رسالة الحالة', Boolean(ready), ready);
  steps.baseline = await d.page('sample', counts);
  await sleep(600);
  steps.baseline2 = await d.page('sample', counts);
  check('الوحدات الجديدة بلا أثر قبل أي طلب: لا مضيف لأي منها (الإبراز والأشرطة والتحديد والمساعد)', zero(steps.baseline2), steps.baseline2);
  steps.found = await locate(SAMPLE_URL, 'star');
  steps.foundState = await waitUntil(async () => ((await d.page('sample', counts)).highlight === 1 ? await d.page('sample', ringAround, '#star-btn') : null), 5000, 100);
  check('رسالة locate من صفحة الإضافة: found وحلقة تحيط بزر النجمة الأصلي', steps.found?.status === 'found' && steps.found?.count === 1 && steps.foundState?.around === true, { found: steps.found, ring: steps.foundState });
  await d.sendToTab(SAMPLE_URL, { type: 'mijhar:locate', action: 'clear' });
  check('locate clear يزيل الإبراز', (await d.page('sample', counts)).highlight === 0, null);
  steps.elsewhere = await locate(SAMPLE_URL, 'delete_repo');
  steps.concept = await locate(SAMPLE_URL, 'repository');
  steps.unknown = await locate(SAMPLE_URL, 'ما-في-قاموس');
  check('الشرك (حذف المستودع) elsewhere بمسار Settings، والمفهوم concept، والمجهول unknown-entry، ولا إبراز', steps.elsewhere?.status === 'elsewhere' && steps.elsewhere.paths.join(' ').includes('Settings') && steps.concept?.status === 'concept' && steps.unknown?.status === 'unknown-entry' && (await d.page('sample', counts)).highlight === 0, { e: steps.elsewhere, c: steps.concept, u: steps.unknown });
  await d.press('sample', 'Alt+KeyH');
  steps.explain = await waitUntil(async () => ((await d.page('sample', cardBadges)).badges > 0 ? await d.page('sample', cardBadges) : null), 6000, 100);
  check('وضع الشرح بالاختصار الفعلي: ٢٠ شارة بـaria-haspopup، والتركيز على أول شارة (T-3.3)', steps.explain?.badges === 20 && steps.explain?.focusIndex === '0' && steps.explain?.haspopup === 'dialog', steps.explain);
  await d.press('sample', 'Alt+KeyH');
  await sleep(200);
  // مفتاح الوحدة (ب) يوقف b.search مع بطاقة الشرح.
  await d.clickOptions('#mj-unit-b');
  // وحدة البحث المتوقفة لا تجيب: الرسالة تصل سكربت المحتوى (مستمع الدرج) ولا أحد يردّ، فالنتيجة بلا استجابة.
  steps.unitOff = await waitUntil(async () => {
    const answer = await d.sendToTab(SAMPLE_URL, { type: 'mijhar:locate', action: 'show', entryId: 'star' }).catch(() => undefined);
    return answer === undefined || answer === null ? 'none' : null;
  }, 5000, 150);
  check('مفتاح الوحدة (ب) مطفأ: وحدة البحث تتوقف (لا ردّ على رسالة locate)', steps.unitOff === 'none', steps.unitOff);
  await d.clickOptions('#mj-unit-b');
  steps.unitOn = await waitUntil(async () => ((await locate(SAMPLE_URL, 'star').catch(() => null))?.status === 'found' ? 'found' : null), 6000, 150);
  check('وإعادته تعيدها', steps.unitOn === 'found', steps.unitOn);
  await d.sendToTab(SAMPLE_URL, { type: 'mijhar:locate', action: 'clear' });

  // ——— B. المحررات ———
  await d.open('editors', EDITORS_URL);
  steps.composerReady = await waitUntil(async () => ((await d.page('editors', counts)).composerButtons === 4 ? await d.page('editors', counts) : null), 10000, 150);
  check('صفحة بلاغ جديد: أربعة أزرار «مساعد» (ثلاثة في الأشرطة وواحد لحقل بلا شريط) ولا لوحة', steps.composerReady?.composerButtons === 4 && steps.composerReady?.composerPanel === 0, steps.composerReady);
  await d.page('editors', watchPublishing);
  await d.page('editors', setCaret, { id: 'new_comment_field', at: 24 });
  await d.page('editors', triggerClick, 'new_comment_field');
  // التركيز على أول حقل يُطبَّق بعد الرسم؛ تُنتظر حاله قبل الكتابة الفعلية.
  steps.panelOpen = await waitUntil(async () => ((await d.page('editors', composerPanel)).focus === 'mj-composer-expected' ? await d.page('editors', composerPanel) : null), 5000, 100);
  check('نقر الزر يفتح اللوحة (حوار) والتركيز على أول حقل', steps.panelOpen?.open && steps.panelOpen.role === 'dialog' && steps.panelOpen.focus === 'mj-composer-expected', steps.panelOpen);
  await d.type('editors', 'The side panel opens.');
  await d.page('editors', focusPanelField, 'steps');
  await d.type('editors', 'Open github.com\nPress Alt+G');
  steps.preview = await d.page('editors', composerPanel);
  check('كتابة فعلية في الحقلين ← معاينة بعناوين وقائمة مرقّمة', steps.preview.preview.includes('## Expected behavior\n\nThe side panel opens.') && steps.preview.preview.includes('## Steps to reproduce\n\n1. Open github.com\n2. Press Alt+G'), steps.preview.preview);
  await d.page('editors', panelClick, 'insert-cursor');
  await sleep(200);
  steps.inserted = await d.page('editors', fieldValue, 'new_comment_field');
  check('الإدراج عند المؤشر: ما قبل المؤشر وما بعده حرفيًا والنص بينهما', steps.inserted.startsWith(COMMENT_DRAFT.slice(0, 24)) && steps.inserted.endsWith(COMMENT_DRAFT.slice(24)) && steps.inserted.includes('## Steps to reproduce'), steps.inserted.slice(0, 100));
  await d.page('editors', panelClick, 'undo');
  await sleep(200);
  check('«التراجع عن آخر إدراج» يعيد المسودة حرفيًا', (await d.page('editors', fieldValue, 'new_comment_field')) === COMMENT_DRAFT, null);
  const pub = await d.page('editors', takePublishing);
  check('لا submit ولا نقر على زر إرسال في كل ذلك', Array.isArray(pub) && pub.length === 0, pub);
  await d.clickOptions('#mj-unit-f');
  steps.fOff = await waitUntil(async () => (zero({ n: (await d.page('editors', counts)).composerButtons, p: (await d.page('editors', counts)).composerPanel }) ? await d.page('editors', counts) : null), 5000, 150);
  steps.fOffHtml = await d.page('editors', htmlMatches, RAW['/octo/demo/issues/new']);
  check('مفتاح الوحدة (و) مطفأ: تزول الأزرار واللوحة، وDOM الصفحة كما أُرسل', steps.fOff?.composerButtons === 0 && steps.fOffHtml.equal, { fOff: steps.fOff, html: steps.fOffHtml });
  await d.clickOptions('#mj-unit-f');
  steps.fOn = await waitUntil(async () => ((await d.page('editors', counts)).composerButtons === 4 ? true : null), 6000, 150);
  check('وإعادته تعيد الأزرار', steps.fOn === true, steps.fOn);

  // ——— C. الترجمة ساكنة بلا محرك ———
  await d.open('english', ENGLISH_URL);
  await sleep(1500);
  await d.page('english', selectSomeText);
  await sleep(500);
  steps.english = await d.page('english', counts);
  steps.englishHtml = await d.page('english', htmlMatches, RAW['/octo/mijhar-demo/issues/7']);
  check('وحدة الترجمة (ج) ساكنة: لا شريط ولا ترجمة ولا زر تحديد في الحزمة المشحونة (لا محرك مسجَّل)، وDOM الصفحة كما أُرسل', steps.english.bar === 0 && steps.english.translation === 0 && steps.english.selection === 0 && steps.englishHtml.equal, { counts: steps.english, html: steps.englishHtml });

  // ——— D. الأوامر واللوحة ———
  steps.commands = await d.ext('commands');
  const glossary = steps.commands.find((c) => c.name === 'open-glossary');
  const panelCmd = steps.commands.find((c) => c.name === 'toggle-panel');
  check('الأمر open-glossary مسجَّل في المتصفح باختصار افتراضي (Alt+K) ووصف عربي، وأمر اللوحة باقٍ', Boolean(glossary?.shortcut) && /K/i.test(glossary.shortcut) && /[؀-ۿ]/.test(glossary.description ?? '') && Boolean(panelCmd?.shortcut), { glossary, panelCmd });
  steps.rebind = await d.ext('rebind');
  check('إعادة ربط open-glossary من إعدادات المتصفح تغيّر اختصاره المسجَّل (Alt+Shift+K) ثم يُستعاد الافتراضي', Boolean(steps.rebind?.after) && steps.rebind.after !== steps.rebind.before && /K/i.test(steps.rebind.after) && steps.rebind.restored === steps.rebind.before, steps.rebind);
  await d.open('panel', `${origin}/sidepanel.html`);
  steps.panel0 = await waitUntil(async () => ((await d.page('panel', panelPageState)).tab ? await d.page('panel', panelPageState) : null), 8000, 100);
  check('اللوحة الأصلية تبدأ على تبويب «السياق»', steps.panel0?.tab === 'context', steps.panel0);
  await d.ext('writePanelRequest', { key: 'mijhar:data:setting.ui.panelRequest', value: { tab: 'glossary', at: Date.now() } });
  steps.panel1 = await waitUntil(async () => {
    const s = await d.page('panel', panelPageState);
    return s.tab === 'glossary' && s.focus === 'mj-gs-input' ? s : null;
  }, 8000, 150);
  check('طلب التبويب في التخزين (ما يكتبه معالج Alt+K في الخلفية) ينقل اللوحة المفتوحة إلى القاموس ويركّز خانة البحث', Boolean(steps.panel1), await d.page('panel', panelPageState));
  await d.type('panel', 'كوميت');
  steps.panel2 = await waitUntil(async () => {
    const s = await d.page('panel', panelPageState);
    return s.first === 'commit' ? s : null;
  }, 5000, 100);
  check('كتابة فعلية «كوميت» (مرادف) في خانة اللوحة ← Commit أولًا بمطابقة مرادف، وثماني أزرار تصفية', steps.panel2?.first === 'commit' && steps.panel2.via === 'synonym' && steps.panel2.chips === 8, steps.panel2);
  await d.page('panel', clickLocate);
  steps.panel3 = await waitUntil(async () => ((await d.page('panel', panelPageState)).note ? await d.page('panel', panelPageState) : null), 5000, 100);
  check('«أبرز الموضع» من لوحة على تبويب إضافة (لا صفحة GitHub نشطة): رسالة صريحة بمسارات الوجود، بلا خطأ', steps.panel3?.note?.status === 'unavailable' && steps.panel3.note.text.includes('github.com'), steps.panel3?.note);
  steps.manifest = await d.ext('manifest');
  check('الصلاحيات كما هي: sidePanel وstorage (أو storage وحدها) والمضيف الأساسي github.com وحده والاختياري api.github.com', JSON.stringify(steps.manifest.permissions) === JSON.stringify(steps.manifest.permissions.includes('sidePanel') ? ['sidePanel', 'storage'] : ['storage']) && JSON.stringify(steps.manifest.host_permissions) === JSON.stringify(['https://github.com/*']), { p: steps.manifest.permissions, h: steps.manifest.host_permissions, o: steps.manifest.optional_host_permissions });
}

// ---------- Firefox: Marionette خلف خادم HTTPS ووكيل محليين ----------

const SERVED = new Set(['github.com', 'api.github.com']);

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

function makeCertificates(workDir) {
  const file = (name) => path.join(workDir, name);
  const openssl = (...a) => execFileSync('openssl', a, { stdio: 'ignore' });
  openssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('ca.key'), '-out', file('ca.pem'), '-days', '1', '-subj', '/CN=mijhar-mj10-test-ca', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  openssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', file('key.pem'), '-out', file('leaf.csr'), '-subj', '/CN=github.com');
  fs.writeFileSync(file('leaf.ext'), 'subjectAltName=DNS:github.com,DNS:api.github.com\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n');
  openssl('x509', '-req', '-in', file('leaf.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca.key'), '-CAcreateserial', '-out', file('cert.pem'), '-days', '1', '-extfile', file('leaf.ext'));
  const caDer = fs.readFileSync(file('ca.pem'), 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  return { key: fs.readFileSync(file('key.pem')), cert: fs.readFileSync(file('cert.pem')), caDer };
}

async function startServers(workDir) {
  const { key, cert, caDer } = makeCertificates(workDir);
  const log = { requests: [], refused: [] };
  const site = https.createServer({ key, cert }, (req, res) => {
    const host = (req.headers.host ?? '').split(':')[0];
    const pathname = new URL(req.url, 'https://github.com').pathname;
    log.requests.push({ host, path: pathname });
    if (host === 'api.github.com') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('"محلي: لا شبكة"');
      return;
    }
    const r = serve(pathname);
    res.writeHead(r.status, { 'content-type': r.type });
    res.end(r.body);
  });
  await new Promise((resolve) => site.listen(0, '127.0.0.1', resolve));
  const sitePort = site.address().port;
  const proxy = http.createServer((req, res) => {
    log.refused.push(`http ${req.url}`);
    res.writeHead(403);
    res.end();
  });
  proxy.on('connect', (req, client, head) => {
    const host = req.url.split(':')[0];
    if (!SERVED.has(host)) {
      log.refused.push(host);
      client.end('HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    const upstream = net.connect(sitePort, '127.0.0.1', () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(client);
      client.pipe(upstream);
    });
    upstream.on('error', () => client.destroy());
    client.on('error', () => upstream.destroy());
  });
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  return { log, caDer, proxyPort: proxy.address().port, close: () => Promise.all([new Promise((r) => site.close(r)), new Promise((r) => proxy.close(r))]) };
}

const firefoxPrefs = (proxyPort) =>
  [
    ['marionette.port', 0],
    ['network.proxy.type', 1],
    ['network.proxy.http', '127.0.0.1'],
    ['network.proxy.http_port', proxyPort],
    ['network.proxy.ssl', '127.0.0.1'],
    ['network.proxy.ssl_port', proxyPort],
    ['network.proxy.no_proxies_on', ''],
    ['network.proxy.allow_hijacking_localhost', true],
    ['network.stricttransportsecurity.preloadlist', false],
    ['network.dns.disablePrefetch', true],
    ['browser.shell.checkDefaultBrowser', false],
    ['datareporting.policy.dataSubmissionEnabled', false],
    ['toolkit.telemetry.reportingpolicy.firstRun', false],
  ]
    .map(([k, v]) => `user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join('\n');


// ---------- عائلة Chromium ----------

async function chromiumRun(key) {
  const { executable, label } = BROWSERS[key];
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj10-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath: executable,
    headless: true,
    viewport: { width: 1280, height: 900 },
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
  });
  const result = { label, steps: {}, checks: [], console: [] };
  const network = { apiGithub: [], blockedHosts: new Set() };
  try {
    const browser = context.browser();
    result.browserVersion = browser.version();
    context.on('request', (request) => {
      if (new URL(request.url()).host === 'api.github.com') network.apiGithub.push(request.url());
    });
    await context.route('https://github.com/**', (route) => {
      const r = serve(new URL(route.request().url()).pathname);
      return route.fulfill({ status: r.status, contentType: r.type, body: r.body });
    });
    await context.route('https://api.github.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '"محلي: لا شبكة"' }));
    await context.route((url) => url.protocol === 'https:' && !['github.com', 'api.github.com'].includes(url.host), (route) => {
      network.blockedHosts.add(new URL(route.request().url()).host);
      return route.abort();
    });
    const cdp = await browser.newBrowserCDPSession();
    const { id } = await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
    const origin = `chrome-extension://${id}`;
    const watch = (page, name) => page.on('console', (m) => (m.text().includes('[mijhar]') || m.location().url.startsWith('chrome-extension://')) && result.console.push(`${name}: ${m.type()}: ${m.text()}`));
    const pages = {};
    const optionsPage = await context.newPage();
    watch(optionsPage, 'options');
    await optionsPage.goto(`${origin}/options.html`);
    await optionsPage.waitForSelector('#app[data-ready="true"]');
    const extensionsPage = await context.newPage();
    await extensionsPage.goto('chrome://extensions');
    const glossaryShortcut = async () => (await optionsPage.evaluate(() => chrome.commands.getAll())).find((c) => c.name === 'open-glossary')?.shortcut;
    const bind = (keybinding) => extensionsPage.evaluate(([extensionId, k]) => chrome.developerPrivate.updateExtensionCommand({ extensionId, commandName: 'open-glossary', keybinding: k }), [id, keybinding]);
    const ops = {
      rebind: async () => {
        const before = await glossaryShortcut();
        await bind('Alt+Shift+K');
        await sleep(400);
        const after = await glossaryShortcut();
        await bind('Alt+K');
        await sleep(400);
        return { before, after, restored: await glossaryShortcut() };
      },
      commands: () => optionsPage.evaluate(() => chrome.commands.getAll()),
      writePanelRequest: (a) => optionsPage.evaluate((x) => chrome.storage.local.set({ [x.key]: x.value }), a),
      manifest: () => optionsPage.evaluate(() => chrome.runtime.getManifest()),
    };
    const d = {
      async open(name, url) {
        pages[name] ??= await context.newPage();
        watch(pages[name], name);
        await pages[name].goto(url);
        await pages[name].bringToFront();
      },
      async press(name, combo) {
        await pages[name].bringToFront();
        await pages[name].keyboard.press(combo);
      },
      async type(name, text) {
        await pages[name].bringToFront();
        await pages[name].keyboard.type(text);
        await sleep(120);
      },
      page: (name, fn, arg) => pages[name].evaluate(fn, arg),
      async clickOptions(selector) {
        await optionsPage.bringToFront();
        await optionsPage.click(selector);
        await sleep(250);
      },
      isChecked: (selector) => optionsPage.isChecked(selector),
      sendToTab: (url, message) =>
        optionsPage.evaluate(
          ([u, m]) => chrome.tabs.query({ url: 'https://github.com/*' }).then((tabs) => Promise.all(tabs.filter((t) => t.url === u).map((t) => chrome.tabs.sendMessage(t.id, m)))).then((r) => r[0]),
          [url, message],
        ),
      ext: (op, arg) => ops[op](arg),
    };
    await scenario(d, result.steps, result.checks, label, origin);
    const info = await extensionsPage.evaluate((extId) => chrome.developerPrivate.getExtensionInfo(extId), id);
    result.extensionErrors = { runtime: (info.runtimeErrors ?? []).map((e) => e.message), manifest: (info.manifestErrors ?? []).map((e) => e.message) };
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = { apiGithub: network.apiGithub, blockedExternalHosts: [...network.blockedHosts].sort() };
    await context.close();
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
  return result;
}

// ---------- Firefox ----------

async function firefoxRun() {
  const { executable } = BROWSERS.firefox;
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-mj10-ff-'));
  const profileDir = path.join(workDir, 'profile');
  fs.mkdirSync(profileDir);
  const servers = await startServers(workDir);
  fs.writeFileSync(path.join(profileDir, 'user.js'), `${firefoxPrefs(servers.proxyPort)}\n`);
  const child = spawn(executable, ['-headless', '-marionette', '-remote-allow-system-access', '-no-remote', '-profile', profileDir], { stdio: 'ignore' });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const result = { label: 'Firefox', steps: {}, checks: [], console: [] };
  let socket;
  try {
    const portFile = path.join(profileDir, 'MarionetteActivePort');
    const port = await waitUntil(() => fs.existsSync(portFile) && Number(fs.readFileSync(portFile, 'utf8')), 20000, 100);
    if (!port) throw new Error('لم يفتح Firefox منفذ Marionette');
    socket = net.connect(port, '127.0.0.1');
    const c = marionette(socket);
    await c.handshake();
    const { capabilities } = await c.send('WebDriver:NewSession', { capabilities: { alwaysMatch: { acceptInsecureCerts: true } } });
    result.browserVersion = capabilities.browserVersion;
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
    await chromeScript(`Cc['@mozilla.org/security/x509certdb;1'].getService(Ci.nsIX509CertDB).addCertFromBase64(arguments[0], 'C,,'); return true;`, [servers.caDer]);
    const runIn = async (fn, ...a) => {
      await setContext('content');
      return (await c.send('WebDriver:ExecuteScript', { script: `return (${fn})(...arguments)`, args: a })).value;
    };
    const runAsync = async (body, a = []) => {
      await setContext('content');
      return (await c.send('WebDriver:ExecuteAsyncScript', { script: `const done = arguments[arguments.length - 1]; Promise.resolve((async () => { ${body} })()).then(done, (e) => done({ thrown: String(e) }))`, args: a })).value;
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
      if (handles[name]) {
        await c.send('WebDriver:SwitchToWindow', { handle: handles[name] });
      } else {
        const { handle } = await c.send('WebDriver:NewWindow', { type: 'tab' });
        handles[name] = handle;
        await c.send('WebDriver:SwitchToWindow', { handle });
      }
      await c.send('WebDriver:Navigate', { url });
    };
    const KEYS = { Alt: '' };
    await openTab('options', `${origin}/options.html`);
    await waitUntil(async () => (await runIn(() => document.querySelector('#app')?.getAttribute('data-ready'))) === 'true', 8000, 100);
    const api = 'const api = globalThis.browser ?? window.wrappedJSObject?.browser;';
    const ops = {
      rebind: () =>
        runAsync(`${api}
          const get = async () => (await api.commands.getAll()).find((c) => c.name === 'open-glossary')?.shortcut;
          const before = await get();
          await api.commands.update({ name: 'open-glossary', shortcut: 'Alt+Shift+K' });
          const after = await get();
          await api.commands.reset('open-glossary');
          return { before, after, restored: await get() };`),
      commands: () => runAsync(`${api} return await api.commands.getAll();`),
      writePanelRequest: (a) => runAsync(`${api} await api.storage.local.set({ [arguments[0].key]: arguments[0].value }); return true;`, [a]),
      manifest: () => runAsync(`${api} return JSON.parse(JSON.stringify(api.runtime.getManifest()));`),
    };
    const d = {
      async open(name, url) {
        await openTab(name, url);
      },
      async press(name, combo) {
        await switchTo(name);
        const [mod, code] = combo.split('+');
        const letter = code.replace('Key', '').toLowerCase();
        await c.send('WebDriver:PerformActions', { actions: [{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value: KEYS[mod] }, { type: 'keyDown', value: letter }, { type: 'keyUp', value: letter }, { type: 'keyUp', value: KEYS[mod] }] }] });
        await c.send('WebDriver:ReleaseActions');
      },
      async type(name, text) {
        await switchTo(name);
        const actions = [...text].flatMap((ch) => {
          const value = ch === '\n' ? '' : ch;
          return [{ type: 'keyDown', value }, { type: 'keyUp', value }];
        });
        await c.send('WebDriver:PerformActions', { actions: [{ type: 'key', id: 'kb', actions }] });
        await c.send('WebDriver:ReleaseActions');
        await sleep(150);
      },
      async page(name, fn, arg) {
        await switchTo(name);
        return arg === undefined ? runIn(fn) : runIn(fn, arg);
      },
      async clickOptions(selector) {
        await switchTo('options');
        await setContext('content');
        const { value: el } = await c.send('WebDriver:FindElement', { using: 'css selector', value: selector });
        await c.send('WebDriver:ElementClick', { id: el['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(el)[0] });
        await sleep(250);
      },
      async isChecked(selector) {
        await switchTo('options');
        return runIn((s) => document.querySelector(s)?.checked ?? null, selector);
      },
      async sendToTab(url, message) {
        await switchTo('options');
        const r = await runAsync(
          `${api}
           const tabs = await api.tabs.query({ url: 'https://github.com/*' });
           const own = tabs.filter((t) => t.url === arguments[0]);
           if (!own.length) return { noTab: true };
           return await api.tabs.sendMessage(own[0].id, arguments[1]);`,
          [url, message],
        );
        if (r && r.thrown) throw new Error(r.thrown);
        return r && r.noTab ? null : r;
      },
      async ext(op, arg) {
        await switchTo('options');
        const r = await ops[op](arg);
        if (r && r.thrown) throw new Error(r.thrown);
        return r;
      },
    };
    await scenario(d, result.steps, result.checks, 'Firefox', origin);
    result.console = await chromeScript(`return Services.console.getMessageArray().map((m) => m.message ?? (m.errorMessage ? m.errorMessage + ' @ ' + m.sourceName : String(m))).filter((t) => /mijhar|moz-extension/i.test(t));`);
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    result.network = {
      apiGithub: servers.log.requests.filter((r) => r.host === 'api.github.com'),
      blockedExternalHosts: [...new Set(servers.log.refused)].sort(),
    };
    socket?.destroy();
    child.kill('SIGTERM');
    await Promise.race([exited, sleep(10000)]);
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited;
    await servers.close();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
  return result;
}

const keys = args.filter((a) => BROWSERS[a]);
const results = {};
const allChecks = [];
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox']) {
  results[key] = key === 'firefox' ? await firefoxRun() : await chromiumRun(key);
  const r = results[key];
  const add = (name, ok, detail) => {
    r.checks.push({ browser: r.label, name, ok: Boolean(ok), detail });
    if (!ok) console.error(`  ✗ ${r.label} · ${name}: ${JSON.stringify(detail)?.slice(0, 500)}`);
  };
  add('اكتمل التشغيل بلا خطأ', !r.error, r.error?.split('\n')[0]);
  add('تدقيق الشبكة: صفر طلبات إلى api.github.com', (r.network?.apiGithub?.length ?? 1) === 0, r.network?.apiGithub);
  if (r.extensionErrors) add('لا أخطاء تشغيل ولا مانيفست للإضافة', r.extensionErrors.runtime.length === 0 && r.extensionErrors.manifest.length === 0, r.extensionErrors);
  allChecks.push(...r.checks);
  const bad = r.checks.filter((c) => !c.ok).length;
  console.log(`${r.label} ${r.browserVersion ?? ''}: ${r.checks.length - bad}/${r.checks.length} فحصًا · أخطاء الكونسول ${r.console?.length ?? 0}${r.error ? ` · خطأ: ${r.error.split('\n')[0]}` : ''}`);
}
console.log(`المجموع: ${allChecks.filter((c) => c.ok).length}/${allChecks.length} فحصًا اجتاز`);
if (outDir) {
  fs.mkdirSync(path.join(outDir, 'MJ10'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'MJ10/integration.json'), `${JSON.stringify(results, null, 2)}\n`);
}
if (allChecks.some((c) => !c.ok)) process.exitCode = 1;

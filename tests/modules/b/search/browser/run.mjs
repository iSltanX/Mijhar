#!/usr/bin/env node
// e2e البحث في القاموس وإبراز الموضع (T-3.4) في المتصفحات الفعلية، لا ضمن vitest: واجهة البحث الحقيقية (GlossarySearchView) في جذر Shadow DOM
// بتخطيط حقيقي، ووحدة b.search على عينة fixture-github-ui-sample.html وعلى صفحة مستودع حقيقية محفوظة، بمدخلات حقيقية من خارج الصفحة.
//   TEST-GLOSS-04 (AC-B6): كتابة فعلية بالعربية والإنجليزية والمرادفات ← نتائج صحيحة؛ تصفية بالتصنيف بنقر فعلي؛ رابط docs.github.com؛
//   «أبرز الموضع» بنقر فعلي ← حلقة تحيط بالعنصر الأصلي وتنتقل إليه، وما لا يوجد يعرض مسار التبويب؛ Escape يزيل؛ وPB-03: زمن إدخال الحرف
//   (حدث input الفعلي) حتى أول تعديل في DOM وحتى أول إطار. أمر Alt+K: يقيسه tests/modules/browser/mj10-integration.mjs على الحزمة المشحونة.
// الاستعمال: node tests/modules/b/search/browser/run.mjs [chrome edge brave firefox] [--out-dir evidence]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineInfo, openBrowser, serveDir, stats, writeJson } from '../../../../../scripts/spikes/lib.mjs';
import { blockExternalScripts, bundleEntry, call, click, inject, press, recorder, run, settle, typeText } from '../../../browser/e2e.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SERVE = path.join(ROOT, 'dist/mj10-search-browser');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

const SAMPLE = { name: 'sample', file: 'tests/modules/b/card/fixtures/fixture-github-ui-sample.html', href: 'https://github.com/octo/demo' };
const REAL = { name: 'real-repo', file: 'fixtures/spikes/gh-repo-arabic-stop-words.html', href: 'https://github.com/mohataher/arabic-stop-words' };
const QUERIES = [
  { q: 'مستودع', first: 'repository' },
  { q: 'commit', first: 'commit' },
  { q: 'كوميت', first: 'commit', via: 'synonym' },
  { q: 'pull request', first: 'pull_request' },
  { q: 'المخزن', first: 'repository', via: 'synonym' },
  { q: 'حذف مستودع', first: 'delete_repo' },
  { q: 'Squash and merge', first: 'squash_merge' },
];

const code = await bundleEntry({
  root: ROOT,
  entry: path.join(HERE, 'entry.tsx'),
  serveDir: SERVE,
  extraFiles: { [`${SAMPLE.name}.html`]: SAMPLE.file, [`${REAL.name}.html`]: REAL.file },
});
const server = await serveDir(SERVE);
const { checks, check } = recorder();
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: 'ملف تعريف مؤقت جديد بلا إضافات وبلا واجهة (headless)؛ كتابة ونقر فعليان؛ الشيفرة كما تُشحن', results: [] };
const screensDir = outDir ? path.join(outDir, 'T-3.4/screens') : null;
if (screensDir) fs.mkdirSync(screensDir, { recursive: true });

const state = (b) => call(b, 'viewState');
const clickAction = async (b, arg) => {
  const r = await call(b, 'rectOfAction', arg);
  if (!r) throw new Error(`لا عنصر لـ${JSON.stringify(arg)}`);
  await click(b, r.x, r.y);
  await settle(120);
};
async function clearField(b) {
  await call(b, 'focusInput');
  await press(b, 'Backspace');
  await settle(60);
}

async function searchFlow(b, width) {
  const label = b.label;
  const r = {};
  await b.open(`${server.url}/${SAMPLE.name}.html`);
  await inject(b, code);
  await call(b, 'mountPage', SAMPLE.href);
  await call(b, 'mountView', width);
  let s = await state(b);
  check(label, `عرض ${width}`, 'الواجهة مرسومة: ثماني أزرار تصفية و٢٠ نتيجة و«عرض المزيد»', s.chips.length === 8 && s.results.length === 20 && s.hasMore, { chips: s.chips.length, results: s.results.length });
  check(label, `عرض ${width}`, 'لا تجاوز أفقي: لا عنصر يتجاوز حافة اللوحة', s.overflow.hostScrollWidth <= s.overflow.hostClientWidth + 1 && s.overflow.wideElements.length === 0, s.overflow);
  r.initial = { count: s.count, chips: s.chips.map((c) => c.text) };
  if (width !== 400) return r;

  // الكتابة الحقيقية وقياس PB-03.
  await call(b, 'instrumentLatency');
  const focus = await call(b, 'focusInput');
  check(label, 'البحث', 'خانة البحث قابلة للتركيز', focus.focused === 'input#mj-gs-input', focus);
  r.queries = [];
  for (const spec of QUERIES) {
    await clearField(b);
    await typeText(b, spec.q);
    await settle(80);
    s = await state(b);
    r.queries.push({ q: spec.q, first: s.results[0]?.id, via: s.results[0]?.via, count: s.dataCount });
    check(label, 'البحث', `«${spec.q}» ← ${spec.first} أولًا${spec.via ? ` (${spec.via})` : ''}`, s.query === spec.q && s.results[0]?.id === spec.first && (!spec.via || s.results[0]?.via === spec.via), { query: s.query, results: s.results.slice(0, 3) });
  }
  const lat = await call(b, 'latencies');
  const dom = stats(lat.map((x) => x.dom));
  const frame = stats(lat.map((x) => x.frame));
  r.pb03 = { samples: lat.length, domMs: dom, frameMs: frame };
  check(label, 'PB-03', `زمن الإدخال حتى تعديل DOM: المئين 95 أقل من 10ms (${lat.length} عيّنة)`, lat.length >= 40 && dom.p95 < 10, { dom, frame });
  check(label, 'PB-03', 'زمن الإدخال حتى أول إطار: المئين 95 أقل من 50ms (غير ملزم بـPB-03؛ للإعلام)', frame.p95 < 50, frame);

  // لا نتائج.
  await clearField(b);
  await typeText(b, 'zzqqxx');
  await settle(80);
  s = await state(b);
  check(label, 'البحث', 'لا نتائج: رسالة بدل قائمة', s.emptyShown && s.results.length === 0 && s.count.includes('لا نتائج'), s);

  // التصفية بنقر فعلي.
  await clearField(b);
  await clickAction(b, { action: 'category', category: 'security' });
  s = await state(b);
  check(label, 'التصنيف', 'نقر «الأمان» يضيّق القائمة إلى التصنيف وحده ويضغط زره', s.results.length > 0 && s.results.every((x) => x.category === 'security') && s.chips.find((c) => c.id === 'security').pressed === 'true', { results: s.results.slice(0, 3), chips: s.chips.filter((c) => c.pressed === 'true') });
  await typeText(b, 'commit');
  await settle(80);
  s = await state(b);
  check(label, 'التصنيف', 'الاستعلام والتصنيف معًا: commit في الأمان لا يعيد المدخل Commit نفسه', !s.results.some((x) => x.id === 'commit') && s.results.every((x) => x.category === 'security'), s.results.slice(0, 3));
  await clickAction(b, { action: 'category', category: 'all' });
  await clearField(b);

  // قراءة الشرح ورابط docs.
  await typeText(b, 'star');
  await settle(80);
  await clickAction(b, { action: 'read', entry: 'star' });
  s = await state(b);
  check(label, 'الشرح', 'نقر «اقرأ الشرح» يفتح بطاقة واحدة', s.cards === 1 && s.results.find((x) => x.id === 'star')?.open === 'true', { cards: s.cards });
  check(label, 'الوثائق', 'روابط docs.github.com تفتح بأمان في تبويب جديد', s.docs.length > 0 && s.docs.every((d) => new URL(d.href).hostname === 'docs.github.com' && d.target === '_blank' && d.rel.includes('noopener') && d.rel.includes('noreferrer')), s.docs.slice(0, 2));
  await clickAction(b, { action: 'read', entry: 'star' });

  // أبرز الموضع على العينة.
  await clickAction(b, { action: 'locate', entry: 'star' });
  s = await state(b);
  check(label, 'أبرز الموضع', 'نقر «أبرز الموضع» ← «أُبرز الموضع في الصفحة»', s.locateNotes[0]?.status === 'found', s.locateNotes);
  const around = await call(b, 'ringAroundElement', '#star-btn');
  const hl = await call(b, 'highlightState');
  check(label, 'أبرز الموضع', 'مضيف إبراز واحد وحلقة تحيط بزر النجمة الأصلي (هامش 4px)', hl.hosts === 1 && around.around, { hl, around });
  await press(b, 'Escape');
  await settle(100);
  check(label, 'أبرز الموضع', 'Escape في الصفحة يزيل الإبراز', (await call(b, 'highlightState')).hosts === 0, null);

  await clearField(b);
  await typeText(b, 'Delete repository');
  await settle(80);
  await clickAction(b, { action: 'locate', entry: 'delete_repo' });
  s = await state(b);
  const note = s.locateNotes.find((n) => n.status === 'elsewhere');
  check(label, 'أبرز الموضع', 'الشرك «Delete this repository» لا يُبرز: يُعرض مسار التبويب (Settings)', Boolean(note) && note.text.includes('Settings') && (await call(b, 'highlightState')).hosts === 0, { note, hl: await call(b, 'highlightState') });

  await clearField(b);
  await typeText(b, 'repository');
  await settle(80);
  await clickAction(b, { action: 'locate', entry: 'repository' });
  s = await state(b);
  check(label, 'أبرز الموضع', 'المفهوم العام: concept بلا إبراز', s.locateNotes.some((n) => n.status === 'concept'), s.locateNotes);

  // أمر فتح القاموس: طلب التبويب يركّز الخانة (ما تفعله اللوحة حين يصلها الطلب).
  await call(b, 'focusInput'); // تأكيد أن الخانة تستقبل التركيز
  await run(b, () => document.activeElement?.blur?.());
  const asked = await call(b, 'requestGlossary');
  check(label, 'الأمر', 'طلب تبويب القاموس يركّز خانة البحث', asked.focused === 'input#mj-gs-input', asked.focused);

  const stopped = await call(b, 'stop');
  check(label, 'الإيقاف', 'إيقاف الوحدة يعيد DOM الصفحة حرفيًا بلا مضيف', stopped.hosts === 0 && stopped.identical, stopped);
  return r;
}

// اللقطات بعد فحص DOM الحرفي: Playwright يضيف style="" على حقول الإدخال أثناء اللقطة.
async function screenshots(b) {
  if (!screensDir || !b.page) return;
  await b.open(`${server.url}/${SAMPLE.name}.html`);
  await inject(b, code);
  await call(b, 'mountPage', SAMPLE.href);
  await call(b, 'mountView', 400);
  await call(b, 'focusInput');
  await typeText(b, 'فرع');
  await settle(150);
  await b.page.screenshot({ path: path.join(screensDir, `${b.key}-search-results.png`) });
  await clearField(b);
  await typeText(b, 'star');
  await settle(100);
  await clickAction(b, { action: 'locate', entry: 'star' });
  await settle(300);
  await b.page.screenshot({ path: path.join(screensDir, `${b.key}-locate-found.png`) });
  await call(b, 'stop');
}

async function realPageFlow(b) {
  const label = b.label;
  await b.open(`${server.url}/${REAL.name}.html`);
  await inject(b, code);
  await call(b, 'mountPage', REAL.href);
  const stats0 = await call(b, 'pageStats');
  // نختار أول مدخل يُعثر عليه في الصفحة الحقيقية ويكون بعيدًا عن النافذة بعد التمرير إلى أسفلها.
  const candidates = ['repo-tab-code', 'repo-tab-issues', 'repo-tab-pulls', 'repo-tab-actions', 'repo-tab-settings', 'readme-block', 'file-tree', 'about-panel'];
  let found = null;
  for (const id of candidates) {
    await call(b, 'scrollTo', 0);
    const h = await call(b, 'highlight', id);
    if (h.result.status === 'found') {
      found = { id, h };
      break;
    }
  }
  check(label, 'صفحة حقيقية', 'يوجد مدخل يُعثر عليه في الصفحة الحقيقية المحفوظة', found !== null, stats0);
  if (found) {
    const selectors = { 'repo-tab-code': 'a[data-tab-item="code"], #code-tab, a[href$="/mohataher/arabic-stop-words"]' };
    void selectors;
    check(label, 'صفحة حقيقية', `حلقة واحدة على الأقل لـ${found.id} داخل النافذة`, found.h.rings.length >= 1 && found.h.rings.every((x) => x.w > 0 && x.h > 0), found.h.rings.slice(0, 2));
    await call(b, 'clearHighlight');
    // تمرير الصفحة إلى الأسفل ثم الإبراز: يتحرك أول عنصر إلى النافذة.
    await call(b, 'scrollTo', 100000);
    await settle(200);
    const far = await call(b, 'highlight', found.id);
    await settle(1000);
    const after = await call(b, 'highlight', found.id);
    check(label, 'صفحة حقيقية', 'الإبراز بعد التمرير إلى أسفل الصفحة ينقل العنصر إلى النافذة (حلقة مرئية داخلها)', after.rings.length >= 1 && after.rings.some((x) => x.y >= -2 && x.y + x.h <= after.viewport.h + 2), { far: far.rings.length, scrollY: after.scrollY, rings: after.rings.slice(0, 2), viewport: after.viewport });
    await call(b, 'clearHighlight');
  }
  const stopped = await call(b, 'stop');
  check(label, 'صفحة حقيقية', 'إيقاف الوحدة يعيد DOM الصفحة الحقيقية حرفيًا', stopped.hosts === 0 && stopped.identical, stopped);
}

try {
  for (const key of keys) {
    const b = await openBrowser(key);
    await blockExternalScripts(b);
    const r = { browser: b.label, version: b.version };
    try {
      r.width400 = await searchFlow(b, 400);
      r.width360 = await searchFlow(b, 360);
      await realPageFlow(b);
      await screenshots(b);
    } catch (e) {
      r.error = String(e.stack ?? e);
      console.error(`${b.label}: ${e}`);
      check(b.label, '-', 'اكتمال التشغيل', false, r.error);
    } finally {
      await b.close();
    }
    output.results.push(r);
    const mine = checks.filter((c) => c.browser === b.label);
    console.error(`${b.label} ${b.version}: ${mine.filter((c) => c.ok).length}/${mine.length} فحصًا${r.width400?.pb03 ? ` · PB-03 p95 ${r.width400.pb03.domMs.p95.toFixed(2)}ms (DOM) و${r.width400.pb03.frameMs.p95.toFixed(2)}ms (إطار)` : ''}`);
  }
} finally {
  await server.close();
}
output.checks = checks;
const failed = checks.filter((c) => !c.ok);
console.error(`المجموع: ${checks.length - failed.length}/${checks.length} فحصًا اجتاز`);
if (outDir) writeJson(path.join(outDir, 'T-3.4/browser-results.json'), output);
if (failed.length) process.exitCode = 1;

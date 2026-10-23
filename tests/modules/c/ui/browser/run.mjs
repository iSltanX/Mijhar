#!/usr/bin/env node
// e2e واجهة الترجمة (T-4.1) في المتصفحات الفعلية، لا ضمن vitest: وحدة c.ui كما تُشحن بمحرك وهمي (FakeTranslationEngine) على العينة الإنجليزية
// fixture-translate-en.html وصفحات GitHub حقيقية محفوظة، بتخطيط حقيقي ونقر وتحديد بالفأرة فعليين من خارج الصفحة.
//   TEST-TR-01 (AC-C1): الأشرطة فوق README والتعليق والوصف، وعدّاد المحرك صفر قبل النقر؛ النقر يترجم؛ تحديد نص فعلي يُظهر «ترجمة المحدد» فتفتح بطاقة.
//   TEST-TR-03 (AC-C3): عرض الأصل مع الترجمة، و«الترجمة فقط» (الأصل بلا مساحة في التخطيط)، و«إظهار الأصل» بنقرة، و«إلغاء الترجمة» يعيد DOM حرفيًا،
//     والإلغاء أثناء الترجمة، والفشل الآمن، وغياب المحرك (ساكنة)، وعدم توفره (السبب)، وتدقيق الشبكة (لا طلب خارج 127.0.0.1).
// الاستعمال: node tests/modules/c/ui/browser/run.mjs [chrome edge brave firefox] [--out-dir evidence]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineInfo, openBrowser, serveDir, stats, writeJson } from '../../../../../scripts/spikes/lib.mjs';
import { blockExternalScripts, bundleEntry, call, click, drag, inject, press, recorder, settle } from '../../../browser/e2e.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SERVE = path.join(ROOT, 'dist/mj10-translate-browser');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

const FIXTURE = { name: 'fixture', file: 'tests/modules/c/ui/fixtures/fixture-translate-en.html', href: 'https://github.com/octo/mijhar-demo/issues/7' };
const REAL = [
  { name: 'real-readme', file: 'fixtures/spikes/gh-readme-shakkala.html', href: 'https://github.com/Barqawiz/Shakkala', body: 'article.markdown-body' },
  { name: 'real-pr', file: 'fixtures/spikes/gh-pr-watad-80.html', href: 'https://github.com/Watad-Project/Watad/pull/80', body: '.comment-body.markdown-body' },
];
const README = '[data-case="readme"]';
const COMMENT1 = '[data-case="comment-body-1"]';
const ISSUE = '[data-case="issue-description"]';
const LEGACY = '[data-case="comment-body-legacy"]';

const code = await bundleEntry({
  root: ROOT,
  entry: path.join(HERE, 'entry.ts'),
  serveDir: SERVE,
  extraFiles: { [`${FIXTURE.name}.html`]: FIXTURE.file, ...Object.fromEntries(REAL.map((p) => [`${p.name}.html`, p.file])) },
});
const server = await serveDir(SERVE);
const { checks, check } = recorder();
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: 'ملف تعريف مؤقت جديد بلا إضافات وبلا واجهة (headless)؛ نقر وتحديد بالفأرة فعليان؛ محرك وهمي؛ الشيفرة كما تُشحن', results: [] };
const screensDir = outDir ? path.join(outDir, 'T-4.1/screens') : null;
if (screensDir) fs.mkdirSync(screensDir, { recursive: true });

const barClick = async (b, arg) => {
  // نمرّر أولًا لإظهار الزر ثم نقرأ موضعه بعد استقرار التخطيط (صور وخطوط الصفحة الحقيقية قد تزيح العناصر).
  await call(b, 'barButton', arg);
  await settle(150);
  const at = await call(b, 'barButton', arg);
  if (!at) throw new Error(`لا زر ${JSON.stringify(arg)}`);
  try {
    await click(b, at.x, at.y);
  } catch (error) {
    throw new Error(`نقر ${JSON.stringify(arg)} عند (${at.x}, ${at.y}): ${error.message}`);
  }
};

async function open(b, page, engine) {
  await b.open(`${server.url}/${page.name}.html`);
  await inject(b, code);
  return call(b, 'mount', { href: page.href, engine });
}

async function fixtureFlows(b) {
  const label = b.label;
  const r = {};
  // ——— قبل أي فعل ———
  let m = await open(b, FIXTURE, {});
  check(label, 'قبل الفعل', 'خمسة أشرطة فوق النصوص المرسومة، وعدّاد المحرك صفر', m.bars === 5 && (await call(b, 'engineState')).calls === 0, m);
  await settle(300);
  check(label, 'قبل الفعل', 'بعد مهلة بلا فعل: العدّاد صفر ولا ترجمة', (await call(b, 'engineState')).calls === 0 && (await call(b, 'summary')).translations === 0, null);
  const idle = await call(b, 'barState', README);
  check(label, 'قبل الفعل', 'شريط README: زر «ترجمة README إلى العربية» وحده', idle.phase === 'idle' && idle.isBar && JSON.stringify(idle.actions) === JSON.stringify(['translate']), idle);
  await call(b, 'snap');

  // ——— README: نقرة فعلية ———
  await barClick(b, { body: README, action: 'translate' });
  await settle(400);
  let st = await call(b, 'barState', README);
  const eng = await call(b, 'engineState');
  const sum = await call(b, 'summary');
  check(label, 'README', 'النقر يترجم الفقرات الـ17 كلها ويبلغ done', st.phase === 'done' && eng.calls === 17 && sum.translations === 17, { st, eng, sum });
  check(label, 'README', 'كل الترجمات ظاهرة بتخطيط حقيقي (ارتفاع > 0) ولا تمرير أفقي', sum.visible === 17 && sum.noOverflow, sum);
  const p1 = await call(b, 'paragraph', '[data-case="p-code-link"]');
  check(label, 'README', 'الترجمة تحت الأصل مباشرة بالتخطيط الفعلي، والأصل ظاهر (الأصل والترجمة معًا)', p1.hostIsAfterOriginal && p1.original.offsetHeight > 0 && p1.host.rect.h > 0 && p1.host.display === 'block', p1);
  check(label, 'README', 'الترجمة rtl وlang=ar، ولونها وحجم خطها موروثان من الفقرة', p1.root.direction === 'rtl' && p1.root.lang === 'ar' && p1.root.color === p1.original.color && p1.root.fontSize === p1.original.fontSize, { root: p1.root, original: p1.original });
  check(label, 'README', 'العنصر المحمي dir=ltr محسوبًا ومعزول (unicode-bidi: isolate) وبخط ثابت العرض للشيفرة', p1.prot.direction === 'ltr' && /isolate/.test(p1.prot.unicodeBidi) && /mono|Menlo|Consolas|Plex|SF/i.test(p1.prot.fontFamily), p1.prot);
  const h1 = await call(b, 'paragraph', '[data-case="h1"]');
  check(label, 'README', 'ترجمة العنوان بعد غلافه .markdown-heading', h1.host.rect.y >= h1.original.rect.y + h1.original.rect.h - 2, h1);
  const arabic = await call(b, 'paragraph', '[data-case="p-arabic"]');
  check(label, 'README', 'الفقرة العربية والشيفرة بلا ترجمة', arabic.host === null && (await call(b, 'paragraph', '[data-case="pre"] pre')).host === null, arabic.host);
  if (screensDir && b.page) {
    // لقطة بعد فحص DOM الحرفي في آخر التدفق (انظر screenshots).
  }

  // ——— الأنماط ———
  await barClick(b, { body: README, mode: 'translation' });
  await settle(150);
  const only = await call(b, 'paragraph', '[data-case="p-code-link"]');
  const onlyLi = await call(b, 'paragraph', '[data-case="li-simple"]');
  const onlyTd = await call(b, 'paragraph', '[data-case="td-text"]');
  const sum2 = await call(b, 'summary');
  check(label, 'الأنماط', '«الترجمة فقط»: الفقرة الأصلية بلا مساحة في التخطيط (display:none) والترجمة ظاهرة', only.original.display === 'none' && only.original.offsetHeight === 0 && only.host.rect.h > 0, only);
  check(label, 'الأنماط', '«الترجمة فقط»: نص عنصر القائمة وخلية الجدول مغلَّف ومخفي والترجمة داخل العنصر ظاهرة بارتفاع فعلي', sum2.wrappers > 0 && sum2.wrappers === sum2.wrappersHidden && onlyLi.host.rect.h > 0 && onlyTd.host.rect.h > 0, { sum2, li: onlyLi.host, td: onlyTd.host });
  check(label, 'الأنماط', 'الفقرة بصورة تبقى ظاهرة (الوسائط لا تُترجم)', (await call(b, 'paragraph', '[data-case="p-badge"]')).original.offsetHeight > 0, null);
  await barClick(b, { body: README, mode: 'original' });
  await settle(150);
  const orig = await call(b, 'paragraph', '[data-case="p-code-link"]');
  const sum3 = await call(b, 'summary');
  check(label, 'الأنماط', '«إظهار الأصل» بنقرة واحدة: الأصل كله ظاهر، لا أغلفة، والترجمات مخفية ومحفوظة', orig.original.offsetHeight > 0 && sum3.wrappers === 0 && sum3.visible === 0 && sum3.translations === 17, { orig: orig.original, sum3 });
  await barClick(b, { body: README, mode: 'both' });
  await settle(150);
  check(label, 'الأنماط', 'العودة إلى «الأصل والترجمة» بنقرة بلا استدعاء جديد للمحرك', (await call(b, 'summary')).visible === 17 && (await call(b, 'engineState')).calls === 17, null);

  // ——— إلغاء الترجمة ———
  await barClick(b, { body: README, action: 'remove' });
  await settle(150);
  const afterCancel = await call(b, 'sameAsSnapshot');
  check(label, 'الإلغاء', '«إلغاء الترجمة» يعيد DOM الصفحة حرفيًا إلى حالته قبل الترجمة', afterCancel.same && (await call(b, 'summary')).translations === 0, afterCancel);
  // إلغاء وهو في «الترجمة فقط» أيضًا.
  await barClick(b, { body: README, action: 'translate' });
  await settle(300);
  await barClick(b, { body: README, mode: 'translation' });
  await settle(150);
  await barClick(b, { body: README, action: 'remove' });
  await settle(150);
  const afterCancel2 = await call(b, 'sameAsSnapshot');
  check(label, 'الإلغاء', 'الإلغاء من «الترجمة فقط» يعيد DOM حرفيًا أيضًا (فك الأغلفة)', afterCancel2.same, afterCancel2);

  // ——— تعليق ووصف مشكلة وتعليق قديم ———
  await call(b, 'engineSet', { mode: 'reorder' });
  await barClick(b, { body: COMMENT1, action: 'translate' });
  await settle(250);
  const c1 = await call(b, 'barState', COMMENT1);
  const c1p = await call(b, 'paragraph', '[data-case="c1-p2"]');
  check(label, 'تعليق', 'ترجمة التعليق (فقرتان) وعكس الترتيب مع بقاء الإحالة #42 محمية', c1.phase === 'done' && c1.note === 'تُرجمت 2 من 2 فقرة.' && c1p.root.text.includes('#42'), { c1, text: c1p.root.text });
  check(label, 'تعليق', 'README والتعليق الآخر لم يُمسّا', (await call(b, 'barState', README)).phase === 'idle' && (await call(b, 'barState', '[data-case="comment-body-2"]')).phase === 'idle', null);
  await call(b, 'engineSet', { mode: 'faithful' });
  await barClick(b, { body: ISSUE, action: 'translate' });
  await settle(250);
  check(label, 'وصف المشكلة', 'ترجمة وصف المشكلة (تخطيط React)', (await call(b, 'barState', ISSUE)).phase === 'done', await call(b, 'barState', ISSUE));
  await barClick(b, { body: LEGACY, action: 'translate' });
  await settle(250);
  check(label, 'تعليق قديم', 'ترجمة التعليق بالتخطيط القديم', (await call(b, 'barState', LEGACY)).phase === 'done', await call(b, 'barState', LEGACY));
  const arBar = '[data-case="comment-body-2"]';
  await barClick(b, { body: arBar, action: 'translate' });
  await settle(150);
  const ar = await call(b, 'barState', arBar);
  check(label, 'تعليق عربي', 'لا نص إنجليزي: رسالة واضحة بلا استدعاء', ar.phase === 'empty' && ar.note.includes('لا نص إنجليزي'), ar);
  await call(b, 'engineSet', { mode: 'faithful' });

  // ——— الفشل الآمن ———
  const m2 = await open(b, FIXTURE, { mode: 'drop' });
  void m2;
  await barClick(b, { body: README, action: 'translate' });
  await settle(400);
  const failBar = await call(b, 'barState', README);
  const failSum = await call(b, 'summary');
  const failPara = await call(b, 'paragraph', '[data-case="p-code-link"]');
  check(label, 'الفشل الآمن', 'محرك يُسقط الرموز: تنبيه في فقرات الرموز، والباقي يُترجم، والمجموع 17', failSum.warnings > 0 && failSum.warnings + failSum.translations === 17 && failBar.note.includes('لسلامة الرموز المحمية'), { failSum, note: failBar.note });
  check(label, 'الفشل الآمن', 'الأصل المُبقى ظاهر والتنبيه ظاهر بتخطيط فعلي', failPara.original.offsetHeight > 0 && failPara.host.rect.h > 0 && failPara.root.text === undefined, failPara);
  await call(b, 'stop');

  // ——— الإلغاء أثناء الترجمة ———
  await open(b, FIXTURE, { delayMs: 60 });
  await call(b, 'snap');
  await barClick(b, { body: README, action: 'translate' });
  await settle(250);
  const working = await call(b, 'barState', README);
  check(label, 'الإلغاء أثناء الترجمة', 'شريط التقدم والتقدم «جارٍ الترجمة… n من 17» وزر إلغاء', working.phase === 'working' && working.hasProgress && /^جارٍ الترجمة… \d+ من 17$/.test(working.note) && working.actions.includes('cancel'), working);
  await barClick(b, { body: README, action: 'cancel' });
  await settle(300);
  const cancelledCalls = (await call(b, 'engineState')).calls;
  await settle(300);
  const cancelled = await call(b, 'sameAsSnapshot');
  check(label, 'الإلغاء أثناء الترجمة', 'الإلغاء يزيل ما بُني ويعيد DOM حرفيًا ولا استدعاء بعده', cancelled.same && (await call(b, 'barState', README)).phase === 'idle' && (await call(b, 'engineState')).calls === cancelledCalls, { cancelled, calls: cancelledCalls });
  await call(b, 'stop');

  // ——— غياب المحرك وعدم توفره ———
  m = await open(b, FIXTURE, null);
  check(label, 'غياب المحرك', 'لا محرك: لا شريط ولا مضيف ولا تغيير في الصفحة (ساكنة)', m.bars === 0 && (await call(b, 'sameAsSnapshot')).same !== undefined && (await call(b, 'stop')).identical, m);
  m = await open(b, FIXTURE, { unavailable: 'Translator API غير مدعومة في هذا المتصفح' });
  const unavailable = await call(b, 'barState', README);
  await barClick(b, { body: README, action: 'translate' });
  await settle(200);
  const unavailable2 = await call(b, 'barState', README);
  check(label, 'عدم التوفر', 'الأشرطة تظهر مع السبب الصريح، والنقر لا يستدعي المحرك ولا يترجم', m.bars === 5 && unavailable.note.includes('غير مدعومة') && unavailable2.note.includes('غير مدعومة') && (await call(b, 'engineState')).calls === 0 && (await call(b, 'summary')).translations === 0, { unavailable, unavailable2 });
  await call(b, 'stop');

  // ——— ترجمة النص المحدد: تحديد فعلي بالفأرة ———
  await open(b, FIXTURE, {});
  const d = await call(b, 'dragFor', { selector: '[data-case="p-sentences"]', chars: 38 });
  await drag(b, d.x1, d.y1, d.x2, d.y2);
  await settle(300);
  let sel = await call(b, 'selectionUi');
  check(label, 'النص المحدد', 'تحديد فعلي يُظهر زر «ترجمة المحدد» داخل النافذة، والمحرك لم يُستدعَ', sel.host && sel.button?.inView && sel.selected.length > 5 && (await call(b, 'engineState')).calls === 0, sel);
  if (sel.button) {
    await click(b, sel.button.center.x, sel.button.center.y);
    await settle(300);
    sel = await call(b, 'selectionUi');
    check(label, 'النص المحدد', 'النقر يفتح بطاقة داخل النافذة بالأصل والترجمة (rtl) والتركيز عليها', sel.card?.status === 'translated' && sel.card.inView && sel.card.focused && sel.card.original.length > 5 && sel.card.translation.startsWith('ترجمة: ') && sel.card.direction === 'rtl', sel.card);
    check(label, 'النص المحدد', 'المحرك استُدعي مرة واحدة بنص التحديد', (await call(b, 'engineState')).calls === 1, await call(b, 'engineState'));
    await press(b, 'Escape');
    await settle(150);
    check(label, 'النص المحدد', 'Escape يغلق البطاقة', !(await call(b, 'selectionUi')).host, null);
  }
  const stopped = await call(b, 'stop');
  check(label, 'الإيقاف', 'إيقاف الوحدة يعيد DOM الصفحة حرفيًا بلا مضيف ولا غلاف', stopped.hosts === 0 && stopped.wrappers === 0 && stopped.identical, stopped);

  // ——— تدقيق الشبكة: لا طلب خارج الخادم المحلي أثناء كل ما سبق على هذه الصفحة ———
  const urls = await call(b, 'resources').catch(() => []);
  r.requests = urls;
  const external = urls.filter((u) => !u.startsWith(server.url));
  check(label, 'الشبكة', 'لا طلب من الصفحة إلى أي مضيف خارج الخادم المحلي أثناء الترجمة (لا خدمة سحابية)', external.length === 0, external);
  return r;
}

async function realFlows(b) {
  const label = b.label;
  const r = {};
  for (const page of REAL) {
    await open(b, page, {});
    const st0 = await call(b, 'barState', page.body);
    const bars0 = (await call(b, 'summary')).translations;
    check(label, page.name, 'شريط ترجمة فوق النص الحقيقي، والمحرك لم يُستدعَ', st0?.isBar === true && (await call(b, 'engineState')).calls === 0 && bars0 === 0, st0);
    await call(b, 'snap');
    const t0 = Date.now();
    await barClick(b, { body: page.body, action: 'translate' });
    let done = false;
    for (let i = 0; i < 100 && !done; i += 1) {
      await settle(100);
      done = ['done', 'empty', 'error'].includes((await call(b, 'barState', page.body)).phase);
    }
    const ms = Date.now() - t0;
    const state = await call(b, 'barState', page.body);
    const sum = await call(b, 'summary');
    r[page.name] = { phase: state.phase, translations: sum.translations, warnings: sum.warnings, ms, note: state.note };
    check(label, page.name, `ترجمة نص حقيقي كبير (${sum.translations} فقرة) تنتهي بـdone بلا تمرير أفقي`, state.phase === 'done' && sum.translations > 0 && sum.noOverflow, { state, sum });
    await barClick(b, { body: page.body, mode: 'translation' });
    await settle(200);
    const only = await call(b, 'summary');
    check(label, page.name, '«الترجمة فقط» على النص الحقيقي: الأغلفة (إن وُجدت) كلها مخفية بالتخطيط', only.wrappers === only.wrappersHidden, only);
    await barClick(b, { body: page.body, action: 'remove' });
    await settle(250);
    const back = await call(b, 'sameAsSnapshot');
    check(label, page.name, 'إلغاء الترجمة يعيد DOM الصفحة الحقيقية حرفيًا', back.same, back);
    check(label, page.name, 'إيقاف الوحدة يعيد الصفحة الحقيقية حرفيًا', (await call(b, 'stop')).identical, null);
  }
  return r;
}

const paint = (b) => b.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 80)))));

async function screenshots(b) {
  if (!screensDir || !b.page) return;
  await open(b, FIXTURE, {});
  await barClick(b, { body: README, action: 'translate' });
  await settle(400);
  await paint(b);
  await b.page.screenshot({ path: path.join(screensDir, `${b.key}-readme-both.png`), fullPage: true });
  await barClick(b, { body: README, mode: 'translation' });
  await settle(200);
  await paint(b);
  await b.page.screenshot({ path: path.join(screensDir, `${b.key}-readme-translation-only.png`), fullPage: true });
  await barClick(b, { body: README, action: 'remove' });
  await settle(100);
  const d = await call(b, 'dragFor', { selector: '[data-case="p-sentences"]', chars: 38 });
  await drag(b, d.x1, d.y1, d.x2, d.y2);
  await settle(300);
  const sel = await call(b, 'selectionUi');
  if (sel.button) {
    await click(b, sel.button.center.x, sel.button.center.y);
    await settle(300);
    await b.page.screenshot({ path: path.join(screensDir, `${b.key}-selection-card.png`) });
  }
  await call(b, 'stop');
}

try {
  for (const key of keys) {
    const b = await openBrowser(key);
    await blockExternalScripts(b);
    const r = { browser: b.label, version: b.version };
    try {
      r.fixture = await fixtureFlows(b);
      r.real = await realFlows(b);
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
    console.error(`${b.label} ${b.version}: ${mine.filter((c) => c.ok).length}/${mine.length} فحصًا${r.real ? ` · ${Object.entries(r.real).map(([k, v]) => `${k} ${v.translations} فقرة في ${v.ms}ms`).join(' · ')}` : ''}`);
  }
} finally {
  await server.close();
}
output.checks = checks;
void stats;
const failed = checks.filter((c) => !c.ok);
console.error(`المجموع: ${checks.length - failed.length}/${checks.length} فحصًا اجتاز`);
if (outDir) writeJson(path.join(outDir, 'T-4.1/browser-results.json'), output);
if (failed.length) process.exitCode = 1;

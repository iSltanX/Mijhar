#!/usr/bin/env node
// e2e الوصول إلى الشرح (T-3.3) في المتصفحات الفعلية، لا ضمن vitest: الشيفرة التي تُشحن (createCardModule + b/access) على عينة
// fixture-github-ui-sample.html وصفحات GitHub حقيقية محفوظة، بمدخلات حقيقية من خارج الصفحة.
//   TEST-A11Y-01 (AC-B5): Alt+H فعلي ← التركيز على أول شارة ← Tab/Shift+Tab بين الشارات العشرين ثم «إيقاف» ← Enter وSpace يفتحان
//     ← Escape يغلق ويعيد التركيز ← ضغطات الحرف لا تبلغ المستند ← Alt+H ثانيةً تعيد التركيز إلى العنصر السابق.
//   TEST-A11Y-02 (AC-B5): جهاز لمسي محاكى (hasTouch + isMobile ⇒ hover: none وpointer: coarse في عائلة Chromium): لمسة تفتح، ولمسة خارجية
//     تغلق، وأهداف الشارات ≥ 24px، والبطاقة داخل نافذة العرض بلا تمرير أفقي. Firefox: لمس WebDriver بنوع touch إن قُبل وإلا «لم يُجرَ» بسببه.
// الاستعمال: node tests/modules/b/access/browser/run.mjs [chrome edge brave firefox] [--out-dir evidence]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineInfo, openBrowser, serveDir, writeJson } from '../../../../../scripts/spikes/lib.mjs';
import { blockExternalScripts, bundleEntry, call, hermeticOptions, inject, press, recorder, run, settle, tap } from '../../../browser/e2e.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SERVE = path.join(ROOT, 'dist/mj10-access-browser');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

const PAGES = [
  { name: 'sample', file: 'tests/modules/b/card/fixtures/fixture-github-ui-sample.html', href: 'https://github.com/octo/demo', expected: 20, taps: true },
  { name: 'real-repo', file: 'fixtures/spikes/gh-repo-arabic-stop-words.html', href: 'https://github.com/mohataher/arabic-stop-words', expected: 7, taps: false },
];
const MIN_TARGET = 24;

const code = await bundleEntry({
  root: ROOT,
  entry: path.join(HERE, 'entry.ts'),
  serveDir: SERVE,
  extraFiles: Object.fromEntries(PAGES.map((p) => [`${p.name}.html`, p.file])),
});
const server = await serveDir(SERVE);
const { checks, check } = recorder();
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: 'ملف تعريف مؤقت جديد بلا إضافات وبلا واجهة (headless)؛ مدخلات حقيقية (Playwright keyboard/touchscreen في Chromium، وWebDriver actions في Firefox)؛ الشيفرة كما تُشحن', results: [] };
const screensDir = outDir ? path.join(outDir, 'T-3.3/screens') : null;
if (screensDir) fs.mkdirSync(screensDir, { recursive: true });

const entryOf = (s) => s.shadowFocus; // مثل badge[star]

async function keyboardFlow(b, page, r) {
  const label = b.label;
  const url = `${server.url}/${page.name}.html`;
  await b.open(url);
  await inject(b, code);
  const m = await call(b, 'mount', page.href);
  check(label, page.name, 'قبل التفعيل لا مضيف', (await call(b, 'state')).hosts === 0, null);
  const anchor = page.name === 'sample' ? '#star-btn' : 'main a[href]';
  const focused = await call(b, 'focusPage', anchor);
  const before = focused.focused;
  check(label, page.name, 'تركيز عنصر من الصفحة قبل التفعيل', before !== null && before !== 'body', before);

  await press(b, 'Alt+KeyH');
  await settle(250);
  let s = await call(b, 'state');
  check(label, page.name, 'Alt+H الفعلي فعّل الوضع وأضاف مضيفًا واحدًا', s.modeActive && s.hosts === 1 && s.hostIsLastBodyChild, { active: s.modeActive, hosts: s.hosts });
  const n = s.badges.length;
  if (page.expected !== null) check(label, page.name, `${page.expected} شارة`, n === page.expected, n);
  else check(label, page.name, 'شارة واحدة على الأقل في الصفحة الحقيقية', n > 0, n);
  check(label, page.name, 'التركيز على أول شارة بعد التفعيل بلوحة المفاتيح', s.shadowFocus === `button[${s.badges[0]?.entry}]`, s.shadowFocus);
  check(
    label,
    page.name,
    'كل شارة button type=button باسم وصول وaria-expanded=false وaria-haspopup=dialog',
    s.badges.every((x) => x.tag === 'button' && x.type === 'button' && x.label?.startsWith('شرح «') && x.expanded === 'false' && x.popup === 'dialog'),
    s.badges.filter((x) => !(x.tag === 'button' && x.label)).slice(0, 3),
  );

  // Tab بين الشارات: التسلسل المرئي للتركيز في الظل يطابق ترتيب الشارات، ثم زر «إيقاف».
  const visited = [entryOf(s)];
  for (let i = 1; i < n; i += 1) {
    await press(b, 'Tab');
    visited.push(entryOf(await call(b, 'state')));
  }
  const expected = s.badges.map((x) => `button[${x.entry}]`);
  check(label, page.name, `Tab يزور الشارات ${n} بترتيبها بلا قفز ولا تكرار`, JSON.stringify(visited) === JSON.stringify(expected), { visited: visited.slice(0, 4), expected: expected.slice(0, 4) });
  await press(b, 'Tab');
  s = await call(b, 'state');
  check(label, page.name, 'بعد آخر شارة يصل Tab إلى زر «إيقاف» في شريط الوضع', s.shadowFocus === 'button{stop}', s.shadowFocus);
  await press(b, 'Shift+Tab');
  s = await call(b, 'state');
  check(label, page.name, 'Shift+Tab يعود إلى آخر شارة', s.shadowFocus === expected.at(-1), s.shadowFocus);
  for (let i = 0; i < n - 1; i += 1) await press(b, 'Shift+Tab');
  s = await call(b, 'state');
  check(label, page.name, 'Shift+Tab مرارًا يصل إلى أول شارة', s.shadowFocus === expected[0], s.shadowFocus);

  // Enter يفتح، Escape يغلق ويعيد التركيز إلى الشارة نفسها.
  const first = s.badges[0];
  await press(b, 'Enter');
  await settle();
  s = await call(b, 'state');
  check(label, page.name, 'Enter على الشارة يفتح البطاقة ويركّزها', s.badges[0].expanded === 'true' && s.card?.entry === first.entry && s.card.focused && s.card.role === 'dialog', { expanded: s.badges[0].expanded, card: s.card });
  check(label, page.name, 'البطاقة داخل نافذة العرض ولها زر إغلاق باسم وصول', s.card?.insideViewport && s.card.close === 'إغلاق الشرح', s.card);
  await press(b, 'Escape');
  await settle();
  s = await call(b, 'state');
  check(label, page.name, 'Escape يغلق البطاقة ويعيد التركيز إلى الشارة', s.card === null && s.shadowFocus === `button[${first.entry}]` && s.badges[0].expanded === 'false', { card: s.card, focus: s.shadowFocus });

  // Space على شارة أخرى (الثانية) يفتح.
  await press(b, 'Tab');
  const second = (await call(b, 'state')).badges[1];
  await press(b, 'Space');
  await settle();
  s = await call(b, 'state');
  check(label, page.name, 'Space على الشارة يفتح البطاقة', s.badges[1].expanded === 'true' && s.card?.entry === second.entry, { card: s.card?.entry });
  // التنقل بـTab داخل البطاقة يبلغ زر الإغلاق، وEnter عليه يغلق ويعيد التركيز.
  let reached = false;
  for (let i = 0; i < 8 && !reached; i += 1) {
    await press(b, 'Tab');
    reached = (await call(b, 'state')).shadowFocus === 'button{close}';
  }
  check(label, page.name, 'زر الإغلاق في البطاقة قابل للبلوغ بـTab', reached, null);
  await press(b, 'Enter');
  await settle();
  s = await call(b, 'state');
  check(label, page.name, 'Enter على زر الإغلاق يغلق البطاقة ويعيد التركيز إلى الشارة', s.card === null && s.shadowFocus === `button[${second.entry}]`, { focus: s.shadowFocus, card: s.card });

  // الضغطات داخل الطبقة لا تبلغ مستمع المستند (اختصارات GitHub)؛ Tab وAlt+H تبلغه.
  await call(b, 'clearKeys');
  await press(b, 'g');
  await press(b, 'i');
  await press(b, '?');
  s = await call(b, 'state');
  check(label, page.name, 'حروف الاختصارات (g وi و?) على الشارة لا تبلغ المستند', s.keys.length === 0, s.keys);

  await press(b, 'Alt+KeyH');
  await settle(250);
  s = await call(b, 'state');
  check(label, page.name, 'Alt+H ثانيةً تبلغ المستند (الاختصار غير محجوب) وتوقف الوضع وتزيل المضيف', s.modeActive === false && s.hosts === 0 && s.keys.some((k) => /^[hH˙]$/.test(k)), { active: s.modeActive, hosts: s.hosts, keys: s.keys });
  check(label, page.name, 'الإيقاف يعيد التركيز إلى العنصر السابق في الصفحة', s.pageFocus === before, { before, now: s.pageFocus });
  const stopped = await call(b, 'stop');
  check(label, page.name, 'إيقاف الوحدة يعيد DOM حرفيًا', stopped.hosts === 0 && stopped.identical, stopped);
  r.keyboard[page.name] = { badges: n, media: m.media };
  // اللقطات بعد فحص DOM الحرفي: Playwright يضيف style="" على حقول الإدخال أثناء اللقطة.
  if (screensDir && b.page && page.name === 'sample') {
    await call(b, 'mount', page.href);
    await call(b, 'focusPage', anchor);
    await press(b, 'Alt+KeyH');
    await settle(250);
    await b.page.screenshot({ path: path.join(screensDir, `${b.key}-keyboard-focus-first-badge.png`) });
    await press(b, 'Enter');
    await settle(200);
    await b.page.screenshot({ path: path.join(screensDir, `${b.key}-keyboard-card-open.png`) });
    await call(b, 'stop');
  }
}

async function touchFlow(b, page, r, { real }) {
  const label = b.label;
  await b.open(`${server.url}/${page.name}.html`);
  await inject(b, code);
  // صفحات GitHub الحقيقية تعلن viewport؛ العينة المحلية بلا meta فيعرضها الجهاز المحاكى بعرض 980px، فتُضاف هنا كما في الأصل.
  if (real) await run(b, () => document.querySelector('meta[name="viewport"]') || document.head.insertAdjacentHTML('beforeend', '<meta name="viewport" content="width=device-width, initial-scale=1">'));
  await settle(200);
  const m = await call(b, 'mount', page.href);
  r.touch[page.name] = { media: m.media };
  if (real) check(label, page.name, 'الجهاز المحاكى: hover: none وpointer: coarse', m.media.hoverNone && m.media.pointerCoarse, m.media);
  let s = await call(b, 'setMode', true);
  const n = s.badges.length;
  check(label, page.name, 'شارات ظاهرة في نافذة العرض', n > 0 && s.badges.every((x) => x.inView), s.badges.filter((x) => !x.inView));
  if (real) {
    check(label, page.name, `حجم كل شارة ≥ ${MIN_TARGET}px في المؤشر الخشن`, s.badges.every((x) => x.w >= MIN_TARGET && x.h >= MIN_TARGET) && s.pointer === 'coarse', { sizes: [...new Set(s.badges.map((x) => `${x.w}x${x.h}`))], pointer: s.pointer });
    check(label, page.name, 'لا تمرير أفقي في الصفحة بسبب الطبقة', s.overflowX <= 1, s.overflowX);
  }
  if (screensDir && b.page && page.name === 'sample') await b.page.screenshot({ path: path.join(screensDir, `${b.key}-touch-badges.png`) });
  if (!page.taps) {
    // الصفحة الحقيقية المحفوظة تتجاوز عرض الجهاز (يصغّرها Chrome المحمول ليسع المحتوى)، فإحداثيات اللمس لا تطابق إحداثيات التخطيط؛ تُقاس الأحجام والهندسة وحدها.
    r.touch[page.name].note = 'الأحجام والهندسة فقط؛ اللمس على العينة المحلية (صفحة حقيقية أعرض من الجهاز)';
    await call(b, 'stop');
    return;
  }

  // لا بطاقة قبل أي لمسة (لا اعتماد على التحويم).
  check(label, page.name, 'لا بطاقة مفتوحة قبل أي لمسة', s.card === null, s.card);
  const target = s.badges[0];
  await tap(b, target.cx, target.cy);
  await settle(200);
  s = await call(b, 'state');
  check(label, page.name, 'لمسة حقيقية على الشارة تفتح البطاقة', s.card?.entry === target.entry && s.badges[0].expanded === 'true', { card: s.card?.entry });
  check(label, page.name, 'البطاقة داخل نافذة العرض ولا تمرير أفقي', s.card?.insideViewport && s.overflowX <= 1, { card: s.card?.rect, overflowX: s.overflowX });
  if (real) check(label, page.name, `زر إغلاق البطاقة ≥ ${MIN_TARGET}px`, (s.card?.closeRect?.w ?? 0) >= MIN_TARGET && (s.card?.closeRect?.h ?? 0) >= MIN_TARGET, s.card?.closeRect);
  if (screensDir && b.page && page.name === 'sample') await b.page.screenshot({ path: path.join(screensDir, `${b.key}-touch-card-open.png`) });

  // لمسة على الصفحة خارج الطبقة تغلق البطاقة.
  const safe = await call(b, 'safePoint');
  check(label, page.name, 'وُجدت نقطة خارج الطبقة للمس', safe !== null, safe);
  if (safe) {
    await tap(b, safe.x, safe.y);
    await settle(200);
    s = await call(b, 'state');
    check(label, page.name, 'لمسة خارج الطبقة تغلق البطاقة والوضع باقٍ', s.card === null && s.modeActive, { card: s.card?.entry, mode: s.modeActive });
  }

  // كل شارة من الأولى حتى السادسة: لمسة تفتح، ولمسة على زر الإغلاق تغلق وتعيد التركيز إلى الشارة (لا Escape في الأجهزة اللمسية).
  const sample = s.badges.slice(0, Math.min(n, 6));
  let allOk = true;
  const failures = [];
  for (const badge of sample) {
    const now = (await call(b, 'state')).badges.find((x) => x.entry === badge.entry);
    await tap(b, now.cx, now.cy);
    await settle(150);
    let t = await call(b, 'state');
    const opened = t.card?.entry === badge.entry;
    const close = t.card?.closeRect;
    if (close) await tap(b, close.cx, close.cy);
    await settle(150);
    t = await call(b, 'state');
    const closed = t.card === null && t.shadowFocus === `button[${badge.entry}]`;
    if (!opened || !closed) {
      allOk = false;
      failures.push({ entry: badge.entry, opened, closed, focus: t.shadowFocus });
    }
  }
  check(label, page.name, `لمسة تفتح ولمسة على زر الإغلاق تغلق وتعيد التركيز إلى الشارة (${sample.length} شارات)`, allOk, failures);
  await call(b, 'stop');
}

try {
  for (const key of keys) {
    // 1) لوحة المفاتيح — في كل متصفح بإعداده الافتراضي (فأرة، سطح مكتب).
    const b = await openBrowser(key, hermeticOptions(key));
    await blockExternalScripts(b);
    const r = { browser: b.label, version: b.version, keyboard: {}, touch: {} };
    try {
      for (const page of PAGES) await keyboardFlow(b, page, r);
    } catch (e) {
      r.error = String(e.stack ?? e);
      console.error(`${b.label} (لوحة المفاتيح): ${e}`);
      check(b.label, '-', 'اكتمال تشغيل لوحة المفاتيح', false, r.error);
    } finally {
      await b.close();
    }
    // 2) اللمس — Chromium: جهاز لمسي محاكى؛ Firefox: لمس WebDriver على سطح المكتب.
    const family = key === 'firefox' ? 'firefox' : 'chromium';
    const t = await openBrowser(key, hermeticOptions(key, family === 'chromium' ? { hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 }, deviceScaleFactor: 2 } : {}));
    await blockExternalScripts(t);
    try {
      for (const page of PAGES) await touchFlow(t, page, r, { real: family === 'chromium' });
    } catch (e) {
      r.touchError = String(e.stack ?? e);
      console.error(`${t.label} (اللمس): ${e}`);
      check(t.label, '-', family === 'firefox' ? 'لمس WebDriver (لم يُجرَ إن رُفض)' : 'اكتمال تشغيل اللمس', false, r.touchError);
    } finally {
      await t.close();
    }
    const mine = checks.filter((c) => c.browser === b.label);
    console.error(`${b.label} ${b.version}: ${mine.filter((c) => c.ok).length}/${mine.length} فحصًا`);
    output.results.push(r);
  }
} finally {
  await server.close();
}
output.checks = checks;
const failed = checks.filter((c) => !c.ok);
console.error(`المجموع: ${checks.length - failed.length}/${checks.length} فحصًا اجتاز`);
if (outDir) writeJson(path.join(outDir, 'T-3.3/browser-results.json'), output);
if (failed.length) process.exitCode = 1;

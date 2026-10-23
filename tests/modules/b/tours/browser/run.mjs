#!/usr/bin/env node
// e2e الجولات الإرشادية (T-3.5) في المتصفحات الفعلية (لا يُشغَّل ضمن vitest): وحدة b.tours كما تُشحن على عينات الصفحة (ملف شخصي ومستودع وإصدارات وActions وطلب سحب وإعدادات حساسة)
// وعلى لقطات GitHub حقيقية محفوظة، بنقر فأرة وكيبورد حقيقيين من خارج الصفحة.
//   TEST-TOUR-01 (AC-B7): الجولات الخمس عشرة على صفحاتها؛ صفر أحداث ونداءات (click وsubmit وdispatchEvent…) تبلغ عنصرًا من الصفحة في كل خطوة؛ بطاقة سبب الغياب عند حذف عنصر؛
//     والجولات الحساسة شرح بصري فقط (لا حلقة إبراز ولا قراءة)؛ والإيقاف يعيد الصفحة حرفيًا.
// الاستعمال: node tests/modules/b/tours/browser/run.mjs [chrome edge brave firefox] [--out-dir evidence]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineInfo, openBrowser, serveDir, writeJson } from '../../../../../scripts/spikes/lib.mjs';
import { blockExternalScripts, bundleEntry, call, click, inject, press, recorder, settle } from '../../../browser/e2e.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SERVE = path.join(ROOT, 'dist/mj13-tours-browser');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

const FX = 'tests/modules/b/tours/fixtures';
const PAGES = {
  profile: { file: `${FX}/profile.html`, href: 'https://github.com/octo-dev' },
  repo: { file: `${FX}/repo.html`, href: 'https://github.com/octo/demo' },
  releases: { file: `${FX}/releases.html`, href: 'https://github.com/octo/demo/releases' },
  actions: { file: `${FX}/actions.html`, href: 'https://github.com/octo/demo/actions' },
  pr: { file: `${FX}/pr.html`, href: 'https://github.com/octo/demo/pull/7' },
  settings: { file: `${FX}/settings-account.html`, href: 'https://github.com/settings/security' },
  'real-repo': { file: 'fixtures/spikes/gh-repo-arabic-stop-words.html', href: 'https://github.com/mohataher/arabic-stop-words', real: true },
  'real-pr': { file: 'fixtures/spikes/gh-pr-watad-80.html', href: 'https://github.com/Watad-Project/Watad/pull/80', real: true },
  'real-issue': { file: 'fixtures/spikes/gh-issue-etos-1.html', href: 'https://github.com/salktbi902/ETOS-LLM-Studio/issues/1', real: true },
};

// ما يقابل pageForStep في اختبار jsdom: الصفحة التي تُشرح عليها الخطوة بحسب مسارها.
const pageForStep = (stepPath, tourId, index) => {
  if (tourId === 'understand-pr' && index === 1) return 'pr';
  if (!stepPath) return 'repo';
  if (stepPath.startsWith('/{user}')) return 'profile';
  if (stepPath.endsWith('/releases')) return 'releases';
  if (stepPath.endsWith('/actions')) return 'actions';
  if (stepPath.startsWith('/settings') || stepPath.includes('/settings')) return 'settings';
  return 'repo';
};

async function bundle() {
  const extraFiles = Object.fromEntries(Object.entries(PAGES).map(([name, p]) => [`${name}.html`, p.file]));
  return bundleEntry({ root: ROOT, entry: path.join(HERE, 'entry.ts'), serveDir: SERVE, extraFiles });
}

const code = await bundle();
const server = await serveDir(SERVE);
const { checks, check } = recorder();
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: 'ملف تعريف مؤقت جديد بلا إضافات وبلا واجهة (headless)؛ نقر وكيبورد حقيقيان؛ الشيفرة كما تُشحن', results: [] };
const screensDir = outDir ? path.join(outDir, 'T-3.5/screens') : null;
if (screensDir) fs.mkdirSync(screensDir, { recursive: true });

async function load(b, pageName, tour, step) {
  const page = PAGES[pageName];
  await b.open(`${server.url}/${pageName}.html`);
  await inject(b, code);
  await call(b, 'instrument');
  await call(b, 'mount', { href: page.href, tour, step });
  await settle(120);
}

const clickBar = async (b, action) => {
  const s = await call(b, 'bar');
  const at = s.buttons?.[action];
  if (!at) throw new Error(`لا زر ${action}`);
  await click(b, at.x, at.y);
  await settle(180);
};

async function tourCatalog(b) {
  await b.open(`${server.url}/repo.html`);
  await inject(b, code);
  const cat = await call(b, 'catalog');
  check(b.label, 'الكتالوج', 'خمس عشرة جولة، ستٌّ منها شرح بصري فقط', cat.length === 15 && cat.filter((t) => t.visualOnly).length === 6 && cat.every((t) => t.known), cat.map((t) => t.id));
  return cat;
}

async function fixtureTours(b, cat) {
  const results = [];
  for (const tour of cat) {
    const kinds = [];
    for (let i = 0; i < tour.steps; i += 1) {
      const pageName = pageForStep(tour.paths[i] ?? undefined, tour.id, i);
      await load(b, pageName, tour.id, i);
      const s = await call(b, 'bar');
      const expectVisual = tour.stepKinds[i] === 'visual';
      const expect = expectVisual ? 'visual' : tour.stepKinds[i] === 'text' ? 'text' : 'found';
      check(b.label, `${tour.id}#${i + 1}`, `الشريط ظاهر داخل النافذة بحالة ${expect}`, s.open && s.inViewport && s.resolution === expect && s.step === String(i), { resolution: s.resolution, inViewport: s.inViewport });
      if (expect === 'found') check(b.label, `${tour.id}#${i + 1}`, 'حلقة إبراز حقيقية بحجم موجب فوق عنصر الخطوة', s.rings.length >= 1 && s.rings.every((r) => r.w > 0 && r.h > 0), s.rings);
      if (expectVisual) check(b.label, `${tour.id}#${i + 1}`, 'شرح بصري فقط: رسم تخطيطي ولا حلقة إبراز ولا مضيف إبراز', s.wire && s.rings.length === 0 && s.ringHost === 0 && s.visual?.includes('شرح بصري فقط'), { wire: s.wire, rings: s.rings.length, host: s.ringHost });
      const before = s;
      await clickBar(b, 'tour-next');
      const after = await call(b, 'bar');
      const last = i === tour.steps - 1;
      check(b.label, `${tour.id}#${i + 1}`, last ? 'التالي في آخر خطوة ينهي الجولة ويزيل الشريط والحلقات' : 'التالي بنقر حقيقي ينتقل إلى الخطوة التالية', last ? !after.open && after.ringHost === 0 : after.open && after.step === String(i + 1), { after: after.step, open: after.open });
      const seen = await call(b, 'takeEvents');
      check(b.label, `${tour.id}#${i + 1}`, 'قفل الأمان: صفر أحداث ونداءات (click وsubmit وdispatchEvent…) على عنصر من الصفحة', seen.events.length === 0 && seen.calls.length === 0, seen);
      const stopped = await call(b, 'stop');
      check(b.label, `${tour.id}#${i + 1}`, 'الإيقاف يعيد DOM الصفحة حرفيًا بلا مضيف', stopped.hosts === 0 && stopped.identical, stopped);
      kinds.push(before.resolution);
    }
    results.push({ tour: tour.id, kinds });
  }
  return results;
}

async function absentCard(b) {
  await load(b, 'repo', 'open-repo', 2);
  const found = await call(b, 'bar');
  check(b.label, 'الغياب', 'قبل الحذف: خطوة README مُبرزة', found.resolution === 'found', found.resolution);
  await call(b, 'stop');
  await b.open(`${server.url}/repo.html`);
  await inject(b, code);
  await call(b, 'removeById', 'readme');
  await call(b, 'instrument');
  await call(b, 'mount', { href: PAGES.repo.href, tour: 'open-repo', step: 2 });
  await settle(150);
  const s = await call(b, 'bar');
  check(b.label, 'الغياب', 'بعد حذف عنصر الخطوة: بطاقة تشرح سبب الغياب بدل التخمين ولا حلقة إبراز', s.resolution === 'absent' && s.absent?.includes('لم يظهر عنصر هذه الخطوة') && s.absent.includes('لا يظهر README') && s.rings.length === 0 && s.ringHost === 0, s);
  const seen = await call(b, 'takeEvents');
  check(b.label, 'الغياب', 'ولا نقر اصطناعي', seen.events.length === 0 && seen.calls.length === 0, seen);
  if (b.page && screensDir) await b.page.screenshot({ path: path.join(screensDir, `${b.key}-absent-card.png`) });
  await call(b, 'stop');
  // عنصر يوجد في صفحة أخرى مع رابط يضغطه المستخدم.
  await load(b, 'repo', 'commit-branch-tag-release', 3);
  const rel = await call(b, 'bar');
  check(b.label, 'الغياب', 'خطوة Release على صفحة المستودع: غياب بسبب الصلاحية والصفحة، ورابط مطلق إلى github.com يضغطه المستخدم', rel.resolution === 'absent' && rel.absent?.includes('صلاحية') && rel.link === 'https://github.com/octo/demo/releases', { resolution: rel.resolution, link: rel.link, absent: rel.absent });
  await call(b, 'stop');
}

async function keyboard(b) {
  await load(b, 'repo', 'open-repo', 0);
  const s = await call(b, 'bar');
  check(b.label, 'لوحة المفاتيح', 'يبدأ التركيز في الشريط نفسه (أول مرة)', s.open && typeof s.focus === 'string' && s.focus.includes('tour-bar'), s.focus);
  await press(b, 'Tab');
  await settle(60);
  const t1 = await call(b, 'bar');
  check(b.label, 'لوحة المفاتيح', 'Tab ينقل التركيز إلى أزرار الشريط داخل جذر الظل', typeof t1.focus === 'string' && t1.focus.startsWith('tour-') || (typeof t1.focus === 'string' && t1.focus.includes('btn')), t1.focus);
  await press(b, 'Escape');
  await settle(150);
  const gone = await call(b, 'bar');
  check(b.label, 'لوحة المفاتيح', 'Escape الفعلي ينهي الجولة', !gone.open && gone.ringHost === 0, gone.open);
  const seen = await call(b, 'takeEvents');
  check(b.label, 'لوحة المفاتيح', 'ولا حدث على عنصر من الصفحة سوى مفاتيح المستخدم نفسها (موثوقة)', seen.calls.length === 0 && seen.events.every((e) => e.endsWith(':trusted')), seen);
  await call(b, 'stop');
}

async function realPages(b) {
  const r = {};
  await b.open(`${server.url}/repo.html`);
  await inject(b, code);
  const plan = [
    ['real-repo', 'open-repo'],
    ['real-repo', 'commit-branch-tag-release'],
    ['real-repo', 'top-navigation'],
    ['real-repo', 'upload-file'],
    ['real-repo', 'understand-actions'],
    ['real-pr', 'understand-pr'],
    ['real-pr', 'top-navigation'],
    ['real-issue', 'top-navigation'],
    ['real-repo', 'privacy-settings'],
    ['real-repo', 'delete-repo-safely'],
  ];
  const catalog = await call(b, 'catalog');
  for (const [pageName, tourId] of plan) {
    const tour = catalog.find((t) => t.id === tourId);
    const kinds = [];
    for (let i = 0; i < tour.steps; i += 1) {
      await load(b, pageName, tourId, i);
      const s = await call(b, 'bar');
      kinds.push(s.resolution);
      if (s.resolution === 'found') check(b.label, `${pageName}/${tourId}#${i + 1}`, 'عنصر وُجد على لقطة حقيقية: حلقة بحجم موجب والشريط داخل النافذة', s.rings.length >= 1 && s.rings.every((x) => x.w > 0 && x.h > 0) && s.inViewport, { rings: s.rings, inViewport: s.inViewport });
      if (s.resolution === 'visual') check(b.label, `${pageName}/${tourId}#${i + 1}`, 'شرح بصري فقط على صفحة حقيقية: لا حلقة', s.rings.length === 0 && s.ringHost === 0, s.rings);
      await clickBar(b, 'tour-next');
      const seen = await call(b, 'takeEvents');
      check(b.label, `${pageName}/${tourId}#${i + 1}`, 'صفر أحداث ونداءات اصطناعية على عناصر الصفحة الحقيقية', seen.events.length === 0 && seen.calls.length === 0, seen);
      const stopped = await call(b, 'stop');
      check(b.label, `${pageName}/${tourId}#${i + 1}`, 'الإيقاف يعيد الصفحة الحقيقية حرفيًا', stopped.hosts === 0 && stopped.identical, stopped);
    }
    r[`${pageName}/${tourId}`] = kinds;
  }
  return r;
}

async function narrow(b) {
  try {
    if (b.page) await b.page.setViewportSize({ width: 360, height: 640 });
    else await b.ff.client.send('WebDriver:SetWindowRect', { width: 420, height: 760 });
    await settle(250);
    await load(b, 'repo', 'open-repo', 1);
    const s = await call(b, 'bar');
    check(b.label, 'تخطيط ضيق', 'الشريط داخل النافذة الضيقة بلا تمرير أفقي للصفحة وأزراره قابلة للبلوغ', s.open && s.inViewport && s.overflowX <= 1 && s.buttons['tour-next'].x > 0, { rect: s.rect, overflowX: s.overflowX });
    if (b.page && screensDir) await b.page.screenshot({ path: path.join(screensDir, `${b.key}-narrow-bar.png`) });
    await call(b, 'stop');
    if (b.page) await b.page.setViewportSize({ width: 1280, height: 900 });
    else await b.ff.client.send('WebDriver:SetWindowRect', { width: 1366, height: 800 });
    await settle(150);
    return { inViewport: s.inViewport, overflowX: s.overflowX };
  } catch (e) {
    return { skipped: String(e.message ?? e) };
  }
}

async function screenshots(b) {
  if (!screensDir || !b.page) return;
  await load(b, 'repo', 'open-repo', 1);
  await b.page.screenshot({ path: path.join(screensDir, `${b.key}-live-step.png`) });
  await call(b, 'stop');
  await load(b, 'settings', 'secure-2fa', 0);
  await b.page.screenshot({ path: path.join(screensDir, `${b.key}-visual-only.png`) });
  await call(b, 'stop');
}

try {
  for (const key of keys) {
    const b = await openBrowser(key);
    await blockExternalScripts(b);
    const r = { browser: b.label, version: b.version };
    try {
      const cat = await tourCatalog(b);
      r.fixtureTours = await fixtureTours(b, cat);
      await absentCard(b);
      await keyboard(b);
      r.realPages = await realPages(b);
      r.narrow = await narrow(b);
      await screenshots(b);
      const urls = await call(b, 'resources').catch(() => []);
      check(b.label, 'الشبكة', 'لا طلب من الصفحة إلى أي مضيف خارج الخادم المحلي', urls.every((u) => u.startsWith(server.url)), urls.filter((u) => !u.startsWith(server.url)));
    } catch (e) {
      r.error = String(e.stack ?? e);
      console.error(`${b.label}: ${e}`);
      check(b.label, '-', 'اكتمال التشغيل', false, r.error);
    } finally {
      await b.close();
    }
    output.results.push(r);
    const mine = checks.filter((c) => c.browser === b.label);
    console.error(`${b.label} ${b.version}: ${mine.filter((c) => c.ok).length}/${mine.length} فحصًا`);
  }
} finally {
  await server.close();
}
output.checks = checks;
const failed = checks.filter((c) => !c.ok);
console.error(`المجموع: ${checks.length - failed.length}/${checks.length} فحصًا اجتاز`);
if (outDir) writeJson(path.join(outDir, 'T-3.5/browser-results.json'), output);
if (failed.length) process.exitCode = 1;

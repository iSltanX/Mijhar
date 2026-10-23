#!/usr/bin/env node
// e2e بطاقة الشرح (T-3.2) في المتصفحات الفعلية (لا يُشغَّل ضمن vitest): الشيفرة التي تُشحن (createCardModule وmatch والطبقة العائمة)
// على عينة fixture-github-ui-sample.html وعلى ثلاث صفحات GitHub حقيقية محفوظة (مستودع ومشكلة وPR)، بتخطيط حقيقي لا محاكى.
//   TEST-GLOSS-01 (AC-B1): الاختصار الفعلي Alt+H، شارة لكل عنصر مطابق وبلا شرك، الأب المباشر لكل عنصر أصلي لم يتغير، الطبقة لا
//     تلتقط نقرات الصفحة، والإيقاف يعيد DOM حرفيًا.
//   TEST-GLOSS-02/03/06 في المتصفح: بطاقة مفتوحة بمستوياتها الثلاثة، والإنجليزي dir=ltr والاتجاه المحسوب ltr، والحقول الخمسة.
// الاستعمال: node tests/modules/b/card/browser/run.mjs [chrome edge brave firefox] [--out-dir evidence]
// كل متصفح بملف تعريف مؤقت جديد؛ المتصفحات تباعًا؛ العينات تُخدم من 127.0.0.1 (الصفحات الحقيقية تطلب أنماط github.githubassets.com).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { machineInfo, openBrowser, serveDir, waitFor, writeJson } from '../../../../../scripts/spikes/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SERVE = path.join(ROOT, 'dist/mj8-card-browser');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

const PAGES = [
  { name: 'sample', file: 'tests/modules/b/card/fixtures/fixture-github-ui-sample.html', href: 'https://github.com/octo/demo', real: false },
  { name: 'real-repo', file: 'fixtures/spikes/gh-repo-arabic-stop-words.html', href: 'https://github.com/mohataher/arabic-stop-words', real: true },
  { name: 'real-issue', file: 'fixtures/spikes/gh-issue-etos-1.html', href: 'https://github.com/salktbi902/ETOS-LLM-Studio/issues/1', real: true },
  { name: 'real-pr', file: 'fixtures/spikes/gh-pr-watad-80.html', href: 'https://github.com/Watad-Project/Watad/pull/80', real: true },
];
const TRAPS = ['delete_repo', 'archive_repo'];
const SAMPLE_EXPECTED = 20;

async function bundle() {
  fs.rmSync(SERVE, { recursive: true, force: true });
  await build({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    mode: 'chromium',
    logLevel: 'warn',
    build: { outDir: SERVE, lib: { entry: path.join(HERE, 'entry.ts'), formats: ['iife'], name: 'MijharBBundle', fileName: () => 'mijhar-b.js' } },
  });
  for (const page of PAGES) fs.copyFileSync(path.join(ROOT, page.file), path.join(SERVE, `${page.name}.html`));
  return fs.readFileSync(path.join(SERVE, 'mijhar-b.js'), 'utf8');
}

// في Firefox تعمل الدوال في صندوق المحتوى، فالكائن في wrappedJSObject.
function inject(code) {
  const s = document.createElement('script');
  s.textContent = code;
  document.head.appendChild(s);
  return Boolean((window.wrappedJSObject ?? window).MijharB);
}
const kick = (a) => (window.wrappedJSObject ?? window).MijharB.call(a.name, a.arg === undefined ? '' : JSON.stringify(a.arg));
const poll = () => {
  const W = window.wrappedJSObject ?? window;
  return W.__mjDone ? W.__mjResult : null;
};
async function run(b, fn, arg) {
  if (b.ff) return b.ff.exec(`return (${fn.toString()})(arguments[0]);`, [arg ?? null]);
  return b.page.evaluate(`(${fn.toString()})(${JSON.stringify(arg ?? null)})`);
}
async function call(b, name, arg) {
  await run(b, kick, { name, arg });
  const raw = await waitFor(() => run(b, poll), 15000, 50);
  if (raw === null || raw === undefined) throw new Error(`لم تنتهِ ${name}`);
  const value = JSON.parse(raw);
  if (value && value.error) throw new Error(`${name}: ${value.error}`);
  return value;
}

const checks = [];
const check = (browser, page, name, ok, detail) => {
  checks.push({ browser, page, name, ok: Boolean(ok), detail });
  if (!ok) console.error(`  ✗ ${browser} · ${page} · ${name}: ${JSON.stringify(detail)}`);
};

const code = await bundle();
const server = await serveDir(SERVE);
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: 'ملف تعريف مؤقت جديد بلا إضافات وبلا واجهة (headless)، وخادم محلي؛ الشيفرة كما تُشحن (createCardModule)، والاختصار Alt+H حدث لوحة مفاتيح فعلي على المستند', results: [] };
const screensDir = outDir ? path.join(outDir, 'T-3.2/screens') : null;
if (screensDir) fs.mkdirSync(screensDir, { recursive: true });

try {
  for (const key of keys) {
    const b = await openBrowser(key);
    const r = { browser: b.label, version: b.version, pages: {} };
    try {
      for (const page of PAGES) {
        await b.open(`${server.url}/${page.name}.html`);
        await run(b, inject, code);
        const p = {};
        p.mount = await call(b, 'mount', page.href);
        check(b.label, page.name, 'قبل التفعيل لا مضيف', p.mount.hostsBefore === 0, p.mount);
        p.activate = await call(b, 'activate');
        const a = p.activate;
        check(b.label, page.name, 'الاختصار Alt+H فعّل الوضع', a.active === true, a.active);
        check(b.label, page.name, 'مضيف واحد في نهاية body وحجمه نافذة العرض كلها ولا يلتقط النقر', a.hosts === 1 && a.hostIsLastBodyChild && a.hostCovers && a.hostCovers.w === a.hostCovers.vw && a.hostPointerEvents === 'none', { hosts: a.hosts, last: a.hostIsLastBodyChild, covers: a.hostCovers, pe: a.hostPointerEvents });
        check(b.label, page.name, 'الأب المباشر لكل عنصر أصلي لم يتغير والصفحة كما هي خارج المضيف', a.changedParents === 0 && a.sameHtmlOutsideHosts, { changedParents: a.changedParents, same: a.sameHtmlOutsideHosts });
        check(b.label, page.name, 'كل شارة داخل نافذة العرض وبحجم 20×20', a.badges.every((x) => x.inView && x.w === 20 && x.h === 20), a.badges.filter((x) => !x.inView || x.w !== 20));
        check(b.label, page.name, 'لا شرح للشراك', !a.badges.some((x) => TRAPS.includes(x.entry)), a.badges.map((x) => x.entry));
        p.badgeCount = a.badges.length;
        p.explained = a.badges.map((x) => x.entry);
        if (page.name === 'sample') {
          check(b.label, page.name, `٢٠ شارة بالضبط`, a.badges.length === SAMPLE_EXPECTED, a.badges.length);
          const star = await call(b, 'clickThrough', '#star-btn');
          check(b.label, page.name, 'النقر على العنصر الأصلي يبلغه (الطبقة شفافة للنقر)', star.reached, star);
          p.card = await call(b, 'openCard', 'star');
          const c = p.card;
          check(b.label, page.name, 'فُتحت بطاقة النجمة بصيغة «العربي (English)»', c.opened && c.title === 'النجمة (Star)', c.title);
          check(b.label, page.name, 'الإنجليزي dir=ltr والاتجاه المحسوب ltr', c.enDir === 'ltr' && c.enComputedDirection === 'ltr' && c.enText === 'Star', { dir: c.enDir, computed: c.enComputedDirection });
          check(b.label, page.name, 'المستويات الثلاثة تتبدل ونصها متمايز', ['brief', 'medium', 'detailed'].every((l) => c.levels[l]?.selected && c.levels[l].text.length > 9) && new Set(Object.values(c.levels).map((l) => l.text)).size === 3, c.levels);
          check(b.label, page.name, 'الحقول الخمسة بقيم غير فارغة', c.fields.length === 5 && c.fields.every((f) => f.text.length > 0), c.fields);
          check(b.label, page.name, 'مثال عملي والتركيز على البطاقة وهي داخل نافذة العرض', c.hasExample && c.focusedIsCard && c.rect.x >= 0 && c.rect.y >= 0 && c.rect.x + c.rect.w <= c.rect.vw && c.rect.y + c.rect.h <= c.rect.vh, c.rect);
          p.escape = await call(b, 'closeWithEscape');
          check(b.label, page.name, 'Escape يغلق البطاقة ويعيد التركيز إلى الشارة', p.escape.closed && p.escape.focusedBadge === 'star', p.escape);
          p.sensitive = await call(b, 'openCard', 'repo-tab-settings');
          check(b.label, page.name, 'تبويب Settings حساس: الحقول الخمسة وتنبيه الحساسية', p.sensitive.opened && p.sensitive.fields.find((f) => f.id === 'safety')?.text === 'حساس', p.sensitive.fields);
          await call(b, 'closeWithEscape');
        }
        p.deactivate = await call(b, 'deactivate');
        check(b.label, page.name, 'Alt+H ثانيةً توقف الوضع وتفرّغ الطبقة', p.deactivate.active === false && p.deactivate.badges === 0, p.deactivate);
        await call(b, 'activate');
        p.stop = await call(b, 'stop');
        check(b.label, page.name, 'إيقاف الوحدة وهي مفعَّلة يعيد DOM حرفيًا بلا مضيف', p.stop.hosts === 0 && p.stop.identical, p.stop);
        r.pages[page.name] = p;
        // لقطات الشاشة بعد فحص الإيقاف: Playwright يضيف style="" على حقول الإدخال أثناء اللقطة، فلا تُلتقط قبل فحص DOM الحرفي.
        if (screensDir && b.page && page.name === 'sample') {
          await call(b, 'mount', page.href);
          await call(b, 'activate');
          await b.page.screenshot({ path: path.join(screensDir, `${key}-sample-badges.png`) });
          await call(b, 'openCard', 'star');
          await b.page.screenshot({ path: path.join(screensDir, `${key}-sample-card.png`) });
          await call(b, 'stop');
        }
      }
      const mine = checks.filter((c) => c.browser === b.label);
      console.error(`${b.label} ${b.version}: ${mine.filter((c) => c.ok).length}/${mine.length} فحصًا · العينة ${r.pages.sample?.badgeCount} شارة · المستودع الحقيقي ${r.pages['real-repo']?.badgeCount} · المشكلة ${r.pages['real-issue']?.badgeCount} · PR ${r.pages['real-pr']?.badgeCount}`);
    } catch (e) {
      r.error = String(e.stack ?? e);
      console.error(`${b.label}: ${e}`);
      check(b.label, '-', 'اكتمال التشغيل', false, r.error);
    } finally {
      await b.close();
    }
    output.results.push(r);
  }
} finally {
  await server.close();
}
output.checks = checks;
const failed = checks.filter((c) => !c.ok);
console.error(`المجموع: ${checks.length - failed.length}/${checks.length} فحصًا اجتاز`);
if (outDir) writeJson(path.join(outDir, 'T-3.2/browser-results.json'), output);
if (failed.length) process.exitCode = 1;

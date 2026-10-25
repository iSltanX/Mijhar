#!/usr/bin/env node
// لقطات مِجهَر للمتاجر وREADME (T-10.2، MJ26): ما تعرضه الحزمة المبنية dist/chromium نفسها في Chrome فوق صفحات GitHub تجريبية، بالمقاسين اللذين تحجزهما
// قوالب Figma (R-01 إلى R-12): 1280×688 للقالب بشريط عنوان، و1280×800 للقالب بلا نص؛ وبالوضعين الفاتح والداكن.
//   - الصفحات: بنية صفحات GitHub عامة محفوظة (fixtures/spikes وfixtures/logs) وأنماط GitHub الحقيقية من github.githubassets.com، بعد أن تُستبدل فيها كل
//     الأسماء والصور الشخصية والنصوص بأسماء ومحتوى تجريبيين نكتبهما هنا: لا اسم مستخدم حقيقي ولا محتوى أحد ولا بيانات خاصة ولا رمز ولا مفتاح.
//   - ما يظهر من مِجهَر حقيقي: لا يُعدَّل شيء في واجهته ولا يُضاف إليها؛ والتفاعل نقرات وضغطات فعلية (Playwright).
//   - لا شبكة إلا أنماط GitHub الساكنة؛ وgithub.com يُخدم محليًا، وكل مضيف آخر محجوب ويُسجَّل.
// ويكتب manifest.json بجانب اللقطات: لكل لقطة متصفحها وإصداره والتزام البناء ووقتها ومقاسها ومصادر صفحتها (يُنسخ إلى evidence/T-10.2).
// الاستعمال: npm run build && node scripts/screenshots.mjs --out <مجلد> [--scene 01-reading ...] [--theme light|dark] [--vision achromatopsia|deuteranopia|protanopia|tritanopia]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { chromium } from 'playwright-core';
import { BROWSERS } from './load-check.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const OUT = path.resolve(opt('--out') ?? path.join(os.tmpdir(), 'mijhar-screens'));
const ONLY = args.flatMap((a, i) => (args[i - 1] === '--scene' ? [a] : []));
const THEMES = opt('--theme') ? [opt('--theme')] : ['light', 'dark'];
// فحص عمى الألوان (TEST-A11Y-ALL): محاكاة Chrome نفسها (Emulation.setEmulatedVisionDeficiency)، ولا تُستعمل لقطاتها مواد إصدار.
const VISION = opt('--vision');
const SIZES = { captioned: { width: 1280, height: 688 }, clean: { width: 1280, height: 800 } };
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- صفحات تجريبية من بنية صفحات GitHub المحفوظة ----------

const OWNER = 'mijhar-demo';
const REPO = 'arabic-docs';
/** صورة شخصية محايدة: دائرة رمادية بلا وجه ولا اسم. */
const AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="#8c959f"/><circle cx="20" cy="16" r="7" fill="#d0d7de"/><rect x="9" y="26" width="22" height="10" rx="5" fill="#d0d7de"/></svg>')}`;

/** يستبدل كل اسم مستخدم ومستودع وصورة، ثم يطبّق تعديلات المحتوى على المستند. */
function demoPage(file, { names, edit }) {
  let html = read(file);
  for (const [from, to] of names) html = html.split(from).join(to);
  html = html.replace(/https:\/\/avatars\.githubusercontent\.com\/[^"'\s)]+/g, AVATAR);
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  for (const s of doc.querySelectorAll('script')) s.remove();
  // صور خارجية في المحتوى (شارات README وصوره) تُحذف؛ فلا طلب إلى مضيف آخر ولا صورة لأحد.
  for (const img of doc.querySelectorAll('img')) if (!img.getAttribute('src')?.startsWith('data:')) img.remove();
  edit(doc);
  return dom.serialize();
}
const setBody = (el, html) => {
  if (el) el.innerHTML = html;
};
const setText = (doc, selector, text) => {
  for (const el of doc.querySelectorAll(selector)) el.textContent = text;
};

const ISSUE_BODY = `<p><code>npm run build</code> يفشل عندي بعد تحديث الإعدادات، والتحذير في الملف <code>src/config/locale.ts</code> يقول إن القيمة <code>dir</code> غير معرّفة.</p>
<p>جرّبت تعديل السطر 42 في <code>src/components/Header.tsx</code> ثم أعدت البناء بالإصدار <code>v2.0.1-rc.3</code> فبقيت المشكلة كما هي.</p>
<pre><code>TypeError: Cannot read properties of undefined (reading 'dir')
    at resolveLocale (src/config/locale.ts:42:17)</code></pre>
<p>هل الخلل في ترتيب تحميل الإعدادات أم في المكوّن نفسه؟</p>`;
const REPLIES = [
  '<p>شكرًا على التقرير. الخلل في ترتيب التحميل: <code>locale.ts</code> يُقرأ قبل أن تُحمَّل الإعدادات. سأفتح طلب دمج يصلحه.</p>',
  '<p>تأكدت منه على فرع <code>main</code> أيضًا، وأضفت اختبارًا يعيده في <code>tests/locale.test.ts</code>.</p>',
  '<p>أُصلح في طلب الدمج، وسيصل مع الإصدار القادم.</p>',
];
const README_BODY = `<h1>دليل المشروع بالعربية</h1>
<p>مستودع تجريبي لعرض <strong>مِجهَر</strong>: نصوص عربية فيها كود ومسارات مثل <code>docs/getting-started.md</code> وأوامر طرفية.</p>
<h2>البدء</h2>
<pre><code>npm ci
npm run build</code></pre>
<p>ثم افتح <code>dist/index.html</code> في متصفحك. والإعدادات في <code>config/site.json</code>.</p>
<h2>المساهمة</h2>
<p>اقرأ <code>CONTRIBUTING.md</code> قبل فتح طلب دمج، واكتب وصف التغيير بالعربية أو الإنجليزية.</p>`;

const PAGES = {
  issue: {
    url: `https://github.com/${OWNER}/${REPO}/issues/7`,
    html: () =>
      demoPage('fixtures/spikes/gh-issue-etos-1.html', {
        names: [['salktbi902/ETOS-LLM-Studio', `${OWNER}/${REPO}`], ['ETOS-LLM-Studio', REPO], ['salktbi902', 'demo-author'], ['chatgpt-codex-connector', 'demo-bot'], ['/users/codex/', '/users/demo-reviewer/'], ['@codex', '@demo-reviewer'], ['>codex<', '>demo-reviewer<'], ['/users/etos/', '/users/demo-maintainer/'], ['>etos<', '>demo-maintainer<'], ['issues/1', 'issues/7'], ['>#1<', '>#7<'], ['إصلاح اتصال Local Debug أثناء الخلفية وTTS وإضافة اختبارات CI', 'إصلاح ترتيب تحميل الإعدادات']],
        edit: (doc) => {
          setText(doc, 'title', `اتجاه النص في وصف الإعداد · Issue #7 · ${OWNER}/${REPO}`);
          setText(doc, '[data-testid="issue-title"], bdi[data-testid="issue-title-sticky"]', 'اتجاه النص يختل في رسائل خطأ الإعدادات');
          // «– with <أداة>» في ترويسة التعليق: اسم منتج طرف ثالث لا علاقة له بالمشهد.
          for (const a of doc.querySelectorAll('a[href="https://www.chatgpt.com"]')) a.parentElement?.remove();
          const bodies = [...doc.querySelectorAll('.markdown-body')];
          setBody(bodies[0], ISSUE_BODY);
          bodies.slice(1).forEach((b, i) => setBody(b, REPLIES[i % REPLIES.length]));
        },
      }),
  },
  repo: {
    url: `https://github.com/${OWNER}/${REPO}`,
    html: () =>
      demoPage('fixtures/spikes/gh-repo-arabic-stop-words.html', {
        names: [['mohataher/arabic-stop-words', `${OWNER}/${REPO}`], ['arabic-stop-words', REPO], ['mohataher', OWNER], ['Nourahussein', 'demo-author'], ['tarekbazine', 'demo-reviewer']],
        edit: (doc) => {
          setText(doc, 'title', `${OWNER}/${REPO}: دليل تجريبي بالعربية · GitHub`);
          for (const p of doc.querySelectorAll('.f4.my-3, [itemprop="about"], [class^="description__"]')) p.textContent = 'مستودع تجريبي لعرض مِجهَر: توثيق عربي فيه كود ومسارات.';
          setBody(doc.querySelector('.markdown-body'), README_BODY);
          for (const a of doc.querySelectorAll('a[href*="/commit/"]')) if (a.textContent.trim().length > 12) a.textContent = 'docs: تحديث دليل البدء';
        },
      }),
  },
  pr: {
    url: `https://github.com/${OWNER}/${REPO}/pull/12`,
    html: () =>
      demoPage('fixtures/spikes/gh-pr-watad-80.html', {
        names: [['Watad-Project/Watad', `${OWNER}/${REPO}`], ['Watad-Project', OWNER], ['hashimalsobhi', 'demo-author'], ['73azn', 'demo-reviewer'], ['Om4rMu', 'demo-maintainer'], ['pull/80', 'pull/12'], ['#80', '#12'], ['#<!-- -->80', '#<!-- -->12'], ['feature/contractor-work-tabs', 'docs/getting-started']],
        edit: (doc) => {
          setText(doc, 'title', `docs: دليل البدء بالعربية by demo-author · Pull Request #12 · ${OWNER}/${REPO}`);
          setText(doc, '.js-issue-title, .markdown-title', 'docs: دليل البدء بالعربية وإصلاح ترتيب تحميل الإعدادات');
          const bodies = [...doc.querySelectorAll('.markdown-body')];
          setBody(bodies[0], '<p>يضيف هذا الطلب دليل البدء في <code>docs/getting-started.md</code>، ويصلح ترتيب تحميل <code>src/config/locale.ts</code> (Fixes #7).</p>');
          bodies.slice(1).forEach((b, i) => setBody(b, REPLIES[i % REPLIES.length]));
        },
      }),
  },
  job: {
    url: `https://github.com/${OWNER}/${REPO}/actions/runs/1102/job/2204`,
    html: () =>
      demoPage('fixtures/logs/gh-job-failed.html', {
        names: [['microsoft/vscode/actions/runs/39905618450/job/120256773911', `${OWNER}/${REPO}/actions/runs/1102/job/2204`], ['microsoft/vscode', `${OWNER}/${REPO}`], ['39905618450', '1102'], ['120256773911', '2204'], ['automations: refine cloud repository ownership UX', 'docs: دليل البدء بالعربية']],
        edit: (doc) => {
          setText(doc, 'title', `docs: دليل البدء بالعربية · ${OWNER}/${REPO}@a296c13 · GitHub`);
          // نسخة «مسجَّل»: بلا رابط «Sign in to view logs»، فيظهر زر قراءة سجل الخطوة الفاشلة.
          for (const a of doc.querySelectorAll('a[href^="/login"]')) if (/Sign in to view logs/.test(a.textContent)) a.remove();
        },
      }),
    extra: (pathname) =>
      /\/checks\/2204\/logs\/14$/.test(pathname)
        ? {
            status: 200,
            type: 'text/plain; charset=utf-8',
            body: [
              '2026-10-25T05:41:02.1180000Z > arabic-docs@1.4.0 build',
              '2026-10-25T05:41:02.1190000Z > tsc --noEmit && vite build',
              '2026-10-25T05:41:09.5020000Z src/components/Header.tsx(42,17): error TS2322: Type \'string | undefined\' is not assignable to type \'Direction\'.',
              '2026-10-25T05:41:09.5030000Z   Type \'undefined\' is not assignable to type \'Direction\'.',
              '2026-10-25T05:41:09.6120000Z Found 1 error in src/components/Header.tsx:42',
              '2026-10-25T05:41:09.7040000Z ##[error]Process completed with exit code 2.',
            ].join('\n'),
          }
        : null,
  },
  readme: {
    url: `https://github.com/${OWNER}/${REPO}/blob/main/README.md`,
    html: () =>
      demoPage('fixtures/spikes/gh-readme-js-algorithms-ar.html', {
        names: [['trekhleb/javascript-algorithms', `${OWNER}/${REPO}`], ['javascript-algorithms', REPO], ['trekhleb', OWNER], ['README.ar-AR.md', 'README.md'], ['blob/master', 'blob/main']],
        edit: (doc) => {
          setText(doc, 'title', `${REPO}/README.md at main · ${OWNER}/${REPO} · GitHub`);
          setBody(doc.querySelector('.markdown-body'), README_BODY);
        },
      }),
  },
};

// ---------- المشاهد ----------

const inHost = (page, host, code) => page.evaluate(({ host, code }) => new Function('root', code)(document.querySelector(`mijhar-host[data-mijhar-host="${host}"]`)?.shadowRoot ?? null), { host, code });
const waitHost = async (page, host, selector, ms = 10000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await inHost(page, host, `return Boolean(root?.querySelector(${JSON.stringify(selector)}));`)) return true;
    await sleep(150);
  }
  return false;
};
const clickHost = (page, host, selector) => page.locator(`mijhar-host[data-mijhar-host="${host}"] ${selector}`).first().click();
const scrollToHost = (page, host, offset = 80) => page.evaluate(({ host, offset }) => {
  const el = document.querySelector(`mijhar-host[data-mijhar-host="${host}"]`);
  if (el) window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - offset));
}, { host, offset });

const SCENES = [
  {
    id: '01-reading',
    page: 'issue',
    caption: 'العربية في اتجاهها الصحيح، والكود معزول داخلها',
    run: async (page) => {
      await page.waitForSelector('[data-mijhar-dir="rtl"]', { timeout: 10000 });
      await page.evaluate(() => {
        const first = document.querySelector('.markdown-body');
        if (first) window.scrollTo(0, Math.max(0, first.getBoundingClientRect().top + window.scrollY - 140));
      });
    },
  },
  {
    id: '02-explain',
    page: 'repo',
    caption: 'شرح الزر بالعربية في مكانه، ومتى تستعمله',
    run: async (page) => {
      await page.keyboard.press('Alt+KeyH');
      await waitHost(page, 'b.card', 'button.badge', 10000);
      const entries = await inHost(page, 'b.card', `return [...(root?.querySelectorAll('button.badge') ?? [])].map((b) => b.getAttribute('data-entry'));`);
      const pick = entries.find((e) => /fork/i.test(e)) ?? entries.find((e) => /star|watch|code/i.test(e)) ?? entries[0];
      await page.locator(`mijhar-host[data-mijhar-host="b.card"] button.badge[data-entry="${pick}"]`).first().click({ timeout: 8000 });
      await sleep(600);
    },
  },
  {
    id: '03-status',
    page: 'pr',
    caption: 'لماذا لا يُدمج الطلب؟ الموانع والفحوص في بطاقة واحدة',
    run: async (page) => {
      await waitHost(page, 'd.pr-status', '[data-card="pr-status"]', 15000);
      await sleep(800);
      await scrollToHost(page, 'd.pr-status', 90);
    },
  },
  {
    id: '04-log',
    page: 'job',
    caption: 'سبب فشل الفحص مع السطر الذي يثبته من السجل',
    run: async (page) => {
      await waitHost(page, 'd.log', '[data-action="read-step-log"]', 15000);
      await clickHost(page, 'd.log', '[data-action="read-step-log"]');
      await waitHost(page, 'd.log', '[data-layer="root-cause"] [data-pattern]', 15000);
      await sleep(500);
      await scrollToHost(page, 'd.log', 70);
    },
  },
  {
    id: '05-context',
    page: 'pr',
    caption: 'سياق المهمة جاهز للنسخ لأي نموذج، بلا مفتاح',
    run: async (page) => {
      await waitHost(page, 'e.copy-prompt', '[data-action="template-menu"]', 15000);
      await scrollToHost(page, 'e.copy-prompt', 220);
      await clickHost(page, 'e.copy-prompt', '[data-action="template-menu"]');
      await sleep(600);
    },
  },
  {
    id: '06-notes',
    page: 'readme',
    caption: 'ملاحظاتك الخاصة على الصفحة، تبقى في متصفحك',
    run: async (page) => {
      // بطاقة «ملاحظاتي على هذه الصفحة»: تُفتح بشريطها، ثم تُكتب الملاحظة وتُحفظ بزرها.
      const host = await (async () => {
        for (let i = 0; i < 60; i += 1) {
          const name = await page.evaluate(() => [...document.querySelectorAll('mijhar-host')].find((h) => h.shadowRoot?.querySelector('.notes-card'))?.getAttribute('data-mijhar-host') ?? null);
          if (name) return name;
          await sleep(250);
        }
        throw new Error('لا بطاقة ملاحظات في الصفحة');
      })();
      await clickHost(page, host, '.notes-card .card-bar');
      await waitHost(page, host, 'textarea', 8000);
      await page.locator(`mijhar-host[data-mijhar-host="${host}"] textarea`).first().fill('راجع ترتيب أوامر البدء قبل الإصدار القادم، وأضف مثالًا لملف config/site.json.');
      await clickHost(page, host, 'button[data-action="create"]');
      await sleep(800);
      await scrollToHost(page, host, 120);
    },
  },
];

// ---------- التشغيل ----------

async function capture() {
  fs.mkdirSync(OUT, { recursive: true });
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--', 'src'], { cwd: ROOT, encoding: 'utf8' }).trim() !== '';
  const version = JSON.parse(read('dist/chromium/manifest.json')).version;
  const html = Object.fromEntries(Object.entries(PAGES).map(([k, v]) => [new URL(v.url).pathname, v.html()]));
  const blocked = new Set();
  const records = [];
  for (const theme of THEMES) {
    for (const scene of SCENES.filter((s) => !ONLY.length || ONLY.includes(s.id))) {
      for (const [kind, size] of Object.entries(SIZES)) {
        const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mijhar-shots-'));
        const context = await chromium.launchPersistentContext(profile, { executablePath: BROWSERS.chrome.executable, headless: true, viewport: size, deviceScaleFactor: 1, colorScheme: theme, locale: 'ar', ignoreDefaultArgs: ['--disable-extensions'], args: ['--enable-unsafe-extension-debugging'] });
        try {
          await context.route('https://github.com/**', (route) => {
            const { pathname } = new URL(route.request().url());
            const page = PAGES[scene.page];
            const extra = page.extra?.(pathname);
            if (extra) return route.fulfill({ status: extra.status, contentType: extra.type, body: extra.body });
            if (html[pathname]) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: theme === 'dark' ? html[pathname].replace('data-color-mode="auto"', 'data-color-mode="dark"').replace('data-color-mode="light"', 'data-color-mode="dark"') : html[pathname] });
            if (/\/commit\/[0-9a-f]{40}\/status-details$/.test(pathname)) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: read('tests/modules/d/fixtures/fixture-status-details.html') });
            return route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
          });
          await context.route((url) => url.protocol === 'https:' && url.host !== 'github.com' && url.host !== 'github.githubassets.com', (route) => {
            blocked.add(new URL(route.request().url()).host);
            return route.abort();
          });
          const cdp = await context.browser().newBrowserCDPSession();
          await cdp.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'dist/chromium') });
          await sleep(800);
          const page = await context.newPage();
          if (VISION) await (await context.newCDPSession(page)).send('Emulation.setEmulatedVisionDeficiency', { type: VISION });
          await page.goto(PAGES[scene.page].url, { waitUntil: 'load' });
          await sleep(1500);
          await scene.run(page);
          await sleep(400);
          const file = path.join(OUT, `${scene.id}--${kind}--${theme}${VISION ? `--${VISION}` : ''}.png`);
          await page.screenshot({ path: file });
          records.push({ file: path.basename(file), scene: scene.id, caption: scene.caption, kind, theme, width: size.width, height: size.height, browser: `Chrome ${context.browser().version()}`, extension: `مِجهَر ${version} (dist/chromium)`, commit: dirty ? `${commit} + تعديلات غير ملتزمة في src` : commit, page: PAGES[scene.page].url, at: new Date().toISOString() });
          console.log(`✓ ${path.basename(file)}`);
        } catch (error) {
          console.error(`✗ ${scene.id} ${kind} ${theme}: ${error.message.split('\n')[0]}`);
          records.push({ scene: scene.id, kind, theme, error: error.message.split('\n')[0] });
        } finally {
          await context.close();
          fs.rmSync(profile, { recursive: true, force: true });
        }
      }
    }
  }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify({ blockedHosts: [...blocked], shots: records }, null, 2)}\n`);
  if (records.some((r) => r.error)) process.exit(1);
}

await capture();

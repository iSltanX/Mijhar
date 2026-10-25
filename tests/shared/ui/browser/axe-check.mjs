#!/usr/bin/env node
// TEST-A11Y-ALL (MJ26، T-10.1، AC-10.1): axe-core 4.14.0 على الواجهات المبنية في الحزمة المشحونة (dist/<الهدف>) في المتصفحات الأربعة، بالوضعين الفاتح
// والداكن: صفحة الإعدادات ودليلاها، واللوحة (sidepanel.html) بكل تبويب، وواجهات مِجهَر داخل صفحات GitHub عامة محفوظة تُخدم محليًا (مستودع وطلب دمج ومشكلة
// وصفحة مهمة Actions) ومعها الدرج مفتوحًا. وفي صفحات GitHub تُحتسب العُقد التي داخل واجهات مِجهَر وحدها (mijhar-host وما يحمل data-mijhar)، لا مخالفات
// GitHub نفسه. المعيار: لا مخالفة بأثر critical؛ ويُسجَّل ما سواها بأثره.
// الاستعمال: node tests/shared/ui/browser/axe-check.mjs [chrome edge brave firefox] [--out <ملف json>] [--extra-hash <جزء ...>]
import fs from 'node:fs';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, firefoxSession, sleep, waitUntil } from '../../../modules/d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const extraIndex = args.indexOf('--extra-hash');
const extraHashes = extraIndex === -1 ? [] : args.splice(extraIndex, 2)[1].split(',');
const keys = args.length ? args.filter((a) => BROWSERS[a]) : ['chrome', 'edge', 'brave', 'firefox'];
const AXE = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const AXE_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/package.json'), 'utf8')).version;

const SAMPLES = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/spikes/samples.json'), 'utf8')).samples;
const JOB_URL = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
const PAGES = { ...Object.fromEntries(SAMPLES.map((s) => [new URL(s.url).pathname, fs.readFileSync(path.join(ROOT, s.file), 'utf8')])), [new URL(JOB_URL).pathname]: fs.readFileSync(path.join(ROOT, 'fixtures/logs/gh-job-failed.html'), 'utf8') };
const GITHUB_PAGES = [SAMPLES.find((s) => s.name === 'repo-arabic-stop-words').url, SAMPLES.find((s) => s.name === 'pr-watad-80').url, SAMPLES.find((s) => s.name === 'issue-etos-1').url, JOB_URL];
const githubReply = (pathname) => (PAGES[pathname] ? { status: 200, type: 'text/html; charset=utf-8', body: PAGES[pathname] } : { status: 404, type: 'text/plain', body: 'not found' });
const apiReply = () => ({ message: 'Not Found' });

// يُقيَّم في الصفحة: يحمّل axe إن لم يكن، ويشغّله على المستند كله (ومعه جذور الظل المفتوحة)، ويعيد المخالفات مختصرة.
const RUN = (mijharOnly) => `
  if (!globalThis.axe) (0, eval)(arguments[0]);
  const result = await globalThis.axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
  // واجهات مِجهَر: داخل جذر ظل mijhar-host، أو عنصر حقنه مِجهَر (data-mijhar-injected). أما عُقد GitHub التي وسمها ضبط الاتجاه بسمة data-mijhar-*
  // فألوانها ألوان الصفحة، فلا تُحتسب على مِجهَر (وتظهر في الصفحة المحفوظة بلا أنماط GitHub بألوان المتصفح الافتراضية).
  const ours = (node) => ${mijharOnly ? `(Array.isArray(node.target[0]) ? /mijhar-host/i.test(node.target[0][0] ?? '') : /mijhar-host|data-mijhar-injected/i.test(String(node.target[0])))` : 'true'};
  return result.violations
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.filter(ours).map((n) => ({ target: n.target, impact: n.impact, summary: (n.failureSummary || '').slice(0, 300) })) }))
    .filter((v) => v.nodes.length);
`;

async function scan(run, label, mijharOnly = false) {
  const violations = await run(RUN(mijharOnly), [AXE]);
  if (!Array.isArray(violations)) return { label, error: JSON.stringify(violations).slice(0, 400) };
  return { label, violations, critical: violations.filter((v) => v.impact === 'critical').length, serious: violations.filter((v) => v.impact === 'serious').length };
}

const results = [];
for (const key of keys) {
  const target = BROWSERS[key].target;
  const extDir = path.join(ROOT, 'dist', target);
  const session = target === 'firefox' ? await firefoxSession({ extDir, githubReply, apiReply }) : await chromiumSession(key, { extDir, githubReply, apiReply });
  const { d } = session;
  const r = { key, browser: BROWSERS[key].label, version: session.browserVersion, axe: AXE_VERSION, scans: [] };
  try {
    const optionsPage = target === 'firefox' ? null : session.context.pages().find((p) => p.url().endsWith('/options.html'));
    const origin = await d.options(`return location.origin;`);
    const scheme = async (dark) => {
      if (target === 'firefox') {
        await session.chrome(`Services.prefs.setIntPref('ui.systemUsesDarkTheme', ${dark ? 1 : 0}); Services.prefs.setIntPref('layout.css.prefers-color-scheme.content-override', ${dark ? 0 : 1}); return true;`);
      } else {
        for (const page of session.context.pages()) await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
      }
      await sleep(300);
    };
    const optionsAt = async (hash) => {
      await d.options(`location.hash = ${JSON.stringify(hash)}; return true;`);
      await sleep(600);
    };
    for (const dark of [false, true]) {
      await scheme(dark);
      const mode = dark ? 'داكن' : 'فاتح';
      for (const hash of ['', 'guide/github-token', 'guide/provider-key', ...extraHashes]) {
        await optionsAt(hash);
        r.scans.push({ mode, ...(await scan((code, a) => d.options(code, a), `options.html${hash ? `#${hash}` : ''}`)) });
      }
      await optionsAt('');
      // اللوحة: تُفتح sidepanel.html في تبويب الإعدادات نفسه، ويُفحص كل تبويب فيها.
      await d.options(`location.href = ${JSON.stringify(`${origin}/sidepanel.html`)}; return true;`).catch(() => null);
      await sleep(1200);
      const tabs = (await d.options(`return [...document.querySelectorAll('[role="tab"]')].map((t) => t.id || t.textContent.trim());`)) ?? [];
      for (let i = 0; i < Math.max(1, tabs.length); i += 1) {
        if (tabs.length) {
          await d.options(`[...document.querySelectorAll('[role="tab"]')][${i}]?.click(); return true;`);
          await sleep(500);
        }
        r.scans.push({ mode, ...(await scan((code, a) => d.options(code, a), `sidepanel.html · ${tabs[i] ?? 'الافتراضي'}`)) });
      }
      await d.options(`location.href = ${JSON.stringify(`${origin}/options.html`)}; return true;`).catch(() => null);
      await sleep(1200);
      for (const url of GITHUB_PAGES) {
        await d.openGithub(url);
        await sleep(1800);
        const tabId = await d.options(`const api = globalThis.browser ?? globalThis.chrome ?? (window.wrappedJSObject ?? window).browser; const [t] = await api.tabs.query({ url: ${JSON.stringify(`${url.split('#')[0]}*`)} }); if (!t) return null; await api.tabs.sendMessage(t.id, { type: 'mijhar:drawer', action: 'open' }).catch(() => null); return t.id;`).catch(() => null);
        await sleep(1200);
        const hosts = await d.github(`return [...document.querySelectorAll('mijhar-host')].map((h) => h.getAttribute('data-mijhar-host'));`);
        // تبويب github.com لا يقبل وسائط: يُضمَّن مصدر axe في النص نفسه.
        r.scans.push({ mode, hosts, drawer: tabId !== null, ...(await scan((code) => d.github(`const __axe = ${JSON.stringify(AXE)};\n${code.replace('arguments[0]', '__axe')}`), `github ${new URL(url).pathname}`, true)) });
      }
    }
    void optionsPage;
  } catch (error) {
    r.error = String(error?.stack ?? error);
    console.error(`${r.browser}: ${r.error}`);
  } finally {
    await session.close();
  }
  r.critical = r.scans.reduce((a, s) => a + (s.critical ?? 0), 0);
  r.serious = r.scans.reduce((a, s) => a + (s.serious ?? 0), 0);
  r.errors = r.scans.filter((s) => s.error).length;
  console.log(`${r.browser} ${r.version}: ${r.scans.length} فحصًا · critical ${r.critical} · serious ${r.serious} · تعذّر ${r.errors}`);
  for (const s of r.scans) for (const v of s.violations ?? []) console.log(`  [${s.mode}] ${s.label}: ${v.impact} ${v.id} (${v.nodes.length}) ${v.help}`);
  results.push(r);
}
if (outFile) fs.writeFileSync(outFile, `${JSON.stringify({ at: new Date().toISOString(), axe: AXE_VERSION, results }, null, 2)}\n`);
process.exit(results.some((r) => r.error || r.critical || r.errors) ? 1 : 0);

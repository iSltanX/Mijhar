#!/usr/bin/env node
// TEST-CTX-01 وTEST-CTX-02 (الشق e2e) وقياس PB-05 في المتصفحات الحقيقية على الحزمة المشحونة نفسها (dist/<target> من npm run build):
// سكربت المحتوى الحقيقي يركّب BUILTIN_MODULES ومنها e.builder، والصفحات تُخدم على https://github.com محليًا (مشغّلا MJ15 المشتركان).
//   1. العينة المرجعية (fixture-pr-context.html): نقر فعلي يفتح النافذة؛ والحزمة فيها المستودع والرابط والفرع والالتزام والعنوان والوصف
//      والتعليقات والفحوص ومقتطف الخطأ؛ ونص محدد في تعليق يُضاف مقتطفًا بمصدره.
//   2. قائمة الاختيار تتحكم فيما يدخل؛ وقسم «ما تعذّر جمعه أو اقتُطع لطوله» في الواجهة وفي الحزمة (المطوي و12 عنصرًا غير محمّل وقائمة
//      الفحوص 9 من 12 والمقتطع بعدد أسطره).
//   3. PB-05: من تبديل خيار حتى تحديث المعاينة، 30 تبديلًا والوسيط < 20ms. 4. «انسخ الحزمة» بنقر فعلي يعلن النجاح.
//   5. صفحة مشكلة وصفحة مهمة Actions حقيقيتان محفوظتان. 6. لا طلب إلى api.github.com، ولا طلب إلى github.com أثناء البناء والتبديل والنسخ.
// الاستعمال: node tests/modules/e/browser/builder-check.mjs [chrome edge brave firefox] [--out-dir evidence/T-6.1]
import fs from 'node:fs';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, derivedCopy, firefoxSession, sleep, waitUntil } from '../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.filter((a) => BROWSERS[a]);

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PAGES = {
  '/octo/demo/pull/4242': read('tests/modules/e/fixtures/fixture-pr-context.html'),
  '/salktbi902/etos/issues/1': read('fixtures/spikes/gh-issue-etos-1.html'),
  '/microsoft/vscode/actions/runs/39905618450/job/120256773911': read('fixtures/logs/gh-job-failed.html'),
};
const STATUS_FRAGMENT = read('tests/modules/d/fixtures/fixture-status-details.html');
const githubReply = (pathname) => {
  if (PAGES[pathname]) return { status: 200, type: 'text/html; charset=utf-8', body: PAGES[pathname] };
  if (/\/status-details$/.test(pathname)) return { status: 200, type: 'text/html; charset=utf-8', body: STATUS_FRAGMENT };
  return { status: 404, type: 'text/plain', body: 'not found' };
};
const apiReply = () => ({ status: 404, body: { message: 'Not Found' } });

const HOST = 'mijhar-host[data-mijhar-host="e.builder"]';
const R = `document.querySelector('${HOST}')?.shadowRoot`;
const preview = (d) => d.github(`return ${R}?.querySelector('[data-preview]')?.value ?? null;`);

async function scenario(d, checks, network) {
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 400)}`}`);
  };

  // 1. العينة المرجعية.
  await d.openGithub('https://github.com/octo/demo/pull/4242');
  const bar = await waitUntil(() => d.github(`return Boolean(${R}?.querySelector('[data-action="builder-toggle"]'));`), 15000);
  check('شريط حزمة السياق مركَّب في صفحة الطلب', bar, bar);
  const githubBefore = network.github.length;
  await d.clickShadow(HOST, '[data-action="builder-toggle"]');
  const text = await waitUntil(() => preview(d), 8000);
  const must = [
    '# حزمة سياق: feat: refresh the settings UI',
    '- المستودع: `octo/demo` — https://github.com/octo/demo',
    '- طلب الدمج #4242: https://github.com/octo/demo/pull/4242',
    '- الفرع: `feature/ui-refresh` ← `main`',
    '- التزام الرأس: `22c15d5f509f0a7076b74b3f0f48a740802103b4`',
    '> Refresh the settings UI and move the theme toggle into the header.',
    '## التعليقات المختارة (2 من 2)',
    '### reviewer-a — 2026-10-21T10:15:00Z',
    '- ✗ فاشل: `ci / lint (pull_request)` — إلزامي — Failing after 4m',
    '## مقتطف الخطأ',
    '## ما تعذّر جمعه أو اقتُطع لطوله',
  ];
  const missingLines = must.filter((m) => !String(text).includes(m));
  check('AC-E1: الحزمة فيها المستودع والرابط والفرع والالتزام والعنوان والوصف والتعليقات والفحوص ومقتطف الخطأ', text && missingLines.length === 0, missingLines);

  await d.github(`
    const body = document.querySelector('#issuecomment-1001 .js-comment-body');
    const range = document.createRange();
    range.selectNodeContents(body);
    const s = document.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    return true;
  `);
  const pending = await waitUntil(() => d.github(`return ${R}?.querySelector('[data-pending-selection]')?.textContent ?? null;`), 5000);
  await d.clickShadow(HOST, '[data-action="snippet-add"]');
  const withSnippet = await waitUntil(async () => {
    const t = await preview(d);
    return t?.includes('## مقتطفات الأدلة (1)') ? t : null;
  }, 5000);
  check('AC-E1: نص محدد في تعليق يُضاف مقتطفًا بمصدره ويدخل الحزمة', pending?.includes('تعليق reviewer-a') && withSnippet?.includes('### 1. من تعليق reviewer-a') && withSnippet.includes('unused import useMemo'), { pending });

  // 2. قائمة الاختيار والقسم الإلزامي.
  await d.clickShadow(HOST, 'input[data-item="checks"]');
  const off = await preview(d);
  await d.clickShadow(HOST, 'input[data-item="checks"]');
  const on = await preview(d);
  check('AC-E2: إلغاء «نتائج الفحوص» يُخرجها من الحزمة، وإعادته تعيدها', !off?.includes('## نتائج الفحوص') && on?.includes('## نتائج الفحوص'), { off: off?.includes('## نتائج الفحوص'), on: on?.includes('## نتائج الفحوص') });
  const gaps = await d.github(`return [...(${R}?.querySelectorAll('[data-gaps] li') ?? [])].map((li) => [li.getAttribute('data-gap-kind'), li.textContent]);`);
  const has = (kind, needle) => gaps?.some(([k, t]) => k === kind && t.includes(needle));
  const cut = /حُذف (\d+) سطرًا من (\d+)/.exec(gaps?.find(([k]) => k === 'truncated')?.[1] ?? '');
  const section = String(on).slice(String(on).indexOf('## ما تعذّر جمعه أو اقتُطع لطوله'));
  check('AC-E2: القسم في الواجهة يسرد المطوي وغير المحمّل والقائمة المطوية والمقتطع بعدد أسطره', has('collapsed', 'spam-bot') && has('not-loaded', '12 عنصرًا') && has('collapsed', 'قُرئ 9 من 12') && cut && Number(cut[2]) - Number(cut[1]) === 25, gaps);
  check('AC-E2: والقسم نفسه في الحزمة ببنوده', section.includes('spam-bot') && section.includes('12 عنصرًا') && section.includes('قُرئ 9 من 12') && cut && section.includes(cut[0]) && section.split('\n').filter((l) => l.startsWith('- **')).length === gaps.length, { lines: section.split('\n').filter((l) => l.startsWith('- **')).length, gaps: gaps?.length });

  // 3. PB-05.
  const pb = await d.github(`
    const root = ${R};
    const input = root.querySelector('input[data-item="checks"]');
    const area = root.querySelector('[data-preview]');
    const times = [];
    for (let i = 0; i < 30; i += 1) {
      const before = area.value;
      const t0 = performance.now();
      input.click();
      for (let k = 0; k < 2000 && area.value === before; k += 1) await Promise.resolve();
      while (area.value === before && performance.now() - t0 < 1000) await new Promise((r) => setTimeout(r, 0));
      times.push(performance.now() - t0);
    }
    const sorted = [...times].sort((a, b) => a - b);
    return { n: times.length, median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)], max: sorted[sorted.length - 1], chars: area.value.length };
  `);
  check(`PB-05: تحديث المعاينة عند التبديل < 20ms (الوسيط ${pb?.median?.toFixed?.(2)}ms، p95 ${pb?.p95?.toFixed?.(2)}ms، ${pb?.chars} حرفًا)`, pb && pb.median < 20, pb);

  // 4. النسخ بنقر فعلي.
  await d.clickShadow(HOST, '[data-action="builder-copy"]');
  const copied = await waitUntil(() => d.github(`return ${R}?.querySelector('[data-copy-state]')?.getAttribute('data-copy-state') ?? null;`), 5000);
  check('«انسخ الحزمة» بنقر فعلي يعلن النجاح (الحافظة في فعل المستخدم)', copied === 'copied', copied);
  const githubDuring = network.github.slice(githubBefore);
  check('لا طلب إلى github.com أثناء الجمع والتبديل والنسخ', githubDuring.length === 0, githubDuring);

  // 5. مشكلة ومهمة حقيقيتان.
  await d.openGithub('https://github.com/salktbi902/etos/issues/1');
  const issueBar = await waitUntil(() => d.github(`return Boolean(${R}?.querySelector('[data-action="builder-toggle"]'));`), 15000);
  if (issueBar) await d.clickShadow(HOST, '[data-action="builder-toggle"]');
  const issueText = await waitUntil(() => preview(d), 8000);
  check('صفحة مشكلة حقيقية: العنوان والوصف والتعليقات، بلا قسم فحوص', issueText?.includes('# حزمة سياق: Local Debug') && issueText.includes('## التعليقات المختارة') && !issueText.includes('## نتائج الفحوص'), issueText?.slice(0, 200));
  await d.openGithub('https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911');
  const jobBar = await waitUntil(() => d.github(`return Boolean(${R}?.querySelector('[data-action="builder-toggle"]'));`), 15000);
  if (jobBar) await d.clickShadow(HOST, '[data-action="builder-toggle"]');
  const jobText = await waitUntil(() => preview(d), 8000);
  check('صفحة مهمة Actions حقيقية: الخطوات ومقتطف الخطأ من التنبيهات', jobText?.includes('## مقتطف الخطأ') && jobText.includes('[failure]') && jobText.includes('- مهمة Actions: https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911'), jobText?.slice(0, 200));
}

async function run(key) {
  const target = BROWSERS[key].target;
  const extDir = derivedCopy(target);
  const checks = [];
  const result = { label: BROWSERS[key].label, checks };
  let session;
  try {
    const options = { extDir, githubReply, apiReply };
    session = key === 'firefox' ? await firefoxSession(options) : await chromiumSession(key, options);
    result.browserVersion = session.browserVersion;
    await scenario(session.d, checks, session.network);
    result.extensionErrors = await session.extensionErrors();
  } catch (error) {
    result.error = String(error?.stack ?? error);
  } finally {
    if (session) {
      result.network = { api: session.network.api, githubPaths: session.network.github, blockedExternalHosts: [...session.network.blocked].sort() };
      await session.close();
    }
    fs.rmSync(extDir, { recursive: true, force: true });
    await sleep(200);
  }
  return result;
}

const results = {};
const all = [];
for (const key of keys.length ? keys : ['chrome', 'edge', 'brave', 'firefox']) {
  console.log(`— ${BROWSERS[key].label}`);
  const r = await run(key);
  const add = (name, ok, detail) => {
    r.checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    if (!ok) console.log(`  ✗ ${name} — ${JSON.stringify(detail)?.slice(0, 400)}`);
  };
  add('اكتمل التشغيل بلا خطأ', !r.error, r.error?.split('\n').slice(0, 3).join(' | '));
  add('تدقيق الشبكة: صفر طلبات إلى api.github.com', (r.network?.api?.length ?? 1) === 0, r.network?.api);
  if (r.extensionErrors) add('لا أخطاء تشغيل ولا مانيفست للإضافة', r.extensionErrors.runtime.length === 0 && r.extensionErrors.manifest.length === 0, r.extensionErrors);
  results[key] = r;
  const bad = r.checks.filter((c) => !c.ok).length;
  console.log(`${r.label} ${r.browserVersion ?? ''}: ${r.checks.length - bad}/${r.checks.length}`);
  all.push(...r.checks);
}
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'browser-builder-check.json'), `${JSON.stringify(results, null, 2)}\n`);
}
console.log(`المجموع: ${all.filter((c) => c.ok).length}/${all.length}`);
if (all.some((c) => !c.ok)) process.exitCode = 1;

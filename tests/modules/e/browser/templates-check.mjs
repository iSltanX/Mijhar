#!/usr/bin/env node
// TEST-CTX-03 وTEST-CTX-04 (الشق e2e وتدقيق الشبكة) وTEST-PRIV-02 (الواجهة) في المتصفحات الحقيقية على الحزمة المشحونة نفسها (dist/<target> من npm run build):
// سكربت المحتوى الحقيقي يركّب e.builder، والصفحات تُخدم على https://github.com محليًا (مشغّلا MJ15 المشتركان).
//   T-6.2: 1. القوالب الأربعة بنقر فعلي: عنوان الحزمة والأقسام المعرّفة بترتيبها على العينة المرجعية. 2. تعديل المعاينة بإدراج نص في حقلها (execCommand
//   insertText: حدث input فعلي)، فلا يستبدله تغيير القالب أو الاختيار، و«استبدلها بالنص المولَّد» يعيده. 3. «انسخ» بنقر فعلي يعلن النجاح. 4. «نزّل .md» بنقر فعلي:
//   عنصر a[download] برابط blob: باسم المصدر والقالب ومحتواه هو نص المعاينة المعدَّل بعينه. 5. تدقيق الشبكة: صفر طلبات جديدة إلى github.com وapi.github.com وأي مضيف
//   آخر من فتح النافذة حتى آخر نقرة (البناء والمعاينة والتبديل والتعديل والنسخ والتنزيل). 6. القوالب على صفحة مشكلة وصفحة مهمة Actions حقيقيتين محفوظتين.
//   T-6.3: 7. اللافتة وإخلاء المسؤولية ظاهران (أبعاد غير صفرية). 8. سجل الاختبار المرجعي (500 سطر برمز ghp_ مختلَق) يُدرج في المعاينة: يُرصد ويُظلَّل بسطره
//   (التظليل بلون وخط تحتي) والنص باقٍ كما هو. 9. رموز وهمية إضافية (Bearer وAKIA) تُرصد فورًا، و«حدّد في المعاينة» يحدد الموضع بعينه.
// الاستعمال: node tests/modules/e/browser/templates-check.mjs [chrome edge brave firefox] [--out-root evidence]
//   يكتب evidence/T-6.2/browser-templates-check.{json,txt} وevidence/T-6.3/browser-privacy-check.{json,txt}.
import fs from 'node:fs';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, derivedCopy, firefoxSession, sleep, waitUntil } from '../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-root');
const outRoot = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.filter((a) => BROWSERS[a]);

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const PAGES = {
  '/octo/demo/pull/4242': read('tests/modules/e/fixtures/fixture-pr-context.html'),
  '/salktbi902/etos/issues/1': read('fixtures/spikes/gh-issue-etos-1.html'),
  '/microsoft/vscode/actions/runs/39905618450/job/120256773911': read('fixtures/logs/gh-job-failed.html'),
};
const STATUS_FRAGMENT = read('tests/modules/d/fixtures/fixture-status-details.html');
const SECRETS_LOG = read('fixtures/logs/fixture-action-logs-with-secrets.txt');
const githubReply = (pathname) => {
  if (PAGES[pathname]) return { status: 200, type: 'text/html; charset=utf-8', body: PAGES[pathname] };
  if (/\/status-details$/.test(pathname)) return { status: 200, type: 'text/html; charset=utf-8', body: STATUS_FRAGMENT };
  return { status: 404, type: 'text/plain', body: 'not found' };
};
const apiReply = () => ({ status: 404, body: { message: 'Not Found' } });

// رموز وهمية تُركَّب وقت التشغيل.
const TOKEN = ['ghp', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('_');
const BEARER = `Bearer ${['eyJhbGciOiJIUzI1NiJ9', 'fakepayload', 'signature123'].join('.')}`;
const AWS = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');

const HOST = 'mijhar-host[data-mijhar-host="e.builder"]';
const R = `document.querySelector('${HOST}')?.shadowRoot`;
const preview = (d) => d.github(`return ${R}?.querySelector('[data-preview]')?.value ?? null;`);
const attr = (d, sel, name) => d.github(`return ${R}?.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(name)}) ?? null;`);
const text = (d, sel) => d.github(`return ${R}?.querySelector(${JSON.stringify(sel)})?.textContent ?? null;`);

/** يدرج نصًا في حقل المعاينة بإدراج فعلي (حدث input حقيقي)، في آخره أو بدل كله؛ والبديل تعيين القيمة وإرسال الحدث. */
const insert = (d, value, { replace = false } = {}) =>
  d.github(`
    const ta = ${R}.querySelector('[data-preview]');
    ta.focus();
    if (${replace}) ta.select(); else ta.setSelectionRange(ta.value.length, ta.value.length);
    const ok = document.execCommand('insertText', false, ${JSON.stringify(value)});
    if (!ok || !ta.value.includes(${JSON.stringify(value.slice(0, 40))})) {
      ta.value = ${replace} ? ${JSON.stringify(value)} : ta.value + ${JSON.stringify(value)};
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return 'fallback';
    }
    return 'execCommand';
  `);

const TEMPLATES = [
  { id: 'diagnose', prefix: 'تشخيص مشكلة', label: 'تشخيص مشكلة', english: 'Bug / CI Failure Diagnosis', headings: ['المطلوب', 'المصدر', 'وصف المشكلة', 'الفحوص ونتائجها', 'مقتطف الخطأ', 'التعليقات ذات الصلة', 'مقتطفات الأدلة'] },
  { id: 'review', prefix: 'مراجعة تغيير', label: 'مراجعة تغيير', english: 'Code / PR Review', headings: ['المطلوب', 'نقاط المراجعة', 'المصدر', 'وصف التغيير', 'نتائج الفحوص', 'مقتطف الخطأ', 'ملاحظات المراجعين', 'مقتطفات الأدلة'] },
  { id: 'handoff', prefix: 'تسليم مهمة', label: 'تسليم مهمة', english: 'Task Handoff', headings: ['المطلوب', 'المهمة والمصدر', 'الوصف', 'الحالة الحالية للفحوص', 'مقتطف الخطأ', 'آخر ما قيل', 'الأدلة', 'ما أُنجز', 'ما تبقّى', 'قرارات وتنبيهات'] },
  { id: 'resume', prefix: 'استكمال عمل', label: 'استكمال عمل', english: 'Resume Work Summary', headings: ['المطلوب', 'أين توقفنا', 'الوصف', 'حال الفحوص', 'مقتطف الخطأ', 'آخر التعليقات', 'مقتطفات الأدلة', 'الخطوة التالية'] },
];
const GAPS = 'ما تعذّر جمعه أو اقتُطع لطوله';
const headingsOf = (t) => String(t).split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3).replace(/ \(.*\)$/, ''));

async function scenario(d, checks, network) {
  const check = (task, name, ok, detail) => {
    checks.push({ task, name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} [${task}] ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 400)}`}`);
  };

  await d.openGithub('https://github.com/octo/demo/pull/4242');
  const bar = await waitUntil(() => d.github(`return Boolean(${R}?.querySelector('[data-action="builder-toggle"]'));`), 15000);
  check('T-6.2', 'شريط حزمة السياق مركَّب في صفحة الطلب', bar, bar);
  await sleep(1500); // يستقر ما تطلبه وحدات أخرى عند التحميل قبل خط أساس الشبكة.
  const base = { github: network.github.length, api: network.api.length, blocked: [...network.blocked].sort().join(',') };

  await d.clickShadow(HOST, '[data-action="builder-toggle"]');
  const generic = await waitUntil(() => preview(d), 8000);
  const radios = await d.github(`return [...${R}.querySelectorAll('input[name="mj-e-template"]')].map((r) => r.getAttribute('data-template'));`);
  check('T-6.2', 'محدّد القوالب: حزمة عامة ثم القوالب الأربعة، والافتراضي العامة', JSON.stringify(radios) === JSON.stringify(['none', 'diagnose', 'review', 'handoff', 'resume']) && String(generic).startsWith('# حزمة سياق: feat: refresh the settings UI'), { radios, head: String(generic).slice(0, 60) });

  // 1. القوالب الأربعة بنقر فعلي.
  for (const t of TEMPLATES) {
    await d.clickShadow(HOST, `input[data-template="${t.id}"]`);
    const body = await waitUntil(async () => {
      const v = await preview(d);
      return String(v).startsWith(`# ${t.prefix}:`) ? v : null;
    }, 5000);
    const found = headingsOf(body);
    const expected = [...t.headings, GAPS];
    check('T-6.2', `AC-E3: قالب «${t.label}» يولّد أقسامه المعرّفة بترتيبها وقسمه الإلزامي آخرها`, body && JSON.stringify(found) === JSON.stringify(expected) && body.includes(`قالب: ${t.label} (${t.english})`), { found, expected });
    const must = ['- المستودع: `octo/demo` — https://github.com/octo/demo', '- الفرع: `feature/ui-refresh` ← `main`', '- التزام الرأس: `22c15d5f509f0a7076b74b3f0f48a740802103b4`', '- ✗ فاشل: `ci / lint (pull_request)` — إلزامي — Failing after 4m', '### reviewer-a — 2026-10-21T10:15:00Z'];
    const missing = must.filter((m) => !String(body).includes(m));
    check('T-6.2', `AC-E3: قالب «${t.label}» بمحتوى الصفحة المرجعية (المستودع والفرع والالتزام والفحوص والتعليقات)`, missing.length === 0, missing);
  }

  // 2. التعديل اليدوي.
  await d.clickShadow(HOST, 'input[data-template="handoff"]');
  const before = await waitUntil(async () => {
    const v = await preview(d);
    return String(v).startsWith('# تسليم مهمة:') ? v : null;
  }, 5000);
  const MARK = 'سطر كتبه المستخدم بيده قبل النسخ.';
  const how = await insert(d, `\n${MARK}`);
  const edited = await waitUntil(async () => {
    const v = await preview(d);
    return String(v).endsWith(MARK) ? v : null;
  }, 5000);
  const flagged = await d.github(`return Boolean(${R}.querySelector('[data-edited]'));`);
  check('T-6.2', `AC-E4: المعاينة قابلة للتعديل اليدوي (${how}) ويُعلن أنها معدَّلة`, edited && edited.startsWith(before) && flagged, { how, flagged });
  await d.clickShadow(HOST, 'input[data-template="resume"]');
  await d.clickShadow(HOST, 'input[data-item="checks"]');
  const kept = await preview(d);
  check('T-6.2', 'AC-E4: تغيير القالب والاختيار لا يستبدل النص المعدَّل', kept === edited, { changed: kept !== edited });
  await d.clickShadow(HOST, 'input[data-item="checks"]');
  await d.clickShadow(HOST, '[data-action="builder-regenerate"]');
  const regenerated = await waitUntil(async () => {
    const v = await preview(d);
    return String(v).startsWith('# استكمال عمل:') ? v : null;
  }, 5000);
  check('T-6.2', 'AC-E4: «استبدلها بالنص المولَّد» يعيد المولَّد (قالب الاستكمال) ويزيل التنبيه', regenerated && !regenerated.includes(MARK) && !(await d.github(`return Boolean(${R}.querySelector('[data-edited]'));`)), regenerated?.slice(0, 60));

  // 3. النسخ والتنزيل لنص معدَّل.
  await d.clickShadow(HOST, 'input[data-template="review"]');
  await waitUntil(async () => (String(await preview(d)).startsWith('# مراجعة تغيير:') ? true : null), 5000);
  const MARK2 = 'ملاحظة المراجع: تحقق من الحالة الطرفية.';
  await insert(d, `\n${MARK2}`);
  const final = await waitUntil(async () => {
    const v = await preview(d);
    return String(v).endsWith(MARK2) ? v : null;
  }, 5000);
  await d.clickShadow(HOST, '[data-action="builder-copy"]');
  const copied = await waitUntil(() => attr(d, '[data-copy-state]', 'data-copy-state'), 5000);
  check('T-6.2', 'AC-E4: «انسخ» بنقر فعلي على نص معدَّل يعلن النجاح (الحافظة في فعل المستخدم)', copied === 'copied', copied);
  // مسبار نقرة التنزيل: في الطور الالتقاطي من النافذة، قبل أي معالج للصفحة أو للوحدة.
  await d.github(`
    window.__mjDownload = null;
    window.addEventListener('click', (e) => {
      const a = e.composedPath()[0];
      if (!(a instanceof HTMLAnchorElement) || !a.hasAttribute('download')) return;
      window.__mjDownload = { name: a.getAttribute('download'), protocol: new URL(a.href).protocol, hidden: a.hidden, text: fetch(a.href).then((r) => r.text()) };
    }, true);
    return true;
  `);
  await d.clickShadow(HOST, '[data-action="builder-download"]');
  const dl = await waitUntil(
    () =>
      d.github(`
        const x = window.__mjDownload;
        if (!x) return null;
        return Promise.race([x.text.then((text) => ({ name: x.name, protocol: x.protocol, hidden: x.hidden, text })), new Promise((r) => setTimeout(() => r({ name: x.name, protocol: x.protocol, hidden: x.hidden, text: null }), 4000))]);
      `),
    8000,
  );
  const dlNote = await attr(d, '[data-download-state]', 'data-download-state');
  check('T-6.2', 'AC-E4: «نزّل كملف .md» بنقر فعلي: a[download] برابط blob: باسم المصدر والقالب', dl?.name === 'mijhar-pr-octo-demo-4242-review.md' && dl.protocol === 'blob:' && dlNote === 'downloaded', { dl: dl && { ...dl, text: undefined }, dlNote });
  check('T-6.2', 'AC-E4: ومحتوى الملف هو نص المعاينة المعدَّل بعينه', dl?.text === final && String(dl?.text).endsWith(MARK2), { equal: dl?.text === final, got: dl?.text === null ? 'تعذّرت قراءة blob من الصفحة' : 'مختلف' });

  // 4. تدقيق الشبكة منذ فتح النافذة.
  const during = { github: network.github.slice(base.github), api: network.api.slice(base.api), blocked: [...network.blocked].sort().join(',') !== base.blocked };
  check('T-6.2', 'AC-E4 (تدقيق الشبكة): صفر طلبات إلى github.com وapi.github.com وأي مضيف آخر أثناء بناء الملخص ومعاينته وتبديل قوالبه وتعديله ونسخه وتنزيله', during.github.length === 0 && during.api.length === 0 && !during.blocked, during);

  // 5. صفحتا مشكلة ومهمة.
  await d.openGithub('https://github.com/salktbi902/etos/issues/1');
  const issueBar = await waitUntil(() => d.github(`return Boolean(${R}?.querySelector('[data-action="builder-toggle"]'));`), 15000);
  if (issueBar) await d.clickShadow(HOST, '[data-action="builder-toggle"]');
  await waitUntil(() => preview(d), 8000);
  await d.clickShadow(HOST, 'input[data-template="review"]');
  const issueText = await waitUntil(async () => (String(await preview(d)).startsWith('# مراجعة تغيير:') ? await preview(d) : null), 5000);
  check('T-6.2', 'صفحة مشكلة حقيقية: قالب المراجعة بأقسامه، ولا فرع ولا فحوص (سطر «لم يُدرج»)', issueText && JSON.stringify(headingsOf(issueText)) === JSON.stringify([...TEMPLATES[1].headings, GAPS]) && issueText.includes('- المشكلة #1: https://github.com/salktbi902/etos/issues/1') && !issueText.includes('- الفرع:') && issueText.includes('- لم يُدرج: غير مختار أو غير متاح في هذه الصفحة.'), issueText?.slice(0, 200));
  await d.openGithub('https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911');
  const jobBar = await waitUntil(() => d.github(`return Boolean(${R}?.querySelector('[data-action="builder-toggle"]'));`), 15000);
  if (jobBar) await d.clickShadow(HOST, '[data-action="builder-toggle"]');
  await waitUntil(() => preview(d), 8000);
  await d.clickShadow(HOST, 'input[data-template="diagnose"]');
  const jobText = await waitUntil(async () => (String(await preview(d)).startsWith('# تشخيص مشكلة:') ? await preview(d) : null), 5000);
  check('T-6.2', 'صفحة مهمة Actions حقيقية: قالب التشخيص بأقسامه ومقتطف الخطأ من التنبيهات', jobText && JSON.stringify(headingsOf(jobText)) === JSON.stringify([...TEMPLATES[0].headings, GAPS]) && jobText.includes('[failure]') && jobText.includes('- مهمة Actions: https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911'), jobText?.slice(0, 200));

  // ———— T-6.3 ————
  await d.openGithub('https://github.com/octo/demo/pull/4242');
  await waitUntil(() => d.github(`return Boolean(${R}?.querySelector('[data-action="builder-toggle"]'));`), 15000);
  await d.clickShadow(HOST, '[data-action="builder-toggle"]');
  await waitUntil(() => preview(d), 8000);
  const box = await d.github(`
    const q = (s) => ${R}.querySelector(s);
    const size = (el) => { const r = el?.getBoundingClientRect(); return r ? [Math.round(r.width), Math.round(r.height)] : null; };
    return { banner: q('[data-privacy-banner]')?.textContent ?? null, disclaimer: q('[data-privacy-disclaimer]')?.textContent ?? null, bannerSize: size(q('[data-privacy-banner]')), disclaimerSize: size(q('[data-privacy-disclaimer]')), none: q('[data-privacy-none]')?.textContent ?? null, count: q('[data-privacy]')?.getAttribute('data-findings') };
  `);
  check('T-6.3', 'AC-E5: اللافتة ظاهرة دائمًا (أبعاد غير صفرية) بنصها: قد تحتوي السجلات على بيانات خاصة', box.banner?.includes('قد تحتوي السجلات والتعليقات على بيانات خاصة') && box.bannerSize?.[0] > 0 && box.bannerSize?.[1] > 0, box);
  check('T-6.3', 'AC-E5: إخلاء المسؤولية ظاهر: لا يضمن كشف كل الأسرار ولا يزيل أي نص والمراجعة البشرية لازمة', box.disclaimer?.includes('لا يضمن كشف كل الأسرار') && box.disclaimer.includes('لا يزيل أي نص') && box.disclaimer.includes('المراجعة البشرية للمعاينة لازمة دائمًا') && box.disclaimerSize?.[1] > 0, box);
  check('T-6.3', 'AC-E5: بلا أنماط مشبوهة: صفر مرصودات وعبارة «لا يعني خلو المعاينة من الأسرار»', box.count === '0' && box.none?.includes('هذا لا يعني خلو المعاينة من الأسرار'), box);

  // سجل الاختبار المرجعي بكامله في المعاينة.
  await insert(d, SECRETS_LOG, { replace: true });
  const logged = await waitUntil(async () => ((await attr(d, '[data-privacy]', 'data-findings')) === '1' ? true : null), 8000);
  const row = await d.github(`
    const li = ${R}.querySelector('[data-privacy-found] li');
    const mark = li?.querySelector('mark');
    const cs = mark ? getComputedStyle(mark) : null;
    return { id: li?.getAttribute('data-finding'), line: li?.getAttribute('data-line'), mark: mark?.textContent ?? null, underline: cs?.textDecorationLine ?? null, background: cs?.backgroundColor ?? null, previewLen: ${R}.querySelector('[data-preview]').value.length, hasToken: ${R}.querySelector('[data-preview]').value.includes(li?.querySelector('mark')?.textContent ?? '\\u0000') };
  `);
  check('T-6.3', 'AC-E5: على سجل الاختبار المرجعي (500 سطر): يُرصد رمز ghp_ المختلَق وحده في سطره 457 ويُظلَّل', logged && row.id === 'github-token' && row.line === '457' && /^ghp_[A-Za-z0-9]{36}$/.test(row.mark ?? ''), row);
  check('T-6.3', 'AC-E5: التظليل بلون وخط تحتي معًا، ولم يُزَل شيء (الرمز باقٍ في المعاينة وطولها طول السجل)', row.underline?.includes('underline') && row.background && row.background !== 'rgba(0, 0, 0, 0)' && row.hasToken && row.previewLen === SECRETS_LOG.length, row);

  // رموز وهمية مضافة.
  await insert(d, `\nAuthorization: ${BEARER}\naws_access_key_id=${AWS}\n`);
  const three = await waitUntil(async () => ((await attr(d, '[data-privacy]', 'data-findings')) === '3' ? true : null), 5000);
  const found = await d.github(`return [...${R}.querySelectorAll('[data-privacy-found] li')].map((li) => [li.getAttribute('data-finding'), li.querySelector('mark')?.textContent]);`);
  check('T-6.3', 'AC-E5: Bearer وAKIA المضافان يُرصدان فورًا مع ghp_ (ثلاثة مرصودات بنصوصها)', three && JSON.stringify(found) === JSON.stringify([['github-token', found?.[0]?.[1]], ['bearer', BEARER], ['aws-access-key', AWS]]), found);
  await d.clickShadow(HOST, 'li[data-finding="aws-access-key"] [data-action="finding-select"]');
  const selected = await d.github(`const ta = ${R}.querySelector('[data-preview]'); return ta.value.slice(ta.selectionStart, ta.selectionEnd);`);
  check('T-6.3', '«حدّد في المعاينة» يحدد الموضع المرصود بعينه في حقل المعاينة', selected === AWS, selected);
  await d.clickShadow(HOST, '[data-action="builder-copy"]');
  const note = await waitUntil(() => text(d, '[data-copy-state]'), 5000);
  check('T-6.3', 'النسخ مع مرصودات يعلن عددها وأن شيئًا لم يُحذف', note?.includes('وفيها 3 من الأنماط المشبوهة لم يُحذف منها شيء'), note);
  await insert(d, 'سجل نظيف بلا رموز.', { replace: true });
  const clean = await waitUntil(async () => ((await attr(d, '[data-privacy]', 'data-findings')) === '0' ? true : null), 5000);
  check('T-6.3', 'حذف الرموز يدويًا يُسقط المرصودات (الفحص على النص الحالي)', clean && !(await d.github(`return Boolean(${R}.querySelector('[data-privacy-found]'));`)), clean);
  check('T-6.3', 'لا طلب شبكة من الفاحص ولا من إدراج السجل', network.api.slice(base.api).length === 0, network.api.slice(base.api));
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
  const add = (task, name, ok, detail) => {
    r.checks.push({ task, name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    if (!ok) console.log(`  ✗ [${task}] ${name} — ${JSON.stringify(detail)?.slice(0, 400)}`);
  };
  add('T-6.2', 'اكتمل التشغيل بلا خطأ', !r.error, r.error?.split('\n').slice(0, 3).join(' | '));
  add('T-6.2', 'تدقيق الشبكة الكلي: صفر طلبات إلى api.github.com طوال التشغيل', (r.network?.api?.length ?? 1) === 0, r.network?.api);
  if (r.extensionErrors) add('T-6.2', 'لا أخطاء تشغيل ولا مانيفست للإضافة', r.extensionErrors.runtime.length === 0 && r.extensionErrors.manifest.length === 0, r.extensionErrors);
  results[key] = r;
  const bad = r.checks.filter((c) => !c.ok).length;
  console.log(`${r.label} ${r.browserVersion ?? ''}: ${r.checks.length - bad}/${r.checks.length}`);
  all.push(...r.checks);
}
if (outRoot) {
  for (const [task, file] of [['T-6.2', 'browser-templates-check'], ['T-6.3', 'browser-privacy-check']]) {
    const dir = path.join(outRoot, task);
    fs.mkdirSync(dir, { recursive: true });
    const subset = Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { label: r.label, browserVersion: r.browserVersion, checks: r.checks.filter((c) => c.task === task), ...(task === 'T-6.2' ? { error: r.error, extensionErrors: r.extensionErrors, network: r.network } : {}) }]));
    fs.writeFileSync(path.join(dir, `${file}.json`), `${JSON.stringify(subset, null, 2)}\n`);
    const lines = [];
    for (const [k, r] of Object.entries(subset)) {
      const ok = r.checks.filter((c) => c.ok).length;
      lines.push(`${r.label} ${r.browserVersion ?? ''}: ${ok}/${r.checks.length}`);
      for (const c of r.checks) lines.push(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.ok ? '' : ` — ${JSON.stringify(c.detail)?.slice(0, 300)}`}`);
    }
    fs.writeFileSync(path.join(dir, `${file}.txt`), `${lines.join('\n')}\n`);
  }
}
console.log(`المجموع: ${all.filter((c) => c.ok).length}/${all.length}`);
if (all.some((c) => !c.ok)) process.exitCode = 1;

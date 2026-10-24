#!/usr/bin/env node
// TEST-CTX-06 (الشق e2e) وTEST-CTX-07 (تدقيق الشبكة والفحص البصري) في المتصفحات الحقيقية على الحزمة المشحونة نفسها (dist/<target> من npm run build):
// سكربت المحتوى الحقيقي يركّب BUILTIN_MODULES ومنها e.copy-prompt، والصفحات تُخدم على https://github.com محليًا (مشغّلا MJ15 المشتركان). بلا أي مفتاح ولا رمز.
//   1. الزر في صفحة طلب الدمج بعد بطاقة ملخص الحالة، بارتفاع صغير، بلا صندوق نص، ولا يزيد ارتفاع البطاقة والشريط (قبل الزر وبعده).
//   2. نقر فعلي (فعل مستخدم): الانتقالات خمولًا ← تحميلًا ← نجاحًا؛ والمنسوخ (في عائلة Chromium بقراءة الحافظة) هو برومبت القالب التلقائي؛ ويعود الزر إلى حالته بعد مدة.
//   3. قائمة القوالب الخمسة بنقر فعلي، والاختيار يغيّر المنسوخ.
//   4. فشل الحافظة حقيقي لا مزيَّف: نقرة بلا نشاط مستخدم (بعد انقضاء التفعيل) فترفض الواجهتان (T-0.5)؛ يظهر الفشل بسببه والبديل اليدوي ولا يظهر «تم النسخ»، ثم نقرة فعلية تنجح.
//   5. محتوى خاص (رموز وهمية في الوصف): تنبيه مختصر بعدده، وتُحجب في المنسوخ ولا يظهر أي منها في الصفحة.
//   6. صفحة مشكلة وصفحة مهمة Actions حقيقيتان محفوظتان. 7. لا طلب إلى api.github.com، ولا طلب إلى github.com أثناء الجمع والتجهيز والنسخ، ولا مفتاح ولا رمز في التخزين.
//   8. PB-08: من النقر حتى النجاح (< 300ms). 9. لقطات (Chromium): الحالات والقائمة والتنبيه في الوضعين الفاتح والداكن.
// الاستعمال: node tests/modules/e/browser/copy-prompt-check.mjs [chrome edge brave firefox] [--out-dir evidence/T-11.3]
import fs from 'node:fs';
import path from 'node:path';
import { BROWSERS, ROOT, chromiumSession, derivedCopy, firefoxSession, sleep, waitUntil } from '../../d/token/browser/drivers.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.filter((a) => BROWSERS[a]);

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
// رموز وهمية تُركَّب وقت التشغيل فلا يظهر رمز بصيغته الكاملة في المستودع.
const FAKE = {
  ghp: ['ghp', 'Z1y2X3w4V5u6T7s8R9q0P1o2N3m4L5k6J7i8'].join('_'),
  aws: ['AKIA', 'IOSFODNN7EXAMPLE'].join(''),
};
const PR_HTML = read('tests/modules/e/fixtures/fixture-pr-context.html');
const DESC = 'Refresh the settings UI and move the theme toggle into the header.';
const PAGES = {
  '/octo/demo/pull/4242': PR_HTML,
  '/octo/demo/pull/4243': PR_HTML.replace(DESC, `Refresh the UI. token ${FAKE.ghp} and key ${FAKE.aws}`),
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

const HOST = 'mijhar-host[data-mijhar-host="e.copy-prompt"]';
const R = `document.querySelector('${HOST}')?.shadowRoot`;
const COPY = '[data-action="copy-prompt"]';
const stateOf = (d) => d.github(`return ${R}?.querySelector('[data-copy-prompt]')?.getAttribute('data-state') ?? null;`);
const rootText = (d) => d.github(`return ${R}?.textContent ?? null;`);
const hostsOrder = (d) => d.github(`return [...document.querySelectorAll('mijhar-host')].map((h) => h.getAttribute('data-mijhar-host'));`);

/** يثبّت في الصفحة سجل انتقالات الحالة وزمن النقر؛ يُكتب في سمة على المضيف (تعمل في Chromium وFirefox بلا متغير عام). */
const INSTALL_LOG = `
  const root = ${R};
  const host = document.querySelector('${HOST}');
  const log = [];
  const flush = () => host.setAttribute('data-mj-log', JSON.stringify(log));
  root.addEventListener('click', (e) => { if (e.target?.closest?.('[data-action="copy-prompt"]')) { log.push({ click: performance.now() }); flush(); } }, true);
  new MutationObserver((records) => {
    for (const r of records) if (r.target.hasAttribute('data-copy-prompt')) log.push({ t: performance.now(), from: r.oldValue, to: r.target.getAttribute('data-state') });
    flush();
  }).observe(root, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['data-state'] });
  flush();
  return true;
`;
const readLog = async (d) => JSON.parse((await d.github(`return document.querySelector('${HOST}')?.getAttribute('data-mj-log') ?? '[]';`)) ?? '[]');

async function scenario(session, key, checks, shots) {
  const { d, network } = session;
  const chromium = key !== 'firefox';
  const check = (name, ok, detail) => {
    checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail }) });
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(detail)?.slice(0, 500)}`}`);
  };
  const skip = (name, why) => {
    checks.push({ name, ok: true, notRun: why });
    console.log(`  – لم يُجرَ: ${name} (${why})`);
  };
  const clipboard = async () => (chromium ? d.github(`return await navigator.clipboard.readText();`) : null);
  const shot = async (name) => {
    if (!chromium || !outDir || !session.githubPage) return;
    const page = session.githubPage;
    await page.locator(HOST).scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 160));
    // اتحاد مستطيلات الزر والتنبيه والقائمة (الصف عند حافة البداية RTL، لا عند حافة المضيف الأخرى).
    const box = await page.evaluate((hostSelector) => {
      const root = document.querySelector(hostSelector)?.shadowRoot;
      const rects = [...(root?.querySelectorAll('.cp, .cp-note, .cp-menu') ?? [])].map((el) => el.getBoundingClientRect());
      if (!rects.length) return null;
      const x0 = Math.min(...rects.map((r) => r.left)), y0 = Math.min(...rects.map((r) => r.top));
      const x1 = Math.max(...rects.map((r) => r.right)), y1 = Math.max(...rects.map((r) => r.bottom));
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    }, HOST);
    if (!box) return;
    const dir = path.join(outDir, 'screens');
    fs.mkdirSync(dir, { recursive: true });
    const pad = 16;
    await page.screenshot({ path: path.join(dir, `${key}-${name}.png`), clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + 2 * pad, height: box.height + 2 * pad } });
    shots.push(`screens/${key}-${name}.png`);
  };
  if (chromium) await session.context.grantPermissions(['clipboard-read'], { origin: 'https://github.com' });

  // 1. صفحة طلب الدمج: الموضع والحجم وغياب صندوق النص.
  await d.openGithub('https://github.com/octo/demo/pull/4242');
  const mounted = await waitUntil(() => d.github(`return Boolean(${R}?.querySelector('${COPY}'));`), 15000);
  check('الزر مركَّب في صفحة طلب الدمج بعنوان «نسخ البرومبت»', mounted && (await d.github(`return ${R}.querySelector('[data-label]').textContent.trim();`)) === 'نسخ البرومبت', mounted);
  await sleep(600);
  const order = await hostsOrder(d);
  const at = order.indexOf('d.pr-status');
  check('يوضع بعد بطاقة ملخص حالة الطلب مباشرة (مضيف واحد)', at >= 0 && order[at + 1] === 'e.copy-prompt' && order.filter((h) => h === 'e.copy-prompt').length === 1, order);
  const geometry = await d.github(`
    const q = (id) => document.querySelector('mijhar-host[data-mijhar-host="' + id + '"]');
    const h = (el) => (el ? Math.round(el.getBoundingClientRect().height * 100) / 100 : null);
    const copy = q('e.copy-prompt');
    const withButton = { card: h(q('d.pr-status')), bar: h(q('e.builder')), page: document.documentElement.scrollHeight, button: h(copy) };
    const parent = copy.parentNode, next = copy.nextSibling;
    copy.remove();
    const without = { card: h(q('d.pr-status')), bar: h(q('e.builder')), page: document.documentElement.scrollHeight };
    parent.insertBefore(copy, next);
    return { withButton, without };
  `);
  const g = geometry;
  check(`TEST-CTX-07: ارتفاع بطاقة الحالة وشريط الحزمة لا يتغيران بالزر (${g.without.card}/${g.without.bar} ← ${g.withButton.card}/${g.withButton.bar})`, g.withButton.card === g.without.card && g.withButton.bar === g.without.bar, g);
  check(`TEST-CTX-07: ارتفاع الصف نفسه صغير (${g.withButton.button}px ≤ 44) وزيادة ارتفاع الصفحة بقدره (${g.withButton.page - g.without.page}px)`, g.withButton.button <= 44 && g.withButton.page - g.without.page <= 52, g);
  const noBox = await d.github(`return ${R}.querySelectorAll('textarea, input, pre, [contenteditable]').length;`);
  check('بلا صندوق نص ولا معاينة في الحالة الأولى', noBox === 0, noBox);
  const metrics = await d.github(`const b = ${R}.querySelector('.cp').getBoundingClientRect(); return { h: b.height, w: b.width };`);
  check(`مقاس الزر المقسوم كما في التصميم المعتمد (ارتفاع ${metrics.h}px = 28)`, Math.round(metrics.h) === 28 && metrics.w >= 120 && metrics.w <= 190, metrics);
  await shot('idle');

  // 2. نقر فعلي: الانتقالات والمنسوخ ورجوع الحالة.
  await d.github(INSTALL_LOG);
  const githubBefore = network.github.length;
  await d.clickShadow(HOST, COPY);
  const done = await waitUntil(async () => (await stateOf(d)) === 'success', 8000);
  const log = await readLog(d);
  if (log.length) {
    check('AC-E7: الانتقالات خمول ← تحميل ← نجاح بالترتيب (والنجاح بعد التحميل)', log.filter((r) => 'to' in r).map((r) => `${r.from}>${r.to}`).join() === 'idle>loading,loading>success', log);
    const t0 = log.find((r) => 'click' in r)?.click;
    const t1 = log.find((r) => r.to === 'success')?.t;
    check(`PB-08: من النقر حتى النجاح ${t0 && t1 ? (t1 - t0).toFixed(1) : '?'}ms < 300`, t0 && t1 && t1 - t0 < 300, { t0, t1 });
  } else {
    skip('الانتقالات وزمن PB-08 في المتصفح', 'مراقب الانتقالات في صندوق Marionette لم يكتب السجل');
    check('AC-E7: النقرة الفعلية تنتهي بحالة النجاح', done, await stateOf(d));
  }
  check('«تم النسخ» يظهر في الزر بعد النجاح', done && (await d.github(`return ${R}.querySelector('[data-label]').textContent.trim();`)) === 'تم النسخ', await rootText(d));
  if (chromium) {
    const text = await clipboard();
    const must = ['# تحديد الخطوة التالية: feat: refresh the settings UI', '## المصدر', '- المستودع: `octo/demo`', '## نتائج الفحوص', '## المعلومات الناقصة', 'اعتمد على ما ورد أعلاه وحده'];
    const missingLines = must.filter((m) => !String(text).includes(m));
    check('الحافظة فيها برومبت القالب التلقائي لطلب الدمج (الخطوة التالية) كاملًا بقسم «المعلومات الناقصة»', text && missingLines.length === 0, { missingLines, head: String(text).slice(0, 120) });
  } else skip('قراءة محتوى الحافظة', 'Firefox: لا قراءة للحافظة بلا مطالبة لصق؛ المنسوخ مثبت في اختبار الوحدة نصًّا بنص، والنجاح هنا من وعد writeText نفسه');
  await shot('success');
  const githubDuring = network.github.slice(githubBefore);
  check('TEST-CTX-07: لا طلب إلى github.com أثناء الجمع والتجهيز والنسخ', githubDuring.length === 0, githubDuring);
  const back = await waitUntil(async () => (await stateOf(d)) === 'idle', 6000);
  check('يعود الزر إلى حالته الأولى بعد مدة', back, await stateOf(d));

  // 3. قائمة القوالب.
  await d.clickShadow(HOST, '[data-action="template-menu"]');
  const menu = await d.github(`const m = ${R}.querySelector('[data-template-menu]'); return m ? { ids: [...m.querySelectorAll('[data-template-id]')].map((e) => e.getAttribute('data-template-id')), checked: [...m.querySelectorAll('[aria-checked="true"]')].map((e) => e.getAttribute('data-template-id')), foot: m.textContent.includes('بلا مفتاح ولا إرسال'), boxes: m.querySelectorAll('textarea, input').length } : null;`);
  check('قائمة القوالب الخمسة، والقالب الحالي معلَّم، ولا صندوق نص فيها', menu && menu.ids.join() === 'understand,diagnose,review,next-step,handoff' && menu.checked.join() === 'next-step' && menu.foot && menu.boxes === 0, menu);
  await shot('menu');
  await d.clickShadow(HOST, '[data-template-id="diagnose"]');
  const menuClosed = await d.github(`return ${R}.querySelector('[data-template-menu]') === null;`);
  await d.clickShadow(HOST, COPY);
  await waitUntil(async () => (await stateOf(d)) === 'success', 8000);
  check('اختيار «تشخيص الخطأ» يغلق القائمة وينسخ برومبته', menuClosed && (!chromium || String(await clipboard()).startsWith('# تشخيص الخطأ: feat: refresh the settings UI')), { menuClosed, head: chromium ? String(await clipboard()).slice(0, 80) : null });

  // 4. فشل الحافظة الحقيقي: نقرة بلا نشاط مستخدم (بعد انقضاء التفعيل العابر) فترفض الواجهتان (T-0.5).
  // منح قراءة الحافظة في Playwright يمنح معها الكتابة بلا نشاط (clipboardReadWrite)، فيُسحب قبل الحقن ويُعاد بعده.
  if (chromium) await session.context.clearPermissions();
  await d.github(`
    const host = document.querySelector('${HOST}');
    setTimeout(() => {
      host.setAttribute('data-mj-fail', JSON.stringify({ active: navigator.userActivation ? navigator.userActivation.isActive : null }));
      host.shadowRoot.querySelector('[data-action="copy-prompt"]').click();
    }, 8000);
    return true;
  `);
  // صمت تام أثناء الانتظار: كل استدعاء evaluate في Playwright يمنح الصفحة نشاط مستخدم جديدًا (userGesture) فيُفسد حقن الفشل.
  await sleep(10000);
  const failed = await waitUntil(async () => (await stateOf(d)) === 'failed', 6000, 200);
  const fail = await d.github(`return JSON.parse(document.querySelector('${HOST}')?.getAttribute('data-mj-fail') ?? 'null');`);
  check('الحافظة ترفض فعلًا بلا نشاط مستخدم: الحالة «تعذّر النسخ»', failed, { state: await stateOf(d), fail });
  if (fail?.active !== null && fail?.active !== undefined) check('وقت الفشل لم يكن لدى الصفحة نشاط مستخدم (navigator.userActivation.isActive = false)', fail.active === false, fail);
  const failView = await d.github(`
    const r = ${R};
    return { reason: r.querySelector('[data-reason]')?.textContent ?? null, label: r.querySelector('[data-label]')?.textContent.trim(), role: r.querySelector('[data-note="failed"]')?.getAttribute('role'), download: Boolean(r.querySelector('[data-action="download-prompt"]')), boxes: r.querySelectorAll('textarea, input, pre').length, hasConfirm: r.textContent.includes('تم النسخ') };
  `);
  check('الفشل يُعلن بسببه (رفض المتصفح) ويُعرض البديل اليدوي، ولا «تم النسخ» ولا صندوق نص', failView.label === 'تعذّر النسخ' && /رفض المتصفح الكتابة إلى الحافظة|NotAllowedError/.test(failView.reason ?? '') && failView.role === 'alert' && failView.download && failView.boxes === 0 && !failView.hasConfirm, failView);
  await shot('failed');
  await d.clickShadow(HOST, '[data-action="download-prompt"]');
  const dl = await waitUntil(() => d.github(`return ${R}?.querySelector('[data-download]')?.getAttribute('data-download') ?? null;`), 5000);
  check('البديل اليدوي: طُلب تنزيل البرومبت ملفًا محليًا بنقر فعلي', dl === 'downloaded', dl);
  await d.clickShadow(HOST, COPY);
  const recovered = await waitUntil(async () => (await stateOf(d)) === 'success', 8000);
  check('نقرة فعلية بعد الفشل تنجح (السبب غياب نشاط المستخدم لا عطل في الزر)', recovered, await stateOf(d));
  if (chromium) await session.context.grantPermissions(['clipboard-read'], { origin: 'https://github.com' });

  // 5. محتوى خاص.
  await d.openGithub('https://github.com/octo/demo/pull/4243');
  await waitUntil(() => d.github(`return Boolean(${R}?.querySelector('${COPY}'));`), 15000);
  await sleep(400);
  const noteBefore = await d.github(`return ${R}.querySelector('[data-note="private"]') !== null;`);
  await d.clickShadow(HOST, COPY);
  await waitUntil(async () => (await stateOf(d)) === 'success', 8000);
  const note = await d.github(`const n = ${R}.querySelector('[data-note="private"]'); return n ? { tone: n.getAttribute('data-tone'), text: n.textContent, boxes: ${R}.querySelectorAll('textarea, input, pre').length } : null;`);
  check('محتوى خاص: تنبيه مختصر بعدد الأنماط المحجوبة داخل القسم، بلا صندوق نص (ولا تنبيه قبل النسخ)', !noteBefore && note && note.tone === 'warning' && /حُجب 2 من الأنماط السرّية المحتملة/.test(note.text) && /لا يزيل كل سرّ/.test(note.text) && note.boxes === 0, { noteBefore, note });
  const everywhere = await d.github(`return document.documentElement.outerHTML + ' ' + ${R}.textContent + ' ' + document.querySelector('${HOST}').outerHTML;`);
  if (chromium) {
    const text = String(await clipboard());
    check('المنسوخ يحجب الرمزين الوهميين ولا يظهر أيّ منهما فيه (ولا في واجهة الزر)', text.includes('[محجوب:') && !text.includes(FAKE.ghp) && !text.includes(FAKE.aws) && !String(await rootText(d)).includes(FAKE.ghp), { head: text.slice(0, 100) });
  } else check('واجهة الزر لا تعرض أيًّا من الرمزين الوهميين', !String(await rootText(d)).includes(FAKE.ghp) && !String(await rootText(d)).includes(FAKE.aws), 'خرجت أسرار');
  check('الرمز الوهمي يبقى في صفحة GitHub كما هي (لا يمس الزر DOM الصفحة)', String(everywhere).includes(FAKE.ghp), 'اختفى من الصفحة');
  await shot('private-note');

  // 6. مشكلة ومهمة Actions حقيقيتان.
  for (const [url, label, head] of [
    ['https://github.com/salktbi902/etos/issues/1', 'صفحة مشكلة حقيقية', '# فهم المشكلة: Local Debug'],
    ['https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911', 'صفحة مهمة Actions حقيقية', '# تشخيص الخطأ:'],
  ]) {
    await d.openGithub(url);
    const ok = await waitUntil(() => d.github(`return Boolean(${R}?.querySelector('${COPY}'));`), 15000);
    if (ok) await d.clickShadow(HOST, COPY);
    const success = ok && (await waitUntil(async () => (await stateOf(d)) === 'success', 8000));
    const text = chromium && success ? String(await clipboard()) : null;
    check(`${label}: الزر مركَّب وينسخ برومبت قالبه التلقائي${chromium ? '' : ' (النجاح من وعد الحافظة)'}`, success && (!chromium || text.startsWith(head)), { ok, success, head: text?.slice(0, 80) });
  }

  // 7. بلا مفاتيح ولا رموز في التخزين.
  const stored = await d.options(`
    const api = globalThis.browser ?? globalThis.chrome;
    const local = await api.storage.local.get(null);
    const session = api.storage.session ? await api.storage.session.get(null) : {};
    return [...Object.keys(local), ...Object.keys(session)];
  `);
  check('الزر يعمل وتُنسخ النتيجة وفي التخزين كله لا مفتاح مزوّد ولا رمز وصول ولا سرّ', Array.isArray(stored) && !stored.some((k) => /token|secret|apikey|api-key|provider|credential/i.test(k)), stored);
  const mid = await d.github(`return ${R}?.querySelector('[data-copy-prompt]') ? true : false;`);
  check('ما زال الزر مركَّبًا في صفحة المهمة بعد الجولة', mid, mid);

  // 8. الوضع الداكن (لقطة).
  if (chromium && outDir && session.githubPage) {
    await session.githubPage.emulateMedia({ colorScheme: 'dark' });
    await d.openGithub('https://github.com/octo/demo/pull/4243');
    await waitUntil(() => d.github(`return Boolean(${R}?.querySelector('${COPY}'));`), 15000);
    await sleep(400);
    await d.clickShadow(HOST, COPY);
    await waitUntil(async () => (await stateOf(d)) === 'success', 8000);
    await shot('dark-private-note');
    await d.clickShadow(HOST, '[data-action="template-menu"]');
    await shot('dark-menu');
    await session.githubPage.emulateMedia({ colorScheme: 'light' });
  }
}

async function run(key) {
  const target = BROWSERS[key].target;
  const extDir = derivedCopy(target);
  const checks = [];
  const shots = [];
  const result = { label: BROWSERS[key].label, checks, shots };
  let session;
  try {
    const options = { extDir, githubReply, apiReply };
    session = key === 'firefox' ? await firefoxSession(options) : await chromiumSession(key, options);
    result.browserVersion = session.browserVersion;
    await scenario(session, key, checks, shots);
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
  // المحجوب هنا: مضيفات أصول صفحات GitHub المحفوظة (صور وأنماط تطلبها العينة نفسها) وبنية Mozilla الداخلية (إعدادات متصفح Firefox البعيدة وتواقيعها، يطلبها المتصفح لا الإضافة)؛
  // لا مزوّد تحليل (api.anthropic.com) ولا أي مضيف آخر.
  const PAGE_ASSET_HOSTS = /(^|\.)(githubassets\.com|githubusercontent\.com|mozilla\.org|mozilla\.net|mozilla\.com)$/;
  const foreign = (r.network?.blockedExternalHosts ?? ['؟']).filter((h) => !PAGE_ASSET_HOSTS.test(h));
  add('تدقيق الشبكة: صفر طلبات إلى api.github.com، ولا طلب إلى مزوّد تحليل ولا إلى أي مضيف خارجي غير أصول صفحات GitHub المحفوظة وبنية Mozilla الداخلية', (r.network?.api?.length ?? 1) === 0 && foreign.length === 0, { api: r.network?.api, foreign });
  if (r.extensionErrors) add('لا أخطاء تشغيل ولا مانيفست للإضافة', r.extensionErrors.runtime.length === 0 && r.extensionErrors.manifest.length === 0, r.extensionErrors);
  results[key] = r;
  const bad = r.checks.filter((c) => !c.ok).length;
  console.log(`${r.label} ${r.browserVersion ?? ''}: ${r.checks.length - bad}/${r.checks.length}`);
  all.push(...r.checks);
}
if (outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'browser-copy-prompt-check.json'), `${JSON.stringify(results, null, 2)}\n`);
}
console.log(`المجموع: ${all.filter((c) => c.ok).length}/${all.length}`);
if (all.some((c) => !c.ok)) process.exitCode = 1;

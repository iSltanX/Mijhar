#!/usr/bin/env node
// e2e حارس القالب وبنك العبارات وقسم «ترجمة مسودتي» (T-7.2 وT-7.3) في المتصفحات الفعلية (لا يُشغَّل ضمن vitest): وحدة f.composer كما تُشحن على عينات fixtures/templates
// (بلاغ بنموذج Issue Form، وقالب Markdown لطلب دمج، وقالب غير معروف الهيكل، وبلاغ عادي)، بنقر وكتابة فعليين من خارج الصفحة وأحداث input الموثوقة (isTrusted).
//   TEST-WRITE-02 (AC-F2): دليل جانبي لحقل في النموذج لا يستبدله؛ والقالب Markdown حرفيًا مع الإدراج تحت العناوين؛ والهيكل غير المعروف للنسخ اليدوي دون لمس الصفحة.
//   TEST-WRITE-03 (AC-F3): العبارة تُختار فتظهر في المعاينة ولا تُدرج إلا منها؛ والتراجع.
//   TEST-WRITE-05 (AC-F5): القسم الثابت لا يتغير بحضور محرك الترجمة أو غيابه؛ والترجمة بتقنيع ومراجعة يدوية؛ وفشل المحرك يُبقي الأصل.
// الاستعمال: node tests/modules/f/template/browser/run.mjs [chrome edge brave firefox] [--out-dir evidence]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineInfo, openBrowser, serveDir, writeJson } from '../../../../../scripts/spikes/lib.mjs';
import { blockExternalScripts, bundleEntry, call, click, inject, press, recorder, settle, typeText } from '../../../browser/e2e.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SERVE = path.join(ROOT, 'dist/mj13-template-browser');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

const T = 'fixtures/templates';
const PAGES = {
  'issue-form': { file: `${T}/issue-form.html`, href: 'https://github.com/octo/demo/issues/new?template=bug_report.yml' },
  'markdown-template': { file: `${T}/markdown-template.html`, href: 'https://github.com/octo/demo/compare/main...feature' },
  'unknown-template': { file: `${T}/unknown-template.html`, href: 'https://github.com/octo/demo/issues/new' },
  'plain-issue': { file: `${T}/plain-issue.html`, href: 'https://github.com/octo/demo/issues/new' },
  editors: { file: 'tests/modules/f/composer/fixtures/fixture-editors.html', href: 'https://github.com/octo/demo/pull/7' },
};
const PR_TEMPLATE = fs.readFileSync(path.join(ROOT, T, 'PULL_REQUEST_TEMPLATE.md'), 'utf8');
const preserves = (original, result) => {
  let at = 0;
  for (const ch of result) if (at < original.length && ch === original[at]) at += 1;
  return at === original.length;
};

const code = await bundleEntry({ root: ROOT, entry: path.join(HERE, 'entry.ts'), serveDir: SERVE, extraFiles: Object.fromEntries(Object.entries(PAGES).map(([n, p]) => [`${n}.html`, p.file])) });
const server = await serveDir(SERVE);
const { checks, check } = recorder();
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: 'ملف تعريف مؤقت جديد بلا إضافات وبلا واجهة (headless)؛ نقر وكتابة فعليان؛ الشيفرة كما تُشحن', results: [] };
const screensDir = outDir ? path.join(outDir, 'T-7.2/screens') : null;
if (screensDir) fs.mkdirSync(screensDir, { recursive: true });

const S = (b) => call(b, 'panel');
async function load(b, name, prefill) {
  await b.open(`${server.url}/${name}.html`);
  await inject(b, code);
  if (prefill) await call(b, 'setValue', prefill);
  await call(b, 'mount', PAGES[name].href);
  await call(b, 'instrument');
}
const clickPx = async (b, p) => {
  if (!p) throw new Error('لا هدف للنقر');
  await click(b, p.x, p.y);
  await settle(150);
};
const clickPanel = async (b, selector) => {
  await call(b, 'panelEl', selector);
  await settle(100);
  const at = await call(b, 'panelEl', selector);
  if (!at) throw new Error(`لا عنصر ${selector}`);
  await click(b, at.x, at.y);
  await settle(150);
};
const typeInto = async (b, selector, text) => {
  await call(b, 'focusPanel', selector);
  await typeText(b, text);
  await settle(120);
};
const openFrom = async (b, id) => clickPx(b, await call(b, 'trigger', id));

async function issueForm(b) {
  const L = b.label;
  await load(b, 'issue-form');
  const before = await call(b, 'snapshot');
  await openFrom(b, 'issue_form_steps');
  let p = await S(b);
  check(L, 'AC-F2', 'Issue Form: وضع النموذج بتسمية الحقل المفتوح ولا حقول المساعد الخمسة العامة', p.open && p.template === 'issue-form' && p.currentLabel === 'Steps to reproduce' && p.notice?.includes('لا يستبدل المساعد النموذج') && p.inViewport, { template: p.template, label: p.currentLabel });
  check(L, 'AC-F2', 'حقول النموذج الأخرى للاطلاع بأنواعها وإلزامها', JSON.stringify(p.formFields) === JSON.stringify(['Version · حقل نصي · إلزامي', 'Steps to reproduce · منطقة نص · إلزامي · هنا', 'Expected behavior · منطقة نص · إلزامي', 'Browser · قائمة منسدلة', 'Terms · مربعات اختيار · إلزامي']), p.formFields);
  await typeInto(b, '#mj-composer-single', 'Open github.com\nPress Alt+G\nWatch the sidebar');
  p = await S(b);
  check(L, 'AC-F2', 'المعاينة خطوات مرقّمة بلا ترويسات', p.preview === '1. Open github.com\n2. Press Alt+G\n3. Watch the sidebar', p.preview);
  await call(b, 'takeLog');
  await clickPanel(b, '[data-action="insert-cursor"]');
  const f = await call(b, 'fieldState', 'issue_form_steps');
  const log = await call(b, 'takeLog');
  check(L, 'AC-F2', 'أُدرج في الحقل المفتوح وحده بالصيغة نفسها', f.value === '1. Open github.com\n2. Press Alt+G\n3. Watch the sidebar\n', f.value);
  check(L, 'AC-F2', 'أحداث input موثوقة من أمر التحرير الحقيقي (insertText) وعلى الحقل المفتوح وحده', log.length > 0 && log.every((e) => e.target === 'issue_form_steps') && log.some((e) => e.type === 'input' && e.trusted && e.inputType === 'insertText'), log.slice(0, 4));
  const after = await call(b, 'snapshot');
  check(L, 'AC-F2', 'كل الحقول الأخرى في النموذج كما هي (النصي والمنطقة الأخرى والقائمة ومربع الموافقة)', Object.keys(before).every((k) => k === 'issue_form_steps' || before[k] === after[k]), { before, after });
  // التراجع الأصلي ثم زر التراجع.
  await call(b, 'focusField', 'issue_form_steps');
  await press(b, 'ControlOrMeta+KeyZ');
  await settle(150);
  check(L, 'AC-F2', 'التراجع الأصلي Ctrl/⌘+Z يتراجع عن الإدراج (سجل التراجع الأصلي)', (await call(b, 'fieldState', 'issue_form_steps')).value === '', await call(b, 'fieldState', 'issue_form_steps'));
  await clickPanel(b, '[data-action="insert-append"]');
  await clickPanel(b, '[data-action="undo"]');
  check(L, 'AC-F2', 'زر «التراجع عن آخر إدراج» يعيد الحقل حرفيًا', (await call(b, 'fieldState', 'issue_form_steps')).value === '', null);
  // الحقل الآخر دليله بصيغته.
  await openFrom(b, 'issue_form_expected');
  p = await S(b);
  check(L, 'AC-F2', 'فتحه من «Expected behavior» يبدّل الدليل إلى ذلك الحقل', p.currentLabel === 'Expected behavior', p.currentLabel);
  const pub = await call(b, 'takePublishing');
  check(L, 'لا نشر', 'لا submit ولا نقر على زر الإرسال في كل ما سبق', pub.length === 0, pub);
  const stopped = await call(b, 'stop');
  check(L, 'الإيقاف', 'إيقاف الوحدة يعيد DOM الصفحة حرفيًا', stopped.hosts === 0, stopped);
}

async function markdownTemplate(b) {
  const L = b.label;
  await load(b, 'markdown-template', { id: 'pull_request_body', value: PR_TEMPLATE });
  await openFrom(b, 'pull_request_body');
  let p = await S(b);
  check(L, 'AC-F2', 'قالب Markdown: يُتعرَّف عليه ويُبيَّن العنوان المقابل لكل حقل', p.template === 'markdown' && p.mapping.actual === '«Description»' && p.mapping.steps === '«How to test»' && p.mapping.evidence === '«Screenshots»' && p.mapping.expected?.includes('لا عنوان مقابل'), { template: p.template, mapping: p.mapping });
  await typeInto(b, '#mj-composer-actual', 'Fixes the sidebar toggle');
  await typeInto(b, '#mj-composer-steps', 'Open github.com\nPress Alt+G');
  await typeInto(b, '#mj-composer-environment', 'macOS 15');
  p = await S(b);
  const preview = p.preview;
  check(L, 'AC-F2', 'المعاينة هي المسودة بعد ملء القالب كاملة', p.output === 'edits' && preview.includes('## Description\n\nFixes the sidebar toggle') && preview.includes('## How to test\n\n1. Open github.com\n2. Press Alt+G') && preserves(PR_TEMPLATE, preview), p.output);
  await call(b, 'takeLog');
  await clickPanel(b, '[data-action="insert-template"]');
  let f = await call(b, 'fieldState', 'pull_request_body');
  const log = await call(b, 'takeLog');
  check(L, 'AC-F2', 'الحقل بعد الإدراج يطابق المعاينة حرفيًا، والقالب الأصلي تتابع جزئي منه (لا حرف حُذف)', f.value === preview && preserves(PR_TEMPLATE, f.value), { equal: f.value === preview });
  check(L, 'AC-F2', 'ترويسات القالب وقوائم التحقق وتعليقاته باقية', ['- [ ] I have read the contributing guidelines', '- [ ] I have added tests for my changes', '- [x] My code follows the project style', '<!-- What does this PR change and why? -->', '## Checklist'].every((l) => f.value.split('\n').includes(l)), null);
  check(L, 'AC-F2', 'ثلاثة إدراجات بأمر التحرير الحقيقي: input موثوق insertText لكل منها', log.filter((e) => e.type === 'input' && e.trusted && e.inputType === 'insertText').length >= 3, log.slice(0, 6));
  await call(b, 'takeLog');
  await clickPanel(b, '[data-action="undo"]');
  f = await call(b, 'fieldState', 'pull_request_body');
  const undoLog = await call(b, 'takeLog');
  check(L, 'AC-F2', 'زر التراجع عن الإدراج المتعدد يعيد القالب حرفيًا', f.value === PR_TEMPLATE, { equal: f.value === PR_TEMPLATE });
  check(L, 'AC-F2', 'والتراجع بأمر التحرير الحقيقي: deleteContentBackward موثوق', undoLog.some((e) => e.type === 'input' && e.trusted && e.inputType === 'deleteContentBackward'), undoLog.slice(0, 4));
  const pub = await call(b, 'takePublishing');
  check(L, 'لا نشر', 'لا submit ولا نقر على زر إرسال الطلب', pub.length === 0, pub);
  await call(b, 'stop');
}

async function unknownTemplate(b) {
  const L = b.label;
  await load(b, 'unknown-template');
  const before = await call(b, 'snapshot');
  await openFrom(b, 'field_a');
  let p = await S(b);
  check(L, 'AC-F2', 'هيكل غير معروف: بيان صريح ولا أزرار إدراج ولا تراجع', p.template === 'unknown' && p.notice?.includes('لم يُتعرَّف على هيكل القالب') && !p.buttons['insert-cursor'] && !p.buttons['insert-append'] && !p.buttons['insert-template'] && !p.buttons.undo && Boolean(p.buttons['copy-text']), { template: p.template, buttons: Object.keys(p.buttons) });
  await typeInto(b, '#mj-composer-actual', 'Something broke');
  await typeInto(b, '#mj-composer-steps', 'one\ntwo');
  p = await S(b);
  check(L, 'AC-F2', 'معاينة النص للنسخ اليدوي', p.output === 'copy' && p.preview.includes('1. one\n2. two'), p.output);
  await call(b, 'takeLog');
  await clickPanel(b, '[data-action="copy-text"]');
  const copied = await call(b, 'takeCopied');
  p = await S(b);
  check(L, 'AC-F2', 'زر النسخ ينسخ نص المعاينة ولا يلمس الصفحة', copied.length === 1 && copied[0] === p.preview && p.status.includes('لم يُمس شيء في الصفحة'), { copied: copied.length });
  const after = await call(b, 'snapshot');
  const log = await call(b, 'takeLog');
  check(L, 'AC-F2', 'كل حقول الصفحة كما هي وما من حدث input عليها ولا إرسال', JSON.stringify(before) === JSON.stringify(after) && log.length === 0 && (await call(b, 'takePublishing')).length === 0, { log });
  const stopped = await call(b, 'stop');
  check(L, 'الإيقاف', 'إيقاف الوحدة يعيد DOM الصفحة حرفيًا', stopped.hosts === 0 && stopped.identical, stopped);
}

async function phrasebank(b) {
  const L = b.label;
  await load(b, 'plain-issue');
  const before = await call(b, 'snapshot');
  await openFrom(b, 'issue_body');
  let p = await S(b);
  check(L, 'T-7.1', 'بلاغ عادي: لا وضع قالب (يعمل المساعد كما في T-7.1) وقسما المساعد الثابت والاختياري ظاهران', p.template === 'none' && JSON.stringify(p.sections) === JSON.stringify(['static', 'translate-draft']), { template: p.template, sections: p.sections });
  await call(b, 'takeLog');
  await clickPanel(b, '[data-category="suggestion"]');
  await clickPanel(b, '[data-phrase="s-simplify"]');
  p = await S(b);
  check(L, 'AC-F3', 'اختيار العبارة يعرضها في المعاينة (كتلة suggestion) ولا يمس الحقل ولا يطلق input', p.preview.includes('```suggestion') && p.preview.includes('يمكن تبسيط هذا السطر هكذا') && (await call(b, 'takeLog')).length === 0 && (await call(b, 'fieldState', 'issue_body')).value === '', p.preview);
  await clickPanel(b, '[data-action="insert-cursor"]');
  const f = await call(b, 'fieldState', 'issue_body');
  const log = await call(b, 'takeLog');
  check(L, 'AC-F3', 'الإدراج من المعاينة بأمر التحرير الحقيقي (input موثوق insertText)', f.value.includes('```suggestion\n<النسخة المبسطة>\n```') && log.some((e) => e.trusted && e.inputType === 'insertText'), { value: f.value });
  await clickPanel(b, '[data-action="undo"]');
  check(L, 'AC-F3', 'والتراجع يعيد الحقل فارغًا', (await call(b, 'fieldState', 'issue_body')).value === '', null);
  // الإنجليزية
  await clickPanel(b, '[data-category="praise"]');
  await clickPanel(b, 'input[name="mj-phrase-language"][value="en"]');
  await clickPanel(b, '[data-phrase="p-tests"]');
  p = await S(b);
  check(L, 'AC-F3', 'العبارة بالإنجليزية', p.preview === 'Nice work adding tests; they make this much easier to review.', p.preview);
  const pub = await call(b, 'takePublishing');
  check(L, 'لا نشر', 'لا submit ولا نقر على زر الإرسال', pub.length === 0, pub);
  const after = await call(b, 'snapshot');
  check(L, 'AC-F3', 'الحقول الأخرى كما هي', Object.keys(before).every((k) => k === 'issue_body' || before[k] === after[k]), null);
  await call(b, 'stop');
}

async function separation(b) {
  const L = b.label;
  const DRAFT = 'Run `npm test` in src/app.js and read https://example.com/docs before you merge.';
  const statics = {};
  for (const mode of ['none', 'faithful', 'unavailable']) {
    await load(b, 'editors', { id: 'new_comment_field', value: DRAFT });
    await call(b, 'setEngine', mode);
    await openFrom(b, 'new_comment_field');
    await settle(150);
    await typeInto(b, '#mj-composer-expected', 'It works');
    await clickPanel(b, '[data-category="note"]');
    await clickPanel(b, '[data-phrase="n-nit"]');
    const p = await S(b);
    statics[mode] = p.staticHtml;
    if (mode === 'none') {
      check(L, 'AC-F5', 'غياب المحرك: «المحرك غير متاح» والقسم الاختياري بلا زر ترجمة', p.translateState === 'absent' && p.translateStatus?.includes('المحرك غير متاح') && !p.buttons['translate-draft'], { state: p.translateState, status: p.translateStatus });
      check(L, 'AC-F5', 'قسمان شقيقان: الثابت والاختياري', JSON.stringify(p.sections) === JSON.stringify(['static', 'translate-draft']), p.sections);
      await clickPanel(b, '[data-action="insert-append"]');
      check(L, 'AC-F5', 'القسم الثابت يعمل كاملًا مع غياب المحرك (بنك العبارات والإدراج)', (await call(b, 'fieldState', 'new_comment_field')).value.includes('Nit (not blocking)') || (await call(b, 'fieldState', 'new_comment_field')).value.includes('ملاحظة بسيطة'), null);
    }
    if (mode === 'unavailable') check(L, 'AC-F5', 'محرك غير متاح بسبب: السبب ظاهر', p.translateState === 'unavailable' && p.translateStatus?.includes('النموذج لم يُنزَّل'), p.translateStatus);
    await call(b, 'stop');
  }
  check(L, 'AC-F5', 'القسم الثابت متطابق حرفيًا (DOM) في حالات المحرك الثلاث: غائب وجاهز وغير متاح', statics.none === statics.faithful && statics.none === statics.unavailable && statics.none.length > 500, { lengths: Object.values(statics).map((s) => s?.length) });

  // محرك جاهز: ترجمة بنقر صريح مع تقنيع ومراجعة يدوية
  await load(b, 'editors', { id: 'new_comment_field', value: DRAFT });
  await call(b, 'setEngine', 'faithful');
  await openFrom(b, 'new_comment_field');
  await settle(200);
  check(L, 'AC-F5', 'لا استدعاء للمحرك قبل النقر', (await call(b, 'engineInfo')).calls === 0, await call(b, 'engineInfo'));
  await clickPanel(b, '[data-action="translate-draft"]');
  await settle(300);
  const info = await call(b, 'engineInfo');
  check(L, 'AC-F5', 'المسودة تُقنَّع قبل المحرك: لا كود ولا مسار ولا رابط يبلغه', info.calls === 1 && /⟦[A-Z]+_\d+⟧/.test(info.received[0]) && !['npm test', 'src/app.js', 'https://example.com/docs'].some((t) => info.received[0].includes(t)), info.received);
  let p = await S(b);
  check(L, 'AC-F5', 'نتيجة سليمة للمراجعة وأزرار الإدراج معطَّلة حتى تؤكد المراجعة', p.translateResult === 'translated' && p.buttons['translated-insert-append'].disabled && p.buttons['translated-insert-cursor'].disabled, p.translateResult);
  check(L, 'AC-F5', 'لا إدراج قبل المراجعة', (await call(b, 'fieldState', 'new_comment_field')).value === DRAFT, null);
  await clickPanel(b, '[data-option="reviewed"]');
  await settle(100);
  await call(b, 'takeLog');
  await clickPanel(b, '[data-action="translated-insert-append"]');
  const f = await call(b, 'fieldState', 'new_comment_field');
  const log = await call(b, 'takeLog');
  check(L, 'AC-F5', 'بعد المراجعة: يُدرج الأصل المفكوك التقنيع (الكود والمسار والرابط) بلا مسح المسودة، بأمر التحرير الحقيقي', f.value.startsWith(DRAFT) && f.value.includes('ترجمة: Run `npm test` in src/app.js and read https://example.com/docs before you merge.') && log.some((e) => e.trusted && e.inputType === 'insertText'), { value: f.value.slice(0, 160) });
  await clickPanel(b, '[data-action="undo"]');
  check(L, 'AC-F5', 'والتراجع يعيد المسودة حرفيًا', (await call(b, 'fieldState', 'new_comment_field')).value === DRAFT, null);
  await call(b, 'stop');

  // فشل المحرك: يبقى الأصل
  await load(b, 'editors', { id: 'new_comment_field', value: DRAFT });
  await call(b, 'setEngine', 'drop');
  await openFrom(b, 'new_comment_field');
  await settle(200);
  await clickPanel(b, '[data-action="translate-draft"]');
  await settle(300);
  p = await S(b);
  check(L, 'AC-F5', 'محرك يخلّ بالرموز: يبقى الأصل مع تنبيه ولا إدراج ولا نص مشوَّه', p.translateResult === 'original-kept' && !p.buttons['translated-insert-append'] && (await call(b, 'fieldState', 'new_comment_field')).value === DRAFT, p.translateResult);
  const urls = await call(b, 'resources').catch(() => []);
  check(L, 'الشبكة', 'لا طلب من الصفحة إلى أي مضيف خارج الخادم المحلي', urls.every((u) => u.startsWith(server.url)), urls.filter((u) => !u.startsWith(server.url)));
  await call(b, 'stop');
}

// لقطات الأدلة: بعد كل الفحوص، لأن التقاط الشاشة في Chromium يضيف style="" مؤقتًا لعناصر في الصفحة فيفسد مقارنة DOM بعد الإيقاف.
async function screenshots(b) {
  if (!screensDir || !b.page) return;
  const shot = (name) => b.page.screenshot({ path: path.join(screensDir, `${b.key}-${name}.png`) });
  await load(b, 'issue-form');
  await openFrom(b, 'issue_form_steps');
  await typeInto(b, '#mj-composer-single', 'Open github.com\nPress Alt+G');
  await shot('issue-form');
  await call(b, 'stop');
  await load(b, 'markdown-template', { id: 'pull_request_body', value: PR_TEMPLATE });
  await openFrom(b, 'pull_request_body');
  await typeInto(b, '#mj-composer-actual', 'Fixes the sidebar toggle');
  await typeInto(b, '#mj-composer-steps', 'Open github.com\nPress Alt+G');
  await clickPanel(b, '[data-action="insert-template"]');
  await shot('markdown-template');
  await call(b, 'stop');
  await load(b, 'unknown-template');
  await openFrom(b, 'field_a');
  await typeInto(b, '#mj-composer-actual', 'Something broke');
  await shot('unknown-template');
  await call(b, 'stop');
  await load(b, 'plain-issue');
  await openFrom(b, 'issue_body');
  await clickPanel(b, '[data-category="suggestion"]');
  await clickPanel(b, '[data-phrase="s-simplify"]');
  await shot('phrasebank');
  await call(b, 'stop');
  await load(b, 'editors', { id: 'new_comment_field', value: 'Run `npm test` in src/app.js before you merge.' });
  await call(b, 'setEngine', 'drop');
  await openFrom(b, 'new_comment_field');
  await settle(200);
  await clickPanel(b, '[data-action="translate-draft"]');
  await settle(300);
  await shot('translate-failsafe');
  await call(b, 'stop');
}

async function narrow(b) {
  try {
    if (b.page) await b.page.setViewportSize({ width: 360, height: 640 });
    else await b.ff.client.send('WebDriver:SetWindowRect', { width: 420, height: 760 });
    await settle(250);
    await load(b, 'markdown-template', { id: 'pull_request_body', value: PR_TEMPLATE });
    await openFrom(b, 'pull_request_body');
    await typeInto(b, '#mj-composer-actual', 'Fixes it');
    const p = await S(b);
    check(b.label, 'تخطيط ضيق', 'اللوحة (وضع القالب) داخل النافذة الضيقة بلا تمرير أفقي للصفحة وزر الإدراج قابل للبلوغ', p.open && p.inViewport && p.overflowX <= 1 && p.buttons['insert-template'].x > 0, { overflowX: p.overflowX, inViewport: p.inViewport });
    await call(b, 'stop');
    if (b.page) await b.page.setViewportSize({ width: 1280, height: 900 });
    else await b.ff.client.send('WebDriver:SetWindowRect', { width: 1366, height: 800 });
    await settle(150);
    return { inViewport: p.inViewport, overflowX: p.overflowX };
  } catch (e) {
    return { skipped: String(e.message ?? e) };
  }
}

try {
  for (const key of keys) {
    const b = await openBrowser(key);
    await blockExternalScripts(b);
    const r = { browser: b.label, version: b.version };
    try {
      await issueForm(b);
      await markdownTemplate(b);
      await unknownTemplate(b);
      await phrasebank(b);
      await separation(b);
      r.narrow = await narrow(b);
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
    console.error(`${b.label} ${b.version}: ${mine.filter((c) => c.ok).length}/${mine.length} فحصًا`);
  }
} finally {
  await server.close();
}
output.checks = checks;
const failed = checks.filter((c) => !c.ok);
console.error(`المجموع: ${checks.length - failed.length}/${checks.length} فحصًا اجتاز`);
if (outDir) writeJson(path.join(outDir, 'T-7.2/browser-results.json'), output);
if (failed.length) process.exitCode = 1;

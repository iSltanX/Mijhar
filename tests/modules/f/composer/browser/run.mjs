#!/usr/bin/env node
// e2e مساعد الكتابة (T-7.1) في المتصفحات الفعلية، لا ضمن vitest: وحدة f.composer كما تُشحن على عينة المحررات fixture-editors.html (نماذج Issue وPR وتعليق بمسودات موجودة وحقل بلا
// شريط وCodeMirror)، بنقر وكتابة فعليين من خارج الصفحة، وأحداث input الموثوقة (isTrusted) التي يولّدها أمر التحرير الحقيقي.
//   TEST-WRITE-01 (AC-F1): فتح اللوحة بنقرة، وكتابة الحقول الخمسة بالكيبورد، والمعاينة الكاملة تطابق ما سيُدرج، دون نشر أو إرسال.
//   TEST-WRITE-04 (AC-F4): الإدراج عند المؤشر والإلحاق دون مسح المسودة، وأحداث input موثوقة بنوع insertText (أمر التحرير)، و«التراجع عن آخر إدراج» يعيد المسودة والتحديد حرفيًا،
//     وCtrl/⌘+Z الأصلي يتراجع عن الإدراج أيضًا (سجل التراجع الأصلي)، ولا submit ولا نقر على زر إرسال في أي خطوة.
// الاستعمال: node tests/modules/f/composer/browser/run.mjs [chrome edge brave firefox] [--out-dir evidence]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineInfo, openBrowser, serveDir, writeJson } from '../../../../../scripts/spikes/lib.mjs';
import { blockExternalScripts, bundleEntry, call, click, inject, press, recorder, settle, typeText } from '../../../browser/e2e.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SERVE = path.join(ROOT, 'dist/mj10-composer-browser');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

const PAGE = { name: 'editors', file: 'tests/modules/f/composer/fixtures/fixture-editors.html', href: 'https://github.com/octo/demo/issues/new' };
const FIELDS = {
  expected: 'The side panel opens when I press Alt+G.',
  actual: 'Nothing happens in Firefox 158.',
  steps: 'Open github.com\nPress Alt+G\nWatch the sidebar',
  environment: 'macOS 15\nFirefox 158.0.1',
  evidence: 'https://example.com/shot.png',
};
const BLOCK = [
  '## Expected behavior', '', 'The side panel opens when I press Alt+G.', '',
  '## Actual behavior', '', 'Nothing happens in Firefox 158.', '',
  '## Steps to reproduce', '', '1. Open github.com', '2. Press Alt+G', '3. Watch the sidebar', '',
  '## Environment', '', '- macOS 15', '- Firefox 158.0.1', '',
  '## Evidence', '', '- https://example.com/shot.png',
].join('\n');
const COMMENT_DRAFT = 'First line of my draft.\nSecond line of my draft.\nThird line of my draft.';
const PR_DRAFT = 'Draft: this PR fixes the sidebar toggle.\n\nStill need to add tests.';

const code = await bundleEntry({ root: ROOT, entry: path.join(HERE, 'entry.ts'), serveDir: SERVE, extraFiles: { [`${PAGE.name}.html`]: PAGE.file } });
const server = await serveDir(SERVE);
const { checks, check } = recorder();
const output = { measuredAt: new Date().toISOString(), machine: machineInfo(), conditions: 'ملف تعريف مؤقت جديد بلا إضافات وبلا واجهة (headless)؛ نقر وكتابة فعليان؛ الشيفرة كما تُشحن', results: [] };
const screensDir = outDir ? path.join(outDir, 'T-7.1/screens') : null;
if (screensDir) fs.mkdirSync(screensDir, { recursive: true });

const S = (b) => call(b, 'panel');
const clickAt = async (b, p) => {
  if (!p) throw new Error('لا هدف للنقر');
  await click(b, p.x, p.y);
  await settle(150);
};
const clickPanel = async (b, action) => {
  await call(b, 'panelButton', action);
  await settle(100);
  const at = await call(b, 'panelButton', action);
  if (!at) throw new Error(`لا زر ${action}`);
  await click(b, at.x, at.y);
  await settle(150);
};
async function typeFields(b, fields) {
  for (const [name, value] of Object.entries(fields)) {
    await call(b, 'focusPanelField', name);
    await typeText(b, value);
  }
  await settle(120);
}

async function flows(b) {
  const label = b.label;
  const r = {};
  await b.open(`${server.url}/${PAGE.name}.html`);
  await inject(b, code);
  const m = await call(b, 'mount', PAGE.href);
  await call(b, 'instrument');
  const btns = await call(b, 'buttons');
  check(label, 'الأزرار', 'أربعة أزرار ظاهرة (ثلاثة في أشرطة وواحد قبل حقل بلا شريط) ولا زر لـCodeMirror', m.buttons === 4 && btns.total === 4 && btns.cmButtons === 0 && btns.all.every((x) => x.present && x.rect.w > 0 && x.rect.h > 0 && x.expanded === 'false'), btns);
  const pristineDrafts = { comment: (await call(b, 'fieldState', 'new_comment_field')).value, pr: (await call(b, 'fieldState', 'pull_request_body')).value };
  check(label, 'قبل الفعل', 'لا لوحة، والمسودات كما هي، ولا أحداث input', !(await S(b)).open && pristineDrafts.comment === COMMENT_DRAFT && pristineDrafts.pr === PR_DRAFT && (await call(b, 'takeLog')).length === 0, pristineDrafts);

  // ——— التعليق: عند المؤشر ———
  await call(b, 'setSelection', { id: 'new_comment_field', start: 24, end: 24, focus: true });
  await clickAt(b, await call(b, 'trigger', 'new_comment_field'));
  let p = await S(b);
  check(label, 'اللوحة', 'نقر الزر الفعلي يفتح لوحة في نهاية body داخل النافذة، والتركيز على أول حقل، والنوع Issue، ومعاينتها فارغة وأزرار الإدراج معطّلة', p.open && p.hostIsLast && p.inViewport && p.focus === 'mj-composer-expected' && p.kind === 'issue' && p.previewEmpty && p.buttons['insert-cursor'].disabled && p.buttons['insert-append'].disabled, p);
  check(label, 'اللوحة', 'التركيز في الصفحة على مضيف اللوحة، وحقل الكتابة الأصلي لم يفقد موضع المؤشر', (await call(b, 'fieldState', 'new_comment_field')).start === 24, await call(b, 'fieldState', 'new_comment_field'));
  // Tab الفعلي ينقل التركيز بين حقول اللوحة بالترتيب.
  await press(b, 'Tab');
  p = await S(b);
  check(label, 'اللوحة', 'Tab ينقل من «المتوقع» إلى «الفعلي»', p.focus === 'mj-composer-actual', p.focus);
  await typeFields(b, FIELDS);
  p = await S(b);
  check(label, 'AC-F1', 'الحقول الخمسة بما كُتب بالكيبورد حرفيًا (بما فيها الأسطر المتعددة)', JSON.stringify(p.fields) === JSON.stringify(FIELDS) || Object.entries(FIELDS).every(([k, v]) => p.fields[k] === v), p.fields);
  check(label, 'AC-F1', 'المعاينة الكاملة تطابق النص الذي سيُدرج بالضبط (عناوين وقوائم مرقّمة ونقطية)', p.preview === `${BLOCK}\n` && !p.previewEmpty && !p.buttons['insert-cursor'].disabled, p.preview);
  if (screensDir && b.page) {
    // لقطة اللوحة بعد الكتابة تُؤخذ في آخر التدفق (بعد فحص DOM الحرفي).
  }
  await call(b, 'takeLog');
  await clickPanel(b, 'insert-cursor');
  let f = await call(b, 'fieldState', 'new_comment_field');
  const log = await call(b, 'takeLog');
  check(label, 'AC-F4', 'عند المؤشر: ما قبل المؤشر وما بعده كما هما حرفيًا والكتلة بينهما', f.value.startsWith(COMMENT_DRAFT.slice(0, 24)) && f.value.endsWith(COMMENT_DRAFT.slice(24)) && f.value.includes(BLOCK), { value: f.value.slice(0, 120) });
  check(label, 'AC-F4', 'أمر التحرير الحقيقي: أحداث input موثوقة (isTrusted) بنوع insertText، فيراها GitHub كما لو كتب المستخدم', log.length > 0 && log.every((e) => e.type === 'input' ? e.trusted && e.inputType === 'insertText' : true) && log.some((e) => e.type === 'input' && e.trusted), log.slice(0, 3));
  p = await S(b);
  check(label, 'AC-F4', 'الحالة تعلن الإدراج وأن شيئًا لم يُمسح ولم يُرسل، وزر التراجع مفعَّل', p.statusVisible && p.status.includes('أُدرج عند المؤشر') && p.status.includes('لم يُمسح شيء من مسودتك') && !p.buttons.undo.disabled, p.status);
  check(label, 'AC-F4', 'الإدراج لم يمس الحقول الأخرى', (await call(b, 'fieldState', 'pull_request_body')).value === PR_DRAFT && (await call(b, 'fieldState', 'issue-body')).value === '', null);

  // ——— التراجع الأصلي ثم الإدراج ثانية ثم زر التراجع ———
  await call(b, 'focusField', 'new_comment_field');
  await press(b, 'ControlOrMeta+KeyZ');
  await settle(150);
  f = await call(b, 'fieldState', 'new_comment_field');
  r.nativeUndo = f.value === COMMENT_DRAFT;
  check(label, 'AC-F4', 'Ctrl/⌘+Z الأصلي في الحقل يتراجع عن الإدراج (سجل التراجع الأصلي: الإدراج بأمر التحرير)', f.value === COMMENT_DRAFT, { value: f.value.slice(0, 80), isOriginal: f.value === COMMENT_DRAFT });
  p = await S(b);
  await clickPanel(b, 'undo');
  f = await call(b, 'fieldState', 'new_comment_field');
  p = await S(b);
  check(label, 'AC-F4', 'زر «التراجع» بعد تراجع المستخدم الأصلي: المسودة سليمة بلا حذف ولا تحذير', f.value === COMMENT_DRAFT && !p.status.includes('تعذّر'), { value: f.value.length, status: p.status });
  await call(b, 'setSelection', { id: 'new_comment_field', start: 12, end: 24 });
  p = await S(b);
  await clickPanel(b, 'insert-cursor');
  f = await call(b, 'fieldState', 'new_comment_field');
  check(label, 'AC-F4', 'تحديد نص ثم إدراج عند المؤشر: لا يُستبدل المحدد (يُطوى إلى طرفه الأخير)', f.value.startsWith(COMMENT_DRAFT.slice(0, 24)) && f.value.includes(COMMENT_DRAFT.slice(12, 24)) && f.value.endsWith(COMMENT_DRAFT.slice(24)), { head: f.value.slice(0, 40) });
  await call(b, 'takeLog');
  p = await S(b);
  await clickPanel(b, 'undo');
  f = await call(b, 'fieldState', 'new_comment_field');
  const undoLog = await call(b, 'takeLog');
  check(label, 'AC-F4', 'زر «التراجع عن آخر إدراج»: المسودة حرفيًا كما كانت والتحديد الأصلي (12 إلى 24)', f.value === COMMENT_DRAFT && f.start === 12 && f.end === 24, f);
  check(label, 'AC-F4', 'التراجع بأمر التحرير الحقيقي: input موثوق بنوع deleteContentBackward', undoLog.some((e) => e.type === 'input' && e.inputType === 'deleteContentBackward' && e.trusted), undoLog);
  p = await S(b);
  check(label, 'AC-F4', 'بعد التراجع: الحالة تعلن عودة المسودة حرفيًا وزر التراجع معطّل', p.status.includes('عادت مسودتك كما كانت قبله حرفيًا') && p.buttons.undo.disabled, p.status);

  // ——— طلب الدمج: الإلحاق ———
  await clickAt(b, await call(b, 'trigger', 'pull_request_body'));
  p = await S(b);
  check(label, 'اللوحة', 'فتح حقل آخر يستبدل اللوحة (واحدة فقط) ويبدأ بحقول فارغة (جلسة لكل حقل)', p.open && p.fields.expected === '' && (await call(b, 'buttons')).all.find((x) => x.id === 'pull_request_body').expanded === 'true' && (await call(b, 'buttons')).all.find((x) => x.id === 'new_comment_field').expanded === 'false', p.fields);
  await typeFields(b, { expected: FIELDS.expected, steps: FIELDS.steps });
  p = await S(b);
  await clickPanel(b, 'insert-append');
  f = await call(b, 'fieldState', 'pull_request_body');
  check(label, 'AC-F4', 'الإلحاق: مسودة الطلب سليمة في أول الحقل والكتلة في آخره', f.value.startsWith(PR_DRAFT) && f.value.slice(PR_DRAFT.length).startsWith('\n\n## ') && f.value.includes('1. Open github.com'), { tail: f.value.slice(PR_DRAFT.length, PR_DRAFT.length + 60) });
  p = await S(b);
  await clickPanel(b, 'undo');
  check(label, 'AC-F4', 'التراجع بعد الإلحاق يعيد المسودة حرفيًا', (await call(b, 'fieldState', 'pull_request_body')).value === PR_DRAFT, null);

  // ——— حقل فارغ وحقل بلا شريط ———
  await clickAt(b, await call(b, 'trigger', 'issue-body'));
  await typeFields(b, FIELDS);
  p = await S(b);
  await clickPanel(b, 'insert-cursor');
  check(label, 'AC-F4', 'حقل فارغ: يُدرج النص وحده بسطر أخير بلا فواصل زائدة في أوله', (await call(b, 'fieldState', 'issue-body')).value === `${BLOCK}\n`, null);
  await clickAt(b, await call(b, 'trigger', 'fallback-field'));
  await typeFields(b, { expected: 'Fallback works.' });
  await call(b, 'setSelection', { id: 'fallback-field', start: 8, end: 8 });
  p = await S(b);
  await clickPanel(b, 'insert-cursor');
  let fb = await call(b, 'fieldState', 'fallback-field');
  check(label, 'احتياطي', 'حقل بلا شريط أدوات (BLK-GH-EDITOR-DOM): زره قبله، والإدراج عند المؤشر يحفظ ما حوله', fb.value.startsWith('Existing') && fb.value.endsWith(' text without a toolbar.') && fb.value.includes('## Expected behavior'), { value: fb.value });
  p = await S(b);
  await clickPanel(b, 'undo');
  check(label, 'احتياطي', 'والتراجع يعيده حرفيًا', (await call(b, 'fieldState', 'fallback-field')).value === 'Existing text without a toolbar.', null);

  // ——— Escape والتركيز ———
  await call(b, 'focusPanelField', 'expected');
  await press(b, 'Escape');
  await settle(150);
  p = await S(b);
  check(label, 'لوحة المفاتيح', 'Escape الفعلي يغلق اللوحة ويعيد التركيز إلى زر المساعد', !p.open, p);
  check(label, 'لوحة المفاتيح', 'التركيز في الصفحة على مضيف زر المساعد', (await call(b, 'buttons')).all.every((x) => x.expanded === 'false'), null);

  // ——— لا نشر ولا إرسال ———
  const pub = await call(b, 'takePublishing');
  check(label, 'لا نشر', 'لا submit ولا نقر على أي زر إرسال في كل ما سبق (فتح وكتابة وإدراج وإلحاق وتراجع وإغلاق وEnter داخل اللوحة)', pub.length === 0, pub);

  // ——— تخطيط ضيق ———
  let narrow = null;
  try {
    if (b.page) await b.page.setViewportSize({ width: 360, height: 640 });
    else await b.ff.client.send('WebDriver:SetWindowRect', { width: 420, height: 760 });
    await settle(250);
    await clickAt(b, await call(b, 'trigger', 'new_comment_field'));
    narrow = await S(b);
    await typeFields(b, FIELDS);
    narrow = await S(b);
    check(label, 'تخطيط ضيق', 'اللوحة داخل النافذة الضيقة، بلا تمرير أفقي للصفحة، وأزرار الإدراج قابلة للبلوغ', narrow.open && narrow.inViewport && narrow.overflowX <= 1 && narrow.buttons['insert-cursor'].x > 0, { rect: narrow.rect, overflowX: narrow.overflowX });
    await press(b, 'Escape');
    if (b.page) await b.page.setViewportSize({ width: 1280, height: 900 });
    else await b.ff.client.send('WebDriver:SetWindowRect', { width: 1366, height: 800 });
    await settle(150);
  } catch (e) {
    r.narrowSkipped = String(e.message ?? e);
  }

  // ——— الشبكة والإيقاف ———
  const urls = await call(b, 'resources').catch(() => []);
  check(label, 'الشبكة', 'لا طلب من الصفحة إلى أي مضيف خارج الخادم المحلي', urls.every((u) => u.startsWith(server.url)), urls.filter((u) => !u.startsWith(server.url)));
  const stopped = await call(b, 'stop');
  check(label, 'الإيقاف', 'إيقاف الوحدة يعيد DOM الصفحة حرفيًا بلا مضيف', stopped.hosts === 0 && stopped.identical, stopped);
  r.narrow = narrow && { inViewport: narrow.inViewport, overflowX: narrow.overflowX };
  return r;
}

async function screenshots(b) {
  if (!screensDir || !b.page) return;
  await b.open(`${server.url}/${PAGE.name}.html`);
  await inject(b, code);
  await call(b, 'mount', PAGE.href);
  await call(b, 'setSelection', { id: 'new_comment_field', start: 24, end: 24, focus: true });
  await clickAt(b, await call(b, 'trigger', 'new_comment_field'));
  await typeFields(b, FIELDS);
  await b.page.screenshot({ path: path.join(screensDir, `${b.key}-panel-preview.png`) });
  const p = await S(b);
  await clickPanel(b, 'insert-cursor');
  await b.page.screenshot({ path: path.join(screensDir, `${b.key}-after-insert.png`) });
  await call(b, 'stop');
}

try {
  for (const key of keys) {
    const b = await openBrowser(key);
    await blockExternalScripts(b);
    const r = { browser: b.label, version: b.version };
    try {
      Object.assign(r, await flows(b));
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
    console.error(`${b.label} ${b.version}: ${mine.filter((c) => c.ok).length}/${mine.length} فحصًا · التراجع الأصلي ${r.nativeUndo ? 'يعمل' : 'لم يعمل'}${r.narrowSkipped ? ` · الضيق: لم يُجرَ (${r.narrowSkipped})` : ''}`);
  }
} finally {
  await server.close();
}
output.checks = checks;
const failed = checks.filter((c) => !c.ok);
console.error(`المجموع: ${checks.length - failed.length}/${checks.length} فحصًا اجتاز`);
if (outDir) writeJson(path.join(outDir, 'T-7.1/browser-results.json'), output);
if (failed.length) process.exitCode = 1;

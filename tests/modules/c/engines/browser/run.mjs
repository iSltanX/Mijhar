#!/usr/bin/env node
// تجربة المحركات الحقيقية (T-4.3، TEST-TR-04 «تكامل + يدوي») في المتصفحات المثبتة، لا ضمن vitest: المحرك الذي يختاره selectLocalEngine
// (DEC-03 ج-2) في الصفحة نفسها بلا محرك وهمي، ونقر وتحديد بالفأرة فعليان من خارج الصفحة، وملف تعريف مؤقت جديد لكل متصفح (الحزمة 'downloadable').
//  1. الاختيار: يطابق DEC-03 والتوفر المكتشف وقت التشغيل (T-0.2: Chrome وBrave جاهز، Edge 'unavailable'، Firefox بلا Translator API).
//  2. واجهة الترجمة كما تُشحن على العينة الإنجليزية: حيث المحرك متاح حالات AC-C1 الأربع (README وتعليق ووصف مشكلة ونص محدد)؛ وحيث لا محرك
//     الحالة الصريحة وبديل «نسخ النص المقنَّع». وتدقيق الشبكة: لا طلب من الصفحة إلى غير الخادم المحلي.
//  3. المجموعة المرجعية (fixtures/translation/reference.json) ومعدلات فشل الفاحص بالصيغة على السلك، وخط أساس بصيغة الخطة وحدها.
// الاستعمال: node tests/modules/c/engines/browser/run.mjs [chrome edge brave firefox] [--out-dir evidence]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { machineInfo, openBrowser, serveDir, sleep, waitFor, writeJson } from '../../../../../scripts/spikes/lib.mjs';
import { blockExternalScripts, bundleEntry, call, click, drag, inject, recorder, settle } from '../../../browser/e2e.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../..');
const SERVE = path.join(ROOT, 'dist/mj14-engines-browser');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out-dir');
const outDir = outIndex === -1 ? null : path.resolve(args.splice(outIndex, 2)[1]);
const keys = args.length ? args : ['chrome', 'edge', 'brave', 'firefox'];

const FIXTURE = { name: 'fixture', file: 'tests/modules/c/ui/fixtures/fixture-translate-en.html', href: 'https://github.com/octo/mijhar-demo/issues/7' };
const REFERENCE = JSON.parse(fs.readFileSync(path.join(ROOT, 'fixtures/translation/reference.json'), 'utf8'));
const README = '[data-case="readme"]';
const COMMENT1 = '[data-case="comment-body-1"]';
const ISSUE = '[data-case="issue-description"]';
// ما قاسته T-0.2 لكل متصفح؛ الاختيار وقت التشغيل يجب أن يطابقه.
const EXPECTED = {
  chrome: { engine: 'translator-api', ready: true },
  brave: { engine: 'translator-api', ready: true },
  edge: { engine: 'translator-api', ready: false },
  firefox: { engine: 'none', ready: false },
};
const NOT_READY = 'لم يجهز مترجم المتصفح بعد';
const RETRY_WAIT_MS = 15000;

const code = await bundleEntry({ root: ROOT, entry: path.join(HERE, 'entry.ts'), serveDir: SERVE, extraFiles: { [`${FIXTURE.name}.html`]: FIXTURE.file } });
const server = await serveDir(SERVE);
const { checks, check } = recorder();
const output = {
  measuredAt: new Date().toISOString(),
  machine: machineInfo(),
  conditions: 'ملف تعريف مؤقت جديد لكل متصفح بلا واجهة (headless)؛ المحرك الحقيقي الذي يختاره selectLocalEngine في الصفحة (العالم الرئيسي، 127.0.0.1)؛ نقر وتحديد بالفأرة فعليان؛ الشيفرة كما تُشحن',
  results: [],
};

async function open(b) {
  await b.open(`${server.url}/${FIXTURE.name}.html`);
  await inject(b, code);
}

async function clickAt(b, at, what) {
  if (!at) throw new Error(`لا زر: ${what}`);
  await click(b, at.x, at.y);
}

/** نقرة زر الترجمة ثم انتظار انتهاء الجلسة؛ «لم يجهز بعد» (NotSupportedError المتقطع) يُعاد بعد مهلة كما يعيده المستخدم، حتى ثلاث مرات. */
async function translateBody(b, body) {
  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const t0 = Date.now();
    await call(b, 'barButton', { body, action: 'translate' });
    await settle(120);
    const at = await call(b, 'barButton', { body, action: 'translate' });
    if (!at) throw new Error(`لا زر ترجمة في ${body}: ${JSON.stringify({ attempts, state: await call(b, 'barState', body) })}`);
    await click(b, at.x, at.y);
    const state = await waitFor(async () => {
      const s = await call(b, 'barState', body);
      return s && (s.phase === 'done' || s.phase === 'error' || s.phase === 'empty') ? s : null;
    }, 240000, 250);
    attempts.push({ attempt, ms: Date.now() - t0, phase: state?.phase ?? 'timeout', note: state?.note });
    if (state?.phase !== 'error' || !state.note?.includes(NOT_READY)) break;
    await sleep(RETRY_WAIT_MS);
  }
  return { attempts, final: attempts.at(-1), result: await call(b, 'translated', body) };
}

async function readyFlows(b) {
  const label = b.label;
  const r = {};
  const m = await call(b, 'mount', { href: FIXTURE.href });
  check(label, 'الواجهة', 'خمسة أشرطة بمحرك Translator API', m.bars === 5 && m.engine === 'translator-api', m);
  for (const [name, body, blocks] of [['README', README, 17], ['تعليق', COMMENT1, 2], ['وصف مشكلة', ISSUE, 2]]) {
    const t = await translateBody(b, body);
    r[name] = t;
    const res = t.result;
    check(label, name, `النقر يترجم بالمحرك الحقيقي: ${blocks} فقرة بين مترجمة ومحفوظ أصلها، والمترجمة عربية`, t.final.phase === 'done' && res.translations + res.warnings === blocks && res.translations > 0 && res.arabic === res.translations, t);
    check(label, name, 'لا اسم رمز ولا صيغة سلك في المعروض، والعناصر المحمية المعروضة من الأصل حرفيًا', !res.tokenLeak && res.protectedAllFromOriginal, res);
  }
  // نص محدد: تحديد فعلي بالفأرة ثم «ترجمة المحدد».
  const d = await call(b, 'dragFor', { selector: '[data-case="p-sentences"]', chars: 38 });
  await drag(b, d.x1, d.y1, d.x2, d.y2);
  await settle(300);
  let sel = await call(b, 'selectionUi');
  check(label, 'نص محدد', 'تحديد فعلي يُظهر «ترجمة المحدد»', Boolean(sel.button) && sel.selected.length > 5, sel);
  if (sel.button) {
    await clickAt(b, sel.button, 'translate-selection');
    sel = await waitFor(async () => {
      const s = await call(b, 'selectionUi');
      return s.card && s.card.status !== 'working' ? s : null;
    }, 60000, 250);
    r.selection = sel?.card;
    check(label, 'نص محدد', 'البطاقة تعرض ترجمة عربية للتحديد بالمحرك الحقيقي', sel?.card?.status === 'translated' && sel.card.arabic, sel?.card);
  }
  return r;
}

async function unavailableFlows(b, reason) {
  const label = b.label;
  const r = {};
  const m = await call(b, 'mount', { href: FIXTURE.href });
  const st = await call(b, 'barState', README);
  r.bar = st;
  check(label, 'غياب المحرك', 'الأشرطة تظهر بالسبب الصريح وزر «نسخ النص المقنَّع»', m.bars === 5 && st.note === `المحرك غير متاح: ${reason}` && st.actions.includes('copy-masked'), { m, st });
  await clickAt(b, await call(b, 'barButton', { body: README, action: 'translate' }), 'translate');
  await settle(300);
  check(label, 'غياب المحرك', 'الضغط على «ترجمة» لا يترجم شيئًا', (await call(b, 'translated', README)).translations === 0, null);
  await clickAt(b, await call(b, 'barButton', { body: README, action: 'copy-masked' }), 'copy-masked');
  await settle(300);
  const copied = await call(b, 'copiedTexts');
  const after = await call(b, 'barState', README);
  r.copied = copied[0]?.slice(0, 400);
  r.copyNote = after.note;
  const leaks = ['npm install', 'pnpm install', 'readerMode', '@octocat', 'src/components/common/Explain.tsx'].filter((s) => copied[0]?.includes(s));
  check(label, 'غياب المحرك', 'النسخ يضع نص الفقرات السبع عشرة مقنَّعًا: رموز ⟦…⟧ بلا قيم العناصر المحمية، ويُعلَن', copied.length === 1 && copied[0].split('\n\n').length === 17 && /⟦CODE_\d+⟧/.test(copied[0]) && leaks.length === 0 && after.note.includes('نُسخ النص المقنَّع'), { leaks, note: after.note });
  const d = await call(b, 'dragFor', { selector: '[data-case="p-sentences"]', chars: 38 });
  await drag(b, d.x1, d.y1, d.x2, d.y2);
  await settle(300);
  let sel = await call(b, 'selectionUi');
  if (sel.button) {
    await clickAt(b, sel.button, 'translate-selection');
    await settle(300);
    sel = await call(b, 'selectionUi');
    check(label, 'غياب المحرك', 'بطاقة التحديد: السبب الصريح وزر النسخ', sel.card?.status === 'unavailable' && sel.card.notice === `المحرك غير متاح: ${reason}` && Boolean(sel.copyButton), sel.card);
    if (sel.copyButton) {
      await clickAt(b, sel.copyButton, 'copy-masked (selection)');
      await settle(300);
      sel = await call(b, 'selectionUi');
      const texts = await call(b, 'copiedTexts');
      r.selectionCopied = texts[1];
      check(label, 'غياب المحرك', 'نسخ التحديد مقنَّعًا ويُعلَن', texts.length === 2 && texts[1].startsWith('The side panel') && sel.card?.copyNote?.includes('نُسخ'), { texts, card: sel.card });
    }
  } else check(label, 'غياب المحرك', 'تحديد فعلي يُظهر «ترجمة المحدد»', false, sel);
  return r;
}

async function corpusRun(b) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await open(b);
    await clickAt(b, await call(b, 'armCorpus', REFERENCE), 'run corpus');
    const result = await waitFor(() => call(b, 'corpusResult'), 900000, 2000);
    if (!result) return { attempt, error: 'timeout' };
    const outcomes = result.withWireFormat?.outcomes ?? [];
    const notReady = outcomes.length > 0 && outcomes.every((o) => o.status === 'error' && o.error?.includes(NOT_READY));
    if (!notReady) return { attempt, ...result };
    await sleep(RETRY_WAIT_MS);
  }
  return { error: 'NotSupportedError في ثلاث محاولات' };
}

try {
  for (const key of keys) {
    const b = await openBrowser(key);
    await blockExternalScripts(b);
    const label = b.label;
    const r = { browser: label, version: b.version };
    try {
      await open(b);
      r.detect = await call(b, 'detect');
      const expected = EXPECTED[key];
      const ready = r.detect.availability.state === 'ready';
      check(label, 'الاختيار', `المحرك ${expected.engine} ${expected.ready ? 'جاهز' : 'غير متاح'} كما قاسته T-0.2، باكتشاف وقت التشغيل`, r.detect.engine === expected.engine && ready === expected.ready, r.detect);
      r.ui = ready ? await readyFlows(b) : await unavailableFlows(b, r.detect.availability.reason);
      await call(b, 'stop');
      const urls = await call(b, 'resources').catch(() => []);
      const external = urls.filter((u) => !u.startsWith(server.url));
      r.externalRequests = external;
      check(label, 'الشبكة', 'لا طلب من الصفحة إلى أي مضيف خارج الخادم المحلي أثناء الترجمة أو البديل', external.length === 0, external);
      if (ready) {
        r.corpus = await corpusRun(b);
        const all = r.corpus.withWireFormat?.rates?.all;
        check(label, 'المجموعة المرجعية', 'كل العناصر تمر بالمحرك بلا خطأ، ولا يُعرض نص لم يجتز الفاحص', Boolean(all) && all.errors === 0 && all.n === all.firstAttemptPassed + all.passedAfterSentenceRetry + all.originalKept, all ?? r.corpus);
      }
    } catch (e) {
      r.error = String(e.stack ?? e);
      console.error(`${label}: ${e}`);
      check(label, '-', 'اكتمال التشغيل', false, r.error);
    } finally {
      await b.close();
    }
    output.results.push(r);
    const mine = checks.filter((c) => c.browser === label);
    const rate = r.corpus?.withWireFormat?.rates?.withTokens;
    const base = r.corpus?.planFormatBaseline?.rates?.withTokens;
    console.error(`${label} ${b.version}: ${mine.filter((c) => c.ok).length}/${mine.length} فحصًا${rate ? ` · بالرموز ${rate.n}: أولى ${rate.firstAttemptPassed} · بعد الإعادة ${rate.passedAfterSentenceRetry} · أصل ${rate.originalKept}${base ? ` (خط الأساس: أولى ${base.firstAttemptPassed} · أصل ${base.originalKept})` : ''}` : ''}`);
  }
} finally {
  await server.close();
}
output.checks = checks;
const failed = checks.filter((c) => !c.ok);
console.error(`المجموع: ${checks.length - failed.length}/${checks.length} فحصًا اجتاز`);
if (outDir) writeJson(path.join(outDir, 'T-4.3/browser-results.json'), output);
if (failed.length) process.exitCode = 1;

// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// MJ-TA-01 (تدقيق القبول، مانع إصدار): جسم المفتاح الخاص يبقى في البرومبت بعد «الحجب». اختبارات سلوكية لا تفترض واجهة داخلية: تُقاس على ثلاثة أسطح يراها
// المستخدم وتغادر المتصفح أو الحافظة: (1) prepareAnalysis().prompt (ما يُرسل إلى المزوّد)، (2) نص زر «نسخ البرومبت» (promptFor، وزر الوحدة نفسها على DOM)،
// (3) ما تعرضه نافذة الموافقة في «اعرض ما سيُرسل». على كل واحد: لا مقطع متصل من 16 حرفًا فأكثر من جسم المفتاح (بعد إسقاط ما ليس من أبجدية base64: فواصل
// الأسطر وبادئات الاقتباس والفروق وأرقام السجل)، ولا سطر END، ويبقى النص المجاور (قبل البداية وبعد النهاية) وعدّاد المحجوب.
// المفاتيح تُولَّد وقت التشغيل (pem-keys.ts) ولا يُطبع جسم أي مفتاح: التأكيدات على أعداد وقيم منطقية.
// تشغيل: npx vitest run tests/acceptance-remediation/integrity/pem-redaction.test.ts
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeLog } from '../../../src/modules/d/log-parser/parse';
import { createCopyPromptModule } from '../../../src/modules/e/copy-prompt';
import type { CopyFn } from '../../../src/modules/e/copy-prompt';
import { buildContext, secretKinds } from '../../../src/modules/e/context';
import type { ContextOptions, ContextPageKind, ContextSource } from '../../../src/modules/e/context';
import { PROMPT_IDS, promptFor } from '../../../src/modules/e/prompt-templates';
import { ConsentSheet, prepareAnalysis } from '../../../src/modules/e/provider';
import type { PreparedAnalysis } from '../../../src/modules/e/provider';
import { selectors, sourceOf } from '../../modules/e/context/samples';
import { NOW, SAMPLES, mountOn, view } from '../../modules/e/copy-prompt/helpers';
import { AFTER, BEFORE, BETWEEN, baseSource, has, leak, longKey, pem, pgpBlock, privateKeys, publicBlocks, rewrapped, shortKey } from './pem-keys';
import type { SyntheticBlock } from './pem-keys';

// ───────────────────────── الأسطح الثلاثة ─────────────────────────

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const DESTINATION = { provider: 'Synthetic', host: 'api.synthetic.invalid', model: { id: 'synthetic-model', displayName: 'Synthetic Model' }, permission: true };

/** نافذة الموافقة كما يراها المستخدم: النص بعد «اعرض ما سيُرسل»، وصف «استُبعد» (فيه عدّاد المحجوب). */
function consentOf(prepared: PreparedAnalysis): { preview: string; excluded: string } {
  act(() => render(h(ConsentSheet, { prepared, destination: DESTINATION, onConfirm: () => {}, onCancel: () => {}, onSettings: () => {} }), container));
  const toggle = container.querySelector<HTMLButtonElement>('[data-action="consent-preview"]');
  if (!toggle) throw new Error('نافذة الموافقة بلا زر المعاينة');
  act(() => toggle.click());
  const preview = container.querySelector('[data-consent-preview]')?.textContent ?? '';
  const excluded = container.querySelector('[data-consent-row="excluded"]')?.textContent ?? '';
  if (!preview) throw new Error('المعاينة فارغة');
  act(() => render(null, container));
  return { preview, excluded };
}

interface Surfaces {
  /** prepareAnalysis().prompt لكل قوالب البرومبت الخمسة، مجمعة. */
  readonly prompt: string;
  /** نص زر النسخ (promptFor) لكل القوالب، مجمعًا. */
  readonly copy: string;
  /** معاينة الموافقة لكل القوالب، مجمعة. */
  readonly preview: string;
  /** عدّاد المحجوب في ملخص الموافقة (consent.masked). */
  readonly masked: number;
  /** هل يذكر وصف «استُبعد» في الموافقة أن شيئًا حُجب. */
  readonly sheetReportsMasked: boolean;
}

/** كل الأسطح على مصدر واحد، بكل القوالب (فيظهر الجزء في القالب الذي يعرضه). */
function surfaces(source: ContextSource, options: ContextOptions = {}): Surfaces {
  const ctx = buildContext(source, options);
  const prompt: string[] = [];
  const copy: string[] = [];
  const preview: string[] = [];
  let sheetReportsMasked = true;
  for (const id of PROMPT_IDS) {
    const prepared = prepareAnalysis(ctx, { template: id, task: 'Synthetic test' });
    prompt.push(prepared.prompt);
    copy.push(promptFor(id, source, options).text);
    const sheet = consentOf(prepared);
    preview.push(sheet.preview);
    if (prepared.consent.masked > 0 && !sheet.excluded.includes('حُجب')) sheetReportsMasked = false;
  }
  return { prompt: prompt.join('\n'), copy: copy.join('\n'), preview: preview.join('\n'), masked: ctx.secrets.total, sheetReportsMasked };
}

/** سطر موجز لكل سطح: «prompt w=209 e=5». أعداد فقط، فلا يُطبع جسم مفتاح عند الفشل. */
const describeLeak = (name: string, text: string, keys: readonly SyntheticBlock[]): string | null => {
  const l = leak(text, keys);
  return l.windows === 0 && l.endLines === 0 ? null : `${name} w=${l.windows} e=${l.endLines}`;
};

/** لا جسم ولا END على أي سطح. عند الفشل تظهر القائمة: ['prompt w=209 e=5', 'copy …', 'preview …'] (w نوافذ الجسم الباقية، e أسطر END). */
function expectNoKeyMaterial(out: Surfaces, keys: readonly SyntheticBlock[], label: string): void {
  const leaks = [describeLeak('prompt', out.prompt, keys), describeLeak('copy', out.copy, keys), describeLeak('preview', out.preview, keys)].filter((v) => v !== null);
  expect(leaks, label).toEqual([]);
}

/** النص المجاور حاضر على كل سطح (وإلا يكون الاختبار فارغًا: الجزء لم يُعرض أصلًا). */
function expectPresent(out: Surfaces, needle: string, label: string): void {
  const missing = (['prompt', 'copy', 'preview'] as const).filter((k) => !has(out[k], needle));
  expect(missing, `${label} (النص المجاور مفقود)`).toEqual([]);
}

// ───────────────────────── حاملات المحتوى ─────────────────────────

interface Carrier {
  readonly name: string;
  /** سطور مولَّدة قبل أول سطر محتوى في الكتلة المقتطعة (عنوان مقتطفات السجل، وترويستا الفروق). */
  readonly generatedLines: number;
  readonly limit: 'description' | 'comment' | 'error' | 'snippet' | 'log' | 'changes';
  readonly make: (lines: readonly string[]) => { source: ContextSource; options: ContextOptions };
}

const asDiff = (lines: readonly string[], prefix: string): ContextSource =>
  baseSource({
    kind: 'diff',
    changes: {
      totals: { files: 1, additions: lines.length, deletions: 0 },
      files: [{ path: 'deploy/service.key', kind: 'other', additions: prefix === '+' ? lines.length : 0, deletions: prefix === '-' ? lines.length : 0, patch: [`@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => `${prefix}${l}`)].join('\n') }],
      complete: true,
    },
  });

const CARRIERS: readonly Carrier[] = [
  { name: 'وصف المشكلة', generatedLines: 0, limit: 'description', make: (lines) => ({ source: baseSource({ description: lines.join('\n') }), options: {} }) },
  { name: 'تعليق', generatedLines: 0, limit: 'comment', make: (lines) => ({ source: baseSource({ comments: [{ id: 'issuecomment-1', author: 'octo-dev', at: null, text: lines.join('\n') }] }), options: {} }) },
  { name: 'مقتطف الخطأ', generatedLines: 0, limit: 'error', make: (lines) => ({ source: baseSource({ kind: 'job', errorExcerpt: lines }), options: {} }) },
  { name: 'مقتطف دليل يضيفه المستخدم', generatedLines: 0, limit: 'snippet', make: (lines) => ({ source: baseSource(), options: { snippets: [{ id: '1', text: lines.join('\n'), where: 'الصفحة' }] } }) },
  {
    name: 'سجل مهمة: رسالة تنبيه متعددة الأسطر (analyzeLog كما في اختبار كودكس)',
    generatedLines: 1,
    limit: 'log',
    make: (lines) => ({
      source: baseSource({ kind: 'job', log: analyzeLog({ text: null, source: 'annotations', annotations: [{ message: lines.join('\n'), level: 'failure', step: null, line: null }] }) }),
      options: {},
    }),
  },
  { name: 'فروق طلب دمج: أسطر مضافة (+)', generatedLines: 2, limit: 'changes', make: (lines) => ({ source: asDiff(lines, '+'), options: {} }) },
  { name: 'فروق طلب دمج: أسطر محذوفة (-)', generatedLines: 2, limit: 'changes', make: (lines) => ({ source: asDiff(lines, '-'), options: {} }) },
];

const KEY_CASES = privateKeys().map((k) => [k.name, k] as const);
const sandwich = (key: SyntheticBlock): string[] => [BEFORE, ...pem(key).split('\n'), AFTER];

// ───────────────────────── أ. كتل كاملة في الوصف ─────────────────────────

describe('MJ-TA-01 أ. كتلة مفتاح خاص كاملة في وصف المشكلة', () => {
  it.each(KEY_CASES)('%s: لا جسم ولا END في البرومبت ولا نص النسخ ولا معاينة الموافقة؛ والنص حولها وعدّاد المحجوب باقيان', (_name, key) => {
    const out = surfaces(baseSource({ description: sandwich(key).join('\n') }));
    expectNoKeyMaterial(out, [key], key.name);
    expectPresent(out, BEFORE, 'النص قبل البداية');
    expectPresent(out, AFTER, 'النص بعد END');
    expect(out.masked, 'عدّاد المحجوب').toBeGreaterThanOrEqual(1);
    expect(out.sheetReportsMasked, 'الموافقة تذكر الحجب').toBe(true);
  });

  it('prepareAnalysis().consent.masked ينص على موضع محجوب واحد على الأقل لكل صيغة', () => {
    for (const key of privateKeys()) {
      const prepared = prepareAnalysis(buildContext(baseSource({ description: sandwich(key).join('\n') })), { template: 'understand', task: 'Synthetic test' });
      expect({ name: key.name, masked: prepared.consent.masked >= 1 }).toEqual({ name: key.name, masked: true });
    }
  });
});

describe('MJ-TA-01 أ. زر «نسخ البرومبت» نفسه على صفحة (DOM) فيها المفتاح في الوصف وفي تعليق', () => {
  it.each(KEY_CASES)('%s: النص المنسوخ إلى الحافظة بلا جسم ولا END، والتنبيه المختصر للمحجوب ظاهر', async (_name, key) => {
    const copied: string[] = [];
    const copy: CopyFn = async (text) => {
      copied.push(text);
      return { ok: true, via: 'clipboard' };
    };
    const { manager } = await mountOn(SAMPLES.pr, [createCopyPromptModule({ copy, settings: { template: () => 'understand', lineLimit: () => 400 }, now: () => NOW })], () => {
      const hosts = [selectors().resolve(document, 'e.body')?.element, document.querySelector('#issuecomment-1001 .js-comment-body')];
      for (const host of hosts) {
        if (!host) throw new Error('عينة الطلب بلا موضع الوصف أو التعليق');
        const lead = document.createElement('p');
        lead.textContent = BEFORE;
        const block = document.createElement('pre');
        block.textContent = pem(key);
        const tail = document.createElement('p');
        tail.textContent = AFTER;
        host.append(lead, block, tail);
      }
    });
    try {
      await view().click('[data-action="copy-prompt"]');
      expect(copied).toHaveLength(1);
      const text = copied[0] ?? '';
      expect(describeLeak('copied', text, [key]), key.name).toBeNull();
      expect({ before: has(text, BEFORE), after: has(text, AFTER) }).toEqual({ before: true, after: true });
      expect(view().q('[data-note="private"]'), 'تنبيه المحتوى الخاص المحجوب').not.toBeNull();
    } finally {
      manager.stop();
    }
  });
});

// ───────────────────────── ب. حاملات أخرى ─────────────────────────

describe('MJ-TA-01 ب. المفتاح نفسه في كل حامل: تعليق، مقتطف خطأ، مقتطف دليل، سجل مهمة، فروق طلب دمج', () => {
  const key = longKey();
  it.each(CARRIERS.map((c) => [c.name, c] as const))('%s', (_name, carrier) => {
    const { source, options } = carrier.make(sandwich(key));
    const out = surfaces(source, options);
    expectNoKeyMaterial(out, [key], carrier.name);
    expectPresent(out, BEFORE, 'النص قبل البداية');
    expect(out.masked, 'عدّاد المحجوب').toBeGreaterThanOrEqual(1);
  });

  // سجل نصي (لا تنبيه): كما في الإضافة، يمرّ نصه على الجامع (collectContext بإضافة log على عينة صفحة مهمة Actions)، وفيه يقتطع analyzeLog نافذة سياق حول سطر
  // ##[error] (5 أسطر قبله و2 بعده) قبل أي تنقيح. فالحجب الصحيح هنا إما قبل analyzeLog أو يشمل الأسطر المجاورة لسطر END.
  const logText = (rows: readonly string[]): string => rows.map((r) => `2026-10-20T09:20:00.0000000Z ${r}`).join('\n');
  const jobWith = (rows: readonly string[]): ContextSource => sourceOf(SAMPLES.checks, { log: { text: logText(rows), source: 'job-log' } });

  it('سجل Actions نصي: مفتاح بسطر جسم واحد يقع كله في نافذة سياق سطر الخطأ', () => {
    const k = shortKey();
    const out = surfaces(jobWith(['##[group]Run deploy.sh', BEFORE, ...pem(k).split('\n'), '##[error]openssl: unable to load the key (exit 1)', AFTER, '##[endgroup]']));
    expectNoKeyMaterial(out, [k], 'سجل نصي بمفتاح قصير');
    expectPresent(out, BEFORE, 'النص قبل البداية');
  });

  // الأصعب: نافذة السياق (5 أسطر قبل سطر الخطأ) تقطع المفتاح الطويل فلا يبقى فيها سطر BEGIN، وتحمل آخر أسطر الجسم وسطر END. التنقيح الذي يرى الأسطر
  // منفصلة (أو يقرأ المقتطف بعد اقتطاعه) لا يعرف أن هذه الأسطر جسم مفتاح؛ فيلزم الحجب على نص السجل قبل analyzeLog أو بما يشمل الأسطر المجاورة لـEND.
  it('سجل Actions نصي: مفتاح طويل لا تحمل نافذة سياق سطر الخطأ إلا ذيله (أسطر الجسم الأخيرة وEND) بلا ترويسة', () => {
    const out = surfaces(jobWith(['##[group]Run deploy.sh', BEFORE, ...pem(key).split('\n'), '##[error]openssl: unable to load the key (exit 1)', AFTER, '##[endgroup]']));
    expectNoKeyMaterial(out, [key], 'سجل نصي بمفتاح طويل: ذيل المفتاح في نافذة السياق');
  });
});

// ───────────────────────── ج. كتل ناقصة ─────────────────────────
// الخاصية المختبَرة: لا يبقى جسم المفتاح، وما قبل سطر BEGIN يبقى. ما بعد كتلة بلا END غير مختبَر عمدًا (قرار الإصلاح: الحجب إلى نهاية الحقل أو إلى أول
// سطر ليس base64؛ كلاهما مقبول)، وما قبل البداية وحده مضمون البقاء.

describe('MJ-TA-01 ج. كتل ناقصة: BEGIN وجسم بلا END، وكتلة يقطعها حد الاقتطاع', () => {
  const key = longKey();

  it.each(CARRIERS.map((c) => [c.name, c] as const))('%s: BEGIN وجسم بلا END في آخر النص', (_name, carrier) => {
    const { source, options } = carrier.make([BEFORE, key.header, ...key.lines]);
    const out = surfaces(source, options);
    expectNoKeyMaterial(out, [key], carrier.name);
    expectPresent(out, BEFORE, 'النص قبل البداية');
    expect(out.masked, 'عدّاد المحجوب').toBeGreaterThanOrEqual(1);
  });

  it('وصف: BEGIN وجسم بلا END يتلوهما سطر نثر ليس base64 (لا يُختبر بقاء النثر أو حذفه)', () => {
    const out = surfaces(baseSource({ description: [BEFORE, key.header, ...key.lines, 'Thanks, please advise how to proceed.'].join('\n') }));
    expectNoKeyMaterial(out, [key], 'نثر بعد جسم بلا END');
    expectPresent(out, BEFORE, 'النص قبل البداية');
  });

  // حد الأسطر يقطع الكتلة: الأولى في منتصف الجسم، والثانية بعد آخر سطر جسم مباشرة (كل الجسم باقٍ وEND مقتطع: أخطرها)، والثالثة عند END تمامًا.
  const cuts: ReadonlyArray<readonly [string, (carrier: Carrier) => number]> = [
    ['في منتصف الجسم (بعد 3 أسطر منه)', (c) => c.generatedLines + 1 + 1 + 3],
    ['بعد آخر سطر جسم مباشرة: كل الجسم باقٍ وEND مقتطع', (c) => c.generatedLines + 1 + 1 + key.lines.length],
    ['عند END تمامًا: الكتلة كاملة والنص بعدها مقتطع', (c) => c.generatedLines + 1 + 1 + key.lines.length + 1],
  ];
  for (const [cutName, limitOf] of cuts) {
    it.each(CARRIERS.map((c) => [c.name, c] as const))(`حد الأسطر يقطع الكتلة ${cutName} — %s`, (_name, carrier) => {
      const { source, options } = carrier.make(sandwich(key));
      const out = surfaces(source, { ...options, limits: { [carrier.limit]: limitOf(carrier) } });
      expectNoKeyMaterial(out, [key], `${carrier.name} / ${cutName}`);
      expectPresent(out, BEFORE, 'النص قبل البداية');
      expect(out.masked, 'عدّاد المحجوب').toBeGreaterThanOrEqual(1);
    });
  }
});

// ───────────────────────── د. أشكال الكتابة ─────────────────────────

describe('MJ-TA-01 د. أشكال كتابة الكتلة: CRLF، اقتباس، إزاحة، سياج شيفرة، مفتاحان، JSON، سطر واحد', () => {
  const key = longKey();
  const rows = pem(key).split('\n');
  const legacy = ((): string[] => {
    const k = privateKeys()[1] as SyntheticBlock;
    return [k.header, 'Proc-Type: 4,ENCRYPTED', 'DEK-Info: AES-128-CBC,0123456789ABCDEF0123456789ABCDEF', '', ...k.lines, k.footer];
  })();
  const legacyKey = privateKeys()[1] as SyntheticBlock;

  const variants: ReadonlyArray<readonly [string, string, SyntheticBlock]> = [
    ['CRLF', [BEFORE, ...rows, AFTER].join('\r\n'), key],
    ['اقتباس Markdown «> »', [BEFORE, ...rows.map((l) => `> ${l}`), AFTER].join('\n'), key],
    ['اقتباس متداخل «> > »', [BEFORE, ...rows.map((l) => `> > ${l}`), AFTER].join('\n'), key],
    ['إزاحة 4 مسافات', [BEFORE, ...rows.map((l) => `    ${l}`), AFTER].join('\n'), key],
    ['إزاحة بعلامة جدولة', [BEFORE, ...rows.map((l) => `\t${l}`), AFTER].join('\n'), key],
    ['مسافات زائدة في نهاية كل سطر', [BEFORE, ...rows.map((l) => `${l}   `), AFTER].join('\n'), key],
    ['سياج شيفرة ```', [BEFORE, '```', ...rows, '```', AFTER].join('\n'), key],
    ['سياج شيفرة بلغة ```pem داخل اقتباس', [BEFORE, '> ```pem', ...rows.map((l) => `> ${l}`), '> ```', AFTER].join('\n'), key],
    ['سطر فارغ داخل الجسم', [BEFORE, ...rows.slice(0, 6), '', ...rows.slice(6), AFTER].join('\n'), key],
    ['الجسم سطر واحد طويل بلا التفاف', [BEFORE, key.header, rewrapped(key, 0).lines.join(''), key.footer, AFTER].join('\n'), key],
    ['الجسم ملتفّ عند 76 عمودًا', [BEFORE, key.header, ...rewrapped(key, 76).lines, key.footer, AFTER].join('\n'), key],
    ['ترويسات PEM القديمة (Proc-Type وDEK-Info وسطر فارغ) قبل الجسم', [BEFORE, ...legacy, AFTER].join('\n'), legacyKey],
    ['كل الكتلة في سطر واحد بفواصل مسافات (كما يطوي HTML المسافات)', `${BEFORE} ${key.header} ${key.lines.join(' ')} ${key.footer} ${AFTER}`, key],
    ['سلسلة JSON بـ«\\n» حرفية (مفتاح حساب خدمة)', `{"type": "${BEFORE}", "private_key": "${key.header}\\n${key.lines.join('\\n')}\\n${key.footer}\\n", "client_email": "${AFTER}"}`, key],
  ];

  it.each(variants)('%s', (name, text, subject) => {
    const out = surfaces(baseSource({ description: text }));
    expectNoKeyMaterial(out, [subject], name);
    expectPresent(out, BEFORE, 'النص قبل البداية');
    expectPresent(out, AFTER, 'النص بعد END');
    expect(out.masked, 'عدّاد المحجوب').toBeGreaterThanOrEqual(1);
  });

  it('CRLF وسجل نصي (عبر الجامع): سطر ينتهي بـ\\r لا يفلت من الحجب', () => {
    const k = shortKey();
    const rows = ['##[group]Run deploy.sh', BEFORE, ...pem(k).split('\n'), '##[error]bad key', AFTER];
    const text = rows.map((r) => `2026-10-20T09:20:00.0000000Z ${r}`).join('\r\n');
    const out = surfaces(sourceOf(SAMPLES.checks, { log: { text, source: 'job-log' } }));
    expectNoKeyMaterial(out, [k], 'CRLF في سجل نصي');
  });

  it('مفتاحان من صيغتين في نص واحد: يُحجبان معًا ويبقى النص بينهما وبعدهما (لا مطابقة جشعة تبتلعه)، والعدّاد ≥ 2', () => {
    const a = longKey();
    const b = privateKeys()[4] as SyntheticBlock;
    const out = surfaces(baseSource({ description: [BEFORE, pem(a), BETWEEN, pem(b), AFTER].join('\n') }));
    expectNoKeyMaterial(out, [a, b], 'مفتاحان');
    expectPresent(out, BEFORE, 'النص قبل الأولى');
    expectPresent(out, BETWEEN, 'النص بين الكتلتين');
    expectPresent(out, AFTER, 'النص بعد الثانية');
    expect(out.masked, 'عدّاد المحجوب').toBeGreaterThanOrEqual(2);
  });

  it('مفتاحان في حاملين مختلفين (وصف وتعليق) يُحجبان وكل سطح يعدّهما', () => {
    const a = longKey();
    const b = privateKeys()[2] as SyntheticBlock;
    const out = surfaces(baseSource({ description: [BEFORE, pem(a), AFTER].join('\n'), comments: [{ id: 'issuecomment-2', author: 'octo-dev', at: null, text: [BETWEEN, pem(b)].join('\n') }] }));
    expectNoKeyMaterial(out, [a, b], 'وصف وتعليق');
    expectPresent(out, BETWEEN, 'نص التعليق قبل مفتاحه');
    expect(out.masked, 'عدّاد المحجوب').toBeGreaterThanOrEqual(2);
  });
});

// ───────────────────────── هـ. الحالات السلبية ─────────────────────────

describe('MJ-TA-01 هـ. ما ليس مفتاحًا خاصًا لا يُعدّ ولا يُمسّ (سلوك الأساس: لا يُمسّ)', () => {
  const { publicKey, certificate } = publicBlocks();
  const whole = (b: SyntheticBlock): string[] => [b.header, ...b.lines, b.footer];
  const intact = (text: string, b: SyntheticBlock): boolean => b.lines.every((l) => text.includes(l)) && text.includes(b.footer);

  it.each([
    ['BEGIN PUBLIC KEY', publicKey],
    ['BEGIN CERTIFICATE', certificate],
  ] as const)('%s: لا يُحجب ولا يُعدّ سرًّا؛ الكتلة تصل كما هي إلى كل سطح', (_name, subject) => {
    const out = surfaces(baseSource({ description: [BEFORE, ...whole(subject), AFTER].join('\n') }));
    expect({ masked: out.masked }).toEqual({ masked: 0 });
    expect({ prompt: intact(out.prompt, subject), copy: intact(out.copy, subject), preview: intact(out.preview, subject) }).toEqual({ prompt: true, copy: true, preview: true });
    expectPresent(out, AFTER, 'النص بعد الكتلة');
  });

  it('مفتاح عام وشهادة بجانب مفتاح خاص: الخاص وحده يُحجب، والعام والشهادة باقيان، والعدّاد يعدّ الخاص فقط (≥ 1)', () => {
    const secret = longKey();
    const out = surfaces(baseSource({ description: [BEFORE, ...whole(publicKey), BETWEEN, ...whole(certificate), BETWEEN, pem(secret), AFTER].join('\n') }));
    expectNoKeyMaterial(out, [secret], 'خاص بين عام وشهادة');
    expect({ prompt: intact(out.prompt, publicKey) && intact(out.prompt, certificate), copy: intact(out.copy, publicKey) && intact(out.copy, certificate) }).toEqual({ prompt: true, copy: true });
    expectPresent(out, AFTER, 'النص بعد الخاص');
    expect(out.masked, 'عدّاد المحجوب').toBeGreaterThanOrEqual(1);
  });

  it('نثر يذكر «private key» و«BEGIN PRIVATE KEY» بلا شرطات لا يُحجب ولا يُعدّ', () => {
    const prose = `${BEFORE} rotate the private key and remove BEGIN PRIVATE KEY blocks from the repo ${AFTER}`;
    const out = surfaces(baseSource({ description: prose }));
    expect({ masked: out.masked, prose: has(out.prompt, prose) && has(out.copy, prose) && has(out.preview, prose) }).toEqual({ masked: 0, prose: true });
  });
});

// ───────────────────────── و. فحص صفحة البلاغ ─────────────────────────

describe('MJ-TA-01 و. فحص صفحة الإبلاغ (secretKinds): يمنع الإرسال والنسخ إن رصد شيئًا', () => {
  it.each(KEY_CASES)('%s: نص فيه الكتلة كاملة يُرصد', (_name, key) => {
    expect(secretKinds(`description:\n${pem(key)}\n`).length, key.name).toBeGreaterThanOrEqual(1);
  });

  it('نص فيه BEGIN وجسم بلا END يُرصد (الترويسة كافية للمنع)', () => {
    const key = longKey();
    expect(secretKinds([BEFORE, key.header, ...key.lines].join('\n')).length).toBeGreaterThanOrEqual(1);
  });

  it('نص عادي لا يُرصد فيه شيء', () => {
    expect(secretKinds('The settings page throws when the theme toggle is clicked twice.')).toEqual([]);
  });

  // توصيف لا حكم: جسم مفتاح أُزيلت ترويسته وحدها. لا نمط يرصده في الأساس (لا ترويسة ولا بادئة ثابتة في base64 المتغيّر)؛ فالفاحص يعيد قائمة (فارغة في الأساس).
  // لا نؤكد ما لا يمكن ضمانه، وإنما نثبت ألا يرمي وأن يعيد قائمة. وإن غيّر الإصلاح هذا السلوك (كرصد سطر END وحده) فلا يكسر هذا الاختبار.
  it('توصيف: جسم بلا ترويسة، وسطر END وحده، وجسم مع END بلا BEGIN — لا يرمي الفحص ويعيد قائمة', () => {
    const key = longKey();
    const results = [secretKinds(key.lines.join('\n')), secretKinds(key.footer), secretKinds([...key.lines, key.footer].join('\n'))];
    for (const r of results) expect(Array.isArray(r)).toBe(true);
  });
});

// ───────────────────────── خارج ادعاء التدقيق (يمكن حذفه) ─────────────────────────

describe('خارج ادعاء MJ-TA-01 (يقرّره المهندس): كتلة PGP المدرَّعة', () => {
  // النمط الحالي /-----BEGIN [A-Z ]*PRIVATE KEY-----/ لا يطابق «-----BEGIN PGP PRIVATE KEY BLOCK-----» لأن «BLOCK» تفصل بين «KEY» والشرطات.
  it('«BEGIN PGP PRIVATE KEY BLOCK» كاملة: لا جسم ولا END على أي سطح', () => {
    const pgp = pgpBlock();
    const text = [BEFORE, pgp.header, ...pgp.preamble, ...pgp.lines, pgp.footer, AFTER].join('\n');
    const out = surfaces(baseSource({ description: text }));
    const asKey: SyntheticBlock = { name: 'pgp', header: pgp.header, footer: pgp.footer, lines: pgp.lines, body: pgp.body };
    expectNoKeyMaterial(out, [asKey], 'PGP');
    expectPresent(out, AFTER, 'النص بعد END');
  });
});

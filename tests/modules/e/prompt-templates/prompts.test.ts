// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// TEST-CTX-08 (AC-E8): القوالب الخمسة (فهم المشكلة، تشخيص الخطأ، مراجعة التغييرات، تحديد الخطوة التالية، تسليم المهمة لجلسة برمجة) على العينة
// المرجعية (fixture-pr-complex.html بوصف وتعليقات + فحوص API من fixture-check-runs.json + سجل الاختبار برموز وهمية): كلٌّ يولّد أقسامه المعرّفة
// بترتيبها وبقيمها الصحيحة من بنية السياق نفسها؛ وفي كل برومبت قسم «المعلومات الناقصة» بما لم يُجمع وسببه؛ ولا نص للصفحة كاملًا ولا بيان لم يصل
// إلى البنية؛ ولا سرّ مطابق للقائمة المعرّفة بعد التنقيح. ومعها المشكلة والفحوص والفروق، وغياب الشبكة.
import { describe, expect, it, vi } from 'vitest';
import { ITEM, buildContext, contextItems, maskOf } from '../../../../src/modules/e/context';
import type { ContextStructure, Part } from '../../../../src/modules/e/context';
import { scanText } from '../../../../src/modules/e/privacy-check';
import { CLOSING_LINE, MISSING_HEADING, NOT_RECEIVED_LINE, PROMPTS, PROMPT_IDS, promptFor, promptHeadings, renderPrompt, sectionsFor } from '../../../../src/modules/e/prompt-templates';
import type { PromptId } from '../../../../src/modules/e/prompt-templates';
import { HEAD, LEAKY_LOG, LEAKY_SNIPPET, LOG, NOW, SAMPLES, apiFor, contextOf, fake, plantSecrets, sourceOf } from '../context/samples';

/** البنية المرجعية: الطلب المرجعي وقراءة API لرأسه وسجل الاختبار برموزه الوهمية ومقتطف دليل برمز، وأسرار مزروعة في أجزاء الصفحة. */
const reference = (): ContextStructure => contextOf(SAMPLES.pr, { api: apiFor(HEAD), log: { text: LEAKY_LOG } }, { snippets: [LEAKY_SNIPPET] }, plantSecrets);

const headingsOf = (text: string): string[] => text.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
const base = (heading: string): string => heading.replace(/ \(.*\)$/, '');

/** متن قسم بعنوانه (بلا السطر الفارغ الأخير). */
function bodyOf(text: string, heading: string): string[] {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.startsWith('## ') && base(l.slice(3)) === heading);
  expect(at, heading).toBeGreaterThan(-1);
  const rest = lines.slice(at + 2);
  const end = rest.findIndex((l) => l.startsWith('## ') || l === '---');
  const body = rest.slice(0, end === -1 ? undefined : end);
  while (body.length && body[body.length - 1] === '') body.pop();
  return body;
}

/** الأقسام المعرّفة لكل قالب على صفحة طلب الدمج، بترتيبها، و«المعلومات الناقصة» آخرها. */
const EXPECTED: Record<PromptId, string[]> = {
  understand: ['المطلوب', 'المصدر', 'العنوان والوصف', 'النقاش', 'حالة الطلب', 'الفحوص', 'مقتطفات الأدلة', MISSING_HEADING],
  diagnose: ['المطلوب', 'المصدر', 'وصف المشكلة', 'الفحوص الفاشلة', 'مقتطف الخطأ', 'مقتطفات السجل', 'ما استخرجه محلل السجل', 'التغييرات المرتبطة', 'مقتطفات الأدلة', 'روابط الأدلة', MISSING_HEADING],
  review: ['المطلوب', 'المصدر', 'وصف التغيير', 'التغييرات', 'نتائج الفحوص', 'ملاحظات المراجعين', 'مقتطفات الأدلة', 'روابط الأدلة', MISSING_HEADING],
  'next-step': ['المطلوب', 'المصدر', 'الوصف', 'الحالة والموانع', 'نتائج الفحوص', 'مقتطف الخطأ', 'آخر النقاش', 'التغييرات', 'مقتطفات الأدلة', MISSING_HEADING],
  handoff: ['المطلوب', 'المستودع', 'الفرع والالتزام', 'المهمة', 'حال الفحوص', 'مقتطف الخطأ', 'مقتطفات السجل', 'ما استخرجه محلل السجل', 'التغييرات المرتبطة', 'آخر ما قيل', 'مقتطفات الأدلة', 'روابط الأدلة', MISSING_HEADING],
};

describe('TEST-CTX-08: القوالب الخمسة وأقسامها المعرّفة على العينة المرجعية', () => {
  it('خمسة قوالب بالأسماء العربية والإنجليزية المعتمدة في الخطة', () => {
    expect(PROMPTS.map((p) => [p.id, p.label, p.english])).toEqual([
      ['understand', 'فهم المشكلة', 'Understand the Issue'],
      ['diagnose', 'تشخيص الخطأ', 'Diagnose the Error'],
      ['review', 'مراجعة التغييرات', 'Review the Changes'],
      ['next-step', 'تحديد الخطوة التالية', 'Decide the Next Step'],
      ['handoff', 'تسليم المهمة لجلسة برمجة', 'Hand Off to a Coding Session'],
    ]);
  });

  it.each(PROMPT_IDS)('%s: أقسامه المعرّفة بترتيبها، والعنوان، و«المعلومات الناقصة» آخرها ثم سطر الاعتماد على ما ورد', (id) => {
    const ctx = reference();
    const { text } = renderPrompt(id, ctx);
    expect(headingsOf(text).map(base)).toEqual(EXPECTED[id]);
    expect(promptHeadings(id, 'pr')).toEqual(EXPECTED[id]);
    const def = PROMPTS.find((p) => p.id === id);
    expect(text.split('\n')[0]).toBe(`# ${def?.label}: feat: refresh the settings UI ${maskOf('aws-access-key')}`);
    expect(text).toContain(`قالب البرومبت: ${def?.label} (${def?.english}) · طلب الدمج`);
    expect(text.split('\n').at(-1)).toBe(CLOSING_LINE);
    const found = headingsOf(text);
    expect(new Set(found).size).toBe(found.length);
  });

  it.each(PROMPT_IDS)('%s: متن كل قسم من الصفحة هو جزء بنية السياق بعينه (لا عرض موازٍ)، والغائب سطر «لم يصل» وحده', (id) => {
    const ctx = reference();
    const { text } = renderPrompt(id, ctx);
    const def = PROMPTS.find((p) => p.id === id);
    for (const spec of sectionsFor(def as NonNullable<typeof def>, 'pr')) {
      if (spec.kind !== 'part') continue;
      const body = bodyOf(text, spec.heading);
      let part: Part | null;
      if (spec.part === 'source' || spec.part === 'repo' || spec.part === 'branch') {
        const lines = spec.part === 'branch' ? ctx.parts.branch : spec.part === 'repo' ? ctx.parts.repo : [...ctx.parts.repo, ...ctx.parts.branch];
        expect(body.slice(0, lines.length), spec.heading).toEqual(lines);
        continue;
      }
      part = ctx.parts[spec.part];
      if (part) expect(body.join('\n'), spec.heading).toBe(part.body.join('\n'));
      else expect(body, spec.heading).toEqual([NOT_RECEIVED_LINE]);
    }
  });

  it('القيم الصحيحة من العينة المرجعية في أقسام كل قالب', () => {
    const ctx = reference();
    const t = (id: PromptId) => renderPrompt(id, ctx).text;
    // فهم المشكلة: المصدر والوصف والنقاش والحالة والفحوص (API والصفحة معًا).
    expect(bodyOf(t('understand'), 'المصدر')).toEqual([
      '- المستودع: `octo/demo` — https://github.com/octo/demo',
      '- طلب الدمج #4242: https://github.com/octo/demo/pull/4242',
      '- الفرع: `feature/ui-refresh` ← `main`',
      `- التزام الرأس: \`${HEAD}\``,
      '- جُمع: 2026-10-24 09:30 UTC من الصفحة المفتوحة',
    ]);
    expect(t('understand')).toContain('> Refresh the settings UI and move the theme toggle into the header.');
    expect(t('understand')).toContain('### reviewer-a — 2026-10-21T10:15:00Z');
    expect(bodyOf(t('understand'), 'حالة الطلب')).toContain('- حالة الطلب: مفتوح');
    expect(bodyOf(t('understand'), 'الفحوص').join('\n')).toMatch(/`test-macOS`[\s\S]*`ci \/ lint \(pull_request\)`|`ci \/ lint \(pull_request\)`[\s\S]*`test-macOS`/);
    // تشخيص الخطأ: الفاشلة والخطأ والسجل بأسطره والسبب المثبت بنمطه والاحتمال موسومًا والتغييرات والروابط.
    const diagnose = t('diagnose');
    expect(bodyOf(diagnose, 'الفحوص الفاشلة')).toContain('- ✗ فاشل: `preview-deploy` — Failing after 1m');
    expect(bodyOf(diagnose, 'مقتطف الخطأ').join('\n')).toContain(`ci / lint (pull_request): Failing after 4m (token ${maskOf('github-token')})`);
    expect(bodyOf(diagnose, 'مقتطفات السجل').join('\n')).toContain("> 481 | src/settings/panel.ts(42,7): error TS2322: Type 'string' is not assignable to type 'number'.");
    expect(bodyOf(diagnose, 'ما استخرجه محلل السجل').join('\n')).toContain('**سبب مثبت بنمط** «خطأ مترجم TypeScript»: فشلت ترجمة TypeScript بالخطأ TS2322 في src/settings/panel.ts:42');
    expect(bodyOf(diagnose, 'ما استخرجه محلل السجل').join('\n')).toContain('**احتمال يحتاج تحققًا**');
    expect(bodyOf(diagnose, 'التغييرات المرتبطة')[0]).toContain('12 ملفًا، +1204، −87');
    expect(bodyOf(diagnose, 'روابط الأدلة')).toContain(`- التزام الرأس: https://github.com/octo/demo/commit/${HEAD}`);
    // مراجعة التغييرات: ملاحظات المراجعين من التعليقات.
    expect(bodyOf(t('review'), 'ملاحظات المراجعين').join('\n')).toContain('The lint job fails on src/settings/panel.tsx: unused import useMemo.');
    // تحديد الخطوة التالية: الموانع بأدلتها من الصفحة ومن API ومصدرها ووقتها.
    const next = bodyOf(t('next-step'), 'الحالة والموانع').join('\n');
    expect(next).toContain('- **يمنع**: تعارض مع فرع الهدف يجب حله');
    expect(next).toContain('mergeable_state = dirty');
    expect(next).toContain('- مصدر الأدلة: الصفحة وGitHub API (قُرئت 2026-10-24 09:30 UTC).');
    // تسليم المهمة: المستودع وحده، ثم الفرع والالتزام في قسمهما.
    expect(bodyOf(t('handoff'), 'المستودع')).toEqual(['- المستودع: `octo/demo` — https://github.com/octo/demo', '- طلب الدمج #4242: https://github.com/octo/demo/pull/4242', '- جُمع: 2026-10-24 09:30 UTC من الصفحة المفتوحة']);
    expect(bodyOf(t('handoff'), 'الفرع والالتزام')).toEqual(['- الفرع: `feature/ui-refresh` ← `main`', `- التزام الرأس: \`${HEAD}\``]);
  });
});

describe('TEST-CTX-08: قسم «المعلومات الناقصة» بما لم يُجمع وسببه في كل برومبت', () => {
  it.each(PROMPT_IDS)('%s على العينة المرجعية: فجوات الجمع وما اقتُطع، وما حُجب من الأسرار بعدده وأجزائه', (id) => {
    const ctx = reference();
    const { text, missing } = renderPrompt(id, ctx);
    const section = bodyOf(text, MISSING_HEADING);
    expect(section).toEqual(missing);
    expect(section.join('\n')).toContain('تعليق مطوي لـspam-bot');
    expect(section.join('\n')).toContain('12 عنصرًا مخفيًا');
    expect(section.join('\n')).toMatch(/\*\*أسرار محتملة\*\* \(حُجبت\): \d+ موضعًا/);
    for (const line of section) expect(line, line).toMatch(/^- \*\*[^*]+\*\*( \([^)]+\))?: .{5,}/);
  });

  it.each(PROMPT_IDS)('%s على صفحة مشكلة: كل قسم لم يصل يُعلن بسببه (لا فحوص ولا سجل ولا تغييرات في صفحة المشكلة)', (id) => {
    const { text, missing } = renderPrompt(id, contextOf(SAMPLES.issue));
    const def = PROMPTS.find((p) => p.id === id) as NonNullable<(typeof PROMPTS)[number]>;
    const absent = sectionsFor(def, 'issue').filter((s) => s.kind === 'part' && bodyOf(text, s.heading).join('\n') === NOT_RECEIVED_LINE);
    expect(absent.length).toBeGreaterThan(0);
    const named = (m: string): string[] => (/^- \*\*([^*]+)\*\*: /.exec(m)?.[1] ?? '').split(' · ');
    for (const s of absent) expect(missing.some((m) => named(m).includes(s.heading)), s.heading).toBe(true);
    if (id === 'diagnose') {
      expect(missing).toContain('- **الفحوص الفاشلة**: صفحة المشكلة لا تحمل فحوصًا');
      expect(missing).toContain('- **مقتطفات السجل · ما استخرجه محلل السجل**: لا سجل فحص في صفحة المشكلة');
      expect(missing).toContain('- **التغييرات المرتبطة**: صفحة المشكلة لا تحمل تغييرات');
    }
  });

  it('صفحة المهمة (فحوص) وصفحة الفروق: السجل المحجوب والفرع غير المقروء والتغييرات بأسطرها كلٌّ في موضعه', () => {
    const job = renderPrompt('handoff', contextOf(SAMPLES.checks));
    expect(job.missing).toEqual(
      expect.arrayContaining([
        '- **مقتطف الخطأ** (غير متاح): نص السجل محجوب عن غير المسجَّل في هذه الصفحة',
        '- **الفرع والالتزام**: صفحة المهمة لا يُقرأ منها فرع ولا التزام',
        '- **مقتطفات السجل · ما استخرجه محلل السجل**: نص السجل محجوب عن غير المسجَّل في هذه الصفحة',
      ]),
    );
    const diff = renderPrompt('review', contextOf(SAMPLES.diff));
    expect(bodyOf(diff.text, 'التغييرات').join('\n')).toContain('```diff\ndiff --git a/README b/README\n@@ -1 +1 @@\n-Hello World!\n+Hello world!\n```');
    expect(headingsOf(diff.text).map(base)).toEqual(promptHeadings('review', 'diff'));
  });
});

describe('TEST-CTX-08: لا نص الصفحة كاملًا، ولا بيان لم يصل، ولا سرّ بعد التنقيح', () => {
  it.each(PROMPT_IDS)('%s: لا شيء من نص الصفحة خارج أجزاء البنية (المطوي والتنقل والترويسة) ولا السجل كاملًا', (id) => {
    const { text } = renderPrompt(id, reference());
    for (const outside of ['Buy followers', 'Pull request navigation tabs', 'wants to merge 3 commits into', 'Operating System', 'Runner Image', 'GH_TOKEN=ghp_']) expect(text, outside).not.toContain(outside);
    expect(text.length).toBeLessThan((document.body.textContent ?? '').length + LOG.length);
    expect(text.split('\n').length).toBeLessThan(LOG.split('\n').length);
  });

  it('ما لم يصل لا يُذكر: إلغاء الفحوص والخطأ والسجل والموانع (وأدلتها صفوف الفحوص) يُخلي البرومبت من كل قيمة منها ويعلنها ناقصة', () => {
    const source = sourceOf(SAMPLES.pr, { log: { text: LOG } });
    const selected = new Set(contextItems(source, []).filter((id) => id !== ITEM.checks && id !== ITEM.error && id !== ITEM.log && id !== ITEM.status));
    const ctx = buildContext(source, { selected, collectedAt: NOW });
    for (const id of PROMPT_IDS) {
      const { text, missing } = renderPrompt(id, ctx);
      for (const value of ['Failing after 4m', '`EasyCLA`', 'TS2322', 'Process completed with exit code', 'خطأ مترجم TypeScript']) expect(text, `${id}: ${value}`).not.toContain(value);
      expect(missing.some((m) => m.includes('لم يُختر')), id).toBe(true);
    }
  });

  it.each(PROMPT_IDS)('%s: لا يبقى في البرومبت موضع مطابق لقائمة الأنماط المعرّفة، والمحجوب ظاهر بعلامته', (id) => {
    const { text } = renderPrompt(id, reference());
    expect(scanText(text)).toEqual([]);
    for (const token of Object.values(fake)) expect(text).not.toContain(token);
    expect(text).toContain('[محجوب: ');
  });

  it('لا يُبنى برومبت من بنية لم تُحجب أسرارها (flag)، وpromptFor يحجب دائمًا', () => {
    const source = sourceOf(SAMPLES.pr, { log: { text: LEAKY_LOG } }, plantSecrets);
    expect(() => renderPrompt('diagnose', buildContext(source, { secrets: 'flag' }))).toThrow(/mask/);
    const built = promptFor('diagnose', source, { snippets: [LEAKY_SNIPPET], collectedAt: NOW });
    expect(scanText(built.text)).toEqual([]);
    expect(built.text).toContain(`GITHUB_PAT=${maskOf('github-fine-grained')}`);
  });

  it('القوالب نصوص محلية ثابتة: التوليد لا يطلب شيئًا من الشبكة ولا يحتاج مفتاحًا', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const xhr = vi.spyOn(XMLHttpRequest.prototype, 'open');
    const ctx = reference();
    for (const id of PROMPT_IDS) renderPrompt(id, ctx);
    for (const sample of Object.values(SAMPLES)) for (const id of PROMPT_IDS) renderPrompt(id, contextOf(sample));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

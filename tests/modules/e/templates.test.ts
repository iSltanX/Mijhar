// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// TEST-CTX-03 (AC-E3): كل قالب من الأربعة (تشخيص مشكلة، مراجعة تغيير، تسليم مهمة، استكمال عمل) يولّد أقسامه المعرّفة بترتيبها على العينة المرجعية
// (fixture-pr-context.html، أي fixture-pr-complex.html بوصف وتعليقات)، وبمحتواها الصحيح من الصفحة نفسها؛ وقائمة الاختيار تحكم ما يدخل (والقسم الذي
// لا يدخل يقول ذلك ولا يُختلق)؛ والقسم الإلزامي «ما تعذّر جمعه أو اقتُطع لطوله» في كل قالب بالبنود نفسها؛ والقوالب لا تبني مسارًا موازيًا لأجزاء المنشئ.
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GAPS_HEADING, ITEM, availableItems, buildBundle, collectContext } from '../../../src/modules/e/builder';
import type { Snippet } from '../../../src/modules/e/builder';
import { EMPTY_SECTION_LINE, TEMPLATES, TEMPLATE_IDS, bundleFileName, renderTemplate, templateHeadings } from '../../../src/modules/e/templates';
import type { TemplateId } from '../../../src/modules/e/templates';
import { E_FIXTURE, ROOT, builderSelectors, loadFile, pageAt } from './helpers';

const PR = 'https://github.com/octo/demo/pull/4242';
const HEAD = '22c15d5f509f0a7076b74b3f0f48a740802103b4';
const NOW = Date.UTC(2026, 9, 24, 9, 30);
const EVIDENCE: Snippet = { id: '1', text: "src/settings/panel.tsx:3:10  error  'useMemo' is defined but never used", where: 'تعليق reviewer-a' };

function prSource() {
  loadFile(E_FIXTURE);
  return collectContext(document, builderSelectors(), pageAt(PR), 'pr');
}

const headingsOf = (text: string): string[] => text.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));

/** الأقسام المعرّفة لكل قالب كما تنص الخطة (أسماء العناوين بلا تفصيل العدد)، بترتيبها، والإلزامي في آخرها. */
const EXPECTED: Record<TemplateId, string[]> = {
  diagnose: ['المطلوب', 'المصدر', 'وصف المشكلة', 'الفحوص ونتائجها', 'مقتطف الخطأ', 'التعليقات ذات الصلة', 'مقتطفات الأدلة', GAPS_HEADING],
  review: ['المطلوب', 'نقاط المراجعة', 'المصدر', 'وصف التغيير', 'نتائج الفحوص', 'مقتطف الخطأ', 'ملاحظات المراجعين', 'مقتطفات الأدلة', GAPS_HEADING],
  handoff: ['المطلوب', 'المهمة والمصدر', 'الوصف', 'الحالة الحالية للفحوص', 'مقتطف الخطأ', 'آخر ما قيل', 'الأدلة', 'ما أُنجز', 'ما تبقّى', 'قرارات وتنبيهات', GAPS_HEADING],
  resume: ['المطلوب', 'أين توقفنا', 'الوصف', 'حال الفحوص', 'مقتطف الخطأ', 'آخر التعليقات', 'مقتطفات الأدلة', 'الخطوة التالية', GAPS_HEADING],
};

/** يُسقط تفصيل العدد بين قوسين من آخر العنوان. */
const base = (heading: string): string => heading.replace(/ \(.*\)$/, '');

describe('TEST-CTX-03: القوالب الأربعة وأقسامها المعرّفة', () => {
  it('أربعة قوالب بالأسماء العربية والإنجليزية المعتمدة', () => {
    expect(TEMPLATES.map((t) => [t.id, t.label, t.english])).toEqual([
      ['diagnose', 'تشخيص مشكلة', 'Bug / CI Failure Diagnosis'],
      ['review', 'مراجعة تغيير', 'Code / PR Review'],
      ['handoff', 'تسليم مهمة', 'Task Handoff'],
      ['resume', 'استكمال عمل', 'Resume Work Summary'],
    ]);
    expect(TEMPLATE_IDS).toEqual(['diagnose', 'review', 'handoff', 'resume']);
  });

  it.each(TEMPLATE_IDS)('%s: يولّد أقسامه المعرّفة بترتيبها على العينة المرجعية، والقسم الإلزامي آخرها', (id) => {
    const s = prSource();
    const all = new Set(availableItems(s, [EVIDENCE]));
    const { text } = renderTemplate(id, s, [EVIDENCE], all, undefined, NOW);
    const found = headingsOf(text);
    expect(found.map(base)).toEqual(EXPECTED[id]);
    expect(templateHeadings(id)).toEqual(EXPECTED[id]);
    const template = TEMPLATES.find((t) => t.id === id);
    expect(text.split('\n')[0]).toBe(`# ${template?.titlePrefix}: feat: refresh the settings UI`);
    expect(text).toContain(`قالب: ${template?.label} (${template?.english})`);
    expect(text).toContain('2026-10-24 09:30 UTC');
    // لا قسم فارغ التسمية ولا مكرر.
    expect(new Set(found).size).toBe(found.length);
  });

  it.each(TEMPLATE_IDS)('%s: أقسام الصفحة بقيمها الصحيحة من العينة (المستودع والفرع والوصف والتعليقات والفحوص ومقتطف الخطأ والدليل)', (id) => {
    const s = prSource();
    const { text } = renderTemplate(id, s, [EVIDENCE], new Set(availableItems(s, [EVIDENCE])), undefined, NOW);
    expect(text).toContain('- المستودع: `octo/demo` — https://github.com/octo/demo');
    expect(text).toContain(`- طلب الدمج #4242: ${PR}`);
    expect(text).toContain('- الفرع: `feature/ui-refresh` ← `main`');
    expect(text).toContain(`- التزام الرأس: \`${HEAD}\``);
    expect(text).toContain('> Refresh the settings UI and move the theme toggle into the header.');
    expect(text).toContain('### reviewer-a — 2026-10-21T10:15:00Z');
    expect(text).toContain('- ✗ فاشل: `ci / lint (pull_request)` — إلزامي — Failing after 4m');
    expect(text).toContain('ci / lint (pull_request): Failing after 4m');
    expect(text).toContain("'useMemo' is defined but never used");
    // الأعداد في عناوين الأقسام التي تحملها (2 من 2 تعليقًا، ومقتطف واحد).
    expect(headingsOf(text).some((h) => /^(التعليقات ذات الصلة|ملاحظات المراجعين|آخر ما قيل|آخر التعليقات) \(2 من 2\)$/.test(h))).toBe(true);
    expect(headingsOf(text).some((h) => /^(مقتطفات الأدلة|الأدلة) \(1\)$/.test(h))).toBe(true);
  });

  it('كل قالب بتوجيهه الخاص: التوجيه المعرّف في قالبه وحده، وقسم «يُملأ» بتلميح لا بمحتوى مختلق', () => {
    const s = prSource();
    const all = new Set(availableItems(s, [EVIDENCE]));
    const text = (id: TemplateId) => renderTemplate(id, s, [EVIDENCE], all, undefined, NOW).text;
    expect(text('diagnose')).toContain('حدّد الخطأ المثبت والسبب المحتمل مع أدلته');
    expect(text('review')).toContain('- هل يطابق التغيير ما يصفه؟');
    expect(text('review')).toContain('- هل يمسّ الأمان أو الخصوصية أو التوافق مع ما قبله؟');
    expect(text('handoff')).toContain('أسلّمك هذه المهمة لتتابعها');
    expect(text('resume')).toContain('لاستئناف العمل لاحقًا من حيث توقفنا');
    for (const id of ['diagnose', 'review', 'resume'] as const) expect(text(id)).not.toContain('أسلّمك هذه المهمة');
    // أقسام «تُملأ» يدويًا: ما أُنجز وما تبقّى وقرارات (التسليم)، والخطوة التالية (الاستكمال): تلميح فقط.
    const handoff = text('handoff');
    for (const heading of ['ما أُنجز', 'ما تبقّى', 'قرارات وتنبيهات']) {
      const at = handoff.indexOf(`## ${heading}`);
      expect(at, heading).toBeGreaterThan(0);
      expect(handoff.slice(at, at + 120)).toContain('اكتب هنا قبل النسخ');
    }
    expect(text('resume')).toContain('## الخطوة التالية\n\n(يكتبها صاحب العمل: اكتب هنا قبل النسخ.)');
    expect(text('diagnose')).not.toContain('اكتب هنا قبل النسخ');
  });

  it.each(TEMPLATE_IDS)('%s: القسم الإلزامي «ما تعذّر جمعه أو اقتُطع لطوله» ببنود الحزمة العامة نفسها (المطوي وغير المحمّل والقائمة المطوية والمقتطع بعدد أسطره)', (id) => {
    const s = prSource();
    const all = new Set(availableItems(s, [EVIDENCE]));
    const generic = buildBundle(s, [EVIDENCE], all, undefined, NOW);
    const rendered = renderTemplate(id, s, [EVIDENCE], all, undefined, NOW);
    expect(rendered.gaps).toEqual(generic.gaps);
    const section = rendered.text.slice(rendered.text.indexOf(`## ${GAPS_HEADING}`));
    expect(section).toContain('spam-bot');
    expect(section).toContain('12 عنصرًا');
    expect(section).toContain('قُرئ 9 من 12');
    expect(section).toMatch(/حُذف \d+ سطرًا من \d+/);
    expect(section.split('\n').filter((l) => l.startsWith('- **'))).toHaveLength(rendered.gaps.length);
    // آخر أقسام الحزمة قبل التذييل.
    expect(headingsOf(rendered.text).at(-1)).toBe(GAPS_HEADING);
    expect(rendered.text).toContain('ولم تُرسل إلى أي جهة');
  });

  it.each(TEMPLATE_IDS)('%s: ما يدخل القسم هو بعينه جزء المنشئ (لا مسار موازٍ): متن كل جزء في القالب حرفيًا هو متنه في الحزمة العامة', (id) => {
    const s = prSource();
    const all = new Set(availableItems(s, [EVIDENCE]));
    const generic = buildBundle(s, [EVIDENCE], all, undefined, NOW).text;
    const template = renderTemplate(id, s, [EVIDENCE], all, undefined, NOW).text;
    const bodyOf = (text: string, heading: RegExp): string => {
      const start = text.split('\n').findIndex((l) => heading.test(l));
      expect(start, String(heading)).toBeGreaterThan(-1);
      const rest = text.split('\n').slice(start + 2);
      const end = rest.findIndex((l) => l.startsWith('## ') || l === '---');
      return rest.slice(0, end === -1 ? undefined : end).join('\n').trimEnd();
    };
    // الوصف والتعليقات والفحوص والخطأ والأدلة.
    const pairs: Array<[RegExp, RegExp]> = [
      [/^## العنوان والوصف$/, /^## (وصف المشكلة|وصف التغيير|الوصف)$/],
      [/^## التعليقات المختارة/, /^## (التعليقات ذات الصلة|ملاحظات المراجعين|آخر ما قيل|آخر التعليقات)/],
      [/^## نتائج الفحوص/, /^## (الفحوص ونتائجها|نتائج الفحوص|الحالة الحالية للفحوص|حال الفحوص)/],
      [/^## مقتطف الخطأ$/, /^## مقتطف الخطأ$/],
      [/^## مقتطفات الأدلة/, /^## (مقتطفات الأدلة|الأدلة)/],
    ];
    for (const [inGeneric, inTemplate] of pairs) expect(bodyOf(template, inTemplate)).toBe(bodyOf(generic, inGeneric));
  });
});

describe('قائمة الاختيار تحكم القوالب، وما لم يدخل يُعلن ولا يُختلق', () => {
  it.each(TEMPLATE_IDS)('%s: إلغاء الفحوص والخطأ يُبقي القسم بعنوانه وسطر «لم يُدرج» بلا أي محتوى منهما', (id) => {
    const s = prSource();
    const selected = new Set(availableItems(s, [EVIDENCE]));
    selected.delete(ITEM.checks);
    selected.delete(ITEM.error);
    const { text } = renderTemplate(id, s, [EVIDENCE], selected, undefined, NOW);
    expect(headingsOf(text).map(base)).toEqual(EXPECTED[id]);
    expect(text).not.toContain('Failing after 4m');
    expect(text).not.toContain('`EasyCLA`');
    expect(text).toContain(EMPTY_SECTION_LINE);
    // والأجزاء الأخرى باقية.
    expect(text).toContain('> Refresh the settings UI');
    expect(text).toContain('### reviewer-a');
  });

  it.each(TEMPLATE_IDS)('%s: بلا أي عنصر مختار: كل أقسام الصفحة تقول «لم يُدرج» والإلزامي باقٍ، وتبقى العناوين والتوجيه', (id) => {
    const s = prSource();
    const { text } = renderTemplate(id, s, [EVIDENCE], new Set(), undefined, NOW);
    expect(headingsOf(text).map(base)).toEqual(EXPECTED[id]);
    const template = TEMPLATES.find((t) => t.id === id);
    const pageSections = (template?.sections ?? []).filter((x) => x.kind === 'page').length;
    expect(text.split('\n').filter((l) => l === EMPTY_SECTION_LINE)).toHaveLength(pageSections);
    expect(text).not.toContain('octo/demo');
    expect(text).not.toContain('Refresh the settings UI');
    expect(text).toContain(`## ${GAPS_HEADING}`);
    expect(text.split('\n')[0]).toBe(`# ${template?.titlePrefix}: طلب الدمج`);
  });

  it('حدود الأسطر نفسها: التعليق الطويل يُقتطع بعدد أسطره المحذوفة في القالب وفي قسمه الإلزامي', () => {
    const s = prSource();
    const { text, gaps } = renderTemplate('review', s, [], new Set(availableItems(s, [])), { description: 40, comment: 5, error: 20, snippet: 30 }, NOW);
    const cut = gaps.find((g) => g.kind === 'truncated');
    expect(cut?.cut?.lines).toBeGreaterThan(0);
    expect(text).toContain(`حُذف ${cut?.cut?.lines} سطرًا من ${cut?.cut?.of}`);
  });
});

describe('القوالب على صفحة مشكلة وصفحة مهمة حقيقيتين محفوظتين', () => {
  it('مشكلة: بلا فرع ولا فحوص فيقول القسم ذلك، وعنوان الحزمة بعنوان المشكلة', () => {
    loadFile(path.join(ROOT, 'fixtures/spikes/gh-issue-etos-1.html'));
    const s = collectContext(document, builderSelectors(), pageAt('https://github.com/salktbi902/etos/issues/1'), 'issue');
    for (const id of TEMPLATE_IDS) {
      const { text } = renderTemplate(id, s, [], new Set(availableItems(s, [])), undefined, NOW);
      expect(headingsOf(text).map(base)).toEqual(EXPECTED[id]);
      expect(text).toContain('- المشكلة #1: https://github.com/salktbi902/etos/issues/1');
      expect(text).not.toContain('- الفرع:');
      expect(text).toContain(EMPTY_SECTION_LINE);
      expect(text.split('\n')[0]).toContain('Local Debug');
    }
  });

  it('مهمة Actions: الخطوات ومقتطف الخطأ من التنبيهات في كل قالب', () => {
    loadFile(path.join(ROOT, 'fixtures/logs/gh-job-failed.html'));
    const href = 'https://github.com/microsoft/vscode/actions/runs/39905618450/job/120256773911';
    const s = collectContext(document, builderSelectors(), pageAt(href), 'job');
    for (const id of TEMPLATE_IDS) {
      const { text } = renderTemplate(id, s, [], new Set(availableItems(s, [])), undefined, NOW);
      expect(headingsOf(text).map(base)).toEqual(EXPECTED[id]);
      expect(text).toContain(`- مهمة Actions: ${href}`);
      expect(text).toContain('[failure]');
    }
  });
});

describe('اسم ملف التنزيل وغياب الشبكة', () => {
  it('اسم الملف: صفحة المصدر ثم مستودعه ورقمه ثم القالب، بحروف آمنة', () => {
    const s = prSource();
    expect(bundleFileName(s, null)).toBe('mijhar-pr-octo-demo-4242-context.md');
    expect(bundleFileName(s, 'diagnose')).toBe('mijhar-pr-octo-demo-4242-diagnose.md');
    expect(bundleFileName({ ...s, repo: null, number: null, kind: 'job' }, 'resume')).toBe('mijhar-job-resume.md');
    expect(bundleFileName({ ...s, repo: 'a b/c:d' }, 'review')).toBe('mijhar-pr-a-b-c-d-4242-review.md');
  });

  it('التوليد بالقوالب لا يطلب شيئًا من الشبكة', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const s = prSource();
    for (const id of TEMPLATE_IDS) renderTemplate(id, s, [EVIDENCE], new Set(availableItems(s, [EVIDENCE])));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

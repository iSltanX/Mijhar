// TEST-COMM-03 (AC-H3) — التلخيص «كما ورد»: خطوات الأقسام نصًّا، وسياسات مقتبسة، وكتل الشيفرة مستثناة، وما لا يرد لا يُختلق.
import { describe, expect, it } from 'vitest';
import { firstHeading, parseSections, plain, summarizeContributing, summarizeReadme, summarizeTemplate } from '../../../../src/modules/h/first-contribution';
import { fixtureText } from '../helpers';

const CONTRIBUTING = fixtureText('fixture-contributing.md');
const normalize = (text: string): string => text.replace(/[`*_]/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ');

describe('plain', () => {
  it('يحذف تنسيق Markdown ويبقي النص', () => {
    expect(plain('Run **`npm test`** and see [the docs](https://x.y) <b>now</b>')).toBe('Run npm test and see the docs now');
    expect(plain('![logo](a.png) text')).toBe('text');
  });
});

describe('parseSections', () => {
  it('أقسام بعناوينها ومستوياتها، وتخطي الكتل المسيّجة', () => {
    const sections = parseSections(CONTRIBUTING);
    expect(sections.map((s) => s.heading)).toEqual(['Contributing to community', 'Getting started', 'Development setup', 'Submitting a pull request', 'Reporting issues', 'Translations', 'License']);
    expect(sections[0]?.level).toBe(1);
    expect(sections.flatMap((s) => s.body).join('\n')).not.toContain('not a step');
  });

  it('مستند بلا عناوين قسم واحد بلا عنوان', () => {
    expect(parseSections('نص فقط\nسطر ثانٍ')).toEqual([{ heading: '', level: 0, body: ['نص فقط', 'سطر ثانٍ'] }]);
    expect(parseSections('')).toEqual([]);
  });
});

describe('summarizeContributing', () => {
  const summary = summarizeContributing(CONTRIBUTING);

  it('الأقسام ذات الصلة بخطواتها كما وردت، بترتيبها', () => {
    expect(summary.groups.map((g) => g.heading)).toEqual(['Getting started', 'Development setup', 'Submitting a pull request', 'Reporting issues']);
    expect(summary.groups[0]?.steps).toEqual(['Fork the repository and clone it locally.', 'Create a branch from main for your change.', 'Run npm install to install the dependencies.']);
    expect(summary.groups[2]?.steps).toEqual(['Make sure the tests pass.', 'Add tests for new behavior.', 'Open the pull request and link the issue it closes.']);
  });

  it('كل خطوة نص موجود في الملف الأصلي (لا اختلاق)', () => {
    const source = normalize(CONTRIBUTING);
    for (const group of summary.groups) for (const step of group.steps) expect(source, step).toContain(normalize(step));
  });

  it('كتلة الشيفرة لا تُقرأ خطوات، وأقسام غير ذات صلة (الترخيص) لا تدخل', () => {
    const all = summary.groups.flatMap((g) => g.steps);
    expect(all).not.toContain('not a step');
    expect(summary.groups.map((g) => g.heading)).not.toContain('License');
  });

  it('السياسات المعلنة مقتبسة بنصها: مشكلة أولًا وCLA وDCO وCrowdin واختبارات وأسلوب', () => {
    const ids = summary.notes.map((n) => n.id);
    expect(ids).toEqual(expect.arrayContaining(['issue-first', 'cla', 'dco', 'external-translation', 'tests-required', 'style']));
    const source = normalize(CONTRIBUTING);
    for (const note of summary.notes) expect(source, note.id).toContain(normalize(note.quote));
    expect(summary.notes.find((n) => n.id === 'issue-first')?.quote).toBe('Please open an issue first to discuss any large change before submitting a pull request.');
  });

  it('ملف بلا خطوات ولا سياسات يعلن أنه فارغ ولا يختلق', () => {
    const empty = summarizeContributing('# CONTRIBUTING\n\nPlease be nice.\n');
    expect(empty.groups).toEqual([]);
    expect(empty.notes).toEqual([]);
    expect(empty.intro).toBeNull();
    expect(empty.empty).toBe(true);
  });

  it('فقرة تمهيد طويلة تُقتبس حين لا خطوات', () => {
    const result = summarizeContributing('# Contributing\n\nWe review every pull request within a week and appreciate small focused changes.\n');
    expect(result.intro).toBe('We review every pull request within a week and appreciate small focused changes.');
    expect(result.empty).toBe(false);
  });

  it('عربي: أقسام «إعداد البيئة» و«طلب سحب» بخطواتها', () => {
    const ar = summarizeContributing(fixtureText('fixture-contributing-ar.md'));
    expect(ar.groups.map((g) => g.heading)).toEqual(['إعداد البيئة', 'إرسال طلب سحب']);
    expect(ar.groups[0]?.steps[1]).toBe('ثبّت الاعتماديات بالأمر npm install.');
  });

  it('سقوف: ثماني خطوات للمجموعة وطول الخطوة', () => {
    const long = `# Contributing\n\n## Setup\n${Array.from({ length: 12 }, (_, i) => `${i + 1}. step ${i} ${'x'.repeat(10)}`).join('\n')}\n- ${'y'.repeat(500)}\n`;
    const result = summarizeContributing(long);
    expect(result.groups[0]?.steps).toHaveLength(8);
    const clipped = summarizeContributing(`# C\n\n## Setup\n- ${'y'.repeat(500)}\n`);
    expect((clipped.groups[0]?.steps[0] ?? '').length).toBeLessThanOrEqual(220);
    expect(clipped.groups[0]?.steps[0]?.endsWith('…')).toBe(true);
  });
});

describe('summarizeReadme', () => {
  it('قسم Contributing في README بخطواته فقط', () => {
    const result = summarizeReadme(fixtureText('fixture-readme.md'));
    expect(result.groups).toEqual([{ heading: 'Contributing', steps: ['Read CONTRIBUTING.md first.', 'Pick an issue labeled good first issue.', 'Send a pull request from your fork.'] }]);
  });

  it('README بلا قسم مساهمة: فارغ', () => {
    expect(summarizeReadme('# x\n\n## Install\n1. run it\n').empty).toBe(true);
  });
});

describe('القالب وقواعد السلوك', () => {
  it('بنود قائمة التحقق كما وردت (محددة وغير محددة)', () => {
    const template = summarizeTemplate(fixtureText('fixture-pr-template.md'));
    expect(template.checklist).toEqual(['I have read CONTRIBUTING.md', 'I added tests', 'I updated the documentation']);
    expect(template.headings).toEqual(['Description', 'Checklist']);
  });

  it('عنوان مدونة السلوك', () => {
    expect(firstHeading(fixtureText('fixture-coc.md'))).toBe('Contributor Covenant Code of Conduct');
    expect(firstHeading('بلا عنوان')).toBeNull();
  });
});

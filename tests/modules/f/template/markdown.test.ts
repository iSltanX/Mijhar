// قوالب Markdown (T-7.2 / AC-F2) كدوال خالصة: تحليل الترويسات وقوائم التحقق، وربط الحقول بالعناوين، وخطة الملء التي لا تحذف حرفًا من القالب.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EMPTY_FIELDS } from '../../../../src/modules/f/composer';
import type { ComposerFields } from '../../../../src/modules/f/composer';
import { applyToString, applicationOrder, conceptOf, isMarkdownTemplate, mapHeadings, parseMarkdownTemplate, planFill, preservesOriginal, simulateInsert } from '../../../../src/modules/f/template';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
const template = (name: string): string => fs.readFileSync(path.join(ROOT, 'fixtures/templates', name), 'utf8');
const PR = template('PULL_REQUEST_TEMPLATE.md');
const BUG = template('bug_report.md');
const fields = (patch: Partial<ComposerFields>): ComposerFields => ({ ...EMPTY_FIELDS, ...patch });

describe('تحليل القالب', () => {
  it('الترويسات وقوائم التحقق، مع تجاهل ما داخل أسوار الكود', () => {
    const parsed = parseMarkdownTemplate(PR);
    expect(parsed.headings.map((h) => h.text)).toEqual(['Description', 'How to test', 'Screenshots', 'Checklist']);
    expect(parsed.headings.every((h) => h.level === 2)).toBe(true);
    expect(parsed.checklistItems).toBe(3);
    const fenced = parseMarkdownTemplate('## Real\n\n```\n## Not a heading\n- [ ] not a task\n```\n\n~~~\n# also not\n~~~\n');
    expect(fenced.headings.map((h) => h.text)).toEqual(['Real']);
    expect(fenced.checklistItems).toBe(0);
  });

  it('فهرس بدء محتوى كل ترويسة بعد سطرها (وبعد نهاية المسودة إن كانت آخر سطر)', () => {
    const value = '## A\n\ntext\n## B';
    const parsed = parseMarkdownTemplate(value);
    expect(value.slice(parsed.headings[0]!.bodyStart)).toBe('\ntext\n## B');
    expect(parsed.headings[1]!.bodyStart).toBe(value.length);
  });

  it('القالب المعروف: ترويستان فأكثر أو ترويسة وقائمة تحقق؛ ترويسة واحدة كتبها المستخدم ليست قالبًا', () => {
    expect(isMarkdownTemplate(parseMarkdownTemplate(PR))).toBe(true);
    expect(isMarkdownTemplate(parseMarkdownTemplate(BUG))).toBe(true);
    expect(isMarkdownTemplate(parseMarkdownTemplate('## Notes\n\nmy own draft'))).toBe(false);
    expect(isMarkdownTemplate(parseMarkdownTemplate('## Notes\n\n- [ ] one'))).toBe(true);
    expect(isMarkdownTemplate(parseMarkdownTemplate('plain draft text'))).toBe(false);
    expect(isMarkdownTemplate(parseMarkdownTemplate(''))).toBe(false);
  });
});

describe('ربط الحقول بالعناوين', () => {
  it.each([
    ['Steps to reproduce', 'steps'],
    ['How to test', 'steps'],
    ['Expected behavior', 'expected'],
    ['Actual behavior', 'actual'],
    ['Describe the bug', 'actual'],
    ['Description', 'actual'],
    ['Environment', 'environment'],
    ['Version', 'environment'],
    ['Screenshots', 'evidence'],
    ['Additional context', 'evidence'],
    ['خطوات إعادة الإنتاج', 'steps'],
    ['السلوك المتوقع', 'expected'],
    ['البيئة', 'environment'],
    ['الأدلة', 'evidence'],
    ['Checklist', null],
    ['License', null],
    ['', null],
  ])('«%s» ← %s', (text, expected) => {
    expect(conceptOf(text)).toBe(expected);
  });

  it('عنوان واحد لحقل واحد ولا يُستعمل عنوان لحقلين', () => {
    const map = mapHeadings(parseMarkdownTemplate('## Description\n\n## Summary\n\n## Steps\n\n## Steps to reproduce\n'));
    expect([...map].map(([id, h]) => [id, h.text])).toEqual([['actual', 'Description'], ['steps', 'Steps']]);
  });
});

describe('خطة الملء: القالب باقٍ كما هو', () => {
  it('تُدرج الحقول تحت عناوينها وتبقى كل أسطر القالب وقوائمه وتعليقاته بترتيبها', () => {
    const filled = planFill(PR, fields({ actual: 'Fixes the sidebar toggle', steps: 'Open github.com\nPress Alt+G', evidence: 'https://example.com/shot.png' }), { kind: 'pr', language: 'en' });
    expect(filled.mapped).toEqual([
      { field: 'actual', heading: 'Description' },
      { field: 'steps', heading: 'How to test' },
      { field: 'evidence', heading: 'Screenshots' },
    ]);
    expect(filled.appended).toEqual([]);
    expect(preservesOriginal(PR, filled.result)).toBe(true);
    // كل سطر من القالب موجود بالترتيب نفسه.
    const resultLines = filled.result.split('\n');
    let cursor = 0;
    for (const line of PR.split('\n').filter((l) => l.trim() !== '')) {
      const at = resultLines.indexOf(line, cursor);
      expect(at, `سطر القالب: ${line}`).toBeGreaterThanOrEqual(cursor);
      cursor = at + 1;
    }
    expect(filled.result).toContain('## Description\n\nFixes the sidebar toggle\n');
    expect(filled.result).toContain('## How to test\n\n1. Open github.com\n2. Press Alt+G\n');
    expect(filled.result).toContain('- [ ] I have added tests for my changes');
    expect(filled.result).toContain('- [x] My code follows the project style');
    expect(filled.result).toContain('<!-- What does this PR change and why? -->');
  });

  it('حقل بلا عنوان مقابل يُلحق في آخر المسودة بعنوانه من المساعد ولا يُسقط', () => {
    const filled = planFill(PR, fields({ environment: 'macOS 15\nFirefox 158' }), { kind: 'pr', language: 'en' });
    expect(filled.mapped).toEqual([]);
    expect(filled.appended).toEqual(['environment']);
    expect(filled.result.startsWith(PR.replace(/\n+$/, ''))).toBe(true);
    expect(filled.result.endsWith('## Environment\n\n- macOS 15\n- Firefox 158\n')).toBe(true);
    expect(preservesOriginal(PR, filled.result)).toBe(true);
  });

  it('لا حقول مكتوبة ← لا إدراجات والناتج هو القالب نفسه', () => {
    const filled = planFill(PR, EMPTY_FIELDS, { kind: 'pr', language: 'en' });
    expect(filled.edits).toEqual([]);
    expect(filled.result).toBe(PR);
    expect(filled.skipped).toHaveLength(5);
  });

  it('عنوان في آخر المسودة بلا سطر جديد بعده، ومحتوى المستخدم تحت العنوان يبقى بعد إدراجنا', () => {
    const draft = '## Steps to reproduce\n\nmy own typed steps\n\n## Expected behavior';
    const filled = planFill(draft, fields({ steps: 'one\ntwo', expected: 'It works' }), { kind: 'issue', language: 'en' });
    expect(preservesOriginal(draft, filled.result)).toBe(true);
    expect(filled.result).toContain('## Steps to reproduce\n\n1. one\n2. two\n\nmy own typed steps');
    expect(filled.result.endsWith('## Expected behavior\n\nIt works\n')).toBe(true);
  });

  it('المحاكاة نفسها قاعدة الفواصل في الإدراج الآمن: فراغ سطر قبل الكتلة وبعدها', () => {
    expect(simulateInsert('## A\n', 5, 'x')).toBe('## A\n\nx\n');
    expect(simulateInsert('## A\n\nold', 5, 'x')).toBe('## A\n\nx\n\nold');
    expect(simulateInsert('', 0, 'x\n\n')).toBe('x\n');
  });

  it('خاصية: لأي قيم حقول ولأي قالب، القالب الأصلي تتابع جزئي حرفي من الناتج والتطبيق مرتبًا يعطي الناتج المخطَّط', () => {
    let seed = 7;
    const rnd = (n: number): number => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const words = ['alpha', 'بيتا', '`code`', '- item', '## heading', '[ ] x', 'نص عربي', 'line\nbreak'];
    const sources = [PR, BUG, '## Steps\n## Expected\n## Actual\n', '# Title\n\n## Environment\ntext\n', 'x\n## Summary\n- [ ] a\n'];
    for (let i = 0; i < 80; i += 1) {
      const draft = sources[rnd(sources.length)]!;
      const values = fields({
        expected: rnd(2) ? words[rnd(words.length)]! : '',
        actual: rnd(2) ? words[rnd(words.length)]! : '',
        steps: rnd(2) ? `${words[rnd(words.length)]}\n${words[rnd(words.length)]}` : '',
        environment: rnd(2) ? words[rnd(words.length)]! : '',
        evidence: rnd(2) ? words[rnd(words.length)]! : '',
      });
      const filled = planFill(draft, values, { kind: rnd(2) ? 'issue' : 'pr', language: 'auto' });
      expect(preservesOriginal(draft, filled.result), `حالة ${i}`).toBe(true);
      expect(applyToString(draft, applicationOrder(filled.edits))).toBe(filled.result);
    }
  });
});

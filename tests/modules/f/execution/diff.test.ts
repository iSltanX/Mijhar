// فرق الملف الواحد (T-11.8، AC-F6): كل التغييرات بأرقام أسطرها، وكتل بسياق ثلاثة أسطر، وصيغة unified لـ«نسخ الفرق» تطابق اصطلاح git
// (ومنها الملف الجديد وغياب السطر الجديد في آخر الملف)، وفرق صحيح كامل حين يكبر الوسط عن حد الجدول.
import { describe, expect, it } from 'vitest';
import { diffLines, fileDiff, unifiedDiff } from '../../../../src/modules/f/execution';
import { branchFor, proposalFor, titleFor } from '../../../../src/modules/f/execution';

/** يطبّق الفرق على الأصل (من أسطره) فيعيد الجديد: يثبت أن الفرق كامل. */
const apply = (before: string, after: string): string =>
  diffLines(before, after)
    .filter((l) => l.kind !== 'del')
    .map((l) => `${l.text}${l.noEol ? '' : '\n'}`)
    .join('');

describe('diffLines وfileDiff', () => {
  it('لا تغيير: لا كتل', () => {
    expect(fileDiff('a\nb\n', 'a\nb\n')).toEqual({ hunks: [], additions: 0, deletions: 0 });
  });

  it('سطر مستبدل وسط ملف طويل: كتلة واحدة بثلاثة أسطر سياق قبله وبعده وأرقامها', () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';
    const after = before.replace('line 10\n', 'LINE TEN\n');
    const d = fileDiff(before, after);
    expect(d.additions).toBe(1);
    expect(d.deletions).toBe(1);
    expect(d.hunks).toHaveLength(1);
    expect(d.hunks[0]).toMatchObject({ oldStart: 7, oldCount: 7, newStart: 7, newCount: 7 });
    expect(unifiedDiff('x.md', before, after)).toBe(
      ['--- a/x.md', '+++ b/x.md', '@@ -7,7 +7,7 @@', ' line 7', ' line 8', ' line 9', '-line 10', '+LINE TEN', ' line 11', ' line 12', ' line 13', ''].join('\n'),
    );
  });

  it('تغييران متباعدان: كتلتان؛ ومتقاربان: كتلة واحدة', () => {
    const before = Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n') + '\n';
    expect(fileDiff(before, before.replace('l2\n', 'X\n').replace('l25\n', 'Y\n')).hunks).toHaveLength(2);
    expect(fileDiff(before, before.replace('l2\n', 'X\n').replace('l8\n', 'Y\n')).hunks).toHaveLength(1);
  });

  it('ملف جديد: كتلة من ‎-0,0‎ و/dev/null', () => {
    expect(unifiedDiff('NEW.md', '', '# عنوان\nسطر\n', true)).toBe(['--- /dev/null', '+++ b/NEW.md', '@@ -0,0 +1,2 @@', '+# عنوان', '+سطر', ''].join('\n'));
  });

  it('حذف السطر الجديد من آخر الملف تغيير ظاهر بعلامة git', () => {
    const text = unifiedDiff('a.txt', 'a\nb\n', 'a\nb');
    expect(text).toContain('-b\n+b\n\\ No newline at end of file\n');
  });

  it('وسط أكبر من حد الجدول: حذف الوسط كله ثم إضافته، وفرق كامل صحيح', () => {
    const before = Array.from({ length: 2500 }, (_, i) => `old ${i}`).join('\n') + '\n';
    const after = Array.from({ length: 2500 }, (_, i) => `new ${i}`).join('\n') + '\n';
    const d = fileDiff(before, after);
    expect(d.deletions).toBe(2500);
    expect(d.additions).toBe(2500);
    expect(apply(before, after)).toBe(after);
  });

  it.each([
    ['', 'a\n'],
    ['a\n', ''],
    ['a\nb\nc\n', 'a\nc\n'],
    ['a\nb\nc\n', 'x\na\nb\nc\ny'],
    ['# T\n\nyarn\n\nend\n', '# T\n\npnpm\n\nend\n'],
  ])('الفرق يعيد الجديد من الأصل: %j ← %j', (before, after) => {
    expect(apply(before, after)).toBe(after);
  });
});

describe('الاقتراح من الصفحة المفتوحة (رابطها لا محتواها)', () => {
  it('صفحة ملف نصي: الملف وفرعه؛ ملف شيفرة: README.md والافتراضي؛ صفحة مشكلة: README.md ورقمها', () => {
    expect(proposalFor({ type: 'blob', path: 'docs/guide.md', ref: 'dev', refKind: 'ref', number: null })).toEqual({ path: 'docs/guide.md', base: 'dev', issue: null });
    expect(proposalFor({ type: 'blob', path: 'src/a.ts', ref: 'dev', refKind: 'ref', number: null })).toEqual({ path: 'README.md', base: '', issue: null });
    expect(proposalFor({ type: 'blob', path: 'README.md', ref: 'a'.repeat(40), refKind: 'sha', number: null })).toEqual({ path: 'README.md', base: '', issue: null });
    expect(proposalFor({ type: 'issue', path: null, ref: null, refKind: 'unknown', number: 493 })).toEqual({ path: 'README.md', base: '', issue: 493 });
  });

  it('اسم الفرع المقترح صالح ومن الملف والوقت، والعنوان من المسار', () => {
    const now = Date.UTC(2026, 9, 24, 9, 30);
    expect(branchFor('docs/Install Guide.md', now)).toBe('mijhar/edit-install-guide-20261024-0930');
    expect(branchFor('دليل.md', now)).toBe('mijhar/edit-file-20261024-0930');
    expect(titleFor('README.md')).toBe('docs: update README.md');
  });
});

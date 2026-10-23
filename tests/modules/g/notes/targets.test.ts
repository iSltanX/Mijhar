// أي مستويات تتيحها كل صفحة، وأي ملاحظات تخصها، وحدود المطابقة بين المراجع.
import { describe, expect, it } from 'vitest';
import { pageInfoFromUrl } from '../../../../src/shared/page';
import type { PageInfo } from '../../../../src/shared/page';
import { defaultLevel, notesForPage, notesForRepo, relationTo, sameSha, targetOptions } from '../../../../src/modules/g/notes';
import type { Note, NoteTarget } from '../../../../src/modules/g/notes';
import { SHA, TARGETS } from './helpers';

const page = (url: string, patch: Partial<PageInfo> = {}): PageInfo => ({ ...pageInfoFromUrl(url), ...patch });
const BASE = 'https://github.com/octo/demo';
const noteOf = (target: NoteTarget, id: string = target.level): Note => ({
  id,
  version: 1,
  target,
  text: 'ن',
  anchorStatus: 'not-applicable',
  createdAt: '2026-10-23T08:00:00.000Z',
  updatedAt: '2026-10-23T08:00:00.000Z',
  url: BASE,
  title: null,
});
const levels = (info: PageInfo): string[] => targetOptions(info).map((o) => o.level);

describe('targetOptions: مستويات كل صفحة', () => {
  it('مستودع: المستودع وحده', () => expect(levels(page(BASE))).toEqual(['repo']));
  it('شجرة ملفات: المستودع وحده', () => expect(levels(page(`${BASE}/tree/main/src`))).toEqual(['repo']));
  it('مشكلة وطلب دمج وتبويباته: المستودع والموضوع', () => {
    for (const url of [`${BASE}/issues/12`, `${BASE}/pull/42`, `${BASE}/pull/42/commits`, `${BASE}/pull/42/checks`]) expect(levels(page(url)), url).toEqual(['repo', 'thread']);
  });
  it('التزام: المستودع والالتزام والسطر (يحتاج تحديدًا)', () => {
    const options = targetOptions(page(`${BASE}/commit/${SHA}`));
    expect(options.map((o) => o.level)).toEqual(['repo', 'commit', 'line']);
    expect(options[2]).toMatchObject({ target: null });
    expect(options[2]?.reason).toContain('سطرًا');
  });
  it('ملف: المستودع والملف والسطر؛ والسطر بلا تحديد سببه ظاهر', () => {
    const options = targetOptions(page(`${BASE}/blob/main/lib/a.js`));
    expect(options.map((o) => o.level)).toEqual(['repo', 'file', 'line']);
    expect(options[1]?.target).toMatchObject({ level: 'file', ref: 'main', path: 'lib/a.js' });
    expect(options[2]).toMatchObject({ target: null });
    expect(options[2]?.reason).toMatch(/رقم السطر/);
  });
  it('ملف بتحديد أسطر: هدف السطر جاهز بنطاقه', () => {
    const line = targetOptions(page(`${BASE}/blob/main/lib/a.js#L3-L5`)).find((o) => o.level === 'line');
    expect(line?.target).toMatchObject({ level: 'line', view: 'blob', ref: 'main', path: 'lib/a.js', start: 3, end: 5 });
    expect(line?.reason).toBeNull();
  });
  it('فروق طلب دمج: السطر يحتاج مسار الملف من DOM', () => {
    const noPath = targetOptions(page(`${BASE}/pull/42/files#diff-ab12R5`)).find((o) => o.level === 'line');
    expect(noPath?.target).toBeNull();
    const withPath = targetOptions(page(`${BASE}/pull/42/files#diff-ab12R5`, { diffPath: 'src/app.js' })).find((o) => o.level === 'line');
    expect(withPath?.target).toMatchObject({ view: 'diff', context: { kind: 'pr', number: 42 }, path: 'src/app.js', side: 'R', start: 5 });
  });
  it('تحديد فروق في الرابط بلا مسار ملف (اللوحة): السبب يدل على بطاقة الصفحة', () => {
    const line = targetOptions(page(`${BASE}/pull/42/files#diff-ab12R5`)).find((o) => o.level === 'line');
    expect(line?.target).toBeNull();
    expect(line?.reason).toMatch(/بطاقة «ملاحظاتي» في الصفحة نفسها/);
  });
  it('فروق التزام: سياقه معرّف الالتزام', () => {
    const line = targetOptions(page(`${BASE}/commit/${SHA}#diff-ab12L9`, { diffPath: 'a.md' })).find((o) => o.level === 'line');
    expect(line?.target).toMatchObject({ view: 'diff', context: { kind: 'commit', sha: SHA }, side: 'L' });
  });
  it('ملف بلا مسار معروف: مستوى الملف معروض وسببه ظاهر ولا هدف', () => {
    const info = page(`${BASE}/blob/main/x`, { ref: null, path: null });
    expect(targetOptions(info).find((o) => o.level === 'file')).toMatchObject({ target: null });
  });
  it('خارج المستودعات: لا مستويات', () => {
    for (const url of ['https://github.com/', 'https://github.com/octocat', 'https://github.com/search?q=a', 'https://example.com/octo/demo']) expect(targetOptions(page(url)), url).toEqual([]);
  });
});

describe('defaultLevel', () => {
  it('الأخص المتاح بهدف فعلي', () => {
    expect(defaultLevel(targetOptions(page(BASE)))).toBe('repo');
    expect(defaultLevel(targetOptions(page(`${BASE}/pull/42`)))).toBe('thread');
    expect(defaultLevel(targetOptions(page(`${BASE}/blob/main/a.js`)))).toBe('file');
    expect(defaultLevel(targetOptions(page(`${BASE}/blob/main/a.js#L2`)))).toBe('line');
    expect(defaultLevel(targetOptions(page(`${BASE}/commit/${SHA}`)))).toBe('commit');
  });
});

describe('relationTo: المطابقة بالمعرّفات', () => {
  it('المستودع بلا حساسية لحالة الأحرف، وفي كل صفحة مستودعية', () => {
    expect(relationTo(noteOf(TARGETS.repo!), page('https://github.com/OCTO/Demo/issues/3'))).toBe('exact');
    expect(relationTo(noteOf(TARGETS.repo!), page('https://github.com/octo/other'))).toBeNull();
    expect(relationTo(noteOf(TARGETS.repo!), page('https://github.com/octocat'))).toBeNull();
  });
  it('الموضوع برقمه عبر تبويبات طلب الدمج لا غير', () => {
    const note = noteOf(TARGETS.pr!);
    for (const url of [`${BASE}/pull/42`, `${BASE}/pull/42/files`, `${BASE}/pull/42/commits`]) expect(relationTo(note, page(url)), url).toBe('exact');
    expect(relationTo(note, page(`${BASE}/pull/43`))).toBeNull();
    expect(relationTo(note, page(`${BASE}/blob/main/a.js`))).toBeNull();
  });
  it('الالتزام بمعرّفه كاملًا أو مختصرًا (سبعة أحرف فأكثر)', () => {
    const note = noteOf(TARGETS.commit!);
    expect(relationTo(note, page(`${BASE}/commit/${SHA}`))).toBe('exact');
    expect(relationTo(note, page(`${BASE}/commit/${SHA.slice(0, 7)}`))).toBe('exact');
    expect(relationTo(note, page(`${BASE}/commit/abcdef1`))).toBeNull();
    expect(sameSha('abc', 'abcdef1')).toBe(false);
  });
  it('الملف على المرجع نفسه exact وعلى مرجع آخر other-ref', () => {
    const note = noteOf(TARGETS.file!);
    expect(relationTo(note, page(`${BASE}/blob/main/lib/response.js`))).toBe('exact');
    expect(relationTo(note, page(`${BASE}/blob/dev/lib/response.js`))).toBe('other-ref');
    expect(relationTo(note, page(`${BASE}/blob/main/lib/other.js`))).toBeNull();
  });
  it('فرع بشرطة مائلة: المطابقة بالمرجع والمسار معًا لا بتقسيم الرابط', () => {
    const note = noteOf({ ...TARGETS.file, ref: 'feature/x', path: 'a/b.js' } as NoteTarget);
    expect(relationTo(note, page(`${BASE}/blob/feature/x/a/b.js`))).toBe('exact');
  });
  it('سطر الملف: exact على مرجعه فقط، وغيره يظهر ولا يُلصق', () => {
    const note = noteOf(TARGETS.blobLine!);
    expect(relationTo(note, page(`${BASE}/blob/main/lib/response.js#L1`))).toBe('exact');
    expect(relationTo(note, page(`${BASE}/blob/other/lib/response.js`))).toBe('other-ref');
  });
  it('سطر الفروق بسياقه', () => {
    const note = noteOf(TARGETS.diffLine!);
    expect(relationTo(note, page(`${BASE}/pull/42/files`))).toBe('exact');
    expect(relationTo(note, page(`${BASE}/pull/43/files`))).toBeNull();
    expect(relationTo(note, page(`${BASE}/commit/${SHA}`))).toBeNull();
  });
});

describe('notesForPage / notesForRepo', () => {
  const all = [noteOf(TARGETS.repo!), noteOf(TARGETS.pr!), noteOf(TARGETS.issue!), noteOf(TARGETS.file!), noteOf(TARGETS.blobLine!), noteOf({ ...TARGETS.repo, repo: 'other' } as NoteTarget, 'foreign')];

  it('توزيع ملاحظات صفحة الملف على المستويات', () => {
    const result = notesForPage(all, page(`${BASE}/blob/main/lib/response.js#L3`));
    expect(result.byLevel.repo.map((n) => n.id)).toEqual(['repo']);
    expect(result.byLevel.file.map((n) => n.id)).toEqual(['file']);
    expect(result.byLevel.line.map((n) => n.id)).toEqual(['line']);
    expect(result.byLevel.thread).toEqual([]);
    expect(result.total).toBe(3);
  });

  it('ملاحظات المستودع كلها للوحة، دون مستودع آخر', () => {
    expect(notesForRepo(all, page(BASE)).map((n) => n.id)).not.toContain('foreign');
    expect(notesForRepo(all, page(BASE))).toHaveLength(5);
    expect(notesForRepo(all, page('https://github.com/'))).toEqual([]);
  });
});

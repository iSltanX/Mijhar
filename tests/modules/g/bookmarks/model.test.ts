// TEST-NOTE-02 (وحدة): نموذج الرابط المحفوظ ومستودعه، وما يلتقطه زر الحفظ السريع من كل نوع صفحة (AC-G2).
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { MemoryStorageArea } from '../../../../src/core';
import { BookmarkInputError, BookmarkNotFoundError, bookmarkDraftFromPage, isBookmark, levelOf, pageKey, parseTags, prBranchFromDocument } from '../../../../src/modules/g/bookmarks';
import { enrichFromDocument, pageInfoFromUrl } from '../../../../src/shared/page';
import { memoryLater, notesSet } from './helpers';

const SHA = '0dee2c52c7c873498f8ed7d8ee4ddd0a04d3ada8';
const page = (url: string, title = 'عنوان') => pageInfoFromUrl(url, title);

describe('ما يلتقطه الحفظ السريع (AC-G2)', () => {
  it('صفحة ملف بنطاق أسطر: الرابط والعنوان وowner/repo والمرجع والمستوى والسطر', () => {
    const draft = bookmarkDraftFromPage(page('https://github.com/octo/demo/blob/main/lib/response.js#L10-L12', 'response.js'));
    expect(draft).toEqual({
      url: 'https://github.com/octo/demo/blob/main/lib/response.js#L10-L12',
      title: 'response.js',
      owner: 'octo',
      repo: 'demo',
      branch: 'main',
      refKind: 'ref',
      level: 'line',
      position: { kind: 'lines', start: 10, end: 12 },
    });
  });

  it('رابط ثابت على التزام: المرجع sha لا فرع', () => {
    const draft = bookmarkDraftFromPage(page(`https://github.com/octo/demo/blob/${SHA}/lib/response.js`));
    expect(draft).toMatchObject({ branch: SHA, refKind: 'sha', level: 'file', position: null });
  });

  it('شجرة على فرع، وموضع التمرير حين لا سطر', () => {
    const draft = bookmarkDraftFromPage(page('https://github.com/octo/demo/tree/dev/src'), { scroll: { y: 1200, max: 4800 } });
    expect(draft).toMatchObject({ branch: 'dev', refKind: 'ref', level: 'repo', position: { kind: 'scroll', y: 1200, ratio: 0.25 } });
  });

  it('طلب دمج: فرع الرأس من بيانات المحادثة المضمّنة أو ‎.head-ref، والمستوى «طلب دمج أو مشكلة»', () => {
    const embedded = new JSDOM(
      `<script type="application/json" data-target="react-app.embeddedData">{"payload":{"pullRequestsLayoutRoute":{"pullRequest":{"headBranch":"feature/rtl","baseBranch":"main"}}}}</script>`,
    ).window.document;
    expect(bookmarkDraftFromPage(page('https://github.com/octo/demo/pull/42'), { doc: embedded })).toMatchObject({ branch: 'feature/rtl', level: 'thread' });
    const legacy = new JSDOM('<span class="head-ref"> mcollina:fix-x </span>').window.document;
    expect(prBranchFromDocument(legacy)).toBe('mcollina:fix-x');
    // اللوحة الأصلية لا ترى DOM: لا فرع يُخمَّن.
    expect(bookmarkDraftFromPage(page('https://github.com/octo/demo/pull/42'))?.branch).toBeNull();
  });

  it('الالتزام لا يحدد فرعًا، والمشكلة بلا فرع، والسطر في الفروق بجهته', () => {
    expect(bookmarkDraftFromPage(page(`https://github.com/octo/demo/commit/${SHA}`))).toMatchObject({ branch: null, level: 'commit' });
    expect(bookmarkDraftFromPage(page('https://github.com/octo/demo/issues/7'))).toMatchObject({ branch: null, level: 'thread' });
    expect(bookmarkDraftFromPage(page('https://github.com/octo/demo/pull/42/files#diff-abc123R5-R8'))).toMatchObject({ level: 'line', position: { kind: 'lines', start: 5, end: 8, side: 'R' } });
  });

  it('صفحة GitHub خارج مستودع تُحفظ بمستوى «صفحة أخرى»، وما خارج github.com لا يُحفظ', () => {
    expect(levelOf(page('https://github.com/search?q=rtl'))).toBe('page');
    expect(bookmarkDraftFromPage(page('https://example.com/x'))).toBeNull();
  });

  it('الفرع من DOM صفحة الملف يغلب تخمين الرابط (فرع فيه شرطة مائلة)', () => {
    const doc = new JSDOM(
      `<meta name="octolytics-dimension-repository_nwo" content="octo/demo"><script type="application/json" data-target="react-app.embeddedData">{"payload":{"codeViewLayoutRoute":{"refInfo":{"name":"chore/v2","currentOid":"${SHA}"},"path":"README.md"}}}</script>`,
      { url: 'https://github.com/octo/demo/blob/chore/v2/README.md' },
    ).window.document;
    const info = enrichFromDocument(pageInfoFromUrl('https://github.com/octo/demo/blob/chore/v2/README.md'), doc);
    expect(bookmarkDraftFromPage(info)).toMatchObject({ branch: 'chore/v2', refKind: 'ref', level: 'file' });
  });
});

describe('الوسوم والهوية', () => {
  it('الوسوم من نص بفاصلة عربية أو لاتينية، بلا تكرار ولا فراغ، وبحد العدد والطول', () => {
    expect(parseTags('مراجعة، أداء, #أداء ,  ,bug')).toEqual(['مراجعة', 'أداء', 'bug']);
    expect(parseTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(12);
    expect(parseTags(['x'.repeat(80)])[0]).toHaveLength(40);
  });

  it('هوية الصفحة بلا الهاش', () => {
    expect(pageKey('https://github.com/o/r/blob/main/a.js#L3')).toBe('https://github.com/o/r/blob/main/a.js');
  });
});

describe('مستودع الروابط', () => {
  it('الحفظ يكتب كل الحقول المعرّفة، والتعديل يمس ما طُلب وحده، والإزالة', async () => {
    const later = await memoryLater();
    const draft = bookmarkDraftFromPage(page('https://github.com/octo/demo/blob/main/lib/response.js#L10'), {});
    const saved = await later.bookmarks.create({ ...draft!, tags: ['مراجعة'], note: '  أعود إليها  ' });
    expect(isBookmark(saved)).toBe(true);
    expect(saved).toMatchObject({ status: 'reading', tags: ['مراجعة'], note: 'أعود إليها', owner: 'octo', repo: 'demo', branch: 'main', level: 'line', position: { kind: 'lines', start: 10, end: 10 } });
    expect(saved.savedAt).toBe(saved.updatedAt);

    const edited = await later.bookmarks.update(saved.id, { status: 'awaiting', tags: ['أداء', 'أمان'] });
    expect(edited.status).toBe('awaiting');
    expect(edited.note).toBe('أعود إليها');
    expect(edited.updatedAt > saved.updatedAt).toBe(true);
    expect(later.bookmarks.findByPage('https://github.com/octo/demo/blob/main/lib/response.js#L99')?.id).toBe(saved.id);

    await later.bookmarks.remove(saved.id);
    expect(later.bookmarks.size).toBe(0);
    await expect(later.bookmarks.update(saved.id, { status: 'done' })).rejects.toBeInstanceOf(BookmarkNotFoundError);
  });

  it('يرفض ما خارج github.com وملاحظة أطول من الحد، ولا يكتب شيئًا', async () => {
    const later = await memoryLater();
    const base = bookmarkDraftFromPage(page('https://github.com/octo/demo'))!;
    await expect(later.bookmarks.create({ ...base, url: 'https://evil.example/x' })).rejects.toBeInstanceOf(BookmarkInputError);
    await expect(later.bookmarks.create({ ...base, note: 'x'.repeat(2001) })).rejects.toBeInstanceOf(BookmarkInputError);
    expect(Object.keys(await later.store.readPrefix('bookmarks.'))).toHaveLength(0);
  });

  it('التغيير من سياق يصل إلى سياق آخر على المنطقة نفسها', async () => {
    const area = new MemoryStorageArea();
    const a = await memoryLater(area);
    const b = await memoryLater(area);
    let heard = 0;
    b.bookmarks.subscribe(() => (heard += 1));
    const saved = await a.bookmarks.create(bookmarkDraftFromPage(page('https://github.com/octo/demo/issues/1'))!);
    await new Promise((r) => setTimeout(r, 0));
    expect(b.bookmarks.get(saved.id)?.url).toBe(saved.url);
    expect(heard).toBeGreaterThan(0);
  });

  it('عناصر مجموعة PB-04 كلها صالحة بالمخطط', () => {
    const set = notesSet();
    expect(set.notes).toHaveLength(250);
    expect(set.bookmarks).toHaveLength(250);
    expect(set.bookmarks.every(isBookmark)).toBe(true);
  });
});

// وصف الصفحة المفتوحة من الرابط ومن DOM (يعتمد عليه الوحدتان ز وح).
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { diffPathOf, enrichFromDocument, isSha, pageInfoFromUrl, parseDiffHash, parseLineHash, repoSlug } from '../../../src/shared/page';

const SHA = '0dee2c52c7c873498f8ed7d8ee4ddd0a04d3ada8';

describe('parseLineHash', () => {
  it.each([
    ['#L10', { start: 10, end: 10 }],
    ['#L10-L25', { start: 10, end: 25 }],
    ['#L25-L10', { start: 10, end: 25 }],
    ['#L10C5-L25C8', { start: 10, end: 25 }],
    ['#L7C2', { start: 7, end: 7 }],
  ])('%s', (hash, expected) => expect(parseLineHash(hash)).toEqual(expected));

  it.each(['', '#', '#L', '#L0x', '#readme', '#diff-abcR3', '#LC10', '#L10-', '#l10'])('يرفض %s', (hash) => expect(parseLineHash(hash)).toBeNull());
});

describe('parseDiffHash', () => {
  it('سطر مفرد ونطاق وجهتان', () => {
    expect(parseDiffHash('#diff-ab12cdR10')).toEqual({ anchor: 'diff-ab12cd', side: 'R', start: 10, end: 10 });
    expect(parseDiffHash('#diff-ab12cdL3-L7')).toEqual({ anchor: 'diff-ab12cd', side: 'L', start: 3, end: 7 });
    expect(parseDiffHash('#diff-ab12cdR9-R4')).toEqual({ anchor: 'diff-ab12cd', side: 'R', start: 4, end: 9 });
    expect(parseDiffHash('#diff-ab12cdR2-5')).toEqual({ anchor: 'diff-ab12cd', side: 'R', start: 2, end: 5 });
  });

  it('يرفض ما ليس تحديد فروق', () => {
    for (const hash of ['', '#L10', '#diff-ab12cd', '#diff-ab12cdX3', '#diff-zzR3', '#discussion_r1']) expect(parseDiffHash(hash)).toBeNull();
  });
});

describe('pageInfoFromUrl', () => {
  it('صفحة مستودع', () => {
    const info = pageInfoFromUrl('https://github.com/octo/demo', 'octo/demo');
    expect(info).toMatchObject({ type: 'repo', owner: 'octo', repo: 'demo', number: null, sha: null, blobRest: null, lines: null, diff: null, title: 'octo/demo' });
    expect(repoSlug(info)).toBe('octo/demo');
  });

  it('مشكلة وطلب دمج وتبويباته', () => {
    expect(pageInfoFromUrl('https://github.com/octo/demo/issues/12')).toMatchObject({ type: 'issue', number: 12 });
    expect(pageInfoFromUrl('https://github.com/octo/demo/pull/42')).toMatchObject({ type: 'pr', number: 42 });
    expect(pageInfoFromUrl('https://github.com/octo/demo/pull/42/files')).toMatchObject({ type: 'pr-files', number: 42 });
    expect(pageInfoFromUrl('https://github.com/octo/demo/pull/42/commits')).toMatchObject({ type: 'pr-commits', number: 42 });
  });

  it('التزام: المعرّف صغير الأحرف، ويُقبل المختصر', () => {
    expect(pageInfoFromUrl(`https://github.com/octo/demo/commit/${SHA.toUpperCase()}`)).toMatchObject({ type: 'commit', sha: SHA });
    expect(pageInfoFromUrl('https://github.com/octo/demo/commit/0dee2c5')).toMatchObject({ type: 'commit', sha: '0dee2c5' });
    expect(pageInfoFromUrl('https://github.com/octo/demo/commit/not-a-sha').sha).toBeNull();
    expect(isSha('0dee2c5')).toBe(true);
    expect(isSha('main')).toBe(false);
  });

  it('ملف: المرجع والمسار وتحديد الأسطر من الهاش', () => {
    const info = pageInfoFromUrl('https://github.com/octo/demo/blob/main/lib/response.js#L100-L110');
    expect(info).toMatchObject({ type: 'blob', ref: 'main', refKind: 'unknown', path: 'lib/response.js', blobRest: 'main/lib/response.js', lines: { start: 100, end: 110 } });
  });

  it('ملف على التزام كامل: نوع المرجع sha', () => {
    expect(pageInfoFromUrl(`https://github.com/octo/demo/blob/${SHA}/README.md`)).toMatchObject({ ref: SHA, refKind: 'sha', path: 'README.md' });
  });

  it('مسار بمقاطع مرمّزة', () => {
    const info = pageInfoFromUrl('https://github.com/octo/demo/blob/main/docs/%D8%AF%D9%84%D9%8A%D9%84.md');
    expect(info.path).toBe('docs/دليل.md');
    expect(info.blobRest).toBe('main/docs/دليل.md');
  });

  it('هاش الفروق في ملفات طلب الدمج والالتزام فقط', () => {
    expect(pageInfoFromUrl('https://github.com/octo/demo/pull/42/files#diff-ab12R5').diff).toEqual({ anchor: 'diff-ab12', side: 'R', start: 5, end: 5 });
    expect(pageInfoFromUrl(`https://github.com/octo/demo/commit/${SHA}#diff-ab12L9`).diff).toMatchObject({ side: 'L', start: 9 });
    expect(pageInfoFromUrl('https://github.com/octo/demo/pull/42#diff-ab12R5').diff).toBeNull();
  });

  it('خارج github.com أو رابط معطوب: external بلا مستودع', () => {
    expect(pageInfoFromUrl('https://example.com/octo/demo')).toMatchObject({ type: 'external', owner: null, repo: null });
    expect(pageInfoFromUrl('not a url')).toMatchObject({ type: 'external', owner: null });
    expect(pageInfoFromUrl('about:blank').type).toBe('external');
  });
});

const html = (body: string, head = '') => `<!doctype html><html><head><title>t</title>${head}</head><body>${body}</body></html>`;
const embedded = (name: string, oid: string, path: string) =>
  `<script type="application/json" data-target="react-app.embeddedData">${JSON.stringify({ payload: { codeViewLayoutRoute: { refInfo: { name, currentOid: oid }, path } } })}</script>`;

describe('enrichFromDocument', () => {
  it('الفرع كما في بيانات الصفحة حتى لو فيه شرطة مائلة، ونوع المرجع ref', () => {
    const dom = new JSDOM(html(embedded('chore/v2-pnpm-monorepo', SHA, 'README.md')), { url: 'https://github.com/axios/axios/blob/chore/v2-pnpm-monorepo/README.md?plain=1#L5' });
    const info = enrichFromDocument(pageInfoFromUrl(dom.window.location.href), dom.window.document);
    expect(info).toMatchObject({ ref: 'chore/v2-pnpm-monorepo', refKind: 'ref', path: 'README.md', blobRest: 'chore/v2-pnpm-monorepo/README.md', lines: { start: 5, end: 5 } });
  });

  it('رابط ثابت على التزام: اسم المرجع هو المعرّف نفسه فنوعه sha', () => {
    const dom = new JSDOM(html(embedded(SHA, SHA, 'lib/response.js')), { url: `https://github.com/expressjs/express/blob/${SHA}/lib/response.js` });
    expect(enrichFromDocument(pageInfoFromUrl(dom.window.location.href), dom.window.document)).toMatchObject({ ref: SHA, refKind: 'sha' });
  });

  it('بلا بيانات مضمّنة يبقى ما في الرابط', () => {
    const dom = new JSDOM(html('<p>x</p>'), { url: 'https://github.com/octo/demo/blob/main/a/b.js' });
    expect(enrichFromDocument(pageInfoFromUrl(dom.window.location.href), dom.window.document)).toMatchObject({ ref: 'main', refKind: 'unknown', path: 'a/b.js' });
  });

  it('بيانات مضمّنة تالفة تُهمل', () => {
    const dom = new JSDOM(html('<script data-target="react-app.embeddedData">{oops</script>'), { url: 'https://github.com/octo/demo/blob/main/a.js' });
    expect(enrichFromDocument(pageInfoFromUrl(dom.window.location.href), dom.window.document).ref).toBe('main');
  });

  it('المستودع من meta حين لا يكفي الرابط', () => {
    const dom = new JSDOM(html('<p>x</p>', '<meta name="octolytics-dimension-repository_nwo" content="octo/demo">'), { url: 'https://github.com/octo/demo/blob/main/a.js' });
    const info = enrichFromDocument({ ...pageInfoFromUrl(dom.window.location.href), owner: null, repo: null }, dom.window.document);
    expect(repoSlug(info)).toBe('octo/demo');
  });

  it('مسار ملف الفروق من حاوية سطر التحديد أو من ملف التحديد', () => {
    const body = `<div data-tagsearch-path="src/app.js" data-anchor="diff-ab12"><table><tr><td id="diff-ab12R5" data-line-number="5">5</td></tr></table></div>
      <div data-file-path="docs/x.md"><span id="diff-cd34">x</span></div>`;
    const dom = new JSDOM(html(body), { url: 'https://github.com/octo/demo/pull/42/files#diff-ab12R5' });
    const info = enrichFromDocument(pageInfoFromUrl(dom.window.location.href), dom.window.document);
    expect(info.diffPath).toBe('src/app.js');
    expect(diffPathOf(dom.window.document, { anchor: 'diff-cd34', side: 'R', start: 99, end: 99 })).toBe('docs/x.md');
    expect(diffPathOf(dom.window.document, { anchor: 'diff-none', side: 'R', start: 1, end: 1 })).toBeNull();
  });

  it('صفحة خارجية لا تُمسّ', () => {
    const dom = new JSDOM(html(''), { url: 'https://example.com/' });
    const info = pageInfoFromUrl('https://example.com/');
    expect(enrichFromDocument(info, dom.window.document)).toBe(info);
  });
});

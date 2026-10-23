// TEST-COMM-01 (AC-H1) — الكشف: أنماط README العربي على العينات المرجعية، وإعلان الاقتطاع، وعدم الجزم بالغياب.
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { SelectorsRegistry } from '../../../../src/core/detector';
import { ARABIC_FILE_NAME, README_SELECTORS, detectArabicReadme, extractReadmeScan, repoFileUrl } from '../../../../src/modules/h/readme-detector';
import type { ReadmeScan } from '../../../../src/modules/h/readme-detector';
import { loadFixture } from '../helpers';

const CONTEXT = { owner: 'octo', repo: 'community', base: 'https://github.com/octo/community' };
const detect = (fixture: string) => {
  const dom = loadFixture(fixture);
  const scan = extractReadmeScan(dom.window.document, new SelectorsRegistry(README_SELECTORS));
  return { scan, detection: detectArabicReadme(scan, CONTEXT) };
};

describe('أنماط اسم الملف', () => {
  it.each(['README.ar.md', 'README-ar.md', 'README_ar.md', 'README.arabic.md', 'readme.ar.md', 'README.ar-AR.md', 'README.ara.markdown', 'Readme.AR.rst', 'README_ar.txt', 'README.ar.adoc'])('يطابق %s', (name) =>
    expect(ARABIC_FILE_NAME.test(name)).toBe(true));

  it.each(['README.md', 'README.fr.md', 'README.ja-JP.md', 'README.army.md', 'README.ar', 'README.ar.md.bak', 'arabic.md', 'README.hebrew.md', 'READMEar.md', 'README.ar.png'])('لا يطابق %s', (name) =>
    expect(ARABIC_FILE_NAME.test(name)).toBe(false));
});

describe('repoFileUrl', () => {
  const resolve = (href: string) => repoFileUrl(href, CONTEXT.base, 'octo', 'community')?.url.href ?? null;
  it('ملفات المستودع نفسه فقط', () => {
    expect(resolve('/octo/community/blob/main/README.ar.md')).toBe('https://github.com/octo/community/blob/main/README.ar.md');
    expect(resolve('https://github.com/Octo/Community/blob/main/docs/ar/README.md')).toContain('/docs/ar/README.md');
    expect(resolve('/octo/community/tree/main/docs/ar')).not.toBeNull();
    expect(resolve('/octo/other/blob/main/README.ar.md')).toBeNull();
    expect(resolve('https://example.com/octo/community/blob/main/README.ar.md')).toBeNull();
    expect(resolve('/octo/community/issues/3')).toBeNull();
    expect(resolve('/octo/community')).toBeNull();
    expect(resolve('http://[bad')).toBeNull();
  });
});

describe('العينات المرجعية', () => {
  it('شجرة كاملة بلا README عربي: لم يُعثر ضمن النطاق، مع ما فُحص والمجلدات غير المفتوحة', () => {
    const { scan, detection } = detect('fixture-community-repo.html');
    expect(scan.entries.map((e) => e.name)).toEqual(['.github', 'docs', 'src', 'tests', 'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'LICENSE', 'README.md', 'package.json']);
    expect(scan.entries.filter((e) => e.kind === 'dir')).toHaveLength(4);
    expect(scan.treeFound).toBe(true);
    expect(scan.readmeFound).toBe(true);
    expect(scan.truncation).toBeNull();
    expect(detection).toMatchObject({ state: 'not-found-in-scope', matches: [], truncation: null, unopenedFolders: ['docs'], scope: { treeEntries: 9, readmeShown: true } });
    expect(detection.scope.readmeLinks).toBe(4);
  });

  it('README عربي في الجذر وبرابط README: يُكتشف مرة واحدة من الشجرة', () => {
    const { detection } = detect('fixture-community-repo-arabic.html');
    expect(detection.state).toBe('found');
    expect(detection.matches).toEqual([{ name: 'README.ar-AR.md', href: 'https://github.com/octo/community/blob/main/README.ar-AR.md', source: 'tree' }]);
  });

  it('README عربي برابط داخل README الأساسي فقط (مسار docs/ar/README.md ونصه Arabic)', () => {
    const { detection } = detect('fixture-community-repo-link-only.html');
    expect(detection.state).toBe('found');
    expect(detection.matches).toEqual([{ name: 'README.md', href: 'https://github.com/octo/community/blob/main/docs/ar/README.md', source: 'readme-link' }]);
  });

  it('شجرة مقطوعة: الاقتطاع معلن بأرقامه من عبارة الصفحة، ولا يغيّر النتيجة إلى جزم', () => {
    const { scan, detection } = detect('fixture-community-repo-truncated.html');
    expect(scan.truncation).toEqual({ shown: 1000, total: 5108 });
    expect(detection.state).toBe('not-found-in-scope');
    expect(detection.truncation).toEqual({ shown: 1000, total: 5108 });
  });

  it('روابط لغات أخرى وروابط خارجية لا تُحسب عربية', () => {
    const { detection } = detect('fixture-community-repo.html');
    expect(detection.matches).toEqual([]);
  });
});

describe('حالات حدّية', () => {
  const scan = (patch: Partial<ReadmeScan>): ReadmeScan => ({ entries: [], treeFound: false, links: [], readmeFound: false, truncation: null, ...patch });

  it('صفحة لا تُقرأ بنيتها: unreadable ولا حكم', () => {
    const dom = new JSDOM('<!doctype html><body><main><p>صفحة غير معروفة</p></main></body>', { url: 'https://github.com/octo/community' });
    const result = detectArabicReadme(extractReadmeScan(dom.window.document, new SelectorsRegistry(README_SELECTORS)), CONTEXT);
    expect(result.state).toBe('unreadable');
    expect(result.matches).toEqual([]);
  });

  it('إعلان الاقتطاع من بيانات الصفحة المضمّنة (العناصر أقل من الإجمالي)', () => {
    const data = JSON.stringify({ payload: { codeViewTreeRoute: { tree: { items: Array.from({ length: 1000 }, (_, i) => ({ name: `f${i}` })), totalCount: 5108 } } } });
    const dom = new JSDOM(`<!doctype html><head><script data-target="react-app.embeddedData">${data}</script></head><body><table aria-labelledby="folders-and-files"><tbody><tr class="react-directory-row"><td><a class="Link--primary" title="a.js" href="/octo/community/blob/main/a.js">a.js</a></td></tr></tbody></table></body>`, { url: 'https://github.com/octo/community' });
    expect(extractReadmeScan(dom.window.document, new SelectorsRegistry(README_SELECTORS)).truncation).toEqual({ shown: 1000, total: 5108 });
  });

  it('بيانات مضمّنة كاملة (items = totalCount) لا تعلن اقتطاعًا', () => {
    const data = JSON.stringify({ payload: { codeViewRepoRoute: { tree: { items: [{ name: 'a' }], totalCount: 1 } } } });
    const dom = new JSDOM(`<!doctype html><head><script data-target="react-app.embeddedData">${data}</script></head><body><p>x</p></body>`, { url: 'https://github.com/octo/community' });
    expect(extractReadmeScan(dom.window.document, new SelectorsRegistry(README_SELECTORS)).truncation).toBeNull();
  });

  it('روابط تُكرَّر أو هي مراسٍ داخل الصفحة تُهمل', () => {
    const dom = new JSDOM(
      `<!doctype html><body><table aria-labelledby="folders-and-files"><tbody>
        <tr class="react-directory-row"><td><a class="Link--primary" title="README.ar.md" href="/octo/community/blob/main/README.ar.md">README.ar.md</a></td><td><a class="Link--primary" title="README.ar.md" href="/octo/community/blob/main/README.ar.md">README.ar.md</a></td></tr>
        <tr class="react-directory-row"><td><a class="Link--primary" title="commit" href="/octo/community/commit/abc">commit</a></td></tr></tbody></table>
        <article class="markdown-body"><a href="#top">فهرس</a><a href="/octo/community/blob/main/README.ar.md">العربية</a></article></body>`,
      { url: 'https://github.com/octo/community' },
    );
    const extracted = extractReadmeScan(dom.window.document, new SelectorsRegistry(README_SELECTORS));
    expect(extracted.entries).toHaveLength(1);
    expect(extracted.links).toHaveLength(1);
  });

  it('رابط بنص «العربية» إلى مجلد لغة يُعدّ تطابقًا، وإلى مجلد آخر لا', () => {
    const base = scan({
      treeFound: true,
      readmeFound: true,
      links: [
        { text: 'العربية', href: '/octo/community/tree/main/docs/ar' },
        { text: 'العربية', href: '/octo/community/tree/main/docs/guide' },
        { text: 'Arabic', href: '/octo/community/blob/main/docs/guide.md' },
      ],
    });
    const result = detectArabicReadme(base, CONTEXT);
    expect(result.matches.map((m) => m.href)).toEqual(['https://github.com/octo/community/tree/main/docs/ar', 'https://github.com/octo/community/blob/main/docs/guide.md']);
  });

  it('مسارات README القياسية في الروابط: ar/README.md وdocs/ar/README.md وi18n/ar/README.md وREADME_ar.md', () => {
    const links = ['ar/README.md', 'docs/ar/README.md', 'i18n/ar/README.md', 'docs/README_ar.md', 'docs/guide-ar.md', 'docs/guide.md', 'docs/ar-notes.md'].map((p) => ({ text: p, href: `/octo/community/blob/main/${p}` }));
    const result = detectArabicReadme(scan({ treeFound: true, readmeFound: true, links }), CONTEXT);
    expect(result.matches.map((m) => m.name)).toEqual(['README.md', 'README.md', 'README.md', 'README_ar.md', 'guide-ar.md']);
  });
});

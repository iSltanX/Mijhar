// TEST-COMM-03 — قراءة ملفات المشروع من github.com، وأعداد وسوم المبتدئين من api.github.com بنقر وصلاحية.
import { describe, expect, it } from 'vitest';
import { BEGINNER_LABELS, CANDIDATE_PATHS, fetchLabelCounts, labelIssuesUrl, pathHintsFromDocument, rawUrl, readProjectFiles } from '../../../../src/modules/h/first-contribution';
import type { FetchText } from '../../../../src/modules/h/first-contribution';
import { fakeAccess, loadFixture } from '../helpers';

const respond = (table: Record<string, string>, fail: Record<string, 'http' | 'network'> = {}): { fetchText: FetchText; urls: string[] } => {
  const urls: string[] = [];
  return {
    urls,
    fetchText: async (url) => {
      urls.push(url);
      const path = decodeURIComponent(url.replace('https://github.com/octo/community/raw/HEAD/', ''));
      if (fail[path]) return { ok: false, reason: fail[path] as 'http' | 'network' };
      return path in table ? { ok: true, text: table[path] as string } : { ok: false, reason: 'not-found', status: 404 };
    },
  };
};

describe('rawUrl', () => {
  it('يرمّز المقاطع لا الشرطات المائلة', () => {
    expect(rawUrl('octo', 'community', '.github/CONTRIBUTING.md')).toBe('https://github.com/octo/community/raw/HEAD/.github/CONTRIBUTING.md');
    expect(rawUrl('o', 'r', 'docs/دليل المساهمة.md')).toBe(`https://github.com/o/r/raw/HEAD/docs/${encodeURIComponent('دليل المساهمة.md')}`);
  });
});

describe('readProjectFiles', () => {
  it('أول موضع موجود يُقرأ، وما لم يوجد يُعلن مع كل ما جُرِّب', async () => {
    const { fetchText, urls } = respond({ 'README.md': '# r', '.github/CONTRIBUTING.md': '# c', '.github/pull_request_template.md': '- [ ] x' });
    const read = await readProjectFiles('octo', 'community', fetchText);
    expect(read.files.map((f) => `${f.kind}:${f.path}`)).toEqual(['readme:README.md', 'contributing:.github/CONTRIBUTING.md', 'pr-template:.github/pull_request_template.md']);
    expect(read.missing).toEqual([{ kind: 'conduct', tried: [...CANDIDATE_PATHS.conduct] }]);
    expect(read.failed).toEqual([]);
    expect(read.requests).toBe(urls.length);
    // README أول موضع نجح في طلب واحد، وCONTRIBUTING في ثانٍ.
    expect(urls.slice(0, 3).map((u) => u.split('/raw/HEAD/')[1])).toEqual(['README.md', 'CONTRIBUTING.md', '.github/CONTRIBUTING.md']);
  });

  it('مواضع الصفحة تسبق التخمين (docs/CONTRIBUTING.md كما في free-programming-books)', async () => {
    const { fetchText, urls } = respond({ 'docs/CONTRIBUTING.md': '# c' });
    const read = await readProjectFiles('octo', 'community', fetchText, { contributing: ['docs/CONTRIBUTING.md'] });
    expect(read.files.find((f) => f.kind === 'contributing')?.path).toBe('docs/CONTRIBUTING.md');
    expect(urls.filter((u) => u.includes('CONTRIBUTING')).length).toBe(1);
  });

  it('فشل غير 404 (خادم أو شبكة) لا يُعدّ «غير موجود» ويوقف المحاولات لذلك الملف', async () => {
    const { fetchText, urls } = respond({ 'README.md': '# r' }, { 'CONTRIBUTING.md': 'network' });
    const read = await readProjectFiles('octo', 'community', fetchText);
    expect(read.failed).toEqual([{ kind: 'contributing', reason: 'network', path: 'CONTRIBUTING.md' }]);
    expect(read.missing.map((m) => m.kind)).not.toContain('contributing');
    expect(urls.filter((u) => u.includes('CONTRIBUTING')).length).toBe(1);
  });

  it('لا طلب خارج github.com/<repo>/raw/HEAD (تدقيق شبكة)', async () => {
    const { fetchText, urls } = respond({});
    await readProjectFiles('octo', 'community', fetchText);
    for (const url of urls) expect(url).toMatch(/^https:\/\/github\.com\/octo\/community\/raw\/HEAD\/[^?#]+$/);
  });
});

describe('pathHintsFromDocument', () => {
  it('يلتقط مواضع الملفات من روابط الصفحة', () => {
    const dom = loadFixture('fixture-community-repo.html');
    expect(pathHintsFromDocument(dom.window.document, 'octo', 'community')).toEqual({
      readme: ['README.md'],
      contributing: ['CONTRIBUTING.md'],
      conduct: ['CODE_OF_CONDUCT.md'],
    });
  });

  it('يتجاهل مستودعات أخرى وروابط غير الملفات', () => {
    const dom = loadFixture('fixture-community-repo.html');
    expect(pathHintsFromDocument(dom.window.document, 'other', 'repo')).toEqual({});
  });
});

describe('روابط وسوم المبتدئين', () => {
  it('رابط قائمة المشكلات المفتوحة بالوسم، والاستعلام يعود من الرابط', () => {
    for (const { label } of BEGINNER_LABELS) {
      const url = new URL(labelIssuesUrl('octo', 'community', label));
      expect(url.origin + url.pathname).toBe('https://github.com/octo/community/issues');
      expect(url.searchParams.get('q')).toBe(`is:issue is:open label:"${label}"`);
    }
  });
});

describe('fetchLabelCounts', () => {
  const totals: Record<string, number> = { 'good first issue': 7, 'help wanted': 0, documentation: 3 };
  const responder = (path: string) => {
    const q = decodeURIComponent(new URL(path, 'https://api.github.com').searchParams.get('q') ?? '');
    const label = /label:"([^"]+)"/.exec(q)?.[1] ?? '';
    return { body: { total_count: totals[label] ?? -1, items: [] } };
  };

  it('طلب الصلاحية أولًا ثم ثلاثة طلبات بحث بالاستعلامات الصحيحة', async () => {
    const access = fakeAccess(responder);
    const counts = await fetchLabelCounts(access, 'octo', 'community');
    expect(access.calls).toEqual(['request', 'fetch', 'fetch', 'fetch']);
    expect(counts).toEqual([
      { label: 'good first issue', count: 7 },
      { label: 'help wanted', count: 0 },
      { label: 'documentation', count: 3 },
    ]);
    expect(access.requests.map((r) => decodeURIComponent(r.path))).toEqual(
      BEGINNER_LABELS.map((l) => `/search/issues?q=repo:octo/community is:issue is:open label:"${l.label}"&per_page=1`),
    );
  });

  it('رفض الصلاحية أو سياق بلا واجهتها: لا طلبات وكل الأعداد غير متاحة بسببها', async () => {
    const denied = fakeAccess(responder, { granted: false });
    expect((await fetchLabelCounts(denied, 'o', 'r')).every((c) => c.count === null && 'reason' in c && c.reason === 'declined')).toBe(true);
    expect(denied.requests).toEqual([]);
    const none = fakeAccess(responder, { available: false });
    expect((await fetchLabelCounts(none, 'o', 'r')).every((c) => c.count === null && 'reason' in c && c.reason === 'unavailable')).toBe(true);
    expect(none.calls).toEqual([]);
  });

  it('حد الطلبات في وسم يوقف ما بعده دون إرسال، ويبقي ما جُلب', async () => {
    let n = 0;
    const access = fakeAccess(() => (++n === 2 ? { status: 403, headers: { 'x-ratelimit-remaining': '0' } } : { body: { total_count: 4 } }));
    const counts = await fetchLabelCounts(access, 'o', 'r');
    expect(counts.map((c) => c.count)).toEqual([4, null, null]);
    expect(counts[1]).toMatchObject({ reason: 'rate-limit' });
    expect(counts[2]).toMatchObject({ reason: 'rate-limit' });
    expect(access.requests).toHaveLength(2);
  });

  it('ردّ بلا total_count رقمي: العدد غير متاح لا صفر', async () => {
    const counts = await fetchLabelCounts(fakeAccess(() => ({ body: { items: [] } })), 'o', 'r');
    expect(counts.every((c) => c.count === null)).toBe(true);
  });
});

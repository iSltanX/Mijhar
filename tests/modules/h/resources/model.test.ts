// TEST-COMM-05 (AC-H5) — النموذج: مدققات المورد والملف والروابط، والقائمة المضمّنة سليمة بتواريخها وحالاتها ومصادرها.
import { describe, expect, it } from 'vitest';
import RESOURCES from '../../../../src/data/resources/resources.json';
import { builtinResources } from '../../../../src/modules/h/context';
import { RESOURCE_STATUSES, draftProblems, githubRepoOf, isResource, parseResourceFile, resourceProblems, urlProblem } from '../../../../src/modules/h/resources';
import { isIsoDate } from '../../../../src/modules/h/resources/model';
import { TEST_SET } from './helpers';

const valid = TEST_SET.resources[0]!;

describe('urlProblem / githubRepoOf', () => {
  it('https فقط وبلا بيانات اعتماد', () => {
    expect(urlProblem('https://github.com/o/r')).toBeNull();
    expect(urlProblem('http://github.com/o/r')).toMatch(/https/);
    expect(urlProblem('javascript:alert(1)')).not.toBeNull();
    expect(urlProblem('https://user:pw@example.com')).toMatch(/اعتماد/);
    expect(urlProblem('not a url')).toMatch(/غير صالح/);
    expect(urlProblem(`https://example.com/${'a'.repeat(600)}`)).toMatch(/أطول/);
  });

  it('مستودعات github.com وحدها هي التي تُفحص آليًا', () => {
    expect(githubRepoOf('https://github.com/octo/demo')).toEqual({ owner: 'octo', repo: 'demo' });
    expect(githubRepoOf('https://github.com/octo/demo/tree/main/docs')).toEqual({ owner: 'octo', repo: 'demo' });
    for (const url of ['https://github.com/octocat', 'https://github.com/orgs/x/repositories', 'https://github.com/topics/arabic', 'https://gist.github.com/o/abc', 'https://octo.github.io/demo', 'https://example.com/octo/demo', 'https://api.github.com/repos/o/r', 'http://github.com/o/r', 'نص'])
      expect(githubRepoOf(url), url).toBeNull();
  });
});

describe('isIsoDate', () => {
  it('تاريخ حقيقي بصيغة YYYY-MM-DD', () => {
    expect(isIsoDate('2026-10-23')).toBe(true);
    for (const v of ['2026-13-01', '2026-02-30', '26-10-23', '2026-10-23T00:00:00Z', 7, null]) expect(isIsoDate(v), String(v)).toBe(false);
  });
});

describe('resourceProblems', () => {
  it('مورد سليم', () => expect(resourceProblems(valid)).toEqual([]));

  it.each([
    ['معرّف بحروف كبيرة', { id: 'ABC' }],
    ['عنوان فارغ', { title: '  ' }],
    ['رابط http', { url: 'http://example.com' }],
    ['تصنيف فارغ', { category: '' }],
    ['حالة مجهولة', { status: 'dead' }],
    ['تاريخ سيئ', { lastVerified: '2026-99-99' }],
    ['حالة محققة بلا تاريخ', { status: 'active', lastVerified: null }],
    ['أصل مجهول', { origin: 'remote' }],
    ['مصدر مفقود', { source: undefined }],
    ['حقل اختياري بنوع خاطئ', { note: 5 }],
    ['وصف أطول من الحد', { description: 'و'.repeat(601) }],
    ['رابط نقل سيئ', { movedTo: 'http://x.y' }],
  ])('يرفض %s', (_name, patch) => expect(resourceProblems({ ...valid, ...patch })).not.toEqual([]));

  it('غير الكائنات', () => {
    for (const v of [null, 5, 'x', []]) expect(resourceProblems(v)).toEqual(['العنصر ليس كائنًا.']);
    expect(isResource(valid)).toBe(true);
  });

  it('حالة «لم يُتحقق» و«تعذّر» تقبلان بلا تاريخ', () => {
    expect(resourceProblems({ ...valid, status: 'unverified', lastVerified: null })).toEqual([]);
    expect(resourceProblems({ ...valid, status: 'unreachable', lastVerified: null })).toEqual([]);
  });
});

describe('parseResourceFile', () => {
  const file = (patch: Record<string, unknown> = {}) => ({ format: 'mijhar-resources', schemaVersion: 1, categories: [], resources: [valid], ...patch });

  it('يقبل نصًا أو كائنًا', () => {
    expect(parseResourceFile(JSON.stringify(file()))).toMatchObject({ ok: true });
    expect(parseResourceFile(file())).toMatchObject({ ok: true });
  });

  it.each([
    ['نص غير JSON', '{oops'],
    ['ليس كائنًا', '[1,2]'],
    ['صيغة مجهولة', JSON.stringify(file({ format: 'other' }))],
    ['إصدار غير صالح', JSON.stringify(file({ schemaVersion: 0 }))],
    ['إصدار أحدث', JSON.stringify(file({ schemaVersion: 2 }))],
    ['قائمة مفقودة', JSON.stringify(file({ resources: 'x' }))],
  ])('يرفض %s كله', (_name, input) => expect(parseResourceFile(input)).toMatchObject({ ok: false }));

  it('عناصر غير صالحة تُعزل مع أسبابها وتدخل السليمة، والمعرّف المكرر يُرفض', () => {
    const parsed = parseResourceFile(file({ resources: [valid, { ...valid, id: 'BAD ID' }, { ...valid, id: 'second' }, { ...valid, id: 'second' }, 5] }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.file.resources.map((r) => r.id)).toEqual([valid.id, 'second']);
    expect(parsed.invalid.map((i) => i.index)).toEqual([1, 3, 4]);
    expect(parsed.invalid[1]?.problems).toContain('معرّف مكرر داخل الملف.');
  });
});

describe('draftProblems', () => {
  it('إضافة مستخدم', () => {
    expect(draftProblems({ title: 'ع', url: 'https://example.com', category: 'lists', description: '' })).toEqual([]);
    expect(draftProblems({ title: '', url: 'ftp://x', category: '', description: 'ط'.repeat(700) }).length).toBe(4);
  });
});

describe('القائمة المضمّنة src/data/resources/resources.json', () => {
  const { resources, categories } = builtinResources();

  it('كل عناصرها صالحة بالمخطط ولا يسقط منها شيء', () => {
    const raw = (RESOURCES as { resources: unknown[] }).resources;
    expect(resources).toHaveLength(raw.length);
    expect(resources.length).toBeGreaterThanOrEqual(10);
    for (const resource of resources) expect(resourceProblems(resource), resource.id).toEqual([]);
  });

  it('معرّفات وروابط فريدة، وكل مورد بتصنيف معرَّف', () => {
    expect(new Set(resources.map((r) => r.id)).size).toBe(resources.length);
    expect(new Set(resources.map((r) => r.url.toLowerCase())).size).toBe(resources.length);
    const ids = new Set(categories.map((c) => c.id));
    for (const r of resources) expect(ids.has(r.category), r.id).toBe(true);
  });

  it('لكل مورد تاريخ آخر تحقق (ليس في المستقبل) وحالة وتوثيق مصدر، وكلها مضمّنة', () => {
    for (const r of resources) {
      expect(r.lastVerified, r.id).not.toBeNull();
      expect(r.lastVerified as string <= '2026-10-23', r.id).toBe(true);
      expect(RESOURCE_STATUSES).toContain(r.status);
      expect(r.source.length, r.id).toBeGreaterThan(20);
      expect(r.origin).toBe('builtin');
    }
  });

  it('روابطها كلها مستودعات github.com (فحصها الآلي ممكن) وبلا روابط خارجية في القائمة الأولى', () => {
    for (const r of resources) expect(githubRepoOf(r.url), r.url).not.toBeNull();
  });

  it('حالة المراجعة معلنة بصدق: دُقِّقت آليًا وتنتظر مراجعة بشرية', () => {
    const review = (RESOURCES as { review: { status: string; note: string } }).review;
    expect(review.status).toBe('automated-pending-owner-review');
    expect(review.note).toMatch(/لم يراجعه إنسان/);
  });
});

describe('عينة الاختبار', () => {
  it('أربعون موردًا بحالات وتصنيفات متنوعة وروابط خارجية', () => {
    expect(TEST_SET.resources).toHaveLength(40);
    expect(new Set(TEST_SET.resources.map((r) => r.status))).toEqual(new Set(RESOURCE_STATUSES));
    expect(TEST_SET.resources.filter((r) => githubRepoOf(r.url) === null).length).toBe(8);
  });
});

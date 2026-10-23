// تصنيف مسارات GitHub إلى أنواع الصفحات (T-1.2: اكتشاف الصفحة).
import { describe, expect, it } from 'vitest';
import { PAGE_TYPES, classifyPath } from '../../../src/core';
import type { PageType } from '../../../src/core';

const cases: Array<[string, PageType, string | null, string | null, number | null]> = [
  ['/', 'home', null, null, null],
  ['/octocat', 'profile', 'octocat', null, null],
  ['/octo/demo', 'repo', 'octo', 'demo', null],
  ['/octo/demo/', 'repo', 'octo', 'demo', null],
  ['/octo/demo/tree/main/src', 'tree', 'octo', 'demo', null],
  ['/octo/demo/tree/feature/with/slashes', 'tree', 'octo', 'demo', null],
  ['/octo/demo/blob/main/README.md', 'blob', 'octo', 'demo', null],
  ['/octo/demo/issues', 'issue-list', 'octo', 'demo', null],
  ['/octo/demo/issues/new', 'issue-new', 'octo', 'demo', null],
  ['/octo/demo/issues/7', 'issue', 'octo', 'demo', 7],
  ['/octo/demo/issues/abc', 'other', 'octo', 'demo', null],
  ['/octo/demo/pulls', 'pr-list', 'octo', 'demo', null],
  ['/octo/demo/pull/42', 'pr', 'octo', 'demo', 42],
  ['/octo/demo/pull/42/files', 'pr-files', 'octo', 'demo', 42],
  ['/octo/demo/pull/42/changes', 'pr-files', 'octo', 'demo', 42],
  ['/octo/demo/pull/42/commits', 'pr-commits', 'octo', 'demo', 42],
  ['/octo/demo/pull/42/checks', 'pr-checks', 'octo', 'demo', 42],
  ['/octo/demo/pull/42/anything-else', 'pr', 'octo', 'demo', 42],
  ['/octo/demo/pull/new/feature', 'compare', 'octo', 'demo', null],
  ['/octo/demo/compare/main...feature', 'compare', 'octo', 'demo', null],
  ['/octo/demo/commit/abcdef1234', 'commit', 'octo', 'demo', null],
  ['/octo/demo/commit', 'other', 'octo', 'demo', null],
  ['/octo/demo/actions', 'actions', 'octo', 'demo', null],
  ['/octo/demo/actions/runs/123456', 'actions-run', 'octo', 'demo', 123456],
  ['/octo/demo/actions/workflows/ci.yml', 'actions', 'octo', 'demo', null],
  ['/octo/demo/discussions', 'discussion-list', 'octo', 'demo', null],
  ['/octo/demo/discussions/9', 'discussion', 'octo', 'demo', 9],
  ['/octo/demo/releases', 'releases', 'octo', 'demo', null],
  ['/octo/demo/wiki', 'other', 'octo', 'demo', null],
  ['/search', 'search', null, null, null],
  ['/settings/profile', 'settings', null, null, null],
  ['/notifications', 'other', null, null, null],
  ['/issues', 'other', null, null, null],
  ['/orgs/octo-org/people', 'other', null, null, null],
  ['/marketplace/actions', 'other', null, null, null],
];

describe('classifyPath', () => {
  it.each(cases)('%s ← %s', (pathname, type, owner, repo, number) => {
    expect(classifyPath(pathname)).toEqual({ type, owner, repo, number });
  });

  it('مقاطع مرمَّزة بالنسبة المئوية تُفك، وغير الصالح منها لا يرمي', () => {
    expect(classifyPath('/octo/%D9%85%D8%AC%D9%87%D8%B1').repo).toBe('مجهر');
    expect(classifyPath('/octo/%E0%A4%A').repo).toBe('%E0%A4%A');
  });

  it('أسماء الجذور المحجوزة غير حساسة لحالة الأحرف', () => {
    expect(classifyPath('/Settings/profile').type).toBe('settings');
    expect(classifyPath('/SEARCH').type).toBe('search');
  });

  it('كل نوع يُعيده التصنيف مُعرَّف في PAGE_TYPES', () => {
    for (const [pathname] of cases) expect(PAGE_TYPES).toContain(classifyPath(pathname).type);
  });
});

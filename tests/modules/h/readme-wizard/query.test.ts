// TEST-COMM-02 (وحدة): قالب استعلام فحص التكرار وفحصه الآلي قبل اعتماده (AC-H2): عوامل OR، ووسوم is:issue وis:pr، والتقييد بالمستودع
// الحالي، وعدم قصره على المفتوحة أو المغلقة، وترميز الرابط ذهابًا وإيابًا.
import { describe, expect, it } from 'vitest';
import { DUPLICATE_TERMS, checkDuplicateQuery, duplicateQuery, duplicateSearchUrl } from '../../../../src/modules/h/readme-wizard';

const REPOS: Array<[string, string]> = [
  ['octo', 'community'],
  ['expressjs', 'express'],
  ['twbs', 'bootstrap'],
  ['EbookFoundation', 'free-programming-books'],
  ['my-org', 'repo.with.dots'],
  ['a_b', 'x_y-z.2'],
  ['Barqawiz', 'Shakkala'],
];

describe('القالب', () => {
  it('المستودع الحالي، و(is:issue OR is:pr) بلا قيد حالة (مفتوحة ومغلقة)، وREADME وكلمات الترجمة', () => {
    expect(duplicateQuery('octo', 'community')).toBe('repo:octo/community (is:issue OR is:pr) readme (arabic OR عربي OR العربية OR translation)');
    expect(DUPLICATE_TERMS).toContain('arabic');
  });

  it.each(REPOS)('القالب يجتاز الفحص الآلي لـ%s/%s قبل اعتماده، والرابط يعيد الاستعلام حرفيًا', (owner, repo) => {
    const query = duplicateQuery(owner, repo);
    const check = checkDuplicateQuery(query, owner, repo);
    expect(check.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(check.issues).toEqual([]);
    expect(check.ok).toBe(true);
    expect(check.operators).toBeLessThanOrEqual(5);
    const url = new URL(check.url as string);
    expect(url.origin + url.pathname).toBe('https://github.com/search');
    expect(url.searchParams.get('type')).toBe('issues');
    expect(url.searchParams.get('q')).toBe(query);
    expect(url.search).not.toMatch(/[\s"()<>]/);
    expect(url.search).toContain('is%3Aissue+OR+is%3Apr');
    expect(url.search).toContain(`repo%3A${encodeURIComponent(owner)}%2F${encodeURIComponent(repo)}`);
  });
});

describe('الفحص الآلي لاستعلام عدّله المستخدم', () => {
  const codes = (query: string) => checkDuplicateQuery(query, 'octo', 'community').issues.map((i) => i.code);

  it('is:issue وis:pr بلا OR خطأ (يصيران «و» فلا نتيجة)، وغياب أحدهما خطأ', () => {
    expect(codes('repo:octo/community is:issue is:pr readme arabic')).toContain('kinds-without-or');
    expect(codes('repo:octo/community (is:issue is:pr) readme')).toContain('kinds-without-or');
    expect(codes('repo:octo/community is:issue readme arabic')).toContain('missing-kind');
    expect(codes('repo:octo/community is:issue OR is:pr readme')).not.toContain('kinds-without-or');
  });

  it('غياب repo: أو مستودع آخر خطأ؛ وقيد الحالة تحذير لا يمنع', () => {
    expect(codes('(is:issue OR is:pr) readme arabic')).toContain('missing-repo');
    expect(codes('repo:other/x (is:issue OR is:pr) readme')).toContain('other-repo');
    const limited = checkDuplicateQuery('repo:octo/community (is:issue OR is:pr) is:open readme', 'octo', 'community');
    expect(limited.issues.map((i) => [i.code, i.severity])).toContainEqual(['state-limited', 'warning']);
    expect(limited.ok).toBe(true);
  });

  it('أخطاء الصياغة العامة (OR معلّق، أقواس، اقتباس، أكثر من خمسة معاملات) تعطّل الرابط', () => {
    for (const query of [
      'repo:octo/community (is:issue OR is:pr) readme (arabic OR)',
      'repo:octo/community (is:issue OR is:pr readme',
      'repo:octo/community (is:issue OR is:pr) "readme arabic',
      'repo:octo/community (is:issue OR is:pr) (a OR b OR c OR d OR e OR f)',
    ]) {
      const check = checkDuplicateQuery(query, 'octo', 'community');
      expect(check.ok, query).toBe(false);
      expect(check.url).toBeNull();
    }
  });

  it('or بأحرف صغيرة تحذير (كلمة بحث لا معامل)', () => {
    expect(checkDuplicateQuery('repo:octo/community (is:issue OR is:pr) readme (arabic or عربي)', 'octo', 'community').issues.map((i) => i.code)).toContain('lowercase-operator');
  });

  it('الرابط يرمّز العربية وعلامات الاقتباس فيعود الاستعلام كما هو', () => {
    const query = 'repo:octo/community (is:issue OR is:pr) "README عربي" (ترجمة OR arabic)';
    const check = checkDuplicateQuery(query, 'octo', 'community');
    expect(check.ok).toBe(true);
    expect(new URL(check.url as string).searchParams.get('q')).toBe(query);
    expect(duplicateSearchUrl(query)).toBe(check.url);
  });
});

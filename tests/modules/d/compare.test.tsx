// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/compare/main...feature%2Fui-refresh"}
// TEST-DIFF-01 (AC-D6): في صفحات المقارنة المرجعية للحالات الثلاث (فرعان، التزامان، وسمان) يطابق إحصاء الملفات (العدد والمضاف
// والمحذوف وتصنيف النوع) الأرقام المعروضة في الصفحة نفسها؛ وقسم تفسير الأثر منفصل بصريًا وهيكليًا وموسوم «يحتاج مراجعة بشرية».
// العينات: مسارات وأسطر 27 ملفًا حقيقية من صفحة التزام عام محفوظة (انظر ترويسة كل عينة).
import { describe, expect, it } from 'vitest';
import {
  COMPARE_SELECTORS,
  FILE_KINDS,
  IMPACT_REVIEW_LABEL,
  buildImpactNotes,
  classifyFile,
  createCompareModule,
  inferCompareKind,
  parseCompareRefs,
  readCompare,
} from '../../../src/modules/d/compare';
import type { CompareSummary, FileKind } from '../../../src/modules/d/compare';
import { flush, hostsOf, loadHtml, mountModules, selectorsWith, shadowText } from './helpers';

const selectors = () => selectorsWith(COMPARE_SELECTORS);
const go = (path: string): void => window.history.pushState({}, '', path);
const read = (file: string, path: string): CompareSummary => {
  loadHtml(file);
  go(path);
  return readCompare(document, selectors(), `https://github.com${path}`);
};

const CASES = [
  { name: 'فرعان', file: 'fixture-compare-branches.html', path: '/octo/demo/compare/main...feature%2Fui-refresh', kind: 'branches', files: 30, additions: 4301, deletions: 733, byKind: { code: 21, tests: 6, dependencies: 1, workflows: 1, docs: 1, other: 0 } },
  { name: 'التزامان', file: 'fixture-compare-commits.html', path: '/octo/demo/compare/98ea6bc...86a863a', kind: 'commits', files: 27, additions: 4268, deletions: 726, byKind: { code: 21, tests: 6, dependencies: 0, workflows: 0, docs: 0, other: 0 } },
  { name: 'وسمان (إصداران)', file: 'fixture-compare-tags.html', path: '/octo/demo/compare/v1.4.0...v1.5.0', kind: 'tags', files: 12, additions: 1891, deletions: 387, byKind: { code: 8, tests: 4, dependencies: 0, workflows: 0, docs: 0, other: 0 } },
] as const;

describe('تصنيف نوع الملف من مساره', () => {
  const kind = (path: string): FileKind => classifyFile(path);
  it('الأنواع الخمسة والباقي «أخرى»', () => {
    expect(kind('src/app/main.ts')).toBe('code');
    expect(kind('server/services/__tests__/dayHours.test.ts')).toBe('tests');
    expect(kind('shared/attendanceHours.test.ts')).toBe('tests');
    expect(kind('tests/test_login.py')).toBe('tests');
    expect(kind('pkg/util_test.go')).toBe('tests');
    expect(kind('package.json')).toBe('dependencies');
    expect(kind('client/package-lock.json')).toBe('dependencies');
    expect(kind('requirements-dev.txt')).toBe('dependencies');
    expect(kind('go.sum')).toBe('dependencies');
    expect(kind('.github/workflows/ci.yml')).toBe('workflows');
    expect(kind('.github/actions/setup/action.yml')).toBe('workflows');
    expect(kind('README.md')).toBe('docs');
    expect(kind('docs/guide/intro.mdx')).toBe('docs');
    expect(kind('LICENSE')).toBe('docs');
    expect(kind('assets/logo.png')).toBe('other');
    expect(kind('config/settings.yaml')).toBe('other');
  });

  it('الأسبقية: سير العمل ثم الاعتماديات ثم الاختبارات ثم التوثيق؛ وعلامات الاتجاه حول المسار تُزال', () => {
    expect(kind('.github/workflows/package.json')).toBe('workflows');
    expect(kind('tests/package.json')).toBe('dependencies');
    expect(kind('tests/helpers/README.md')).toBe('tests');
    expect(kind('‎src/x.ts‎')).toBe('code');
  });
});

describe('طرفا المقارنة ونوعها', () => {
  it('يُقرآن من المسار (مشفَّرًا أو بنقطتين) ولا يُخمَّن ما لا يطابق', () => {
    expect(parseCompareRefs('https://github.com/octo/demo/compare/main...feature%2Fui-refresh')).toEqual({ base: 'main', head: 'feature/ui-refresh' });
    expect(parseCompareRefs('https://github.com/octo/demo/compare/v1.0.0..v1.1.0')).toEqual({ base: 'v1.0.0', head: 'v1.1.0' });
    expect(parseCompareRefs('https://github.com/octo/demo/compare/fork:main...main')).toEqual({ base: 'fork:main', head: 'main' });
    expect(parseCompareRefs('https://github.com/octo/demo/compare/main')).toBeNull();
    expect(parseCompareRefs('https://github.com/octo/demo/pull/4')).toBeNull();
    expect(parseCompareRefs('ليس رابطًا')).toBeNull();
  });

  it('النوع: التزامان إن كان الطرفان sha، ووسمان إن بدوا إصدارين أو ظهرت أيقونتا وسم، وإلا فرعان', () => {
    expect(inferCompareKind({ base: '98ea6bc', head: '86a863a1c2' }, 0)).toBe('commits');
    expect(inferCompareKind({ base: 'v1.4.0', head: 'v1.5.0' }, 0)).toBe('tags');
    expect(inferCompareKind({ base: 'release-a', head: 'release-b' }, 2)).toBe('tags');
    expect(inferCompareKind({ base: 'main', head: 'feature/x' }, 0)).toBe('branches');
    expect(inferCompareKind({ base: 'deadbeef', head: 'main' }, 0)).toBe('branches');
    expect(inferCompareKind(null, 0)).toBe('unknown');
  });
});

describe.each(CASES)('عينة المقارنة: $name', (c) => {
  it('نوع المقارنة والطرفان من المسار', () => {
    const s = read(c.file, c.path);
    expect(s.kind).toBe(c.kind);
    expect(s.base.available && s.head.available).toBe(true);
  });

  it('إحصاء الملفات يطابق الأرقام المعروضة في الصفحة: العدد والمضاف والمحذوف', () => {
    const s = read(c.file, c.path);
    expect(s.page.files).toEqual({ available: true, value: c.files });
    expect(s.page.additions).toEqual({ available: true, value: c.additions });
    expect(s.page.deletions).toEqual({ available: true, value: c.deletions });
    expect(s.read).toEqual({ files: c.files, additions: c.additions, deletions: c.deletions });
    expect(s.reconciliation).toEqual({ files: 'match', additions: 'match', deletions: 'match', complete: true });
  });

  it('تصنيف النوع: أعداد كل نوع ومجموعها عدد الملفات، وأسطرها تجمع إلى مجموع الصفحة', () => {
    const s = read(c.file, c.path);
    for (const kind of FILE_KINDS) expect(s.byKind[kind].files, kind).toBe(c.byKind[kind]);
    expect(FILE_KINDS.reduce((n, k) => n + s.byKind[k].files, 0)).toBe(c.files);
    expect(FILE_KINDS.reduce((n, k) => n + s.byKind[k].additions, 0)).toBe(c.additions);
    expect(FILE_KINDS.reduce((n, k) => n + s.byKind[k].deletions, 0)).toBe(c.deletions);
  });

  it('الأرقام المعروضة في الملخص نفسها المعروضة في الصفحة، وقسم الأثر منفصل هيكليًا وبصريًا وموسوم', async () => {
    loadHtml(c.file);
    go(c.path);
    const before = document.documentElement.outerHTML;
    const { manager, errors } = await mountModules([createCompareModule({ debounceMs: 5 })]);
    expect(errors).toEqual([]);
    const hosts = hostsOf('d.compare');
    expect(hosts).toHaveLength(2);
    const [factsHost, impactHost] = hosts as [HTMLElement, HTMLElement];
    const facts = factsHost.shadowRoot!.querySelector('[data-section="facts"]') as HTMLElement;
    const impact = impactHost.shadowRoot!.querySelector('[data-section="impact"]') as HTMLElement;
    expect(facts).not.toBeNull();
    expect(impact).not.toBeNull();

    // انفصال هيكلي: مضيفان شقيقان في الصفحة وجذرا ظل مختلفان؛ لا يحتوي أحدهما الآخر.
    expect(factsHost).not.toBe(impactHost);
    expect(factsHost.contains(impactHost) || impactHost.contains(factsHost)).toBe(false);
    expect(factsHost.parentNode).toBe(impactHost.parentNode);
    expect(facts.contains(impact) || impact.contains(facts)).toBe(false);
    // انفصال بصري: إطار متقطع وخلفية مختلفة للأثر.
    expect(impact.classList.contains('d-impact')).toBe(true);
    expect(facts.classList.contains('d-impact')).toBe(false);
    // الوسم.
    expect(impact.querySelector('[data-review="human"]')?.textContent).toBe(IMPACT_REVIEW_LABEL);
    expect(IMPACT_REVIEW_LABEL).toBe('يحتاج مراجعة بشرية');
    // لا ملاحظات أثر في قسم الحقائق، ولا أرقام جدول الأنواع في قسم الأثر.
    expect(facts.querySelector('[data-list="impact"]')).toBeNull();
    expect(impact.querySelector('table')).toBeNull();

    // أرقام الصفحة تظهر في الملخص كما هي.
    const grid = (field: string) => facts.querySelector(`[data-field="${field}"] dd`)?.textContent?.replace(/\s+/g, ' ').trim();
    expect(grid('page-files')).toBe(c.files.toLocaleString('en-US'));
    expect(grid('page-lines')).toContain(c.additions.toLocaleString('en-US'));
    expect(grid('page-lines')).toContain(c.deletions.toLocaleString('en-US'));
    expect(facts.querySelector('[data-field="read"]')?.getAttribute('data-agreement') ?? facts.querySelector('[data-field="read"] dd')?.getAttribute('data-agreement')).toBe('match');
    expect(facts.querySelector('[data-completeness]')?.getAttribute('data-completeness')).toBe('complete');
    for (const kind of FILE_KINDS) expect(facts.querySelector(`tr[data-kind="${kind}"] td.num`)?.textContent).toBe(String(c.byKind[kind]));
    expect(facts.querySelector('tr[data-kind="total"] td.num')?.textContent).toBe(String(c.files));

    manager.stop();
    expect(hostsOf('d.compare')).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
  });
});

describe('ملاحظات الأثر', () => {
  it('عينة الفرعين: اعتماديات وسير عمل (الكود مع اختبارات فلا ملاحظة عنه)', () => {
    const ids = buildImpactNotes(read('fixture-compare-branches.html', CASES[0].path)).map((n) => n.id);
    expect(ids).toContain('dependencies');
    expect(ids).toContain('workflows');
    expect(ids).not.toContain('code-without-tests');
    expect(ids).not.toContain('partial-read');
  });

  it('كود بلا اختبارات، وكل ملف توثيق، وحجم كبير', () => {
    const base = read('fixture-compare-commits.html', CASES[1].path);
    const noTests: CompareSummary = { ...base, byKind: { ...base.byKind, tests: { files: 0, additions: 0, deletions: 0 } } };
    expect(buildImpactNotes(noTests).map((n) => n.id)).toContain('code-without-tests');
    const docs: CompareSummary = { ...base, read: { files: 3, additions: 3, deletions: 0 }, byKind: { ...base.byKind, code: { files: 0, additions: 0, deletions: 0 }, tests: { files: 0, additions: 0, deletions: 0 }, docs: { files: 3, additions: 3, deletions: 0 } } };
    expect(buildImpactNotes(docs).map((n) => n.id)).toContain('docs-only');
    expect(buildImpactNotes(base).map((n) => n.id)).toContain('large-change');
  });

  it('كل ملاحظة تذكر الرقم الذي بُنيت عليه', () => {
    const notes = buildImpactNotes(read('fixture-compare-branches.html', CASES[0].path));
    expect(notes.find((n) => n.id === 'dependencies')?.text).toMatch(/\b1\b/);
    expect(notes.find((n) => n.id === 'large-change')?.text).toMatch(/30/);
  });
});

describe('الصفحة لم تُحمَّل كل ملفاتها بعد', () => {
  it('الملفات المقروءة أقل من المعلن: لا مطابقة، وتُعلن الجزئية بدل عرض أرقام جزئية كاملة', async () => {
    loadHtml('fixture-compare-commits.html');
    go(CASES[1].path);
    for (const region of [...document.querySelectorAll('[role="region"][aria-labelledby^="heading-"]')].slice(20)) region.remove();
    const s = readCompare(document, selectors(), `https://github.com${CASES[1].path}`);
    expect(s.page.files).toEqual({ available: true, value: 27 });
    expect(s.read.files).toBe(20);
    expect(s.reconciliation).toMatchObject({ files: 'mismatch', additions: 'unknown', deletions: 'unknown', complete: false });
    expect(buildImpactNotes(s).map((n) => n.id)).toContain('partial-read');

    const { manager } = await mountModules([createCompareModule({ debounceMs: 5 })]);
    const text = shadowText(hostsOf('d.compare')[0]);
    expect(text).toContain('الملفات المقروءة أقل من المعلن');
    manager.stop();
  });

  it('صفحة بلا ملفات ولا أرقام: غير متاح لا أصفار مخمّنة', async () => {
    loadHtml('fixture-compare-commits.html');
    go(CASES[1].path);
    document.querySelector('#diff-comparison-viewer-container')!.replaceChildren();
    document.querySelector('.commitFilesChangedContainer')!.remove();
    const s = readCompare(document, selectors(), `https://github.com${CASES[1].path}`);
    expect(s.page.files.available).toBe(false);
    expect(s.page.additions.available).toBe(false);
    expect(s.read.files).toBe(0);
    expect(s.reconciliation.files).toBe('unknown');
    const { manager } = await mountModules([createCompareModule({ debounceMs: 5 })]);
    expect(shadowText(hostsOf('d.compare')[0])).toContain('غير متاح');
    manager.stop();
  });

  it('تحميل ملفات إضافية بعد التركيب يجدّد الملخص ويُكمل المطابقة', async () => {
    loadHtml('fixture-compare-commits.html');
    go(CASES[1].path);
    const container = document.querySelector('#diff-comparison-viewer-container') as HTMLElement;
    const removed = [...container.children].slice(20);
    for (const node of removed) node.remove();
    const { manager } = await mountModules([createCompareModule({ debounceMs: 5 })]);
    const [factsHost] = hostsOf('d.compare');
    const completeness = () => factsHost?.shadowRoot?.querySelector('[data-completeness]')?.getAttribute('data-completeness');
    expect(completeness()).toBe('partial');
    container.append(...removed);
    await flush(40);
    expect(completeness()).toBe('complete');
    manager.stop();
  });
});

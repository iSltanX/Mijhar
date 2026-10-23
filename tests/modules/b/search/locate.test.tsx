// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// «أبرز الموضع» (AC-B6): يحدد عنصر المدخل في الصفحة الحالية بمطابقة بطاقة الشرح نفسها، أو يعرض مسار التبويب الذي يوجد فيه، أو يعلن أنه مصطلح عام؛
// ولا يعدّل الصفحة. على العينة المرجعية fixture-github-ui-sample.html (فيها شراك: «Delete this repository» وزر مخفي وaria-hidden).
import { beforeEach, describe, expect, it } from 'vitest';
import { GLOSSARY_ENTRIES } from '../../../../src/modules/b/card';
import { PAGE_KIND_PATHS, findEntry, locateEntry, whereIs } from '../../../../src/modules/b/search';
import { SAMPLE, loadHtml } from '../card/helpers';

const REPO = { type: 'repo', href: 'https://github.com/octo/demo' } as const;
const ISSUES = { type: 'issue-list', href: 'https://github.com/octo/demo/issues' } as const;
const entry = (id: string) => findEntry(GLOSSARY_ENTRIES, id);

beforeEach(() => loadHtml(SAMPLE));

describe('locateEntry على العينة', () => {
  it('عنصر موجود: يُحدَّد العنصر الأصلي نفسه', () => {
    const { result, elements } = locateEntry(entry('star'), document, REPO);
    expect(result).toEqual({ status: 'found', count: 1 });
    expect(elements).toEqual([document.querySelector('#star-btn')]);
  });

  it('عدة عناصر من التوقيع نفسه: كلها', () => {
    const { result, elements } = locateEntry(entry('repo-tab-settings'), document, REPO);
    expect(result.status).toBe('found');
    expect(elements.length).toBeGreaterThanOrEqual(1);
    expect(elements.every((el) => el.isConnected)).toBe(true);
  });

  it('لا يحدد الشراك: زر «Delete this repository» ليس «Delete repository» ولا يُبرز', () => {
    const { result, elements } = locateEntry(entry('delete_repo'), document, REPO);
    expect(result.status).toBe('elsewhere');
    expect(elements).toEqual([]);
    expect(document.querySelector('#decoy-delete')).not.toBeNull();
  });

  it('عنصر في صفحة أخرى: مسار التبويب، وhere=false', () => {
    const { result } = locateEntry(entry('settings-ssh-add'), document, REPO);
    expect(result.status).toBe('elsewhere');
    if (result.status !== 'elsewhere') throw new Error('unreachable');
    expect(result.here).toBe(false);
    expect(result.paths).toEqual(whereIs(entry('settings-ssh-add')!).paths);
    expect(result.paths.join(' ')).toContain('إعدادات الحساب');
  });

  it('عنصر من صفحة الحالية ولم يُعثر عليه: here=true (قد يغيب لصلاحية أو حالة)', () => {
    // تبويب Issues يخص صفحة المستودع، ونقيس على صفحة مستودع بلا عينته بعد حذفه من DOM.
    document.querySelector('#repo-tabs')?.remove();
    for (const el of document.querySelectorAll('a')) if (/issues/i.test(el.textContent ?? '')) el.remove();
    const { result } = locateEntry(entry('repo-tab-issues'), document, REPO);
    expect(result.status).toBe('elsewhere');
    if (result.status === 'elsewhere') expect(result.here).toBe(true);
  });

  it('مفهوم عام بلا توقيع: concept، ولا مسارات', () => {
    expect(locateEntry(entry('repository'), document, REPO).result).toEqual({ status: 'concept' });
    expect(whereIs(entry('repository')!)).toEqual({ kind: 'concept', paths: [] });
  });

  it('مدخل مجهول: unknown-entry', () => {
    expect(locateEntry(findEntry(GLOSSARY_ENTRIES, 'لا-يوجد'), document, REPO).result).toEqual({ status: 'unknown-entry' });
  });

  it('لا تعدّل الصفحة', () => {
    const before = document.documentElement.outerHTML;
    for (const e of GLOSSARY_ENTRIES) locateEntry(e, document, REPO);
    expect(document.documentElement.outerHTML).toBe(before);
  });
});

describe('مسارات الوجود', () => {
  it('كل نوع صفحة في القاموس له مسار بالعربية، وكل عنصر بتوقيع له مسار واحد على الأقل', () => {
    for (const path of Object.values(PAGE_KIND_PATHS)) expect(path).toMatch(/[؀-ۿ]/);
    for (const e of GLOSSARY_ENTRIES) {
      const where = whereIs(e);
      if (e.kind === 'element') expect(where.paths.length, e.id).toBeGreaterThan(0);
      else expect(where.paths, e.id).toEqual([]);
    }
  });

  it('صفحة أخرى بالنوع: تبويب Issues لا يوجد في صفحة قائمة المشكلات إلا إن وُجد العنصر', () => {
    const { result } = locateEntry(entry('repo-tab-code'), document, ISSUES);
    expect(['found', 'elsewhere']).toContain(result.status);
  });
});

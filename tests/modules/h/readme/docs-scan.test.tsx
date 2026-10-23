// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/community"}
// TEST-COMM-01 (AC-H1) — الشريط وزر فحص docs/: لا طلب قبل النقر، والصلاحية أولًا، وكل فشل يعلن «لم يكتمل»، وعدم ظهور جزم بالغياب.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SelectorsRegistry } from '../../../../src/core/detector';
import { UNAVAILABLE_ACCESS, githubApiAccess } from '../../../../src/modules/h/api-access';
import { DocsScanControl, MAX_SCAN_REQUESTS, README_SELECTORS, ReadmeBanner, SCOPE_STATEMENT, detectArabicReadme, extractReadmeScan, scanDocsFolder } from '../../../../src/modules/h/readme-detector';
import type { ReadmeDetection } from '../../../../src/modules/h/readme-detector';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { ASSERTIVE_ABSENCE, fakeAccess, flush, loadFixture } from '../helpers';
import type { Responder } from '../helpers';

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const el = container.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush(10);
  });
  await act(async () => void (await flush(10)));
};
const detection = (fixture: string): ReadmeDetection => {
  const dom = loadFixture(fixture);
  return detectArabicReadme(extractReadmeScan(dom.window.document, new SelectorsRegistry(README_SELECTORS)), { owner: 'octo', repo: 'community', base: 'https://github.com/octo/community' });
};
const BASE = '/repos/octo/community/contents/';
const listing = (...names: Array<[string, 'file' | 'dir']>) => names.map(([name, type]) => ({ name, path: `docs/${name}`, type, html_url: `https://github.com/octo/community/blob/main/docs/${name}` }));

describe('الشريط عند العثور', () => {
  it('يعرض رابط الملف العربي ولا زر فحص', async () => {
    await act(async () => render(<ReadmeBanner detection={detection('fixture-community-repo-arabic.html')} owner="octo" repo="community" />, container));
    expect($('[data-readme-state="found"]').textContent).toContain('يتوفر ملف تعريف باللغة العربية لهذا المستودع');
    const link = $<HTMLAnchorElement>('[data-readme-match="README.ar-AR.md"]');
    expect(link.getAttribute('href')).toBe('https://github.com/octo/community/blob/main/README.ar-AR.md');
    expect(container.querySelector('[data-action="scan-docs"]')).toBeNull();
  });
});

describe('الشريط عند عدم العثور', () => {
  const states: Array<[string, string]> = [
    ['شجرة كاملة', 'fixture-community-repo.html'],
    ['شجرة مقطوعة', 'fixture-community-repo-truncated.html'],
  ];

  it.each(states)('%s: بيان نطاق الفحص كاملًا ولا عبارة تجزم بالغياب', async (_name, fixture) => {
    await act(async () => render(<ReadmeBanner detection={detection(fixture)} owner="octo" repo="community" />, container));
    expect($('[data-readme-state="not-found-in-scope"]').textContent).toBe(SCOPE_STATEMENT);
    expect(SCOPE_STATEMENT).toContain('شجرة الجذر الظاهرة');
    expect(SCOPE_STATEMENT).toContain('الروابط المباشرة داخل README الأساسي');
    expect(SCOPE_STATEMENT).toMatch(/ناقصة أو مقطوعة/);
    expect(SCOPE_STATEMENT).toMatch(/docs\/ أو i18n\//);
    for (const pattern of ASSERTIVE_ABSENCE) expect(container.textContent, String(pattern)).not.toMatch(pattern);
    expect($('[data-readme-scope]').textContent).toContain('9 عنصرًا من شجرة الجذر');
    expect($('[data-readme-scope]').textContent).toContain('docs');
    expect($('[data-action="scan-docs"]')).not.toBeNull();
  });

  it('الاقتطاع يظهر صراحة بأرقامه، ويمنع الحكم بغياب أي ملف', async () => {
    await act(async () => render(<ReadmeBanner detection={detection('fixture-community-repo-truncated.html')} owner="octo" repo="community" />, container));
    expect($('[data-readme-truncated]').textContent).toContain('مقتطعة');
    expect($('[data-readme-truncated]').textContent).toContain('1000');
    expect($('[data-readme-truncated]').textContent).toContain('5108');
    expect(container.querySelector('[data-readme-truncated]')).not.toBeNull();
  });

  it('شجرة كاملة: لا إعلان اقتطاع', async () => {
    await act(async () => render(<ReadmeBanner detection={detection('fixture-community-repo.html')} owner="octo" repo="community" />, container));
    expect(container.querySelector('[data-readme-truncated]')).toBeNull();
  });

  it('صفحة لا تُقرأ: بيان عدم الفحص بلا جزم', async () => {
    const unreadable = detectArabicReadme({ entries: [], treeFound: false, links: [], readmeFound: false, truncation: null }, { owner: 'o', repo: 'r', base: 'https://github.com/o/r' });
    await act(async () => render(<ReadmeBanner detection={unreadable} owner="o" repo="r" />, container));
    expect($('[data-readme-state="unreadable"]').textContent).toContain('لم يُفحص شيء');
    for (const pattern of ASSERTIVE_ABSENCE) expect(container.textContent, String(pattern)).not.toMatch(pattern);
  });
});

describe('زر فحص docs/: لا طلب إلا بنقر وبعد الصلاحية', () => {
  it('عرض الشريط وحده لا يطلب صلاحية ولا يرسل شيئًا', async () => {
    const access = fakeAccess(() => ({ body: [] }));
    await act(async () => render(<ReadmeBanner detection={detection('fixture-community-repo.html')} owner="octo" repo="community" access={access} />, container));
    await act(async () => void (await flush(30)));
    expect(access.request).not.toHaveBeenCalled();
    expect(access.requests).toEqual([]);
    expect(access.calls).toEqual([]);
  });

  it('النقر: طلب الصلاحية أولًا ثم قراءة docs/، ويُعثر على README عربي في docs', async () => {
    const access = fakeAccess((path) => (path === `${BASE}docs` ? { body: listing(['README.md', 'file'], ['README.ar.md', 'file'], ['guide.md', 'file']) } : { status: 500 }));
    await act(async () => render(<DocsScanControl owner="octo" repo="community" access={access} />, container));
    await click($('[data-action="scan-docs"]'));
    expect(access.calls).toEqual(['request', 'fetch']);
    expect(access.requests.map((r) => r.path)).toEqual([`${BASE}docs`]);
    expect($('[data-scan-state="found"]').textContent).toContain('README.ar.md');
    expect($<HTMLAnchorElement>('[data-readme-match="README.ar.md"]').getAttribute('href')).toBe('https://github.com/octo/community/blob/main/docs/README.ar.md');
  });

  it('مجلد لغة ar داخل docs: يُفتح بطلب ثانٍ ويُعثر على README فيه', async () => {
    const access = fakeAccess((path) =>
      path === `${BASE}docs`
        ? { body: listing(['ar', 'dir'], ['en', 'dir']) }
        : path === `${BASE}docs/ar`
          ? { body: [{ name: 'README.md', path: 'docs/ar/README.md', type: 'file', html_url: 'https://github.com/octo/community/blob/main/docs/ar/README.md' }] }
          : { status: 500 },
    );
    const result = await scanDocsFolder(access, 'octo', 'community');
    expect(result).toMatchObject({ state: 'found', requests: 2 });
    expect(access.requests.map((r) => r.path)).toEqual([`${BASE}docs`, `${BASE}docs/ar`]);
  });

  it('قراءة docs/ كاملة بلا ملف عربي: لا جزم بغياب التوثيق العربي', async () => {
    const access = fakeAccess(() => ({ body: listing(['index.md', 'file'], ['api', 'dir']) }));
    await act(async () => render(<DocsScanControl owner="octo" repo="community" access={access} />, container));
    await click($('[data-action="scan-docs"]'));
    const text = $('[data-scan-state="none-in-docs"]').textContent ?? '';
    expect(text).toContain('لا يعني');
    for (const pattern of ASSERTIVE_ABSENCE) expect(text, String(pattern)).not.toMatch(pattern);
  });

  it('رفض الصلاحية: لا طلب شبكة، ويُعلن أن الفحص لم يكتمل', async () => {
    const access = fakeAccess(() => ({ body: [] }), { granted: false });
    await act(async () => render(<DocsScanControl owner="octo" repo="community" access={access} />, container));
    await click($('[data-action="scan-docs"]'));
    expect(access.calls).toEqual(['request']);
    expect(access.requests).toEqual([]);
    expect($('[data-scan-state="incomplete"]').textContent).toContain('لم يكتمل');
    for (const pattern of ASSERTIVE_ABSENCE) expect(container.textContent, String(pattern)).not.toMatch(pattern);
  });

  it('سياق بلا واجهة صلاحيات (سكربت المحتوى): لا طلب، والفحص لم يكتمل مع إرشاد', async () => {
    await act(async () => render(<DocsScanControl owner="octo" repo="community" access={UNAVAILABLE_ACCESS} />, container));
    expect(container.textContent).toContain('لوحة مِجهَر الجانبية');
    await click($('[data-action="scan-docs"]'));
    expect($('[data-scan-state="incomplete"]').textContent).toContain('لم يكتمل');
  });

  it('بلوغ حد الطلبات (403 وx-ratelimit-remaining: 0): لم يكتمل', async () => {
    const access = fakeAccess(() => ({ status: 403, headers: { 'x-ratelimit-remaining': '0' } }));
    await act(async () => render(<DocsScanControl owner="octo" repo="community" access={access} />, container));
    await click($('[data-action="scan-docs"]'));
    expect($('[data-scan-state="incomplete"]').textContent).toMatch(/حد الطلبات.*لم يكتمل/);
  });

  it.each([
    ['404', () => ({ status: 404 }), /404/],
    ['429', () => ({ status: 429 }), /حد الطلبات/],
    ['500', () => ({ status: 500 }), /بخطأ/],
    ['فشل الشبكة', () => new Error('offline'), /الاتصال/],
    ['ردّ غير مصفوفة (docs ملف)', () => ({ body: { name: 'docs', type: 'file' } }), /غير متوقعة/],
  ] as Array<[string, Responder, RegExp]>)('%s: لم يكتمل ولا جزم', async (_name, responder, message) => {
    const access = fakeAccess(responder);
    const result = await scanDocsFolder(access, 'octo', 'community');
    expect(result.state).toBe('incomplete');
    expect('message' in result ? result.message : '').toMatch(message);
    expect('message' in result ? result.message : '').toContain('لم يكتمل');
    for (const pattern of ASSERTIVE_ABSENCE) expect('message' in result ? result.message : '', String(pattern)).not.toMatch(pattern);
  });

  it('حد الطلبات الثلاثة: مجلدات لغة أكثر مما يتسع له الحد تعلن عدم الاكتمال', async () => {
    const access = fakeAccess((path) => (path === `${BASE}docs` ? { body: listing(['ar', 'dir'], ['ara', 'dir'], ['arabic', 'dir']) } : { body: [] }));
    const result = await scanDocsFolder(access, 'octo', 'community');
    expect(result).toMatchObject({ state: 'incomplete', requests: MAX_SCAN_REQUESTS });
    expect(access.requests).toHaveLength(MAX_SCAN_REQUESTS);
  });

  it('تدقيق الشبكة: كل ما يصدر GET إلى contents/docs في المستودع الحالي لا غير', async () => {
    const access = fakeAccess((path) => (path === `${BASE}docs` ? { body: listing(['ar', 'dir']) } : { body: [] }));
    await scanDocsFolder(access, 'octo', 'community');
    for (const { path, init } of access.requests) {
      expect(path).toMatch(/^\/repos\/octo\/community\/contents\/docs(\/ar)?$/);
      expect(init?.method ?? 'GET').toBe('GET');
      expect(init?.body).toBeUndefined();
    }
  });
});

describe('البوابة الفعلية githubApiAccess', () => {
  it('بلا منح الصلاحية لا يصدر طلب fetch أصلًا (PermissionNotGrantedError)', async () => {
    const permissions = fakePermissions();
    const fetchImpl = vi.fn(async (_url: string) => new Response('[]'));
    const access = githubApiAccess({ runtime: {} as never, permissions }, fetchImpl as never);
    const result = await scanDocsFolder(
      { ...access, request: async () => true },
      'octo',
      'community',
    );
    expect(result).toMatchObject({ state: 'incomplete', reason: 'permission' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('بعد المنح: طلب إلى api.github.com وحده', async () => {
    const permissions = fakePermissions();
    const fetchImpl = vi.fn(async (_url: string) => new Response(JSON.stringify([{ name: 'README.ar.md', path: 'docs/README.ar.md', type: 'file' }]), { status: 200 }));
    const access = githubApiAccess({ runtime: {} as never, permissions }, fetchImpl as never);
    const result = await scanDocsFolder(access, 'octo', 'community');
    expect(permissions.request).toHaveBeenCalledTimes(1);
    expect(result.state).toBe('found');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://api.github.com/repos/octo/community/contents/docs');
  });

  it('بلا واجهة صلاحيات: وصول غير متاح لا يحمل أي fetch', () => {
    expect(githubApiAccess(null).available).toBe(false);
    expect(githubApiAccess({ runtime: {} as never }).available).toBe(false);
  });
});

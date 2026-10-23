// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/community"}
// TEST-COMM-02 (e2e على fixture-community-repo.html): المعالج يفرض فحص التكرار ثم سياسة المساهمة قبل المسودة؛ رابط البحث (مفتوح ومغلق،
// مشكلات وطلبات دمج) باستعلامه الكامل ظاهرًا وقابلًا للتعديل ولا يُفتح تلقائيًا؛ والسياسة تُقرأ بنقر وحده؛ والمسودة تُعاين وتُنسخ يدويًا؛
// ولا نشر ولا فتح بلاغ ولا طلب إلى api.github.com.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchText } from '../../../../src/modules/h/first-contribution/sources';
import { README_WIZARD_VIEWS, createWizardView } from '../../../../src/modules/h/readme-wizard';
import { documentPageSource } from '../../../../src/shared/page';
import { PANEL_VIEWS } from '../../../../src/sidepanel/views';
import { memorySettings } from '../../../core/ui-host/helpers';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');
const read = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

let container: HTMLElement;
const fetchText = vi.fn<FetchText>(async (url) => (url.endsWith('/CONTRIBUTING.md') ? { ok: true, text: read('fixture-contributing.md') } : url.endsWith('/README.md') ? { ok: true, text: read('fixture-readme.md') } : { ok: false, reason: 'not-found', status: 404 }));
const fetchSpy = vi.fn(async () => new Response(''));
const openSpy = vi.fn();
const writeText = vi.fn(async () => undefined);
const blockNavigation = (event: Event) => {
  if ((event.target as Element | null)?.closest?.('a')) event.preventDefault();
};

beforeEach(async () => {
  const parsed = new DOMParser().parseFromString(read('fixture-community-repo.html'), 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
  window.history.replaceState({}, '', 'https://github.com/octo/community');
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
  fetchText.mockClear();
  fetchSpy.mockClear();
  openSpy.mockClear();
  writeText.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal('open', openSpy);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  // نقر رابط في jsdom ينفّذ التنقل؛ يُمنع للروابط وحدها (منعه على مربع اختيار يلغي اختياره) بعد أن يصل النقر إلى معالج المكوّن.
  document.addEventListener('click', blockNavigation);
  const settings = (await memorySettings()).settings;
  const View = createWizardView({ source: () => documentPageSource(document), fetchText });
  await act(async () => {
    render(<View settings={settings} surface="native" />, container);
    await new Promise((r) => setTimeout(r, 30));
  });
  await settle();
});
afterEach(() => {
  render(null, container);
  container.remove();
  document.removeEventListener('click', blockNavigation);
  vi.unstubAllGlobals();
});

const settle = async () => {
  for (let i = 0; i < 3; i += 1) await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
};
const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const el = container.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 5));
  });
  await settle();
};
const type = async (el: HTMLTextAreaElement | HTMLInputElement, value: string) => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const step = (n: number): HTMLElement => $(`[data-step="${n}"]`);

describe('ترتيب الخطوات (AC-H2)', () => {
  it('الخطوتان الثانية والثالثة مقفلتان حتى يُفتح البحث ويُجاب عنه، ولا طلب قبل أي نقر', () => {
    expect($('[data-view="readme-wizard"]').getAttribute('data-repo')).toBe('octo/community');
    expect(step(2).hasAttribute('data-locked')).toBe(true);
    expect(step(3).hasAttribute('data-locked')).toBe(true);
    expect(container.querySelector('[data-action="read-policy"]')).toBeNull();
    expect(container.querySelector('#mj-wz-body')).toBeNull();
    expect($<HTMLInputElement>('[data-answer="none"]').disabled).toBe(true);
    expect(fetchText).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('الاستعلام الكامل ظاهر وقابل للتعديل، ورابطه مرمَّز ومفحوص، ولا يُفتح إلا بالنقر', async () => {
    const query = $<HTMLTextAreaElement>('#mj-wz-query');
    expect(query.value).toBe('repo:octo/community (is:issue OR is:pr) readme (arabic OR عربي OR العربية OR translation)');
    const link = $<HTMLAnchorElement>('[data-action="open-duplicate-search"]');
    const url = new URL(link.getAttribute('href') as string);
    expect(url.searchParams.get('q')).toBe(query.value);
    expect(url.searchParams.get('type')).toBe('issues');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(container.querySelectorAll('#mj-wz-issues li')).toHaveLength(0);

    await type(query, 'repo:octo/community is:issue is:pr readme');
    expect($('[data-code="kinds-without-or"]')).toBeTruthy();
    expect($('[data-action="open-duplicate-search"]').hasAttribute('href')).toBe(false);
    await type($<HTMLTextAreaElement>('#mj-wz-query'), 'repo:octo/community (is:issue OR is:pr) readme ترجمة');
    expect(new URL($('[data-action="open-duplicate-search"]').getAttribute('href') as string).searchParams.get('q')).toBe('repo:octo/community (is:issue OR is:pr) readme ترجمة');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('«وجدت طلبًا مماثلًا» يوقف المعالج ويوجّه إلى النقاش القائم', async () => {
    await click($('[data-action="open-duplicate-search"]'));
    await click($('[data-answer="found"]'));
    expect($('[data-duplicate-found]')).toBeTruthy();
    expect(step(2).hasAttribute('data-locked')).toBe(true);
  });

  it('المسار كله: فتح البحث ثم الإجابة، ثم قراءة السياسة بنقر ومراجعتها، ثم مسودة تُعاين وتُنسخ يدويًا', async () => {
    await click($('[data-action="open-duplicate-search"]'));
    await click($('[data-answer="none"]'));
    expect(step(1).hasAttribute('data-done')).toBe(true);
    expect(step(2).hasAttribute('data-locked')).toBe(false);
    expect(step(3).hasAttribute('data-locked')).toBe(true);
    expect(fetchText).not.toHaveBeenCalled();

    await click($('[data-action="read-policy"]'));
    expect(fetchText.mock.calls.map(([u]) => u)).toEqual(['https://github.com/octo/community/raw/HEAD/CONTRIBUTING.md', 'https://github.com/octo/community/raw/HEAD/README.md']);
    expect($('[data-external-systems]').getAttribute('data-external-systems')).toBe('Crowdin');
    expect($('[data-issue-first]')).toBeTruthy();
    expect(step(3).hasAttribute('data-locked')).toBe(true);

    await click($('[data-action="policy-reviewed"]'));
    expect(step(3).hasAttribute('data-locked')).toBe(false);
    const body = $<HTMLTextAreaElement>('#mj-wz-body');
    expect($<HTMLInputElement>('#mj-wz-title').value).toBe('Would you welcome an Arabic translation of the README?');
    expect(body.value).toContain('https://github.com/search?q=repo%3Aocto%2Fcommunity');
    expect(body.value).toContain('through Crowdin');
    expect($('[data-draft-preview="body"]').textContent).toBe(body.value);

    await type(body, `${body.value}\n\nشكرًا`);
    expect($('[data-draft-preview="body"]').textContent).toContain('شكرًا');
    await click($('[data-action="copy-body"]'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('شكرًا'));
    expect($('[data-copied]').getAttribute('data-copied')).toBe('body');

    await click($('[data-language="ar"]'));
    expect($<HTMLInputElement>('#mj-wz-title').value).toBe('هل ترحبون بترجمة README إلى العربية؟');
    expect($<HTMLAnchorElement>('[data-action="open-new-issue"]').getAttribute('href')).toBe('https://github.com/octo/community/issues/new');

    // لا نشر ولا فتح تلقائي ولا API: كل الطلبات قراءتا السياسة بنقر، ولا fetch آخر.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('تعديل الاستعلام بعد الإجابة يعيد قفل ما بعده', async () => {
    await click($('[data-action="open-duplicate-search"]'));
    await click($('[data-answer="none"]'));
    await click($('[data-action="read-policy"]'));
    await click($('[data-action="policy-reviewed"]'));
    expect(step(3).hasAttribute('data-locked')).toBe(false);
    await type($<HTMLTextAreaElement>('#mj-wz-query'), 'repo:octo/community (is:issue OR is:pr) readme arabic');
    expect(step(2).hasAttribute('data-locked')).toBe(true);
    expect(step(3).hasAttribute('data-locked')).toBe(true);
    expect($<HTMLInputElement>('[data-answer="none"]').checked).toBe(false);
  });

  it('النسخ حين يتعذّر: يُحدَّد النص ليُنسخ يدويًا', async () => {
    writeText.mockRejectedValueOnce(new Error('denied'));
    await click($('[data-action="open-duplicate-search"]'));
    await click($('[data-answer="none"]'));
    await click($('[data-action="read-policy"]'));
    await click($('[data-action="policy-reviewed"]'));
    await click($('[data-action="copy-body"]'));
    expect($('[data-copied]').getAttribute('data-copied')).toBe('failed');
  });
});

describe('التسجيل', () => {
  it('في تبويب المجتمع للوحة الأصلية وحدها، وفي الدرج رسالة بديلة', () => {
    expect(PANEL_VIEWS).toEqual(expect.arrayContaining([...README_WIZARD_VIEWS]));
    expect(README_WIZARD_VIEWS.map((v) => [v.id, v.tab, v.surfaces])).toEqual([
      ['h-readme-wizard', 'community', ['native']],
      ['h-readme-wizard-drawer', 'community', ['drawer']],
    ]);
  });
});

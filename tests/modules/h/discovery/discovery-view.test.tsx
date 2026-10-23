// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// TEST-COMM-04 (AC-H4) على الواجهة: الاستعلام كاملًا قابلًا للتعديل قبل الفتح، وصحة الصياغة، ولا فتح بحث دون فعل المستخدم،
// وفصل «محتوى عربي» عن بحث الموقع المعلن وتنبيهاته (AC-H6).
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECLARED_NOTICE, LOCATION_SEARCH_NOTICE, PLACES, createDiscoveryView, validateQuery } from '../../../../src/modules/h/discovery';
import { flush } from '../helpers';

let container: HTMLElement;
const fetchSpy = vi.spyOn(globalThis, 'fetch');
const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
beforeEach(() => {
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
  fetchSpy.mockClear();
  openSpy.mockClear();
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const $ = <E extends Element = HTMLElement>(selector: string, root: ParentNode = container): E => {
  const el = root.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};
const type = async (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string, event = 'input') => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event(event, { bubbles: true }));
    await flush(2);
  });
};
const tick = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush(2);
  });
};
const NOW = new Date('2026-10-23T10:00:00Z');
const mount = async () => {
  const View = createDiscoveryView({ now: () => NOW });
  await act(async () => render(<View settings={null as never} surface="native" />, container));
};
const hrefQuery = (a: Element): string => new URL(a.getAttribute('href') ?? '').searchParams.get('q') ?? '';

describe('مشاريع المحتوى العربي', () => {
  it('الاستعلام الافتراضي ظاهر كاملًا، ورابط الفتح يحمله، ولا يُفتح شيء ولا تُرسل شبكة', async () => {
    await mount();
    const editor = $('[data-query-editor="mj-disc-projects-query"]');
    expect(($('textarea', editor) as HTMLTextAreaElement).value).toBe('topic:arabic OR topic:rtl OR topic:arabic-nlp OR topic:arabic-fonts');
    const link = $('a[data-action="open-search"]', editor);
    expect(hrefQuery(link)).toBe('topic:arabic OR topic:rtl OR topic:arabic-nlp OR topic:arabic-fonts');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(openSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('خيارات اللغة والنجوم والنشاط تُعيد توليد الاستعلام بأقواس صحيحة', async () => {
    await mount();
    await type($('#mj-disc-language') as HTMLInputElement, 'python');
    await type($('#mj-disc-stars') as HTMLInputElement, '20');
    await type($('#mj-disc-active') as HTMLInputElement, '30');
    const query = ($('#mj-disc-projects-query') as HTMLTextAreaElement).value;
    expect(query).toBe('(topic:arabic OR topic:rtl OR topic:arabic-nlp OR topic:arabic-fonts) language:python stars:>=20 pushed:>=2026-09-23');
    expect(validateQuery(query, 'repositories').ok).toBe(true);
    await type($('#mj-disc-preset') as HTMLSelectElement, 'description', 'change');
    expect(($('#mj-disc-projects-query') as HTMLTextAreaElement).value).toBe('(العربية OR عربي OR arabic) in:description,readme language:python stars:>=20 pushed:>=2026-09-23');
  });

  it('تعديل المستخدم للنص يسري على الرابط، وخطأ الصياغة يعطّل الرابط ويظهر سببه', async () => {
    await mount();
    const area = $('#mj-disc-projects-query') as HTMLTextAreaElement;
    await type(area, 'topic:rtl language:"Jupyter Notebook"');
    expect(hrefQuery($('[data-query-editor="mj-disc-projects-query"] a[data-action="open-search"]'))).toBe('topic:rtl language:"Jupyter Notebook"');
    await type(area, 'topic:rtl OR (topic:arabic');
    const link = $('[data-query-editor="mj-disc-projects-query"] a[data-action="open-search"]');
    expect(link.hasAttribute('href')).toBe(false);
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect($('[data-code="unbalanced-parenthesis"]').textContent).toMatch(/أقواس/);
  });

  it('أكثر من خمسة معاملات يُمنع فتحه بسببه', async () => {
    await mount();
    await type($('#mj-disc-projects-query') as HTMLTextAreaElement, 'a OR b OR c OR d OR e OR f OR g');
    expect($('[data-code="too-many-operators"]')).not.toBeNull();
    expect($('[data-query-editor="mj-disc-projects-query"] a[data-action="open-search"]').hasAttribute('href')).toBe(false);
  });
});

describe('Trending', () => {
  it('الرابط الكامل قابل للتعديل ويتبع الخيارات', async () => {
    await mount();
    expect(($('#mj-trend-url') as HTMLInputElement).value).toBe('https://github.com/trending?since=weekly&spoken_language_code=ar');
    await type($('#mj-trend-language') as HTMLInputElement, 'Python');
    await type($('#mj-trend-since') as HTMLSelectElement, 'monthly', 'change');
    expect(($('#mj-trend-url') as HTMLInputElement).value).toBe('https://github.com/trending/python?since=monthly&spoken_language_code=ar');
    await tick($('input[type="checkbox"]', $('[data-section="trending"]')));
    expect(($('#mj-trend-url') as HTMLInputElement).value).toBe('https://github.com/trending/python?since=monthly');
    expect($('a[data-action="open-trending"]').getAttribute('href')).toBe('https://github.com/trending/python?since=monthly');
  });

  it('رابط ليس Trending في github.com يُمنع', async () => {
    await mount();
    await type($('#mj-trend-url') as HTMLInputElement, 'https://evil.example/trending');
    const link = $('a[data-action="open-trending"]');
    expect(link.hasAttribute('href')).toBe(false);
    expect($('[data-section="trending"] [role="alert"]').textContent).toMatch(/ليس صفحة Trending/);
    expect(openSpy).not.toHaveBeenCalled();
  });
});

describe('موسّع تهجئات location', () => {
  it('بلا اختيار لا استعلام', async () => {
    await mount();
    expect($('[data-empty="location"]')).not.toBeNull();
    expect(container.querySelector('[data-query-editor^="mj-loc-query"]')).toBeNull();
  });

  it('اختيار الرياض والسعودية يولّد استعلام الخطة بصيغه، ظاهرًا وقابلًا للتعديل', async () => {
    await mount();
    await tick($('input[data-place="sa"]'));
    await tick($('input[data-place="riyadh"]'));
    const area = $('#mj-loc-query-0') as HTMLTextAreaElement;
    expect(area.value).toBe('location:"Saudi Arabia" OR location:"Riyadh" OR location:"السعودية" OR location:"الرياض" OR location:"KSA" OR location:"المملكة العربية السعودية"');
    expect(validateQuery(area.value, 'users').ok).toBe(true);
    expect(hrefQuery($('[data-query-editor="mj-loc-query-0"] a[data-action="open-search"]'))).toBe(area.value);
    await type(area, 'location:"Riyadh"');
    expect(hrefQuery($('[data-query-editor="mj-loc-query-0"] a[data-action="open-search"]'))).toBe('location:"Riyadh"');
    expect(new URL($('[data-query-editor="mj-loc-query-0"] a[data-action="open-search"]').getAttribute('href') ?? '').searchParams.get('type')).toBe('users');
  });

  it('اختيارات كثيرة تُقسَّم إلى استعلامات كل منها ضمن حد المعاملات دون فقد صيغة', async () => {
    await mount();
    for (const place of PLACES.slice(0, 8)) await tick($(`input[data-place="${place.id}"]`));
    const editors = [...container.querySelectorAll<HTMLTextAreaElement>('textarea[id^="mj-loc-query-"]')];
    expect(editors.length).toBeGreaterThan(1);
    for (const editor of editors) expect(validateQuery(editor.value, 'users')).toMatchObject({ ok: true });
    expect($('[data-variant-count]').textContent).toContain(`في ${editors.length} استعلام`);
  });

  it('صيغ المستخدم الخاصة واللغة تدخل، وكل صيغة لها رابط مستقل احتياطًا', async () => {
    await mount();
    await type($('#mj-loc-custom') as HTMLTextAreaElement, 'Qatif\nالقطيف');
    await type($('#mj-loc-language') as HTMLInputElement, 'go');
    expect(($('#mj-loc-query-0') as HTMLTextAreaElement).value).toBe('(location:"Qatif" OR location:"القطيف") language:go');
    const links = [...container.querySelectorAll<HTMLAnchorElement>('[data-variant-link]')];
    expect(links.map((a) => hrefQuery(a))).toEqual(['location:"Qatif" language:go', 'location:"القطيف" language:go']);
  });

  it('تنبيه حقل الموقع ظاهر أمام الأداة ولا نسبة لشخص', async () => {
    await mount();
    expect($('[data-notice="location"]').textContent).toBe(LOCATION_SEARCH_NOTICE);
    expect(LOCATION_SEARCH_NOTICE).toMatch(/لا يدل على جنسية أحد ولا هويته/);
  });
});

describe('فصل المحتوى العربي عن البيانات المعلنة', () => {
  it('قسمان منفصلان بعنوانين وتنبيهين', async () => {
    await mount();
    expect($('[data-section="projects"] h3').textContent).toContain('محتوى عربي');
    expect($('[data-section="declared"] h3').textContent).toBe('بيانات يعلنها صاحب الحساب');
    expect($('[data-section="declared"]').textContent).toContain(DECLARED_NOTICE);
    expect($('[data-section="projects"]').textContent).not.toContain('بيانات يعلنها صاحب الحساب');
    expect($('[data-section="location"]').textContent).not.toContain(DECLARED_NOTICE);
  });

  it('لا يُفتح بحث ولا تُرسل شبكة من أي تفاعل مع الواجهة', async () => {
    await mount();
    await tick($('input[data-place="eg"]'));
    await type($('#mj-disc-language') as HTMLInputElement, 'rust');
    await type($('#mj-trend-language') as HTMLInputElement, 'go');
    expect(openSpy).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

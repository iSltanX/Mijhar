// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// TEST-COMM-05 (AC-H5) e2e دون اتصال على fixture-resources-set.json: عرض وبحث وتصفية وإضافة وتعديل وحذف وتصدير واستيراد، وفحص
// بنقر صريح لروابط github.com وحدها، وبلا أي طلب شبكة خارجه.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourcesView, parseResourceFile } from '../../../../src/modules/h/resources';
import { fakeAccess, flush } from '../helpers';
import { BUILTIN, NOW, TEST_SET, memoryResources } from './helpers';
import type { MemoryResources } from './helpers';

const fetchSpy = vi.spyOn(globalThis, 'fetch');
let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
  fetchSpy.mockClear();
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
const settle = async (ms = 8) => {
  for (let i = 0; i < 3; i += 1) await act(async () => void (await flush(ms)));
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush(6);
  });
  await settle();
};
const set = async (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string, event = 'input') => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event(event, { bubbles: true }));
  });
};
const githubish = (url: string): boolean => url.startsWith('https://github.com/');
const titles = (): string[] => [...container.querySelectorAll('[data-resource-id] .item-head strong')].map((n) => n.textContent ?? '');

async function mount(options: { access?: ReturnType<typeof fakeAccess>; readFile?: (f: File) => Promise<string>; ctx?: MemoryResources } = {}) {
  const ctx = options.ctx ?? (await memoryResources());
  await act(async () => void (await ctx.repository.applyImport(parseOk(), 'replace')));
  const access = options.access ?? fakeAccess((p) => ({ body: { full_name: p.replace('/repos/', ''), html_url: `https://github.com${p.replace('/repos', '')}`, archived: false, pushed_at: '2026-10-20T00:00:00Z', license: { spdx_id: 'MIT' } } }));
  const View = createResourcesView({ repository: async () => ctx.repository, access: () => access, now: () => NOW, ...(options.readFile ? { readFile: options.readFile } : {}) });
  await act(async () => render(<View settings={null as never} surface="native" />, container));
  await settle();
  return { ctx, access };
}

const parseOk = () => {
  const parsed = parseResourceFile(TEST_SET);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed;
};

describe('العرض دون اتصال', () => {
  it('كل موارد العينة بتاريخ آخر تحقق وحالة لكل منها، ولا طلب شبكة', async () => {
    await mount();
    expect(container.querySelectorAll('[data-resource-id]')).toHaveLength(40);
    expect($('[data-count]').textContent).toContain('40 من 40');
    for (const item of container.querySelectorAll('[data-resource-id]')) {
      expect(item.querySelector('[data-status-label]')?.textContent).toMatch(/نشط|مؤرشف|لم يُتحقق منه|تعذّر التحقق/);
      expect(item.querySelector('[data-verified]')?.textContent).toMatch(/آخر تحقق: \d{4}-\d{2}-\d{2}|لم يُتحقق منه بعد/);
    }
    expect($('[data-offline]').textContent).toMatch(/دون إنترنت/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('البحث الفوري والتصفية بالتصنيف', async () => {
    await mount();
    await set($('#mj-res-search') as HTMLInputElement, 'رقم 17');
    expect(titles()).toEqual(['مورد تجريبي 17']);
    await set($('#mj-res-search') as HTMLInputElement, '');
    await set($('#mj-res-filter') as HTMLSelectElement, 'fonts', 'change');
    const shown = container.querySelectorAll('[data-resource-id]');
    expect(shown.length).toBe(10);
    for (const item of shown) expect(item.getAttribute('data-category')).toBe('fonts');
    await set($('#mj-res-search') as HTMLInputElement, 'لا يوجد شيء بهذا الاسم');
    expect(container.querySelector('[data-empty]')).not.toBeNull();
  });

  it('عدم سحب قوائم خارجية تلقائيًا: لا fetch عند الفتح ولا عند التصفح', async () => {
    await mount();
    await set($('#mj-res-search') as HTMLInputElement, 'x');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('الإضافة والتعديل والحذف', () => {
  it('إضافة مورد ثم تعديله ثم حذفه', async () => {
    const { ctx } = await mount();
    await click($('details > summary:not([data-x])', $('[data-form="add-resource"]').parentElement as HTMLElement));
    await set($('#mj-add-title') as HTMLInputElement, 'دليل جديد');
    await set($('#mj-add-url') as HTMLInputElement, 'https://example.com/new');
    await set($('#mj-add-category') as HTMLSelectElement, 'lists', 'change');
    await click($('[data-action="add-resource"]'));
    const added = ctx.repository.list().find((r) => r.title === 'دليل جديد')!;
    expect(added).toMatchObject({ url: 'https://example.com/new', category: 'lists', status: 'unverified', origin: 'user' });
    expect(titles()).toContain('دليل جديد');

    const item = () => $(`[data-resource-id="${added.id}"]`);
    await click($('[data-action="edit-resource"]', item()));
    await set($(`#mj-res-title-${added.id}`) as HTMLInputElement, 'دليل معدّل');
    await click($('[data-action="save-resource"]', item()));
    expect(ctx.repository.get(added.id)?.title).toBe('دليل معدّل');

    await click($('[data-action="remove-resource"]', item()));
    await click($('[data-action="confirm-remove"]', item()));
    expect(ctx.repository.get(added.id)).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('تغيير الرابط يُسقط التحقق السابق (لم يعد ينطبق)', async () => {
    const { ctx } = await mount();
    const target = ctx.repository.list().find((r) => r.status === 'active' && r.lastVerified)!;
    await click($('[data-action="edit-resource"]', $(`[data-resource-id="${target.id}"]`)));
    await set($(`#mj-res-url-${target.id}`) as HTMLInputElement, 'https://example.com/changed');
    await click($('[data-action="save-resource"]', $(`[data-resource-id="${target.id}"]`)));
    expect(ctx.repository.get(target.id)).toMatchObject({ url: 'https://example.com/changed', status: 'unverified', lastVerified: null, source: 'عدّله المستخدم' });
  });

  // GEMINI-014 (تدقيق 2026-10-27): نموذج التعديل كان يُهيَّأ مرة عند التركيب، فيعيد الحفظ بعد «اعتمد العنوان الجديد» الرابطَ القديم.
  it('«اعتمد العنوان الجديد» ثم تعديل الوصف وحفظه: يبقى الرابط الجديد ولا يُسقط تحققه', async () => {
    const { ctx } = await mount();
    const target = ctx.repository.list().find((r) => githubish(r.url))!;
    const moved = 'https://github.com/new-owner/new-repo';
    await act(async () => void (await ctx.repository.update(target.id, { movedTo: moved })));
    await settle();
    const item = () => $(`[data-resource-id="${target.id}"]`);
    // يُفتح نموذج التعديل مرة قبل الاعتماد (فتُهيَّأ حالته المحلية بالرابط القديم) ثم يُلغى.
    await click($('[data-action="edit-resource"]', item()));
    await click($('[data-action="cancel-edit"]', item()));
    await click($('[data-action="apply-moved"]', item()));
    expect(ctx.repository.get(target.id)?.url).toBe(moved);
    await click($('[data-action="edit-resource"]', item()));
    expect(($(`#mj-res-url-${target.id}`) as HTMLInputElement).value).toBe(moved);
    await set($(`#mj-res-desc-${target.id}`) as HTMLTextAreaElement, 'وصف معدّل');
    await click($('[data-action="save-resource"]', item()));
    expect(ctx.repository.get(target.id)).toMatchObject({ url: moved, description: 'وصف معدّل' });
    expect(ctx.repository.get(target.id)?.source).not.toBe('عدّله المستخدم');
  });

  it('إضافة غير صالحة تظهر تنبيهًا ولا تُحفظ', async () => {
    const { ctx } = await mount();
    const before = ctx.repository.list().length;
    await set($('#mj-add-url') as HTMLInputElement, 'http://insecure.example');
    await click($('[data-action="add-resource"]'));
    expect($('[role="alert"]').textContent).toMatch(/عنوانًا|https/);
    expect(ctx.repository.list()).toHaveLength(before);
  });

  it('مراجعة يدوية لرابط خارجي تسجّل تاريخ اليوم', async () => {
    const { ctx } = await mount();
    const target = ctx.repository.list().find((r) => r.url.includes('example.org'))!;
    const item = () => $(`[data-resource-id="${target.id}"]`);
    expect(item().querySelector('[data-action="check-one"]')).toBeNull();
    await set($(`#mj-res-review-${target.id}`) as HTMLSelectElement, 'archived', 'change');
    await click($('[data-action="mark-reviewed"]', item()));
    expect(ctx.repository.get(target.id)).toMatchObject({ status: 'archived', lastVerified: '2026-10-23', source: 'مراجعة بشرية محلية' });
  });
});

describe('التصدير والاستيراد', () => {
  it('التصدير يعرض JSON كاملًا يعيد كل عناصر العينة ويحفظه ملفًا باسم مؤرَّخ', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mijhar-test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const downloads: string[] = [];
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(`${this.download}|${this.href}`);
    });
    await mount();
    await click($('[data-action="export"]'));
    const text = ($('#mj-res-export') as HTMLTextAreaElement).value;
    const parsed = parseResourceFile(text);
    expect(parsed.ok && parsed.invalid.length === 0 && parsed.file.resources.length === 40).toBe(true);
    expect(downloads).toEqual(['mijhar-resources-2026-10-23.json|blob:mijhar-test']);
    create.mockRestore();
    revoke.mockRestore();
    anchorClick.mockRestore();
  });

  const choose = async (content: string, name = 'in.json') => {
    const input = $('#mj-res-import') as HTMLInputElement;
    const file = new File([content], name, { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush(6);
    });
    await settle();
  };

  it('استيراد ملف سليم: معاينة بالأعداد ثم دمج', async () => {
    const extra = { ...TEST_SET.resources[0]!, id: 'imported-1', title: 'مستورد', origin: 'user' as const };
    const readFile = async () => JSON.stringify({ ...TEST_SET, resources: [extra, TEST_SET.resources[1]] });
    const { ctx } = await mount({ readFile });
    await choose('x');
    expect($('[data-import-preview]').textContent).toMatch(/1 جديدًا، 0 معدّلًا، 1 دون تغيير/);
    await click($('[data-action="apply-import"]'));
    expect(ctx.repository.get('imported-1')?.title).toBe('مستورد');
    expect(ctx.repository.list()).toHaveLength(41);
    expect(container.querySelector('[data-import-preview]')).toBeNull();
  });

  it('الاستبدال يعلن عدد المحذوف قبل التطبيق', async () => {
    const readFile = async () => JSON.stringify({ ...TEST_SET, resources: TEST_SET.resources.slice(0, 5) });
    const { ctx } = await mount({ readFile });
    await choose('x');
    await click(container.querySelectorAll('input[name="mj-res-mode"]')[1] as Element);
    expect($('[data-import-preview]').textContent).toContain('يُحذف 35 حاليًا');
    await click($('[data-action="apply-import"]'));
    expect(ctx.repository.list()).toHaveLength(5);
  });

  it('ملف تالف يُرفض بسبب مقروء دون المساس بالبيانات', async () => {
    const { ctx } = await mount({ readFile: async () => '{ليس json' });
    const before = ctx.repository.list().length;
    await choose('x');
    expect($('[data-import-error]').textContent).toMatch(/رُفض الملف ولم يتغير شيء/);
    expect(container.querySelector('[data-import-preview]')).toBeNull();
    expect(ctx.repository.list()).toHaveLength(before);
  });

  it('ملف بعناصر تالفة: تُعزل وتُعدّ ولا تدخل', async () => {
    const readFile = async () => JSON.stringify({ ...TEST_SET, resources: [{ ...TEST_SET.resources[0]!, id: 'ok-1', title: 'سليم' }, { ...TEST_SET.resources[1]!, id: 'bad-1', url: 'ftp://x' }] });
    const { ctx } = await mount({ readFile });
    await choose('x');
    expect($('[data-import-preview]').textContent).toMatch(/1 غير صالح/);
    await click($('[data-action="apply-import"]'));
    expect(ctx.repository.get('ok-1')).toBeDefined();
    expect(ctx.repository.get('bad-1')).toBeUndefined();
  });
});

describe('فحص الروابط بنقر صريح', () => {
  it('لا طلب قبل النقر؛ والنقر على «تحقق الآن» لمورد GitHub: الصلاحية ثم GET واحد، ويُحدَّث التاريخ والحالة', async () => {
    const { ctx, access } = await mount();
    expect(access.calls).toEqual([]);
    const target = ctx.repository.list().find((r) => r.url.startsWith('https://github.com/') && r.status === 'unverified')!;
    await click($('[data-action="check-one"]', $(`[data-resource-id="${target.id}"]`)));
    expect(access.calls).toEqual(['request', 'fetch']);
    expect(access.requests.map((r) => r.path)).toEqual([`/repos/${new URL(target.url).pathname.slice(1)}`]);
    expect(ctx.repository.get(target.id)).toMatchObject({ status: 'active', lastVerified: '2026-10-23', license: 'MIT', lastPush: '2026-10-20' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('فحص الكل: روابط GitHub وحدها بسقف عشرين، ولا طلب للخارجية، ويُعلن ما بقي', async () => {
    const { access } = await mount();
    await click($('[data-action="check-all"]'));
    expect(access.requests).toHaveLength(20);
    for (const { path } of access.requests) expect(path).toMatch(/^\/repos\/test-org\/repo-\d{3}$/);
    const summary = $('[data-check-summary]').textContent ?? '';
    expect(summary).toMatch(/بلغ الفحص حد 20 طلبًا/);
    expect(summary).toContain('الفحص لم يكتمل');
    expect(summary).toMatch(/رابطًا خارجيًا يُراجع يدويًا ولم يصدر له طلب/);
  });

  it('رفض الصلاحية: لا طلب والفحص لم يكتمل', async () => {
    const access = fakeAccess(() => ({ body: {} }), { granted: false });
    await mount({ access });
    await click($('[data-action="check-all"]'));
    expect(access.requests).toEqual([]);
    expect($('[data-check-summary]').textContent).toMatch(/رفضتَ الصلاحية.*لم يكتمل/);
  });

  it('سياق بلا واجهة الصلاحيات: تنبيه إرشادي ولا طلب', async () => {
    const access = fakeAccess(() => ({ body: {} }), { available: false });
    await mount({ access });
    expect(container.textContent).toMatch(/لوحة مِجهَر الجانبية/);
    await click($('[data-action="check-all"]'));
    expect(access.calls).toEqual([]);
    expect($('[data-check-summary]').textContent).toContain('لم يكتمل');
  });

  it('مستودع نُقل: يظهر الرابط المقترح ولا يتغير حتى يؤكد المستخدم', async () => {
    const access = fakeAccess(() => ({ body: { full_name: 'moved/elsewhere', html_url: 'https://github.com/moved/elsewhere', archived: false, pushed_at: '2026-10-01T00:00:00Z' } }));
    const { ctx } = await mount({ access });
    const target = ctx.repository.list().find((r) => r.url.startsWith('https://github.com/test-org'))!;
    await click($('[data-action="check-one"]', $(`[data-resource-id="${target.id}"]`)));
    expect(ctx.repository.get(target.id)?.url).toBe(target.url);
    expect($('[data-moved]', $(`[data-resource-id="${target.id}"]`)).textContent).toContain('moved/elsewhere');
    await click($('[data-action="apply-moved"]', $(`[data-resource-id="${target.id}"]`)));
    expect(ctx.repository.get(target.id)).toMatchObject({ url: 'https://github.com/moved/elsewhere', movedTo: null });
  });
});

describe('الموارد المضمّنة المحذوفة', () => {
  it('تُستعاد من قسم المحذوف', async () => {
    const { ctx } = await mount();
    const builtin = BUILTIN[0]!;
    await act(async () => void (await ctx.repository.remove(builtin.id)));
    await settle();
    await click($('[data-action="restore-builtin"]'));
    expect(ctx.repository.get(builtin.id)).toBeDefined();
  });
});

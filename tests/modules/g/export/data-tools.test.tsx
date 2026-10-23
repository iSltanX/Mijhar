// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// واجهة أدوات البيانات (T-8.4) على DOM: التصدير بملفين، والاستيراد (رفض الملف التالف دون مساس، ومعاينة العدد، ودمج أو استبدال بتأكيد، واستعادة
// النسخة الاحتياطية)، والحذف (مستودع/كلي بتأكيد صريح). وكل كتابة تمر بالخلفية (AD-25)؛ ولا طلب شبكي في أي منها.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTools, buildBundle, connectExport, parseBundle, serializeJson } from '../../../../src/modules/g/export';
import type { DataToolsDeps, SavedFile } from '../../../../src/modules/g/export';
import { readSnapshot, reposOf, sourceOf } from '../../../../src/modules/g/export/snapshot';
import type { World } from './helpers';
import { SALT, closeAll, dataOf, flush, notesSet, seed, world } from './helpers';

let container: HTMLElement;
let w: World;
let saved: SavedFile[];
const fetchSpy = vi.fn(async () => new Response(''));

beforeEach(async () => {
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
  vi.stubGlobal('fetch', fetchSpy);
  fetchSpy.mockClear();
  w = await world();
  saved = [];
});
afterEach(() => {
  render(null, container);
  container.remove();
  vi.unstubAllGlobals();
  connectExport(null);
  closeAll();
});

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const el = container.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};
const maybe = (selector: string): Element | null => container.querySelector(selector);
const settle = async (ms = 6) => {
  for (let i = 0; i < 4; i += 1) await act(async () => void (await flush(ms)));
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush(4);
  });
  await settle();
};
const choose = async (el: HTMLInputElement | HTMLSelectElement, value?: string) => {
  await act(async () => {
    if (el instanceof HTMLSelectElement && value !== undefined) el.value = value;
    else if (el instanceof HTMLInputElement) el.click();
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
};
const pickFile = async (text: string, name = 'backup.json') => {
  const input = $<HTMLInputElement>('[data-input="import-file"]');
  const file = new File([text], name, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush(6);
  });
  await settle();
};

async function mount(options: { populated?: boolean; set?: ReturnType<typeof notesSet> } = {}): Promise<DataToolsDeps> {
  if (options.populated !== false) await seed(w.background, options.set ?? notesSet());
  const ctx = await w.context();
  const deps: DataToolsDeps = {
    store: ctx.store,
    writer: w.writer,
    subscribe: (listener) => {
      const stops = [ctx.notes.subscribe(listener), ctx.bookmarks.subscribe(listener)];
      return () => stops.forEach((stop) => stop());
    },
    now: () => new Date('2026-10-24T09:00:00.000Z'),
    save: (file) => void saved.push(file),
  };
  await act(async () => {
    render(<DataTools deps={deps} />, container);
    await flush(6);
  });
  await settle();
  return deps;
}

const jsonOf = (file: SavedFile) => JSON.parse(file.text) as ReturnType<typeof buildBundle>;

describe('التصدير', () => {
  it('JSON كامل وMarkdown لكل المستودعات، والملح لا يدخل ما لم يُختر', async () => {
    await mount();
    expect(maybe('[data-export-count]')?.textContent).toContain('250 ملاحظة');
    await click($('[data-action="export-json"]'));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ type: 'application/json' });
    expect(saved[0]!.name).toMatch(/^mijhar-notes-all-2026-10-24\.json$/);
    const bundle = jsonOf(saved[0]!);
    expect(bundle.notes).toHaveLength(250);
    expect(bundle.bookmarks).toHaveLength(250);
    expect(saved[0]!.text).not.toContain(SALT);
    expect($('[data-result="export"]').textContent).toContain('250 ملاحظة');

    await click($('[data-action="export-md"]'));
    expect(saved[1]).toMatchObject({ type: 'text/markdown' });
    expect(saved[1]!.text).toMatch(/^# ملاحظات مِجهَر/);
    expect(saved[1]!.text).not.toContain(SALT);

    await choose($('[data-option="include-salt"]'));
    await click($('[data-action="export-json"]'));
    expect(jsonOf(saved[2]!).salt).toBeDefined();
  });

  it('مستودع محدد: يُصدَّر ما يخصه وحده', async () => {
    const deps = await mount();
    const repos = reposOf(await readSnapshot(deps.store));
    await choose(container.querySelectorAll<HTMLInputElement>('input[name="mj-export-scope"]')[1]!);
    await choose($<HTMLSelectElement>('select[aria-label="المستودع المراد تصديره"]'), repos[2]);
    await click($('[data-action="export-json"]'));
    const bundle = jsonOf(saved[0]!);
    const [owner, repo] = repos[2]!.split('/');
    expect(bundle.scope).toEqual({ kind: 'repo', owner, repo });
    expect(bundle.notes.length).toBeGreaterThan(0);
    expect(bundle.notes.every((n) => n.target.owner === owner && n.target.repo === repo)).toBe(true);
  });

  it('تخزين فارغ: أزرار التصدير والحذف معطّلة', async () => {
    await mount({ populated: false });
    expect($<HTMLButtonElement>('[data-action="export-json"]').disabled).toBe(true);
    expect($<HTMLButtonElement>('[data-action="delete"]').disabled).toBe(true);
  });
});

describe('الاستيراد', () => {
  it('ملف تالف يُرفض بأسبابه دون مساس بالبيانات ودون نسخة احتياطية', async () => {
    await mount();
    const before = await dataOf(w.area);
    const broken = JSON.parse(serializeJson(buildBundle(sourceOf(await readSnapshot(w.background)))));
    broken.notes[0].target = { level: 'bogus' };
    await pickFile(JSON.stringify(broken));
    expect($('[data-result="rejected"]').textContent).toContain('رُفض الملف ولم تُمس بياناتك الحالية');
    expect(maybe('[data-import-preview]')).toBeNull();
    expect(maybe('[data-action="import"]')).toBeNull();
    await pickFile('{ ليس json');
    expect($('[data-result="rejected"]').textContent).toContain('ليس JSON صالحًا');
    expect(await dataOf(w.area)).toEqual(before);
  });

  it('دمج: معاينة بالأعداد ثم استيراد بلا تأكيد إضافي، وتظهر النسخة الاحتياطية بعده', async () => {
    const set = notesSet();
    await mount({ set: { notes: set.notes.slice(0, 100), bookmarks: set.bookmarks.slice(0, 50) } });
    const full = serializeJson(buildBundle({ notes: set.notes, anchors: [], bookmarks: set.bookmarks, salt: null }));
    await pickFile(full, 'all.json');
    expect($('[data-import-preview]').textContent).toContain('all.json');
    expect($('[data-preview-lines]').textContent).toContain('أُضيف 150');
    expect($('[data-preview-lines]').textContent).toContain('لم يتغير 100');
    expect($<HTMLButtonElement>('[data-action="import"]').disabled).toBe(false);
    await click($('[data-action="import"]'));
    expect($('[data-result="import"]').textContent).toContain('اكتمل الدمج');
    expect(w.sent.some((m) => (m as { op?: string; mode?: string }).op === 'data-import' && (m as { mode: string }).mode === 'merge')).toBe(true);
    expect(Object.keys(await dataOf(w.area)).filter((k) => k.startsWith('notes.'))).toHaveLength(250);
    expect($('[data-backup-info]').textContent).toContain('100 ملاحظة');
  });

  it('استبدال يتطلب تأكيدًا صريحًا، ثم استعادة بتأكيد ترجع الحال كما كانت', async () => {
    const set = notesSet();
    await mount({ set: { notes: set.notes.slice(0, 40), bookmarks: set.bookmarks.slice(0, 20) } });
    const before = await dataOf(w.area);
    await pickFile(serializeJson(buildBundle({ notes: set.notes.slice(0, 10), anchors: [], bookmarks: [], salt: null })));
    await choose($('[data-mode="replace"]'));
    expect($('[data-preview-lines]').textContent).toContain('حُذف 30');
    const button = $<HTMLButtonElement>('[data-action="import"]');
    expect(button.disabled).toBe(true);
    await click(button);
    expect(maybe('[data-result="import"]')).toBeNull();
    await choose($('[data-option="confirm-replace"]'));
    expect($<HTMLButtonElement>('[data-action="import"]').disabled).toBe(false);
    await click($('[data-action="import"]'));
    expect($('[data-result="import"]').textContent).toContain('اكتمل الاستبدال');
    expect(Object.keys(await dataOf(w.area)).filter((k) => k.startsWith('notes.'))).toHaveLength(10);

    await click($('[data-action="restore"]'));
    expect(maybe('[data-confirm="restore"]')).not.toBeNull();
    await click($('[data-action="restore-confirm"]'));
    expect($('[data-result="import"]').textContent).toContain('أُعيدت');
    const { ['export-backup']: gone, ...after } = await dataOf(w.area);
    expect(gone).toBeUndefined();
    expect(after).toEqual(before);
    expect(maybe('[data-backup-info="none"]')).not.toBeNull();
  });

  it('تعذّر الخلفية يُظهر الفشل ولا يكتب محليًا', async () => {
    const deps = await mount();
    const failing: DataToolsDeps = { ...deps, writer: { ...deps.writer, importBundle: async () => Promise.reject(new Error('تعذّر الوصول إلى خلفية الإضافة فلم يُحفظ التغيير')) } };
    await act(async () => {
      render(<DataTools deps={failing} />, container);
      await flush(6);
    });
    await settle();
    const before = await dataOf(w.area);
    await pickFile(serializeJson(buildBundle({ notes: notesSet().notes.slice(0, 3), anchors: [], bookmarks: [], salt: null })));
    await click($('[data-action="import"]'));
    expect($('[data-result="import"]').getAttribute('role')).toBe('alert');
    expect($('[data-result="import"]').textContent).toContain('فلم يُحفظ التغيير');
    expect(await dataOf(w.area)).toEqual(before);
  });
});

describe('الحذف', () => {
  it('مستودع: عدّاد وتأكيد نهائي ثم حذف ما يخصه وحده', async () => {
    const deps = await mount();
    const repos = reposOf(await readSnapshot(deps.store));
    await click($('[data-action="delete"]'));
    expect(maybe('[data-confirm="delete"]')).not.toBeNull();
    expect($('[data-confirm="delete"]').textContent).toContain(repos[0]!);
    await click($('[data-action="delete-confirm"]'));
    expect($('[data-result="delete"]').textContent).toMatch(/حُذف \d+ ملاحظة/);
    const after = await readSnapshot(w.background);
    expect(reposOf(after)).not.toContain(repos[0]);
    expect(reposOf(after).length).toBe(repos.length - 1);
  });

  it('إلغاء التأكيد لا يحذف، والمسح الكلي يتطلب علامة تأكيد', async () => {
    await mount();
    const before = await dataOf(w.area);
    await choose(container.querySelectorAll<HTMLInputElement>('input[name="mj-delete-scope"]')[1]!);
    await click($('[data-action="delete"]'));
    await click($('[data-action="delete-cancel"]'));
    expect(await dataOf(w.area)).toEqual(before);
    await click($('[data-action="delete"]'));
    expect($<HTMLButtonElement>('[data-action="delete-confirm"]').disabled).toBe(true);
    await click($('[data-action="delete-confirm"]'));
    expect(await dataOf(w.area)).toEqual(before);
    await choose($('[data-option="confirm-all"]'));
    await click($('[data-action="delete-confirm"]'));
    expect($('[data-result="delete"]').textContent).toContain('حُذف 250 ملاحظة');
    const rest = await dataOf(w.area);
    expect(Object.keys(rest).filter((k) => /^(notes|anchors|bookmarks)\./.test(k))).toEqual([]);
  });
});

describe('لا شبكة (AC-G5)', () => {
  it('التصدير والاستيراد والحذف كلها بلا طلب شبكي', async () => {
    const xhr = vi.fn();
    const beacon = vi.fn();
    vi.stubGlobal('XMLHttpRequest', xhr);
    vi.stubGlobal('WebSocket', xhr);
    Object.defineProperty(navigator, 'sendBeacon', { value: beacon, configurable: true });
    const set = notesSet();
    await mount({ set: { notes: set.notes.slice(0, 20), bookmarks: set.bookmarks.slice(0, 10) } });
    await click($('[data-action="export-json"]'));
    await click($('[data-action="export-md"]'));
    await pickFile(saved[0]!.text);
    await click($('[data-action="import"]'));
    await click($('[data-action="delete"]'));
    await click($('[data-action="delete-confirm"]'));
    expect(parseBundle(saved[0]!.text).ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });
});

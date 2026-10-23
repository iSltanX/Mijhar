// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/shop/blob/main/src/cart.js"}
// TEST-NOTE-03A إلى 03F (e2e على DOM): ملاحظة سطر تُنشأ من بطاقة الصفحة على النسخة الأولى فتُحفظ مرساتها، ثم تُفتح الصفحة على
// نسخ لاحقة من الملف وعلى صفحات «غير موجود» والدخول. في كل حالة: النتيجة الصريحة، ولا علامة على سطر غير مثبت، ولا نقل دون نقر،
// ولا أي طلب شبكي أثناء الحفظ أو إعادة التثبيت.
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOST_TAG, LifecycleManager, ModuleRegistry, PageDetector } from '../../../../src/core';
import { AnchorStore } from '../../../../src/modules/g/anchor';
import type { LineAnchor } from '../../../../src/modules/g/anchor';
import { createModuleG } from '../../../../src/modules/g/notes';
import type { Note } from '../../../../src/modules/g/notes';
import { flush, memoryNotes } from '../notes/helpers';
import type { MemoryNotes } from '../notes/helpers';
import { BLOB_URL, LINE, LOGIN_HTML, MISSING_IN_REPO_HTML, NOT_FOUND_HTML, PATH, SHA1, SHA2, V1, V2_SHIFTED, V3_DUPLICATE, V4_CHANGED, V5_DELETED, V6_CONTEXT, codeViewHtml } from './drift';

let notes: MemoryNotes;
let anchors: AnchorStore;
let manager: LifecycleManager | null = null;
const fetchSpy = vi.fn(async () => new Response(''));

beforeEach(async () => {
  notes = await memoryNotes();
  anchors = await AnchorStore.open(notes.store);
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal('XMLHttpRequest', vi.fn());
});
afterEach(() => {
  act(() => manager?.stop());
  manager = null;
  vi.unstubAllGlobals();
});

function load(html: string, url: string): void {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
  window.history.replaceState({}, '', url);
}

const settle = async (ms = 60) => {
  for (let i = 0; i < 4; i += 1) await act(async () => void (await flush(ms)));
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush(4);
  });
  await settle();
};

async function open(html: string, url = `${BLOB_URL}#L${LINE}`): Promise<void> {
  act(() => manager?.stop());
  load(html, url);
  const module = createModuleG({ context: async () => notes, anchors: async () => anchors });
  manager = new LifecycleManager({ registry: new ModuleRegistry([module]), detector: new PageDetector({ document, settleMs: 1 }), document, isEnabled: () => true });
  await act(async () => {
    manager?.start();
    await flush(10);
  });
  await settle();
  const bar = card().querySelector('.card-bar');
  if (bar?.getAttribute('aria-expanded') === 'false') await click(bar);
}

const card = (): ShadowRoot => {
  const host = [...document.querySelectorAll<HTMLElement>(HOST_TAG)].find((h) => h.getAttribute('data-mijhar-host') === 'g');
  if (!host?.shadowRoot) throw new Error('لا بطاقة');
  return host.shadowRoot;
};
const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const el = card().querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};
const markers = (): Element[] => [...document.querySelectorAll(`${HOST_TAG}[data-mijhar-host="g-line-marker"]`)];
const markerLine = (): string | null | undefined => markers()[0]?.parentElement?.getAttribute('data-line-number');

/** ينشئ ملاحظة السطر من البطاقة على النسخة الأولى (كما يفعل المستخدم)، فتُحفظ مرساتها. */
async function createOnV1(visibility: 'public' | 'private' = 'public', end = LINE): Promise<Note> {
  await open(codeViewHtml(V1, { visibility, commit: SHA1 }), end === LINE ? `${BLOB_URL}#L${LINE}` : `${BLOB_URL}#L${LINE}-L${end}`);
  const textarea = $<HTMLTextAreaElement>('.notes textarea');
  await act(async () => {
    textarea.value = 'تحقق من التقريب هنا';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click($('[data-action="create"]'));
  const [note] = notes.repository.list();
  if (!note) throw new Error('لم تُنشأ الملاحظة');
  return note;
}

const view = (): HTMLElement => $('[data-anchor-view]');
const anchorOf = (note: Note): LineAnchor => {
  const anchor = anchors.get(note.id);
  if (!anchor) throw new Error('لا مرساة');
  return anchor;
};

describe('الحفظ', () => {
  it('ملاحظة السطر من البطاقة تحفظ مرساة مزدوجة: رابط الفرع والالتزام وبصمة النطاق وسياقه، وتظهر «مطابق» بعلامة على سطرها', async () => {
    const note = await createOnV1();
    const anchor = anchorOf(note);
    expect(anchor).toMatchObject({ owner: 'octo', repo: 'shop', path: PATH, ref: 'main', refKind: 'ref', commit: SHA1, start: LINE, end: LINE, visibility: 'public', missing: null });
    expect(anchor.fingerprint).toMatchObject({ mode: 'text', block: ['function calculateTotal(items) {'] });
    expect(view().getAttribute('data-anchor-view')).toBe('matched');
    expect(notes.repository.get(note.id)?.anchorStatus).toBe('matched');
    expect(markerLine()).toBe(String(LINE));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('TEST-NOTE-03A: مطابق', () => {
  it('تُعرض في موضعها بعلامة السطر عند فتح الصفحة على الالتزام نفسه أو على فرع لم يتغير فيه الملف', async () => {
    const note = await createOnV1();
    await open(codeViewHtml(V1, { commit: SHA2 }));
    expect(view().getAttribute('data-anchor-view')).toBe('matched');
    expect(markerLine()).toBe(String(LINE));
    expect(notes.repository.get(note.id)?.target).toMatchObject({ start: LINE, end: LINE });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('TEST-NOTE-03B: منزاح بمرشح وحيد', () => {
  it('يُقترح السطر 55 ولا يُطبَّق ولا تُلصق علامة؛ ثم ينقلها نقر المستخدم فتصير مطابقة بعلامتها', async () => {
    const note = await createOnV1();
    await open(codeViewHtml(V2_SHIFTED, { commit: SHA2 }));
    expect(view().getAttribute('data-anchor-view')).toBe('shifted');
    expect($('[data-candidate]').getAttribute('data-candidate')).toBe('55');
    expect(markers()).toHaveLength(0);
    expect(notes.repository.get(note.id)).toMatchObject({ anchorStatus: 'shifted', target: { start: LINE, end: LINE } });

    await click($('[data-action="relocate"][data-line="55"]'));
    expect(notes.repository.get(note.id)).toMatchObject({ anchorStatus: 'matched', target: { start: 55, end: 55 } });
    expect(anchorOf(note)).toMatchObject({ start: 55, commit: SHA2 });
    expect(view().getAttribute('data-anchor-view')).toBe('matched');
    expect(markerLine()).toBe('55');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('النطاق كله (40–44) ينزاح كتلة واحدة', async () => {
    const note = await createOnV1('public', LINE + 4);
    await open(codeViewHtml(V2_SHIFTED, { commit: SHA2 }), `${BLOB_URL}#L${LINE}-L${LINE + 4}`);
    expect($('[data-candidate]').getAttribute('data-candidate')).toBe('55');
    await click($('[data-action="relocate"]'));
    expect(notes.repository.get(note.id)?.target).toMatchObject({ start: 55, end: 59 });
  });
});

describe('TEST-NOTE-03C: ملتبس لتكرار الأسطر', () => {
  it('تُعرض المرشحات وتبقى الملاحظة غير مربوطة ولا علامة', async () => {
    const note = await createOnV1();
    await open(codeViewHtml(V3_DUPLICATE, { commit: SHA2 }));
    expect(view().getAttribute('data-anchor-view')).toBe('ambiguous');
    expect($('[data-candidates]').getAttribute('data-candidates')).toBe('43,56');
    expect(card().querySelectorAll('[data-action="relocate"]')).toHaveLength(2);
    expect(markers()).toHaveLength(0);
    expect(notes.repository.get(note.id)).toMatchObject({ anchorStatus: 'ambiguous', target: { start: LINE } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('TEST-NOTE-03D: متغيّر', () => {
  it('العام: تُعرض الملاحظة بمقتطفها المحفوظ وبلا موضع ولا علامة', async () => {
    await createOnV1();
    for (const lines of [V4_CHANGED, V5_DELETED]) {
      await open(codeViewHtml(lines, { commit: SHA2 }));
      expect(view().getAttribute('data-anchor-view')).toBe('changed');
      expect($('[data-snippet]').textContent).toBe('function calculateTotal(items) {');
      expect(card().querySelector('[data-text-only]')).toBeNull();
      expect(markers()).toHaveLength(0);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('الخاص (DEC-05 ز-1): «متغيّر» بلا مقتطف، ولا نص كود في التخزين', async () => {
    const note = await createOnV1('private');
    const anchor = anchorOf(note);
    expect(anchor.visibility).toBe('private');
    expect(anchor.fingerprint?.mode).toBe('hash');
    const stored = JSON.stringify(await notes.store.readPrefix('anchors.'));
    expect(stored).not.toContain('calculateTotal');
    expect(stored).not.toContain('limit34');
    await open(codeViewHtml(V4_CHANGED, { visibility: 'private', commit: SHA2 }));
    expect(view().getAttribute('data-anchor-view')).toBe('changed');
    expect(card().querySelector('[data-snippet]')).toBeNull();
    expect(card().querySelector('[data-snippet-private]')).not.toBeNull();
    expect(markers()).toHaveLength(0);
  });

  it('مرشح «بالنص وحده»: السطر باقٍ في موضع واحد بسياق آخر؛ يُعرض اقتراحًا ولا يُطبَّق', async () => {
    const note = await createOnV1();
    await open(codeViewHtml(V6_CONTEXT, { commit: SHA2 }));
    expect(view().getAttribute('data-anchor-view')).toBe('changed');
    expect($('[data-text-only]').getAttribute('data-text-only')).toBe('55');
    expect(notes.repository.get(note.id)?.target).toMatchObject({ start: LINE });
    expect(markers()).toHaveLength(0);
  });
});

describe('TEST-NOTE-03E: مورد محذوف أو مُعاد تسميته', () => {
  it('«المورد غير متاح» مع رابط الفرع والرابط الثابت كمحاولة، في صفحة «غير موجود» لمستودع عام وفي ملف غائب من مستودع ظاهر', async () => {
    await createOnV1();
    for (const html of [NOT_FOUND_HTML, MISSING_IN_REPO_HTML]) {
      await open(html);
      expect(view().getAttribute('data-anchor-view')).toBe('resource-unavailable');
      expect($('[data-anchor-status]').textContent).toBe('المورد غير متاح');
      expect($<HTMLAnchorElement>('[data-anchor-link="branch"]').getAttribute('href')).toBe(`${BLOB_URL}#L${LINE}`);
      expect($<HTMLAnchorElement>('[data-anchor-link="permalink"]').getAttribute('href')).toBe(`https://github.com/octo/shop/blob/${SHA1}/${PATH}#L${LINE}`);
      expect($('[data-anchor-link="permalink"]').textContent).toContain('محاولة');
      expect(markers()).toHaveLength(0);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('TEST-NOTE-03F: فقدان الوصول', () => {
  it('«تعذّر التحقق» في صفحة «غير موجود» لمستودع خاص (لا يُجزم بالحذف) وفي صفحة الدخول', async () => {
    const note = await createOnV1('private');
    for (const html of [NOT_FOUND_HTML, LOGIN_HTML]) {
      await open(html);
      expect(view().getAttribute('data-anchor-view')).toBe('access-lost');
      expect($('[data-anchor-status]').textContent).toBe('تعذّر التحقق');
      expect(card().querySelector('[data-anchor-link="branch"]')).not.toBeNull();
      expect(notes.repository.get(note.id)?.anchorStatus).toBe('access-lost');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('حذف الملاحظة', () => {
  it('حذفها من البطاقة يزيل مرساتها من التخزين، وحذفها من سياق آخر يُزيلها عند إعادة التثبيت التالية', async () => {
    const note = await createOnV1('private');
    expect(anchors.get(note.id)).toBeDefined();
    await click($('[data-action="delete"]'));
    await click($('[data-action="confirm-delete"]'));
    await settle();
    expect(notes.repository.get(note.id)).toBeUndefined();
    expect(anchors.get(note.id)).toBeUndefined();
    expect(Object.keys(await notes.store.readPrefix('anchors.'))).toEqual([]);

    const other = await createOnV1('private');
    act(() => manager?.stop());
    manager = null;
    await notes.repository.remove(other.id);
    expect(anchors.get(other.id)).toBeDefined();
    await open(codeViewHtml(V1));
    expect(anchors.get(other.id)).toBeUndefined();
  });
});

describe('حالات بلا حكم', () => {
  it('Markdown معروض بلا أسطر: «غير مثبتة» مع رابط عرض الكود (plain=1)، ولا علامة', async () => {
    await createOnV1();
    await open(codeViewHtml(V1, { rendered: true }));
    expect(view().getAttribute('data-anchor-view')).toBe('unanchored');
    expect($('[data-reason]').getAttribute('data-reason')).toBe('rendered');
    expect($<HTMLAnchorElement>('[data-action="plain-view"]').getAttribute('href')).toContain('plain=1');
    expect(markers()).toHaveLength(0);
  });

  it('ملاحظة بلا مرساة (قبل T-8.3) تبقى «موضع غير متحقق منه» كما كانت', async () => {
    await notes.repository.create({ target: { level: 'line', view: 'blob', owner: 'octo', repo: 'shop', ref: 'main', refKind: 'ref', path: PATH, start: LINE, end: LINE }, text: 'قديمة', url: BLOB_URL });
    await open(codeViewHtml(V1));
    expect(view().getAttribute('data-anchor-view')).toBe('none');
    expect($('[data-anchor-status]').getAttribute('data-anchor-status')).toBe('unverified');
    expect(anchors.get(notes.repository.list()[0]!.id)).toBeUndefined();
  });
});

// الخلفية كاتبًا وحيدًا للملاحظات والمراسي (VR-01، VR-04): سياقان بمخزنين مستقلين (صفحة ولوحة) يرسلان إلى وسيط واحد فوق منطقة
// تتخلّى عن الدور في كل get وset وremove، فتتداخل العمليات لولا الوسيط. الاختبار الضابط يثبت أن المنطقة تفرض التداخل فعلًا: على المسار
// المباشر (مخزنان بلا وسيط) تضيع إحدى الكتابتين.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startBackground } from '../../../../src/background/main';
import { MemoryStorageArea, Store } from '../../../../src/core';
import type { ExtensionApi, StorageValues } from '../../../../src/core';
import { AnchorStore } from '../../../../src/modules/g/anchor';
import type { LineAnchor } from '../../../../src/modules/g/anchor';
import { NOTES_WRITE_MESSAGE, NoteNotFoundError, NotesBroker, NotesRepository, runtimeNotesWriter } from '../../../../src/modules/g/notes';
import type { NotesWriter } from '../../../../src/modules/g/notes';
import { TARGETS, draft, flush } from './helpers';

/** منطقة ذاكرية تؤجل كل عملية إلى دورة لاحقة: عمليتان من سياقين تتداخلان كما في المتصفح. */
class YieldingArea extends MemoryStorageArea {
  override async get(keys: string | string[] | null): Promise<StorageValues> {
    await flush();
    return super.get(keys);
  }
  override async set(items: StorageValues): Promise<void> {
    await flush();
    return super.set(items);
  }
  override async remove(keys: string | string[]): Promise<void> {
    await flush();
    return super.remove(keys);
  }
}

const opened: Store[] = [];
afterEach(() => {
  for (const store of opened.splice(0)) store.dispose();
});

const anchorFor = (noteId: string): LineAnchor => ({
  noteId,
  version: 1,
  owner: 'octo',
  repo: 'demo',
  path: 'lib/response.js',
  ref: 'main',
  refKind: 'ref',
  commit: null,
  start: 3,
  end: 5,
  visibility: 'public',
  fingerprint: { mode: 'text', block: ['a', 'b', 'c'], before: ['x', 'y'], after: ['z', null] },
  missing: null,
  capturedAt: '2026-10-23T08:00:00.000Z',
});

async function openStore(area: MemoryStorageArea, migrate = false): Promise<Store> {
  const store = await Store.open({ area, changes: area, locks: null, migrate });
  opened.push(store);
  return store;
}

/** وسيط في «الخلفية» وسياقان يرسلان إليه رسائل تعبر تسلسل JSON كما في runtime.sendMessage. */
async function contexts() {
  const area = new YieldingArea();
  const background = await openStore(area, true);
  const broker = NotesBroker.forStore(background);
  const sent: unknown[] = [];
  const runtime = {
    sendMessage: async (message: unknown) => {
      sent.push(message);
      return broker.handle(JSON.parse(JSON.stringify(message)));
    },
  };
  const context = async () => {
    const store = await openStore(area);
    const writer: NotesWriter = runtimeNotesWriter(runtime);
    return { store, notes: await NotesRepository.open(store, { writer }), anchors: await AnchorStore.open(store, { writer }) };
  };
  const page = await context();
  const panel = await context();
  /** قراءة من مخزن يُفتح من جديد على المنطقة (إعادة فتح التخزين). */
  const reopened = async (name: string) => (await openStore(area)).read<unknown>(name, null);
  return { area, broker, sent, page, panel, reopened };
}

describe('الخلفية كاتب وحيد للملاحظات والمراسي (VR-01)', () => {
  it('ضابط: على المسار المباشر بمخزنين تضيع إحدى الكتابتين المتزامنتين (المنطقة تفرض التداخل)', async () => {
    const area = new YieldingArea();
    await openStore(area, true);
    const a = await NotesRepository.open(await openStore(area));
    const b = await NotesRepository.open(await openStore(area));
    const note = await a.create(draft(TARGETS.blobLine!, 'أصل'));
    await Promise.all([a.update(note.id, { text: 'تعديل المستخدم' }), b.update(note.id, { anchorStatus: 'changed' })]);
    const persisted = (await (await openStore(area)).read<{ text: string; anchorStatus: string } | null>(`notes.${note.id}`, null))!;
    expect([persisted.text === 'تعديل المستخدم', persisted.anchorStatus === 'changed']).toContain(false);
  });

  it('تعديل النص من اللوحة وحالة المرساة من الصفحة معًا يبقيان كلاهما', async () => {
    const { page, panel, reopened, sent } = await contexts();
    const note = await page.notes.create(draft(TARGETS.blobLine!, 'أصل'));
    await Promise.all([panel.notes.update(note.id, { text: 'تعديل المستخدم' }), page.notes.update(note.id, { anchorStatus: 'changed' })]);
    expect(await reopened(`notes.${note.id}`)).toMatchObject({ text: 'تعديل المستخدم', anchorStatus: 'changed' });
    // ما يُرسل حقول التعديل وحدها لا سجل كامل محسوب عند المرسل.
    expect(sent.filter((m) => (m as { op: string }).op === 'note-update').map((m) => Object.keys((m as { patch: object }).patch))).toEqual([['text'], ['anchorStatus']]);
  });

  it('حذف يتداخل مع تعديل بدأ قبله يبقي الملاحظة محذوفة، حتى بعد إعادة فتح التخزين', async () => {
    const { page, panel, reopened } = await contexts();
    const note = await page.notes.create(draft(TARGETS.blobLine!, 'أصل'));
    const results = await Promise.allSettled([page.notes.update(note.id, { anchorStatus: 'changed' }), panel.notes.remove(note.id)]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect(await reopened(`notes.${note.id}`)).toBeNull();
    await flush(5);
    expect(page.notes.get(note.id)).toBeUndefined();
    expect(panel.notes.get(note.id)).toBeUndefined();
  });

  it('تعديل يصل بعد الحذف يفشل ولا يعيد الملاحظة', async () => {
    const { page, panel, reopened } = await contexts();
    const note = await page.notes.create(draft(TARGETS.blobLine!, 'أصل'));
    const results = await Promise.allSettled([panel.notes.remove(note.id), page.notes.update(note.id, { anchorStatus: 'changed' })]);
    expect(results[0]!.status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.any(NoteNotFoundError) });
    expect(await reopened(`notes.${note.id}`)).toBeNull();
  });

  it('حفظ مرساة بعد حذف ملاحظتها يُرفض ولا يُكتب', async () => {
    const { page, panel, reopened } = await contexts();
    const note = await page.notes.create(draft(TARGETS.blobLine!, 'أصل'));
    await panel.notes.remove(note.id);
    await expect(page.anchors.save(anchorFor(note.id))).rejects.toBeInstanceOf(NoteNotFoundError);
    expect(await reopened(`anchors.${note.id}`)).toBeNull();
    expect(page.anchors.get(note.id)).toBeUndefined();
  });

  it('تعديل ملاحظة غير موجودة يفشل ولا ينشئ شيئًا', async () => {
    const { panel, area } = await contexts();
    await expect(panel.notes.update('missing-id', { text: 'نص' })).rejects.toBeInstanceOf(NoteNotFoundError);
    expect(Object.keys(area.dump()).filter((key) => key.includes('notes.'))).toEqual([]);
  });

  it('الخلفية تتحقق من شكل الرسالة ولا تقبل سجلًا محسوبًا عند المرسل', async () => {
    const { broker, page, reopened } = await contexts();
    const note = await page.notes.create(draft(TARGETS.repo!, 'أصل'));
    const bad = [
      { type: NOTES_WRITE_MESSAGE, op: 'note-create', draft: { ...draft(TARGETS.repo!), target: { level: 'repo', owner: '' } } },
      { type: NOTES_WRITE_MESSAGE, op: 'note-create', draft: { ...draft(TARGETS.repo!), id: 'chosen', createdAt: '2000-01-01T00:00:00.000Z' } },
      { type: NOTES_WRITE_MESSAGE, op: 'note-update', id: note.id, patch: { text: 'جديد', createdAt: '2000-01-01T00:00:00.000Z' } },
      { type: NOTES_WRITE_MESSAGE, op: 'note-update', id: note.id, patch: { anchorStatus: 'not-a-status' } },
      { type: NOTES_WRITE_MESSAGE, op: 'note-remove', id: '../meta' },
      { type: NOTES_WRITE_MESSAGE, op: 'anchor-save', anchor: { ...anchorFor(note.id), start: 0 } },
      { type: NOTES_WRITE_MESSAGE, op: 'drop-all' },
    ];
    for (const message of bad) expect(await broker.handle(message)).toMatchObject({ ok: false });
    expect(await reopened(`notes.${note.id}`)).toMatchObject({ text: 'أصل', createdAt: note.createdAt });
  });

  it('خلفية غير متاحة: تفشل العملية ظاهرًا ولا يُكتب شيء محليًا', async () => {
    const area = new YieldingArea();
    await openStore(area, true);
    const store = await openStore(area);
    const writer = runtimeNotesWriter({ sendMessage: async () => Promise.reject(new Error('Receiving end does not exist.')) });
    const notes = await NotesRepository.open(store, { writer });
    await expect(notes.create(draft(TARGETS.repo!, 'نص'))).rejects.toThrow('تعذّر الوصول إلى خلفية الإضافة');
    const silent = await NotesRepository.open(store, { writer: runtimeNotesWriter({ sendMessage: async () => undefined }) });
    await expect(silent.create(draft(TARGETS.repo!, 'نص'))).rejects.toThrow('تعذّر الوصول إلى خلفية الإضافة');
    expect(Object.keys(area.dump()).filter((key) => key.includes('notes.'))).toEqual([]);
  });
});

describe('حذف الملاحظة يزيل مرساتها (VR-04)', () => {
  it('الحذف عبر الوسيط من سياق بلا متحكم مرساة يزيل الملاحظة ومرساتها، حتى بعد إعادة فتح التخزين', async () => {
    const { page, panel, reopened } = await contexts();
    const note = await page.notes.create(draft(TARGETS.blobLine!, 'أصل'));
    await page.anchors.save(anchorFor(note.id));
    expect(await reopened(`anchors.${note.id}`)).not.toBeNull();
    await panel.notes.remove(note.id);
    expect(await reopened(`notes.${note.id}`)).toBeNull();
    expect(await reopened(`anchors.${note.id}`)).toBeNull();
  });

  it('المسار المباشر يحذف السجلين في استدعاء واحد للمنطقة', async () => {
    const area = new MemoryStorageArea();
    const store = await openStore(area, true);
    const notes = await NotesRepository.open(store);
    const anchors = await AnchorStore.open(store);
    const note = await notes.create(draft(TARGETS.blobLine!, 'أصل'));
    await anchors.save(anchorFor(note.id));
    const remove = vi.spyOn(area, 'remove');
    await notes.remove(note.id);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith([`mijhar:data:notes.${note.id}`, `mijhar:data:anchors.${note.id}`]);
    expect(Object.keys(area.dump()).filter((key) => key.includes(note.id))).toEqual([]);
  });

  it('الخلفية تنظّف المراسي اليتيمة مرة بعد فتح التخزين، وتجيب رسائل الكتابة بـsendResponse وتعيد true', async () => {
    const orphan = anchorFor('orphan-note');
    const area = new MemoryStorageArea({ initial: { 'mijhar:meta': { schemaVersion: 1, createdAt: '2026-10-23T08:00:00.000Z' }, 'mijhar:data:anchors.orphan-note': orphan } });
    const listeners: Array<(m: unknown, s: object, reply: (r?: unknown) => void) => unknown> = [];
    const api = {
      runtime: {
        getURL: (p: string) => p,
        sendMessage: vi.fn(async () => undefined),
        onMessage: { addListener: (l: (typeof listeners)[number]) => void listeners.push(l), removeListener: () => {} },
      },
    } as unknown as ExtensionApi;
    await startBackground({ api, target: 'chromium', binding: { area, changes: area } }).ready;
    await flush(5);
    expect(area.dump()['mijhar:data:anchors.orphan-note']).toBeUndefined();
    const ask = (message: unknown): Promise<{ returned: unknown; reply: unknown }> =>
      new Promise((resolve) => {
        let returned: unknown;
        returned = listeners[0]?.(message, {}, (reply) => resolve({ returned, reply }));
      });
    const created = await ask({ type: NOTES_WRITE_MESSAGE, op: 'note-create', draft: draft(TARGETS.repo!, 'من الصفحة') });
    expect(created.returned).toBe(true);
    expect(created.reply).toMatchObject({ ok: true, value: { text: 'من الصفحة', target: TARGETS.repo } });
    const id = (created.reply as { value: { id: string } }).value.id;
    expect(area.dump()[`mijhar:data:notes.${id}`]).toMatchObject({ text: 'من الصفحة' });
  });
});

// أدوات اختبار التصدير والاستيراد (T-8.4): «خلفية» بوسيطها فوق منطقة تتخلّى عن الدور في كل عملية، وسياقان (صفحة ولوحة) بكاتب الرسائل،
// ومجموعة PB-04 (500 عنصر) تُزرع في التخزين مباشرة كما لو جاءت من نسخة سابقة.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryStorageArea, Store } from '../../../../src/core';
import type { StorageValues } from '../../../../src/core';
import type { LineAnchor } from '../../../../src/modules/g/anchor';
import { BookmarksRepository } from '../../../../src/modules/g/bookmarks';
import type { Bookmark } from '../../../../src/modules/g/bookmarks';
import { NotesBroker, NotesRepository, runtimeNotesWriter } from '../../../../src/modules/g/notes';
import type { Note, NotesWriter } from '../../../../src/modules/g/notes';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const flush = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** منطقة ذاكرية تؤجل كل عملية إلى دورة لاحقة: عمليات سياقين تتداخل كما في المتصفح. */
export class YieldingArea extends MemoryStorageArea {
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

export interface NotesSetFile {
  readonly notes: Note[];
  readonly bookmarks: Bookmark[];
}

export const notesSet = (): NotesSetFile => JSON.parse(fs.readFileSync(path.join(HERE, '..', 'fixtures', 'fixture-notes-set.json'), 'utf8')) as NotesSetFile;

/** مرساة نصية صالحة لملاحظة سطر (ملف عام). */
export function anchorFor(note: Note, overrides: Partial<LineAnchor> = {}): LineAnchor {
  if (note.target.level !== 'line' || note.target.view !== 'blob') throw new Error('مرساة الاختبار لملاحظة سطر في ملف');
  const { owner, repo, path: file, ref, refKind, start, end } = note.target;
  return {
    noteId: note.id,
    version: 1,
    owner,
    repo,
    path: file,
    ref,
    refKind,
    commit: null,
    start,
    end,
    visibility: 'public',
    fingerprint: { mode: 'text', block: ['function a() {}'], before: ['x', 'y'], after: ['z', null] },
    missing: null,
    capturedAt: '2026-10-23T08:00:00.000Z',
    ...overrides,
  };
}

export const SALT = 'a'.repeat(64);
export const SALT_RECORD = { salt: SALT, createdAt: '2026-10-23T08:00:00.000Z' } as const;

/** يزرع المجموعة (ومراسي ملاحظات الأسطر في الملفات، وملحًا) في التخزين مباشرة. */
export async function seed(store: Store, set: NotesSetFile = notesSet(), options: { salt?: boolean } = {}): Promise<{ anchors: LineAnchor[] }> {
  const anchors: LineAnchor[] = [];
  for (const note of set.notes) {
    await store.write(`notes.${note.id}`, note);
    if (note.target.level === 'line' && note.target.view === 'blob') {
      const anchor = anchorFor(note);
      anchors.push(anchor);
      await store.write(`anchors.${note.id}`, anchor);
    }
  }
  for (const bookmark of set.bookmarks) await store.write(`bookmarks.${bookmark.id}`, bookmark);
  if (options.salt !== false) await store.write('anchor-salt', SALT_RECORD);
  return { anchors };
}

/** كل سجلات البيانات في المنطقة (للمقارنة قبل العملية وبعدها). */
export async function dataOf(area: MemoryStorageArea): Promise<Record<string, unknown>> {
  const all = await area.get(null);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(all)) if (key.startsWith('mijhar:data:')) out[key.slice('mijhar:data:'.length)] = value;
  return out;
}

export interface World {
  readonly area: MemoryStorageArea;
  readonly broker: NotesBroker;
  readonly background: Store;
  readonly sent: unknown[];
  readonly writer: NotesWriter;
  context(): Promise<{ store: Store; notes: NotesRepository; bookmarks: BookmarksRepository; writer: NotesWriter }>;
}

const opened: Store[] = [];
export const closeAll = (): void => {
  for (const store of opened.splice(0)) store.dispose();
};

async function openStore(area: MemoryStorageArea, migrate = false): Promise<Store> {
  const store = await Store.open({ area, changes: area, locks: null, migrate });
  opened.push(store);
  return store;
}

let clock = 0;
const tick = (): Date => new Date(Date.UTC(2026, 9, 24, 8, 0, clock++));

/** خلفية بوسيطها وسياقات ترسل رسائل تعبر تسلسل JSON كما في runtime.sendMessage. */
export async function world(area: MemoryStorageArea = new MemoryStorageArea()): Promise<World> {
  const background = await openStore(area, true);
  const broker = NotesBroker.forStore(background, { now: tick });
  const sent: unknown[] = [];
  const runtime = {
    sendMessage: async (message: unknown) => {
      sent.push(message);
      return broker.handle(JSON.parse(JSON.stringify(message)));
    },
  };
  const writer = runtimeNotesWriter(runtime);
  return {
    area,
    broker,
    background,
    sent,
    writer,
    context: async () => {
      const store = await openStore(area);
      return { store, notes: await NotesRepository.open(store, { writer }), bookmarks: await BookmarksRepository.open(store), writer };
    },
  };
}

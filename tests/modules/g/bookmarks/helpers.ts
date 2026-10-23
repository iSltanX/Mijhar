// أدوات اختبار «أكمل لاحقًا»: سياق ذاكري (مخزن ومستودعا الروابط والملاحظات والإعدادات) ومجموعة PB-04.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../../../src/core';
import { BookmarksRepository, defineBookmarksSettings } from '../../../../src/modules/g/bookmarks';
import type { Bookmark, LaterContext } from '../../../../src/modules/g/bookmarks';
import { NotesRepository, defineNotesSettings } from '../../../../src/modules/g/notes';
import type { Note } from '../../../../src/modules/g/notes';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const flush = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface MemoryLater extends LaterContext {
  readonly area: MemoryStorageArea;
  reopen(): Promise<MemoryLater>;
}

let clock = 0;
export const tick = (): Date => new Date(Date.UTC(2026, 9, 23, 9, 0, clock++));

export async function memoryLater(area = new MemoryStorageArea(), now: () => Date = tick): Promise<MemoryLater> {
  const store = await Store.open({ area, changes: area, locks: null });
  const settings = await SettingsStore.open(
    store,
    createSettingsRegistry((r) => {
      defineNotesSettings(r);
      defineBookmarksSettings(r);
    }),
  );
  const [bookmarks, notes] = await Promise.all([BookmarksRepository.open(store, { now }), NotesRepository.open(store, { now })]);
  return { area, store, settings, bookmarks, notes, reopen: () => memoryLater(area, now) };
}

export interface NotesSet {
  readonly notes: Note[];
  readonly bookmarks: Bookmark[];
}

export const notesSet = (): NotesSet => JSON.parse(fs.readFileSync(path.join(HERE, '..', 'fixtures', 'fixture-notes-set.json'), 'utf8')) as NotesSet;

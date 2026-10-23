// أدوات اختبار الوحدة (ز): مخزن ذاكري يتشاركه «سياقان»، ومستودع ملاحظات فوقه، وعينات ملاحظات من الأنواع الخمسة.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../../../src/core';
import { NotesRepository, defineNotesSettings } from '../../../../src/modules/g/notes';
import type { NoteDraft, NoteTarget } from '../../../../src/modules/g/notes';
import type { NotesContext } from '../../../../src/modules/g/notes';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const fixture = (name: string): string => fs.readFileSync(path.join(HERE, 'fixtures', name), 'utf8');

export const flush = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface MemoryNotes extends NotesContext {
  readonly area: MemoryStorageArea;
  readonly store: Store;
  /** سياق آخر على المنطقة نفسها (نافذة أو لوحة أخرى). */
  reopen(): Promise<MemoryNotes>;
}

let clock = 0;
const tick = (): Date => new Date(Date.UTC(2026, 9, 23, 8, 0, clock++));

export async function memoryNotes(area = new MemoryStorageArea()): Promise<MemoryNotes> {
  const store = await Store.open({ area, changes: area, locks: null });
  const settings = await SettingsStore.open(store, createSettingsRegistry(defineNotesSettings));
  const repository = await NotesRepository.open(store, { now: tick });
  return { area, store, settings, repository, reopen: () => memoryNotes(area) };
}

export const REPO = { owner: 'octo', repo: 'demo' } as const;
export const SHA = '0dee2c52c7c873498f8ed7d8ee4ddd0a04d3ada8';

/** هدف لكل مستوى من الخمسة (والسطر بنوعيه). */
export const TARGETS: Readonly<Record<string, NoteTarget>> = {
  repo: { level: 'repo', ...REPO },
  issue: { level: 'thread', ...REPO, kind: 'issue', number: 12 },
  pr: { level: 'thread', ...REPO, kind: 'pr', number: 42 },
  commit: { level: 'commit', ...REPO, sha: SHA },
  file: { level: 'file', ...REPO, ref: 'main', refKind: 'ref', path: 'lib/response.js' },
  blobLine: { level: 'line', view: 'blob', ...REPO, ref: 'main', refKind: 'ref', path: 'lib/response.js', start: 3, end: 5 },
  diffLine: { level: 'line', view: 'diff', ...REPO, context: { kind: 'pr', number: 42 }, path: 'src/app.js', side: 'R', start: 5, end: 5 },
};

export const draft = (target: NoteTarget, text = 'ملاحظة تجريبية', extra: Partial<NoteDraft> = {}): NoteDraft => ({
  target,
  text,
  url: `https://github.com/${REPO.owner}/${REPO.repo}`,
  title: 'octo/demo',
  ...extra,
});

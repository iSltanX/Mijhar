// قراءة حالة الملاحظات والمراسي والروابط والملح من التخزين وقراءة النسخة الاحتياطية للاستيراد (T-8.4). قراءة فقط: مسموحة في أي سياق
// (الصفحة واللوحة والإعدادات والخلفية)، فتبني منها الواجهة المعاينة والتصدير، وتبني منها الخلفية خطة الكتابة من حالتها هي (AD-25).
import type { Store } from '../../../core/storage';
import { ANCHOR_PREFIX, isLineAnchor } from '../anchor/types';
import type { LineAnchor } from '../anchor/types';
import { BOOKMARK_PREFIX, isBookmark } from '../bookmarks/types';
import type { Bookmark } from '../bookmarks/types';
import { NOTE_PREFIX, isNote } from '../notes/types';
import type { Note } from '../notes/types';
import { isSaltRecord, parseBundle } from './format';
import type { ExportBundle, ExportSource, SaltRecord } from './format';
import { BACKUP_NAME, SALT_NAME } from './plan';
import type { DataSnapshot, ImportMode } from './plan';

type Reader = Pick<Store, 'read' | 'readPrefix'>;

/** يقرأ كل ما تملكه الوحدة (ز). السجل غير الصالح لا يدخل الفهارس (قد يكون من نسخة أحدث) لكن اسمه يبقى في names لمسح كلي كامل. */
export async function readSnapshot(store: Reader): Promise<DataSnapshot> {
  const [notes, anchors, bookmarks, salt] = await Promise.all([store.readPrefix(NOTE_PREFIX), store.readPrefix(ANCHOR_PREFIX), store.readPrefix(BOOKMARK_PREFIX), store.read<unknown>(SALT_NAME, null)]);
  const validNotes = new Map<string, Note>();
  for (const [name, value] of Object.entries(notes)) if (isNote(value) && name === `${NOTE_PREFIX}${value.id}`) validNotes.set(value.id, value);
  const validAnchors = new Map<string, LineAnchor>();
  for (const [name, value] of Object.entries(anchors)) if (isLineAnchor(value) && name === `${ANCHOR_PREFIX}${value.noteId}`) validAnchors.set(value.noteId, value);
  const validBookmarks = new Map<string, Bookmark>();
  for (const [name, value] of Object.entries(bookmarks)) if (isBookmark(value) && name === `${BOOKMARK_PREFIX}${value.id}`) validBookmarks.set(value.id, value);
  return {
    notes: validNotes,
    anchors: validAnchors,
    bookmarks: validBookmarks,
    salt: isSaltRecord(salt) ? salt : null,
    names: { notes: Object.keys(notes), anchors: Object.keys(anchors), bookmarks: Object.keys(bookmarks) },
  };
}

/** مصدر التصدير من الحالة المقروءة. */
export function sourceOf(snapshot: DataSnapshot): ExportSource {
  return { notes: [...snapshot.notes.values()], anchors: [...snapshot.anchors.values()], bookmarks: [...snapshot.bookmarks.values()], salt: snapshot.salt as SaltRecord | null };
}

/** مستودعات فيها ملاحظات أو روابط، لاختيار نطاق التصدير والحذف. */
export function reposOf(snapshot: DataSnapshot): string[] {
  const repos = new Map<string, string>();
  const add = (owner: string | null, repo: string | null): void => {
    if (owner && repo) repos.set(`${owner}/${repo}`.toLowerCase(), `${owner}/${repo}`);
  };
  for (const note of snapshot.notes.values()) add(note.target.owner, note.target.repo);
  for (const bookmark of snapshot.bookmarks.values()) add(bookmark.owner, bookmark.repo);
  return [...repos.values()].sort((a, b) => a.localeCompare(b));
}

// ---------- النسخة الاحتياطية التلقائية ----------

export const BACKUP_VERSION = 1;

/** سجل النسخة الاحتياطية (export-backup): حالة الملاحظات والروابط قبل آخر استيراد. سجل واحد يُستبدل في كل استيراد. */
export interface ImportBackup {
  readonly version: typeof BACKUP_VERSION;
  readonly createdAt: string;
  readonly mode: ImportMode;
  readonly bundle: ExportBundle;
}

export function parseBackup(value: unknown): ImportBackup | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== BACKUP_VERSION || typeof record.createdAt !== 'string' || (record.mode !== 'merge' && record.mode !== 'replace')) return null;
  const parsed = parseBundle(record.bundle);
  return parsed.ok ? { version: BACKUP_VERSION, createdAt: record.createdAt, mode: record.mode, bundle: parsed.bundle } : null;
}

export async function readBackup(store: Pick<Store, 'read'>): Promise<ImportBackup | null> {
  return parseBackup(await store.read<unknown>(BACKUP_NAME, null));
}

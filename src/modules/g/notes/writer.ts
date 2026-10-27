// رسائل كتابة الملاحظات والمراسي إلى الخلفية (VR-01): الخلفية الكاتب الوحيد لسجلات notes.* وanchors.*، وكل سياق آخر (سكربت المحتوى
// واللوحة والإعدادات) يرسل إليها حقول التعديل وحدها لا سجلًا كاملًا. وكل مخزن سياق يقرأ ويشترك في التغيّر كما كان.
//  - الشكل يُفحص في الخلفية (parseNotesWriteRequest) ولا يُقبل سجل محسوب عند المرسل: المعرّف والطوابع والإصدار تحسبها الخلفية.
//  - تعذّر الوصول إلى الخلفية يُفشل العملية ظاهرًا، ولا كتابة محلية بديلة أبدًا.
//  - MJ-TA-03: وروابط «أكمل لاحقًا» (bookmarks.*) كذلك: إنشاؤها وتعديلها بحقوله المرسلة وحدها وحذفها في الطابور نفسه.
import type { ExtensionApi } from '../../../core/ui-host/browser-api';
import { isLineAnchor } from '../anchor/types';
import { DataImportError, NoBackupError } from '../export/errors';
import type { DeleteCounts, DeleteScope, ImportMode, ImportSummary } from '../export/plan';
import type { LineAnchor } from '../anchor/types';
import { BookmarkInputError, BookmarkNotFoundError } from '../bookmarks/repository';
import type { BookmarksWriter } from '../bookmarks/repository';
import { isBookmarkLevel, isBookmarkPosition, isBookmarkStatus } from '../bookmarks/types';
import type { Bookmark, BookmarkDraft, BookmarkPatch } from '../bookmarks/types';
import { NoteNotFoundError, NoteTextError } from './repository';
import { ANCHOR_STATUSES, isNoteTarget } from './types';
import type { Note, NoteDraft, NotePatch } from './types';

export const NOTES_WRITE_MESSAGE = 'mijhar/notes-write';

export type NotesWriteOperation =
  | { readonly op: 'note-create'; readonly draft: NoteDraft }
  | { readonly op: 'note-update'; readonly id: string; readonly patch: NotePatch }
  | { readonly op: 'note-remove'; readonly id: string }
  | { readonly op: 'anchor-save'; readonly anchor: LineAnchor }
  | { readonly op: 'anchor-prune' }
  // CODEX-007: «احصل على الملح أو أنشئه» عملية واحدة في طابور الخلفية، فيعود سياقان متسابقان بالملح نفسه.
  | { readonly op: 'salt-ensure' }
  // T-8.4 (AD-25): الاستيراد والحذف المفرد والمستودعي والكلي واستعادة نسخة الاستيراد الاحتياطية. الرسالة تحمل الملف والوضع أو النطاق، والخلفية
  // تفحص وتحسب وتكتب من حالتها هي.
  | { readonly op: 'data-import'; readonly content: unknown; readonly mode: ImportMode }
  | { readonly op: 'data-delete'; readonly scope: DeleteScope }
  | { readonly op: 'data-restore' }
  // MJ-TA-03: روابط «أكمل لاحقًا».
  | { readonly op: 'bookmark-create'; readonly draft: BookmarkDraft }
  | { readonly op: 'bookmark-update'; readonly id: string; readonly patch: BookmarkPatch }
  | { readonly op: 'bookmark-remove'; readonly id: string };

export type NotesWriteRequest = NotesWriteOperation & { readonly type: typeof NOTES_WRITE_MESSAGE };

export type NotesWriteResponse =
  | { readonly ok: true; readonly value?: unknown }
  | { readonly ok: false; readonly error: { readonly name: string; readonly message: string; readonly id?: string } };

/** ما يحتاجه مستودع الملاحظات ومخزن المراسي ومستودع الروابط ليكتبوا عبر الخلفية. */
export interface NotesWriter extends BookmarksWriter {
  createNote(draft: NoteDraft): Promise<Note>;
  updateNote(id: string, patch: NotePatch): Promise<Note>;
  removeNote(id: string): Promise<void>;
  saveAnchor(anchor: LineAnchor): Promise<void>;
  pruneAnchors(): Promise<number>;
  /** ملح البصمات المحلي، تنشئه الخلفية في طابورها عند أول حاجة. */
  ensureSalt(): Promise<string>;
  /** يستورد ملف تصدير (نصه أو كائنه) بالدمج أو الاستبدال بعد نسخة احتياطية تلقائية؛ ملف تالف يُرفض دون مساس بالبيانات. */
  importBundle(content: unknown, mode: ImportMode): Promise<ImportSummary>;
  /** يحذف ملاحظة أو رابطًا أو كل ما يخص مستودعًا أو كل شيء، مع المراسي، في الخلفية وحدها. */
  deleteData(scope: DeleteScope): Promise<DeleteCounts>;
  /** يعيد حالة الملاحظات والروابط إلى ما قبل آخر استيراد. */
  restoreImportBackup(): Promise<ImportSummary>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).every((key) => keys.includes(key));
const isStatus = (value: unknown): boolean => (ANCHOR_STATUSES as readonly unknown[]).includes(value);
// المعرّف جزء من اسم السجل (notes.<id>)، فلا يحوي إلا ما يقبله Store في الأسماء.
const isId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value);

function isDraft(value: unknown): value is NoteDraft {
  if (!isRecord(value) || !onlyKeys(value, ['target', 'text', 'url', 'title', 'anchorStatus'])) return false;
  return (
    isNoteTarget(value.target) &&
    typeof value.text === 'string' &&
    typeof value.url === 'string' &&
    (value.title === undefined || value.title === null || typeof value.title === 'string') &&
    (value.anchorStatus === undefined || isStatus(value.anchorStatus))
  );
}

function isPatch(value: unknown): value is NotePatch {
  if (!isRecord(value) || !onlyKeys(value, ['text', 'anchorStatus', 'target'])) return false;
  return (
    (value.text === undefined || typeof value.text === 'string') &&
    (value.anchorStatus === undefined || isStatus(value.anchorStatus)) &&
    (value.target === undefined || (isNoteTarget(value.target) && value.target.level === 'line'))
  );
}

const isNullableString = (value: unknown): boolean => value === null || typeof value === 'string';
const isStringList = (value: unknown): boolean => Array.isArray(value) && value.every((v) => typeof v === 'string');

// شكل الرسالة وحده؛ والقيم تُفحص في المستودع المباشر بالخلفية (isBookmark وparseTags وحد الملاحظة) كما لو كُتبت محليًا.
function isBookmarkDraft(value: unknown): value is BookmarkDraft {
  if (!isRecord(value) || !onlyKeys(value, ['url', 'title', 'owner', 'repo', 'branch', 'refKind', 'level', 'position', 'status', 'tags', 'note'])) return false;
  return (
    typeof value.url === 'string' &&
    isNullableString(value.title) &&
    isNullableString(value.owner) &&
    isNullableString(value.repo) &&
    isNullableString(value.branch) &&
    (value.refKind === 'sha' || value.refKind === 'ref' || value.refKind === 'unknown') &&
    isBookmarkLevel(value.level) &&
    (value.position === null || isBookmarkPosition(value.position)) &&
    (value.status === undefined || isBookmarkStatus(value.status)) &&
    (value.tags === undefined || isStringList(value.tags)) &&
    (value.note === undefined || typeof value.note === 'string')
  );
}

function isBookmarkPatch(value: unknown): value is BookmarkPatch {
  if (!isRecord(value) || !onlyKeys(value, ['status', 'tags', 'note', 'title', 'position', 'branch'])) return false;
  return (
    (value.status === undefined || isBookmarkStatus(value.status)) &&
    (value.tags === undefined || isStringList(value.tags)) &&
    (value.note === undefined || typeof value.note === 'string') &&
    (value.title === undefined || isNullableString(value.title)) &&
    (value.position === undefined || value.position === null || isBookmarkPosition(value.position)) &&
    (value.branch === undefined || isNullableString(value.branch))
  );
}

const isSlugPart = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(value);

function isDeleteScope(value: unknown): value is DeleteScope {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'all':
      return onlyKeys(value, ['kind']);
    case 'note':
    case 'bookmark':
      return onlyKeys(value, ['kind', 'id']) && isId(value.id);
    case 'repo':
      return onlyKeys(value, ['kind', 'owner', 'repo']) && isSlugPart(value.owner) && isSlugPart(value.repo);
    default:
      return false;
  }
}

/** هل الرسالة موجّهة إلى وسيط الكتابة (للتوجيه في الخلفية؛ الشكل يُفحص بـparseNotesWriteRequest). */
export function isNotesWriteRequest(message: unknown): boolean {
  return isRecord(message) && message.type === NOTES_WRITE_MESSAGE;
}

/** يفحص شكل رسالة الكتابة كاملًا، أو null إن لم تكن صالحة. */
export function parseNotesWriteRequest(message: unknown): NotesWriteRequest | null {
  if (!isRecord(message) || message.type !== NOTES_WRITE_MESSAGE) return null;
  switch (message.op) {
    case 'note-create':
      return onlyKeys(message, ['type', 'op', 'draft']) && isDraft(message.draft) ? (message as NotesWriteRequest) : null;
    case 'note-update':
      return onlyKeys(message, ['type', 'op', 'id', 'patch']) && isId(message.id) && isPatch(message.patch) ? (message as NotesWriteRequest) : null;
    case 'note-remove':
      return onlyKeys(message, ['type', 'op', 'id']) && isId(message.id) ? (message as NotesWriteRequest) : null;
    case 'anchor-save':
      return onlyKeys(message, ['type', 'op', 'anchor']) && isLineAnchor(message.anchor) && isId(message.anchor.noteId) ? (message as NotesWriteRequest) : null;
    case 'anchor-prune':
    case 'salt-ensure':
      return onlyKeys(message, ['type', 'op']) ? (message as NotesWriteRequest) : null;
    case 'data-import':
      return onlyKeys(message, ['type', 'op', 'content', 'mode']) && (message.mode === 'merge' || message.mode === 'replace') && (isRecord(message.content) || typeof message.content === 'string')
        ? (message as NotesWriteRequest)
        : null;
    case 'data-delete':
      return onlyKeys(message, ['type', 'op', 'scope']) && isDeleteScope(message.scope) ? (message as NotesWriteRequest) : null;
    case 'data-restore':
      return onlyKeys(message, ['type', 'op']) ? (message as NotesWriteRequest) : null;
    case 'bookmark-create':
      return onlyKeys(message, ['type', 'op', 'draft']) && isBookmarkDraft(message.draft) ? (message as NotesWriteRequest) : null;
    case 'bookmark-update':
      return onlyKeys(message, ['type', 'op', 'id', 'patch']) && isId(message.id) && isBookmarkPatch(message.patch) ? (message as NotesWriteRequest) : null;
    case 'bookmark-remove':
      return onlyKeys(message, ['type', 'op', 'id']) && isId(message.id) ? (message as NotesWriteRequest) : null;
    default:
      return null;
  }
}

/** خطأ الخلفية بصنفه (NoteNotFoundError وNoteTextError تعرضهما الواجهة كما لو وقعا محليًا). */
function rebuild(error: unknown): Error {
  const e = isRecord(error) ? error : {};
  const message = typeof e.message === 'string' ? e.message : 'تعذّر تنفيذ الكتابة في الخلفية';
  if (e.name === 'NoteNotFoundError') return new NoteNotFoundError(typeof e.id === 'string' ? e.id : '');
  if (e.name === 'NoteTextError') return new NoteTextError(message);
  if (e.name === 'DataImportError') return Object.assign(new DataImportError([]), { message });
  if (e.name === 'NoBackupError') return new NoBackupError();
  if (e.name === 'BookmarkNotFoundError') return new BookmarkNotFoundError(typeof e.id === 'string' ? e.id : '');
  if (e.name === 'BookmarkInputError') return new BookmarkInputError(message);
  return new Error(message);
}

/** كاتب سكربت المحتوى وصفحات الإضافة: يرسل إلى الخلفية. فشل الرسالة نفسه (خلفية غير متاحة) يُرفع خطأً ولا يُكتب شيء محليًا. */
export function runtimeNotesWriter(runtime: Pick<ExtensionApi['runtime'], 'sendMessage'>): NotesWriter {
  const send = async (operation: NotesWriteOperation): Promise<unknown> => {
    let response: unknown;
    try {
      response = await runtime.sendMessage({ type: NOTES_WRITE_MESSAGE, ...operation });
    } catch (error) {
      throw new Error(`تعذّر الوصول إلى خلفية الإضافة فلم يُحفظ التغيير: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isRecord(response) || typeof response.ok !== 'boolean') throw new Error('تعذّر الوصول إلى خلفية الإضافة فلم يُحفظ التغيير: لم تردّ الخلفية');
    if (!response.ok) throw rebuild(response.error);
    return response.value;
  };
  return {
    createNote: async (draft) => (await send({ op: 'note-create', draft })) as Note,
    updateNote: async (id, patch) => (await send({ op: 'note-update', id, patch })) as Note,
    removeNote: async (id) => void (await send({ op: 'note-remove', id })),
    saveAnchor: async (anchor) => void (await send({ op: 'anchor-save', anchor })),
    pruneAnchors: async () => Number(await send({ op: 'anchor-prune' })),
    ensureSalt: async () => {
      const salt = await send({ op: 'salt-ensure' });
      if (typeof salt !== 'string' || !/^[0-9a-f]{64}$/.test(salt)) throw new Error('ردّت الخلفية بملح غير صالح');
      return salt;
    },
    importBundle: async (content, mode) => (await send({ op: 'data-import', content, mode })) as ImportSummary,
    deleteData: async (scope) => (await send({ op: 'data-delete', scope })) as DeleteCounts,
    restoreImportBackup: async () => (await send({ op: 'data-restore' })) as ImportSummary,
    createBookmark: async (draft) => (await send({ op: 'bookmark-create', draft })) as Bookmark,
    updateBookmark: async (id, patch) => (await send({ op: 'bookmark-update', id, patch })) as Bookmark,
    removeBookmark: async (id) => void (await send({ op: 'bookmark-remove', id })),
  };
}

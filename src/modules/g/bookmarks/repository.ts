// مستودع الروابط المحفوظة فوق Store، على نمط مستودع الملاحظات: ذاكرة مؤقتة متزامنة تتبع أحداث التغيّر من كل السياقات (زر الصفحة
// واللوحة وتبويب آخر)، وسجل لكل رابط. سجل غير صالح في التخزين يُهمل في العرض ويبقى كما هو (قد يكون من نسخة أحدث).
// MJ-TA-03: الخلفية الكاتب الوحيد لسجلات bookmarks.* كما للملاحظات (AD-25): كل سياق آخر يمرّر writer فيُرسل الإنشاء والتعديل والحذف إلى
// NotesBroker، فيتوالى في طابوره الواحد مع الحذف والاستيراد؛ فلا يدهس تعديلٌ تعديلًا من نافذة أخرى، ولا يعيد تعديلٌ متأخر رابطًا حُذف. والمسار
// المباشر (بلا writer) للخلفية نفسها ولاختبارات الوحدة.
import type { Store } from '../../../core/storage';
import { BOOKMARK_PREFIX, BOOKMARK_SCHEMA_VERSION, MAX_QUICK_NOTE_LENGTH, MAX_TITLE_LENGTH, bookmarkRecordName, isBookmark, pageKey, parseTags } from './types';
import type { Bookmark, BookmarkDraft, BookmarkPatch } from './types';

export class BookmarkNotFoundError extends Error {
  constructor(readonly id: string) {
    super('الرابط المحفوظ غير موجود؛ ربما أُزيل من نافذة أخرى');
    this.name = 'BookmarkNotFoundError';
  }
}

export class BookmarkInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BookmarkInputError';
  }
}

/** ما يحتاجه المستودع ليكتب عبر الخلفية (runtimeNotesWriter يحققه). */
export interface BookmarksWriter {
  createBookmark(draft: BookmarkDraft): Promise<Bookmark>;
  updateBookmark(id: string, patch: BookmarkPatch): Promise<Bookmark>;
  removeBookmark(id: string): Promise<void>;
}

export interface BookmarksRepositoryOptions {
  readonly now?: () => Date;
  readonly newId?: () => string;
  /** خارج الخلفية: الكتابة عبرها وحدها (MJ-TA-03). */
  readonly writer?: BookmarksWriter;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function randomId(): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  return uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function checkNote(note: string): string {
  const trimmed = note.trim();
  if (trimmed.length > MAX_QUICK_NOTE_LENGTH) throw new BookmarkInputError(`الملاحظة السريعة أطول من الحد (${MAX_QUICK_NOTE_LENGTH} حرف)`);
  return trimmed;
}

const cleanTitle = (title: string | null | undefined): string | null => {
  const trimmed = title?.replace(/\s+/g, ' ').trim() ?? '';
  return trimmed ? trimmed.slice(0, MAX_TITLE_LENGTH) : null;
};

export class BookmarksRepository {
  private readonly bookmarks = new Map<string, Bookmark>();
  private readonly listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly writer: BookmarksWriter | null;

  private constructor(
    private readonly store: Store,
    options: BookmarksRepositoryOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomId;
    this.writer = options.writer ?? null;
  }

  static async open(store: Store, options: BookmarksRepositoryOptions = {}): Promise<BookmarksRepository> {
    const repository = new BookmarksRepository(store, options);
    for (const [name, value] of Object.entries(await store.readPrefix(BOOKMARK_PREFIX))) repository.accept(name, value);
    repository.unsubscribe = store.subscribePrefix(BOOKMARK_PREFIX, (name, value) => repository.receive(name, value));
    return repository;
  }

  /** كل الروابط، الأحدث حفظًا أولًا. */
  list(): Bookmark[] {
    return [...this.bookmarks.values()].sort((a, b) => (a.savedAt === b.savedAt ? b.id.localeCompare(a.id) : b.savedAt.localeCompare(a.savedAt)));
  }

  get(id: string): Bookmark | undefined {
    return this.bookmarks.get(id);
  }

  /** الرابط المحفوظ لهذه الصفحة (بلا الهاش)، أو undefined. */
  findByPage(url: string): Bookmark | undefined {
    const key = pageKey(url);
    let found: Bookmark | undefined;
    for (const bookmark of this.bookmarks.values()) {
      if (pageKey(bookmark.url) === key && (!found || bookmark.savedAt > found.savedAt)) found = bookmark;
    }
    return found;
  }

  get size(): number {
    return this.bookmarks.size;
  }

  async create(draft: BookmarkDraft): Promise<Bookmark> {
    if (this.writer) {
      const created = await this.writer.createBookmark(draft);
      this.apply(created.id, created);
      return created;
    }
    const stamp = this.now().toISOString();
    const bookmark: Bookmark = {
      id: this.newId(),
      version: BOOKMARK_SCHEMA_VERSION,
      url: draft.url,
      title: cleanTitle(draft.title),
      owner: draft.owner,
      repo: draft.repo,
      branch: draft.branch,
      refKind: draft.refKind,
      level: draft.level,
      position: draft.position,
      status: draft.status ?? 'reading',
      tags: parseTags(draft.tags ?? []),
      note: checkNote(draft.note ?? ''),
      savedAt: stamp,
      updatedAt: stamp,
    };
    if (!isBookmark(bookmark)) throw new BookmarkInputError('رابط غير صالح للحفظ: يُحفظ ما في github.com وحده');
    await this.store.write(bookmarkRecordName(bookmark.id), bookmark);
    this.apply(bookmark.id, bookmark);
    return bookmark;
  }

  async update(id: string, patch: BookmarkPatch): Promise<Bookmark> {
    const note = patch.note === undefined ? undefined : checkNote(patch.note);
    if (this.writer) {
      const updated = await this.writer.updateBookmark(id, patch);
      this.apply(id, updated);
      return updated;
    }
    const next = await this.store.update<Bookmark | null>(bookmarkRecordName(id), null, (current) => {
      if (!current) throw new BookmarkNotFoundError(id);
      const merged: Bookmark = {
        ...current,
        ...(patch.status === undefined ? {} : { status: patch.status }),
        ...(patch.tags === undefined ? {} : { tags: parseTags(patch.tags) }),
        ...(note === undefined ? {} : { note }),
        ...(patch.title === undefined ? {} : { title: cleanTitle(patch.title) }),
        ...(patch.position === undefined ? {} : { position: patch.position }),
        ...(patch.branch === undefined ? {} : { branch: patch.branch }),
        updatedAt: this.now().toISOString(),
      };
      if (!isBookmark(merged)) throw new BookmarkInputError('تعديل غير صالح للرابط المحفوظ');
      return merged;
    });
    if (!next) throw new BookmarkNotFoundError(id);
    this.apply(id, next);
    return next;
  }

  async remove(id: string): Promise<void> {
    if (this.writer) await this.writer.removeBookmark(id);
    else await this.store.remove(bookmarkRecordName(id));
    this.apply(id, undefined);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listeners.clear();
  }

  private accept(name: string, value: unknown): void {
    if (isBookmark(value) && bookmarkRecordName(value.id) === name) this.bookmarks.set(value.id, value);
  }

  private receive(name: string, value: unknown): void {
    const id = name.slice(BOOKMARK_PREFIX.length);
    this.apply(id, value === undefined ? undefined : isBookmark(value) && value.id === id ? value : undefined);
  }

  private apply(id: string, bookmark: Bookmark | undefined): void {
    const before = this.bookmarks.get(id);
    if (bookmark === undefined) this.bookmarks.delete(id);
    else this.bookmarks.set(id, bookmark);
    if (same(before, bookmark)) return;
    for (const listener of [...this.listeners]) listener();
  }
}

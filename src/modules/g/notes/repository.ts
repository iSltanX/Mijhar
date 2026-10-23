// مستودع الملاحظات فوق Store: ذاكرة مؤقتة متزامنة تتبع أحداث التغيّر من كل السياقات (علامة في الصفحة ولوحة وتبويب آخر)،
// وكتابة سجل لكل ملاحظة. سجل غير صالح في التخزين يُهمل في العرض ويبقى كما هو (قد يكون من نسخة أحدث).
// الكتابة بين السياقات تمر بالخلفية (VR-01): السياق الذي يُعطى writer يرسل إليها حقول التعديل، والخلفية وحدها تكتب بالمسار
// المباشر (بلا writer) في طابور واحد. والمسار المباشر لا يضمن شيئًا بين مخزنين في سياقين؛ هو للخلفية ولاختبارات الوحدة.
import type { Store } from '../../../core/storage';
import { anchorRecordName } from '../anchor/types';
import { MAX_NOTE_LENGTH, NOTE_PREFIX, NOTE_SCHEMA_VERSION, isNote, noteRecordName } from './types';
import type { AnchorStatus, LineTarget, Note, NoteDraft, NotePatch, NoteTarget } from './types';
import type { NotesWriter } from './writer';

export class NoteTextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoteTextError';
  }
}

export class NoteNotFoundError extends Error {
  constructor(readonly id: string) {
    super('الملاحظة غير موجودة؛ ربما حُذفت من نافذة أخرى');
    this.name = 'NoteNotFoundError';
  }
}

export interface NotesRepositoryOptions {
  readonly now?: () => Date;
  readonly newId?: () => string;
  /** كاتب الخلفية (runtimeNotesWriter): الإنشاء والتعديل والحذف رسائل إليها. بلا writer يكتب المستودع في مخزنه مباشرة. */
  readonly writer?: NotesWriter;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

function randomId(): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  return uuid ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** النص بعد التهذيب (حذف الفراغ الطرفي)، أو خطأ إن كان فارغًا أو أطول من السقف. */
export function checkNoteText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new NoteTextError('اكتب نص الملاحظة أولًا');
  if (trimmed.length > MAX_NOTE_LENGTH) throw new NoteTextError(`الملاحظة أطول من الحد (${MAX_NOTE_LENGTH} حرف)`);
  return trimmed;
}

/** الهدف الجديد سطر في الموضع نفسه (المستودع والمسار والمرجع أو سياق الفروق)، ولا يختلف إلا في الأسطر. */
function sameLineHome(current: NoteTarget, next: LineTarget): boolean {
  if (current.level !== 'line' || next.level !== 'line' || current.owner !== next.owner || current.repo !== next.repo || current.path !== next.path) return false;
  if (current.view === 'blob') return next.view === 'blob' && current.ref === next.ref && current.refKind === next.refKind;
  if (next.view !== 'diff' || current.side !== next.side || current.context.kind !== next.context.kind) return false;
  return current.context.kind === 'pr' ? next.context.kind === 'pr' && current.context.number === next.context.number : next.context.kind === 'commit' && current.context.sha === next.context.sha;
}

export function defaultAnchorStatus(draft: Pick<NoteDraft, 'target'>): AnchorStatus {
  return draft.target.level === 'line' ? 'unverified' : 'not-applicable';
}

export class NotesRepository {
  private readonly notes = new Map<string, Note>();
  private readonly listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly writer: NotesWriter | null;

  private constructor(
    private readonly store: Store,
    options: NotesRepositoryOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomId;
    this.writer = options.writer ?? null;
  }

  static async open(store: Store, options: NotesRepositoryOptions = {}): Promise<NotesRepository> {
    const repository = new NotesRepository(store, options);
    for (const [name, value] of Object.entries(await store.readPrefix(NOTE_PREFIX))) repository.accept(name, value);
    repository.unsubscribe = store.subscribePrefix(NOTE_PREFIX, (name, value) => repository.receive(name, value));
    return repository;
  }

  /** كل الملاحظات، الأحدث تعديلًا أولًا. */
  list(): Note[] {
    return [...this.notes.values()].sort((a, b) => (a.updatedAt === b.updatedAt ? b.id.localeCompare(a.id) : b.updatedAt.localeCompare(a.updatedAt)));
  }

  get(id: string): Note | undefined {
    return this.notes.get(id);
  }

  get size(): number {
    return this.notes.size;
  }

  async create(draft: NoteDraft): Promise<Note> {
    const text = checkNoteText(draft.text);
    if (this.writer) return this.accepted(await this.writer.createNote(draft));
    const stamp = this.now().toISOString();
    const note: Note = {
      id: this.newId(),
      version: NOTE_SCHEMA_VERSION,
      target: draft.target,
      text,
      anchorStatus: draft.anchorStatus ?? defaultAnchorStatus(draft),
      createdAt: stamp,
      updatedAt: stamp,
      url: draft.url,
      title: draft.title ?? null,
    };
    if (!isNote(note)) throw new Error('ملاحظة غير صالحة: هدف أو حالة مرساة خارج المخطط');
    await this.store.write(noteRecordName(note.id), note);
    this.apply(note.id, note);
    return note;
  }

  /** يعدّل النص وحالة المرساة وموضع السطر كلًّا على حدة: تعديل أحدها لا يمس غيره. */
  async update(id: string, patch: NotePatch): Promise<Note> {
    const text = patch.text === undefined ? undefined : checkNoteText(patch.text);
    if (this.writer) return this.accepted(await this.writer.updateNote(id, patch));
    const next = await this.store.update<Note | null>(noteRecordName(id), null, (current) => {
      if (!current) throw new NoteNotFoundError(id);
      if (patch.target !== undefined && !sameLineHome(current.target, patch.target)) throw new Error('نقل الملاحظة يغيّر أسطرها وحدها في ملفها نفسه');
      const merged: Note = {
        ...current,
        ...(text === undefined ? {} : { text }),
        ...(patch.anchorStatus === undefined ? {} : { anchorStatus: patch.anchorStatus }),
        ...(patch.target === undefined ? {} : { target: patch.target }),
        updatedAt: this.now().toISOString(),
      };
      if (!isNote(merged)) throw new Error('تعديل غير صالح للملاحظة');
      return merged;
    });
    if (!next) throw new NoteNotFoundError(id);
    this.apply(id, next);
    return next;
  }

  /** يحذف الملاحظة ومرساتها (anchors.<id>) معًا في كتابة واحدة، فلا تبقى بصمة سطر بعد حذف صاحبها أيًّا كانت الواجهة (VR-04). */
  async remove(id: string): Promise<void> {
    if (this.writer) await this.writer.removeNote(id);
    else await this.store.removeMany([noteRecordName(id), anchorRecordName(id)]);
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

  // ما أعادته الخلفية يُطبَّق على الذاكرة المؤقتة فورًا (وحدث التغيّر يصل بعده بالقيمة نفسها).
  private accepted(note: Note): Note {
    if (!isNote(note)) throw new Error('ردّ غير صالح من خلفية الإضافة');
    this.apply(note.id, note);
    return note;
  }

  private accept(name: string, value: unknown): void {
    if (isNote(value) && noteRecordName(value.id) === name) this.notes.set(value.id, value);
  }

  private receive(name: string, value: unknown): void {
    const id = name.slice(NOTE_PREFIX.length);
    this.apply(id, value === undefined ? undefined : isNote(value) && value.id === id ? value : undefined);
  }

  // undefined = حذف الملاحظة من العرض (سجل محذوف أو غير صالح).
  private apply(id: string, note: Note | undefined): void {
    const before = this.notes.get(id);
    if (note === undefined) this.notes.delete(id);
    else this.notes.set(id, note);
    if (same(before, note)) return;
    for (const listener of [...this.listeners]) listener();
  }
}

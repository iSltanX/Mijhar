// وسيط كتابة الملاحظات والمراسي في الخلفية (VR-01): الخلفية سياق واحد يملك مخزنًا واحدًا، فتنفّذ كل رسائل الكتابة من كل السياقات
// في طابور واحد على مستودعي الملاحظات والمراسي المباشرين فوق مخزنها. كل عملية تعيد قراءة السجل الحالي وتتحقق منه بمنطق المستودعين
// نفسه (checkNoteText وsameLineHome وisNote وisLineAnchor)؛ فلا يدهس تعديل من سياق تعديلًا من آخر، ولا يعيد تعديل متأخر ملاحظة
// حُذفت، ولا تُحفظ مرساة لملاحظة لم يعد سجلها موجودًا. المسار المباشر (المستودعان بلا كاتب) للخلفية نفسها ولاختبارات الوحدة.
import type { Store } from '../../../core/storage';
import { AnchorStore } from '../anchor/store';
import { NoteNotFoundError, NotesRepository } from './repository';
import type { NotesRepositoryOptions } from './repository';
import { isNote, noteRecordName } from './types';
import { parseNotesWriteRequest } from './writer';
import type { NotesWriteRequest, NotesWriteResponse } from './writer';

export interface NotesBrokerParts {
  readonly store: Store;
  readonly notes: NotesRepository;
  readonly anchors: AnchorStore;
}

const failure = (error: unknown): NotesWriteResponse => {
  const e = error instanceof Error ? error : new Error(String(error));
  return { ok: false, error: { name: e.name, message: e.message, ...(e instanceof NoteNotFoundError ? { id: e.id } : {}) } };
};

export class NotesBroker {
  private queue: Promise<unknown> = Promise.resolve();
  private parts: Promise<NotesBrokerParts> | null = null;

  constructor(private readonly open: () => Promise<NotesBrokerParts>) {}

  /** وسيط على مخزن الخلفية؛ يفتح المستودعين المباشرين عند أول عملية. */
  static forStore(store: Store, options: NotesRepositoryOptions = {}): NotesBroker {
    return new NotesBroker(() => openParts(store, options));
  }

  /** يعالج رسالة كتابة من أي سياق. لا يرمي: الرسالة غير الصالحة والرفض نتيجة {ok: false}. */
  handle(message: unknown): Promise<NotesWriteResponse> {
    const request = parseNotesWriteRequest(message);
    if (!request) return Promise.resolve(failure(new Error('رسالة كتابة غير صالحة للملاحظات')));
    return this.serial((parts) => this.run(request, parts)).then((value) => ({ ok: true, ...(value === undefined ? {} : { value }) }), failure);
  }

  /** يزيل مراسي الملاحظات المحذوفة (استرداد): تستدعيه الخلفية مرة بعد فتح التخزين. */
  pruneOrphans(): Promise<number> {
    return this.serial(({ anchors }) => anchors.pruneOrphans());
  }

  private async run(request: NotesWriteRequest, { store, notes, anchors }: NotesBrokerParts): Promise<unknown> {
    switch (request.op) {
      case 'note-create':
        return notes.create(request.draft);
      case 'note-update':
        return notes.update(request.id, request.patch);
      case 'note-remove':
        return notes.remove(request.id);
      case 'anchor-save': {
        const id = request.anchor.noteId;
        const note = await store.read<unknown>(noteRecordName(id), null);
        if (!isNote(note) || note.id !== id) throw new NoteNotFoundError(id);
        return anchors.save(request.anchor);
      }
      case 'anchor-prune':
        return anchors.pruneOrphans();
    }
  }

  // طابور واحد: العملية تبدأ بعد اكتمال سابقتها كلها (قراءة السجل ثم كتابته)، أيًّا كان السياق المرسل.
  private serial<T>(task: (parts: NotesBrokerParts) => Promise<T>): Promise<T> {
    const run = this.queue.then(() => this.ready()).then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private ready(): Promise<NotesBrokerParts> {
    this.parts ??= this.open().catch((error: unknown) => {
      this.parts = null;
      throw error;
    });
    return this.parts;
  }
}

/** المستودعان المباشران فوق مخزن الخلفية. */
export async function openParts(store: Store, options: NotesRepositoryOptions = {}): Promise<NotesBrokerParts> {
  const [notes, anchors] = await Promise.all([NotesRepository.open(store, options), AnchorStore.open(store)]);
  return { store, notes, anchors };
}

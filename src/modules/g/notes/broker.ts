// وسيط كتابة الملاحظات والمراسي في الخلفية (VR-01): الخلفية سياق واحد يملك مخزنًا واحدًا، فتنفّذ كل رسائل الكتابة من كل السياقات
// في طابور واحد على مستودعي الملاحظات والمراسي المباشرين فوق مخزنها. كل عملية تعيد قراءة السجل الحالي وتتحقق منه بمنطق المستودعين
// نفسه (checkNoteText وsameLineHome وisNote وisLineAnchor)؛ فلا يدهس تعديل من سياق تعديلًا من آخر، ولا يعيد تعديل متأخر ملاحظة
// حُذفت، ولا تُحفظ مرساة لملاحظة لم يعد سجلها موجودًا. المسار المباشر (المستودعان بلا كاتب) للخلفية نفسها ولاختبارات الوحدة.
import type { Store } from '../../../core/storage';
import { AnchorStore } from '../anchor/store';
import { BookmarkNotFoundError, BookmarksRepository } from '../bookmarks/repository';
import { DataImportError, NoBackupError } from '../export/errors';
import { parseBundle } from '../export/format';
import { BACKUP_NAME, planDelete, planImport, pruneBundle, snapshotBundle } from '../export/plan';
import type { DeleteCounts, DeleteScope, ImportMode, ImportPlan, ImportSummary } from '../export/plan';
import { BACKUP_VERSION, parseBackup, readBackup, readSnapshot } from '../export/snapshot';
import type { ImportBackup } from '../export/snapshot';
import { NoteNotFoundError, NotesRepository } from './repository';
import type { NotesRepositoryOptions } from './repository';
import { isNote, noteRecordName } from './types';
import { parseNotesWriteRequest } from './writer';
import type { NotesWriteRequest, NotesWriteResponse } from './writer';

export interface NotesBrokerParts {
  readonly store: Store;
  readonly notes: NotesRepository;
  readonly anchors: AnchorStore;
  /** MJ-TA-03: مستودع الروابط المباشر؛ الخلفية كاتبه الوحيد. */
  readonly bookmarks: BookmarksRepository;
}

const failure = (error: unknown): NotesWriteResponse => {
  const e = error instanceof Error ? error : new Error(String(error));
  return { ok: false, error: { name: e.name, message: e.message, ...(e instanceof NoteNotFoundError || e instanceof BookmarkNotFoundError ? { id: e.id } : {}) } };
};

export class NotesBroker {
  private queue: Promise<unknown> = Promise.resolve();
  private parts: Promise<NotesBrokerParts> | null = null;

  constructor(
    private readonly open: () => Promise<NotesBrokerParts>,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** وسيط على مخزن الخلفية؛ يفتح المستودعين المباشرين عند أول عملية. */
  static forStore(store: Store, options: NotesRepositoryOptions = {}): NotesBroker {
    return new NotesBroker(() => openParts(store, options), options.now);
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

  private async run(request: NotesWriteRequest, { store, notes, anchors, bookmarks }: NotesBrokerParts): Promise<unknown> {
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
      case 'salt-ensure':
        return anchors.ensureSalt(this.now);
      case 'data-import':
        return this.importContent(store, request.content, request.mode);
      case 'data-delete':
        return this.deleteScope(store, request.scope);
      case 'data-restore':
        return this.restoreLast(store);
      // MJ-TA-03: يُقرأ الرابط الحالي ويُتحقق من وجوده داخل الطابور، فلا يعيد تعديلٌ متأخر رابطًا حُذف.
      case 'bookmark-create':
        return bookmarks.create(request.draft);
      case 'bookmark-update':
        return bookmarks.update(request.id, request.patch);
      case 'bookmark-remove':
        return bookmarks.remove(request.id);
    }
  }

  // ---------- البيانات: استيراد وحذف واستعادة (T-8.4، AD-25) ----------
  // كلها داخل طابور الوسيط نفسه: لا يتداخل استيراد أو حذف مع تعديل ملاحظة من صفحة أو لوحة، فلا يضيع تعديل ولا تعود ملاحظة محذوفة.
  // الخطة تُحسب هنا من حالة الخلفية الآن (readSnapshot) لا مما يحسبه المرسل، والملف يُفحص هنا كاملًا قبل أي كتابة.

  private async importContent(store: Store, content: unknown, mode: ImportMode): Promise<ImportSummary> {
    const parsed = parseBundle(content);
    if (!parsed.ok) throw new DataImportError(parsed.errors);
    const current = await readSnapshot(store);
    const plan = planImport(current, parsed.bundle, mode);
    if (!plan.writes.length && !plan.removes.length) return plan.summary;
    // نسخة احتياطية قبل أي كتابة: فشلها (حصة ممتلئة مثلًا) يوقف الاستيراد قبل المساس بشيء.
    const backup: ImportBackup = { version: BACKUP_VERSION, createdAt: this.now().toISOString(), mode, bundle: snapshotBundle(current, this.now) };
    await store.write(BACKUP_NAME, backup);
    try {
      await applyPlan(store, plan);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      try {
        await applyPlan(store, planImport(await readSnapshot(store), backup.bundle, 'replace', { exactSalt: true }));
      } catch {
        throw new Error(`فشل الاستيراد وتعذّر إرجاع بياناتك تلقائيًا؛ النسخة الاحتياطية محفوظة فاستعدها من الأداة: ${reason}`);
      }
      throw new Error(`فشل الاستيراد وأُعيدت بياناتك كما كانت: ${reason}`);
    }
    return plan.summary;
  }

  private async deleteScope(store: Store, scope: DeleteScope): Promise<DeleteCounts> {
    const plan = planDelete(await readSnapshot(store), scope);
    // سجلات الملاحظة والمرساة (والرابط) في استدعاء واحد للمنطقة، فلا تبقى بصمة سطر بعد حذف صاحبها.
    if (plan.removes.length) await store.removeMany([...plan.removes]);
    // نسخة الاستيراد الاحتياطية تحوي نسخًا من السجلات المحذوفة: تُنقّى منها أو تُحذف، فلا يترك الحذف نصًّا خلفه على جهاز مشترك.
    const raw = await store.read<unknown>(BACKUP_NAME, null);
    if (raw !== null) {
      const backup = parseBackup(raw);
      const pruned = backup ? pruneBundle(backup.bundle, scope) : null;
      if (backup && pruned) await store.write(BACKUP_NAME, { ...backup, bundle: pruned });
      else await store.remove(BACKUP_NAME);
    }
    return plan.counts;
  }

  private async restoreLast(store: Store): Promise<ImportSummary> {
    const backup = await readBackup(store);
    if (!backup) throw new NoBackupError();
    const plan = planImport(await readSnapshot(store), backup.bundle, 'replace', { exactSalt: true });
    await applyPlan(store, plan);
    await store.remove(BACKUP_NAME);
    return plan.summary;
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

/** يكتب الخطة: السجلات بترتيبها (ملاحظة قبل مرساتها) ثم الحذف في استدعاء واحد، فانقطاع في منتصفها يترك مجموعًا أعلى لا ناقصًا. */
async function applyPlan(store: Store, plan: ImportPlan): Promise<void> {
  for (const { name, value } of plan.writes) await store.write(name, value);
  if (plan.removes.length) await store.removeMany([...plan.removes]);
}

/** المستودعان المباشران فوق مخزن الخلفية. */
export async function openParts(store: Store, options: NotesRepositoryOptions = {}): Promise<NotesBrokerParts> {
  const [notes, anchors, bookmarks] = await Promise.all([NotesRepository.open(store, options), AnchorStore.open(store), BookmarksRepository.open(store, options.now ? { now: options.now } : {})]);
  return { store, notes, anchors, bookmarks };
}

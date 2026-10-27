// تخزين المراسي والملح المحلي فوق Store. المرساة سجل لكل ملاحظة (anchors.<noteId>)، والملح سجل واحد (anchor-salt) يُنشأ عند أول
// بصمة لمستودع خاص ولا يغادر الجهاز إلا بتصدير يختاره المستخدم (T-8.4). مرساة ملاحظة حُذفت تُزال مع الملاحظة نفسها (VR-04)،
// والتنظيف (pruneOrphans) استرداد لما بقي. حفظ المراسي وإزالتها يمر بالخلفية حين يُعطى المخزن writer (VR-01).
import type { Store } from '../../../core/storage';
import { NOTE_PREFIX } from '../notes/types';
import type { NotesWriter } from '../notes/writer';
import { newSalt } from './fingerprint';
import { ANCHOR_PREFIX, SALT_RECORD, anchorRecordName, isLineAnchor } from './types';
import type { LineAnchor } from './types';

interface SaltRecord {
  readonly salt: string;
  readonly createdAt: string;
}

const isSaltRecord = (value: unknown): value is SaltRecord =>
  typeof value === 'object' && value !== null && typeof (value as SaltRecord).salt === 'string' && /^[0-9a-f]{64}$/.test((value as SaltRecord).salt);

export class AnchorStore {
  private readonly anchors = new Map<string, LineAnchor>();
  private readonly listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;

  private constructor(
    private readonly store: Store,
    private readonly writer: NotesWriter | null,
  ) {}

  /** writer: كاتب الخلفية (runtimeNotesWriter) في سكربت المحتوى وصفحات الإضافة؛ بلا writer يكتب في مخزنه مباشرة (الخلفية). */
  static async open(store: Store, options: { readonly writer?: NotesWriter } = {}): Promise<AnchorStore> {
    const anchors = new AnchorStore(store, options.writer ?? null);
    for (const [name, value] of Object.entries(await store.readPrefix(ANCHOR_PREFIX))) {
      if (isLineAnchor(value) && anchorRecordName(value.noteId) === name) anchors.anchors.set(value.noteId, value);
    }
    anchors.unsubscribe = store.subscribePrefix(ANCHOR_PREFIX, (name, value) => {
      const id = name.slice(ANCHOR_PREFIX.length);
      if (isLineAnchor(value) && value.noteId === id) anchors.anchors.set(id, value);
      else anchors.anchors.delete(id);
      for (const listener of [...anchors.listeners]) listener();
    });
    return anchors;
  }

  get(noteId: string): LineAnchor | undefined {
    return this.anchors.get(noteId);
  }

  /** يحفظ المرساة؛ عبر الخلفية ترفضها إن لم يعد سجل ملاحظتها موجودًا. */
  async save(anchor: LineAnchor): Promise<void> {
    if (!isLineAnchor(anchor)) throw new Error('مرساة غير صالحة');
    if (this.writer) await this.writer.saveAnchor(anchor);
    else await this.store.write(anchorRecordName(anchor.noteId), anchor);
    this.anchors.set(anchor.noteId, anchor);
  }

  private async remove(noteId: string): Promise<void> {
    if (!this.anchors.has(noteId)) return;
    await this.store.remove(anchorRecordName(noteId));
    this.anchors.delete(noteId);
  }

  /** يزيل مراسي الملاحظات غير الموجودة. */
  private async prune(existing: ReadonlySet<string>): Promise<number> {
    const stale = [...this.anchors.keys()].filter((id) => !existing.has(id));
    for (const id of stale) await this.remove(id);
    return stale.length;
  }

  /**
   * يزيل مراسي الملاحظات التي لا سجل لها في التخزين. يقارن بالسجلات لا بقائمة الملاحظات الصالحة: سجل ملاحظة من نسخة أحدث يُهمل في
   * العرض ويبقى، فتبقى مرساته معه. عبر الخلفية تقرر هي ما يُزال في طابورها، فلا تُزال مرساة ملاحظة أُنشئت للتو في سياق آخر.
   */
  async pruneOrphans(): Promise<number> {
    if (this.writer) return this.writer.pruneAnchors();
    const names = Object.keys(await this.store.readPrefix(NOTE_PREFIX));
    return this.prune(new Set(names.map((name) => name.slice(NOTE_PREFIX.length))));
  }

  /** الملح المحلي، أو null إن لم يُنشأ بعد. */
  async salt(): Promise<string | null> {
    const record = await this.store.read<unknown>(SALT_RECORD, null);
    return isSaltRecord(record) ? record.salt : null;
  }

  /** الملح المحلي، يُنشأ عند أول حاجة؛ وعبر الخلفية تنشئه هي في طابورها فلا يُنشئ سياقان ملحين (CODEX-007). */
  async ensureSalt(now: () => Date = () => new Date()): Promise<string> {
    if (this.writer) return this.writer.ensureSalt();
    const record = await this.store.update<unknown>(SALT_RECORD, null, (current) => (isSaltRecord(current) ? current : { salt: newSalt(), createdAt: now().toISOString() }));
    if (!isSaltRecord(record)) throw new Error('تعذّر إنشاء الملح المحلي');
    return record.salt;
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
}

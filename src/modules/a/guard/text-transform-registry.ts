// TextTransformRegistry: المحرك المشترك لتحويلات عقد النص في الوحدة (أ) (T-2.7، F-A7)، ويستعمله إخفاء التشكيل (T-2.5) وتحويل
// الأرقام (T-2.6). نص العرض = تركيب التحويلات المطبقة بترتيب تسجيلها على النص الأصلي، فتتعايش تحويلات عدة على العقدة نفسها دون
// أن يرى بعضها كتابة بعض خارجية.
//
// حارس ملكية الكتابة (EXECUTION_PLAN.md ‏3.أ البند 5، AC-A7 بند 3):
//  - كل كتابة للمحرك على عقدة تُسجَّل (القيمة قبلها وبعدها ورقم توليدي)، ويراقب MutationObserver الحاوية (characterData بقيمه
//    السابقة وchildList وsubtree). سجل characterData يقابل أقدم كتابة ذاتية معلّقة بترتيبه، وتُفحص قيمته السابقة مقابل تسلسلها؛
//    وكل سجل زائد أو مخالف كتابة خارجية تلوّث العقدة. فالملكية من سجل الكتابات، والمساواة بالنص فحص إضافي لا دليل.
//  - إزالة العقدة أو أحد أسلافها تلوّثها ولو أُعيدت (نقل أو استبدال)؛ والعقدة البديلة جديدة لم يمسها المحرك.
//  - قبل أي كتابة أو استعادة أو تعطيل يُفرَّغ observer.takeRecords() وتُعالَج السجلات المعلقة أولًا.
//  - لا يُكتب على عقدة إلا إن كانت متصلة وداخل الحاوية، وسجلها هو المسجَّل لها من جلسة المحرك نفسها، وغير ملوّثة، وآخر رقم
//    توليدي كتبته أكّده المراقب، ونصها يساوي آخر ما كُتب. وعند الشك يُترك النص ويُعتمد ما كتبه GitHub، ويُسرد في التقرير برقم
//    من «استثناءات استعادة النصوص» (exceptions.ts). الحارس يقلل خطر الكتابة فوق GitHub ولا يُدّعى أنه يستبعده.
import type { TextRestoreExceptionId } from './exceptions';

export interface TextTransform {
  /** معرّف ثابت فريد داخل المحرك. */
  readonly id: string;
  /** دالة نقية حتمية: نص العرض بعد هذا التحويل لنص مدخل. */
  apply(text: string): string;
}

export interface TextRestoreSkip {
  readonly exception: TextRestoreExceptionId;
  /** التحويلات التي كانت مطبقة على العقدة وقت الترك. */
  readonly transforms: readonly string[];
  readonly detail: string;
}

export interface TextRestoreReport {
  /** التحويلات التي طُلبت إزالتها. */
  readonly transforms: readonly string[];
  /** عقد أُعيدت إلى نصها الأصلي. */
  readonly restored: number;
  /** عقد أُعيد عرضها بالتحويلات الباقية عليها. */
  readonly rewritten: number;
  readonly skipped: readonly TextRestoreSkip[];
  readonly durationMs: number;
}

/** لقطة للقراءة فقط من سجل عقدة (للاختبار والتشخيص). */
export interface TextNodeState {
  readonly original: string;
  readonly display: string;
  readonly applied: readonly string[];
  readonly generation: number;
  readonly confirmed: number;
  readonly pending: number;
  readonly dirty: TextRestoreExceptionId | null;
}

export interface TextTransformRegistryOptions {
  /** الحاوية المراقَبة؛ لا يكتب المحرك على عقدة خارجها. */
  readonly root: Node;
  readonly now?: () => number;
}

interface OwnWrite {
  readonly before: string;
  readonly generation: number;
}

interface NodeRecord {
  readonly node: Text;
  readonly epoch: number;
  /** نص الأصل؛ وبعد التلوث نص GitHub المعتمد (للتقرير فقط: لا كتابة بعده). */
  original: string;
  /** آخر قيمة كتبها المحرك. */
  display: string;
  applied: string[];
  /** رقم آخر كتابة ذاتية. */
  generation: number;
  /** آخر رقم أكّده المراقب. */
  confirmed: number;
  readonly pending: OwnWrite[];
  dirty: TextRestoreExceptionId | null;
  detail: string;
}

interface Verdict {
  readonly exception: TextRestoreExceptionId;
  readonly detail: string;
}

const TEXT_NODE = 3;

export class TextTransformRegistry {
  private readonly root: Node;
  private readonly now: () => number;
  private readonly transforms = new Map<string, { readonly transform: TextTransform; readonly order: number }>();
  private readonly records = new Map<Text, NodeRecord>();
  private observer: MutationObserver | null = null;
  private epoch = 1;
  private disposed = false;
  private ownWrites = 0;
  private foreignWrites = 0;

  constructor(options: TextTransformRegistryOptions) {
    this.root = options.root;
    this.now = options.now ?? (() => globalThis.performance.now());
  }

  /** عدد العقد التي يملك المحرك نصها الآن. */
  get size(): number {
    return this.records.size;
  }

  get counters(): { readonly ownWrites: number; readonly foreignWrites: number } {
    return { ownWrites: this.ownWrites, foreignWrites: this.foreignWrites };
  }

  /** يعرّف تحويلًا؛ ترتيب التعريف هو ترتيب التركيب. */
  register(transform: TextTransform): void {
    this.assertOpen();
    if (!transform.id) throw new Error('TextTransform بلا id');
    if (this.transforms.has(transform.id)) throw new Error(`تحويل مكرر: ${transform.id}`);
    this.transforms.set(transform.id, { transform, order: this.transforms.size });
  }

  has(transformId: string): boolean {
    return this.transforms.has(transformId);
  }

  /** يطبّق التحويل على العقد المعطاة ويعيد عدد ما كُتب. عقدة لمسها طرف آخر أو خارج الحاوية لا تُكتب. */
  apply(transformId: string, nodes: Iterable<Node>): number {
    this.assertOpen();
    if (!this.transforms.has(transformId)) throw new Error(`تحويل غير معرَّف: ${transformId}`);
    this.flush();
    this.ensureObserver();
    let written = 0;
    for (const node of nodes) {
      if (node.nodeType !== TEXT_NODE || !node.isConnected || !this.root.contains(node)) continue;
      const text = node as Text;
      const existing = this.records.get(text);
      if (existing) {
        if (existing.applied.includes(transformId)) continue;
        // كتابة جديدة على عقدة مملوكة تمر بالحارس نفسه: لا كتابة فوق ما لم نكتبه.
        if (this.check(existing)) continue;
      }
      const original = existing ? existing.original : text.data;
      const applied = this.ordered([...(existing?.applied ?? []), transformId]);
      let next: string;
      try {
        next = this.compose(original, applied);
      } catch {
        continue;
      }
      let record = existing;
      if (!record) {
        if (next === text.data) continue; // التحويل لا يغيّر هذه العقدة
        record = { node: text, epoch: this.epoch, original, display: original, applied: [], generation: 0, confirmed: 0, pending: [], dirty: null, detail: '' };
        this.records.set(text, record);
      }
      record.applied = applied;
      if (next !== record.display) {
        this.write(record, next);
        written += 1;
      }
    }
    return written;
  }

  /** يزيل التحويل من كل عقدة طُبّق عليها، بشروط الحارس. */
  remove(transformId: string): TextRestoreReport {
    const started = this.now();
    const report = this.emptyReport([transformId]);
    if (this.disposed) return { ...report, durationMs: 0 };
    this.flush();
    for (const record of [...this.records.values()]) {
      if (record.applied.includes(transformId)) this.settle(record, record.applied.filter((id) => id !== transformId), report);
    }
    return { ...report, durationMs: this.now() - started };
  }

  /** يزيل كل التحويلات ويفصل المراقب. بعده لا يقبل المحرك كتابة. استدعاؤه ثانية يعيد تقريرًا فارغًا. */
  dispose(): TextRestoreReport {
    const started = this.now();
    const report = this.emptyReport([...this.transforms.keys()]);
    if (this.disposed) return { ...report, transforms: [], durationMs: 0 };
    this.flush();
    for (const record of [...this.records.values()]) this.settle(record, [], report);
    this.observer?.takeRecords();
    this.observer?.disconnect();
    this.observer = null;
    this.records.clear();
    this.epoch += 1;
    this.disposed = true;
    return { ...report, durationMs: this.now() - started };
  }

  /** يعالج سجلات المراقب المعلّقة الآن (takeRecords). */
  flush(): void {
    if (this.observer) this.handle(this.observer.takeRecords());
  }

  inspect(node: Node): TextNodeState | undefined {
    const record = this.records.get(node as Text);
    if (!record) return undefined;
    const { original, display, generation, confirmed, dirty } = record;
    return { original, display, applied: [...record.applied], generation, confirmed, pending: record.pending.length, dirty };
  }

  private emptyReport(transforms: string[]): { transforms: string[]; restored: number; rewritten: number; skipped: TextRestoreSkip[] } {
    return { transforms, restored: 0, rewritten: 0, skipped: [] };
  }

  // يعيد عرض العقدة بالتحويلات الباقية (أو أصلها إن لم يبقَ شيء) إن اجتازت الحارس، وإلا تُترك وتتحرر.
  private settle(record: NodeRecord, remaining: string[], report: ReturnType<TextTransformRegistry['emptyReport']>): void {
    const verdict = this.check(record);
    if (verdict) {
      report.skipped.push({ exception: verdict.exception, transforms: [...record.applied], detail: verdict.detail });
      this.records.delete(record.node);
      return;
    }
    let target: string;
    try {
      target = this.compose(record.original, remaining);
    } catch (error) {
      report.skipped.push({ exception: 'text-transform-threw', transforms: [...record.applied], detail: error instanceof Error ? error.message : String(error) });
      this.records.delete(record.node);
      return;
    }
    if (target !== record.display) this.write(record, target);
    if (remaining.length) {
      record.applied = remaining;
      report.rewritten += 1;
    } else {
      // سجل الكتابة الأخيرة يصل المراقب بعد الحذف فيُهمل: العقدة لم تعد ملك المحرك.
      this.records.delete(record.node);
      report.restored += 1;
    }
  }

  // شروط الحارس كلها؛ null = يجوز الكتابة. يُستدعى بعد flush().
  private check(record: NodeRecord): Verdict | null {
    const { node } = record;
    if (this.records.get(node) !== record || record.epoch !== this.epoch) {
      return { exception: 'text-stale-record', detail: 'السجل ليس المسجَّل لهذه العقدة في جلسة المحرك الحالية' };
    }
    if (record.dirty) return { exception: record.dirty, detail: record.detail };
    if (!node.isConnected || !this.root.contains(node)) return { exception: 'text-node-detached', detail: 'العقدة خارج المستند أو الحاوية المراقَبة' };
    if (record.pending.length || record.confirmed !== record.generation) {
      return { exception: 'text-unconfirmed-write', detail: `آخر كتابة ${record.generation} وآخر ما أكّده المراقب ${record.confirmed}` };
    }
    if (node.data !== record.display) return { exception: 'text-value-mismatch', detail: 'النص الحالي يخالف آخر ما كتبته الإضافة' };
    return null;
  }

  private write(record: NodeRecord, value: string): void {
    record.generation += 1;
    record.pending.push({ before: record.node.data, generation: record.generation });
    record.display = value;
    record.node.data = value;
    this.ownWrites += 1;
  }

  private handle(mutations: readonly MutationRecord[]): void {
    for (const mutation of mutations) {
      if (mutation.type === 'characterData') {
        const record = this.records.get(mutation.target as Text);
        if (!record || record.dirty) continue;
        const own = record.pending.shift();
        if (!own) this.taint(record, 'text-foreign-write', 'سجل characterData بلا كتابة ذاتية معلّقة');
        else if (mutation.oldValue !== own.before) this.taint(record, 'text-foreign-write', 'تسلسل السجلات يخالف كتابات الإضافة: كتابة خارجية تخللتها');
        else record.confirmed = own.generation;
      } else if (mutation.type === 'childList' && this.records.size) {
        for (const removed of mutation.removedNodes) this.taintRemoved(removed);
      }
    }
  }

  private taintRemoved(removed: Node): void {
    if (removed.nodeType === TEXT_NODE) {
      const record = this.records.get(removed as Text);
      if (record) this.taint(record, 'text-node-removed', 'أُزيلت العقدة من موضعها');
      return;
    }
    if (!removed.hasChildNodes()) return;
    for (const record of this.records.values()) {
      if (!record.dirty && removed.contains(record.node)) this.taint(record, 'text-node-removed', 'أُزيل أحد أسلاف العقدة من موضعه');
    }
  }

  private taint(record: NodeRecord, exception: TextRestoreExceptionId, detail: string): void {
    if (record.dirty) return;
    record.dirty = exception;
    record.detail = detail;
    record.original = record.node.data;
    record.pending.length = 0;
    if (exception === 'text-foreign-write') this.foreignWrites += 1;
  }

  private ordered(ids: string[]): string[] {
    return ids.sort((a, b) => (this.transforms.get(a)?.order ?? 0) - (this.transforms.get(b)?.order ?? 0));
  }

  private compose(original: string, applied: readonly string[]): string {
    let text = original;
    for (const id of applied) {
      const entry = this.transforms.get(id);
      if (!entry) throw new Error(`تحويل غير معرَّف: ${id}`);
      text = entry.transform.apply(text);
    }
    return text;
  }

  private ensureObserver(): void {
    if (this.observer) return;
    const doc = this.root.nodeType === 9 ? (this.root as Document) : this.root.ownerDocument;
    const Observer = doc?.defaultView?.MutationObserver ?? globalThis.MutationObserver;
    this.observer = new Observer((mutations) => this.handle(mutations));
    this.observer.observe(this.root, { characterData: true, characterDataOldValue: true, childList: true, subtree: true });
  }

  private assertOpen(): void {
    if (this.disposed) throw new Error('TextTransformRegistry أُغلق (dispose)');
  }
}

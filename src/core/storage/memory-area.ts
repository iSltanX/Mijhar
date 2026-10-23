// منطقة تخزين ذاكرية بسلوك المتصفحات: حصة بقياس Chrome (طول المفتاح + طول JSON للقيمة)، وكتابة ذرّية تفشل
// كاملة عند تجاوز الحصة، وأحداث تغيّر غير متزامنة تصل كل المستمعين بما فيهم الكاتب. لاختبار الطبقات دون متصفح،
// ولمحاكاة سياقين يتشاركان المنطقة نفسها (مستمعان على المصدر نفسه).
import type { ChangeSource, StorageAreaLike, StorageChanges, StorageValues } from './area';

export interface MemoryStorageOptions {
  /** حصة بالبايت؛ بلا حصة إن لم تُحدَّد. */
  quotaBytes?: number;
  /** افتراضيًا true: فشل الكتابة بالحصة لا يغيّر شيئًا. false يحاكي كتابة جزئية لاختبار بروتوكولات الاسترجاع. */
  atomic?: boolean;
  initial?: StorageValues;
}

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

export const measureEntry = (key: string, value: unknown): number => key.length + JSON.stringify(value).length;

export class MemoryStorageArea implements StorageAreaLike, ChangeSource {
  private data = new Map<string, unknown>();
  private readonly listeners = new Set<(changes: StorageChanges) => void>();
  private readonly atomic: boolean;
  quotaBytes: number | undefined;
  /** يُستدعى قبل كل set/remove؛ إن رمى فشلت العملية دون أثر. لحقن الأعطال في الاختبارات. */
  beforeWrite: ((operation: 'set' | 'remove', keys: string[]) => void) | undefined;
  writes = 0;

  constructor(options: MemoryStorageOptions = {}) {
    this.quotaBytes = options.quotaBytes;
    this.atomic = options.atomic ?? true;
    for (const [key, value] of Object.entries(options.initial ?? {})) this.data.set(key, clone(value));
  }

  async get(keys: string | string[] | null): Promise<StorageValues> {
    const wanted = keys === null ? [...this.data.keys()] : Array.isArray(keys) ? keys : [keys];
    const out: StorageValues = {};
    for (const key of wanted) if (this.data.has(key)) out[key] = clone(this.data.get(key));
    return out;
  }

  async set(items: StorageValues): Promise<void> {
    this.beforeWrite?.('set', Object.keys(items));
    this.writes += 1;
    const next = new Map(this.data);
    const changes: StorageChanges = {};
    const entries = Object.entries(items);
    for (const [key, value] of entries) {
      if (value === undefined) continue;
      changes[key] = { oldValue: clone(this.data.get(key)), newValue: clone(value) };
      next.set(key, clone(value));
    }
    if (this.quotaBytes !== undefined && this.total(next) > this.quotaBytes) {
      if (this.atomic) throw new Error('QUOTA_BYTES quota exceeded');
      // كتابة جزئية: تُكتب المفاتيح بالترتيب حتى تتجاوز الحصة، والباقي يُهمل.
      const partial = new Map(this.data);
      const applied: StorageChanges = {};
      for (const [key, value] of entries) {
        const trial = new Map(partial);
        trial.set(key, clone(value));
        if (this.total(trial) > this.quotaBytes) break;
        partial.set(key, clone(value));
        applied[key] = changes[key] as StorageChanges[string];
      }
      this.data = partial;
      this.emit(applied);
      throw new Error('QUOTA_BYTES quota exceeded');
    }
    this.data = next;
    this.emit(changes);
  }

  async remove(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    this.beforeWrite?.('remove', list);
    this.writes += 1;
    const changes: StorageChanges = {};
    for (const key of list) {
      if (!this.data.has(key)) continue;
      changes[key] = { oldValue: clone(this.data.get(key)) };
      this.data.delete(key);
    }
    this.emit(changes);
  }

  async getBytesInUse(keys: string | string[] | null): Promise<number> {
    const wanted = keys === null ? [...this.data.keys()] : Array.isArray(keys) ? keys : [keys];
    return wanted.reduce((sum, key) => (this.data.has(key) ? sum + measureEntry(key, this.data.get(key)) : sum), 0);
  }

  addListener(listener: (changes: StorageChanges) => void): void {
    this.listeners.add(listener);
  }

  removeListener(listener: (changes: StorageChanges) => void): void {
    this.listeners.delete(listener);
  }

  /** لقطة لما في المنطقة (لمقارنة «لم يتغير شيء» في الاختبارات). */
  dump(): StorageValues {
    return Object.fromEntries([...this.data].map(([key, value]) => [key, clone(value)]));
  }

  private total(map: Map<string, unknown>): number {
    let sum = 0;
    for (const [key, value] of map) sum += measureEntry(key, value);
    return sum;
  }

  // كما في المتصفحات: الأحداث غير متزامنة وتصل كل المستمعين.
  private emit(changes: StorageChanges): void {
    if (!Object.keys(changes).length) return;
    const listeners = [...this.listeners];
    queueMicrotask(() => {
      for (const listener of listeners) listener(clone(changes));
    });
  }
}

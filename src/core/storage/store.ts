// Store: مخزن سجلات مسمّاة (mijhar:data:<name>) بإصدار مخطط ومرحّل ونسخ احتياطية وتصدير واستيراد وإشعار تغيّر.
//
// الضمانات:
//  - كل عملية كتابة داخل السياق الواحد متسلسلة (read-modify-write لا تدهس بعضها). التزامن بين السياقات لا تضمنه
//    الطبقة: في الإنتاج تمرّ الكتابات المتنازع عليها عبر الخلفية، والبث بين السياقات يتولاه storage.onChanged.
//  - تجاوز الحصة يرفع StorageQuotaError مفهومًا ولا يغيّر البيانات السابقة (كتابة المفتاح الواحد ذرّية في المتصفحات،
//    وتُثبَّت بتجربة فعلية: evidence/T-1.3).
//  - الترحيل والاستيراد بنفس البروتوكول: تنفيذ التحويل في الذاكرة ← نسخة احتياطية ← سجل عملية (journal) ← كتابة
//    واحدة تشمل ختم الإصدار ← حذف ما أُزيل ← حذف السجل. فشل في أي موضع يُرجع النسخة الاحتياطية، وإن فشل الإرجاع
//    نفسه بقي السجل فيُستأنف الإرجاع تلقائيًا عند الفتح التالي.
import type { ChangeSource, StorageAreaLike, StorageChanges, StorageValues } from './area';
import {
  StorageImportError,
  StorageMigrationError,
  StorageNotMigratedError,
  StorageQuotaError,
  StorageSchemaTooNewError,
  StorageValueError,
  isQuotaError,
} from './errors';
import type { QuotaPhase, QuotaRemedy } from './errors';
import { CURRENT_SCHEMA_VERSION, MIGRATIONS, migrationPath } from './migrations';
import type { Migration, Snapshot } from './migrations';

export const KEY_PREFIX = 'mijhar:';
export const META_KEY = `${KEY_PREFIX}meta`;
export const JOURNAL_KEY = `${KEY_PREFIX}journal`;
export const BACKUP_PREFIX = `${KEY_PREFIX}backup:`;
export const DATA_PREFIX = `${KEY_PREFIX}data:`;
export const EXPORT_FORMAT = 'mijhar-export';

export interface Meta {
  schemaVersion: number;
  createdAt: string;
  migratedAt?: string;
}

export type BackupReason = 'migration' | 'import' | 'manual';

export interface BackupRecord {
  id: string;
  createdAt: string;
  reason: BackupReason;
  fromVersion: number;
  toVersion: number;
  /** null: لم تكن meta موجودة (بيانات غير مؤرقمة). */
  meta: Meta | null;
  records: Record<string, unknown>;
}

export interface BackupInfo {
  id: string;
  createdAt: string;
  reason: BackupReason;
  fromVersion: number;
  toVersion: number;
  bytes: number;
}

interface Journal {
  kind: BackupReason;
  backupKey: string;
  from: number;
  to: number;
  startedAt: string;
  /** مفاتيح كاملة تُحذف بعد الكتابة الذرّية؛ يُكمل الاسترداد حذفها إن انقطعت العملية بعدها. */
  removes: string[];
  /** يُضبط true في الكتابة الذرّية نفسها: علامة أن الكتابة اكتملت (لا يُستدل عليها من meta فقد يتساوى from وto). */
  committed?: boolean;
}

export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  records: Record<string, unknown>;
}

export interface ImportResult {
  imported: string[];
  removed: string[];
  backupId: string;
}

export interface StoreOptions {
  area: StorageAreaLike;
  changes?: ChangeSource;
  migrations?: readonly Migration[];
  /** إصدار المخطط الذي يُرحَّل إليه. الافتراضي CURRENT_SCHEMA_VERSION. */
  currentVersion?: number;
  /** false في سياقات لا تملك الترحيل (سكربت المحتوى): تفشل بـStorageNotMigratedError بدل أن ترحّل. الافتراضي true. */
  migrate?: boolean;
  /** عدد النسخ الاحتياطية الأحدث المحتفَظ بها بعد نجاح عملية. الافتراضي 2. */
  keepBackups?: number;
  /** هل يُعرض طلب unlimitedStorage علاجًا لامتلاء الحصة (يحسمه ناتج تجربة HYP-06 للمتصفح). الافتراضي false. */
  canRequestUnlimitedStorage?: boolean;
  now?: () => Date;
}

const NAME = /^[A-Za-z][A-Za-z0-9._-]*$/;

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const estimateBytes = (items: StorageValues): number =>
  Object.entries(items).reduce((sum, [key, value]) => sum + key.length + (value === undefined ? 0 : JSON.stringify(value).length), 0);

function assertName(name: string): void {
  if (!NAME.test(name)) throw new StorageValueError(name, 'اسم السجل يبدأ بحرف ويحوي أحرفًا وأرقامًا ونقطة وشرطتين فقط');
}

// مقارنة صارمة بين القيمة الأصلية وما تعيده JSON: تكشف ما يتغير بالتسلسل (NaN وDate وundefined داخل كائن ونحوها).
function survivesJson(original: unknown, parsed: unknown): boolean {
  if (original === parsed) return true;
  if (typeof original !== 'object' || typeof parsed !== 'object' || original === null || parsed === null) return false;
  if (Array.isArray(original) !== Array.isArray(parsed)) return false;
  if (Array.isArray(original)) {
    const other = parsed as unknown[];
    return original.length === other.length && original.every((item, i) => survivesJson(item, other[i]));
  }
  const proto = Object.getPrototypeOf(original);
  if (proto !== Object.prototype && proto !== null) return false;
  const keys = Object.keys(original);
  const copy = parsed as Record<string, unknown>;
  return keys.length === Object.keys(copy).length && keys.every((key) => key in copy && survivesJson((original as Record<string, unknown>)[key], copy[key]));
}

/** يتحقق أن القيمة JSON صالحة تعود كما كُتبت (لا undefined ولا دوال ولا دورات ولا NaN ولا Date). */
export function assertJsonValue(name: string, value: unknown): void {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch (error) {
    throw new StorageValueError(name, error instanceof Error ? error.message : 'تعذّر التسلسل');
  }
  if (text === undefined) throw new StorageValueError(name, 'القيمة غير قابلة للتسلسل (undefined أو دالة)');
  if (!survivesJson(value, JSON.parse(text))) throw new StorageValueError(name, 'القيمة تتغير عند التسلسل (مثل NaN أو Date أو undefined داخل كائن)');
}

const dataKey = (name: string): string => `${DATA_PREFIX}${name}`;

export class Store {
  private readonly area: StorageAreaLike;
  private readonly changes: ChangeSource | undefined;
  private readonly migrations: readonly Migration[];
  private readonly current: number;
  private readonly allowMigrate: boolean;
  private readonly keepBackups: number;
  private readonly remedies: readonly QuotaRemedy[];
  private readonly now: () => Date;
  private queue: Promise<unknown> = Promise.resolve();
  private version = -1;
  private readonly subscribers = new Map<string, Set<(value: unknown, oldValue: unknown) => void>>();
  private readonly prefixSubscribers = new Set<{ prefix: string; callback: (name: string, value: unknown, oldValue: unknown) => void }>();
  private listener: ((changes: StorageChanges) => void) | null = null;

  private constructor(options: StoreOptions) {
    this.area = options.area;
    this.changes = options.changes;
    this.migrations = options.migrations ?? MIGRATIONS;
    this.current = options.currentVersion ?? CURRENT_SCHEMA_VERSION;
    this.allowMigrate = options.migrate ?? true;
    this.keepBackups = options.keepBackups ?? 2;
    this.remedies = options.canRequestUnlimitedStorage ? ['export', 'request-unlimited-storage'] : ['export'];
    this.now = options.now ?? (() => new Date());
  }

  /** يفتح المخزن: يستردّ عملية منقطعة إن وُجدت، ثم يرحّل إن لزم، أو يختم مخزنًا جديدًا. */
  static async open(options: StoreOptions): Promise<Store> {
    const store = new Store(options);
    await store.enqueue(() => store.initialize());
    return store;
  }

  get schemaVersion(): number {
    return this.version;
  }

  // ---------- السجلات ----------

  async read<T>(name: string, fallback: T): Promise<T> {
    assertName(name);
    return this.enqueue(async () => {
      const got = await this.area.get(dataKey(name));
      return dataKey(name) in got ? (got[dataKey(name)] as T) : clone(fallback);
    });
  }

  /** كل السجلات التي يبدأ اسمها بـprefix، باسمها الكامل. لسجلات مفتاح-لكل-قيمة (مثل الإعدادات) حيث لا تتنازع الكتابات. */
  async readPrefix(prefix: string): Promise<Record<string, unknown>> {
    return this.enqueue(async () => {
      const all = await this.area.get(null);
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(all)) if (key.startsWith(DATA_PREFIX + prefix)) out[key.slice(DATA_PREFIX.length)] = clone(value);
      return out;
    });
  }

  async write(name: string, value: unknown): Promise<void> {
    assertName(name);
    assertJsonValue(name, value);
    await this.enqueue(() => this.set({ [dataKey(name)]: value }, 'write', name));
  }

  /** قراءة ثم كتابة متسلسلتان؛ fn تعدّل نسخة المسودة أو تعيد قيمة جديدة. تعيد القيمة المكتوبة. */
  async update<T>(name: string, fallback: T, fn: (draft: T) => T | void): Promise<T> {
    assertName(name);
    return this.enqueue(async () => {
      const got = await this.area.get(dataKey(name));
      const draft = dataKey(name) in got ? (got[dataKey(name)] as T) : clone(fallback);
      const next = (fn(draft) ?? draft) as T;
      assertJsonValue(name, next);
      await this.set({ [dataKey(name)]: next }, 'write', name);
      return next;
    });
  }

  async remove(name: string): Promise<void> {
    assertName(name);
    await this.enqueue(() => this.area.remove(dataKey(name)));
  }

  /** يشترك في تغيّر سجل من أي سياق (بما فيه هذا). يعيد دالة إلغاء الاشتراك. */
  subscribe<T = unknown>(name: string, callback: (value: T | undefined, oldValue: T | undefined) => void): () => void {
    assertName(name);
    if (!this.changes) throw new Error('المخزن بلا ChangeSource: لا بث تغيّر في هذا السياق');
    const set = this.subscribers.get(name) ?? new Set();
    set.add(callback as (value: unknown, oldValue: unknown) => void);
    this.subscribers.set(name, set);
    this.attach();
    return () => {
      set.delete(callback as (value: unknown, oldValue: unknown) => void);
      if (!set.size) this.subscribers.delete(name);
      if (!this.subscribers.size && !this.prefixSubscribers.size) this.detach();
    };
  }

  /** يشترك في تغيّر أي سجل يبدأ اسمه بـprefix؛ يُستدعى باسم السجل الكامل. */
  subscribePrefix<T = unknown>(prefix: string, callback: (name: string, value: T | undefined, oldValue: T | undefined) => void): () => void {
    if (!this.changes) throw new Error('المخزن بلا ChangeSource: لا بث تغيّر في هذا السياق');
    const entry = { prefix, callback: callback as (name: string, value: unknown, oldValue: unknown) => void };
    this.prefixSubscribers.add(entry);
    this.attach();
    return () => {
      this.prefixSubscribers.delete(entry);
      if (!this.subscribers.size && !this.prefixSubscribers.size) this.detach();
    };
  }

  /** يفك كل الاشتراكات (عند إغلاق السياق). */
  dispose(): void {
    this.subscribers.clear();
    this.prefixSubscribers.clear();
    this.detach();
  }

  async usage(): Promise<{ bytesInUse: number }> {
    if (this.area.getBytesInUse) return { bytesInUse: await this.area.getBytesInUse(null) };
    const all = await this.area.get(null);
    return { bytesInUse: estimateBytes(all) };
  }

  // ---------- النسخ الاحتياطية والتصدير ----------

  async listBackups(): Promise<BackupInfo[]> {
    return this.enqueue(async () => {
      const all = await this.area.get(null);
      return Object.entries(all)
        .filter(([key]) => key.startsWith(BACKUP_PREFIX))
        .map(([key, value]) => {
          const b = value as BackupRecord;
          return { id: b.id, createdAt: b.createdAt, reason: b.reason, fromVersion: b.fromVersion, toVersion: b.toVersion, bytes: estimateBytes({ [key]: value }) };
        })
        .sort((x, y) => (x.createdAt === y.createdAt ? y.id.localeCompare(x.id) : y.createdAt.localeCompare(x.createdAt)));
    });
  }

  /** نسخة احتياطية يدوية لحالة التخزين الآن. */
  async createBackup(): Promise<string> {
    return this.enqueue(async () => {
      const all = await this.area.get(null);
      const { id } = await this.writeBackup('manual', this.version, this.version, all, 'backup');
      await this.pruneBackups();
      return id;
    });
  }

  /**
   * يرجع البيانات إلى نسخة احتياطية بعد نسخة احتياطية جديدة للحالة الحالية، فالإرجاع نفسه قابل للتراجع.
   * إن كان مخطط النسخة أقدم من الحالي رُحِّلت بياناتها فورًا بعد الإرجاع.
   */
  async restoreBackup(id: string): Promise<void> {
    await this.enqueue(async () => {
      const all = await this.area.get(null);
      const record = all[`${BACKUP_PREFIX}${id}`] as BackupRecord | undefined;
      if (!record) throw new StorageImportError(`النسخة الاحتياطية ${id} غير موجودة`);
      const safety = await this.writeBackup('manual', this.version, record.fromVersion, all, 'backup');
      const sets: StorageValues = {};
      for (const [name, value] of Object.entries(record.records)) sets[dataKey(name)] = value;
      if (record.meta) sets[META_KEY] = record.meta;
      const removes = Object.keys(all).filter((key) => key.startsWith(DATA_PREFIX) && !(key.slice(DATA_PREFIX.length) in record.records));
      if (!record.meta && META_KEY in all) removes.push(META_KEY);
      await this.transaction({ kind: 'manual', backupId: safety.id, from: this.version, to: record.fromVersion, sets, removes });
      await this.pruneBackups();
      await this.initialize();
    });
  }

  async exportData(): Promise<ExportEnvelope> {
    return this.enqueue(async () => {
      const all = await this.area.get(null);
      return { format: EXPORT_FORMAT, schemaVersion: this.version, exportedAt: this.now().toISOString(), records: this.recordsOf(all) };
    });
  }

  /**
   * يستورد ملف تصدير. replace (الافتراضي) يستبدل كل السجلات بما في الملف؛ merge يكتب سجلات الملف ويبقي غيرها.
   * ملف بمخطط أقدم يُرحَّل في الذاكرة بخطوات MIGRATIONS؛ وبمخطط أحدث يُرفض.
   */
  async importData(input: unknown, options: { mode?: 'replace' | 'merge' } = {}): Promise<ImportResult> {
    const envelope = this.parseEnvelope(input);
    let records: Snapshot = { records: clone(envelope.records) };
    if (envelope.schemaVersion < this.current) {
      const path = migrationPath(this.migrations, envelope.schemaVersion, this.current);
      if (!path) throw new StorageImportError(`لا مسار ترحيل من الإصدار ${envelope.schemaVersion} إلى ${this.current}`);
      try {
        for (const step of path) records = step.up(clone(records));
        this.assertSnapshot(records);
      } catch (error) {
        throw new StorageImportError(`فشل ترحيل ملف الاستيراد: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    for (const [name, value] of Object.entries(records.records)) {
      assertName(name);
      assertJsonValue(name, value);
    }
    const mode = options.mode ?? 'replace';
    return this.enqueue(async () => {
      const all = await this.area.get(null);
      const existing = this.recordsOf(all);
      const sets: StorageValues = {};
      for (const [name, value] of Object.entries(records.records)) sets[dataKey(name)] = value;
      const removes = mode === 'replace' ? Object.keys(existing).filter((name) => !(name in records.records)).map(dataKey) : [];
      const { id } = await this.writeBackup('import', this.version, this.current, all, 'import');
      await this.transaction({ kind: 'import', backupId: id, from: this.version, to: this.current, sets, removes });
      await this.pruneBackups();
      return { imported: Object.keys(records.records), removed: removes.map((k) => k.slice(DATA_PREFIX.length)), backupId: id };
    });
  }

  // ---------- داخلي ----------

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private recordsOf(all: StorageValues): Record<string, unknown> {
    const records: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(all)) if (key.startsWith(DATA_PREFIX)) records[key.slice(DATA_PREFIX.length)] = clone(value);
    return records;
  }

  private async set(items: StorageValues, phase: QuotaPhase, key?: string): Promise<void> {
    try {
      await this.area.set(items);
    } catch (error) {
      if (isQuotaError(error)) {
        throw new StorageQuotaError({ phase, ...(key ? { key } : {}), requestedBytes: estimateBytes(items), remedies: this.remedies }, { cause: error });
      }
      throw error;
    }
  }

  private async initialize(): Promise<void> {
    let all = await this.area.get(null);
    if (all[JOURNAL_KEY]) {
      await this.recover(all[JOURNAL_KEY] as Journal, all);
      all = await this.area.get(null);
    }
    const meta = all[META_KEY] as Meta | undefined;
    const hasData = Object.keys(all).some((key) => key.startsWith(DATA_PREFIX));
    if (!meta && !hasData) {
      const fresh: Meta = { schemaVersion: this.current, createdAt: this.now().toISOString() };
      await this.set({ [META_KEY]: fresh }, 'write', META_KEY);
      this.version = this.current;
      return;
    }
    const found = meta ? meta.schemaVersion : 0;
    if (!Number.isInteger(found) || found < 0) throw new StorageImportError(`إصدار مخطط تالف في البيانات: ${String(found)}`);
    if (found > this.current) throw new StorageSchemaTooNewError(found, this.current);
    if (found === this.current) {
      this.version = found;
      return;
    }
    if (!this.allowMigrate) throw new StorageNotMigratedError(found, this.current);
    await this.migrate(all, meta ?? null, found);
  }

  private async migrate(all: StorageValues, meta: Meta | null, from: number): Promise<void> {
    const to = this.current;
    const path = migrationPath(this.migrations, from, to);
    if (!path) throw new StorageMigrationError({ fromVersion: from, toVersion: to, restored: true }, { cause: new Error(`لا مسار ترحيل من ${from} إلى ${to}`) });

    // 1) التحويل في الذاكرة: أي خطأ منطق هنا لا يمسّ التخزين.
    const before: Snapshot = { records: this.recordsOf(all) };
    let next: Snapshot = clone(before);
    let step: Migration | undefined;
    try {
      for (step of path) {
        next = step.up(clone(next));
        this.assertSnapshot(next);
      }
    } catch (error) {
      throw new StorageMigrationError(
        { fromVersion: from, toVersion: to, ...(step ? { failedStep: { from: step.from, to: step.to } } : {}), restored: true },
        { cause: error },
      );
    }

    // 2) نسخة احتياطية ثم الكتابة بالبروتوكول.
    const sets: StorageValues = {};
    for (const [name, value] of Object.entries(next.records)) if (!same(value, before.records[name])) sets[dataKey(name)] = value;
    const removes = Object.keys(before.records).filter((name) => !(name in next.records)).map(dataKey);
    const { id } = await this.writeBackup('migration', from, to, all, 'backup');
    const stamped: Meta = { schemaVersion: to, createdAt: meta?.createdAt ?? this.now().toISOString(), migratedAt: this.now().toISOString() };
    await this.transaction({ kind: 'migration', backupId: id, from, to, sets: { ...sets, [META_KEY]: stamped }, removes });
    await this.pruneBackups();
    this.version = to;
  }

  /**
   * بروتوكول الكتابة المحمية: سجل العملية ثم كتابة ذرّية واحدة (تحمل علامة committed) ثم الحذف ثم إزالة السجل.
   * فشل قبل اكتمال الكتابة الذرّية ← إرجاع النسخة الاحتياطية؛ ونجاح الإرجاع يرفع الخطأ الأصلي بعد تحويله، وفشله يبقي
   * السجل للاسترداد اللاحق. فشل ما بعد الكتابة الذرّية (الحذف وإزالة السجل) لا يُرجع شيئًا: العملية نجحت، ويُكمل
   * التنظيفَ الاسترداد عند الفتح التالي (وإرجاع النسخة هنا كان سيفسد ترحيلًا ناجحًا).
   */
  private async transaction(op: { kind: BackupReason; backupId: string; from: number; to: number; sets: StorageValues; removes: string[] }): Promise<void> {
    const backupKey = `${BACKUP_PREFIX}${op.backupId}`;
    const journal: Journal = { kind: op.kind, backupKey, from: op.from, to: op.to, startedAt: this.now().toISOString(), removes: op.removes };
    const phase: QuotaPhase = op.kind === 'import' ? 'import' : op.kind === 'migration' ? 'migration' : 'write';
    try {
      await this.area.set({ [JOURNAL_KEY]: journal });
      await this.set({ ...op.sets, [JOURNAL_KEY]: { ...journal, committed: true } }, phase);
    } catch (error) {
      const restored = await this.rollback(backupKey);
      const wasQuota = isQuotaError(error) || error instanceof StorageQuotaError;
      if (restored && wasQuota) {
        throw error instanceof StorageQuotaError ? error : new StorageQuotaError({ phase, requestedBytes: estimateBytes(op.sets), remedies: this.remedies }, { cause: error });
      }
      if (op.kind === 'import' && restored) throw new StorageImportError(`فشل الاستيراد وأُعيدت بياناتك: ${error instanceof Error ? error.message : String(error)}`);
      throw new StorageMigrationError({ fromVersion: op.from, toVersion: op.to, restored, backupId: op.backupId }, { cause: error });
    }
    try {
      if (op.removes.length) await this.area.remove(op.removes);
      await this.area.remove(JOURNAL_KEY);
    } catch {
      // نجحت الكتابة الذرّية؛ يُكمل الاسترداد عند الفتح التالي حذف المتبقي وإزالة السجل.
    }
  }

  private async rollback(backupKey: string): Promise<boolean> {
    try {
      const all = await this.area.get(null);
      const backup = all[backupKey] as BackupRecord | undefined;
      if (!backup) return false;
      await this.applyBackup(backup, all);
      await this.area.remove(JOURNAL_KEY);
      return true;
    } catch {
      return false;
    }
  }

  /** يجعل التخزين مطابقًا للنسخة: يحذف سجلات ليست فيها ثم يكتب سجلاتها وmeta. آمن للتكرار. */
  private async applyBackup(backup: BackupRecord, all: StorageValues): Promise<void> {
    const extra = Object.keys(all).filter((key) => key.startsWith(DATA_PREFIX) && !(key.slice(DATA_PREFIX.length) in backup.records));
    if (extra.length) await this.area.remove(extra);
    const sets: StorageValues = {};
    for (const [name, value] of Object.entries(backup.records)) sets[dataKey(name)] = value;
    if (backup.meta) sets[META_KEY] = backup.meta;
    if (Object.keys(sets).length) await this.area.set(sets);
    if (!backup.meta) await this.area.remove(META_KEY);
  }

  private async recover(journal: Journal, all: StorageValues): Promise<void> {
    if (journal.committed) {
      // الكتابة الذرّية اكتملت وانقطعت العملية بعدها: أكمل الحذف ولا تُرجع (فقد تُهدر كتابات سياقات أخرى لاحقة).
      if (journal.removes.length) await this.area.remove(journal.removes);
      await this.area.remove(JOURNAL_KEY);
      return;
    }
    const backup = all[journal.backupKey] as BackupRecord | undefined;
    if (backup) await this.applyBackup(backup, all);
    await this.area.remove(JOURNAL_KEY);
  }

  private async writeBackup(reason: BackupReason, from: number, to: number, all: StorageValues, phase: QuotaPhase): Promise<BackupRecord> {
    const createdAt = this.now().toISOString();
    let id = `${createdAt}-${reason}`;
    for (let n = 2; `${BACKUP_PREFIX}${id}` in all; n += 1) id = `${createdAt}-${reason}-${n}`;
    const meta = (all[META_KEY] as Meta | undefined) ?? null;
    const record: BackupRecord = { id, createdAt, reason, fromVersion: from, toVersion: to, meta: meta ? clone(meta) : null, records: this.recordsOf(all) };
    await this.set({ [`${BACKUP_PREFIX}${id}`]: record }, phase);
    return record;
  }

  private async pruneBackups(): Promise<void> {
    const all = await this.area.get(null);
    const keys = Object.entries(all)
      .filter(([key]) => key.startsWith(BACKUP_PREFIX))
      .sort(([, a], [, b]) => (b as BackupRecord).createdAt.localeCompare((a as BackupRecord).createdAt) || (b as BackupRecord).id.localeCompare((a as BackupRecord).id))
      .map(([key]) => key);
    const stale = keys.slice(this.keepBackups);
    if (stale.length) await this.area.remove(stale);
  }

  private assertSnapshot(snapshot: Snapshot): void {
    if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.records !== 'object' || snapshot.records === null) {
      throw new Error('ناتج الترحيل بلا records');
    }
    for (const [name, value] of Object.entries(snapshot.records)) {
      assertName(name);
      assertJsonValue(name, value);
    }
  }

  private parseEnvelope(input: unknown): ExportEnvelope {
    if (!input || typeof input !== 'object') throw new StorageImportError('الملف ليس كائنًا');
    const e = input as Partial<ExportEnvelope>;
    if (e.format !== EXPORT_FORMAT) throw new StorageImportError(`صيغة الملف غير معروفة (المتوقع ${EXPORT_FORMAT})`);
    if (!Number.isInteger(e.schemaVersion) || (e.schemaVersion as number) < 0) throw new StorageImportError('إصدار المخطط في الملف غير صالح');
    if ((e.schemaVersion as number) > this.current) {
      throw new StorageImportError(`الملف بإصدار مخطط أحدث (${e.schemaVersion}) من المدعوم (${this.current})؛ حدّث الإضافة`);
    }
    if (!e.records || typeof e.records !== 'object' || Array.isArray(e.records)) throw new StorageImportError('records غير صالحة');
    return e as ExportEnvelope;
  }

  private attach(): void {
    if (this.listener || !this.changes) return;
    this.listener = (changes) => {
      for (const [key, change] of Object.entries(changes)) {
        if (!key.startsWith(DATA_PREFIX)) continue;
        const name = key.slice(DATA_PREFIX.length);
        for (const callback of [...(this.subscribers.get(name) ?? [])]) callback(change.newValue, change.oldValue);
        for (const { prefix, callback } of [...this.prefixSubscribers]) if (name.startsWith(prefix)) callback(name, change.newValue, change.oldValue);
      }
    };
    this.changes.addListener(this.listener);
  }

  private detach(): void {
    if (this.listener && this.changes) this.changes.removeListener(this.listener);
    this.listener = null;
  }
}

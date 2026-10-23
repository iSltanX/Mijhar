// مستودع الموارد: القائمة المضمّنة + ما يضيفه المستخدم أو يعدّله أو يخفيه (سجل لكل مورد: resources.item.<id>)، بذاكرة مؤقتة تتبع
// أحداث التغيّر من كل السياقات. حذف مورد مضمّن يكتب شاهدًا (tombstone) ولا يمس القائمة المضمّنة؛ والتعديل يكتب نسخة تغلبها.
import type { Store } from '../../../core/storage';
import {
  ID_PATTERN,
  RESOURCE_FORMAT,
  RESOURCE_SCHEMA_VERSION,
  draftProblems,
  isResource,
  resourceProblems,
} from './model';
import type { Category, ParsedFile, Resource, ResourceDraft, ResourceFile } from './model';

export const RESOURCE_PREFIX = 'resources.item.';
export const resourceRecordName = (id: string): string => `${RESOURCE_PREFIX}${id}`;

interface Tombstone {
  readonly id: string;
  readonly deleted: true;
}

const isTombstone = (value: unknown): value is Tombstone =>
  typeof value === 'object' && value !== null && (value as Tombstone).deleted === true && typeof (value as Tombstone).id === 'string';

export class ResourceNotFoundError extends Error {
  constructor(readonly id: string) {
    super('المورد غير موجود');
    this.name = 'ResourceNotFoundError';
  }
}

export class ResourceInputError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(problems.join(' '));
    this.name = 'ResourceInputError';
  }
}

export interface ResourcesRepositoryOptions {
  readonly now?: () => Date;
  readonly newId?: () => string;
  readonly categories?: readonly Category[];
}

export type ImportMode = 'merge' | 'replace';

export interface ImportPreview {
  readonly added: number;
  readonly updated: number;
  readonly unchanged: number;
  /** في الاستبدال: موارد حالية لن تبقى. */
  readonly removed: number;
  readonly invalid: ReadonlyArray<{ readonly index: number; readonly id: string | null; readonly problems: readonly string[] }>;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const today = (now: Date): string => now.toISOString().slice(0, 10);

function randomId(): string {
  const uuid = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
  return `u-${(uuid ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24)}`;
}

export class ResourcesRepository {
  private readonly stored = new Map<string, Resource | Tombstone>();
  private readonly listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private readonly now: () => Date;
  private readonly newId: () => string;
  readonly categories: readonly Category[];

  private constructor(
    private readonly store: Store,
    private readonly builtin: readonly Resource[],
    options: ResourcesRepositoryOptions,
  ) {
    this.now = options.now ?? (() => new Date());
    this.newId = options.newId ?? randomId;
    this.categories = options.categories ?? [];
  }

  static async open(store: Store, builtin: readonly Resource[], options: ResourcesRepositoryOptions = {}): Promise<ResourcesRepository> {
    const repository = new ResourcesRepository(store, builtin, options);
    for (const [name, value] of Object.entries(await store.readPrefix(RESOURCE_PREFIX))) repository.accept(name, value);
    repository.unsubscribe = store.subscribePrefix(RESOURCE_PREFIX, (name, value) => repository.receive(name, value));
    return repository;
  }

  /** القائمة الفعلية: المضمّنة (بتعديلاتها وبدون المحذوف) ثم موارد المستخدم، بترتيب التصنيف فالعنوان. */
  list(): Resource[] {
    const out = new Map<string, Resource>();
    for (const resource of this.builtin) {
      const entry = this.stored.get(resource.id);
      if (isTombstone(entry)) continue;
      out.set(resource.id, entry ?? resource);
    }
    for (const [id, entry] of this.stored) if (!out.has(id) && !isTombstone(entry) && !this.builtin.some((b) => b.id === id)) out.set(id, entry);
    const order = new Map(this.categories.map((c, i) => [c.id, i]));
    return [...out.values()].sort(
      (a, b) => (order.get(a.category) ?? 999) - (order.get(b.category) ?? 999) || a.category.localeCompare(b.category) || a.title.localeCompare(b.title, 'ar'),
    );
  }

  get(id: string): Resource | undefined {
    return this.list().find((r) => r.id === id);
  }

  /** مورد مضمّن أُخفي أو عُدِّل (لعرض «استعادة المضمّنة»). */
  hiddenBuiltins(): Resource[] {
    return this.builtin.filter((b) => isTombstone(this.stored.get(b.id)));
  }

  async add(draft: ResourceDraft): Promise<Resource> {
    const problems = draftProblems(draft);
    if (problems.length) throw new ResourceInputError(problems);
    let id = this.newId();
    while (!ID_PATTERN.test(id) || this.stored.has(id) || this.builtin.some((b) => b.id === id)) id = randomId();
    const resource: Resource = {
      id,
      title: draft.title.trim(),
      url: draft.url.trim(),
      category: draft.category.trim(),
      description: draft.description.trim(),
      lastVerified: null,
      status: 'unverified',
      source: 'أضافه المستخدم',
      origin: 'user',
    };
    await this.write(resource);
    return resource;
  }

  /** يعدّل حقولًا: لمورد مضمّن يكتب نسخة محلية تغلبه. تعديل العنوان أو الرابط أو الوصف يمر بالتحقق. */
  async update(id: string, patch: Partial<Omit<Resource, 'id' | 'origin'>>): Promise<Resource> {
    const current = this.get(id);
    if (!current) throw new ResourceNotFoundError(id);
    const next: Resource = { ...current, ...patch, id: current.id, origin: current.origin };
    const problems = resourceProblems(next);
    if (problems.length) throw new ResourceInputError(problems);
    await this.write(next);
    return next;
  }

  /** مراجعة يدوية: تاريخ اليوم وحالة يحددها المستخدم (للروابط الخارجية التي لا تُفحص آليًا). */
  review(id: string, status: Resource['status'], note?: string): Promise<Resource> {
    return this.update(id, { status, lastVerified: today(this.now()), source: 'مراجعة بشرية محلية', ...(note !== undefined ? { note } : {}) });
  }

  async remove(id: string): Promise<void> {
    if (!this.get(id)) throw new ResourceNotFoundError(id);
    if (this.builtin.some((b) => b.id === id)) {
      const tombstone: Tombstone = { id, deleted: true };
      await this.store.write(resourceRecordName(id), tombstone);
      this.apply(id, tombstone);
    } else {
      await this.store.remove(resourceRecordName(id));
      this.apply(id, undefined);
    }
  }

  /** يعيد مورًدا مضمّنًا إلى حاله الأصلي (يزيل شاهد حذفه أو تعديلاته). */
  async restoreBuiltin(id: string): Promise<void> {
    if (!this.builtin.some((b) => b.id === id)) throw new ResourceNotFoundError(id);
    await this.store.remove(resourceRecordName(id));
    this.apply(id, undefined);
  }

  exportFile(): ResourceFile {
    return {
      format: RESOURCE_FORMAT,
      schemaVersion: RESOURCE_SCHEMA_VERSION,
      exportedAt: this.now().toISOString(),
      categories: this.categoriesInUse(),
      resources: this.list(),
    };
  }

  exportJson(): string {
    return `${JSON.stringify(this.exportFile(), null, 2)}\n`;
  }

  /** معاينة ما يفعله الاستيراد دون كتابة. */
  previewImport(parsed: Extract<ParsedFile, { ok: true }>, mode: ImportMode): ImportPreview {
    const current = new Map(this.list().map((r) => [r.id, r]));
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    for (const incoming of parsed.file.resources) {
      const existing = current.get(incoming.id);
      if (!existing) added += 1;
      else if (same(existing, this.normalize(incoming))) unchanged += 1;
      else updated += 1;
    }
    const incomingIds = new Set(parsed.file.resources.map((r) => r.id));
    const removed = mode === 'replace' ? [...current.keys()].filter((id) => !incomingIds.has(id)).length : 0;
    return { added, updated, unchanged, removed, invalid: parsed.invalid };
  }

  /** يطبّق الاستيراد: دمج يكتب موارد الملف ويبقي غيرها؛ استبدال يجعل القائمة الفعلية مطابقة للملف. */
  async applyImport(parsed: Extract<ParsedFile, { ok: true }>, mode: ImportMode): Promise<ImportPreview> {
    const preview = this.previewImport(parsed, mode);
    const incoming = parsed.file.resources.map((r) => this.normalize(r));
    for (const resource of incoming) {
      const existing = this.get(resource.id);
      if (existing && same(existing, resource)) continue;
      await this.write(resource);
    }
    if (mode === 'replace') {
      const keep = new Set(incoming.map((r) => r.id));
      for (const resource of this.list()) if (!keep.has(resource.id)) await this.remove(resource.id);
    }
    return preview;
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

  private normalize(resource: Resource): Resource {
    return { ...resource, origin: this.builtin.some((b) => b.id === resource.id) ? 'builtin' : 'user' };
  }

  private categoriesInUse(): Category[] {
    const used = new Set(this.list().map((r) => r.category));
    const known = this.categories.filter((c) => used.has(c.id));
    const extra = [...used].filter((id) => !this.categories.some((c) => c.id === id)).map((id) => ({ id, title: id }));
    return [...known, ...extra];
  }

  private async write(resource: Resource): Promise<void> {
    await this.store.write(resourceRecordName(resource.id), resource);
    this.apply(resource.id, resource);
  }

  private accept(name: string, value: unknown): void {
    const id = name.slice(RESOURCE_PREFIX.length);
    if ((isResource(value) || isTombstone(value)) && value.id === id) this.stored.set(id, value);
  }

  private receive(name: string, value: unknown): void {
    const id = name.slice(RESOURCE_PREFIX.length);
    this.apply(id, value === undefined ? undefined : (isResource(value) || isTombstone(value)) && value.id === id ? value : undefined);
  }

  private apply(id: string, value: Resource | Tombstone | undefined): void {
    const before = this.stored.get(id);
    if (value === undefined) this.stored.delete(id);
    else this.stored.set(id, value);
    if (same(before, value)) return;
    for (const listener of [...this.listeners]) listener();
  }
}

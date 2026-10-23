// SettingsStore: القيم الفعلية = ما كُتب صراحةً فوق الافتراضي. كل إعداد في سجل مستقل (setting.<المفتاح>) لا يُخزَّن
// إلا إن خالف افتراضيه، فيسري تغيير افتراضي في نسخة لاحقة على من لم يغيّره، ولا تتنازع كتابتان لإعدادين مختلفين من
// سياقين (سجل واحد لكل الإعدادات كان سيضيّع إحداهما: قراءة ثم كتابة بين سياقات لا يقيّدها قفل).
// القراءة متزامنة من ذاكرة مؤقتة تتبع أحداث التغيّر بترتيب الالتزام (storage.onChanged)، وتُحدَّث فورًا بالكتابة المحلية
// ليقرأ الكاتب ما كتبه؛ فتصل الحالة إلى كل السياقات المفتوحة وتتقارب إلى حالة التخزين الأخيرة.
import type { Store } from '../storage';
import { moduleEnabledKey } from './registry';
import type { JsonValue, SettingDefinition, SettingsRegistry } from './registry';

export const SETTING_PREFIX = 'setting.';

export interface SettingChange {
  readonly key: string;
  readonly value: JsonValue;
  readonly oldValue: JsonValue;
  /** local: كتبه هذا السياق؛ remote: وصل من سياق آخر. */
  readonly source: 'local' | 'remote';
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export class SettingsStore {
  private overrides = new Map<string, JsonValue>();
  /** كتابات هذا السياق التي لم يصل حدثها بعد (قد يصل الحدث قبل أن يعود وعد الكتابة، فلا يُحسب واردًا من غيره). */
  private readonly pending: string[] = [];
  private readonly listeners = new Set<(change: SettingChange) => void>();
  private unsubscribe: (() => void) | null = null;

  private constructor(
    private readonly store: Store,
    readonly registry: SettingsRegistry,
  ) {}

  static async open(store: Store, registry: SettingsRegistry): Promise<SettingsStore> {
    const settings = new SettingsStore(store, registry);
    for (const [name, value] of Object.entries(await store.readPrefix(SETTING_PREFIX))) settings.accept(name.slice(SETTING_PREFIX.length), value);
    settings.unsubscribe = store.subscribePrefix(SETTING_PREFIX, (name, value) => settings.receive(name.slice(SETTING_PREFIX.length), value));
    return settings;
  }

  /** القيمة الفعلية متزامنة. مفتاح غير معرَّف خطأ برمجي. */
  get<T extends JsonValue = JsonValue>(key: string): T {
    const definition = this.definition(key);
    return (this.overrides.has(key) ? this.overrides.get(key) : definition.default) as T;
  }

  /** كل الإعدادات المعرَّفة بقيمها الفعلية. */
  all(): Record<string, JsonValue> {
    return Object.fromEntries(this.registry.list().map((d) => [d.key, this.get(d.key)]));
  }

  isModuleEnabled(moduleId: string): boolean {
    const key = moduleEnabledKey(moduleId);
    return this.registry.has(key) ? this.get<boolean>(key) : false;
  }

  /** يكتب قيمة بعد التحقق. القيمة المساوية للفعلية لا تكتب شيئًا ولا تُصدر حدثًا. */
  async set(key: string, value: JsonValue): Promise<void> {
    const definition = this.definition(key);
    if (definition.validate && !definition.validate(value)) throw new Error(`قيمة غير صالحة للإعداد ${key}`);
    if (same(this.get(key), value)) return;
    const stored = same(definition.default, value) ? undefined : value;
    await this.persist(key, stored);
  }

  /** يعيد الإعداد إلى افتراضيه. */
  async reset(key: string): Promise<void> {
    this.definition(key);
    if (!this.overrides.has(key)) return;
    await this.persist(key, undefined);
  }

  // undefined = حذف الكتابة المخزنة (العودة للافتراضي).
  private async persist(key: string, value: JsonValue | undefined): Promise<void> {
    const marker = this.marker(key, value);
    this.pending.push(marker);
    try {
      if (value === undefined) await this.store.remove(SETTING_PREFIX + key);
      else await this.store.write(SETTING_PREFIX + key, value);
    } catch (error) {
      this.dropPending(marker);
      throw error;
    }
    this.dropPending(marker);
    this.apply(key, value, 'local');
  }

  private marker(key: string, value: unknown): string {
    return `${key}\u0000${value === undefined ? 'محذوف' : JSON.stringify(value)}`;
  }

  private dropPending(marker: string): boolean {
    const index = this.pending.indexOf(marker);
    if (index === -1) return false;
    this.pending.splice(index, 1);
    return true;
  }

  subscribe(listener: (change: SettingChange) => void): () => void {
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

  private definition(key: string): SettingDefinition {
    const definition = this.registry.get(key);
    if (!definition) throw new Error(`إعداد غير معرَّف: ${key}`);
    return definition;
  }

  // يقبل القيمة المخزنة في الذاكرة المؤقتة فقط إن كان المفتاح معرَّفًا والقيمة تجتاز مدققه؛ وإلا تُهمل في العرض
  // وتبقى في التخزين كما هي (قد تكون من نسخة أحدث تعرّفها).
  private accept(key: string, value: unknown): void {
    const definition = this.registry.get(key);
    if (!definition || (definition.validate && !definition.validate(value))) return;
    this.overrides.set(key, value as JsonValue);
  }

  private receive(key: string, value: unknown): void {
    if (!this.registry.has(key)) return;
    this.apply(key, value, this.dropPending(this.marker(key, value)) ? 'local' : 'remote');
  }

  private apply(key: string, value: unknown, source: 'local' | 'remote'): void {
    const definition = this.registry.get(key);
    if (!definition) return;
    const before = this.get(key);
    if (value === undefined || (definition.validate && !definition.validate(value))) this.overrides.delete(key);
    else this.overrides.set(key, value as JsonValue);
    const after = this.get(key);
    if (same(before, after)) return;
    for (const listener of [...this.listeners]) listener({ key, value: after, oldValue: before, source });
  }
}

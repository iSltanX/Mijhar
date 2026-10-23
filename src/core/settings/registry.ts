// سجل تعريفات الإعدادات: لكل مفتاح قيمة افتراضية ومدقق اختياري. تسجّل كل وحدة إعداداتها هنا،
// وتقرأ T-1.4 هذا السجل لتبني تبويب «الإعدادات والخصوصية».

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface SettingDefinition<T extends JsonValue = JsonValue> {
  readonly key: string;
  readonly default: T;
  readonly description?: string;
  /** يقبل أو يرفض قيمة مكتوبة أو مقروءة من التخزين؛ المرفوضة المقروءة تُهمل وتُستعمل الافتراضية. */
  readonly validate?: (value: unknown) => value is T;
}

const KEY = /^[A-Za-z][A-Za-z0-9._-]*$/;

export const moduleEnabledKey = (moduleId: string): string => `modules.${moduleId}.enabled`;

export class SettingsRegistry {
  private readonly definitions = new Map<string, SettingDefinition>();

  define<T extends JsonValue>(definition: SettingDefinition<T>): void {
    if (!KEY.test(definition.key)) throw new Error(`مفتاح إعداد غير صالح: ${definition.key}`);
    if (this.definitions.has(definition.key)) throw new Error(`إعداد معرَّف مسبقًا: ${definition.key}`);
    if (definition.validate && !definition.validate(definition.default)) throw new Error(`القيمة الافتراضية لا تجتاز المدقق: ${definition.key}`);
    this.definitions.set(definition.key, definition as SettingDefinition);
  }

  /** مفتاح تشغيل وحدة (modules.<id>.enabled). القيمة الافتراضية قرار منتج يصل صراحةً من المستدعي. */
  defineModuleToggle(moduleId: string, defaultEnabled: boolean, description?: string): void {
    this.define<boolean>({
      key: moduleEnabledKey(moduleId),
      default: defaultEnabled,
      validate: (value): value is boolean => typeof value === 'boolean',
      ...(description ? { description } : {}),
    });
  }

  has(key: string): boolean {
    return this.definitions.has(key);
  }

  get(key: string): SettingDefinition | undefined {
    return this.definitions.get(key);
  }

  list(): SettingDefinition[] {
    return [...this.definitions.values()];
  }
}

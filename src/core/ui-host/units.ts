// الوحدات الثماني (أ–ح) ومفاتيح تشغيلها، وإعدادات المضيف نفسه. كل سياق (الخلفية واللوحة والإعدادات وسكربت المحتوى)
// يعرّف السجل نفسه بـcreateSettingsRegistry فلا تختلف القيم الافتراضية بين السياقات.
//
// مفتاح الوحدة modules.<a..h>.enabled يحكم كل ExtensionModule ينتمي إليها: معرّف الوحدة البرمجية حرف وحدتها وحده
// ('a') أو حرفها ثم نقطة أو شرطة ('a.direction' و'a-fonts'). ووحدة برمجية عرّفت مفتاحًا خاصًا بها فوق مفتاح وحدتها
// تُركَّب حين يكون المفتاحان مفعَّلين معًا.
import { SettingsRegistry, moduleEnabledKey } from '../settings';
import type { SettingsStore } from '../settings';

export const UNIT_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export type UnitId = (typeof UNIT_IDS)[number];

export interface UnitInfo {
  readonly id: UnitId;
  /** الحرف العربي كما في الخطة (أ–ح). */
  readonly letter: string;
  readonly title: string;
  readonly summary: string;
}

// الأسماء من جدول الوحدات في EXECUTION_PLAN.md (القسم 3).
export const UNITS: readonly UnitInfo[] = [
  { id: 'a', letter: 'أ', title: 'اتجاه عربي وقراءة مريحة', summary: 'ضبط اتجاه النص العربي والمختلط، والخطوط، ووضع القراءة.' },
  { id: 'b', letter: 'ب', title: 'قاموس الواجهة', summary: 'شرح مصطلحات GitHub وأزراره في سياقها، والجولات الإرشادية.' },
  { id: 'c', letter: 'ج', title: 'ترجمة تقنية', summary: 'ترجمة محلية تحمي الأكواد والرموز ولا تعرض نصًّا مشوَّهًا.' },
  { id: 'd', letter: 'د', title: 'حالة العمل والفحوص', summary: 'حالة طلب الدمج والفحوص وموانعها بأدلتها.' },
  { id: 'e', letter: 'هـ', title: 'حزمة السياق والبرومبت والتحليل', summary: 'جمع سياق المهمة ونسخه برومبتًا جاهزًا.' },
  { id: 'f', letter: 'و', title: 'البلاغات والمراجعات والإنجاز التدريجي', summary: 'مساعد كتابة البلاغات والمراجعات بقوالب المستودع.' },
  { id: 'g', letter: 'ز', title: 'الملاحظات وحفظ موضع العمل', summary: 'ملاحظات خاصة محفوظة محليًا، وقائمة «أكمل لاحقًا».' },
  { id: 'h', letter: 'ح', title: 'المجتمع وأول مساهمة', summary: 'README العربي، ومرشد أول مساهمة، والمحتوى العربي.' },
];

/** القيمة الافتراضية لمفاتيح الوحدات: مفعَّلة، ويوقفها المستخدم. وحدة لم تُبنَ بعد لا تركّب شيئًا وإن كانت مفعَّلة. */
export const UNIT_DEFAULT_ENABLED = true;

/** مكان اللوحة: الأصلية للمتصفح (side_panel / sidebar_action) أو الدرج داخل الصفحة. */
export const SURFACE_KEY = 'ui.surface';
export const SURFACES = ['native', 'drawer'] as const;
export type Surface = (typeof SURFACES)[number];
export const DEFAULT_SURFACE: Surface = 'native';
export const isSurface = (value: unknown): value is Surface => typeof value === 'string' && (SURFACES as readonly string[]).includes(value);

export const isUnitId = (value: unknown): value is UnitId => typeof value === 'string' && (UNIT_IDS as readonly string[]).includes(value);

/** حرف الوحدة من معرّف ExtensionModule، أو undefined إن لم يتبع الاصطلاح. */
export function unitOf(moduleId: string): UnitId | undefined {
  const head = moduleId.split(/[.-]/, 1)[0];
  return isUnitId(head) ? head : undefined;
}

/** يعرّف مفاتيح الوحدات الثماني وإعدادات المضيف في سجل. extend لإعدادات تعرّفها أقسام الوحدات لاحقًا. */
export function defineCoreSettings(registry: SettingsRegistry): SettingsRegistry {
  for (const unit of UNITS) registry.defineModuleToggle(unit.id, UNIT_DEFAULT_ENABLED, `الوحدة (${unit.letter}): ${unit.title}`);
  registry.define<Surface>({ key: SURFACE_KEY, default: DEFAULT_SURFACE, validate: isSurface, description: 'مكان اللوحة' });
  return registry;
}

export function createSettingsRegistry(extend?: (registry: SettingsRegistry) => void): SettingsRegistry {
  const registry = defineCoreSettings(new SettingsRegistry());
  extend?.(registry);
  return registry;
}

/** هل تُركَّب الوحدة البرمجية moduleId: مفتاح وحدتها، ثم مفتاحها الخاص إن عُرِّف. */
export function isModuleEnabled(settings: SettingsStore, moduleId: string): boolean {
  const unit = unitOf(moduleId);
  if (!unit) return settings.isModuleEnabled(moduleId);
  if (!settings.isModuleEnabled(unit)) return false;
  return moduleId === unit || !settings.registry.has(moduleEnabledKey(moduleId)) || settings.isModuleEnabled(moduleId);
}

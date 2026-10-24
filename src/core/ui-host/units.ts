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

/**
 * طلب من خارج اللوحة أن تُظهر تبويبًا بعينه (مثل أمر فتح القاموس Alt+K من الخلفية): قيمة {tab, at}. تكتبه الخلفية، فتقرؤه اللوحة المفتوحة حديثًا
 * وتلاحظ تغيّره إن كانت مفتوحة، وهو في storage فيبلغ الدرج داخل الصفحة أيضًا. يُعدّ حديثًا مدة PANEL_REQUEST_FRESH_MS ثم يُهمل.
 */
export const PANEL_REQUEST_KEY = 'ui.panelRequest';
export const PANEL_REQUEST_FRESH_MS = 15_000;
export type PanelRequest = {
  readonly tab: string;
  /** وقت الطلب بالمللي ثانية (Date.now()). */
  readonly at: number;
};
export const isPanelRequest = (value: unknown): value is PanelRequest | null =>
  value === null || (typeof value === 'object' && typeof (value as PanelRequest).tab === 'string' && Number.isFinite((value as PanelRequest).at));
export const isFreshPanelRequest = (request: PanelRequest | null, now: number = Date.now()): request is PanelRequest =>
  request !== null && now - request.at >= 0 && now - request.at <= PANEL_REQUEST_FRESH_MS;

/**
 * الترحيب عند أول فتح للوحة (AD-29): 'pending' تكتبه الخلفية عند التثبيت الأول (runtime.onInstalled، السبب install) أو يكتبه
 * «جولة الترحيب» في الإعدادات، و'done' يكتبه إنهاؤه أو تجاوزه أو اختيار أي تبويب. الافتراضي 'done': تحديث الإضافة وأي مخزن بلا هذا
 * المفتاح لا يُظهر الترحيب.
 */
export const WELCOME_KEY = 'ui.welcome';
export const WELCOME_STATES = ['pending', 'done'] as const;
export type WelcomeState = (typeof WELCOME_STATES)[number];
export const isWelcomeState = (value: unknown): value is WelcomeState => typeof value === 'string' && (WELCOME_STATES as readonly string[]).includes(value);

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
  registry.define<PanelRequest | null>({ key: PANEL_REQUEST_KEY, default: null, validate: isPanelRequest, description: 'طلب إظهار تبويب في اللوحة (يكتبه أمر فتح القاموس)' });
  registry.define<WelcomeState>({ key: WELCOME_KEY, default: 'done', validate: isWelcomeState, description: 'الترحيب عند أول فتح للوحة' });
  return registry;
}

export function createSettingsRegistry(extend?: (registry: SettingsRegistry) => void): SettingsRegistry {
  const registry = defineCoreSettings(new SettingsRegistry());
  extend?.(registry);
  return registry;
}

/** يطلب من اللوحة (المفتوحة أو التي ستُفتح) إظهار التبويب. */
export function requestPanelTab(settings: SettingsStore, tab: string, now: number = Date.now()): Promise<void> {
  return settings.set(PANEL_REQUEST_KEY, { tab, at: now });
}

/** هل تُركَّب الوحدة البرمجية moduleId: مفتاح وحدتها، ثم مفتاحها الخاص إن عُرِّف. */
export function isModuleEnabled(settings: SettingsStore, moduleId: string): boolean {
  const unit = unitOf(moduleId);
  if (!unit) return settings.isModuleEnabled(moduleId);
  if (!settings.isModuleEnabled(unit)) return false;
  return moduleId === unit || !settings.registry.has(moduleEnabledKey(moduleId)) || settings.isModuleEnabled(moduleId);
}

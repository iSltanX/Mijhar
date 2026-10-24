// حد طول السياق المنقول (PP-03): 400 سطر لكل قسم من السياق (الوصف والسجل والتغييرات وكل كتلة طويلة)، يُقتطع بعده القسم ويُعلَن عدد أسطره
// المقتطعة. قيمة افتراضية قابلة للضبط تمنع نسخ الصفحة كاملة بلا تمييز، لا تقدير زمن. يُعرَّف المفتاح هنا ليقرأه من يعرض البرومبت أو يرسله
// (T-11.3 وT-11.6) ويضعه في قسم الإعدادات؛ وحزمة السياق (T-6.1) تمرّر حدودها الأضيق المعتمدة (DEFAULT_LIMITS) كما كانت.
import type { SettingsRegistry } from '../../../core/settings';

export const LINE_LIMIT_KEY = 'e.context.lineLimit';
export const LINE_LIMIT_DEFAULT = 400;
export const LINE_LIMIT_MIN = 20;
export const LINE_LIMIT_MAX = 5000;

export const isLineLimit = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= LINE_LIMIT_MIN && value <= LINE_LIMIT_MAX;

export function defineContextSettings(registry: SettingsRegistry): void {
  registry.define<number>({ key: LINE_LIMIT_KEY, default: LINE_LIMIT_DEFAULT, validate: isLineLimit, description: 'حد أسطر كل قسم من السياق المنقول في البرومبت (PP-03)' });
}

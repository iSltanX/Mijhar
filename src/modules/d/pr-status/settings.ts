// إعداد عتبة تقادم بيانات الفحوص (PP-01، T-5.2): المدة بالدقائق التي تُعلَن بعدها البيانات «قد تكون قديمة» ما لم يُرصد تحديث حي.
// قيمة افتراضية قابلة للضبط لا تقدير زمني. تُعرَّف في قسم الوحدة (د)، وتقرؤها البطاقة من التخزين كسولًا كما تفعل الوحدة (ح).
import type { SettingsRegistry } from '../../../core/settings';

export const STALE_MINUTES_KEY = 'd.pr-status.staleMinutes';
export const STALE_MINUTES_DEFAULT = 5;
export const STALE_MINUTES_MIN = 1;
export const STALE_MINUTES_MAX = 120;

export const isStaleMinutes = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= STALE_MINUTES_MIN && value <= STALE_MINUTES_MAX;

export function defineDStatusSettings(registry: SettingsRegistry): void {
  registry.define<number>({ key: STALE_MINUTES_KEY, default: STALE_MINUTES_DEFAULT, validate: isStaleMinutes, description: 'عتبة تقادم بيانات الفحوص بالدقائق (PP-01)' });
}

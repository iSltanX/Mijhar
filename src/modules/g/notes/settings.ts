// إعدادات الوحدة (ز): تُعرَّف في كل سياق عبر قسم الإعدادات (section.tsx) ويقرؤها مكوّن الصفحة وعلامات الأسطر.
import type { SettingsRegistry } from '../../../core/settings';

/** بطاقة «ملاحظاتي» في صفحات المستودع وطلبات الدمج والمشكلات والالتزامات والملفات. */
export const NOTES_PAGE_CARD_KEY = 'notes.pageCard';
/** علامات هادئة بجوار أرقام الأسطر التي عليها ملاحظات. */
export const NOTES_LINE_MARKERS_KEY = 'notes.lineMarkers';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

export function defineNotesSettings(registry: SettingsRegistry): void {
  registry.define<boolean>({ key: NOTES_PAGE_CARD_KEY, default: true, validate: isBoolean, description: 'بطاقة الملاحظات في صفحات GitHub' });
  registry.define<boolean>({ key: NOTES_LINE_MARKERS_KEY, default: true, validate: isBoolean, description: 'علامات الملاحظات بجوار أرقام الأسطر' });
}

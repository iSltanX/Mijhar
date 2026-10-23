// إعدادات «أكمل لاحقًا» في الوحدة (ز): تُعرَّف في كل سياق عبر قسم الإعدادات (section.tsx) ويقرؤها زر الصفحة.
import type { SettingsRegistry } from '../../../core/settings';

/** زر «أكمل لاحقًا» للحفظ السريع في صفحات المستودع وطلبات الدمج والمشكلات والالتزامات والملفات. */
export const BOOKMARKS_PAGE_BUTTON_KEY = 'bookmarks.pageButton';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

export function defineBookmarksSettings(registry: SettingsRegistry): void {
  registry.define<boolean>({ key: BOOKMARKS_PAGE_BUTTON_KEY, default: true, validate: isBoolean, description: 'زر «أكمل لاحقًا» في صفحات GitHub' });
}

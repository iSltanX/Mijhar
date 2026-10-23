// إعدادات الوحدة (ح): تُعرَّف في كل سياق عبر قسم الإعدادات (section.tsx).
import type { SettingsRegistry } from '../../core/settings';

/** شريط README العربي في صفحة المستودع. */
export const COMMUNITY_README_BANNER_KEY = 'community.readmeBanner';
/** بطاقة «محتوى عربي» و«بيانات يعلنها صاحب الحساب» في صفحات الملفات الشخصية. */
export const COMMUNITY_PROFILE_CARD_KEY = 'community.profileCard';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

export function defineCommunitySettings(registry: SettingsRegistry): void {
  registry.define<boolean>({ key: COMMUNITY_README_BANNER_KEY, default: true, validate: isBoolean, description: 'شريط README العربي في صفحة المستودع' });
  registry.define<boolean>({ key: COMMUNITY_PROFILE_CARD_KEY, default: true, validate: isBoolean, description: 'بطاقة المحتوى العربي والبيانات المعلنة في صفحة الملف الشخصي' });
}

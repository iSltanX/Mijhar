// أقسام إعدادات الوحدات في تبويب «الإعدادات والخصوصية». ملف مشترك بين المراحل (Docs/MJ/README.md «الملكية ومناطق
// التعارض»): تضيف كل مرحلة قسم وحدتها سطرًا واحدًا في SETTINGS_SECTIONS، فتُضم الأسطر بترتيب الدمج.
//
// القسم لا يظهر في الدرج المحقون في صفحة GitHub إلا إن ذكر 'drawer' صراحةً في surfaces: الافتراضي صفحات الإضافة
// وحدها، فلا يبلغ حقلٌ لسرّ (رمز وصول أو مفتاح مزوّد) الدرج سهوًا (DEC-04 وEXECUTION_PLAN.md ‏5).
import type { FunctionComponent } from 'preact';
import type { SettingsRegistry, SettingsStore } from '../core/settings';
import type { UnitId } from '../core/ui-host/units';
import { MODULE_A_SECTION } from '../modules/a/settings/section';
import { CARD_SECTION } from '../modules/b/card/section';
import { SEARCH_SECTION } from '../modules/b/search/section';
import { TRANSLATE_SECTION } from '../modules/c/ui/section';
import { PR_STATUS_SECTION } from '../modules/d/pr-status/section';
import { NOTES_SETTINGS_SECTION } from '../modules/g/notes/section';
import { COMMUNITY_SETTINGS_SECTION } from '../modules/h/section';

export type SettingsSurface = 'options' | 'native' | 'drawer';

export interface SettingsSectionProps {
  readonly settings: SettingsStore;
  readonly surface: SettingsSurface;
  /** هل وحدة القسم مفعَّلة الآن. */
  readonly unitEnabled: boolean;
}

export interface SettingsSection {
  readonly id: string;
  readonly unit: UnitId;
  readonly title: string;
  /** أين يظهر. الافتراضي ['options', 'native']. */
  readonly surfaces?: readonly SettingsSurface[];
  /** إعدادات القسم؛ تُعرَّف في كل سياق عبر defineSectionSettings. */
  readonly define?: (registry: SettingsRegistry) => void;
  readonly component: FunctionComponent<SettingsSectionProps>;
}

export const DEFAULT_SECTION_SURFACES: readonly SettingsSurface[] = ['options', 'native'];

// سطر واحد لكل قسم، تضيفه مرحلته.
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  MODULE_A_SECTION, // MJ7: الوحدة (أ)
  CARD_SECTION, // MJ8 (T-3.2): الوحدة (ب)
  SEARCH_SECTION, // MJ10 (T-3.4): الوحدة (ب): البحث في القاموس
  TRANSLATE_SECTION, // MJ10 (T-4.1): الوحدة (ج)
  PR_STATUS_SECTION, // MJ8 (T-5.1، T-5.4): الوحدة (د)
  NOTES_SETTINGS_SECTION, // MJ9 (T-8.1): الملاحظات الخاصة
  COMMUNITY_SETTINGS_SECTION, // MJ9 (T-9.1، T-9.4): المجتمع وأول مساهمة
];

export const sectionsFor = (surface: SettingsSurface, sections: readonly SettingsSection[] = SETTINGS_SECTIONS): SettingsSection[] =>
  sections.filter((section) => (section.surfaces ?? DEFAULT_SECTION_SURFACES).includes(surface));

/** يعرّف إعدادات الأقسام في السجل (يمرَّر إلى createSettingsRegistry في كل سياق). */
export function defineSectionSettings(registry: SettingsRegistry, sections: readonly SettingsSection[] = SETTINGS_SECTIONS): void {
  for (const section of sections) section.define?.(registry);
}

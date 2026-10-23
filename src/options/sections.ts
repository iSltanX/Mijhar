// أقسام إعدادات الوحدات في تبويب «الإعدادات والخصوصية». ملف مشترك بين المراحل (Docs/MJ/README.md «الملكية ومناطق
// التعارض»): تضيف كل مرحلة قسم وحدتها سطرًا واحدًا في SETTINGS_SECTIONS، فتُضم الأسطر بترتيب الدمج.
//
// القسم لا يظهر في الدرج المحقون في صفحة GitHub إلا إن ذكر 'drawer' صراحةً في surfaces: الافتراضي صفحات الإضافة
// وحدها، فلا يبلغ حقلٌ لسرّ (رمز وصول أو مفتاح مزوّد) الدرج سهوًا (DEC-04 وEXECUTION_PLAN.md ‏5).
import type { FunctionComponent } from 'preact';
import type { SettingsRegistry, SettingsStore } from '../core/settings';
import type { UnitId } from '../core/ui-host/units';

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
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [];

export const sectionsFor = (surface: SettingsSurface, sections: readonly SettingsSection[] = SETTINGS_SECTIONS): SettingsSection[] =>
  sections.filter((section) => (section.surfaces ?? DEFAULT_SECTION_SURFACES).includes(surface));

/** يعرّف إعدادات الأقسام في السجل (يمرَّر إلى createSettingsRegistry في كل سياق). */
export function defineSectionSettings(registry: SettingsRegistry, sections: readonly SettingsSection[] = SETTINGS_SECTIONS): void {
  for (const section of sections) section.define?.(registry);
}

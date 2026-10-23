// قسم الوحدة (أ) في SETTINGS_SECTIONS (src/options/sections.ts): يعرّف إعدادات ميزاتها في كل سياق، ويرسم ModuleASection.
import type { SettingsSection } from '../../../options/sections';
import { defineModuleASettings } from '../scope/module';
import { ModuleASection } from './ModuleASection';

export const MODULE_A_SECTION: SettingsSection = {
  id: 'a',
  unit: 'a',
  title: 'اتجاه عربي وقراءة مريحة',
  define: (registry) => defineModuleASettings(registry),
  component: ModuleASection,
};

// صفحة الإعدادات (options_ui): تبويب «الإعدادات والخصوصية» بعرض كامل.
import { extensionApi } from '../core/ui-host/browser-api';
import { mountExtensionPage, pageCapabilities } from './page';
import { SETTINGS_SECTIONS } from './sections';
import { SettingsTab } from './SettingsTab';

const capabilities = pageCapabilities(extensionApi(), __TARGET__);

void mountExtensionPage((settings) => (
  <main class="options-page">
    <header class="options-header">
      <h1>مِجهَر — الإعدادات والخصوصية</h1>
    </header>
    <SettingsTab settings={settings} surface="options" sections={SETTINGS_SECTIONS} {...capabilities} />
  </main>
));

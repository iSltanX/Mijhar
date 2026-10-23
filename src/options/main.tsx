// صفحة الإعدادات (options_ui): تبويب «الإعدادات والخصوصية» بعرض كامل.
//  - قسم رمز الوصول (MJ15، T-5.5) هنا وحده: يكتب الرمز في مخزنه الموثوق مباشرة، وتقرؤه الخلفية؛ والتحقق عبر منفذ الخلفية.
import { runtimePort } from '../core/api/port';
import { extensionApi } from '../core/ui-host/browser-api';
import { extensionTokenStore } from '../modules/d/token/store';
import { TokenSection } from '../modules/d/token/TokenSection';
import { mountExtensionPage, pageCapabilities } from './page';
import { SETTINGS_SECTIONS } from './sections';
import { SettingsTab } from './SettingsTab';

const api = extensionApi();
const capabilities = pageCapabilities(api, __TARGET__);
const tokenStore = extensionTokenStore();
const port = runtimePort(api.runtime);

void mountExtensionPage((settings) => (
  <main class="options-page">
    <header class="options-header">
      <h1>مِجهَر — الإعدادات والخصوصية</h1>
    </header>
    <SettingsTab settings={settings} surface="options" sections={SETTINGS_SECTIONS} {...capabilities} secretSections={<TokenSection store={tokenStore} port={port} target={__TARGET__} />} />
  </main>
));

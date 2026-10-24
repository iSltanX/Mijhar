// صفحة الإعدادات (options_ui): تبويب «الإعدادات والخصوصية» بعرض كامل.
//  - قسم رمز الوصول (MJ15، T-5.5) هنا وحده: يكتب الرمز في مخزنه الموثوق مباشرة، وتقرؤه الخلفية؛ والتحقق عبر منفذ الخلفية.
//  - دليل رمز GitHub (AD-29) صفحة داخل الإعدادات بعنوان #guide/github-token، فيعمل زر الرجوع في المتصفح؛ و#token يعيد إلى قسم الرمز
//    ويركّز مدخل الدليل الذي فُتح منه.
import { runtimePort } from '../core/api/port';
import { extensionApi } from '../core/ui-host/browser-api';
import { extensionTokenStore } from '../modules/d/token/store';
import { TokenSection } from '../modules/d/token/TokenSection';
import { OptionsApp } from './OptionsApp';
import { mountExtensionPage, pageCapabilities } from './page';
import { SETTINGS_SECTIONS } from './sections';
import { SettingsTab } from './SettingsTab';

const api = extensionApi();
const capabilities = pageCapabilities(api, __TARGET__);
const tokenStore = extensionTokenStore();
const port = runtimePort(api.runtime);

void mountExtensionPage((settings) => (
  <OptionsApp
    settings={(openOptionsAt) => (
      <SettingsTab
        settings={settings}
        surface="options"
        sections={SETTINGS_SECTIONS}
        {...capabilities}
        openOptionsAt={openOptionsAt}
        secretSections={<TokenSection store={tokenStore} port={port} target={__TARGET__} />}
      />
    )}
  />
));

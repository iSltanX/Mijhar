// صفحة الإعدادات (options_ui): تبويب «الإعدادات والخصوصية» بعرض كامل.
//  - سجل الاتصالات (MJ18، T-11.1) هنا وحده: بطاقة لكل اتصال بحالته من الخلفية. وجسم بطاقة رمز GitHub قسم الرمز (MJ15، T-5.5): يكتب الرمز
//    في مخزنه الموثوق مباشرة، وتقرؤه الخلفية؛ والتحقق عبر منفذ الخلفية.
//  - دليل رمز GitHub (AD-29) صفحة داخل الإعدادات بعنوان #guide/github-token، فيعمل زر الرجوع في المتصفح؛ و#token يعيد إلى قسم الرمز
//    ويركّز مدخل الدليل الذي فُتح منه.
//  - MJ21 (T-11.6): جسم بطاقة «مفتاح مزوّد التحليل» بطاقة المفتاح (KeySection): تكتب المفتاح في مخزنه الموثوق مباشرة، وتطلب صلاحية مضيف المزوّد
//    في نقرة الحفظ نفسها، والتحقق (قائمة المودلات) عبر منفذ الخلفية؛ و#guide/provider-key «لماذا المفتاح؟».
import { runtimePort } from '../core/api/port';
import { connectionSecretStore } from '../core/connections/keys';
import { runtimeConnectionsPort } from '../core/connections/port';
import { ConnectionsSection } from '../core/connections/ui/ConnectionsSection';
import { extensionApi } from '../core/ui-host/browser-api';
import { extensionTokenStore } from '../modules/d/token/store';
import { TokenSection } from '../modules/d/token/TokenSection';
import { ProviderHostPermission } from '../modules/e/provider/gate';
import { KeySection } from '../modules/e/provider/KeySection';
import { runtimeProviderPort } from '../modules/e/provider/port';
import { PROVIDERS } from '../modules/e/provider/registry';
import { OptionsApp } from './OptionsApp';
import { mountExtensionPage, pageCapabilities } from './page';
import { SETTINGS_SECTIONS } from './sections';
import { SettingsTab } from './SettingsTab';

const api = extensionApi();
const capabilities = pageCapabilities(api, __TARGET__);
const tokenStore = extensionTokenStore();
const port = runtimePort(api.runtime);
const connections = runtimeConnectionsPort(api.runtime);
const providerKeys = connectionSecretStore('provider-key');
const provider = runtimeProviderPort(api.runtime);
const providerPermission = api.permissions ? new ProviderHostPermission(api.permissions, PROVIDERS[0]?.origin ?? 'https://api.anthropic.com/*') : null;

void mountExtensionPage((settings) => (
  <OptionsApp
    settings={(openOptionsAt) => (
      <SettingsTab
        settings={settings}
        surface="options"
        sections={SETTINGS_SECTIONS}
        {...capabilities}
        openOptionsAt={openOptionsAt}
        secretSections={
          <ConnectionsSection
            connections={connections}
            body={(id, header, status, refresh) =>
              id === 'github-token' ? (
                <TokenSection store={tokenStore} port={port} target={__TARGET__} header={header} status={status} onChange={refresh} />
              ) : id === 'provider-key' && providerPermission ? (
                <KeySection store={providerKeys} port={provider} permission={providerPermission} target={__TARGET__} header={header} status={status} onChange={refresh} />
              ) : null
            }
          />
        }
      />
    )}
  />
));

// صفحة الإعدادات (options_ui): تبويب «الإعدادات والخصوصية» بعرض كامل.
//  - سجل الاتصالات (MJ18، T-11.1) هنا وحده: بطاقة لكل اتصال بحالته من الخلفية. وجسم بطاقة رمز GitHub قسم الرمز (MJ15، T-5.5): يكتب الرمز
//    في مخزنه الموثوق مباشرة، وتقرؤه الخلفية؛ والتحقق عبر منفذ الخلفية.
//  - دليل رمز GitHub (AD-29) صفحة داخل الإعدادات بعنوان #guide/github-token، فيعمل زر الرجوع في المتصفح؛ و#token يعيد إلى قسم الرمز
//    ويركّز مدخل الدليل الذي فُتح منه.
//  - MJ21 (T-11.6) وMJ23 (T-11.10): جسم بطاقة «مفتاح مزوّد التحليل» بطاقة «مزوّد التحليل» الموحّدة (ProviderCard): المزوّد ومفتاحه في مخزنه هو
//    (مفتاحاه المستقلان)، وصلاحية مضيفه في نقرة الحفظ نفسها، والتحقق (قائمة النماذج) عبر منفذ الخلفية، وحقل النموذج اليدوي وزر + والاختبار الاختياري (DEC-13 ن-5)؛ و#guide/provider-key «لماذا المفتاح؟».
//  - MJ22 (T-11.8): جسم بطاقة «صلاحية الكتابة في GitHub» (WriteTokenSection): تكتب رمز الكتابة في مخزنه المستقل (الجلسة وحدها) بنقرة موثوقة، ولا تتحقق
//    منه بطلب قراءة؛ ورمز القراءة يُقرأ هنا لرفض حفظه نفسه سرًّا للكتابة وحدها.
import { runtimePort } from '../core/api/port';
import { connectionSecretStore, providerSecretStore } from '../core/connections/keys';
import type { SecretStore } from '../core/connections/secrets';
import { runtimeConnectionsPort } from '../core/connections/port';
import { ConnectionsSection } from '../core/connections/ui/ConnectionsSection';
import { extensionApi } from '../core/ui-host/browser-api';
import { extensionTokenStore } from '../modules/d/token/store';
import { TokenSection } from '../modules/d/token/TokenSection';
import { ProviderCard } from '../modules/e/provider/ProviderCard';
import { WriteTokenSection } from '../modules/f/execution/WriteTokenSection';
import { runtimeProviderPort } from '../modules/e/provider/port';
import { OptionsApp } from './OptionsApp';
import { mountExtensionPage, pageCapabilities } from './page';
import { SETTINGS_SECTIONS } from './sections';
import { SettingsTab } from './SettingsTab';

const api = extensionApi();
const capabilities = pageCapabilities(api, __TARGET__);
const tokenStore = extensionTokenStore();
const port = runtimePort(api.runtime);
const connections = runtimeConnectionsPort(api.runtime);
// MJ23: مخزن مستقل لكل مزوّد يُنشأ مرة لمعرّفه؛ فلا يُكتب مفتاح مزوّد في مخزن غيره.
const providerStores = new Map<string, SecretStore>();
const providerKeys = (provider: string): SecretStore => {
  let store = providerStores.get(provider);
  if (!store) providerStores.set(provider, (store = providerSecretStore(provider)));
  return store;
};
const writeToken = connectionSecretStore('github-write');
const readToken = async (): Promise<string | null> => (await tokenStore.read())?.token ?? null;
const provider = runtimeProviderPort(api.runtime);

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
              ) : id === 'provider-key' && api.permissions ? (
                // Firefox: موافقة مشاركة محتوى المواقع (websiteContent) تُطلب مع صلاحية المضيف في نقرة الحفظ نفسها (AD-15).
                <ProviderCard settings={settings} port={provider} stores={providerKeys} permissions={api.permissions} target={__TARGET__} status={status} onChange={refresh} />
              ) : id === 'github-write' ? (
                <WriteTokenSection store={writeToken} readToken={readToken} permission={capabilities.permission ?? null} header={header} status={status} onChange={refresh} />
              ) : null
            }
          />
        }
      />
    )}
  />
));

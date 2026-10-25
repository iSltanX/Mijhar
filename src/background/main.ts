// الخلفية: service worker في عائلة Chromium وصفحة خلفية في Firefox.
//  - المستمعات تُسجَّل متزامنةً عند البدء (MV3: يوقظ الحدثُ الخلفيةَ ثم يُسلَّم لمستمع سُجّل في التقييم الأول).
//  - تملك الترحيل: تفتح المخزن مرحِّلةً، فيجد سكربت المحتوى (لا يرحّل) بياناته جاهزة.
//  - تطبّق تفضيل مكان اللوحة حيث يُقرأ متزامنًا وقت الأمر (commands.ts).
//  - الكاتب الوحيد لسجلات الملاحظات والمراسي (VR-01): تنفّذ رسائل الكتابة من كل السياقات في طابور واحد على مخزنها.
//  - تقرأ رمز الوصول الاختياري من مخزنه الموثوق لكل طلب (MJ15، T-5.5، AD-24)، ويضيف العميل ترويسته هنا وحده؛ فلا يعبر الرمز رسالة.
//  - سجل الاتصالات (MJ18، T-11.1): كل استجابة GitHub تمر بها تحدّث صحة الرمز (التحقق /rate_limit والاستعمال)، وتعرض الحالة بلا سرّ،
//    وتعيد المستخدم إلى الميزة التي طلبت الربط.
//  - طبقة المزوّد (MJ21، T-11.6): تقرأ مفتاح المزوّد من مخزنه لكل طلب وتضيفه إلى طلب المحوّل هنا وحده (لا رمز GitHub معه)، ولا طلب إلا
//    بالتحقق المعلن من الإعدادات أو بموافقة القسم؛ وتحترم موعد إعادة المحاولة المعلن ولا تكرر طلبًا جاريًا من القسم نفسه. MJ23 (T-11.10): لكل مزوّد
//    مخزن مفتاحه وصحته في سجل الاتصالات، والمحوّلات (ترويساتها ومساراتها) هنا وحدها (I-2).
//  - مسار الإنجاز (MJ22، T-11.8): تقرأ رمز الكتابة من مخزنه المستقل لخطوة التنفيذ وحدها، وتقبلها من صفحة الإضافة وحدها (من sender لا من
//    الرسالة)، وتكتب عبر بوابة الكتابة الثلاثية (src/core/guardrails/write-gate.ts). ولا يصل رمز الكتابة عميل القراءة ولا طبقة المزوّد ولا سجل
//    الاتصالات (يرى وقت حفظه ومكانه وحدهما).
// الاستيراد من الملفات مباشرة لا من ../core: الخلفية لا ترسم واجهة، فلا تحمل Preact.
import { extensionApi } from '../core/ui-host/browser-api';
import type { ExtensionApi } from '../core/ui-host/browser-api';
import { applySurface, isOpenOptionsMessage, openPanel, optionsPageUrl, PANEL_COMMAND, readSurfaceMirror } from '../core/ui-host/commands';
import type { PanelOutcome } from '../core/ui-host/commands';
import { openSettings } from '../core/ui-host/settings-runtime';
import type { OpenedSettings } from '../core/ui-host/settings-runtime';
import { createSettingsRegistry, requestPanelTab, SURFACE_KEY, WELCOME_KEY } from '../core/ui-host/units';
import type { Surface } from '../core/ui-host/units';
import type { StorageBinding } from '../core/storage';
import { defineSectionSettings } from '../options/sections';
import { openReaderFor } from '../modules/a/reading/background';
import { GLOSSARY_COMMAND, GLOSSARY_TAB } from '../modules/b/search/ids';
import { PublicApiClient } from '../core/api/client';
import { directPort, handlePublicApiRequest, isPublicApiRequest } from '../core/api/port';
import type { PublicApiPort } from '../core/api/port';
import type { PublicApiResult } from '../core/api/client';
import { extensionTokenStore } from '../modules/d/token/store';
import type { TokenStore } from '../modules/d/token/store';
import { READ_PERMISSIONS } from '../modules/d/token/format';
import { connectionSecretStore, providerSecretStore } from '../core/connections/keys';
import { isConnectionsRequest } from '../core/connections/port';
import { ConnectionsService, extensionHealthLog } from '../core/connections/service';
import type { HealthLog } from '../core/connections/service';
import type { SecretStore } from '../core/connections/secrets';
import { NotesBroker, openParts } from '../modules/g/notes/broker';
import { isProviderRequest } from '../modules/e/provider/port';
import { createProviderRegistry } from '../modules/e/provider/registry';
import { ProviderService, extensionModelsCache } from '../modules/e/provider/service';
import type { ModelsCache, ProviderKeyStore } from '../modules/e/provider/service';
import { PROVIDER_ID_KEY } from '../modules/e/provider/settings';
import type { ProviderAdapter } from '../modules/e/provider/types';
import { isNotesWriteRequest } from '../modules/g/notes/writer';
import { isExecutionRequest } from '../modules/f/execution/port';
import { handleReportRequest, isReportRequest, reportPermissions } from '../core/report/port';
import { scanText } from '../modules/e/privacy-check';
import { ExecutionService } from '../modules/f/execution/service';

export interface BackgroundOptions {
  readonly api?: ExtensionApi;
  readonly target?: 'chromium' | 'firefox';
  /** الافتراضي storage.local للإضافة. */
  readonly binding?: StorageBinding;
  /** fetch لطبقة API العامة (للاختبار). الافتراضي fetch العام. */
  readonly fetch?: typeof fetch;
  /** مخزن رمز الوصول (للاختبار). الافتراضي storage.session وIndexedDB الإضافة؛ null بلا رمز. */
  readonly tokens?: Pick<TokenStore, 'read' | 'info'> | null;
  /** مخزن مفتاح مزوّد التحليل الأول (Anthropic) بمفتاحيه التاريخيين (للاختبار)؛ null بلا مفتاح. وغيره من providerKeyStores أو مخزنه الافتراضي. */
  readonly providerKeys?: ProviderKeyStore | null;
  /** مخزن مفتاح كل مزوّد (للاختبار). الافتراضي مفتاحاه المستقلان لكل مزوّد (keys.ts). */
  readonly providerKeyStores?: (provider: string) => ProviderKeyStore | null;
  /** محوّلات المزوّدين (للاختبار بمحوّلات وهمية). الافتراضي سجل الخلفية. */
  readonly providerAdapters?: readonly ProviderAdapter[];
  /** fetch لطلبات المزوّد (للاختبار). الافتراضي fetch العام. */
  readonly providerFetch?: typeof fetch;
  /** مخزن رمز الكتابة (للاختبار). الافتراضي مفتاحاه المستقلان؛ null بلا رمز. */
  readonly writeToken?: Pick<SecretStore, 'info' | 'read'> | null;
  /** fetch لطلبات الكتابة (للاختبار). الافتراضي fetch العام. */
  readonly writeFetch?: typeof fetch;
  /** fetch لإرسال البلاغ (للاختبار). الافتراضي fetch العام. */
  readonly reportFetch?: typeof fetch;
  /** قائمة المودلات المقروءة (للاختبار). الافتراضي storage.session. */
  readonly modelsCache?: ModelsCache;
  /** سجل صحة الاتصالات (للاختبار). الافتراضي storage.session. */
  readonly healthLog?: HealthLog;
  /** انعكاس التفضيل المتزامن في Firefox. الافتراضي localStorage صفحة الخلفية. */
  readonly mirror?: Pick<Storage, 'getItem' | 'setItem'>;
  readonly onOutcome?: (outcome: PanelOutcome, detail?: string) => void;
}

export interface BackgroundHandle {
  readonly ready: Promise<OpenedSettings>;
}

export function startBackground(options: BackgroundOptions = {}): BackgroundHandle {
  const api = options.api ?? extensionApi();
  const target = options.target ?? __TARGET__;
  let surface: Surface | undefined;

  const panelDeps = () => ({ api, target, surface: () => readSurfaceMirror(options.mirror) ?? surface, ...(options.onOutcome ? { onOutcome: options.onOutcome } : {}) });
  // MJ26: زر شريط الأدوات يفتح اللوحة بمسار الاختصار نفسه (المكان المختار: اللوحة الأصلية أو الدرج)، متزامنًا داخل النقرة.
  api.action?.onClicked.addListener((tab) => openPanel(panelDeps(), tab));
  api.commands?.onCommand.addListener((command, tab) => {
    if (command === PANEL_COMMAND) openPanel(panelDeps(), tab);
    else if (command === GLOSSARY_COMMAND) {
      // MJ10 (T-3.4): يفتح اللوحة أو الدرج ولا يغلق ما هو مفتوح، ثم يطلب منها تبويب القاموس (تفتحه واللوحة تقرأ الطلب الحديث).
      openPanel(panelDeps(), tab, 'open');
      void ready.then(({ settings }) => requestPanelTab(settings, GLOSSARY_TAB)).catch((error: unknown) => console.error('[mijhar] تعذّر طلب تبويب القاموس', error));
    }
  });

  // MJ18 (T-11.1): سجل الاتصالات. مخزن كل سرّ يُقرأ منه وقت الحفظ ومكانه فقط، والصحة من الاستجابات التي تمر بالخلفية.
  const tokens = options.tokens === undefined ? extensionTokenStore() : options.tokens;
  const writeToken = options.writeToken === undefined ? connectionSecretStore('github-write') : options.writeToken;
  // MJ23 (T-11.10): مخزن مستقل لكل مزوّد، يُنشأ مرة لكل معرّف؛ ومفتاح الأول (Anthropic) في مفتاحيه التاريخيين (keys.ts).
  const providerRegistry = createProviderRegistry(options.providerAdapters);
  const keyStores = new Map<string, ProviderKeyStore | null>();
  const providerKeys = (provider: string): ProviderKeyStore | null => {
    if (!providerRegistry.byId(provider)) return null;
    if (!keyStores.has(provider)) {
      const store = options.providerKeyStores
        ? options.providerKeyStores(provider)
        : options.providerKeys !== undefined
          ? provider === providerRegistry.first.descriptor.id
            ? options.providerKeys
            : null
          : providerSecretStore(provider);
      keyStores.set(provider, store);
    }
    return keyStores.get(provider) ?? null;
  };
  const selectedProvider = async (): Promise<string> => {
    const id = (await ready.then(({ settings }) => settings.get<string>(PROVIDER_ID_KEY)).catch(() => null)) ?? null;
    return typeof id === 'string' && providerRegistry.byId(id) ? id : providerRegistry.first.descriptor.id;
  };
  const connections = new ConnectionsService({
    // MJ22: سجل الاتصالات يرى وقت حفظ رمز الكتابة ومكانه (info) وحدهما، لا قيمته.
    stores: { ...(tokens ? { 'github-token': tokens } : {}), ...(writeToken ? { 'github-write': { info: () => writeToken.info() } } : {}) },
    // MJ23: ومفتاح كل مزوّد (وقت حفظه ومكانه) والمختار منها.
    providerKeys: { selected: selectedProvider, store: (provider) => providerKeys(provider) },
    log: options.healthLog ?? extensionHealthLog(),
    fixable: READ_PERMISSIONS.map((p) => p.param),
    api,
    onError: (error) => console.error('[mijhar] تعذّر حفظ صحة الاتصالات', error),
  });

  // MJ11 (T-5.2): طبقة GitHub REST العامة لسكربت المحتوى. العميل يُنشأ عند أول طلب، وحالته (الحد وETag) في ذاكرة الخلفية وحدها.
  // MJ15 (T-5.5): الرمز يُقرأ من مخزنه عند كل طلب، فيُكشف حفظه أو مسحه من صفحة الإعدادات دون رسالة تحمله.
  // MJ18 (T-11.1): كل نتيجة تُسجَّل في صحة الرمز قبل أن يُرد بها، فتقرأ الإعدادات حالة متسقة بعد تحققها.
  let publicApi: PublicApiPort | null = null;
  const apiPort = (): PublicApiPort | null => {
    if (!api.permissions) return null;
    if (publicApi) return publicApi;
    const token = tokens ? async () => (await tokens.read())?.token ?? null : undefined;
    const client = new PublicApiClient({ permissions: api.permissions, ...(options.fetch ? { fetch: options.fetch } : {}), ...(token ? { token } : {}) });
    const direct = directPort(client, api.permissions);
    const observe = async <R extends PublicApiResult<unknown>>(path: string, result: R): Promise<R> => {
      const { expiresAt } = await client.auth().catch(() => ({ expiresAt: null }));
      await connections.observeGithub(path, result, expiresAt).catch((error: unknown) => console.error('[mijhar] تعذّر تسجيل صحة الرمز', error));
      return result;
    };
    publicApi = {
      status: () => direct.status(),
      get: async (path) => observe(path, await direct.get(path)),
      getAll: async (path, key, maxPages) => observe(path, await direct.getAll(path, key, maxPages)),
    };
    return publicApi;
  };

  // AD-29: التثبيت الأول وحده يجهّز الترحيب لأول فتح للوحة؛ والتحديث لا يعيده. يُسجَّل في التقييم الأول (MV3).
  api.runtime.onInstalled?.addListener((details) => {
    if (details.reason !== 'install') return;
    void ready.then(({ settings }) => settings.set(WELCOME_KEY, 'pending')).catch((error: unknown) => console.error('[mijhar] تعذّر تجهيز الترحيب', error));
  });

  // MJ21 (T-11.6): طبقة المزوّد. المفتاح يُقرأ من مخزنه لكل طلب، والإعدادات (المزوّد والمودل) من المخزن بعد فتحه.
  const provider = new ProviderService({
    registry: providerRegistry,
    keys: providerKeys,
    permissions: api.permissions ?? null,
    ...(options.providerFetch ? { fetch: options.providerFetch } : {}),
    connections,
    // Firefox: لا تحليل دون موافقة مشاركة محتوى المواقع الاختيارية (AD-15)؛ والتحقق (قائمة المودلات) لا يحمل محتوى فلا يحتاجها.
    contentPermission: target === 'firefox' ? { data_collection: ['websiteContent'] } : null,
    settings: () => ready.then(({ settings }) => settings),
    cache: options.modelsCache ?? extensionModelsCache(),
    onError: (error) => console.error('[mijhar] طبقة المزوّد', error),
  });

  // MJ22 (T-11.8): خطوة التنفيذ. رمز الكتابة يصلها وحدها، ورمز القراءة لمقارنتهما وحدها (سرّان مختلفان).
  const execution = new ExecutionService({
    writeToken,
    readToken: tokens,
    permissions: api.permissions ?? null,
    ...(options.writeFetch ? { fetch: options.writeFetch } : {}),
    connections,
    onError: (error) => console.error('[mijhar] مسار الإنجاز', error),
  });
  // صفحة من الإضافة نفسها (اللوحة الأصلية أو الإعدادات)، لا سكربت محتوى في صفحة GitHub ولا الدرج.
  const extensionOrigin = api.runtime.getURL('');
  const fromExtensionPage = (sender: { url?: string }): boolean => typeof sender.url === 'string' && sender.url.startsWith(extensionOrigin);

  // VR-01: الوسيط ينتظر فتح المخزن (ومعه الترحيل) قبل أول كتابة.
  const notesBroker = new NotesBroker(() => ready.then(({ store }) => openParts(store)));

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isNotesWriteRequest(message)) {
      void notesBroker.handle(message).then(sendResponse);
      return true;
    }
    if (isPublicApiRequest(message)) {
      const port = apiPort();
      if (!port) return undefined;
      // sendResponse مع true: الرد غير المتزامن في عائلة Chromium وFirefox معًا.
      void handlePublicApiRequest(message, port).then(sendResponse, (error: unknown) => sendResponse({ ok: false, failure: 'network', status: null, message: String(error), retryAt: null, readAt: Date.now(), rate: null }));
      return true;
    }
    if (isProviderRequest(message)) {
      // التبويب من sender لا من الرسالة: طلب واحد جارٍ لكل قسم في التبويب. MJ23: والتحقق والفحص من صفحات الإضافة وحدها (من sender).
      void provider.handle(message, String(sender.tab?.id ?? sender.url ?? 'extension'), fromExtensionPage(sender)).then(sendResponse, () => sendResponse(null));
      return true;
    }
    if (isExecutionRequest(message)) {
      void execution.handle(message, fromExtensionPage(sender)).then(sendResponse, () => sendResponse(null));
      return true;
    }
    if (isReportRequest(message)) {
      // MJ26 (DEC-12 ي-1): البلاغ من صفحة الإضافة وحدها (من sender)، وبصلاحية مضيف القناة (ومعها في Firefox موافقة technicalAndInteraction) لحظة الطلب.
      const reportFetch = options.reportFetch ?? fetch;
      void handleReportRequest(message, fromExtensionPage(sender), {
        fetch: (input, init) => reportFetch(input, init),
        granted: () => api.permissions?.contains(reportPermissions(target)) ?? Promise.resolve(false),
      }, (text) => scanText(text).length > 0).then(sendResponse, () => sendResponse({ ok: false, failure: 'network', status: null }));
      return true;
    }
    if (isConnectionsRequest(message)) {
      void connections.handle(message).then(sendResponse, () => sendResponse(null));
      return true;
    }
    if (isOpenOptionsMessage(message)) {
      // MJ18 (T-11.1): ميزة طلبت الربط تُحفظ مع تبويب المرسل (من sender لا من الرسالة) للعودة إليها.
      if (message.feature !== undefined) connections.setPending(sender.tab, message.feature);
      // AD-29: موضع من القائمة المغلقة يُفتح في تبويب جديد؛ وما عداه صفحة الإعدادات نفسها.
      const url = message.target === undefined ? null : optionsPageUrl((path) => api.runtime.getURL(path), message.target);
      if (url && api.tabs) void api.tabs.create({ url });
      else void api.runtime.openOptionsPage?.();
    } else openReaderFor(api, message, sender); // MJ7 (T-2.5): وضع القراءة يفتح العارض في تبويب
    return undefined;
  });

  const ready = openSettings({
    registry: createSettingsRegistry((registry) => defineSectionSettings(registry)),
    ...(options.binding ? { binding: options.binding } : {}),
  });
  void ready.then(
    ({ settings }) => {
      const apply = (value: Surface): void => {
        surface = value;
        applySurface({ api, target }, value, options.mirror).catch((error: unknown) => console.error('[mijhar] تعذّر تطبيق مكان اللوحة', error));
      };
      apply(settings.get<Surface>(SURFACE_KEY));
      settings.subscribe((change) => {
        if (change.key === SURFACE_KEY) apply(change.value as Surface);
      });
      // VR-04: استرداد مرة بعد فتح التخزين لمراسٍ بقيت بعد حذف ملاحظاتها (من نسخة سابقة أو انقطاع).
      notesBroker.pruneOrphans().catch((error: unknown) => console.error('[mijhar] تعذّر تنظيف المراسي اليتيمة', error));
    },
    (error: unknown) => console.error('[mijhar] تعذّر فتح التخزين في الخلفية', error),
  );
  return { ready };
}

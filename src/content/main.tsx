// سكربت المحتوى في صفحات https://github.com/*: الاكتشاف ودورة الحياة ومفاتيح الوحدات والدرج.
//  - مستمع رسائل الدرج يُسجَّل فورًا، والفتح ينتظر الإعدادات إن لم تكن جاهزة.
//  - مفاتيح الوحدات (modules.<a..h>.enabled) تركّب الوحدات وتزيلها في الصفحة المفتوحة عند تغيّرها من أي سياق.
//  - الدرج لا يطلب صلاحية ولا يعرض حقل سرّ: ما يحتاج ذلك يُفتح في صفحة الإعدادات.
//  - يجيب اللوحة الأصلية بوصف الصفحة من DOM (جسر VR-10): فرع الملف ومساره لا يُعرفان من الرابط وحده.
import { BUILTIN_MODULES, bindModuleToggles, createModuleRegistry, createSettingsRegistry, Drawer, extensionApi, isDrawerMessage, isModuleEnabled, LifecycleManager, OPEN_OPTIONS_MESSAGE, openSettings, PageDetector } from '../core';
import type { ExtensionApi, ExtensionModule, LifecycleManagerOptions, OpenedSettings, StorageBinding } from '../core';
import { connectModuleA } from '../modules/a/scope/module';
import { defineSectionSettings, SETTINGS_SECTIONS } from '../options/sections';
import { respondPageInfo } from '../shared/page/page-source';
import { PanelApp } from '../sidepanel/PanelApp';

export interface ContentOptions {
  readonly api?: ExtensionApi;
  readonly document?: Document;
  readonly modules?: readonly ExtensionModule[];
  /** الافتراضي storage.local للإضافة. */
  readonly binding?: StorageBinding;
  readonly lifecycle?: Pick<LifecycleManagerOptions, 'onError' | 'onReconcile' | 'onRestore'>;
}

export interface ContentHandle {
  readonly ready: Promise<{ opened: OpenedSettings; manager: LifecycleManager; drawer: Drawer }>;
}

export function startContent(options: ContentOptions = {}): ContentHandle {
  const api = options.api ?? extensionApi();
  const doc = options.document ?? document;
  const opened = openSettings({
    migrate: false,
    registry: createSettingsRegistry((registry) => defineSectionSettings(registry)),
    ...(options.binding ? { binding: options.binding } : {}),
  });

  const ready = opened.then((handle) => {
    const { settings } = handle;
    // إعدادات ميزات الوحدة (أ) يعرّفها قسمها في SETTINGS_SECTIONS؛ وتصل إلى الوحدة بالربط قبل التركيب (MJ7).
    connectModuleA(settings);
    const openOptions = () => void api.runtime.sendMessage({ type: OPEN_OPTIONS_MESSAGE });
    const drawer = new Drawer({
      document: doc,
      content: () => <PanelApp surface="drawer" settings={settings} sections={SETTINGS_SECTIONS} openOptions={openOptions} />,
    });
    const manager = new LifecycleManager({
      registry: createModuleRegistry(options.modules ?? BUILTIN_MODULES),
      detector: new PageDetector({ document: doc }),
      isEnabled: (id) => isModuleEnabled(settings, id),
      document: doc,
      ...options.lifecycle,
    });
    manager.start();
    bindModuleToggles(settings, manager);
    return { opened: handle, manager, drawer };
  });
  // يُسجَّل في التقييم الأول نفسه؛ رسالة تصل قبل جاهزية الإعدادات تنتظرها.
  api.runtime.onMessage.addListener((message) => {
    if (isDrawerMessage(message)) void ready.then(({ drawer }) => drawer[message.action]());
    return undefined;
  });
  respondPageInfo(api.runtime, doc);
  ready.catch((error: unknown) => console.error('[mijhar] تعذّر بدء سكربت المحتوى', error));
  return { ready };
}

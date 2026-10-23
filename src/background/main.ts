// الخلفية: service worker في عائلة Chromium وصفحة خلفية في Firefox.
//  - المستمعات تُسجَّل متزامنةً عند البدء (MV3: يوقظ الحدثُ الخلفيةَ ثم يُسلَّم لمستمع سُجّل في التقييم الأول).
//  - تملك الترحيل: تفتح المخزن مرحِّلةً، فيجد سكربت المحتوى (لا يرحّل) بياناته جاهزة.
//  - تطبّق تفضيل مكان اللوحة حيث يُقرأ متزامنًا وقت الأمر (commands.ts).
// الاستيراد من الملفات مباشرة لا من ../core: الخلفية لا ترسم واجهة، فلا تحمل Preact.
import { extensionApi } from '../core/ui-host/browser-api';
import type { ExtensionApi } from '../core/ui-host/browser-api';
import { applySurface, OPEN_OPTIONS_MESSAGE, openPanel, PANEL_COMMAND, readSurfaceMirror } from '../core/ui-host/commands';
import type { PanelOutcome } from '../core/ui-host/commands';
import { openSettings } from '../core/ui-host/settings-runtime';
import type { OpenedSettings } from '../core/ui-host/settings-runtime';
import { createSettingsRegistry, SURFACE_KEY } from '../core/ui-host/units';
import type { Surface } from '../core/ui-host/units';
import type { StorageBinding } from '../core/storage';
import { defineSectionSettings } from '../options/sections';
import { openReaderFor } from '../modules/a/reading/background';
import { PublicApiClient } from '../core/api/client';
import { directPort, handlePublicApiRequest, isPublicApiRequest } from '../core/api/port';
import type { PublicApiPort } from '../core/api/port';

export interface BackgroundOptions {
  readonly api?: ExtensionApi;
  readonly target?: 'chromium' | 'firefox';
  /** الافتراضي storage.local للإضافة. */
  readonly binding?: StorageBinding;
  /** fetch لطبقة API العامة (للاختبار). الافتراضي fetch العام. */
  readonly fetch?: typeof fetch;
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

  api.commands?.onCommand.addListener((command, tab) => {
    if (command !== PANEL_COMMAND) return;
    openPanel({ api, target, surface: () => readSurfaceMirror(options.mirror) ?? surface, ...(options.onOutcome ? { onOutcome: options.onOutcome } : {}) }, tab);
  });

  // MJ11 (T-5.2): طبقة GitHub REST العامة لسكربت المحتوى. العميل يُنشأ عند أول طلب، وحالته (الحد وETag) في ذاكرة الخلفية وحدها.
  let publicApi: PublicApiPort | null = null;
  const apiPort = (): PublicApiPort | null => {
    if (!api.permissions) return null;
    publicApi ??= directPort(new PublicApiClient({ permissions: api.permissions, ...(options.fetch ? { fetch: options.fetch } : {}) }), api.permissions);
    return publicApi;
  };

  api.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isPublicApiRequest(message)) {
      const port = apiPort();
      if (!port) return undefined;
      // sendResponse مع true: الرد غير المتزامن في عائلة Chromium وFirefox معًا.
      void handlePublicApiRequest(message, port).then(sendResponse, (error: unknown) => sendResponse({ ok: false, failure: 'network', status: null, message: String(error), retryAt: null, readAt: Date.now(), rate: null }));
      return true;
    }
    if (typeof message === 'object' && message !== null && (message as { type?: unknown }).type === OPEN_OPTIONS_MESSAGE) void api.runtime.openOptionsPage?.();
    else openReaderFor(api, message, sender); // MJ7 (T-2.5): وضع القراءة يفتح العارض في تبويب
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
    },
    (error: unknown) => console.error('[mijhar] تعذّر فتح التخزين في الخلفية', error),
  );
  return { ready };
}

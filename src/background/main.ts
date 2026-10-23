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

export interface BackgroundOptions {
  readonly api?: ExtensionApi;
  readonly target?: 'chromium' | 'firefox';
  /** الافتراضي storage.local للإضافة. */
  readonly binding?: StorageBinding;
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

  api.runtime.onMessage.addListener((message) => {
    if (typeof message === 'object' && message !== null && (message as { type?: unknown }).type === OPEN_OPTIONS_MESSAGE) void api.runtime.openOptionsPage?.();
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

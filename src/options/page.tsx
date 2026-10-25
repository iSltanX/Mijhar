// تهيئة صفحات الإضافة (الإعدادات واللوحة الجانبية الأصلية): فتح المخزن بالترحيل، وقدرات الصفحة، وحالة الخطأ.
import { render } from 'preact';
import type { ComponentChild } from 'preact';
import type { SettingsStore } from '../core/settings';
import type { ExtensionApi } from '../core/ui-host/browser-api';
import { ApiGithubPermission } from '../core/ui-host/permissions';
import { openSettings } from '../core/ui-host/settings-runtime';
import { createSettingsRegistry } from '../core/ui-host/units';
import { registerUiFonts } from '../shared/ui/fonts';
import { BASE_CSS } from '../shared/ui/tokens';
import { defineSectionSettings } from './sections';
import type { ShortcutsCapability } from './SettingsTab';

/** صفحة اختصارات الإضافات. Edge وBrave يحوّلان chrome:// إلى عنوانهما. */
export const CHROMIUM_SHORTCUTS_URL = 'chrome://extensions/shortcuts';

export interface PageCapabilities {
  readonly permission?: ApiGithubPermission;
  readonly shortcuts?: ShortcutsCapability;
}

export function pageCapabilities(api: ExtensionApi, target: 'chromium' | 'firefox'): PageCapabilities {
  const commands = api.commands;
  const shortcuts: ShortcutsCapability | undefined = commands
    ? {
        getAll: () => commands.getAll(),
        openSettings: () => {
          if (target === 'firefox' && commands.openShortcutSettings) void commands.openShortcutSettings();
          else void api.tabs?.create({ url: CHROMIUM_SHORTCUTS_URL });
        },
      }
    : undefined;
  return {
    ...(api.permissions ? { permission: new ApiGithubPermission(api.permissions) } : {}),
    ...(shortcuts ? { shortcuts } : {}),
  };
}

const PAGE_CSS = `
html, body { margin: 0; padding: 0; }
body { background: #ffffff; }
@media (prefers-color-scheme: dark) { body { background: #171c22; } }
.mj-root.page { min-height: 100vh; }
.mj-root .about-brand { display: flex; align-items: center; gap: var(--mijhar-space-12); }
.mj-root .about-brand .label { display: flex; flex-direction: column; gap: 2px; }
.mj-root .about-name { font-family: var(--mijhar-font-display); font-size: 20px; line-height: 32px; }
.mj-root .about h3 { margin-top: var(--mijhar-space-8); }
`;

/** أنماط الصفحة والرموز، وخطّا الهوية المضمّنان. */
export function installStyles(doc: Document): void {
  const style = doc.createElement('style');
  style.textContent = `${PAGE_CSS}\n${BASE_CSS}`;
  doc.head.append(style);
  registerUiFonts(doc);
}

/** يفتح الإعدادات ثم يرسم الصفحة؛ وإن تعذّر فتح التخزين عرض الخطأ بدل صفحة فارغة. */
export async function mountExtensionPage(view: (settings: SettingsStore) => ComponentChild, doc: Document = document): Promise<SettingsStore | null> {
  installStyles(doc);
  const container = doc.getElementById('app');
  if (!container) throw new Error('الصفحة بلا #app');
  try {
    const { settings } = await openSettings({ registry: createSettingsRegistry((registry) => defineSectionSettings(registry)) });
    render(view(settings), container);
    container.setAttribute('data-ready', 'true');
    return settings;
  } catch (error) {
    render(
      <p class="notice" data-tone="danger" role="alert">
        تعذّر فتح إعدادات مِجهَر: {error instanceof Error ? error.message : String(error)}
      </p>,
      container,
    );
    container.setAttribute('data-ready', 'error');
    return null;
  }
}

// اللوحة الجانبية الأصلية: side_panel في عائلة Chromium وsidebar_action في Firefox. تطبيق اللوحة نفسه الذي يرسمه الدرج.
import { extensionApi } from '../core/ui-host/browser-api';
import { optionsPageUrl } from '../core/ui-host/commands';
import type { OptionsTarget } from '../core/ui-host/commands';
import { mountExtensionPage, pageCapabilities } from '../options/page';
import { SETTINGS_SECTIONS } from '../options/sections';
import { PanelApp } from './PanelApp';

const api = extensionApi();
const capabilities = pageCapabilities(api, __TARGET__);
// AD-29: الترحيب والإعدادات في اللوحة يفتحان صفحة الإعدادات على موضعها في تبويب جديد.
const openOptionsAt = (target: OptionsTarget): void => {
  const url = optionsPageUrl((path) => api.runtime.getURL(path), target);
  if (url && api.tabs) void api.tabs.create({ url });
  else void api.runtime.openOptionsPage?.();
};

void mountExtensionPage((settings) => <PanelApp surface="native" settings={settings} sections={SETTINGS_SECTIONS} openOptionsAt={openOptionsAt} {...capabilities} />);

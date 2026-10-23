// اللوحة الجانبية الأصلية: side_panel في عائلة Chromium وsidebar_action في Firefox. تطبيق اللوحة نفسه الذي يرسمه الدرج.
import { extensionApi } from '../core/ui-host/browser-api';
import { mountExtensionPage, pageCapabilities } from '../options/page';
import { SETTINGS_SECTIONS } from '../options/sections';
import { PanelApp } from './PanelApp';

const capabilities = pageCapabilities(extensionApi(), __TARGET__);

void mountExtensionPage((settings) => <PanelApp surface="native" settings={settings} sections={SETTINGS_SECTIONS} {...capabilities} />);

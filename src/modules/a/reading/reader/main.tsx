// نقطة دخول العارض (reader.html): صفحة إضافة في تبويب، رقم التبويب المصدر في عنوانها (?tab=). الإعدادات تُفتح كما في صفحة
// الإعدادات (mountExtensionPage)، واللقطة تُطلب من سكربت المحتوى في التبويب المصدر.
import { extensionApi } from '../../../../core/ui-host/browser-api';
import { mountExtensionPage } from '../../../../options/page';
import { sourceTabFrom } from '../messages';
import { ReaderApp } from './ReaderApp';

const api = extensionApi();

void mountExtensionPage((settings) => <ReaderApp settings={settings} api={api} target={__TARGET__} tabId={sourceTabFrom(location.search)} />);

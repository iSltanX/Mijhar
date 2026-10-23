// فتح العارض من الخلفية (T-2.5): سكربت المحتوى لا يفتح تبويبًا، فيطلبه من الخلفية؛ والعارض لا يحتاج أن يكون مورد ويب متاحًا.
// التبويب الجديد بجوار المصدر وopenerTabId له، ورقم المصدر في عنوانه ليطلب منه اللقطة مباشرة (tabs.sendMessage).
// يُستدعى من مستمع الرسائل الوحيد في الخلفية (src/background/main.ts) فلا يُسجَّل مستمع ثانٍ.
import type { ExtensionApi, TabLike } from '../../../core/ui-host/browser-api';
import { isReadingOpen, readerUrl } from './messages';

interface TabsCreate {
  create(properties: { url: string; index?: number; openerTabId?: number; active?: boolean }): Promise<TabLike>;
}

/** يفتح العارض إن كانت الرسالة طلب فتحه من تبويب، ويعيد هل عالجها. */
export function openReaderFor(api: ExtensionApi, message: unknown, sender: { tab?: TabLike }): boolean {
  if (!isReadingOpen(message)) return false;
  const tab = sender.tab as (TabLike & { index?: number }) | undefined;
  const tabs = api.tabs as unknown as TabsCreate | undefined;
  if (!tab?.id || !tabs) return true;
  void tabs
    .create({ url: readerUrl((path) => api.runtime.getURL(path), tab.id), ...(typeof tab.index === 'number' ? { index: tab.index + 1 } : {}), openerTabId: tab.id, active: true })
    .catch((error: unknown) => console.error('[mijhar] تعذّر فتح وضع القراءة', error));
  return true;
}

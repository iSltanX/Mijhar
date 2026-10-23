// يربط مفاتيح تشغيل الوحدات بمدير دورة الحياة: أي تغيّر في modules.<id>.enabled (محلي أو وارد من سياق آخر)
// يوفّق الوحدات المركَّبة. يعيد دالة فك الربط.
import type { LifecycleManager } from '../lifecycle';
import type { SettingsStore } from './settings';

export function bindModuleToggles(settings: SettingsStore, manager: LifecycleManager): () => void {
  return settings.subscribe((change) => {
    if (change.key.startsWith('modules.') && change.key.endsWith('.enabled')) manager.refresh();
  });
}

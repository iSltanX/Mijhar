// ربط إعداد بمكوّن Preact: القيمة الفعلية متزامنة من SettingsStore، وتتبع التغيّر من هذا السياق وغيره.
import { useEffect, useState } from 'preact/hooks';
import type { JsonValue, SettingsStore } from '../../core/settings';

export function useSetting<T extends JsonValue>(settings: SettingsStore, key: string): T {
  const [value, setValue] = useState<T>(() => settings.get<T>(key));
  useEffect(() => {
    setValue(settings.get<T>(key));
    return settings.subscribe((change) => {
      if (change.key === key) setValue(change.value as T);
    });
  }, [settings, key]);
  return value;
}

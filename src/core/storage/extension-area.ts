// محوّل منطقة storage.local في المتصفح الحقيقي إلى واجهة الطبقة. يفضّل browser (Firefox) ثم chrome.
// الواجهات الموعودة (promise) متاحة في MV3 في Chrome وFirefox؛ لا نغلّف callback.
import type { ChangeSource, StorageBinding, StorageChanges, StorageAreaLike, StorageValues } from './area';

export interface ExtensionLocalArea {
  get(keys: string | string[] | null): Promise<StorageValues>;
  set(items: StorageValues): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  getBytesInUse?(keys: string | string[] | null): Promise<number>;
}

export interface ExtensionStorageApi {
  local: ExtensionLocalArea;
  onChanged: {
    addListener(listener: (changes: StorageChanges, areaName: string) => void): void;
    removeListener(listener: (changes: StorageChanges, areaName: string) => void): void;
  };
}

export function defaultStorageApi(): ExtensionStorageApi {
  const scope = globalThis as { browser?: { storage?: ExtensionStorageApi }; chrome?: { storage?: ExtensionStorageApi } };
  const storage = scope.browser?.storage ?? scope.chrome?.storage;
  if (!storage?.local) throw new Error('واجهة storage غير متاحة: يجب أن تُستعمل الطبقة داخل سياق إضافة بصلاحية storage');
  return storage;
}

/** يربط منطقة local وأحداث تغيّرها (مصفّاة إلى local وحدها). */
export function extensionStorage(api: ExtensionStorageApi = defaultStorageApi()): StorageBinding {
  const wrappers = new Map<(changes: StorageChanges) => void, (changes: StorageChanges, areaName: string) => void>();
  const area: StorageAreaLike = {
    get: (keys) => api.local.get(keys),
    set: (items) => api.local.set(items),
    remove: (keys) => api.local.remove(keys),
    ...(api.local.getBytesInUse ? { getBytesInUse: (keys: string | string[] | null) => api.local.getBytesInUse?.(keys) as Promise<number> } : {}),
  };
  const changes: ChangeSource = {
    addListener(listener) {
      const wrapper = (change: StorageChanges, areaName: string): void => {
        if (areaName === 'local') listener(change);
      };
      wrappers.set(listener, wrapper);
      api.onChanged.addListener(wrapper);
    },
    removeListener(listener) {
      const wrapper = wrappers.get(listener);
      if (!wrapper) return;
      wrappers.delete(listener);
      api.onChanged.removeListener(wrapper);
    },
  };
  return { area, changes };
}

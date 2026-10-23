// واجهة منطقة التخزين التي تعتمد عليها الطبقة، فلا تعتمد على chrome.* مباشرة وتُختبر على منطقة ذاكرية.
// المحوِّل الفعلي لـchrome.storage.local / browser.storage.local في extension-area.ts.

export type StorageValues = Record<string, unknown>;

export interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export type StorageChanges = Record<string, StorageChange>;

export interface StorageAreaLike {
  /** null = كل المفاتيح. */
  get(keys: string | string[] | null): Promise<StorageValues>;
  set(items: StorageValues): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  getBytesInUse?(keys: string | string[] | null): Promise<number>;
}

/** مصدر أحداث التغيّر (storage.onChanged مصفّى لمنطقة local): يصل كل السياقات المفتوحة بما فيها الكاتب. */
export interface ChangeSource {
  addListener(listener: (changes: StorageChanges) => void): void;
  removeListener(listener: (changes: StorageChanges) => void): void;
}

export interface StorageBinding {
  area: StorageAreaLike;
  changes: ChangeSource;
}

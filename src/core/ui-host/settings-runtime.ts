// فتح المخزن والإعدادات في سياق فعلي. سياقات الإضافة (الخلفية واللوحة والإعدادات) ترحّل؛ وسكربت المحتوى لا يرحّل،
// فإن وجد بيانات لم تُرحَّل بعد أو عملية جارية أعاد المحاولة ريثما تُتمّها الخلفية (تفتح المخزن عند بدئها).
import { SettingsStore } from '../settings';
import type { SettingsRegistry } from '../settings';
import { Store, StorageBusyError, StorageNotMigratedError, extensionStorage } from '../storage';
import type { StorageBinding } from '../storage';
import { createSettingsRegistry } from './units';

export interface OpenSettingsOptions {
  readonly migrate?: boolean;
  readonly registry?: SettingsRegistry;
  readonly binding?: StorageBinding;
  /** محاولات سكربت المحتوى عند StorageNotMigratedError أو StorageBusyError. الافتراضي 6. */
  readonly attempts?: number;
  readonly delayMs?: (attempt: number) => number;
}

export interface OpenedSettings {
  readonly store: Store;
  readonly settings: SettingsStore;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function openSettings(options: OpenSettingsOptions = {}): Promise<OpenedSettings> {
  const binding = options.binding ?? extensionStorage();
  const migrate = options.migrate ?? true;
  const attempts = migrate ? 1 : (options.attempts ?? 6);
  const delay = options.delayMs ?? ((attempt: number) => 150 * attempt);
  for (let attempt = 1; ; attempt += 1) {
    try {
      const store = await Store.open({ area: binding.area, changes: binding.changes, migrate });
      const settings = await SettingsStore.open(store, options.registry ?? createSettingsRegistry());
      return { store, settings };
    } catch (error) {
      const retriable = error instanceof StorageNotMigratedError || error instanceof StorageBusyError;
      if (!retriable || attempt >= attempts) throw error;
      await sleep(delay(attempt));
    }
  }
}

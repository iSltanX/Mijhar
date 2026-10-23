// سياق الوحدة (ح) في التخزين: الإعدادات والمخزن، يُفتحان كسولًا في كل سياق ويُذاكران، ومستودع الموارد فوقهما.
// سكربت المحتوى لا يرحّل (صفحة https)؛ وصفحات الإضافة ترحّل.
import { useEffect, useState } from 'preact/hooks';
import type { SettingsStore } from '../../core/settings';
import type { Store } from '../../core/storage';
import { createSettingsRegistry, openSettings } from '../../core/ui-host';
import BUILTIN from '../../data/resources/resources.json';
import { parseResourceFile } from './resources/model';
import type { Category, Resource } from './resources/model';
import { ResourcesRepository } from './resources/repository';
import { defineCommunitySettings } from './settings';

export interface CommunityContext {
  readonly settings: SettingsStore;
  readonly store: Store;
}

export type CommunityContextProvider = () => Promise<CommunityContext>;

const isExtensionPage = (): boolean => typeof location !== 'undefined' && /^(chrome|moz|ms-browser)-extension:$/.test(location.protocol);

async function openDefault(): Promise<CommunityContext> {
  return openSettings({ migrate: isExtensionPage(), registry: createSettingsRegistry(defineCommunitySettings) });
}

let provider: CommunityContextProvider = openDefault;
let cached: Promise<CommunityContext> | null = null;
let cachedResources: Promise<ResourcesRepository> | null = null;

/** يستبدل مزوّد السياق (للاختبارات)، أو يعيد الافتراضي بـnull. */
export function connectCommunity(next: CommunityContextProvider | null): void {
  provider = next ?? openDefault;
  cached = null;
  cachedResources = null;
}

export function communityContext(): Promise<CommunityContext> {
  cached ??= provider().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}

/** القائمة المضمّنة بعد التحقق من مخططها؛ عناصرها كلها صالحة (يثبته الاختبار). */
export function builtinResources(): { readonly resources: readonly Resource[]; readonly categories: readonly Category[] } {
  const parsed = parseResourceFile(BUILTIN);
  return parsed.ok ? { resources: parsed.file.resources, categories: parsed.file.categories } : { resources: [], categories: [] };
}

export function resourcesRepository(): Promise<ResourcesRepository> {
  cachedResources ??= communityContext().then(({ store }) => {
    const { resources, categories } = builtinResources();
    return ResourcesRepository.open(store, resources, { categories });
  });
  cachedResources.catch(() => {
    cachedResources = null;
  });
  return cachedResources;
}

export type LoadState<T> = { readonly status: 'loading' } | { readonly status: 'ready'; readonly value: T } | { readonly status: 'error'; readonly message: string };

export function useLoaded<T>(load: () => Promise<T>): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    load().then(
      (value) => alive && setState({ status: 'ready', value }),
      (error: unknown) => alive && setState({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}

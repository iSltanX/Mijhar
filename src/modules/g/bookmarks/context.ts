// سياق «أكمل لاحقًا» في التخزين: مستودع الروابط ومستودع الملاحظات (للمركز الذي يجمعهما) والإعدادات. يُفتح كسولًا عند أول استعمال
// في كل سياق ويُذاكَر، على نمط سياق الملاحظات. سكربت المحتوى (صفحة https) لا يرحّل؛ وصفحات الإضافة ترحّل. وكتابة الملاحظات
// عبر الخلفية (VR-01).
import { useEffect, useState } from 'preact/hooks';
import type { SettingsStore } from '../../../core/settings';
import type { Store } from '../../../core/storage';
import { createSettingsRegistry, extensionApi, openSettings } from '../../../core/ui-host';
import { NotesRepository } from '../notes/repository';
import { defineNotesSettings } from '../notes/settings';
import { runtimeNotesWriter } from '../notes/writer';
import { BookmarksRepository } from './repository';
import { defineBookmarksSettings } from './settings';

export interface LaterContext {
  readonly store: Store;
  readonly settings: SettingsStore;
  readonly bookmarks: BookmarksRepository;
  readonly notes: NotesRepository;
}

export type LaterContextProvider = () => Promise<LaterContext>;

const isExtensionPage = (): boolean => typeof location !== 'undefined' && /^(chrome|moz|ms-browser)-extension:$/.test(location.protocol);

async function openDefault(): Promise<LaterContext> {
  const registry = createSettingsRegistry((r) => {
    defineNotesSettings(r);
    defineBookmarksSettings(r);
  });
  const { store, settings } = await openSettings({ migrate: isExtensionPage(), registry });
  // الخلفية الكاتب الوحيد للملاحظات والروابط (AD-25، MJ-TA-03).
  const writer = runtimeNotesWriter(extensionApi().runtime);
  const [bookmarks, notes] = await Promise.all([BookmarksRepository.open(store, { writer }), NotesRepository.open(store, { writer })]);
  return { store, settings, bookmarks, notes };
}

let provider: LaterContextProvider = openDefault;
let cached: Promise<LaterContext> | null = null;

/** يستبدل مزوّد السياق (للاختبارات)، أو يعيد الافتراضي بـnull. يُسقط السياق المذاكَر. */
export function connectLater(next: LaterContextProvider | null): void {
  provider = next ?? openDefault;
  cached = null;
}

export function laterContext(): Promise<LaterContext> {
  cached ??= provider().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}

export type LaterContextState = { readonly status: 'loading' } | { readonly status: 'ready'; readonly context: LaterContext } | { readonly status: 'error'; readonly message: string };

export function useLaterContext(): LaterContextState {
  const [state, setState] = useState<LaterContextState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    laterContext().then(
      (context) => alive && setState({ status: 'ready', context }),
      (error: unknown) => alive && setState({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** الروابط المحفوظة كلها وتحديثها الحي من أي سياق. */
export function useBookmarks(repository: BookmarksRepository) {
  const [list, setList] = useState(() => repository.list());
  useEffect(() => {
    setList(repository.list());
    return repository.subscribe(() => setList(repository.list()));
  }, [repository]);
  return list;
}

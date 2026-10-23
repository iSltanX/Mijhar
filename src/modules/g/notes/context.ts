// سياق الوحدة (ز) في التخزين: مستودع الملاحظات وإعدادات الوحدة. يُفتح كسولًا عند أول استعمال في كل سياق (سكربت المحتوى
// واللوحة والدرج)، ويُذاكَر فلا يُفتح مرتين؛ فلا يحتاج الربط تعديلًا في سكربت المحتوى ولا اللوحة المشتركين.
// سكربت المحتوى (صفحة https) لا يرحّل ولا يستردّ؛ وصفحات الإضافة (اللوحة والإعدادات) ترحّل. والكتابة في الاثنين عبر الخلفية (VR-01).
import { useEffect, useState } from 'preact/hooks';
import type { SettingsStore } from '../../../core/settings';
import { createSettingsRegistry, extensionApi, openSettings } from '../../../core/ui-host';
import { NotesRepository } from './repository';
import { defineNotesSettings } from './settings';
import { runtimeNotesWriter } from './writer';

export interface NotesContext {
  readonly repository: NotesRepository;
  readonly settings: SettingsStore;
}

export type NotesContextProvider = () => Promise<NotesContext>;

const isExtensionPage = (): boolean => typeof location !== 'undefined' && /^(chrome|moz|ms-browser)-extension:$/.test(location.protocol);

async function openDefault(): Promise<NotesContext> {
  const { store, settings } = await openSettings({ migrate: isExtensionPage(), registry: createSettingsRegistry(defineNotesSettings) });
  return { repository: await NotesRepository.open(store, { writer: runtimeNotesWriter(extensionApi().runtime) }), settings };
}

let provider: NotesContextProvider = openDefault;
let cached: Promise<NotesContext> | null = null;

/** يستبدل مزوّد السياق (للاختبارات)، أو يعيد الافتراضي بـnull. يُسقط السياق المذاكَر. */
export function connectNotes(next: NotesContextProvider | null): void {
  provider = next ?? openDefault;
  cached = null;
}

export function notesContext(): Promise<NotesContext> {
  cached ??= provider().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}

export type NotesContextState = { readonly status: 'loading' } | { readonly status: 'ready'; readonly context: NotesContext } | { readonly status: 'error'; readonly message: string };

export function useNotesContext(): NotesContextState {
  const [state, setState] = useState<NotesContextState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    notesContext().then(
      (context) => alive && setState({ status: 'ready', context }),
      (error: unknown) => alive && setState({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

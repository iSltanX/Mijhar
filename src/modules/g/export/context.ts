// سياق أدوات البيانات: يعيد استعمال سياق «أكمل لاحقًا» (المخزن ومستودعا الملاحظات والروابط، وتُفتح الملاحظات بكاتب الخلفية) ويضيف كاتب
// الرسائل. كل كتابة من أدوات البيانات تمر به إلى الخلفية؛ لا يُفتح هنا مخزن للكتابة ولا يُكتب شيء محليًا (AD-25).
import { useEffect, useState } from 'preact/hooks';
import { extensionApi } from '../../../core/ui-host';
import { laterContext } from '../bookmarks/context';
import { runtimeNotesWriter } from '../notes/writer';
import type { DataToolsDeps } from './ui/DataTools';

export type ExportDepsProvider = () => Promise<DataToolsDeps>;

async function openDefault(): Promise<DataToolsDeps> {
  const { store, notes, bookmarks } = await laterContext();
  const writer = runtimeNotesWriter(extensionApi().runtime);
  return {
    store,
    writer,
    subscribe: (listener) => {
      const stops = [notes.subscribe(listener), bookmarks.subscribe(listener)];
      return () => stops.forEach((stop) => stop());
    },
  };
}

let provider: ExportDepsProvider = openDefault;
let cached: Promise<DataToolsDeps> | null = null;

/** يستبدل المزوّد (للاختبارات)، أو يعيد الافتراضي بـnull. */
export function connectExport(next: ExportDepsProvider | null): void {
  provider = next ?? openDefault;
  cached = null;
}

export function exportDeps(): Promise<DataToolsDeps> {
  cached ??= provider().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}

export type ExportDepsState = { readonly status: 'loading' } | { readonly status: 'ready'; readonly deps: DataToolsDeps } | { readonly status: 'error'; readonly message: string };

export function useExportDeps(): ExportDepsState {
  const [state, setState] = useState<ExportDepsState>({ status: 'loading' });
  useEffect(() => {
    let alive = true;
    exportDeps().then(
      (deps) => alive && setState({ status: 'ready', deps }),
      (error: unknown) => alive && setState({ status: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

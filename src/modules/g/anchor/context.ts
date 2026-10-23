// مخزن المراسي في السياق: يُفتح كسولًا فوق مخزن «أكمل لاحقًا» نفسه ويُذاكَر، فلا يُفتح Store ثالث في سكربت المحتوى. وحفظ المراسي
// وتنظيفها عبر الخلفية (VR-01).
import { extensionApi } from '../../../core/ui-host';
import { laterContext } from '../bookmarks/context';
import { runtimeNotesWriter } from '../notes/writer';
import { AnchorStore } from './store';

export type AnchorStoreProvider = () => Promise<AnchorStore>;

const openDefault: AnchorStoreProvider = () => laterContext().then(({ store }) => AnchorStore.open(store, { writer: runtimeNotesWriter(extensionApi().runtime) }));

let provider: AnchorStoreProvider = openDefault;
let cached: Promise<AnchorStore> | null = null;

/** يستبدل المزوّد (للاختبارات)، أو يعيد الافتراضي بـnull. */
export function connectAnchors(next: AnchorStoreProvider | null): void {
  provider = next ?? openDefault;
  cached = null;
}

export function anchorStore(): Promise<AnchorStore> {
  cached ??= provider().catch((error: unknown) => {
    cached = null;
    throw error;
  });
  return cached;
}

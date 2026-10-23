// «أكمل لاحقًا» في تبويب «ملاحظاتي» من اللوحة الأصلية: الحفظ السريع للتبويب النشط (بموضع السطر من الرابط؛ موضع التمرير يُحفظ من
// زر الصفحة نفسها)، ومركز البحث والتصفية والفرز في الملاحظات والروابط. الدرج لا يعرض حقول كتابة، فتظهر فيه رسالة تدل على اللوحة.
import { useMemo } from 'preact/hooks';
import type { PanelView, PanelViewProps } from '../../../sidepanel/views';
import { NativeOnlyNotice } from '../../../shared/ui/NativeOnlyNotice';
import { extensionTabs, pageInfoFromUrl, tabsPageSource, useActivePage } from '../../../shared/page';
import type { PageSource } from '../../../shared/page';
import { bookmarkDraftFromPage } from './capture';
import { useLaterContext } from './context';
import type { LaterContext } from './context';
import { LaterCenter } from './ui/LaterCenter';
import { QuickSave } from './ui/QuickSave';

export interface LaterViewOptions {
  readonly source?: () => PageSource | null;
  readonly now?: () => Date;
}

function Loaded({ context, source, now }: { context: LaterContext; source: PageSource | null; now?: () => Date }) {
  const { page, ready } = useActivePage(source);
  const current = page ?? pageInfoFromUrl('about:blank');
  const savable = ready && bookmarkDraftFromPage(current) !== null;
  return (
    <div data-later-view="">
      {savable && <QuickSave repository={context.bookmarks} page={current} capture={() => bookmarkDraftFromPage(current)} mode="panel" />}
      <LaterCenter notes={context.notes} bookmarks={context.bookmarks} {...(now ? { now } : {})} />
      <p class="muted small" data-later-privacy="">
        روابطك وملاحظاتك محفوظة محليًا في هذا المتصفح، والبحث فيها يجري على الجهاز دون أي طلب شبكي.
      </p>
    </div>
  );
}

export function createLaterView(options: LaterViewOptions = {}) {
  return function LaterView(_props: PanelViewProps) {
    const state = useLaterContext();
    const source = useMemo(() => (options.source ?? (() => tabsPageSource(extensionTabs())))(), []);
    if (state.status === 'loading') {
      return (
        <p class="muted" role="status" data-later-state="loading">
          جارٍ فتح «أكمل لاحقًا»…
        </p>
      );
    }
    if (state.status === 'error') {
      return (
        <p class="notice" data-tone="danger" role="alert">
          تعذّر فتح «أكمل لاحقًا»: {state.message}
        </p>
      );
    }
    return <Loaded context={state.context} source={source} {...(options.now ? { now: options.now } : {})} />;
  };
}

export const LaterView = createLaterView();

const LaterDrawerNotice = () => <NativeOnlyNotice feature="أكمل لاحقًا والبحث في ملاحظاتك" extra="زر «أكمل لاحقًا» يظهر أيضًا أعلى صفحة GitHub نفسها." />;

export const LATER_PANEL_VIEWS: readonly PanelView[] = [
  { id: 'g-later', tab: 'notes', unit: 'g', title: 'ملاحظاتي وأكمل لاحقًا', surfaces: ['native'], component: LaterView },
  { id: 'g-later-drawer', tab: 'notes', unit: 'g', title: 'ملاحظاتي وأكمل لاحقًا', surfaces: ['drawer'], component: LaterDrawerNotice },
];

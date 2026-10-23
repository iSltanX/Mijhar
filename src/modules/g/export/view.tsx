// واجهة التصدير والاستيراد والحذف في تبويب «ملاحظاتي» من اللوحة الأصلية (T-8.4)، وتنبيه الجهاز المشترك في الدرج. الدرج المحقون لا يعرض حقول
// إدخال (DEC-04)، فلا يحمل أدوات الملف؛ ويحمل التنبيه ومكان التخزين لأنهما يخصان كل من يراها.
import { NativeOnlyNotice } from '../../../shared/ui/NativeOnlyNotice';
import type { PanelView } from '../../../sidepanel/views';
import { useExportDeps } from './context';
import { DataTools } from './ui/DataTools';
import { SharedDeviceNotice } from './ui/SharedDeviceNotice';

function Tools() {
  const state = useExportDeps();
  if (state.status === 'loading') {
    return (
      <p class="muted" role="status" data-export-state="loading">
        جارٍ فتح أدوات البيانات…
      </p>
    );
  }
  if (state.status === 'error') {
    return (
      <p class="notice" data-tone="danger" role="alert">
        تعذّر فتح أدوات البيانات: {state.message}
      </p>
    );
  }
  return <DataTools deps={state.deps} />;
}

export function ExportView() {
  return (
    <section class="section" data-view="export-tools" aria-labelledby="mj-export-title">
      <h3 id="mj-export-title">التصدير والاستيراد والحذف</h3>
      <SharedDeviceNotice />
      <Tools />
    </section>
  );
}

function ExportDrawerNotice() {
  return (
    <section class="section" data-view="export-drawer" aria-labelledby="mj-export-drawer-title">
      <h3 id="mj-export-drawer-title">بياناتك وخصوصيتها</h3>
      <SharedDeviceNotice />
      <NativeOnlyNotice feature="التصدير والاستيراد والحذف" />
    </section>
  );
}

export const EXPORT_PANEL_VIEW: PanelView = { id: 'g-export', tab: 'notes', unit: 'g', title: 'التصدير والاستيراد والحذف', surfaces: ['native'], component: ExportView };
export const EXPORT_DRAWER_VIEW: PanelView = { id: 'g-export-drawer', tab: 'notes', unit: 'g', title: 'بياناتك وخصوصيتها', surfaces: ['drawer'], component: ExportDrawerNotice };

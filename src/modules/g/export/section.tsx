// قسم التخزين والتصدير في «الإعدادات والخصوصية» (T-8.4): مكان التخزين المحلي وتنبيه الجهاز المشترك في صفحة الإعدادات وفي تبويب الإعدادات من اللوحة الأصلية،
// وأدوات التصدير والاستيراد والاستعادة والحذف في صفحة الإعدادات الكاملة وحدها (اللوحة تحملها في تبويب «ملاحظاتي»). القسم لا يظهر في الدرج المحقون
// (الافتراضي: DEFAULT_SECTION_SURFACES)؛ والدرج يحمل التنبيه في تبويب «ملاحظاتي» (view.tsx).
// بلا preact/compat: الخلفية تستورد SETTINGS_SECTIONS فتحمل ما يستورده القسم.
import type { SettingsSection, SettingsSectionProps } from '../../../options/sections';
import { useExportDeps } from './context';
import { DataTools } from './ui/DataTools';
import { SharedDeviceNotice } from './ui/SharedDeviceNotice';

function OptionsTools() {
  const state = useExportDeps();
  if (state.status === 'loading') {
    return (
      <p class="muted" role="status">
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

function ExportSection({ surface, unitEnabled }: SettingsSectionProps) {
  return (
    <>
      {!unitEnabled && <p class="muted">الوحدة (ز) موقوفة؛ بياناتك المحفوظة تبقى، وأدوات التصدير والحذف تعمل عليها.</p>}
      <SharedDeviceNotice />
      {surface === 'options' ? (
        <OptionsTools />
      ) : (
        <p class="muted small" data-export-pointer="">
          أدوات التصدير والاستيراد والاستعادة والحذف في تبويب «ملاحظاتي» من اللوحة الجانبية الأصلية، وفي صفحة الإعدادات الكاملة.
        </p>
      )}
    </>
  );
}

export const EXPORT_SETTINGS_SECTION: SettingsSection = {
  id: 'g-export',
  unit: 'g',
  title: 'التخزين المحلي والتصدير (الوحدة ز)',
  component: ExportSection,
};

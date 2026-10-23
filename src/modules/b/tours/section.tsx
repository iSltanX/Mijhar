// قسم الجولات في «الإعدادات والخصوصية»: مفتاح الجولات وبيان ما تفعله وما لا تفعله.
import { moduleEnabledKey } from '../../../core/settings';
import type { SettingsRegistry } from '../../../core/settings';
import { Toggle } from '../../../shared/ui';
import { useSetting } from '../../../shared/ui/useSetting';
import type { SettingsSection, SettingsSectionProps } from '../../../options/sections';
import { TOURS_MODULE_ID } from './ids';

function ToursSection({ settings }: SettingsSectionProps) {
  const key = moduleEnabledKey(TOURS_MODULE_ID);
  const enabled = useSetting<boolean>(settings, key);
  return (
    <>
      <div class="toggle-row" data-setting={key}>
        <label class="label" for="mj-b-tours">
          <strong>الجولات الإرشادية</strong>
          <span class="muted small">خمس عشرة جولة تُبرز عناصر الصفحة المفتوحة وتشرحها بشريط عائم، وتبدأ من تبويب «القاموس» في اللوحة.</span>
        </label>
        <Toggle id="mj-b-tours" checked={enabled} label="الجولات الإرشادية" onChange={(value) => void settings.set(key, value)} />
      </div>
      <p class="muted small">
        الجولات قرائية آمنة: لا تنقر على أي زر في GitHub ولا ترسل نموذجًا ولا تنتقل بك إلى صفحة؛ رابط «افتح صفحة الخطوة» تضغطه أنت. وما غاب عنصره عن الصفحة (لصلاحية أو لأنه في صفحة
        أخرى) تشرح سبب غيابه ولا تخمّن عنصرًا. الجولات التي تخص إعدادات حساسة (خصوصية الحساب والمصادقة الثنائية ومفاتيح SSH وحماية الفرع والظهور والحذف) شرح بصري فقط: لا تقرأ الجولة
        صفحتها ولا تُبرز فيها شيئًا. تعمل محليًا بلا شبكة.
      </p>
    </>
  );
}

export const TOURS_SECTION: SettingsSection = {
  id: 'b-tours',
  unit: 'b',
  title: 'الجولات الإرشادية (الوحدة ب)',
  define: (registry: SettingsRegistry) => registry.defineModuleToggle(TOURS_MODULE_ID, true, 'الجولات الإرشادية'),
  component: ToursSection,
};

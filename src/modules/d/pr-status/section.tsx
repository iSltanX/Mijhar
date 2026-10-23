// قسم الوحدة (د) في «الإعدادات والخصوصية»: مفتاحا ملخص حالة طلب الدمج وملخص المقارنة، وبيان ما يقرؤه كل منهما وما يطلبه من الشبكة.
import { moduleEnabledKey } from '../../../core/settings';
import type { SettingsRegistry, SettingsStore } from '../../../core/settings';
import { Ltr, Toggle } from '../../../shared/ui';
import { useSetting } from '../../../shared/ui/useSetting';
import type { SettingsSection, SettingsSectionProps } from '../../../options/sections';
import { COMPARE_MODULE_ID, PR_STATUS_MODULE_ID } from './ids';
import { LOG_MODULE_ID } from '../log-parser/ids';

const FEATURES = [
  { id: PR_STATUS_MODULE_ID, title: 'ملخص حالة طلب الدمج', note: 'بطاقة في صفحة محادثة الطلب: الفرعان والالتزامات والملفات والأسطر والمراجعات والتعارضات والفحوص بتصنيفاتها السبعة.' },
  { id: COMPARE_MODULE_ID, title: 'ملخص المقارنة', note: 'في صفحة مقارنة فرعين أو التزامين أو وسمين: إحصاء الملفات المصنَّف، وقسم منفصل لتفسير الأثر يحتاج مراجعة بشرية.' },
  {
    id: LOG_MODULE_ID,
    title: 'شرح سجل الفحص',
    note: 'في صفحة مهمة Actions فاشلة: الرسالة الحرفية وموضعها، والسبب الجذري حين يطابق نمطًا حتميًا فقط، واحتمالات موسومة تحتاج تحققًا.',
  },
] as const;

function FeatureToggle({ settings, feature }: { settings: SettingsStore; feature: (typeof FEATURES)[number] }) {
  const key = moduleEnabledKey(feature.id);
  const enabled = useSetting<boolean>(settings, key);
  const id = `mj-${feature.id.replace('.', '-')}`;
  return (
    <div class="toggle-row" data-setting={key}>
      <label class="label" for={id}>
        <strong>{feature.title}</strong>
        <span class="muted small">{feature.note}</span>
      </label>
      <Toggle id={id} checked={enabled} label={feature.title} onChange={(value) => void settings.set(key, value)} />
    </div>
  );
}

function StatusSection({ settings }: SettingsSectionProps) {
  return (
    <>
      {FEATURES.map((feature) => (
        <FeatureToggle key={feature.id} settings={settings} feature={feature} />
      ))}
      <p class="muted small">
        يقرأ مِجهَر ما تعرضه الصفحة وحده، وما لا تعرضه يظهر «غير متاح» ولا يُخمَّن. وحين لا تعرض صفحة الطلب صفوف الفحوص يطلب من <Ltr className="mono">github.com</Ltr> نفسه
        الجزء الذي تطلبه الصفحة بنفسها (طلب واحد لكل التزام، بلا رمز ولا ترويسة تعريفية)، ولا يتصل بـ<Ltr className="mono">api.github.com</Ltr> هنا.
      </p>
    </>
  );
}

export const PR_STATUS_SECTION: SettingsSection = {
  id: 'd-status',
  unit: 'd',
  title: 'حالة الطلب والمقارنة (الوحدة د)',
  surfaces: ['options', 'native', 'drawer'],
  define: (registry: SettingsRegistry) => {
    registry.defineModuleToggle(PR_STATUS_MODULE_ID, true, 'ملخص حالة طلب الدمج');
    registry.defineModuleToggle(COMPARE_MODULE_ID, true, 'ملخص المقارنة');
    registry.defineModuleToggle(LOG_MODULE_ID, true, 'شرح سجل الفحص');
  },
  component: StatusSection,
};

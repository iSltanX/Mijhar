// قسم الوحدة (د) في «الإعدادات والخصوصية»: مفاتيح ملخص حالة طلب الدمج وملخص المقارنة وشرح السجل، وعتبة التقادم (PP-01)، وبيان ما يقرؤه
// كل منها وما يطلبه من الشبكة.
import { moduleEnabledKey } from '../../../core/settings';
import type { SettingsRegistry, SettingsStore } from '../../../core/settings';
import { Ltr, Toggle } from '../../../shared/ui';
import { useSetting } from '../../../shared/ui/useSetting';
import type { SettingsSection, SettingsSectionProps, SettingsSurface } from '../../../options/sections';
import { COMPARE_MODULE_ID, PR_STATUS_MODULE_ID } from './ids';
import { LOG_MODULE_ID } from '../log-parser/ids';
import { STALE_MINUTES_DEFAULT, STALE_MINUTES_KEY, defineDStatusSettings, isStaleMinutes } from './settings';

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

const STALE_CHOICES = [1, 2, 3, 5, 10, 15, 30, 60] as const;

function StaleThreshold({ settings, surface }: { settings: SettingsStore; surface: SettingsSurface }) {
  const stored = useSetting<number>(settings, STALE_MINUTES_KEY);
  const value = isStaleMinutes(stored) ? stored : STALE_MINUTES_DEFAULT;
  const choices = STALE_CHOICES.includes(value as (typeof STALE_CHOICES)[number]) ? STALE_CHOICES : [...STALE_CHOICES, value].sort((a, b) => a - b);
  // الدرج داخل الصفحة بلا أي عنصر إدخال (قاعدة MJ5 وفحص MJ9)؛ فتُعرض القيمة قراءةً فقط وتُعدَّل من اللوحة الأصلية أو صفحة الإعدادات.
  if (surface === 'drawer') {
    return (
      <div class="toggle-row" data-setting={STALE_MINUTES_KEY}>
        <span class="label">
          <strong>عتبة تقادم بيانات الفحوص</strong>
          <span class="muted small">
            {value} {value === 1 ? 'دقيقة' : 'دقائق'} — تُعدَّل من اللوحة الجانبية الأصلية أو صفحة الإعدادات.
          </span>
        </span>
      </div>
    );
  }
  return (
    <div class="toggle-row" data-setting={STALE_MINUTES_KEY}>
      <label class="label" for="mj-d-stale">
        <strong>عتبة تقادم بيانات الفحوص</strong>
        <span class="muted small">تُعلَن البيانات «قد تكون قديمة» إن مضت هذه المدة على آخر قراءة دون تحديث حي في الصفحة.</span>
      </label>
      <select
        id="mj-d-stale"
        value={String(value)}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (isStaleMinutes(next)) void settings.set(STALE_MINUTES_KEY, next);
        }}
      >
        {choices.map((minutes) => (
          <option key={minutes} value={String(minutes)}>
            {minutes} {minutes === 1 ? 'دقيقة' : 'دقائق'}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatusSection({ settings, surface }: SettingsSectionProps) {
  return (
    <>
      {FEATURES.map((feature) => (
        <FeatureToggle key={feature.id} settings={settings} feature={feature} />
      ))}
      <StaleThreshold settings={settings} surface={surface} />
      <p class="muted small">
        يقرأ مِجهَر ما تعرضه الصفحة، وما لا يجده يظهر «غير متاح» ولا يُخمَّن. وحين لا تعرض صفحة الطلب صفوف الفحوص يطلب من <Ltr className="mono">github.com</Ltr> نفسه
        الجزء الذي تطلبه الصفحة بنفسها (طلب واحد لكل التزام، بلا رمز ولا ترويسة تعريفية). ولا يتصل بـ<Ltr className="mono">api.github.com</Ltr> إلا إن منحتَ صلاحيته الاختيارية
        ثم نقرتَ «أكمل من GitHub API العامة» في بطاقة الطلب: طلبات قراءة من خلفية الإضافة للطلب وفحوصه وحالاته وحماية فرعه (أربعة، وتزيد إن طالت قائمة
        الفحوص أو احتاج الرمز قراءة مهام Actions)، يُرفق بها رمز القراءة إن حفظته وإلا فهي عامة بلا رمز، وتُحترم فيها حدود الطلبات المعلنة. وشرح السجل لا يقرأ
        سجل الخطوة إلا بنقرك، بطلب واحد إلى <Ltr className="mono">github.com</Ltr> نفسه.
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
    defineDStatusSettings(registry);
  },
  component: StatusSection,
};

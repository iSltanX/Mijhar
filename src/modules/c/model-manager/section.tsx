// قسم «نموذج الترجمة» في «الإعدادات والخصوصية» (T-4.4، F-C5، DEC-03 ج-2): الحجم والوجهة والحذف كما هي حقًا تحت ج-2. صفحة الإعدادات لا تسأل المتصفح عن الحزمة
// (Translator API ثبت في سكربت المحتوى وحده، T-0.2)، فالقسم يشرح ويعرض جدول حالات الحزمة ولا يدّعي حالة اللحظة؛ وحالتها الحية تظهر في بطاقة الاستئذان وعند الضغط.
import type { SettingsSection, SettingsSectionProps } from '../../../options/sections';
import { describeModel } from './model';
import type { ModelInfo } from './model';

/** حالات الحزمة التي يعلنها المتصفح، كما تُعرض للمستخدم. */
const STATES: readonly ModelInfo[] = [describeModel('downloadable'), describeModel('downloading'), describeModel('available'), describeModel('unavailable'), describeModel(null)];

function ModelSection(_props: SettingsSectionProps) {
  const sample = describeModel('available');
  return (
    <>
      <p>
        <strong>حزمة لغة الترجمة المحلية</strong>
      </p>
      <p class="muted small">
        لا تنزّل الإضافة أي نموذج ولا تخزّنه. الترجمة المحلية تعتمد على مترجم المتصفح المدمج، وحزمة اللغة (إنجليزي ← عربي) ينزّلها المتصفح نفسه ويخزّنها ويديرها. لا ينزَّل شيء عند
        التثبيت أو فتح الصفحة؛ وأول ما يظهر عند ضغطك «ترجمة» والحزمة غير منزّلة بطاقة تطلب موافقتك قبل أن يبدأ المتصفح التنزيل.
      </p>
      <dl class="small">
        <dt>الحجم</dt>
        <dd>{sample.size}. المتصفح لا يعلن حجم الحزمة، فلا يُعرض رقم من خارج ما يعلنه.</dd>
        <dt>الوجهة</dt>
        <dd>{sample.destination}.</dd>
        <dt>الاتصال</dt>
        <dd>{describeModel('downloadable').connection}. ولا ترسل الإضافة نص الصفحة إلى أي جهة في أي حال.</dd>
        <dt>الحذف</dt>
        <dd>{sample.deletion}.</dd>
        <dt>الإلغاء</dt>
        <dd>زر «إلغاء» أثناء الترجمة يوقف ما تنتظره الإضافة؛ أما التنزيل نفسه فيديره المتصفح خارج سيطرتها.</dd>
        <dt>الأخطاء</dt>
        <dd>انقطاع الاتصال وامتلاء القرص وعدم دعم المتصفح تظهر برسالة واضحة في شريط الترجمة، ويبقى النص الأصلي كما هو.</dd>
      </dl>
      <p class="muted small">الحالات التي قد تراها:</p>
      <ul class="small">
        {STATES.map((info) => (
          <li key={info.state}>{info.stateLabel}.</li>
        ))}
      </ul>
    </>
  );
}

export const MODEL_SECTION: SettingsSection = {
  id: 'c-model',
  unit: 'c',
  title: 'نموذج الترجمة (الوحدة ج)',
  component: ModelSection,
};

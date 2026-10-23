// قسم الوحدة (و) في «الإعدادات والخصوصية»: ما يفعله مساعد الكتابة وما لا يفعله. مفتاح التشغيل هو مفتاح الوحدة (و) في أول الصفحة.
import type { SettingsSection, SettingsSectionProps } from '../../../options/sections';

function ComposerSection(_props: SettingsSectionProps) {
  return (
    <>
      <p>
        <strong>مساعد كتابة البلاغات والمراجعات</strong>
      </p>
      <p class="muted small">
        يضع زر «مساعد» في شريط أدوات حقل الكتابة في صفحات البلاغات وطلبات الدمج. تنظّم اللوحة المتوقع والفعلي وخطوات التكرار والبيئة والأدلة بعناوين، وتعرض معاينة كاملة قبل
        الإدراج، ثم تُدرج النص عند المؤشر أو بالإلحاق دون مسح مسودتك، مع لقطة تراجع وزر «التراجع عن آخر إدراج».
      </p>
      <p class="muted small">
        لا ينشر شيئًا ولا يرسل شيئًا: أنت من يضغط زر الإرسال. يعمل محليًا بلا شبكة ولا نموذج، ولا يحفظ ما تكتبه في اللوحة ولا مسودة الحقل في أي مكان.
      </p>
    </>
  );
}

export const COMPOSER_SECTION: SettingsSection = {
  id: 'f-composer',
  unit: 'f',
  title: 'مساعد الكتابة (الوحدة و)',
  component: ComposerSection,
};

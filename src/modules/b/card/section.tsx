// قسم الوحدة (ب) في «الإعدادات والخصوصية»: مفتاح بطاقة الشرح وبيان كيف تُفعَّل وما تفعله ولا تفعله.
import { moduleEnabledKey } from '../../../core/settings';
import type { SettingsRegistry } from '../../../core/settings';
import { Toggle } from '../../../shared/ui';
import { useSetting } from '../../../shared/ui/useSetting';
import type { SettingsSection, SettingsSectionProps } from '../../../options/sections';
import { CARD_MODULE_ID } from './ids';
import { EXPLAIN_SHORTCUT } from './mode';

function CardSection({ settings }: SettingsSectionProps) {
  const key = moduleEnabledKey(CARD_MODULE_ID);
  const enabled = useSetting<boolean>(settings, key);
  return (
    <>
      <div class="toggle-row" data-setting={key}>
        <label class="label" for="mj-b-card">
          <strong>بطاقة الشرح</strong>
          <span class="muted small">تشرح العناصر المعروفة في صفحات GitHub بمستويات ثلاثة وبيانات قرار (متى تُستخدم، الأثر، الحساسية، الصلاحية، التراجع).</span>
        </label>
        <Toggle id="mj-b-card" checked={enabled} label="بطاقة الشرح" onChange={(value) => void settings.set(key, value)} />
      </div>
      <p class="muted small">
        تُفعَّل بالاختصار <kbd>{EXPLAIN_SHORTCUT}</kbd> (افتراضي مؤقت) أو بزر «وضع الشرح» في تبويب القاموس. تعمل محليًا بلا شبكة، ولا يُلصق شرح بعنصر لا
        يُتعرَّف عليه بثقة كافية. المصطلح الإنجليزي يبقى ظاهرًا بجوار العربي دائمًا.
      </p>
    </>
  );
}

export const CARD_SECTION: SettingsSection = {
  id: 'b-card',
  unit: 'b',
  title: 'بطاقة الشرح (الوحدة ب)',
  surfaces: ['options', 'native', 'drawer'],
  define: (registry: SettingsRegistry) => registry.defineModuleToggle(CARD_MODULE_ID, true, 'بطاقة الشرح السياقية'),
  component: CardSection,
};

// قسم «نسخ البرومبت» في «الإعدادات والخصوصية» (T-11.3): مفتاح ظهور الزر في الأقسام، والقالب الافتراضي، وحد أسطر السياق (PP-03) الذي عرّفته الطبقة المشتركة
// (T-11.2) لمن يعرض البرومبت، وبيان ما يفعله الزر وما لا يفعله. الزر لا يحتاج مفتاحًا ولا رمزًا ولا يتصل بشيء.
// السطحان الافتراضيان (صفحة الإعدادات واللوحة الأصلية) لا الدرج داخل الصفحة: لا يُضاف قسم إلى الدرج هنا، فتبقى أقسامه كما اعتمدتها MJ8 (اختبار «قسمان» في MJ8).
import type { ComponentChildren } from 'preact';
import { moduleEnabledKey } from '../../../core/settings';
import type { SettingsRegistry } from '../../../core/settings';
import { Toggle } from '../../../shared/ui';
import { useSetting } from '../../../shared/ui/useSetting';
import type { SettingsSection, SettingsSectionProps } from '../../../options/sections';
import { LINE_LIMIT_DEFAULT, LINE_LIMIT_KEY, isLineLimit } from '../context';
import { PROMPTS } from '../prompt-templates';
import { COPY_PROMPT_MODULE_ID } from './ids';
import { AUTO_TEMPLATE, TEMPLATE_DEFAULT, TEMPLATE_KEY, defineCopyPromptSettings, isTemplateChoice } from './settings';
import type { TemplateChoice } from './settings';

const LIMIT_CHOICES = [100, 200, 400, 800, 1500, 3000, 5000] as const;

const labelOf = (id: string): string => PROMPTS.find((p) => p.id === id)?.label ?? id;
const autoLabel = `تلقائي بحسب الصفحة (طلب الدمج: ${labelOf(AUTO_TEMPLATE.pr)}، المشكلة: ${labelOf(AUTO_TEMPLATE.issue)}، مهمة Actions: ${labelOf(AUTO_TEMPLATE.job)})`;

function Row({ id, title, note, children }: { id: string; title: string; note: string; children: ComponentChildren }) {
  return (
    <div class="toggle-row" data-setting={id}>
      <label class="label" for={`mj-${id.replace(/[^a-z0-9]+/gi, '-')}`}>
        <strong>{title}</strong>
        <span class="muted small">{note}</span>
      </label>
      {children}
    </div>
  );
}

function CopyPromptSection({ settings }: SettingsSectionProps) {
  const enabledKey = moduleEnabledKey(COPY_PROMPT_MODULE_ID);
  const enabled = useSetting<boolean>(settings, enabledKey);
  const storedTemplate = useSetting<TemplateChoice>(settings, TEMPLATE_KEY);
  const template = isTemplateChoice(storedTemplate) ? storedTemplate : TEMPLATE_DEFAULT;
  const storedLimit = useSetting<number>(settings, LINE_LIMIT_KEY);
  const limit = isLineLimit(storedLimit) ? storedLimit : LINE_LIMIT_DEFAULT;
  const limits = (LIMIT_CHOICES as readonly number[]).includes(limit) ? [...LIMIT_CHOICES] : [...LIMIT_CHOICES, limit].sort((a, b) => a - b);
  return (
    <>
      <div class="toggle-row" data-setting={enabledKey}>
        <label class="label" for="mj-e-copy-prompt">
          <strong>زر «نسخ البرومبت»</strong>
          <span class="muted small">زر صغير في صفحة طلب الدمج والمشكلة ومهمة Actions: ينسخ سياق الصفحة برومبتًا جاهزًا إلى الحافظة بنقرة، بلا صندوق نص ولا معاينة.</span>
        </label>
        <Toggle id="mj-e-copy-prompt" checked={enabled} label="زر نسخ البرومبت" onChange={(value) => void settings.set(enabledKey, value)} />
      </div>
      <Row id={TEMPLATE_KEY} title="القالب الافتراضي" note="القالب الذي ينسخه الزر عند فتح أي صفحة؛ وسهم الزر يبدّله لتلك الصفحة وحدها.">
        <select
          id={`mj-${TEMPLATE_KEY.replace(/[^a-z0-9]+/gi, '-')}`}
          value={template}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (isTemplateChoice(next)) void settings.set(TEMPLATE_KEY, next);
          }}
        >
          <option value="auto">{autoLabel}</option>
          {PROMPTS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Row>
      <Row id={LINE_LIMIT_KEY} title="حد أسطر كل قسم من السياق" note="يُقتطع بعده القسم الطويل (الوصف والسجل والتغييرات) ويُعلَن عدد الأسطر المقتطعة في «المعلومات الناقصة»؛ يمنع نسخ الصفحة كاملة بلا تمييز.">
        <select
          id={`mj-${LINE_LIMIT_KEY.replace(/[^a-z0-9]+/gi, '-')}`}
          value={String(limit)}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            if (isLineLimit(next)) void settings.set(LINE_LIMIT_KEY, next);
          }}
        >
          {limits.map((lines) => (
            <option key={lines} value={String(lines)}>
              {lines} سطرًا
            </option>
          ))}
        </select>
      </Row>
      <p class="muted small">
        الزر يعمل بلا أي مفتاح ولا رمز: يجمع من الصفحة المفتوحة وحدها ويحجب الأنماط السرّية المعروفة ثم يكتب إلى الحافظة بنقرتك، ولا يتصل بأي جهة ولا يرسل شيئًا إلى أي نموذج.
        الحجب بقائمة أنماط معروفة لا يضمن إزالة كل سرّ، فراجع ما تلصقه. وإن رفض المتصفح الكتابة إلى الحافظة أعلن الزر السبب وعرض تنزيل البرومبت ملفًا محليًا.
      </p>
    </>
  );
}

export const COPY_PROMPT_SECTION: SettingsSection = {
  id: 'e-copy-prompt',
  unit: 'e',
  title: 'نسخ البرومبت (الوحدة هـ)',
  define: (registry: SettingsRegistry) => {
    registry.defineModuleToggle(COPY_PROMPT_MODULE_ID, true, 'زر نسخ البرومبت');
    defineCopyPromptSettings(registry);
  },
  component: CopyPromptSection,
};

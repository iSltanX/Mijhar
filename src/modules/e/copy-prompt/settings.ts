// إعدادات «نسخ البرومبت» (T-11.3): القالب الافتراضي، وحد أسطر السياق (PP-03) الذي عرّفته الطبقة المشتركة (T-11.2) وتركت عرضه لمن يعرض البرومبت.
// القالب المختار من قائمة الزر في الصفحة يخص تلك الصفحة وحدها ولا يُكتب في الإعدادات؛ والإعداد هو الافتراضي عند فتح أي صفحة.
// تُقرأ القيم كسولًا من التخزين كما تفعل بطاقة طلب الدمج مع عتبة التقادم، وحتى تُقرأ (أو إن تعذّر) فالقيم الافتراضية.
import type { SettingsRegistry } from '../../../core/settings';
import { createSettingsRegistry } from '../../../core/ui-host/units';
import { openSettings } from '../../../core/ui-host/settings-runtime';
import { LINE_LIMIT_DEFAULT, LINE_LIMIT_KEY, defineContextSettings, isLineLimit } from '../context';
import type { ContextPageKind } from '../context';
import { PROMPT_IDS } from '../prompt-templates';
import type { PromptId } from '../prompt-templates';

export const TEMPLATE_KEY = 'e.copyPrompt.template';
/** «auto»: القالب الأنسب لنوع الصفحة (AUTO_TEMPLATE). */
export type TemplateChoice = PromptId | 'auto';
export const TEMPLATE_DEFAULT: TemplateChoice = 'auto';

export const isTemplateChoice = (value: unknown): value is TemplateChoice => value === 'auto' || (typeof value === 'string' && (PROMPT_IDS as readonly string[]).includes(value));

/** القالب التلقائي لكل نوع صفحة: الخطوة التالية لطلب الدمج، وفهم المشكلة، وتشخيص الخطأ لمهمة Actions، ومراجعة التغييرات للفروق. */
export const AUTO_TEMPLATE: Readonly<Record<ContextPageKind, PromptId>> = { pr: 'next-step', issue: 'understand', job: 'diagnose', diff: 'review' };

export const templateFor = (choice: TemplateChoice, kind: ContextPageKind): PromptId => (choice === 'auto' ? AUTO_TEMPLATE[kind] : choice);

export function defineCopyPromptSettings(registry: SettingsRegistry): void {
  registry.define<TemplateChoice>({ key: TEMPLATE_KEY, default: TEMPLATE_DEFAULT, validate: isTemplateChoice, description: 'القالب الافتراضي لزر «نسخ البرومبت»' });
  // المفتاح قد تعرّفه مرحلة أخرى تعرض البرومبت أو ترسله (MJ21): لا يُعرَّف مرتين في سجل واحد.
  if (!registry.has(LINE_LIMIT_KEY)) defineContextSettings(registry);
}

export interface CopyPromptSettings {
  /** الخيار الحالي (يتبع تغيّره من أي سياق). */
  template(): TemplateChoice;
  /** حد أسطر كل قسم من السياق (PP-03). */
  lineLimit(): number;
}

export const DEFAULT_COPY_PROMPT_SETTINGS: CopyPromptSettings = { template: () => TEMPLATE_DEFAULT, lineLimit: () => LINE_LIMIT_DEFAULT };

/** إعدادات من التخزين، تُفتح عند أول قراءة وتتبع تغيّرها. */
export function storedCopyPromptSettings(): CopyPromptSettings {
  let template: TemplateChoice = TEMPLATE_DEFAULT;
  let lineLimit = LINE_LIMIT_DEFAULT;
  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    try {
      openSettings({ migrate: false, registry: createSettingsRegistry(defineCopyPromptSettings) }).then(
        ({ settings }) => {
          const read = (key: string, value: unknown): void => {
            if (key === TEMPLATE_KEY && isTemplateChoice(value)) template = value;
            if (key === LINE_LIMIT_KEY && isLineLimit(value)) lineLimit = value;
          };
          read(TEMPLATE_KEY, settings.get(TEMPLATE_KEY));
          read(LINE_LIMIT_KEY, settings.get(LINE_LIMIT_KEY));
          settings.subscribe((change) => read(change.key, change.value));
        },
        () => {},
      );
    } catch {
      // لا تخزين للإضافة هنا: تبقى القيم الافتراضية.
    }
  };
  // تُفتح عند أول استعمال لا عند الإنشاء: وحدة بنيت ولم تُركَّب لا تفتح مخزنًا.
  return {
    template: () => (start(), template),
    lineLimit: () => (start(), lineLimit),
  };
}

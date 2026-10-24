// حد أسطر سياق التحليل (I-3، AC-E10 (٨)): إعداد PP-03 نفسه الذي يتبعه «نسخ البرومبت» (e.context.lineLimit)، فيُبنى سياق التحليل بالحد الذي اختاره
// المستخدم لا بحدود CONTEXT_LIMITS الافتراضية. يُقرأ كسولًا من التخزين ويتبع تغيّره، وحتى يُقرأ (أو إن تعذّر) فالافتراضي.
import { createSettingsRegistry } from '../../../core/ui-host/units';
import { openSettings } from '../../../core/ui-host/settings-runtime';
import { LINE_LIMIT_DEFAULT, LINE_LIMIT_KEY, defineContextSettings, isLineLimit } from '../../e/context';

/** يعيد قارئ الحد الحالي؛ يفتح المخزن عند أول قراءة لا عند الإنشاء. */
export function storedLineLimit(): () => number {
  let limit = LINE_LIMIT_DEFAULT;
  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    try {
      openSettings({ migrate: false, registry: createSettingsRegistry(defineContextSettings) }).then(
        ({ settings }) => {
          const read = (value: unknown): void => {
            if (isLineLimit(value)) limit = value;
          };
          read(settings.get(LINE_LIMIT_KEY));
          settings.subscribe((change) => {
            if (change.key === LINE_LIMIT_KEY) read(change.value);
          });
        },
        () => {},
      );
    } catch {
      // لا تخزين للإضافة هنا: يبقى الافتراضي.
    }
  };
  return () => (start(), limit);
}

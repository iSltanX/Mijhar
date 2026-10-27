// حد أسطر سياق التحليل (I-3، AC-E10 (٨)): إعداد PP-03 نفسه الذي يتبعه «نسخ البرومبت» (e.context.lineLimit)، فيُبنى سياق التحليل بالحد الذي اختاره
// المستخدم لا بحدود CONTEXT_LIMITS الافتراضية. يُقرأ كسولًا من التخزين ويتبع تغيّره، وحتى يُقرأ (أو إن تعذّر) فالافتراضي.
import { createSettingsRegistry } from '../../../core/ui-host/units';
import { openSettings } from '../../../core/ui-host/settings-runtime';
import { LINE_LIMIT_DEFAULT, LINE_LIMIT_KEY, defineContextSettings, isLineLimit } from '../../e/context';

/**
 * يعيد قارئ الحد الحالي؛ يفتح المخزن عند أول قراءة لا عند الإنشاء. signal: عمر المستهلك (ctx.signal للوحدة): بإلغائه يُفك الاشتراك وتُطلق موارد
 * المخزن، وإن اكتمل الفتح بعده أُطلقت فورًا (CODEX-009)؛ فلا يبقى مستمع تخزين لكل دورة صفحة استُعمل فيها التحليل.
 */
export function storedLineLimit(signal?: AbortSignal): () => number {
  let limit = LINE_LIMIT_DEFAULT;
  let started = false;
  let release: (() => void) | null = null;
  signal?.addEventListener('abort', () => release?.(), { once: true });
  const start = (): void => {
    if (started || signal?.aborted) return;
    started = true;
    try {
      openSettings({ migrate: false, registry: createSettingsRegistry(defineContextSettings) }).then(
        ({ store, settings }) => {
          const read = (value: unknown): void => {
            if (isLineLimit(value)) limit = value;
          };
          read(settings.get(LINE_LIMIT_KEY));
          const unsubscribe = settings.subscribe((change) => {
            if (change.key === LINE_LIMIT_KEY) read(change.value);
          });
          release = () => {
            release = null;
            unsubscribe();
            settings.dispose();
            store.dispose();
          };
          if (signal?.aborted) release();
        },
        () => {},
      );
    } catch {
      // لا تخزين للإضافة هنا: يبقى الافتراضي.
    }
  };
  return () => (start(), limit);
}

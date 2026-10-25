// ميزة «وضع القراءة وإخفاء التشكيل» في صفحة GitHub (T-2.5، F-A5، DEC-02 أ-2): زر هادئ معزول قبل أول حاوية Markdown يفتح العارض في
// تبويب، ومستجيب لطلب اللقطة من العارض. لا يكتب على عقد GitHub شيئًا غير الزر (عبر سجل الميزة)، فاقتباس الرد وأزرار النسخ ومصدر
// Markdown والحقول تبقى كما هي (AC-A5 البندان ٤ و٥). إخفاء التشكيل ومعالجة النسخ والسحب والبحث كلها في العارض (reader/).
import type { SettingDefinition } from '../../../core';
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { ExtensionApi } from '../../../core/ui-host/browser-api';
import { createShadowHost } from '../../../core/ui-host/shadow';
import { keepAttached } from '../../../core/ui-host/surface';
import type { Spot } from '../../../core/ui-host/surface';
import { DIRECTION_SELECTORS, DIRECTION_SELECTOR_KEYS } from '../direction/selectors';
import type { ModuleAFeature } from '../scope/feature';
import { READING_OPEN_MESSAGE, isSnapshotRequest } from './messages';
import type { SnapshotResponse } from './messages';
import { DEFAULT_READING_OPTIONS, READING_OPTIONS_KEY, isReadingOptions } from './options';
import type { ReadingOptions } from './options';
import { snapshotContainers, takeSnapshot } from './snapshot';

export const READING_FEATURE_ID = 'reading';
export const READING_HOST_NAME = 'a.reading';

const ENTRY_CSS = `
.entry { display: flex; align-items: center; gap: var(--mijhar-space-8); margin: 0 0 var(--mijhar-space-8); }
.entry .btn { height: 28px; padding: 0 var(--mijhar-space-12); font-size: 13px; }
`;

const readingOptions: SettingDefinition<ReadingOptions & Record<string, boolean>> = {
  key: READING_OPTIONS_KEY,
  default: { ...DEFAULT_READING_OPTIONS },
  description: 'وضع القراءة: hideDiacritics يخفي التشكيل في العارض افتراضًا',
  validate: (value): value is ReadingOptions & Record<string, boolean> => isReadingOptions(value),
};

export interface ReadingFeatureOptions {
  /** واجهات الإضافة؛ null خارج سياق إضافة (فلا زر ولا مستجيب). */
  readonly api?: () => ExtensionApi | null;
}

const defaultApi = (): ExtensionApi | null => {
  try {
    return extensionApi();
  } catch {
    return null;
  }
};

export function createReadingFeature(options: ReadingFeatureOptions = {}): ModuleAFeature {
  const getApi = options.api ?? defaultApi;
  return {
    id: READING_FEATURE_ID,
    title: 'وضع القراءة وإخفاء التشكيل',
    defaults: { enabled: true, scope: 'all', repos: [] },
    settings: [readingOptions as SettingDefinition],
    selectors: DIRECTION_SELECTORS,
    mount(ctx) {
      const api = getApi();
      if (!api) return;
      const doc = ctx.document;
      const containerSelector = ctx.selectors.entry(DIRECTION_SELECTOR_KEYS.container).candidates.join(', ');

      // يستجيب متزامنًا (sendResponse) فيعمل في Chrome وFirefox دون الاعتماد على إرجاع وعد.
      const respond = (message: unknown, _sender: unknown, sendResponse: (response?: unknown) => void): unknown => {
        if (!isSnapshotRequest(message)) return undefined;
        const snapshot = takeSnapshot(doc, snapshotContainers(doc, containerSelector));
        const response: SnapshotResponse = snapshot.sections.length ? { ok: true, snapshot } : { ok: false, reason: 'no-content' };
        sendResponse(response);
        return undefined;
      };
      api.runtime.onMessage.addListener(respond);
      ctx.onTeardown(() => api.runtime.onMessage.removeListener(respond));

      // قبل أول حاوية فيها نص، أو null.
      const spot = (): Spot | null => {
        const first = snapshotContainers(doc, containerSelector).find((el) => (el.textContent ?? '').trim());
        return first?.parentNode ? { parent: first.parentNode, before: first } : null;
      };
      // الزر في موضعه؛ يعيد true إن وُضع. وإعادة رسم الصفحة تبعده (MJ-F-01): يعيده keepAttached إلى أول حاوية نصية جديدة، الزر نفسه.
      const place = (): boolean => {
        const at = spot();
        if (!at) return false;
        const { host, root } = createShadowHost(doc, { name: READING_HOST_NAME, styles: ENTRY_CSS, label: 'وضع القراءة' });
        const bar = doc.createElement('div');
        bar.className = 'entry';
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'btn';
        button.textContent = 'وضع القراءة';
        button.title = 'يفتح محتوى الصفحة في عارض قراءة مستقل، مع خيار إخفاء التشكيل في العرض فقط';
        button.addEventListener('click', () => {
          if (!ctx.signal.aborted) void api.runtime.sendMessage({ type: READING_OPEN_MESSAGE }).catch(() => undefined);
        });
        bar.append(button);
        root.append(bar);
        ctx.mutations.insert(at.parent, host, at.before);
        keepAttached(ctx, host, { anchor: spot });
        return true;
      };
      if (place()) return;
      // حاوية تُرسم بعد التركيب (VR-17): مراقبة body حتى يوضع الزر مرة واحدة ثم تُفصل؛ فلا زر مكرر.
      let placed = false;
      const observer = ctx.observe(doc.body, { childList: true, subtree: true }, () => {
        if (placed || ctx.signal.aborted) return;
        placed = place();
        if (placed) observer.disconnect();
      });
    },
  };
}

export const READING_FEATURE: ModuleAFeature = createReadingFeature();

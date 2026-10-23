// زر «وضع الشرح» في تبويب القاموس من اللوحة الجانبية والدرج (AC-B1: بزر في شريط الإضافة). في الدرج (سكربت المحتوى) يبدّل الحالة
// المشتركة مباشرة؛ وفي اللوحة الأصلية (صفحة إضافة) يراسل التبويب النشط، فإن لم يكن صفحة GitHub أعلن ذلك ولم يفعل شيئًا.
import { useEffect, useState } from 'preact/hooks';
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { ExtensionApi } from '../../../core/ui-host/browser-api';
import { isModuleEnabled } from '../../../core/ui-host/units';
import type { PanelViewProps } from '../../../sidepanel/views';
import { useSetting } from '../../../shared/ui/useSetting';
import { moduleEnabledKey } from '../../../core/settings';
import { CARD_MODULE_ID } from './ids';
import { EXPLAIN_MESSAGE, EXPLAIN_MODE, EXPLAIN_SHORTCUT } from './mode';
import type { ExplainAction, ExplainMode } from './mode';

export interface ExplainBridge {
  /** الحالة الحالية، أو null إن تعذّر الوصول إلى صفحة GitHub. */
  status(): Promise<boolean | null>;
  send(action: ExplainAction): Promise<boolean | null>;
  /** تغيّر الحالة من غير هذه الواجهة (الاختصار)؛ لا يتوفر عبر الرسائل. */
  subscribe?(listener: (active: boolean) => void): () => void;
}

export function directBridge(mode: ExplainMode): ExplainBridge {
  return { status: async () => mode.active, send: async (action) => mode.apply(action), subscribe: (listener) => mode.subscribe(listener) };
}

export function messageBridge(api: ExtensionApi): ExplainBridge {
  const call = async (action: ExplainAction): Promise<boolean | null> => {
    const tabId = (await api.tabs?.query({ active: true, lastFocusedWindow: true }))?.[0]?.id;
    if (tabId === undefined || !api.tabs) return null;
    try {
      const response = (await api.tabs.sendMessage(tabId, { type: EXPLAIN_MESSAGE, action })) as { active?: unknown } | undefined;
      return typeof response?.active === 'boolean' ? response.active : null;
    } catch {
      return null;
    }
  };
  return { status: () => call('status'), send: call };
}

/** الجسر المناسب للسياق: سكربت المحتوى (بلا tabs) مباشر، وصفحة الإضافة بالرسائل. */
export function defaultBridge(mode: ExplainMode = EXPLAIN_MODE): ExplainBridge {
  try {
    const api = extensionApi();
    if (api.tabs) return messageBridge(api);
  } catch {
    // خارج سياق إضافة: الحالة المباشرة.
  }
  return directBridge(mode);
}

export function ExplainToggleView({ settings, bridge }: PanelViewProps & { bridge?: ExplainBridge }) {
  const [active, setActive] = useState<boolean | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState(false);
  const enabled = useSetting<boolean>(settings, moduleEnabledKey(CARD_MODULE_ID));
  const [link] = useState<ExplainBridge>(() => bridge ?? defaultBridge());

  useEffect(() => {
    let alive = true;
    const apply = (value: boolean | null): void => {
      if (!alive) return;
      setUnreachable(value === null);
      if (value !== null) setActive(value);
    };
    void link.status().then(apply, () => apply(null));
    const unsubscribe = link.subscribe?.((value) => alive && setActive(value));
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, [link]);

  const toggle = (): void => {
    setBusy(true);
    link
      .send('toggle')
      .then(
        (value) => {
          setUnreachable(value === null);
          if (value !== null) setActive(value);
        },
        () => setUnreachable(true),
      )
      .finally(() => setBusy(false));
  };

  const usable = enabled && isModuleEnabled(settings, CARD_MODULE_ID);
  return (
    <section class="section" data-view="explain-toggle" aria-labelledby="mj-explain-title">
      <h3 id="mj-explain-title">وضع الشرح</h3>
      <p class="muted">يضع شارة شرح عند كل عنصر في صفحة GitHub يعرفه القاموس بثقة كافية؛ وما لا يُتعرَّف عليه بثقة لا يُشرح ولا يُخمَّن.</p>
      <div class="row">
        <button type="button" class="btn btn-primary" data-action="toggle-explain" aria-pressed={active ? 'true' : 'false'} disabled={busy || !usable} onClick={toggle}>
          {active ? 'أوقف وضع الشرح' : 'فعّل وضع الشرح'}
        </button>
        <span class="status" data-state={active ? 'granted' : 'denied'} role="status">
          {active === null ? 'غير معروف' : active ? 'مفعَّل' : 'غير مفعَّل'}
        </span>
      </div>
      <p class="muted small">
        أو اضغط <kbd>{EXPLAIN_SHORTCUT}</kbd> داخل صفحة GitHub (اختصار افتراضي مؤقت).
      </p>
      {!usable && (
        <p class="notice" data-notice="disabled">
          بطاقة الشرح موقوفة؛ شغّلها من «الإعدادات والخصوصية».
        </p>
      )}
      {unreachable && (
        <p class="notice" data-notice="unreachable" role="alert">
          افتح صفحة على github.com في التبويب النشط ثم أعد المحاولة؛ لا يعمل وضع الشرح في غيرها.
        </p>
      )}
    </section>
  );
}

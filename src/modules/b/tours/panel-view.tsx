// قائمة الجولات الإرشادية في تبويب القاموس من اللوحة والدرج (AC-B7): كل جولة بعنوانها وهدفها وعدد خطواتها وشارة «شرح بصري فقط» لما يخص إعدادات حساسة، وزر
// يبدأها في صفحة GitHub المفتوحة. اللوحة الأصلية تراسل التبويب النشط؛ وإن لم يكن صفحة GitHub أعلنت ذلك ولم تفعل شيئًا.
import { useEffect, useState } from 'preact/hooks';
import { moduleEnabledKey } from '../../../core/settings';
import { isModuleEnabled } from '../../../core/ui-host/units';
import type { PanelViewProps } from '../../../sidepanel/views';
import { useSetting } from '../../../shared/ui/useSetting';
import { defaultBridge } from './bridge';
import type { TourBridge } from './bridge';
import { TOURS } from './data';
import { TOURS_MODULE_ID } from './ids';
import type { TourStatus } from './state';

export function ToursListView({ settings, bridge }: PanelViewProps & { bridge?: TourBridge }) {
  const [status, setStatus] = useState<TourStatus | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState(false);
  const enabled = useSetting<boolean>(settings, moduleEnabledKey(TOURS_MODULE_ID));
  const [link] = useState<TourBridge>(() => bridge ?? defaultBridge());

  useEffect(() => {
    let alive = true;
    const apply = (value: TourStatus | null): void => {
      if (!alive) return;
      setUnreachable(value === null);
      if (value !== null) setStatus(value);
    };
    const refresh = (): void => void link.status().then(apply, () => apply(null));
    refresh();
    // اللوحة الأصلية لا تتلقى تقدّم الجولة من الشريط؛ تعيد قراءته حين تعود إليها.
    const view = typeof window === 'undefined' ? null : window;
    view?.addEventListener('focus', refresh);
    const unsubscribe = link.subscribe?.(refresh);
    return () => {
      alive = false;
      view?.removeEventListener('focus', refresh);
      unsubscribe?.();
    };
  }, [link]);

  const run = (action: 'start' | 'stop', id?: string): void => {
    setBusy(true);
    link
      .send(action, id)
      .then(
        (value) => {
          setUnreachable(value === null);
          if (value !== null) setStatus(value);
        },
        () => setUnreachable(true),
      )
      .finally(() => setBusy(false));
  };

  const usable = enabled && isModuleEnabled(settings, TOURS_MODULE_ID);
  return (
    <section class="section" data-view="tours" aria-labelledby="mj-tours-title">
      <h3 id="mj-tours-title">الجولات الإرشادية</h3>
      <p class="muted">
        خمس عشرة جولة تُبرز عناصر صفحة GitHub المفتوحة وتشرحها خطوة خطوة. هي قرائية آمنة: لا تنقر ولا ترسل ولا تغيّر شيئًا نيابةً عنك، وما غاب عنصره عن الصفحة تشرح لك سبب غيابه. ما يخص
        إعدادات حساسة يُعرض شرحًا بصريًا فقط.
      </p>
      {!usable && (
        <p class="notice" data-notice="disabled">
          الجولات الإرشادية موقوفة؛ شغّلها من «الإعدادات والخصوصية».
        </p>
      )}
      {unreachable && (
        <p class="notice" data-notice="unreachable" role="alert">
          افتح صفحة على github.com في التبويب النشط ثم أعد المحاولة؛ لا تعمل الجولات في غيرها.
        </p>
      )}
      <ol class="tour-list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--mijhar-space-8)' }}>
        {TOURS.map((tour) => {
          const running = status?.active === tour.id;
          return (
            <li key={tour.id} data-tour-id={tour.id} data-visual-only={tour.visualOnly ? 'true' : 'false'} data-running={running ? 'true' : 'false'}>
              <div class="row">
                <strong>{tour.title}</strong>
                {tour.visualOnly && (
                  <span class="status" data-state="pending" data-tag="visual-only">
                    شرح بصري فقط
                  </span>
                )}
                {running && (
                  <span class="status" data-state="granted" role="status">
                    جارية · الخطوة {status!.step + 1} من {tour.steps.length}
                  </span>
                )}
              </div>
              <p class="muted small">{tour.goal}</p>
              <div class="row">
                <button
                  type="button"
                  class="btn btn-primary"
                  data-action={running ? 'stop-tour' : 'start-tour'}
                  data-tour={tour.id}
                  disabled={busy || !usable}
                  onClick={() => run(running ? 'stop' : 'start', running ? undefined : tour.id)}
                >
                  {running ? 'أوقف الجولة' : `ابدأ الجولة (${tour.steps.length} ${tour.steps.length === 1 ? 'خطوة' : 'خطوات'})`}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

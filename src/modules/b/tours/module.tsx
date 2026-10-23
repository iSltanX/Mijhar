// الوحدة b.tours: الجولات الإرشادية القرائية الآمنة (T-3.5 / F-B7 / AC-B7). تنتظر طلبًا (رسالة من اللوحة أو نداء الدرج) فتبدأ الجولة المطلوبة، وتبقى بلا أي أثر في
// الصفحة قبله: لا مراقب ولا مستمع ولا مضيف. وعند الجولة:
//  - شريط عائم واحد في Shadow DOM (bar.tsx) وحلقة إبراز لعنصر الخطوة (b/search/highlight) بالمطابقة الدلالية نفسها لبطاقة الشرح وقاعدة عدم التخمين؛
//  - قفل الأمان: لا نقر ولا إرسال ولا تركيز ولا أي حدث يُصطنع على عنصر من GitHub (ولا يوجد في هذه الوحدة نداء إلى click أو dispatchEvent أو submit، ويفحصه الاختبار)؛
//  - غياب عنصر الخطوة يعرض بطاقة تشرح سببه، وخطوات الإعدادات الحساسة شرح بصري فقط لا تُقرأ صفحتها.
import { render } from 'preact';
import type { ExtensionModule, ModuleContext } from '../../../core';
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { ExtensionApi } from '../../../core/ui-host/browser-api';
import { createShadowHost } from '../../../core/ui-host/shadow';
import type { ShadowParts } from '../../../core/ui-host/shadow';
import { pageInfoFromUrl } from '../../../shared/page';
import { Highlighter } from '../search/highlight';
import type { HighlightOptions } from '../search/highlight';
import { TOUR_BAR_HOST_NAME, TOUR_CSS, TOUR_HOST_CSS, TourBar } from './bar';
import { TOURS_MODULE_ID } from './ids';
import { currentUser, resolvePath, resolveStep } from './resolve';
import type { StepResolution } from './resolve';
import { TOUR_STATE, isTourMessage } from './state';
import type { TourState } from './state';

export { TOURS_MODULE_ID };

/** إبراز الجولة يبقى ما دامت الخطوة (لا مهلة 8 ثوانٍ كإبراز الموضع)؛ يزول بتغيير الخطوة أو إنهاء الجولة. */
const HOLD_MS = 6 * 60 * 60 * 1000;

export interface ToursOptions {
  readonly state?: TourState;
  /** واجهات الإضافة لرسائل اللوحة. null: لا رسائل (اختبارات). الافتراضي سياق الإضافة الحالي إن وُجد. */
  readonly api?: ExtensionApi | null;
  /** مهلة تجميع تعديلات الصفحة قبل إعادة تحديد العنصر. الافتراضي 300ms. */
  readonly debounceMs?: number;
  readonly rectOf?: HighlightOptions['rectOf'];
}

function tryApi(): ExtensionApi | null {
  try {
    return extensionApi();
  } catch {
    return null;
  }
}

export function createToursModule(options: ToursOptions = {}): ExtensionModule {
  return {
    id: TOURS_MODULE_ID,
    title: 'الجولات الإرشادية',
    pages: '*',
    mount(ctx) {
      new TourController(ctx, options).start();
    },
  };
}

class TourController {
  private readonly state: TourState;
  private readonly highlighter: Highlighter;
  private parts: ShadowParts | null = null;
  private resolution: StepResolution = { kind: 'text' };
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly options: ToursOptions,
  ) {
    this.state = options.state ?? TOUR_STATE;
    this.highlighter = new Highlighter(ctx);
  }

  start(): void {
    const { ctx } = this;
    ctx.onTeardown(this.dispose);
    ctx.onTeardown(this.state.subscribe(() => this.sync()));
    const api = this.options.api === undefined ? tryApi() : this.options.api;
    if (api) {
      const onMessage = (message: unknown, _sender: unknown, sendResponse: (response?: unknown) => void): undefined => {
        if (!isTourMessage(message)) return undefined;
        sendResponse(this.state.apply(message));
        return undefined;
      };
      api.runtime.onMessage.addListener(onMessage);
      ctx.onTeardown(() => api.runtime.onMessage.removeListener(onMessage));
    }
    this.sync();
  }

  private readonly dispose = (): void => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.observer?.disconnect();
    if (this.parts) render(null, this.parts.root);
  };

  /** الجولة جارية ← تحديد عنصر الخطوة ورسم الشريط؛ وإلا يُزال المضيف فتعود الصفحة بلا أثر. */
  private sync(): void {
    if (this.ctx.signal.aborted) return;
    if (this.state.tour) {
      this.watch(true);
      this.refresh();
    } else this.release();
  }

  private watch(on: boolean): void {
    const { ctx } = this;
    if (!on) {
      this.observer?.disconnect();
      return;
    }
    const root = ctx.document.body ?? ctx.document.documentElement;
    this.observer ??= ctx.observe(root, { childList: true, subtree: true }, (records) => {
      const own = this.parts?.host;
      // الشريط وحلقة الإبراز مضيفان من الوحدة نفسها: تعديلهما لا يعيد التحديد.
      if (records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => n !== own && (n as Element).localName !== 'mijhar-host'))) this.schedule();
    });
    this.observer.observe(root, { childList: true, subtree: true });
  }

  private schedule(): void {
    if (this.timer || this.ctx.signal.aborted) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.state.tour) this.refresh();
    }, this.options.debounceMs ?? 300);
  }

  private release(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.watch(false);
    this.highlighter.clear();
    this.resolution = { kind: 'text' };
    if (!this.parts) return;
    render(null, this.parts.root);
    this.parts.host.remove();
    this.parts = null;
  }

  private refresh(): void {
    const { ctx } = this;
    const tour = this.state.tour;
    if (!tour) return;
    const step = tour.steps[this.state.step];
    if (!step) return;
    this.resolution = resolveStep(step, ctx.document, ctx.page);
    if (this.resolution.kind === 'found') {
      const { entry, elements } = this.resolution;
      this.highlighter.show(elements, { label: `${entry.ar} (${entry.en})`, holdMs: HOLD_MS, ...(this.options.rectOf ? { rectOf: this.options.rectOf } : {}) });
    } else this.highlighter.clear();
    this.draw();
  }

  private ensureHost(): ShadowParts {
    if (this.parts) return this.parts;
    const parts = createShadowHost(this.ctx.document, { name: TOUR_BAR_HOST_NAME, hostCss: TOUR_HOST_CSS, styles: TOUR_CSS, label: 'الجولة الإرشادية' });
    parts.root.classList.add('tour-root');
    this.ctx.mutations.insert(this.ctx.document.body ?? this.ctx.document.documentElement, parts.host);
    this.parts = parts;
    return parts;
  }

  private draw(): void {
    const { ctx } = this;
    const tour = this.state.tour;
    if (ctx.signal.aborted || !tour) return;
    const step = tour.steps[this.state.step];
    if (!step) return;
    const info = pageInfoFromUrl(ctx.page.href);
    const link = resolvePath(step.path, { owner: info.owner, repo: info.repo, user: currentUser(ctx.document, info.owner) });
    render(
      <TourBar
        tour={tour}
        index={this.state.step}
        resolution={this.resolution}
        link={link}
        onPrev={() => this.state.prev()}
        onNext={() => this.state.next()}
        onStop={() => this.state.stop()}
      />,
      this.ensureHost().root,
    );
  }
}

export const TOURS_MODULE: ExtensionModule = createToursModule();

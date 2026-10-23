// إبراز الموضع في الصفحة (F-B6): حلقات في طبقة عائمة واحدة ثابتة فوق العناصر المحددة، بلا تعديل لأي عنصر من الصفحة ولا إضافة سمة ولا تغليف:
// المواضع تُقرأ من getBoundingClientRect، والمضيف يُدرج مرة واحدة عبر ctx.mutations فيُزال بإيقاف الوحدة. يتحرك أول عنصر إلى منتصف النافذة
// (فوريًا إن فضّل المستخدم تقليل الحركة)، وتزول الحلقات بعد مهلة أو بـEscape أو بطلب إزالة.
import { render } from 'preact';
import type { ModuleContext } from '../../../core';
import { createShadowHost } from '../../../core/ui-host/shadow';
import type { ShadowParts } from '../../../core/ui-host/shadow';

export const HIGHLIGHT_HOST_NAME = 'b.search.highlight';
/** أقصى عدد حلقات؛ ما زاد يُعدّ في الرسالة ولا يُرسم. */
export const MAX_RINGS = 12;
export const DEFAULT_HOLD_MS = 8000;

export const HIGHLIGHT_HOST_CSS = `
:host {
  all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147482999 !important; display: block !important;
  pointer-events: none !important; overflow: visible !important; visibility: visible !important; opacity: 1 !important; transform: none !important; filter: none !important;
}
`;

export const HIGHLIGHT_CSS = `
.mj-root.hl-root { position: absolute; inset: 0; background: transparent; pointer-events: none; overflow: visible; }
.ring {
  position: absolute; pointer-events: none; border-radius: var(--mijhar-radius-6); box-sizing: border-box;
  border: 3px solid var(--mijhar-bg-brand); background: color-mix(in srgb, var(--mijhar-bg-brand) 14%, transparent);
  box-shadow: 0 0 0 3px var(--mijhar-bg-surface), 0 0 0 6px var(--mijhar-bg-brand);
}
.ring-label {
  position: absolute; pointer-events: none; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font: 700 12px/20px var(--mijhar-font-display);
  background: var(--mijhar-bg-brand); color: var(--mijhar-text-on-brand); white-space: nowrap; box-shadow: var(--mijhar-shadow-raised);
}
@media (forced-colors: active) { .ring { border-color: Highlight; box-shadow: none; background: transparent; } }
`;

interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const PAD = 4;

function Rings({ boxes, label, extra }: { boxes: readonly Box[]; label: string; extra: number }) {
  return (
    <div class="rings" data-count={boxes.length} aria-hidden="true">
      {boxes.map((b, i) => (
        <div
          class="ring"
          key={i}
          style={{ left: `${b.left - PAD}px`, top: `${b.top - PAD}px`, width: `${b.width + 2 * PAD}px`, height: `${b.height + 2 * PAD}px` }}
        />
      ))}
      {boxes[0] && (
        <span class="ring-label" style={{ left: `${Math.max(4, boxes[0].left - PAD)}px`, top: `${Math.max(4, boxes[0].top - PAD - 24)}px` }}>
          {label}
          {extra > 0 ? ` (+${extra})` : ''}
        </span>
      )}
    </div>
  );
}

export interface HighlightOptions {
  readonly label: string;
  readonly holdMs?: number;
  /** موضع عنصر في نافذة العرض. الافتراضي getBoundingClientRect (يُستبدل في jsdom). */
  readonly rectOf?: (element: Element) => Box;
}

const defaultRect = (element: Element): Box => {
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

export class Highlighter {
  private parts: ShadowParts | null = null;
  private elements: readonly Element[] = [];
  private label = '';
  private rectOf: (element: Element) => Box = defaultRect;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frame = 0;
  private bound = false;

  constructor(private readonly ctx: ModuleContext) {
    ctx.onTeardown(() => this.dispose());
  }

  get active(): boolean {
    return this.parts !== null;
  }

  show(elements: readonly Element[], options: HighlightOptions): void {
    const { ctx } = this;
    if (ctx.signal.aborted) return;
    this.clear();
    const live = elements.filter((el) => el.isConnected);
    if (!live.length) return;
    this.elements = live;
    this.label = options.label;
    this.rectOf = options.rectOf ?? defaultRect;
    const view = ctx.document.defaultView;
    const calm = Boolean(view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    (live[0] as HTMLElement).scrollIntoView?.({ block: 'center', inline: 'nearest', behavior: calm ? 'auto' : 'smooth' });
    const parts = createShadowHost(ctx.document, { name: HIGHLIGHT_HOST_NAME, hostCss: HIGHLIGHT_HOST_CSS, styles: HIGHLIGHT_CSS, label: 'إبراز موضع العنصر' });
    parts.root.classList.add('hl-root');
    ctx.mutations.insert(ctx.document.body ?? ctx.document.documentElement, parts.host);
    this.parts = parts;
    this.bind(true);
    this.draw();
    this.timer = setTimeout(() => this.clear(), options.holdMs ?? DEFAULT_HOLD_MS);
  }

  clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.frame) this.ctx.document.defaultView?.cancelAnimationFrame?.(this.frame);
    this.frame = 0;
    this.bind(false);
    this.elements = [];
    if (!this.parts) return;
    render(null, this.parts.root);
    this.parts.host.remove();
    this.parts = null;
  }

  private readonly dispose = (): void => this.clear();

  private readonly onViewChange = (): void => {
    const view = this.ctx.document.defaultView;
    if (this.frame || !view) return;
    this.frame = view.requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  };

  private readonly onKey = (event: Event): void => {
    if ((event as KeyboardEvent).key === 'Escape') this.clear();
  };

  private bind(on: boolean): void {
    if (on === this.bound) return;
    this.bound = on;
    const view = this.ctx.document.defaultView;
    if (on) {
      view?.addEventListener('scroll', this.onViewChange, { capture: true, passive: true });
      view?.addEventListener('resize', this.onViewChange, { passive: true });
      this.ctx.document.addEventListener('keydown', this.onKey);
    } else {
      view?.removeEventListener('scroll', this.onViewChange, { capture: true } as EventListenerOptions);
      view?.removeEventListener('resize', this.onViewChange);
      this.ctx.document.removeEventListener('keydown', this.onKey);
    }
  }

  private draw(): void {
    if (!this.parts || this.ctx.signal.aborted) return;
    const view = this.ctx.document.defaultView;
    const vw = this.ctx.document.documentElement.clientWidth || view?.innerWidth || 0;
    const vh = this.ctx.document.documentElement.clientHeight || view?.innerHeight || 0;
    const boxes: Box[] = [];
    let extra = 0;
    for (const el of this.elements) {
      if (!el.isConnected) continue;
      const r = this.rectOf(el);
      if (r.width <= 0 || r.height <= 0 || r.top + r.height < 0 || r.top > vh || r.left + r.width < 0 || r.left > vw) continue;
      if (boxes.length < MAX_RINGS) boxes.push(r);
      else extra += 1;
    }
    render(<Rings boxes={boxes} label={this.label} extra={extra} />, this.parts.root);
  }
}

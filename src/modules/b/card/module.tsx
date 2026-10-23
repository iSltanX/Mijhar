// الوحدة b.card: بطاقة الشرح السياقية (T-3.2). تنتظر تفعيل وضع الشرح (Alt+H أو زر اللوحة/الدرج) وعندها:
//  - تفحص الصفحة وتربط كل عنصر مطابق بثقة كافية بمدخل من القاموس (match.ts)، ولا تلصق شرحًا بغيره؛
//  - ترسم شارة لكل عنصر مطابق عند موضعه في طبقة عائمة واحدة ثابتة (overlay.tsx) تفتح بطاقة الشرح بالنقر.
// لا تغلّف عنصرًا أصليًا ولا تضيف إليه سمة: الإضافة الوحيدة مضيف Shadow DOM واحد في نهاية body يُزال بإيقاف الوحدة.
import { render } from 'preact';
import { createShadowHost } from '../../../core/ui-host/shadow';
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { ExtensionApi } from '../../../core/ui-host/browser-api';
import type { ExtensionModule, ModuleContext } from '../../../core';
import type { GlossaryEntry } from '../../../data/glossary/types';
import { GLOSSARY_ENTRIES } from './entries';
import { CARD_MODULE_ID } from './ids';
import { buildIndex, findMatches } from './match';
import type { LabelIndex, Match } from './match';
import { EXPLAIN_MODE, isExplainMessage, isExplainShortcut } from './mode';
import type { ExplainMode } from './mode';
import { CARD_CSS, ExplainOverlay, OVERLAY_HOST_CSS } from './overlay';
import type { Rect } from './overlay';
import { pageKindsOf } from './page-kind';

export { CARD_MODULE_ID };

export interface CardOptions {
  /** حالة وضع الشرح. الافتراضي المشتركة في سكربت المحتوى. */
  readonly mode?: ExplainMode;
  /** مداخل القاموس. الافتراضي القاموس المنقّح (T-3.1). */
  readonly entries?: readonly GlossaryEntry[];
  /** واجهات الإضافة لرسائل اللوحة. null: لا رسائل (اختبارات). الافتراضي سياق الإضافة الحالي إن وُجد. */
  readonly api?: ExtensionApi | null;
  /** مهلة تجميع تعديلات الصفحة قبل إعادة الفحص. الافتراضي 300ms. */
  readonly debounceMs?: number;
  /** موضع عنصر في نافذة العرض. الافتراضي getBoundingClientRect (يُستبدل في jsdom الذي لا يحسب التخطيط). */
  readonly rectOf?: (element: Element) => Rect;
}

function tryApi(): ExtensionApi | null {
  try {
    return extensionApi();
  } catch {
    return null;
  }
}

export function createCardModule(options: CardOptions = {}): ExtensionModule {
  let index: LabelIndex | null = null;
  return {
    id: CARD_MODULE_ID,
    title: 'بطاقة الشرح',
    pages: '*',
    mount(ctx) {
      index ??= buildIndex(options.entries ?? GLOSSARY_ENTRIES);
      new CardController(ctx, index, options).start();
    },
  };
}

class CardController {
  private readonly mode: ExplainMode;
  private parts: ReturnType<typeof createShadowHost> | null = null;
  private matches: readonly Match[] = [];
  private openElement: Element | null = null;
  private frame = 0;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  /** مراقب التعديلات ومستمعا التمرير وتغيير الحجم: يعملون ما دام الوضع مفعَّلًا وحده (الوحدة تُركَّب في كل صفحة GitHub). */
  private observer: MutationObserver | null = null;
  private bound = false;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly index: LabelIndex,
    private readonly options: CardOptions,
  ) {
    this.mode = options.mode ?? EXPLAIN_MODE;
  }

  start(): void {
    const { ctx } = this;
    ctx.onTeardown(this.dispose);
    ctx.onTeardown(this.mode.subscribe(() => this.sync()));
    ctx.listen(ctx.document, 'keydown', (event) => {
      if (!isExplainShortcut(event as KeyboardEvent)) return;
      event.preventDefault();
      this.mode.toggle();
    });
    const api = this.options.api === undefined ? tryApi() : this.options.api;
    if (api) {
      const onMessage = (message: unknown, _sender: unknown, sendResponse: (response?: unknown) => void): undefined => {
        if (!isExplainMessage(message)) return undefined;
        sendResponse({ active: this.mode.apply(message.action) });
        return undefined;
      };
      api.runtime.onMessage.addListener(onMessage);
      ctx.onTeardown(() => api.runtime.onMessage.removeListener(onMessage));
    }
    this.sync();
  }

  private readonly onScroll = (): void => this.redraw();

  /** يربط المراقب والمستمعين عند التفعيل ويفكّهما عند الإيقاف، فلا كلفة على صفحة لم يُفعَّل فيها الوضع. */
  private bind(on: boolean): void {
    const { ctx } = this;
    if (on === this.bound) return;
    this.bound = on;
    const view = ctx.document.defaultView;
    const root = ctx.document.body ?? ctx.document.documentElement;
    if (on) {
      view?.addEventListener('scroll', this.onScroll, { capture: true, passive: true });
      view?.addEventListener('resize', this.onScroll, { passive: true });
      this.observer ??= ctx.observe(root, { childList: true, subtree: true }, (records) => {
        const own = this.parts?.host;
        if (records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => n !== own))) this.scheduleScan();
      });
      this.observer.observe(root, { childList: true, subtree: true });
    } else {
      view?.removeEventListener('scroll', this.onScroll, { capture: true } as EventListenerOptions);
      view?.removeEventListener('resize', this.onScroll);
      this.observer?.disconnect();
    }
  }

  private readonly dispose = (): void => {
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = null;
    if (this.frame) this.ctx.document.defaultView?.cancelAnimationFrame?.(this.frame);
    this.frame = 0;
    this.bind(false);
    if (this.parts) render(null, this.parts.root);
  };

  /** مطابقة حالة الوضع: عند التفعيل يُفحص ويُرسم، وعند الإيقاف يُزال المضيف فتعود الصفحة بلا أثر. */
  private sync(): void {
    if (this.ctx.signal.aborted) return;
    this.bind(this.mode.active);
    if (this.mode.active) this.scan();
    else this.release();
  }

  private release(): void {
    this.matches = [];
    this.openElement = null;
    if (this.scanTimer) clearTimeout(this.scanTimer);
    this.scanTimer = null;
    if (!this.parts) return;
    render(null, this.parts.root);
    this.parts.host.remove();
    this.parts = null;
  }

  private scan(): void {
    const { ctx } = this;
    this.matches = findMatches(ctx.document, this.index, { kinds: pageKindsOf(ctx.page), href: ctx.page.href }).matches;
    if (this.openElement && !this.matches.some((m) => m.element === this.openElement)) this.openElement = null;
    this.draw();
  }

  private scheduleScan(): void {
    if (this.scanTimer || this.ctx.signal.aborted) return;
    this.scanTimer = setTimeout(() => {
      this.scanTimer = null;
      if (this.mode.active) this.scan();
    }, this.options.debounceMs ?? 300);
  }

  private redraw(): void {
    const view = this.ctx.document.defaultView;
    if (!this.mode.active || this.frame || !view) return;
    this.frame = view.requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  private ensureHost(): ReturnType<typeof createShadowHost> {
    if (this.parts) return this.parts;
    const parts = createShadowHost(this.ctx.document, { name: CARD_MODULE_ID, hostCss: OVERLAY_HOST_CSS, styles: CARD_CSS, label: 'شرح واجهة GitHub' });
    parts.root.classList.add('overlay-root');
    this.ctx.mutations.insert(this.ctx.document.body ?? this.ctx.document.documentElement, parts.host);
    this.parts = parts;
    return parts;
  }

  private draw(): void {
    const { ctx } = this;
    if (ctx.signal.aborted) return;
    if (!this.mode.active) return;
    const parts = this.ensureHost();
    const doc = ctx.document;
    const viewport = { width: doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0, height: doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 0 };
    const openIndex = this.openElement ? this.matches.findIndex((m) => m.element === this.openElement) : -1;
    render(
      <ExplainOverlay
        matches={this.matches}
        viewport={viewport}
        openIndex={openIndex >= 0 ? openIndex : null}
        active={this.mode.active}
        {...(this.options.rectOf ? { rectOf: this.options.rectOf } : {})}
        onOpen={(i) => {
          this.openElement = this.matches[i]?.element ?? null;
          this.draw();
        }}
        onClose={() => {
          this.openElement = null;
          this.draw();
        }}
        onStop={() => this.mode.set(false)}
      />,
      parts.root,
    );
  }
}

export const CARD_MODULE: ExtensionModule = createCardModule();

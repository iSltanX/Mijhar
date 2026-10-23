// الوحدة d.compare: ملخص المقارنة (فرعان أو التزامان أو وسمان) في صفحة compare (T-5.4). مضيفان منفصلان في جذري Shadow DOM
// شقيقين: الملخص المؤكد وتفسير الأثر، فلا يحتوي أحدهما الآخر هيكليًا. يُدرجان قبل حاوية الفروقات عبر ctx.mutations فيُزالان بإيقاف
// الوحدة، ويتجددان حين تُحمَّل ملفات إضافية في الصفحة. بلا أي طلب شبكة: الأرقام من الصفحة نفسها.
import { mountSurface } from '../../../core/ui-host/surface';
import type { UiSurface } from '../../../core/ui-host/surface';
import type { ExtensionModule, ModuleContext } from '../../../core';
import { D_CARD_CSS } from '../pr-status/style';
import { COMPARE_SELECTORS, readCompare } from './extract';
import { CompareFacts, CompareImpact } from './view';

export const COMPARE_MODULE_ID = 'd.compare';

export interface CompareOptions {
  /** مهلة تجميع التعديلات قبل إعادة القراءة. الافتراضي 400ms. */
  readonly debounceMs?: number;
}

export function createCompareModule(options: CompareOptions = {}): ExtensionModule {
  const debounceMs = options.debounceMs ?? 400;
  return {
    id: COMPARE_MODULE_ID,
    title: 'ملخص المقارنة',
    pages: ['compare'],
    selectors: COMPARE_SELECTORS,
    mount(ctx) {
      new CompareController(ctx, debounceMs).start();
    },
  };
}

class CompareController {
  private facts: UiSurface | null = null;
  private impact: UiSurface | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly debounceMs: number,
  ) {}

  start(): void {
    const { ctx } = this;
    this.refresh();
    const root = ctx.page.contentRoot ?? ctx.document.body;
    ctx.observe(root, { childList: true, subtree: true, characterData: true }, (records) => {
      const own = new Set<Node | undefined>([this.facts?.host, this.impact?.host]);
      if (records.some((r) => r.type === 'characterData' || [...r.addedNodes, ...r.removedNodes].some((n) => !own.has(n)))) this.schedule();
    });
    ctx.onTeardown(() => {
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
    });
  }

  private schedule(): void {
    if (this.timer || this.ctx.signal.aborted) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.refresh();
    }, this.debounceMs);
  }

  private spot(): { parent: Node; before: Node | null } {
    const { ctx } = this;
    const anchor = ctx.selectors.resolve(ctx.document, 'd.compare.anchor')?.element;
    if (anchor?.parentNode) return { parent: anchor.parentNode, before: anchor };
    const parent = ctx.page.contentRoot ?? ctx.document.body;
    return { parent, before: parent.firstChild };
  }

  private refresh(): void {
    const { ctx } = this;
    if (ctx.signal.aborted) return;
    const summary = readCompare(ctx.document, ctx.selectors, ctx.page.href);
    if (!this.facts || !this.impact) {
      const { parent, before } = this.spot();
      this.facts = mountSurface(ctx, { parent, before, styles: D_CARD_CSS, label: 'ملخص الملفات والتغييرات المؤكدة' });
      this.impact = mountSurface(ctx, { parent, before, styles: D_CARD_CSS, label: 'تفسير الأثر' });
    } else {
      // أعادت الصفحة رسم حاويتها فأزالت المضيفين: يُعاد إدراجهما بالترتيب نفسه.
      const detached = [this.facts, this.impact].filter((s) => !s.host.isConnected);
      if (detached.length) {
        const { parent, before } = this.spot();
        for (const s of detached) ctx.mutations.insert(parent, s.host, before);
      }
    }
    this.facts.render(<CompareFacts summary={summary} />);
    this.impact.render(<CompareImpact summary={summary} />);
  }
}

export const COMPARE_MODULE: ExtensionModule = createCompareModule();

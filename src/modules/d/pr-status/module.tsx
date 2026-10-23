// الوحدة d.pr-status: بطاقة ملخص حالة طلب الدمج في صفحة محادثة PR (T-5.1). تُدرج بعد ترويسة الطلب في جذر Shadow DOM عبر
// ctx.mutations فتُزال بإيقاف الوحدة، وتتجدد حين تتغير الصفحة (الفحوص تكتمل، والتزام جديد).
//  - الشبكة: طلب واحد لكل التزام إلى github.com نفسه (جزء status-details الذي تطلبه الصفحة بنفسها) حين لا يعرض DOM صفوف الفحوص؛
//    لا طلبات إلى api.github.com هنا (طبقة API الموثَّقة في T-5.2)، وفشله يُعلَن «غير متاح» ولا يُعرض نجاحًا.
import { mountSurface } from '../../../core/ui-host/surface';
import type { ExtensionModule, ModuleContext } from '../../../core';
import { PR_STATUS_SELECTORS, parseStatusDetails, readPrSummary } from './extract';
import type { FetchedChecks } from './extract';
import { D_CARD_CSS } from './style';
import { PrStatusCard } from './view';

export const PR_STATUS_MODULE_ID = 'd.pr-status';

export type FetchDetails = (url: string, signal: AbortSignal) => Promise<string>;

export interface PrStatusOptions {
  /** يجلب HTML جزء status-details. الافتراضي fetch بنفس الأصل. */
  readonly fetchDetails?: FetchDetails;
  /** مهلة تجميع التعديلات قبل إعادة القراءة. الافتراضي 300ms. */
  readonly debounceMs?: number;
}

const GITHUB_ORIGIN = 'https://github.com';

/** fetch بنفس أصل الصفحة وحده: لا يخرج الطلب عن github.com ولا يحمل رمزًا. */
export const sameOriginFetch: FetchDetails = async (url, signal) => {
  const target = new URL(url, GITHUB_ORIGIN);
  if (target.origin !== GITHUB_ORIGIN) throw new Error('رابط خارج github.com');
  const response = await fetch(target.href, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'text/html' }, signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
};

export function createPrStatusModule(options: PrStatusOptions = {}): ExtensionModule {
  const fetchDetails = options.fetchDetails ?? sameOriginFetch;
  const debounceMs = options.debounceMs ?? 300;
  return {
    id: PR_STATUS_MODULE_ID,
    title: 'ملخص حالة طلب الدمج',
    pages: ['pr'],
    selectors: PR_STATUS_SELECTORS,
    mount(ctx) {
      new PrStatusController(ctx, fetchDetails, debounceMs).start();
    },
  };
}

class PrStatusController {
  private surface: ReturnType<typeof mountSurface> | null = null;
  private fetched: (FetchedChecks & { readonly url: string }) | null = null;
  private pendingUrl: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private anchor: { parent: Node; before: Node | null } | null = null;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly fetchDetails: FetchDetails,
    private readonly debounceMs: number,
  ) {}

  start(): void {
    const { ctx } = this;
    this.refresh();
    const root = ctx.page.contentRoot ?? ctx.document.body;
    ctx.observe(root, { childList: true, subtree: true, characterData: true }, (records) => {
      // تعديلات مضيفنا وحده لا تستدعي إعادة قراءة (وإلا دارت الدورة)؛ وتغيّر نص أو عقد غيره يستدعيها.
      const own = this.surface?.host;
      const foreign = records.some((r) => r.type === 'characterData' || [...r.addedNodes, ...r.removedNodes].some((n) => n !== own));
      if (foreign) this.schedule();
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

  private place(): { parent: Node; before: Node | null } {
    const { ctx } = this;
    const header = ctx.selectors.resolve(ctx.document, 'd.pr.header')?.element;
    if (header?.parentNode) return { parent: header.parentNode, before: header.nextSibling };
    const parent = ctx.page.contentRoot ?? ctx.document.body;
    return { parent, before: parent.firstChild };
  }

  private refresh(): void {
    const { ctx } = this;
    if (ctx.signal.aborted) return;
    const read = (fetched: FetchedChecks | null) => readPrSummary(ctx.document, ctx.selectors, { fetched, pageNumber: ctx.page.number });
    const base = read(null);
    const url = base.checks.detailsUrl;
    // نتيجة التزام آخر لا تُعرض على الجديد: الرابط يحمل sha الالتزام.
    const fetched = url && this.fetched?.url === url ? this.fetched : null;
    this.draw(fetched ? read(fetched) : base, Boolean(url && !fetched));
    if (url && !fetched && this.pendingUrl !== url) this.load(url);
  }

  private draw(summary: ReturnType<typeof readPrSummary>, loading: boolean): void {
    const { ctx } = this;
    if (!this.surface) {
      const spot = (this.anchor = this.place());
      this.surface = mountSurface(ctx, { parent: spot.parent, before: spot.before, styles: D_CARD_CSS, label: 'ملخص حالة طلب الدمج' });
    } else if (!this.surface.host.isConnected && this.anchor) {
      // أعادت الصفحة رسم حاويتها فأزالت المضيف: يُعاد إدراجه في موضعه الجديد.
      const spot = (this.anchor = this.place());
      ctx.mutations.insert(spot.parent, this.surface.host, spot.before);
    }
    this.surface.render(<PrStatusCard summary={summary} loading={loading} />);
  }

  private load(url: string): void {
    const { ctx } = this;
    this.pendingUrl = url;
    this.fetchDetails(url, ctx.signal).then(
      (html) => {
        if (ctx.signal.aborted) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        this.fetched = { url, items: parseStatusDetails(doc), error: null };
        this.pendingUrl = null;
        this.refresh();
      },
      (error: unknown) => {
        if (ctx.signal.aborted) return;
        this.fetched = { url, items: [], error: error instanceof Error ? error.message : String(error) };
        this.pendingUrl = null;
        this.refresh();
      },
    );
  }
}

export const PR_STATUS_MODULE: ExtensionModule = createPrStatusModule();

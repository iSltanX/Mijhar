// الوحدة d.pr-status: بطاقة ملخص حالة طلب الدمج في صفحة محادثة PR (T-5.1). تُدرج بعد ترويسة الطلب في جذر Shadow DOM عبر
// ctx.mutations فتُزال بإيقاف الوحدة، وتتجدد حين تتغير الصفحة (الفحوص تكتمل، والتزام جديد).
//  - الشبكة: طلب واحد لكل التزام إلى github.com نفسه (جزء status-details الذي تطلبه الصفحة بنفسها) حين لا يعرض DOM صفوف الفحوص؛
//    لا طلبات إلى api.github.com هنا (طبقة API الموثَّقة في T-5.2)، وفشله يُعلَن «غير متاح» ولا يُعرض نجاحًا.
import { mountSurface } from '../../../core/ui-host/surface';
import type { ExtensionModule, ModuleContext } from '../../../core';
import { PR_STATUS_MODULE_ID } from './ids';
import { PR_STATUS_SELECTORS, parseStatusDetails, readPrSummary } from './extract';
import type { FetchedChecks } from './extract';
import { D_CARD_CSS } from './style';
import { PrStatusCard } from './view';

export { PR_STATUS_MODULE_ID };

export type FetchDetails = (url: string, signal: AbortSignal) => Promise<string>;

export interface PrStatusOptions {
  /** يجلب HTML جزء status-details. الافتراضي fetch بنفس الأصل. */
  readonly fetchDetails?: FetchDetails;
  /** مهلة تجميع التعديلات قبل إعادة القراءة. الافتراضي 300ms. */
  readonly debounceMs?: number;
  /** عمر نتيجة جلب التزام قبل أن تُجلب من جديد عند إعادة تركيب الوحدة (تنقل أو إعادة رسم الصفحة). الافتراضي 30 ثانية. */
  readonly cacheMs?: number;
  readonly now?: () => number;
}

/** نتيجة جلب لالتزام (مفتاحها رابط الجزء الحامل لـsha) تبقى صالحة عبر إعادات التركيب فلا يتكرر الطلب. */
type FetchCache = Map<string, { readonly at: number; readonly result: FetchedChecks & { readonly url: string } }>;

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
  const cache: FetchCache = new Map();
  const cacheMs = options.cacheMs ?? 30_000;
  const now = options.now ?? (() => Date.now());
  return {
    id: PR_STATUS_MODULE_ID,
    title: 'ملخص حالة طلب الدمج',
    pages: ['pr'],
    selectors: PR_STATUS_SELECTORS,
    mount(ctx) {
      new PrStatusController(ctx, fetchDetails, debounceMs, cache, cacheMs, now).start();
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
    private readonly cache: FetchCache,
    private readonly cacheMs: number,
    private readonly now: () => number,
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
    const hit = this.cache.get(url);
    if (hit && this.now() - hit.at < this.cacheMs) {
      this.fetched = hit.result;
      this.refresh();
      return;
    }
    this.pendingUrl = url;
    const done = (result: FetchedChecks): void => {
      if (ctx.signal.aborted) return;
      this.fetched = { url, ...result };
      // الفشل لا يُحفظ: إعادة التركيب تعيد المحاولة، والنجاح يُحفظ فلا يتكرر الطلب.
      if (!result.error) this.cache.set(url, { at: this.now(), result: this.fetched });
      this.pendingUrl = null;
      this.refresh();
    };
    this.fetchDetails(url, ctx.signal).then(
      (html) => done({ items: parseStatusDetails(new DOMParser().parseFromString(html, 'text/html')), error: null }),
      (error: unknown) => done({ items: [], error: error instanceof Error ? error.message : String(error) }),
    );
  }
}

export const PR_STATUS_MODULE: ExtensionModule = createPrStatusModule();

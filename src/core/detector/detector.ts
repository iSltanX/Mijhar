// PageDetector: يحدد نوع الصفحة الحالية ويُعلن تغيّرها، ويتابع التنقل الديناميكي (Turbo/SPA).
//
// مصادر التنقل:
//  - فورية: turbo:render وturbo:load (يُطلقهما Turbo بعد استبدال DOM)، فلا يُفحص DOM قبل اكتمال الاستبدال.
//  - مؤجَّلة حتى تهدأ (settleMs): popstate وpageshow وNavigation API وتغيّر <title> أو عنصر الجذر؛ هذه تسبق
//    غالبًا رسم المحتوى الجديد، فيُنتظر استقراره بدل الحكم على DOM قديم.
// يُعلَن التغيّر فقط حين تتغير «بصمة» الصفحة (المسار والنوع والثقة وهوية body والحاوية الرئيسية)، فيُطلَق
// turbo:render ثم turbo:load للتنقل الواحد حدثًا واحدًا لا اثنين.
import { EXTERNAL_ROUTE, GITHUB_ORIGIN, classifyPath } from './page-types';
import type { Confidence, PageState } from './page-types';
import { DEFAULT_SELECTORS, SelectorsRegistry } from './selectors';

export type PageListener = (page: PageState, previous: PageState | null) => void;

export interface PageDetectorOptions {
  document?: Document;
  selectors?: SelectorsRegistry;
  /** مراقبة <title> وعنصر الجذر احتياطًا لتنقل لا يطلق أحداث Turbo. افتراضيًا true. */
  observeDom?: boolean;
  /** مهلة الهدوء للمصادر المؤجَّلة بالميلي ثانية. افتراضيًا 100. */
  settleMs?: number;
  /** يستقبل أخطاء المشتركين؛ الافتراضي console.error. */
  onError?: (error: unknown) => void;
}

const DEFAULT_SETTLE_MS = 100;

export class PageDetector {
  readonly selectors: SelectorsRegistry;
  private readonly doc: Document;
  private readonly observeDom: boolean;
  private readonly settleMs: number;
  private readonly onError: (error: unknown) => void;
  private readonly listeners = new Set<PageListener>();
  private readonly identities = new WeakMap<Node, number>();
  private nextIdentity = 1;
  private cleanups: Array<() => void> = [];
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private last: PageState | null = null;
  private lastSignature: string | null = null;

  constructor(options: PageDetectorOptions = {}) {
    this.doc = options.document ?? document;
    this.selectors = options.selectors ?? new SelectorsRegistry(DEFAULT_SELECTORS);
    this.observeDom = options.observeDom ?? true;
    this.settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
    this.onError = options.onError ?? ((error) => console.error('[mijhar] خطأ في مشترك PageDetector', error));
  }

  /** يقيس الصفحة الآن دون إعلان ولا تغيير حالة. */
  detect(): PageState {
    const view = this.doc.defaultView;
    const url = new URL(view?.location.href ?? this.doc.URL);
    const route = url.origin === GITHUB_ORIGIN ? classifyPath(url.pathname) : EXTERNAL_ROUTE;
    const contentRoot = this.selectors.resolve(this.doc, 'content-root')?.element ?? null;
    const confirmKey = `confirm.${route.type}`;
    const confirmed = this.selectors.has(confirmKey) && this.selectors.resolve(this.doc, confirmKey) !== null;
    const confidence: Confidence = confirmed ? 'high' : 'low';
    return { href: url.href, type: route.type, owner: route.owner, repo: route.repo, number: route.number, confidence, contentRoot };
  }

  /** آخر حالة أُعلنت، أو null قبل start(). */
  current(): PageState | null {
    return this.last;
  }

  subscribe(listener: PageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** يربط مصادر التنقل ويعلن الحالة الأولى (previous = null). تكرار الاستدعاء بلا أثر. */
  start(): void {
    if (this.started) return;
    this.started = true;
    const view = this.doc.defaultView;

    this.listen(this.doc, 'turbo:render', () => this.check());
    this.listen(this.doc, 'turbo:load', () => this.check());
    if (view) {
      this.listen(view, 'popstate', () => this.settle());
      this.listen(view, 'pageshow', () => this.settle());
      const navigation = (view as { navigation?: EventTarget }).navigation;
      if (navigation) this.listen(navigation, 'navigatesuccess', () => this.settle());
    }
    if (this.observeDom && view && 'MutationObserver' in view) {
      const observer = new view.MutationObserver(() => this.settle());
      const title = this.doc.querySelector('title');
      if (title) observer.observe(title, { childList: true, characterData: true, subtree: true });
      observer.observe(this.doc.documentElement, { childList: true });
      this.cleanups.push(() => observer.disconnect());
    }
    this.check();
  }

  /** يفك كل المصادر والمؤقتات والمشتركين؛ لا يبقى مستمع ولا مراقب. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    this.listeners.clear();
    this.last = null;
    this.lastSignature = null;
  }

  /** يفحص الآن ويُعلن إن تغيرت البصمة. يعيد true إن أُعلن تغيّر. */
  check(): boolean {
    if (!this.started) return false;
    const page = this.detect();
    const signature = this.signature(page);
    if (signature === this.lastSignature) return false;
    const previous = this.last;
    this.last = page;
    this.lastSignature = signature;
    for (const listener of [...this.listeners]) {
      try {
        listener(page, previous);
      } catch (error) {
        this.onError(error);
      }
    }
    return true;
  }

  private settle(): void {
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.check();
    }, this.settleMs);
  }

  private listen(target: EventTarget, type: string, handler: () => void): void {
    target.addEventListener(type, handler);
    this.cleanups.push(() => target.removeEventListener(type, handler));
  }

  private identity(node: Node | null): number {
    if (!node) return 0;
    let id = this.identities.get(node);
    if (id === undefined) {
      id = this.nextIdentity;
      this.nextIdentity += 1;
      this.identities.set(node, id);
    }
    return id;
  }

  // الهاش لا يدخل البصمة: تغيّره لا يغيّر المحتوى. البحث (search) يدخل لأنه يغيّره.
  private signature(page: PageState): string {
    const url = new URL(page.href);
    return [
      url.origin + url.pathname + url.search,
      page.type,
      page.confidence,
      this.identity(this.doc.body),
      this.identity(page.contentRoot),
    ].join('|');
  }
}

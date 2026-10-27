// PageDetector: يحدد نوع الصفحة الحالية ويُعلن تغيّرها، ويتابع التنقل الديناميكي.
//
// ما قيس على github.com الحي (evidence/T-1.2/live-selector-check.md، 2026-10-23، صفحات مستودع عام، قراءة فقط):
//  - التنقل بين صفحات React (قائمة المشكلات ← قائمة طلبات الدمج) ودخول تبويبات طلب الدمج (المحادثة ← الالتزامات) لا يطلق
//    أحداث Turbo مطلقًا؛ تبقى هوية body وعنصر الحاوية والعنوان كما هي. والترتيب مختلف: في الأولى يتغير المسار أولًا
//    (بعد نحو 13 مللي ثانية) ثم يصل DOM بعد نحو 240 مللي ثانية؛ وفي الثانية يصل DOM أولًا ثم يتغير المسار في آخر التنقل.
//  - عنصر <title> يُستبدل بعنصر جديد، فمراقبته مباشرة لا تلتقط شيئًا.
// لذلك لا يُحكم على DOM لحظة تغيّر المسار، بل بعد «هدوء»: كل مصدر تنقل أو تعديل في شجرة الصفحة يعيد ضبط مؤقت settleMs،
// ويُفحص بعد انقضائه دون تعديلات جديدة (وبحد أقصى settleMaxMs إن لم تهدأ الصفحة).
// وتغيّر المسار وحده لا يُعلن حتى يصل DOM الجديد (VR-08): إعلان واحد لكل تنقل بعد DOM الجديد. «التعديل المؤهل» childList داخل
// حاوية المحتوى (content-root) ليس كله من صنع الإضافة (mijhar-host و[data-mijhar-injected])؛ وما في body خارجها (بطاقة تحويم
// أو نافذة منبثقة أو إشعار) لا يؤهل. عند تغيّر المسار:
//  - DOM أولًا: تعديل مؤهل بعد آخر إعلان تنقل وقبل تغيّر المسار بما لا يزيد على settleMaxMs ⇐ يُعلن بعد الهدوء كما كان.
//  - المسار أولًا: يُنتظر أول تعديل مؤهل بعده ثم الهدوء، وبحد أقصى settleMaxMs من تغيّر المسار (فيُعلن تنقل بلا DOM جديد عنده).
// وتعديلات الإضافة وحدها لا تحرّك الهدوء فلا تؤخر إعلانًا ولا تعيده. خطر باقٍ مقبول: تعديل مؤهل لا علاقة له بالتنقل داخل الحاوية
// قبيل تنقل من النوع نفسه يأخذ مسار «DOM أولًا».
//
// المصادر:
//  - فورية: turbo:render وturbo:load (إن أطلقهما Turbo بعد استبدال DOM).
//  - تنتظر الهدوء: popstate وpageshow وأحداث Navigation API (navigatesuccess وcurrententrychange، وهي متاحة في Chrome
//    وEdge وBrave وFirefox 158 حيث فُحصت) وتعديلات شجرة body (childList) غير الصادرة عن الإضافة واستبدال body/head.
// يُعلَن التغيّر فقط حين تتغير «بصمة» الصفحة (المسار والنوع والثقة وهوية body والحاوية الرئيسية)، فيُطلَق turbo:render
// ثم turbo:load للتنقل الواحد حدثًا واحدًا لا اثنين، ويمرّ تعديل الوحدات لشجرة الصفحة دون إعلان ما دامت البصمة ثابتة.
// استثناء واحد (GEMINI-001): تنقل أُعلن وعنصر تأكيد الصفحة (أو أول ابن للحاوية إن لم يتأكد) هو عنصر الصفحة السابقة نفسه، أي أن DOM الجديد
// ربما لم يصل بعد (React يبقي <main> ويضع مؤشر تحميل). إن استُبدل ذلك العنصر خلال LATE_DOM_WINDOW_MS أُعيد الإعلان مرة واحدة فتُركَّب الوحدات
// على DOM الصفحة الجديدة؛ وبعد النافذة أو بلا هذا الشرط تبقى إعادة رسم GitHub لسطوح keepAttached لا لإعادة التركيب.
// ووصول DOM التنقل يُميَّز من إعادة رسم الصفحة بترتيب التعديل والرابط لا بالنص وحده (مراجعة 2026-10-28، الحالات أ6 وف4 وف5 وف7):
//  - «منطقة هوية» الصفحة المعلنة عنصر تأكيدها، أو حاويتها كلها إن لم تتأكد (أول ابن للحاوية، كترويسة المستودع، قد يتطابق بين صفحتين).
//  - إن لم يسبق تغيّرَ الرابط تعديلٌ في تلك المنطقة (الرابط أولًا) فالإعلان على DOM الصفحة السابقة، واستبدال عنصر الهوية هو وصول الجديد.
//  - وإن سبقه تعديل فيها خلال settleMaxMs (DOM أولًا) فالإعلان رأى الصفحة الجديدة على الأرجح، واستبدال العنصر بعدها لا يعيد الإعلان ما دامت
//    المنطقة تعرض ما رآه الإعلان (إعادة رسم)؛ وإن تغيّرت فلا يُفصل بين تحديث حي (ف3) وتعديل لا علاقة له سبق تنقلًا بالرابط أولًا (ف5)، فيُعاد.
//  - التعديلات المنتظرة في طابور المراقب حين يُرى تغيّر الرابط سبقته (React يكتب DOM ويستدعي pushState في مهمة واحدة، وتُطلق Navigation API
//    حدث currententrychange أثناءه)، فتُسجَّل قبل الحكم. ولا تأخير لأي إعلان.
import { EXTERNAL_ROUTE, GITHUB_ORIGIN, classifyPath } from './page-types';
import type { Confidence, PageState } from './page-types';
import { DEFAULT_SELECTORS, SelectorsRegistry } from './selectors';

export type PageListener = (page: PageState, previous: PageState | null) => void;

export interface PageDetectorOptions {
  document?: Document;
  selectors?: SelectorsRegistry;
  /** مراقبة شجرة الصفحة لالتقاط تنقل بلا أحداث (React). افتراضيًا true. */
  observeDom?: boolean;
  /** مهلة الهدوء بالميلي ثانية قبل الفحص بعد آخر تنقل أو تعديل. افتراضيًا 100. */
  settleMs?: number;
  /** أقصى انتظار للهدوء إن استمرت التعديلات. افتراضيًا 1000. */
  settleMaxMs?: number;
  /** يستقبل أخطاء المشتركين؛ الافتراضي console.error. */
  onError?: (error: unknown) => void;
}

const DEFAULT_SETTLE_MS = 100;
const DEFAULT_SETTLE_MAX_MS = 1000;
/** مدة ترقّب DOM تنقل أُعلن قبل وصوله: بطء الشبكة المعتاد دونها، وبعدها لا يُعاد تركيب الصفحة لاستبدال عنصر فيها. */
export const LATE_DOM_WINDOW_MS = 10_000;

/**
 * نص منطقة الهوية (textContent) بمسافات مطبَّعة. نص الإضافة في جذور ظلية لا يدخله، وتغليفها لنص الصفحة (العزل، و«الترجمة فقط») يبقيه كما هو.
 * يُحسب فقط عند إعلان تنقل سبقه تعديل في المنطقة وبقي فيه عنصر الهوية، ثم عند استبدال العنصر خلال النافذة.
 */
const regionText = (element: Element): string => (element.textContent ?? '').replace(/\s+/g, ' ').trim();

/** ما تحقنه الإضافة في الصفحة: المضيفات وعناصر الوحدات المعلَّمة، والعقد التي نُقلت إلى داخلها (تغليف نص). */
const OWN = 'mijhar-host, [data-mijhar-injected]';
const isOwn = (node: Node): boolean => Boolean((node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest(OWN));

/** المسار بلا الهاش: ما يميز تنقلًا عن آخر. */
const urlKey = (href: string): string => {
  const url = new URL(href);
  return url.origin + url.pathname + url.search;
};

export class PageDetector {
  readonly selectors: SelectorsRegistry;
  private readonly doc: Document;
  private readonly observeDom: boolean;
  private readonly settleMs: number;
  private readonly settleMaxMs: number;
  private readonly onError: (error: unknown) => void;
  private readonly listeners = new Set<PageListener>();
  private readonly identities = new WeakMap<Node, number>();
  private nextIdentity = 1;
  private cleanups: Array<() => void> = [];
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private settleStartedAt: number | null = null;
  private observer: MutationObserver | null = null;
  private observedBody: HTMLElement | null = null;
  private started = false;
  private last: PageState | null = null;
  private lastSignature: string | null = null;
  // VR-08: ترتيب التعديلات المؤهلة والإعلانات بعدّاد (لا بالوقت وحده: قد يتساويان في المللي ثانية نفسها).
  private seq = 0;
  private qualifyingSeq = 0;
  private qualifyingAt: number | null = null;
  private navigationSeq = 0;
  private urlChangedAt: number | null = null;
  private capTimer: ReturnType<typeof setTimeout> | null = null;
  /** عنصر هوية الصفحة عند آخر إعلان (عنصر التأكيد، أو أول ابن للحاوية). */
  private lastMarker: Element | null = null;
  /** منطقة هوية الصفحة عند آخر إعلان: عنصر تأكيدها، أو حاويتها إن لم تتأكد. */
  private lastRegion: Element | null = null;
  /** آخر تعديل من الصفحة مسّ تلك المنطقة، بوقته وترتيبه. */
  private regionAt: number | null = null;
  private regionSeq = 0;
  /** تغيّر الرابط الجاري سبقه تعديل في منطقة الهوية خلال settleMaxMs (DOM أولًا)؛ يُحكم عند أول رؤية لتغيّر الرابط. */
  private domFirst = false;
  /** تنقل أُعلن وعنصر الهوية هو عنصر الصفحة السابقة نفسه: يُرتقب استبداله حتى pendingUntil. */
  private pendingMarker: Element | null = null;
  /** حين سبق الرابطَ تعديلٌ في المنطقة: نصها عند الإعلان، وهل هي الحاوية (وإلا عنصر التأكيد). null حين أُعلن بالرابط أولًا. */
  private pendingRegionText: string | null = null;
  private pendingRegionIsRoot = false;
  private pendingUntil = 0;

  constructor(options: PageDetectorOptions = {}) {
    this.doc = options.document ?? document;
    this.selectors = options.selectors ?? new SelectorsRegistry(DEFAULT_SELECTORS);
    this.observeDom = options.observeDom ?? true;
    this.settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
    this.settleMaxMs = options.settleMaxMs ?? DEFAULT_SETTLE_MAX_MS;
    this.onError = options.onError ?? ((error) => console.error('[mijhar] خطأ في مشترك PageDetector', error));
  }

  /** يقيس الصفحة الآن دون إعلان ولا تغيير حالة. */
  detect(): PageState {
    return this.measure().page;
  }

  /** الصفحة الآن، وعنصر هويتها: عنصر التأكيد إن وُجد، وإلا أول ابن للحاوية ليس من الإضافة. */
  private measure(): { page: PageState; marker: Element | null; confirm: Element | null } {
    const view = this.doc.defaultView;
    const url = new URL(view?.location.href ?? this.doc.URL);
    const route = url.origin === GITHUB_ORIGIN ? classifyPath(url.pathname) : EXTERNAL_ROUTE;
    const contentRoot = this.selectors.resolve(this.doc, 'content-root')?.element ?? null;
    const confirmKey = `confirm.${route.type}`;
    const confirm = this.selectors.has(confirmKey) ? (this.selectors.resolve(this.doc, confirmKey)?.element ?? null) : null;
    const confidence: Confidence = confirm ? 'high' : 'low';
    const marker = confirm ?? [...(contentRoot?.children ?? [])].find((child) => !isOwn(child)) ?? null;
    return { page: { href: url.href, type: route.type, owner: route.owner, repo: route.repo, number: route.number, confidence, contentRoot }, marker, confirm };
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

    // Turbo يطلقهما بعد استبدال DOM نفسه: الصفحة الجديدة حاضرة فلا انتظار.
    this.listen(this.doc, 'turbo:render', () => this.check(true));
    this.listen(this.doc, 'turbo:load', () => this.check(true));
    if (view) {
      this.listen(view, 'popstate', () => this.settle());
      this.listen(view, 'pageshow', () => this.settle());
      const navigation = (view as { navigation?: EventTarget }).navigation;
      if (navigation) {
        this.listen(navigation, 'navigatesuccess', () => this.settle());
        this.listen(navigation, 'currententrychange', () => this.settle());
      }
      if (this.observeDom && 'MutationObserver' in view) {
        this.observer = new view.MutationObserver((records) => this.mutated(records));
        this.cleanups.push(() => {
          this.observer?.disconnect();
          this.observer = null;
          this.observedBody = null;
        });
        this.observeTree();
      }
    }
    this.check();
  }

  /** يفك كل المصادر والمؤقتات والمشتركين؛ لا يبقى مستمع ولا مراقب. */
  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.settleStartedAt = null;
    this.clearCap();
    this.urlChangedAt = null;
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    this.listeners.clear();
    this.last = null;
    this.lastSignature = null;
    this.lastMarker = null;
    this.lastRegion = null;
    this.regionAt = null;
    this.domFirst = false;
    this.clearPending();
  }

  /**
   * يفحص الآن ويُعلن إن تغيرت البصمة. يعيد true إن أُعلن تغيّر. تغيّر المسار لا يُعلن قبل DOM الجديد (VR-08) إلا بـdomReady
   * (أحداث Turbo بعد الاستبدال) أو عند بلوغ الحد الأقصى.
   */
  check(domReady = false): boolean {
    if (!this.started) return false;
    this.observeTree();
    const { page, marker, confirm } = this.measure();
    const signature = this.signature(page);
    const lateDom = this.lateDom(marker, confirm, page.contentRoot);
    if (signature === this.lastSignature && !lateDom) {
      this.urlChangedAt = null;
      this.domFirst = false;
      this.clearCap();
      return false;
    }
    const navigated = this.last === null || urlKey(page.href) !== urlKey(this.last.href);
    if (navigated && this.last !== null && !domReady && !this.domArrived()) {
      this.awaitDom();
      return false;
    }
    // DOM أولًا: تعديل في منطقة هوية الصفحة المعلنة سبق تغيّر الرابط (أو سبق هذا الفحص إن لم يُرَ التغيّر قبله).
    const domFirst = navigated && this.last !== null && (this.urlChangedAt !== null ? this.domFirst : this.regionChangedBefore(Date.now()));
    this.clearCap();
    this.urlChangedAt = null;
    this.domFirst = false;
    if (navigated) this.navigationSeq = ++this.seq;
    const stale = navigated && this.last !== null && marker !== null && marker === this.lastMarker;
    const region = confirm ?? page.contentRoot;
    this.pendingMarker = stale ? marker : null;
    this.pendingRegionText = stale && domFirst && region ? regionText(region) : null;
    this.pendingRegionIsRoot = confirm === null;
    this.pendingUntil = stale ? Date.now() + LATE_DOM_WINDOW_MS : 0;
    const previous = this.last;
    this.last = page;
    this.lastSignature = signature;
    this.lastMarker = marker;
    this.lastRegion = region;
    for (const listener of [...this.listeners]) {
      try {
        listener(page, previous);
      } catch (error) {
        this.onError(error);
      }
    }
    return true;
  }

  /**
   * DOM تنقل أُعلن قبله وصل الآن (GEMINI-001): استُبدل خلال النافذة عنصر الهوية الذي بقي عند الإعلان. إن أُعلن بالرابط أولًا فالاستبدال هو
   * الوصول. وإن سبق الرابطَ تعديلٌ في منطقة الهوية فالإعلان رأى الصفحة الجديدة، والاستبدال إعادة رسم ما دامت المنطقة تعرض ما رآه: يُتابَع
   * العنصر الجديد ولا يُعاد الإعلان. بانقضاء النافذة يُترك الترقب.
   */
  private lateDom(marker: Element | null, confirm: Element | null, contentRoot: Element | null): boolean {
    if (this.pendingMarker === null || marker === null || marker === this.pendingMarker) return false;
    if (Date.now() > this.pendingUntil) {
      this.clearPending();
      return false;
    }
    if (this.pendingRegionText === null) return true;
    const region = this.pendingRegionIsRoot ? contentRoot : confirm;
    if (region === null || regionText(region) !== this.pendingRegionText) return true;
    this.pendingMarker = marker;
    return false;
  }

  private clearPending(): void {
    this.pendingMarker = null;
    this.pendingRegionText = null;
    this.pendingUntil = 0;
  }

  /** هل مسّ تعديلٌ من الصفحة منطقةَ الهوية بعد آخر إعلان تنقل، في حدود settleMaxMs قبل at. */
  private regionChangedBefore(at: number): boolean {
    return this.regionAt !== null && this.regionSeq > this.navigationSeq && at - this.regionAt <= this.settleMaxMs;
  }

  /** هل وصل DOM التنقل الجاري: تعديل مؤهل بعد آخر إعلان تنقل، لا يسبق تغيّر المسار بأكثر من settleMaxMs؛ أو بلغ الانتظار حده. */
  private domArrived(): boolean {
    const since = this.urlChangedAt ?? Date.now();
    if (this.qualifyingAt !== null && this.qualifyingSeq > this.navigationSeq && since - this.qualifyingAt <= this.settleMaxMs) return true;
    return Date.now() - since >= this.settleMaxMs;
  }

  // المسار تغيّر ولم يصل DOM: فحص عند الحد الأقصى من تغيّره إن لم يحرّكه تعديل مؤهل قبله.
  private awaitDom(): void {
    if (this.urlChangedAt === null) {
      this.urlChangedAt = Date.now();
      this.domFirst = this.regionChangedBefore(this.urlChangedAt);
    }
    if (this.capTimer !== null) return;
    this.capTimer = setTimeout(() => {
      this.capTimer = null;
      this.check();
    }, Math.max(0, this.urlChangedAt + this.settleMaxMs - Date.now()));
  }

  private clearCap(): void {
    if (this.capTimer !== null) clearTimeout(this.capTimer);
    this.capTimer = null;
  }

  // أول لحظة يُرى فيها المسار مختلفًا عن آخر إعلان (من حدث تنقل أو تعديل). ما ينتظر في طابور المراقب سبق هذه الرؤية فيُسجَّل أولًا، ثم يُحكم
  // هل سبق الرابطَ تعديلٌ في منطقة الهوية (DOM أولًا). يُستدعى من settle() وحدها، فيتبعه ضبط مؤقت الهدوء لما سُجِّل.
  private noteUrl(): void {
    if (this.urlChangedAt !== null || !this.last) return;
    const view = this.doc.defaultView;
    if (urlKey(view?.location.href ?? this.doc.URL) === urlKey(this.last.href)) return;
    const queued = this.observer?.takeRecords() ?? [];
    if (queued.length) this.classify(queued);
    this.urlChangedAt = Date.now();
    this.domFirst = this.regionChangedBefore(this.urlChangedAt);
  }

  private mutated(records: readonly MutationRecord[]): void {
    if (this.classify(records)) this.settle();
  }

  // تعديلات الإضافة وحدها لا تحرّك شيئًا؛ وما عداها يحرّك الهدوء، والمؤهل منه (داخل الحاوية) يُسجَّل بوقته وترتيبه، وكذلك ما مسّ منطقة هوية
  // الصفحة المعلنة. يعيد هل فيها تعديل من الصفحة.
  private classify(records: readonly MutationRecord[]): boolean {
    let foreign = false;
    let qualifying = false;
    let region = false;
    const roots = this.roots();
    const announced = this.lastRegion;
    for (const record of records) {
      if (record.type !== 'childList') continue;
      const nodes = [...record.addedNodes, ...record.removedNodes];
      if (nodes.every(isOwn)) continue;
      foreign = true;
      const touches = (root: Element): boolean => root.contains(record.target) || nodes.some((node) => node === root || node.contains(root));
      if (!roots.length || roots.some(touches)) qualifying = true;
      if (announced && touches(announced)) region = true;
    }
    if (qualifying) {
      this.qualifyingAt = Date.now();
      this.qualifyingSeq = ++this.seq;
    }
    if (region) {
      this.regionAt = Date.now();
      this.regionSeq = ++this.seq;
    }
    return foreign;
  }

  // حاوية المحتوى المعلنة، والحالية إن فُصلت تلك (استبدال الحاوية نفسها).
  private roots(): Element[] {
    const announced = this.last?.contentRoot ?? null;
    if (announced?.isConnected) return [announced];
    const current = this.selectors.resolve(this.doc, 'content-root')?.element ?? null;
    return [announced, current].filter((root): root is Element => root !== null);
  }

  // يعيد ضبط مؤقت الهدوء؛ يُفحص بعد settleMs دون جديد، أو عند بلوغ settleMaxMs منذ أول استدعاء في الدفعة.
  private settle(): void {
    this.noteUrl();
    const now = Date.now();
    this.settleStartedAt ??= now;
    if (this.settleTimer !== null) clearTimeout(this.settleTimer);
    const remaining = Math.max(0, this.settleMaxMs - (now - this.settleStartedAt));
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.settleStartedAt = null;
      this.check();
    }, Math.min(this.settleMs, remaining));
  }

  // يراقب html (استبدال head/body) وbody (childList). عند استبدال body يُعاد الربط بالجديد ليبقى المراقب حيًا.
  private observeTree(): void {
    const observer = this.observer;
    const body = this.doc.body;
    if (!observer || !body || body === this.observedBody) return;
    observer.disconnect();
    observer.observe(this.doc.documentElement, { childList: true });
    observer.observe(body, { childList: true, subtree: true });
    this.observedBody = body;
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

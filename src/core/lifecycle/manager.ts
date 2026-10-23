// LifecycleManager: يوفّق بين «الوحدات المفعَّلة والملائمة للصفحة الحالية» و«الوحدات المركَّبة».
//  - تنقّل: ما لم يعد ملائمًا يُوقَف، وما صار ملائمًا يُركَّب، وما بقي ملائمًا يُعاد تركيبه بسياق جديد
//    (DOM الصفحة استُبدل، فلا يُفترض أن حقنه السابق باقٍ؛ والإيقاف ثم التركيب يمنع الحقن المكرر).
//  - تغيّر الإعدادات (refresh): يُركَّب ويُوقَف ما تغيّر فقط، ولا يُعاد تركيب غيره.
// الإيقاف النظيف: إلغاء ctx.signal ← unmount الوحدة ← مستمعات ومراقبات وتنظيف مخصص ← استعادة DOM المسجَّل.
// خطأ وحدة واحدة يُعزل: تُستعاد تعديلاتها الجزئية وتبقى بقية الوحدات تعمل.
import type { PageDetector, PageState, SelectorsRegistry } from '../detector';
import { moduleMatchesPage } from '../registry';
import type { ExtensionModule, ModuleContext, ModuleRegistry } from '../registry';
import { MutationRecorder } from './mutation-registry';
import type { RestoreReport } from './mutation-registry';

export type ModuleState = 'unmounted' | 'mounted' | 'failed';
export type ReconcileReason = 'navigation' | 'settings';
export type LifecyclePhase = 'mount' | 'unmount' | 'teardown' | 'enabled-check';

export interface LifecycleError {
  readonly moduleId: string;
  readonly phase: LifecyclePhase;
  readonly error: unknown;
}

export interface ReconcileResult {
  readonly reason: ReconcileReason;
  readonly page: PageState;
  readonly mounted: readonly string[];
  readonly unmounted: readonly string[];
  readonly remounted: readonly string[];
  readonly failed: readonly string[];
  readonly durationMs: number;
}

export interface LifecycleManagerOptions {
  registry: ModuleRegistry;
  detector: PageDetector;
  /** مفتاح تشغيل الوحدة (من سجل الإعدادات). استثناء هنا يعني «معطَّلة». */
  isEnabled: (moduleId: string) => boolean;
  document?: Document;
  onError?: (event: LifecycleError) => void;
  /** يُستدعى بعد كل إيقاف بتقريره، ومنه ما سُجِّل من استثناءات الاستعادة. */
  onRestore?: (report: RestoreReport) => void;
  onReconcile?: (result: ReconcileResult) => void;
  now?: () => number;
}

class ModuleScope implements ModuleContext {
  readonly mutations: MutationRecorder;
  readonly signal: AbortSignal;
  private readonly controller = new AbortController();
  private readonly disposers: Array<() => void> = [];
  private closed = false;

  constructor(
    readonly moduleId: string,
    readonly document: Document,
    readonly page: PageState,
    readonly selectors: SelectorsRegistry,
    now: () => number,
    private readonly fail: (phase: LifecyclePhase, error: unknown) => void,
  ) {
    this.mutations = new MutationRecorder(moduleId, now);
    this.signal = this.controller.signal;
  }

  listen(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void {
    if (this.closed) return;
    target.addEventListener(type, listener, options);
    this.disposers.push(() => target.removeEventListener(type, listener, options));
  }

  observe(target: Node, init: MutationObserverInit, callback: MutationCallback): MutationObserver {
    const Observer = this.document.defaultView?.MutationObserver ?? MutationObserver;
    const observer = new Observer(callback);
    if (this.closed) return observer;
    observer.observe(target, init);
    this.disposers.push(() => observer.disconnect());
    return observer;
  }

  onTeardown(cleanup: () => void): void {
    if (this.closed) return;
    this.disposers.push(cleanup);
  }

  /** يغلق السياق ويستعيد DOM. لا يرمي أبدًا. */
  teardown(): RestoreReport {
    this.closed = true;
    this.controller.abort();
    for (const dispose of this.disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch (error) {
        this.fail('teardown', error);
      }
    }
    return this.mutations.restore();
  }
}

interface ActiveModule {
  readonly module: ExtensionModule;
  readonly scope: ModuleScope;
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';

export class LifecycleManager {
  private readonly registry: ModuleRegistry;
  private readonly detector: PageDetector;
  private readonly isEnabled: (moduleId: string) => boolean;
  private readonly doc: Document;
  private readonly onError: (event: LifecycleError) => void;
  private readonly onRestore: (report: RestoreReport) => void;
  private readonly onReconcile: (result: ReconcileResult) => void;
  private readonly now: () => number;
  private readonly active = new Map<string, ActiveModule>();
  private readonly failedModules = new Map<string, unknown>();
  private unsubscribe: (() => void) | null = null;
  private startedDetector = false;
  private lastPage: PageState | null = null;

  constructor(options: LifecycleManagerOptions) {
    this.registry = options.registry;
    this.detector = options.detector;
    this.isEnabled = options.isEnabled;
    this.doc = options.document ?? document;
    this.onError = options.onError ?? ((event) => console.error(`[mijhar] ${event.moduleId}: ${event.phase}`, event.error));
    this.onRestore = options.onRestore ?? (() => {});
    this.onReconcile = options.onReconcile ?? (() => {});
    this.now = options.now ?? (() => globalThis.performance.now());
  }

  get running(): boolean {
    return this.unsubscribe !== null;
  }

  mountedIds(): string[] {
    return [...this.active.keys()];
  }

  stateOf(moduleId: string): ModuleState {
    if (this.active.has(moduleId)) return 'mounted';
    return this.failedModules.has(moduleId) ? 'failed' : 'unmounted';
  }

  /** آخر خطأ تركيب لكل وحدة فاشلة (يُمسح عند نجاح تركيبها لاحقًا). */
  failures(): ReadonlyMap<string, unknown> {
    return this.failedModules;
  }

  /** يشترك في PageDetector ويوفّق على الحالة الحالية. تكرار الاستدعاء بلا أثر. */
  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = this.detector.subscribe((page) => this.reconcile(page, 'navigation'));
    const current = this.detector.current();
    if (current) this.reconcile(current, 'navigation');
    else {
      this.startedDetector = true;
      this.detector.start();
    }
  }

  /** يوقف كل الوحدات بترتيب معاكس لتركيبها ويفك الاشتراك. */
  stop(): void {
    if (!this.unsubscribe) return;
    this.unsubscribe();
    this.unsubscribe = null;
    for (const id of [...this.active.keys()].reverse()) this.unmount(id);
    if (this.startedDetector) this.detector.stop();
    this.startedDetector = false;
    this.lastPage = null;
  }

  /** بعد تغيّر مفاتيح التشغيل: يركّب ويوقف ما تغيّر فقط. */
  refresh(): ReconcileResult | null {
    if (!this.unsubscribe || !this.lastPage) return null;
    return this.reconcile(this.lastPage, 'settings');
  }

  private reconcile(page: PageState, reason: ReconcileReason): ReconcileResult {
    const started = this.now();
    this.lastPage = page;
    this.syncSelectors();
    const mounted: string[] = [];
    const unmounted: string[] = [];
    const remounted: string[] = [];
    const failed: string[] = [];

    for (const module of this.registry.list()) {
      const desired = this.isDesired(module, page);
      const isActive = this.active.has(module.id);
      if (isActive && !desired) {
        this.unmount(module.id);
        unmounted.push(module.id);
      } else if (isActive && desired && reason === 'navigation') {
        this.unmount(module.id);
        (this.mount(module, page) ? remounted : failed).push(module.id);
      } else if (!isActive && desired) {
        (this.mount(module, page) ? mounted : failed).push(module.id);
      }
    }

    const result: ReconcileResult = { reason, page, mounted, unmounted, remounted, failed, durationMs: this.now() - started };
    this.onReconcile(result);
    return result;
  }

  private isDesired(module: ExtensionModule, page: PageState): boolean {
    try {
      if (!this.isEnabled(module.id)) return false;
    } catch (error) {
      this.onError({ moduleId: module.id, phase: 'enabled-check', error });
      return false;
    }
    try {
      return moduleMatchesPage(module, page);
    } catch (error) {
      this.onError({ moduleId: module.id, phase: 'mount', error });
      return false;
    }
  }

  // محددات الوحدات تُضاف مرة؛ ما عُدِّل في الجدول قبل ذلك (ترقيع) لا يُستبدل.
  private syncSelectors(): void {
    const { selectors } = this.detector;
    for (const module of this.registry.list()) {
      for (const entry of module.selectors ?? []) if (!selectors.has(entry.key)) selectors.define(entry);
    }
  }

  private mount(module: ExtensionModule, page: PageState): boolean {
    const scope = new ModuleScope(module.id, this.doc, page, this.detector.selectors, this.now, (phase, error) =>
      this.onError({ moduleId: module.id, phase, error }),
    );
    try {
      const returned: unknown = module.mount(scope);
      if (isThenable(returned)) {
        throw new Error('mount() يجب أن تكون متزامنة؛ ابدأ العمل غير المتزامن داخلها وراقب ctx.signal');
      }
    } catch (error) {
      this.failedModules.set(module.id, error);
      this.onError({ moduleId: module.id, phase: 'mount', error });
      this.onRestore(scope.teardown());
      return false;
    }
    this.failedModules.delete(module.id);
    this.active.set(module.id, { module, scope });
    return true;
  }

  private unmount(moduleId: string): void {
    const active = this.active.get(moduleId);
    if (!active) return;
    this.active.delete(moduleId);
    try {
      active.module.unmount?.(active.scope);
    } catch (error) {
      this.onError({ moduleId, phase: 'unmount', error });
    }
    this.onRestore(active.scope.teardown());
  }
}

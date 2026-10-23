// ModuleARuntime: يوفّق بين «الميزات التي يشملها نطاقها في هذه الصفحة» و«الميزات المركَّبة» داخل تركيب واحد للوحدة (أ)، ويعيد
// التوفيق عند تغيّر إعداد أو تجاوز مؤقت دون إعادة تحميل الصفحة ولا إعادة تركيب الوحدة (AC-A7 البندان ١ و٢).
// إيقاف الميزة (FeatureScope.teardown): إلغاء signal ← المستمعات والمراقبات والتنظيف المخصص ← إزالة تحويلاتها النصية بحارس الملكية
// ← كتلة أنماطها ← استعادة سجل تعديلاتها؛ ويُقاس زمنه (PB-01) ويُبلَّغ تقريره. خطأ ميزة واحدة يُعزل عن غيرها.
// MutationRecorder من ملفه لا من واجهة النواة: core/registry.ts يستورد هذه الوحدة، فلا تستورد الوحدة قيمة من core/index.ts.
import { MutationRecorder } from '../../../core/lifecycle/mutation-registry';
import type { JsonValue, ModuleContext, RestoreReport, SettingDefinition } from '../../../core';
import { TextTransformRegistry } from '../guard';
import type { TextRestoreReport, TextRestoreSkip, TextTransform } from '../guard';
import type { FeatureContext, FeatureText, ModuleAFeature } from './feature';
import { featureSettingKey, isFeatureSetting, resolveScope } from './scope';
import type { FeatureSetting, PageOverrides, ScopeDecision } from './scope';

export const READING_STYLES_ID = 'mijhar-reading-styles';

/** ما تحتاجه الوحدة من سجل الإعدادات (يطابقه SettingsStore). */
export interface SettingsReader {
  get(key: string): JsonValue;
  subscribe(listener: (change: { readonly key: string }) => void): () => void;
}

export type FeatureStopReason = 'out-of-scope' | 'settings' | 'unmount' | 'mount-failed';

export interface FeatureStopReport {
  readonly featureId: string;
  readonly reason: FeatureStopReason;
  readonly restore: RestoreReport;
  /** null إن لم تطبّق الميزة تحويلًا نصيًا. */
  readonly text: TextRestoreReport | null;
  readonly errors: readonly unknown[];
  /** من بدء الإيقاف حتى اكتمال إزالة الأثر (PB-01). */
  readonly durationMs: number;
}

export interface ModuleARuntimeOptions {
  readonly settings: SettingsReader | null;
  readonly overrides: PageOverrides;
  readonly features: readonly ModuleAFeature[];
  readonly onReport?: (report: FeatureStopReport) => void;
  readonly onError?: (featureId: string, error: unknown) => void;
  readonly now?: () => number;
}

// كتل الأنماط بترتيب الميزات في عنصر واحد #mijhar-reading-styles؛ يُدرج عبر سجل الوحدة (فيُزال حتمًا بإيقافها) ويُزال حين لا تبقى كتلة.
class ReadingStyles {
  private readonly blocks = new Map<string, string>();
  private element: HTMLStyleElement | null = null;

  constructor(
    private readonly doc: Document,
    private readonly order: readonly string[],
    private readonly insert: (parent: Node, node: Node) => void,
  ) {}

  set(featureId: string, css: string): void {
    this.blocks.set(featureId, css);
    this.render();
  }

  delete(featureId: string): void {
    if (this.blocks.delete(featureId)) this.render();
  }

  private render(): void {
    const css = this.order.filter((id) => this.blocks.has(id)).map((id) => `/* ${id} */\n${this.blocks.get(id)}`).join('\n');
    if (!css) {
      this.element?.remove();
      this.element = null;
      return;
    }
    if (!this.element?.isConnected) {
      this.element = this.doc.createElement('style');
      this.element.id = READING_STYLES_ID;
      this.element.textContent = css;
      this.insert(this.doc.head ?? this.doc.documentElement, this.element);
    } else if (this.element.textContent !== css) this.element.textContent = css;
  }
}

class FeatureScope implements FeatureContext {
  readonly featureId: string;
  readonly mutations: MutationRecorder;
  readonly signal: AbortSignal;
  readonly text: FeatureText;
  readonly styles: { set(css: string): void };
  private readonly controller = new AbortController();
  private readonly disposers: Array<() => void> = [];
  private readonly transforms = new Set<string>();
  private closed = false;

  constructor(
    feature: ModuleAFeature,
    private readonly module: ModuleContext,
    private readonly runtime: { engine(): TextTransformRegistry; engineIfAny(): TextTransformRegistry | null; styles: ReadingStyles; read(key: string, fallback: JsonValue): JsonValue },
    private readonly now: () => number,
    private readonly definitions: readonly SettingDefinition[],
  ) {
    this.featureId = feature.id;
    this.mutations = new MutationRecorder(`${module.moduleId}.${feature.id}`, now);
    this.signal = this.controller.signal;
    this.text = {
      register: (transform: TextTransform) => {
        const engine = this.runtime.engine();
        if (!engine.has(transform.id)) engine.register(transform);
      },
      apply: (transformId: string, nodes: Iterable<Node>) => {
        if (this.closed) return 0;
        this.transforms.add(transformId);
        return this.runtime.engine().apply(transformId, nodes);
      },
    };
    this.styles = { set: (css: string) => !this.closed && this.runtime.styles.set(this.featureId, css) };
  }

  get document(): Document {
    return this.module.document;
  }

  get page(): ModuleContext['page'] {
    return this.module.page;
  }

  get selectors(): ModuleContext['selectors'] {
    return this.module.selectors;
  }

  setting<T extends JsonValue = JsonValue>(key: string): T {
    const definition = this.definitions.find((d) => d.key === key);
    if (!definition) throw new Error(`إعداد غير معرَّف للميزة ${this.featureId}: ${key}`);
    return this.runtime.read(key, definition.default) as T;
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
    if (!this.closed) this.disposers.push(cleanup);
  }

  teardown(reason: FeatureStopReason): FeatureStopReport {
    const started = this.now();
    this.closed = true;
    this.controller.abort();
    const errors: unknown[] = [];
    for (const dispose of this.disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    let text: TextRestoreReport | null = null;
    const engine = this.runtime.engineIfAny();
    if (engine && this.transforms.size) {
      const parts = [...this.transforms].map((id) => engine.remove(id));
      const skipped: TextRestoreSkip[] = parts.flatMap((p) => p.skipped);
      text = {
        transforms: parts.flatMap((p) => p.transforms),
        restored: parts.reduce((n, p) => n + p.restored, 0),
        rewritten: parts.reduce((n, p) => n + p.rewritten, 0),
        skipped,
        durationMs: parts.reduce((n, p) => n + p.durationMs, 0),
      };
    }
    this.runtime.styles.delete(this.featureId);
    const restore = this.mutations.restore();
    return { featureId: this.featureId, reason, restore, text, errors, durationMs: this.now() - started };
  }
}

interface ActiveFeature {
  readonly scope: FeatureScope;
  /** قيم إعدادات الميزة الخاصة وقت التركيب؛ تغيّرها يعيد التركيب. */
  readonly signature: string;
}

export class ModuleARuntime {
  private readonly active = new Map<string, ActiveFeature>();
  private readonly styles: ReadingStyles;
  private readonly now: () => number;
  private engine: TextTransformRegistry | null = null;
  private readonly unsubscribe: Array<() => void> = [];
  private stopped = false;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly options: ModuleARuntimeOptions,
  ) {
    this.now = options.now ?? (() => globalThis.performance.now());
    this.styles = new ReadingStyles(ctx.document, options.features.map((f) => f.id), (parent, node) => {
      ctx.mutations.insert(parent, node);
    });
  }

  /** يركّب الميزات التي يشملها نطاقها ويشترك في تغيّر الإعدادات والتجاوزات. */
  start(): void {
    this.options.overrides.prune(this.ctx.page.href);
    this.reconcile();
    const settings = this.options.settings;
    if (settings) this.unsubscribe.push(settings.subscribe((change) => change.key.startsWith('modules.a.') && this.reconcile()));
    this.unsubscribe.push(this.options.overrides.subscribe(() => this.reconcile()));
    this.ctx.onTeardown(() => this.stop());
  }

  activeFeatures(): string[] {
    return [...this.active.keys()];
  }

  decision(feature: ModuleAFeature): ScopeDecision {
    return resolveScope(this.featureSetting(feature), this.ctx.page, this.options.overrides.get(feature.id, this.ctx.page.href));
  }

  /** يركّب ويوقف ما تغيّر قراره أو إعداداته الخاصة فقط. */
  reconcile(): void {
    if (this.stopped) return;
    for (const feature of this.options.features) {
      const desired = this.decision(feature).active;
      const current = this.active.get(feature.id);
      if (current && !desired) this.stopFeature(feature.id, 'out-of-scope');
      else if (current && desired && current.signature !== this.signature(feature)) {
        this.stopFeature(feature.id, 'settings');
        this.mountFeature(feature);
      } else if (!current && desired) this.mountFeature(feature);
    }
  }

  /** يوقف كل الميزات بترتيب معاكس ويغلق المحرك ويفك الاشتراكات. تكراره بلا أثر. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    for (const dispose of this.unsubscribe.splice(0)) dispose();
    for (const id of [...this.active.keys()].reverse()) this.stopFeature(id, 'unmount');
    this.engine?.dispose();
    this.engine = null;
  }

  private featureSetting(feature: ModuleAFeature): FeatureSetting {
    const value = this.read(featureSettingKey(feature.id), feature.defaults as unknown as JsonValue);
    return isFeatureSetting(value) ? value : feature.defaults;
  }

  // قيمة إعداد من السجل، أو الافتراضي إن لم يُربط السجل أو لم يُعرَّف المفتاح فيه أو رُفضت القيمة.
  private read(key: string, fallback: JsonValue): JsonValue {
    const settings = this.options.settings;
    if (!settings) return fallback;
    try {
      return settings.get(key);
    } catch {
      return fallback;
    }
  }

  private signature(feature: ModuleAFeature): string {
    return JSON.stringify((feature.settings ?? []).map((d) => this.read(d.key, d.default)));
  }

  private mountFeature(feature: ModuleAFeature): void {
    const scope = new FeatureScope(
      feature,
      this.ctx,
      {
        engine: () => (this.engine ??= new TextTransformRegistry({ root: this.ctx.document, now: this.now })),
        engineIfAny: () => this.engine,
        styles: this.styles,
        read: (key, fallback) => this.read(key, fallback),
      },
      this.now,
      feature.settings ?? [],
    );
    try {
      feature.mount(scope);
    } catch (error) {
      this.options.onError?.(feature.id, error);
      // الإيقاف يُنفَّذ قبل التبليغ: onReport?.(teardown()) لا يقيّم المعامل إن غاب المستمع.
      const report = scope.teardown('mount-failed');
      this.options.onReport?.(report);
      return;
    }
    this.active.set(feature.id, { scope, signature: this.signature(feature) });
  }

  private stopFeature(featureId: string, reason: FeatureStopReason): void {
    const active = this.active.get(featureId);
    if (!active) return;
    this.active.delete(featureId);
    const report = active.scope.teardown(reason);
    this.options.onReport?.(report);
  }
}

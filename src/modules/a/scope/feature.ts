// عقد «ميزة» داخل الوحدة (أ) (F-A7): لكل إعداد في الوحدة نطاقه ومفتاحه، ويُركَّب ويُوقَف وحده دون إعادة تركيب الوحدة، بسياق يشبه
// ModuleContext في النواة: سجل تعديلات خاص بالميزة (ليُزال أثرها وحدها عند إيقافها)، ومحرك النصوص المشترك بحارسه، وكتلة أنماطها
// في #mijhar-reading-styles. كل ما يُنشأ عبر السياق يُزال عند إيقاف الميزة.
import type { JsonValue, MutationRecorder, PageState, SelectorEntry, SelectorsRegistry, SettingDefinition } from '../../../core';
import type { TextTransform } from '../guard';
import type { FeatureSetting } from './scope';

export interface FeatureText {
  /** يعرّف تحويلًا في المحرك المشترك (مرة لكل معرّف طوال تركيب الوحدة). */
  register(transform: TextTransform): void;
  /** يطبّق تحويلًا عرّفته الميزة على عقد نصية؛ يُزال تلقائيًا بشروط الحارس عند إيقافها. */
  apply(transformId: string, nodes: Iterable<Node>): number;
}

export interface FeatureContext {
  readonly featureId: string;
  readonly document: Document;
  readonly page: PageState;
  readonly selectors: SelectorsRegistry;
  /** سجل تعديلات DOM الخاص بالميزة؛ يُعكس كله عند إيقافها. */
  readonly mutations: MutationRecorder;
  readonly text: FeatureText;
  /** كتلة أنماط الميزة داخل #mijhar-reading-styles؛ تُزال عند إيقافها، ويُزال العنصر حين لا تبقى كتلة. */
  readonly styles: { set(css: string): void };
  /** يُلغى عند إيقاف الميزة. */
  readonly signal: AbortSignal;
  /** قيمة إعداد خاص بالميزة (من settings في تعريفها)، أو افتراضيه إن تعذّرت القراءة. */
  setting<T extends JsonValue = JsonValue>(key: string): T;
  listen(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void;
  observe(target: Node, init: MutationObserverInit, callback: MutationCallback): MutationObserver;
  onTeardown(cleanup: () => void): void;
}

export interface ModuleAFeature {
  /** معرّف ثابت؛ مفتاح إعداده modules.a.<id>. */
  readonly id: string;
  readonly title: string;
  /** القيمة الافتراضية للتشغيل والنطاق. */
  readonly defaults: FeatureSetting;
  /** إعدادات إضافية تخص الميزة؛ تغيّر أي منها يعيد تركيبها. */
  readonly settings?: readonly SettingDefinition[];
  /** محددات تضيفها إلى SelectorsRegistry عبر تعريف الوحدة. */
  readonly selectors?: readonly SelectorEntry[];
  /** متزامنة. استثناء هنا يُعزل: تُعكس تعديلاتها الجزئية وتبقى الميزات الأخرى. */
  mount(ctx: FeatureContext): void;
}

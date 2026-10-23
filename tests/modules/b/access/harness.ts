// تركيب وحدة بطاقة الشرح على العينة المرجعية لاختبارات الوصول (T-3.3): وضع شرح معزول لكل اختبار، ومواضع ثابتة بدل التخطيط.
import { LifecycleManager, ModuleRegistry, PageDetector } from '../../../../src/core';
import type { ExtensionApi } from '../../../../src/core';
import { ExplainMode, createCardModule } from '../../../../src/modules/b/card';
import { act } from 'preact/test-utils';
import { flush, hostsOf, stubRects } from '../card/helpers';

export interface Live {
  readonly manager: LifecycleManager;
  readonly mode: ExplainMode;
  readonly errors: unknown[];
}

export async function mountCard(options: { api?: ExtensionApi | null } = {}): Promise<Live> {
  const mode = new ExplainMode();
  const errors: unknown[] = [];
  const manager = new LifecycleManager({
    registry: new ModuleRegistry([createCardModule({ mode, api: options.api ?? null, rectOf: stubRects(), debounceMs: 5 })]),
    detector: new PageDetector({ document, settleMs: 5 }),
    isEnabled: () => true,
    document,
    onError: (event) => errors.push(event),
  });
  manager.start();
  await flush(20);
  return { manager, mode, errors };
}

export const host = (): HTMLElement => hostsOf('b.card')[0] as HTMLElement;
export const shadow = (): ShadowRoot => host().shadowRoot as ShadowRoot;
export const badges = (): HTMLButtonElement[] => [...(host()?.shadowRoot?.querySelectorAll<HTMLButtonElement>('.badge') ?? [])];
export const badge = (id: string): HTMLButtonElement => badges().find((b) => b.dataset.entry === id) as HTMLButtonElement;

export function press(init: KeyboardEventInit, target: EventTarget = document): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, composed: true, ...init });
  act(() => void target.dispatchEvent(event));
  return event;
}
export const altH = (target?: EventTarget): KeyboardEvent => press({ key: '˙', code: 'KeyH', altKey: true }, target);

/** مؤشر لمسي كما تُنتجه المتصفحات: pointerdown ثم pointerup ثم click على الهدف نفسه. */
export function tap(target: EventTarget, pointerType: 'touch' | 'mouse' | 'pen' = 'touch'): void {
  const View = window as unknown as { PointerEvent?: typeof MouseEvent };
  const Ctor = (View.PointerEvent ?? MouseEvent) as typeof MouseEvent;
  const init = { bubbles: true, cancelable: true, composed: true, pointerType, isPrimary: true } as MouseEventInit;
  act(() => {
    target.dispatchEvent(new Ctor('pointerdown', init));
    target.dispatchEvent(new Ctor('pointerup', init));
    (target as HTMLElement).click();
  });
}

/** يضبط matchMedia: كل استعلام يتضمن أحد المفاتيح المعطاة يطابق. */
export function stubMedia(matching: readonly string[]): () => void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: matching.some((key) => query.includes(key)),
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    if (original) window.matchMedia = original;
    else delete (window as { matchMedia?: unknown }).matchMedia;
  };
}

export { flush };

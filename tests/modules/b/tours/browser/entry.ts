// مدخل حزمة اختبار (لا تُشحن) لـe2e الجولات الإرشادية (T-3.5) في المتصفحات: يركّب وحدة b.tours كما تُشحن على عينات الصفحة وعلى لقطات GitHub حقيقية محفوظة، ويقيس بالتخطيط الحقيقي.
// النقر على أزرار الشريط والـEscape والـTab يرسلها run.mjs من خارج الصفحة (أحداث موثوقة). والمراقبة هنا: كل حدث أو نداء اصطناعي أو موثوق يبلغ عنصرًا من الصفحة (لا من الشريط).
import { TOURS, TourState, createToursModule, getTour } from '../../../../../src/modules/b/tours';
import { mountInPage } from '../../../browser-context';
import type { MountedModule } from '../../../browser-context';

let mounted: MountedModule | null = null;
let state: TourState | null = null;
let pristine = '';
const events: string[] = [];
const calls: string[] = [];
let instrumented = false;

const settle = (ms = 80): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const hostsOf = (name: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`mijhar-host[data-mijhar-host="${name}"]`)];
const rect = (el: Element): { x: number; y: number; w: number; h: number } => {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
};
const center = (el: Element): { x: number; y: number } => {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
};
const inExtension = (node: unknown): boolean => node instanceof Node && node.getRootNode() instanceof ShadowRoot;

/** يراقب كل حدث يصل عنصرًا من الصفحة (لا من جذور الإضافة) ونداءات click/focus/submit/dispatchEvent على عناصرها. */
function instrument(): boolean {
  if (instrumented) return true;
  instrumented = true;
  for (const type of ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'submit', 'input', 'change', 'keydown', 'keyup', 'focusin']) {
    document.addEventListener(
      type,
      (event) => {
        const origin = event.composedPath()[0];
        if (!inExtension(origin)) events.push(`${type}:${(origin as Element | null)?.id || (origin as Node | null)?.nodeName}:${event.isTrusted ? 'trusted' : 'synthetic'}`);
      },
      true,
    );
  }
  const watch = (proto: object, name: string): void => {
    const original = (proto as Record<string, (...args: unknown[]) => unknown>)[name]!;
    (proto as Record<string, unknown>)[name] = function (this: unknown, ...args: unknown[]) {
      if (!inExtension(this)) calls.push(`${name}:${(this as Element | null)?.id || (this as Node | null)?.nodeName}`);
      return original.apply(this, args);
    };
  };
  watch(HTMLElement.prototype, 'click');
  watch(HTMLFormElement.prototype, 'submit');
  watch(HTMLFormElement.prototype, 'requestSubmit');
  watch(EventTarget.prototype, 'dispatchEvent');
  return true;
}

/** يركّب الوحدة على الصفحة ويبدأ الجولة عند الخطوة المطلوبة (الحالة مشتركة كما بعد تنقل Turbo). */
async function mount(arg: { href: string; tour: string; step: number }): Promise<{ hosts: number }> {
  pristine = document.documentElement.outerHTML;
  state = new TourState();
  mounted = mountInPage(createToursModule({ state, api: null, debounceMs: 20 }), arg.href);
  await settle(60);
  state.start(arg.tour);
  for (let i = 0; i < arg.step; i += 1) state.next();
  await settle(220);
  return { hosts: hostsOf('b.tours').length };
}

function bar(): unknown {
  const host = hostsOf('b.tours')[0];
  const root = host?.shadowRoot;
  const el = root?.querySelector<HTMLElement>('.tour-bar');
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const hl = hostsOf('b.search.highlight')[0]?.shadowRoot;
  const rings = [...(hl?.querySelectorAll<HTMLElement>('.ring') ?? [])].map(rect);
  const out: Record<string, unknown> = { open: Boolean(el), active: state?.status ?? null, rings, ringHost: hostsOf('b.search.highlight').length };
  if (!el || !root) return out;
  const r = el.getBoundingClientRect();
  Object.assign(out, {
    hostIsLast: document.body.lastElementChild === host || [...document.body.children].slice(-3).includes(host!),
    rect: rect(el),
    inViewport: r.left >= 0 && r.top >= 0 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5,
    resolution: el.dataset.resolution,
    step: el.dataset.step,
    tour: el.dataset.tour,
    title: root.querySelector('[data-tour-step-title]')?.textContent ?? null,
    tag: root.querySelector('.tour-tag')?.textContent ?? null,
    absent: root.querySelector('[data-tour-absent]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    visual: root.querySelector('[data-tour-visual]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    wire: Boolean(root.querySelector('.tour-wire')),
    link: root.querySelector<HTMLAnchorElement>('[data-action="tour-open-page"]')?.getAttribute('href') ?? null,
    focus: root.activeElement ? ((root.activeElement as HTMLElement).dataset.action ?? (root.activeElement as HTMLElement).className) : null,
    buttons: Object.fromEntries([...root.querySelectorAll<HTMLElement>('[data-action]')].map((b) => [b.getAttribute('data-action'), { disabled: (b as HTMLButtonElement).disabled, ...center(b) }])),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  });
  return out;
}

function takeEvents(): { events: string[]; calls: string[] } {
  return { events: events.splice(0), calls: calls.splice(0) };
}

function sameAsPristine(): { same: boolean } {
  return { same: document.documentElement.outerHTML === pristine };
}

function stop(): unknown {
  const report = mounted?.stop();
  mounted = null;
  state = null;
  return { hosts: document.querySelectorAll('mijhar-host').length, identical: document.documentElement.outerHTML === pristine, skipped: report?.skipped.length ?? 0 };
}

function resources(): string[] {
  return performance.getEntriesByType('resource').map((e) => e.name);
}

function catalog(): unknown {
  return TOURS.map((t) => ({ id: t.id, steps: t.steps.length, visualOnly: t.visualOnly, stepKinds: t.steps.map((s) => (s.visual ? 'visual' : s.entry === null ? 'text' : 'entry')), paths: t.steps.map((s) => s.path ?? null), known: Boolean(getTour(t.id)) }));
}

/** يحذف عنصر صفحة بمعرّفه (لاختبار بطاقة الغياب)، ويحدّث «النقاء» ليقارن الإيقاف بما بعد الحذف. */
function removeById(id: string): boolean {
  document.getElementById(id)?.remove();
  pristine = document.documentElement.outerHTML;
  return true;
}

const api: Record<string, (arg?: never) => unknown> = { instrument, mount, bar, takeEvents, sameAsPristine, stop, resources, catalog, removeById } as never;

function call(name: string, argJson: string): boolean {
  const w = window as unknown as { __mjDone: boolean; __mjResult: string | null };
  w.__mjDone = false;
  w.__mjResult = null;
  const arg = argJson ? JSON.parse(argJson) : undefined;
  Promise.resolve()
    .then(() => (api[name] as (a?: unknown) => unknown)(arg))
    .then(
      (value) => void ((w.__mjResult = JSON.stringify(value ?? null)), (w.__mjDone = true)),
      (error) => void ((w.__mjResult = JSON.stringify({ error: String(error?.stack ?? error) })), (w.__mjDone = true)),
    );
  return true;
}

Object.assign(window, { MijharE2E: { call } });

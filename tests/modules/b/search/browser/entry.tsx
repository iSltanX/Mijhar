// مدخل حزمة اختبار (لا تُشحن) لـe2e البحث في القاموس (T-3.4) في المتصفحات: يرسم واجهة البحث الحقيقية (GlossarySearchView) في جذر Shadow
// DOM كما يفعل الدرج، ويركّب وحدة b.search على الصفحة كما تُشحن، ويقيس بالتخطيط الحقيقي: زمن «إدخال الحرف حتى ظهور النتائج» (PB-03)
// ومواضع حلقات الإبراز فوق العناصر. المدخلات الحقيقية (لوحة مفاتيح وفأرة) يرسلها run.mjs من خارج الصفحة.
import { render } from 'preact';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry, requestPanelTab } from '../../../../../src/core';
import { createShadowHost } from '../../../../../src/core/ui-host/shadow';
import { ACTIVE_LOCATOR, CATEGORY_IDS, GlossarySearchView, createSearchModule, directBridge } from '../../../../../src/modules/b/search';
import { GLOSSARY_ENTRIES } from '../../../../../src/modules/b/card';
import { mountInPage } from '../../../browser-context';
import type { MountedModule } from '../../../browser-context';

let mounted: MountedModule | null = null;
let pristine = '';
let settings: SettingsStore | null = null;
let panel: ReturnType<typeof createShadowHost> | null = null;

const settle = (ms = 80): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const hostOf = (name: string): HTMLElement | null => document.querySelector(`mijhar-host[data-mijhar-host="${name}"]`);
const panelRoot = (): ShadowRoot | null => panel?.shadow ?? null;

function mountPage(href: string): { ok: true } {
  pristine = document.documentElement.outerHTML;
  mounted = mountInPage(createSearchModule({ api: null, holdMs: 60_000 }), href);
  return { ok: true };
}

async function mountView(width: number): Promise<{ ok: true }> {
  const area = new MemoryStorageArea();
  settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry());
  panel = createShadowHost(document, {
    name: 'e2e-panel',
    hostCss: `:host { all: initial !important; display: block !important; position: absolute !important; inset-block-start: 0 !important; inset-inline-end: 0 !important; width: ${width}px !important; max-height: 100vh !important; overflow: auto !important; z-index: 2147483000 !important; }`,
  });
  document.body.append(panel.host);
  render(<GlossarySearchView settings={settings} surface="native" bridge={directBridge()} />, panel.root);
  await settle();
  return { ok: true };
}

async function requestGlossary(): Promise<unknown> {
  await requestPanelTab(settings as SettingsStore, 'glossary');
  await settle();
  return viewState();
}

const labelOf = (el: Element | null): string | null => (el ? `${el.localName}${el.id ? `#${el.id}` : ''}${el.getAttribute('data-action') ? `{${el.getAttribute('data-action')}}` : ''}${el.getAttribute('data-category') ? `[${el.getAttribute('data-category')}]` : ''}` : null);

function viewState(): unknown {
  const root = panelRoot();
  if (!root) return null;
  const input = root.querySelector<HTMLInputElement>('input[type="search"]');
  const host = panel!.host;
  const wide = [...root.querySelectorAll<HTMLElement>('*')].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible' && el.getBoundingClientRect().right > host.getBoundingClientRect().right + 1);
  return {
    query: input?.value ?? null,
    focused: labelOf(root.activeElement),
    count: root.querySelector('.count')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
    dataCount: Number(root.querySelector('.count')?.getAttribute('data-count') ?? -1),
    results: [...root.querySelectorAll<HTMLElement>('.result')].map((el) => ({ id: el.dataset.entry, via: el.dataset.via, open: el.dataset.open, category: el.querySelector('.tag[data-category]')?.getAttribute('data-category') })),
    docs: [...root.querySelectorAll<HTMLAnchorElement>('.result a[data-action="docs"]')].map((a) => ({ href: a.href, target: a.target, rel: a.rel })),
    chips: [...root.querySelectorAll<HTMLElement>('.chip-btn')].map((el) => ({ id: el.dataset.category, pressed: el.getAttribute('aria-pressed'), text: el.textContent?.replace(/\s+/g, ' ').trim() })),
    hasMore: root.querySelector('[data-action="more"]') !== null,
    emptyShown: root.querySelector('[data-empty-results]') !== null,
    locateNotes: [...root.querySelectorAll<HTMLElement>('.locate-note')].map((el) => ({ status: el.dataset.status, text: el.textContent?.replace(/\s+/g, ' ').trim() })),
    cards: root.querySelectorAll('.card').length,
    overflow: { hostScrollWidth: host.scrollWidth, hostClientWidth: host.clientWidth, wideElements: wide.slice(0, 3).map((el) => labelOf(el)) },
  };
}

function rectOfAction(arg: { action: string; entry?: string; category?: string }): { x: number; y: number; w: number; h: number } | null {
  const root = panelRoot();
  if (!root) return null;
  let el: Element | null | undefined;
  if (arg.action === 'category') el = root.querySelector(`.chip-btn[data-category="${arg.category}"]`);
  else if (arg.action === 'input') el = root.querySelector('input[type="search"]');
  else el = root.querySelector(`.result[data-entry="${arg.entry}"] [data-action="${arg.action}"]`) ?? root.querySelector(`[data-action="${arg.action}"]`);
  if (!el) return null;
  (el as HTMLElement).scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
}

function focusInput(): { focused: string | null } {
  const input = panelRoot()?.querySelector<HTMLInputElement>('input[type="search"]');
  input?.focus();
  input?.select();
  return { focused: labelOf(panelRoot()?.activeElement ?? null) };
}

// ——— زمن «إدخال الحرف حتى ظهور النتائج» (PB-03) ———
interface Sample {
  readonly query: string;
  readonly dom: number;
  readonly frame: number;
}
let samples: Sample[] = [];
let pending: { t0: number; query: string } | null = null;
let installed = false;

function instrumentLatency(): boolean {
  const root = panelRoot();
  if (!root || installed) return installed;
  installed = true;
  samples = [];
  const input = root.querySelector<HTMLInputElement>('input[type="search"]')!;
  const target = root.querySelector('.gsearch')!;
  // t0: لحظة وصول حدث input الفعلي إلى الصفحة (مستمع الالتقاط قبل مستمع الواجهة).
  input.addEventListener(
    'input',
    () => {
      pending = { t0: performance.now(), query: input.value };
    },
    true,
  );
  // t_dom: أول تعديل في DOM بعد الحدث (Preact يرسم في microtask). t_frame: أول إطار بعده (يشمل الأنماط والتخطيط قبل الرسم).
  new MutationObserver(() => {
    if (!pending) return;
    const { t0, query } = pending;
    pending = null;
    const dom = performance.now() - t0;
    requestAnimationFrame(() => samples.push({ query, dom, frame: performance.now() - t0 }));
  }).observe(target, { childList: true, subtree: true, characterData: true, attributes: true });
  return true;
}

function latencies(): Sample[] {
  return samples.map((s) => ({ query: s.query, dom: Math.round(s.dom * 100) / 100, frame: Math.round(s.frame * 100) / 100 }));
}

function resetLatencies(): boolean {
  samples = [];
  return true;
}

// ——— إبراز الموضع في الصفحة ———
async function highlight(entryId: string): Promise<unknown> {
  const result = ACTIVE_LOCATOR.current?.locate(entryId) ?? { status: 'no-locator' };
  await settle(250);
  const host = hostOf('b.search.highlight');
  const rings = [...(host?.shadowRoot?.querySelectorAll<HTMLElement>('.ring') ?? [])].map((r) => {
    const b = r.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  return { result, hostCount: document.querySelectorAll('mijhar-host[data-mijhar-host="b.search.highlight"]').length, rings, viewport: { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }, scrollY: Math.round(window.scrollY) };
}

/** هل حلقة الإبراز الأولى تحيط بأحد العناصر المطابقة (بهامش 4px)، بحسب محدد عنصر الصفحة. */
function ringAroundElement(selector: string): { around: boolean; ring: unknown; element: unknown } {
  const el = document.querySelector(selector);
  const ring = hostOf('b.search.highlight')?.shadowRoot?.querySelector('.ring');
  if (!el || !ring) return { around: false, ring: null, element: null };
  const e = el.getBoundingClientRect();
  const r = ring.getBoundingClientRect();
  const near = (a: number, b: number): boolean => Math.abs(a - b) <= 2;
  return {
    around: near(r.left, e.left - 4) && near(r.top, e.top - 4) && near(r.width, e.width + 8) && near(r.height, e.height + 8),
    ring: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    element: { x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.width), h: Math.round(e.height) },
  };
}

function highlightState(): unknown {
  return { hosts: document.querySelectorAll('mijhar-host[data-mijhar-host="b.search.highlight"]').length };
}

function scrollTo(y: number): number {
  window.scrollTo(0, y);
  return window.scrollY;
}

function clearHighlight(): unknown {
  ACTIVE_LOCATOR.current?.clear();
  return highlightState();
}

function pageStats(): unknown {
  return { entries: GLOSSARY_ENTRIES.length, categories: CATEGORY_IDS.length, docHeight: document.documentElement.scrollHeight, viewportH: document.documentElement.clientHeight };
}

function stop(): unknown {
  if (panel) {
    render(null, panel.root);
    panel.host.remove();
    panel = null;
  }
  const report = mounted?.stop();
  mounted = null;
  const now = document.documentElement.outerHTML;
  return { hosts: document.querySelectorAll('mijhar-host').length, identical: now === pristine, skipped: report?.skipped.length ?? 0 };
}

const api: Record<string, (arg?: never) => unknown> = { mountPage, mountView, requestGlossary, viewState, rectOfAction, focusInput, instrumentLatency, latencies, resetLatencies, highlight, ringAroundElement, highlightState, scrollTo, clearHighlight, pageStats, stop } as never;

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

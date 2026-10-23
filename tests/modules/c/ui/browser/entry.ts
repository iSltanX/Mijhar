// مدخل حزمة اختبار (لا تُشحن) لـe2e واجهة الترجمة (T-4.1) في المتصفحات: يركّب وحدة c.ui كما تُشحن بمحرك وهمي (FakeTranslationEngine) على صفحة حقيقية، ويقيس
// بالتخطيط الحقيقي: مواضع الأزرار والترجمات والأصول، والأنماط المحسوبة، وما يُخفى وما يظهر. النقر والتحديد الفعليان يرسلهما run.mjs من خارج الصفحة.
import { FakeTranslationEngine, createTranslateModule } from '../../../../../src/modules/c/ui';
import type { FakeMode } from '../../../../../src/modules/c/ui';
import { mountInPage } from '../../../browser-context';
import type { MountedModule } from '../../../browser-context';

let mounted: MountedModule | null = null;
let engine: FakeTranslationEngine | null = null;
let pristine = '';
let snapshot = '';

const settle = (ms = 100): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const hostsOf = (name: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`mijhar-host[data-mijhar-host="${name}"]`)];
const rect = (el: Element): { x: number; y: number; w: number; h: number } => {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
};

interface MountArg {
  href: string;
  engine: { mode?: FakeMode; delayMs?: number; unavailable?: string } | null;
}

async function mount(arg: MountArg): Promise<{ bars: number }> {
  pristine = document.documentElement.outerHTML;
  engine = arg.engine ? new FakeTranslationEngine({ ...(arg.engine.mode ? { mode: arg.engine.mode } : {}), ...(arg.engine.delayMs ? { delayMs: arg.engine.delayMs } : {}), ...(arg.engine.unavailable ? { availability: { state: 'unavailable', reason: arg.engine.unavailable } } : {}) }) : null;
  mounted = mountInPage(createTranslateModule({ service: engine, debounceMs: 20, selection: { debounceMs: 20 } }), arg.href);
  await settle(150);
  return { bars: hostsOf('c.ui.bar').length };
}

function engineSet(patch: { mode?: FakeMode; delayMs?: number }): boolean {
  if (!engine) return false;
  if (patch.mode) engine.mode = patch.mode;
  if (patch.delayMs !== undefined) engine.delayMs = patch.delayMs;
  return true;
}

const bodyOf = (selector: string): Element => document.querySelector(selector) as Element;
const barOf = (selector: string): HTMLElement => bodyOf(selector).previousElementSibling as HTMLElement;

function barState(selector: string): unknown {
  const bar = barOf(selector);
  const root = bar?.shadowRoot;
  if (!root) return null;
  return {
    isBar: bar.getAttribute('data-mijhar-host') === 'c.ui.bar',
    phase: root.querySelector('.bar')?.getAttribute('data-phase'),
    note: root.querySelector('[data-note]')?.textContent?.replace(/\s+/g, ' ').trim(),
    pressed: [...root.querySelectorAll('[aria-pressed="true"]')].map((el) => el.getAttribute('data-mode')),
    actions: [...root.querySelectorAll('button')].map((el) => el.getAttribute('data-action') ?? el.getAttribute('data-mode')),
    rect: rect(bar),
    hasProgress: root.querySelector('progress') !== null,
  };
}

/** مركز زر داخل شريط نص، لنقرة فعلية. */
function barButton(arg: { body: string; action?: string; mode?: string }): { x: number; y: number } | null {
  const root = barOf(arg.body)?.shadowRoot;
  const el = root?.querySelector(arg.action ? `[data-action="${arg.action}"]` : `[data-mode="${arg.mode}"]`);
  if (!el) return null;
  (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
}

function engineState(): { calls: number; received: number } {
  return { calls: engine?.calls ?? -1, received: engine?.received.length ?? -1 };
}

function tr(): HTMLElement[] {
  return hostsOf('c.ui.translation');
}

/** ما يخص فقرة بعينها: ترجمتها وأصلها بالتخطيط الفعلي والأنماط المحسوبة. */
function paragraph(selector: string): unknown {
  const el = document.querySelector(selector);
  if (!el) return null;
  const inside = [...el.children].find((c) => c.localName === 'mijhar-host' && c.getAttribute('data-mijhar-host') === 'c.ui.translation');
  const wrapper = /^h[1-6]$/.test(el.localName) && el.parentElement?.matches('.markdown-heading') ? el.parentElement : el;
  const next = wrapper.nextElementSibling;
  const host = (inside ?? (next?.getAttribute('data-mijhar-host') === 'c.ui.translation' ? next : null)) as HTMLElement | null;
  const root = host?.shadowRoot?.querySelector<HTMLElement>('.tr-root') ?? null;
  const prot = root?.querySelector<HTMLElement>('.prot') ?? null;
  const hostStyle = host ? getComputedStyle(host) : null;
  return {
    original: { rect: rect(el), display: getComputedStyle(el).display, offsetHeight: (el as HTMLElement).offsetHeight, color: getComputedStyle(el).color, fontSize: getComputedStyle(el).fontSize },
    host: host && { rect: rect(host), display: hostStyle!.display, hidden: host.hasAttribute('data-hidden'), inside: Boolean(inside) },
    root: root && { direction: getComputedStyle(root).direction, color: getComputedStyle(root).color, fontSize: getComputedStyle(root).fontSize, lang: root.getAttribute('lang'), text: root.querySelector('.tr-body')?.textContent },
    prot: prot && { direction: getComputedStyle(prot).direction, unicodeBidi: getComputedStyle(prot).unicodeBidi, fontFamily: getComputedStyle(prot).fontFamily, tag: prot.localName },
    hostIsAfterOriginal: host ? (inside ? true : rect(host).y >= rect(wrapper).y + rect(wrapper).h - 2 || rect(wrapper).h === 0) : null,
  };
}

function summary(): unknown {
  const items = tr();
  return {
    translations: items.filter((h) => h.getAttribute('data-kind') === 'translation').length,
    warnings: items.filter((h) => h.getAttribute('data-kind') === 'warning').length,
    visible: items.filter((h) => !h.hasAttribute('data-hidden') && h.getBoundingClientRect().height > 0).length,
    wrappers: document.querySelectorAll('mijhar-original').length,
    wrappersHidden: [...document.querySelectorAll('mijhar-original')].filter((w) => getComputedStyle(w).display === 'none' && (w as HTMLElement).offsetHeight === 0).length,
    noOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  };
}

function snap(): boolean {
  snapshot = document.documentElement.outerHTML;
  return true;
}

function sameAsSnapshot(): { same: boolean; at?: number; before?: string; after?: string } {
  const now = document.documentElement.outerHTML;
  if (now === snapshot) return { same: true };
  let at = 0;
  while (at < now.length && now[at] === snapshot[at]) at += 1;
  return { same: false, at, before: snapshot.slice(Math.max(0, at - 80), at + 120), after: now.slice(Math.max(0, at - 80), at + 120) };
}

/** إحداثيات سحب حقيقي يحدد أول سطر من فقرة (حروفها الأولى n). */
function dragFor(arg: { selector: string; chars: number }): { x1: number; y1: number; x2: number; y2: number } | null {
  const el = document.querySelector(arg.selector);
  if (!el) return null;
  (el as HTMLElement).scrollIntoView({ block: 'center', behavior: 'instant' });
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const first = walker.nextNode() as Text | null;
  if (!first) return null;
  const a = document.createRange();
  a.setStart(first, 0);
  a.setEnd(first, 1);
  const startRect = a.getBoundingClientRect();
  const b = document.createRange();
  b.setStart(first, 0);
  b.setEnd(first, Math.min(arg.chars, first.length));
  const rects = b.getClientRects();
  const endRect = rects[rects.length - 1] as DOMRect;
  return { x1: Math.round(startRect.left + 1), y1: Math.round(startRect.top + startRect.height / 2), x2: Math.round(endRect.right), y2: Math.round(endRect.top + endRect.height / 2) };
}

function selectionUi(): unknown {
  const host = hostsOf('c.ui.selection')[0];
  const root = host?.shadowRoot;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const inView = (r: { x: number; y: number; w: number; h: number }): boolean => r.x >= 0 && r.y >= 0 && r.x + r.w <= vw && r.y + r.h <= vh;
  const button = root?.querySelector('[data-action="translate-selection"]');
  const card = root?.querySelector<HTMLElement>('.sel-card');
  return {
    host: Boolean(host),
    selected: document.getSelection()?.toString() ?? '',
    button: button && { rect: rect(button), inView: inView(rect(button)), center: { x: Math.round(button.getBoundingClientRect().x + button.getBoundingClientRect().width / 2), y: Math.round(button.getBoundingClientRect().y + button.getBoundingClientRect().height / 2) } },
    card: card && {
      status: card.getAttribute('data-status'),
      rect: rect(card),
      inView: inView(rect(card)),
      focused: root?.activeElement === card,
      original: card.querySelector('[data-section="original"]')?.textContent,
      translation: card.querySelector('[data-section="translation"]')?.textContent,
      direction: (() => {
        const t = card.querySelector('[data-section="translation"]');
        return t ? getComputedStyle(t).direction : null;
      })(),
    },
  };
}

function resources(): string[] {
  return performance.getEntriesByType('resource').map((e) => e.name);
}

function stop(): unknown {
  const report = mounted?.stop();
  mounted = null;
  const now = document.documentElement.outerHTML;
  let at = 0;
  while (at < now.length && now[at] === pristine[at]) at += 1;
  return { hosts: document.querySelectorAll('mijhar-host').length, wrappers: document.querySelectorAll('mijhar-original').length, identical: now === pristine, skipped: report?.skipped.length ?? 0, ...(now === pristine ? {} : { firstDifference: { at, before: pristine.slice(Math.max(0, at - 80), at + 120), after: now.slice(Math.max(0, at - 80), at + 120) } }) };
}

const api: Record<string, (arg?: never) => unknown> = { mount, engineSet, barState, barButton, engineState, paragraph, summary, snap, sameAsSnapshot, dragFor, selectionUi, resources, stop } as never;

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

// مدخل حزمة اختبار (لا تُشحن) لـe2e بطاقة الشرح في المتصفحات: يحقن window.MijharB بدوال يستدعيها run.mjs على الشيفرة التي تُشحن
// (createCardModule وmatch وExplainOverlay)، فيرى القياس تخطيطًا حقيقيًا ومواضع حقيقية بدل المواضع المحاكاة في jsdom.
import { ExplainMode, GLOSSARY_ENTRIES, buildIndex, createCardModule, findMatches, pageKindsOf } from '../../../../../src/modules/b/card';
import { mountInPage, pageStateFor } from '../../../browser-context';
import type { MountedModule } from '../../../browser-context';

const mode = new ExplainMode();
let mounted: MountedModule | null = null;
let pristine = '';

const host = (): HTMLElement | null => document.querySelector('mijhar-host[data-mijhar-host="b.card"]');
const badges = (): HTMLButtonElement[] => [...(host()?.shadowRoot?.querySelectorAll<HTMLButtonElement>('.badge') ?? [])];
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 60));

function parentMap(): Map<Element, Node | null> {
  const map = new Map<Element, Node | null>();
  for (const el of document.querySelectorAll('*')) if (el.localName !== 'mijhar-host') map.set(el, el.parentNode);
  return map;
}

function withoutHosts(): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  for (const h of clone.querySelectorAll('mijhar-host')) h.remove();
  return clone.outerHTML;
}

let parentsBefore: Map<Element, Node | null> | null = null;
let htmlBefore = '';

function mount(href: string): { hostsBefore: number } {
  pristine = document.documentElement.outerHTML;
  parentsBefore = parentMap();
  htmlBefore = withoutHosts();
  mode.set(false);
  mounted = mountInPage(createCardModule({ mode, api: null }), href);
  return { hostsBefore: document.querySelectorAll('mijhar-host').length };
}

async function activate(): Promise<unknown> {
  // الاختصار الحقيقي: حدث لوحة على المستند.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '˙', code: 'KeyH', altKey: true, bubbles: true, cancelable: true }));
  await settle();
  const after = parentMap();
  let changedParents = 0;
  for (const [el, parent] of parentsBefore ?? []) if (after.get(el) !== parent) changedParents += 1;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const list = badges().map((b) => {
    const r = b.getBoundingClientRect();
    return { entry: b.dataset.entry, safety: b.dataset.safety, label: b.getAttribute('aria-label'), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), inView: r.x >= 0 && r.y >= 0 && r.x + r.width <= vw && r.y + r.height <= vh };
  });
  const h = host();
  const hostRect = h?.getBoundingClientRect();
  return {
    active: mode.active,
    hosts: document.querySelectorAll('mijhar-host').length,
    hostIsLastBodyChild: document.body.lastElementChild === h,
    hostCovers: hostRect ? { w: Math.round(hostRect.width), h: Math.round(hostRect.height), vw, vh } : null,
    hostPointerEvents: h ? getComputedStyle(h).pointerEvents : null,
    changedParents,
    sameHtmlOutsideHosts: withoutHosts() === htmlBefore,
    badges: list,
    barText: h?.shadowRoot?.querySelector('[data-bar]')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  };
}

async function openCard(entryId: string): Promise<unknown> {
  const badge = badges().find((b) => b.dataset.entry === entryId);
  if (!badge) return { found: false };
  badge.click();
  await settle();
  const root = host()?.shadowRoot;
  const card = root?.querySelector<HTMLElement>('.card');
  if (!card) return { found: true, opened: false };
  const en = card.querySelector<HTMLElement>('h2 bdi.term-en');
  const levels: Record<string, { selected: boolean; text: string }> = {};
  for (const level of ['brief', 'medium', 'detailed']) {
    root?.querySelector<HTMLButtonElement>(`[role="tab"]#mj-card-tab-${level}`)?.click();
    await settle();
    levels[level] = { selected: root?.querySelector(`#mj-card-tab-${level}`)?.getAttribute('aria-selected') === 'true', text: card.querySelector('[data-level-text]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '' };
  }
  const rect = card.getBoundingClientRect();
  return {
    found: true,
    opened: true,
    entry: card.dataset.entry,
    title: card.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim(),
    enDir: en?.getAttribute('dir'),
    enComputedDirection: en ? getComputedStyle(en).direction : null,
    enText: en?.textContent,
    levels,
    fields: [...card.querySelectorAll('[data-section="decision"] > div')].map((d) => ({ id: d.getAttribute('data-field'), text: d.querySelector('.value')?.textContent?.trim() ?? '' })),
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight },
    focusedIsCard: root?.activeElement === card,
    hasExample: card.querySelector('[data-section="example"]') !== null,
  };
}

async function closeWithEscape(): Promise<unknown> {
  const root = host()?.shadowRoot;
  const card = root?.querySelector<HTMLElement>('.card');
  card?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
  await settle();
  return { closed: root?.querySelector('.card') === null, focusedBadge: root?.activeElement?.getAttribute('data-entry') ?? null };
}

/** هل يبلغ النقر عنصرًا أصليًا تحت الشارات (الطبقة لا تلتقط نقرات الصفحة خارج الشارات والبطاقة). */
function clickThrough(selector: string): { reached: boolean } {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return { reached: false };
  const r = target.getBoundingClientRect();
  const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { reached: hit === target || target.contains(hit) };
}

async function deactivate(): Promise<unknown> {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: '˙', code: 'KeyH', altKey: true, bubbles: true, cancelable: true }));
  await settle();
  return { active: mode.active, badges: badges().length, hosts: document.querySelectorAll('mijhar-host').length };
}

async function stop(): Promise<unknown> {
  const report = mounted?.stop();
  mounted = null;
  await settle();
  const now = document.documentElement.outerHTML;
  let at = 0;
  while (at < now.length && now[at] === pristine[at]) at += 1;
  return {
    hosts: document.querySelectorAll('mijhar-host').length,
    identical: now === pristine,
    restored: report?.restored ?? 0,
    skipped: report?.skipped.length ?? 0,
    ...(now === pristine ? {} : { firstDifference: { at, before: pristine.slice(Math.max(0, at - 60), at + 100), after: now.slice(Math.max(0, at - 60), at + 100) } }),
  };
}

/** زمن فحص المطابقة وحده (ms) على الصفحة الحالية: ثلاثة تسخين ثم 30 قياسًا (informative، لا ميزانية أداء للوحدة (ب) في الخطة). */
function scanTime(arg: { href: string }): { median: number; p95: number; min: number; max: number; matches: number; skipped: number; elements: number } {
  const index = buildIndex(GLOSSARY_ENTRIES);
  const ctx = { kinds: pageKindsOf(pageStateFor(arg.href)), href: arg.href };
  const times: number[] = [];
  let last = findMatches(document, index, ctx);
  for (let i = 0; i < 33; i += 1) {
    const t0 = performance.now();
    last = findMatches(document, index, ctx);
    const t1 = performance.now();
    if (i >= 3) times.push(t1 - t0);
  }
  times.sort((a, b) => a - b);
  return {
    median: times[Math.floor(times.length / 2)] as number,
    p95: times[Math.ceil(times.length * 0.95) - 1] as number,
    min: times[0] as number,
    max: times[times.length - 1] as number,
    matches: last.matches.length,
    skipped: last.skipped.length,
    elements: document.querySelectorAll('*').length,
  };
}

const api: Record<string, (arg?: never) => unknown> = { mount, activate, openCard, closeWithEscape, clickThrough, deactivate, stop, scanTime } as never;

// يستدعي دالة بوعدها ويخزّن النتيجة نصًّا في window.__mjResult: Firefox (Marionette) لا يحلّ وعدًا من عالم الصفحة عبر حدود الأغلفة،
// فيستدعي run.mjs الدالة متزامنًا ثم يستطلع __mjDone ويقرأ نصًّا بسيطًا.
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

Object.assign(window, { MijharB: { call } });

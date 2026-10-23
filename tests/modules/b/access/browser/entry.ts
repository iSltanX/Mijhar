// مدخل حزمة اختبار (لا تُشحن) لـe2e الوصول (T-3.3) في المتصفحات: يركّب وحدة بطاقة الشرح كما تُشحن ويعرض دوالًا تقرأ الحالة بعد
// مدخلات حقيقية يرسلها run.mjs (لوحة مفاتيح فعلية ولمس فعلي)، فلا يحاكي هذا الملف أي ضغطة.
import { ExplainMode, createCardModule } from '../../../../../src/modules/b/card';
import { mountInPage } from '../../../browser-context';
import type { MountedModule } from '../../../browser-context';

const mode = new ExplainMode();
let mounted: MountedModule | null = null;
let pristine = '';
let keys: string[] = [];

const host = (): HTMLElement | null => document.querySelector('mijhar-host[data-mijhar-host="b.card"]');
const shadow = (): ShadowRoot | null => host()?.shadowRoot ?? null;
const badges = (): HTMLButtonElement[] => [...(shadow()?.querySelectorAll<HTMLButtonElement>('.badge') ?? [])];
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 80));
const label = (el: Element | null): string | null => (el ? `${el.localName}${el.id ? `#${el.id}` : ''}${el.getAttribute('data-entry') ? `[${el.getAttribute('data-entry')}]` : ''}${el.getAttribute('data-action') ? `{${el.getAttribute('data-action')}}` : ''}${el.getAttribute('role') === 'tab' ? `<tab:${el.id}>` : ''}` : null);

function mount(href: string): { media: unknown } {
  pristine = document.documentElement.outerHTML;
  mode.set(false);
  keys = [];
  // مستمع المستند الذي لا يجب أن تبلغه ضغطات الطبقة (يمثل اختصارات GitHub)؛ مسجَّل مرة واحدة.
  if (!(window as unknown as { __keySpy?: boolean }).__keySpy) {
    (window as unknown as { __keySpy?: boolean }).__keySpy = true;
    document.addEventListener('keydown', (event) => void keys.push(event.key));
  }
  mounted = mountInPage(createCardModule({ mode, api: null }), href);
  return { media: media() };
}

function media(): { hoverNone: boolean; pointerCoarse: boolean; anyHover: boolean } {
  return { hoverNone: matchMedia('(hover: none)').matches, pointerCoarse: matchMedia('(pointer: coarse)').matches, anyHover: matchMedia('(any-hover: hover)').matches };
}

function focusPage(selector: string): { focused: string | null } {
  document.querySelector<HTMLElement>(selector)?.focus();
  return { focused: label(document.activeElement) };
}

async function setMode(on: boolean): Promise<unknown> {
  mode.set(on);
  await settle();
  return state();
}

function clearKeys(): boolean {
  keys = [];
  return true;
}

function cardInfo(): unknown {
  const root = shadow();
  const card = root?.querySelector<HTMLElement>('.card');
  if (!card) return null;
  const r = card.getBoundingClientRect();
  return {
    entry: card.dataset.entry,
    role: card.getAttribute('role'),
    focused: root?.activeElement === card,
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    insideViewport: r.left >= 0 && r.top >= 0 && r.right <= document.documentElement.clientWidth && r.bottom <= document.documentElement.clientHeight,
    close: card.querySelector('[data-action="close"]')?.getAttribute('aria-label') ?? null,
    closeRect: (() => {
      const c = card.querySelector('[data-action="close"]')?.getBoundingClientRect();
      return c ? { w: Math.round(c.width), h: Math.round(c.height), cx: Math.round(c.x + c.width / 2), cy: Math.round(c.y + c.height / 2) } : null;
    })(),
  };
}

/** لقطة كاملة للحالة: ما يُركَّز الآن (في الظل وفي المستند)، والشارات، والبطاقة، وما بلغ مستمع المستند من مفاتيح. */
function state(): unknown {
  const root = shadow();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  return {
    modeActive: mode.active,
    hosts: document.querySelectorAll('mijhar-host').length,
    hostIsLastBodyChild: document.body.lastElementChild === host(),
    shadowFocus: label(root?.activeElement ?? null),
    pageFocus: label(document.activeElement),
    keys: [...keys],
    badges: badges().map((b, i) => {
      const r = b.getBoundingClientRect();
      return {
        i,
        entry: b.dataset.entry,
        tag: b.localName,
        type: b.getAttribute('type'),
        label: b.getAttribute('aria-label'),
        expanded: b.getAttribute('aria-expanded'),
        popup: b.getAttribute('aria-haspopup'),
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        cx: Math.round(r.x + r.width / 2),
        cy: Math.round(r.y + r.height / 2),
        inView: r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh,
      };
    }),
    card: cardInfo(),
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    pointer: root?.querySelector('.overlay')?.getAttribute('data-pointer') ?? null,
  };
}

/**
 * نقطة في نافذة العرض لا يغطيها شيء من طبقة مِجهَر ولا يقع قربها (36px في كل اتجاه) عنصر تفاعلي من الصفحة: لمسة «خارج الطبقة».
 * المسافة لازمة لأن Chrome يضبط اللمسة نحو أقرب رابط (touch adjustment) فتفعّل لمسة على فراغ قرب رابط الرابط.
 */
function safePoint(): { x: number; y: number } | null {
  const root = shadow();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const INTERACTIVE = 'button, a, input, textarea, select, summary, label, [role="tab"], [role="button"], [role="link"], [tabindex], mijhar-host';
  const near: Array<[number, number]> = [[0, 0], [36, 0], [-36, 0], [0, 36], [0, -36], [26, 26], [-26, 26], [26, -26], [-26, -26]];
  for (let y = Math.round(vh * 0.92); y > 40; y -= 19) {
    for (let x = Math.round(vw * 0.5); x > 40 && x < vw - 40; x -= 29) {
      const clear = near.every(([dx, dy]) => {
        const px = x + dx;
        const py = y + dy;
        if (px < 0 || py < 0 || px >= vw || py >= vh) return true;
        const inLayer = root?.elementsFromPoint(px, py).some((el) => el.matches('.badge, .card, .card *, .mode-bar, .mode-bar *'));
        const top = document.elementFromPoint(px, py);
        return !inLayer && !!top && !top.closest(INTERACTIVE);
      });
      if (clear) return { x, y };
    }
  }
  return null;
}

function stop(): unknown {
  const report = mounted?.stop();
  mounted = null;
  const now = document.documentElement.outerHTML;
  let at = 0;
  while (at < now.length && now[at] === pristine[at]) at += 1;
  return {
    hosts: document.querySelectorAll('mijhar-host').length,
    identical: now === pristine,
    skipped: report?.skipped.length ?? 0,
    ...(now === pristine ? {} : { firstDifference: { at, before: pristine.slice(Math.max(0, at - 80), at + 120), after: now.slice(Math.max(0, at - 80), at + 120) } }),
  };
}

const api: Record<string, (arg?: never) => unknown> = { mount, media, focusPage, setMode, clearKeys, state, safePoint, stop } as never;

// يخزّن النتيجة نصًّا في window.__mjResult ويستطلعها run.mjs (Marionette لا يحلّ وعدًا عبر حدود الأغلفة).
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

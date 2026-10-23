// ميزة «تلميح التاريخ الهجري» (T-2.6، F-A6): عند المرور على <relative-time> أو تركيز ما يحويه يظهر تلميح واحد معزول (Shadow DOM)
// بالتاريخ الهجري المحسوب محليًا من سمة datetime. لا يُكتب شيء على عنصر GitHub ولا على نصه: المستمعات على المستند سلبية (لا
// preventDefault ولا إيقاف انتشار)، والتلميح عنصر واحد يُدرج عبر سجل الميزة عند أول ظهور فيُزال بإيقافها. Escape والتمرير وخروج
// المؤشر أو التركيز تخفيه.
import type { SettingDefinition } from '../../../core';
import { createShadowHost } from '../../../core/ui-host/shadow';
import type { ShadowParts } from '../../../core/ui-host/shadow';
import type { ModuleAFeature } from '../scope/feature';
import { CALENDAR_LABELS, DEFAULT_HIJRI_OPTIONS, HIJRI_OPTIONS_KEY, availableCalendar, hijriDate, isHijriOptions, offsetLabel } from './hijri';
import type { HijriOptions } from './hijri';

export const HIJRI_FEATURE_ID = 'hijri';
export const HIJRI_HOST_NAME = 'a.hijri';
const OPEN_ATTR = 'data-open';

// الموضع متغيران مضمّنان على المضيف تقرؤهما :host: المهم داخل الظل (ومنه all: initial) يغلب المهم المضمّن خارجه، والمتغيرات لا
// يشملها all.
const HOST_CSS = `
:host { all: initial !important; position: fixed !important; z-index: 2147483647 !important; display: block !important;
  left: var(--mj-left, 0px) !important; top: var(--mj-top, 0px) !important; right: auto !important; bottom: auto !important;
  margin: 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; overflow: visible !important;
  pointer-events: none !important; }
:host(:not([${OPEN_ATTR}])) { display: none !important; }
:host::backdrop { display: none !important; }
`;

const TOOLTIP_CSS = `
.hijri { max-width: 320px; padding: var(--mijhar-space-6) var(--mijhar-space-8); border-radius: var(--mijhar-radius-6);
  background: var(--mijhar-bg-surface-raised); border: 1px solid var(--mijhar-border-default); box-shadow: var(--mijhar-shadow-raised); }
.hijri .date { font-weight: 700; }
`;

const hijriOptions: SettingDefinition<HijriOptions & Record<string, number | string>> = {
  key: HIJRI_OPTIONS_KEY,
  default: { ...DEFAULT_HIJRI_OPTIONS },
  description: 'تلميح التاريخ الهجري: offset تعديل بالأيام من −2 إلى +2، وnumerals شكل الأرقام latn أو arab',
  validate: (value): value is HijriOptions & Record<string, number | string> => isHijriOptions(value),
};

const supportsPopover = (el: HTMLElement): boolean => typeof el.showPopover === 'function' && typeof el.hidePopover === 'function';

/** <relative-time> الذي يخص الهدف: هو أو سلفه، أو ما بداخل عنصر مركَّز (رابط التزام يحوي التاريخ). */
export function relativeTimeFor(target: EventTarget | null, inside = false): Element | null {
  if (!target || (target as Node).nodeType !== 1) return null;
  const el = target as Element;
  return el.closest('relative-time') ?? (inside ? el.querySelector('relative-time') : null);
}

export const HIJRI_FEATURE: ModuleAFeature = {
  id: HIJRI_FEATURE_ID,
  title: 'تلميح التاريخ الهجري',
  defaults: { enabled: true, scope: 'all', repos: [] },
  settings: [hijriOptions as SettingDefinition],
  mount(ctx) {
    const doc = ctx.document;
    const view = doc.defaultView;
    const stored = ctx.setting<HijriOptions & Record<string, number | string>>(HIJRI_OPTIONS_KEY);
    const options = isHijriOptions(stored) ? stored : DEFAULT_HIJRI_OPTIONS;
    const calendar = availableCalendar();
    let parts: ShadowParts | null = null;
    let current: Element | null = null;

    const ensure = (): ShadowParts => {
      if (parts) return parts;
      parts = createShadowHost(doc, { name: HIJRI_HOST_NAME, hostCss: HOST_CSS, styles: TOOLTIP_CSS, label: 'التاريخ الهجري' });
      if (supportsPopover(parts.host)) parts.host.setAttribute('popover', 'manual');
      ctx.mutations.insert(doc.documentElement, parts.host);
      return parts;
    };

    const hide = (): void => {
      current = null;
      if (!parts?.host.hasAttribute(OPEN_ATTR)) return;
      parts.host.removeAttribute(OPEN_ATTR);
      if (supportsPopover(parts.host)) {
        try {
          parts.host.hidePopover();
        } catch {
          // لم يكن في الطبقة العليا.
        }
      }
    };

    const show = (time: Element): void => {
      const datetime = time.getAttribute('datetime');
      if (!datetime || ctx.signal.aborted) return;
      const date = hijriDate(datetime, options, calendar);
      const { host, root } = ensure();
      current = time;
      const box = doc.createElement('div');
      box.className = 'hijri';
      box.setAttribute('role', 'tooltip');
      const line = doc.createElement('div');
      line.className = 'date';
      line.textContent = date ? date.text : 'التقويم الهجري غير متاح في هذا المتصفح';
      box.append(line);
      if (date) {
        const caption = doc.createElement('div');
        caption.className = 'small muted';
        caption.textContent = [CALENDAR_LABELS[date.calendar], offsetLabel(date.offset)].filter(Boolean).join(' · ');
        box.append(caption);
      }
      root.replaceChildren(box);
      host.setAttribute(OPEN_ATTR, '');
      if (supportsPopover(host)) {
        try {
          host.showPopover();
        } catch {
          // مفتوح مسبقًا.
        }
      }
      // تحت العنصر ومحاذاته من اليمين، داخل النافذة.
      const rect = time.getBoundingClientRect();
      const width = host.offsetWidth || 240;
      const height = host.offsetHeight || 48;
      const vw = view?.innerWidth ?? 1024;
      const vh = view?.innerHeight ?? 768;
      const left = Math.min(Math.max(8, rect.right - width), vw - width - 8);
      const top = rect.bottom + 6 + height > vh ? Math.max(8, rect.top - height - 6) : rect.bottom + 6;
      host.style.setProperty('--mj-left', `${Math.round(left)}px`);
      host.style.setProperty('--mj-top', `${Math.round(top)}px`);
    };

    ctx.listen(doc, 'mouseover', (event) => {
      const time = relativeTimeFor(event.target);
      if (time && time !== current) show(time);
    });
    ctx.listen(doc, 'mouseout', (event) => {
      if (!current) return;
      const next = (event as MouseEvent).relatedTarget as Node | null;
      if (!next || !current.contains(next)) hide();
    });
    ctx.listen(doc, 'focusin', (event) => {
      const time = relativeTimeFor(event.target, true);
      if (time) show(time);
    });
    ctx.listen(doc, 'focusout', () => hide());
    ctx.listen(doc, 'keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape') hide();
    });
    if (view) ctx.listen(view, 'scroll', () => hide(), { passive: true, capture: true });
    ctx.onTeardown(hide);
  },
};

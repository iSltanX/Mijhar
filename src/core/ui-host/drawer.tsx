// الدرج داخل الصفحة: البديل الموحد للوحة الجانبية الأصلية في كل المتصفحات (AC-1.4).
//  - يُنشأ عند أول فتح، ويُلحق بـ<html> لا بـ<body> فيبقى بعد تنقل Turbo (يستبدل body وحده).
//  - يُعرض في الطبقة العليا (popover="manual") فلا تمسّه تحويلات الصفحة ومرشّحاتها وz-index ولا قصّ overflow؛ وإن غاب
//    Popover API فموضع ثابت بأعلى z-index.
//  - غير مشروط (non-modal): الصفحة تبقى قابلة للاستعمال. Escape يغلقه، ويعود التركيز إلى ما كان عليه قبل الفتح.
//  - لا حقل لرمز وصول ولا مفتاح فيه (DEC-04 وEXECUTION_PLAN.md ‏5): ما يحتاج سرًّا يُفتح في صفحة الإعدادات.
import { render } from 'preact';
import type { ComponentChild } from 'preact';
import { createShadowHost, deepActiveElement } from './shadow';
import type { ShadowParts } from './shadow';

export const DRAWER_NAME = 'drawer';
export const DRAWER_OPEN_ATTR = 'data-open';
export const DRAWER_WIDTH_PX = 400;

const DRAWER_HOST_CSS = `
:host {
  all: initial !important;
  position: fixed !important;
  inset: 0 0 0 auto !important;
  width: min(${DRAWER_WIDTH_PX}px, 100vw) !important;
  height: 100% !important;
  max-width: none !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  overflow: visible !important;
  background: transparent !important;
  z-index: 2147483647 !important;
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  transform: none !important;
  filter: none !important;
  pointer-events: auto !important;
}
:host(:not([${DRAWER_OPEN_ATTR}])) { display: none !important; }
:host::backdrop { display: none !important; }
`;

const DRAWER_CSS = `
.mj-root.drawer-root { height: 100%; background: transparent; }
.drawer {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  background: var(--mijhar-bg-surface); border-inline-end: 1px solid var(--mijhar-border-default);
  box-shadow: var(--mijhar-shadow-raised);
}
.drawer-header {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8);
  padding: var(--mijhar-space-8) var(--mijhar-space-12); border-bottom: 1px solid var(--mijhar-border-default); background: var(--mijhar-bg-surface);
}
.drawer-header h1 { font-size: 18px; line-height: 28px; outline: none; }
/* يُركَّز العنوان برمجيًا عند الفتح ليعلن قارئ الشاشة الدرج؛ ليس عنصر تفاعل فلا إطار له. */
.mj-root .drawer-header h1:focus, .mj-root .drawer-header h1:focus-visible { box-shadow: none; outline: none; }
.drawer-body { flex: 1 1 auto; overflow: auto; overscroll-behavior: contain; }
`;

export interface DrawerControls {
  close(): void;
}

export interface DrawerOptions {
  readonly document?: Document;
  /** محتوى الدرج تحت ترويسته. يُرسم مرة عند الإنشاء ويُفك عند dispose. */
  readonly content: (controls: DrawerControls) => ComponentChild;
  readonly onChange?: (open: boolean) => void;
}

const supportsPopover = (el: HTMLElement): boolean => typeof el.showPopover === 'function' && typeof el.hidePopover === 'function';

export class Drawer {
  private readonly doc: Document;
  private parts: ShadowParts | null = null;
  private opened = false;
  private returnFocus: Element | null = null;

  constructor(private readonly options: DrawerOptions) {
    this.doc = options.document ?? document;
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** عنصر المضيف إن أُنشئ (للفحص). */
  get host(): HTMLElement | null {
    return this.parts?.host ?? null;
  }

  open(): void {
    const parts = this.ensure();
    if (!parts.host.isConnected) this.doc.documentElement.append(parts.host);
    if (this.opened) return;
    this.returnFocus = deepActiveElement(this.doc);
    parts.host.setAttribute(DRAWER_OPEN_ATTR, '');
    if (supportsPopover(parts.host)) {
      try {
        parts.host.showPopover();
      } catch {
        // مفتوح مسبقًا أو أُزيل من المستند لحظةً: يبقى الموضع الثابت.
      }
    }
    this.opened = true;
    parts.shadow.querySelector<HTMLElement>('.drawer-header h1')?.focus({ preventScroll: true });
    this.options.onChange?.(true);
  }

  close(): void {
    if (!this.opened || !this.parts) return;
    const { host, shadow } = this.parts;
    const focusInside = shadow.activeElement !== null;
    host.removeAttribute(DRAWER_OPEN_ATTR);
    if (supportsPopover(host)) {
      try {
        host.hidePopover();
      } catch {
        // لم يكن في الطبقة العليا.
      }
    }
    this.opened = false;
    const target = this.returnFocus as HTMLElement | null;
    this.returnFocus = null;
    if (focusInside && target?.isConnected && typeof target.focus === 'function') target.focus({ preventScroll: true });
    this.options.onChange?.(false);
  }

  toggle(): void {
    if (this.opened) this.close();
    else this.open();
  }

  dispose(): void {
    if (!this.parts) return;
    this.close();
    render(null, this.parts.root);
    this.parts.host.remove();
    this.parts = null;
  }

  private ensure(): ShadowParts {
    if (this.parts) return this.parts;
    const parts = createShadowHost(this.doc, { name: DRAWER_NAME, hostCss: DRAWER_HOST_CSS, styles: DRAWER_CSS });
    parts.root.classList.add('drawer-root');
    if (supportsPopover(parts.host)) parts.host.setAttribute('popover', 'manual');
    parts.shadow.addEventListener('keydown', (event) => {
      if ((event as KeyboardEvent).key === 'Escape' && this.opened) {
        event.stopPropagation();
        this.close();
      }
    });
    const controls: DrawerControls = { close: () => this.close() };
    render(
      <aside class="drawer" aria-labelledby="mj-drawer-title">
        <header class="drawer-header">
          <h1 id="mj-drawer-title" tabIndex={-1}>
            مِجهَر
          </h1>
          <button type="button" class="btn icon-btn" aria-label="إغلاق الدرج" title="إغلاق (Esc)" onClick={() => this.close()}>
            ×
          </button>
        </header>
        <div class="drawer-body">{this.options.content(controls)}</div>
      </aside>,
      parts.root,
    );
    this.parts = parts;
    return parts;
  }
}

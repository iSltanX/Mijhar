// إدارة التركيز بين الصفحة وطبقة الشرح: الدخول إلى أول شارة عند التفعيل بلوحة المفاتيح، والعودة إلى ما كان مركَّزًا عند الإيقاف.
import { deepActiveElement } from '../../../core/ui-host/shadow';

export const BADGE_SELECTOR = '.badge';

export const badgesOf = (root: ParentNode): HTMLButtonElement[] => [...root.querySelectorAll<HTMLButtonElement>(BADGE_SELECTOR)];

export function focusBadge(root: ParentNode, index: number): boolean {
  const badge = root.querySelector<HTMLButtonElement>(`${BADGE_SELECTOR}[data-index="${index}"]`);
  if (!badge) return false;
  badge.focus({ preventScroll: false });
  return true;
}

export function focusFirstBadge(root: ParentNode): boolean {
  const first = badgesOf(root)[0];
  if (!first) return false;
  first.focus({ preventScroll: false });
  return true;
}

/** يحفظ العنصر المركَّز قبل دخول الطبقة ويعيده عند الخروج إن لم يتحرك التركيز بنفسه إلى عنصر آخر في الصفحة. */
export class FocusReturn {
  private saved: Element | null = null;

  constructor(private readonly doc: Document) {}

  capture(): void {
    const active = deepActiveElement(this.doc);
    this.saved = active && active !== this.doc.body ? active : null;
  }

  restore(isOurs: (element: Element | null) => boolean): void {
    const target = this.saved as HTMLElement | null;
    this.saved = null;
    if (!target?.isConnected || typeof target.focus !== 'function') return;
    const active = deepActiveElement(this.doc);
    if (active === null || active === this.doc.body || isOurs(active)) target.focus({ preventScroll: true });
  }
}

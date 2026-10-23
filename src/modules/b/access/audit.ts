// مدقّق الوصول (AC-B5): يقيس على DOM مرسوم أن كل شارة شرح عنصر وصول حقيقي — زر أصلي من نوع button يُركَّز بـTab ويُفتح بـEnter
// وSpace، باسم وصول ظاهر لقارئ الشاشة وبحالة فتح معلنة وبهدف ضغط كافٍ — وأن البطاقة المفتوحة حوار باسم يمكن بلوغه وإغلاقه.
// دالة نقية تقرأ ولا تعدّل؛ تُستعمل في الاختبارات وتصلح لجولات T-3.5 لاحقًا. غير المقاس هنا (الضغط الفعلي والتركيز الحقيقي)
// يقيسه e2e في المتصفحات.
import { MIN_TARGET } from './touch';

export type AccessRule =
  | 'badge-not-native-button'
  | 'badge-wrong-type'
  | 'badge-no-name'
  | 'badge-unreachable-by-tab'
  | 'badge-disabled'
  | 'badge-no-expanded-state'
  | 'badge-small-target'
  | 'card-no-name'
  | 'card-not-focusable'
  | 'card-no-close';

export interface AccessViolation {
  readonly rule: AccessRule;
  readonly element: Element;
  readonly detail: string;
}

export interface AuditOptions {
  /** حجم العنصر المرسوم؛ jsdom لا يحسب التخطيط فيُمرَّر في الاختبارات. الافتراضي getBoundingClientRect. */
  readonly sizeOf?: (element: Element) => { readonly width: number; readonly height: number };
  readonly minTarget?: number;
}

const defaultSize = (element: Element): { width: number; height: number } => {
  const r = element.getBoundingClientRect();
  return { width: r.width, height: r.height };
};

const describe = (element: Element): string => `<${element.localName}${element.getAttribute('data-entry') ? ` data-entry=${element.getAttribute('data-entry')}` : ''}>`;

export function auditBadges(root: ParentNode, options: AuditOptions = {}): AccessViolation[] {
  const sizeOf = options.sizeOf ?? defaultSize;
  const min = options.minTarget ?? MIN_TARGET;
  const out: AccessViolation[] = [];
  const add = (rule: AccessRule, element: Element, detail: string): void => void out.push({ rule, element, detail: `${describe(element)}: ${detail}` });
  for (const badge of root.querySelectorAll('.badge')) {
    if (badge.localName !== 'button') add('badge-not-native-button', badge, 'الشارة ليست <button>: لا تُفتح بـEnter وSpace تلقائيًا');
    else if (badge.getAttribute('type') !== 'button') add('badge-wrong-type', badge, 'type ليست button');
    if (!(badge.getAttribute('aria-label') ?? '').trim()) add('badge-no-name', badge, 'بلا aria-label');
    const tabindex = badge.getAttribute('tabindex');
    if (tabindex !== null && Number(tabindex) < 0) add('badge-unreachable-by-tab', badge, `tabindex=${tabindex} يخرجها من ترتيب Tab`);
    if ((badge as HTMLButtonElement).disabled || badge.closest('[hidden], [inert]')) add('badge-disabled', badge, 'معطّلة أو مخفية');
    if (!['true', 'false'].includes(badge.getAttribute('aria-expanded') ?? '')) add('badge-no-expanded-state', badge, 'لا aria-expanded');
    const size = sizeOf(badge);
    if (size.width < min || size.height < min) add('badge-small-target', badge, `الحجم ${Math.round(size.width)}×${Math.round(size.height)} دون ${min}px`);
  }
  return out;
}

export function auditCard(root: ParentNode): AccessViolation[] {
  const out: AccessViolation[] = [];
  const card = root.querySelector('.card');
  if (!card) return out;
  const add = (rule: AccessRule, detail: string): void => void out.push({ rule, element: card, detail: `${describe(card)}: ${detail}` });
  const labelledBy = card.getAttribute('aria-labelledby');
  const title = labelledBy ? (card.ownerDocument.getElementById(labelledBy) ?? card.querySelector(`#${CSS.escape(labelledBy)}`)) : null;
  if (!(card.getAttribute('aria-label') ?? '').trim() && !(title?.textContent ?? '').trim()) add('card-no-name', 'الحوار بلا اسم');
  if (card.getAttribute('tabindex') === null) add('card-not-focusable', 'لا tabindex فلا ينتقل إليه التركيز عند الفتح');
  const close = card.querySelector('[data-action="close"]');
  if (!close || !(close.getAttribute('aria-label') ?? '').trim()) add('card-no-close', 'زر الإغلاق غائب أو بلا اسم وصول');
  return out;
}

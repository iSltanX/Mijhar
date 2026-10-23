// اللمس وأهداف الضغط (F-B5 / AC-B5): لا شرح يعتمد على التحويم، ونقرة أو لمسة تفتح البطاقة المثبتة.
// المؤشر الخشن (جهاز لمسي أو hover: none) يكبّر الشارة وأزرار البطاقة؛ فحجمها يُحسب هنا مرة واحدة ويُستعمل في الرسم والتموضع معًا
// فلا يختلفان. الحد الأدنى 24px معيار WCAG 2.2 (2.5.8).

export const BADGE_SIZE = { fine: 20, coarse: 32 } as const;
/** أدنى حجم لهدف الضغط بالبكسل (WCAG 2.2، SC 2.5.8). */
export const MIN_TARGET = 24;

/** هل المؤشر الأساسي خشن (لمس) أو لا يدعم التحويم. matchMedia غائبة (jsdom) تعني مؤشرًا دقيقًا. */
export function isCoarsePointer(view: Pick<Window, 'matchMedia'> | null | undefined): boolean {
  try {
    return Boolean(view?.matchMedia?.('(pointer: coarse), (hover: none)').matches);
  } catch {
    return false;
  }
}

export const badgeSizeFor = (view: Pick<Window, 'matchMedia'> | null | undefined): number => (isCoarsePointer(view) ? BADGE_SIZE.coarse : BADGE_SIZE.fine);

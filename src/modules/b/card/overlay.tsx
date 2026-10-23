// طبقة الإرساء العائم لوضع الشرح (F-B1): مضيف Shadow DOM واحد ثابت يغطي نافذة العرض ولا يلتقط نقرات الصفحة (pointer-events: none)،
// وفيه زر شارة لكل عنصر مطابق عند موضعه، وبطاقة الشرح للشارة المفتوحة. لا شيء من الصفحة يُغلَّف أو يُعدَّل: المواضع تُقرأ من
// getBoundingClientRect فقط، والمضيف يُدرج مرة واحدة في نهاية body عبر ctx.mutations فيُزال بإيقاف الوحدة.
import { useEffect, useRef } from 'preact/hooks';
import type { Match } from './match';
import { ExplainCard } from './card';

export const OVERLAY_HOST_CSS = `
:host {
  all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483000 !important;
  display: block !important; pointer-events: none !important; overflow: visible !important;
  visibility: visible !important; opacity: 1 !important; transform: none !important; filter: none !important;
}
`;

export const CARD_CSS = `
.mj-root.overlay-root { position: absolute; inset: 0; background: transparent; pointer-events: none; overflow: visible; }
.badge {
  appearance: none; position: absolute; pointer-events: auto; margin: 0; padding: 0;
  inline-size: 20px; block-size: 20px; border-radius: var(--mijhar-radius-full); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center; font: 700 12px/1 var(--mijhar-font-display);
  background: var(--mijhar-bg-brand); color: var(--mijhar-text-on-brand); border: 2px solid var(--mijhar-bg-surface);
  box-shadow: var(--mijhar-shadow-raised);
}
.badge[data-safety="حساس"] { background: var(--mijhar-text-warning); color: var(--mijhar-bg-surface); }
.badge[data-safety="خطر"] { background: var(--mijhar-bg-danger); color: #fff; }
.badge[aria-expanded="true"] { outline: 2px solid var(--mijhar-border-focus); outline-offset: 1px; }
.badge:focus-visible { box-shadow: var(--mijhar-focus-ring); }
.card-anchor { position: absolute; pointer-events: auto; inline-size: min(360px, calc(100vw - 16px)); display: flex; flex-direction: column; }
.card {
  position: relative; max-height: inherit; overflow: auto; overscroll-behavior: contain;
  display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-12);
  background: var(--mijhar-bg-surface-raised); color: var(--mijhar-text-primary);
  border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); box-shadow: var(--mijhar-shadow-raised);
}
.card:focus-visible { outline: none; box-shadow: var(--mijhar-shadow-raised), var(--mijhar-focus-ring); }
.card-head { display: flex; align-items: flex-start; gap: var(--mijhar-space-8); }
.card-head h2 { flex: 1 1 auto; font-size: 15px; line-height: 22px; }
.term-en { direction: ltr; unicode-bidi: isolate; display: inline-block; font-family: var(--mijhar-font-text); }
.chip { padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 22px; font-weight: 700; background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); white-space: nowrap; }
.chip[data-safety="حساس"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.chip[data-safety="خطر"] { background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); }
.card .tablist { padding: 0; }
.card .tabpanel { padding: var(--mijhar-space-8) 0; }
.level-text { margin: 0; }
.example, .decision { padding: var(--mijhar-space-8); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-subtle); border: 1px solid var(--mijhar-border-muted); }
.example h3 { margin-bottom: 2px; color: var(--mijhar-text-secondary); font-size: 12px; }
.decision { display: grid; gap: var(--mijhar-space-6); margin: 0; }
.decision > div { display: flex; flex-direction: column; gap: 1px; }
.decision dt { font-size: 12px; line-height: 16px; color: var(--mijhar-text-secondary); }
.decision dd { margin: 0; overflow-wrap: anywhere; }
.decision .detail { display: block; }
.decision [data-specified="false"] dd .value { color: var(--mijhar-text-tertiary); font-style: italic; }
.docs { margin: 0; }
.mode-bar {
  position: absolute; inset-block-end: 12px; inset-inline-start: 12px; pointer-events: auto; display: flex; align-items: center; gap: var(--mijhar-space-8);
  padding: var(--mijhar-space-6) var(--mijhar-space-12); border-radius: var(--mijhar-radius-full); background: var(--mijhar-bg-brand); color: var(--mijhar-text-on-brand);
  box-shadow: var(--mijhar-shadow-raised); font-weight: 700;
}
.mode-bar .btn { min-height: 24px; padding: 0 var(--mijhar-space-8); background: transparent; color: inherit; border-color: currentColor; }
`;

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const BADGE = 20;
const CARD_GAP = 8;
const CARD_WIDTH = 360;
const CARD_MIN_ROOM = 280;
const MARGIN = 8;

export interface Placed {
  readonly index: number;
  readonly match: Match;
  readonly rect: Rect;
}

export interface ExplainOverlayProps {
  readonly matches: readonly Match[];
  readonly viewport: { readonly width: number; readonly height: number };
  readonly openIndex: number | null;
  readonly active: boolean;
  readonly onOpen: (index: number) => void;
  readonly onClose: () => void;
  readonly onStop: () => void;
  readonly rectOf?: (element: Element) => Rect;
}

const defaultRect = (element: Element): Rect => {
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** العناصر المرئية في نافذة العرض الآن فقط (هامش صغير)، فلا شارات لعناصر مخفية أو بعيدة. */
export function placeBadges(matches: readonly Match[], viewport: { width: number; height: number }, rectOf: (element: Element) => Rect = defaultRect): Placed[] {
  const placed: Placed[] = [];
  matches.forEach((match, index) => {
    if (!match.element.isConnected) return;
    const rect = rectOf(match.element);
    if (rect.width <= 0 || rect.height <= 0) return;
    if (rect.top + rect.height < 0 || rect.top > viewport.height || rect.left + rect.width < 0 || rect.left > viewport.width) return;
    placed.push({ index, match, rect });
  });
  return placed;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

function badgePosition(rect: Rect, viewport: { width: number; height: number }): { left: number; top: number } {
  // أعلى الطرف الأيمن للعنصر (خارج محتواه قدر الإمكان) ويبقى داخل نافذة العرض.
  return { left: clamp(rect.left + rect.width - BADGE / 2, MARGIN, viewport.width - BADGE - MARGIN), top: clamp(rect.top - BADGE / 2, MARGIN, viewport.height - BADGE - MARGIN) };
}

function cardStyle(badge: { left: number; top: number }, viewport: { width: number; height: number }): Record<string, string> {
  const left = clamp(badge.left - CARD_WIDTH / 2, MARGIN, viewport.width - Math.min(CARD_WIDTH, viewport.width - 2 * MARGIN) - MARGIN);
  const below = viewport.height - (badge.top + BADGE);
  if (below >= CARD_MIN_ROOM || below >= badge.top) {
    return { left: `${left}px`, top: `${badge.top + BADGE + CARD_GAP}px`, maxHeight: `${Math.max(120, below - CARD_GAP - MARGIN)}px` };
  }
  return { left: `${left}px`, bottom: `${viewport.height - badge.top + CARD_GAP}px`, maxHeight: `${Math.max(120, badge.top - CARD_GAP - MARGIN)}px` };
}

export function ExplainOverlay(props: ExplainOverlayProps) {
  const { matches, viewport, openIndex, active, onOpen, onClose, onStop } = props;
  const placed = placeBadges(matches, viewport, props.rectOf);
  const open = openIndex === null ? null : (placed.find((p) => p.index === openIndex) ?? null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastOpen = useRef<number | null>(null);

  // الفتح ينقل التركيز إلى البطاقة، والإغلاق يعيده إلى الشارة التي فتحتها.
  useEffect(() => {
    const root = cardRef.current?.getRootNode() as ShadowRoot | undefined;
    if (openIndex !== null && cardRef.current) {
      cardRef.current.querySelector<HTMLElement>('.card')?.focus({ preventScroll: true });
      lastOpen.current = openIndex;
    } else if (lastOpen.current !== null && root?.querySelector) {
      root.querySelector<HTMLElement>(`.badge[data-index="${lastOpen.current}"]`)?.focus({ preventScroll: true });
      lastOpen.current = null;
    }
  }, [openIndex]);

  return (
    <div
      class="overlay"
      data-active={active ? 'true' : 'false'}
      ref={cardRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && openIndex !== null) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {placed.map(({ index, match, rect }) => {
        const pos = badgePosition(rect, viewport);
        const { entry } = match;
        const expanded = openIndex === index;
        return (
          <button
            type="button"
            class="badge"
            key={index}
            data-index={index}
            data-entry={entry.id}
            data-safety={entry.safety}
            aria-expanded={expanded ? 'true' : 'false'}
            aria-label={`شرح «${entry.ar} (${entry.en})» — ${entry.safety}`}
            style={{ left: `${pos.left}px`, top: `${pos.top}px` }}
            onClick={() => (expanded ? onClose() : onOpen(index))}
          >
            {entry.safety === 'آمن' ? '؟' : '!'}
          </button>
        );
      })}
      {open && (
        <div class="card-slot" style={{ display: 'contents' }}>
          <CardAt placed={open} viewport={viewport} onClose={onClose} />
        </div>
      )}
      {active && (
        <div class="mode-bar" role="status" data-bar="explain-mode">
          <span>
            وضع الشرح مفعَّل · <span data-count>{matches.length}</span> عنصرًا مشروحًا
          </span>
          <button type="button" class="btn" data-action="stop" onClick={() => onStop()}>
            إيقاف
          </button>
        </div>
      )}
    </div>
  );
}

function CardAt({ placed, viewport, onClose }: { placed: Placed; viewport: { width: number; height: number }; onClose: () => void }) {
  const pos = badgePosition(placed.rect, viewport);
  return (
    <div style={{ position: 'absolute', ...cardStyle(pos, viewport) }} class="card-anchor" data-card-for={placed.match.entry.id}>
      <ExplainCard key={placed.match.entry.id} entry={placed.match.entry} onClose={onClose} />
    </div>
  );
}

// عرض بطاقة الاستئذان (T-4.4) داخل شريط الترجمة وبطاقة التحديد. مكوّن عرض صرف: لا يعرف المحرك، ويستدعي onConfirm/onDecline من نقرتين صريحتين.
// الأزرار <button> أصلية باسم وصول، والبطاقة role="group" باسمها.
import type { ConsentCard } from './consent';

export interface ConsentPanelProps {
  readonly card: ConsentCard;
  readonly onConfirm: () => void;
  readonly onDecline: () => void;
}

export function ConsentPanel({ card, onConfirm, onDecline }: ConsentPanelProps) {
  return (
    <div class="consent" role="group" aria-label={card.title} data-consent>
      <p class="consent-title">{card.title}</p>
      <ul class="consent-lines">
        {card.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div class="consent-actions">
        <button type="button" class="btn btn-primary" data-action="consent-confirm" onClick={onConfirm}>
          {card.confirmLabel}
        </button>
        <button type="button" class="btn" data-action="consent-decline" onClick={onDecline}>
          {card.declineLabel}
        </button>
      </div>
    </div>
  );
}

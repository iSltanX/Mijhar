// شارة صحة الاتصال: نص الحالة وأيقونته ولونه معًا (الإطار O-11).
import { Icon } from '../../../shared/ui/icons';
import type { IconName } from '../../../shared/ui/icons';
import { HEALTH_LABEL, HEALTH_TONE } from '../health';
import type { Health, HealthTone } from '../health';

const TONE_ICON: Readonly<Record<HealthTone, IconName>> = { success: 'check', danger: 'warning', warning: 'warning', info: 'info', muted: 'info' };

export type BadgeState = Health | 'checking' | 'not-yet';

export function HealthBadge({ state }: { state: BadgeState }) {
  const label = state === 'checking' ? 'جارٍ القراءة…' : state === 'not-yet' ? 'لم يُتح بعد' : HEALTH_LABEL[state];
  const tone: HealthTone = state === 'checking' ? 'info' : state === 'not-yet' ? 'muted' : HEALTH_TONE[state];
  return (
    <span class="conn-badge" data-health={state} data-tone={tone}>
      <Icon name={TONE_ICON[tone]} size={14} />
      {label}
    </span>
  );
}

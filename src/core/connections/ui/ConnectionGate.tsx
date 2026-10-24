// بوابة «ميزة تحتاج ربطًا» داخل قسمها (T-11.1، AC-11.1 ‏(٣) و(٤)، مكوّن Feature gate): الخيار ظاهر معلَّلًا بما يحتاجه وبحالة اتصاله،
// وبقية القسم تعمل كما هي. الزر يطلب من الخلفية فتح موضع الربط في الإعدادات مع معرّف الميزة (من القائمة المغلقة) للعودة إليها؛ ولا حقل
// سرّ هنا: هذا المكوّن يُرسم في صفحة GitHub.
import { HEALTH_LABEL } from '../health';
import type { Health } from '../health';
import { gate } from '../features';
import type { ConnectedFeature } from '../features';
import type { ConnectionId } from '../definitions';
import { HealthBadge } from './HealthBadge';

export interface ConnectionGateProps {
  readonly feature: ConnectedFeature;
  readonly health: Partial<Record<ConnectionId, Health>>;
  /** لماذا ظهر الخيار هنا الآن (مثل ردّ 404 بلا رمز). */
  readonly reason?: string;
  readonly onConnect: () => void;
}

export function ConnectionGate({ feature, health, reason, onConnect }: ConnectionGateProps) {
  const state = gate(feature, health);
  if (state.open) return null;
  const first = state.missing[0];
  if (!first) return null;
  const { connection } = first;
  const expired = first.health === 'expired';
  return (
    <div class="mj-gate" data-gate={feature.id} data-gate-health={first.health} role="group" aria-label={feature.title}>
      <p class="mj-gate-head">
        <strong>{feature.title}</strong>
        <HealthBadge state={first.health} />
      </p>
      <p>
        {reason ? `${reason} ` : ''}
        {expired ? `${connection.title}: ${HEALTH_LABEL.expired}؛ فيتعطل هذا الخيار وحده.` : `يحتاج «${connection.title}».`} {feature.benefit}
      </p>
      <p class="mj-gate-needs">يحتاج: {connection.needs}</p>
      <button type="button" data-action="connect" data-connection={connection.id} onClick={onConnect}>
        {expired ? `جدّد ${connection.noun} من الإعدادات` : `اربط ${connection.title} من الإعدادات`}
      </button>
    </div>
  );
}

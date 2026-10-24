// سجل الاتصالات في صفحة الإعدادات وحدها (T-11.1، الإطارات O-16 وO-09 إلى O-12). لكل اتصال بطاقة: اسمه ونوعه ووجهته الوحيدة وما يفعّله وما
// يحتاجه وشارة صحته من الخلفية (لا من وجود نص). الاتصال المتاح يرسم جسمه مالكُه (رمز GitHub: قسم الرمز من T-5.5 بحقله وتحققه ومسحه)،
// والاتصال الذي لم تُدمج مرحلته يُعلَن «لم يُتح بعد» بلا حقل. ومعها لافتة العودة إلى الميزة التي طلبت الربط، وبيان الحفظ والعزل.
import type { ComponentChild } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { Ltr } from '../../../shared/ui';
import { useStyles } from '../../../shared/ui/useStyles';
import { CONNECTIONS, connectionById } from '../definitions';
import type { ConnectionDefinition, ConnectionId } from '../definitions';
import { featureById } from '../features';
import { HEALTH_TONE } from '../health';
import type { ConnectionStatus } from '../health';
import type { ConnectionsPort, PendingReturn } from '../port';
import { HealthBadge } from './HealthBadge';
import { CONNECTIONS_CSS } from './styles';

const clock = (ms: number): string => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

export interface ConnectionHeaderProps {
  readonly def: ConnectionDefinition;
  /** undefined: تُقرأ الآن. */
  readonly status: ConnectionStatus | null | undefined;
}

/** رأس بطاقة الاتصال: الاسم والشارة، والنوع والوجهة، وما يفعّله وما يحتاجه، ووقت آخر تحقق. */
export function ConnectionHeader({ def, status }: ConnectionHeaderProps) {
  const state = def.availability === 'not-yet' ? 'not-yet' : status === undefined ? 'checking' : (status?.health ?? 'none');
  return (
    <>
      <div class="conn-head">
        <h3 id={`mj-conn-${def.id}-title`}>{def.title}</h3>
        <HealthBadge state={state} />
      </div>
      <p class="muted small" data-connection-kind="">
        {def.kind} · يُرسل إلى <Ltr className="mono">{def.destination}</Ltr> وحده
      </p>
      <dl class="conn-meta">
        <dt>يفعّل</dt>
        <dd>{def.enables}</dd>
        <dt>يحتاج</dt>
        <dd data-connection-needs="">{def.needs}</dd>
        {status?.checkedAt != null && (
          <>
            <dt>آخر تحقق</dt>
            <dd>
              <Ltr>{clock(status.checkedAt)}</Ltr>
            </dd>
          </>
        )}
      </dl>
    </>
  );
}

function ReturnBanner({ pending, statuses, onReturn }: { pending: PendingReturn; statuses: readonly ConnectionStatus[] | null; onReturn: () => void }) {
  const feature = featureById(pending.feature);
  const ready = feature.requires.every((id) => statuses?.find((s) => s.id === id)?.health === 'healthy');
  const names = feature.requires.map((id) => connectionById(id).title).join(' و');
  return (
    <div class="notice conn-return" data-tone={ready ? 'success' : undefined} data-return={ready ? 'ready' : 'waiting'} role="status">
      <strong>{ready ? `${names}: سليم` : `طلبتَ: «${feature.title}»`}</strong>
      <span>
        {ready
          ? `عُد إلى «${feature.title}» في «${feature.section}»؛ لن يبدأ منها أي طلب دون نقرك.`
          : `من «${feature.section}»، ويحتاج ${names}. بعد الربط والتحقق نعيدك إليها، ولن يبدأ منها أي طلب دون نقرك.`}
      </span>
      <div class="row">
        <button type="button" class={ready ? 'btn btn-primary' : 'btn'} data-action="connection-return" onClick={onReturn}>
          {ready ? `عُد إلى «${feature.title}»` : 'عُد دون ربط'}
        </button>
      </div>
    </div>
  );
}

/** بيان الحفظ والعزل (AC-11.1 ‏(٦)): ما يُحفظ وأين وما لا يُدَّعى. */
export function StorageDisclosure() {
  return (
    <div class="conn-storage" data-storage-disclosure="">
      <h3>الحفظ والعزل</h3>
      <ul>
        <li>كل سرّ في مفتاح تخزين مستقل لا يشاركه فيه سرّ آخر، ولا تقرؤه صفحات GitHub ولا ما يُحقن فيها.</li>
        <li>
          لا يُرسل سرّ إلا إلى خدمته: الرمز إلى <Ltr className="mono">api.github.com</Ltr> وحده، ومن خلفية الإضافة وحدها.
        </li>
        <li>لا يظهر سرّ في سجل ولا رسالة خطأ ولا برومبت ولا حزمة سياق ولا ملف تصدير، ولا يُعرض بعد حفظه ولا جزء منه.</li>
        <li data-storage="disk">
          الافتراضي ذاكرة الجلسة: تُمحى بإغلاق المتصفح ولا تُكتب على القرص. وإن اخترت القرص فالسرّ يُحفظ عليه <strong>غير مشفَّر</strong>، ويقرؤه من
          يصل إلى ملف تعريف المتصفح على هذا الجهاز. وفي Firefox الجلسة وحدها.
        </li>
      </ul>
      <p class="notice" data-tone="warning" data-no-claims="">
        لا يدّعي مِجهَر تشفيرًا لم يتحقق منه، ولا يضمن التنقيح إزالة كل سرّ من المحتوى الذي تنسخه أو ترسله؛ راجع ما تنسخه قبل مشاركته.
      </p>
    </div>
  );
}

export interface ConnectionsSectionProps {
  readonly connections: ConnectionsPort;
  /** جسم بطاقة اتصال متاح، يستقبل رأسها وحالته ودالة تحديث الحالة بعد حفظ أو تحقق أو مسح. */
  readonly body: (id: ConnectionId, header: ComponentChild, status: ConnectionStatus | null | undefined, refresh: () => void) => ComponentChild;
}

export function ConnectionsSection({ connections, body }: ConnectionsSectionProps) {
  const ref = useRef<HTMLElement>(null);
  useStyles(ref, 'core-connections', CONNECTIONS_CSS);
  const [statuses, setStatuses] = useState<readonly ConnectionStatus[] | null>(null);
  const [pending, setPending] = useState<PendingReturn | null>(null);
  const [returnMessage, setReturnMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    connections.status().then(
      (list) => setStatuses(list),
      () => setStatuses([]),
    );
  }, [connections]);

  useEffect(() => {
    refresh();
    connections.pending().then(setPending, () => setPending(null));
  }, [connections, refresh]);

  const goBack = () => {
    setReturnMessage(null);
    connections.returnToFeature().then(
      (back) => {
        setPending(null);
        if (!back) setReturnMessage('تعذّرت العودة: أُغلق تبويب الميزة. افتحها من جديد؛ والربط محفوظ هنا.');
      },
      () => setReturnMessage('تعذّرت العودة إلى تبويب الميزة.'),
    );
  };

  return (
    <section ref={ref} class="section connections" aria-labelledby="mj-connections-title" data-section="connections">
      <h2 id="mj-connections-title">الاتصالات والمفاتيح</h2>
      <p class="muted">
        مكان واحد لكل اتصال اختياري. لا شيء هنا شرط لعمل مِجهَر: الميزات الأساسية وحزمة السياق تعمل بلا أي اتصال، وكل خيار يحتاج ربطًا يظهر في
        قسمه معلَّلًا بما يحتاجه. والحالة يحددها طلب تحقق فعلي، لا وجود نص في الحقل.
      </p>
      {pending && <ReturnBanner pending={pending} statuses={statuses} onReturn={goBack} />}
      {returnMessage && (
        <p class="notice" data-tone="danger" role="alert">
          {returnMessage}
        </p>
      )}
      <div class="conn-list">
        {CONNECTIONS.map((def) => {
          const status = statuses === null ? undefined : (statuses.find((s) => s.id === def.id) ?? null);
          const header = <ConnectionHeader def={def} status={status} />;
          if (def.availability === 'not-yet') {
            return (
              <article class="conn-card" key={def.id} data-connection={def.id} data-availability="not-yet" aria-labelledby={`mj-conn-${def.id}-title`}>
                {header}
                <p class="notice" data-not-yet="">
                  {def.notYet}
                </p>
              </article>
            );
          }
          const tone = status ? HEALTH_TONE[status.health] : undefined;
          return (
            <article class="conn-card" key={def.id} data-connection={def.id} data-health={status?.health ?? 'checking'} data-tone={tone} aria-labelledby={`mj-conn-${def.id}-title`}>
              {body(def.id, header, status, refresh)}
            </article>
          );
        })}
      </div>
      <StorageDisclosure />
    </section>
  );
}

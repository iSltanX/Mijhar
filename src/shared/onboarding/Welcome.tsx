// الترحيب عند أول فتح للوحة (AD-29؛ إطارات P-55 وP-56a وP-57 في القسم J من ملف التصميم): خطوتان قصيرتان داخل لوحة التبويبات،
// والتبويبات تبقى ظاهرة فوقه. لا حقل إدخال (يُرسم في الدرج داخل صفحة GitHub أيضًا، DEC-04)، ولا اتصال بأي خدمة.
//  - «ابدأ الاستخدام» و«تخطَّ» و«اربط الرمز من الإعدادات» تنهيه (onDone)؛ وروابط الشرح تفتح صفحة الإعدادات ولا تنهيه.
//  - الانتقال بين الخطوتين ينقل التركيز إلى عنوان الخطوة؛ والتركيب الأول لا يسرق التركيز من الصفحة.
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { OptionsTarget } from '../../core/ui-host/commands';
import { Icon } from '../ui/icons';
import { useStyles } from '../ui/useStyles';
import { connectionsDifference, OPTIONAL_CONNECTIONS, WELCOME_FEATURES, WELCOME_PRIVACY } from './content';
import type { OptionalConnection } from './content';

export interface WelcomeProps {
  /** ينهي الترحيب (تكتب اللوحة الحالة 'done'). */
  readonly onDone: () => void;
  /** يفتح صفحة الإعدادات على موضع؛ دونه لا تظهر أزرار الإعدادات والشرح. */
  readonly openOptions?: (target: OptionsTarget) => void;
  readonly connections?: readonly OptionalConnection[];
}

export const WELCOME_CSS = `
.mj-root .welcome { display: flex; flex-direction: column; gap: var(--mijhar-space-16); }
.mj-root .welcome .step-chip { align-self: flex-start; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary); font-size: 12px; line-height: 20px; font-weight: 700; }
.mj-root .welcome h3.welcome-title { font-size: 20px; line-height: 32px; }
.mj-root .welcome h3.welcome-title:focus-visible { outline: none; box-shadow: var(--mijhar-focus-ring); border-radius: var(--mijhar-radius-6); }
.mj-root .welcome .lead { color: var(--mijhar-text-secondary); }
.mj-root .welcome .eyebrow { color: var(--mijhar-text-tertiary); font-size: 12px; line-height: 20px; font-weight: 700; }
.mj-root .welcome .features { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mijhar-space-12); }
.mj-root .welcome .feature { display: flex; align-items: flex-start; gap: var(--mijhar-space-12); }
.mj-root .welcome .tile { flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; background: var(--mijhar-bg-brand-subtle); color: var(--mijhar-text-brand); }
.mj-root .welcome .tile[data-muted] { background: var(--mijhar-bg-muted); color: var(--mijhar-text-tertiary); }
.mj-root .welcome .feature strong { display: block; }
.mj-root .welcome .note { display: flex; align-items: flex-start; gap: var(--mijhar-space-8); padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: 8px; background: var(--mijhar-bg-subtle); color: var(--mijhar-text-secondary); font-size: 12px; line-height: 20px; }
.mj-root .welcome .note[data-tone="info"] { background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.mj-root .welcome .note .icon, .mj-root .welcome .fact .icon { flex: 0 0 auto; margin-top: 2px; }
.mj-root .welcome .note[data-tone="privacy"] .icon { color: var(--mijhar-text-brand); }
.mj-root .welcome .connection { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-16); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); }
.mj-root .welcome .connection-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8); }
.mj-root .welcome .connection-name { display: flex; align-items: center; gap: var(--mijhar-space-8); font-weight: 700; }
.mj-root .welcome .connection-name .tile { width: 28px; height: 28px; }
.mj-root .welcome .badge { display: inline-flex; align-items: center; gap: var(--mijhar-space-4); padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary); font-size: 12px; line-height: 20px; font-weight: 700; white-space: nowrap; }
.mj-root .welcome .badge[data-status="not-yet"] { background: var(--mijhar-bg-accent-subtle); color: var(--mijhar-text-warning); }
.mj-root .welcome .connection-text { font-size: 12px; line-height: 20px; }
.mj-root .welcome .facts { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mijhar-space-4); }
.mj-root .welcome .fact { display: flex; align-items: flex-start; gap: var(--mijhar-space-6); color: var(--mijhar-text-secondary); font-size: 12px; line-height: 20px; }
.mj-root .welcome .link-btn { appearance: none; align-self: flex-start; display: inline-flex; align-items: center; gap: var(--mijhar-space-4); padding: 0; border: 0; background: none; font: inherit; font-weight: 700; color: var(--mijhar-text-link); cursor: pointer; }
.mj-root .welcome .link-btn:hover { text-decoration: underline; text-underline-offset: 2px; }
.mj-root .welcome .actions { display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding-top: var(--mijhar-space-12); border-top: 1px solid var(--mijhar-border-muted); }
.mj-root .welcome .actions .btn { width: 100%; }
.mj-root .welcome .back-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mijhar-space-8); }
.mj-root .welcome .back-row .btn { width: auto; }
.mj-root .panel-app[data-welcome] .tab[aria-selected="true"] { color: var(--mijhar-text-secondary); border-bottom-color: transparent; }
`;

function Badge({ connection }: { connection: OptionalConnection }) {
  return connection.status === 'available' ? (
    <span class="badge" data-status="available">
      اختياري
    </span>
  ) : (
    <span class="badge" data-status="not-yet">
      <Icon name="clock" />
      لم يُتح بعد
    </span>
  );
}

function ConnectionCard({ connection, openOptions }: { connection: OptionalConnection; openOptions?: (target: OptionsTarget) => void }) {
  const titleId = `mj-welcome-conn-${connection.id}`;
  return (
    <section class="connection" aria-labelledby={titleId} data-connection={connection.id} data-status={connection.status}>
      <div class="connection-head">
        <span class="connection-name" id={titleId}>
          <span class="tile" {...(connection.status === 'available' ? {} : { 'data-muted': '' })}>
            <Icon name={connection.icon} />
          </span>
          {connection.title}
        </span>
        <Badge connection={connection} />
      </div>
      <p class="connection-text">{connection.text}</p>
      {connection.facts.length > 0 && (
        <ul class="facts">
          {connection.facts.map((fact) => (
            <li class="fact" key={fact.text}>
              <Icon name={fact.icon} />
              <span>{fact.text}</span>
            </li>
          ))}
        </ul>
      )}
      {connection.guide && openOptions && (
        <button type="button" class="link-btn" data-action={`guide-${connection.id}`} onClick={() => openOptions(connection.guide!.target)}>
          {connection.guide.label}
          <Icon name="chevron-left" />
        </button>
      )}
    </section>
  );
}

export function Welcome({ onDone, openOptions, connections = OPTIONAL_CONNECTIONS }: WelcomeProps) {
  const ref = useRef<HTMLDivElement>(null);
  useStyles(ref, 'welcome', WELCOME_CSS);
  const [step, setStep] = useState<1 | 2>(1);
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  // متزامن بعد تبديل العقد: الزر الذي نُقر أُزيل، فلا يبقى التركيز على body حتى دورة الرسم التالية (وقد تتأخر في لوحة غير ظاهرة).
  useLayoutEffect(() => {
    if (moved.current) heading.current?.focus();
  }, [step]);
  const go = (next: 1 | 2) => {
    moved.current = true;
    setStep(next);
  };
  const setup = connections.find((c) => c.status === 'available' && c.setup)?.setup;
  const allAvailable = connections.every((c) => c.status === 'available');

  return (
    <div ref={ref} class="welcome" data-welcome-step={step} role="region" aria-labelledby="mj-welcome-title">
      <span class="step-chip">{step === 1 ? '١ من ٢' : '٢ من ٢'}</span>
      {step === 1 ? (
        <>
          <h3 class="welcome-title" id="mj-welcome-title" ref={heading} tabIndex={-1}>
            أهلًا بك في مِجهَر
          </h3>
          <p class="lead">مساعد عربي يعمل فوق صفحات GitHub: يضبط القراءة، ويشرح الواجهة، ويلخّص حالة العمل بأدلتها، ويجهّز سياق مهمتك لتنسخه.</p>
          <p class="eyebrow">جاهز الآن، بلا أي إعداد</p>
          <ul class="features">
            {WELCOME_FEATURES.map((feature) => (
              <li class="feature" key={feature.title}>
                <span class="tile">
                  <Icon name={feature.icon} />
                </span>
                <span>
                  <strong>{feature.title}</strong>
                  <span class="muted small">{feature.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <p class="note" data-tone="privacy">
            <Icon name="shield" />
            <span>{WELCOME_PRIVACY}</span>
          </p>
          <div class="actions">
            <button type="button" class="btn btn-primary" data-action="welcome-next" onClick={() => go(2)}>
              التالي: الإضافات الاختيارية
              <Icon name="arrow-left" />
            </button>
            <button type="button" class="btn btn-ghost" data-action="welcome-skip" onClick={onDone}>
              تخطَّ وابدأ الاستخدام
            </button>
          </div>
        </>
      ) : (
        <>
          <h3 class="welcome-title" id="mj-welcome-title" ref={heading} tabIndex={-1}>
            إضافات اختيارية، متى احتجتها
          </h3>
          <p class="lead">لا يلزمك أي منهما لتبدأ. اربطهما الآن أو لاحقًا من الإعدادات، واحذفهما متى شئت.</p>
          {connections.map((connection) => (
            <ConnectionCard key={connection.id} connection={connection} {...(openOptions ? { openOptions } : {})} />
          ))}
          <p class="note" data-tone="info">
            <Icon name="info" />
            <span>{connectionsDifference(connections)}</span>
          </p>
          <div class="actions">
            <button type="button" class="btn btn-primary" data-action="welcome-done" onClick={onDone}>
              ابدأ الاستخدام
            </button>
            {openOptions && setup && (
              <button
                type="button"
                class="btn"
                data-action="welcome-setup"
                onClick={() => {
                  openOptions(setup);
                  onDone();
                }}
              >
                <Icon name="external-link" />
                {allAvailable ? 'اربطهما من الإعدادات' : 'اربط الرمز من الإعدادات'}
              </button>
            )}
            <div class="back-row">
              <span class="muted small">تجده لاحقًا في «الإعدادات».</span>
              <button type="button" class="btn btn-ghost" data-action="welcome-back" onClick={() => go(1)}>
                <Icon name="arrow-right" />
                السابق
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

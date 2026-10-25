// قسم «رمز GitHub للقراءة» في صفحة الإعدادات وحدها (T-5.5، AC-5.5 و AC-D7). لا يظهر في الدرج ولا في اللوحة: تمرّره صفحة الإعدادات
// إلى SettingsTab، فلا تصل شيفرته إلى سكربت المحتوى أصلًا.
//  - الحقل غير متحكَّم به: الرمز لا يدخل حالة المكوّن، ويُقرأ من الحقل عند الحفظ ثم يُفرَّغ الحقل. ولا يُعرض الرمز بعد الحفظ ولا جزء منه.
//  - الحفظ يكتب في المخزن مباشرة (صفحة إضافة موثوقة)، والخلفية تقرؤه لطلباتها؛ فلا يعبر الرمز أي رسالة. والتحقق طلب /rate_limit عبر
//    منفذ الخلفية نفسه (مسار وحده، والرد بلا الرمز).
//  - قائمة الصلاحيات الدنيا ظاهرة عند الإدخال، كلها Read-only، ولا يُذكر غيرها.
//  - «كيف تحصل على الرمز؟» يفتح دليله داخل صفحة الإعدادات (#guide/github-token، AD-29)، ويبقى عند نقل القسم إلى سجل الاتصالات.
//  - MJ18 (T-11.1): القسم جسم بطاقة «رمز GitHub للقراءة» في سجل الاتصالات: رأسها وشارتها من السجل، وحالته تصنّفها دوال السجل نفسها
//    (سليم بعد قبول فعلي وحده، ولكل حالة نصها)، والمسح يسرد قبل تنفيذه ما يتعطل وحده وما يبقى.
import type { ComponentChild } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PublicApiPort } from '../../../core/api';
import { dependentsOf } from '../../../core/connections/features';
import { HEALTH_TONE, verdictFromVerification } from '../../../core/connections/health';
import type { ConnectionStatus, HealthTone, Verdict } from '../../../core/connections/health';
import { healthText, utcText } from '../../../core/connections/text';
import { CONNECTIONS_CSS } from '../../../core/connections/ui/styles';
import { Ltr } from '../../../shared/ui';
import { useOnVisible } from '../../../shared/ui/useOnVisible';
import { useStyles } from '../../../shared/ui/useStyles';
import { READ_ACCESS_LEVEL, READ_PERMISSIONS, TOKEN_FORMAT_MESSAGES, TOKEN_LIMITS, checkTokenFormat } from './format';
import type { TokenInfo, TokenPlace, TokenStore } from './store';

export { utcText };

export interface TokenSectionProps {
  readonly store: Pick<TokenStore, 'info' | 'save' | 'clear' | 'sessionAvailable' | 'diskAvailable'>;
  /** منفذ الخلفية: للتحقق من الرمز وحالة الوصول. */
  readonly port: PublicApiPort;
  readonly target: 'chromium' | 'firefox';
  /** للاختبار. */
  readonly now?: () => number;
  /** MJ18: رأس بطاقة السجل بدل العنوان والمقدمة (اسم الاتصال وشارته ونوعه وما يحتاجه). */
  readonly header?: ComponentChild;
  /** MJ18: حالة الرمز المسجلة في الخلفية (undefined: القسم وحده خارج السجل). */
  readonly status?: ConnectionStatus | null;
  /** MJ18: بعد كل حفظ أو تحقق أو مسح، ليقرأ السجل الحالة من جديد. */
  readonly onChange?: () => void;
}

/** اسم صلاحية GitHub من معاملها. */
export const permissionName = (param: string): string => READ_PERMISSIONS.find((p) => p.param === param)?.name ?? param;

const TOKEN_CSS = `
.mj-root .token-form { display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.mj-root .token-form fieldset { border: 0; margin: 0; padding: 0; }
.mj-root .token-form legend { font-weight: 700; padding: 0; margin-bottom: var(--mijhar-space-4); }
.mj-root .token-input {
  width: 100%; max-width: 36rem; min-height: 32px; padding: 0 var(--mijhar-space-8); font-family: var(--mijhar-font-mono); font-size: 12px;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6);
  direction: ltr; text-align: left;
}
.mj-root .token-input:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.mj-root .token-perms { margin: 0; padding-inline-start: var(--mijhar-space-24); display: flex; flex-direction: column; gap: 2px; }
.mj-root .choice input:disabled + .label { color: var(--mijhar-text-disabled); }
`;

const PLACE_TEXT: Readonly<Record<TokenPlace, string>> = { session: 'ذاكرة الجلسة', disk: 'القرص في هذا المتصفح' };

/** لون إشعار الحالة: الأخطر بالأحمر، والنقص والحد بالتحذير، والسليم بالأخضر، وغير المتحقق منه بالمعلومات. */
const TONE_ATTR: Readonly<Record<HealthTone, string | undefined>> = { danger: 'danger', warning: 'warning', success: 'success', info: undefined, muted: undefined };

export function TokenSection({ store, port, target, now = () => Date.now(), header, status, onChange }: TokenSectionProps) {
  const ref = useRef<HTMLElement>(null);
  useStyles(ref, 'd-token', TOKEN_CSS);
  // أنماط السجل (الإشعارات بألوانها وتأكيد المسح) حين يُرسم القسم وحده أيضًا.
  useStyles(ref, 'core-connections', CONNECTIONS_CSS);
  const input = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<TokenInfo | null | undefined>(undefined);
  const [place, setPlace] = useState<TokenPlace>('session');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'danger' | 'info'; text: string } | null>(null);
  /** حكم آخر تحقق في هذه الصفحة، حتى تصل حالة السجل بعده. */
  const [check, setCheck] = useState<Verdict | null>(null);
  const [confirming, setConfirming] = useState(false);

  // حالة السجل الجديدة (بعد تحقق أو استعمال سجّلته الخلفية) تحل محل الحكم المحلي: مصنّف واحد ومصدر واحد.
  useEffect(() => {
    if (status !== undefined) setCheck(null);
  }, [status]);

  useEffect(() => {
    let alive = true;
    store.info().then(
      (value) => alive && setInfo(value),
      () => alive && setInfo(null),
    );
    return () => {
      alive = false;
    };
  }, [store]);

  // الرمز يُحفظ أو يُمسح من صفحة إعدادات أخرى: يُقرأ من جديد حين تعود هذه الصفحة إلى الواجهة (PI-1)، ويُغلق تأكيد مسح رمز لم يعد هو المحفوظ.
  useOnVisible(() => {
    store.info().then(setInfo, () => setInfo(null));
  });
  useEffect(() => setConfirming(false), [info?.savedAt]);

  const verify = async (): Promise<void> => {
    const result = await port.get('/rate_limit');
    const auth = await port.status().catch(() => null);
    setCheck(verdictFromVerification(result, auth?.tokenExpiresAt ?? null));
    onChange?.();
  };

  const save = (event: Event) => {
    event.preventDefault();
    const field = input.current;
    if (!field || busy) return;
    const parsed = checkTokenFormat(field.value);
    if (!parsed.ok) {
      setMessage({ tone: 'danger', text: TOKEN_FORMAT_MESSAGES[parsed.reason] });
      return;
    }
    setBusy(true);
    setMessage(null);
    setCheck(null);
    store
      .save(parsed.token, place)
      .then(async (saved) => {
        field.value = '';
        setInfo(saved);
        setMessage({ tone: 'info', text: `حُفظ الرمز في ${PLACE_TEXT[saved.place]}.` });
        await verify();
      })
      .catch((error: unknown) => setMessage({ tone: 'danger', text: `لم يُحفظ الرمز: ${error instanceof Error ? error.message : 'خطأ غير معروف'}` }))
      .finally(() => setBusy(false));
  };

  const clear = () => {
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    setCheck(null);
    if (input.current) input.current.value = '';
    store
      .clear()
      .then(async () => {
        setInfo(null);
        // تقرأ الخلفية غياب الرمز فتفرّغ ذاكرة الموثَّق ومتعقّبه فورًا.
        await port.status().catch(() => null);
        setMessage({ tone: 'info', text: 'مُسح الرمز من ذاكرة الجلسة ومن القرص. تعمل الوحدة (د) الآن على الصفحة وAPI العامة.' });
      })
      .catch((error: unknown) => setMessage({ tone: 'danger', text: `تعذّر مسح الرمز كاملًا: ${error instanceof Error ? error.message : 'خطأ غير معروف'}` }))
      .finally(() => {
        setBusy(false);
        onChange?.();
      });
  };

  const recheck = () => {
    setBusy(true);
    setMessage(null);
    verify()
      .catch(() => setCheck({ health: 'unavailable', detail: { reason: 'تعذّر الوصول إلى خلفية الإضافة' } }))
      .finally(() => setBusy(false));
  };

  const diskNote = store.diskAvailable
    ? 'يبقى بعد إغلاق المتصفح. يُحفظ على قرص هذا الجهاز غير مشفَّر، ويستطيع قراءته من يصل إلى ملف تعريف المتصفح؛ لا تختره على جهاز مشترك.'
    : target === 'firefox'
      ? 'غير متاح في Firefox: لا يتيح Firefox ضبط مستوى وصول التخزين للسياقات الموثوقة (setAccessLevel)، وهو شرط الحفظ الدائم في مِجهَر؛ فيبقى الرمز في ذاكرة الجلسة وحدها.'
      : 'غير متاح في هذا المتصفح.';
  const stateLabel = info === undefined ? 'جارٍ القراءة…' : info ? `محفوظ في ${PLACE_TEXT[info.place]} منذ ${utcText(info.savedAt)}` : 'لا رمز محفوظ';

  // المعروض: حكم التحقق في هذه الصفحة، وإلا حالة السجل لرمز محفوظ.
  const recorded = status && status.health !== 'none' ? { health: status.health, detail: status.detail } : null;
  const shown: Verdict | null = check ?? recorded;
  const dependents = dependentsOf('github-token');

  return (
    <section ref={ref} class="section token" aria-labelledby={header ? 'mj-conn-github-token-title' : 'mj-token-title'} data-section="token">
      {header ?? (
        <>
          <h2 id="mj-token-title">رمز GitHub للقراءة (اختياري)</h2>
          <p class="muted">
            برمز وصول للقراءة فقط تقرأ مِجهَر ما يحتاج مصادقة: طلبات الدمج في مستودعاتك الخاصة وفحوص Actions فيها. تُرسل الطلبات به من خلفية
            الإضافة وحدها إلى <Ltr className="mono">api.github.com</Ltr>، ولا يصل إلى صفحات GitHub ولا يظهر بعد حفظه. ودونه تعمل الوحدة (د) كاملة
            على الصفحة وAPI العامة.
          </p>
        </>
      )}
      <p class="row">
        <a href="#guide/github-token" data-action="token-guide">
          كيف تحصل على الرمز؟
        </a>
        <span class="muted small">فائدته وخطوات إنشائه بأقل الصلاحيات، بالصور.</span>
      </p>
      <p>
        <span class="status" data-state={info ? 'granted' : info === null ? 'denied' : 'pending'} data-token-state={info ? info.place : info === null ? 'none' : 'checking'} role="status">
          {stateLabel}
        </span>
      </p>

      <div data-token-permissions="">
        <p>
          أنشئه من GitHub: <Ltr>Settings → Developer settings → Fine-grained tokens</Ltr>، واختر المستودعات التي تريدها وحدها، ثم اجعل كل صلاحية مما يلي{' '}
          <Ltr className="mono">{READ_ACCESS_LEVEL}</Ltr> ولا تضف غيرها:
        </p>
        <ul class="token-perms">
          {READ_PERMISSIONS.map((p) => (
            <li key={p.name} data-permission={p.name}>
              <Ltr className="mono">{p.name}</Ltr>: <Ltr className="mono">{READ_ACCESS_LEVEL}</Ltr> — <span class="muted">{p.why}</span>
            </li>
          ))}
        </ul>
        <ul class="token-perms muted small">
          {TOKEN_LIMITS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <form class="token-form" onSubmit={save} data-token-form="">
        <fieldset>
          <legend>أين يُحفظ</legend>
          <label class="choice">
            <input type="radio" name="mj-token-place" value="session" checked={place === 'session'} disabled={!store.sessionAvailable} onChange={() => setPlace('session')} />
            <span class="label">
              <strong>ذاكرة الجلسة (الافتراضي)</strong>
              <br />
              <span class="muted small">يُمحى عند إغلاق المتصفح، ولا يُكتب على القرص.</span>
            </span>
          </label>
          <label class="choice">
            <input type="radio" name="mj-token-place" value="disk" checked={place === 'disk'} disabled={!store.diskAvailable} onChange={() => setPlace('disk')} />
            <span class="label">
              <strong>القرص في هذا المتصفح</strong>
              <br />
              <span class="muted small" data-disk-note={store.diskAvailable ? 'available' : 'blocked'}>
                {diskNote}
              </span>
            </span>
          </label>
        </fieldset>
        <label for="mj-token-input">الرمز (يبدأ بـ<Ltr className="mono">github_pat_</Ltr>)</label>
        <input ref={input} id="mj-token-input" class="token-input" type="password" autocomplete="off" spellcheck={false} dir="ltr" />
        <div class="row">
          <button type="submit" class="btn btn-primary" data-action="token-save" disabled={busy || !store.sessionAvailable}>
            احفظ الرمز
          </button>
          <button type="button" class="btn" data-action="token-check" disabled={busy || !info} onClick={recheck}>
            تحقق من الرمز
          </button>
          <button type="button" class="btn btn-danger" data-action="token-clear" disabled={busy} aria-expanded={confirming} onClick={() => setConfirming(true)}>
            امسح الرمز
          </button>
        </div>
      </form>

      {confirming && (
        <div class="conn-confirm" role="alertdialog" aria-labelledby="mj-token-confirm-title" data-token-confirm="">
          <strong id="mj-token-confirm-title">امسح رمز GitHub؟</strong>
          <span>يُمسح من ذاكرة الجلسة ومن القرص فورًا ولا يُستعاد؛ تلصقه من جديد إن احتجته.</span>
          <span>يتعطل وحده:</span>
          <ul data-disables="">
            {dependents.map((f) => (
              <li key={f.id}>{f.title}</li>
            ))}
          </ul>
          <span data-keeps="">يبقى كما هو: قراءة الصفحة وAPI العامة، وكل الوحدات، وحزمة السياق، وأي اتصال آخر.</span>
          <div class="row">
            <button type="button" class="btn btn-danger" data-action="token-clear-confirm" disabled={busy} onClick={clear}>
              امسح الرمز
            </button>
            <button type="button" class="btn" data-action="token-clear-cancel" onClick={() => setConfirming(false)}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {message && (
        <p class="notice" data-tone={message.tone === 'danger' ? 'danger' : undefined} role="alert" data-token-message="">
          {message.text}
        </p>
      )}
      {shown && (
        <p
          class="notice"
          data-tone={TONE_ATTR[HEALTH_TONE[shown.health]]}
          role="status"
          data-token-check={shown.health === 'healthy' ? 'ok' : 'fail'}
          data-health={shown.health}
        >
          {healthText('github-token', shown, { now: now(), permissionName })}
        </p>
      )}
    </section>
  );
}

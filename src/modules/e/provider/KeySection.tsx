// جسم بطاقة «مفتاح مزوّد التحليل» في سجل الاتصالات (T-11.6، AC-E9 (١) و(٤)، DEC-10 ح-4). في صفحة الإعدادات وحدها: تمرّره صفحة الإعدادات إلى
// سجل الاتصالات، فلا تصل شيفرته سكربت المحتوى ولا اللوحة.
//  - الحقل غير متحكَّم به: المفتاح لا يدخل حالة المكوّن، ويُقرأ من الحقل عند الحفظ ثم يُفرَّغ، ولا يُعرض بعد الحفظ ولا جزء منه.
//  - الحفظ يكتب في مخزنه الموثوق مباشرة (مفتاحاه المستقلان)، والخلفية تقرؤه لطلباتها؛ فلا يعبر المفتاح أي رسالة.
//  - إضافة المفتاح لا تبدأ أي تحليل: الطلب الوحيد بعدها طلب التحقق المعلن هنا قبل الحفظ (قائمة المودلات، بلا محتوى). وصلاحية مضيف المزوّد
//    الاختيارية تُطلب في نقرة الحفظ نفسها قبل أي await (VER-05)، وإن رُفضت حُفظ المفتاح «غير متحقق منه» ولم يُرسل شيء.
//  - لا سعر ولا تكلفة ولا حد إنفاق (AD-31).
import type { ComponentChild } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { dependentsOf } from '../../../core/connections/features';
import { HEALTH_TONE } from '../../../core/connections/health';
import type { ConnectionStatus, HealthTone } from '../../../core/connections/health';
import { healthText, utcText } from '../../../core/connections/text';
import { CONNECTIONS_CSS } from '../../../core/connections/ui/styles';
import type { SecretInfo, SecretPlace, SecretStore } from '../../../core/connections/secrets';
import { Ltr } from '../../../shared/ui';
import { useStyles } from '../../../shared/ui/useStyles';
import type { ProviderHostPermission } from './gate';
import type { ProviderPort, ProviderStatus } from './port';
import { PROVIDERS } from './registry';

export interface KeySectionProps {
  readonly store: Pick<SecretStore, 'info' | 'save' | 'clear' | 'sessionAvailable' | 'diskAvailable'>;
  readonly port: ProviderPort;
  /** صلاحية مضيف المزوّد المختار. */
  readonly permission: ProviderHostPermission;
  readonly target: 'chromium' | 'firefox';
  readonly header?: ComponentChild;
  readonly status?: ConnectionStatus | null;
  readonly onChange?: () => void;
  readonly now?: () => number;
}

const KEY_CSS = `
.mj-root .key-form { display: flex; flex-direction: column; gap: var(--mijhar-space-8); }
.mj-root .key-form fieldset { border: 0; margin: 0; padding: 0; }
.mj-root .key-form legend { font-weight: 700; padding: 0; margin-bottom: var(--mijhar-space-4); }
.mj-root .key-input {
  width: 100%; max-width: 36rem; min-height: 32px; padding: 0 var(--mijhar-space-8); font-family: var(--mijhar-font-mono); font-size: 12px;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6);
  direction: ltr; text-align: left;
}
.mj-root .key-input:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.mj-root .choice input:disabled + .label { color: var(--mijhar-text-disabled); }
`;

const PLACE_TEXT: Readonly<Record<SecretPlace, string>> = { session: 'ذاكرة الجلسة', disk: 'القرص في هذا المتصفح' };
const TONE_ATTR: Readonly<Record<HealthTone, string | undefined>> = { danger: 'danger', warning: 'warning', success: 'success', info: undefined, muted: undefined };

type Message = { readonly tone: 'danger' | 'info' | 'success'; readonly text: string };

export function KeySection({ store, port, permission, target, header, status, onChange, now = () => Date.now() }: KeySectionProps) {
  const ref = useRef<HTMLElement>(null);
  useStyles(ref, 'e-provider-key', KEY_CSS);
  useStyles(ref, 'core-connections', CONNECTIONS_CSS);
  const input = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<SecretInfo | null | undefined>(undefined);
  const [place, setPlace] = useState<SecretPlace>('session');
  const [busy, setBusy] = useState(false);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [confirming, setConfirming] = useState(false);
  const adapter = PROVIDERS.find((p) => p.id === provider?.provider.id) ?? PROVIDERS[0];

  useEffect(() => {
    let alive = true;
    store.info().then(
      (value) => alive && setInfo(value),
      () => alive && setInfo(null),
    );
    permission.has().then(
      (value) => alive && setGranted(value),
      () => alive && setGranted(false),
    );
    port.status().then((value) => alive && setProvider(value));
    const unsubscribe = permission.subscribe((value) => setGranted(value));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [store, permission, port]);

  const verify = async (): Promise<void> => {
    const result = await port.verify();
    setProvider(await port.status());
    if (result.ok) setMessage({ tone: 'success', text: `قبِل ${adapter?.title ?? 'المزوّد'} المفتاح وقُرئت ${result.data.models.length} مودلات متاحة له. لم يبدأ أي تحليل ولم يُرسل شيء من صفحاتك.` });
    else setMessage({ tone: 'danger', text: `لم يُتحقق من المفتاح: ${result.message}` });
    onChange?.();
  };

  /** صلاحية المضيف تُطلب في النقرة نفسها قبل أي await؛ وتُعاد null حين تكون ممنوحة أصلًا. */
  const askPermission = (): Promise<boolean> => (granted ? Promise.resolve(true) : permission.request().catch(() => false));

  const save = (event: Event) => {
    event.preventDefault();
    const field = input.current;
    if (!field || busy || !adapter) return;
    const parsed = adapter.checkKey(field.value);
    if (!parsed.ok) {
      setMessage({ tone: 'danger', text: parsed.reason });
      return;
    }
    const asked = askPermission();
    setBusy(true);
    setMessage(null);
    asked
      .then(async (ok) => {
        setGranted(ok);
        const saved = await store.save(parsed.key, place);
        field.value = '';
        setInfo(saved);
        if (!ok) {
          setMessage({ tone: 'info', text: `حُفظ المفتاح في ${PLACE_TEXT[saved.place]} ولم يُتحقق منه: لم تُمنح صلاحية ${adapter.host}، فلم يُرسل شيء.` });
          onChange?.();
          return;
        }
        await verify();
      })
      .catch((error: unknown) => setMessage({ tone: 'danger', text: `لم يُحفظ المفتاح: ${error instanceof Error ? error.message : 'خطأ غير معروف'}` }))
      .finally(() => setBusy(false));
  };

  const recheck = () => {
    const asked = askPermission();
    setBusy(true);
    setMessage(null);
    asked
      .then(async (ok) => {
        setGranted(ok);
        if (!ok) {
          setMessage({ tone: 'info', text: `لم تُمنح صلاحية ${adapter?.host ?? 'المزوّد'}؛ لم يُرسل شيء.` });
          return;
        }
        await verify();
      })
      .catch(() => setMessage({ tone: 'danger', text: 'تعذّر الوصول إلى خلفية الإضافة' }))
      .finally(() => setBusy(false));
  };

  const clear = () => {
    setConfirming(false);
    setBusy(true);
    setMessage(null);
    if (input.current) input.current.value = '';
    store
      .clear()
      .then(() => {
        setInfo(null);
        setMessage({ tone: 'info', text: 'مُسح المفتاح من ذاكرة الجلسة ومن القرص. يعمل مِجهَر كاملًا بلا تحليل، وتبقى الأقسام وحزمة السياق ورمز GitHub كما هي.' });
      })
      .catch((error: unknown) => setMessage({ tone: 'danger', text: `تعذّر مسح المفتاح كاملًا: ${error instanceof Error ? error.message : 'خطأ غير معروف'}` }))
      .finally(() => {
        setBusy(false);
        onChange?.();
      });
  };

  const revoke = () => {
    setBusy(true);
    permission
      .revoke()
      .then(
        async () => setGranted(await permission.has()),
        () => setMessage({ tone: 'danger', text: 'تعذّر سحب الصلاحية' }),
      )
      .finally(() => setBusy(false));
  };

  const diskNote = store.diskAvailable
    ? 'يبقى بعد إغلاق المتصفح. يُحفظ على قرص هذا الجهاز غير مشفَّر، ويستطيع قراءته من يصل إلى ملف تعريف المتصفح؛ لا تختره على جهاز مشترك.'
    : target === 'firefox'
      ? 'غير متاح في Firefox: لا يتيح ضبط مستوى وصول التخزين للسياقات الموثوقة (setAccessLevel)، فيبقى المفتاح في ذاكرة الجلسة وحدها.'
      : 'غير متاح في هذا المتصفح.';
  const stateLabel = info === undefined ? 'جارٍ القراءة…' : info ? `محفوظ في ${PLACE_TEXT[info.place]} منذ ${utcText(info.savedAt)}` : 'لا مفتاح محفوظ';
  const shown = status && status.health !== 'none' ? status : null;
  const dependents = dependentsOf('provider-key');
  const host = adapter?.host ?? 'api.anthropic.com';

  return (
    <section ref={ref} class="section provider-key" aria-labelledby="mj-conn-provider-key-title" data-section="provider-key">
      {header}
      <p class="row">
        <a href="#guide/provider-key" data-action="provider-key-guide">
          لماذا المفتاح؟
        </a>
        <span class="muted small">ما يضيفه، وأين يظهر، وما يُرسل ولمن، وما يبقى دونه.</span>
      </p>
      <p>
        <span class="status" data-state={info ? 'granted' : info === null ? 'denied' : 'pending'} data-key-state={info ? info.place : info === null ? 'none' : 'checking'} role="status">
          {stateLabel}
        </span>{' '}
        <span class="status" data-state={granted ? 'granted' : granted === false ? 'denied' : 'pending'} data-provider-permission={granted ? 'granted' : granted === false ? 'denied' : 'checking'}>
          صلاحية <Ltr className="mono">{host}</Ltr>: {granted ? 'ممنوحة' : granted === false ? 'غير ممنوحة' : 'جارٍ التحقق…'}
        </span>
      </p>
      <p class="notice" data-verify-request="">
        عند الحفظ والتحقق يُرسَل {adapter?.verifyRequest ?? 'طلب تحقق واحد'} وإضافة المفتاح لا تبدأ أي تحليل: لا يُرسل شيء من صفحاتك إلا بعد موافقتك على كل طلب في
        قسمه.
      </p>

      <form class="key-form" onSubmit={save} data-key-form="">
        <fieldset>
          <legend>أين يُحفظ</legend>
          <label class="choice">
            <input type="radio" name="mj-key-place" value="session" checked={place === 'session'} disabled={!store.sessionAvailable} onChange={() => setPlace('session')} />
            <span class="label">
              <strong>ذاكرة الجلسة (الافتراضي)</strong>
              <br />
              <span class="muted small">يُمحى عند إغلاق المتصفح، ولا يُكتب على القرص.</span>
            </span>
          </label>
          <label class="choice">
            <input type="radio" name="mj-key-place" value="disk" checked={place === 'disk'} disabled={!store.diskAvailable} onChange={() => setPlace('disk')} />
            <span class="label">
              <strong>القرص في هذا المتصفح</strong>
              <br />
              <span class="muted small" data-disk-note={store.diskAvailable ? 'available' : 'blocked'}>
                {diskNote}
              </span>
            </span>
          </label>
        </fieldset>
        <label for="mj-key-input">
          المفتاح (يبدأ بـ<Ltr className="mono">{adapter?.keyPrefix ?? 'sk-ant-'}</Ltr>)
        </label>
        <input ref={input} id="mj-key-input" class="key-input" type="password" autocomplete="off" spellcheck={false} dir="ltr" />
        <div class="row">
          <button type="submit" class="btn btn-primary" data-action="key-save" disabled={busy || !store.sessionAvailable}>
            احفظ وتحقق
          </button>
          <button type="button" class="btn" data-action="key-check" disabled={busy || !info} onClick={recheck}>
            تحقق من المفتاح
          </button>
          <button type="button" class="btn btn-danger" data-action="key-clear" disabled={busy} aria-expanded={confirming} onClick={() => setConfirming(true)}>
            امسح المفتاح
          </button>
          {granted && (
            <button type="button" class="btn" data-action="key-revoke" disabled={busy} onClick={revoke}>
              اسحب صلاحية {host}
            </button>
          )}
        </div>
      </form>

      {confirming && (
        <div class="conn-confirm" role="alertdialog" aria-labelledby="mj-key-confirm-title" data-key-confirm="">
          <strong id="mj-key-confirm-title">امسح مفتاح المزوّد؟</strong>
          <span>يُمسح من ذاكرة الجلسة ومن القرص فورًا ولا يُستعاد؛ تلصقه من جديد إن احتجته.</span>
          <span>يتعطل وحده:</span>
          <ul data-disables="">
            {dependents.map((f) => (
              <li key={f.id}>{f.title}</li>
            ))}
          </ul>
          <span data-keeps="">يبقى كما هو: كل الأقسام وأدلتها، وحزمة السياق، ورمز GitHub.</span>
          <div class="row">
            <button type="button" class="btn btn-danger" data-action="key-clear-confirm" disabled={busy} onClick={clear}>
              امسح المفتاح
            </button>
            <button type="button" class="btn" data-action="key-clear-cancel" onClick={() => setConfirming(false)}>
              إلغاء
            </button>
          </div>
        </div>
      )}

      {message && (
        <p class="notice" data-tone={message.tone === 'info' ? undefined : message.tone} role="alert" data-key-message="">
          {message.text}
        </p>
      )}
      {shown && (
        <p class="notice" data-tone={TONE_ATTR[HEALTH_TONE[shown.health]]} role="status" data-key-check={shown.health === 'healthy' ? 'ok' : 'fail'} data-health={shown.health}>
          {healthText('provider-key', shown, { now: now() })}
        </p>
      )}
    </section>
  );
}

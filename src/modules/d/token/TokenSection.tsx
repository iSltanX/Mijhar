// قسم «رمز GitHub للقراءة» في صفحة الإعدادات وحدها (T-5.5، AC-5.5 و AC-D7). لا يظهر في الدرج ولا في اللوحة: تمرّره صفحة الإعدادات
// إلى SettingsTab، فلا تصل شيفرته إلى سكربت المحتوى أصلًا.
//  - الحقل غير متحكَّم به: الرمز لا يدخل حالة المكوّن، ويُقرأ من الحقل عند الحفظ ثم يُفرَّغ الحقل. ولا يُعرض الرمز بعد الحفظ ولا جزء منه.
//  - الحفظ يكتب في المخزن مباشرة (صفحة إضافة موثوقة)، والخلفية تقرؤه لطلباتها؛ فلا يعبر الرمز أي رسالة. والتحقق طلب /rate_limit عبر
//    منفذ الخلفية نفسه (مسار وحده، والرد بلا الرمز).
//  - قائمة الصلاحيات الدنيا ظاهرة عند الإدخال، كلها Read-only، ولا يُذكر غيرها.
//  - «كيف تحصل على الرمز؟» يفتح دليله داخل صفحة الإعدادات (#guide/github-token، AD-29).
import { useEffect, useRef, useState } from 'preact/hooks';
import type { PublicApiPort, PublicApiResult } from '../../../core/api';
import { Ltr } from '../../../shared/ui';
import { useStyles } from '../../../shared/ui/useStyles';
import { READ_ACCESS_LEVEL, READ_PERMISSIONS, TOKEN_FORMAT_MESSAGES, TOKEN_LIMITS, checkTokenFormat } from './format';
import type { TokenInfo, TokenPlace, TokenStore } from './store';

export interface TokenSectionProps {
  readonly store: Pick<TokenStore, 'info' | 'save' | 'clear' | 'sessionAvailable' | 'diskAvailable'>;
  /** منفذ الخلفية: للتحقق من الرمز وحالة الوصول. */
  readonly port: PublicApiPort;
  readonly target: 'chromium' | 'firefox';
  /** للاختبار. */
  readonly now?: () => number;
}

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

type Check =
  | { readonly kind: 'ok'; readonly limit: number | null; readonly remaining: number | null; readonly expiresAt: number | null }
  | { readonly kind: 'fail'; readonly tone: 'danger' | 'info'; readonly text: string };

const DAY = 86_400_000;

export const utcText = (ms: number): string => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

const PLACE_TEXT: Readonly<Record<TokenPlace, string>> = { session: 'ذاكرة الجلسة', disk: 'القرص في هذا المتصفح' };

function checkFrom(result: PublicApiResult<unknown>, expiresAt: number | null): Check {
  if (result.ok) {
    if (!result.authenticated) return { kind: 'fail', tone: 'info', text: 'لم تجد الخلفية رمزًا محفوظًا، فأُرسل الطلب بلا رمز.' };
    return { kind: 'ok', limit: result.rate?.limit ?? null, remaining: result.rate?.remaining ?? null, expiresAt };
  }
  switch (result.failure) {
    case 'permission':
      return { kind: 'fail', tone: 'info', text: 'الرمز محفوظ، ولن يُستعمل قبل أن تمنح صلاحية api.github.com في القسم أعلاه.' };
    case 'unauthorized':
      return { kind: 'fail', tone: 'danger', text: 'رفض GitHub الرمز (401): غير صالح أو منتهٍ أو ملغى. امسحه واحفظ رمزًا صالحًا؛ ولن تُرسل الطلبات بلا رمز ما دام محفوظًا.' };
    default:
      return { kind: 'fail', tone: 'danger', text: `تعذّر التحقق: ${result.message}` };
  }
}

export function TokenSection({ store, port, target, now = () => Date.now() }: TokenSectionProps) {
  const ref = useRef<HTMLElement>(null);
  useStyles(ref, 'd-token', TOKEN_CSS);
  const input = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<TokenInfo | null | undefined>(undefined);
  const [place, setPlace] = useState<TokenPlace>('session');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'danger' | 'info'; text: string } | null>(null);
  const [check, setCheck] = useState<Check | null>(null);

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

  const verify = async (): Promise<void> => {
    const result = await port.get('/rate_limit');
    const status = await port.status().catch(() => null);
    setCheck(checkFrom(result, status?.tokenExpiresAt ?? null));
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
      .finally(() => setBusy(false));
  };

  const recheck = () => {
    setBusy(true);
    setMessage(null);
    verify()
      .catch(() => setCheck({ kind: 'fail', tone: 'danger', text: 'تعذّر الوصول إلى خلفية الإضافة.' }))
      .finally(() => setBusy(false));
  };

  const diskNote = store.diskAvailable
    ? 'يبقى بعد إغلاق المتصفح. يُحفظ على قرص هذا الجهاز غير مشفَّر، ويستطيع قراءته من يصل إلى ملف تعريف المتصفح؛ لا تختره على جهاز مشترك.'
    : target === 'firefox'
      ? 'غير متاح في Firefox: لا يتيح Firefox ضبط مستوى وصول التخزين للسياقات الموثوقة (setAccessLevel)، وهو شرط الحفظ الدائم في مِجهَر؛ فيبقى الرمز في ذاكرة الجلسة وحدها.'
      : 'غير متاح في هذا المتصفح.';
  const stateLabel = info === undefined ? 'جارٍ القراءة…' : info ? `محفوظ في ${PLACE_TEXT[info.place]} منذ ${utcText(info.savedAt)}` : 'لا رمز محفوظ';

  return (
    <section ref={ref} class="section token" aria-labelledby="mj-token-title" data-section="token">
      <h2 id="mj-token-title">رمز GitHub للقراءة (اختياري)</h2>
      <p class="muted">
        برمز وصول للقراءة فقط تقرأ مِجهَر ما يحتاج مصادقة: طلبات الدمج في مستودعاتك الخاصة وفحوص Actions فيها. تُرسل الطلبات به من خلفية الإضافة
        وحدها إلى <Ltr className="mono">api.github.com</Ltr>، ولا يصل إلى صفحات GitHub ولا يظهر بعد حفظه. ودونه تعمل الوحدة (د) كاملة على الصفحة
        وAPI العامة.
      </p>
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
          <button type="button" class="btn btn-danger" data-action="token-clear" disabled={busy} onClick={clear}>
            امسح الرمز
          </button>
        </div>
      </form>

      {message && (
        <p class="notice" data-tone={message.tone === 'danger' ? 'danger' : undefined} role="alert" data-token-message="">
          {message.text}
        </p>
      )}
      {check && (
        <p class="notice" data-tone={check.kind === 'fail' && check.tone === 'danger' ? 'danger' : undefined} role="status" data-token-check={check.kind}>
          {check.kind === 'ok' ? (
            <>
              قبِل GitHub الرمز
              {check.limit !== null && (
                <>
                  : حد الطلبات الموثَّقة <Ltr>{String(check.limit)}</Ltr> في الساعة
                  {check.remaining !== null && (
                    <>
                      {' '}
                      (المتبقي <Ltr>{String(check.remaining)}</Ltr>)
                    </>
                  )}
                </>
              )}
              .
              {check.expiresAt !== null && (
                <>
                  {' '}
                  ينتهي في <Ltr>{utcText(check.expiresAt)}</Ltr>
                  {check.expiresAt - now() < 7 * DAY ? ' — قريبًا؛ جدّده من GitHub قبل انتهائه.' : '.'}
                </>
              )}
            </>
          ) : (
            check.text
          )}
        </p>
      )}
    </section>
  );
}

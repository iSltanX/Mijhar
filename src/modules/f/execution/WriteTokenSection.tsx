// جسم بطاقة «صلاحية الكتابة في GitHub» في سجل الاتصالات (T-11.8، AD-19، AC-F7 (١)). في صفحة الإعدادات وحدها: تمرّره صفحة الإعدادات إلى سجل
// الاتصالات، فلا تصل شيفرته سكربت المحتوى ولا اللوحة.
//  - رمز الكتابة سرّ منفصل عن رمز القراءة بمفتاحيه (keys.ts)، يُحفظ في ذاكرة الجلسة وحدها (يُمحى بإغلاق المتصفح ولا يُكتب على القرص): صلاحية كتابة
//    لا تبقى قائمة بعد الجلسة. ويُرفض إن كان هو رمز القراءة المحفوظ نفسه.
//  - الحقل غير متحكَّم به: الرمز لا يدخل حالة المكوّن، ويُقرأ من الحقل عند الحفظ ثم يُفرَّغ، ولا يُعرض بعد الحفظ ولا جزء منه.
//  - لا طلب تحقق: أي طلب قراءة برمز الكتابة يخالف فصل الصلاحيات، فيبقى «غير متحقق منه» حتى أول تنفيذ، وتُسجَّل صحته من استجابات الكتابة نفسها.
//  - الحفظ موافقة على صلاحية الكتابة: بنقرة مستخدم موثوقة وحدها (AD-27)، وصلاحية api.github.com الاختيارية تُطلب في النقرة نفسها قبل أي await.
import type { ComponentChild } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { dependentsOf } from '../../../core/connections/features';
import type { ConnectionStatus } from '../../../core/connections/health';
import type { SecretInfo, SecretStore } from '../../../core/connections/secrets';
import { healthText, utcText } from '../../../core/connections/text';
import { CONNECTIONS_CSS } from '../../../core/connections/ui/styles';
import type { ApiGithubPermission } from '../../../core/ui-host/permissions';
import { checkTokenFormat, TOKEN_FORMAT_MESSAGES } from '../../d/token/format';
import { Ltr } from '../../../shared/ui';
import { isTrustedActivation } from '../../../shared/ui/user-activation';
import { useOnVisible } from '../../../shared/ui/useOnVisible';
import { useStyles } from '../../../shared/ui/useStyles';

export const WRITE_TOKEN_NEW_URL = 'https://github.com/settings/personal-access-tokens/new';

/** قالب إنشاء رمز الكتابة: صلاحيتا الكتابة وحدهما ومدة قصيرة؛ والمستودع يختاره المستخدم في GitHub (Only select repositories). */
export function writeTokenTemplateUrl(): string {
  const url = new URL(WRITE_TOKEN_NEW_URL);
  url.searchParams.set('name', 'Mijhar write (one repo)');
  url.searchParams.set('description', 'Mijhar: create one branch, write one text file and open one pull request, only after you approve the scope.');
  url.searchParams.set('expires_in', '7');
  url.searchParams.set('contents', 'write');
  url.searchParams.set('pull_requests', 'write');
  return url.toString();
}

export interface WriteTokenSectionProps {
  readonly store: Pick<SecretStore, 'info' | 'save' | 'clear' | 'sessionAvailable'>;
  /** رمز القراءة المحفوظ، لرفض حفظ الرمز نفسه سرًّا للكتابة. */
  readonly readToken: () => Promise<string | null>;
  readonly permission: ApiGithubPermission | null;
  readonly header?: ComponentChild;
  readonly status?: ConnectionStatus | null;
  readonly onChange?: () => void;
  readonly now?: () => number;
}

const WRITE_CSS = `
.mj-root .write-token .key-input {
  width: 100%; max-width: 36rem; min-height: 32px; padding: 0 var(--mijhar-space-8); font-family: var(--mijhar-font-mono); font-size: 12px;
  color: var(--mijhar-text-primary); background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6);
  direction: ltr; text-align: left;
}
.mj-root .write-token .key-input:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.mj-root .write-token ul { margin: 0; padding-inline-start: var(--mijhar-space-16); }
`;

type Message = { readonly tone: 'danger' | 'info' | 'success'; readonly text: string };

export function WriteTokenSection({ store, readToken, permission, header, status, onChange, now = () => Date.now() }: WriteTokenSectionProps) {
  const ref = useRef<HTMLElement>(null);
  useStyles(ref, 'f-execution-write', WRITE_CSS);
  useStyles(ref, 'core-connections', CONNECTIONS_CSS);
  const input = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<SecretInfo | null | undefined>(undefined);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let alive = true;
    store.info().then(
      (value) => alive && setInfo(value),
      () => alive && setInfo(null),
    );
    if (!permission) {
      setGranted(false);
      return () => {
        alive = false;
      };
    }
    permission.has().then(
      (value) => alive && setGranted(value),
      () => alive && setGranted(false),
    );
    const unsubscribe = permission.subscribe((value) => setGranted(value));
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [store, permission]);

  // الرمز يُحفظ أو يُمسح من صفحة إعدادات أخرى: يُقرأ من جديد حين تعود هذه الصفحة إلى الواجهة (PI-1)، ويُغلق تأكيد مسح رمز لم يعد هو المحفوظ.
  useOnVisible(() => {
    store.info().then(setInfo, () => setInfo(null));
  });
  useEffect(() => setConfirming(false), [info?.savedAt]);

  // موافقة على صلاحية الكتابة: نقرة موثوقة وحدها، وطلب الصلاحية الاختيارية أول ما فيها قبل أي await (VER-05).
  const save = (event: Event) => {
    if (!isTrustedActivation(event)) return;
    const field = input.current;
    if (!field || busy) return;
    const parsed = checkTokenFormat(field.value);
    if (!parsed.ok) {
      setMessage({ tone: 'danger', text: TOKEN_FORMAT_MESSAGES[parsed.reason] });
      return;
    }
    const asked = granted || !permission ? Promise.resolve(Boolean(granted)) : permission.request().catch(() => false);
    setBusy(true);
    setMessage(null);
    asked
      .then(async (ok) => {
        setGranted(ok);
        if ((await readToken().catch(() => null)) === parsed.token) {
          setMessage({ tone: 'danger', text: 'هذا رمز القراءة المحفوظ نفسه؛ صلاحية الكتابة سرّ منفصل. أنشئ رمزًا آخر للكتابة وحدها ولم يُحفظ شيء.' });
          return;
        }
        const saved = await store.save(parsed.token, 'session');
        field.value = '';
        setInfo(saved);
        setMessage({
          tone: ok ? 'success' : 'info',
          text: ok
            ? 'حُفظ رمز الكتابة في ذاكرة الجلسة. لم يُرسل إلى GitHub شيء: يُستعمل عند «نفّذ» وحده بعد موافقتك على النطاق.'
            : 'حُفظ رمز الكتابة في ذاكرة الجلسة، ولم تُمنح صلاحية api.github.com؛ لا تنفيذ قبلها ولم يُرسل شيء.',
        });
      })
      .catch((error: unknown) => setMessage({ tone: 'danger', text: `لم يُحفظ الرمز: ${error instanceof Error ? error.message : 'خطأ غير معروف'}` }))
      .finally(() => {
        setBusy(false);
        onChange?.();
      });
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
        setMessage({ tone: 'info', text: 'مُسح رمز الكتابة. تتوقف خطوة التنفيذ وحدها، وتبقى المعاينة و«نسخ الفرق» وكل قراءة وتحليل.' });
      })
      .catch((error: unknown) => setMessage({ tone: 'danger', text: `تعذّر مسح الرمز كاملًا: ${error instanceof Error ? error.message : 'خطأ غير معروف'}` }))
      .finally(() => {
        setBusy(false);
        onChange?.();
      });
  };

  const stateLabel = info === undefined ? 'جارٍ القراءة…' : info ? `محفوظ في ذاكرة الجلسة منذ ${utcText(info.savedAt)}` : 'لا رمز كتابة محفوظ';
  const shown = status && status.health !== 'none' ? status : null;

  return (
    <section ref={ref} class="section write-token" aria-labelledby="mj-conn-github-write-title" data-section="github-write">
      {header}
      <p>
        <span class="status" data-state={info ? 'granted' : info === null ? 'denied' : 'pending'} data-write-state={info ? info.place : info === null ? 'none' : 'checking'} role="status">
          {stateLabel}
        </span>{' '}
        <span class="status" data-state={granted ? 'granted' : granted === false ? 'denied' : 'pending'} data-write-permission={granted ? 'granted' : granted === false ? 'denied' : 'checking'}>
          صلاحية <Ltr className="mono">api.github.com</Ltr>: {granted ? 'ممنوحة' : granted === false ? 'غير ممنوحة' : 'جارٍ التحقق…'}
        </span>
      </p>
      <div class="notice" data-write-separation="">
        <p>
          <strong>رمز منفصل عن رمز القراءة.</strong> يُستعمل في خطوة التنفيذ من «تجهيز تعديل» وحدها، ولا يحمله أي طلب قراءة أو تحليل، ولا يُتحقق منه بطلب
          قراءة: تُعرف صحته من أول تنفيذ.
        </p>
        <ul>
          <li>
            في GitHub: رمز دقيق الحبيبات، <strong>Only select repositories</strong> بالمستودع الذي تعدّله وحده، وصلاحيتا <Ltr className="mono">Contents</Ltr> و
            <Ltr className="mono">Pull requests</Ltr> «Read and write» لا غير، ومدة قصيرة.
          </li>
          <li>يُحفظ في ذاكرة الجلسة وحدها: يُمحى بإغلاق المتصفح ولا يُكتب على القرص.</li>
          <li>ما يفعله: إنشاء فرع وكتابة ملف نصي واحد وفتح طلب دمج بعد موافقتك على النطاق؛ ولا دمج ولا إغلاق ولا حذف.</li>
        </ul>
        <p>
          <a href={writeTokenTemplateUrl()} target="_blank" rel="noopener noreferrer" data-action="write-token-template">
            أنشئ رمز الكتابة في GitHub
          </a>{' '}
          <span class="small">(يُفتح نموذج GitHub بالصلاحيتين معبّأتين؛ والإنشاء بضغطك أنت.)</span>
        </p>
      </div>
      <label for="mj-write-input">رمز الكتابة (يبدأ بـ<Ltr className="mono">github_pat_</Ltr>)</label>
      <input ref={input} id="mj-write-input" class="key-input" type="password" autocomplete="off" spellcheck={false} dir="ltr" />
      <div class="row">
        <button type="button" class="btn btn-primary" data-consent="write-token-save" disabled={busy || !store.sessionAvailable} onClick={(event) => save(event)}>
          احفظ صلاحية الكتابة لهذه الجلسة
        </button>
        <button type="button" class="btn btn-danger" data-action="write-token-clear" disabled={busy || !info} aria-expanded={confirming} onClick={() => setConfirming(true)}>
          امسح رمز الكتابة
        </button>
      </div>
      {confirming && (
        <div class="conn-confirm" role="alertdialog" aria-labelledby="mj-write-confirm-title" data-write-confirm="">
          <strong id="mj-write-confirm-title">امسح رمز الكتابة؟</strong>
          <span>يتعطل وحده:</span>
          <ul data-disables="">
            {dependentsOf('github-write').map((f) => (
              <li key={f.id}>{f.title}</li>
            ))}
          </ul>
          <span>يبقى كما هو: معاينة الفرق و«نسخ الفرق» ورمز القراءة وكل ما سواه.</span>
          <div class="row">
            <button type="button" class="btn btn-danger" data-action="write-token-clear-confirm" disabled={busy} onClick={clear}>
              امسح رمز الكتابة
            </button>
            <button type="button" class="btn" data-action="write-token-clear-cancel" onClick={() => setConfirming(false)}>
              إلغاء
            </button>
          </div>
        </div>
      )}
      {message && (
        <p class="notice" data-tone={message.tone === 'info' ? undefined : message.tone} role="alert" data-write-message="">
          {message.text}
        </p>
      )}
      {shown && (
        <p class="notice" role="status" data-health={shown.health} data-write-health="">
          {shown.health === 'unverified' ? 'محفوظ ولم يُستعمل بعد: لا يُتحقق منه بطلب قراءة، وتُعرف صحته من أول تنفيذ.' : healthText('github-write', shown, { now: now() })}
        </p>
      )}
    </section>
  );
}

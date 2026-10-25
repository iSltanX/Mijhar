// «الإبلاغ عن مشكلة» (الإطار O-20، AC-10.3، DEC-12 ي-1، MJ26): صفحة داخل الإعدادات (#report). يكتب المستخدم ما حدث ويختار نوعه، ويرى قبل الإرسال كل
// ما سيُرسل (الجسم المبني نفسه صفًّا صفًّا ونصه كاملًا)، ثم يرسله بنفسه بنقرة موثوقة؛ وأول إرسال يطلب صلاحية مضيف خادم البلاغات (وفي Firefox موافقة
// «البيانات التقنية والتفاعل») في النقرة نفسها قبل أي await. ولا طلب قبل «أرسل البلاغ»، ولا إعادة تلقائية، ومحاولة واحدة في كل مرة؛ والبديل «انسخ
// البلاغ» يعمل بلا شبكة. ولا حقل لمحتوى صفحة أو رابطها أو مستودع أو رمز أو مفتاح أو معرّف (payload.ts).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { SettingsStore } from '../../core/settings';
import { REPORTS_ORIGIN, retryable } from '../../core/report/client';
import { collectDiagnostics } from '../../core/report/diagnostics';
import { failureText } from '../../core/report/messages';
import { LIMITS, REPORT_KINDS, buildPayload, formError, reviewRows, serialise } from '../../core/report/payload';
import type { Diagnostics, ReportKind, ReportPayload } from '../../core/report/payload';
import { reportPermissions } from '../../core/report/port';
import type { ReportResponse } from '../../core/report/port';
import type { PermissionsApi } from '../../core/ui-host/browser-api';
import { SURFACE_KEY, UNITS } from '../../core/ui-host/units';
import { Ltr } from '../../shared/ui';
import { Icon } from '../../shared/ui/icons';
import { secretKinds } from '../../modules/e/context';
import { isTrustedActivation } from '../../shared/ui/user-activation';
import { useStyles } from '../../shared/ui/useStyles';

export const REPORT_HASH = 'report';

const CSS = `
.mj-root .report-page { display: flex; flex-direction: column; gap: var(--mijhar-space-16); max-width: 720px; }
.mj-root .report-card { display: flex; flex-direction: column; gap: var(--mijhar-space-12); padding: var(--mijhar-space-16); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); background: var(--mijhar-bg-surface); }
.mj-root .report-kinds { display: inline-flex; gap: 2px; margin: 0; padding: 2px; border: 0; border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-muted); align-self: flex-start; }
.mj-root .report-kinds label { position: relative; padding: 2px var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); cursor: pointer; font-size: 13px; line-height: 24px; color: var(--mijhar-text-secondary); }
.mj-root .report-kinds input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
.mj-root .report-kinds label[data-checked="true"] { background: var(--mijhar-bg-surface); color: var(--mijhar-text-primary); font-weight: 700; box-shadow: 0 0 0 1px var(--mijhar-border-default); }
.mj-root .report-kinds label:focus-within { box-shadow: var(--mijhar-focus-ring); }
.mj-root .report-text { width: 100%; min-height: 120px; resize: vertical; padding: var(--mijhar-space-8) var(--mijhar-space-12); border: 1px solid var(--mijhar-border-strong); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-surface); color: var(--mijhar-text-primary); font: inherit; }
.mj-root .report-text:focus-visible { outline: none; border-color: var(--mijhar-border-focus); box-shadow: var(--mijhar-focus-ring); }
.mj-root .report-count { align-self: flex-end; }
.mj-root .report-rows { margin: 0; border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); overflow: hidden; }
.mj-root .report-rows > div { display: flex; justify-content: space-between; gap: var(--mijhar-space-12); padding: var(--mijhar-space-6) var(--mijhar-space-12); border-bottom: 1px solid var(--mijhar-border-muted); }
.mj-root .report-rows > div:last-child { border-bottom: none; }
.mj-root .report-rows dt { color: var(--mijhar-text-secondary); }
.mj-root .report-rows dd { margin: 0; min-width: 0; overflow-wrap: anywhere; text-align: end; }
.mj-root .report-json { margin: 0; max-height: 280px; overflow: auto; padding: var(--mijhar-space-8); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-subtle); white-space: pre-wrap; overflow-wrap: anywhere; }
.mj-root .report-actions { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-8); }
.mj-root .notice[data-tone="success"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.mj-root .notice[data-tone="warning"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
`;

const KIND_LABEL: Readonly<Record<ReportKind, string>> = { bug: 'خلل', suggestion: 'اقتراح', other: 'أخرى' };
const count = new Intl.NumberFormat('ar-u-nu-latn');

type Outcome = { readonly state: 'sending' } | { readonly state: 'sent'; readonly id: number } | { readonly state: 'failed'; readonly text: string; readonly retry: boolean } | { readonly state: 'copied' | 'copy-failed' };

export interface ReportPageProps {
  readonly settings: SettingsStore;
  readonly permissions: PermissionsApi | undefined;
  readonly target: 'chromium' | 'firefox';
  readonly port: { send(payload: ReportPayload, key: string): Promise<ReportResponse> };
  readonly onBack: () => void;
  /** للاختبار. */
  readonly diagnostics?: () => Promise<Diagnostics>;
  readonly copy?: (text: string) => Promise<void>;
  readonly newKey?: () => string;
}

export function ReportPage({ settings, permissions, target, port, onBack, diagnostics, copy, newKey = () => crypto.randomUUID() }: ReportPageProps) {
  const ref = useRef<HTMLDivElement>(null);
  useStyles(ref, 'options-report', CSS);
  const [kind, setKind] = useState<ReportKind>('bug');
  const [text, setText] = useState('');
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const busy = outcome?.state === 'sending';

  useEffect(() => {
    const disabledUnits = UNITS.filter((u) => !settings.isModuleEnabled(u.id)).map((u) => u.id);
    const surface = String(settings.get(SURFACE_KEY) ?? 'native');
    (diagnostics ?? (() => collectDiagnostics({ surface, disabledUnits })))().then(setDiag, () => setDiag(null));
  }, [settings, diagnostics]);

  const error = formError({ kind, description: text });
  // صيغ الأسرار المعروفة في النص (فاحص المنقّح نفسه): لا يُرسل البلاغ ولا يُنسخ وفيه ما يشبه رمزًا أو مفتاحًا (MJ26، مراجعة ذاتية).
  const secrets = useMemo(() => secretKinds(text), [text]);
  const blocked = secrets.length > 0;
  const payload = useMemo(() => (diag ? buildPayload({ kind, description: text.trim() || '…' }, diag) : null), [diag, kind, text]);
  const body = payload ? serialise(payload) : '';
  // مفتاح عدم التكرار لهذا الجسم بعينه: يُعاد في كل محاولة له، وجسم مختلف يأخذ مفتاحًا جديدًا (فلا يجيب الخادم برقم بلاغ سابق عن نص معدَّل).
  const key = useMemo(() => newKey(), [body]);

  const send = (event: Event) => {
    if (!isTrustedActivation(event) || busy || error || blocked || !payload || !permissions) return;
    // الصلاحية أول ما في النقرة قبل أي await (المتصفح يرفض الطلب خارج فعل المستخدم).
    const asked = permissions.request(reportPermissions(target)).catch(() => false);
    const sending = payload;
    setOutcome({ state: 'sending' });
    asked
      .then((granted) => (granted ? port.send(sending, key) : ({ ok: false, failure: 'permission', status: null } as const)))
      .then((r) => {
        if (r.ok) {
          setOutcome({ state: 'sent', id: r.id });
          setText('');
        } else setOutcome({ state: 'failed', text: failureText(r.failure, 'retryAfterSeconds' in r ? r.retryAfterSeconds : undefined), retry: r.failure !== 'refused' && retryable(r.failure) });
      });
  };

  const copyReport = () => {
    if (!payload || error || blocked) return;
    (copy ?? ((t: string) => navigator.clipboard.writeText(t)))(body).then(
      () => setOutcome({ state: 'copied' }),
      () => setOutcome({ state: 'copy-failed' }),
    );
  };

  return (
    <div ref={ref} class="report-page" data-report-page="">
      <p>
        <a href="#about" class="btn btn-ghost" data-action="report-back" onClick={(e) => (e.preventDefault(), onBack())}>
          <Icon name="arrow-right" />
          حول مِجهَر
        </a>
      </p>
      <h2 id="mj-report-title">الإبلاغ عن مشكلة</h2>
      <p class="muted">
        صف ما حدث. يصل البلاغ إلى مطوّر مِجهَر في قناة بلاغات خاصة لا تُنشر، ولا يُرسل شيء قبل أن تراجعه وتضغط «أرسل البلاغ» بنفسك.
      </p>

      <section class="report-card" aria-labelledby="mj-report-form-title">
        <h3 id="mj-report-form-title">البلاغ</h3>
        <fieldset class="report-kinds">
          <legend class="visually-hidden">نوع البلاغ</legend>
          {REPORT_KINDS.map((k) => (
            <label key={k} data-checked={kind === k ? 'true' : 'false'}>
              <input type="radio" name="mj-report-kind" value={k} checked={kind === k} disabled={busy} data-report-kind={k} onChange={() => setKind(k)} />
              {KIND_LABEL[k]}
            </label>
          ))}
        </fieldset>
        <label for="mj-report-text">
          <strong>ماذا حدث؟</strong>
        </label>
        <textarea id="mj-report-text" class="report-text" maxLength={LIMITS.description} value={text} disabled={busy} aria-describedby="mj-report-count mj-report-warn" data-report-text="" onInput={(e) => setText((e.currentTarget as HTMLTextAreaElement).value)} />
        <span id="mj-report-count" class="muted small report-count" data-report-count={text.trim().length}>
          <Ltr>{`${count.format(text.trim().length)} / ${count.format(LIMITS.description)}`}</Ltr>
        </span>
        <p id="mj-report-warn" class="notice" data-tone="warning">
          لا تلصق رمزًا أو مفتاحًا أو محتوى من مستودع خاص. يُرسل نصك كما كتبته.
        </p>
        {blocked && (
          <p class="notice" data-tone="danger" role="alert" data-report-secret="">
            في نصك ما يشبه {secrets.join('، ')}. احذفه قبل الإرسال أو النسخ؛ لا يحتاج البلاغ رمزًا ولا مفتاحًا.
          </p>
        )}
      </section>

      <section class="report-card" aria-labelledby="mj-report-sent-title" data-report-review="">
        <h3 id="mj-report-sent-title">ما يُرفق تلقائيًا (تراه كله قبل الإرسال)</h3>
        {payload ? (
          <dl class="report-rows">
            {reviewRows(payload).map((row) => (
              <div key={row.field} data-report-field={row.field}>
                <dt>{row.label}</dt>
                <dd>
                  <Ltr className="mono">{row.value}</Ltr>
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p class="muted">يُقرأ إصدار المتصفح والنظام…</p>
        )}
        <p class="muted small">لا يُرفق رابط الصفحة ولا محتواها، ولا اسم المستودع، ولا أي رمز أو مفتاح أو ملاحظة، ولا معرّف لك أو لجهازك. رقم البلاغ هو مرجعك الوحيد.</p>
        <details data-report-json="">
          <summary>نص البلاغ كاملًا كما سيُرسل</summary>
          <pre class="report-json mono" dir="ltr">{body}</pre>
        </details>
        <p class="notice">
          <Icon name="info" /> عند أول إرسال يطلب المتصفح إذنك بالاتصال بخادم البلاغات وحده (<Ltr className="mono">{new URL(REPORTS_ORIGIN).host}</Ltr>)
          {target === 'firefox' ? '، ومعه موافقة «البيانات التقنية والتفاعل» لأن البلاغ يحمل إصدار المتصفح والنظام' : ''}، وتسحبه متى شئت من صفحة إضافات
          المتصفح.
        </p>
      </section>

      <div class="report-actions">
        <button type="button" class="btn btn-primary" data-action="report-send" disabled={busy || Boolean(error) || blocked || !payload} onClick={send}>
          {busy ? 'يُرسل…' : 'أرسل البلاغ'}
        </button>
        <button type="button" class="btn" data-action="report-copy" disabled={busy || Boolean(error) || blocked || !payload} onClick={copyReport}>
          انسخ البلاغ بدل إرساله
        </button>
      </div>
      {error === 'empty' && text.length > 0 && <p class="muted small">اكتب وصفًا قبل الإرسال.</p>}

      {outcome?.state === 'sent' && (
        <p class="notice" data-tone="success" role="status" data-report-result="sent">
          وصل بلاغك برقم <Ltr className="mono">#{outcome.id}</Ltr>. احتفظ بالرقم إن أردت المتابعة؛ لا يُرسل إليك شيء ولا نطلب بريدًا.
        </p>
      )}
      {outcome?.state === 'failed' && (
        <p class="notice" data-tone="danger" role="alert" data-report-result="failed">
          {outcome.text} {outcome.retry ? 'لم يُفقد شيء: أعد المحاولة بالزر نفسه، أو انسخ البلاغ وأرسله بطريقتك.' : ''}
        </p>
      )}
      {outcome?.state === 'copied' && (
        <p class="notice" role="status" data-report-result="copied">
          نُسخ البلاغ نصًّا. لم يُرسل شيء.
        </p>
      )}
      {outcome?.state === 'copy-failed' && (
        <p class="notice" data-tone="danger" role="alert" data-report-result="copy-failed">
          تعذّر النسخ. افتح «نص البلاغ كاملًا» وانسخه بيدك.
        </p>
      )}
    </div>
  );
}

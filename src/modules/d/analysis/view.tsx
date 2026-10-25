// عرض التحليل داخل قسمه (T-11.7، AC-D9، الإطارات P-43 إلى P-49، مكوّن Analysis result): بوابة الربط بلا مفتاح، والخيار، والموافقة، وجارٍ،
// والنتيجة، والتعذّر. النتيجة كلها «احتمال يحتاج تحققًا» بوسم نصّي لا لون وحده؛ والمثبت من الصفحة هو الاقتباس الذي ورد حرفيًا في محتوى الصفحة المرسل
// (لا في عناوين مِجهَر وتسمياته داخل الطلب، F-04)؛ وما نقص من النموذج ومن الطبقة قبل الإرسال؛ والمودل والمزوّد ووقت الطلب. الرد نصٌّ يُعرض فقط
// (Preact يهرب كل نص)، ولا يُنفَّذ منه شيء. لا تكلفة (AD-31).
import { featureById } from '../../../core/connections/features';
import type { Health } from '../../../core/connections/health';
import { ConnectionGate } from '../../../core/connections/ui/ConnectionGate';
import { POSSIBILITY_TAG } from '../log-parser/parse';
import { ConsentSheet } from '../../e/provider';
import type { AnalysisState } from './controller';
import type { AnalysisSectionDef } from './sections';

export interface AnalysisBlockProps {
  readonly def: AnalysisSectionDef;
  readonly state: AnalysisState;
  readonly health: Health;
  readonly onOpen: (event: Event) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly onStop: () => void;
  readonly onHide: () => void;
  readonly onSettings: () => void;
}

const clock = (ms: number): string => new Date(ms).toLocaleTimeString('en-GB', { hour12: false });
const count = (n: number): string => n.toLocaleString('en-US');
const KEY_FAILURES = new Set(['unauthorized', 'forbidden', 'expired-key', 'no-key', 'permission', 'key-read', 'key-changed', 'not-found', 'model-changed', 'provider-changed', 'incompatible']);

function Tag() {
  return (
    <span class="d-tag" data-tag="possibility">
      {POSSIBILITY_TAG}
    </span>
  );
}

function Head({ def }: { def: AnalysisSectionDef }) {
  return (
    <div class="an-head">
      <h4>{def.heading}</h4>
      <Tag />
    </div>
  );
}

function Result({ def, state, onOpen, onHide }: { def: AnalysisSectionDef; state: Extract<AnalysisState, { kind: 'result' }>; onOpen: (event: Event) => void; onHide: () => void }) {
  const { parsed, outcome, prepared } = state;
  const sourced = parsed.findings.flatMap((f) => f.evidence.filter((e) => e.found));
  return (
    <div class="an-result" data-analysis="result">
      <Head def={def} />
      {parsed.summary && <p data-analysis-summary="">{parsed.summary}</p>}
      {sourced.length > 0 && (
        <div class="an-sourced" data-analysis-sourced="">
          <span class="an-badge" data-tag="sourced">
            مثبت من الصفحة
          </span>
          <span class="an-muted">اقتباسات وردت حرفيًا في محتوى الصفحة الذي أُرسل، لا في عناوين مِجهَر وتسمياته ولا في كلام النموذج:</span>
          <ul>
            {sourced.map((e) => (
              <li key={e.text}>
                <code dir="auto">{e.text}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {parsed.structured ? (
        <>
          {parsed.findings.length > 0 && (
            <section data-analysis-part="findings">
              <h5>{def.findings}</h5>
              <ul class="an-findings">
                {parsed.findings.map((f) => (
                  <li key={f.text}>
                    <span>{f.text}</span>
                    {f.evidence.length > 0 && (
                      <ul class="an-evidence" aria-label="الأدلة التي بُني عليها">
                        {f.evidence.map((e) => (
                          <li key={e.text} data-evidence={e.found ? 'found' : 'not-found'}>
                            <code dir="auto">{e.text}</code> — {e.found ? 'ورد في محتوى الصفحة' : 'لم يرد حرفيًا في محتوى الصفحة المرسل؛ لا يُعدّ دليلًا'}
                          </li>
                        ))}
                      </ul>
                    )}
                    {f.evidence.length === 0 && <span class="an-muted"> (بلا دليل من السياق)</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {parsed.steps.length > 0 && (
            <section data-analysis-part="steps">
              <h5>{def.steps}</h5>
              <ol>
                {parsed.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </section>
          )}
        </>
      ) : (
        <section data-analysis-part="raw">
          <p class="mj-note" data-tone="warning">
            تعذّر فصل الرد إلى بنوده، فيُعرض نصّه كما هو احتمالًا واحدًا يحتاج تحققًا.
          </p>
          <p class="an-raw" dir="auto">
            {parsed.raw ?? 'لا نص في الرد.'}
          </p>
        </section>
      )}
      <section data-analysis-part="missing">
        <h5>المعلومات الناقصة</h5>
        {parsed.missing.length > 0 ? (
          <ul>
            {parsed.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        ) : (
          <p class="an-muted">لم يذكر النموذج نقصًا.</p>
        )}
        {prepared.consent.excluded.length > 0 && (
          <details>
            <summary>وما أعلنته الطبقة قبل الإرسال: {count(prepared.consent.excluded.length)} بندًا</summary>
            <ul>
              {prepared.consent.excluded.map((line) => (
                <li key={line}>{line.replace(/^- /, '').replace(/\*\*/g, '')}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {parsed.cut && (
        <p class="mj-note" data-tone="warning">
          توقف الرد عند حد طوله قبل اكتماله؛ ما بعده لم يصل.
        </p>
      )}
      {parsed.filtered && (
        <p class="mj-note" data-tone="warning" data-analysis-filtered="">
          قطع المزوّد هذا الرد قبل اكتماله (مرشّح المحتوى أو رفض المودل)؛ ما يظهر جزء منه، فلا تعتمد عليه وحده.
        </p>
      )}
      <p class="an-meta" data-analysis-meta="">
        <bdi dir="ltr">{outcome.model}</bdi> · <bdi dir="ltr">{outcome.provider}</bdi> · إلى <bdi dir="ltr">{outcome.host}</bdi> · طُلب{' '}
        <time dateTime={new Date(outcome.requestedAt).toISOString()}>{clock(outcome.requestedAt)}</time>
      </p>
      <div class="an-actions">
        <button type="button" class="mj-link" data-action="analysis-again" onClick={(event) => onOpen(event)}>
          أعد التحليل
        </button>
        <button type="button" class="mj-link" data-action="analysis-hide" onClick={onHide}>
          أخفِ
        </button>
      </div>
      <p class="an-muted" data-analysis-warning="">
        اقتراح نموذج لا يحل محل حقيقة مرصودة، ولا يُنفَّذ منه أمر تلقائيًا.
      </p>
    </div>
  );
}

export function AnalysisBlock({ def, state, health, onOpen, onConfirm, onCancel, onStop, onHide, onSettings }: AnalysisBlockProps) {
  const feature = featureById(def.feature);
  // بلا مفتاح أو بمفتاح منتهٍ: الخيار معلَّلًا بما يحتاجه، ولا شيء من التحليل.
  if (health === 'none' || health === 'expired') {
    return (
      <div class="an-block" data-analysis-section={def.id} data-analysis="gate">
        <ConnectionGate feature={feature} health={{ 'provider-key': health }} onConnect={onSettings} />
      </div>
    );
  }
  return (
    <div class="an-block" data-analysis-section={def.id} data-analysis={state.kind}>
      {state.kind === 'idle' && (
        <div class="an-option">
          <button type="button" class="mj-btn" data-action="analysis-open" onClick={(event) => onOpen(event)}>
            {def.action}
          </button>
          <span class="an-muted">يعرض ما سيُرسل ولأي مزوّد قبل أي إرسال، ولا يُرسل شيء إلا باختيارك «إرسال للتحليل».</span>
          {state.note && <span class="an-muted">{state.note}</span>}
        </div>
      )}
      {state.kind === 'consent' &&
        (state.status === undefined ? (
          <p class="an-muted">جارٍ تجهيز الموافقة…</p>
        ) : (
          <ConsentSheet
            prepared={state.prepared}
            destination={{
              provider: state.status?.provider.title ?? 'المزوّد',
              host: state.status?.provider.host ?? 'المزوّد',
              ...(state.status ? { policy: state.status.provider.policy } : {}),
              model: state.status?.model ?? null,
              permission: Boolean(state.status?.permission),
            }}
            changed={state.changed ?? null}
            blocked={state.status === null ? 'تعذّر الوصول إلى خلفية الإضافة؛ لا يمكن الإرسال الآن.' : state.status.retryAt !== null ? `أعلن المزوّد موعدًا لإعادة المحاولة (${clock(state.status.retryAt)})؛ لا يُرسل شيء قبله.` : null}
            onConfirm={onConfirm}
            onCancel={onCancel}
            onSettings={onSettings}
          />
        ))}
      {state.kind === 'loading' && (
        <div class="an-loading" data-analysis="loading" role="status">
          <Head def={def} />
          <p>
            يحلّل… أُرسل نحو {count(state.prepared.consent.size.chars)} حرف إلى <bdi dir="ltr">{state.status.provider.title}</bdi> (
            <bdi dir="ltr">{state.status.model?.displayName ?? ''}</bdi>).
          </p>
          <button type="button" class="mj-btn" data-action="analysis-stop" onClick={onStop}>
            أوقف الطلب
          </button>
        </div>
      )}
      {state.kind === 'result' && <Result def={def} state={state} onOpen={onOpen} onHide={onHide} />}
      {state.kind === 'failed' && (
        <div class="an-failed" data-analysis="failed" data-failure={state.failure}>
          <Head def={def} />
          <p class="mj-note" data-tone="danger" role="alert">
            {state.message}
            {state.retryAt !== null ? ` لا يُرسل طلب قبل ${clock(state.retryAt)}.` : ''}
          </p>
          <p class="an-muted">بقية القسم تعمل كما هي.</p>
          <div class="an-actions">
            <button type="button" class="mj-link" data-action="analysis-retry" onClick={(event) => onOpen(event)}>
              أعد المحاولة
            </button>
            {KEY_FAILURES.has(state.failure) && (
              <button type="button" class="mj-link" data-action="analysis-settings" onClick={onSettings}>
                افتح بطاقة «مزوّد التحليل» في الإعدادات
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

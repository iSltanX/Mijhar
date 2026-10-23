// عرض تحليل السجل بثلاث طبقات مفصولة بصريًا وبنيويًا (AC-D5): لكل طبقة قسم بعنوانه ووسمه وسمة data-layer، ولا يظهر نص طبقة
// في غيرها. الأسطر المنقولة من السجل تُعرض LTR معزولة بأرقامها، ولا يُترجم منها شيء.
import type { ComponentChildren } from 'preact';
import { NO_ROOT_CAUSE_TEXT, POSSIBILITY_TAG } from './parse';
import type { LiteralMessage, LogAnalysis } from './parse';

const SOURCE_LABELS: Readonly<Record<LogAnalysis['source'], string>> = {
  'step-log': 'سجل الخطوة الفاشلة (نص كامل)',
  'job-log': 'سجل المهمة (نص كامل)',
  annotations: 'التنبيهات الظاهرة في الصفحة وحدها',
};

const ORIGIN_LABELS: Readonly<Record<LiteralMessage['origin'], string>> = {
  'error-marker': 'سطر ##[error]',
  'pattern-line': 'سطر طابق نمطًا معرّفًا',
  annotation: 'من التنبيهات الظاهرة لا من نص السجل',
};

function Availability({ analysis }: { analysis: LogAnalysis }) {
  const { availability } = analysis;
  if (availability.state === 'full') return null;
  if (availability.state === 'unavailable') {
    return (
      <p class="d-alert" data-log-state="unavailable" role="note">
        نص السجل <strong>غير متاح</strong>: {availability.reason}. ما يلي مبني على التنبيهات الظاهرة وحدها، وقد لا يكفي لمعرفة السبب.
      </p>
    );
  }
  return (
    <p class="d-alert" data-log-state="truncated" role="note">
      السجل <strong>مقتطع</strong>: {availability.reason} — قُرئ {availability.readLines.toLocaleString('en-US')} سطر
      {availability.totalLines !== null ? ` من ${availability.totalLines.toLocaleString('en-US')}` : ''}. ما لم يُقرأ قد يحمل السبب.
    </p>
  );
}

function Message({ message }: { message: LiteralMessage }) {
  return (
    <li data-origin={message.origin}>
      <div class="d-loc">
        {message.step ? (
          <>
            الخطوة: <bdi dir="ltr">{message.step}</bdi>
          </>
        ) : (
          'الخطوة: غير معروفة'
        )}
        {message.line !== null && <> · السطر {message.line}</>} · {ORIGIN_LABELS[message.origin]}
      </div>
      {message.context.length ? (
        <pre class="d-log" dir="ltr">
          {message.context.map((line) => (
            <span class="d-log-line" data-focus={line.focus ? 'true' : 'false'} key={line.number}>
              <span class="d-ln">{line.number}</span>
              {line.text}
              {'\n'}
            </span>
          ))}
        </pre>
      ) : (
        <pre class="d-log" dir="ltr">
          <span class="d-log-line" data-focus="true">
            {message.text}
          </span>
        </pre>
      )}
    </li>
  );
}

export function LogAnalysisView({ analysis, children }: { analysis: LogAnalysis; children?: ComponentChildren }) {
  const { location } = analysis;
  return (
    <section class="d-card" data-card="log-analysis" aria-labelledby="mj-log-title">
      <header>
        <h2 id="mj-log-title">شرح سجل الفحص</h2>
        <span class="d-source" data-log-source={analysis.source}>
          المصدر: {SOURCE_LABELS[analysis.source]}
        </span>
      </header>
      <Availability analysis={analysis} />
      <dl class="d-grid">
        <div data-field="step">
          <dt>الخطوة الفاشلة</dt>
          <dd>{location.step ? <bdi dir="ltr">{location.step.number !== null ? `${location.step.number}. ` : ''}{location.step.name ?? ''}</bdi> : <span class="d-na">غير معروفة</span>}</dd>
        </div>
        <div data-field="exit-code">
          <dt>كود الخروج</dt>
          <dd>{location.exitCode !== null ? <bdi dir="ltr">{location.exitCode}</bdi> : <span class="d-na">لم يُذكر</span>}</dd>
        </div>
      </dl>

      <section class="d-layer" data-layer="literal" aria-labelledby="mj-log-l1">
        <h3 id="mj-log-l1">
          <span class="d-step">١</span> الرسالة الحرفية وموضعها <span class="d-tag" data-tag="fact">حقيقة منقولة كما هي</span>
        </h3>
        {analysis.messages.length ? (
          <ol class="d-messages">
            {analysis.messages.map((message, i) => (
              <Message key={`${message.line ?? 'a'}-${i}`} message={message} />
            ))}
            {analysis.moreMessages > 0 && <li class="d-note">…و{analysis.moreMessages} رسالة أخرى في السجل.</li>}
          </ol>
        ) : (
          <p class="d-note" data-empty="literal">
            لا رسالة خطأ صريحة (##[error]) ولا سطر يطابق نمطًا في ما قُرئ.
          </p>
        )}
      </section>

      <section class="d-layer" data-layer="root-cause" aria-labelledby="mj-log-l2">
        <h3 id="mj-log-l2">
          <span class="d-step">٢</span> السبب الجذري المثبت <span class="d-tag" data-tag="pattern">بنمط حتمي من قائمة معرّفة فقط</span>
        </h3>
        {analysis.rootCauses.length ? (
          <ul class="d-causes">
            {analysis.rootCauses.map((cause) => (
              <li key={`${cause.patternId}-${cause.evidence.line ?? ''}-${cause.cause}`} data-pattern={cause.patternId}>
                <strong>{cause.cause}</strong>
                <div class="d-evidence">
                  النمط: {cause.patternTitle} · الدليل{cause.evidence.origin === 'annotation' ? ' (من تنبيه ظاهر)' : ''}
                  {cause.evidence.line !== null ? ` — السطر ${cause.evidence.line}` : ''}:{' '}
                  <code dir="ltr">{cause.evidence.text}</code>
                </div>
              </li>
            ))}
            {analysis.moreRootCauses > 0 && <li class="d-note">…و{analysis.moreRootCauses} تطابقًا آخر.</li>}
          </ul>
        ) : (
          <p data-no-root-cause="true">{NO_ROOT_CAUSE_TEXT}</p>
        )}
      </section>

      <section class="d-layer" data-layer="possibility" aria-labelledby="mj-log-l3">
        <h3 id="mj-log-l3">
          <span class="d-step">٣</span> احتمالات للتحقق اليدوي
        </h3>
        {analysis.possibilities.length ? (
          <ul class="d-possible">
            {analysis.possibilities.map((p) => (
              <li key={`${p.text}-${p.basis}`}>
                <span class="d-tag" data-tag="possibility">
                  {POSSIBILITY_TAG}
                </span>{' '}
                {p.text}
                <div class="d-evidence">
                  بُني على: <bdi dir="ltr">{p.basis}</bdi>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p class="d-note">لا احتمالات مقترحة من نص السجل.</p>
        )}
      </section>
      {children}
    </section>
  );
}

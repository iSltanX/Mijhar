// شريط الجولة العائم (F-B7): حاوية Shadow DOM واحدة ثابتة أسفل النافذة تعرض الخطوة الحالية وحالة عنصرها في الصفحة. أزراره (السابق والتالي وإنهاء) أزرار الإضافة
// نفسها داخل جذر الظل؛ والجولة لا تنقر شيئًا من الصفحة ولا ترسل ولا تركّز عنصرًا منها: الرابط الوحيد «افتح الصفحة» يضغطه المستخدم بنفسه.
import { useEffect, useRef } from 'preact/hooks';
import type { GlossaryEntry } from '../../../data/glossary/types';
import { PERMISSION_LABELS } from '../card/display';
import type { StepResolution } from './resolve';
import type { Tour } from './data';

export const TOUR_BAR_HOST_NAME = 'b.tours';

export const TOUR_HOST_CSS = `
:host {
  all: initial !important; position: fixed !important; inset: 0 !important; z-index: 2147483001 !important; display: block !important;
  pointer-events: none !important; overflow: visible !important; visibility: visible !important; opacity: 1 !important; transform: none !important; filter: none !important;
}
`;

export const TOUR_CSS = `
.mj-root.tour-root { position: absolute; inset: 0; background: transparent; pointer-events: none; overflow: visible; }
.tour-bar {
  position: absolute; inset-inline: var(--mijhar-space-12); inset-block-end: var(--mijhar-space-12); margin-inline: auto; inline-size: min(560px, calc(100vw - 24px)); max-block-size: 60vh; overflow: auto;
  pointer-events: auto; display: flex; flex-direction: column; gap: var(--mijhar-space-8); padding: var(--mijhar-space-12);
  background: var(--mijhar-bg-surface-raised); color: var(--mijhar-text-primary); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-12); box-shadow: var(--mijhar-shadow-raised);
}
.tour-bar:focus-visible { outline: none; box-shadow: var(--mijhar-shadow-raised), var(--mijhar-focus-ring); }
.tour-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mijhar-space-8); }
.tour-head h2 { margin: 0; font-size: 12px; line-height: 20px; color: var(--mijhar-text-secondary); font-weight: 700; }
.tour-step h3 { margin: 0; font-size: 15px; line-height: 22px; }
.tour-step p { margin: 0; }
.tour-tag { display: inline-flex; align-items: center; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 22px; font-weight: 700; background: var(--mijhar-bg-info-subtle); color: var(--mijhar-text-info); }
.tour-tag[data-kind="found"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.tour-tag[data-kind="absent"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.tour-meta { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-6); align-items: center; }
.tour-card { padding: var(--mijhar-space-8) var(--mijhar-space-12); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-subtle); border: 1px solid var(--mijhar-border-muted); }
.tour-card[data-kind="absent"] { background: var(--mijhar-bg-warning-subtle); border-color: var(--mijhar-border-default); }
.tour-card ul { margin: var(--mijhar-space-4) 0 0; padding-inline-start: var(--mijhar-space-16); }
.tour-wire { display: flex; align-items: center; justify-content: center; padding: var(--mijhar-space-12); border: 2px dashed var(--mijhar-border-strong); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-surface); }
.tour-wire .wire-control { padding: var(--mijhar-space-4) var(--mijhar-space-12); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); background: var(--mijhar-bg-muted); font-weight: 700; direction: ltr; unicode-bidi: isolate; }
.term-en { direction: ltr; unicode-bidi: isolate; display: inline-block; }
.tour-actions { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-6); align-items: center; }
.tour-actions .spacer { flex: 1 1 auto; }
.tour-bar a.btn { text-decoration: none; }
`;

export interface TourBarProps {
  readonly tour: Tour;
  readonly index: number;
  readonly resolution: StepResolution;
  /** رابط فتح صفحة الخطوة (بنقر المستخدم)، أو null. */
  readonly link: string | null;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onStop: () => void;
}

function Term({ entry }: { entry: GlossaryEntry }) {
  return (
    <span class="term">
      {entry.ar} (<bdi class="term-en" dir="ltr">{entry.en}</bdi>)
    </span>
  );
}

function DecisionChips({ entry }: { entry: GlossaryEntry }) {
  return (
    <div class="tour-meta" data-tour-decision="">
      <span class="chip" data-safety={entry.safety}>
        {entry.safety}
      </span>
      <span class="small muted">الصلاحية: {PERMISSION_LABELS[entry.permission]}</span>
      <span class="small muted">التراجع: {entry.reversible}</span>
    </div>
  );
}

export function TourBar({ tour, index, resolution, link, onPrev, onNext, onStop }: TourBarProps) {
  const step = tour.steps[index]!;
  const last = index === tour.steps.length - 1;
  const ref = useRef<HTMLDivElement>(null);
  // التركيز ينتقل إلى الشريط عند بدء الجولة وحدها؛ ما بعده يبقى حيث وضعه المستخدم (الزر الذي ضغطه).
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [tour.id]);
  return (
    <div
      ref={ref}
      class="tour-bar"
      role="dialog"
      aria-modal="false"
      aria-label={`جولة إرشادية: ${tour.title}`}
      tabIndex={-1}
      data-tour={tour.id}
      data-step={index}
      data-resolution={resolution.kind}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          event.preventDefault();
          onStop();
        } else if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key !== 'Tab') {
          // ضغطات هذا الشريط لا تبلغ اختصارات GitHub أحادية الحرف.
          event.stopPropagation();
        }
      }}
    >
      <div class="tour-head">
        <h2>
          جولة: {tour.title} · الخطوة <span data-tour-position="">{index + 1}</span> من {tour.steps.length}
        </h2>
        <button type="button" class="btn icon-btn" data-action="tour-stop" aria-label="إنهاء الجولة" title="إنهاء الجولة (Esc)" onClick={onStop}>
          ×
        </button>
      </div>
      <div class="tour-step" aria-live="polite">
        <div class="tour-meta">
          {resolution.kind === 'found' && (
            <span class="tour-tag" data-kind="found">
              العنصر مُبرز في الصفحة
            </span>
          )}
          {resolution.kind === 'absent' && (
            <span class="tour-tag" data-kind="absent">
              العنصر غير موجود في هذه الصفحة
            </span>
          )}
          {resolution.kind === 'visual' && (
            <span class="tour-tag" data-kind="visual">
              شرح بصري فقط
            </span>
          )}
        </div>
        <h3 data-tour-step-title="">{step.title}</h3>
        <p data-tour-step-body="">{step.body}</p>
      </div>

      {resolution.kind === 'found' && (
        <div class="tour-card" data-kind="found">
          <p class="small">
            <Term entry={resolution.entry} />
          </p>
          <DecisionChips entry={resolution.entry} />
        </div>
      )}

      {resolution.kind === 'absent' && (
        <div class="tour-card" data-kind="absent" role="note" data-tour-absent="">
          <p>
            <strong>لم يظهر عنصر هذه الخطوة في الصفحة المفتوحة.</strong>
          </p>
          <ul>
            {resolution.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p class="small muted">الجولة لا تخمّن عنصرًا ولا تنتقل بك ولا تنقر شيئًا؛ يمكنك المتابعة إلى الخطوة التالية.</p>
        </div>
      )}

      {resolution.kind === 'visual' && step.visual && (
        <div class="tour-card" data-kind="visual" data-tour-visual="">
          <div class="tour-wire" aria-hidden="true">
            <span class="wire-control">{step.visual.control}</span>
          </div>
          <p class="small">
            <strong>أين تجده:</strong> {step.visual.where}
          </p>
          {resolution.entry && <DecisionChips entry={resolution.entry} />}
          <p class="small muted">
            شرح بصري فقط: هذه الخطوة تخص إعدادات حساسة، فلا تقرأ الجولة صفحتها ولا تبرز فيها شيئًا ولا تنقر نيابةً عنك. هذا رسم تخطيطي لما ستراه.
          </p>
        </div>
      )}

      <div class="tour-actions">
        <button type="button" class="btn" data-action="tour-prev" disabled={index === 0} onClick={onPrev}>
          السابق
        </button>
        <button type="button" class="btn btn-primary" data-action="tour-next" onClick={onNext}>
          {last ? 'إنهاء الجولة' : 'التالي'}
        </button>
        <span class="spacer" />
        {link && (
          <a class="btn" data-action="tour-open-page" href={link} rel="noreferrer">
            افتح صفحة الخطوة
          </a>
        )}
      </div>
    </div>
  );
}

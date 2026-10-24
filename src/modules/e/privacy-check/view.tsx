// لافتة البيانات الخاصة والفاحص التحذيري (T-6.3، F-E5): اللافتة دائمة فوق المعاينة، ومعها إخلاء المسؤولية بأن الفحص لا يضمن كشف كل الأسرار
// ولا يزيل أي نص وأن المراجعة البشرية لازمة. وما رصده الفاحص يُظلَّل في قائمة تحت المعاينة (حقل النص لا يعرض تظليلًا داخله) مع زر
// «حدّد في المعاينة» يحدد الموضع في حقل النص ليحذفه المستخدم أو يعدّله بيده. لا يغيّر شيئًا من النص.
import { SECRET_PATTERNS, findingView } from './scan';
import type { Finding, SecretPattern } from './scan';

/** أقصى ما يُعرض من المرصودات في القائمة؛ والباقي يُعدّ ولا يُخفى عدده. */
export const MAX_SHOWN_FINDINGS = 20;

export const PRIVACY_BANNER = 'قد تحتوي السجلات والتعليقات على بيانات خاصة (رموز ومفاتيح وأسماء داخلية). راجع المعاينة كلها بنفسك قبل أن تنسخها أو تنزّلها.';
export const PRIVACY_DISCLAIMER =
  'الفحص أدناه تحذيري غير جازم: يبحث عن أنماط معروفة فقط، ولا يضمن كشف كل الأسرار ولا يزيل أي نص من المعاينة. المراجعة البشرية للمعاينة لازمة دائمًا.';

export interface PrivacyCheckProps {
  /** النص المفحوص بعينه (المعاينة كما ستُنسخ). */
  readonly text: string;
  readonly findings: readonly Finding[];
  /** أنماط إضافية فحصها المستدعي (تُذكر في «ما يفحصه»). */
  readonly extra?: readonly SecretPattern[];
  /** تحديد الموضع في حقل المعاينة. */
  readonly onSelect: (finding: Finding) => void;
}

export function PrivacyCheck({ text, findings, extra = [], onSelect }: PrivacyCheckProps) {
  const shown = findings.slice(0, MAX_SHOWN_FINDINGS);
  const scanned = [...SECRET_PATTERNS, ...extra].map((p) => p.label);
  return (
    <section class="e-privacy" aria-labelledby="mj-e-privacy-title" data-privacy="" data-findings={String(findings.length)}>
      <h4 id="mj-e-privacy-title">بيانات خاصة محتملة</h4>
      <p data-privacy-banner="">{PRIVACY_BANNER}</p>
      <p class="muted small" data-privacy-disclaimer="">
        {PRIVACY_DISCLAIMER}
      </p>
      <details class="small">
        <summary>ما يفحصه</summary>
        <ul data-privacy-patterns="">
          {scanned.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </details>
      {findings.length > 0 ? (
        <div class="e-findings" role="status" data-privacy-found="">
          <p>
            <strong>رُصد {findings.length} من الأنماط المشبوهة في المعاينة</strong> (لم يُحذف منها شيء):
          </p>
          <ul>
            {shown.map((finding, i) => {
              const view = findingView(text, finding);
              return (
                <li key={`${finding.start}-${finding.patternId}-${i}`} data-finding={finding.patternId} data-line={String(finding.line)}>
                  <span class="e-tag">{finding.label}</span> سطر {finding.line}:{' '}
                  <code dir="auto">
                    {view.before}
                    <mark data-finding-mark="">{view.match}</mark>
                    {view.after}
                  </code>{' '}
                  <button type="button" class="e-link" data-action="finding-select" aria-label={`حدّد الموضع المشبوه في السطر ${finding.line} داخل المعاينة`} onClick={() => onSelect(finding)}>
                    حدّد في المعاينة
                  </button>
                </li>
              );
            })}
          </ul>
          {findings.length > shown.length && <p class="muted small">و{findings.length - shown.length} أخرى لم تُعرض هنا؛ راجع المعاينة كلها.</p>}
        </div>
      ) : (
        <p class="muted small" data-privacy-none="">
          لم يرصد الفحص أنماطًا من القائمة المعرّفة. هذا لا يعني خلو المعاينة من الأسرار.
        </p>
      )}
    </section>
  );
}

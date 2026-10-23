// عرض نتيجة إعادة التثبيت داخل الملاحظة في بطاقة الصفحة (AC-G3): الحالة صريحة، والموضع الجديد مقترح لا مطبَّق، والمرشحات معروضة
// والملاحظة غير مربوطة، والمقتطف في العام وحده (DEC-05)، ورابط الفرع والرابط الثابت محاولتان لا ضمان. النقل بنقر المستخدم وحده.
import { useRef, useState } from 'preact/hooks';
import { useStyles } from '../../../../shared/ui/useStyles';
import { ANCHOR_LABELS } from '../../notes/types';
import type { Note } from '../../notes/types';
import { STATUS_OF, anchorLinks } from '../controller';
import type { AnchorView, UnanchoredReason } from '../controller';
import type { LineAnchor } from '../types';

export const ANCHOR_STYLE_ID = 'mijhar-g-anchor';

export const ANCHOR_CSS = `
.anchor-view { display: flex; flex-direction: column; gap: var(--mijhar-space-6); }
.anchor-view .anchor-badge { align-self: flex-start; display: inline-flex; align-items: center; padding: 0 var(--mijhar-space-8); border-radius: var(--mijhar-radius-full); font-size: 12px; line-height: 20px; font-weight: 700; background: var(--mijhar-bg-muted); color: var(--mijhar-text-secondary); }
.anchor-view .anchor-badge[data-status="matched"] { background: var(--mijhar-bg-success-subtle); color: var(--mijhar-text-success); }
.anchor-view .anchor-badge[data-status="shifted"], .anchor-view .anchor-badge[data-status="ambiguous"], .anchor-view .anchor-badge[data-status="changed"] { background: var(--mijhar-bg-warning-subtle); color: var(--mijhar-text-warning); }
.anchor-view .anchor-badge[data-status="resource-unavailable"], .anchor-view .anchor-badge[data-status="access-lost"] { background: var(--mijhar-bg-danger-subtle); color: var(--mijhar-text-danger); }
.anchor-view .anchor-text { margin: 0; font-size: 12px; line-height: 18px; color: var(--mijhar-text-secondary); }
.anchor-view .anchor-actions { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-6); }
.anchor-view .snippet { margin: 0; padding: var(--mijhar-space-6) var(--mijhar-space-8); font-family: var(--mijhar-font-mono); font-size: 12px; line-height: 18px; white-space: pre; overflow-x: auto; text-align: left; background: var(--mijhar-bg-surface); border: 1px solid var(--mijhar-border-default); border-radius: var(--mijhar-radius-6); }
`;

const REASONS: Readonly<Record<UnanchoredReason, string>> = {
  rendered: 'الملف معروض بلا أرقام أسطر (Markdown معروض أو ملف ثنائي)، فلا يُتحقق من موضع السطر. اعرضه بصيغة الكود ليُتحقق منه.',
  'range-too-long': 'النطاق أطول من 40 سطرًا، فحُفظ موضعه ولا يُتحقق منه.',
  'lines-missing': 'لم تظهر أسطر النطاق وسياقها في الصفحة وقت الحفظ، فلا بصمة للتحقق منه.',
  partial: 'لم تُظهر الصفحة الملف كله، فلا يُبحث عن موضع جديد؛ الملاحظة غير مربوطة بسطر.',
  'salt-mismatch': 'بصمة هذه الملاحظة صُنعت بملح محلي آخر (من تثبيت أو استيراد سابق)، فلا يمكن مقارنتها؛ الملاحظة غير مربوطة بسطر.',
};

const lineLink = (n: number): string => `#L${n}`;

function plainUrl(anchor: LineAnchor): string {
  const url = new URL(anchorLinks(anchor).branch);
  url.searchParams.set('plain', '1');
  return url.href;
}

function Links({ anchor }: { anchor: LineAnchor }) {
  const { branch, permalink } = anchorLinks(anchor);
  return (
    <div class="anchor-actions">
      <a class="btn btn-small" href={branch} data-anchor-link="branch">
        رابط الفرع <span class="ltr-inline mono">{anchor.ref}</span>
      </a>
      {permalink ? (
        <a class="btn btn-small" href={permalink} data-anchor-link="permalink" title="محاولة لا ضمان: قد يزول المحتوى بإعادة كتابة التاريخ أو حذف المستودع أو فقد الصلاحية">
          الرابط الثابت (محاولة)
        </a>
      ) : (
        <span class="anchor-text">لم يُستخرج التزام وقت الحفظ، فلا رابط ثابت.</span>
      )}
    </div>
  );
}

export interface AnchorStatusViewProps {
  readonly note: Note;
  readonly view: AnchorView | undefined;
  readonly onRelocate: (noteId: string, start: number) => Promise<void>;
}

export function AnchorStatusView({ note, view, onRelocate }: AnchorStatusViewProps) {
  const root = useRef<HTMLDivElement>(null);
  useStyles(root, ANCHOR_STYLE_ID, ANCHOR_CSS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = view ? STATUS_OF[view.kind] : note.anchorStatus;

  const move = (start: number): void => {
    setBusy(true);
    setError(null);
    onRelocate(note.id, start).then(
      () => setBusy(false),
      (e: unknown) => {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
      },
    );
  };

  const moveButton = (n: number, label: string) => (
    <button type="button" class="btn btn-small" data-action="relocate" data-line={n} disabled={busy} onClick={() => move(n)}>
      {label}
    </button>
  );

  return (
    <div class="anchor-view" ref={root} data-anchor-view={view?.kind ?? 'none'}>
      <span class="anchor-badge anchor" data-status={status} data-anchor-status={status}>
        {ANCHOR_LABELS[status]}
      </span>
      {view?.kind === 'matched' && <p class="anchor-text">السطر بنصه وسياقه في موضعه.</p>}
      {view?.kind === 'shifted' && (
        <>
          <p class="anchor-text" data-candidate={view.candidate}>
            يبدو أن السطر انتقل إلى السطر {view.candidate} (المرشح الوحيد بالنص والسياق). لم يُنقل شيء؛ انقل الملاحظة إن تأكدت.
          </p>
          <div class="anchor-actions">
            <a class="btn btn-small" href={lineLink(view.candidate)} data-action="show-candidate">
              اعرض السطر {view.candidate}
            </a>
            {moveButton(view.candidate, `انقل الملاحظة إلى السطر ${view.candidate}`)}
          </div>
        </>
      )}
      {view?.kind === 'ambiguous' && (
        <>
          <p class="anchor-text" data-candidates={view.candidates.join(',')}>
            يطابق النص وسياقه {view.candidates.length} مواضع، فلا يُختار أحدها عنك؛ الملاحظة غير مربوطة بسطر.
          </p>
          <div class="anchor-actions">
            {view.candidates.map((n) => (
              <span key={n} class="anchor-actions">
                <a class="btn btn-small" href={lineLink(n)} data-action="show-candidate">
                  السطر {n}
                </a>
                {moveButton(n, `اربطها بالسطر ${n}`)}
              </span>
            ))}
          </div>
        </>
      )}
      {view?.kind === 'changed' && (
        <>
          <p class="anchor-text">تغيّر نص السطر أو سياقه؛ الملاحظة بلا موضع.</p>
          {view.anchor.fingerprint?.mode === 'text' ? (
            <>
              <p class="anchor-text">المقتطف المحفوظ وقت الملاحظة:</p>
              <pre class="snippet" dir="ltr" data-snippet="">
                {view.anchor.fingerprint.block.join('\n')}
              </pre>
            </>
          ) : (
            <p class="anchor-text" data-snippet-private="">
              لم يُحفظ نص السطر لأن المستودع خاص (أو لم تعلن الصفحة أنه عام)؛ حُفظت بصمته وحدها.
            </p>
          )}
          {view.textOnly !== null && (
            <div class="anchor-actions" data-text-only={view.textOnly}>
              <span class="anchor-text">نص السطر نفسه باقٍ وحده في السطر {view.textOnly} بسياق مختلف:</span>
              <a class="btn btn-small" href={lineLink(view.textOnly)} data-action="show-candidate">
                اعرض السطر {view.textOnly}
              </a>
              {moveButton(view.textOnly, `انقل الملاحظة إلى السطر ${view.textOnly}`)}
            </div>
          )}
        </>
      )}
      {view?.kind === 'resource-unavailable' && (
        <>
          <p class="anchor-text">لا تعرض الصفحة هذا الملف: قد يكون حُذف أو أُعيدت تسميته أو تغيّر الفرع. الرابطان أدناه محاولتان لا ضمان.</p>
          <Links anchor={view.anchor} />
        </>
      )}
      {view?.kind === 'access-lost' && (
        <>
          <p class="anchor-text">تعذّر التحقق: لا تعرض الصفحة المورد، وقد يعود ذلك إلى فقد صلاحيتك على مستودع خاص أو انتهاء جلستك؛ لا يمكن التمييز بينهما من الصفحة.</p>
          <Links anchor={view.anchor} />
        </>
      )}
      {view?.kind === 'unanchored' && (
        <>
          <p class="anchor-text" data-reason={view.reason}>
            {REASONS[view.reason]}
          </p>
          {view.reason === 'rendered' && (
            <div class="anchor-actions">
              <a class="btn btn-small" href={plainUrl(view.anchor)} data-action="plain-view">
                اعرض الملف بصيغة الكود
              </a>
            </div>
          )}
        </>
      )}
      {error && (
        <p class="notice" data-tone="danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

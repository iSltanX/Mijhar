// شريط الترجمة فوق كل نص (F-C1/F-C3): زر «ترجمة إلى العربية» وحده قبل أي فعل؛ وأثناء الترجمة تقدّم وزر إلغاء؛ وبعدها ثلاثة أنماط عرض
// (الأصل والترجمة معًا، الترجمة فقط، إظهار الأصل) و«إلغاء الترجمة». كل زر <button> أصلي باسم وصول، والحالة تُعلَن بـrole="status".
import type { DisplayMode, SessionSnapshot } from './session';

export type BarKind = 'readme' | 'comment' | 'text';

export interface BarProps {
  readonly kind: BarKind;
  readonly snapshot: SessionSnapshot;
  /** سبب عدم توفر المحرك (يُعرض بدل الشروع في الترجمة). */
  readonly unavailable: string | null;
  readonly engineLabel: string;
  readonly onTranslate: () => void;
  readonly onCancel: () => void;
  readonly onMode: (mode: DisplayMode) => void;
}

const MODES: ReadonlyArray<{ readonly id: DisplayMode; readonly label: string; readonly hint: string }> = [
  { id: 'both', label: 'الأصل والترجمة', hint: 'يعرض الأصل وتحته الترجمة' },
  { id: 'translation', label: 'الترجمة فقط', hint: 'يستبدل الأصل بالترجمة موضعيًا' },
  { id: 'original', label: 'إظهار الأصل', hint: 'يعيد الأصل وحده؛ تبقى الترجمة محفوظة لتعود بنقرة' },
];

const TRANSLATE_LABEL: Record<BarKind, string> = {
  readme: 'ترجمة README إلى العربية',
  comment: 'ترجمة إلى العربية',
  text: 'ترجمة إلى العربية',
};

export function describe(snapshot: SessionSnapshot): string {
  const { phase, total, done, kept, skipped, truncated, error } = snapshot;
  switch (phase) {
    case 'working':
      return `جارٍ الترجمة… ${done} من ${total}`;
    case 'empty':
      return skipped > 0 ? 'لا نص إنجليزي للترجمة هنا؛ ما وُجد عربي أو شيفرة.' : 'لا نص للترجمة هنا.';
    case 'error':
      return `تعذّرت الترجمة: ${error ?? 'خطأ في المحرك'}${done ? `. تُرجمت ${done} من ${total} قبل الخطأ.` : '.'}`;
    case 'done': {
      const parts = [`تُرجمت ${done - kept} من ${total} فقرة`];
      if (kept > 0) parts.push(`وأُبقي الأصل في ${kept} لسلامة الرموز المحمية`);
      if (truncated) parts.push('(اقتُصر على أول الفقرات)');
      return `${parts.join(' ')}.`;
    }
    default:
      return '';
  }
}

export function TranslationBar({ kind, snapshot, unavailable, engineLabel, onTranslate, onCancel, onMode }: BarProps) {
  const { phase, mode } = snapshot;
  const working = phase === 'working';
  // بعد الانتهاء (أو الخطأ بعد ترجمة بعض الفقرات) تُعرض أنماط العرض وإلغاء الترجمة.
  const translated = phase === 'done' || (phase === 'error' && snapshot.done > 0);
  const text = describe(snapshot);
  return (
    <div class="bar" data-phase={phase} data-kind={kind} role="group" aria-label="ترجمة تقنية إلى العربية">
      {phase === 'idle' || phase === 'empty' || (phase === 'error' && snapshot.done === 0) ? (
        <button type="button" class="btn btn-primary" data-action="translate" title={`يترجم بمحرك «${engineLabel}» عند الضغط وحده`} onClick={onTranslate}>
          {TRANSLATE_LABEL[kind]}
        </button>
      ) : null}
      {working && (
        <>
          <progress max={snapshot.total} value={snapshot.done} aria-label="تقدم الترجمة" />
          <button type="button" class="btn" data-action="cancel" onClick={onCancel}>
            إلغاء
          </button>
        </>
      )}
      {translated && (
        <>
          <span class="modes" role="group" aria-label="نمط العرض">
            {MODES.map((m) => (
              <button type="button" class="btn" key={m.id} data-mode={m.id} aria-pressed={mode === m.id ? 'true' : 'false'} title={m.hint} onClick={() => onMode(m.id)}>
                {m.label}
              </button>
            ))}
          </span>
          <button type="button" class="btn" data-action="remove" onClick={onCancel}>
            إلغاء الترجمة
          </button>
        </>
      )}
      <span class="note" role="status" aria-live="polite" data-note>
        {unavailable ? `المحرك غير متاح: ${unavailable}` : text}
      </span>
    </div>
  );
}

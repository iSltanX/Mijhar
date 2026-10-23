// لوحة المساعد (F-F1 / F-F4 / F-F5): حوار غير مشروط عائم بقسمه الأساسي المحلي (data-section="static": حتمي، بلا شبكة ولا نموذج، لا يغيّر كلمات المستخدم).
// خمسة حقول (المتوقع والفعلي وخطوات التكرار والبيئة والأدلة) ← معاينة كاملة للنص قبل الإدراج ← «أدرج عند المؤشر» أو «ألحق في النهاية» ← «التراجع عن آخر إدراج».
// لا شيء يُنشر ولا يُرسل: اللوحة لا تلمس زر الإرسال ولا نموذج الصفحة، وتعلن ذلك. القسم الاختياري «ترجمة مسودتي» (T-7.3) يُضاف لاحقًا في حاويته المنفصلة.
import { useEffect, useRef } from 'preact/hooks';
import { FIELD_GUIDE, FIELD_IDS, KIND_LABELS, compose } from './template';
import type { ComposerFields, ComposerKind, FieldId, LanguageChoice } from './template';
import type { InsertMode } from './insert';

export interface PanelState {
  readonly kind: ComposerKind;
  readonly language: LanguageChoice;
  readonly fields: ComposerFields;
}

export interface PanelStatus {
  readonly tone: 'ok' | 'warn';
  readonly text: string;
  /** إتاحة نسخ المسودة السابقة (حين تعذّر التراجع التلقائي). */
  readonly copyPrevious?: boolean;
}

export interface PanelProps {
  readonly state: PanelState;
  readonly onState: (next: PanelState) => void;
  /** طول مسودة الحقل الحالي (للعرض فقط). */
  readonly draftLength: number;
  readonly canUndo: boolean;
  readonly status: PanelStatus | null;
  readonly onInsert: (mode: InsertMode) => void;
  readonly onUndo: () => void;
  readonly onCopyPrevious: () => void;
  readonly onClose: () => void;
}

const LANGUAGES: ReadonlyArray<{ readonly id: LanguageChoice; readonly label: string }> = [
  { id: 'auto', label: 'تلقائية بحسب ما تكتب' },
  { id: 'ar', label: 'عربية' },
  { id: 'en', label: 'English' },
];

const arabicCount = (n: number): string => (n === 1 ? 'حرف واحد' : n === 2 ? 'حرفان' : n <= 10 ? `${n} أحرف` : `${n} حرفًا`);

export function ComposerPanel({ state, onState, draftLength, canUndo, status, onInsert, onUndo, onCopyPrevious, onClose }: PanelProps) {
  const first = useRef<HTMLTextAreaElement>(null);
  const preview = compose(state.fields, { kind: state.kind, language: state.language });
  const guide = FIELD_GUIDE[state.kind];
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, []);
  const set = (id: FieldId, value: string): void => onState({ ...state, fields: { ...state.fields, [id]: value } });
  const empty = preview.text === '';
  return (
    <section
      class="panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="mj-composer-title"
      tabIndex={-1}
      data-kind={state.kind}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          event.preventDefault();
          onClose();
        } else if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key !== 'Tab') {
          // ضغطات الكتابة هنا لا تبلغ اختصارات GitHub أحادية الحرف.
          event.stopPropagation();
        }
      }}
    >
      <header class="panel-head">
        <h2 id="mj-composer-title">مساعد كتابة البلاغات والمراجعات</h2>
        <button type="button" class="btn icon-btn" data-action="close" aria-label="إغلاق المساعد" title="إغلاق (Esc)" onClick={onClose}>
          ×
        </button>
      </header>
      <div class="static-section" data-section="static">
        <div class="panel-scroll">
        <p class="note">قسم محلي ثابت: ينظّم ما تكتبه بعناوين، ولا يغيّر كلماتك ولا يتصل بشبكة ولا بنموذج.</p>
        <fieldset class="kinds">
          <legend>النوع</legend>
          {(['issue', 'pr'] as const).map((kind) => (
            <label class="choice" key={kind}>
              <input type="radio" name="mj-composer-kind" value={kind} checked={state.kind === kind} onChange={() => onState({ ...state, kind })} />
              <span>{KIND_LABELS[kind]}</span>
            </label>
          ))}
        </fieldset>
        {FIELD_IDS.map((id, i) => (
          <div class="field" key={id} data-field={id}>
            <label for={`mj-composer-${id}`}>{guide[id].label}</label>
            <textarea
              id={`mj-composer-${id}`}
              ref={i === 0 ? first : undefined}
              rows={id === 'steps' || id === 'evidence' ? 3 : 2}
              dir="auto"
              spellcheck={false}
              aria-describedby={`mj-composer-${id}-hint`}
              value={state.fields[id]}
              onInput={(event) => set(id, (event.currentTarget as HTMLTextAreaElement).value)}
            />
            <span class="hint" id={`mj-composer-${id}-hint`}>
              {guide[id].hint}
            </span>
          </div>
        ))}
        <div class="field">
          <label for="mj-composer-language">لغة العناوين</label>
          <select id="mj-composer-language" value={state.language} onChange={(event) => onState({ ...state, language: (event.currentTarget as HTMLSelectElement).value as LanguageChoice })}>
            {LANGUAGES.map((l) => (
              <option value={l.id} key={l.id}>
                {l.label}
                {l.id === 'auto' ? ` (الآن: ${preview.language === 'ar' ? 'عربية' : 'English'})` : ''}
              </option>
            ))}
          </select>
        </div>
        </div>
        <div class="panel-foot">
        <div class="preview-box" data-section="preview">
          <h3 id="mj-composer-preview-title">المعاينة قبل الإدراج</h3>
          <pre class="preview" tabIndex={0} aria-labelledby="mj-composer-preview-title" data-empty={empty ? 'true' : 'false'} data-preview>
            {empty ? 'اكتب في الحقول أعلاه لتظهر هنا المعاينة الكاملة للنص الذي سيُدرج.' : preview.text}
          </pre>
          {!empty && preview.omitted.length > 0 && <span class="note">أقسام فارغة لن تُدرج: {preview.omitted.map((id) => guide[id].label).join('، ')}.</span>}
        </div>
        <p class="note" data-draft>
          مسودتك الحالية في حقل الكتابة: {arabicCount(draftLength)}. الإدراج لا يمسح منها شيئًا، ولا يُنشر ولا يُرسل شيء: أنت من يضغط زر الإرسال.
        </p>
        <div class="actions">
          <button type="button" class="btn btn-primary" data-action="insert-cursor" disabled={empty} onClick={() => onInsert('cursor')}>
            أدرج عند المؤشر
          </button>
          <button type="button" class="btn" data-action="insert-append" disabled={empty} onClick={() => onInsert('append')}>
            ألحق في نهاية المسودة
          </button>
          <button type="button" class="btn" data-action="undo" disabled={!canUndo} onClick={onUndo}>
            التراجع عن آخر إدراج
          </button>
        </div>
        <span class="status" role="status" aria-live="polite" data-status={status ? 'on' : 'off'} data-tone={status?.tone ?? 'ok'} hidden={!status}>
          {status?.text}
          {status?.copyPrevious && (
            <>
              {' '}
              <button type="button" class="btn" data-action="copy-previous" onClick={onCopyPrevious}>
                نسخ المسودة السابقة
              </button>
            </>
          )}
        </span>
        </div>
      </div>
    </section>
  );
}

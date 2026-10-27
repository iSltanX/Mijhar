// لوحة المساعد (F-F1 / F-F2 / F-F3 / F-F4 / F-F5): حوار غير مشروط عائم بقسمين منفصلين بصريًا وبرمجيًا (AC-F5):
//  - القسم الثابت المحلي (data-section="static": حتمي، بلا شبكة ولا نموذج، لا يغيّر كلمات المستخدم، ويعمل مع غياب أي محرك ترجمة): خمسة حقول ← معاينة كاملة للنص قبل الإدراج
//    ← «أدرج عند المؤشر» أو «ألحق في نهاية المسودة» ← «التراجع عن آخر إدراج»؛ وحارس «القالب أولًا» (T-7.2) الذي يغيّر ما يُعرض ويُدرج بحسب القالب الذي في الصفحة؛
//    وبنك عبارات المراجعة (T-7.3) الذي تظهر عبارته المختارة في المعاينة نفسها ولا تُدرج إلا منها.
//  - القسم الاختياري «ترجمة مسودتي» (data-section="translate-draft"): مكوّن مستقل في f/phrasebank لا يؤثر في القسم الثابت بوجوده أو غيابه.
// لا شيء يُنشر ولا يُرسل: اللوحة لا تلمس زر الإرسال ولا نموذج الصفحة، وتعلن ذلك.
import { useEffect, useRef } from 'preact/hooks';
import { PhrasebankSection } from '../phrasebank/PhrasebankSection';
import type { PhraseSelection } from '../phrasebank/data';
import { TranslateDraftSection } from '../phrasebank/translate-draft';
import { IssueFormGuide, MarkdownTemplateNotice, UnknownTemplateNotice } from '../template/panel';
import { buildOutput, isEmptyOutput, previewText } from '../template/output';
import type { Output } from '../template/output';
import { mapHeadings } from '../template/markdown';
import type { TemplateInfo } from '../template/detect';
import { FIELD_GUIDE, FIELD_IDS, KIND_LABELS, compose } from './template';
import type { ComposerFields, ComposerKind, FieldId, LanguageChoice } from './template';
import type { InsertMode } from './insert';

export interface PanelState {
  readonly kind: ComposerKind;
  readonly language: LanguageChoice;
  readonly fields: ComposerFields;
  /** نص الحقل الواحد في وضع Issue Form (دليل جانبي لحقل). */
  readonly single?: string;
  /** العبارة المختارة من بنك العبارات؛ تحل محل التنظيم في المعاينة. */
  readonly phrase?: PhraseSelection | null;
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
  /** مسودة حقل الكتابة الحالي (للعرض ولخطة القالب). */
  readonly draft: string;
  /** ما تعرّف عليه حارس القالب في هذا الحقل. */
  readonly template: TemplateInfo;
  readonly canUndo: boolean;
  readonly status: PanelStatus | null;
  readonly onInsert: (mode: InsertMode, output: Output) => void;
  /** نسخ يدوي لنص المعاينة (القالب غير المعروف الهيكل). */
  readonly onCopy: (text: string) => void;
  /** إدراج نص راجعه المستخدم (الترجمة) عند المؤشر أو بالإلحاق. */
  readonly onInsertText: (text: string, mode: InsertMode) => void;
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

export function ComposerPanel({ state, onState, draft, template, canUndo, status, onInsert, onCopy, onInsertText, onUndo, onCopyPrevious, onClose }: PanelProps) {
  const first = useRef<HTMLTextAreaElement>(null);
  const section = useRef<HTMLElement>(null);
  const output = buildOutput({ info: template, kind: state.kind, language: state.language, fields: state.fields, single: state.single ?? '', phrase: state.phrase?.text ?? null, draft });
  const preview = previewText(output);
  const empty = isEmptyOutput(output);
  const composed = compose(state.fields, { kind: state.kind, language: state.language });
  const guide = FIELD_GUIDE[state.kind];
  // العناوين المقابلة للحقول تُحسب من القالب نفسه لا من الحقول المكتوبة، فتظهر قبل أن يكتب المستخدم شيئًا.
  const mapping = template.kind === 'markdown' ? mapHeadings(template.template) : null;
  const mappedHeading = (id: FieldId): string | undefined => mapping?.get(id)?.text;
  // التركيز داخل اللوحة عند فتحها في كل أنواع القوالب (ومنها Issue Form)، فيبلغها Escape: أول حقل في القسم الثابت، وإلا اللوحة نفسها.
  useEffect(() => {
    const target = first.current ?? section.current?.querySelector<HTMLElement>('[data-section="static"] textarea, [data-section="static"] input:not([type="hidden"])') ?? section.current;
    target?.focus({ preventScroll: true });
  }, []);
  const set = (id: FieldId, value: string): void => onState({ ...state, fields: { ...state.fields, [id]: value } });
  const phrasing = state.phrase != null;
  return (
    <section
      ref={section}
      class="panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="mj-composer-title"
      tabIndex={-1}
      data-kind={state.kind}
      data-template={template.kind}
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
          {template.kind === 'issue-form' ? (
            <IssueFormGuide info={template} kind={state.kind} value={state.single ?? ''} onChange={(value) => onState({ ...state, single: value })} />
          ) : (
            <>
              {template.kind === 'markdown' && mapping && <MarkdownTemplateNotice mapping={mapping} headings={template.template.headings.length} />}
              {template.kind === 'unknown' && <UnknownTemplateNotice reason={template.reason} />}
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
                    {template.kind === 'markdown' && (mappedHeading(id) ? ` · يُدرج تحت «${mappedHeading(id)}»` : '')}
                  </span>
                </div>
              ))}
              <div class="field">
                <label for="mj-composer-language">لغة العناوين</label>
                <select id="mj-composer-language" value={state.language} onChange={(event) => onState({ ...state, language: (event.currentTarget as HTMLSelectElement).value as LanguageChoice })}>
                  {LANGUAGES.map((l) => (
                    <option value={l.id} key={l.id}>
                      {l.label}
                      {l.id === 'auto' ? ` (الآن: ${composed.language === 'ar' ? 'عربية' : 'English'})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <PhrasebankSection selected={state.phrase ?? null} onSelect={(phrase) => onState({ ...state, phrase })} />
        </div>
        <div class="panel-foot">
          <div class="preview-box" data-section="preview">
            <h3 id="mj-composer-preview-title">
              {phrasing ? 'العبارة المختارة قبل الإدراج' : output.kind === 'edits' ? 'المسودة بعد ملء القالب (معاينة)' : output.kind === 'copy' ? 'معاينة النص للنسخ اليدوي' : 'المعاينة قبل الإدراج'}
            </h3>
            <pre class="preview" tabIndex={0} aria-labelledby="mj-composer-preview-title" data-empty={empty ? 'true' : 'false'} data-preview data-output={output.kind}>
              {empty ? 'اكتب في الحقول أعلاه أو اختر عبارة لتظهر هنا المعاينة الكاملة للنص الذي سيُدرج.' : preview}
            </pre>
            {phrasing && (
              <span class="note" data-note="phrase">
                العبارة المختارة تحل محل التنظيم في المعاينة ولا تُدرج إلا من الأزرار أدناه.{' '}
                <button type="button" class="btn" data-action="clear-phrase" onClick={() => onState({ ...state, phrase: null })}>
                  ألغِ العبارة
                </button>
              </span>
            )}
            {!empty && !phrasing && output.kind === 'block' && output.source === 'compose' && (
              <OmittedNote fields={state.fields} guide={guide} />
            )}
            {!empty && output.kind === 'edits' && (
              <span class="note" data-note="edits">
                {output.plan.mapped.length ? `يُدرج تحت عناوين القالب: ${output.plan.mapped.map((m) => `«${m.heading}»`).join('، ')}. ` : ''}
                {output.plan.appended.length ? `يُلحق في آخر المسودة (بلا عنوان مقابل في القالب): ${output.plan.appended.map((id) => guide[id].label).join('، ')}. ` : ''}
                لا يُحذف شيء من القالب.
              </span>
            )}
            {output.kind === 'copy' && (
              <span class="note" data-note="copy-only">
                هيكل القالب غير معروف: لا إدراج في حقول الصفحة. انسخ النص بزر النسخ (أو حدّده في المعاينة بنفسك) ثم الصقه حيث تريد.
              </span>
            )}
          </div>
          <p class="note" data-draft>
            مسودتك الحالية في حقل الكتابة: {arabicCount(draft.length)}. الإدراج لا يمسح منها شيئًا، ولا يُنشر ولا يُرسل شيء: أنت من يضغط زر الإرسال.
          </p>
          <div class="actions">
            {output.kind === 'block' && (
              <>
                <button type="button" class="btn btn-primary" data-action="insert-cursor" disabled={empty} onClick={() => onInsert('cursor', output)}>
                  أدرج عند المؤشر
                </button>
                <button type="button" class="btn" data-action="insert-append" disabled={empty} onClick={() => onInsert('append', output)}>
                  ألحق في نهاية المسودة
                </button>
              </>
            )}
            {output.kind === 'edits' && (
              <button type="button" class="btn btn-primary" data-action="insert-template" disabled={empty} onClick={() => onInsert('cursor', output)}>
                أدرج تحت عناوين القالب
              </button>
            )}
            {output.kind === 'copy' && (
              <button type="button" class="btn btn-primary" data-action="copy-text" disabled={empty} onClick={() => onCopy(output.text)}>
                انسخ النص
              </button>
            )}
            {output.kind !== 'copy' && (
              <button type="button" class="btn" data-action="undo" disabled={!canUndo} onClick={onUndo}>
                التراجع عن آخر إدراج
              </button>
            )}
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
      <TranslateDraftSection draft={draft} onInsert={onInsertText} />
    </section>
  );
}

function OmittedNote({ fields, guide }: { fields: ComposerFields; guide: (typeof FIELD_GUIDE)[ComposerKind] }) {
  const omitted = FIELD_IDS.filter((id) => !(fields[id] ?? '').trim());
  if (!omitted.length || omitted.length === FIELD_IDS.length) return null;
  return <span class="note">أقسام فارغة لن تُدرج: {omitted.map((id) => guide[id].label).join('، ')}.</span>;
}

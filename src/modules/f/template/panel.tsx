// واجهة حارس «القالب أولًا» داخل لوحة المساعد (F-F2 / AC-F2): بيانات الوضع الذي تعرّف عليه المساعد، وشرح ما يفعله وما لا يفعله فيه.
//  - Issue Form: دليل جانبي للحقل المفتوح وحده، وقائمة بحقول النموذج الأخرى للاطلاع فقط؛ لا يكتب المساعد فيها ولا يستبدل النموذج.
//  - قالب Markdown: يبقى القالب كما هو ويُدرج نص كل حقل تحت عنوانه المقابل؛ وما لا عنوان له يُلحق في آخر المسودة بعنوانه.
//  - هيكل غير معروف: لا إدراج في الصفحة؛ معاينة ونسخ يدوي.
import { FIELD_GUIDE } from '../composer/template';
import type { ComposerKind, FieldId } from '../composer/template';
import { FIELD_IDS } from './concepts';
import { conceptOf } from './concepts';
import type { TemplateInfo } from './detect';
import type { TemplateHeading } from './markdown';

const TYPE_LABELS = { input: 'حقل نصي', textarea: 'منطقة نص', dropdown: 'قائمة منسدلة', checkboxes: 'مربعات اختيار' } as const;

export function IssueFormGuide({
  info,
  kind,
  value,
  onChange,
}: {
  readonly info: Extract<TemplateInfo, { kind: 'issue-form' }>;
  readonly kind: ComposerKind;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const { current, fields } = info.form;
  const concept = conceptOf(current.label);
  const guide = concept ? FIELD_GUIDE[kind][concept] : null;
  return (
    <div class="template-block" data-template="issue-form" data-current-label={current.label}>
      <p class="note" data-template-notice="">
        <strong>بلاغ بنموذج (Issue Form).</strong> لا يستبدل المساعد النموذج ولا يتجاوز حقوله: هو دليل جانبي للحقل الذي فتحتَه منه وحده، ولا يكتب في غيره.
      </p>
      <div class="field" data-field="form-current">
        <label for="mj-composer-single">
          {current.label}
          {current.required && <span class="required" data-required=""> (إلزامي)</span>}
        </label>
        <textarea id="mj-composer-single" rows={4} dir="auto" spellcheck={false} aria-describedby="mj-composer-single-hint" value={value} onInput={(event) => onChange((event.currentTarget as HTMLTextAreaElement).value)} />
        <span class="hint" id="mj-composer-single-hint">
          {guide ? guide.hint : 'اكتب ما يطلبه هذا الحقل.'}
          {current.placeholder ? ` · نموذج الصفحة يقترح: ${current.placeholder}` : ''}
          {current.hint ? ` · ${current.hint}` : ''}
        </span>
      </div>
      <details class="form-overview" data-form-overview="">
        <summary>حقول النموذج (للاطلاع، لا يكتب المساعد فيها)</summary>
        <ul>
          {fields.map((field) => (
            <li key={field.label} data-form-field={field.label} data-current={field.current ? 'true' : 'false'}>
              {field.label} · {TYPE_LABELS[field.type]}
              {field.required ? ' · إلزامي' : ''}
              {field.current ? ' · هنا' : ''}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function MarkdownTemplateNotice({ mapping, headings }: { readonly mapping: ReadonlyMap<FieldId, TemplateHeading>; readonly headings: number }) {
  const mapped = new Map([...mapping].map(([id, heading]) => [id, heading.text] as const));
  return (
    <div class="template-block" data-template="markdown">
      <p class="note" data-template-notice="">
        <strong>قالب Markdown في الحقل ({headings} ترويسة).</strong> تبقى ترويسات القالب وقوائم التحقق وتعليقاته كما هي ولا يُحذف منها شيء: يُدرج المساعد نص كل حقل تحت عنوانه المقابل.
      </p>
      <ul class="mapping" data-mapping="">
        {FIELD_IDS.map((id: FieldId) => (
          <li key={id} data-map-field={id} data-mapped={mapped.has(id) ? 'true' : 'false'}>
            {mapped.has(id) ? `«${mapped.get(id)}»` : 'لا عنوان مقابل — يُلحق في آخر المسودة بعنوانه إن كتبتَ فيه'}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function UnknownTemplateNotice({ reason }: { readonly reason: string }) {
  return (
    <div class="template-block" data-template="unknown">
      <p class="note" role="status" data-template-notice="">
        <strong>لم يُتعرَّف على هيكل القالب في هذه الصفحة</strong> ({reason}). فلن يُدرج المساعد شيئًا في حقول الصفحة ولن يلمسها: تظهر أدناه معاينة النص، وتنسخه بنفسك وتلصقه حيث تريد.
      </p>
    </div>
  );
}

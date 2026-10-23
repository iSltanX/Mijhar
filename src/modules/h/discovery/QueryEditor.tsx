// محرر استعلام بحث: يعرض النص الكامل قابلًا للتعديل، ونتيجة فحص صياغته، ورابط الفتح. الرابط لا يُفتح إلا بنقر المستخدم عليه،
// ويُعطَّل (بلا href) ما دام في الاستعلام خطأ صياغة. (AC-H4)
import { searchUrl } from './queries';
import { validateQuery } from './validate';
import type { SearchType } from './validate';

export interface QueryEditorProps {
  readonly id: string;
  readonly label: string;
  readonly type: SearchType;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly openLabel?: string;
}

export function QueryEditor({ id, label, type, value, onChange, openLabel = 'افتح البحث في GitHub' }: QueryEditorProps) {
  const check = validateQuery(value, type);
  const href = check.ok ? searchUrl(value, type) : null;
  return (
    <div class="field" data-query-editor={id}>
      <label for={id}>{label}</label>
      <textarea id={id} dir="ltr" rows={2} spellcheck={false} value={value} aria-describedby={`${id}-issues`} onInput={(e) => onChange((e.currentTarget as HTMLTextAreaElement).value)} />
      <ul class="issues" id={`${id}-issues`} aria-live="polite">
        {check.issues.map((issue) => (
          <li key={issue.code + issue.message} data-severity={issue.severity} data-code={issue.code}>
            {issue.message}
          </li>
        ))}
      </ul>
      <div class="row">
        <a
          class="btn btn-primary"
          data-action="open-search"
          {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : { 'aria-disabled': 'true', role: 'link' })}
        >
          {openLabel}
        </a>
        <span class="muted small">{check.operators} من 5 معاملات</span>
      </div>
    </div>
  );
}

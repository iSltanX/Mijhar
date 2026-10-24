// عرض حالة الوصول وربط القراءة داخل بطاقة حالة طلب الدمج (T-11.5، AC-D8). نصٌّ لكل حالة ولا لون وحده؛ وما لم يُقرأ «غير معروف».
import type { ApiPrData } from '../blockers/api-read';
import { accessText } from './access';
import type { AccessState } from './access';
import { FIELD_TEXT, shortSha } from './binding';
import type { BindingMatch, ReadBinding } from './binding';

export const STATUS_CSS = `
.d-access { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mijhar-space-4); font-size: 12px; line-height: 18px; }
.d-access > li { padding: 2px var(--mijhar-space-8); border-inline-start: 3px solid var(--mijhar-border-default); }
.d-access > li[data-access-kind="read"] { border-inline-start-color: var(--mijhar-text-success); }
.d-access > li[data-access-kind="expired"], .d-access > li[data-access-kind="failed"] { border-inline-start-color: var(--mijhar-text-danger); }
.d-access > li[data-access-kind="insufficient"], .d-access > li[data-access-kind="rate-limited"], .d-access > li[data-access-kind="unavailable"] { border-inline-start-color: var(--mijhar-text-warning); }
.d-binding { display: flex; flex-wrap: wrap; gap: var(--mijhar-space-4) var(--mijhar-space-12); font-size: 12px; line-height: 18px; color: var(--mijhar-text-secondary); }
.d-binding bdi { color: var(--mijhar-text-primary); font-family: var(--mijhar-font-mono); }
.d-binding time { font-variant-numeric: tabular-nums; unicode-bidi: isolate; }
`;

const clock = (ms: number): string => new Date(ms).toLocaleTimeString('en-GB', { hour12: false });

const PARTS: ReadonlyArray<{ key: keyof ApiPrData['access']; text: string }> = [
  { key: 'pull', text: 'بيانات الطلب من API (قابلية الدمج وحالته)' },
  { key: 'checks', text: 'الفحوص من API (ومنها ما تطويه الصفحة)' },
  { key: 'required', text: 'الفحوص الإلزامية من حماية الفرع' },
];

/** حالة كل جزء من قراءة API. قبل أي قراءة: سطر واحد بالحالة العامة (لم تُطلب بعد أو بلا صلاحية). */
export function AccessReport({ data, before }: { data: ApiPrData | null; before: AccessState }) {
  if (!data) {
    return (
      <ul class="d-access" data-access={before.kind}>
        <li data-access-part="all" data-access-kind={before.kind}>
          {accessText('بيانات API (قابلية الدمج والفحوص المطوية والإلزامية)', before)}
        </li>
      </ul>
    );
  }
  const parts = data.access.pull.kind === 'read' ? PARTS : PARTS.slice(0, 1);
  return (
    <ul class="d-access" data-access={data.access.pull.kind}>
      {parts.map((part) => (
        <li key={part.key} data-access-part={part.key} data-access-kind={data.access[part.key].kind}>
          {accessText(part.text, data.access[part.key])}
        </li>
      ))}
    </ul>
  );
}

/** لأي مستودع وفرع والتزام قُرئت النتيجة ومتى. */
export function BindingLine({ binding }: { binding: ReadBinding }) {
  return (
    <p class="d-binding" data-binding="">
      <span data-binding-repo={binding.repo ?? ''}>
        المستودع: <bdi dir="ltr">{binding.repo ?? 'غير معروف'}</bdi>
      </span>
      <span data-binding-branch={binding.branch ?? ''}>
        الفرع: <bdi dir="ltr">{binding.branch ?? 'غير معروف'}</bdi>
      </span>
      <span data-binding-commit={binding.commit ?? ''}>
        الالتزام: <bdi dir="ltr">{shortSha(binding.commit) ?? 'غير معروف'}</bdi>
      </span>
      {binding.readAt !== null && (
        <span>
          قُرئت: <time dateTime={new Date(binding.readAt).toISOString()}>{clock(binding.readAt)}</time>
        </span>
      )}
    </p>
  );
}

/** نتيجة لقيم غير الظاهرة الآن: لا تُدمج، ويُعلن ما تغيّر. */
export function MismatchNotice({ read, page, match, data }: { read: ReadBinding; page: ReadBinding; match: Extract<BindingMatch, { same: false }>; data: ApiPrData }) {
  const changed = match.changed.map((f) => FIELD_TEXT[f]).join(' و');
  return (
    <p class="d-note" data-api-mismatch={match.changed.join(' ')}>
      بيانات API المقروءة لالتزام آخر (<bdi dir="ltr">{shortSha(read.commit) ?? 'غير معروف'}</bdi>
      {read.branch ? (
        <>
          {' '}
          على <bdi dir="ltr">{read.branch}</bdi>
        </>
      ) : null}
      ) غير الظاهر الآن (<bdi dir="ltr">{shortSha(page.commit) ?? 'رأس الصفحة غير معروف'}</bdi>
      {page.branch ? (
        <>
          {' '}
          على <bdi dir="ltr">{page.branch}</bdi>
        </>
      ) : null}
      )؛ تغيّر {changed}، فلا تُعرض على الظاهر ولا تُدمج في الملخص ولا في الموانع؛ أعد القراءة من API.
      {data.pull.available && (
        <>
          {' '}
          ما قُرئ لذلك الالتزام: <bdi dir="ltr">{`mergeable_state = ${data.pull.value.mergeableState ?? 'null'}`}</bdi>
          {data.checks.available ? `، وفحوصه ${data.checks.value.items.length}` : ''}.
        </>
      )}
    </p>
  );
}

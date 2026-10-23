// ملخص المقارنة (T-5.4): قسمان منفصلان هيكليًا (عنصران شقيقان لا يحتوي أحدهما الآخر) وبصريًا:
//  - «الملخص المؤكد»: الأرقام كما تعرضها الصفحة، وتصنيف الملفات المقروءة ومطابقته لها.
//  - «تفسير الأثر»: ملاحظات آلية موسومة «يحتاج مراجعة بشرية» بإطار متقطع ولون مختلف.
import { Val } from '../pr-status/view';
import { UNAVAILABLE_TEXT } from '../pr-status/value';
import { COMPARE_KIND_LABELS } from './extract';
import type { Agreement, CompareSummary } from './extract';
import { FILE_KINDS, FILE_KIND_LABELS } from './file-kinds';
import { IMPACT_REVIEW_LABEL, buildImpactNotes } from './impact';

const fmt = (n: number): string => n.toLocaleString('en-US');

const AGREEMENT_TEXT: Record<Agreement, string> = { match: 'يطابق الصفحة', mismatch: 'لا يطابق الصفحة', unknown: 'لا يمكن مطابقته بالصفحة' };

function Ref({ value }: { value: string }) {
  return (
    <bdi class="d-branch" dir="ltr">
      {value}
    </bdi>
  );
}

export function CompareFacts({ summary }: { summary: CompareSummary }) {
  const { page, read, reconciliation: rec } = summary;
  return (
    <section class="d-card" data-section="facts" aria-labelledby="mj-cmp-facts">
      <header>
        <h2 id="mj-cmp-facts">ملخص الملفات والتغييرات المؤكدة</h2>
        <span class="d-state" data-state="open" data-kind={summary.kind}>
          {COMPARE_KIND_LABELS[summary.kind]}
        </span>
      </header>
      <dl class="d-grid">
        <div data-field="refs">
          <dt>الطرفان</dt>
          <dd>
            <Val value={summary.base}>{(base) => <Ref value={base} />}</Val>
            <span class="d-arrow" aria-hidden="true">
              ...
            </span>
            <Val value={summary.head}>{(head) => <Ref value={head} />}</Val>
          </dd>
        </div>
        <div data-field="page-files">
          <dt>الملفات المتغيرة (كما تعرضها الصفحة)</dt>
          <dd>
            <Val value={page.files}>{(n) => fmt(n)}</Val>
          </dd>
        </div>
        <div data-field="page-lines">
          <dt>الأسطر المضافة / المحذوفة (كما تعرضها الصفحة)</dt>
          <dd>
            <Val value={page.additions}>{(n) => <span class="d-add">+{fmt(n)}</span>}</Val> / <Val value={page.deletions}>{(n) => <span class="d-del">−{fmt(n)}</span>}</Val>
          </dd>
        </div>
        <div data-field="read">
          <dt>الملفات المقروءة في الصفحة</dt>
          <dd data-agreement={rec.files}>
            {fmt(read.files)} <span class={rec.files === 'match' ? 'd-ok' : 'd-warn'}>— {AGREEMENT_TEXT[rec.files]}</span>
          </dd>
        </div>
      </dl>
      {read.files > 0 ? (
        <table class="d-table" data-table="by-kind">
          <caption class="sr-only">إحصاء الملفات المقروءة بحسب النوع</caption>
          <thead>
            <tr>
              <th scope="col">النوع</th>
              <th scope="col">الملفات</th>
              <th scope="col">المضاف</th>
              <th scope="col">المحذوف</th>
            </tr>
          </thead>
          <tbody>
            {FILE_KINDS.map((kind) => (
              <tr key={kind} data-kind={kind}>
                <th scope="row">{FILE_KIND_LABELS[kind]}</th>
                <td class="num">{summary.byKind[kind].files}</td>
                <td class="num">+{fmt(summary.byKind[kind].additions)}</td>
                <td class="num">−{fmt(summary.byKind[kind].deletions)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr data-kind="total">
              <th scope="row">المجموع المقروء</th>
              <td class="num">{read.files}</td>
              <td class="num" data-agreement={rec.additions}>
                +{fmt(read.additions)}
              </td>
              <td class="num" data-agreement={rec.deletions}>
                −{fmt(read.deletions)}
              </td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <p class="d-note" data-state="no-files">
          لا ملفات مقروءة في الصفحة بعد: عدد الملفات {UNAVAILABLE_TEXT} حتى تُحمَّل الفروقات.
        </p>
      )}
      {read.files > 0 && (
        <p class="d-note" data-completeness={rec.complete ? 'complete' : 'partial'}>
          {rec.complete
            ? 'قُرئت كل ملفات المقارنة، ومجموع أسطرها يطابق ما تعرضه الصفحة.'
            : 'الملفات المقروءة أقل من المعلن في الصفحة أو بلا أسطر معروضة؛ الأرقام المعتمدة هي ما تعرضه الصفحة، وتصنيف الأنواع جزئي.'}
        </p>
      )}
    </section>
  );
}

export function CompareImpact({ summary }: { summary: CompareSummary }) {
  const notes = buildImpactNotes(summary);
  return (
    <section class="d-card d-impact" data-section="impact" aria-labelledby="mj-cmp-impact">
      <header>
        <h2 id="mj-cmp-impact">تفسير الأثر</h2>
        <span class="d-tag" data-review="human">
          {IMPACT_REVIEW_LABEL}
        </span>
      </header>
      <p class="d-note">ملاحظات آلية من أسماء الملفات وأحجام التغيير، لا تقيس أثر الشيفرة ولا تُغني عن قراءة الفروقات. كل ملاحظة تذكر الرقم الذي بُنيت عليه.</p>
      {notes.length ? (
        <ul class="d-list" data-list="impact">
          {notes.map((note) => (
            <li key={note.id} data-note={note.id}>
              {note.text}
            </li>
          ))}
        </ul>
      ) : (
        <p data-state="no-notes">لم تُرصد ملاحظات آلية في هذه المقارنة، وهذا لا يعني خلوها من أثر.</p>
      )}
    </section>
  );
}

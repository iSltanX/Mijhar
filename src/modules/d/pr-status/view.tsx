// بطاقة ملخص حالة طلب الدمج (T-5.1): تُرسم في جذر Shadow DOM. كل قيمة ناقصة تُعرض «غير متاح» بسببها، والتصنيفات السبعة
// تُقال بالنص. لا تذكر البطاقة أن الطلب «جاهز للدمج»: نجاح الفحوص لا يعني جاهزية المشروع (يفسّر موانع الدمج T-5.2).
import type { ComponentChildren } from 'preact';
import { CATEGORY_LABELS, CHECK_CATEGORIES } from './categories';
import type { CheckCategory, CategoryCounts } from './categories';
import { PR_STATE_LABELS, REVIEW_LABELS } from './summary';
import type { BranchRef, CheckItem, ChecksSection, PrSummary } from './summary';
import { UNAVAILABLE_TEXT } from './value';
import type { Value } from './value';

export function Val<T>({ value, children }: { value: Value<T>; children: (value: T) => ComponentChildren }) {
  if (!value.available) {
    return (
      <span class="d-na" data-available="false" title={value.reason}>
        {UNAVAILABLE_TEXT}
      </span>
    );
  }
  return <span data-available="true">{children(value.value)}</span>;
}

const fmt = (n: number): string => n.toLocaleString('en-US');

function Branch({ branch }: { branch: BranchRef }) {
  return (
    <bdi class="d-branch" dir="ltr" title={branch.repo ? `${branch.repo}:${branch.branch}` : branch.branch}>
      {branch.branch}
    </bdi>
  );
}

function Chips({ counts, group }: { counts: CategoryCounts; group: string }) {
  return (
    <ul class="d-chips" data-group={group}>
      {CHECK_CATEGORIES.map((category) => (
        <li class="d-chip" data-category={category} data-zero={counts[category] === 0 ? 'true' : 'false'} key={category}>
          <span>{CATEGORY_LABELS[category]}</span>
          <span class="n">{counts[category]}</span>
        </li>
      ))}
    </ul>
  );
}

const LISTED: readonly CheckCategory[] = ['failure', 'running', 'cancelled', 'not-run', 'unknown'];
const LIST_LIMIT = 8;

function ItemList({ items }: { items: readonly CheckItem[] }) {
  const listed = items.filter((item) => LISTED.includes(item.classification.category));
  if (!listed.length) return null;
  return (
    <ul class="d-list">
      {listed.slice(0, LIST_LIMIT).map((item) => (
        <li key={`${item.id ?? ''}${item.name}`} data-category={item.classification.category}>
          <span class="name">{item.name}</span> — {CATEGORY_LABELS[item.classification.category]}
          {item.classification.note ? ` (${item.classification.note})` : ''}
        </li>
      ))}
      {listed.length > LIST_LIMIT && <li>…و{listed.length - LIST_LIMIT} أخرى</li>}
    </ul>
  );
}

function countsOf(items: readonly CheckItem[]): CategoryCounts {
  const counts: Record<CheckCategory, number> = { success: 0, failure: 0, running: 0, skipped: 0, cancelled: 0, 'not-run': 0, unknown: 0 };
  for (const item of items) counts[item.classification.category] += 1;
  return counts;
}

export function ChecksView({ checks, loading }: { checks: ChecksSection; loading: boolean }) {
  const required = checks.items.filter((item) => item.required === true);
  const optional = checks.items.filter((item) => item.required !== true);
  return (
    <section class="d-group" data-section="checks" aria-labelledby="mj-pr-checks">
      <h3 id="mj-pr-checks">الفحوص</h3>
      {checks.rollup.available && (
        <p class="d-note" data-rollup={checks.rollup.value.tone}>
          الرمز المجمَّع لآخر التزام ظاهر في المحادثة: <bdi dir="ltr">{checks.rollup.value.label}</bdi>
        </p>
      )}
      {checks.items.length > 0 ? (
        <>
          {checks.requiredKnown ? (
            <>
              <div data-group="required">
                <strong>الإلزامية ({required.length})</strong>
                <Chips counts={countsOf(required)} group="required" />
                <ItemList items={required} />
              </div>
              <div data-group="optional">
                <strong>الاختيارية ({optional.length})</strong>
                <Chips counts={countsOf(optional)} group="optional" />
                <ItemList items={optional} />
              </div>
            </>
          ) : (
            <div data-group="all">
              <p class="d-note" data-required="unavailable">
                الإلزامية: <span class="d-na" data-available="false" title="لا تعرض الصفحة شارة Required إلا للمسجَّل في صندوق الدمج">{UNAVAILABLE_TEXT}</span> — لا تفرّق هذه
                الصفحة الفحوص الإلزامية من الاختيارية، فتُعرض كلها معًا.
              </p>
              <Chips counts={checks.counts} group="all" />
              <ItemList items={checks.items} />
            </div>
          )}
        </>
      ) : loading ? (
        <p class="d-note" data-checks-state="loading">جارٍ قراءة تفاصيل الفحوص…</p>
      ) : checks.noneReported ? (
        <p data-checks-state="none-reported">لا فحوص مُبلَّغ عنها لهذا الالتزام (وليس هذا «قيد التشغيل»).</p>
      ) : checks.error ? (
        <p class="d-note" data-checks-state="error">
          تعذّرت قراءة تفاصيل الفحوص ({checks.error}) — فهي <span class="d-na" data-available="false">{UNAVAILABLE_TEXT}</span> وليست ناجحة.
        </p>
      ) : (
        <p data-checks-state="unavailable">
          تفاصيل الفحوص <span class="d-na" data-available="false" title="لا صفوف فحوص ظاهرة في هذه الصفحة">{UNAVAILABLE_TEXT}</span>؛ افتح تبويب Checks.
        </p>
      )}
    </section>
  );
}

export function PrStatusCard({ summary, loading = false }: { summary: PrSummary; loading?: boolean }) {
  return (
    <section class="d-card" data-card="pr-status" aria-labelledby="mj-pr-title">
      <header>
        <h2 id="mj-pr-title">ملخص حالة طلب الدمج</h2>
        <Val value={summary.state}>
          {(state) => (
            <span class="d-state" data-state={state}>
              {PR_STATE_LABELS[state]}
            </span>
          )}
        </Val>
      </header>
      <dl class="d-grid">
        <div data-field="branches">
          <dt>الفرع المصدر ← الهدف</dt>
          <dd>
            <Val value={summary.head}>{(head) => <Branch branch={head} />}</Val>
            <span class="d-arrow" aria-hidden="true">
              ←
            </span>
            <span class="sr-only">إلى</span>
            <Val value={summary.base}>{(base) => <Branch branch={base} />}</Val>
          </dd>
        </div>
        <div data-field="behind">
          <dt>التأخر عن الهدف</dt>
          <dd>
            <Val value={summary.behind}>{() => 'متأخر عن فرع الهدف'}</Val>
          </dd>
        </div>
        <div data-field="commits">
          <dt>الالتزامات</dt>
          <dd>
            <Val value={summary.commits}>{(n) => fmt(n)}</Val>
          </dd>
        </div>
        <div data-field="files">
          <dt>الملفات المتغيرة</dt>
          <dd>
            <Val value={summary.files}>{(n) => fmt(n)}</Val>
          </dd>
        </div>
        <div data-field="lines">
          <dt>الأسطر المضافة / المحذوفة</dt>
          <dd>
            <Val value={summary.additions}>{(n) => <span class="d-add">+{fmt(n)}</span>}</Val> / <Val value={summary.deletions}>{(n) => <span class="d-del">−{fmt(n)}</span>}</Val>
          </dd>
        </div>
        <div data-field="reviews">
          <dt>المراجعات</dt>
          <dd>
            <Val value={summary.reviews}>{(review) => REVIEW_LABELS[review.state]}</Val>
          </dd>
        </div>
        <div data-field="conflicts">
          <dt>التعارضات</dt>
          <dd>
            <Val value={summary.conflicts}>{(has) => (has ? 'يوجد تعارض يجب حله' : 'لا تعارضات')}</Val>
          </dd>
        </div>
      </dl>
      <ChecksView checks={summary.checks} loading={loading} />
      <p class="d-note">ملخص لما تعرضه الصفحة وقت قراءتها، وليس حكمًا بجاهزية الدمج؛ وما لم تعرضه الصفحة يظهر «{UNAVAILABLE_TEXT}» ولا يُخمَّن.</p>
    </section>
  );
}

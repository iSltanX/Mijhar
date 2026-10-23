// عرض موانع الدمج بأدلتها، وشارة المصدر والتقادم، ولوحة API العامة داخل بطاقة حالة الطلب (T-5.2). كل مانع معه دليله منقولًا ومصدره،
// والتنبيه المنهجي ظاهر دائمًا، ولا عبارة تجزم بإمكان الدمج.
import type { PublicApiStatus } from '../../../core/api';
import type { ApiPrData } from './api-read';
import { METHOD_NOTICE } from './explain';
import type { Blocker, BlockersReport } from './explain';
import type { FreshnessAlert } from './freshness';

export const clock = (ms: number): string => new Date(ms).toLocaleTimeString('en-GB', { hour12: false });

/** عدد الدقائق بصيغة العدد العربية: دقيقة واحدة، دقيقتان، 3–10 دقائق، 11 دقيقة فأكثر. */
export function minutesText(n: number): string {
  if (n === 1) return 'دقيقة واحدة';
  if (n === 2) return 'دقيقتان';
  if (n >= 3 && n <= 10) return `${n} دقائق`;
  return `${n} دقيقة`;
}

function At({ ms }: { ms: number }) {
  return (
    <time dateTime={new Date(ms).toISOString()} dir="ltr">
      {clock(ms)}
    </time>
  );
}

const SOURCE_TEXT: Readonly<Record<'dom' | 'api', string>> = { dom: 'الصفحة', api: 'API' };

function BlockerItem({ item }: { item: Blocker }) {
  return (
    <li data-blocker={item.id} data-certainty={item.certainty}>
      <strong>{item.title}</strong>
      <ul class="d-evidence-list">
        {item.evidence.map((e) => (
          <li key={`${e.source}-${e.text}`} data-evidence-source={e.source}>
            <span class="d-src">{SOURCE_TEXT[e.source]}</span> <span class="d-where">{e.where}</span>: «<bdi class="d-quote" dir="auto">{e.text}</bdi>»
            {e.note ? <> — {e.note}</> : null}
          </li>
        ))}
      </ul>
    </li>
  );
}

export function BlockersView({ report }: { report: BlockersReport }) {
  return (
    <section class="d-group d-blockers" data-section="blockers" aria-labelledby="mj-pr-blockers">
      <h3 id="mj-pr-blockers">ما يمنع الدمج بحسب الأدلة</h3>
      {report.state === 'closed' ? null : report.blockers.length ? (
        <ul class="d-blocker-list" data-certainty="blocks">
          {report.blockers.map((b) => (
            <BlockerItem key={b.id} item={b} />
          ))}
        </ul>
      ) : report.state === 'explained' ? (
        <p data-blockers-state="none-found">لم يُرصد في الأدلة المقروءة مانعٌ صريح؛ وغيابه فيها لا يثبت أن الدمج ممكن أو مأمون.</p>
      ) : (
        <p data-blockers-state="unavailable">موانع الدمج غير متاحة من الأدلة الحالية.</p>
      )}
      {report.attention.length > 0 && (
        <>
          <h4>قد يمنع الدمج (الدليل لا يحسم)</h4>
          <ul class="d-blocker-list" data-certainty="may-block">
            {report.attention.map((b) => (
              <BlockerItem key={b.id} item={b} />
            ))}
          </ul>
        </>
      )}
      {report.notes.map((note) => (
        <p class="d-note" key={note}>
          {note}
        </p>
      ))}
      <p class="d-method" data-notice="method" role="note">
        {METHOD_NOTICE}
      </p>
    </section>
  );
}

function AlertLine({ alert, onRefresh, onApiRefresh }: { alert: FreshnessAlert; onRefresh: () => void; onApiRefresh: (() => void) | null }) {
  switch (alert.kind) {
    case 'collapsed':
      return (
        <li data-alert="collapsed">
          قائمة الفحوص مطوية أو ناقصة: قُرئ {alert.info.read} من {alert.info.expected}{' '}
          {alert.info.basis === 'rollup' ? (
            <>
              (الرمز المجمَّع لالتزام الرأس يعلن «<bdi dir="ltr">{alert.info.label}</bdi>»)
            </>
          ) : (
            '(فحوص API ‏— check-runs أو commit statuses ‏— أكثر من حد الصفحات المقروءة)'
          )}
          . ما لم يُقرأ لا يُعدّ ناجحًا.
        </li>
      );
    case 'stale':
      return (
        <li data-alert="stale">
          مضت {minutesText(alert.minutes)} على آخر قراءة دون تحديث حي؛ قد تكون البيانات قديمة.{' '}
          <button type="button" class="d-button" data-action="refresh" onClick={onRefresh}>
            أعد القراءة
          </button>
        </li>
      );
    case 'live-update':
      return (
        <li data-alert="live-update">
          ورد تحديث حي في الصفحة <At ms={alert.at} /> فأُعيدت قراءتها.
          {alert.apiOutdated && (
            <>
              {' '}
              بيانات API قُرئت قبله.{' '}
              {onApiRefresh && (
                <button type="button" class="d-button" data-action="api-refresh" onClick={onApiRefresh}>
                  حدّث من API
                </button>
              )}
            </>
          )}
        </li>
      );
    case 'api-stale':
      return <li data-alert="api-stale">مضت {minutesText(alert.minutes)} على قراءة API؛ قد تكون قديمة.</li>;
  }
}

export interface FreshnessBadgeProps {
  readonly sources: readonly ('dom' | 'api')[];
  /** MJ15 (T-5.5): قراءة API بالرمز المحفوظ في الخلفية. */
  readonly authenticated?: boolean;
  readonly domReadAt: number;
  readonly apiReadAt: number | null;
  readonly alerts: readonly FreshnessAlert[];
  readonly onRefresh: () => void;
  readonly onApiRefresh: (() => void) | null;
}

export function FreshnessBadge({ sources, domReadAt, apiReadAt, alerts, onRefresh, onApiRefresh, authenticated = false }: FreshnessBadgeProps) {
  const label = sources.includes('api') ? (authenticated ? 'DOM + API (بالرمز)' : 'DOM + API') : 'DOM';
  return (
    <div class="d-freshness" data-source={label}>
      <p class="d-badge">
        <span>
          المصدر: <bdi dir="ltr">{label}</bdi>
        </span>
        <span>
          آخر قراءة للصفحة: <At ms={domReadAt} />
        </span>
        {apiReadAt !== null && (
          <span>
            قراءة API: <At ms={apiReadAt} />
          </span>
        )}
      </p>
      {alerts.length > 0 && (
        <ul class="d-alerts" role="status">
          {alerts.map((alert) => (
            <AlertLine key={alert.kind} alert={alert} onRefresh={onRefresh} onApiRefresh={onApiRefresh} />
          ))}
        </ul>
      )}
    </div>
  );
}

export interface ApiPanelProps {
  readonly status: PublicApiStatus | null;
  readonly loading: boolean;
  readonly data: ApiPrData | null;
  readonly onRead: () => void;
  readonly onOpenSettings: () => void;
  /** قراءة API لالتزام غير الرأس الظاهر (VR-03): تُعرض منفصلة بتنبيه ولا تُدمج. */
  readonly mismatch?: { readonly apiHead: string; readonly pageHead: string | null } | null;
}

/** لوحة API العامة: لا طلب إلا بنقر صريح، والصلاحية تُمنح من الإعدادات لا من الصفحة. */
export function ApiPanel({ status, loading, data, onRead, onOpenSettings, mismatch = null }: ApiPanelProps) {
  const rate = data?.rate ?? status?.rate ?? null;
  return (
    <div class="d-api" data-section="api">
      {status === null ? null : !status.granted ? (
        <p class="d-note" data-api-state="not-granted">
          بيانات GitHub API العامة (حالة قابلية الدمج وكل الفحوص) تحتاج صلاحية <bdi dir="ltr">api.github.com</bdi> الاختيارية.{' '}
          <button type="button" class="d-button" data-action="open-settings" onClick={onOpenSettings}>
            افتح الإعدادات
          </button>
        </p>
      ) : (
        <p class="d-note" data-api-state={loading ? 'loading' : data ? 'read' : 'ready'}>
          <button type="button" class="d-button" data-action="api-read" disabled={loading} onClick={onRead}>
            {loading ? 'جارٍ القراءة من API…' : data ? 'حدّث من GitHub API العامة' : 'أكمل من GitHub API العامة'}
          </button>{' '}
          {status.authenticated ? (
            <span data-api-auth="token">طلبات قراءة فقط برمز الوصول المحفوظ في الإضافة</span>
          ) : (
            'أربعة طلبات عامة بلا رمز'
          )}
          {rate && rate.remaining !== null && rate.limit !== null && (
            <>
              {' '}
              · المتبقي من الحد <bdi dir="ltr">{`${rate.remaining}/${rate.limit}`}</bdi>
              {rate.reset !== null && (
                <>
                  {' '}
                  حتى <At ms={rate.reset * 1000} />
                </>
              )}
            </>
          )}
        </p>
      )}
      {data && (data.pull.available ? null : <p class="d-note" data-api-error="pull">تعذّرت قراءة API: {data.pull.reason}</p>)}
      {data?.pull.available && !data.checks.available && <p class="d-note" data-api-error="checks">فحوص API غير متاحة: {data.checks.reason}</p>}
      {data?.checks.available && data.checks.value.note && (
        <p class="d-note" data-api-via={data.checks.value.via ?? ''}>
          {data.checks.value.note}
        </p>
      )}
      {mismatch && data?.pull.available && (
        <p class="d-note" data-api-mismatch="">
          بيانات API المقروءة لالتزام آخر (<bdi dir="ltr">{mismatch.apiHead.slice(0, 7)}</bdi>)
          {mismatch.pageHead ? (
            <>
              {' '}
              غير الظاهر الآن (<bdi dir="ltr">{mismatch.pageHead.slice(0, 7)}</bdi>)
            </>
          ) : (
            ' ورأس الصفحة غير معروف'
          )}
          ، فلا تُدمج في الملخص ولا في الموانع؛ أعد القراءة من API. ما قُرئ لذلك الالتزام: <bdi dir="ltr">{`mergeable_state = ${data.pull.value.mergeableState ?? 'null'}`}</bdi>
          {data.checks.available ? `، وفحوصه ${data.checks.value.items.length}` : ''}.
        </p>
      )}
    </div>
  );
}

// قراءة طلب الدمج من GitHub REST العامة (T-5.2) على ما قاسته evidence/T-0.3: الطلب نفسه (draft وmergeable وmergeable_state)،
// وcheck-runs لالتزام الرأس بتصفّح الصفحات، وcommit status المجمَّع، وسياقات الفحوص الإلزامية من حماية فرع الهدف.
// كل جزء Value مستقل بسبب فشله، فلا يُسقط فشلُ جزء غيرَه ولا يُعرض نجاحًا.
// MJ18 (T-11.5): ومع كل جزء حالة وصوله المصنّفة (منتهٍ، ناقص الصلاحية، متجاوز الحد، غير متاح…)، والقراءة مربوطة بالمستودع وفرع الرأس
// والتزامه ووقتها.
import type { PublicApiPort, PublicApiResult, RateLimit } from '../../../core/api';
import { accessOf } from '../status/access';
import type { AccessState } from '../status/access';
import type { ReadBinding } from '../status/binding';
import { classifyCheckRun, classifyCommitStatus } from '../pr-status/categories';
import { ACTIONS_ONLY_NOTE, readActionsChecks } from '../token/actions-checks';
import type { CheckItem } from '../pr-status/summary';
import { have, missing } from '../pr-status/value';
import type { Value } from '../pr-status/value';

export interface ApiPull {
  readonly number: number;
  readonly state: string;
  readonly draft: boolean;
  readonly merged: boolean;
  /** true/false/null كما في الحقل: null = لم يحسبه GitHub بعد. */
  readonly mergeable: boolean | null;
  /** القيمة كما هي (clean، dirty، blocked، behind، unstable، draft، has_hooks، unknown). */
  readonly mergeableState: string | null;
  readonly headSha: string;
  readonly baseRef: string;
  /** MJ18: فرع الرأس كما أعادته API (head.ref)، أو null. */
  readonly headRef: string | null;
}

export interface ApiChecks {
  readonly items: readonly CheckItem[];
  readonly checkRunsTotal: number | null;
  readonly statusesTotal: number | null;
  /** ما قُرئ فعلًا من كل مصدر، ليُقارن كلٌّ بإجماليه. */
  readonly checkRunsRead: number;
  readonly statusesRead: number;
  /** لم تُقرأ كل check-runs أو كل commit statuses (أكثر من حد الصفحات، VR-06). */
  readonly partial: boolean;
  /** check-runs = 0 وcommit status = 0 معًا: لا فحوص مُبلَّغ عنها (لا «قيد التشغيل»). */
  readonly noneReported: boolean;
  /** MJ15 (T-5.5): actions = check-runs رُفضت للرمز في مستودع خاص فقُرئت مهام Actions بدلها، ومعها ما لم يُتح. */
  readonly via?: 'actions';
  readonly note?: string;
}

export interface ApiPrData {
  readonly readAt: number;
  readonly pull: Value<ApiPull>;
  readonly checks: Value<ApiChecks>;
  /** سياقات الفحوص الإلزامية من branches/{base}، أو غياب بسببه (الفرع غير محمي يعني أن الحماية لا تذكر شيئًا، لا أن لا إلزامي). */
  readonly required: Value<readonly string[]>;
  readonly rate: RateLimit | null;
  /** الطلبات التي أُجريت (للعرض وتدقيق الشبكة). */
  readonly requests: readonly string[];
  /** MJ15 (T-5.5): قُرئت برمز الوصول المحفوظ في الخلفية (لا يحمل الرمز). */
  readonly authenticated?: true;
  /** MJ18 (T-11.5): حالة وصول كل جزء. */
  readonly access: { readonly pull: AccessState; readonly checks: AccessState; readonly required: AccessState };
  /** MJ18 (T-11.5): لأي مستودع وفرع والتزام قُرئت ومتى. */
  readonly binding: ReadBinding;
}

interface RawPull {
  number?: unknown;
  state?: unknown;
  draft?: unknown;
  merged?: unknown;
  mergeable?: unknown;
  mergeable_state?: unknown;
  head?: { sha?: unknown; ref?: unknown };
  base?: { ref?: unknown };
}

interface RawRun {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  conclusion?: unknown;
  output?: { title?: unknown };
}

interface RawStatus {
  context?: unknown;
  state?: unknown;
  description?: unknown;
}

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

const failureText = (result: PublicApiResult<unknown>): string => {
  if (result.ok) return '';
  const when = result.retryAt ? ` حتى ${new Date(result.retryAt).toLocaleTimeString('en-GB')}` : '';
  switch (result.failure) {
    case 'permission':
      return 'لم تُمنح صلاحية api.github.com الاختيارية';
    case 'rate-limit':
      return `بلغ حد الطلبات العامة${when}`;
    case 'not-found':
      return result.authenticated ? 'غير موجود أو لا يشمله الرمز (404)' : 'غير موجود أو غير عام (404)';
    default:
      return result.message;
  }
};

const enc = encodeURIComponent;

export async function readPrApi(port: PublicApiPort, owner: string, repo: string, number: number, now: () => number = () => Date.now()): Promise<ApiPrData> {
  const base = `/repos/${enc(owner)}/${enc(repo)}`;
  const requests: string[] = [];
  const pullPath = `${base}/pulls/${number}`;
  requests.push(pullPath);
  const pullResult = await port.get<RawPull>(pullPath);
  const auth = pullResult.authenticated ? ({ authenticated: true } as const) : {};
  const repoName = `${owner}/${repo}`;
  if (!pullResult.ok) {
    const reason = failureText(pullResult);
    const access = accessOf(pullResult);
    const readAt = now();
    return { readAt, pull: missing(reason), checks: missing(reason), required: missing(reason), rate: pullResult.rate, requests, ...auth, access: { pull: access, checks: access, required: access }, binding: { repo: repoName, branch: null, commit: null, readAt } };
  }
  const raw = pullResult.data;
  const headSha = str(raw.head?.sha);
  const baseRef = str(raw.base?.ref);
  if (!headSha || !baseRef) {
    const reason = 'استجابة الطلب بلا head.sha أو base.ref';
    const access: AccessState = { kind: 'failed', authenticated: Boolean(pullResult.authenticated), reason };
    const readAt = now();
    return { readAt, pull: missing(reason), checks: missing(reason), required: missing(reason), rate: pullResult.rate, requests, ...auth, access: { pull: access, checks: access, required: access }, binding: { repo: repoName, branch: str(raw.head?.ref), commit: headSha, readAt } };
  }
  const pull: ApiPull = {
    number: typeof raw.number === 'number' ? raw.number : number,
    state: str(raw.state) ?? 'unknown',
    draft: raw.draft === true,
    merged: raw.merged === true,
    mergeable: typeof raw.mergeable === 'boolean' ? raw.mergeable : null,
    mergeableState: str(raw.mergeable_state),
    headSha,
    baseRef,
    headRef: str(raw.head?.ref),
  };

  const runsPath = `${base}/commits/${headSha}/check-runs`;
  const statusPath = `${base}/commits/${headSha}/status`;
  const branchPath = `${base}/branches/${enc(baseRef)}`;
  requests.push(runsPath, statusPath, branchPath);
  const [runs, statuses, branch] = await Promise.all([
    port.getAll<RawRun>(runsPath, 'check_runs', 3),
    port.getAll<RawStatus>(statusPath, 'statuses', 1),
    port.get<{ protected?: unknown; protection?: { required_status_checks?: { contexts?: unknown } } }>(branchPath),
  ]);

  let required: Value<readonly string[]>;
  if (!branch.ok) required = missing(failureText(branch));
  else {
    const contexts = branch.data.protection?.required_status_checks?.contexts;
    if (branch.data.protected === false) required = missing('فرع الهدف غير محمي في API، وقد تفرض قواعد أخرى (rulesets) فحوصًا إلزامية لا تظهر هنا');
    else if (Array.isArray(contexts)) required = have(contexts.filter((c): c is string => typeof c === 'string'));
    else required = missing('لا تذكر حماية الفرع فحوصًا إلزامية');
  }
  const requiredSet = new Set(required.available ? required.value : []);

  // MJ15 (T-5.5): مستودع خاص بالرمز ترفض فيه check-runs (403، لا صلاحية Checks للرموز دقيقة الحبيبات): تُقرأ مهام Actions بدلها.
  const actions = !runs.ok && runs.failure === 'forbidden' && runs.authenticated ? await readActionsChecks(port, base, headSha, requiredSet) : null;
  if (actions) requests.push(...actions.requests);

  let checks: Value<ApiChecks>;
  if (actions && statuses.ok) {
    if (!actions.ok) checks = missing(`check-runs: ${failureText(runs)}؛ ${actions.reason}`);
    else {
      const items: CheckItem[] = [...actions.value.items];
      for (const status of statuses.data.items) {
        const name = str(status.context);
        if (!name) continue;
        items.push({ name, id: null, classification: classifyCommitStatus(status.state), required: requiredSet.has(name) ? true : null, detail: str(status.description), source: 'api' });
      }
      const statusesTotal = statuses.data.total ?? statuses.data.items.length;
      checks = have({
        items,
        checkRunsTotal: actions.value.jobsTotal,
        statusesTotal,
        checkRunsRead: actions.value.jobsRead,
        statusesRead: statuses.data.items.length,
        partial: actions.value.partial || statuses.data.partial,
        // فحوص التطبيقات الأخرى لا تُقرأ بالرمز: لا يُدّعى «لا فحوص».
        noneReported: false,
        via: 'actions',
        note: ACTIONS_ONLY_NOTE,
      });
    }
  } else if (!runs.ok || !statuses.ok) {
    checks = missing(`check-runs: ${runs.ok ? 'قُرئت' : failureText(runs)}؛ commit status: ${statuses.ok ? 'قُرئت' : failureText(statuses)}`);
  } else {
    const items: CheckItem[] = [];
    for (const run of runs.data.items) {
      const name = str(run.name);
      if (!name) continue;
      items.push({
        name,
        id: typeof run.id === 'number' || typeof run.id === 'string' ? String(run.id) : null,
        classification: classifyCheckRun(run),
        required: requiredSet.has(name) ? true : null,
        detail: str(run.output?.title),
        source: 'api',
      });
    }
    for (const status of statuses.data.items) {
      const name = str(status.context);
      if (!name) continue;
      items.push({ name, id: null, classification: classifyCommitStatus(status.state), required: requiredSet.has(name) ? true : null, detail: str(status.description), source: 'api' });
    }
    const runsTotal = runs.data.total;
    const statusesTotal = statuses.data.total ?? statuses.data.items.length;
    checks = have({
      items,
      checkRunsTotal: runsTotal,
      statusesTotal,
      checkRunsRead: runs.data.items.length,
      statusesRead: statuses.data.items.length,
      partial: runs.data.partial || statuses.data.partial,
      noneReported: runsTotal === 0 && statusesTotal === 0,
    });
  }
  const rate = [runs, statuses, branch].reduce<RateLimit | null>((latest, r) => (r.rate && (!latest || r.rate.readAt >= latest.readAt) ? r.rate : latest), pullResult.rate);
  // حالة وصول الفحوص: أول ما فشل مما بُنيت عليه؛ وcheck-runs المرفوضة للرمز لا تُحسب حين قامت مهام Actions مقامها.
  const checksSources: PublicApiResult<unknown>[] = actions ? [statuses, ...(actions.ok ? [] : actions.failure ? [actions.failure] : [runs])] : [runs, statuses];
  const checksFailed = checks.available ? null : checksSources.find((r) => !r.ok);
  const checksAccess: AccessState = checksFailed ? accessOf(checksFailed) : checks.available ? { kind: 'read', authenticated: Boolean(pullResult.authenticated) } : { kind: 'failed', authenticated: Boolean(pullResult.authenticated), reason: checks.reason };
  const requiredAccess: AccessState = branch.ok ? { kind: 'read', authenticated: Boolean(branch.authenticated) } : accessOf(branch);
  const readAt = now();
  return {
    readAt,
    pull: have(pull),
    checks,
    required,
    rate,
    requests,
    ...auth,
    access: { pull: accessOf(pullResult), checks: checksAccess, required: requiredAccess },
    binding: { repo: repoName, branch: pull.headRef, commit: headSha, readAt },
  };
}

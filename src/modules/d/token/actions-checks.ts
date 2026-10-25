// فحوص Actions لالتزام الرأس بالرمز (T-5.5، AC-D7). في المستودع الخاص ترفض check-runs الرمزَ دقيق الحبيبات (403: لا صلاحية Checks
// لهذه الرموز، evidence/T-0.5)، فتُقرأ مهام Actions نفسها بصلاحية Actions: read: تشغيلات التزام الرأس ثم مهام كل تشغيل بخطواتها. ومعرّف
// المهمة هو معرّف check run نفسه، فتطابق صفوف الصفحة في الدمج. وفحوص التطبيقات الأخرى (غير Actions) تبقى غير متاحة بالرمز وتُعلن.
import type { PublicApiPort, PublicApiResult } from '../../../core/api';
import { classifyCheckRun } from '../pr-status/categories';
import type { CheckItem } from '../pr-status/summary';
import { squash } from '../pr-status/value';

interface RawRun {
  id?: unknown;
}

interface RawStep {
  name?: unknown;
  number?: unknown;
  conclusion?: unknown;
}

interface RawJob {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  conclusion?: unknown;
  steps?: unknown;
}

export interface ActionsChecks {
  readonly items: readonly CheckItem[];
  /** مجموع مهام التشغيلات المقروءة كما أعلنتها total_count، أو null. */
  readonly jobsTotal: number | null;
  readonly jobsRead: number;
  readonly runsTotal: number | null;
  readonly runsRead: number;
  /** لم تُقرأ كل التشغيلات أو كل المهام. */
  readonly partial: boolean;
}

/** failure: نتيجة الطلب الذي فشل (بلا الرمز)، لتُصنَّف حالة وصوله (T-11.5). */
export type ActionsResult = ({ readonly ok: true; readonly value: ActionsChecks } | { readonly ok: false; readonly reason: string; readonly failure?: PublicApiResult<unknown> }) & { readonly requests: readonly string[] };

/** أقصى عدد تشغيلات تُقرأ مهامها لالتزام واحد. */
export const MAX_ACTIONS_RUNS = 10;

export const ACTIONS_ONLY_NOTE = 'فحوص المستودع الخاص من مهام Actions بالرمز؛ وفحوص التطبيقات الأخرى (check-runs) لا تُقرأ برمز الوصول بصلاحيات محددة فهي غير متاحة هنا.';

const FAILED_STEP = new Set(['failure', 'timed_out', 'cancelled', 'startup_failure']);

const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/** أول خطوة لم تنجح في المهمة، بصيغة «الخطوة n: الاسم (النتيجة)»، أو null. */
export function failedStep(steps: unknown): string | null {
  if (!Array.isArray(steps)) return null;
  for (const step of steps as RawStep[]) {
    const conclusion = str(step.conclusion);
    if (!conclusion || !FAILED_STEP.has(conclusion)) continue;
    const name = squash(str(step.name));
    const number = typeof step.number === 'number' ? step.number : null;
    return `${number !== null ? `الخطوة ${number}` : 'خطوة'}: ${name || 'بلا اسم'} (${conclusion})`;
  }
  return null;
}

const reasonOf = (result: PublicApiResult<unknown>): string => (result.ok ? '' : result.message);

export async function readActionsChecks(port: PublicApiPort, base: string, headSha: string, required: ReadonlySet<string>): Promise<ActionsResult> {
  const runsPath = `${base}/actions/runs?head_sha=${encodeURIComponent(headSha)}`;
  const requests: string[] = [runsPath];
  const runs = await port.getAll<RawRun>(runsPath, 'workflow_runs', 1);
  if (!runs.ok) return { ok: false, reason: `تشغيلات Actions: ${reasonOf(runs)}`, failure: runs, requests };
  const ids = runs.data.items.map((r) => r.id).filter((id): id is number => typeof id === 'number');
  const chosen = ids.slice(0, MAX_ACTIONS_RUNS);
  const paths = chosen.map((id) => `${base}/actions/runs/${id}/jobs`);
  requests.push(...paths);
  const jobsResults = await Promise.all(paths.map((path) => port.getAll<RawJob>(path, 'jobs', 1)));
  const failed = jobsResults.find((r) => !r.ok);
  if (failed && !failed.ok) return { ok: false, reason: `مهام Actions: ${failed.message}`, failure: failed, requests };

  const items: CheckItem[] = [];
  let jobsTotal: number | null = 0;
  let partial = runs.data.partial || ids.length > chosen.length;
  for (const result of jobsResults) {
    if (!result.ok) continue;
    jobsTotal = jobsTotal !== null && result.data.total !== null ? jobsTotal + result.data.total : null;
    partial ||= result.data.partial;
    for (const job of result.data.items) {
      const name = str(job.name);
      if (!name) continue;
      items.push({
        name,
        id: typeof job.id === 'number' || typeof job.id === 'string' ? String(job.id) : null,
        classification: classifyCheckRun(job),
        required: required.has(name) ? true : null,
        detail: failedStep(job.steps),
        source: 'api',
      });
    }
  }
  return { ok: true, value: { items, jobsTotal, jobsRead: items.length, runsTotal: runs.data.total, runsRead: chosen.length, partial }, requests };
}

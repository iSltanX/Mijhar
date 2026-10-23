// فحص صلاحية الروابط وحالة المستودعات عند الطلب (T-9.5): بنقر صريح، وروابط github.com وحدها عبر api.github.com بالصلاحية الاختيارية.
// الروابط الخارجية لا تُفحص آليًا ولا يصدر لها طلب، وتبقى حالتها لمراجعة بشرية. الفشل لا يغيّر حالة محققة سابقة إلا 404 (تعذّر التحقق).
import { apiJson } from '../api-access';
import type { ApiFailure, GithubApiAccess } from '../api-access';
import { githubRepoOf } from './model';
import type { Resource } from './model';

export const DEFAULT_MAX_CHECKS = 20;

interface RepoInfo {
  readonly full_name?: unknown;
  readonly html_url?: unknown;
  readonly archived?: unknown;
  readonly pushed_at?: unknown;
  readonly license?: { readonly spdx_id?: unknown } | null;
}

export type CheckOutcome =
  | { readonly kind: 'verified'; readonly patch: Partial<Resource> }
  | { readonly kind: 'unreachable'; readonly patch: Partial<Resource> }
  | { readonly kind: 'failed'; readonly reason: ApiFailure | 'unexpected' }
  | { readonly kind: 'skipped'; readonly reason: 'external' };

export interface CheckReport {
  readonly outcomes: ReadonlyMap<string, CheckOutcome>;
  readonly requests: number;
  /** سبب توقف الفحص قبل إتمامه (رفض الصلاحية أو حد الطلبات...). */
  readonly stoppedBy: ApiFailure | 'declined' | 'limit' | null;
  readonly remaining: number;
}

const lower = (v: string): string => v.toLowerCase();

async function checkOne(access: GithubApiAccess, resource: Resource, today: string): Promise<CheckOutcome> {
  const target = githubRepoOf(resource.url);
  if (!target) return { kind: 'skipped', reason: 'external' };
  const result = await apiJson<RepoInfo>(access, `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`);
  if (!result.ok) {
    if (result.reason === 'not-found') {
      return { kind: 'unreachable', patch: { status: 'unreachable', note: `تعذّر الوصول إلى المستودع (404) في ${today}؛ قد يكون حُذف أو نُقل أو أصبح خاصًا.` } };
    }
    return { kind: 'failed', reason: result.reason };
  }
  const info = result.data;
  if (typeof info.archived !== 'boolean') return { kind: 'failed', reason: 'unexpected' };
  const fullName = typeof info.full_name === 'string' ? info.full_name : null;
  const moved = fullName !== null && lower(fullName) !== lower(`${target.owner}/${target.repo}`);
  return {
    kind: 'verified',
    patch: {
      status: info.archived ? 'archived' : 'active',
      lastVerified: today,
      lastPush: typeof info.pushed_at === 'string' ? info.pushed_at.slice(0, 10) : null,
      license: typeof info.license?.spdx_id === 'string' ? info.license.spdx_id : null,
      source: `GitHub REST API بتاريخ ${today}: GET /repos/${fullName ?? `${target.owner}/${target.repo}`}`,
      movedTo: moved && typeof info.html_url === 'string' ? info.html_url : null,
      note: moved ? `نُقل المستودع أو أُعيدت تسميته إلى ${fullName}.` : (resource.note ?? null),
    },
  };
}

/**
 * يفحص موارد GitHub من القائمة حتى max، بالتتابع. يُستدعى من معالج نقر وحده، وأول ما فيه طلب الصلاحية (بلا await قبله).
 * الروابط الخارجية تُسجَّل skipped بلا طلب. رفض الصلاحية أو غيابها أو حد الطلبات يوقف الفحص ويبقي ما أُنجز.
 */
export async function checkResources(access: GithubApiAccess, resources: readonly Resource[], options: { readonly max?: number; readonly today: string }): Promise<CheckReport> {
  const max = options.max ?? DEFAULT_MAX_CHECKS;
  const outcomes = new Map<string, CheckOutcome>();
  const github = resources.filter((r) => githubRepoOf(r.url));
  for (const r of resources) if (!githubRepoOf(r.url)) outcomes.set(r.id, { kind: 'skipped', reason: 'external' });
  if (!github.length) return { outcomes, requests: 0, stoppedBy: null, remaining: 0 };
  if (!access.available) return { outcomes, requests: 0, stoppedBy: 'unavailable', remaining: github.length };
  if (!(await access.request())) return { outcomes, requests: 0, stoppedBy: 'declined', remaining: github.length };
  let requests = 0;
  let stoppedBy: CheckReport['stoppedBy'] = null;
  for (const resource of github) {
    if (requests >= max) {
      stoppedBy = 'limit';
      break;
    }
    requests += 1;
    const outcome = await checkOne(access, resource, options.today);
    outcomes.set(resource.id, outcome);
    if (outcome.kind === 'failed' && (outcome.reason === 'rate-limit' || outcome.reason === 'permission')) {
      stoppedBy = outcome.reason;
      break;
    }
  }
  // المتبقي: ما لم يُنجَز فحصه (لم يُطلب بعد أو فشل طلبه).
  const completed = (id: string): boolean => {
    const outcome = outcomes.get(id);
    return outcome?.kind === 'verified' || outcome?.kind === 'unreachable';
  };
  return { outcomes, requests, stoppedBy, remaining: github.filter((r) => !completed(r.id)).length };
}

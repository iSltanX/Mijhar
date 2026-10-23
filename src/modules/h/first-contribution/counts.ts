// أعداد المشكلات المفتوحة بوسوم المبتدئين (T-9.3): الروابط تُبنى بلا شبكة، والعدد من بحث api.github.com بنقر صريح وصلاحية اختيارية.
// «العدد المتاح فعلًا»: ما لم يُجلب عدده يُعرض رابطه دون رقم مع سبب غيابه، ولا يُخمَّن.
import { apiJson } from '../api-access';
import type { ApiFailure, GithubApiAccess } from '../api-access';

export interface BeginnerLabel {
  readonly label: string;
  readonly title: string;
}

/** الوسوم الثلاثة في الخطة (3.ح — المتطلب 3). */
export const BEGINNER_LABELS: readonly BeginnerLabel[] = [
  { label: 'good first issue', title: 'مناسبة للمبتدئين' },
  { label: 'help wanted', title: 'يُطلب عون فيها' },
  { label: 'documentation', title: 'توثيق' },
];

export function labelQuery(owner: string, repo: string, label: string): string {
  return `repo:${owner}/${repo} is:issue is:open label:"${label}"`;
}

/** رابط قائمة المشكلات المفتوحة بالوسم في github.com. */
export function labelIssuesUrl(owner: string, repo: string, label: string): string {
  const url = new URL(`https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`);
  url.searchParams.set('q', `is:issue is:open label:"${label}"`);
  return url.href;
}

export type LabelCount = { readonly label: string; readonly count: number } | { readonly label: string; readonly count: null; readonly reason: ApiFailure | 'declined' };

/** يجلب عدد كل وسم بطلب بحث واحد لكل وسم (ثلاثة طلبات). يُستدعى من معالج نقر وحده، وأول ما فيه طلب الصلاحية. */
export async function fetchLabelCounts(access: GithubApiAccess, owner: string, repo: string, labels: readonly BeginnerLabel[] = BEGINNER_LABELS): Promise<LabelCount[]> {
  if (!access.available) return labels.map((l) => ({ label: l.label, count: null, reason: 'unavailable' }));
  if (!(await access.request())) return labels.map((l) => ({ label: l.label, count: null, reason: 'declined' }));
  const out: LabelCount[] = [];
  let stop: ApiFailure | null = null;
  for (const { label } of labels) {
    if (stop) {
      out.push({ label, count: null, reason: stop });
      continue;
    }
    const q = encodeURIComponent(labelQuery(owner, repo, label));
    const result = await apiJson<{ total_count?: unknown }>(access, `/search/issues?q=${q}&per_page=1`);
    if (result.ok && typeof result.data.total_count === 'number') out.push({ label, count: result.data.total_count });
    else {
      const reason = result.ok ? 'http' : result.reason;
      out.push({ label, count: null, reason });
      // حد الطلبات أو غياب الصلاحية يسري على ما بعده، فلا تُرسل طلبات يُعلم فشلها.
      if (reason === 'rate-limit' || reason === 'permission') stop = reason;
    }
  }
  return out;
}

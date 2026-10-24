// الخطوة ١ (T-11.8): ما يقترحه مِجهَر في نطاق DEC-11 ط-1 من الصفحة المفتوحة وحدها (رابطها، لا محتواها): الملف المفتوح إن كان نصيًا في النطاق
// وإلا README.md، والفرع الأساس من الرابط أو الافتراضي، وفرع جديد واسم طلب يحرّرهما المستخدم، وربط الطلب بالمشكلة المفتوحة برقمها من الرابط.
// ثم الخطة من القراءة وتحرير المستخدم وحدهما؛ لا شيء هنا من ردّ مزوّد (AC-F7 (٢)).
import { isNewBranchName, isTextPath, withEnding } from '../../../core/guardrails';
import type { WritePlan } from '../../../core/guardrails';
import type { PageInfo } from '../../../shared/page';
import type { Prepared } from './read';

export interface Proposal {
  readonly path: string;
  /** '' = الفرع الافتراضي للمستودع. */
  readonly base: string;
  /** رقم المشكلة المفتوحة ليُربط بها الطلب، أو null. */
  readonly issue: number | null;
}

export const DEFAULT_PATH = 'README.md';

export function proposalFor(page: Pick<PageInfo, 'type' | 'path' | 'ref' | 'refKind' | 'number'>): Proposal {
  const blob = page.type === 'blob' && page.path !== null && isTextPath(page.path);
  return {
    path: blob ? (page.path as string) : DEFAULT_PATH,
    base: blob && page.refKind === 'ref' && page.ref ? page.ref : '',
    issue: page.type === 'issue' && page.number !== null ? page.number : null,
  };
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** «mijhar/edit-readme-20261024-0930»: اسم فرع جديد صالح من اسم الملف ووقت التجهيز (UTC). */
export function branchFor(path: string, now: number): string {
  const name = (path.split('/').pop() ?? 'file').replace(/\.[^.]*$/, '').toLowerCase();
  const slug = name.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
  const d = new Date(now);
  const branch = `mijhar/edit-${slug}-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
  return isNewBranchName(branch) ? branch : `mijhar/edit-${d.getTime()}`;
}

export const titleFor = (path: string): string => `docs: update ${path}`;

/** نص الطلب: ربطه بالمشكلة وحده (Refs لا Fixes: لا يُغلق شيء حتى بعد الدمج). */
export const bodyFor = (issue: number | null): string => (issue !== null ? `Refs #${issue}` : '');

/** الخطة كما ستُكتب: المحتوى المحرَّر بنهايات أسطر الملف الأصلية. */
export function planOf(prepared: Prepared, edited: string, branch: string, title: string, issue: number | null): WritePlan {
  return {
    owner: prepared.owner,
    repo: prepared.repo,
    base: prepared.base.branch,
    baseSha: prepared.base.sha,
    branch: branch.trim(),
    path: prepared.path,
    fileSha: prepared.file.sha,
    content: withEnding(edited, prepared.file.ending),
    title: title.trim(),
    body: bodyFor(issue),
    // المسودة متاحة في المستودعات العامة لكل الخطط؛ وفي الخاصة تتوقف على الخطة فيُفتح طلبًا عاديًا.
    draft: !prepared.info.private,
  };
}

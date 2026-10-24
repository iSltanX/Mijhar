// بوابة الكتابة الوحيدة إلى GitHub (T-11.8، AC-F6 وAC-F7 (١)): ثلاث عمليات بعينها ولا غيرها، تُبنى عناوينها وأجسامها من خطة متحقَّق منها
// (write-scope.ts) لا من مُدخل حر:
//   branch: POST /repos/{o}/{r}/git/refs — إنشاء الفرع الجديد من التزام الأساس المعاين.
//   file:   PUT  /repos/{o}/{r}/contents/{path} — كتابة الملف الواحد على الفرع الجديد (ببصمته المعاينة، فلا يُكتب فوق ما تغيّر بعدها).
//   pull:   POST /repos/{o}/{r}/pulls — فتح طلب الدمج من الفرع الجديد إلى الأساس.
// لا دمج ولا إغلاق ولا حذف ولا تعديل ولا أي طريقة أو مسار آخر: لا شيفرة هنا تبنيه. ورمز الكتابة يُضاف هنا وحده، إلى api.github.com وحده عبر
// fetchApiGithub (الصلاحية الاختيارية قبل كل طلب)، بلا ملفات تعريف ارتباط ولا مرجِع. ولا طلب قراءة يحمل رمز الكتابة: لا GET هنا.
import { API_VERSION } from '../api/client';
import type { PermissionsApi } from '../ui-host/browser-api';
import { fetchApiGithub } from '../ui-host/permissions';
import { utf8ToBase64 } from './text';
import { checkPlan } from './write-scope';
import type { WritePlan } from './write-scope';

export type WriteStep = 'branch' | 'file' | 'pull';
export const WRITE_STEPS: readonly WriteStep[] = ['branch', 'file', 'pull'];

/** العمليات الثلاث بطرقها وقوالب مساراتها: الجدول الذي يفحصه الاختبار الساكن (TEST-SEC-06). */
export const WRITE_OPERATIONS: Readonly<Record<WriteStep, { readonly method: 'POST' | 'PUT'; readonly path: string }>> = {
  branch: { method: 'POST', path: '/repos/{owner}/{repo}/git/refs' },
  file: { method: 'PUT', path: '/repos/{owner}/{repo}/contents/{path}' },
  pull: { method: 'POST', path: '/repos/{owner}/{repo}/pulls' },
};

export interface WriteDeps {
  readonly permissions: PermissionsApi;
  readonly fetch?: typeof fetch;
  /** مهلة الطلب الواحد (ms)؛ فلا يبقى طلب معلّق يحجز خطوة التنفيذ. */
  readonly timeoutMs?: number;
}

export const WRITE_TIMEOUT_MS = 60_000;

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

/** عنوان العملية وجسمها من الخطة. */
export function writeRequestOf(step: WriteStep, plan: WritePlan): { readonly method: 'POST' | 'PUT'; readonly path: string; readonly body: Record<string, unknown> } {
  const repo = `/repos/${encodeURIComponent(plan.owner)}/${encodeURIComponent(plan.repo)}`;
  switch (step) {
    case 'branch':
      return { method: 'POST', path: `${repo}/git/refs`, body: { ref: `refs/heads/${plan.branch}`, sha: plan.baseSha } };
    case 'file':
      return {
        method: 'PUT',
        path: `${repo}/contents/${encodePath(plan.path)}`,
        body: { message: plan.title.trim(), content: utf8ToBase64(plan.content), branch: plan.branch, ...(plan.fileSha ? { sha: plan.fileSha } : {}) },
      };
    case 'pull':
      return { method: 'POST', path: `${repo}/pulls`, body: { title: plan.title.trim(), head: plan.branch, base: plan.base, body: plan.body, draft: plan.draft } };
  }
}

/** يرسل عملية واحدة من الثلاث برمز الكتابة. خطة غير صالحة خطأ برمجي يرمي ولا يُرسل شيئًا. */
export function sendWrite(step: WriteStep, plan: WritePlan, token: string, deps: WriteDeps): Promise<Response> {
  const check = checkPlan(plan);
  if (!check.ok) throw new Error(`خطة كتابة غير صالحة: ${check.reason}`);
  if (!token) throw new Error('لا رمز كتابة');
  const request = writeRequestOf(step, plan);
  return fetchApiGithub(
    request.path,
    {
      method: request.method,
      headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(request.body),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
      signal: AbortSignal.timeout(deps.timeoutMs ?? WRITE_TIMEOUT_MS),
    },
    { permissions: deps.permissions, ...(deps.fetch ? { fetch: deps.fetch } : {}) },
  );
}

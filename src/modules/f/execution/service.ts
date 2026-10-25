// خدمة خطوة التنفيذ في الخلفية (T-11.8 الخطوة ٤، AC-F6 وAC-F7 (١)): الموضع الوحيد الذي يقرأ رمز الكتابة، ولخطوة التنفيذ وحدها؛ ولا يقرأه لغيرها
// ولا يعبر رسالة ولا يحمله طلب قراءة. تستقبل خطة كتابة من صفحة الإضافة وحدها (تتحقق الخلفية من المرسل)، وتتحقق منها كاملة، ثم ثلاث عمليات
// بترتيبها عبر بوابة الكتابة: الفرع ثم الملف ثم الطلب، وكلٌّ بعد نجاح ما قبله. لا إعادة محاولة تلقائية، ولا تراجع بكتابة أخرى (حذف فرع مثلًا)
// إن تعذّر ما بعد الفرع: يُعلن ما حدث فعلًا بروابطه. ولا دمج ولا إغلاق: البوابة لا تبني غير العمليات الثلاث.
import { redactToken } from '../../../core/api/client';
import type { ConnectionStatus, Verdict } from '../../../core/connections/health';
import { isLinked } from '../../../core/connections/health';
import type { SecretStore } from '../../../core/connections/secrets';
import { checkPlan } from '../../../core/guardrails';
import type { WritePlan } from '../../../core/guardrails';
import { sendWrite } from '../../../core/guardrails/write-gate';
import type { WriteStep } from '../../../core/guardrails/write-gate';
import type { PermissionsApi } from '../../../core/ui-host/browser-api';
import { API_GITHUB_PERMISSION, PermissionNotGrantedError } from '../../../core/ui-host/permissions';
import { notRun } from './port';
import type { ExecutionRequest, RunOutcome, WriteStatus } from './port';

export interface ExecutionServiceOptions {
  /** مخزن رمز الكتابة (مفتاحاه المستقلان)؛ null بلا مخزن. */
  readonly writeToken: Pick<SecretStore, 'read' | 'info'> | null;
  /** مخزن رمز القراءة: يُقرأ لمقارنته برمز الكتابة وحدها (سرّان مختلفان)، ولا يُرسل من هنا. */
  readonly readToken: Pick<SecretStore, 'read'> | null;
  readonly permissions: PermissionsApi | null;
  readonly fetch?: typeof fetch;
  readonly connections: { status(): Promise<readonly ConnectionStatus[]>; observe(id: 'github-write', verdict: Verdict | null, provider?: undefined, savedAt?: number): Promise<void> };
  readonly onError?: (error: unknown) => void;
}

const enc = encodeURIComponent;
const encPath = (path: string): string => path.split('/').map(enc).join('/');

async function messageOf(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.clone().json()) as { message?: unknown; errors?: unknown };
    const detail = Array.isArray(body.errors) ? body.errors.map((e) => (typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '')).filter(Boolean).join('؛ ') : '';
    const message = typeof body.message === 'string' && body.message ? body.message : fallback;
    return detail ? `${message} (${detail})` : message;
  } catch {
    return fallback;
  }
}

/** حكم صحة رمز الكتابة من استجابة عملية كتابة، أو null حين لا تغيّرها. */
export function writeVerdict(status: number, message: string): Verdict | null {
  if (status >= 200 && status < 300) return { health: 'healthy', detail: { status } };
  if (status === 401) return { health: 'expired', detail: { status } };
  if (status === 403) return { health: 'insufficient', detail: { status, reason: message } };
  return null;
}

const STEP_TEXT: Readonly<Record<WriteStep, string>> = { branch: 'إنشاء الفرع', file: 'كتابة الملف', pull: 'فتح طلب الدمج' };

function explain(step: WriteStep, status: number, message: string): string {
  if (status === 401) return `${STEP_TEXT[step]}: رفض GitHub رمز الكتابة (401): منتهٍ أو ملغى. استبدله من الإعدادات.`;
  if (status === 403 || status === 404) return `${STEP_TEXT[step]}: رفض GitHub الطلب (${status}): رمز الكتابة لا يشمل هذا المستودع أو ينقصه Contents أو Pull requests «Read and write». ${message}`;
  if (step === 'branch' && status === 422) return `${STEP_TEXT[step]}: الفرع موجود من قبل أو الاسم مرفوض (422): ${message}. غيّر اسم الفرع وابدأ من جديد.`;
  if (step === 'file' && (status === 409 || status === 422)) return `${STEP_TEXT[step]}: تغيّر الملف أو الفرع بعد المعاينة (${status}): ${message}. لم يُكتب فوق ما لم تعاينه.`;
  return `${STEP_TEXT[step]}: ${message} (${status}).`;
}

export class ExecutionService {
  private running = false;

  constructor(private readonly options: ExecutionServiceOptions) {}

  /** حالة صلاحية الكتابة الآن، بلا أي طلب شبكة. */
  async status(): Promise<WriteStatus> {
    const [statuses, permission] = await Promise.all([
      this.options.connections.status().catch(() => [] as readonly ConnectionStatus[]),
      this.options.permissions?.contains(API_GITHUB_PERMISSION).catch(() => false) ?? Promise.resolve(false),
    ]);
    const health = statuses.find((s) => s.id === 'github-write')?.health ?? 'none';
    return { linked: isLinked(health), health, permission };
  }

  /** savedAt: وقت حفظ الرمز الذي أُرسلت به العملية؛ إن استُبدل أثناءها فحكمها للقديم ولا يُكتب على البديل (MJ-TA-02). */
  private observe(verdict: Verdict | null, savedAt: number): Promise<void> {
    return this.options.connections.observe('github-write', verdict, undefined, savedAt).catch((error: unknown) => this.options.onError?.(error));
  }

  /** خطوة التنفيذ لخطة وافق عليها المستخدم. لا يرمي: كل تعذّر نتيجة معلنة بما حدث قبله. */
  async run(value: unknown): Promise<RunOutcome> {
    const name = typeof (value as { branch?: unknown } | null)?.branch === 'string' ? ((value as { branch: string }).branch) : '';
    const check = checkPlan(value);
    if (!check.ok) return notRun(name, 'precheck', `${check.reason} لم يُكتب شيء.`);
    const plan = value as WritePlan;
    if (this.running) return notRun(name, 'precheck', 'خطوة تنفيذ جارية؛ انتظرها. لم يُرسل طلب آخر.');
    // الحجز متزامن قبل أي await: نقرتان متتاليتان لا تُصدران تنفيذين.
    this.running = true;
    try {
      return await this.execute(plan);
    } catch (error) {
      this.options.onError?.(error);
      return notRun(name, 'precheck', `تعذّر التنفيذ (${error instanceof Error ? error.name : 'Error'})؛ لم يُكتب شيء.`);
    } finally {
      this.running = false;
    }
  }

  private async execute(plan: WritePlan): Promise<RunOutcome> {
    const { permissions } = this.options;
    if (!permissions || !(await permissions.contains(API_GITHUB_PERMISSION).catch(() => false))) {
      return notRun(plan.branch, 'precheck', 'صلاحية api.github.com الاختيارية غير ممنوحة؛ امنحها من «الإعدادات والخصوصية». لم يُكتب شيء.');
    }
    const status = await this.status();
    if (status.health === 'expired') return notRun(plan.branch, 'precheck', 'رفض GitHub رمز الكتابة المحفوظ من قبل (401)؛ استبدله من الإعدادات. لم يُكتب شيء.');
    let token: string | null = null;
    let savedAt = 0;
    try {
      const record = await this.options.writeToken?.read();
      token = record?.token ?? null;
      savedAt = record?.savedAt ?? 0;
    } catch (error) {
      return notRun(plan.branch, 'precheck', `تعذّرت قراءة رمز الكتابة المحفوظ (${error instanceof Error ? error.name : 'Error'})؛ لم يُكتب شيء.`);
    }
    if (!token) return notRun(plan.branch, 'precheck', 'لا صلاحية كتابة محفوظة؛ أضفها من «الإعدادات والخصوصية». لم يُكتب شيء.');
    // سرّان مختلفان (AD-19): رمز قراءة هو رمز الكتابة نفسه يحمل الكتابة في كل قراءة، فلا يُنفَّذ شيء حتى يُفصلا.
    const readToken = (await this.options.readToken?.read().catch(() => null))?.token ?? null;
    if (readToken && readToken === token) {
      return notRun(plan.branch, 'precheck', 'رمز القراءة المحفوظ هو رمز الكتابة نفسه، فتحمل كل قراءة صلاحية كتابة؛ امسح أحدهما واجعلهما رمزين منفصلين. لم يُكتب شيء.');
    }

    const deps = { permissions, ...(this.options.fetch ? { fetch: this.options.fetch } : {}) };
    const site = `https://github.com/${enc(plan.owner)}/${enc(plan.repo)}`;
    const outcome = {
      branch: { created: false, name: plan.branch, url: null as string | null },
      file: { written: false, commit: null as string | null, url: null as string | null },
      pull: { opened: false, number: null as number | null, url: null as string | null, draft: null as boolean | null },
    };
    const stop = (step: WriteStep, status: number | null, message: string): RunOutcome => ({ ok: false, ...outcome, failure: { step, status, message: redactToken(message, token) } });

    const send = async (step: WriteStep): Promise<{ response: Response } | { error: RunOutcome }> => {
      try {
        return { response: await sendWrite(step, plan, token as string, deps) };
      } catch (error) {
        if (error instanceof PermissionNotGrantedError) return { error: stop(step, null, `${STEP_TEXT[step]}: ${error.message}`) };
        // انقطاع أو انتهاء مهلة بعد الإرسال: لا يُعرف إن نفّذها GitHub، فلا يُدّعى أنها لم تحدث.
        const name = error instanceof Error ? error.name : 'Error';
        return { error: stop(step, null, `${STEP_TEXT[step]}: تعذّر الوصول إلى GitHub أو انتهت المهلة (${name})؛ لا يُعرف إن نُفّذت هذه الخطوة، فراجع المستودع قبل أي إعادة.`) };
      }
    };

    // ١) الفرع.
    const branch = await send('branch');
    if ('error' in branch) return branch.error;
    {
      const { response } = branch;
      const message = await messageOf(response, `HTTP ${response.status}`);
      await this.observe(writeVerdict(response.status, message), savedAt);
      if (response.status !== 201) return stop('branch', response.status, explain('branch', response.status, message));
      outcome.branch.created = true;
      outcome.branch.url = `${site}/tree/${encPath(plan.branch)}`;
    }
    // ٢) الملف.
    const file = await send('file');
    if ('error' in file) return file.error;
    {
      const { response } = file;
      const message = await messageOf(response, `HTTP ${response.status}`);
      await this.observe(writeVerdict(response.status, message), savedAt);
      if (response.status !== 200 && response.status !== 201) return stop('file', response.status, explain('file', response.status, message));
      const body = (await response.json().catch(() => null)) as { commit?: { sha?: unknown } } | null;
      const sha = typeof body?.commit?.sha === 'string' && /^[0-9a-f]{40}$/.test(body.commit.sha) ? body.commit.sha : null;
      outcome.file.written = true;
      outcome.file.commit = sha;
      outcome.file.url = sha ? `${site}/commit/${sha}` : null;
    }
    // ٣) الطلب.
    const pull = await send('pull');
    if ('error' in pull) return pull.error;
    {
      const { response } = pull;
      const message = await messageOf(response, `HTTP ${response.status}`);
      await this.observe(writeVerdict(response.status, message), savedAt);
      if (response.status !== 201) return stop('pull', response.status, explain('pull', response.status, message));
      const body = (await response.json().catch(() => null)) as { number?: unknown; draft?: unknown } | null;
      const number = typeof body?.number === 'number' && Number.isInteger(body.number) && body.number > 0 ? body.number : null;
      outcome.pull.opened = true;
      outcome.pull.number = number;
      // الرابط يُبنى من المستودع ورقم الطلب، لا من نص الاستجابة.
      outcome.pull.url = number !== null ? `${site}/pull/${number}` : null;
      outcome.pull.draft = typeof body?.draft === 'boolean' ? body.draft : plan.draft;
    }
    return { ok: true, ...outcome, failure: null };
  }

  /** يعالج رسالة المسار. fromExtensionPage: المرسل صفحة من الإضافة نفسها (تحققت منه الخلفية من sender). لا يرمي. */
  async handle(request: ExecutionRequest, fromExtensionPage: boolean): Promise<unknown> {
    if (request.op === 'status') return this.status().catch(() => ({ linked: false, health: 'none', permission: false }) satisfies WriteStatus);
    if (!fromExtensionPage) return notRun('', 'precheck', 'لا يُقبل التنفيذ إلا من لوحة مِجهَر الأصلية؛ لم يُكتب شيء.');
    return this.run(request.plan);
  }
}

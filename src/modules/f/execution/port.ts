// رسائل مسار الإنجاز بين صفحة الإضافة (اللوحة الأصلية) والخلفية (T-11.8). لا سرّ يعبرها: رمز الكتابة يُقرأ في الخلفية وحدها لخطوة التنفيذ.
//  - status: هل صلاحية الكتابة مربوطة وصلاحية api.github.com ممنوحة، بلا أي طلب شبكة. تُسأل بعد موافقة النطاق وحدها.
//  - run: خطة الكتابة كما وافق عليها المستخدم؛ والخلفية تقبلها من صفحة الإضافة وحدها (لا من سكربت المحتوى ولا الدرج)، وتتحقق منها كاملة قبل أي طلب.
import type { ExtensionApi } from '../../../core/ui-host/browser-api';
import type { Health } from '../../../core/connections/health';
import type { WritePlan } from '../../../core/guardrails';
import type { WriteStep } from '../../../core/guardrails/write-gate';

export const EXECUTION_MESSAGE = 'mijhar/execution';

export type ExecutionRequest = { readonly type: typeof EXECUTION_MESSAGE; readonly op: 'status' } | { readonly type: typeof EXECUTION_MESSAGE; readonly op: 'run'; readonly plan: WritePlan };

export interface WriteStatus {
  /** رمز كتابة محفوظ لم يرفضه GitHub. */
  readonly linked: boolean;
  readonly health: Health;
  /** صلاحية api.github.com الاختيارية ممنوحة الآن. */
  readonly permission: boolean;
}

/** ما حدث فعلًا في خطوة التنفيذ: كل عملية بنتيجتها، ولا يُدّعى ما لم يحدث. */
export interface RunOutcome {
  readonly ok: boolean;
  readonly branch: { readonly created: boolean; readonly name: string; readonly url: string | null };
  readonly file: { readonly written: boolean; readonly commit: string | null; readonly url: string | null };
  readonly pull: { readonly opened: boolean; readonly number: number | null; readonly url: string | null; readonly draft: boolean | null };
  /** أول ما تعذّر وسببه (منقّحًا من أي سرّ)، أو null. */
  readonly failure: { readonly step: WriteStep | 'precheck'; readonly status: number | null; readonly message: string } | null;
  /**
   * MJ-TA-H01: انقطعت قناة الخلفية بعد أن وصلتها الخطة، فلا يُعرف ما نُفّذ منها: الحقول أعلاه «لم يحدث» لأنها لم تُبلَّغ، لا لأنها لم تحدث.
   */
  readonly uncertain?: true;
}

export const isExecutionRequest = (message: unknown): message is ExecutionRequest => {
  if (typeof message !== 'object' || message === null) return false;
  const m = message as { type?: unknown; op?: unknown; plan?: unknown };
  return m.type === EXECUTION_MESSAGE && (m.op === 'status' || (m.op === 'run' && typeof m.plan === 'object' && m.plan !== null));
};

export interface ExecutionPort {
  status(): Promise<WriteStatus>;
  run(plan: WritePlan): Promise<RunOutcome>;
}

const UNREACHABLE: WriteStatus = { linked: false, health: 'none', permission: false };

export const notRun = (name: string, step: WriteStep | 'precheck', message: string, status: number | null = null): RunOutcome => ({
  ok: false,
  branch: { created: false, name, url: null },
  file: { written: false, commit: null, url: null },
  pull: { opened: false, number: null, url: null, draft: null },
  failure: { step, status, message },
});

/** لم تصل الرسالة أي مستمع (لا خلفية تستقبل): لم يبدأ شيء. وما سواه (أُغلق المنفذ قبل الرد، أو رد فارغ) قد يلي تنفيذًا. */
export const notDelivered = (error: unknown): boolean => /Receiving end does not exist/i.test(error instanceof Error ? error.message : String(error));

/** الخطة وصلت الخلفية ثم انقطعت القناة قبل ردّها (MJ-TA-H01): لا يُدّعى أن شيئًا لم يُكتب. */
export const unconfirmedRun = (name: string): RunOutcome => ({
  ...notRun(
    name,
    'precheck',
    'انقطع الاتصال بخلفية الإضافة قبل أن تردّ، فتعذّر التأكد من النتيجة: قد تكون بعض الخطوات نُفّذت. راجع المستودع في GitHub (الفرع والالتزام وطلبات الدمج) قبل أي إعادة.',
  ),
  uncertain: true,
});

/** منفذ اللوحة: رسائل إلى الخلفية. تعذّر الرسالة نفسها فشل معلن لا نجاح؛ ولا يُقال «لم يُكتب شيء» إلا إن لم تصل الرسالة أصلًا. */
export function runtimeExecutionPort(runtime: Pick<ExtensionApi['runtime'], 'sendMessage'>): ExecutionPort {
  return {
    async status() {
      try {
        return ((await runtime.sendMessage({ type: EXECUTION_MESSAGE, op: 'status' } satisfies ExecutionRequest)) as WriteStatus | undefined) ?? UNREACHABLE;
      } catch {
        return UNREACHABLE;
      }
    },
    async run(plan) {
      try {
        const reply = (await runtime.sendMessage({ type: EXECUTION_MESSAGE, op: 'run', plan } satisfies ExecutionRequest)) as RunOutcome | undefined;
        return reply ?? unconfirmedRun(plan.branch);
      } catch (error) {
        return notDelivered(error) ? notRun(plan.branch, 'precheck', 'تعذّر الوصول إلى خلفية الإضافة؛ لم يُكتب شيء.') : unconfirmedRun(plan.branch);
      }
    },
  };
}

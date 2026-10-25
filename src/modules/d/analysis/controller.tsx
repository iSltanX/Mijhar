// التحليل داخل قسمه (T-11.7، AC-D9): حالات الخيار في القسم الذي طُلب منه، ويستعملها شرح سجل الفحص وبطاقة طلب الدمج وصفحة المشكلة كما هي.
//  - بلا مفتاح (أو مفتاح منتهٍ): بوابة «ميزة تحتاج ربطًا» معلَّلة بما تحتاجه، ولا نص تحليل؛ وبقية القسم كما هي.
//  - «حلّل…» بتفعيل المستخدم الحقيقي يبني السياق من الطبقة المشتركة (يمرّره القسم)، ويعرض الموافقة: ما يُرسل وحجمه وما استُبعد ووجهته.
//  - «إرسال للتحليل» وحده يُصدر الطلب، وطلب واحد لكل تفعيل (والخلفية ترفض ثانيًا من القسم نفسه ما دام الأول جاريًا)؛ ولا إعادة محاولة تلقائية.
//  - MJ23 (AC-E10 (٥)): قبل الإرسال يُعاد بناء المحتوى وتُقرأ حالة المزوّد: إن تغيّر المحتوى أو المزوّد المختار أو المودل عمّا عرضته الموافقة لا يُرسل
//    شيء وتُعرض الموافقة من جديد بما تغيّر؛ والخلفية ترفض هي أيضًا مزوّدًا أو مودلًا غير ما عُرض. ولا تحويل إلى مزوّد آخر عند الفشل.
//  - MJ23 (I-3، AC-E10 (٨)): السياق يُبنى بحد الأسطر PP-03 الذي يتبعه «نسخ البرومبت».
//  - النتيجة اقتراح موسوم «احتمال يحتاج تحققًا» بأدلته وما نقص والمودل ووقت الطلب؛ لا تحل محل حقيقة مرصودة ولا تُعرض في طبقة الحقائق.
// لا محوّل هنا ولا مزوّد بعينه: الطلب عبر منفذ الخلفية (AC-E9 (٦)). ولا أسعار ولا تكلفة (AD-31).
import type { ComponentChild } from 'preact';
import type { ModuleContext } from '../../../core';
import type { FeatureId } from '../../../core/connections/features';
import type { Health } from '../../../core/connections/health';
import { isConnectionsChanged, onTabReturn, runtimeConnectionsPort } from '../../../core/connections/port';
import type { ConnectionsPort } from '../../../core/connections/port';
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { ExtEvent } from '../../../core/ui-host/browser-api';
import { OPEN_OPTIONS_MESSAGE } from '../../../core/ui-host/commands';
import type { OpenOptionsMessage } from '../../../core/ui-host/commands';
import { isTrustedActivation } from '../../../shared/ui/user-activation';
import { LINE_LIMIT_DEFAULT, limitsOf } from '../../e/context';
import type { ContextStructure } from '../../e/context';
import { parseAnalysis, prepareAnalysis, runtimeProviderPort } from '../../e/provider';
import type { AnalysisOutcome, ParsedAnalysis, PreparedAnalysis, ProviderFailure, ProviderPort, ProviderStatus } from '../../e/provider';
import { storedLineLimit } from './limits';
import { ANALYSIS_SECTIONS } from './sections';
import type { AnalysisSectionDef, AnalysisSectionId } from './sections';
import { AnalysisBlock } from './view';

export type AnalysisState =
  | { readonly kind: 'idle'; readonly note?: string }
  | {
      readonly kind: 'consent';
      readonly prepared: PreparedAnalysis;
      readonly status: ProviderStatus | null | undefined;
      /** لماذا أُعيد عرض الموافقة (تغيّر المحتوى أو المزوّد أو المودل بعد عرضها)، أو غائب. */
      readonly changed?: string;
    }
  | { readonly kind: 'loading'; readonly requestId: string; readonly prepared: PreparedAnalysis; readonly status: ProviderStatus }
  | { readonly kind: 'result'; readonly outcome: AnalysisOutcome; readonly parsed: ParsedAnalysis; readonly prepared: PreparedAnalysis }
  | { readonly kind: 'failed'; readonly failure: ProviderFailure | 'no-context'; readonly message: string; readonly retryAt: number | null };

export interface SectionAnalysisDeps {
  /** منفذ طبقة المزوّد في الخلفية؛ null خارج الإضافة (فلا يظهر شيء من التحليل). */
  readonly provider: ProviderPort | null;
  readonly connections: ConnectionsPort | null;
  /** يفتح بطاقة المفتاح في الإعدادات مع معرّف الميزة للعودة إليها. */
  readonly openSettings: (feature: FeatureId) => void;
  /** رسائل الخلفية إلى التبويب (العودة بعد الربط). */
  readonly messages: ExtEvent<(message: unknown) => unknown> | null;
  /** حد أسطر كل قسم من السياق (PP-03): في الإضافة الإعداد المخزَّن نفسه الذي يتبعه «نسخ البرومبت» (defaultAnalysisDeps)، وبدونه الافتراضي. */
  readonly lineLimit?: () => number;
  readonly newId?: () => string;
}

/** ما يمرّره المتحكم إلى جامع القسم. */
export interface CollectOptions {
  readonly limits: ReturnType<typeof limitsOf>;
}

function safe<T>(make: () => T): T | null {
  try {
    return make();
  } catch {
    return null;
  }
}

/** منافذ الإضافة الافتراضية؛ خارجها (اختبار بلا إضافة) null فلا يظهر شيء من التحليل. */
export function defaultAnalysisDeps(): SectionAnalysisDeps {
  const runtime = safe(() => extensionApi().runtime);
  return {
    provider: runtime ? runtimeProviderPort(runtime) : null,
    connections: runtime ? runtimeConnectionsPort(runtime) : null,
    openSettings: (feature) => {
      void runtime?.sendMessage({ type: OPEN_OPTIONS_MESSAGE, target: 'provider-key', feature } satisfies OpenOptionsMessage).catch(() => undefined);
    },
    messages: runtime ? (runtime.onMessage as unknown as ExtEvent<(message: unknown) => unknown>) : null,
    lineLimit: storedLineLimit(),
  };
}

const randomId = (): string => {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const PROVIDER_FAILURE: Readonly<Partial<Record<ProviderFailure, string>>> = {
  // L-5 (MJ26): بلا رمز HTTP ثابت؛ Google ترفض المفتاح بـ400 وغيرها بـ401.
  unauthorized: 'رفض المزوّد المفتاح لأنه غير صالح أو منتهٍ',
  forbidden: 'رفض المزوّد الطلب لنقص صلاحية المفتاح (403)',
  'not-found': 'المودل المختار غير متاح لهذا المفتاح (404)',
  'too-large': 'المحتوى أكبر مما يقبله المودل',
  invalid: 'رفض المزوّد الطلب',
  workspace: 'يلزم هذا المفتاحَ معرّفُ مساحة عمل صالح يصله (أدخله في بطاقة «مزوّد التحليل» في الإعدادات)',
  'rate-limit': 'تجاوز حد الطلبات الذي يعلنه المزوّد (429)',
  overloaded: 'المزوّد مشغول أو تعذّر عليه الطلب',
  http: 'استجابة غير متوقعة من المزوّد',
  network: 'تعذّر الوصول إلى المزوّد',
  aborted: 'أُوقف الطلب قبل اكتماله',
};

/** جملة الفشل: ما أعلنته الخلفية لما لم يُرسل، وما رفضه المزوّد بتسميته وسببه. */
export function failureText(failure: ProviderFailure, message: string): string {
  const label = PROVIDER_FAILURE[failure];
  return label ? `تعذّر التحليل: ${label}${message && !message.startsWith('HTTP') ? ` — ${message}` : ''}.` : message;
}

export class SectionAnalysis {
  private state: AnalysisState = { kind: 'idle' };
  /** صحة مفتاح المزوّد؛ undefined قبل أول قراءة. */
  private health: Health | undefined = undefined;
  private readonly def: AnalysisSectionDef;
  private readonly newId: () => string;
  /** تحقق ما قبل الإرسال جارٍ: نقرة ثانية لا تبدأ تحققًا آخر. */
  private confirming = false;

  constructor(
    private readonly ctx: ModuleContext,
    section: AnalysisSectionId,
    private readonly deps: SectionAnalysisDeps,
    /** سياق القسم من الطبقة المشتركة (بإضافاته وحد الأسطر الممرَّر)، أو null لصفحة بلا سياق. */
    private readonly collect: (options: CollectOptions) => ContextStructure | null,
    private readonly onChange: () => void,
  ) {
    this.def = ANALYSIS_SECTIONS[section];
    this.newId = deps.newId ?? randomId;
  }

  get current(): AnalysisState {
    return this.state;
  }

  start(): void {
    if (!this.deps.provider) return;
    void this.readHealth();
    const messages = this.deps.messages;
    if (messages) {
      const listener = (message: unknown): undefined => {
        if (isConnectionsChanged(message) && !this.ctx.signal.aborted) void this.readHealth();
        return undefined;
      };
      messages.addListener(listener);
      this.ctx.onTeardown(() => messages.removeListener(listener));
    }
    // MJ-F-02: ما غيّرته الإعدادات (مسح المفتاح، تبديل المزوّد، رفضه) يظهر عند العودة إلى التبويب بلا إعادة تحميل؛ وموافقة معروضة تُقرأ وجهتها من جديد.
    onTabReturn(this.ctx, () => {
      void this.readHealth();
      this.refreshConsent();
    });
    this.ctx.onTeardown(() => {
      if (this.state.kind === 'loading') void this.deps.provider?.cancel(this.state.requestId);
    });
  }

  private set(state: AnalysisState): void {
    if (this.ctx.signal.aborted) return;
    this.state = state;
    this.onChange();
  }

  private async readHealth(): Promise<void> {
    const list = (await this.deps.connections?.status().catch(() => null)) ?? null;
    if (this.ctx.signal.aborted) return;
    this.health = list?.find((s) => s.id === 'provider-key')?.health ?? 'none';
    this.onChange();
  }

  /** المحتوى كما يُرسل الآن: سياق القسم بحد الأسطر الحالي، مجهَّزًا بقالب القسم؛ أو null لصفحة بلا سياق. */
  private prepare(): PreparedAnalysis | null {
    let context: ContextStructure | null;
    try {
      context = this.collect({ limits: limitsOf(this.deps.lineLimit?.() ?? LINE_LIMIT_DEFAULT) });
    } catch {
      context = null;
    }
    return context ? prepareAnalysis(context, this.def) : null;
  }

  /** «حلّل…» أو «أعد التحليل» أو «أعد المحاولة»: تفعيل المستخدم الحقيقي وحده، ثم الموافقة؛ ولا طلب إلى المزوّد هنا. */
  open(event: Event): void {
    if (!isTrustedActivation(event) || !this.deps.provider || this.state.kind === 'loading') return;
    const prepared = this.prepare();
    if (!prepared) {
      this.set({ kind: 'failed', failure: 'no-context', message: 'لا سياق لهذه الصفحة يُبنى منه طلب؛ لم يُرسل شيء.', retryAt: null });
      return;
    }
    this.show(prepared);
  }

  /** موافقة معروضة: تُقرأ وجهتها (ومنها حال المفتاح) من جديد في مكانها، بلا إعادة عرض تنقل التركيز. */
  private refreshConsent(): void {
    const shown = this.state;
    // أثناء «إرسال للتحليل» يقرأ confirm الوجهة بنفسه، فلا يُستبدل ما عرضه (وإلا توقف بصمت).
    if (shown.kind !== 'consent' || shown.status === undefined || this.confirming) return;
    void this.deps.provider?.status().then((status) => {
      const now = this.state;
      if (now.kind === 'consent' && now.prepared === shown.prepared && !this.confirming) this.set({ ...now, status });
    });
  }

  /** يعرض الموافقة بمحتوى مجهَّز ثم يقرأ وجهته (المزوّد المختار ومودله) من الخلفية. */
  private show(prepared: PreparedAnalysis, changed?: string): void {
    this.set({ kind: 'consent', prepared, status: undefined, ...(changed ? { changed } : {}) });
    void this.deps.provider?.status().then((status) => {
      if (this.state.kind === 'consent' && this.state.prepared === prepared) this.set({ kind: 'consent', prepared, status, ...(changed ? { changed } : {}) });
    });
  }

  /**
   * «إرسال للتحليل» (تحقق ConsentSheet من التفعيل الحقيقي): طلب واحد بما عرضته الموافقة نفسها. يُعاد بناء المحتوى وتُقرأ الوجهة أولًا: ما تغيّر عمّا
   * عُرض يعيد عرض الموافقة ولا يُرسل شيء (AC-E10 (٥)).
   */
  confirm(): void {
    const state = this.state;
    const provider = this.deps.provider;
    if (state.kind !== 'consent' || !provider || !state.status?.model || this.confirming) return;
    const shown = state;
    const shownStatus = state.status;
    const now = this.prepare();
    if (!now || now.prompt !== shown.prepared.prompt || now.system !== shown.prepared.system) {
      if (now) this.show(now, 'تغيّر المحتوى منذ عُرضت الموافقة؛ هذا ما سيُرسل الآن. لم يُرسل شيء.');
      else this.set({ kind: 'failed', failure: 'no-context', message: 'لم يعد للصفحة سياق يُبنى منه طلب؛ لم يُرسل شيء.', retryAt: null });
      return;
    }
    this.confirming = true;
    void provider
      .status()
      .then((fresh) => {
        if (this.ctx.signal.aborted || this.state !== shown) return;
        if (!fresh || fresh.provider.id !== shownStatus.provider.id || fresh.model?.id !== shownStatus.model?.id) {
          this.set({ kind: 'consent', prepared: shown.prepared, status: fresh, changed: 'تغيّر المزوّد المختار أو المودل منذ عُرضت الموافقة؛ هذه الوجهة الآن. لم يُرسل شيء.' });
          return;
        }
        this.send(shown.prepared, fresh);
      })
      .finally(() => {
        this.confirming = false;
      });
  }

  private send(prepared: PreparedAnalysis, status: ProviderStatus): void {
    const provider = this.deps.provider;
    const model = status.model;
    // واجهة زالت (تعطيل الوحدة أو مغادرة الصفحة) لا تُرسل شيئًا: set لا يغيّر الحالة بعد الإغلاق، فلا يُعتمد عليها هنا (F-02).
    if (!provider || !model || this.ctx.signal.aborted) return;
    const requestId = this.newId();
    this.set({ kind: 'loading', requestId, prepared, status });
    void provider.analyze({ requestId, section: this.def.id, provider: status.provider.id, model: model.id, system: prepared.system, prompt: prepared.prompt }).then((response) => {
      const now = this.state;
      if (now.kind !== 'loading' || now.requestId !== requestId) return;
      if (response.ok) this.set({ kind: 'result', outcome: response.data, parsed: parseAnalysis(response.data.text, prepared, response.data.stopReason), prepared });
      else {
        this.set({ kind: 'failed', failure: response.failure, message: failureText(response.failure, response.message), retryAt: response.retryAt });
        if (['unauthorized', 'expired-key', 'permission', 'provider-changed', 'no-key', 'model-changed'].includes(response.failure)) void this.readHealth();
      }
    });
  }

  cancel(): void {
    if (this.state.kind === 'consent') this.set({ kind: 'idle' });
  }

  stop(): void {
    const state = this.state;
    if (state.kind !== 'loading') return;
    void this.deps.provider?.cancel(state.requestId);
    this.set({ kind: 'idle', note: 'أُوقف الطلب؛ لا نتيجة تُعرض له.' });
  }

  hide(): void {
    this.set({ kind: 'idle' });
  }

  /** ما يُرسم في القسم؛ null خارج الإضافة أو قبل قراءة حالة المفتاح. */
  view(): ComponentChild {
    if (!this.deps.provider || this.health === undefined) return null;
    return (
      <AnalysisBlock
        def={this.def}
        state={this.state}
        health={this.health}
        onOpen={(event) => this.open(event)}
        onConfirm={() => this.confirm()}
        onCancel={() => this.cancel()}
        onStop={() => this.stop()}
        onHide={() => this.hide()}
        onSettings={() => this.deps.openSettings(this.def.feature)}
      />
    );
  }
}

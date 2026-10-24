// التحليل داخل قسمه (T-11.7، AC-D9): حالات الخيار في القسم الذي طُلب منه، ويستعملها شرح سجل الفحص وبطاقة طلب الدمج وصفحة المشكلة كما هي.
//  - بلا مفتاح (أو مفتاح منتهٍ): بوابة «ميزة تحتاج ربطًا» معلَّلة بما تحتاجه، ولا نص تحليل؛ وبقية القسم كما هي.
//  - «حلّل…» بتفعيل المستخدم الحقيقي يبني السياق من الطبقة المشتركة (يمرّره القسم)، ويعرض الموافقة: ما يُرسل وحجمه وما استُبعد ووجهته.
//  - «إرسال للتحليل» وحده يُصدر الطلب، وطلب واحد لكل تفعيل (والخلفية ترفض ثانيًا من القسم نفسه ما دام الأول جاريًا)؛ ولا إعادة محاولة تلقائية.
//  - النتيجة اقتراح موسوم «احتمال يحتاج تحققًا» بأدلته وما نقص والمودل ووقت الطلب؛ لا تحل محل حقيقة مرصودة ولا تُعرض في طبقة الحقائق.
// لا محوّل هنا ولا مزوّد بعينه: الطلب عبر منفذ الخلفية (AC-E9 (٦)). ولا أسعار ولا تكلفة (AD-31).
import type { ComponentChild } from 'preact';
import type { ModuleContext } from '../../../core';
import type { FeatureId } from '../../../core/connections/features';
import type { Health } from '../../../core/connections/health';
import { isConnectionsChanged, runtimeConnectionsPort } from '../../../core/connections/port';
import type { ConnectionsPort } from '../../../core/connections/port';
import { extensionApi } from '../../../core/ui-host/browser-api';
import type { ExtEvent } from '../../../core/ui-host/browser-api';
import { OPEN_OPTIONS_MESSAGE } from '../../../core/ui-host/commands';
import type { OpenOptionsMessage } from '../../../core/ui-host/commands';
import { isTrustedActivation } from '../../../shared/ui/user-activation';
import type { ContextStructure } from '../../e/context';
import { parseAnalysis, prepareAnalysis, runtimeProviderPort } from '../../e/provider';
import type { AnalysisOutcome, ParsedAnalysis, PreparedAnalysis, ProviderFailure, ProviderPort, ProviderStatus } from '../../e/provider';
import { ANALYSIS_SECTIONS } from './sections';
import type { AnalysisSectionDef, AnalysisSectionId } from './sections';
import { AnalysisBlock } from './view';

export type AnalysisState =
  | { readonly kind: 'idle'; readonly note?: string }
  | { readonly kind: 'consent'; readonly prepared: PreparedAnalysis; readonly status: ProviderStatus | null | undefined }
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
  readonly newId?: () => string;
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
  };
}

const randomId = (): string => {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const PROVIDER_FAILURE: Readonly<Partial<Record<ProviderFailure, string>>> = {
  unauthorized: 'رفض المزوّد المفتاح لأنه غير صالح أو منتهٍ (401)',
  forbidden: 'رفض المزوّد الطلب لنقص صلاحية المفتاح (403)',
  'not-found': 'المودل المختار غير متاح لهذا المفتاح (404)',
  'too-large': 'المحتوى أكبر مما يقبله المودل',
  invalid: 'رفض المزوّد الطلب',
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

  constructor(
    private readonly ctx: ModuleContext,
    section: AnalysisSectionId,
    private readonly deps: SectionAnalysisDeps,
    /** سياق القسم من الطبقة المشتركة (بإضافاته)، أو null لصفحة بلا سياق. */
    private readonly collect: () => ContextStructure | null,
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

  /** «حلّل…» أو «أعد التحليل» أو «أعد المحاولة»: تفعيل المستخدم الحقيقي وحده، ثم الموافقة؛ ولا طلب إلى المزوّد هنا. */
  open(event: Event): void {
    if (!isTrustedActivation(event) || !this.deps.provider || this.state.kind === 'loading') return;
    let context: ContextStructure | null;
    try {
      context = this.collect();
    } catch {
      context = null;
    }
    if (!context) {
      this.set({ kind: 'failed', failure: 'no-context', message: 'لا سياق لهذه الصفحة يُبنى منه طلب؛ لم يُرسل شيء.', retryAt: null });
      return;
    }
    const prepared = prepareAnalysis(context, this.def);
    this.set({ kind: 'consent', prepared, status: undefined });
    void this.deps.provider.status().then((status) => {
      if (this.state.kind === 'consent' && this.state.prepared === prepared) this.set({ kind: 'consent', prepared, status });
    });
  }

  /** «إرسال للتحليل» (تحقق ConsentSheet من التفعيل الحقيقي): طلب واحد بما عرضته الموافقة نفسها. */
  confirm(): void {
    const state = this.state;
    const provider = this.deps.provider;
    if (state.kind !== 'consent' || !provider || !state.status?.model) return;
    const requestId = this.newId();
    const { prepared, status } = state;
    this.set({ kind: 'loading', requestId, prepared, status });
    const model = status.model as NonNullable<ProviderStatus['model']>;
    void provider.analyze({ requestId, section: this.def.id, model: model.id, system: prepared.system, prompt: prepared.prompt }).then((response) => {
      const now = this.state;
      if (now.kind !== 'loading' || now.requestId !== requestId) return;
      if (response.ok) this.set({ kind: 'result', outcome: response.data, parsed: parseAnalysis(response.data.text, prepared.prompt, response.data.stopReason), prepared });
      else {
        this.set({ kind: 'failed', failure: response.failure, message: failureText(response.failure, response.message), retryAt: response.retryAt });
        if (response.failure === 'unauthorized' || response.failure === 'expired-key' || response.failure === 'permission') void this.readHealth();
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

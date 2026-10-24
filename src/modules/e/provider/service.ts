// خدمة المزوّد في الخلفية (T-11.6، F-E9): الخلفية وحدها تقرأ مفتاح المزوّد من مخزنه الموثوق لكل طلب وتضيفه إلى طلب محوّله، فلا يعبر المفتاح
// رسالة ولا يصل سكربت المحتوى؛ ولا تقرأ رمز GitHub ولا أي سرّ آخر (AC-E9 (٤)، AD-19).
//  - لا طلب إلا بفعل صريح: «تحقق» من صفحة الإعدادات (قائمة المودلات، الطلب المعلن)، و«أرسل وحلّل» من موافقة القسم. وstatus لا يطلب شيئًا.
//  - طلب واحد جارٍ لكل قسم في التبويب، وطلب تحليل واحد لكل رسالة، ولا إعادة محاولة تلقائية؛ وموعد إعادة المحاولة الذي يعلنه المزوّد (429،
//    529) يُحترم فلا يُرسل قبله شيء؛ ومفتاح رفضه المزوّد (401) لا يُرسل به ثانية حتى يُستبدل أو يُتحقق منه. ولا سقف إنفاق ولا ميزانية ولا
//    حصة تفرضها الإضافة (AD-31): إدارة الإنفاق للمستخدم عند المزوّد.
//  - المودل المرسل إليه هو ما عرضته الموافقة: إن تغيّر بينهما لا يُرسل شيء.
//  - صحة المفتاح تُسجَّل في سجل الاتصالات من الاستجابات الفعلية (تحقق واستعمال)، وقائمة المودلات تُحفظ في storage.session بمصدرها ووقتها.
import type { PermissionsApi } from '../../../core/ui-host/browser-api';
import type { ConnectionStatus, Verdict } from '../../../core/connections/health';
import type { SecretStore, SessionStorageLike } from '../../../core/connections/secrets';
import type { SettingsStore } from '../../../core/settings';
import { gatedFetch, redactKey } from './gate';
import { createProviderRegistry, defaultModel, isModelId } from './registry';
import type { ProviderRegistry } from './registry';
import { PROVIDER_ID_KEY, PROVIDER_MODEL_KEY } from './settings';
import type { AnalyzeInput, AnalyzeResponse, ProviderRequest, ProviderStatus, VerifyResponse } from './port';
import type { ModelsList, ProviderAdapter, ProviderFailure, ProviderResult } from './types';

/** حد طول الرد المطلوب في واجهة الرسائل (إلزامي فيها)، مقصورًا على ما يعلنه المودل؛ ليس سقف إنفاق (AD-31). */
export const ANALYSIS_OUTPUT_TOKENS = 4096;
/** مهلة تقنية للطلب الواحد؛ والمستخدم يوقفه قبلها متى شاء. */
export const ANALYSIS_TIMEOUT_MS = 180_000;

export const MODELS_CACHE_KEY = 'mijhar.provider.models';

/** قائمة المودلات المقروءة لكل مزوّد. */
export interface ModelsCache {
  load(provider: string): Promise<ModelsList | null>;
  save(list: ModelsList): Promise<void>;
}

export function memoryModelsCache(): ModelsCache & { lists: Map<string, ModelsList> } {
  const lists = new Map<string, ModelsList>();
  return { lists, load: async (p) => lists.get(p) ?? null, save: async (l) => void lists.set(l.provider, l) };
}

const isList = (value: unknown): value is ModelsList => {
  const v = value as Partial<ModelsList> | null;
  return typeof v === 'object' && v !== null && typeof v.provider === 'string' && Array.isArray(v.models) && typeof v.readAt === 'number' && typeof v.source === 'string';
};

export function sessionModelsCache(session: SessionStorageLike): ModelsCache {
  const read = async (): Promise<Record<string, unknown>> => {
    const value = (await session.get(MODELS_CACHE_KEY))[MODELS_CACHE_KEY];
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  };
  return {
    async load(provider) {
      const list = (await read())[provider];
      return isList(list) ? list : null;
    },
    async save(list) {
      await session.set({ [MODELS_CACHE_KEY]: { ...(await read()), [list.provider]: list } });
    },
  };
}

export function extensionModelsCache(scope: typeof globalThis = globalThis): ModelsCache {
  const g = scope as { browser?: { storage?: { session?: SessionStorageLike } }; chrome?: { storage?: { session?: SessionStorageLike } } };
  const session = g.browser?.storage?.session ?? g.chrome?.storage?.session;
  return session ? sessionModelsCache(session) : memoryModelsCache();
}

/** حكم صحة المفتاح من استجابة المزوّد، أو null حين لا تغيّرها (عطل مؤقت أثناء الاستعمال). */
export function providerVerdict(result: ProviderResult<unknown>, mode: 'verify' | 'usage', host: string): Verdict | null {
  if (result.ok) return { health: 'healthy', detail: {} };
  const { status, message, retryAt } = result;
  switch (result.failure) {
    case 'permission':
      return mode === 'verify' ? { health: 'unverified', detail: { reason: `لم يُتحقق منه: يحتاج صلاحية ${host} الاختيارية أولًا، ولن يُستعمل قبلها.` } } : null;
    case 'unauthorized':
      return { health: 'expired', detail: { status } };
    case 'forbidden':
      return { health: 'insufficient', detail: { status, reason: message } };
    case 'rate-limit':
      return { health: 'rate-limited', detail: { status, retryAt } };
    case 'overloaded':
    case 'network':
    case 'http':
      return mode === 'verify' ? { health: 'unavailable', detail: { status, reason: message } } : null;
    default:
      return null;
  }
}

export interface ProviderServiceOptions {
  readonly registry?: ProviderRegistry;
  /** مخزن مفتاح المزوّد (الخلفية وحدها)؛ null بلا مخزن. */
  readonly keys: Pick<SecretStore, 'read' | 'info'> | null;
  readonly permissions: PermissionsApi | null;
  readonly fetch?: typeof fetch;
  /** سجل الاتصالات: حالة المفتاح وتسجيل صحته. */
  readonly connections: { status(): Promise<readonly ConnectionStatus[]>; observe(id: 'provider-key', verdict: Verdict | null): Promise<void> };
  readonly settings: () => Promise<Pick<SettingsStore, 'get' | 'set'>>;
  readonly cache?: ModelsCache;
  readonly now?: () => number;
  readonly timeoutMs?: number;
  readonly onError?: (error: unknown) => void;
}

type Fail = Extract<ProviderResult<never>, { ok: false }>;
const local = (failure: ProviderFailure, message: string, retryAt: number | null = null): Fail => ({ ok: false, failure, status: null, message, retryAt });

const SECTION = /^[a-z][a-z0-9.-]{0,40}$/;

export class ProviderService {
  private readonly registry: ProviderRegistry;
  private readonly cache: ModelsCache;
  private readonly now: () => number;
  /** الطلب الجاري لكل قسم في تبويب. */
  private readonly inflight = new Map<string, string>();
  private readonly controllers = new Map<string, AbortController>();
  /** موعد إعادة المحاولة الذي أعلنه المزوّد لكل مزوّد. */
  private readonly retryAt = new Map<string, number>();

  constructor(private readonly options: ProviderServiceOptions) {
    this.registry = options.registry ?? createProviderRegistry();
    this.cache = options.cache ?? memoryModelsCache();
    this.now = options.now ?? (() => Date.now());
  }

  private async provider(): Promise<ProviderAdapter> {
    const settings = await this.options.settings().catch(() => null);
    const id = settings?.get<string>(PROVIDER_ID_KEY);
    return (typeof id === 'string' && this.registry.byId(id)) || this.registry.first;
  }

  private async choice(): Promise<string> {
    const settings = await this.options.settings().catch(() => null);
    const value = settings?.get<string>(PROVIDER_MODEL_KEY);
    return typeof value === 'string' && isModelId(value) ? value : '';
  }

  private cooldown(provider: string): number | null {
    const at = this.retryAt.get(provider);
    if (at === undefined) return null;
    if (this.now() >= at) {
      this.retryAt.delete(provider);
      return null;
    }
    return at;
  }

  /** حالة المزوّد الآن، بلا أي طلب شبكة. */
  async status(): Promise<ProviderStatus> {
    const adapter = await this.provider();
    const [permission, statuses, models, choice] = await Promise.all([
      this.options.permissions?.contains({ origins: [adapter.origin] }).catch(() => false) ?? Promise.resolve(false),
      this.options.connections.status().catch(() => [] as readonly ConnectionStatus[]),
      this.cache.load(adapter.id).catch(() => null),
      this.choice(),
    ]);
    const fallback = models ? defaultModel(models) : null;
    const model = choice ? { id: choice, displayName: models?.models.find((m) => m.id === choice)?.displayName ?? choice } : fallback ? { id: fallback.id, displayName: fallback.displayName } : null;
    return {
      provider: { id: adapter.id, title: adapter.title, host: adapter.host, origin: adapter.origin, keyPrefix: adapter.keyPrefix, verifyRequest: adapter.verifyRequest },
      permission,
      key: statuses.find((s) => s.id === 'provider-key') ?? null,
      model,
      choice,
      models,
      retryAt: this.cooldown(adapter.id),
    };
  }

  private async key(): Promise<{ key: string } | Fail> {
    if (!this.options.keys) return local('no-key', 'لا مفتاح مزوّد محفوظ؛ لم يُرسل شيء.');
    try {
      const record = await this.options.keys.read();
      return record ? { key: record.token } : local('no-key', 'لا مفتاح مزوّد محفوظ؛ لم يُرسل شيء.');
    } catch (error) {
      return local('key-read', `تعذّرت قراءة المفتاح المحفوظ (${error instanceof Error ? error.name : 'Error'})؛ لم يُرسل شيء.`);
    }
  }

  private call(adapter: ProviderAdapter, key: string, signal?: AbortSignal) {
    if (!this.options.permissions) throw new Error('لا واجهة صلاحيات في هذا السياق');
    const fetch = gatedFetch(adapter, { permissions: this.options.permissions, ...(this.options.fetch ? { fetch: this.options.fetch } : {}) });
    return { key, fetch, now: this.now, ...(signal ? { signal } : {}) };
  }

  private observe(verdict: Verdict | null): Promise<void> {
    return this.options.connections.observe('provider-key', verdict).catch((error: unknown) => this.options.onError?.(error));
  }

  private note(adapter: ProviderAdapter, result: ProviderResult<unknown>): void {
    if (!result.ok && result.retryAt !== null) this.retryAt.set(adapter.id, result.retryAt);
  }

  /** طلب التحقق المعلن: قائمة المودلات بالمفتاح المحفوظ. يسجّل صحته ويحفظ القائمة، ويثبّت المودل الافتراضي إن لم يُختر مودل. */
  async verify(): Promise<VerifyResponse> {
    const adapter = await this.provider();
    const got = await this.key();
    if (!('key' in got)) return got;
    const result = await adapter.listModels(this.call(adapter, got.key));
    this.note(adapter, result);
    await this.observe(providerVerdict(result, 'verify', adapter.host));
    if (result.ok) {
      await this.cache.save(result.data).catch((error: unknown) => this.options.onError?.(error));
      if (!(await this.choice())) {
        const fallback = defaultModel(result.data);
        if (fallback) await (await this.options.settings()).set(PROVIDER_MODEL_KEY, fallback.id).catch((error: unknown) => this.options.onError?.(error));
      }
    }
    return result;
  }

  /** طلب تحليل واحد بعد موافقة المستخدم. لا يُرسل شيئًا إن غاب شرط، ويعلن السبب. */
  async analyze(input: AnalyzeInput, tab: string): Promise<AnalyzeResponse> {
    if (!SECTION.test(input.section) || typeof input.requestId !== 'string' || !input.requestId || typeof input.prompt !== 'string' || !input.prompt.trim() || typeof input.system !== 'string' || !isModelId(input.model)) {
      return local('invalid-request', 'طلب تحليل غير صالح؛ لم يُرسل شيء.');
    }
    const slot = `${tab}:${input.section}`;
    if (this.inflight.has(slot)) return local('busy', 'طلب تحليل جارٍ من هذا القسم؛ انتظره أو أوقفه. لم يُرسل طلب آخر.');
    // الحجز متزامن قبل أي await: نقرتان متتاليتان لا تُصدران طلبين.
    this.inflight.set(slot, input.requestId);
    const controller = new AbortController();
    this.controllers.set(input.requestId, controller);
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const adapter = await this.provider();
      const wait = this.cooldown(adapter.id);
      if (wait !== null) return local('cooldown', `أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.`, wait);
      const status = await this.status();
      if (!status.model || status.model.id !== input.model) return local('model-changed', 'تغيّر المودل بعد عرض الموافقة؛ لم يُرسل شيء. راجع الموافقة من جديد.');
      if (status.key?.health === 'expired') return local('expired-key', `رفض ${adapter.title} المفتاح المحفوظ من قبل (401)؛ لم يُرسل شيء. استبدله أو تحقق منه من الإعدادات.`);
      if (!status.permission) return local('permission', `صلاحية ${adapter.host} غير ممنوحة؛ امنحها من بطاقة مفتاح المزوّد في الإعدادات. لم يُرسل شيء.`);
      if (controller.signal.aborted) return local('aborted', 'أُوقف الطلب قبل إرساله؛ لم يُرسل شيء.');
      const got = await this.key();
      if (!('key' in got)) return got;
      const declared = status.models?.models.find((m) => m.id === input.model)?.maxTokens ?? null;
      const maxTokens = declared !== null ? Math.min(ANALYSIS_OUTPUT_TOKENS, declared) : ANALYSIS_OUTPUT_TOKENS;
      timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? ANALYSIS_TIMEOUT_MS);
      const requestedAt = this.now();
      const result = await adapter.analyze(this.call(adapter, got.key, controller.signal), { model: input.model, system: input.system, prompt: input.prompt, maxTokens });
      this.note(adapter, result);
      await this.observe(providerVerdict(result, 'usage', adapter.host));
      if (!result.ok) return { ...result, message: redactKey(result.message, got.key) };
      return { ok: true, status: result.status, data: { ...result.data, provider: adapter.title, host: adapter.host, requestedAt, completedAt: this.now() } };
    } finally {
      if (timer) clearTimeout(timer);
      if (this.inflight.get(slot) === input.requestId) this.inflight.delete(slot);
      this.controllers.delete(input.requestId);
    }
  }

  cancel(requestId: string): boolean {
    const controller = this.controllers.get(requestId);
    if (!controller) return false;
    controller.abort();
    return true;
  }

  /** يعالج رسالة الطبقة. tab: تبويب المرسل من sender (لا من الرسالة). لا يرمي. */
  async handle(request: ProviderRequest, tab: string): Promise<unknown> {
    try {
      switch (request.op) {
        case 'status':
          return await this.status();
        case 'verify':
          return await this.verify();
        case 'analyze':
          return await this.analyze(request, tab);
        case 'cancel':
          return this.cancel(request.requestId);
      }
    } catch (error) {
      this.options.onError?.(error);
      return request.op === 'status' ? null : local('network', error instanceof Error ? error.message : String(error));
    }
  }
}

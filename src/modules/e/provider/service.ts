// خدمة المزوّد في الخلفية (T-11.6، T-11.10، F-E9): الخلفية وحدها تقرأ مفتاح المزوّد من مخزنه الموثوق لكل طلب وتضيفه إلى طلب محوّله، فلا يعبر المفتاح
// رسالة ولا يصل سكربت المحتوى؛ ولا تقرأ رمز GitHub ولا أي سرّ آخر (AC-E9 (٤)، AD-19).
//  - لكل مزوّد مخزن مفتاحه المستقل (DEC-10 ح-4) ومودله وحالة صحته وقائمة مودلاته وموعد إعادة المحاولة الذي أعلنه؛ وطلب مزوّد لا يقرأ إلا مخزن مزوّده،
//    والبوابة (bindKey) ترفض مفتاحًا ليس له، فلا يُرسل مفتاح إلى مضيف غير مزوّده (AC-E10 (٢)).
//  - لا طلب إلا بفعل صريح: «تحقق» لمزوّد من صفحة الإعدادات (قائمة مودلاته، الطلب المعلن)، و«افحص التوافق» لمودل لم تعلن واجهته توافقه، و«أرسل
//    وحلّل» من موافقة القسم. وstatus لا يطلب شيئًا.
//  - طلب واحد جارٍ لكل قسم في التبويب، وطلب تحليل واحد لكل رسالة، ولا إعادة محاولة تلقائية ولا تحويل إلى مزوّد آخر عند الفشل؛ وموعد إعادة
//    المحاولة الذي يعلنه المزوّد يُحترم فلا يُرسل قبله شيء إليه؛ ومفتاح رفضه المزوّد (401) لا يُرسل به ثانية حتى يُستبدل أو يُتحقق منه. ولا سقف
//    إنفاق ولا ميزانية ولا حصة تفرضها الإضافة (AD-31): إدارة الإنفاق للمستخدم عند المزوّد.
//  - المزوّد والمودل المرسل إليهما هما ما عرضته الموافقة: إن تغيّر أحدهما بينهما لا يُرسل شيء (AC-E10 (٥)).
//  - صحة كل مفتاح تُسجَّل في سجل الاتصالات لمزوّده من الاستجابات الفعلية (تحقق واستعمال)، وقائمة المودلات تُحفظ في storage.session بمصدرها ووقتها.
import type { PermissionsApi, PermissionsSet } from '../../../core/ui-host/browser-api';
import type { ConnectionStatus, Verdict } from '../../../core/connections/health';
import type { SecretStore, SessionStorageLike } from '../../../core/connections/secrets';
import type { SettingsStore } from '../../../core/settings';
import { providerInfo } from './catalog';
import { bindKey, gatedFetch, redactKey } from './gate';
import type { ProviderSecret } from './gate';
import { compatibleModels, defaultModel, isModelId, keepChecked, markChecked } from './models';
import { createProviderRegistry } from './registry';
import type { ProviderRegistry } from './registry';
import { PROVIDER_ID_KEY, modelSettingKey } from './settings';
import type { AnalyzeInput, AnalyzeResponse, ProbeResponse, ProviderRequest, ProviderStatus, ProviderSummary, VerifyResponse } from './port';
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

/** قائمة محفوظة قبل T-11.10 بلا حقل التوافق: مودلات مزوّد يعلن توافقها كلها، فتُقرأ «معلنة» حتى تُقرأ القائمة من جديد. */
const withCompatibility = (list: ModelsList): ModelsList => ({ ...list, models: list.models.map((m) => (m.compatibility ? m : { ...m, compatibility: 'declared' as const })) });

export function sessionModelsCache(session: SessionStorageLike): ModelsCache {
  const read = async (): Promise<Record<string, unknown>> => {
    const value = (await session.get(MODELS_CACHE_KEY))[MODELS_CACHE_KEY];
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  };
  return {
    async load(provider) {
      const list = (await read())[provider];
      return isList(list) ? withCompatibility(list) : null;
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

/** مخزن مفتاح مزوّد كما تراه الخدمة: قراءة المفتاح ووقت حفظه. */
export type ProviderKeyStore = Pick<SecretStore, 'read' | 'info'>;

export interface ProviderServiceOptions {
  readonly registry?: ProviderRegistry;
  /** مخزن مفتاح كل مزوّد (الخلفية وحدها)، بمفتاحَي تخزين مستقلين لكلٍّ منها؛ null بلا مخزن. */
  readonly keys: (provider: string) => ProviderKeyStore | null;
  readonly permissions: PermissionsApi | null;
  /**
   * موافقة نقل المحتوى التي يشترطها المتصفح للتحليل فوق صلاحية المضيف (Firefox: data_collection websiteContent، AD-15)؛ null حيث لا يشترطها.
   * واحدة لكل المزوّدين، تُمنح مع صلاحية مضيف المزوّد في نقرة حفظ مفتاحه، و`permission` في الحالة يجمعهما. والتحقق (قائمة المودلات) والفحص الصريح لا
   * يحملان محتوى فلا يحتاجانها.
   */
  readonly contentPermission?: PermissionsSet | null;
  readonly fetch?: typeof fetch;
  /** سجل الاتصالات: حالة مفتاح كل مزوّد وتسجيل صحته. */
  readonly connections: {
    keyStatus(provider: string): Promise<ConnectionStatus | null>;
    observe(id: 'provider-key', verdict: Verdict | null, provider: string): Promise<void>;
  };
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

  private async settings(): Promise<Pick<SettingsStore, 'get' | 'set'> | null> {
    return this.options.settings().catch(() => null);
  }

  /** المزوّد المختار للتحليل الآن. */
  private async selected(): Promise<ProviderAdapter> {
    const id = (await this.settings())?.get<string>(PROVIDER_ID_KEY);
    return (typeof id === 'string' && this.registry.byId(id)) || this.registry.first;
  }

  private async choice(provider: string): Promise<string> {
    const value = (await this.settings())?.get<string>(modelSettingKey(provider));
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

  private contains(set: PermissionsSet): Promise<boolean> {
    return this.options.permissions?.contains(set).catch(() => false) ?? Promise.resolve(false);
  }

  /** حالة مزوّد (المختار إن لم يُذكر) الآن، بلا أي طلب شبكة؛ null لمعرّف خارج السجل. */
  async status(id?: string): Promise<ProviderStatus | null> {
    const selected = await this.selected();
    const adapter = id === undefined ? selected : this.registry.byId(id);
    if (!adapter) return null;
    const d = adapter.descriptor;
    const content = this.options.contentPermission ?? null;
    const [hostPermission, contentPermission, key, models, choice, providers] = await Promise.all([
      this.contains({ origins: [d.origin] }),
      content ? this.contains(content) : Promise.resolve(null),
      this.options.connections.keyStatus(d.id).catch(() => null),
      this.cache.load(d.id).catch(() => null),
      this.choice(d.id),
      this.summaries(),
    ]);
    return {
      provider: providerInfo(d),
      selected: adapter === selected,
      permission: hostPermission && contentPermission !== false,
      hostPermission,
      contentPermission,
      key,
      model: this.modelOf(models, choice),
      choice,
      models,
      retryAt: this.cooldown(d.id),
      providers,
    };
  }

  /**
   * المودل الذي يُرسل إليه: اختيار المستخدم إن كان متوافقًا أو لم تُقرأ القائمة في هذه الجلسة (يبقى باسمه)، وإلا الافتراضي المتوافق من القائمة؛ واختيار
   * في القائمة لم يثبت توافقه لا يُرسل إليه (BLK-MODEL-COMPAT).
   */
  private modelOf(models: ModelsList | null, choice: string): ProviderStatus['model'] {
    if (choice) {
      if (!models) return { id: choice, displayName: choice };
      const found = models.models.find((m) => m.id === choice);
      if (!found) return { id: choice, displayName: choice };
      return compatibleModels(models).includes(found) ? { id: found.id, displayName: found.displayName } : null;
    }
    const fallback = models ? defaultModel(models) : null;
    return fallback ? { id: fallback.id, displayName: fallback.displayName } : null;
  }

  private summaries(): Promise<ProviderSummary[]> {
    return Promise.all(
      this.registry.list.map(async ({ descriptor: d }) => ({ id: d.id, title: d.title, host: d.host, health: (await this.options.connections.keyStatus(d.id).catch(() => null))?.health ?? null })),
    );
  }

  /** مفتاح المزوّد من مخزنه هو وحده. */
  private async secret(adapter: ProviderAdapter): Promise<ProviderSecret | Fail> {
    const store = this.options.keys(adapter.descriptor.id);
    const none = local('no-key', `لا مفتاح محفوظ لـ${adapter.descriptor.title}؛ لم يُرسل شيء.`);
    if (!store) return none;
    try {
      const record = await store.read();
      return record ? { provider: adapter.descriptor.id, token: record.token } : none;
    } catch (error) {
      return local('key-read', `تعذّرت قراءة المفتاح المحفوظ (${error instanceof Error ? error.name : 'Error'})؛ لم يُرسل شيء.`);
    }
  }

  private call(adapter: ProviderAdapter, secret: ProviderSecret, signal?: AbortSignal) {
    if (!this.options.permissions) throw new Error('لا واجهة صلاحيات في هذا السياق');
    const key = bindKey(adapter.descriptor, secret);
    const fetch = gatedFetch(adapter.descriptor, { permissions: this.options.permissions, ...(this.options.fetch ? { fetch: this.options.fetch } : {}) });
    return { key, fetch, now: this.now, ...(signal ? { signal } : {}) };
  }

  private observe(adapter: ProviderAdapter, verdict: Verdict | null): Promise<void> {
    return this.options.connections.observe('provider-key', verdict, adapter.descriptor.id).catch((error: unknown) => this.options.onError?.(error));
  }

  private note(adapter: ProviderAdapter, result: ProviderResult<unknown>): void {
    if (!result.ok && result.retryAt !== null) this.retryAt.set(adapter.descriptor.id, result.retryAt);
  }

  private save(list: ModelsList): Promise<void> {
    return this.cache.save(list).catch((error: unknown) => this.options.onError?.(error));
  }

  /** طلب التحقق المعلن لمزوّد: قائمة مودلاته بمفتاحه المحفوظ. يسجّل صحته ويحفظ القائمة، ويثبّت مودله الافتراضي المتوافق إن لم يُختر مودل. */
  async verify(id: string): Promise<VerifyResponse> {
    const adapter = this.registry.byId(id);
    if (!adapter) return local('invalid-request', 'مزوّد غير معروف؛ لم يُرسل شيء.');
    const got = await this.secret(adapter);
    if (!('token' in got)) return got;
    const result = await adapter.listModels(this.call(adapter, got));
    this.note(adapter, result);
    await this.observe(adapter, providerVerdict(result, 'verify', adapter.descriptor.host));
    if (!result.ok) return result;
    const list = keepChecked(result.data, await this.cache.load(adapter.descriptor.id).catch(() => null));
    await this.save(list);
    if (!(await this.choice(adapter.descriptor.id))) {
      const fallback = defaultModel(list);
      if (fallback) await (await this.options.settings()).set(modelSettingKey(adapter.descriptor.id), fallback.id).catch((error: unknown) => this.options.onError?.(error));
    }
    return { ...result, data: list };
  }

  /**
   * فحص التوافق الصريح (DEC-13 ن-3) لمودل في قائمة المزوّد لم تعلن واجهته توافقه: طلب المحوّل المعلن بلا محتوى من الصفحات، بنقر المستخدم. نجاحه
   * يجعل المودل «مفحوصًا» في القائمة المحفوظة فيصير خيارًا للتحليل؛ وفشله لا يغيّر شيئًا. لا فحص لمزوّد لا يدعمه ولا لمودل خارج قائمته.
   */
  async probe(id: string, model: string): Promise<ProbeResponse> {
    const adapter = this.registry.byId(id);
    if (!adapter?.probe || !isModelId(model)) return local('invalid-request', 'لا فحص توافق صريح لهذا المزوّد أو المودل؛ لم يُرسل شيء.');
    const list = await this.cache.load(adapter.descriptor.id).catch(() => null);
    const entry = list?.models.find((m) => m.id === model);
    if (!list || !entry || entry.compatibility !== 'unknown') return local('invalid-request', 'المودل ليس في قائمة المزوّد المقروءة أو حُسم توافقه؛ لم يُرسل شيء.');
    const wait = this.cooldown(adapter.descriptor.id);
    if (wait !== null) return local('cooldown', 'أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.', wait);
    const got = await this.secret(adapter);
    if (!('token' in got)) return got;
    const result = await adapter.probe(this.call(adapter, got), model);
    this.note(adapter, result);
    await this.observe(adapter, providerVerdict(result, 'usage', adapter.descriptor.host));
    if (!result.ok) return { ...result, message: redactKey(result.message, got.token) };
    const updated = markChecked(list, model);
    await this.save(updated);
    return { ok: true, status: result.status, data: updated };
  }

  /** طلب تحليل واحد بعد موافقة المستخدم. لا يُرسل شيئًا إن غاب شرط، ويعلن السبب. */
  async analyze(input: AnalyzeInput, tab: string): Promise<AnalyzeResponse> {
    if (
      !SECTION.test(input.section) ||
      typeof input.requestId !== 'string' ||
      !input.requestId ||
      typeof input.provider !== 'string' ||
      typeof input.prompt !== 'string' ||
      !input.prompt.trim() ||
      typeof input.system !== 'string' ||
      !isModelId(input.model)
    ) {
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
      const adapter = await this.selected();
      const d = adapter.descriptor;
      // لا تحويل إلى مزوّد غير الذي عرضته الموافقة (AC-E10 (٥)).
      if (d.id !== input.provider) return local('provider-changed', 'تغيّر المزوّد المختار بعد عرض الموافقة؛ لم يُرسل شيء. راجع الموافقة من جديد.');
      const wait = this.cooldown(d.id);
      if (wait !== null) return local('cooldown', `أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.`, wait);
      const status = await this.status(d.id);
      if (!status?.model || status.model.id !== input.model) return local('model-changed', 'تغيّر المودل أو لم يثبت توافقه بعد عرض الموافقة؛ لم يُرسل شيء. راجع الموافقة من جديد.');
      if (status.key?.health === 'expired') return local('expired-key', `رفض ${d.title} المفتاح المحفوظ من قبل (401)؛ لم يُرسل شيء. استبدله أو تحقق منه من الإعدادات.`);
      if (!status.permission) {
        return local(
          'permission',
          this.options.contentPermission
            ? `صلاحية ${d.host} أو موافقة المتصفح على مشاركة محتوى المواقع غير ممنوحة؛ امنحهما من بطاقة «مزوّد التحليل» في الإعدادات. لم يُرسل شيء.`
            : `صلاحية ${d.host} غير ممنوحة؛ امنحها من بطاقة «مزوّد التحليل» في الإعدادات. لم يُرسل شيء.`,
        );
      }
      if (controller.signal.aborted) return local('aborted', 'أُوقف الطلب قبل إرساله؛ لم يُرسل شيء.');
      const got = await this.secret(adapter);
      if (!('token' in got)) return got;
      const declared = status.models?.models.find((m) => m.id === input.model)?.maxTokens ?? null;
      const maxTokens = declared !== null && declared > 0 ? Math.min(ANALYSIS_OUTPUT_TOKENS, declared) : ANALYSIS_OUTPUT_TOKENS;
      timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? ANALYSIS_TIMEOUT_MS);
      const requestedAt = this.now();
      const result = await adapter.analyze(this.call(adapter, got, controller.signal), { model: input.model, system: input.system, prompt: input.prompt, maxTokens });
      this.note(adapter, result);
      await this.observe(adapter, providerVerdict(result, 'usage', d.host));
      if (!result.ok) return { ...result, message: redactKey(result.message, got.token) };
      return { ok: true, status: result.status, data: { ...result.data, provider: d.title, host: d.host, requestedAt, completedAt: this.now() } };
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
          return await this.status(typeof request.provider === 'string' ? request.provider : undefined);
        case 'verify':
          return await this.verify(String(request.provider));
        case 'probe':
          return await this.probe(String(request.provider), String(request.model));
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

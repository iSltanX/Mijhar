// خدمة المزوّد في الخلفية (T-11.6، T-11.10، F-E9): الخلفية وحدها تقرأ مفتاح المزوّد من مخزنه الموثوق لكل طلب وتضيفه إلى طلب محوّله، فلا يعبر المفتاح
// رسالة ولا يصل سكربت المحتوى؛ ولا تقرأ رمز GitHub ولا أي سرّ آخر (AC-E9 (٤)، AD-19).
//  - لكل مزوّد مخزن مفتاحه المستقل (DEC-10 ح-4) ومودله وحالة صحته وقائمة مودلاته وموعد إعادة المحاولة الذي أعلنه؛ وطلب مزوّد لا يقرأ إلا مخزن مزوّده،
//    والبوابة (bindKey) ترفض مفتاحًا ليس له، فلا يُرسل مفتاح إلى مضيف غير مزوّده (AC-E10 (٢)).
//  - لا طلب إلا بفعل صريح: «تحقق» لمزوّد من صفحة الإعدادات (قائمة نماذجه، الطلب المعلن؛ وزر + يرسل الطلب نفسه)، و«اختبر النموذج» الاختياري للنموذج
//    المكتوب، و«أرسل وحلّل» من موافقة القسم. وstatus لا يطلب شيئًا. والتحقق والاختبار (طلبان بالمفتاح لا يبدؤهما قسم) يُقبلان من صفحات الإضافة وحدها،
//    لا من سكربت المحتوى (الخلفية تحدد ذلك من sender لا من الرسالة).
//  - النموذج (DEC-13 ن-5): ما في حقله لكل مزوّد يُرسل إليه التحليل كما هو وإن لم يكن في القائمة، والقائمة والاختبار لا يشترطان شيئًا؛ والحقل الفارغ لا
//    تحليل معه. ونتيجة الاختبار مقرونة بمزوّدها ونموذجها ووقت حفظ المفتاح، فلا تُعرض لنموذج آخر ولا بعد استبدال المفتاح.
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
import { defaultModel, isModelId, testFor, testVerdict } from './models';
import { createProviderRegistry } from './registry';
import type { ProviderRegistry } from './registry';
import { PROVIDER_ID_KEY, modelSettingKey } from './settings';
import type { AnalyzeInput, AnalyzeResponse, ProbeResponse, ProviderRequest, ProviderStatus, ProviderSummary, VerifyResponse } from './port';
import type { ModelTest, ModelsList, ProviderAdapter, ProviderFailure, ProviderResult } from './types';

/** حد طول الرد المطلوب في واجهة الرسائل (إلزامي فيها)، مقصورًا على ما يعلنه المودل؛ ليس سقف إنفاق (AD-31). */
export const ANALYSIS_OUTPUT_TOKENS = 4096;
/** مهلة تقنية للطلب الواحد؛ والمستخدم يوقفه قبلها متى شاء. */
export const ANALYSIS_TIMEOUT_MS = 180_000;

export const MODELS_CACHE_KEY = 'mijhar.provider.models';
/** آخر «اختبر النموذج» لكل مزوّد (DEC-13 ن-5)، في ذاكرة الجلسة مع القوائم. */
export const MODEL_TESTS_KEY = 'mijhar.provider.tests';

/** قائمة النماذج المقروءة لكل مزوّد، وآخر اختبار نموذج لكل مزوّد. */
export interface ModelsCache {
  load(provider: string): Promise<ModelsList | null>;
  save(list: ModelsList): Promise<void>;
  loadTest(provider: string): Promise<ModelTest | null>;
  saveTest(test: ModelTest): Promise<void>;
}

export function memoryModelsCache(): ModelsCache & { lists: Map<string, ModelsList>; tests: Map<string, ModelTest> } {
  const lists = new Map<string, ModelsList>();
  const tests = new Map<string, ModelTest>();
  return {
    lists,
    tests,
    load: async (p) => lists.get(p) ?? null,
    save: async (l) => void lists.set(l.provider, l),
    loadTest: async (p) => tests.get(p) ?? null,
    saveTest: async (t) => void tests.set(t.provider, t),
  };
}

const isList = (value: unknown): value is ModelsList => {
  const v = value as Partial<ModelsList> | null;
  return typeof v === 'object' && v !== null && typeof v.provider === 'string' && Array.isArray(v.models) && typeof v.readAt === 'number' && typeof v.source === 'string';
};

/** قائمة محفوظة قبل T-11.10 بلا حقل التوافق: نماذج مزوّد يعلن توافقها كلها، فتُقرأ «معلنة» حتى تُقرأ القائمة من جديد؛ وما سوى «معلنة» غير معلن. */
const withCompatibility = (list: ModelsList): ModelsList => ({
  ...list,
  models: list.models.map((m) => ({ ...m, compatibility: m.compatibility === undefined || m.compatibility === 'declared' ? ('declared' as const) : ('unknown' as const) })),
});

const VERDICTS: readonly ModelTest['verdict'][] = ['accepted', 'rejected', 'inconclusive'];
const isTest = (value: unknown): value is ModelTest => {
  const v = value as Partial<ModelTest> | null;
  return typeof v === 'object' && v !== null && typeof v.provider === 'string' && isModelId(v.model) && typeof v.keySavedAt === 'number' && VERDICTS.includes(v.verdict as ModelTest['verdict']) && typeof v.at === 'number';
};

export function sessionModelsCache(session: SessionStorageLike): ModelsCache {
  const read = async (key: string): Promise<Record<string, unknown>> => {
    const value = (await session.get(key))[key];
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  };
  return {
    async load(provider) {
      const list = (await read(MODELS_CACHE_KEY))[provider];
      return isList(list) ? withCompatibility(list) : null;
    },
    async save(list) {
      await session.set({ [MODELS_CACHE_KEY]: { ...(await read(MODELS_CACHE_KEY)), [list.provider]: list } });
    },
    async loadTest(provider) {
      const test = (await read(MODEL_TESTS_KEY))[provider];
      return isTest(test) && test.provider === provider ? test : null;
    },
    async saveTest(test) {
      await session.set({ [MODEL_TESTS_KEY]: { ...(await read(MODEL_TESTS_KEY)), [test.provider]: test } });
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
    /** savedAt: وقت حفظ المفتاح الذي أُرسل به الطلب؛ لا يُكتب الحكم إن استُبدل المفتاح قبل الرد (F-03). */
    observe(id: 'provider-key', verdict: Verdict | null, provider: string, savedAt?: number): Promise<void>;
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

/** المفتاح كما قُرئ للطلب، ومعه وقت حفظه من القراءة نفسها: هوية جيل المفتاح الذي تُنسب إليه نتيجة الطلب (F-03). */
type KeySnapshot = ProviderSecret & { readonly savedAt: number };

export class ProviderService {
  private readonly registry: ProviderRegistry;
  private readonly cache: ModelsCache;
  private readonly now: () => number;
  /** الطلب الجاري لكل قسم في تبويب. */
  private readonly inflight = new Map<string, string>();
  private readonly controllers = new Map<string, AbortController>();
  /** موعد إعادة المحاولة الذي أعلنه المزوّد لكل مزوّد (ذاكرة العامل؛ ويُستعاد بعد إيقاظه من سجل صحة المفتاح، F-06). */
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

  /**
   * موعد إعادة المحاولة المعلن الذي لم يحن بعد، أو null (AD-31). ما في الذاكرة أولًا؛ وإلا فمن سجل صحة المفتاح المحفوظ، فلا يُسقطه إيقاظ عامل الخلفية
   * (F-06). والسجل لا يُعطي موعدًا إلا لجيل المفتاح الحالي نفسه وقبل حلوله (resolveStatus)، فلا يُنسب موعد مفتاح استُبدل إلى بديله.
   */
  private async cooldown(provider: string): Promise<number | null> {
    let at = this.retryAt.get(provider);
    if (at === undefined) {
      const key = await this.options.connections.keyStatus(provider).catch(() => null);
      const saved = key?.health === 'rate-limited' ? key.detail.retryAt : null;
      if (typeof saved !== 'number') return null;
      at = saved;
      this.retryAt.set(provider, at);
    }
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
    const [hostPermission, contentPermission, key, models, choice, providers, test, keySavedAt] = await Promise.all([
      this.contains({ origins: [d.origin] }),
      content ? this.contains(content) : Promise.resolve(null),
      this.options.connections.keyStatus(d.id).catch(() => null),
      this.cache.load(d.id).catch(() => null),
      this.choice(d.id),
      this.summaries(),
      this.cache.loadTest(d.id).catch(() => null),
      this.keySavedAt(adapter),
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
      test: testFor(test, choice, keySavedAt),
      retryAt: await this.cooldown(d.id),
      providers,
    };
  }

  /**
   * النموذج الذي يُرسل إليه (DEC-13 ن-5): ما في حقله كما هو، في القائمة أو خارجها، اختُبر أو لم يُختبر؛ واسمه المعروض من القائمة إن وُجد فيها. والحقل
   * الفارغ لا نموذج معه فلا تحليل (BLK-MODEL-COMPAT)، ولا يُخمَّن نموذج.
   */
  private modelOf(models: ModelsList | null, choice: string): ProviderStatus['model'] {
    if (!choice) return null;
    return { id: choice, displayName: models?.models.find((m) => m.id === choice)?.displayName ?? choice };
  }

  /** وقت حفظ مفتاح المزوّد الحالي (يقرن نتيجة الاختبار بالمفتاح الذي اختُبر به)، أو null. */
  private async keySavedAt(adapter: ProviderAdapter): Promise<number | null> {
    const info = await this.options.keys(adapter.descriptor.id)?.info().catch(() => null);
    return info ? info.savedAt : null;
  }

  private summaries(): Promise<ProviderSummary[]> {
    return Promise.all(
      this.registry.list.map(async ({ descriptor: d }) => ({ id: d.id, title: d.title, host: d.host, health: (await this.options.connections.keyStatus(d.id).catch(() => null))?.health ?? null })),
    );
  }

  /** مفتاح المزوّد من مخزنه هو وحده، ووقت حفظه من القراءة نفسها (لا من قراءة ثانية قد تلي استبداله). */
  private async secret(adapter: ProviderAdapter): Promise<KeySnapshot | Fail> {
    const store = this.options.keys(adapter.descriptor.id);
    const none = local('no-key', `لا مفتاح محفوظ لـ${adapter.descriptor.title}؛ لم يُرسل شيء.`);
    if (!store) return none;
    try {
      const record = await store.read();
      return record ? { provider: adapter.descriptor.id, token: record.token, savedAt: record.savedAt } : none;
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

  private observe(adapter: ProviderAdapter, verdict: Verdict | null, key: KeySnapshot): Promise<void> {
    return this.options.connections.observe('provider-key', verdict, adapter.descriptor.id, key.savedAt).catch((error: unknown) => this.options.onError?.(error));
  }

  /** استُبدل المفتاح المحفوظ منذ قُرئ للطلب: نتيجة الطلب للمفتاح القديم، فلا تُحفظ ولا تُعرض للبديل (F-03). */
  private async replaced(adapter: ProviderAdapter, key: KeySnapshot): Promise<boolean> {
    return (await this.keySavedAt(adapter)) !== key.savedAt;
  }

  private changed(adapter: ProviderAdapter, status: number | null): Fail {
    return { ok: false, failure: 'key-changed', status, message: `استُبدل مفتاح ${adapter.descriptor.title} المحفوظ أثناء الطلب؛ لم تُنسب نتيجته إلى المفتاح الجديد. أعد المحاولة به.`, retryAt: null };
  }

  private note(adapter: ProviderAdapter, result: ProviderResult<unknown>): void {
    if (!result.ok && result.retryAt !== null) this.retryAt.set(adapter.descriptor.id, result.retryAt);
  }

  private save(list: ModelsList): Promise<void> {
    return this.cache.save(list).catch((error: unknown) => this.options.onError?.(error));
  }

  /**
   * طلب التحقق المعلن لمزوّد: قائمة نماذجه بمفتاحه المحفوظ. يسجّل صحته ويحفظ القائمة؛ ومع suggest يقترح في حقل النموذج الفارغ أول نموذج أعلنت واجهته
   * توافقه (يجوز ولا يُفرض، DEC-13 ن-5). وزر + يرسله بلا اقتراح. ولا يُرسل قبل موعد إعادة محاولة أعلنه المزوّد (AD-31، F-06).
   */
  async verify(id: string, suggest = true): Promise<VerifyResponse> {
    const adapter = this.registry.byId(id);
    if (!adapter) return local('invalid-request', 'مزوّد غير معروف؛ لم يُرسل شيء.');
    const wait = await this.cooldown(adapter.descriptor.id);
    if (wait !== null) return local('cooldown', 'أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.', wait);
    const got = await this.secret(adapter);
    if (!('token' in got)) return got;
    const result = await adapter.listModels(this.call(adapter, got));
    this.note(adapter, result);
    await this.observe(adapter, providerVerdict(result, 'verify', adapter.descriptor.host), got);
    if (await this.replaced(adapter, got)) return this.changed(adapter, result.status);
    if (!result.ok) return result;
    const list = result.data;
    await this.save(list);
    if (suggest && !(await this.choice(adapter.descriptor.id))) {
      const fallback = defaultModel(list);
      if (fallback) await (await this.options.settings()).set(modelSettingKey(adapter.descriptor.id), fallback.id).catch((error: unknown) => this.options.onError?.(error));
    }
    return { ...result, data: list };
  }

  /**
   * «اختبر النموذج» الاختياري (DEC-13 ن-5) للنموذج المكتوب، في القائمة أو خارجها: طلب المحوّل المعلن بنص ثابت بلا محتوى من الصفحات، بنقر المستخدم.
   * نتيجته تُحفظ مقرونة بالنموذج ووقت حفظ المفتاح وتُعرض وحدها، ولا تمنع الحفظ ولا التحليل ولا تغيّر الحقل؛ وفشل الشبكة أو المصادقة أو حد الطلبات «لم
   * يُحسم» لا رفض. لا اختبار لمزوّد لا يدعمه محوّله، ولا طلب حين لم يُرسل شيء (لا مفتاح، موعد إعادة معلن، صلاحية غير ممنوحة).
   */
  async probe(id: string, model: string): Promise<ProbeResponse> {
    const adapter = this.registry.byId(id);
    if (!adapter?.probe || !isModelId(model)) return local('invalid-request', 'لا اختبار نموذج لهذا المزوّد، أو المعرّف غير صالح؛ لم يُرسل شيء.');
    const wait = await this.cooldown(adapter.descriptor.id);
    if (wait !== null) return local('cooldown', 'أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.', wait);
    const got = await this.secret(adapter);
    if (!('token' in got)) return got;
    const result = await adapter.probe(this.call(adapter, got), model);
    this.note(adapter, result);
    await this.observe(adapter, providerVerdict(result, 'usage', adapter.descriptor.host), got);
    // صلاحية المضيف غير ممنوحة: البوابة رفضت قبل أي طلب، فلا نتيجة اختبار.
    if (!result.ok && result.failure === 'permission') return { ...result, message: redactKey(result.message, got.token) };
    if (await this.replaced(adapter, got)) return this.changed(adapter, result.status);
    const test: ModelTest = {
      provider: adapter.descriptor.id,
      model,
      keySavedAt: got.savedAt,
      verdict: result.ok ? 'accepted' : testVerdict(result.failure),
      status: result.status,
      message: result.ok ? '' : redactKey(result.message, got.token),
      at: this.now(),
    };
    await this.cache.saveTest(test).catch((error: unknown) => this.options.onError?.(error));
    return { ok: true, data: test };
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
      const wait = await this.cooldown(d.id);
      if (wait !== null) return local('cooldown', `أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.`, wait);
      const status = await this.status(d.id);
      if (!status?.model || status.model.id !== input.model) return local('model-changed', 'تغيّر النموذج في حقله أو صار فارغًا بعد عرض الموافقة؛ لم يُرسل شيء. راجع الموافقة من جديد.');
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
      await this.observe(adapter, providerVerdict(result, 'usage', d.host), got);
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

  /**
   * يعالج رسالة الطبقة. tab: تبويب المرسل من sender (لا من الرسالة)؛ extensionPage: المرسل صفحة من الإضافة نفسها (الإعدادات أو اللوحة)، من sender
   * أيضًا. لا يرمي.
   */
  async handle(request: ProviderRequest, tab: string, extensionPage = false): Promise<unknown> {
    try {
      switch (request.op) {
        case 'status':
          return await this.status(typeof request.provider === 'string' ? request.provider : undefined);
        case 'verify':
          return extensionPage ? await this.verify(String(request.provider), request.suggest !== false) : local('invalid-request', 'التحقق من المفتاح من صفحة الإعدادات وحدها؛ لم يُرسل شيء.');
        case 'probe':
          return extensionPage ? await this.probe(String(request.provider), String(request.model)) : local('invalid-request', 'اختبار النموذج من صفحة الإعدادات وحدها؛ لم يُرسل شيء.');
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

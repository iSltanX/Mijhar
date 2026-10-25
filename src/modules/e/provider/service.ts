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
import type { SecretInfo, SecretStore, SessionStorageLike } from '../../../core/connections/secrets';
import type { SettingsStore } from '../../../core/settings';
import { providerInfo } from './catalog';
import { bindKey, gatedFetch, redactKey } from './gate';
import type { ProviderSecret } from './gate';
import { defaultModel, isModelId, testFor, testVerdict } from './models';
import { createProviderRegistry } from './registry';
import type { ProviderRegistry } from './registry';
import { PROVIDER_ID_KEY, WORKSPACE_ID, modelSettingKey, workspaceSettingKey } from './settings';
import type { AnalyzeInput, AnalyzeResponse, ProbeResponse, ProviderRequest, ProviderStatus, ProviderSummary, VerifyResponse } from './port';
import type { ModelTest, ModelsList, ProviderAdapter, ProviderFailure, ProviderResult } from './types';

/** حد طول الرد المطلوب في واجهة الرسائل (إلزامي فيها)، مقصورًا على ما يعلنه المودل؛ ليس سقف إنفاق (AD-31). */
export const ANALYSIS_OUTPUT_TOKENS = 4096;
/** مهلة تقنية للطلب الواحد؛ والمستخدم يوقفه قبلها متى شاء. */
export const ANALYSIS_TIMEOUT_MS = 180_000;
/** رفض يحكم على المفتاح الذي أُرسل به الطلب لا على المحتوى أو الشبكة. */
const KEY_BOUND: ReadonlySet<ProviderFailure> = new Set<ProviderFailure>(['unauthorized', 'forbidden', 'not-found', 'rate-limit']);

export const MODELS_CACHE_KEY = 'mijhar.provider.models';
/** آخر «اختبر النموذج» لكل مزوّد (DEC-13 ن-5)، في ذاكرة الجلسة مع القوائم. */
export const MODEL_TESTS_KEY = 'mijhar.provider.tests';
/** موعد إعادة المحاولة المعلن لكل مزوّد (MJ-TA-05)، في ذاكرة الجلسة مع القوائم، مستقلًا عن صحة آخر طلب. */
export const PROVIDER_RETRY_KEY = 'mijhar.provider.retry';

/** موعد إعادة محاولة أعلنه مزوّد (Retry-After)، مقرونًا بوقت حفظ المفتاح الذي أُعلن له. */
export interface RetryNote {
  readonly provider: string;
  readonly at: number;
  readonly keySavedAt: number;
}

/** وقت حفظ مفتاح المزوّد الآن: رقم، أو null إن لم يُحفظ، أو undefined إن تعذّرت قراءته. */
export type KeyNow = () => Promise<number | null | undefined>;

/**
 * قائمة النماذج المقروءة لكل مزوّد، وآخر اختبار نموذج لكل مزوّد؛ وكلاهما مقرون بوقت حفظ المفتاح الذي صدر به (keySavedAt). والكتابة والحذف يتواليان
 * في طابور واحد، ومع كلٍّ منهما now يُقرأ داخل الطابور: فلا تُكتب نتيجة مفتاح استُبدل أو مُسح بعد أن حُذف ما يخصه، ولا يحذف تنظيفُ مفتاحٍ قديم ما حُفظ
 * لبديله (COR-AUD-02).
 */
export interface ModelsCache {
  load(provider: string): Promise<ModelsList | null>;
  /** مع now: لا تُكتب إلا إن كان مفتاحها (keySavedAt) هو المحفوظ حين يحين دورها في الطابور. */
  save(list: ModelsList, now?: KeyNow): Promise<void>;
  loadTest(provider: string): Promise<ModelTest | null>;
  saveTest(test: ModelTest, now?: KeyNow): Promise<void>;
  /**
   * موعد إعادة المحاولة (MJ-TA-05): يبقى بعد إيقاظ العامل وبعد نجاح طلب متأخر، ولا يُكتب إلا إن كان مفتاحه هو المحفوظ حين يحين دوره، ولا يُستبدل
   * بموعد أقرب لمفتاحه نفسه. ويُحذف بـforget مع ما يخص مفتاحًا مُسح أو استُبدل.
   */
  loadRetry(provider: string): Promise<RetryNote | null>;
  saveRetry(note: RetryNote, now?: KeyNow): Promise<void>;
  /** يحذف قائمة المزوّد ونتيجة اختباره وموعده المقرونة بغير مفتاحه المحفوظ حين يحين دوره في الطابور (مُسح أو استُبدل)؛ وتعذّر قراءة المفتاح: لا حذف. */
  forget(provider: string, now: KeyNow): Promise<void>;
}

/** ما يُبقيه التنظيف: قيمة مقرونة بالمفتاح المحفوظ الآن نفسه. وما لا قرين له (محفوظ قبل القرن) لا يُنسب إلى مفتاح، فيُحذف. */
const ownedBy = (value: unknown, keep: number | null): boolean => keep !== null && (value as { keySavedAt?: unknown } | null)?.keySavedAt === keep;

function serialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };
}

/** يكتب إن لم يُذكر now، أو كان المفتاح المحفوظ الآن هو الذي صدرت به القيمة. */
const writable = async (keySavedAt: number | undefined, now?: KeyNow): Promise<boolean> => !now || (keySavedAt !== undefined && (await now()) === keySavedAt);

const isRetry = (value: unknown): value is RetryNote => {
  const v = value as Partial<RetryNote> | null;
  return typeof v === 'object' && v !== null && typeof v.provider === 'string' && typeof v.at === 'number' && typeof v.keySavedAt === 'number';
};

/** الموعد الأبعد يحكم لمفتاحه نفسه، فلا يقدّمه رد أقرب وصل بعده؛ وموعد مفتاح آخر يُستبدل. */
const laterRetry = (previous: unknown, next: RetryNote): boolean => !isRetry(previous) || previous.keySavedAt !== next.keySavedAt || previous.at < next.at;

export function memoryModelsCache(): ModelsCache & { lists: Map<string, ModelsList>; tests: Map<string, ModelTest>; retries: Map<string, RetryNote> } {
  const lists = new Map<string, ModelsList>();
  const tests = new Map<string, ModelTest>();
  const retries = new Map<string, RetryNote>();
  const serial = serialQueue();
  return {
    lists,
    tests,
    retries,
    load: async (p) => lists.get(p) ?? null,
    save: (l, now) => serial(async () => void ((await writable(l.keySavedAt, now)) && lists.set(l.provider, l))),
    loadTest: async (p) => tests.get(p) ?? null,
    saveTest: (t, now) => serial(async () => void ((await writable(t.keySavedAt, now)) && tests.set(t.provider, t))),
    loadRetry: async (p) => retries.get(p) ?? null,
    saveRetry: (r, now) => serial(async () => void ((await writable(r.keySavedAt, now)) && laterRetry(retries.get(r.provider), r) && retries.set(r.provider, r))),
    forget: (p, now) =>
      serial(async () => {
        const keep = await now();
        if (keep === undefined) return;
        if (!ownedBy(lists.get(p), keep)) lists.delete(p);
        if (!ownedBy(tests.get(p), keep)) tests.delete(p);
        if (!ownedBy(retries.get(p), keep)) retries.delete(p);
      }),
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
  // كل مفتاح يجمع المزوّدين في كائن واحد، فالكتابة قراءة ثم تعديل ثم كتابة؛ وكتابتان متداخلتان تمحو الثانية الأولى. فتتوالى في الخلفية (F-07).
  const serial = serialQueue();
  return {
    async load(provider) {
      const list = (await read(MODELS_CACHE_KEY))[provider];
      return isList(list) ? withCompatibility(list) : null;
    },
    save(list, now) {
      return serial(async () => {
        if (await writable(list.keySavedAt, now)) await session.set({ [MODELS_CACHE_KEY]: { ...(await read(MODELS_CACHE_KEY)), [list.provider]: list } });
      });
    },
    async loadTest(provider) {
      const test = (await read(MODEL_TESTS_KEY))[provider];
      return isTest(test) && test.provider === provider ? test : null;
    },
    saveTest(test, now) {
      return serial(async () => {
        if (await writable(test.keySavedAt, now)) await session.set({ [MODEL_TESTS_KEY]: { ...(await read(MODEL_TESTS_KEY)), [test.provider]: test } });
      });
    },
    async loadRetry(provider) {
      const note = (await read(PROVIDER_RETRY_KEY))[provider];
      return isRetry(note) && note.provider === provider ? note : null;
    },
    saveRetry(note, now) {
      return serial(async () => {
        if (!(await writable(note.keySavedAt, now))) return;
        const all = await read(PROVIDER_RETRY_KEY);
        if (laterRetry(all[note.provider], note)) await session.set({ [PROVIDER_RETRY_KEY]: { ...all, [note.provider]: note } });
      });
    },
    forget(provider, now) {
      return serial(async () => {
        const keep = await now();
        if (keep === undefined) return;
        const items: Record<string, unknown> = {};
        for (const key of [MODELS_CACHE_KEY, MODEL_TESTS_KEY, PROVIDER_RETRY_KEY]) {
          const all = await read(key);
          if (!Object.prototype.hasOwnProperty.call(all, provider) || ownedBy(all[provider], keep)) continue;
          const rest = { ...all };
          delete rest[provider];
          items[key] = rest;
        }
        if (Object.keys(items).length > 0) await session.set(items);
      });
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
    // AD-38: مساحة العمل لا المفتاح؛ فلا يُعدّ المفتاح مرفوضًا، ويبقى «غير متحقق منه» بسببها حتى يُدخل معرّفها أو يُصحَّح.
    case 'workspace':
      return mode === 'verify' ? { health: 'unverified', detail: { status, reason: `يلزم معرّف مساحة عمل صالح يصله المفتاح: ${message}` } } : null;
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
/** ما صار إليه المفتاح المحفوظ منذ قُرئ للطلب. */
type KeyChange = 'replaced' | 'cleared' | 'unreadable';

export class ProviderService {
  private readonly registry: ProviderRegistry;
  private readonly cache: ModelsCache;
  private readonly now: () => number;
  /** الطلب الجاري لكل قسم في تبويب. */
  private readonly inflight = new Map<string, string>();
  private readonly controllers = new Map<string, AbortController>();
  /**
   * موعد إعادة المحاولة الذي أعلنه المزوّد لكل مزوّد، ووقت حفظ المفتاح الذي أُعلن له (ذاكرة العامل؛ ويُستعاد بعد إيقاظه من ذاكرة الجلسة أو من سجل صحة
   * المفتاح، F-06 وMJ-TA-05).
   */
  private readonly retryAt = new Map<string, { readonly at: number; readonly savedAt: number }>();

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
   * موعد إعادة المحاولة المعلن الذي لم يحن بعد لمفتاح المزوّد المحفوظ الآن، أو null (AD-31). ما في الذاكرة أولًا إن أُعلن لهذا المفتاح نفسه؛ وإلا فمن
   * ذاكرة الجلسة (MJ-TA-05: كل موعد معلن، ومنه 503، يُحفظ فيها مستقلًا عن صحة آخر طلب، فلا يُسقطه نجاح طلب متأخر ولا إيقاظ العامل)، ثم من سجل صحة
   * المفتاح المحفوظ (F-06). وكلاهما لا يُعطي موعدًا إلا لجيل المفتاح الحالي نفسه وقبل حلوله؛ فلا يُنسب موعد مفتاح استُبدل أو مُسح إلى بديله
   * (COR-AUD-02). وتعذّر قراءة المفتاح يُبقي ما في الذاكرة.
   */
  private async cooldown(adapter: ProviderAdapter): Promise<number | null> {
    const provider = adapter.descriptor.id;
    const info = await this.keyInfo(adapter);
    let entry = this.retryAt.get(provider);
    if (entry && info !== undefined && entry.savedAt !== info?.savedAt) {
      this.retryAt.delete(provider);
      entry = undefined;
    }
    if (!entry) {
      if (!info) return null;
      const noted = await this.cache.loadRetry(provider).catch(() => null);
      const key = noted && noted.keySavedAt === info.savedAt ? null : await this.options.connections.keyStatus(provider).catch(() => null);
      const saved = noted && noted.keySavedAt === info.savedAt ? noted.at : key?.health === 'rate-limited' && key.savedAt === info.savedAt ? key.detail.retryAt : null;
      if (typeof saved !== 'number') return null;
      entry = { at: saved, savedAt: info.savedAt };
      this.retryAt.set(provider, entry);
    }
    if (this.now() >= entry.at) {
      this.retryAt.delete(provider);
      return null;
    }
    return entry.at;
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
    const [hostPermission, contentPermission, key, cached, choice, providers, test, saved] = await Promise.all([
      this.contains({ origins: [d.origin] }),
      content ? this.contains(content) : Promise.resolve(null),
      this.options.connections.keyStatus(d.id).catch(() => null),
      this.cache.load(d.id).catch(() => null),
      this.choice(d.id),
      this.summaries(),
      this.cache.loadTest(d.id).catch(() => null),
      this.keyInfo(adapter),
    ]);
    const keySavedAt = saved ? saved.savedAt : null;
    // القائمة ونتيجة الاختبار مقرونتان بوقت حفظ المفتاح الذي صدرتا به: لا تُعرضان لغيره (مفتاح مُسح أو استُبدل) وتُحذفان من الجلسة (COR-AUD-02).
    // المسح والاستبدال يجريان في صفحة الإعدادات على مخزن المفتاح مباشرة، فالحذف مؤجل إلى أول قراءة حالة لهذا المزوّد تليهما، لا فوري؛ ويُعاد فيه
    // قراءة المفتاح داخل طابور الكتابة فلا يُحذف ما حُفظ لبديل. وتعذّر قراءة المفتاح ليس غيابًا ولا استبدالًا فلا يُحذف معه شيء (ولا تُعرض قائمة).
    const models = cached && ownedBy(cached, keySavedAt) ? cached : null;
    const stale = (cached && !ownedBy(cached, keySavedAt)) || (test && !ownedBy(test, keySavedAt));
    if (saved !== undefined && stale) await this.cache.forget(d.id, this.keyNow(adapter)).catch((error: unknown) => this.options.onError?.(error));
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
      retryAt: await this.cooldown(adapter),
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

  /** معلومات مفتاح المزوّد المحفوظ (بلا المفتاح)، أو null إن لم يُحفظ، أو undefined إن تعذّرت قراءته. */
  private async keyInfo(adapter: ProviderAdapter): Promise<SecretInfo | null | undefined> {
    const store = this.options.keys(adapter.descriptor.id);
    return store ? store.info().catch(() => undefined) : null;
  }

  /** وقت حفظ مفتاح المزوّد يُقرأ حين يُستدعى (داخل طابور كتابة الجلسة)، وundefined إن تعذّرت قراءته. */
  private keyNow(adapter: ProviderAdapter): KeyNow {
    return async () => {
      const info = await this.keyInfo(adapter);
      return info === undefined ? undefined : (info?.savedAt ?? null);
    };
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

  private call(adapter: ProviderAdapter, secret: ProviderSecret, workspace: string | null, signal?: AbortSignal) {
    if (!this.options.permissions) throw new Error('لا واجهة صلاحيات في هذا السياق');
    const key = bindKey(adapter.descriptor, secret);
    const fetch = gatedFetch(adapter.descriptor, { permissions: this.options.permissions, ...(this.options.fetch ? { fetch: this.options.fetch } : {}) });
    return { key, fetch, now: this.now, ...(signal ? { signal } : {}), ...(workspace ? { workspace } : {}) };
  }

  /** AD-38: معرّف مساحة العمل الذي أدخله المستخدم لمزوّد له ترويستها، أو null (لا يُخمَّن ولا يُقرأ من مكان آخر). */
  private async workspaceOf(adapter: ProviderAdapter): Promise<string | null> {
    if (!adapter.descriptor.workspaceHeader) return null;
    const value = (await this.settings())?.get<string>(workspaceSettingKey(adapter.descriptor.id));
    return typeof value === 'string' && WORKSPACE_ID.test(value) ? value : null;
  }

  private observe(adapter: ProviderAdapter, verdict: Verdict | null, key: KeySnapshot): Promise<void> {
    return this.options.connections.observe('provider-key', verdict, adapter.descriptor.id, key.savedAt).catch((error: unknown) => this.options.onError?.(error));
  }

  /**
   * ما صار إليه المفتاح المحفوظ منذ قُرئ للطلب، أو null إن بقي هو: استُبدل، أو مُسح، أو تعذّرت قراءته. في الثلاث نتيجة الطلب للمفتاح القديم، فلا تُحفظ
   * ولا تُعرض لغيره (F-03).
   */
  private async replaced(adapter: ProviderAdapter, key: KeySnapshot): Promise<KeyChange | null> {
    const info = await this.keyInfo(adapter);
    if (info === undefined) return 'unreadable';
    if (info === null) return 'cleared';
    return info.savedAt === key.savedAt ? null : 'replaced';
  }

  /** الرسالة بحسب ما حدث للمفتاح، فلا يُطلب إعادة المحاولة بمفتاح لم يعد محفوظًا. */
  private changed(adapter: ProviderAdapter, change: KeyChange, status: number | null): Fail {
    const t = adapter.descriptor.title;
    const message =
      change === 'replaced'
        ? `استُبدل مفتاح ${t} أثناء الطلب، فنتيجته تخص المفتاح السابق ولم تُنسب إلى الحالي. أعد المحاولة ليُرسل بالمفتاح الحالي.`
        : change === 'cleared'
          ? `مُسح مفتاح ${t} أثناء الطلب، فلم تُحفظ نتيجته ولا مفتاح محفوظ الآن. أضف مفتاحًا من بطاقة «مزوّد التحليل» إن أردت المتابعة.`
          : `تعذّرت قراءة مفتاح ${t} المحفوظ بعد الطلب، فلم تُنسب نتيجته إليه. افتح بطاقة «مزوّد التحليل» في الإعدادات وتحقق من المفتاح.`;
    return { ok: false, failure: 'key-changed', status, message, retryAt: null };
  }

  /**
   * موعد إعادة المحاولة المعلن في الرد، للمفتاح الذي أُرسل به الطلب؛ ولا يُسجَّل إن استُبدل منذ قُرئ، فلا يحل رد متأخر لمفتاح قديم محل موعد بديله
   * (COR-AUD-02). وإن جرى الاستبدال بعد الفحص فموعده مقرون بمفتاحه، ويُسقطه cooldown حين يقرأ غيره ويستعيد موعد البديل من سجل صحته.
   */
  private async note(adapter: ProviderAdapter, result: ProviderResult<unknown>, key: KeySnapshot): Promise<void> {
    if (result.ok || result.retryAt === null || (await this.replaced(adapter, key))) return;
    const provider = adapter.descriptor.id;
    const current = this.retryAt.get(provider);
    if (!current || current.savedAt !== key.savedAt || current.at < result.retryAt) this.retryAt.set(provider, { at: result.retryAt, savedAt: key.savedAt });
    // MJ-TA-05: يُحفظ في الجلسة مستقلًا عن سجل الصحة، فلا يُسقطه إيقاظ العامل ولا نجاح طلب أقدم يصل بعده.
    await this.cache.saveRetry({ provider, at: result.retryAt, keySavedAt: key.savedAt }, this.keyNow(adapter)).catch((error: unknown) => this.options.onError?.(error));
  }

  /** القائمة مقرونة بالمفتاح الذي قُرئت به، ولا تُكتب إن لم يعد هو المحفوظ حين يحين دورها في طابور الجلسة. */
  private save(adapter: ProviderAdapter, list: ModelsList): Promise<void> {
    return this.cache.save(list, this.keyNow(adapter)).catch((error: unknown) => this.options.onError?.(error));
  }

  /**
   * طلب التحقق المعلن لمزوّد: قائمة نماذجه بمفتاحه المحفوظ. يسجّل صحته ويحفظ القائمة؛ ومع suggest يقترح في حقل النموذج الفارغ أول نموذج أعلنت واجهته
   * توافقه (يجوز ولا يُفرض، DEC-13 ن-5). وزر + يرسله بلا اقتراح. ولا يُرسل قبل موعد إعادة محاولة أعلنه المزوّد (AD-31، F-06).
   */
  async verify(id: string, suggest = true): Promise<VerifyResponse> {
    const adapter = this.registry.byId(id);
    if (!adapter) return local('invalid-request', 'مزوّد غير معروف؛ لم يُرسل شيء.');
    const wait = await this.cooldown(adapter);
    if (wait !== null) return local('cooldown', 'أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.', wait);
    const got = await this.secret(adapter);
    if (!('token' in got)) return got;
    const result = await adapter.listModels(this.call(adapter, got, await this.workspaceOf(adapter)));
    await this.note(adapter, result, got);
    await this.observe(adapter, providerVerdict(result, 'verify', adapter.descriptor.host), got);
    const change = await this.replaced(adapter, got);
    if (change) return this.changed(adapter, change, result.status);
    if (!result.ok) return result;
    const list: ModelsList = { ...result.data, keySavedAt: got.savedAt };
    await this.save(adapter, list);
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
    const wait = await this.cooldown(adapter);
    if (wait !== null) return local('cooldown', 'أعلن المزوّد موعدًا لإعادة المحاولة؛ لم يُرسل شيء قبله.', wait);
    const got = await this.secret(adapter);
    if (!('token' in got)) return got;
    const result = await adapter.probe(this.call(adapter, got, await this.workspaceOf(adapter)), model);
    await this.note(adapter, result, got);
    await this.observe(adapter, providerVerdict(result, 'usage', adapter.descriptor.host), got);
    // صلاحية المضيف غير ممنوحة: البوابة رفضت قبل أي طلب، فلا نتيجة اختبار.
    if (!result.ok && result.failure === 'permission') return { ...result, message: redactKey(result.message, got.token) };
    const change = await this.replaced(adapter, got);
    if (change) return this.changed(adapter, change, result.status);
    const test: ModelTest = {
      provider: adapter.descriptor.id,
      model,
      keySavedAt: got.savedAt,
      verdict: result.ok ? 'accepted' : testVerdict(result.failure),
      status: result.status,
      message: result.ok ? '' : redactKey(result.message, got.token),
      at: this.now(),
    };
    await this.cache.saveTest(test, this.keyNow(adapter)).catch((error: unknown) => this.options.onError?.(error));
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
      const wait = await this.cooldown(adapter);
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
      const workspace = await this.workspaceOf(adapter);
      const result = await adapter.analyze(this.call(adapter, got, workspace, controller.signal), { model: input.model, system: input.system, prompt: input.prompt, maxTokens });
      await this.note(adapter, result, got);
      await this.observe(adapter, providerVerdict(result, 'usage', d.host), got);
      if (!result.ok) {
        // الطلب يبقى لصاحبه بالموافقة والمزوّد والنموذج الذي أُرسل بها، ولو استُبدل المفتاح أثناءه (لا إلغاء): ونجاحه يُعاد كما هو (F-03). أما رفض يخص
        // المفتاح الذي أُرسل به (401 و403 و404 و429 أو موعد إعادة محاولة) فيُبلَّغ أنه لمفتاح استُبدل، لا أن البديل مرفوض أو محجوب إلى موعد.
        const change = result.retryAt !== null || KEY_BOUND.has(result.failure) ? await this.replaced(adapter, got) : null;
        if (change) return this.changed(adapter, change, result.status);
        return { ...result, message: redactKey(result.message, got.token) };
      }
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

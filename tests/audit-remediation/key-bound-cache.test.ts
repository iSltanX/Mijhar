/**
 * COR-AUD-02 (الجولة الثانية): قائمة النماذج ونتيجة اختبار النموذج وموعد إعادة المحاولة مقرونة بجيل المفتاح الذي صدرت به:
 * - لا تُعرض لمفتاح استُبدل أو مُسح، وتُحذف من storage.session في أول قراءة حالة لهذا المزوّد تلي المسح أو الاستبدال (الحذف مؤجل، لا فوري)؛
 * - وكتابة متأخرة لطلب بالمفتاح القديم لا تُعيدها بعد التنظيف (يُعاد فحص المفتاح داخل طابور الكتابة)؛
 * - وتنظيف ما يخص مفتاحًا قديمًا لا يحذف ما حُفظ لبديله؛
 * - وموعد إعادة المحاولة الذي أُعلن للمفتاح القديم لا يحجب البديل، ورد متأخر به لا يمحو موعد البديل.
 * محاكاة محلية: fetch وهمي ومفاتيح اصطناعية وصلاحيات اصطناعية، ولا طلب حي. والتزامن يُفرض ببوابات في المحاكاة لا بتوقيت.
 */
import { describe, expect, it } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../src/core';
import { SecretStore } from '../../src/core/connections/secrets';
import type { SessionStorageLike } from '../../src/core/connections/secrets';
import { ConnectionsService, memoryHealthLog, sessionHealthLog } from '../../src/core/connections/service';
import { defineProviderSettings, modelSettingKey } from '../../src/modules/e/provider/settings';
import { MODELS_CACHE_KEY, MODEL_TESTS_KEY, ProviderService, memoryModelsCache, sessionModelsCache } from '../../src/modules/e/provider/service';
import type { ProviderKeyStore } from '../../src/modules/e/provider/service';
import { createProviderRegistry } from '../../src/modules/e/provider/registry';
import { OPENAI_ADAPTER } from '../../src/modules/e/provider/adapters/openai';
import type { ModelsList, ModelTest } from '../../src/modules/e/provider/types';
import { fakePermissions } from '../core/ui-host/helpers';
import { memoryArea } from '../modules/d/token/helpers';
import { fakeKey, fakeOpenAiKey, openAiMock, providerMock } from '../modules/e/provider/fixture-provider-mock';

const NOW = 1_800_000_000_000;
const MODEL = 'mock-gpt-free-text';

function sessionArea(): SessionStorageLike & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key) => (key in data ? { [key]: structuredClone(data[key]) } : {}),
    set: async (items) => void Object.assign(data, structuredClone(items)),
    remove: async (key) => void delete data[key],
  };
}

const stored = <T>(session: { data: Record<string, unknown> }, key: string, provider: string): T | undefined =>
  ((session.data[key] as Record<string, T> | undefined) ?? {})[provider];

/** بوابة: القراءة التالية لوقت حفظ المفتاح بعد تسليحها تُقرأ ثم تنتظر الإفراج قبل أن تُعاد (لقطة قديمة تصل متأخرة). */
function gatedKeys(store: SecretStore) {
  let armed = false;
  let release!: () => void;
  let entered!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const reached = new Promise<void>((r) => (entered = r));
  const keys: ProviderKeyStore = {
    read: () => store.read(),
    async info() {
      const value = await store.info();
      if (!armed) return value;
      armed = false;
      entered();
      await held;
      return value;
    },
  };
  return { keys, arm: () => void (armed = true), reached, release: () => release() };
}

async function openai() {
  const session = sessionArea();
  let tick = 1000;
  const store = new SecretStore({ session: memoryArea(), disk: null, now: () => (tick += 1) });
  await store.save(fakeOpenAiKey('A'), 'session');
  const gate = gatedKeys(store);
  const area = new MemoryStorageArea();
  const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r)));
  await settings.set(modelSettingKey('openai'), MODEL);
  const connections = new ConnectionsService({ stores: {}, providerKeys: { selected: async () => 'openai', store: () => store }, log: sessionHealthLog(session), fixable: [], now: () => NOW });
  const mock = openAiMock({ probe: 'ok' });
  // تسليح البوابة حين يصل الطلب إلى المزوّد: قراءة المفتاح التالية هي فحص الاستبدال بعد الرد.
  let armOn: string | null = null;
  const fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (armOn && new URL(String(url)).pathname === armOn) {
      armOn = null;
      gate.arm();
    }
    return mock.fetch(url, init);
  }) as typeof globalThis.fetch;
  const service = new ProviderService({
    registry: createProviderRegistry([OPENAI_ADAPTER]),
    keys: () => gate.keys,
    permissions: fakePermissions([OPENAI_ADAPTER.descriptor.origin]),
    fetch,
    connections,
    settings: async () => settings,
    cache: sessionModelsCache(session),
    now: () => NOW,
  });
  return { session, store, gate, service, armAfter: (path: string) => void (armOn = path) };
}

describe('COR-AUD-02 (الجولة الثانية): ما اشتُق من المفتاح مقرون بجيله', () => {
  it('استبدال المفتاح: قائمة القديم ونتيجة اختباره لا تُعرضان للبديل، وتُحذفان في أول قراءة حالة تليه', async () => {
    const h = await openai();
    expect((await h.service.verify('openai')).ok).toBe(true);
    expect((await h.service.probe('openai', MODEL)).ok).toBe(true);
    const a = (await h.store.info())!.savedAt;
    expect(stored<ModelsList>(h.session, MODELS_CACHE_KEY, 'openai')?.keySavedAt).toBe(a);
    expect(stored<ModelTest>(h.session, MODEL_TESTS_KEY, 'openai')?.keySavedAt).toBe(a);

    await h.store.save(fakeOpenAiKey('B'), 'session');
    // قبل قراءة الحالة لا يزال ما في الجلسة كما هو: الحذف مؤجل إليها.
    expect(stored(h.session, MODELS_CACHE_KEY, 'openai')).toBeDefined();
    const status = await h.service.status('openai');
    expect(status?.models).toBeNull();
    expect(status?.test).toBeNull();
    expect(stored(h.session, MODELS_CACHE_KEY, 'openai')).toBeUndefined();
    expect(stored(h.session, MODEL_TESTS_KEY, 'openai')).toBeUndefined();

    // البديل يقرأ قائمته فتُعرض له مقرونة به.
    expect((await h.service.verify('openai')).ok).toBe(true);
    const b = (await h.store.info())!.savedAt;
    expect((await h.service.status('openai'))?.models?.keySavedAt).toBe(b);
  });

  it('رد تحقق متأخر بالمفتاح الممسوح لا يُعيد قائمته إلى الجلسة بعد تنظيفها', async () => {
    const h = await openai();
    expect((await h.service.verify('openai')).ok).toBe(true);
    h.armAfter('/v1/models');
    const late = h.service.verify('openai');
    // فحص الاستبدال بعد الرد قرأ المفتاح القديم وتأخر؛ وفي أثنائه يُمسح المفتاح وتُقرأ الحالة فيُنظَّف ما يخصه.
    await h.gate.reached;
    await h.store.clear();
    expect((await h.service.status('openai'))?.models).toBeNull();
    expect(stored(h.session, MODELS_CACHE_KEY, 'openai')).toBeUndefined();
    h.gate.release();
    await late;
    expect(stored(h.session, MODELS_CACHE_KEY, 'openai')).toBeUndefined();
    expect((await h.service.status('openai'))?.models).toBeNull();
  });

  it('نتيجة اختبار نموذج متأخرة بالمفتاح القديم لا تُكتب بعد استبداله وتنظيف ما يخصه', async () => {
    const h = await openai();
    expect((await h.service.probe('openai', MODEL)).ok).toBe(true);
    h.armAfter('/v1/responses');
    const late = h.service.probe('openai', MODEL);
    await h.gate.reached;
    await h.store.save(fakeOpenAiKey('B'), 'session');
    expect((await h.service.status('openai'))?.test).toBeNull();
    expect(stored(h.session, MODEL_TESTS_KEY, 'openai')).toBeUndefined();
    h.gate.release();
    await late;
    expect(stored(h.session, MODEL_TESTS_KEY, 'openai')).toBeUndefined();
    expect((await h.service.status('openai'))?.test).toBeNull();
  });

  it('تنظيف بدأ بعد مسح المفتاح القديم لا يحذف قائمة البديل ونتيجة اختباره المحفوظتين قبل أن يحين دوره', async () => {
    const h = await openai();
    expect((await h.service.verify('openai')).ok).toBe(true);
    await h.store.clear();
    // قراءة الحالة رأت المفتاح ممسوحًا وقائمة القديم، ثم تأخرت؛ وفي أثنائها حُفظ البديل وتحقق منه واختُبر نموذجه.
    h.gate.arm();
    const cleanup = h.service.status('openai');
    await h.gate.reached;
    await h.store.save(fakeOpenAiKey('B'), 'session');
    const b = (await h.store.info())!.savedAt;
    expect((await h.service.verify('openai')).ok).toBe(true);
    expect((await h.service.probe('openai', MODEL)).ok).toBe(true);
    h.gate.release();
    expect((await cleanup)?.models).toBeNull();
    expect(stored<ModelsList>(h.session, MODELS_CACHE_KEY, 'openai')?.keySavedAt).toBe(b);
    expect(stored<ModelTest>(h.session, MODEL_TESTS_KEY, 'openai')?.keySavedAt).toBe(b);
    const status = await h.service.status('openai');
    expect(status?.models?.keySavedAt).toBe(b);
    expect(status?.test).toMatchObject({ verdict: 'accepted', keySavedAt: b });
  });

  it('تعذّر قراءة المفتاح ليس مسحًا ولا استبدالًا: لا يُحذف شيء، ولا تُعرض قائمة لا يُعرف مفتاحها', async () => {
    const cache = memoryModelsCache();
    const list: ModelsList = { provider: 'openai', models: [], readAt: NOW, source: 'https://api.openai.com/v1/models', partial: false, keySavedAt: 7 };
    await cache.save(list);
    await cache.forget('openai', async () => undefined);
    expect(cache.lists.get('openai')).toEqual(list);
    // والكتابة المقرونة لا تجري إلا إن كان مفتاحها هو المحفوظ حين يحين دورها.
    await cache.save({ ...list, keySavedAt: 8 }, async () => 7);
    expect(cache.lists.get('openai')?.keySavedAt).toBe(7);
    await cache.forget('openai', async () => 7);
    expect(cache.lists.get('openai')?.keySavedAt).toBe(7);
    await cache.forget('openai', async () => null);
    expect(cache.lists.has('openai')).toBe(false);
  });
});

/** مزوّد Anthropic بشبكة يحدد الاختبار ردها لكل مفتاح، وساعة يحركها الاختبار. */
async function anthropic(reply: (token: string) => Promise<Response> | Response | null) {
  const clock = { now: NOW };
  let tick = 1000;
  const store = new SecretStore({ session: memoryArea(), disk: null, now: () => (tick += 1) });
  await store.save(fakeKey('OLD'), 'session');
  const area = new MemoryStorageArea();
  const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r)));
  await settings.set(modelSettingKey('anthropic'), 'mock-sonnet-2');
  const connections = new ConnectionsService({ stores: {}, providerKeys: { selected: async () => 'anthropic', store: () => store }, log: memoryHealthLog(), fixable: [], now: () => clock.now });
  const success = providerMock();
  const tokens: string[] = [];
  const fetch = (async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const token = (new Headers(init.headers).get('authorization') ?? '').replace(/^Bearer /, '');
    tokens.push(token);
    return (await reply(token)) ?? success.fetch(url, init);
  }) as typeof globalThis.fetch;
  const service = new ProviderService({ keys: () => store, permissions: fakePermissions(['https://api.anthropic.com/*']), fetch, connections, settings: async () => settings, cache: memoryModelsCache(), now: () => clock.now });
  return { clock, store, connections, service, tokens };
}

const limited = (seconds: number): Response =>
  new Response(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'synthetic rate limit' } }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': String(seconds) } });

describe('COR-AUD-02 (الجولة الثانية): موعد إعادة المحاولة للمفتاح الذي أُعلن له', () => {
  it('موعد أُعلن للمفتاح القديم لا يحجب البديل: يُرسل طلبه ولا يُعرض موعد للبديل', async () => {
    const h = await anthropic((token) => (token === fakeKey('OLD') ? limited(60) : null));
    expect(await h.service.verify('anthropic')).toMatchObject({ ok: false, failure: 'rate-limit', retryAt: NOW + 60_000 });
    expect((await h.service.status('anthropic'))?.retryAt).toBe(NOW + 60_000);
    await h.store.save(fakeKey('NEW'), 'session');
    expect((await h.service.status('anthropic'))?.retryAt).toBeNull();
    expect((await h.service.verify('anthropic')).ok).toBe(true);
    expect(h.tokens).toEqual([fakeKey('OLD'), fakeKey('NEW')]);
  });

  it('مسح المفتاح بعد 429: لا يبقى موعده، ولا يُنسب إلى مفتاح يُحفظ بعده', async () => {
    const h = await anthropic((token) => (token === fakeKey('OLD') ? limited(60) : null));
    expect((await h.service.verify('anthropic')).ok).toBe(false);
    await h.store.clear();
    expect((await h.service.status('anthropic'))?.retryAt).toBeNull();
    await h.store.save(fakeKey('NEW'), 'session');
    expect((await h.service.status('anthropic'))?.retryAt).toBeNull();
    expect((await h.service.verify('anthropic')).ok).toBe(true);
  });

  it('429 متأخر بالمفتاح القديم لا يمحو موعد البديل ولا يقصّره', async () => {
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((r) => (release = r));
    const started = new Promise<void>((r) => (entered = r));
    const h = await anthropic(async (token) => {
      if (token === fakeKey('OLD')) {
        entered();
        await held;
        return limited(10);
      }
      return limited(120);
    });
    const late = h.service.verify('anthropic');
    await started;
    await h.store.save(fakeKey('NEW'), 'session');
    expect(await h.service.verify('anthropic')).toMatchObject({ ok: false, failure: 'rate-limit', retryAt: NOW + 120_000 });
    release();
    expect(await late).toMatchObject({ ok: false, failure: 'key-changed' });
    expect((await h.service.status('anthropic'))?.retryAt).toBe(NOW + 120_000);
    h.clock.now = NOW + 30_000;
    expect(await h.service.verify('anthropic')).toMatchObject({ ok: false, failure: 'cooldown', retryAt: NOW + 120_000 });
    expect(h.tokens).toEqual([fakeKey('OLD'), fakeKey('NEW')]);
  });
});

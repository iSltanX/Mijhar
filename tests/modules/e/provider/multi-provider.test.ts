// TEST-AI-04 وجزء الخدمة من TEST-AI-05 (AC-E10 (١) و(٢) و(٤) و(٥)) — محاكاة: محوّل Anthropic القائم ومحوّلان وهميان لمزوّدين غير Anthropic (MOCK_B يعلن توافق
// مودلاته، وMOCK_C لا يعلنه ويدعم الفحص الصريح) بمضيفين لا يوجدان، وخدمة المزوّد وسجل الاتصالات الفعليان بمخزن مستقل لكل مزوّد ومخزن إعدادات حقيقي.
// لا اتصال بمزوّد حقيقي: كل طلب يُسجَّل بمضيفه والمفتاح الذي حمله.
//  - لكل مزوّد مفتاحا تخزين مستقلان، ومفتاح Anthropic التاريخي يُقرأ بلا ترحيل.
//  - طلب مزوّد يقرأ مخزن مزوّده وحده ويحمل مفتاحه وحده إلى مضيفه وحده؛ وحذف مفتاح أو سحب مضيف أو رفض مفتاح يخص مزوّده.
//  - المودلات المتوافقة وحدها (DEC-13 ن-3): ما لم يُعلن ولم يُفحص لا يُرسل إليه، والفحص الصريح يجعله خيارًا؛ ولا تحويل إلى مزوّد آخر ولا إعادة.
import { describe, expect, it, vi } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../../../src/core';
import { SECRET_KEYS, providerSecretKeys, providerSecretStore } from '../../../../src/core/connections/keys';
import { SecretStore } from '../../../../src/core/connections/secrets';
import { ConnectionsService, memoryHealthLog } from '../../../../src/core/connections/service';
import { PROVIDER_DESCRIPTORS, PROVIDER_ID_KEY, PROVIDER_MODEL_KEY, defineProviderSettings, modelSettingKey } from '../../../../src/modules/e/provider';
import type { AnalyzeInput } from '../../../../src/modules/e/provider';
import { ANTHROPIC_ADAPTER } from '../../../../src/modules/e/provider/adapters/anthropic';
import { PROVIDER_ADAPTERS, createProviderRegistry } from '../../../../src/modules/e/provider/registry';
import { ProviderService, memoryModelsCache } from '../../../../src/modules/e/provider/service';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { memoryArea } from '../../d/token/helpers';
import { MOCK_B, MOCK_C, fakeKey, fakeMockKey, mockHostsFetch, providerMock } from './fixture-provider-mock';

const ADAPTERS = [ANTHROPIC_ADAPTER, MOCK_B, MOCK_C];
const HOSTS = { anthropic: 'api.anthropic.com', 'mock-b': 'api.mock-b.test', 'mock-c': 'api.mock-c.test' } as const;
type Id = keyof typeof HOSTS;

async function multi(options: { status?: Readonly<Record<string, number>>; probeFails?: readonly string[]; withKeys?: readonly Id[]; firefox?: boolean } = {}) {
  const registry = createProviderRegistry(ADAPTERS);
  const descriptors = registry.list.map((a) => a.descriptor);
  const area = new MemoryStorageArea();
  const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r, descriptors)));
  const stores = new Map<string, SecretStore>(descriptors.map((d) => [d.id, new SecretStore({ session: memoryArea(), disk: memoryArea() })]));
  const reads = new Map<string, ReturnType<typeof vi.spyOn>>();
  for (const [id, store] of stores) reads.set(id, vi.spyOn(store, 'read'));
  const keys = { anthropic: fakeKey('M'), 'mock-b': fakeMockKey('mock-b'), 'mock-c': fakeMockKey('mock-c') } as const;
  for (const id of options.withKeys ?? (['anthropic', 'mock-b', 'mock-c'] as const)) await stores.get(id)?.save(keys[id], 'session');
  const anthropic = providerMock();
  const hosts = mockHostsFetch({ ...(options.status ? { status: options.status } : {}), ...(options.probeFails ? { probeFails: options.probeFails } : {}) });
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => (new URL(String(input)).host === HOSTS.anthropic ? anthropic.fetch(input, init) : hosts.fetch(input, init))) as typeof globalThis.fetch;
  const permissions = fakePermissions(descriptors.map((d) => d.origin));
  if (options.firefox) permissions.collected.add('websiteContent');
  const connections = new ConnectionsService({
    stores: {},
    providerKeys: { selected: async () => settings.get<string>(PROVIDER_ID_KEY), store: (id) => stores.get(id) ?? null },
    log: memoryHealthLog(),
    fixable: [],
  });
  const service = new ProviderService({
    registry,
    keys: (id) => stores.get(id) ?? null,
    permissions,
    fetch,
    connections: { keyStatus: (p) => connections.keyStatus(p), observe: (id, v, p) => connections.observe(id, v, p) },
    settings: async () => settings,
    cache: memoryModelsCache(),
    ...(options.firefox ? { contentPermission: { data_collection: ['websiteContent'] } } : {}),
  });
  /** كل طلب خرج: مضيفه والمفتاح الذي حمله. */
  const sent = (): Array<{ host: string; key: string | null; method: string; path: string }> => [
    ...anthropic.requests.map((r) => ({ host: new URL(r.url).host, key: r.headers.authorization?.replace(/^Bearer /, '') ?? null, method: r.method, path: new URL(r.url).pathname })),
    ...hosts.requests.map((r) => ({ host: r.host, key: r.key, method: r.method, path: r.path })),
  ];
  const select = (id: Id) => settings.set(PROVIDER_ID_KEY, id);
  return { registry, settings, stores, reads, keys, service, connections, permissions, sent, select, anthropic, hosts };
}

const input = (provider: string, model: string, over: Partial<AnalyzeInput> = {}): AnalyzeInput => ({
  requestId: over.requestId ?? `${provider}-${model}`,
  section: 'checks',
  provider,
  model,
  system: 'تعليمات صيغة الرد',
  prompt: '# تشخيص الخطأ\n\nerror TS2322\n',
  ...over,
});

describe('AC-E10 (١): السجل الوصفي والمحوّلات', () => {
  it('السجل الوصفي المشحون يطابق سجل المحوّلات بالترتيب والوصف نفسه: لا مزوّد في القائمة بلا محوّل مدموج', () => {
    expect(PROVIDER_ADAPTERS.map((a) => a.descriptor)).toEqual([...PROVIDER_DESCRIPTORS]);
    for (const [i, d] of PROVIDER_DESCRIPTORS.entries()) expect(PROVIDER_ADAPTERS[i]?.descriptor).toBe(d);
  });

  it('السجل يرفض معرّفًا أو مضيفًا مكررًا أو نمط صلاحية لا يطابق مضيفه', () => {
    expect(() => createProviderRegistry([MOCK_B, MOCK_B])).toThrow(/مكرر/);
    expect(() => createProviderRegistry([MOCK_B, { ...MOCK_C, descriptor: { ...MOCK_C.descriptor, host: MOCK_B.descriptor.host, origin: MOCK_B.descriptor.origin } }])).toThrow(/مضيف مكرر/);
    expect(() => createProviderRegistry([{ ...MOCK_B, descriptor: { ...MOCK_B.descriptor, origin: 'https://*/*' } }])).toThrow(/نمط صلاحية/);
  });
});

describe('TEST-AI-04 (AC-E10 (٢)): مفاتيح مستقلة لكل مزوّد', () => {
  it('لكل مزوّد مفتاحا تخزين مستقلان لا يشاركهما سرّ آخر؛ ومفتاحا Anthropic هما التاريخيان (MJ21) بلا ترحيل', () => {
    expect(providerSecretKeys('anthropic')).toEqual({ session: 'mijhar.secret.providerKey', disk: 'providerKey' });
    expect(providerSecretKeys('anthropic')).toBe(SECRET_KEYS['provider-key']);
    const all = [...Object.values(SECRET_KEYS), providerSecretKeys('mock-b'), providerSecretKeys('mock-c')].flatMap((k) => [k.session, k.disk]);
    expect(new Set(all).size).toBe(all.length);
    expect(() => providerSecretKeys('../x')).toThrow();
  });

  it('مفتاح Anthropic المحفوظ قبل التوسعة في مفتاح الجلسة التاريخي يُقرأ كما هو', async () => {
    const saved = { token: fakeKey('H'), savedAt: 7 };
    const values: Record<string, unknown> = { 'mijhar.secret.providerKey': saved };
    const session = {
      get: async (k: string) => ({ [k]: values[k] }),
      set: async (items: Record<string, unknown>) => void Object.assign(values, items),
      remove: async (k: string) => void delete values[k],
      setAccessLevel: async () => undefined,
    };
    const scope = { chrome: { storage: { session } } } as unknown as typeof globalThis;
    expect(await providerSecretStore('anthropic', scope).read()).toEqual({ ...saved, place: 'session' });
    expect(await providerSecretStore('mock-b', scope).read()).toBeNull();
  });

  it('التحقق لكل مزوّد يقرأ مخزنه وحده ويحمل مفتاحه وحده إلى مضيفه وحده', async () => {
    const m = await multi();
    for (const id of ['anthropic', 'mock-b', 'mock-c'] as const) {
      for (const spy of m.reads.values()) spy.mockClear();
      expect((await m.service.verify(id)).ok).toBe(true);
      expect([...m.reads].filter(([, spy]) => spy.mock.calls.length > 0).map(([k]) => k)).toEqual([id]);
    }
    const sent = m.sent();
    expect(sent.map((r) => r.host)).toEqual([HOSTS.anthropic, HOSTS['mock-b'], HOSTS['mock-c']]);
    for (const r of sent) {
      const owner = (Object.keys(HOSTS) as Id[]).find((k) => HOSTS[k] === r.host) as Id;
      expect(r.key).toBe(m.keys[owner]);
    }
    // لا مفتاح مزوّد في طلب إلى مضيف غيره.
    for (const r of sent) for (const [id, key] of Object.entries(m.keys)) if (HOSTS[id as Id] !== r.host) expect(JSON.stringify(r)).not.toContain(key);
  });

  it('تبديل المزوّد لا يمسح مفتاح غيره ولا يقرؤه؛ وحالة السجل العامة حالة المختار، ولكلٍّ صحته', async () => {
    const m = await multi({ status: { [HOSTS['mock-b']]: 401 } });
    await m.service.verify('anthropic');
    await m.service.verify('mock-b');
    expect((await m.connections.keyStatus('anthropic')).health).toBe('healthy');
    expect((await m.connections.keyStatus('mock-b')).health).toBe('expired');
    expect((await m.connections.keyStatus('mock-c')).health).toBe('unverified');
    expect((await m.connections.status()).find((c) => c.id === 'provider-key')).toMatchObject({ provider: 'anthropic', health: 'healthy' });
    for (const spy of m.reads.values()) spy.mockClear();
    await m.select('mock-b');
    expect((await m.connections.status()).find((c) => c.id === 'provider-key')).toMatchObject({ provider: 'mock-b', health: 'expired' });
    expect(m.reads.get('anthropic')).not.toHaveBeenCalled();
    expect((await m.stores.get('anthropic')?.read())?.token).toBe(m.keys.anthropic);
    const summary = (await m.service.status())?.providers.map((p) => [p.id, p.health]);
    expect(summary).toEqual([
      ['anthropic', 'healthy'],
      ['mock-b', 'expired'],
      ['mock-c', 'unverified'],
    ]);
  });

  it('حذف مفتاح مزوّد يخص مزوّده: الآخران ومفتاحاهما وصحتهما كما هي', async () => {
    const m = await multi();
    await m.service.verify('anthropic');
    await m.service.verify('mock-b');
    await m.stores.get('mock-b')?.clear();
    expect((await m.connections.keyStatus('mock-b')).health).toBe('none');
    expect((await m.connections.keyStatus('anthropic')).health).toBe('healthy');
    expect((await m.stores.get('anthropic')?.read())?.token).toBe(m.keys.anthropic);
    expect((await m.stores.get('mock-c')?.read())?.token).toBe(m.keys['mock-c']);
    await m.select('mock-b');
    expect(await m.service.analyze(input('mock-b', 'b-model-2'), 't')).toMatchObject({ ok: false, failure: 'no-key', status: null });
    expect(m.sent().filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('سحب صلاحية مضيف مزوّد يوقف التحليل عنده وحده', async () => {
    const m = await multi();
    await m.service.verify('anthropic');
    await m.service.verify('mock-b');
    await m.permissions.remove({ origins: [MOCK_B.descriptor.origin] });
    await m.select('mock-b');
    expect(await m.service.analyze(input('mock-b', 'b-model-2'), 't')).toMatchObject({ ok: false, failure: 'permission', status: null });
    await m.select('anthropic');
    expect((await m.service.analyze(input('anthropic', 'mock-sonnet-2'), 't')).ok).toBe(true);
    expect(m.sent().filter((r) => r.method === 'POST').map((r) => r.host)).toEqual([HOSTS.anthropic]);
  });

  it('Firefox: سحب موافقة محتوى المواقع الواحدة يوقف التحليل عند كل المزوّدين، ويبقى التحقق (بلا محتوى) ممكنًا', async () => {
    const m = await multi({ firefox: true });
    await m.service.verify('anthropic');
    await m.service.verify('mock-b');
    await m.permissions.remove({ data_collection: ['websiteContent'] });
    for (const [id, model] of [
      ['anthropic', 'mock-sonnet-2'],
      ['mock-b', 'b-model-2'],
    ] as const) {
      await m.select(id);
      expect(await m.service.analyze(input(id, model), 't')).toMatchObject({ ok: false, failure: 'permission', status: null });
      expect((await m.service.status())?.contentPermission).toBe(false);
      expect((await m.service.status())?.hostPermission).toBe(true);
    }
    expect(m.sent().filter((r) => r.method === 'POST')).toHaveLength(0);
    expect((await m.service.verify('mock-c')).ok).toBe(true);
  });

  it('طلب بمزوّد غير المختار يُرفض قبل أي قراءة مفتاح أو طلب (provider-changed)', async () => {
    const m = await multi();
    await m.service.verify('mock-b');
    for (const spy of m.reads.values()) spy.mockClear();
    expect(await m.service.analyze(input('mock-b', 'b-model-2'), 't')).toMatchObject({ ok: false, failure: 'provider-changed', status: null });
    for (const spy of m.reads.values()) expect(spy).not.toHaveBeenCalled();
    expect(m.sent().filter((r) => r.method === 'POST')).toHaveLength(0);
  });
});

describe('TEST-AI-05 (AC-E10 (٤) و(٥)، DEC-13 ن-5): النموذج لكل مزوّد كما في حقله، ولا تحويل ولا إعادة', () => {
  it('نموذج كل مزوّد مستقل: التحقق يقترح في الحقل الفارغ المعلن توافقه في مفتاح كلٍّ، والكتابة لمزوّد لا تمس غيره', async () => {
    const m = await multi();
    await m.service.verify('anthropic');
    await m.service.verify('mock-b');
    expect(modelSettingKey('anthropic')).toBe(PROVIDER_MODEL_KEY);
    expect(m.settings.get(modelSettingKey('anthropic'))).toBe('mock-sonnet-2');
    expect(m.settings.get(modelSettingKey('mock-b'))).toBe('b-model-2');
    await m.settings.set(modelSettingKey('mock-b'), 'b-model-1');
    expect(m.settings.get(PROVIDER_MODEL_KEY)).toBe('mock-sonnet-2');
    expect((await m.service.status('mock-b'))?.model?.id).toBe('b-model-1');
    expect((await m.service.status('anthropic'))?.model?.id).toBe('mock-sonnet-2');
  });

  it('BLK-MODEL-COMPAT (ن-5): مزوّد لا تعلن واجهته توافقًا لا اقتراح له والحقل فارغ، فلا يُرسل إليه شيء ولا يُخمَّن نموذج؛ والمعرّف المكتوب يُرسل إليه بلا اختبار', async () => {
    const m = await multi();
    await m.select('mock-c');
    const verified = await m.service.verify('mock-c');
    expect(verified.ok && verified.data.models.map((x) => x.compatibility)).toEqual(['unknown', 'unknown']);
    const status = await m.service.status();
    expect(status?.model).toBeNull();
    expect(status?.choice).toBe('');
    expect(await m.service.analyze(input('mock-c', 'c-model-x'), 't')).toMatchObject({ ok: false, failure: 'model-changed', status: null });
    expect(m.sent().filter((r) => r.method === 'POST')).toHaveLength(0);
    await m.settings.set(modelSettingKey('mock-c'), 'c-model-not-listed');
    expect((await m.service.analyze(input('mock-c', 'c-model-not-listed'), 't')).ok).toBe(true);
    expect(m.sent().filter((r) => r.method === 'POST').map((r) => [r.host, r.path])).toEqual([[HOSTS['mock-c'], '/analyze']]);
  });

  it('«اختبر النموذج» الاختياري (DEC-13 ن-5): نتيجته لكل مزوّد ونموذجه ومفتاحه، ولا تنتقل إلى مزوّد آخر؛ ولا اختبار لمزوّد لا يدعمه محوّله', async () => {
    const m = await multi({ probeFails: ['c-model-y'] });
    await m.select('mock-c');
    await m.settings.set(modelSettingKey('mock-c'), 'c-model-x');
    expect(await m.service.probe('mock-c', 'c-model-x')).toMatchObject({ ok: true, data: { provider: 'mock-c', model: 'c-model-x', verdict: 'accepted' } });
    expect((await m.service.status('mock-c'))?.test).toMatchObject({ model: 'c-model-x', verdict: 'accepted' });
    // فشل الاختبار لا يغيّر الحقل ولا يمنع التحليل.
    expect(await m.service.probe('mock-c', 'c-model-y')).toMatchObject({ ok: true, data: { model: 'c-model-y' } });
    expect(m.settings.get(modelSettingKey('mock-c'))).toBe('c-model-x');
    expect((await m.service.analyze(input('mock-c', 'c-model-x'), 't')).ok).toBe(true);
    // النتيجة تخص mock-c: نموذج بالمعرّف نفسه عند مزوّد آخر لا يرثها.
    await m.settings.set(modelSettingKey('mock-b'), 'c-model-y');
    expect((await m.service.status('mock-b'))?.test).toBeNull();
    const probes = m.sent().filter((r) => r.path === '/probe');
    expect(probes.map((r) => [r.host, r.key])).toEqual([
      [HOSTS['mock-c'], m.keys['mock-c']],
      [HOSTS['mock-c'], m.keys['mock-c']],
    ]);
    expect(await m.service.probe('mock-b', 'b-model-2')).toMatchObject({ ok: false, failure: 'invalid-request', status: null });
  });

  it('الفشل لا يحوّل إلى مزوّد آخر ولا يعيد: طلب تحليل واحد إلى مضيف المختار وحده، ويُعاد الرفض كما هو', async () => {
    const m = await multi({ status: { [`${HOSTS['mock-b']}/analyze`]: 500 } });
    await m.service.verify('anthropic');
    await m.select('mock-b');
    await m.service.verify('mock-b');
    expect(await m.service.analyze(input('mock-b', 'b-model-2'), 't')).toMatchObject({ ok: false, failure: 'http', status: 500 });
    await new Promise((r) => setTimeout(r, 20));
    const posts = m.sent().filter((r) => r.method === 'POST');
    expect(posts.map((r) => r.host)).toEqual([HOSTS['mock-b']]);
    expect(m.sent().filter((r) => r.host === HOSTS.anthropic && r.method === 'POST')).toHaveLength(0);
  });
});

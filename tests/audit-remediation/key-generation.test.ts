// F-03 (تدقيق ما قبل الإصدار): كل حكم صحة ونتيجة اختبار ونجاح تحقق مقرون بلقطة المفتاح التي أرسل بها الطلب؛ ورد طلب بمفتاح استُبدل أثناءه لا يُنسب
// إلى البديل (لا يجعله منتهيًا، ولا سليمًا، ولا مقبولًا في اختبار النموذج). خدمات ومخازن ومحوّلات حقيقية مع شبكة اصطناعية مؤجلة؛ لا مفتاح حقيقي.
import { describe, expect, it } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../src/core';
import { SecretStore } from '../../src/core/connections/secrets';
import type { SecretArea, StoredSecret } from '../../src/core/connections/secrets';
import { ConnectionsService, memoryHealthLog } from '../../src/core/connections/service';
import { ProviderService, memoryModelsCache } from '../../src/modules/e/provider/service';
import type { ProviderKeyStore } from '../../src/modules/e/provider/service';
import { createProviderRegistry } from '../../src/modules/e/provider/registry';
import { OPENAI_ADAPTER } from '../../src/modules/e/provider/adapters/openai';
import { defineProviderSettings, modelSettingKey } from '../../src/modules/e/provider/settings';
import type { AnalyzeInput } from '../../src/modules/e/provider/port';
import { fakePermissions } from '../core/ui-host/helpers';
import { memoryArea } from '../modules/d/token/helpers';
import { fakeKey, providerMock } from '../modules/e/provider/fixture-provider-mock';

const input = (requestId: string): AnalyzeInput => ({ requestId, section: 'checks', provider: 'anthropic', model: 'mock-sonnet-2', system: 'صيغة اصطناعية', prompt: 'error SYNTHETIC_AUDIT_ONLY' });

async function anthropic(fetch: typeof globalThis.fetch) {
  let tick = 1000;
  const store = new SecretStore({ session: memoryArea(), disk: memoryArea(), now: () => tick++ });
  await store.save(fakeKey('OLD'), 'session');
  const area = new MemoryStorageArea();
  const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r)));
  const connections = new ConnectionsService({ stores: {}, providerKeys: { selected: async () => 'anthropic', store: () => store }, log: memoryHealthLog(), fixable: [] });
  const cache = memoryModelsCache();
  const service = new ProviderService({ keys: () => store, permissions: fakePermissions(['https://api.anthropic.com/*']), fetch, connections, settings: async () => settings, cache });
  return { store, settings, connections, cache, service };
}

/** fetch يعلّق أول طلب بالمفتاح القديم حتى يُفرج عنه، ويرد عليه بما يُعطى؛ وما سواه للمحاكي الناجح. */
function heldOldKey(reply: (url: RequestInfo | URL, init: RequestInit) => Response | Promise<Response>) {
  const success = providerMock();
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  const held = new Promise<void>((r) => (release = r));
  const tokens: string[] = [];
  let pending = true;
  const fetch = (async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const token = (new Headers(init.headers).get('authorization') ?? '').replace(/^Bearer /, '');
    tokens.push(token);
    if (pending && token === fakeKey('OLD')) {
      pending = false;
      entered();
      await held;
      return reply(url, init);
    }
    return success.fetch(url, init);
  }) as typeof globalThis.fetch;
  return { fetch, started, release: () => release(), tokens };
}

describe('F-03: نسبة الردود إلى جيل المفتاح الذي أُرسلت به', () => {
  it('401 متأخر بالمفتاح القديم لا يجعل البديل المتحقَّق منه منتهيًا ولا يمنع تحليله', async () => {
    const net = heldOldKey(() => new Response(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'synthetic invalid old key' } }), { status: 401 }));
    const h = await anthropic(net.fetch);
    const oldRequest = h.service.verify('anthropic');
    await net.started;
    await h.store.save(fakeKey('NEW'), 'session');
    expect((await h.service.verify('anthropic')).ok).toBe(true);
    expect((await h.connections.keyStatus('anthropic')).health).toBe('healthy');
    net.release();
    const old = await oldRequest;
    expect(old.ok).toBe(false);
    const status = await h.connections.keyStatus('anthropic');
    expect(status.health).toBe('healthy');
    expect(status.savedAt).toBe((await h.store.info())?.savedAt);
    const analysis = await h.service.analyze(input('after-replace'), 'tab-1');
    expect(analysis.ok).toBe(true);
    expect(net.tokens.at(-1)).toBe(fakeKey('NEW'));
  });

  it('نجاح متأخر بالمفتاح القديم لا يجعل البديل (غير المتحقَّق منه) سليمًا ولا يحفظ قائمته له', async () => {
    const success = providerMock();
    const net = heldOldKey((url, init) => success.fetch(url, init));
    const h = await anthropic(net.fetch);
    const oldRequest = h.service.verify('anthropic');
    await net.started;
    await h.store.save(fakeKey('NEW'), 'session');
    net.release();
    const old = await oldRequest;
    expect(old).toMatchObject({ ok: false, failure: 'key-changed' });
    expect((await h.connections.keyStatus('anthropic')).health).toBe('unverified');
    expect(await h.cache.load('anthropic')).toBeNull();
    expect(h.settings.get(modelSettingKey('anthropic'))).toBeFalsy();
  });

  it('استبدال المفتاح أثناء اختبار النموذج لا يُظهر نتيجة الاختبار للمفتاح البديل', async () => {
    const adapter = OPENAI_ADAPTER;
    let value: StoredSecret | null = null;
    let capture = false;
    let release!: () => void;
    let captured!: () => void;
    const paused = new Promise<void>((r) => (captured = r));
    const resume = new Promise<void>((r) => (release = r));
    const area: SecretArea = {
      async get() {
        return value;
      },
      async set(v) {
        value = v;
      },
      async remove() {
        value = null;
      },
    };
    let tick = 100;
    const keys = new SecretStore({ session: area, disk: null, now: () => ++tick });
    const oldKey = 'sk-' + 'auditold'.repeat(8);
    const newKey = 'sk-' + 'auditnew'.repeat(8);
    await keys.save(oldKey, 'session');
    // يعلّق قراءة السرّ التي يُرسل بها الطلب بعد أخذ لقطتها: يُستبدل المفتاح بين قراءة السرّ وما يليها في probe. قراءات وقت الحفظ (info) لا تُعلَّق.
    const requestKeys: ProviderKeyStore = {
      async read() {
        const snapshot = await keys.read();
        if (capture) {
          capture = false;
          captured();
          await resume;
        }
        return snapshot;
      },
      info: () => keys.info(),
    };
    const settingsArea = new MemoryStorageArea();
    const settings = await SettingsStore.open(
      await Store.open({ area: settingsArea, changes: settingsArea, locks: null }),
      createSettingsRegistry((r) => defineProviderSettings(r, [adapter.descriptor])),
    );
    await settings.set(modelSettingKey('openai'), 'audit-model');
    const connections = new ConnectionsService({ stores: {}, providerKeys: { selected: async () => 'openai', store: () => keys }, fixable: [] });
    const sent: string[] = [];
    const service = new ProviderService({
      registry: createProviderRegistry([adapter]),
      keys: () => requestKeys,
      permissions: fakePermissions([adapter.descriptor.origin]),
      settings: async () => settings,
      connections,
      cache: memoryModelsCache(),
      fetch: (async (_url, init) => {
        sent.push(new Headers(init?.headers).get('authorization') ?? '');
        return new Response(
          JSON.stringify({ id: 'audit', status: 'completed', model: 'audit-model', output: [{ type: 'message', content: [{ type: 'output_text', text: 'pong' }] }] }),
          { status: 200 },
        );
      }) as typeof fetch,
    });
    capture = true;
    const pending = service.probe('openai', 'audit-model');
    await paused;
    const replacement = await keys.save(newKey, 'session');
    release();
    const result = await pending;
    const shown = await service.status('openai');
    expect(sent).toEqual(['Bearer ' + oldKey]);
    expect(result).toMatchObject({ ok: false, failure: 'key-changed' });
    expect(shown?.key?.savedAt).toBe(replacement.savedAt);
    expect(shown?.test).toBeNull();
    expect(shown?.key?.health).toBe('unverified');
  });
});

/** تحليل بالمفتاح القديم يُعلَّق عند الشبكة، ثم يُحفظ البديل (ويُتحقق منه إن طُلب) قبل أن يعود رده. */
async function lateAnalysis(reply: Parameters<typeof heldOldKey>[0], verifyReplacement: boolean) {
  const net = heldOldKey(reply);
  const h = await anthropic(net.fetch);
  await h.settings.set(modelSettingKey('anthropic'), 'mock-sonnet-2');
  const late = h.service.analyze(input('before-replace'), 'tab-1');
  await net.started;
  const replacement = await h.store.save(fakeKey('NEW'), 'session');
  if (verifyReplacement) expect((await h.service.verify('anthropic')).ok).toBe(true);
  net.release();
  return { ...h, net, replacement, result: await late };
}

const rejected = (status: number, type: string, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify({ type: 'error', error: { type, message: 'synthetic old key failure' } }), { status, headers });

describe('F-03 (الجولة الثانية): تحليل طُلب بالمفتاح القديم وعاد بعد استبداله', () => {
  it('نجاحه يُعاد لصاحبه بالمزوّد والنموذج الذي وافق عليهما، ولا يمس صحة البديل ولا قائمته ولا اختباره ولا موعده', async () => {
    const success = providerMock();
    const h = await lateAnalysis((url, init) => success.fetch(url, init), true);
    expect(h.result.ok).toBe(true);
    if (!h.result.ok) return;
    expect(h.result.data).toMatchObject({ provider: 'Anthropic', host: 'api.anthropic.com', model: 'mock-sonnet-2' });
    expect(h.result.data.completedAt).toBeGreaterThanOrEqual(h.result.data.requestedAt);
    expect(await h.connections.keyStatus('anthropic')).toMatchObject({ health: 'healthy', savedAt: h.replacement.savedAt });
    expect(h.cache.lists.get('anthropic')?.keySavedAt).toBe(h.replacement.savedAt);
    expect(h.cache.tests.size).toBe(0);
    expect((await h.service.status('anthropic'))?.retryAt).toBeNull();
    expect(h.net.tokens).toEqual([fakeKey('OLD'), fakeKey('NEW')]);
  });

  it('رفضه بـ401 يُبلَّغ أنه لمفتاح استُبدل لا أن البديل مرفوض، ولا يجعل البديل منتهيًا، ويُرسل التحليل التالي بالبديل', async () => {
    const h = await lateAnalysis(rejected(401, 'authentication_error'), true);
    expect(h.result).toMatchObject({ ok: false, failure: 'key-changed', status: 401, retryAt: null });
    expect((await h.connections.keyStatus('anthropic')).health).toBe('healthy');
    const next = await h.service.analyze(input('after-replace'), 'tab-1');
    expect(next.ok).toBe(true);
    expect(h.net.tokens.at(-1)).toBe(fakeKey('NEW'));
  });

  it('429 بموعد إعادة محاولة لا يُعرض موعده ولا يحجب البديل (غير المتحقَّق منه)، ويُرسل التحليل التالي به', async () => {
    const h = await lateAnalysis(rejected(429, 'rate_limit_error', { 'retry-after': '90' }), false);
    expect(h.result).toMatchObject({ ok: false, failure: 'key-changed', status: 429, retryAt: null });
    expect((await h.service.status('anthropic'))?.retryAt).toBeNull();
    expect((await h.connections.keyStatus('anthropic')).health).toBe('unverified');
    const next = await h.service.analyze(input('after-replace'), 'tab-1');
    expect(next.ok).toBe(true);
    expect(h.net.tokens).toEqual([fakeKey('OLD'), fakeKey('NEW')]);
  });

  it('ما لا يخص المفتاح (تعذّر الاتصال) يُعاد كما هو: لا يُنسب إلى الاستبدال', async () => {
    const h = await lateAnalysis(() => Promise.reject(new TypeError('synthetic network down')), false);
    expect(h.result).toMatchObject({ ok: false, failure: 'network' });
    expect((await h.connections.keyStatus('anthropic')).health).toBe('unverified');
  });
});

describe('F-03: رسالة key-changed بحسب ما صار إليه المفتاح، فلا تطلب إعادة المحاولة بمفتاح غير محفوظ', () => {
  it('استُبدل المفتاح أثناء التحليل: الرسالة تدعو إلى إعادة المحاولة بالمفتاح الحالي', async () => {
    const h = await lateAnalysis(rejected(401, 'authentication_error'), false);
    expect(h.result).toMatchObject({ ok: false, failure: 'key-changed' });
    if (h.result.ok) return;
    expect(h.result.message).toContain('استُبدل مفتاح Anthropic');
    expect(h.result.message).toContain('بالمفتاح الحالي');
  });

  it('مُسح المفتاح أثناء التحليل: الرسالة تقول إن لا مفتاح محفوظًا ولا تطلب إعادة المحاولة', async () => {
    const net = heldOldKey(rejected(401, 'authentication_error'));
    const h = await anthropic(net.fetch);
    await h.settings.set(modelSettingKey('anthropic'), 'mock-sonnet-2');
    const late = h.service.analyze(input('before-clear'), 'tab-1');
    await net.started;
    await h.store.clear();
    net.release();
    const result = await late;
    expect(result).toMatchObject({ ok: false, failure: 'key-changed', status: 401, retryAt: null });
    if (result.ok) return;
    expect(result.message).toContain('مُسح مفتاح Anthropic');
    expect(result.message).toContain('لا مفتاح محفوظ الآن');
    expect(result.message).not.toContain('أعد المحاولة');
    expect((await h.connections.keyStatus('anthropic')).health).not.toBe('expired');
  });

  it('تعذّرت قراءة المفتاح بعد الطلب: تحيل الرسالة إلى بطاقة المزوّد، ولا تُحفظ القائمة لأي مفتاح', async () => {
    const net = heldOldKey((url, init) => providerMock().fetch(url, init));
    const h = await anthropic(net.fetch);
    let broken = false;
    const flaky: ProviderKeyStore = {
      read: () => h.store.read(),
      info: () => (broken ? Promise.reject(new Error('synthetic unreadable key')) : h.store.info()),
    };
    const service = new ProviderService({ keys: () => flaky, permissions: fakePermissions(['https://api.anthropic.com/*']), fetch: net.fetch, connections: h.connections, settings: async () => h.settings, cache: h.cache });
    const pending = service.verify('anthropic');
    await net.started;
    broken = true;
    net.release();
    const result = await pending;
    expect(result).toMatchObject({ ok: false, failure: 'key-changed' });
    if (result.ok) return;
    expect(result.message).toContain('تعذّرت قراءة مفتاح Anthropic');
    expect(result.message).toContain('بطاقة «مزوّد التحليل»');
    expect(await h.cache.load('anthropic')).toBeNull();
  });
});

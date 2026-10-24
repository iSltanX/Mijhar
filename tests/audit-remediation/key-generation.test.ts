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
function heldOldKey(reply: () => Response | Promise<Response>) {
  const success = providerMock();
  let release!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => (entered = r));
  const held = new Promise<void>((r) => (release = r));
  const tokens: string[] = [];
  let pending = true;
  const fetch = (async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const token = new Headers(init.headers).get('x-api-key') ?? '';
    tokens.push(token);
    if (pending && token === fakeKey('OLD')) {
      pending = false;
      entered();
      await held;
      return reply();
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
    const net = heldOldKey(() => success.fetch('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': fakeKey('OLD') } }));
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

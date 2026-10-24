/**
 * COR-AUD-02 (Gemini): مسح مفتاح مزوّد أو رمز GitHub لا يُبقي ما اشتُق منه في storage.session إلى إغلاق المتصفح: قائمة نماذج المزوّد
 * (mijhar.provider.models) ونتيجة اختبار نموذجه (mijhar.provider.tests) وسجل صحته (mijhar.connections.health)، ولا تُعرض قائمته بعد مسحه.
 * المسح يجري في صفحة الإعدادات على مخزن السر مباشرة، فتحذفها الخلفية حين تقرأ غيابه (قراءة الحالة التي تلي المسح). وما يخص مزوّدًا آخر يبقى،
 * وتعذّر قراءة المخزن ليس غيابًا فلا يُحذف معه شيء.
 * محاكاة محلية: fetch وهمي ومفاتيح اصطناعية وصلاحيات اصطناعية، ولا طلب حي.
 */
import { describe, expect, it } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../src/core';
import { SecretStore } from '../../src/core/connections/secrets';
import type { SessionStorageLike } from '../../src/core/connections/secrets';
import { ConnectionsService, HEALTH_LOG_KEY, sessionHealthLog } from '../../src/core/connections/service';
import type { HealthRecord } from '../../src/core/connections';
import { defineProviderSettings, modelSettingKey } from '../../src/modules/e/provider/settings';
import { MODELS_CACHE_KEY, MODEL_TESTS_KEY, ProviderService, sessionModelsCache } from '../../src/modules/e/provider/service';
import { createProviderRegistry } from '../../src/modules/e/provider/registry';
import { OPENAI_ADAPTER } from '../../src/modules/e/provider/adapters/openai';
import { fakePermissions } from '../core/ui-host/helpers';
import { memoryArea } from '../modules/d/token/helpers';
import { fakeOpenAiKey, openAiMock } from '../modules/e/provider/fixture-provider-mock';

const NOW = 1_800_000_000_000;
const MODEL = 'mock-gpt-free-text';
const ANTHROPIC_LIST = { provider: 'anthropic', models: [], readAt: NOW, source: 'https://api.anthropic.com/v1/models', partial: false };
const ANTHROPIC_TEST = { provider: 'anthropic', model: 'mock-sonnet-2', keySavedAt: 1, verdict: 'accepted', status: 200, message: '', at: NOW };

/** storage.session للإضافة في الذاكرة. */
function sessionArea(): SessionStorageLike & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {};
  return {
    data,
    get: async (key) => (key in data ? { [key]: structuredClone(data[key]) } : {}),
    set: async (items) => void Object.assign(data, structuredClone(items)),
    remove: async (key) => void delete data[key],
  };
}

const entries = (session: { data: Record<string, unknown> }, key: string): string[] => Object.keys((session.data[key] as Record<string, unknown> | undefined) ?? {}).sort();
const health = (session: { data: Record<string, unknown> }): string[] =>
  ((session.data[HEALTH_LOG_KEY] as HealthRecord[] | undefined) ?? []).map((r) => (r.provider ? `${r.id}:${r.provider}` : r.id)).sort();

async function harness() {
  const session = sessionArea();
  let tick = 1000;
  const keys = {
    openai: new SecretStore({ session: memoryArea(), disk: null, now: () => (tick += 1) }),
    anthropic: new SecretStore({ session: memoryArea(), disk: null, now: () => (tick += 1) }),
  } as Record<string, SecretStore>;
  await keys.openai!.save(fakeOpenAiKey(), 'session');
  await keys.anthropic!.save('sk-ant-SYNTHETIC-AUDIT-ONLY-0000', 'session');
  const area = new MemoryStorageArea();
  const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r)));
  await settings.set(modelSettingKey('openai'), MODEL);
  const connections = new ConnectionsService({ stores: {}, providerKeys: { selected: async () => 'openai', store: (p) => keys[p] ?? null }, log: sessionHealthLog(session), fixable: [], now: () => NOW });
  const cache = sessionModelsCache(session);
  const service = new ProviderService({
    registry: createProviderRegistry([OPENAI_ADAPTER]),
    keys: (p) => keys[p] ?? null,
    permissions: fakePermissions([OPENAI_ADAPTER.descriptor.origin]),
    fetch: openAiMock({ probe: 'ok' }).fetch,
    connections,
    settings: async () => settings,
    cache,
    now: () => NOW,
  });
  // ما يخص مزوّدًا آخر مفتاحه باقٍ: لا يمسّه مسح مفتاح OpenAI.
  await cache.save(ANTHROPIC_LIST);
  await cache.saveTest(ANTHROPIC_TEST as never);
  await connections.observe('provider-key', { health: 'healthy', detail: {} }, 'anthropic');
  return { session, keys, connections, service };
}

describe('COR-AUD-02: مسح المفتاح أو الرمز لا يُبقي ما اشتُق منه في storage.session', () => {
  it('مسح مفتاح OpenAI: تُحذف قائمته ونتيجة اختباره وسجل صحته، ولا تُعرض قائمته؛ وما يخص Anthropic يبقى', async () => {
    const h = await harness();
    expect((await h.service.verify('openai')).ok).toBe(true);
    expect(await h.service.probe('openai', MODEL)).toMatchObject({ ok: true, data: { verdict: 'accepted' } });
    expect(entries(h.session, MODELS_CACHE_KEY)).toEqual(['anthropic', 'openai']);
    expect(entries(h.session, MODEL_TESTS_KEY)).toEqual(['anthropic', 'openai']);
    expect(health(h.session)).toEqual(['provider-key:anthropic', 'provider-key:openai']);

    await h.keys.openai!.clear();
    const status = await h.service.status('openai');

    expect(status).toMatchObject({ models: null, test: null, key: { health: 'none' } });
    expect(entries(h.session, MODELS_CACHE_KEY)).toEqual(['anthropic']);
    expect(entries(h.session, MODEL_TESTS_KEY)).toEqual(['anthropic']);
    expect(health(h.session)).toEqual(['provider-key:anthropic']);
    // المزوّد غير الممسوح كما كان.
    expect((h.session.data[MODELS_CACHE_KEY] as Record<string, unknown>).anthropic).toEqual(ANTHROPIC_LIST);
  });

  it('حالة كل الاتصالات بعد مسح المفتاح تحذف سجل صحته أيضًا، ولا يعود بعد إعادة إنشاء الخدمة من التخزين', async () => {
    const h = await harness();
    expect((await h.service.verify('openai')).ok).toBe(true);
    await h.keys.openai!.clear();
    await h.connections.status();
    expect(health(h.session)).toEqual(['provider-key:anthropic']);
    const restarted = new ConnectionsService({ stores: {}, providerKeys: { selected: async () => 'openai', store: (p) => h.keys[p] ?? null }, log: sessionHealthLog(h.session), fixable: [], now: () => NOW });
    expect((await restarted.keyStatus('openai')).health).toBe('none');
    expect(health(h.session)).toEqual(['provider-key:anthropic']);
  });

  it('تعذّر قراءة مخزن المفتاح ليس غيابًا: لا يُحذف شيء', async () => {
    const h = await harness();
    expect((await h.service.verify('openai')).ok).toBe(true);
    h.keys.openai!.info = async () => {
      throw new Error('IndexedDB unavailable');
    };
    await h.service.status('openai');
    await h.connections.status();
    expect(entries(h.session, MODELS_CACHE_KEY)).toEqual(['anthropic', 'openai']);
    expect(health(h.session)).toEqual(['provider-key:anthropic', 'provider-key:openai']);
  });

  it('مسح رمز GitHub أو رمز الكتابة: يُحذف سجل صحته من الجلسة عند قراءة الحالة', async () => {
    const session = sessionArea();
    const token = new SecretStore({ session: memoryArea(), disk: null, now: () => 2000 });
    const write = new SecretStore({ session: memoryArea(), disk: null, now: () => 3000 });
    await token.save('github_pat_SYNTHETIC_AUDIT_ONLY_0000', 'session');
    await write.save('github_pat_SYNTHETIC_WRITE_ONLY_0000', 'session');
    const connections = new ConnectionsService({ stores: { 'github-token': token, 'github-write': write }, log: sessionHealthLog(session), fixable: [], now: () => NOW });
    await connections.observe('github-token', { health: 'healthy', detail: {} });
    await connections.observe('github-write', { health: 'healthy', detail: {} });
    expect(health(session)).toEqual(['github-token', 'github-write']);

    await token.clear();
    await connections.status();
    expect(health(session)).toEqual(['github-write']);
    await write.clear();
    await connections.status();
    expect(health(session)).toEqual([]);
  });
});

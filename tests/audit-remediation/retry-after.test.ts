/**
 * F-06 (Codex): موعد إعادة المحاولة الذي أعلنه المزوّد (Retry-After) يُحترم في كل طلب يرسله مجهر بمفتاحه قبل الموعد (`AD-31`):
 * - التحقق وتحديث القائمة (زر +) لا يرسلان قبله، كما التحليل واختبار النموذج؛
 * - وإعادة إنشاء خدمة الخلفية (إيقاظ العامل) بالتخزين نفسه لا تُسقطه: يُستعاد من سجل صحة المفتاح المحفوظ.
 * لا إعادة محاولة تلقائية ولا سقف ولا ميزانية؛ بعد الموعد يُرسل الطلب التالي بنقرة المستخدم كما كان.
 * محاكاة محلية: fetch وهمي ومفتاح اصطناعي وصلاحيات اصطناعية؛ وإعادة التشغيل محاكاة في Node لا إيقاف عامل متصفح حي.
 */
import { describe, expect, it } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../src/core';
import { SecretStore } from '../../src/core/connections/secrets';
import { ConnectionsService, memoryHealthLog } from '../../src/core/connections/service';
import { defineProviderSettings, modelSettingKey } from '../../src/modules/e/provider/settings';
import { ProviderService, memoryModelsCache } from '../../src/modules/e/provider/service';
import { createProviderRegistry } from '../../src/modules/e/provider/registry';
import { OPENAI_ADAPTER } from '../../src/modules/e/provider/adapters/openai';
import type { ProviderAdapter } from '../../src/modules/e/provider';
import type { AnalyzeInput } from '../../src/modules/e/provider/port';
import { fakePermissions } from '../core/ui-host/helpers';
import { memoryArea } from '../modules/d/token/helpers';
import { fakeKey, fakeOpenAiKey, openAiMock, providerMock } from '../modules/e/provider/fixture-provider-mock';

const START = 1_800_000_000_000;
const input = (requestId: string): AnalyzeInput => ({ requestId, section: 'checks', provider: 'anthropic', model: 'mock-sonnet-2', system: 'صيغة اصطناعية', prompt: 'error SYNTHETIC_AUDIT_ONLY' });

interface Net {
  readonly fetch: typeof globalThis.fetch;
  readonly requests: readonly unknown[];
}

async function harness(mock: Net, adapter: ProviderAdapter | null = null, key = fakeKey(), model = 'mock-sonnet-2') {
  const clock = { now: START };
  const provider = adapter?.descriptor.id ?? 'anthropic';
  let tick = 1000;
  const store = new SecretStore({ session: memoryArea(), disk: null, now: () => (tick += 1) });
  await store.save(key, 'session');
  const area = new MemoryStorageArea();
  const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r)));
  await settings.set(modelSettingKey(provider), model);
  const log = memoryHealthLog();
  const cache = memoryModelsCache();
  const permissions = fakePermissions([adapter?.descriptor.origin ?? 'https://api.anthropic.com/*']);
  // خدمتا الخلفية كما تُنشآن عند إيقاظ العامل: سجل الصحة والمفتاح والإعدادات في التخزين، وما في الذاكرة يضيع.
  const boot = () => {
    const connections = new ConnectionsService({ stores: {}, providerKeys: { selected: async () => provider, store: () => store }, log, fixable: [], now: () => clock.now });
    return new ProviderService({
      ...(adapter ? { registry: createProviderRegistry([adapter]) } : {}),
      keys: () => store,
      permissions,
      fetch: mock.fetch,
      connections,
      settings: async () => settings,
      cache,
      now: () => clock.now,
    });
  };
  return { clock, mock, store, boot, service: boot() };
}

describe('F-06: موعد إعادة المحاولة المعلن يمنع التحقق وتحديث القائمة قبله', () => {
  it('429 من التحقق: لا تحقق ثانٍ ولا تحديث قائمة (زر +) قبل الموعد، وبعده يُرسل بنقرة المستخدم', async () => {
    const h = await harness(providerMock({ verify: '429', retryAfter: 60 }) as Net);
    expect(await h.service.verify('anthropic')).toMatchObject({ ok: false, failure: 'rate-limit', retryAt: START + 60_000 });
    expect(h.mock.requests).toHaveLength(1);
    expect((await h.service.status('anthropic'))?.retryAt).toBe(START + 60_000);

    h.clock.now = START + 30_000;
    expect(await h.service.verify('anthropic')).toMatchObject({ ok: false, failure: 'cooldown', status: null, retryAt: START + 60_000 });
    expect(await h.service.verify('anthropic', false)).toMatchObject({ ok: false, failure: 'cooldown', retryAt: START + 60_000 });
    expect(h.mock.requests).toHaveLength(1);

    h.clock.now = START + 60_000;
    expect((await h.service.status('anthropic'))?.retryAt).toBeNull();
    await h.service.verify('anthropic');
    expect(h.mock.requests).toHaveLength(2);
  });

  it('429 من التحليل: التحقق قبل الموعد لا يُرسل أيضًا', async () => {
    const h = await harness(providerMock({ analyze: '429', retryAfter: 120 }) as Net);
    expect((await h.service.verify('anthropic')).ok).toBe(true);
    expect(await h.service.analyze(input('first'), 'tab-1')).toMatchObject({ ok: false, failure: 'rate-limit' });
    const sent = h.mock.requests.length;
    expect(await h.service.verify('anthropic')).toMatchObject({ ok: false, failure: 'cooldown', retryAt: START + 120_000 });
    expect(h.mock.requests).toHaveLength(sent);
  });
});

describe('F-06: إيقاظ الخلفية بعد 429 لا يُسقط الموعد المحفوظ', () => {
  it('الخدمة الجديدة بالتخزين نفسه تعرض الموعد وتمنع التحليل والاختبار والتحقق قبله، ثم تُرسل بعده', async () => {
    const h = await harness(providerMock({ analyze: '429', retryAfter: 300 }) as Net);
    expect((await h.service.verify('anthropic')).ok).toBe(true);
    expect(await h.service.analyze(input('first'), 'tab-1')).toMatchObject({ ok: false, failure: 'rate-limit', retryAt: START + 300_000 });
    const sent = h.mock.requests.length;

    h.clock.now = START + 10_000;
    const restarted = h.boot();
    const state = await restarted.status();
    expect(state?.key?.health).toBe('rate-limited');
    expect(state?.retryAt).toBe(START + 300_000);
    expect(await restarted.analyze(input('after-restart'), 'tab-1')).toMatchObject({ ok: false, failure: 'cooldown', status: null, retryAt: START + 300_000 });
    expect(await restarted.verify('anthropic')).toMatchObject({ ok: false, failure: 'cooldown', retryAt: START + 300_000 });
    expect(h.mock.requests).toHaveLength(sent);

    h.clock.now = START + 300_000;
    const later = h.boot();
    expect((await later.status())?.retryAt).toBeNull();
    await later.analyze(input('after-deadline'), 'tab-1');
    expect(h.mock.requests).toHaveLength(sent + 1);
  });

  it('429 من «اختبر النموذج» الاختياري: بعد الإيقاظ لا اختبار ولا تحقق قبل الموعد', async () => {
    const h = await harness(openAiMock({ probe: '429', retryAfter: 90 }), OPENAI_ADAPTER, fakeOpenAiKey(), 'mock-gpt-free-text');
    expect(await h.service.probe('openai', 'mock-gpt-free-text')).toMatchObject({ ok: true, data: { verdict: 'inconclusive' } });
    expect((await h.service.status('openai'))?.retryAt).toBe(START + 90_000);
    const sent = h.mock.requests.length;

    const restarted = h.boot();
    expect((await restarted.status('openai'))?.retryAt).toBe(START + 90_000);
    expect(await restarted.probe('openai', 'mock-gpt-free-text')).toMatchObject({ ok: false, failure: 'cooldown', retryAt: START + 90_000 });
    expect(await restarted.verify('openai')).toMatchObject({ ok: false, failure: 'cooldown', retryAt: START + 90_000 });
    expect(h.mock.requests).toHaveLength(sent);
  });

  it('مفتاح استُبدل بعد الموعد المحفوظ: سجل صحة المفتاح السابق لا يُستعاد موعدًا للبديل بعد الإيقاظ', async () => {
    const h = await harness(providerMock({ analyze: '429', retryAfter: 300 }) as Net);
    expect((await h.service.verify('anthropic')).ok).toBe(true);
    await h.service.analyze(input('first'), 'tab-1');
    await h.store.save(fakeKey('NEW'), 'session');
    const restarted = h.boot();
    expect((await restarted.status())?.retryAt).toBeNull();
    const sent = h.mock.requests.length;
    await restarted.verify('anthropic');
    expect(h.mock.requests).toHaveLength(sent + 1);
  });
});

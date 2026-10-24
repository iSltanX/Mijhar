// خدمة المزوّد مع محوّل OpenAI الحقيقي (MJ24، T-11.11، TEST-AI-07، AC-E11 (٢) و(٣) و(٤)) — محاكاة: Anthropic وOpenAI المدموجان بمضيفيهما الوهميين، وخدمة المزوّد
// وسجل الاتصالات الفعليان بمخزن مستقل لكل مزوّد. تثبت: التحقق، والمودلات غير المعلنة التوافق (HYP-22) لا تُرسل قبل فحص صريح، والفحص، والتحليل، وعزل
// المفتاحين، وأن رفض 401 يوقف إعادة الإرسال بالمفتاح، وموعد إعادة المحاولة يُحترم، ولا تحويل ولا إعادة.
import { describe, expect, it } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../../../src/core';
import { SecretStore } from '../../../../src/core/connections/secrets';
import { ConnectionsService, memoryHealthLog } from '../../../../src/core/connections/service';
import { PROVIDER_ID_KEY, defineProviderSettings, modelSettingKey } from '../../../../src/modules/e/provider';
import type { AnalyzeInput } from '../../../../src/modules/e/provider';
import { ANTHROPIC_ADAPTER } from '../../../../src/modules/e/provider/adapters/anthropic';
import { OPENAI_ADAPTER } from '../../../../src/modules/e/provider/adapters/openai';
import { createProviderRegistry } from '../../../../src/modules/e/provider/registry';
import { ProviderService, memoryModelsCache } from '../../../../src/modules/e/provider/service';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { memoryArea } from '../../d/token/helpers';
import { fakeKey, fakeOpenAiKey, openAiMock, providerMock } from './fixture-provider-mock';
import type { OpenAiScenario } from './fixture-provider-mock';

const OPENAI_HOST = 'api.openai.com';
const ANTHROPIC_HOST = 'api.anthropic.com';

async function setup(scenario: OpenAiScenario = {}, now = () => 1_800_000_000_000) {
  const registry = createProviderRegistry([ANTHROPIC_ADAPTER, OPENAI_ADAPTER]);
  const descriptors = registry.list.map((a) => a.descriptor);
  const area = new MemoryStorageArea();
  const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r, descriptors)));
  const stores = new Map<string, SecretStore>(descriptors.map((d) => [d.id, new SecretStore({ session: memoryArea(), disk: memoryArea() })]));
  const keys = { anthropic: fakeKey('S'), openai: fakeOpenAiKey('S') } as const;
  for (const [id, key] of Object.entries(keys)) await stores.get(id)?.save(key, 'session');
  const anthropic = providerMock();
  const openai = openAiMock(scenario);
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => (new URL(String(input)).host === ANTHROPIC_HOST ? anthropic.fetch(input, init) : openai.fetch(input, init))) as typeof globalThis.fetch;
  const permissions = fakePermissions(descriptors.map((d) => d.origin));
  const connections = new ConnectionsService({ stores: {}, providerKeys: { selected: async () => settings.get<string>(PROVIDER_ID_KEY), store: (id) => stores.get(id) ?? null }, log: memoryHealthLog(), fixable: [] });
  const service = new ProviderService({
    registry,
    keys: (id) => stores.get(id) ?? null,
    permissions,
    fetch,
    connections: { keyStatus: (p) => connections.keyStatus(p), observe: (id, v, p) => connections.observe(id, v, p) },
    settings: async () => settings,
    cache: memoryModelsCache(),
    now,
  });
  await settings.set(PROVIDER_ID_KEY, 'openai');
  return { service, settings, keys, anthropic, openai, connections, permissions, stores };
}

const input = (model: string, over: Partial<AnalyzeInput> = {}): AnalyzeInput => ({ requestId: over.requestId ?? `r-${model}`, section: 'checks', provider: 'openai', model, system: 'تعليمات صيغة الرد', prompt: '# تشخيص\n\nerror TS2322: not assignable\n', ...over });

describe('التحقق والمودلات غير المعلنة التوافق (DEC-13 ن-3، HYP-22، BLK-MODEL-COMPAT)', () => {
  it('التحقق يقرأ القائمة بمفتاح OpenAI إلى مضيفه وحده؛ ولا مودل متوافق بعده ولا يُرسل تحليل ولا يُخمَّن مودل', async () => {
    const s = await setup();
    const verified = await s.service.verify('openai');
    expect(verified.ok && verified.data.models.map((m) => m.compatibility)).toEqual(['unknown', 'unknown', 'unknown']);
    const status = await s.service.status('openai');
    expect(status).toMatchObject({ model: null, choice: '', key: { health: 'healthy' } });
    expect(await s.service.analyze(input('mock-chat-2'), 't')).toMatchObject({ ok: false, failure: 'model-changed', status: null });
    expect(s.openai.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual(['GET /v1/models']);
  });

  it('الفحص الصريح ينجح فيصير المودل خيارًا ويحمل مفتاح OpenAI «ping» وحده؛ والتحليل بعده طلب واحد', async () => {
    const s = await setup();
    await s.service.verify('openai');
    const probed = await s.service.probe('openai', 'mock-chat-2');
    expect(probed.ok && probed.data.models.map((m) => [m.id, m.compatibility])).toEqual([
      ['mock-chat-2', 'checked'],
      ['mock-embed-1', 'unknown'],
      ['mock-sunset-1', 'unknown'],
    ]);
    expect((await s.service.status('openai'))?.model?.id).toBe('mock-chat-2');
    const r = await s.service.analyze(input('mock-chat-2'), 't');
    expect(r).toMatchObject({ ok: true, data: { provider: 'OpenAI', host: OPENAI_HOST, model: 'mock-chat-2' } });
    const posts = s.openai.requests.filter((q) => q.method === 'POST');
    expect(posts.map((q) => JSON.parse(q.body ?? '{}').input)).toEqual(['ping', '# تشخيص\n\nerror TS2322: not assignable\n']);
    for (const q of s.openai.requests) expect(q.headers.authorization).toBe(`Bearer ${s.keys.openai}`);
    expect(s.anthropic.requests).toHaveLength(0);
  });

  it('فحص فاشل (400) لا يجعل المودل خيارًا ولا يغيّر شيئًا؛ ومودل خارج القائمة المقروءة لا يُرسل له شيء', async () => {
    const s = await setup({ unsupported: ['mock-embed-1'] });
    await s.service.verify('openai');
    expect(await s.service.probe('openai', 'mock-embed-1')).toMatchObject({ ok: false, failure: 'invalid', status: 400 });
    expect((await s.service.status('openai'))?.model).toBeNull();
    const before = s.openai.requests.length;
    expect(await s.service.probe('openai', 'not-in-list')).toMatchObject({ ok: false, failure: 'invalid-request', status: null });
    expect(s.openai.requests).toHaveLength(before);
  });
});

describe('عزل المفتاحين والوجهة', () => {
  it('مفتاح OpenAI إلى api.openai.com وحده، ومفتاح Anthropic إلى مضيفه وحده؛ ولا رمز GitHub في أي طلب', async () => {
    const s = await setup();
    await s.service.verify('openai');
    await s.service.verify('anthropic');
    await s.service.probe('openai', 'mock-chat-2');
    await s.service.analyze(input('mock-chat-2'), 't');
    const all = [...s.openai.requests.map((r) => ({ host: new URL(r.url).host, raw: JSON.stringify(r) })), ...s.anthropic.requests.map((r) => ({ host: new URL(r.url).host, raw: JSON.stringify(r) }))];
    for (const r of all) {
      expect(r.host === OPENAI_HOST ? r.raw.includes(s.keys.anthropic) : r.raw.includes(s.keys.openai)).toBe(false);
      expect(r.raw).not.toMatch(/ghp_|github_pat_|api\.github\.com/);
    }
    expect(all.filter((r) => r.host === OPENAI_HOST).every((r) => r.raw.includes(s.keys.openai))).toBe(true);
    expect(new Set(all.map((r) => r.host))).toEqual(new Set([OPENAI_HOST, ANTHROPIC_HOST]));
  });

  it('طلب بمزوّد غير المختار يُرفض قبل أي طلب؛ وسحب صلاحية api.openai.com يوقف التحليل عنده وحده', async () => {
    const s = await setup();
    await s.service.verify('openai');
    await s.service.probe('openai', 'mock-chat-2');
    expect(await s.service.analyze(input('mock-chat-2', { provider: 'anthropic' }), 't')).toMatchObject({ ok: false, failure: 'provider-changed', status: null });
    await s.permissions.remove({ origins: ['https://api.openai.com/*'] });
    const before = s.openai.requests.length;
    expect(await s.service.analyze(input('mock-chat-2'), 't')).toMatchObject({ ok: false, failure: 'permission', status: null });
    expect(s.openai.requests).toHaveLength(before);
  });

  it('بلا مفتاح OpenAI: لا طلب، ومفتاح Anthropic لا يُستعمل بدلًا منه', async () => {
    const s = await setup();
    await s.stores.get('openai')?.clear();
    expect(await s.service.verify('openai')).toMatchObject({ ok: false, failure: 'no-key', status: null });
    expect(s.openai.requests).toHaveLength(0);
    expect(s.anthropic.requests).toHaveLength(0);
  });
});

describe('الأخطاء في الخدمة: مرفوض لا يُعاد، وموعد المزوّد يُحترم، ولا تحويل', () => {
  it('401: يُسجَّل المفتاح منتهيًا فلا يُرسل به ثانية (expired-key)، ولا إعادة تلقائية ولا تحويل إلى Anthropic', async () => {
    const s = await setup({ analyze: '401' });
    await s.service.verify('openai');
    await s.service.probe('openai', 'mock-chat-2');
    const first = await s.service.analyze(input('mock-chat-2'), 't');
    expect(first).toMatchObject({ ok: false, failure: 'unauthorized', status: 401 });
    expect((await s.connections.keyStatus('openai')).health).toBe('expired');
    const posts = () => s.openai.requests.filter((q) => q.method === 'POST').length;
    const afterFirst = posts();
    expect(await s.service.analyze(input('mock-chat-2', { requestId: 'again' }), 't')).toMatchObject({ ok: false });
    expect(posts()).toBe(afterFirst);
    expect(s.anthropic.requests).toHaveLength(0);
  });

  it('429 بـretry-after: لا طلب قبل الموعد المعلن (cooldown) ولا إعادة تلقائية', async () => {
    let t = 1_800_000_000_000;
    const s = await setup({ analyze: '429', retryAfter: 30 }, () => t);
    await s.service.verify('openai');
    await s.service.probe('openai', 'mock-chat-2');
    const limited = await s.service.analyze(input('mock-chat-2'), 't');
    expect(limited).toMatchObject({ ok: false, failure: 'rate-limit', status: 429, retryAt: t + 30_000 });
    const before = s.openai.requests.length;
    expect(await s.service.analyze(input('mock-chat-2', { requestId: 'again' }), 't')).toMatchObject({ ok: false, failure: 'cooldown', status: null });
    expect(s.openai.requests).toHaveLength(before);
    t += 31_000;
    expect(await s.service.analyze(input('mock-chat-2', { requestId: 'later' }), 't')).toMatchObject({ ok: false, failure: 'rate-limit' });
    expect(s.openai.requests).toHaveLength(before + 1);
    expect(s.anthropic.requests).toHaveLength(0);
  });

  it('رسالة تردّد المفتاح تخرج من الخدمة منقّحة منه', async () => {
    const s = await setup({ models: '401', echoKey: true });
    const r = await s.service.verify('openai');
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain(s.keys.openai);
  });

  it('أعراف الإعدادات: مودل OpenAI في مفتاحه المستقل لا يمس مودل Anthropic', async () => {
    const s = await setup();
    await s.service.verify('openai');
    await s.service.probe('openai', 'mock-chat-2');
    expect((await s.service.status('openai'))?.model?.id).toBe('mock-chat-2');
    await s.settings.set(modelSettingKey('openai'), 'mock-chat-2');
    expect(s.settings.get(modelSettingKey('anthropic'))).toBe('');
    expect((await s.service.status('anthropic'))?.model).toBeNull();
  });
});

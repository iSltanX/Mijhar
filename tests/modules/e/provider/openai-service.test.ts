// خدمة المزوّد مع محوّل OpenAI الحقيقي (MJ24، T-11.11، TEST-AI-07، AC-E11 (٢) و(٣) و(٤)) — محاكاة: Anthropic وOpenAI المدموجان بمضيفيهما الوهميين، وخدمة المزوّد
// وسجل الاتصالات الفعليان بمخزن مستقل لكل مزوّد. تثبت: التحقق، والنموذج المكتوب في الحقل يُرسل إليه التحليل وإن لم يكن في القائمة ولم يُختبر
// (DEC-13 ن-5)، والاختبار الاختياري ونتيجته، والتحليل، وعزل المفتاحين، وأن رفض 401 يوقف إعادة الإرسال بالمفتاح، وموعد إعادة المحاولة يُحترم، ولا
// تحويل ولا إعادة.
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

describe('التحقق والنموذج المكتوب والاختبار الاختياري (DEC-13 ن-5، HYP-22، BLK-MODEL-COMPAT)', () => {
  it('التحقق يقرأ القائمة بمفتاح OpenAI إلى مضيفه وحده؛ ولا تعلن توافقًا فلا اقتراح، والحقل فارغ: لا تحليل ولا يُخمَّن نموذج', async () => {
    const s = await setup();
    const verified = await s.service.verify('openai');
    expect(verified.ok && verified.data.models.map((m) => m.compatibility)).toEqual(['unknown', 'unknown', 'unknown']);
    const status = await s.service.status('openai');
    expect(status).toMatchObject({ model: null, choice: '', test: null, key: { health: 'healthy' } });
    expect(await s.service.analyze(input('mock-chat-2'), 't')).toMatchObject({ ok: false, failure: 'model-changed', status: null });
    expect(s.openai.requests.map((r) => `${r.method} ${new URL(r.url).pathname}`)).toEqual(['GET /v1/models']);
  });

  it('المعرّف المكتوب يُرسل إليه التحليل بلا اختبار، وإن لم يكن في القائمة ولا قُرئت القائمة؛ والطلب الوحيد هو التحليل', async () => {
    const s = await setup();
    await s.settings.set(modelSettingKey('openai'), 'brand-new-model-2027');
    expect((await s.service.status('openai'))?.model).toEqual({ id: 'brand-new-model-2027', displayName: 'brand-new-model-2027' });
    const r = await s.service.analyze(input('brand-new-model-2027'), 't');
    expect(r).toMatchObject({ ok: true, data: { provider: 'OpenAI', host: OPENAI_HOST, model: 'brand-new-model-2027' } });
    expect(s.openai.requests.map((q) => `${q.method} ${new URL(q.url).pathname}`)).toEqual(['POST /v1/responses']);
    expect(JSON.parse(s.openai.requests[0]?.body ?? '{}').model).toBe('brand-new-model-2027');
    for (const q of s.openai.requests) expect(q.headers.authorization).toBe(`Bearer ${s.keys.openai}`);
    expect(s.anthropic.requests).toHaveLength(0);
  });

  it('«اختبر النموذج» بـ«ping» وحده: نتيجته مقرونة بالنموذج والمفتاح، ولا تغيّر الحقل ولا تشترط القائمة؛ ورفض المزوّد «رفض» وحد الطلبات «لم يُحسم»', async () => {
    const s = await setup({ unsupported: ['mock-embed-1'] });
    await s.settings.set(modelSettingKey('openai'), 'mock-chat-2');
    const accepted = await s.service.probe('openai', 'mock-chat-2');
    expect(accepted).toMatchObject({ ok: true, data: { provider: 'openai', model: 'mock-chat-2', verdict: 'accepted', status: 200, message: '' } });
    expect(JSON.parse(s.openai.requests.at(-1)?.body ?? '{}')).toMatchObject({ model: 'mock-chat-2', input: 'ping', store: false });
    expect((await s.service.status('openai'))?.test).toMatchObject({ model: 'mock-chat-2', verdict: 'accepted' });
    // نموذج خارج القائمة (لم تُقرأ أصلًا) يُختبر أيضًا، ورفضه لا يغيّر الحقل ولا يمنع التحليل.
    const rejected = await s.service.probe('openai', 'mock-embed-1');
    expect(rejected).toMatchObject({ ok: true, data: { model: 'mock-embed-1', verdict: 'rejected', status: 400 } });
    expect(s.settings.get(modelSettingKey('openai'))).toBe('mock-chat-2');
    // آخر نتيجة لنموذج آخر لا تُعرض للنموذج المكتوب.
    expect((await s.service.status('openai'))?.test).toBeNull();
    expect((await s.service.analyze(input('mock-chat-2'), 't')).ok).toBe(true);
    // المفتاح استُبدل: لا تنتقل نتيجة اختباره إلى المفتاح الجديد.
    await s.service.probe('openai', 'mock-chat-2');
    expect((await s.service.status('openai'))?.test?.verdict).toBe('accepted');
    await new Promise((r) => setTimeout(r, 2));
    await s.stores.get('openai')?.save(fakeOpenAiKey('N'), 'session');
    expect((await s.service.status('openai'))?.test).toBeNull();
  });

  it('فشل الشبكة أو حد الطلبات في الاختبار «لم يُحسم» لا «رفض»، وبلا مفتاح لا يُرسل شيء ولا نتيجة', async () => {
    const limited = await setup({ probe: '429', retryAfter: 20 });
    expect(await limited.service.probe('openai', 'mock-chat-2')).toMatchObject({ ok: true, data: { verdict: 'inconclusive', status: 429 } });
    expect(await limited.service.probe('openai', 'mock-chat-2')).toMatchObject({ ok: false, failure: 'cooldown', status: null });
    const down = await setup({ probe: '503' });
    expect(await down.service.probe('openai', 'mock-chat-2')).toMatchObject({ ok: true, data: { verdict: 'inconclusive', status: 503 } });
    const nokey = await setup();
    await nokey.stores.get('openai')?.clear();
    expect(await nokey.service.probe('openai', 'mock-chat-2')).toMatchObject({ ok: false, failure: 'no-key', status: null });
    expect(nokey.openai.requests).toHaveLength(0);
    expect(await nokey.service.probe('openai', 'not a model')).toMatchObject({ ok: false, failure: 'invalid-request' });
  });
});

describe('عزل المفتاحين والوجهة', () => {
  it('مفتاح OpenAI إلى api.openai.com وحده، ومفتاح Anthropic إلى مضيفه وحده؛ ولا رمز GitHub في أي طلب', async () => {
    const s = await setup();
    await s.service.verify('openai');
    await s.service.verify('anthropic');
    await s.service.probe('openai', 'mock-chat-2');
    await s.settings.set(modelSettingKey('openai'), 'mock-chat-2');
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
    await s.settings.set(modelSettingKey('openai'), 'mock-chat-2');
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
    await s.settings.set(modelSettingKey('openai'), 'mock-chat-2');
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
    await s.settings.set(modelSettingKey('openai'), 'mock-chat-2');
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

  it('أعراف الإعدادات: نموذج OpenAI في مفتاحه المستقل لا يمس نموذج Anthropic', async () => {
    const s = await setup();
    await s.service.verify('openai');
    await s.settings.set(modelSettingKey('openai'), 'mock-chat-2');
    expect((await s.service.status('openai'))?.model?.id).toBe('mock-chat-2');
    expect(s.settings.get(modelSettingKey('anthropic'))).toBe('');
    expect((await s.service.status('anthropic'))?.model).toBeNull();
  });
});

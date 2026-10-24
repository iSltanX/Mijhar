// محوّل Google Gemini (MJ25، T-11.12، AC-E12، TEST-AI-08) — **محاكاة**: مضيف generativelanguage.googleapis.com الوهمي (geminiMock) بأشكال الردود المقيسة والمعلنة،
// بلا شبكة ولا مفتاح حقيقي. الاتصال الحقيقي (TEST-AI-09) لا يُسجَّل هنا ولا يُدّعى.
//  - المفتاح في ترويسة x-goog-api-key لا في العنوان ولا الجسم، إلى مضيف Gemini وحده، بلا ملفات تعريف ارتباط، ولا يحمل طلب رمز GitHub ولا مفتاح مزوّد آخر.
//  - التحقق بطلب معلن واحد بلا محتوى؛ والمودلات بسياسة DEC-13 (supportedGenerationMethods) مع الحدّين المعلنين؛ ولا أسماء مودلات في الشيفرة.
//  - تصنيف كل صنف خطأ بنص عربي منقّح من المفتاح، وموعد إعادة المحاولة المعلن، ولا إعادة تلقائية ولا تحويل إلى مزوّد آخر.
//  - حجب الأمان الذي يعلنه الرد يُعرض سببًا واضحًا لا تحليلًا، ولا يُعاد الطلب.
import { describe, expect, it } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../../../src/core';
import { SecretStore } from '../../../../src/core/connections/secrets';
import { ConnectionsService, memoryHealthLog } from '../../../../src/core/connections/service';
import { PROVIDER_ID_KEY, PROVIDER_DESCRIPTORS, defineProviderSettings, modelSettingKey } from '../../../../src/modules/e/provider';
import { GEMINI_ADAPTER } from '../../../../src/modules/e/provider/adapters/gemini';
import { checkKey, descriptorById } from '../../../../src/modules/e/provider/catalog';
import { GEMINI } from '../../../../src/modules/e/provider/descriptors/gemini';
import { ProviderKeyMismatchError, bindKey, gatedFetch } from '../../../../src/modules/e/provider/gate';
import { defaultModel, listedModels } from '../../../../src/modules/e/provider/models';
import { parseAnalysis } from '../../../../src/modules/e/provider/result';
import { PROVIDER_ADAPTERS, createProviderRegistry } from '../../../../src/modules/e/provider/registry';
import { ProviderService, memoryModelsCache } from '../../../../src/modules/e/provider/service';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { memoryArea } from '../../d/token/helpers';
import { GEMINI_HOST, GEMINI_MOCK_MODELS, fakeGeminiAqKey, fakeGeminiKey, fakeKey, geminiMock, providerMock } from './fixture-provider-mock';
import type { GeminiScenario } from './fixture-provider-mock';

const KEY = fakeGeminiKey('U');
const NOW = 1_800_000_000_000;
const ARABIC = /[؀-ۿ]/;

function setup(scenario: GeminiScenario = {}, granted = true) {
  const mock = geminiMock(scenario);
  const permissions = fakePermissions(granted ? [GEMINI.origin] : []);
  return { mock, permissions, c: { key: KEY, fetch: gatedFetch(GEMINI, { permissions, fetch: mock.fetch }), now: () => NOW } };
}
const REQUEST = { model: 'mock-gem-2', system: 'تعليمات', prompt: 'error TS2322: النوع غير متوافق', maxTokens: 4096 };

describe('الوصف وصيغة المفتاح (AC-E12 (٤))', () => {
  it('مضيف Gemini وصلاحيته الاختيارية وسياسته الرسمية وطلب التحقق المعلن بلا اسم ترويسة ولا مفتاح', () => {
    expect(GEMINI).toMatchObject({ id: 'gemini', host: GEMINI_HOST, origin: `https://${GEMINI_HOST}/*` });
    expect(GEMINI.policy.url).toBe('https://ai.google.dev/gemini-api/terms');
    expect(GEMINI.policy.readOn).toBe('2026-10-24');
    expect(GEMINI.verifyRequest).toContain(`GET https://${GEMINI_HOST}/v1beta/models`);
    expect(GEMINI.verifyRequest).not.toMatch(/x-goog-api-key|AIza/);
    // DEC-13 ن-4: للفحص الصريح طلب معلن: POST بنص ثابت «ping» وحده بلا محتوى، بلا اسم ترويسة ولا مفتاح ولا مسار المودلات (علامات المحوّل).
    expect(GEMINI.probeRequest).toContain('POST');
    expect(GEMINI.probeRequest).toContain('«ping» وحده');
    expect(GEMINI.probeRequest).toContain('لا يحمل شيئًا من صفحاتك');
    expect(GEMINI.probeRequest).not.toMatch(/x-goog-api-key|AIza|\/v1beta\/models\//);
  });

  it('يقبل صيغة مفتاح Google API ويرفض الفارغ وغيرها من مفاتيح المزوّدين والرموز، بلا إرسال', () => {
    expect(checkKey(GEMINI, `  ${KEY}  `)).toEqual({ ok: true, key: KEY });
    expect(KEY).toMatch(/^AIza[A-Za-z0-9_-]{35}$/);
    // الصيغة الجديدة التي يصدرها AI Studio (AQ. ثم نحو 50 حرفًا): رُصدت على مفتاح المالك التجريبي فرُفضت محليًا قبل أن تُصلَح.
    const aq = fakeGeminiAqKey('U');
    expect(aq).toMatch(/^AQ\.[A-Za-z0-9_-]{50}$/);
    expect(checkKey(GEMINI, `\n${aq}\n`)).toEqual({ ok: true, key: aq });
    expect(checkKey(GEMINI, 'AQ.short')).toMatchObject({ ok: false });
    expect(checkKey(GEMINI, '')).toMatchObject({ ok: false });
    expect(checkKey(GEMINI, fakeKey('X'))).toMatchObject({ ok: false, reason: expect.stringContaining('AQ') });
    expect(checkKey(GEMINI, 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toMatchObject({ ok: false });
    expect(checkKey(GEMINI, KEY.slice(0, 20))).toMatchObject({ ok: false });
  });

  it('السجلان متطابقان: لـGemini وصف ومحوّل بالوصف نفسه، وبمعرّف ومضيف لا يتكرران', () => {
    expect(descriptorById('gemini')).toBe(GEMINI);
    expect(PROVIDER_ADAPTERS.find((a) => a.descriptor.id === 'gemini')?.descriptor).toBe(GEMINI);
    expect(PROVIDER_DESCRIPTORS.map((d) => d.id)).toEqual(PROVIDER_ADAPTERS.map((a) => a.descriptor.id));
    expect(() => createProviderRegistry(PROVIDER_ADAPTERS)).not.toThrow();
    expect(bindKey(GEMINI, { provider: 'gemini', token: KEY })).toBe(KEY);
    expect(() => bindKey(GEMINI, { provider: 'anthropic', token: fakeKey('Z') })).toThrow(ProviderKeyMismatchError);
  });
});

describe('التحقق وقراءة المودلات (DEC-13 ن-3)', () => {
  it('طلب واحد GET بلا جسم: المفتاح في ترويسة x-goog-api-key لا في العنوان، إلى مضيف Gemini وحده، بلا ملفات تعريف ارتباط', async () => {
    const { mock, c } = setup();
    const r = await GEMINI_ADAPTER.listModels(c);
    expect(r.ok).toBe(true);
    expect(mock.requests).toHaveLength(1);
    const [sent] = mock.requests;
    expect(sent).toMatchObject({ method: 'GET', host: GEMINI_HOST, path: '/v1beta/models', search: '?pageSize=1000', body: null, credentials: 'omit' });
    expect(sent?.headers['x-goog-api-key']).toBe(KEY);
    expect(sent?.url).not.toContain(KEY);
    expect(JSON.stringify(sent)).not.toMatch(/authorization|x-api-key/i);
    expect(sent?.search).not.toMatch(/key=/);
  });

  it('المرشَّح ما أعلن supportedGenerationMethods أنه يدعم التوليد وحده، بالحدّين المعلنين، ومعرّفه بلا بادئة models/؛ والإعلان لا يضمن توافره للمفتاح فلا اقتراح (DEC-13 ن-5)؛ وما لم يعلن طرقه لا يُخمَّن', async () => {
    const { c } = setup();
    const r = await GEMINI_ADAPTER.listModels(c);
    expect(r.ok && r.data.models.map((m) => [m.id, m.displayName, m.maxInputTokens, m.maxTokens, m.compatibility, m.lifecycle])).toEqual([
      ['mock-gem-2', 'Mock Gem 2', 1048576, 65536, 'unknown', null],
      ['mock-gem-flash', 'Mock Gem Flash', 131072, 8192, 'unknown', null],
    ]);
    if (r.ok) {
      expect(r.data).toMatchObject({ provider: 'gemini', source: `https://${GEMINI_HOST}/v1beta/models`, partial: false, readAt: NOW });
      // لا اقتراح في الحقل الفارغ (BLK-MODEL-COMPAT حتى يُكتب معرّف)؛ والمرشَّحان يُعرضان بزر + للمساعدة.
      expect(defaultModel(r.data)).toBeNull();
      expect(listedModels(r.data).map((m) => m.id)).toEqual(['mock-gem-2', 'mock-gem-flash']);
    }
    expect(GEMINI_MOCK_MODELS.length).toBeGreaterThan(2);
  });

  it('صفحة أخرى معلنة (nextPageToken) تُعلن قائمةً جزئية ولا يُطلب غير الطلب المعلن', async () => {
    const { mock, c } = setup({ nextPage: true });
    const r = await GEMINI_ADAPTER.listModels(c);
    expect(r.ok && r.data.partial).toBe(true);
    expect(mock.requests).toHaveLength(1);
  });

  it('بلا صلاحية المضيف: فشل «permission» ولا طلب', async () => {
    const { mock, c } = setup({}, false);
    expect(await GEMINI_ADAPTER.listModels(c)).toMatchObject({ ok: false, failure: 'permission', status: null });
    expect(mock.requests).toHaveLength(0);
  });
});

describe('الفحص الصريح للمودل (DEC-13 ن-4)', () => {
  const probeOf = (r: { requests: Array<{ method: string; body: string | null }> }) => r.requests.filter((x) => x.method === 'POST');

  it('طلب واحد POST إلى نقطة generateContent للمودل بنص «ping» وحده بلا تعليمات نظام ولا محتوى، والمفتاح في الترويسة وحدها', async () => {
    const { mock, c } = setup();
    const r = await GEMINI_ADAPTER.probe?.(c, 'mock-gem-2');
    expect(r).toMatchObject({ ok: true, status: 200, data: true });
    expect(mock.requests).toHaveLength(1);
    const [sent] = mock.requests;
    expect(sent).toMatchObject({ method: 'POST', host: GEMINI_HOST, path: '/v1beta/models/mock-gem-2:generateContent', search: '', credentials: 'omit' });
    expect(sent?.headers['x-goog-api-key']).toBe(KEY);
    expect(sent?.url).not.toContain(KEY);
    expect(JSON.parse(sent?.body ?? '{}')).toEqual({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 64 } });
  });

  it('مودل أعلنته القائمة ورُدّ عليه 404 «لم يعد متاحًا للمستخدمين الجدد» لا يثبت توافقه: فشل «not-found» بنص عربي بلا مفتاح، وطلب واحد', async () => {
    const { mock, c } = setup({ probeFails: ['mock-gem-2'], echoKey: true });
    const r = await GEMINI_ADAPTER.probe?.(c, 'mock-gem-2');
    expect(r).toMatchObject({ ok: false, failure: 'not-found', status: 404 });
    if (r && !r.ok) {
      expect(r.message).toMatch(ARABIC);
      expect(r.message).toContain('no longer available');
      expect(r.message).not.toContain(KEY);
    }
    expect(probeOf(mock)).toHaveLength(1);
  });

  it.each(['rate-limit', 'unavailable', 'forbidden', 'bad-key', 'prompt-blocked'] as const)('%s لا يثبت التوافق، وطلب واحد بلا إعادة', async (outcome) => {
    const { mock, c } = setup({ probe: outcome, retryAfter: 5 });
    const r = await GEMINI_ADAPTER.probe?.(c, 'mock-gem-2');
    expect(r?.ok).toBe(false);
    expect(mock.requests).toHaveLength(1);
  });

  it('بلا صلاحية المضيف: «permission» ولا طلب', async () => {
    const { mock, c } = setup({}, false);
    expect(await GEMINI_ADAPTER.probe?.(c, 'mock-gem-2')).toMatchObject({ ok: false, failure: 'permission' });
    expect(mock.requests).toHaveLength(0);
  });
});

describe('التحليل', () => {
  it('POST إلى نقطة generateContent للمودل بنص المستخدم وتعليمات النظام وحد المخرجات، والمفتاح في الترويسة وحدها', async () => {
    const { mock, c } = setup();
    const r = await GEMINI_ADAPTER.analyze(c, REQUEST);
    expect(r.ok).toBe(true);
    const [sent] = mock.requests;
    expect(sent).toMatchObject({ method: 'POST', host: GEMINI_HOST, path: '/v1beta/models/mock-gem-2:generateContent', search: '', credentials: 'omit' });
    expect(sent?.headers['x-goog-api-key']).toBe(KEY);
    expect(sent?.headers['content-type']).toBe('application/json');
    expect(sent?.url).not.toContain(KEY);
    expect(sent?.body).not.toContain(KEY);
    expect(JSON.parse(sent?.body ?? '{}')).toEqual({
      systemInstruction: { parts: [{ text: REQUEST.system }] },
      contents: [{ role: 'user', parts: [{ text: REQUEST.prompt }] }],
      generationConfig: { maxOutputTokens: 4096 },
    });
  });

  it('معرّف المودل يُرمَّز في المسار فلا يخرج الطلب من نقطة المودلات ولا من المضيف', async () => {
    const { mock, c } = setup();
    await GEMINI_ADAPTER.analyze(c, { ...REQUEST, model: '../v1/other?x=1' });
    expect(mock.requests.every((x) => x.host === GEMINI_HOST && x.path.startsWith('/v1beta/models/') && x.search === '')).toBe(true);
  });

  it('الرد: النص والمودل (modelVersion) وسبب التوقف والأعداد المعلنة (لا تكلفة)، ويُفسَّر إلى عقد العرض بالدليل الحرفي والاحتمال والناقص', async () => {
    const { c } = setup();
    const r = await GEMINI_ADAPTER.analyze(c, REQUEST);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({ model: 'mock-gem-2-001', stopReason: 'end_turn', usage: { input: 1200, output: 180 } });
    expect(JSON.stringify(r.data)).not.toMatch(/cost|price|usd|تكلف|سعر/i);
    const parsed = parseAnalysis(r.data.text, REQUEST.prompt, r.data.stopReason);
    expect(parsed.structured).toBe(true);
    expect(parsed.findings[0]?.evidence.map((e) => e.found)).toEqual([true, false]);
    expect(parsed.missing).toEqual(['لم يُرسل السجل كاملًا.']);
    expect(parsed.cut).toBe(false);
  });

  it('MAX_TOKENS يُعلن قطعًا (max_tokens)، وأجزاء «التفكير» لا تدخل نص التحليل', async () => {
    const cut = await GEMINI_ADAPTER.analyze(setup({ analyze: 'max-tokens' }).c, REQUEST);
    expect(cut.ok && cut.data.stopReason).toBe('max_tokens');
    if (cut.ok) expect(parseAnalysis(cut.data.text, REQUEST.prompt, cut.data.stopReason).cut).toBe(true);
    const thought = await GEMINI_ADAPTER.analyze(setup({ analyze: 'thinking' }).c, REQUEST);
    expect(thought.ok && thought.data.text).not.toContain('تفكير داخلي');
    expect(thought.ok && thought.data.text).toContain('summary');
  });

  it('MAX_TOKENS قبل أي نص (التفكير استهلك الحد): فشل بسببه لا تحليل فارغ، وطلب واحد', async () => {
    const { mock, c } = setup({ analyze: 'max-empty' });
    const r = await GEMINI_ADAPTER.analyze(c, REQUEST);
    expect(r).toMatchObject({ ok: false, failure: 'invalid', status: 200 });
    expect(!r.ok && r.message).toContain('MAX_TOKENS');
    expect(!r.ok && r.message).toMatch(ARABIC);
    expect(mock.requests).toHaveLength(1);
  });

  it('المفتاح الذي يردّده الرد يُنقّح من نصه', async () => {
    const { c } = setup({ reply: () => `المفتاح هو ${KEY}` });
    const r = await GEMINI_ADAPTER.analyze(c, REQUEST);
    expect(r.ok && r.data.text).not.toContain(KEY);
    expect(r.ok && r.data.text).toContain('‹المفتاح›');
  });
});

describe('تصنيف الأخطاء بنص عربي منقّح (AC-E12 (٢))', () => {
  it.each([
    ['bad-key', 'unauthorized', 400, 'API_KEY_INVALID'],
    ['forbidden', 'forbidden', 403, 'HTTP 403'],
    ['precondition', 'forbidden', 400, 'HTTP 400'],
    ['not-found', 'not-found', 404, 'HTTP 404'],
    ['too-large', 'too-large', 400, 'HTTP 400'],
    ['invalid', 'invalid', 400, 'HTTP 400'],
    ['unavailable', 'overloaded', 503, 'HTTP 503'],
  ] as const)('%s ← %s (رمز %i)', async (outcome, failure, status, tag) => {
    const { c } = setup({ analyze: outcome, verify: outcome, echoKey: true });
    for (const r of [await GEMINI_ADAPTER.analyze(c, REQUEST), await GEMINI_ADAPTER.listModels(c)]) {
      expect(r).toMatchObject({ ok: false, failure, status, retryAt: null });
      if (r.ok) continue;
      expect(r.message).toMatch(ARABIC);
      expect(r.message).toContain(tag);
      expect(r.message).not.toContain(KEY);
      expect(r.message).toContain('‹المفتاح›');
    }
  });

  it('مفتاح غير صالح عند Gemini رمزه 400 لا 401 (كما قِيس): يُصنَّف «مفتاح مرفوض» بسبب API_KEY_INVALID لا «طلب غير صالح»', async () => {
    const r = await GEMINI_ADAPTER.listModels(setup({ verify: 'bad-key' }).c);
    expect(r).toMatchObject({ ok: false, failure: 'unauthorized', status: 400 });
  });

  it('429 بموعد retry-after المعلن؛ وبمدة RetryInfo حين لا تُرسل الترويسة؛ وبلا أيٍّ منهما null', async () => {
    const header = await GEMINI_ADAPTER.analyze(setup({ analyze: 'rate-limit', retryAfter: 20 }).c, REQUEST);
    expect(header).toMatchObject({ ok: false, failure: 'rate-limit', status: 429, retryAt: NOW + 20_000 });
    const info = await GEMINI_ADAPTER.analyze(setup({ analyze: 'rate-limit', retryDelay: '27.5s' }).c, REQUEST);
    expect(info).toMatchObject({ ok: false, failure: 'rate-limit', retryAt: NOW + 27_500 });
    const none = await GEMINI_ADAPTER.analyze(setup({ analyze: 'rate-limit' }).c, REQUEST);
    expect(none).toMatchObject({ ok: false, failure: 'rate-limit', retryAt: null });
  });

  it('انقطاع الشبكة: فشل «network» بنص عربي ولا مفتاح فيه؛ وإيقاف الطلب: «aborted»', async () => {
    const down = await GEMINI_ADAPTER.analyze(setup({ networkError: true }).c, REQUEST);
    expect(down).toMatchObject({ ok: false, failure: 'network', status: null });
    if (!down.ok) {
      expect(down.message).toMatch(ARABIC);
      expect(down.message).not.toContain(KEY);
    }
    const { c } = setup({ delayMs: 5000 });
    const controller = new AbortController();
    const pending = GEMINI_ADAPTER.analyze({ ...c, signal: controller.signal }, REQUEST);
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, failure: 'aborted' });
  });

  it('ردّ غير متوقع (بلا candidates ولا حجب) فشل «http» لا تحليل', async () => {
    const odd = { fetch: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch };
    const c = { key: KEY, fetch: gatedFetch(GEMINI, { permissions: fakePermissions([GEMINI.origin]), fetch: odd.fetch }), now: () => NOW };
    expect(await GEMINI_ADAPTER.analyze(c, REQUEST)).toMatchObject({ ok: false, failure: 'http' });
  });

  it('لا إعادة تلقائية ولا تحويل: كل فشل طلب واحد إلى مضيف Gemini وحده', async () => {
    for (const outcome of ['bad-key', 'rate-limit', 'unavailable', 'prompt-blocked', 'reply-blocked'] as const) {
      const { mock, c } = setup({ analyze: outcome });
      await GEMINI_ADAPTER.analyze(c, REQUEST);
      expect(mock.requests, outcome).toHaveLength(1);
      expect(mock.requests.every((x) => x.host === GEMINI_HOST)).toBe(true);
    }
  });
});

describe('حجب الأمان الذي يعلنه الرد: سبب واضح لا تحليل', () => {
  it('promptFeedback.blockReason: فشل بسببه وبنص عربي، ولا يُعاد الطلب', async () => {
    const { mock, c } = setup({ analyze: 'prompt-blocked' });
    const r = await GEMINI_ADAPTER.analyze(c, REQUEST);
    expect(r).toMatchObject({ ok: false, failure: 'invalid', status: 200, retryAt: null });
    if (!r.ok) {
      expect(r.message).toMatch(ARABIC);
      expect(r.message).toContain('SAFETY');
      expect(r.message).toContain('حجبت Google');
      expect(r.message).toContain('لم يُعد مِجهَر الطلب');
    }
    expect(mock.requests).toHaveLength(1);
  });

  it('finishReason أمني: فشل بسببه ولو حمل الرد نصًّا مقطوعًا (لا يُعرض كتحليل)', async () => {
    const r = await GEMINI_ADAPTER.analyze(setup({ analyze: 'reply-blocked' }).c, REQUEST);
    expect(r).toMatchObject({ ok: false, failure: 'invalid' });
    expect(!r.ok && r.message).toContain('قواعد الأمان');
    expect(JSON.stringify(r)).not.toContain('مقطوع');
  });

  it('انتهاء بلا نص لسبب غير أمني: فشل واضح لا تحليل فارغ', async () => {
    const r = await GEMINI_ADAPTER.analyze(setup({ analyze: 'empty' }).c, REQUEST);
    expect(r).toMatchObject({ ok: false, failure: 'http' });
    expect(!r.ok && r.message).toContain('OTHER');
  });
});

describe('الخدمة الفعلية بمحوّل Gemini المشحون (محاكاة): العزل والموافقة وعدم التحويل', () => {
  async function system(scenario: GeminiScenario = {}) {
    const registry = createProviderRegistry(PROVIDER_ADAPTERS);
    const descriptors = registry.list.map((a) => a.descriptor);
    const area = new MemoryStorageArea();
    const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r, descriptors)));
    const stores = new Map<string, SecretStore>(descriptors.map((d) => [d.id, new SecretStore({ session: memoryArea(), disk: memoryArea() })]));
    const anthropicKey = fakeKey('G');
    await stores.get('gemini')?.save(KEY, 'session');
    await stores.get('anthropic')?.save(anthropicKey, 'session');
    await settings.set(PROVIDER_ID_KEY, 'gemini');
    const gemini = geminiMock(scenario);
    const anthropic = providerMock();
    const fetch = (async (input: string | URL | Request, init?: RequestInit) => (new URL(String(input)).host === GEMINI_HOST ? gemini.fetch(input, init) : anthropic.fetch(input, init))) as typeof globalThis.fetch;
    const connections = new ConnectionsService({
      stores: {},
      providerKeys: { selected: async () => settings.get<string>(PROVIDER_ID_KEY), store: (id) => stores.get(id) ?? null },
      log: memoryHealthLog(),
      fixable: [],
    });
    let clock = NOW;
    const service = new ProviderService({
      registry,
      keys: (id) => stores.get(id) ?? null,
      permissions: fakePermissions(descriptors.map((d) => d.origin)),
      fetch,
      connections: { keyStatus: (p) => connections.keyStatus(p), observe: (id, v, p) => connections.observe(id, v, p) },
      settings: async () => settings,
      cache: memoryModelsCache(),
      now: () => clock,
    });
    return { service, settings, stores, gemini, anthropic, anthropicKey, tick: (ms: number) => void (clock += ms) };
  }
  /** الخدمة تقيّد طلبًا واحدًا جاريًا لكل تبويب وقسم؛ فكل الطلبات هنا من تبويب واحد. */
  const analyzeIn = (s: { service: ProviderService }, request: ReturnType<typeof input>) => s.service.analyze(request, 'tab-1');
  /** طلبات التحليل وحدها (الفحص الصريح POST أيضًا لكن بنص «ping» وحده). */
  const analyses = (s: { gemini: { requests: Array<{ method: string; path: string; body: string | null }> } }) => s.gemini.requests.filter((x) => x.method === 'POST' && !/"text":"ping"/.test(x.body ?? ''));
  /** التحقق ثم كتابة معرّف النموذج في حقله (DEC-13 ن-5): لا اختبار مشروط. */
  const ready = async (s: Awaited<ReturnType<typeof system>>, model = 'mock-gem-2') => {
    await s.service.verify('gemini');
    await s.settings.set(modelSettingKey('gemini'), model);
  };
  const input = (model: string) => ({ requestId: 'r1', section: 'checks', provider: 'gemini', model, system: 'تعليمات', prompt: 'error TS2322: x' });

  it('التحقق ثم التحليل بالمعرّف المكتوب بلا اختبار: كل شيء إلى مضيف Gemini بمفتاحه وحده، ولا طلب إلى Anthropic ولا مفتاحه في أي طلب', async () => {
    const s = await system();
    const verified = await s.service.verify('gemini');
    expect(verified.ok && verified.data.models.map((m) => [m.id, m.compatibility])).toEqual([['mock-gem-2', 'unknown'], ['mock-gem-flash', 'unknown']]);
    // الحقل فارغ ولا اقتراح: لا تحليل.
    expect((await s.service.status('gemini'))?.model).toBeNull();
    expect(await analyzeIn(s, input('mock-gem-2'))).toMatchObject({ ok: false, failure: 'model-changed' });
    expect(analyses(s)).toHaveLength(0);
    await s.settings.set(modelSettingKey('gemini'), 'mock-gem-2');
    const status = await s.service.status('gemini');
    expect(status?.model).toEqual({ id: 'mock-gem-2', displayName: 'Mock Gem 2' });
    expect(status?.provider.host).toBe(GEMINI_HOST);
    const result = await analyzeIn(s, input('mock-gem-2'));
    expect(result).toMatchObject({ ok: true, data: { provider: 'Google Gemini', host: GEMINI_HOST, model: 'mock-gem-2-001' } });
    expect(s.gemini.requests.map((r) => `${r.method} ${r.path}${r.search}`)).toEqual(['GET /v1beta/models?pageSize=1000', 'POST /v1beta/models/mock-gem-2:generateContent']);
    expect(s.gemini.requests[1]?.body).toContain('error TS2322');
    // الاختبار الاختياري بعده: «ping» وحده بلا شيء من المحتوى.
    expect(await s.service.probe('gemini', 'mock-gem-2')).toMatchObject({ ok: true, data: { verdict: 'accepted', status: 200 } });
    expect(s.gemini.requests[2]?.body).toBe(JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ping' }] }], generationConfig: { maxOutputTokens: 64 } }));
    expect(s.gemini.requests.every((r) => r.headers['x-goog-api-key'] === KEY && !r.url.includes(KEY))).toBe(true);
    expect(s.anthropic.requests).toHaveLength(0);
    expect(JSON.stringify(s.gemini.requests)).not.toContain(s.anthropicKey);
  });

  it('معرّف خارج القائمة (مودل التضمين) يُرسل إليه ما دام في الحقل، وطلب الموافقة لنموذج غير الذي في الحقل لا يُرسل', async () => {
    const s = await system();
    await ready(s);
    expect(await analyzeIn(s, input('mock-gem-embed'))).toMatchObject({ ok: false, failure: 'model-changed' });
    expect(analyses(s)).toHaveLength(0);
    await s.settings.set(modelSettingKey('gemini'), 'mock-gem-embed');
    await analyzeIn(s, input('mock-gem-embed'));
    expect(analyses(s).map((r) => r.path)).toEqual(['/v1beta/models/mock-gem-embed:generateContent']);
  });

  it('حد الطلبات بموعده المعلن يمنع الطلب التالي حتى يحل الموعد، ولا إعادة تلقائية', async () => {
    const s = await system({ analyze: 'rate-limit', retryAfter: 30 });
    await ready(s);
    const first = await analyzeIn(s, input('mock-gem-2'));
    expect(first).toMatchObject({ ok: false, failure: 'rate-limit', retryAt: NOW + 30_000 });
    const second = await analyzeIn(s, { ...input('mock-gem-2'), requestId: 'r2' });
    expect(second).toMatchObject({ ok: false, failure: 'cooldown' });
    expect(analyses(s)).toHaveLength(1);
    s.tick(31_000);
    await analyzeIn(s, { ...input('mock-gem-2'), requestId: 'r3' });
    expect(analyses(s)).toHaveLength(2);
  });

  it('حجب الأمان فشل بسببه عبر الخدمة، وطلب واحد، ولا مزوّد آخر', async () => {
    const s = await system({ analyze: 'prompt-blocked' });
    await ready(s);
    const r = await analyzeIn(s, input('mock-gem-2'));
    expect(r).toMatchObject({ ok: false, failure: 'invalid' });
    expect(analyses(s)).toHaveLength(1);
    expect(s.anthropic.requests).toHaveLength(0);
  });

  it('اختبار فاشل (404 «لم يعد متاحًا») «رفض» لا يغيّر الحقل ولا يمنع التحليل؛ والتحليل به يُرسل مرة واحدة ويعرض رفض Google بلا تبديل نموذج ولا إعادة', async () => {
    const s = await system({ probeFails: ['mock-gem-2'] });
    await ready(s);
    const failed = await s.service.probe('gemini', 'mock-gem-2');
    expect(failed).toMatchObject({ ok: true, data: { model: 'mock-gem-2', verdict: 'rejected', status: 404 } });
    expect(failed.ok && failed.data.message).toContain('no longer available');
    expect((await s.service.status('gemini'))?.model?.id).toBe('mock-gem-2');
    const r = await analyzeIn(s, input('mock-gem-2'));
    expect(r).toMatchObject({ ok: false, failure: 'not-found', status: 404 });
    expect(analyses(s).map((x) => x.path)).toEqual(['/v1beta/models/mock-gem-2:generateContent']);
    await new Promise((done) => setTimeout(done, 20));
    expect(analyses(s)).toHaveLength(1);
    expect((await s.service.status('gemini'))?.model?.id).toBe('mock-gem-2');
    expect(s.anthropic.requests).toHaveLength(0);
  });

  it('نتيجة الاختبار تبقى بعد إعادة التحقق للنموذج والمفتاح نفسيهما، ويُختبر معرّف خارج القائمة', async () => {
    const s = await system();
    await ready(s);
    await s.service.probe('gemini', 'mock-gem-2');
    await s.service.verify('gemini');
    expect((await s.service.status('gemini'))?.test).toMatchObject({ model: 'mock-gem-2', verdict: 'accepted' });
    expect(await s.service.probe('gemini', 'mock-gem-embed')).toMatchObject({ ok: true, data: { model: 'mock-gem-embed' } });
    expect((await s.service.status('gemini'))?.test).toBeNull();
  });

  it('حد الطلبات في الاختبار «لم يُحسم» لا رفض، وموعده يمنع اختبارًا آخر حتى يحل، ولا إعادة تلقائية', async () => {
    const s = await system({ probe: 'rate-limit', retryAfter: 30 });
    await s.service.verify('gemini');
    expect(await s.service.probe('gemini', 'mock-gem-2')).toMatchObject({ ok: true, data: { verdict: 'inconclusive', status: 429 } });
    expect(await s.service.probe('gemini', 'mock-gem-flash')).toMatchObject({ ok: false, failure: 'cooldown' });
    expect(s.gemini.requests.filter((x) => x.method === 'POST')).toHaveLength(1);
  });

  it('مفتاح Gemini المرفوض لا يمسح مفتاح Anthropic ولا يحوّل إليه', async () => {
    const s = await system({ verify: 'bad-key' });
    const r = await s.service.verify('gemini');
    expect(r).toMatchObject({ ok: false, failure: 'unauthorized' });
    expect(s.anthropic.requests).toHaveLength(0);
    expect((await s.service.status('anthropic'))?.key?.place).toBe('session');
  });
});

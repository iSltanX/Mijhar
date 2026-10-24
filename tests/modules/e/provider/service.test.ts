// @vitest-environment jsdom
// TEST-AI-01 وTEST-PRIV-04 على مستوى التكامل (AC-E9 (١) و(٢) و(٣) و(٤)): الخلفية الفعلية برمز GitHub ومفتاح مزوّد محفوظين معًا، وfetch وهمي لكلٍّ منهما
// (fixture-provider-mock)، فيُعدّ كل طلب خرج ويُفحص عنوانه وترويساته وجسمه. وتدقيق الشبكة في المتصفحات المبنية في provider-check.mjs.
//  - إضافة المفتاح لا تبدأ أي تحليل: لا طلب إلا التحقق المعلن (قائمة المودلات)، وstatus لا يطلب شيئًا.
//  - طلب التحليل واحد لكل رسالة، إلى api.anthropic.com وحده، بالمفتاح وحده (لا رمز GitHub في ترويسة ولا جسم)، ولا مفتاح في أي رد ولا رسالة خطأ.
//  - حدود المزوّد التقنية تُحترم: موعد إعادة المحاولة المعلن، ومفتاح رفضه المزوّد، وطلب جارٍ من القسم نفسه؛ ولا حد إنفاق من الإضافة (AD-31).
//  - المودلات من المزوّد وقت التشغيل بمصدرها ووقتها، والافتراضي أول متوافق نشط من القائمة نفسها (بلا اسم ولا فئة)، والمتقاعد لا يُعرض.
// وتعدد المزوّدين بمحوّلين وهميين في multi-provider.test.ts.
import { describe, expect, it, vi } from 'vitest';
import type { AnalyzeInput } from '../../../../src/modules/e/provider';
import { ANTHROPIC_ORIGIN, GITHUB_ORIGIN, providerSystem } from './helpers';

const input = (over: Partial<AnalyzeInput> = {}): AnalyzeInput => ({
  requestId: over.requestId ?? 'r1',
  section: 'checks',
  provider: 'anthropic',
  model: 'mock-sonnet-2',
  system: 'تعليمات صيغة الرد',
  prompt: '# تشخيص الخطأ\n\n## مقتطف الخطأ\n\nerror TS2322: Type string is not assignable to type number\n',
  ...over,
});

const allText = (value: unknown): string => JSON.stringify(value);

describe('AC-E9 (١): إضافة المفتاح لا تبدأ تحليلًا، والطلب الوحيد بعدها التحقق المعلن', () => {
  it('الحالة لا تطلب شيئًا؛ والتحقق طلب واحد GET /v1/models بالمفتاح وحده إلى api.anthropic.com، وصحته «سليم» من الاستجابة', async () => {
    const s = await providerSystem();
    const before = await s.tab().status();
    expect(s.provider.requests).toHaveLength(0);
    expect(before?.provider).toMatchObject({ id: 'anthropic', host: 'api.anthropic.com' });
    expect(before?.model).toBeNull();
    expect(before?.key?.health).toBe('unverified');

    const verified = await s.options.verify('anthropic');
    expect(verified.ok).toBe(true);
    expect(s.provider.requests).toHaveLength(1);
    const [req] = s.provider.requests;
    expect(req?.method).toBe('GET');
    expect(req?.url).toBe('https://api.anthropic.com/v1/models?limit=100');
    expect(req?.headers['x-api-key']).toBe(s.key);
    expect(req?.headers['anthropic-version']).toBe('2023-06-01');
    expect(req?.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(req?.headers.authorization).toBeUndefined();
    expect(req?.credentials).toBe('omit');
    expect(allText(req)).not.toContain(s.token);
    expect(req?.body).toBeNull();

    const after = await s.tab().status();
    expect(after?.key?.health).toBe('healthy');
    expect(s.provider.requests).toHaveLength(1);
    expect(s.github.some((g) => allText(g).includes(s.key))).toBe(false);
  });

  it('AC-E9 (٣): المودلات من المزوّد وقت التشغيل بمصدرها ووقتها، والمتقاعد لا يُعرض، والافتراضي أول متوافق نشط في القائمة ويُثبَّت اختيارًا', async () => {
    const s = await providerSystem();
    await s.options.verify('anthropic');
    const status = await s.tab().status();
    expect(status?.models?.source).toBe('https://api.anthropic.com/v1/models');
    expect(typeof status?.models?.readAt).toBe('number');
    expect(status?.models?.models.map((m) => m.id)).toEqual(['mock-sonnet-2', 'mock-haiku-2']);
    expect(status?.model).toEqual({ id: 'mock-sonnet-2', displayName: 'Mock Sonnet 2' });
    expect(status?.choice).toBe('mock-sonnet-2');
  });

  it('بلا صلاحية api.anthropic.com لا يُرسل التحقق ولا التحليل، والمفتاح «غير متحقق منه» بسببه', async () => {
    const s = await providerSystem({ granted: [GITHUB_ORIGIN] });
    const verified = await s.options.verify('anthropic');
    expect(verified).toMatchObject({ ok: false, failure: 'permission', status: null });
    expect(s.provider.requests).toHaveLength(0);
    const status = await s.tab().status();
    expect(status?.permission).toBe(false);
    expect(status?.key?.health).toBe('unverified');
    expect(status?.key?.detail.reason).toContain('api.anthropic.com');
  });

  it('بلا مفتاح محفوظ: لا طلب، ويُعلن السبب', async () => {
    const s = await providerSystem({ withKey: false });
    expect(await s.options.verify('anthropic')).toMatchObject({ ok: false, failure: 'no-key', status: null });
    expect(s.provider.requests).toHaveLength(0);
  });
});

describe('AD-15: في Firefox لا تحليل دون موافقة مشاركة محتوى المواقع (websiteContent)', () => {
  it('صلاحية المضيف وحدها: التحقق يُرسل (لا محتوى فيه)، والحالة «غير ممنوحة»، والتحليل لا يُرسل ويُعلن السبب', async () => {
    const s = await providerSystem({ target: 'firefox' });
    expect((await s.options.verify('anthropic')).ok).toBe(true);
    expect(s.provider.requests).toHaveLength(1);
    expect((await s.tab().status())?.permission).toBe(false);
    const result = await s.tab().analyze(input());
    expect(result).toMatchObject({ ok: false, failure: 'permission', status: null });
    if (!result.ok) expect(result.message).toContain('مشاركة محتوى المواقع');
    expect(s.provider.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
    // صلاحية المضيف (لكل مزوّد) والموافقة الواحدة (لكل المزوّدين) تُقرآن كلٌّ على حدة (AC-E10 (٦)).
    expect(vi.mocked(s.permissions.contains)).toHaveBeenCalledWith({ origins: [ANTHROPIC_ORIGIN] });
    expect(vi.mocked(s.permissions.contains)).toHaveBeenCalledWith({ data_collection: ['websiteContent'] });
  });

  it('بالموافقتين: طلب تحليل واحد كما في عائلة Chromium', async () => {
    const s = await providerSystem({ target: 'firefox', collected: ['websiteContent'] });
    await s.options.verify('anthropic');
    expect((await s.tab().status())?.permission).toBe(true);
    expect((await s.tab().analyze(input())).ok).toBe(true);
    expect(s.provider.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });

  it('عائلة Chromium لا تشترطها ولا تطلبها', async () => {
    const s = await providerSystem();
    await s.options.verify('anthropic');
    expect((await s.tab().analyze(input())).ok).toBe(true);
    for (const [set] of vi.mocked(s.permissions.contains).mock.calls) expect(set).not.toHaveProperty('data_collection');
  });
});

describe('AC-E9 (٢) و(٤) وTEST-PRIV-04: طلب التحليل', () => {
  it('طلب واحد POST /v1/messages إلى api.anthropic.com وحده بالمودل الذي عرضته الموافقة، والمفتاح وحده (لا رمز GitHub)، ولا مفتاح في أي رد', async () => {
    const s = await providerSystem();
    await s.options.verify('anthropic');
    const result = await s.tab().analyze(input());
    expect(result.ok).toBe(true);
    const posts = s.provider.requests.filter((r) => r.method === 'POST');
    expect(posts).toHaveLength(1);
    const [post] = posts;
    expect(post?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(post?.headers['x-api-key']).toBe(s.key);
    expect(post?.headers.authorization).toBeUndefined();
    expect(allText(post)).not.toContain(s.token);
    const body = JSON.parse(post?.body ?? '{}') as { model: string; system: string; messages: Array<{ role: string; content: string }>; max_tokens: number };
    expect(body.model).toBe('mock-sonnet-2');
    expect(body.messages).toEqual([{ role: 'user', content: input().prompt }]);
    expect(body.system).toBe('تعليمات صيغة الرد');
    // حد طول الرد المطلوب: 4096 مقصورًا على ما يعلنه المودل (ليس سقف إنفاق).
    expect(body.max_tokens).toBe(4096);
    if (result.ok) expect(result.data).toMatchObject({ provider: 'Anthropic', host: 'api.anthropic.com', model: 'mock-sonnet-2' });
    for (const message of [...s.sent, ...s.replies]) expect(allText(message)).not.toContain(s.key);
    for (const message of [...s.sent, ...s.replies]) expect(allText(message)).not.toContain(s.token);
    expect(s.github.some((g) => allText(g).includes(s.key))).toBe(false);
    // كل وجهة خرج إليها طلب: api.anthropic.com لطلبات المزوّد وحدها.
    expect(new Set(s.provider.requests.map((r) => new URL(r.url).host))).toEqual(new Set(['api.anthropic.com']));
  });

  it('المودل تغيّر بعد عرض الموافقة: لا يُرسل شيء', async () => {
    const s = await providerSystem();
    await s.options.verify('anthropic');
    const result = await s.tab().analyze(input({ model: 'mock-haiku-2' }));
    expect(result).toMatchObject({ ok: false, failure: 'model-changed', status: null });
    expect(s.provider.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('طلب جارٍ من القسم نفسه في التبويب: الثاني يُرفض دون إرسال؛ وقسم آخر أو تبويب آخر مستقل', async () => {
    const s = await providerSystem({ scenario: { delayMs: 40 } });
    await s.options.verify('anthropic');
    const tab = s.tab(41);
    const first = tab.analyze(input({ requestId: 'a' }));
    const second = await tab.analyze(input({ requestId: 'b' }));
    expect(second).toMatchObject({ ok: false, failure: 'busy', status: null });
    const other = tab.analyze(input({ requestId: 'c', section: 'pr' }));
    const otherTab = s.tab(42).analyze(input({ requestId: 'd' }));
    expect((await first).ok).toBe(true);
    expect((await other).ok).toBe(true);
    expect((await otherTab).ok).toBe(true);
    expect(s.provider.requests.filter((r) => r.method === 'POST')).toHaveLength(3);
  });

  it('موعد إعادة المحاولة الذي أعلنه المزوّد (429، retry-after) يُحترم: لا طلب قبله ولا إعادة تلقائية', async () => {
    const s = await providerSystem({ scenario: { analyze: '429', retryAfter: 30 } });
    await s.options.verify('anthropic');
    const first = await s.tab().analyze(input());
    expect(first).toMatchObject({ ok: false, failure: 'rate-limit', status: 429 });
    if (!first.ok) expect(first.retryAt).toBeGreaterThan(Date.now());
    const again = await s.tab().analyze(input({ requestId: 'r2' }));
    expect(again).toMatchObject({ ok: false, failure: 'cooldown', status: null });
    expect(s.provider.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
    expect((await s.tab().status())?.retryAt).toBeGreaterThan(Date.now());
  });

  it('مفتاح رفضه المزوّد (401): «منتهٍ»، ولا يُرسل به ثانية حتى يُتحقق منه أو يُستبدل؛ والرسالة بلا المفتاح وإن ردّده الخادم', async () => {
    const s = await providerSystem({ scenario: { analyze: '401', echoKey: true } });
    await s.options.verify('anthropic');
    const first = await s.tab().analyze(input());
    expect(first).toMatchObject({ ok: false, failure: 'unauthorized', status: 401 });
    if (!first.ok) {
      expect(first.message).not.toContain(s.key);
      expect(first.message).toContain('‹المفتاح›');
    }
    expect((await s.tab().status())?.key?.health).toBe('expired');
    const again = await s.tab().analyze(input({ requestId: 'r2' }));
    expect(again).toMatchObject({ ok: false, failure: 'expired-key', status: null });
    expect(s.provider.requests.filter((r) => r.method === 'POST')).toHaveLength(1);
  });

  it('إيقاف طلب جارٍ يلغيه ولا نتيجة له', async () => {
    const s = await providerSystem({ scenario: { delayMs: 200 } });
    await s.options.verify('anthropic');
    const pending = s.tab().analyze(input({ requestId: 'stop-me' }));
    await new Promise((r) => setTimeout(r, 10));
    await s.tab().cancel('stop-me');
    expect(await pending).toMatchObject({ ok: false, failure: 'aborted' });
  });

  it('طلب غير صالح (بلا برومبت أو بمودل غير صالح) لا يُرسل', async () => {
    const s = await providerSystem();
    await s.options.verify('anthropic');
    expect(await s.tab().analyze(input({ prompt: '   ' }))).toMatchObject({ ok: false, failure: 'invalid-request' });
    expect(await s.tab().analyze(input({ model: 'bad model id' }))).toMatchObject({ ok: false, failure: 'invalid-request' });
    expect(s.provider.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });
});

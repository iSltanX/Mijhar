// محوّل Anthropic وبوابة طلبات المزوّد (T-11.6، AC-E9 (٤)): طلب إلى مضيف المحوّل وحده بعد الصلاحية الممنوحة، بلا ملفات تعريف ارتباط، وتصنيف
// الرفض بسببه وموعد إعادة المحاولة المعلن، وفحص صيغة المفتاح محليًا قبل أي إرسال. على fixture-provider-mock، بلا شبكة.
import { describe, expect, it, vi } from 'vitest';
import { ANTHROPIC_ADAPTER } from '../../../../src/modules/e/provider/adapters/anthropic';
import { checkKey } from '../../../../src/modules/e/provider/catalog';
import { ANTHROPIC } from '../../../../src/modules/e/provider/descriptors/anthropic';
import { ProviderKeyMismatchError, ProviderPermissionError, bindKey, gatedFetch, redactKey } from '../../../../src/modules/e/provider/gate';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { fakeKey, providerMock } from './fixture-provider-mock';
import type { Outcome } from './fixture-provider-mock';

const KEY = fakeKey('U');
const NOW = 1_800_000_000_000;

function call(outcome: { verify?: Outcome; analyze?: Outcome; retryAfter?: number; echoKey?: boolean } = {}, granted = true) {
  const mock = providerMock(outcome);
  const permissions = fakePermissions(granted ? [ANTHROPIC.origin] : []);
  return { mock, permissions, c: { key: KEY, fetch: gatedFetch(ANTHROPIC, { permissions, fetch: mock.fetch }), now: () => NOW } };
}

describe('صيغة المفتاح تُفحص محليًا من وصف المزوّد', () => {
  it('يقبل sk-ant-api… ويرفض الفارغ ومفتاح الإدارة وغيرهما، بلا إرسال', () => {
    expect(checkKey(ANTHROPIC, `  ${KEY}  `)).toEqual({ ok: true, key: KEY });
    expect(checkKey(ANTHROPIC, '')).toMatchObject({ ok: false });
    expect(checkKey(ANTHROPIC, ['sk', 'ant', 'admin01', 'x'.repeat(40)].join('-'))).toMatchObject({ ok: false, reason: expect.stringContaining('مفتاح إدارة') });
    expect(checkKey(ANTHROPIC, 'github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toMatchObject({ ok: false });
  });
});

describe('AC-E10 (٢) وTEST-AI-04: مفتاح مزوّد لا يُرسل إلى مضيف غيره', () => {
  it('bindKey يعيد مفتاح المزوّد نفسه، ويرمي لمفتاح مزوّد آخر قبل أي طلب', () => {
    expect(bindKey(ANTHROPIC, { provider: 'anthropic', token: KEY })).toBe(KEY);
    expect(() => bindKey(ANTHROPIC, { provider: 'mock-b', token: 'bkey-x' })).toThrow(ProviderKeyMismatchError);
  });
});

describe('البوابة: مضيف المحوّل وحده وبعد الصلاحية', () => {
  it('عنوان خارج api.anthropic.com يرمي ولا يُرسل؛ وبلا صلاحية يرمي ProviderPermissionError ولا يُرسل', async () => {
    const net = vi.fn();
    const granted = gatedFetch(ANTHROPIC, { permissions: fakePermissions([ANTHROPIC.origin]), fetch: net as never });
    await expect(granted('https://evil.example/v1/messages', {})).rejects.toThrow(/لا يقبل إلا/);
    await expect(granted('http://api.anthropic.com/v1/models', {})).rejects.toThrow(/لا يقبل إلا/);
    const denied = gatedFetch(ANTHROPIC, { permissions: fakePermissions([]), fetch: net as never });
    await expect(denied('/v1/models', {})).rejects.toBeInstanceOf(ProviderPermissionError);
    expect(net).not.toHaveBeenCalled();
  });

  it('يرسل بلا ملفات تعريف ارتباط ولا مرجِع ولا ذاكرة', async () => {
    const net = vi.fn(async () => new Response('{}'));
    await gatedFetch(ANTHROPIC, { permissions: fakePermissions([ANTHROPIC.origin]), fetch: net as never })('/v1/models', { method: 'GET' });
    expect(net).toHaveBeenCalledWith('https://api.anthropic.com/v1/models', expect.objectContaining({ credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }));
  });

  it('redactKey يحذف المفتاح من أي نص', () => {
    expect(redactKey(`bad key ${KEY}!`, KEY)).toBe('bad key ‹المفتاح›!');
    expect(redactKey('short', 'abc')).toBe('short');
  });
});

describe('تصنيف الاستجابات', () => {
  it.each([
    ['401', 'unauthorized', 401],
    ['403', 'forbidden', 403],
    ['400', 'invalid', 400],
    ['529', 'overloaded', 529],
  ] as const)('%s ← %s بلا موعد إعادة', async (outcome, failure, status) => {
    const { c } = call({ analyze: outcome });
    const r = await ANTHROPIC_ADAPTER.analyze(c, { model: 'mock-sonnet-2', system: 's', prompt: 'p', maxTokens: 10 });
    expect(r).toMatchObject({ ok: false, failure, status, retryAt: null });
  });

  it('429 بموعد retry-after المعلن', async () => {
    const { c } = call({ analyze: '429', retryAfter: 20 });
    const r = await ANTHROPIC_ADAPTER.analyze(c, { model: 'm', system: 's', prompt: 'p', maxTokens: 10 });
    expect(r).toMatchObject({ ok: false, failure: 'rate-limit', status: 429, retryAt: NOW + 20_000 });
  });

  it('رسالة خطأ يردّد فيها الخادم المفتاح تُنقّح منه', async () => {
    const { c } = call({ verify: '401', echoKey: true });
    const r = await ANTHROPIC_ADAPTER.listModels(c);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).not.toContain(KEY);
      expect(r.message).toContain('‹المفتاح›');
    }
  });

  it('بلا صلاحية: فشل «permission» ولا طلب', async () => {
    const { c, mock } = call({}, false);
    expect(await ANTHROPIC_ADAPTER.listModels(c)).toMatchObject({ ok: false, failure: 'permission', status: null });
    expect(mock.requests).toHaveLength(0);
  });

  it('DEC-13 ن-3: المودلات غير المتقاعدة «معلنة التوافق» من الواجهة الرسمية، بلا استنتاج من الاسم', async () => {
    const { c } = call();
    const r = await ANTHROPIC_ADAPTER.listModels(c);
    expect(r.ok && r.data.models.map((m) => [m.id, m.compatibility])).toEqual([
      ['mock-sonnet-2', 'declared'],
      ['mock-haiku-2', 'declared'],
    ]);
  });

  it('رد التحليل: النص والمودل وسبب التوقف والأعداد المعلنة (لا تكلفة)', async () => {
    const { c } = call();
    const r = await ANTHROPIC_ADAPTER.analyze(c, { model: 'mock-sonnet-2', system: 's', prompt: 'error TS2322: x', maxTokens: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toMatchObject({ model: 'mock-sonnet-2', stopReason: 'end_turn', usage: { input: 1200, output: 180 } });
      expect(JSON.stringify(r.data)).not.toMatch(/cost|price|usd|تكلف|سعر/i);
    }
  });
});

// TEST-CONN-01 (وحدة، AC-11.1 ‏(١) و(٢)): الحالة من استجابة فعلية لا من وجود نص، ولكل حالة نصها الخاص، وعلى جدول إشارات evidence/T-0.5
// كما في fixture-token-states.json: 401 منتهٍ، و403 بصلاحية قراءة يضيفها المستخدم ناقص الصلاحيات (وChecks ليست نقصًا)، ونفاد الحد
// متجاوز الحد بموعده، وتعذّر الوصول غير متاح، وصلاحية api.github.com غير الممنوحة غير متحقق منه؛ والسجل مربوط بوقت حفظ السرّ.
import { describe, expect, it } from 'vitest';
import { PublicApiClient } from '../../../src/core/api/client';
import type { PublicApiResult } from '../../../src/core/api/client';
import { CONNECTIONS, CONNECTION_IDS, isConnectionId } from '../../../src/core/connections/definitions';
import { CONNECTED_FEATURES, dependentsOf, gate, isFeatureId } from '../../../src/core/connections/features';
import { HEALTH_LABEL, HEALTH_STATES, acceptedPermissions, isLinked, repoOfPath, resolveStatus, verdictFromUsage, verdictFromVerification } from '../../../src/core/connections/health';
import type { HealthRecord } from '../../../src/core/connections/health';
import { healthText } from '../../../src/core/connections/text';
import { READ_PERMISSIONS } from '../../../src/modules/d/token/format';
import { fakePermissions } from '../ui-host/helpers';
import { FIXTURE, fakeToken } from './helpers';
import type { Reply } from './helpers';

const TOKEN = fakeToken('H');
const FIXABLE = READ_PERMISSIONS.map((p) => p.param);
const NOW = Date.UTC(2026, 9, 24, 9);
const EXPIRES = Date.UTC(2026, 9, 30, 14, 25, 10);

/** نتيجة طلب حقيقية من العميل على ردّ من العينة. */
async function resultOf(reply: Reply, path = '/rate_limit', token: string | null = TOKEN, granted = true): Promise<PublicApiResult<unknown>> {
  const net = async () => new Response(JSON.stringify(reply.body ?? {}), { status: reply.status, headers: { 'content-type': 'application/json', ...reply.headers } });
  const client = new PublicApiClient({ permissions: fakePermissions(granted ? ['https://api.github.com/*'] : []), fetch: net as unknown as typeof fetch, now: () => NOW, ...(token ? { token: async () => token } : {}) });
  return client.get(path);
}

const state = (name: string): Reply => {
  const r = FIXTURE.states[name];
  if (!r) throw new Error(name);
  return r;
};

describe('التعريفات: قائمة مغلقة بلا مفاتيح أسرار', () => {
  // MJ22 (T-11.8): صلاحية الكتابة اتصال ثالث بسرّ منفصل (AD-19).
  it('ثلاثة اتصالات بمعرّفات ثابتة؛ ولكلٍّ نوعه ووجهته وما يحتاجه وما يتعطل بحذفه', () => {
    expect(CONNECTION_IDS).toEqual(['github-token', 'provider-key', 'github-write']);
    for (const def of CONNECTIONS) {
      expect(def.kind && def.destination && def.needs && def.enables && def.disables).toBeTruthy();
      expect(JSON.stringify(def)).not.toMatch(/mijhar\.secret|providerKey|githubToken|githubWrite/);
    }
    expect(isConnectionId('github-token')).toBe(true);
    expect(isConnectionId('https://evil.example')).toBe(false);
  });

  it('مفتاح المزوّد متاح مع طبقة التحليل (MJ21، AC-E9)، بوجهته الوحيدة وبلا أي ذكر لتكلفة (AD-31)', () => {
    const provider = CONNECTIONS.find((c) => c.id === 'provider-key');
    expect(provider?.availability).toBe('available');
    // MJ23 (AC-E10 (٧)): الوصف لا يحصر الوجهة في مزوّد؛ مضيف المختار في بطاقة «مزوّد التحليل» من السجل الوصفي.
    expect(provider?.destination).toBe('مضيف المزوّد المختار');
    expect(JSON.stringify(provider)).not.toMatch(/anthropic|openai|gemini/i);
    expect(provider?.notYet).toBeUndefined();
    expect(JSON.stringify(provider)).not.toMatch(/تكلف|سعر|دولار/);
  });
});

describe('التحقق الصريح (/rate_limit) على جدول الإشارات', () => {
  it('سليم بعد قبول فعلي بالرمز وحده، بالحد وموعد الانتهاء', async () => {
    const v = verdictFromVerification(await resultOf(state('valid')), EXPIRES);
    expect(v).toEqual({ health: 'healthy', detail: { limit: 5000, remaining: 4999, expiresAt: EXPIRES } });
  });

  it('نص غير صالح أو ملغى أو منتهٍ (401) منتهٍ، لا سليم ولا رجوع إلى الوصول المجهول', async () => {
    for (const name of ['invalid', 'expired']) expect(verdictFromVerification(await resultOf(state(name)), null).health).toBe('expired');
  });

  it('نفاد الحد متجاوز الحد بموعد إعادة المحاولة من الترويسات', async () => {
    const limited = await resultOf(state('rate-limited'), '/repos/o/r');
    const v = verdictFromVerification(limited, null);
    expect(v.health).toBe('rate-limited');
    expect(v.detail.retryAt).toBe(1_792_768_532_000);
    const secondary = verdictFromVerification(await resultOf(state('secondary-limit'), '/repos/o/r'), null);
    expect(secondary).toMatchObject({ health: 'rate-limited', detail: { retryAt: NOW + 60_000 } });
  });

  it('صلاحية api.github.com غير ممنوحة: غير متحقق منه بسببه؛ وتعذّر الوصول أو خطأ الخادم: غير متاح', async () => {
    const noPermission = verdictFromVerification(await resultOf(state('valid'), '/rate_limit', TOKEN, false), null);
    expect(noPermission.health).toBe('unverified');
    expect(noPermission.detail.reason).toContain('api.github.com');
    const server = verdictFromVerification(await resultOf({ status: 503, body: { message: 'Service Unavailable' } }), null);
    expect(server.health).toBe('unavailable');
    const offline = verdictFromVerification({ ok: false, failure: 'network', status: null, message: 'Failed to fetch', retryAt: null, readAt: NOW, rate: null, authenticated: true }, null);
    expect(offline).toMatchObject({ health: 'unavailable', detail: { reason: 'Failed to fetch' } });
  });

  it('ردّ ناجح بلا رمز لا يُعدّ سليمًا', async () => {
    expect(verdictFromVerification(await resultOf(state('valid'), '/rate_limit', null), null).health).toBe('unverified');
  });
});

describe('الاستعمال: 403 بصلاحية قراءة ناقصة وحده ناقص الصلاحيات', () => {
  it('ترويسة x-accepted-github-permissions تُقرأ بدائلها', () => {
    expect(acceptedPermissions('pull_requests=read; contents=read')).toEqual(['pull_requests', 'contents']);
    expect(acceptedPermissions('allows_permissionless_access=true')).toEqual([]);
    expect(acceptedPermissions(null)).toEqual([]);
    expect(repoOfPath('/repos/octo-owner/private-demo/actions/runs?head_sha=1')).toBe('octo-owner/private-demo');
  });

  it('actions=read ناقصة: ناقص الصلاحيات بالصلاحية والمستودع', async () => {
    const reply: Reply = { ...state('missing-permission'), headers: { ...state('missing-permission').headers, 'x-accepted-github-permissions': 'actions=read' } };
    const result = await resultOf(reply, '/repos/octo-owner/private-demo/actions/runs?head_sha=abc');
    const v = verdictFromUsage('/repos/octo-owner/private-demo/actions/runs?head_sha=abc', result, 'healthy', { fixable: FIXABLE, expiresAt: EXPIRES });
    expect(v).toMatchObject({ health: 'insufficient', detail: { permission: 'actions', where: 'octo-owner/private-demo', status: 403 } });
  });

  it('checks=read (لا تُتاح للرموز دقيقة الحبيبات) ليس نقصًا في الرمز، و404 الملتبس لا يغيّر الصحة', async () => {
    const checks = await resultOf(state('missing-permission'), '/repos/o/r/commits/abc/check-runs');
    expect(verdictFromUsage('/repos/o/r/commits/abc/check-runs', checks, 'healthy', { fixable: FIXABLE, expiresAt: null })).toBeNull();
    const notFound = await resultOf(state('not-found'), '/repos/o/r');
    expect(verdictFromUsage('/repos/o/r', notFound, 'healthy', { fixable: FIXABLE, expiresAt: null })).toBeNull();
  });

  it('قبول طلب لا يمحو نقصًا مسجلًا؛ و401 في الاستعمال منتهٍ؛ وطلب بلا رمز لا يغيّر شيئًا', async () => {
    const ok = await resultOf(state('valid'), '/repos/o/r');
    expect(verdictFromUsage('/repos/o/r', ok, 'insufficient', { fixable: FIXABLE, expiresAt: null })).toBeNull();
    expect(verdictFromUsage('/repos/o/r', ok, 'unverified', { fixable: FIXABLE, expiresAt: null })?.health).toBe('healthy');
    expect(verdictFromUsage('/repos/o/r', await resultOf(state('invalid'), '/repos/o/r'), 'healthy', { fixable: FIXABLE, expiresAt: null })?.health).toBe('expired');
    expect(verdictFromUsage('/repos/o/r', await resultOf(state('valid'), '/repos/o/r', null), null, { fixable: FIXABLE, expiresAt: null })).toBeNull();
  });
});

describe('الحالة الآن من السرّ وسجله', () => {
  const info = { place: 'session' as const, savedAt: 100 };
  const record = (over: Partial<HealthRecord>): HealthRecord => ({ id: 'github-token', savedAt: 100, health: 'healthy', checkedAt: 200, detail: {}, ...over });

  it('لا سرّ: غير مربوط. سرّ بلا تحقق (كُتب نص في الحقل وحُفظ): غير متحقق منه لا سليم', () => {
    expect(resolveStatus('github-token', null, record({}), NOW).health).toBe('none');
    const typed = resolveStatus('github-token', info, null, NOW);
    expect(typed.health).toBe('unverified');
    expect(typed.detail.reason).toContain('لا يُعدّ سليمًا');
  });

  it('استبدال السرّ يُسقط حالة سابقه؛ وسجل اتصال آخر لا يُستعمل', () => {
    expect(resolveStatus('github-token', { place: 'disk', savedAt: 101 }, record({}), NOW).health).toBe('unverified');
    expect(resolveStatus('provider-key', info, record({}), NOW).health).toBe('unverified');
  });

  it('مضى موعد الانتهاء المعلن: منتهٍ بلا طلب؛ وانقضى موعد إعادة المحاولة: غير متحقق منه', () => {
    expect(resolveStatus('github-token', info, record({ detail: { expiresAt: NOW - 1 } }), NOW).health).toBe('expired');
    expect(resolveStatus('github-token', info, record({ health: 'rate-limited', detail: { retryAt: NOW - 1 } }), NOW).health).toBe('unverified');
    expect(resolveStatus('github-token', info, record({ health: 'rate-limited', detail: { retryAt: NOW + 1 } }), NOW).health).toBe('rate-limited');
  });
});

describe('النصوص: لكل حالة نصها، ولا «سليم» إلا بقبول', () => {
  it('سبع حالات بسبعة أسماء ونصوص مختلفة، والنقص يسمّي الصلاحية والمستودع، والحد يذكر موعده', () => {
    const name = (p: string) => READ_PERMISSIONS.find((x) => x.param === p)?.name ?? p;
    const details = {
      none: {},
      unverified: {},
      healthy: { limit: 5000, remaining: 4999, expiresAt: EXPIRES },
      expired: { status: 401 },
      insufficient: { permission: 'actions', where: 'octo-owner/private-demo' },
      'rate-limited': { retryAt: 1_792_768_532_000 },
      unavailable: { reason: 'HTTP 503' },
    } as const;
    const texts = HEALTH_STATES.map((h) => healthText('github-token', { health: h, detail: details[h] }, { now: NOW, permissionName: name }));
    expect(new Set(texts).size).toBe(7);
    expect(new Set(HEALTH_STATES.map((h) => HEALTH_LABEL[h])).size).toBe(7);
    const [none, unverified, healthy, expired, insufficient, limited, unavailable] = texts;
    expect(healthy).toContain('5000');
    expect(healthy).toContain('2026-10-30 14:25 UTC');
    expect(expired).toContain('401');
    expect(insufficient).toContain('ينقصه صلاحية Actions (قراءة) في المستودع octo-owner/private-demo');
    expect(limited).toContain('2026-10-23 15:15 UTC');
    expect(unavailable).toContain('HTTP 503');
    expect(none).toContain('تعمل بدونه');
    for (const text of [none, unverified, expired, insufficient, limited, unavailable]) expect(text).not.toContain('قبِل');
  });
});

describe('عقد «ميزة تحتاج ربطًا» (AC-11.1 ‏(٣) و(٥))', () => {
  const feature = CONNECTED_FEATURES[0];

  it('قائمة مغلقة بمعرّفات؛ والميزة تُفتح بسرّ محفوظ لم ينتهِ وحده', () => {
    expect(isFeatureId('d.pr-status.private')).toBe(true);
    expect(isFeatureId('options.html#evil')).toBe(false);
    expect(gate(feature, { 'github-token': 'none' })).toMatchObject({ open: false });
    expect(gate(feature, { 'github-token': 'expired' })).toMatchObject({ open: false });
    for (const h of ['unverified', 'healthy', 'insufficient', 'rate-limited', 'unavailable'] as const) expect(gate(feature, { 'github-token': h }).open).toBe(true);
    expect(isLinked('none')).toBe(false);
  });

  it('حذف سرّ أو انتهاؤه يعطّل ما يعتمد عليه وحده: التحليل في أقسامه الثلاثة يعتمد على مفتاح المزوّد (MJ21)، وحالته لا تمس بوابة الرمز', () => {
    expect(dependentsOf('github-token').map((f) => f.id)).toEqual(['d.pr-status.private']);
    expect(dependentsOf('provider-key').map((f) => f.id)).toEqual(['d.analysis.checks', 'd.analysis.pr', 'd.analysis.issue']);
    expect(gate(feature, { 'github-token': 'healthy', 'provider-key': 'expired' }).open).toBe(true);
  });
});

// الطلبات الموثَّقة في الطبقة الواحدة (T-5.5، AD-24): ترويسة Authorization من العميل وحده وبالرمز من مصدره، وحد الموثَّق وذاكرته منفصلان
// عن العام، وتفريغ ذاكرة الموثَّق بتغيّر الرمز أو مسحه، و401 فشل معلن بلا رجوع صامت، و403 يسمّي الصلاحية الناقصة، وموعد الانتهاء من
// الترويسة، ولا رمز في أي نتيجة أو رسالة. العينة: fixture-token-states.json (جدول إشارات evidence/T-0.5).
import { describe, expect, it, vi } from 'vitest';
import { PublicApiClient, readTokenExpiry, redactToken } from '../../../../src/core';
import type { PermissionsApi } from '../../../../src/core';
import { FIXTURE, TOKEN_PATTERN, authHeader, fakeToken } from './helpers';
import type { Call, Reply } from './helpers';

const granted = (): PermissionsApi => ({ contains: vi.fn(async () => true), request: vi.fn(async () => true), remove: vi.fn(async () => true) });

function net(reply: (call: Call, index: number) => Reply) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    const r = reply(call, calls.length - 1);
    return new Response(r.status === 304 ? null : JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json', ...r.headers } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const state = (name: string): Reply => FIXTURE.states[name] as Reply;
const TOKEN = fakeToken('A');
const OTHER = fakeToken('B');

describe('ترويسة Authorization من العميل وحده', () => {
  it('بلا رمز: لا ترويسة ولا حقل authenticated، كما كانت الطبقة العامة', async () => {
    const n = net(() => ({ status: 200, body: { ok: 1 } }));
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => null });
    const result = await client.get('/repos/o/r');
    expect(result).toMatchObject({ ok: true });
    expect('authenticated' in result).toBe(false);
    expect(authHeader(n.calls[0])).toBeNull();
  });

  it('بالرمز: Bearer في الطلب وحده، GET وبلا ملفات تعريف؛ والنتيجة تعلن «بالرمز» ولا تحمله', async () => {
    const n = net(() => state('valid'));
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => TOKEN });
    const result = await client.get('/rate_limit');
    expect(authHeader(n.calls[0])).toBe(`Bearer ${TOKEN}`);
    expect(n.calls[0]?.init.method).toBe('GET');
    expect(n.calls[0]?.init.credentials).toBe('omit');
    expect(result).toMatchObject({ ok: true, authenticated: true, rate: { limit: 5000, remaining: 4999 } });
    expect(JSON.stringify(result)).not.toMatch(TOKEN_PATTERN);
  });

  it('المسار غير المقبول يُرفض بالرمز كما بدونه: لا يتسع الوصول الموثَّق لمسارات أخرى', async () => {
    const n = net(() => state('valid'));
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => TOKEN });
    for (const path of ['/user', '/user/repos', '/search/code?q=secret', '/orgs/o/repos', 'https://evil.example/repos/o/r']) {
      expect(await client.get(path)).toMatchObject({ ok: false, failure: 'invalid-path' });
    }
    expect(n.calls).toHaveLength(0);
  });

  it('بلا الصلاحية الاختيارية لا يخرج طلب ولو وُجد الرمز', async () => {
    const n = net(() => state('valid'));
    const client = new PublicApiClient({ permissions: { ...granted(), contains: vi.fn(async () => false) }, fetch: n.fn, token: async () => TOKEN });
    expect(await client.get('/repos/o/r')).toMatchObject({ ok: false, failure: 'permission', authenticated: true });
    expect(n.calls).toHaveLength(0);
  });
});

describe('إشارات الرمز (جدول T-0.5)', () => {
  it('401 فشل «unauthorized» معلن، ولا يُعاد الطلب بلا رمز', async () => {
    const n = net(() => state('invalid'));
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => TOKEN });
    const result = await client.get('/repos/octo/public');
    expect(result).toMatchObject({ ok: false, failure: 'unauthorized', status: 401, authenticated: true });
    expect(n.calls).toHaveLength(1);
    expect(result.ok ? '' : result.message).toMatch(/401/);
  });

  it('403 لنقص صلاحية نقطة بعينها يسمّي الصلاحية من x-accepted-github-permissions', async () => {
    const n = net(() => state('missing-permission'));
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => TOKEN });
    const result = await client.get('/repos/o/r/commits/abc/check-runs');
    expect(result).toMatchObject({ ok: false, failure: 'forbidden', status: 403 });
    expect(result.ok ? '' : result.message).toContain('checks=read');
  });

  it('404 بالرمز: «لا يشمله الرمز» لا «غير عام»', async () => {
    const n = net(() => state('not-found'));
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => TOKEN });
    const result = await client.get('/repos/o/secret');
    expect(result).toMatchObject({ ok: false, failure: 'not-found' });
    expect(result.ok ? '' : result.message).toContain('لا يشمله الرمز');
  });

  it('موعد الانتهاء من github-authentication-token-expiration ويُعرض في auth()', async () => {
    const n = net(() => state('valid'));
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => TOKEN });
    expect(await client.auth()).toEqual({ authenticated: true, expiresAt: null });
    await client.get('/rate_limit');
    expect(await client.auth()).toEqual({ authenticated: true, expiresAt: Date.UTC(2026, 9, 30, 14, 25, 10) });
    expect(readTokenExpiry(new Headers({ 'github-authentication-token-expiration': 'garbage' }))).toBeNull();
  });

  it('تعذّر قراءة الرمز المحفوظ: فشل «token» ولا طلب مجهول بدله', async () => {
    const n = net(() => state('valid'));
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => Promise.reject(new Error(`boom ${TOKEN}`)) });
    const result = await client.get('/repos/o/r');
    expect(result).toMatchObject({ ok: false, failure: 'token' });
    expect(n.calls).toHaveLength(0);
    expect(JSON.stringify(result)).not.toMatch(TOKEN_PATTERN);
  });

  it('لا رمز في رسالة خطأ ولو أعاده الخادم أو الشبكة في النص', async () => {
    const echo = net(() => ({ status: 500, body: { message: `server echoed ${TOKEN}` } }));
    const client = new PublicApiClient({ permissions: granted(), fetch: echo.fn, token: async () => TOKEN });
    const result = await client.get('/repos/o/r');
    expect(result.ok ? '' : result.message).not.toMatch(TOKEN_PATTERN);
    const thrower = vi.fn(async () => Promise.reject(new TypeError(`Failed to fetch ${TOKEN}`))) as unknown as typeof fetch;
    const viaNet = await new PublicApiClient({ permissions: granted(), fetch: thrower, token: async () => TOKEN }).get('/repos/o/r');
    expect(viaNet).toMatchObject({ ok: false, failure: 'network' });
    expect(JSON.stringify(viaNet)).not.toMatch(TOKEN_PATTERN);
    expect(redactToken(`a ${TOKEN} b`, TOKEN)).toBe('a ‹الرمز› b');
  });
});

describe('حد الموثَّق وذاكرته منفصلان عن العام', () => {
  it('نفاد الحد العام لا يمنع الطلب بالرمز، ونفاد الموثَّق لا يمنع العام بعد مسح الرمز', async () => {
    let token: string | null = null;
    const n = net((call) => (authHeader(call) ? (call.url.includes('/limited') ? state('rate-limited') : state('valid')) : { status: 403, body: { message: 'API rate limit exceeded' }, headers: { 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600), 'x-ratelimit-resource': 'core' } }));
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => token });
    expect(await client.get('/repos/o/r')).toMatchObject({ ok: false, failure: 'rate-limit' });
    expect(await client.get('/repos/o/r2')).toMatchObject({ ok: false, failure: 'rate-limit' });
    expect(n.calls).toHaveLength(1); // العام موقوف محليًا حتى reset

    token = TOKEN;
    expect(await client.get('/repos/o/r')).toMatchObject({ ok: true, authenticated: true });
    expect(client.rate()).toMatchObject({ limit: 5000 });
    expect(await client.get('/repos/o/limited')).toMatchObject({ ok: false, failure: 'rate-limit', authenticated: true });

    token = null;
    await client.auth();
    // حد الموثَّق لا يُحتسب على العام، والعام ما زال موقوفًا بحده هو: يُرفض محليًا بلا طلب.
    expect(client.rate()).toMatchObject({ limit: 60, remaining: 0 });
    const before = n.calls.length;
    expect(await client.get('/repos/o/r3')).toMatchObject({ ok: false, failure: 'rate-limit' });
    expect(n.calls).toHaveLength(before);
  });

  it('429 بـRetry-After للموثَّق يوقف الموثَّق وحده حتى موعده', async () => {
    let token: string | null = TOKEN;
    const n = net((call) => (authHeader(call) ? state('secondary-limit') : { status: 200, body: {} }));
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => token });
    expect(await client.get('/repos/o/r')).toMatchObject({ ok: false, failure: 'rate-limit' });
    expect(await client.get('/repos/o/r')).toMatchObject({ ok: false, failure: 'rate-limit' });
    expect(n.calls).toHaveLength(1);
    token = null;
    expect(await client.get('/repos/o/r')).toMatchObject({ ok: true });
    expect(n.calls).toHaveLength(2);
  });

  it('ETag: نسخة جُلبت بالرمز لا تُخدم ولا يُرسل وسمها لقراءة بلا رمز، ومسح الرمز ثم إعادته يفرّغ ذاكرة الموثَّق', async () => {
    let token: string | null = TOKEN;
    const n = net((call) => {
      const auth = authHeader(call);
      if (!auth) return state('not-found');
      if (new Headers(call.init.headers).get('if-none-match') === '"private-v1"') return { status: 304 };
      return { status: 200, body: { secret: 'private data' }, headers: { etag: '"private-v1"' } };
    });
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => token });
    expect(await client.get('/repos/o/private')).toMatchObject({ ok: true, data: { secret: 'private data' } });
    expect(await client.get('/repos/o/private')).toMatchObject({ ok: true, fromCache: true });
    expect(new Headers(n.calls[1]?.init.headers).get('if-none-match')).toBe('"private-v1"');

    token = null;
    const anonymous = await client.get('/repos/o/private');
    expect(anonymous).toMatchObject({ ok: false, failure: 'not-found' });
    expect(JSON.stringify(anonymous)).not.toContain('private data');
    expect(new Headers(n.calls[2]?.init.headers).get('if-none-match')).toBeNull();

    token = TOKEN;
    await client.get('/repos/o/private');
    // أُفرغت ذاكرة الموثَّق بالمسح: لا وسم شرطي من النسخة القديمة.
    expect(new Headers(n.calls[3]?.init.headers).get('if-none-match')).toBeNull();
  });

  it('تبديل الرمز بآخر يفرّغ ذاكرة الأول: لا يستلم الثاني بيانات الأول', async () => {
    let token: string | null = TOKEN;
    const n = net((call) => (authHeader(call) === `Bearer ${TOKEN}` ? { status: 200, body: { owner: 'A' }, headers: { etag: '"a"' } } : state('not-found')));
    const client = new PublicApiClient({ permissions: granted(), fetch: n.fn, token: async () => token });
    await client.get('/repos/o/r');
    token = OTHER;
    expect(await client.get('/repos/o/r')).toMatchObject({ ok: false, failure: 'not-found' });
    expect(authHeader(n.calls[1])).toBe(`Bearer ${OTHER}`);
    expect(new Headers(n.calls[1]?.init.headers).get('if-none-match')).toBeNull();
  });

  it('ردّ متأخر لرمز مُسح أثناء الطلب لا يدخل ذاكرة ولا يُخدم بعد المسح', async () => {
    let token: string | null = TOKEN;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const fn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (new Headers(init?.headers).get('authorization')) await gate;
      return new Response(JSON.stringify(new Headers(init?.headers).get('authorization') ? { secret: 1 } : { message: 'Not Found' }), { status: new Headers(init?.headers).get('authorization') ? 200 : 404, headers: { etag: '"late"' } });
    }) as unknown as typeof fetch;
    const client = new PublicApiClient({ permissions: granted(), fetch: fn, token: async () => token });
    const pending = client.get('/repos/o/private');
    await Promise.resolve();
    token = null;
    await client.auth(); // تكتشف الخلفية المسح (قراءة الحالة من صفحة الإعدادات).
    release();
    await pending;
    expect(await client.get('/repos/o/private')).toMatchObject({ ok: false, failure: 'not-found' });
  });
});

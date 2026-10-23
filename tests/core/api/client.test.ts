// طبقة GitHub REST العامة (T-5.2): البوابة والصلاحية، وترويسات x-ratelimit-* والتوقف عند النفاد، والطلبات الشرطية بـETag،
// وتصفّح الصفحات، وتصنيف الفشل، ومنفذ الرسائل إلى الخلفية. لا شبكة: fetch وهمي يسجّل كل طلب (تدقيق شبكة على مستوى الوحدة).
import { describe, expect, it, vi } from 'vitest';
import { startBackground } from '../../../src/background/main';
import { API_GITHUB_ORIGIN, MemoryStorageArea, PUBLIC_API_MESSAGE, PublicApiClient, directPort, handlePublicApiRequest, isPublicApiRequest, isPublicPath, readRateLimit, runtimePort } from '../../../src/core';
import type { ExtensionApi, PermissionsApi, PublicApiResult } from '../../../src/core';

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

const permissions = (granted: boolean): PermissionsApi & { granted: boolean } => {
  const p = {
    granted,
    contains: vi.fn(async () => p.granted),
    request: vi.fn(async () => true),
    remove: vi.fn(async () => true),
  };
  return p;
};

const rateHeaders = (remaining: number, reset = 2_000_000, limit = 60): Record<string, string> => ({
  'x-ratelimit-limit': String(limit),
  'x-ratelimit-remaining': String(remaining),
  'x-ratelimit-used': String(limit - remaining),
  'x-ratelimit-reset': String(reset),
  'x-ratelimit-resource': 'core',
});

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

function fakeFetch(replies: (call: Call, index: number) => Reply) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    const reply = replies(call, calls.length - 1);
    const body = reply.status === 304 ? null : JSON.stringify(reply.body ?? {});
    return new Response(body, { status: reply.status, headers: { 'content-type': 'application/json', ...reply.headers } });
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const headerOf = (call: Call | undefined, name: string): string | null => new Headers(call?.init.headers).get(name);

describe('البوابة والمسارات', () => {
  it('بلا الصلاحية الاختيارية: لا يُرسل أي طلب، والنتيجة فشل مصنَّف «permission»', async () => {
    const net = fakeFetch(() => ({ status: 200 }));
    const client = new PublicApiClient({ permissions: permissions(false), fetch: net.fn });
    const result = await client.get('/repos/o/r/pulls/1');
    expect(result).toMatchObject({ ok: false, failure: 'permission' });
    expect(net.calls).toHaveLength(0);
  });

  it('GET وحده إلى api.github.com، بلا Authorization ولا ملفات تعريف، وبترويستي Accept والإصدار', async () => {
    const net = fakeFetch(() => ({ status: 200, body: { number: 1 }, headers: rateHeaders(59) }));
    const client = new PublicApiClient({ permissions: permissions(true), fetch: net.fn });
    const result = await client.get<{ number: number }>('/repos/o/r/pulls/1');
    expect(result).toMatchObject({ ok: true, status: 200, data: { number: 1 }, fromCache: false });
    expect(net.calls[0]?.url).toBe('https://api.github.com/repos/o/r/pulls/1');
    expect(net.calls[0]?.init.method).toBe('GET');
    expect(net.calls[0]?.init.credentials).toBe('omit');
    expect(headerOf(net.calls[0], 'authorization')).toBeNull();
    expect(headerOf(net.calls[0], 'accept')).toBe('application/vnd.github+json');
    expect(headerOf(net.calls[0], 'x-github-api-version')).toBe('2022-11-28');
  });

  it('المسارات المقبولة /repos/… و/rate_limit وحدها؛ والأصول الأخرى و«..» والمسارات الأخرى مرفوضة بلا طلب', async () => {
    for (const ok of ['/repos/o/r', '/repos/nodejs/node/pulls/66911', '/repos/o/r/commits/abc/check-runs?per_page=100&page=2', '/repos/o/r/branches/release%2F1.x', '/rate_limit']) expect(isPublicPath(ok), ok).toBe(true);
    const net = fakeFetch(() => ({ status: 200 }));
    const client = new PublicApiClient({ permissions: permissions(true), fetch: net.fn });
    for (const bad of ['https://evil.example/repos/o/r', '//evil.example/x', '/user', '/repos/o/../user', '/repos/o', 'repos/o/r', '/repos/o/r/../../user']) {
      expect(isPublicPath(bad), bad).toBe(false);
      expect(await client.get(bad)).toMatchObject({ ok: false, failure: 'invalid-path' });
    }
    expect(net.calls).toHaveLength(0);
  });
});

describe('حدود الطلبات من x-ratelimit-*', () => {
  it('تُقرأ الترويسات بقيمها ووقتها', () => {
    const rate = readRateLimit(new Headers(rateHeaders(7, 1792737281)), 1234);
    expect(rate).toEqual({ limit: 60, remaining: 7, used: 53, reset: 1792737281, resource: 'core', readAt: 1234 });
    expect(readRateLimit(new Headers(), 1)).toBeNull();
  });

  it('عند remaining = 0 لا يُرسل طلب حتى reset، ثم يُستأنف', async () => {
    let now = 1_000_000;
    const net = fakeFetch(() => ({ status: 200, body: {}, headers: rateHeaders(0, 1_060) }));
    const client = new PublicApiClient({ permissions: permissions(true), fetch: net.fn, now: () => now });
    expect((await client.get('/repos/o/r')).ok).toBe(true);
    const blocked = await client.get('/repos/o/r/pulls/1');
    expect(blocked).toMatchObject({ ok: false, failure: 'rate-limit', retryAt: 1_060_000 });
    expect(net.calls).toHaveLength(1);
    now = 1_060_001;
    await client.get('/repos/o/r/pulls/1');
    expect(net.calls).toHaveLength(2);
  });

  it('403 بنفاد الحد: «rate-limit» بوقت reset ورسالة GitHub؛ و429 بـretry-after', async () => {
    const net = fakeFetch((_, i) =>
      i === 0
        ? { status: 403, body: { message: 'API rate limit exceeded for 203.0.113.1.' }, headers: rateHeaders(0, 1_792_737_281) }
        : { status: 429, body: { message: 'secondary rate limit' }, headers: { ...rateHeaders(10), 'retry-after': '30' } },
    );
    const client = new PublicApiClient({ permissions: permissions(true), fetch: net.fn, now: () => 5_000 });
    expect(await client.get('/repos/o/r')).toMatchObject({ ok: false, failure: 'rate-limit', status: 403, retryAt: 1_792_737_281_000, message: 'API rate limit exceeded for 203.0.113.1.' });
    const second = new PublicApiClient({ permissions: permissions(true), fetch: net.fn, now: () => 5_000 });
    expect(await second.get('/repos/o/r')).toMatchObject({ ok: false, failure: 'rate-limit', status: 429, retryAt: 35_000 });
  });

  it('404 وغير موجود، و403 بلا نفاد «forbidden» برسالتها (مثل حجب السجلات في T-0.3)', async () => {
    const net = fakeFetch((_, i) => (i === 0 ? { status: 404, body: { message: 'Not Found' }, headers: rateHeaders(5) } : { status: 403, body: { message: 'Must have admin rights to Repository.' }, headers: rateHeaders(4) }));
    const client = new PublicApiClient({ permissions: permissions(true), fetch: net.fn });
    expect(await client.get('/repos/o/r/pulls/999999999')).toMatchObject({ ok: false, failure: 'not-found', status: 404 });
    expect(await client.get('/repos/o/r/actions/jobs/1/logs')).toMatchObject({ ok: false, failure: 'forbidden', message: 'Must have admin rights to Repository.' });
  });
});

describe('الطلبات الشرطية بـETag', () => {
  it('الطلب الثاني يحمل If-None-Match، و304 يعيد النسخة المحفوظة موسومة fromCache', async () => {
    const net = fakeFetch((call, i) => (i === 0 ? { status: 200, body: { v: 1 }, headers: { ...rateHeaders(10), etag: 'W/"abc"' } } : { status: 304, headers: { ...rateHeaders(9), etag: 'W/"abc"' } }));
    const client = new PublicApiClient({ permissions: permissions(true), fetch: net.fn });
    await client.get('/repos/o/r');
    const again = await client.get<{ v: number }>('/repos/o/r');
    expect(headerOf(net.calls[1], 'if-none-match')).toBe('W/"abc"');
    expect(again).toMatchObject({ ok: true, status: 304, data: { v: 1 }, fromCache: true });
    // الطلب الشرطي العام يُحتسب من الحد (VER-12، T-0.3): الحد يُقرأ من استجابته ولا يُفترض توفيره.
    expect(client.rate()?.remaining).toBe(9);
  });
});

describe('تصفّح الصفحات', () => {
  const runs = (n: number, start = 0) => Array.from({ length: n }, (_, i) => ({ id: start + i, name: `job-${start + i}` }));

  it('check-runs = 230: ثلاث صفحات (100 و100 و30) وقائمة كاملة', async () => {
    const net = fakeFetch((call) => {
      const page = Number(new URL(call.url).searchParams.get('page'));
      return { status: 200, body: { total_count: 230, check_runs: runs(page === 3 ? 30 : 100, (page - 1) * 100) }, headers: rateHeaders(50) };
    });
    const port = directPort(new PublicApiClient({ permissions: permissions(true), fetch: net.fn }), permissions(true));
    const result = await port.getAll('/repos/o/r/commits/abc/check-runs', 'check_runs', 3);
    expect(result).toMatchObject({ ok: true, data: { total: 230, partial: false, pages: 3 } });
    expect(result.ok && result.data.items).toHaveLength(230);
    expect(net.calls.map((c) => new URL(c.url).search)).toEqual(['?per_page=100&page=1', '?per_page=100&page=2', '?per_page=100&page=3']);
  });

  it('check-runs = 350 بحد ثلاث صفحات: 300 مقروءة والقائمة جزئية معلنة', async () => {
    const net = fakeFetch(() => ({ status: 200, body: { total_count: 350, check_runs: runs(100) }, headers: rateHeaders(50) }));
    const client = new PublicApiClient({ permissions: permissions(true), fetch: net.fn });
    const result = await directPort(client, permissions(true)).getAll('/repos/o/r/commits/abc/check-runs', 'check_runs', 3);
    expect(result).toMatchObject({ ok: true, data: { total: 350, partial: true, pages: 3 } });
    expect(result.ok && result.data.items).toHaveLength(300);
  });
});

describe('منفذ الرسائل والخلفية', () => {
  it('isPublicApiRequest يقبل الرسائل المعرّفة وحدها', () => {
    expect(isPublicApiRequest({ type: PUBLIC_API_MESSAGE, op: 'status' })).toBe(true);
    expect(isPublicApiRequest({ type: PUBLIC_API_MESSAGE, op: 'get', path: '/repos/o/r' })).toBe(true);
    expect(isPublicApiRequest({ type: PUBLIC_API_MESSAGE, op: 'post', path: '/repos/o/r' })).toBe(false);
    expect(isPublicApiRequest({ type: 'other', op: 'get', path: '/x' })).toBe(false);
    expect(isPublicApiRequest(null)).toBe(false);
  });

  it('منفذ سكربت المحتوى: خلفية لا تردّ أو ترمي = فشل مصنَّف لا استثناء', async () => {
    const throwing = runtimePort({ sendMessage: async () => Promise.reject(new Error('Receiving end does not exist')) }, () => 7);
    expect(await throwing.get('/repos/o/r')).toMatchObject({ ok: false, failure: 'network', readAt: 7 });
    expect(await throwing.status()).toEqual({ granted: false, rate: null });
    const silent = runtimePort({ sendMessage: async () => undefined });
    expect(await silent.get('/repos/o/r')).toMatchObject({ ok: false, failure: 'network' });
  });

  it('الخلفية تجيب رسائل المنفذ بـsendResponse وتعيد true، وتتحقق من الصلاحية قبل كل طلب', async () => {
    const listeners: Array<(m: unknown, s: object, reply: (r?: unknown) => void) => unknown> = [];
    const perms = permissions(false);
    const net = fakeFetch(() => ({ status: 200, body: { number: 5 }, headers: rateHeaders(40) }));
    const api = {
      runtime: {
        getURL: (p: string) => p,
        openOptionsPage: vi.fn(async () => {}),
        sendMessage: vi.fn(async () => undefined),
        onMessage: { addListener: (l: (typeof listeners)[number]) => void listeners.push(l), removeListener: () => {} },
      },
      tabs: { sendMessage: vi.fn(async () => undefined), query: vi.fn(async () => []), create: vi.fn(async () => ({})) },
      permissions: perms,
    } as unknown as ExtensionApi;
    const area = new MemoryStorageArea();
    await startBackground({ api, target: 'chromium', binding: { area, changes: area }, fetch: net.fn }).ready;
    const ask = (message: unknown): Promise<{ returned: unknown; reply: unknown }> =>
      new Promise((resolve) => {
        let returned: unknown;
        returned = listeners[0]?.(message, {}, (reply) => resolve({ returned, reply }));
      });
    const denied = await ask({ type: PUBLIC_API_MESSAGE, op: 'get', path: '/repos/o/r/pulls/5' });
    expect(denied.returned).toBe(true);
    expect(denied.reply).toMatchObject({ ok: false, failure: 'permission' });
    expect(net.calls).toHaveLength(0);
    perms.granted = true;
    const status = await ask({ type: PUBLIC_API_MESSAGE, op: 'status' });
    expect(status.reply).toEqual({ granted: true, rate: null });
    const ok = (await ask({ type: PUBLIC_API_MESSAGE, op: 'get', path: '/repos/o/r/pulls/5' })).reply as PublicApiResult<{ number: number }>;
    expect(ok).toMatchObject({ ok: true, data: { number: 5 } });
    expect(perms.contains).toHaveBeenCalledWith({ origins: [API_GITHUB_ORIGIN] });
    expect((await ask({ type: PUBLIC_API_MESSAGE, op: 'status' })).reply).toMatchObject({ granted: true, rate: { remaining: 40, limit: 60 } });
  });

  it('handlePublicApiRequest يحصر الصفحات بين 1 و10', async () => {
    const getAll = vi.fn(async () => ({ ok: true }) as never);
    const port = { status: vi.fn(), get: vi.fn(), getAll };
    await handlePublicApiRequest({ type: PUBLIC_API_MESSAGE, op: 'get-all', path: '/repos/o/r/commits/a/check-runs', key: 'check_runs', maxPages: 500 }, port);
    await handlePublicApiRequest({ type: PUBLIC_API_MESSAGE, op: 'get-all', path: '/repos/o/r/commits/a/check-runs', key: 'check_runs', maxPages: 0 }, port);
    expect(getAll.mock.calls.map((c) => (c as unknown[])[2])).toEqual([10, 1]);
  });
});

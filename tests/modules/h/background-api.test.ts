// الوحدة (ح) فوق طبقة API العامة في الخلفية (AD-24): اللوحة والإعدادات ترسلان قراءاتهما إلى الخلفية الفعلية (startBackground) التي تملك
// PublicApiClient وحالته (الحد وRetry-After وETag)، فتشاركهما مع سكربت المحتوى بدل عميل ثانٍ في صفحة الإضافة. طلب الصلاحية يبقى في
// الصفحة (فعل مستخدم)، والتحقق منها قبل كل طلب في الخلفية. لا رمز ولا ترويسة تعبر الرسائل.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startBackground } from '../../../src/background/main';
import { MemoryStorageArea, PUBLIC_API_MESSAGE, runtimePort } from '../../../src/core';
import type { ExtensionApi } from '../../../src/core';
import { fetchLabelCounts } from '../../../src/modules/h/first-contribution';
import { githubApiAccess } from '../../../src/modules/h';
import { scanDocsFolder } from '../../../src/modules/h/readme-detector';
import { fakePermissions } from '../../core/ui-host/helpers';
import { TOKEN_PATTERN, fakeToken, tokenSystem } from '../d/token/helpers';

const T0 = Date.UTC(2026, 9, 24, 9, 0, 0);

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}
type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

const rate = (remaining: number, resource = 'core', reset = Math.floor(T0 / 1000) + 3600): Record<string, string> => ({
  'x-ratelimit-limit': resource === 'search' ? '10' : '60',
  'x-ratelimit-remaining': String(remaining),
  'x-ratelimit-reset': String(reset),
  'x-ratelimit-resource': resource,
});

const DOCS = [{ name: 'README.ar.md', path: 'docs/README.ar.md', type: 'file', html_url: 'https://github.com/octo/community/blob/main/docs/README.ar.md' }];

/** خلفية فعلية + شبكة وهمية + سياقان يتراسلان معها برسائل تعبر تسلسل JSON كما في runtime.sendMessage. */
async function system(reply: (call: Call, index: number) => Reply, options: { granted?: boolean } = {}) {
  const calls: Call[] = [];
  const net = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    const r = reply(call, calls.length - 1);
    return new Response(r.status === 304 ? null : JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json', ...r.headers } });
  });
  const permissions = fakePermissions(options.granted === false ? [] : ['https://api.github.com/*']);
  const listeners: Array<(m: unknown, s: object, reply: (r?: unknown) => void) => unknown> = [];
  const backgroundApi = {
    runtime: {
      getURL: (p: string) => p,
      sendMessage: vi.fn(async () => undefined),
      onMessage: { addListener: (l: (typeof listeners)[number]) => void listeners.push(l), removeListener: () => {} },
    },
    permissions,
  } as unknown as ExtensionApi;
  const area = new MemoryStorageArea();
  await startBackground({ api: backgroundApi, target: 'chromium', binding: { area, changes: area }, fetch: net as unknown as typeof fetch }).ready;
  const sent: unknown[] = [];
  const runtime = {
    sendMessage: (message: unknown) =>
      new Promise<unknown>((resolve) => {
        const copy = JSON.parse(JSON.stringify(message)) as unknown;
        sent.push(copy);
        listeners[0]?.(copy, {}, (response) => resolve(JSON.parse(JSON.stringify(response ?? null))));
      }),
  };
  /** اللوحة الأصلية: صفحة إضافة بواجهة صلاحياتها (الصلاحية المشتركة نفسها) وبمنفذ الخلفية. */
  const panel = githubApiAccess({ runtime, permissions } as unknown as ExtensionApi);
  /** سكربت المحتوى: منفذ الخلفية نفسه (كما تستعمله الوحدة (د) في الصفحة). */
  const page = runtimePort(runtime, () => Date.now());
  return { calls, net, permissions, sent, panel, page, listeners };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

describe('الصلاحيات: الطلب في الصفحة والتحقق في الخلفية', () => {
  it('رفض الصلاحية: لا طلب شبكة ولا رسالة قراءة، والفحص يعلن عدم الاكتمال', async () => {
    const s = await system(() => ({ status: 200, body: DOCS }), { granted: false });
    s.permissions.answer = false;
    const result = await scanDocsFolder(s.panel, 'octo', 'community');
    expect(result).toMatchObject({ state: 'incomplete', reason: 'declined', requests: 0 });
    expect(s.permissions.request).toHaveBeenCalledTimes(1);
    expect(s.calls).toEqual([]);
    expect(s.sent).toEqual([]);
  });

  it('المنح بنقر: الطلب من الصفحة، وقراءة واحدة من الخلفية إلى api.github.com بـGET وبلا Authorization', async () => {
    const s = await system(() => ({ status: 200, body: DOCS, headers: rate(55) }), { granted: false });
    const result = await scanDocsFolder(s.panel, 'octo', 'community');
    expect(result).toMatchObject({ state: 'found', requests: 1 });
    expect(s.permissions.request).toHaveBeenCalledTimes(1);
    expect(s.calls).toHaveLength(1);
    expect(s.calls[0]?.url).toBe('https://api.github.com/repos/octo/community/contents/docs');
    expect(s.calls[0]?.init.method).toBe('GET');
    expect(s.calls[0]?.init.credentials).toBe('omit');
    expect(Object.keys((s.calls[0]?.init.headers ?? {}) as Record<string, string>).map((k) => k.toLowerCase())).not.toContain('authorization');
  });

  it('سحب الصلاحية بعد المنح: الخلفية ترفض قبل أي طلب شبكة ولو بقيت الصفحة تظن أنها ممنوحة', async () => {
    const s = await system(() => ({ status: 200, body: DOCS }));
    s.permissions.external('removed', { origins: ['https://api.github.com/*'] });
    const result = await s.panel.get('/repos/octo/community/contents/docs');
    expect(result).toMatchObject({ ok: false, failure: 'permission' });
    expect(s.calls).toEqual([]);
    expect(s.permissions.contains).toHaveBeenCalled();
  });

  it('السياق بلا واجهة صلاحيات (الصفحة والدرج) يبقى غير متاح: لا رسالة ولا طلب', async () => {
    const s = await system(() => ({ status: 200, body: DOCS }));
    const inPage = githubApiAccess({ runtime: { sendMessage: async () => undefined } as never });
    expect(inPage.available).toBe(false);
    await expect(inPage.get('/repos/octo/community')).rejects.toMatchObject({ code: 'api-unavailable-here' });
    expect(await scanDocsFolder(inPage, 'octo', 'community')).toMatchObject({ state: 'incomplete', reason: 'unavailable', requests: 0 });
    expect(s.sent).toEqual([]);
    expect(s.calls).toEqual([]);
  });
});

describe('حدود الطلبات وRetry-After مشتركة بين السياقات', () => {
  it('429 بـRetry-After لفحص اللوحة: لا طلب ثانٍ من اللوحة ولا من سكربت المحتوى قبل الموعد، والرسالة تذكر الوقت', async () => {
    const s = await system((_, i) => (i === 0 ? { status: 429, body: { message: 'secondary rate limit' }, headers: { ...rate(50), 'retry-after': '90' } } : { status: 200, body: DOCS }));
    const first = await scanDocsFolder(s.panel, 'octo', 'community');
    expect(first).toMatchObject({ state: 'incomplete', reason: 'rate-limit' });
    expect(first.state === 'incomplete' && first.message).toMatch(/\d{2}:\d{2}/);
    expect(s.calls).toHaveLength(1);

    vi.setSystemTime(T0 + 89_000);
    expect(await scanDocsFolder(s.panel, 'octo', 'community')).toMatchObject({ state: 'incomplete', reason: 'rate-limit', requests: 1 });
    // مستهلك آخر للعميل نفسه (سكربت المحتوى في الوحدة (د)) يُرفض محليًا كذلك.
    expect(await s.page.get('/repos/octo/demo/pulls/4')).toMatchObject({ ok: false, failure: 'rate-limit', retryAt: T0 + 90_000 });
    expect(s.calls).toHaveLength(1);

    vi.setSystemTime(T0 + 90_001);
    expect(await scanDocsFolder(s.panel, 'octo', 'community')).toMatchObject({ state: 'found' });
    expect(s.calls).toHaveLength(2);
  });

  it('الاتجاه المعاكس: رفض الوحدة (د) بحد ثانوي يوقف فحص اللوحة بلا طلب', async () => {
    const s = await system((_, i) => (i === 0 ? { status: 429, body: {}, headers: { ...rate(40), 'retry-after': '30' } } : { status: 200, body: DOCS }));
    expect(await s.page.get('/repos/octo/demo/pulls/4')).toMatchObject({ ok: false, failure: 'rate-limit' });
    expect(await scanDocsFolder(s.panel, 'octo', 'community')).toMatchObject({ state: 'incomplete', reason: 'rate-limit', requests: 1 });
    expect(s.calls).toHaveLength(1);
  });

  it('مورد البحث منفصل عن core: نفاد البحث لا يمنع فحص docs/، ونفاد core لا يمنع الأعداد', async () => {
    const searchDone = await system((call) => (call.url.includes('/search/') ? { status: 403, body: { message: 'API rate limit exceeded' }, headers: rate(0, 'search', Math.floor(T0 / 1000) + 60) } : { status: 200, body: DOCS, headers: rate(50) }));
    const counts = await fetchLabelCounts(searchDone.panel, 'octo', 'community');
    expect(counts.map((c) => (c.count === null ? c.reason : c.count))).toEqual(['rate-limit', 'rate-limit', 'rate-limit']);
    expect(searchDone.calls).toHaveLength(1);
    expect(await scanDocsFolder(searchDone.panel, 'octo', 'community')).toMatchObject({ state: 'found' });
    expect(searchDone.calls).toHaveLength(2);

    const coreDone = await system((call) => (call.url.includes('/search/') ? { status: 200, body: { total_count: 5 }, headers: rate(9, 'search') } : { status: 403, body: {}, headers: rate(0, 'core', Math.floor(T0 / 1000) + 60) }));
    expect(await scanDocsFolder(coreDone.panel, 'octo', 'community')).toMatchObject({ reason: 'rate-limit' });
    expect((await fetchLabelCounts(coreDone.panel, 'octo', 'community')).map((c) => c.count)).toEqual([5, 5, 5]);
  });

  it('ETag مشترك: القراءة الثانية لـdocs/ شرطية (If-None-Match) وتُجاب من نسخة الخلفية عند 304', async () => {
    const s = await system((call) => (new Headers(call.init.headers).get('if-none-match') === '"v1"' ? { status: 304 } : { status: 200, body: DOCS, headers: { etag: '"v1"', ...rate(50) } }));
    expect(await scanDocsFolder(s.panel, 'octo', 'community')).toMatchObject({ state: 'found' });
    expect(await scanDocsFolder(s.panel, 'octo', 'community')).toMatchObject({ state: 'found' });
    expect(s.calls).toHaveLength(2);
    expect(new Headers(s.calls[1]?.init.headers).get('if-none-match')).toBe('"v1"');
  });

  it('النسخة المحفوظة تخص مسار مستودعها وحده: مستودع آخر لا يستلم ETag ولا بيانات الأول', async () => {
    const s = await system((call) => (call.url.includes('/octo/one/') ? { status: 200, body: DOCS, headers: { etag: '"one"' } } : { status: 404, body: {} }));
    await scanDocsFolder(s.panel, 'octo', 'one');
    const other = await scanDocsFolder(s.panel, 'octo', 'two');
    expect(other).toMatchObject({ state: 'incomplete', reason: 'not-found' });
    expect(new Headers(s.calls[1]?.init.headers).get('if-none-match')).toBeNull();
  });
});

describe('لا رمز ولا ترويسة تعبر إلى الصفحة', () => {
  it('الرسائل من اللوحة تحمل العملية والمسار وحدهما، والرد بلا ترويسات ولا Authorization', async () => {
    const s = await system(() => ({ status: 200, body: DOCS, headers: { ...rate(50), etag: '"x"' } }));
    await scanDocsFolder(s.panel, 'octo', 'community');
    await fetchLabelCounts(s.panel, 'octo', 'community');
    for (const message of s.sent as Array<Record<string, unknown>>) {
      expect(message.type).toBe(PUBLIC_API_MESSAGE);
      expect(Object.keys(message).sort()).toEqual(['op', 'path', 'type']);
    }
    const reply = JSON.stringify(await s.panel.get('/repos/octo/community/contents/docs'));
    expect(reply.toLowerCase()).not.toContain('authorization');
    expect(reply.toLowerCase()).not.toContain('bearer');
  });

  it('رسالة مزوّرة تحمل ترويسات أو رمزًا: تُهمل حقولها ولا يخرج Authorization إلى الشبكة', async () => {
    const s = await system(() => ({ status: 200, body: {} }));
    const forged = { type: PUBLIC_API_MESSAGE, op: 'get', path: '/repos/octo/community', headers: { Authorization: 'Bearer secret' }, authorization: 'Bearer secret', token: 'secret', credentials: 'include' };
    await new Promise<void>((resolve) => void s.listeners[0]?.(forged, {}, () => resolve()));
    expect(s.calls).toHaveLength(1);
    const headers = (s.calls[0]?.init.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('authorization');
    expect(JSON.stringify(s.calls[0])).not.toContain('secret');
    expect(s.calls[0]?.init.credentials).toBe('omit');
  });
});

// MJ15 (T-5.5، AD-24): رمز حقيقي الشكل محفوظ في الخلفية. الوحدة (ح) في اللوحة والوحدة (د) في الصفحة تقرآن بالطبقة نفسها، فتصل ترويسته
// إلى api.github.com من الخلفية وحدها، ولا يظهر الرمز في أي رسالة أو ردّ أو سجل (وDOM الصفحة في tests/modules/d/token/background-token.test.tsx).
describe('رمز في الخلفية: لا يظهر في رسالة ولا ردّ ولا سجل', () => {
  it('اللوحة والصفحة تقرآن بالرمز عبر الخلفية، والرمز صفر ظهور خارجها', async () => {
    const logs: string[] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(' ')));
    const token = fakeToken('H');
    const s = await tokenSystem((call) => (call.url.includes('/search/') ? { status: 200, body: { total_count: 3 }, headers: rate(29, 'search') } : { status: 200, body: DOCS, headers: { ...rate(4990), 'github-authentication-token-expiration': '2026-10-30 14:25:10 UTC' } }));
    await s.store.save(token, 'session');
    const panel = githubApiAccess({ runtime: s.runtime, permissions: s.permissions } as unknown as ExtensionApi);
    expect(await scanDocsFolder(panel, 'octo', 'community')).toMatchObject({ state: 'found' });
    expect((await fetchLabelCounts(panel, 'octo', 'community')).map((c) => c.count)).toEqual([3, 3, 3]);
    await s.port.get('/repos/octo/community/pulls/4');
    await s.port.status();
    expect(s.calls.length).toBeGreaterThan(0);
    for (const call of s.calls) expect(new Headers(call.init.headers).get('authorization')).toBe(`Bearer ${token}`);
    const outside = JSON.stringify([s.sent, s.replies]) + logs.join('\n');
    expect(outside).not.toMatch(TOKEN_PATTERN);
    expect(outside.toLowerCase()).not.toContain('bearer');
    vi.restoreAllMocks();
  });
});

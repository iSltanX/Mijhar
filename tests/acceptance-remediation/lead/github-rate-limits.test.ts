/**
 * MJ-TA-06 (Codex) — حراسة الإصلاح: الحد الثانوي في GitHub (403 أو 429 والحد الأساسي لم ينفد) حدٌّ بموعده، لكن رفض الصلاحية العادي (403 بلا
 * retry-after ولا رسالة حد ثانوي) يبقى «forbidden» بلا موعد ولا يحجب الطلبات التالية؛ ونفاد الحد الأساسي يبقى حتى reset. محاكاة محلية بلا شبكة.
 */
import { describe, expect, it, vi } from 'vitest';
import { PublicApiClient, readRetryAfter } from '../../../src/core/api/client';
import { fakePermissions } from '../../core/ui-host/helpers';

const NOW = 1_800_000_000_000;
const response = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const client = (net: ReturnType<typeof vi.fn>) => new PublicApiClient({ permissions: fakePermissions(['https://api.github.com/*']), fetch: net as unknown as typeof fetch, now: () => NOW });

describe('MJ-TA-06: الحد الثانوي لا يلتبس برفض الصلاحية', () => {
  it('403 رفض صلاحية (بلا retry-after ولا رسالة حد): forbidden بلا موعد، والطلب التالي يُرسل', async () => {
    const net = vi.fn().mockResolvedValueOnce(response(403, { message: 'Resource not accessible by personal access token' }, { 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999' })).mockResolvedValueOnce(response(200, {}));
    const c = client(net);
    expect(await c.get('/repos/audit/synthetic')).toMatchObject({ ok: false, failure: 'forbidden', retryAt: null });
    expect((await c.get('/repos/audit/synthetic')).ok).toBe(true);
    expect(net).toHaveBeenCalledTimes(2);
  });

  it('403 برسالة الحد الثانوي بلا retry-after: rate-limit بدقيقة على الأقل، ولا طلب قبلها', async () => {
    const net = vi.fn().mockResolvedValueOnce(response(403, { message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' }, { 'x-ratelimit-remaining': '4999' })).mockResolvedValueOnce(response(200, {}));
    const c = client(net);
    expect(await c.get('/repos/audit/synthetic')).toMatchObject({ ok: false, failure: 'rate-limit', retryAt: NOW + 60_000 });
    expect(await c.get('/repos/audit/synthetic')).toMatchObject({ ok: false, failure: 'rate-limit' });
    expect(net).toHaveBeenCalledTimes(1);
  });

  it('403 بنفاد الحد الأساسي: rate-limit حتى reset كما كان', async () => {
    const net = vi.fn().mockResolvedValueOnce(response(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-limit': '60', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(NOW / 1000 + 300) }));
    expect(await client(net).get('/repos/audit/synthetic')).toMatchObject({ ok: false, failure: 'rate-limit', retryAt: NOW + 300_000 });
  });

  it('readRetryAfter: ثوانٍ وتاريخ HTTP، وما مضى أو تالف null', () => {
    expect(readRetryAfter(new Headers({ 'retry-after': '30' }), NOW)).toBe(NOW + 30_000);
    expect(readRetryAfter(new Headers({ 'retry-after': new Date(NOW + 90_000).toUTCString() }), NOW)).toBe(NOW + 90_000);
    expect(readRetryAfter(new Headers({ 'retry-after': new Date(NOW - 1000).toUTCString() }), NOW)).toBeNull();
    expect(readRetryAfter(new Headers({ 'retry-after': 'soon' }), NOW)).toBeNull();
    expect(readRetryAfter(new Headers({}), NOW)).toBeNull();
  });
});

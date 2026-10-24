// TEST-PR-06 (وحدة، AC-D8): حالة الوصول لكل إشارة في جدول evidence/T-0.5 كما في fixture-token-states.json، ونصها لا يلتبس بالنجاح ويعلن
// «غير معروف»؛ وربط القراءة بالمستودع والفرع والالتزام يكشف تغيّر أيٍّ منها، ورأس مجهول ليس تطابقًا.
import { describe, expect, it } from 'vitest';
import { PublicApiClient } from '../../../../src/core/api/client';
import type { PublicApiResult } from '../../../../src/core/api/client';
import { ACCESS_LABEL, UNKNOWN_TEXT, accessOf, accessText } from '../../../../src/modules/d/status/access';
import type { AccessKind } from '../../../../src/modules/d/status/access';
import { compareBinding } from '../../../../src/modules/d/status/binding';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { FIXTURE, fakeToken } from '../token/helpers';
import type { Reply } from '../token/helpers';

const TOKEN = fakeToken('P');
const NOW = Date.UTC(2026, 9, 23, 14, 30);

async function resultOf(reply: Reply, path = '/repos/o/r/pulls/7', token: string | null = TOKEN, granted = true): Promise<PublicApiResult<unknown>> {
  const net = async () => new Response(JSON.stringify(reply.body ?? {}), { status: reply.status, headers: { 'content-type': 'application/json', ...reply.headers } });
  const client = new PublicApiClient({ permissions: fakePermissions(granted ? ['https://api.github.com/*'] : []), fetch: net as unknown as typeof fetch, now: () => NOW, ...(token ? { token: async () => token } : {}) });
  return client.get(path);
}
const state = (name: string): Reply => FIXTURE.states[name] as Reply;

describe('حالة الوصول لكل إشارة', () => {
  it('رمز منتهٍ، ناقص صلاحية لنقطة بعينها، تجاوز حد بموعده، غير متاحة للمستودع، صلاحية غير ممنوحة', async () => {
    expect(accessOf(await resultOf(state('expired')))).toMatchObject({ kind: 'expired', authenticated: true, status: 401 });
    const actions: Reply = { ...state('missing-permission'), headers: { ...state('missing-permission').headers, 'x-accepted-github-permissions': 'actions=read' } };
    expect(accessOf(await resultOf(actions, '/repos/o/r/actions/runs?head_sha=abc'))).toMatchObject({ kind: 'insufficient', permission: 'Actions' });
    const limited = accessOf(await resultOf(state('rate-limited')));
    expect(limited).toMatchObject({ kind: 'rate-limited', retryAt: 1_792_768_532_000, authenticated: true });
    expect(accessOf(await resultOf(state('secondary-limit')))).toMatchObject({ kind: 'rate-limited', retryAt: NOW + 60_000 });
    const anonymous404 = accessOf(await resultOf(state('not-found'), '/repos/o/r/pulls/7', null));
    expect(anonymous404).toMatchObject({ kind: 'unavailable', authenticated: false });
    expect(anonymous404.reason).toContain('قد يكون المستودع خاصًا');
    expect(accessOf(await resultOf(state('not-found'))).reason).toContain('لا يشمله الرمز');
    expect(accessOf(await resultOf(state('valid'), '/repos/o/r/pulls/7', TOKEN, false)).kind).toBe('no-permission');
  });

  it('check-runs المرفوضة للرمز (checks=read) غير متاحة بالرمز لا نقص فيه', async () => {
    const access = accessOf(await resultOf(state('missing-permission'), '/repos/o/r/commits/abc/check-runs'));
    expect(access.kind).toBe('unavailable');
    expect(access.permission).toBe('checks');
  });

  it('كل حالة غير «قُرئت» تعلن «غير معروف» ولا ناجحة ولا خالية من المشكلات، بنص مختلف لكل حالة', () => {
    const kinds = Object.keys(ACCESS_LABEL).filter((k) => k !== 'read') as AccessKind[];
    const texts = kinds.map((kind) => accessText('الفحوص من API', { kind, authenticated: true, retryAt: NOW, permission: 'Actions', reason: 'سبب' }));
    expect(new Set(texts).size).toBe(kinds.length);
    for (const text of texts) {
      expect(text).toContain(UNKNOWN_TEXT);
      expect(text).toContain('ولا تُعدّ نجاحًا ولا خلوًّا من المشكلات');
      expect(text).not.toMatch(/قُرئت|نجحت|كلها ناجحة|لا مشكلات/);
    }
    expect(accessText('الفحوص من API', { kind: 'read', authenticated: true })).toBe('الفحوص من API: قُرئت بالرمز.');
  });
});

describe('ربط القراءة بالمستودع والفرع والالتزام', () => {
  const read = { repo: 'octo/demo', branch: 'feature/ui-refresh', commit: '22c15d5f509f0a7076b74b3f0f48a740802103b4', readAt: NOW };
  const page = { repo: 'Octo/Demo', branch: 'feature/ui-refresh', commit: '22c15d5', readAt: null };

  it('نفس المستودع (بلا حالة الأحرف) والفرع والالتزام (ولو مختصرًا بسبعة أحرف): مطابقة', () => {
    expect(compareBinding(read, page)).toEqual({ same: true });
  });

  it('تغيّر الالتزام أو الفرع أو المستودع يُعلن بعينه؛ ورأس مجهول في الصفحة ليس تطابقًا', () => {
    expect(compareBinding(read, { ...page, commit: 'aaaaaaaa' })).toEqual({ same: false, changed: ['commit'] });
    expect(compareBinding(read, { ...page, branch: 'main' })).toEqual({ same: false, changed: ['branch'] });
    expect(compareBinding(read, { ...page, repo: 'octo/other' })).toEqual({ same: false, changed: ['repo'] });
    expect(compareBinding(read, { ...page, commit: null })).toEqual({ same: false, changed: ['commit'] });
    expect(compareBinding(read, { ...page, commit: '22c15d' })).toEqual({ same: false, changed: ['commit'] });
    // فرع لا تعرضه الصفحة لا يُعدّ تغيّرًا ما دام الالتزام نفسه.
    expect(compareBinding(read, { ...page, branch: null })).toEqual({ same: true });
  });
});

// TEST-COMM-05 — فحص الروابط عند الطلب: روابط github.com وحدها عبر api.github.com بالصلاحية الاختيارية، والخارجية لا طلب لها.
import { describe, expect, it } from 'vitest';
import { checkResources } from '../../../../src/modules/h/resources';
import type { Resource } from '../../../../src/modules/h/resources';
import { fakeAccess } from '../helpers';
import { BUILTIN } from './helpers';

const gh = (slug: string, patch: Partial<Resource> = {}): Resource => ({ ...BUILTIN[0]!, id: slug.replace('/', '-').toLowerCase(), url: `https://github.com/${slug}`, status: 'unverified', lastVerified: null, ...patch });
const external = (id: string): Resource => ({ ...BUILTIN[0]!, id, url: `https://example.org/${id}` });
const TODAY = '2026-10-23';

const repoInfo = (over: Record<string, unknown> = {}) => ({ body: { full_name: 'octo/demo', html_url: 'https://github.com/octo/demo', archived: false, pushed_at: '2026-10-01T12:00:00Z', license: { spdx_id: 'MIT' }, ...over } });

describe('checkResources', () => {
  it('الصلاحية أولًا ثم GET /repos/<owner>/<repo>؛ وغير المؤرشف نشط بتاريخ اليوم وآخر دفع والترخيص', async () => {
    const access = fakeAccess(() => repoInfo());
    const report = await checkResources(access, [gh('octo/demo')], { today: TODAY });
    expect(access.calls).toEqual(['request', 'fetch']);
    expect(access.requests.map((r) => r.path)).toEqual(['/repos/octo/demo']);
    expect(report.outcomes.get('octo-demo')).toEqual({
      kind: 'verified',
      patch: expect.objectContaining({ status: 'active', lastVerified: TODAY, lastPush: '2026-10-01', license: 'MIT', movedTo: null }),
    });
    expect(report).toMatchObject({ requests: 1, stoppedBy: null, remaining: 0 });
  });

  it('مستودع مؤرشف', async () => {
    const report = await checkResources(fakeAccess(() => repoInfo({ archived: true })), [gh('octo/demo')], { today: TODAY });
    expect(report.outcomes.get('octo-demo')).toMatchObject({ kind: 'verified', patch: { status: 'archived', lastVerified: TODAY } });
  });

  it('مستودع نُقل أو أُعيدت تسميته: يُقترح الرابط الجديد ولا يُطبَّق', async () => {
    const report = await checkResources(fakeAccess(() => repoInfo({ full_name: 'newowner/renamed', html_url: 'https://github.com/newowner/renamed' })), [gh('octo/demo')], { today: TODAY });
    const outcome = report.outcomes.get('octo-demo');
    expect(outcome).toMatchObject({ kind: 'verified', patch: { movedTo: 'https://github.com/newowner/renamed' } });
    expect(outcome?.kind === 'verified' && outcome.patch.url).toBeUndefined();
  });

  it('اختلاف حالة الأحرف في الاسم ليس نقلًا', async () => {
    const report = await checkResources(fakeAccess(() => repoInfo({ full_name: 'Octo/Demo' })), [gh('octo/demo')], { today: TODAY });
    expect(report.outcomes.get('octo-demo')).toMatchObject({ patch: { movedTo: null } });
  });

  it('404: تعذّر الوصول، بصياغة لا تجزم بالحذف ولا تمس تاريخ التحقق السابق', async () => {
    const report = await checkResources(fakeAccess(() => ({ status: 404 })), [gh('octo/gone', { lastVerified: '2026-01-01', status: 'active' })], { today: TODAY });
    const outcome = report.outcomes.get('octo-gone');
    expect(outcome).toMatchObject({ kind: 'unreachable', patch: { status: 'unreachable' } });
    expect(outcome?.kind === 'unreachable' && outcome.patch.lastVerified).toBeUndefined();
    expect(outcome?.kind === 'unreachable' && outcome.patch.note).toMatch(/قد يكون حُذف أو نُقل أو أصبح خاصًا/);
  });

  it('الروابط الخارجية: لا طلب لها، وتبقى لمراجعة بشرية', async () => {
    const access = fakeAccess(() => repoInfo());
    const report = await checkResources(access, [external('a'), gh('octo/demo'), external('b')], { today: TODAY });
    expect(access.requests.map((r) => r.path)).toEqual(['/repos/octo/demo']);
    expect(report.outcomes.get('a')).toEqual({ kind: 'skipped', reason: 'external' });
    expect(report.outcomes.get('b')).toEqual({ kind: 'skipped', reason: 'external' });
  });

  it('قائمة خارجية كلها: لا طلب صلاحية ولا شبكة', async () => {
    const access = fakeAccess(() => repoInfo());
    const report = await checkResources(access, [external('a'), external('b')], { today: TODAY });
    expect(access.calls).toEqual([]);
    expect(report).toMatchObject({ requests: 0, stoppedBy: null, remaining: 0 });
  });

  it('رفض الصلاحية: لا طلب، ويبقى كل شيء', async () => {
    const access = fakeAccess(() => repoInfo(), { granted: false });
    const report = await checkResources(access, [gh('a/b'), gh('c/d')], { today: TODAY });
    expect(access.calls).toEqual(['request']);
    expect(report).toMatchObject({ requests: 0, stoppedBy: 'declined', remaining: 2 });
  });

  it('سياق بلا واجهة الصلاحيات: لا طلب', async () => {
    const access = fakeAccess(() => repoInfo(), { available: false });
    const report = await checkResources(access, [gh('a/b')], { today: TODAY });
    expect(access.calls).toEqual([]);
    expect(report.stoppedBy).toBe('unavailable');
  });

  it('حد الطلبات يوقف الباقي ويبقي ما أُنجز', async () => {
    let n = 0;
    const access = fakeAccess(() => (++n === 3 ? { status: 403, headers: { 'x-ratelimit-remaining': '0' } } : repoInfo()));
    const report = await checkResources(access, ['a/a', 'b/b', 'c/c', 'd/d', 'e/e'].map((s) => gh(s)), { today: TODAY });
    expect(report.stoppedBy).toBe('rate-limit');
    expect(report.requests).toBe(3);
    expect(report.remaining).toBe(3);
    expect(access.requests).toHaveLength(3);
    expect([...report.outcomes.values()].filter((o) => o.kind === 'verified')).toHaveLength(2);
  });

  it('سقف الطلبات في النقرة الواحدة', async () => {
    const access = fakeAccess(() => repoInfo());
    const list = Array.from({ length: 25 }, (_, i) => gh(`o/r${i}`));
    const report = await checkResources(access, list, { today: TODAY });
    expect(report).toMatchObject({ requests: 20, stoppedBy: 'limit', remaining: 5 });
    expect(access.requests).toHaveLength(20);
    const few = await checkResources(fakeAccess(() => repoInfo()), list, { today: TODAY, max: 3 });
    expect(few.requests).toBe(3);
  });

  it('ردّ بلا حقل archived: فشل غير متوقع لا حالة مختلقة', async () => {
    const report = await checkResources(fakeAccess(() => ({ body: { full_name: 'octo/demo' } })), [gh('octo/demo')], { today: TODAY });
    expect(report.outcomes.get('octo-demo')).toEqual({ kind: 'failed', reason: 'unexpected' });
  });

  // الوصول يقبل مسار القراءة وحده (لا ترويسات ولا جسم ولا اعتماد): الطلب والترويسات تبنيها طبقة الخلفية (اختبارها في background-api.test.ts).
  it('تدقيق الشبكة: قراءات /repos/<owner>/<repo> فقط، ولا واجهة لترويسات أو جسم', async () => {
    const access = fakeAccess(() => repoInfo());
    await checkResources(access, [gh('a/b'), gh('c/d'), external('x')], { today: TODAY });
    expect(access.requests.map((r) => r.path)).toEqual(['/repos/a/b', '/repos/c/d']);
    expect(access.get.length).toBe(1);
    for (const request of access.requests) expect(Object.keys(request)).toEqual(['path']);
  });
});

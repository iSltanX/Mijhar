// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo-owner/private-demo/pull/7"}
// النظام كاملًا بالرمز: خلفية فعلية (startBackground) بمخزن رمز، وسكربت محتوى يراسلها بـruntimePort، وبطاقة حالة طلب الدمج في الصفحة.
//  - TEST-PR-05 (AC-D7) على fixture-token-states.json: مستودع خاص بالرمز ← الطلب وفحوص Actions (لأن check-runs ترفض الرمز) وحالة الالتزام
//    وحماية الفرع، وتظهر في البطاقة بمصدرها «بالرمز»؛ وبعد مسح الرمز تعمل البطاقة على الصفحة وتعلن ما لم يتوفر بلا خطأ موقِف ولا نسخة
//    محفوظة من المستودع الخاص؛ وكل الطلبات GET إلى مسارات قراءة.
//  - TEST-SEC-01/02 على مستوى الوحدة: الرمز لا يظهر في أي رسالة إلى الخلفية ولا ردّ منها ولا DOM الصفحة ولا سجل (console) ولا رسالة
//    خطأ ولا رابط؛ وترويسة Authorization في طلبات الخلفية وحدها. والقياس الفعلي في المتصفحات في tests/modules/d/token/browser.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PUBLIC_API_MESSAGE } from '../../../../src/core';
import { readPrApi } from '../../../../src/modules/d/blockers';
import { createPrStatusModule } from '../../../../src/modules/d/pr-status';
import { flush, hostsOf, loadHtmlText, mountModules, readFixture, shadowText } from '../helpers';
import { FIXTURE, TOKEN_PATTERN, authHeader, fakeToken, privateRepoReply, tokenSystem } from './helpers';
import type { Call } from './helpers';

const TOKEN = fakeToken('E');
const P = FIXTURE.privateRepo;
const pathOf = (call: Call): string => {
  const url = new URL(call.url);
  return `${url.pathname}${url.search}`;
};

/** المستودع الخاص: بالرمز ردود العينة، وبلا رمز 404. */
const privateNet = (call: Call) => privateRepoReply(pathOf(call), Boolean(authHeader(call)));

let logs: string[] = [];
beforeEach(() => {
  logs = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message} ${a.stack ?? ''}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

/** صفحة الطلب الخاص: العينة المرجعية بهوية المستودع الخاص ورأسه. */
function loadPrivatePr(): void {
  const html = readFixture('fixture-pr-complex.html')
    .replaceAll('octo/demo', `${P.owner}/${P.repo}`)
    .replaceAll('octo-dev/demo', `${P.owner}/${P.repo}`)
    .replaceAll('4242', String(P.number))
    .replaceAll('22c15d5f509f0a7076b74b3f0f48a740802103b4', P.headSha);
  loadHtmlText(html);
}

describe('TEST-PR-05 (AC-D7): المستودع الخاص بالرمز ثم بدونه', () => {
  it('بالرمز: الطلب وفحوص Actions وحالة الالتزام وحماية الفرع؛ والفحوص من Actions بمصدرها وما لا يتاح معلن', async () => {
    const s = await tokenSystem(privateNet);
    await s.store.save(TOKEN, 'session');
    const data = await readPrApi(s.port, P.owner, P.repo, P.number, () => 1);
    expect(data.authenticated).toBe(true);
    expect(data.pull).toMatchObject({ available: true, value: { number: 7, mergeableState: 'blocked', headSha: P.headSha } });
    expect(data.required).toEqual({ available: true, value: ['ci / lint'] });
    expect(data.checks.available).toBe(true);
    if (!data.checks.available) return;
    const checks = data.checks.value;
    expect(checks.via).toBe('actions');
    expect(checks.note).toContain('غير متاحة');
    expect(checks.noneReported).toBe(false);
    expect(checks.items.map((i) => [i.name, i.classification.category, i.required, i.id])).toEqual([
      ['ci / lint', 'failure', true, '51001'],
      ['ci / test', 'success', null, '51002'],
      ['deploy/preview', 'success', null, null],
    ]);
    expect(checks.items[0]?.detail).toBe('الخطوة 3: Run npm run lint (failure)');
    // كل الطلبات من الخلفية: GET بالرمز إلى مسارات قراءة، ولا كتابة.
    for (const call of s.calls) {
      expect(call.init.method).toBe('GET');
      expect(authHeader(call)).toBe(`Bearer ${TOKEN}`);
      expect(new URL(call.url).host).toBe('api.github.com');
    }
    expect(s.calls.map(pathOf)).toContain(`/repos/${P.owner}/${P.repo}/actions/runs/9100/jobs?per_page=100&page=1`);
  });

  it('البطاقة في الصفحة تعرض المصدر «DOM + API (بالرمز)» وفحوص المستودع الخاص؛ وبعد المسح تعمل بلا رمز وتعلن ما لم يتوفر', async () => {
    const s = await tokenSystem(privateNet);
    await s.store.save(TOKEN, 'disk');
    loadPrivatePr();
    const fragment = async () => readFixture('fixture-status-details.html');
    const { manager, errors } = await mountModules([createPrStatusModule({ debounceMs: 5, fetchDetails: fragment, api: s.port, staleMs: () => 300_000 })]);
    await flush(30);
    const root = () => hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
    expect(root().querySelector('[data-api-auth="token"]')).not.toBeNull();
    (root().querySelector('[data-action="api-read"]') as HTMLButtonElement).click();
    await flush(40);
    expect(root().querySelector('[data-source]')?.getAttribute('data-source')).toBe('DOM + API (بالرمز)');
    expect(root().querySelector('[data-api-via="actions"]')).not.toBeNull();
    const withToken = shadowText(hostsOf('d.pr-status')[0]);
    expect(withToken).toContain('ci / lint');
    expect(withToken).toContain('الخطوة 3: Run npm run lint');
    manager.stop();

    // مسح الرمز من الإعدادات: الخلفية تلاحظ غيابه، فلا نسخة من المستودع الخاص تُخدم بلا رمز.
    await s.store.clear();
    const before = s.calls.length;
    const again = await mountModules([createPrStatusModule({ debounceMs: 5, fetchDetails: fragment, api: s.port, staleMs: () => 300_000 })]);
    await flush(30);
    expect(root().querySelector('[data-api-auth="token"]')).toBeNull();
    (root().querySelector('[data-action="api-read"]') as HTMLButtonElement).click();
    await flush(40);
    expect(root().querySelector('[data-api-error="pull"]')?.textContent).toContain('404');
    expect(root().querySelector('[data-source]')?.getAttribute('data-source')).toBe('DOM');
    const without = shadowText(hostsOf('d.pr-status')[0]);
    expect(without).not.toContain('الخطوة 3: Run npm run lint');
    // الصفحة ما زالت تُقرأ: صفوف الفحوص من DOM.
    expect(without).toContain('ci / lint (pull_request)');
    for (const call of s.calls.slice(before)) expect(authHeader(call)).toBeNull();
    expect(errors).toEqual([]);
    again.manager.stop();
  });
});

describe('TEST-SEC-01/02 (وحدة): لا رمز خارج الخلفية', () => {
  it('كل رسالة من الصفحة وكل ردّ إليها وDOM الصفحة والسجل: صفر ظهور للرمز، في حالات النجاح والرفض', async () => {
    const states = ['valid', 'invalid', 'missing-permission', 'rate-limited', 'secondary-limit', 'not-found'];
    for (const name of states) {
      const reply = FIXTURE.states[name];
      if (!reply) throw new Error(name);
      const s = await tokenSystem(() => reply);
      await s.store.save(TOKEN, 'session');
      const results = [await s.port.status(), await s.port.get('/repos/o/r'), await s.port.getAll('/repos/o/r/commits/abc/check-runs', 'check_runs', 2), await s.port.get('/rate_limit'), await s.port.status()];
      for (const message of s.sent as Array<Record<string, unknown>>) {
        expect(message.type).toBe(PUBLIC_API_MESSAGE);
        expect(Object.keys(message).every((k) => ['type', 'op', 'path', 'key', 'maxPages'].includes(k))).toBe(true);
      }
      const wire = JSON.stringify([s.sent, s.replies, results]);
      expect(wire, name).not.toMatch(TOKEN_PATTERN);
      expect(wire.toLowerCase(), name).not.toContain('bearer');
      expect(wire.toLowerCase(), name).not.toContain('authorization');
      // الخلفية أرسلت الرمز إلى api.github.com وحده.
      for (const call of s.calls) {
        expect(new URL(call.url).origin).toBe('https://api.github.com');
        expect(call.url).not.toMatch(TOKEN_PATTERN);
      }
    }
    expect(document.documentElement.outerHTML).not.toMatch(TOKEN_PATTERN);
    expect(logs.join('\n')).not.toMatch(TOKEN_PATTERN);
  });

  it('الحالة تعلن «بالرمز» وموعد الانتهاء بلا الرمز؛ ومسحه يعيد الحالة العامة ويُسقط الترويسة من الطلب التالي', async () => {
    const s = await tokenSystem(() => FIXTURE.states.valid as never);
    expect(await s.port.status()).toEqual({ granted: true, rate: null });
    await s.store.save(TOKEN, 'session');
    await s.port.get('/rate_limit');
    expect(await s.port.status()).toMatchObject({ granted: true, authenticated: true, tokenExpiresAt: Date.UTC(2026, 9, 30, 14, 25, 10), rate: { limit: 5000 } });
    await s.store.clear();
    const status = await s.port.status();
    expect(status.authenticated).toBeUndefined();
    await s.port.get('/rate_limit');
    expect(authHeader(s.calls.at(-1))).toBeNull();
  });

  it('رسالة مزوّرة تطلب الرمز أو تمرّر رمزًا آخر: تُهمل حقولها، ويُستعمل المحفوظ وحده، ولا يعود في الرد', async () => {
    const s = await tokenSystem(() => FIXTURE.states.valid as never);
    await s.store.save(TOKEN, 'session');
    const forged = { type: PUBLIC_API_MESSAGE, op: 'get', path: '/rate_limit', token: fakeToken('Z'), headers: { Authorization: 'Bearer forged' }, op2: 'token' };
    const response = await new Promise<unknown>((resolve) => void s.listeners[0]?.(forged, {}, resolve));
    expect(authHeader(s.calls[0])).toBe(`Bearer ${TOKEN}`);
    expect(JSON.stringify(response)).not.toMatch(TOKEN_PATTERN);
    for (const op of ['token', 'read-token', 'secret']) {
      const r = await new Promise<unknown>((resolve) => {
        const handled = s.listeners[0]?.({ type: PUBLIC_API_MESSAGE, op }, {}, resolve);
        if (handled !== true) resolve(undefined);
      });
      expect(JSON.stringify(r ?? null)).not.toMatch(TOKEN_PATTERN);
    }
  });

  it('Firefox: مخزن الخلفية بلا قرص، والجلسة تعمل بالرمز نفسه', async () => {
    const s = await tokenSystem(() => FIXTURE.states.valid as never, { target: 'firefox' });
    expect(s.store.diskAvailable).toBe(false);
    await s.store.save(TOKEN, 'session');
    await s.port.get('/rate_limit');
    expect(authHeader(s.calls[0])).toBe(`Bearer ${TOKEN}`);
  });
});

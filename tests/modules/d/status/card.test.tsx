// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo-owner/private-demo/pull/7"}
// TEST-PR-06 (تكامل، AC-D8) وبوابة الخيار (AC-11.1 ‏(٣) و(٤)): بطاقة حالة طلب الدمج في الصفحة المرجعية بخلفية فعلية وسجل الاتصالات، على
// fixture-pr-complex.html وfixture-status-details.html وfixture-token-states.json (جدول إشارات T-0.5):
//  - لكل حالة (رمز منتهٍ، ناقص الصلاحية، تجاوز الحد، غير متاحة للمستودع، لم تُطلب بعد) نصها الخاص، ولا تُعرض أيٌّ منها نجاحًا للفحوص ولا
//    خلوًّا من المشكلات، وما لم يُقرأ «غير معروف»؛ والمصدر لا يصير «DOM + API» بلا قراءة.
//  - لكل نتيجة المستودع والفرع والالتزام ووقت القراءة؛ وتغيّر الالتزام أو الفرع في الصفحة يُسقطها ويُعلن أنها لالتزام آخر.
//  - فشل أحدث (حد) لا يمحو آخر قراءة ناجحة: تبقى بوقتها ويُعلن الفشل (BLK-RATELIMIT-AUTH).
//  - 404 بلا رمز يُظهر خيار «قراءة المستودع الخاص» معلَّلًا في لوحة API وحدها وبقية البطاقة كاملة؛ وزرّه يطلب موضع الربط بمعرّف الميزة،
//    والعودة تركّز زر القراءة ولا ترسل طلبًا. وحزمة السياق (مخرج يبنيه مِجهَر) لا تعرض الفحوص غير المقروءة ناجحة.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECTIONS_CHANGED_MESSAGE } from '../../../../src/core/connections/port';
import { createPrStatusModule } from '../../../../src/modules/d/pr-status';
import { buildBundle, collectContext } from '../../../../src/modules/e/builder';
import { builderSelectors, pageAt } from '../../e/helpers';
import { flush, hostsOf, loadHtmlText, mountModules, readFixture, shadowText } from '../helpers';
import { FIXTURE, authHeader, connectionSystem, fakeToken, pathOf, privateRepoReply } from '../../../core/connections/helpers';
import type { Call, Reply } from '../../../core/connections/helpers';

const TOKEN = fakeToken('K');
const P = FIXTURE.privateRepo;
const NOW = Date.UTC(2026, 9, 23, 14, 30);
const state = (name: string): Reply => FIXTURE.states[name] as Reply;
const privateNet = (call: Call): Reply => privateRepoReply(pathOf(call), Boolean(authHeader(call)));

const HTML = readFixture('fixture-pr-complex.html')
  .replaceAll('octo/demo', `${P.owner}/${P.repo}`)
  .replaceAll('octo-dev/demo', `${P.owner}/${P.repo}`)
  .replaceAll('4242', String(P.number))
  .replaceAll('22c15d5f509f0a7076b74b3f0f48a740802103b4', P.headSha);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** حدث رسائل الخلفية إلى التبويب (بديل runtime.onMessage). */
function messageEvent() {
  const listeners = new Set<(m: unknown) => unknown>();
  return {
    event: { addListener: (l: (m: unknown) => unknown) => void listeners.add(l), removeListener: (l: (m: unknown) => unknown) => void listeners.delete(l) },
    emit: (m: unknown) => [...listeners].forEach((l) => l(m)),
    size: () => listeners.size,
  };
}

async function card(reply: (call: Call, i: number) => Reply, options: { token?: boolean } = {}) {
  const s = await connectionSystem(reply, { now: () => NOW });
  if (options.token) await s.tokens.save(TOKEN, 'session');
  loadHtmlText(HTML);
  const messages = messageEvent();
  const openConnect = vi.fn();
  const fragment = async () => readFixture('fixture-status-details.html');
  const mounted = await mountModules([
    createPrStatusModule({ debounceMs: 5, tickMs: 60_000, fetchDetails: fragment, api: s.tabPort, connections: s.tabConnections, openConnect, runtimeMessages: messages.event, staleMs: () => 300_000 }),
  ]);
  await flush(30);
  const root = (): ShadowRoot => hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
  const q = (sel: string) => root().querySelector(sel);
  const read = async () => {
    (q('[data-action="api-read"]') as HTMLButtonElement).click();
    await flush(40);
  };
  const source = () => q('[data-source]')?.getAttribute('data-source');
  const push = async (from: string, to: string) => {
    for (const el of document.querySelectorAll('*')) {
      if (el.closest('mijhar-host')) continue;
      for (const attr of [...el.attributes]) if (attr.value.includes(from)) el.setAttribute(attr.name, attr.value.replaceAll(from, to));
      if (el.localName === 'script' && el.textContent?.includes(from)) el.textContent = el.textContent.replaceAll(from, to);
      for (const node of el.childNodes) if (node.nodeType === 3 && node.textContent?.includes(from)) node.textContent = node.textContent.replaceAll(from, to);
    }
    await flush(40);
  };
  return { s, q, root, read, source, push, messages, openConnect, ...mounted };
}

/** نص البطاقة لا يدّعي نجاحًا للفحوص ولا خلوًّا من المشكلات من بيانات API لم تُقرأ. */
const noFalseSuccess = (text: string) => {
  expect(text).not.toMatch(/كل الفحوص ناجحة|خالية من المشكلات|لا مشكلات في/);
};

describe('TEST-PR-06: لكل حالة نصها، ولا نجاح لما لم يُقرأ', () => {
  it('لم تُطلب بعد: «غير معروف» والمصدر DOM، ولا طلب', async () => {
    const c = await card(privateNet, { token: true });
    expect(c.q('[data-access]')?.getAttribute('data-access')).toBe('not-requested');
    expect(c.q('[data-access]')?.textContent).toContain('لم تُطلب بعد');
    expect(c.q('[data-access]')?.textContent).toContain('غير معروف');
    expect(c.source()).toBe('DOM');
    expect(c.s.calls).toHaveLength(0);
    noFalseSuccess(shadowText(hostsOf('d.pr-status')[0]));
    c.manager.stop();
  });

  it('رمز منتهٍ (401): نص الرمز المنتهي، والمصدر DOM، وبوابة «جدّد الرمز»؛ وصحة الرمز في السجل «منتهٍ»', async () => {
    const c = await card(() => state('expired'), { token: true });
    await c.read();
    expect(c.q('[data-access-part="pull"]')?.getAttribute('data-access-kind')).toBe('expired');
    expect(c.q('[data-access-part="pull"]')?.textContent).toContain('401');
    expect(c.q('[data-access-part="pull"]')?.textContent).toContain('غير معروف');
    expect(c.source()).toBe('DOM');
    expect(c.q('[data-gate]')?.getAttribute('data-gate-health')).toBe('expired');
    expect(c.q('[data-gate] [data-action="connect"]')?.textContent).toContain('جدّد الرمز');
    expect((await c.s.connections.status()).find((x) => x.id === 'github-token')?.health).toBe('expired');
    noFalseSuccess(shadowText(hostsOf('d.pr-status')[0]));
    c.manager.stop();
  });

  it('ناقص الصلاحية لنقطة بعينها: الطلب يُقرأ، والفحوص «ينقص الرمزَ Actions» و«غير معروف»؛ والسجل يسجّل النقص', async () => {
    const actionsMissing: Reply = { ...state('missing-permission'), headers: { ...state('missing-permission').headers, 'x-accepted-github-permissions': 'actions=read' } };
    const c = await card((call) => (pathOf(call).includes('/actions/') ? actionsMissing : privateNet(call)), { token: true });
    await c.read();
    expect(c.q('[data-access-part="pull"]')?.getAttribute('data-access-kind')).toBe('read');
    const checks = c.q('[data-access-part="checks"]');
    expect(checks?.getAttribute('data-access-kind')).toBe('insufficient');
    expect(checks?.textContent).toContain('ينقص الرمزَ صلاحيةُ Actions (قراءة)');
    expect(checks?.textContent).toContain('غير معروف');
    expect(c.q('[data-api-error="checks"]')).not.toBeNull();
    expect(c.q('[data-checks-source="api"]')).toBeNull();
    const status = (await c.s.connections.status()).find((x) => x.id === 'github-token');
    expect(status).toMatchObject({ health: 'insufficient', detail: { permission: 'actions', where: `${P.owner}/${P.repo}` } });
    noFalseSuccess(shadowText(hostsOf('d.pr-status')[0]));
    c.manager.stop();
  });

  it('تجاوز الحد: موعد إعادة المحاولة من الترويسات، ولا قراءة تُدّعى', async () => {
    const c = await card(() => state('rate-limited'), { token: true });
    await c.read();
    const pull = c.q('[data-access-part="pull"]');
    expect(pull?.getAttribute('data-access-kind')).toBe('rate-limited');
    expect(pull?.textContent).toContain(`لا يُرسل طلب قبل ${new Date(1_792_768_532_000).toLocaleTimeString('en-GB', { hour12: false })}`);
    expect(c.source()).toBe('DOM');
    c.manager.stop();
  });

  it('غير متاحة للمستودع (404 بلا رمز): نصها، وخيار الربط معلَّلًا في لوحة API وحدها، وبقية البطاقة كاملة', async () => {
    const c = await card(privateNet);
    await c.read();
    expect(c.q('[data-access-part="pull"]')?.getAttribute('data-access-kind')).toBe('unavailable');
    expect(c.q('[data-access-part="pull"]')?.textContent).toContain('قد يكون المستودع خاصًا');
    expect(c.q('[data-api-error="pull"]')?.textContent).toContain('404');
    const gate = c.q('[data-gate="d.pr-status.private"]');
    expect(gate?.getAttribute('data-gate-health')).toBe('none');
    expect(gate?.textContent).toContain('يحتاج «رمز GitHub للقراءة»');
    expect(gate?.closest('[data-section="api"]')).not.toBeNull();
    // (٤) لا يُقفل القسم: الملخص والموانع والفحوص من الصفحة كما هي.
    expect(c.q('[data-section="checks"]')?.textContent).toContain('ci / lint');
    expect(c.q('[data-section="blockers"]')).not.toBeNull();
    expect(c.q('[data-field="branches"]')?.textContent).toContain('feature/ui-refresh');
    c.manager.stop();
  });
});

describe('ربط النتيجة بالمستودع والفرع والالتزام ووقتها', () => {
  it('القراءة الناجحة بالرمز تعرض المستودع والفرع والالتزام والوقت؛ ودفع التزام جديد يُسقطها ويُعلن أنها لالتزام آخر', async () => {
    const c = await card(privateNet, { token: true });
    await c.read();
    expect(c.source()).toBe('DOM + API (بالرمز)');
    const binding = c.q('[data-binding]');
    expect(binding?.querySelector('[data-binding-repo]')?.getAttribute('data-binding-repo')).toBe(`${P.owner}/${P.repo}`);
    expect(binding?.querySelector('[data-binding-branch]')?.getAttribute('data-binding-branch')).toBe('feature/ui-refresh');
    expect(binding?.textContent).toContain(P.headSha.slice(0, 7));
    expect(binding?.querySelector('time')?.getAttribute('datetime')).toBe(new Date(NOW).toISOString());
    for (const part of ['pull', 'checks', 'required']) expect(c.q(`[data-access-part="${part}"]`)?.getAttribute('data-access-kind'), part).toBe('read');

    const next = 'abcdef0123456789abcdef0123456789abcdef01';
    await c.push(P.headSha, next);
    expect(c.source()).toBe('DOM');
    expect(c.q('[data-api-mismatch]')?.getAttribute('data-api-mismatch')).toBe('commit');
    expect(c.q('[data-api-mismatch]')?.textContent).toContain('لالتزام آخر');
    expect(c.q('[data-api-mismatch]')?.textContent).toContain(next.slice(0, 7));
    expect(c.q('[data-binding]')).toBeNull();
    expect(c.q('[data-checks-source="api"]')).toBeNull();
    c.manager.stop();
  });

  it('تغيّر فرع الرأس في الصفحة بالالتزام نفسه يُعلن ولا يُدمج', async () => {
    const c = await card(privateNet, { token: true });
    await c.read();
    expect(c.source()).toBe('DOM + API (بالرمز)');
    await c.push('feature/ui-refresh', 'feature/renamed');
    expect(c.q('[data-api-mismatch]')?.getAttribute('data-api-mismatch')).toBe('branch');
    expect(c.source()).toBe('DOM');
    c.manager.stop();
  });

  it('فشل أحدث (تجاوز الحد) لا يمحو آخر قراءة ناجحة: تبقى بوقتها ويُعلن الفشل بموعده', async () => {
    const c = await card(privateNet, { token: true });
    await c.read();
    const firstRead = c.q('[data-binding] time')?.getAttribute('datetime');
    vi.setSystemTime(NOW + 120_000);
    c.s.setReply(() => state('rate-limited'));
    await c.read();
    expect(c.source()).toBe('DOM + API (بالرمز)');
    expect(c.q('[data-binding] time')?.getAttribute('datetime')).toBe(firstRead);
    const attempt = c.q('[data-api-attempt]');
    expect(attempt?.getAttribute('data-api-attempt')).toBe('rate-limited');
    expect(attempt?.textContent).toContain('المعروض آخر قراءة ناجحة');
    expect(attempt?.textContent).toContain('غير معروف');
    c.manager.stop();
  });
});

describe('بوابة الخيار والعودة إليه (AC-11.1 ‏(٣))', () => {
  it('زر الربط يطلب موضع الرمز بمعرّف الميزة؛ والعودة تقرأ الحالة وتركّز زر القراءة ولا ترسل طلبًا إلى API', async () => {
    const c = await card(privateNet);
    await c.read();
    (c.q('[data-gate] [data-action="connect"]') as HTMLButtonElement).click();
    expect(c.openConnect).toHaveBeenCalledTimes(1);
    await c.s.tokens.save(TOKEN, 'session');
    const before = c.s.calls.length;
    c.messages.emit({ type: CONNECTIONS_CHANGED_MESSAGE, feature: 'd.pr-status.private' });
    await flush(30);
    expect(c.s.calls.length).toBe(before);
    expect((c.root().activeElement as HTMLElement | null)?.getAttribute('data-action')).toBe('api-read');
    expect(c.q('[data-api-auth="token"]')).not.toBeNull();
    // البوابة تبقى حتى قراءة جديدة: الرمز «غير متحقق منه» مربوط، فالقراءة التالية بالرمز.
    await c.read();
    expect(c.source()).toBe('DOM + API (بالرمز)');
    expect(c.q('[data-gate]')).toBeNull();
    c.manager.stop();
    expect(c.messages.size()).toBe(0);
  });

  it('حزمة السياق (مخرج يبنيه مِجهَر) لا تعرض الفحوص غير المقروءة ناجحة: تُعلن في «ما تعذّر جمعه»', async () => {
    loadHtmlText(HTML.replace(/<li[^>]*data-check-row[^]*?<\/li>/g, ''));
    const source = collectContext(document, builderSelectors(), pageAt(location.href), 'pr');
    const bundle = buildBundle(source, [], new Set(['checks', 'gaps']));
    expect(bundle.text).not.toMatch(/كل الفحوص ناجحة|لا مشكلات/);
    if (!source.checks) expect(bundle.gaps.some((g) => g.part === 'نتائج الفحوص')).toBe(true);
  });
});

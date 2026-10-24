// @vitest-environment jsdom
// TEST-CONN-01 وTEST-CONN-02 (تكامل): الخلفية الفعلية بسجل الاتصالات، وقسم «الاتصالات والمفاتيح» في صفحة الإعدادات يراسلها كما في الإضافة.
//  (١) الحالة تتغير بطلب تحقق فعلي ولا تصير «سليم» بكتابة نص (نص غير صالح يُرفض قبل أي طلب، ورمز بصيغة صحيحة مرفوض = منتهٍ).
//  (٢) الحالات الخمس بنصوصها على استجابات محقونة: منتهٍ، ناقص الصلاحيات، متجاوز الحد، غير متاح، غير متحقق منه.
//  (٣) العودة إلى الميزة التي طلبت الربط: من تبويبها وبمعرّفها من القائمة المغلقة وحدها.
//  (٥) حذف سرّ يعطّل ما يعتمد عليه وحده؛ (٦) مفتاحان مستقلان، ولا سرّ في الرسائل ولا الردود ولا سجل الصحة ولا DOM ولا الكونسول، ونص
//  الحفظ يقول «غير مشفَّر» صريحًا ولا يدّعي تشفيرًا؛ (٧) «كيف تحصل على الرمز؟» في بطاقة الرمز، ولا «لماذا المفتاح؟» قبل MJ21.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECTIONS_CHANGED_MESSAGE, CONNECTIONS_MESSAGE } from '../../../src/core/connections/port';
import { HEALTH_LOG_KEY } from '../../../src/core/connections/service';
import { ConnectionsSection } from '../../../src/core/connections/ui/ConnectionsSection';
import { OPEN_OPTIONS_MESSAGE, OPTIONS_TARGETS } from '../../../src/core/ui-host/commands';
import { TokenSection } from '../../../src/modules/d/token/TokenSection';
import { FIXTURE, PROVIDER_PATTERN, TOKEN_PATTERN, connectionSystem, fakeProviderKey, fakeToken, pathOf } from './helpers';
import type { Call, Reply } from './helpers';

const TOKEN = fakeToken('R');
const KEY = fakeProviderKey('R');
// قبل موعد تجدد الحد في العينة (x-ratelimit-reset = 2026-10-23 15:15 UTC)، كما قيست T-0.5.
const NOW = Date.UTC(2026, 9, 23, 14, 30);

const state = (name: string): Reply => {
  const r = FIXTURE.states[name];
  if (!r) throw new Error(name);
  return r;
};

let container: HTMLElement;
let logs: string[] = [];
beforeEach(() => {
  // ساعة الخلفية نفسها (العميل والسجل) على وقت القياس، لا ساعة الجهاز.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
  logs = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack ?? ''}` : String(a))).join(' ')));
  }
});
afterEach(() => {
  render(null, container);
  container.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const flush = async (n = 40) => {
  for (let i = 0; i < n; i += 1) await act(async () => {});
};

/** صفحة الإعدادات: القسم بخلفية فعلية، وجسم بطاقة الرمز قسم الرمز كما في src/options/main.tsx. */
async function optionsPage(reply: (call: Call, i: number) => Reply, options: { granted?: boolean } = {}) {
  const s = await connectionSystem(reply, { ...options, now: () => NOW });
  /** يرسم القسم من جديد (فتح صفحة الإعدادات): يقرأ الحالة والطلب المعلّق من الخلفية. */
  const open = async () => {
    await act(async () => render(null, container));
    await act(async () =>
      render(
        <ConnectionsSection
          connections={s.connections}
          body={(id, header, status, refresh) => (id === 'github-token' ? <TokenSection store={s.tokens} port={s.port} target="chromium" now={() => NOW} header={header} status={status} onChange={refresh} /> : null)}
        />,
        container,
      ),
    );
    await flush();
  };
  await open();
  const q = <E extends Element = HTMLElement>(sel: string) => container.querySelector(sel) as E | null;
  const card = (id: string) => q(`[data-connection="${id}"]`);
  const badge = (id: string) => card(id)?.querySelector('[data-health]')?.getAttribute('data-health') ?? null;
  const save = async (value: string) => {
    const input = q<HTMLInputElement>('#mj-token-input');
    if (!input) throw new Error('no input');
    input.value = value;
    await act(async () => void q<HTMLFormElement>('[data-token-form]')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();
  };
  const click = async (sel: string) => {
    await act(async () => q<HTMLButtonElement>(sel)?.click());
    await flush();
  };
  return { s, q, card, badge, save, click, open };
}

const notice = (ui: Awaited<ReturnType<typeof optionsPage>>) => ui.q('[data-token-check]');

describe('(١) الحالة من تحقق فعلي لا من نص في الحقل', () => {
  it('لا رمز: غير مربوط بنصه، ومفتاح المزوّد «لم يُتح بعد» بلا حقل؛ ولكل اتصال نوعه وما يحتاجه', async () => {
    const ui = await optionsPage(() => state('valid'));
    expect(ui.badge('github-token')).toBe('none');
    expect(ui.card('github-token')?.querySelector('[data-connection-kind]')?.textContent).toContain('api.github.com');
    expect(ui.card('github-token')?.querySelector('[data-connection-needs]')?.textContent).toContain('صلاحيات قراءة فقط');
    const provider = ui.card('provider-key');
    expect(provider?.getAttribute('data-availability')).toBe('not-yet');
    expect(provider?.querySelector('[data-health]')?.getAttribute('data-health')).toBe('not-yet');
    expect(provider?.querySelector('input, textarea')).toBeNull();
    expect(provider?.querySelector('[data-not-yet]')?.textContent).toContain('لا حقل لمفتاح الآن');
    expect(ui.s.calls).toHaveLength(0);
  });

  it('نص غير صالح يُرفض قبل أي حفظ أو طلب والحالة تبقى «غير مربوط»؛ ورمز بصيغة صحيحة يرفضه GitHub منتهٍ لا سليم', async () => {
    const ui = await optionsPage(() => state('invalid'));
    await ui.save('not-a-token-at-all');
    expect(ui.s.calls).toHaveLength(0);
    expect(ui.badge('github-token')).toBe('none');
    await ui.save(TOKEN);
    expect(ui.s.calls.map(pathOf)).toEqual(['/rate_limit']);
    expect(ui.badge('github-token')).toBe('expired');
    expect(notice(ui)?.getAttribute('data-health')).toBe('expired');
    expect(notice(ui)?.textContent).toContain('401');
  });

  it('رمز محفوظ لم يُتحقق منه بعد: «غير متحقق منه»؛ والتحقق يقلبه إلى «سليم» بحده وموعد انتهائه، وآخر تحقق ظاهر', async () => {
    const page = await optionsPage(() => state('valid'));
    await page.s.tokens.save(TOKEN, 'session');
    await page.open();
    expect(page.badge('github-token')).toBe('unverified');
    expect(page.s.calls).toHaveLength(0);
    await page.click('[data-action="token-check"]');
    expect(page.badge('github-token')).toBe('healthy');
    expect(notice(page)?.getAttribute('data-token-check')).toBe('ok');
    expect(notice(page)?.textContent).toContain('5000');
    expect(page.card('github-token')?.textContent).toContain('آخر تحقق');
  });
});

describe('(٢) الحالات الخمس بنصوصها على استجابات محقونة', () => {
  it('منتهٍ، ناقص الصلاحيات، متجاوز الحد، غير متاح، غير متحقق منه: كلٌّ بشارته ونصه، ولا شيء منها «سليم»', async () => {
    const seen: Record<string, string> = {};
    const actionsMissing: Reply = { ...state('missing-permission'), headers: { ...state('missing-permission').headers, 'x-accepted-github-permissions': 'actions=read' } };
    const cases: Array<{ name: string; reply: Reply; after?: Reply; granted?: boolean }> = [
      { name: 'expired', reply: state('expired') },
      // التحقق قبِله ثم ردّ الاستعمال من الميزة في الصفحة بنقص Actions: الخلفية تسجّل النقص من ردّها.
      { name: 'insufficient', reply: state('valid'), after: actionsMissing },
      { name: 'rate-limited', reply: state('rate-limited') },
      { name: 'unavailable', reply: { status: 503, body: { message: 'Service Unavailable' } } },
      { name: 'unverified', reply: state('valid'), granted: false },
    ];
    for (const c of cases) {
      const ui = await optionsPage(() => c.reply, { granted: c.granted !== false });
      await ui.save(TOKEN);
      if (c.after) {
        const after = c.after;
        ui.s.setReply(() => after);
        await ui.s.tabPort.get('/repos/octo-owner/private-demo/actions/runs?head_sha=abc');
        await ui.open();
      }
      expect(ui.badge('github-token'), c.name).toBe(c.name);
      expect(notice(ui)?.getAttribute('data-token-check'), c.name).toBe('fail');
      seen[c.name] = notice(ui)?.textContent ?? '';
      render(null, container);
    }
    expect(seen.expired).toContain('401');
    expect(seen.insufficient).toContain('صلاحية Actions (قراءة) في المستودع octo-owner/private-demo');
    expect(seen['rate-limited']).toContain('لا يُرسل طلب قبل');
    expect(seen.unavailable).toContain('تعذّر الوصول إلى GitHub');
    expect(seen.unverified).toContain('api.github.com');
    expect(new Set(Object.values(seen)).size).toBe(5);
    for (const text of Object.values(seen)) expect(text).not.toContain('قبِل');
  });
});

describe('(٣) العودة إلى الميزة التي طلبت الربط', () => {
  it('من تبويب الميزة: يُفتح موضع الرمز ويُحفظ التبويب؛ وبعد التحقق «عُد إلى …» يفعّل التبويب ويبلغه، بلا أي طلب API إضافي', async () => {
    const ui = await optionsPage(() => state('valid'));
    await ui.s.tabRuntime.sendMessage({ type: OPEN_OPTIONS_MESSAGE, target: 'token', feature: 'd.pr-status.private' });
    expect(ui.s.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://mijhar/options.html#token' });
    // صفحة الإعدادات تُفتح الآن فتقرأ الطلب المعلّق.
    await ui.open();
    expect(ui.q('[data-return]')?.getAttribute('data-return')).toBe('waiting');
    expect(ui.q('[data-return]')?.textContent).toContain('قراءة طلب الدمج وفحوص Actions في مستودع خاص');
    await ui.save(TOKEN);
    expect(ui.q('[data-return]')?.getAttribute('data-return')).toBe('ready');
    const before = ui.s.calls.length;
    await ui.click('[data-action="connection-return"]');
    expect(ui.s.tabs.update).toHaveBeenCalledWith(41, { active: true });
    expect(ui.s.windows.update).toHaveBeenCalledWith(3, { focused: true });
    expect(ui.s.tabMessages).toEqual([{ tabId: 41, message: { type: CONNECTIONS_CHANGED_MESSAGE, feature: 'd.pr-status.private' } }]);
    expect(ui.s.calls.length).toBe(before);
    expect(ui.q('[data-return]')).toBeNull();
  });

  it('ميزة خارج القائمة المغلقة أو بلا تبويب مرسل تُهمل؛ والموضع خارج OPTIONS_TARGETS لا يركّب عنوانًا', async () => {
    const s = await connectionSystem(() => state('valid'));
    await s.tabRuntime.sendMessage({ type: OPEN_OPTIONS_MESSAGE, target: 'token', feature: 'https://evil.example/' });
    expect(await s.tabConnections.pending()).toBeNull();
    await s.dispatch({ type: OPEN_OPTIONS_MESSAGE, target: 'token', feature: 'd.pr-status.private' });
    expect(await s.connections.pending()).toBeNull();
    await s.tabRuntime.sendMessage({ type: OPEN_OPTIONS_MESSAGE, target: 'javascript:alert(1)', feature: 'd.pr-status.private' });
    expect(s.tabs.create.mock.calls.map(([p]) => p.url)).toEqual(['chrome-extension://mijhar/options.html#token', 'chrome-extension://mijhar/options.html#token']);
    expect(OPTIONS_TARGETS).toEqual(['token', 'guide/github-token']);
    expect(await s.connections.returnToFeature()).toBe(true);
    expect(await s.connections.returnToFeature()).toBe(false);
  });
});

describe('(٥) و(٦) العزل والحذف', () => {
  it('حذف الرمز يعطّل ما يعتمد عليه وحده: التأكيد يسمّيه، ومفتاح المزوّد المحفوظ يبقى بمفتاحه، والطلب التالي بلا رمز', async () => {
    const ui = await optionsPage(() => state('valid'));
    await ui.save(TOKEN);
    await ui.s.providerKeys.save(KEY, 'session');
    await ui.click('[data-action="token-clear"]');
    expect(ui.q('[data-token-confirm] [data-disables]')?.textContent).toContain('مستودع خاص');
    await ui.click('[data-action="token-clear-confirm"]');
    expect(ui.badge('github-token')).toBe('none');
    expect(await ui.s.tokens.read()).toBeNull();
    expect((await ui.s.providerKeys.read())?.token).toBe(KEY);
    const status = await ui.s.connections.status();
    expect(status.find((c) => c.id === 'provider-key')?.health).toBe('unverified');
    await ui.s.tabPort.get('/repos/o/r');
    expect(new Headers(ui.s.calls.at(-1)?.init.headers).get('authorization')).toBeNull();
  });

  it('مسح مفتاح المزوّد لا يمس الرمز ولا صحته', async () => {
    const ui = await optionsPage(() => state('valid'));
    await ui.save(TOKEN);
    await ui.s.providerKeys.save(KEY, 'disk');
    await ui.s.providerKeys.clear();
    expect((await ui.s.tokens.read())?.token).toBe(TOKEN);
    expect((await ui.s.connections.status()).find((c) => c.id === 'github-token')?.health).toBe('healthy');
  });

  it('لا سرّ في رسائل الإعدادات ولا ردود الخلفية ولا سجل الصحة ولا DOM ولا الكونسول، في كل الحالات', async () => {
    for (const name of ['valid', 'invalid', 'missing-permission', 'rate-limited', 'secondary-limit', 'not-found']) {
      const ui = await optionsPage(() => state(name));
      await ui.s.providerKeys.save(KEY, 'session');
      await ui.save(TOKEN);
      await ui.click('[data-action="token-check"]');
      await ui.s.tabPort.get('/repos/o/r/actions/runs?head_sha=abc');
      await ui.s.tabConnections.status();
      const wire = JSON.stringify([ui.s.sent, ui.s.replies, ui.s.healthLog.records, ui.s.tabMessages]);
      expect(wire, name).not.toMatch(TOKEN_PATTERN);
      expect(wire, name).not.toMatch(PROVIDER_PATTERN);
      expect(container.innerHTML, name).not.toMatch(TOKEN_PATTERN);
      expect(logs.join('\n'), name).not.toMatch(TOKEN_PATTERN);
      for (const message of ui.s.sent as Array<Record<string, unknown>>) {
        expect(Object.keys(message).every((k) => ['type', 'op', 'path', 'key', 'maxPages', 'target', 'feature'].includes(k)), name).toBe(true);
      }
      expect(ui.s.sent.some((m) => (m as { type?: string }).type === CONNECTIONS_MESSAGE)).toBe(true);
      render(null, container);
    }
    expect(HEALTH_LOG_KEY).toBe('mijhar.connections.health');
  });

  it('نص الحفظ: «غير مشفَّر» صريحًا للقرص، ولا يدّعي تشفيرًا ولا إزالة مضمونة بالتنقيح؛ و«كيف تحصل على الرمز؟» في بطاقة الرمز ولا «لماذا المفتاح؟»', async () => {
    const ui = await optionsPage(() => state('valid'));
    const disclosure = ui.q('[data-storage-disclosure]')?.textContent ?? '';
    expect(disclosure).toContain('غير مشفَّر');
    expect(disclosure).toContain('مفتاح تخزين مستقل');
    expect(ui.q('[data-no-claims]')?.textContent).toContain('لا يدّعي مِجهَر تشفيرًا');
    expect(ui.q('[data-no-claims]')?.textContent).toContain('ولا يضمن التنقيح إزالة كل سرّ');
    const all = container.textContent ?? '';
    expect(all).not.toMatch(/(?<!لا يدّعي مِجهَر )تشفيرًا|مُشفَّر(?!\S)|مشفر بأمان|محمي بالتشفير/);
    const guide = ui.card('github-token')?.querySelector<HTMLAnchorElement>('a[data-action="token-guide"]');
    expect(guide?.getAttribute('href')).toBe('#guide/github-token');
    expect(all).not.toContain('لماذا المفتاح');
  });
});

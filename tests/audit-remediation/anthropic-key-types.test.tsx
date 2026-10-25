// @vitest-environment jsdom
/**
 * AD-38: أنواع مفاتيح Claude API ومساحة العمل (platform.claude.com/docs/en/manage-claude/authentication، قُرئ 2026-10-25).
 * - فحص صيغة الإدخال محليًا عام: sk-ant- ثم جسم بلا مسافات، فيقبل المفتاح الشخصي ومفتاح حساب الخدمة ومفتاح مساحة العمل وأي نوع لا تعرفه القاعدة؛
 *   ويرفض مفتاح الإدارة والفارغ والمقطوع وما فيه مسافة ومفاتيح المزوّدين الآخرين. والصيغة ليست صلاحًا: الحكم للتحقق من المزوّد بعد الحفظ.
 * - المفتاح غير المقيّد بمساحة عمل يلزمه anthropic-workspace-id: يُرسل حين يكتبه المستخدم وحده، ولا يُخمَّن.
 * - رفض الطلب يُصنَّف بسببه: مساحة العمل (400/404 برسالتها) غير المفتاح (401) غير الصلاحية (403) غير الشبكة؛ ولا يُعدّ المفتاح مرفوضًا لرفض يخص
 *   مساحة العمل.
 * - المفتاح كاملًا لا يظهر في رسالة خطأ ولا حالة ولا في البطاقة.
 * مفاتيح اصطناعية تُركَّب وقت التشغيل، وfetch وهمي، وصلاحيات اصطناعية؛ لا شبكة ولا مفتاح حقيقي.
 */
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../src/core';
import { SecretStore } from '../../src/core/connections/secrets';
import { ConnectionsService, memoryHealthLog } from '../../src/core/connections/service';
import { ANTHROPIC_ADAPTER } from '../../src/modules/e/provider/adapters/anthropic';
import { OPENAI_ADAPTER } from '../../src/modules/e/provider/adapters/openai';
import { checkKey } from '../../src/modules/e/provider/catalog';
import { ANTHROPIC } from '../../src/modules/e/provider/descriptors/anthropic';
import { GEMINI } from '../../src/modules/e/provider/descriptors/gemini';
import { OPENAI } from '../../src/modules/e/provider/descriptors/openai';
import { ProviderPermissionError, gatedFetch } from '../../src/modules/e/provider/gate';
import type { ProviderPort } from '../../src/modules/e/provider/port';
import { ProviderCard } from '../../src/modules/e/provider/ProviderCard';
import { createProviderRegistry } from '../../src/modules/e/provider/registry';
import { ProviderService, memoryModelsCache } from '../../src/modules/e/provider/service';
import { PROVIDER_ID_KEY, defineProviderSettings, modelSettingKey, workspaceSettingKey } from '../../src/modules/e/provider/settings';
import type { ProviderCall } from '../../src/modules/e/provider/types';
import { fakePermissions } from '../core/ui-host/helpers';
import { memoryArea } from '../modules/d/token/helpers';
import { trustedClick } from '../shared/trusted-click';

/** مفتاح اصطناعي بصيغة Claude API لنوع type، يُركَّب وقت التشغيل (لا مفتاح حرفي في المصدر). */
const synth = (type: string | null, tag = 'Q'): string => ['sk', 'ant', ...(type ? [type] : []), `${tag}${'Mijhar_synth-0'.repeat(4)}`].join('-');
const SVC = synth('svc');
const USR = synth('usr');
const API = synth('api03');
const WS = 'wrkspc_01SynthMijharAudit';
const OTHER_WS = 'wrkspc_01SomeoneElsesSpace';
const NOW = 1_800_000_000_000;

const NOT_SCOPED = 'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header with the ID of the workspace to use. Add the header, or use an API key that is scoped to a workspace.';
const BAD_WS = 'anthropic-workspace-id header must be a valid workspace ID.';
const WS_NOT_FOUND = (id: string) => `Workspace \`${id}\` not found.`;

interface Sent {
  readonly path: string;
  readonly headers: Record<string, string>;
}

/**
 * Claude API وهمية لمفتاح غير مقيّد بمساحة عمل: بلا ترويسة 400 «not scoped»، وبمعرّف مساحة لا يصلها 404، وبمعرّف مساحته يقبل. والمفتاح غير
 * المعروف 401. وكل رسالة خطأ تعيد المفتاح كما وصل لتثبت أنه يُحجب قبل أن يصل أي نص.
 */
function claudeApi(options: { key: string; workspace: string | null }) {
  const sent: Sent[] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const error = (status: number, type: string, message: string) => json(status, { type: 'error', error: { type, message } });
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    sent.push({ path: url.pathname, headers });
    const key = (headers.authorization ?? '').replace(/^Bearer /, '');
    if (key !== options.key || headers['x-api-key'] !== undefined) return error(401, 'authentication_error', `invalid bearer token ${key}`);
    const ws = headers['anthropic-workspace-id'];
    if (options.workspace !== null) {
      if (ws === undefined) return error(400, 'invalid_request_error', `${NOT_SCOPED} (key ${key})`);
      if (!/^wrkspc_[A-Za-z0-9]+$/.test(ws)) return error(400, 'invalid_request_error', BAD_WS);
      if (ws !== options.workspace) return error(404, 'not_found_error', WS_NOT_FOUND(ws));
    }
    if (url.pathname === '/v1/models') return json(200, { data: [{ id: 'mock-haiku-1', display_name: 'Mock Haiku', created_at: '2026-01-01T00:00:00Z', max_tokens: 2048 }], has_more: false });
    const body = JSON.parse(String(init.body ?? '{}')) as { model: string };
    return json(200, { id: 'msg_synth', model: body.model, content: [{ type: 'text', text: 'pong' }], stop_reason: 'end_turn', usage: { input_tokens: 9, output_tokens: 1 } });
  };
  return { fetch: fetch as typeof globalThis.fetch, sent };
}

describe('AD-38: فحص صيغة الإدخال عام لأنواع مفاتيح Claude API، والحكم للمزوّد', () => {
  it('يقبل المفتاح الشخصي ومفتاح حساب الخدمة ومفتاح مساحة العمل، وأي نوع بعد sk-ant- لا تعرفه القاعدة، بلا مسافات حوله', () => {
    for (const key of [SVC, USR, API, synth('svc01'), synth('futuretype'), synth(null)]) expect(checkKey(ANTHROPIC, `  ${key}\n`)).toEqual({ ok: true, key });
  });

  it('يرفض مفتاح الإدارة بسببه، والفارغ والمقطوع وما فيه مسافة أو سطران، ومفاتيح المزوّدين الآخرين', () => {
    expect(checkKey(ANTHROPIC, synth('admin01'))).toMatchObject({ ok: false, reason: expect.stringContaining('مفتاح إدارة') });
    for (const bad of ['', '   ', ['sk', 'ant', 'svc', 'short'].join('-'), `${SVC.slice(0, 30)} ${SVC.slice(30)}`, `${SVC.slice(0, 30)}\n${SVC.slice(30)}`, `sk-proj-${'x'.repeat(40)}`, `github_pat_${'x'.repeat(40)}`, `AIza${'x'.repeat(35)}`]) {
      expect(checkKey(ANTHROPIC, bad)).toMatchObject({ ok: false });
    }
  });

  it('مفتاح Claude من أي نوع يُرفض في بطاقتَي OpenAI وGemini بسببه', () => {
    expect(checkKey(OPENAI, SVC)).toMatchObject({ ok: false, reason: expect.stringContaining('Anthropic') });
    expect(checkKey(GEMINI, SVC)).toMatchObject({ ok: false });
  });
});

describe('AD-38: المحوّل يرسل ترويسة مساحة العمل حين تُعطى وحده، ويصنّف الرفض بسببه', () => {
  const call = (fetch: typeof globalThis.fetch, extra: Partial<ProviderCall> = {}, key = SVC): ProviderCall => ({
    key,
    fetch: gatedFetch(ANTHROPIC, { permissions: fakePermissions([ANTHROPIC.origin]), fetch }),
    now: () => NOW,
    ...extra,
  });

  it('المفتاح في Authorization: Bearer (الطريقة الأساسية في التوثيق) لا x-api-key؛ وبلا معرّف لا anthropic-workspace-id، ومعه الترويسة بالمعرّف نفسه في القائمة والتحليل', async () => {
    const open = claudeApi({ key: SVC, workspace: null });
    expect(await ANTHROPIC_ADAPTER.listModels(call(open.fetch))).toMatchObject({ ok: true });
    expect(open.sent[0]?.headers).toMatchObject({ authorization: `Bearer ${SVC}`, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' });
    expect(open.sent[0]?.headers).not.toHaveProperty('anthropic-workspace-id');
    expect(open.sent[0]?.headers).not.toHaveProperty('x-api-key');

    const scoped = claudeApi({ key: SVC, workspace: WS });
    expect(await ANTHROPIC_ADAPTER.listModels(call(scoped.fetch, { workspace: WS }))).toMatchObject({ ok: true });
    expect(await ANTHROPIC_ADAPTER.analyze(call(scoped.fetch, { workspace: WS }), { model: 'mock-haiku-1', system: 's', prompt: 'p', maxTokens: 16 })).toMatchObject({ ok: true, data: { text: 'pong' } });
    expect(scoped.sent.map((s) => [s.path, s.headers['anthropic-workspace-id']])).toEqual([
      ['/v1/models', WS],
      ['/v1/messages', WS],
    ]);
  });

  it('رفض مساحة العمل (غيابها، معرّف غير صالح، مساحة لا يصلها المفتاح) «workspace» لا رفضًا للمفتاح؛ ورسالته محجوبة المفتاح', async () => {
    const api = claudeApi({ key: SVC, workspace: WS });
    const missing = await ANTHROPIC_ADAPTER.listModels(call(api.fetch));
    expect(missing).toMatchObject({ ok: false, failure: 'workspace', status: 400, message: expect.stringContaining('not scoped to a workspace') });
    expect(JSON.stringify(missing)).not.toContain(SVC);
    expect(JSON.stringify(missing)).toContain('‹المفتاح›');
    expect(await ANTHROPIC_ADAPTER.listModels(call(api.fetch, { workspace: 'wrkspc_bad!' }))).toMatchObject({ ok: false, failure: 'workspace', status: 400 });
    expect(await ANTHROPIC_ADAPTER.listModels(call(api.fetch, { workspace: OTHER_WS }))).toMatchObject({ ok: false, failure: 'workspace', status: 404, message: WS_NOT_FOUND(OTHER_WS) });
  });

  it('401 رفض المفتاح، و403 صلاحيته، و404 لغير مساحة العمل «not-found»، و400 لغيرها «invalid»، والشبكة شبكة، والصلاحية صلاحية؛ وكلها بلا المفتاح', async () => {
    const respond = (status: number, message: string) =>
      (async () => new Response(JSON.stringify({ type: 'error', error: { type: 'x', message: `${message} ${SVC}` } }), { status })) as unknown as typeof globalThis.fetch;
    const cases: Array<[typeof globalThis.fetch, string]> = [
      [respond(401, 'invalid bearer token'), 'unauthorized'],
      [respond(403, 'Your API key does not have permission to use the specified resource'), 'forbidden'],
      [respond(404, 'model: mock-gone'), 'not-found'],
      [respond(400, 'prompt is too long'), 'invalid'],
      [(async () => Promise.reject(new TypeError(`Failed to fetch ${SVC}`))) as unknown as typeof globalThis.fetch, 'network'],
    ];
    for (const [fetch, failure] of cases) {
      const result = await ANTHROPIC_ADAPTER.listModels(call(fetch));
      expect(result).toMatchObject({ ok: false, failure });
      expect(JSON.stringify(result)).not.toContain(SVC);
    }
    const denied: ProviderCall = { key: SVC, fetch: gatedFetch(ANTHROPIC, { permissions: fakePermissions([]), fetch: claudeApi({ key: SVC, workspace: null }).fetch }), now: () => NOW };
    expect(await ANTHROPIC_ADAPTER.listModels(denied)).toMatchObject({ ok: false, failure: 'permission' });
    expect(new ProviderPermissionError(ANTHROPIC.origin).message).not.toContain(SVC);
  });
});

async function harness(api: ReturnType<typeof claudeApi>, key = SVC) {
  const area = new MemoryStorageArea();
  const descriptors = [ANTHROPIC_ADAPTER.descriptor, OPENAI_ADAPTER.descriptor];
  const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r, descriptors)));
  await settings.set(PROVIDER_ID_KEY, 'anthropic');
  let tick = 100;
  const stores = new Map(descriptors.map((d) => [d.id, new SecretStore({ session: memoryArea(), disk: null, now: () => (tick += 1) })]));
  const store = (id: string) => stores.get(id) as SecretStore;
  if (key) await store('anthropic').save(key, 'session');
  const permissions = fakePermissions(descriptors.map((d) => d.origin));
  const log = memoryHealthLog();
  const connections = new ConnectionsService({ stores: {}, providerKeys: { selected: async () => settings.get<string>(PROVIDER_ID_KEY), store }, log, fixable: [], now: () => NOW });
  const service = new ProviderService({
    registry: createProviderRegistry([ANTHROPIC_ADAPTER, OPENAI_ADAPTER]),
    keys: store,
    permissions,
    fetch: api.fetch,
    connections,
    settings: async () => settings,
    cache: memoryModelsCache(),
    now: () => NOW,
  });
  return { settings, store, permissions, service, descriptors };
}

describe('AD-38: الخدمة تمرّر معرّف مساحة العمل من الإعدادات، ولا تعدّ المفتاح مرفوضًا لرفض مساحة العمل', () => {
  it('إعداد مساحة العمل لـAnthropic وحده، ويقبل الفارغ وwrkspc_… ويرفض غيرهما', async () => {
    const { settings } = await harness(claudeApi({ key: SVC, workspace: null }));
    expect(settings.get(workspaceSettingKey('anthropic'))).toBe('');
    await settings.set(workspaceSettingKey('anthropic'), WS);
    for (const bad of ['wrkspc_', 'wrkspc_bad!', 'ws_123456789', ` ${WS}`, 42]) await expect(settings.set(workspaceSettingKey('anthropic'), bad)).rejects.toThrow();
    expect(settings.get(workspaceSettingKey('anthropic'))).toBe(WS);
    expect(() => settings.get(workspaceSettingKey('openai'))).toThrow();
  });

  it('مفتاح حساب خدمة غير مقيّد: بلا معرّف «غير متحقق منه» بسبب مساحة العمل لا «منتهٍ»، وبمعرّفه يُقبل ويحلّل بالترويسة نفسها', async () => {
    const api = claudeApi({ key: SVC, workspace: WS });
    const h = await harness(api);
    const first = await h.service.verify('anthropic');
    expect(first).toMatchObject({ ok: false, failure: 'workspace' });
    const status = await h.service.status('anthropic');
    expect(status?.key).toMatchObject({ health: 'unverified', detail: { reason: expect.stringContaining('مساحة عمل') } });
    expect(JSON.stringify(status)).not.toContain(SVC);
    expect(api.sent.at(-1)?.headers).not.toHaveProperty('anthropic-workspace-id');

    await h.settings.set(workspaceSettingKey('anthropic'), OTHER_WS);
    expect(await h.service.verify('anthropic')).toMatchObject({ ok: false, failure: 'workspace', status: 404 });
    expect((await h.service.status('anthropic'))?.key?.health).toBe('unverified');

    await h.settings.set(workspaceSettingKey('anthropic'), WS);
    expect(await h.service.verify('anthropic')).toMatchObject({ ok: true });
    expect((await h.service.status('anthropic'))?.key?.health).toBe('healthy');
    await h.settings.set(modelSettingKey('anthropic'), 'mock-haiku-1');
    const analysis = await h.service.analyze({ requestId: 'r1', section: 'checks', provider: 'anthropic', model: 'mock-haiku-1', system: 's', prompt: 'SYNTHETIC_AUDIT_ONLY' }, 'tab-1');
    expect(analysis).toMatchObject({ ok: true, data: { text: 'pong' } });
    expect(api.sent.slice(-2).map((s) => [s.path, s.headers['anthropic-workspace-id']])).toEqual([
      ['/v1/models', WS],
      ['/v1/messages', WS],
    ]);
  });

  it('رفض مساحة العمل أثناء التحليل لا يغيّر صحة المفتاح، و401 لمفتاح آخر يُعلَّم رفضًا للمفتاح', async () => {
    const api = claudeApi({ key: SVC, workspace: WS });
    const h = await harness(api);
    await h.settings.set(workspaceSettingKey('anthropic'), WS);
    await h.service.verify('anthropic');
    await h.settings.set(modelSettingKey('anthropic'), 'mock-haiku-1');
    await h.settings.set(workspaceSettingKey('anthropic'), OTHER_WS);
    const analysis = await h.service.analyze({ requestId: 'r2', section: 'checks', provider: 'anthropic', model: 'mock-haiku-1', system: 's', prompt: 'SYNTHETIC_AUDIT_ONLY' }, 'tab-1');
    expect(analysis).toMatchObject({ ok: false, failure: 'workspace' });
    expect((await h.service.status('anthropic'))?.key?.health).toBe('healthy');

    const wrong = await harness(claudeApi({ key: USR, workspace: null }), SVC);
    expect(await wrong.service.verify('anthropic')).toMatchObject({ ok: false, failure: 'unauthorized' });
    expect((await wrong.service.status('anthropic'))?.key?.health).toBe('expired');
  });
});

describe('AD-38: البطاقة تقبل مفتاح حساب الخدمة وتطلب معرّف مساحة العمل حين يلزم، بلا تخمين', () => {
  const mounted: HTMLElement[] = [];
  const flush = async () => {
    for (let n = 0; n < 12; n += 1) await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  };
  afterEach(() => {
    for (const c of mounted) {
      render(null, c);
      c.remove();
    }
    mounted.length = 0;
  });

  async function mount(api: ReturnType<typeof claudeApi>) {
    const h = await harness(api, '');
    const port: ProviderPort = {
      status: (p?: string) => h.service.status(p),
      verify: (p, o) => h.service.verify(p, o?.suggest),
      probe: (p, m) => h.service.probe(p, m),
      analyze: (i) => h.service.analyze(i, 'tab'),
      cancel: async (id) => void h.service.cancel(id),
    };
    const c = document.createElement('div');
    document.body.append(c);
    mounted.push(c);
    act(() => render(<ProviderCard settings={h.settings} stores={h.store} permissions={h.permissions} port={port} descriptors={h.descriptors} target="chromium" now={() => NOW} />, c));
    await flush();
    const $ = (sel: string) => c.querySelector(sel);
    const type = async (sel: string, value: string, commit: 'blur' | 'enter') => {
      const field = $(sel) as HTMLInputElement;
      field.value = value;
      act(() => void field.dispatchEvent(new Event('input', { bubbles: true })));
      // كالمتصفح: blur ثم focusout (preact/compat يربط onBlur بالثاني).
      act(() => {
        if (commit === 'enter') return void field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        field.dispatchEvent(new FocusEvent('blur'));
        field.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      });
      await flush();
    };
    const submit = async (value: string) => {
      (c.querySelector('#mj-key-input') as HTMLInputElement).value = value;
      act(() => void (c.querySelector('[data-key-form]') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      await flush();
    };
    return { ...h, c, $, type, submit };
  }

  it('مفتاح sk-ant-svc… يمر بفحص الصيغة ويُتحقق منه؛ ورفض مساحة العمل رسالة تحذير بسببها، ثم يُقبل بالمعرّف المكتوب', async () => {
    const api = claudeApi({ key: SVC, workspace: WS });
    const m = await mount(api);
    expect(m.$('[data-workspace-field]')).not.toBeNull();
    await m.submit(SVC);
    expect(api.sent).toHaveLength(1);
    expect(m.$('[data-key-message]')?.getAttribute('data-tone')).toBe('warning');
    expect(m.$('[data-key-message]')?.textContent).toContain('معرّف مساحة عمل');
    expect(m.$('[data-key-message]')?.textContent).toContain('not scoped to a workspace');
    expect(m.$('[data-provider-key]')?.getAttribute('data-health')).toBe('unverified');
    expect(m.c.innerHTML).not.toContain(SVC);

    await m.type('[data-workspace-input]', 'wrkspc_bad!', 'blur');
    expect(m.$('[data-workspace-error]')?.textContent).toContain('wrkspc_');
    expect(m.settings.get(workspaceSettingKey('anthropic'))).toBe('');
    expect(api.sent).toHaveLength(1);

    await m.type('[data-workspace-input]', ` ${WS} `, 'enter');
    expect(m.$('[data-workspace-error]')).toBeNull();
    expect(m.settings.get(workspaceSettingKey('anthropic'))).toBe(WS);
    expect(m.$('[data-key-message]')?.textContent).toContain('anthropic-workspace-id');
    expect(api.sent).toHaveLength(1);

    act(() => trustedClick(m.$('[data-action="key-check"]') as HTMLButtonElement));
    await flush();
    expect(api.sent).toHaveLength(2);
    expect(api.sent[1]?.headers['anthropic-workspace-id']).toBe(WS);
    expect(m.$('[data-key-message]')?.getAttribute('data-tone')).toBe('success');
    expect(m.$('[data-provider-key]')?.getAttribute('data-health')).toBe('healthy');
    expect(m.c.innerHTML).not.toContain(SVC);
  });

  it('مفتاح مقيّد بمساحة عمل (أو شخصي في مساحته): يُقبل بلا معرّف ولا ترويسة؛ ومفتاح الإدارة يُرفض محليًا بلا طلب', async () => {
    const api = claudeApi({ key: USR, workspace: null });
    const m = await mount(api);
    await m.submit(synth('admin01'));
    expect(m.$('[data-key-message]')?.textContent).toContain('مفتاح إدارة');
    expect(api.sent).toHaveLength(0);
    await m.submit(USR);
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]?.headers).not.toHaveProperty('anthropic-workspace-id');
    expect(m.$('[data-provider-key]')?.getAttribute('data-health')).toBe('healthy');
  });

  it('بطاقة OpenAI بلا حقل مساحة عمل', async () => {
    const m = await mount(claudeApi({ key: SVC, workspace: null }));
    await act(async () => void (await m.settings.set(PROVIDER_ID_KEY, 'openai')));
    await flush();
    expect(m.$('[data-provider-card]')?.getAttribute('data-provider-card')).toBe('openai');
    expect(m.$('[data-workspace-field]')).toBeNull();
  });
});

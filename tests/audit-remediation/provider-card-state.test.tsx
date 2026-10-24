// @vitest-environment jsdom
/**
 * F-05 (Codex UI-2 وUI-3): دورة حياة حالة بطاقة المزوّد.
 * - مفتاح مُسح أو استُبدل من صفحة إعدادات أخرى لا يبقى معروضًا ولا تبقى نتيجة اختباره في البطاقة المفتوحة.
 * - ردّ متأخر لمزوّد سابق لا يكتب فوق حالة المزوّد المختار الآن.
 * - الجولة الثانية: عملية (حفظ، تحقق، مسح، قائمة) بدأت لمزوّد أو مفتاح سابق لا تكتب رسالتها ولا حالتها ولا تُنهي انشغال عملية أحدث، والانشغال
 *   يُفرج عنه عند تبديل المزوّد، ورسالة مفتاح وتأكيد مسحه لا يبقيان بعد استبداله أو مسحه.
 * المكوّن والإعدادات والمخازن والخدمة والمحوّلات حقيقية؛ الشبكة والصلاحيات محاكاة (لا مفاتيح حقيقية ولا طلبات حية).
 */
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../src/core';
import { SecretStore } from '../../src/core/connections/secrets';
import type { ConnectionStatus } from '../../src/core/connections/health';
import { ConnectionsService } from '../../src/core/connections/service';
import { ProviderService, memoryModelsCache } from '../../src/modules/e/provider/service';
import { createProviderRegistry } from '../../src/modules/e/provider/registry';
import { OPENAI_ADAPTER } from '../../src/modules/e/provider/adapters/openai';
import { ANTHROPIC_ADAPTER } from '../../src/modules/e/provider/adapters/anthropic';
import { defineProviderSettings, modelSettingKey, PROVIDER_ID_KEY } from '../../src/modules/e/provider/settings';
import { ProviderCard } from '../../src/modules/e/provider/ProviderCard';
import type { ProviderPort } from '../../src/modules/e/provider/port';
import { fakePermissions } from '../core/ui-host/helpers';
import { memoryArea } from '../modules/d/token/helpers';
import { trustedClick } from '../shared/trusted-click';

const mounted: HTMLElement[] = [];
// مهمة كاملة لا دورات وعود فقط: قراءة الحالة تمر بالإعدادات والسجل والمخازن، والأحدث وحده يُعرض.
const flush = async () => {
  for (let n = 0; n < 10; n += 1) await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
};
afterEach(() => {
  for (const c of mounted) {
    render(null, c);
    c.remove();
  }
  mounted.length = 0;
});

async function setup() {
  const adapters = [ANTHROPIC_ADAPTER, OPENAI_ADAPTER];
  const descriptors = adapters.map((a) => a.descriptor);
  const area = new MemoryStorageArea();
  const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r, descriptors)));
  await settings.set(PROVIDER_ID_KEY, 'openai');
  await settings.set(modelSettingKey('openai'), 'audit-model');
  let tick = 100;
  const keys = new Map(descriptors.map((d) => [d.id, new SecretStore({ session: memoryArea(), disk: null, now: () => (tick += 1) })]));
  const stores = (id: string) => keys.get(id) as SecretStore;
  await stores('openai').save(`sk-${'audit'.repeat(12)}`, 'session');
  const permissions = fakePermissions(descriptors.map((d) => d.origin));
  const connections = new ConnectionsService({ stores: {}, providerKeys: { selected: async () => settings.get<string>(PROVIDER_ID_KEY), store: stores }, fixable: [] });
  const reply = { id: 'audit', status: 'completed', model: 'audit-model', output: [{ type: 'message', content: [{ type: 'output_text', text: 'pong' }] }] };
  const service = new ProviderService({
    registry: createProviderRegistry(adapters),
    keys: stores,
    permissions,
    settings: async () => settings,
    connections,
    cache: memoryModelsCache(),
    // قائمة النماذج (طلب التحقق) بصيغة المزوّدَين معًا، وما عداها ردّ الاختبار.
    fetch: (async (input: RequestInfo | URL) =>
      new Response(JSON.stringify(String(input).includes('/v1/models') ? { data: [{ id: 'audit-model', created: 1 }], has_more: false } : reply), { status: 200 })) as typeof fetch,
  });
  await service.probe('openai', 'audit-model');
  const port: ProviderPort = {
    status: vi.fn((p?: string) => service.status(p)),
    verify: (p, o) => service.verify(p, o?.suggest),
    probe: (p, m) => service.probe(p, m),
    analyze: (i) => service.analyze(i, 'audit-tab'),
    cancel: async (id) => void service.cancel(id),
  };
  const c = document.createElement('div');
  document.body.append(c);
  mounted.push(c);
  const draw = (status?: ConnectionStatus | null) =>
    render(<ProviderCard settings={settings} stores={stores} permissions={permissions} port={port} descriptors={descriptors} target="chromium" status={status} />, c);
  act(() => draw());
  await flush();
  const $ = (sel: string) => c.querySelector(sel);
  const advance = (ms: number) => (tick += ms);
  const submit = async (value: string) => {
    (c.querySelector('#mj-key-input') as HTMLInputElement).value = value;
    act(() => void (c.querySelector('[data-key-form]') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();
  };
  const button = (action: string) => c.querySelector(`[data-action="${action}"]`) as HTMLButtonElement;
  return { c, $, settings, stores, service, port, draw, advance, submit, button };
}

it('UI-2: مفتاح مُسح من صفحة أخرى، ثم وصلت حالة السجل الأحدث من الأب: تُزال حالة وجوده ونتيجة اختباره من البطاقة المفتوحة', async () => {
  const s = await setup();
  expect(s.$('[data-key-state]')?.getAttribute('data-key-state')).toBe('session');
  expect(s.$('[data-model-test]')?.getAttribute('data-model-test')).toBe('accepted');
  await s.stores('openai').clear();
  const fresh = await s.service.status('openai');
  expect(fresh?.key?.health).toBe('none');
  expect(fresh?.test).toBeNull();
  act(() => s.draw(fresh?.key));
  await flush();
  expect(s.$('[data-key-state]')?.getAttribute('data-key-state')).toBe('none');
  expect(s.$('[data-model-test]')).toBeNull();
  expect(s.$('[data-provider-key]')?.getAttribute('data-health')).toBe('none');
});

it('UI-2: مفتاح استُبدل من صفحة أخرى ثم عادت هذه الصفحة إلى الواجهة: يُقرأ من جديد وتختفي نتيجة اختبار المفتاح السابق', async () => {
  const s = await setup();
  expect(s.$('[data-model-test]')?.getAttribute('data-model-test')).toBe('accepted');
  const before = s.$('[data-key-state]')?.parentElement?.textContent ?? '';
  s.advance(3 * 24 * 60 * 60 * 1000);
  await s.stores('openai').save(`sk-${'other'.repeat(12)}`, 'session');
  await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
  await flush();
  expect(s.$('[data-model-test]')).toBeNull();
  expect(s.$('[data-provider-key]')?.getAttribute('data-health')).toBe('unverified');
  expect(s.$('[data-key-state]')?.parentElement?.textContent ?? '').not.toBe(before);
});

it('UI-3: ردّ اختبار متأخر للمزوّد السابق بعد التبديل لا يمحو حالة المزوّد الحالي ولا يتركها «جارٍ التحقق»', async () => {
  const s = await setup();
  let release!: () => void;
  const pending = new Promise<void>((r) => (release = r));
  let started!: () => void;
  const ready = new Promise<void>((r) => (started = r));
  s.port.probe = async (p, m) => {
    started();
    await pending;
    return s.service.probe(p, m);
  };
  act(() => trustedClick(s.$('[data-action="model-test"]') as HTMLButtonElement));
  await flush();
  await ready;
  await act(async () => void (await s.settings.set(PROVIDER_ID_KEY, 'anthropic')));
  await flush();
  expect(s.$('[data-provider-card]')?.getAttribute('data-provider-card')).toBe('anthropic');
  expect(s.$('[data-provider-key]')?.getAttribute('data-health')).toBe('none');
  await act(async () => release());
  await flush();
  for (const r of (s.port.status as ReturnType<typeof vi.fn>).mock.results) await r.value;
  await flush();
  expect(s.$('[data-provider-card]')?.getAttribute('data-provider-card')).toBe('anthropic');
  expect(s.$('[data-provider-key]')?.getAttribute('data-health')).toBe('none');
  expect(s.$('[data-key-state]')?.getAttribute('data-key-state')).toBe('none');
});

describe('F-05 (الجولة الثانية): ردود متأخرة وإغلاقات قديمة وانشغال بعد تبديل المزوّد أو استبدال المفتاح أو مسحه', () => {
  type Setup = Awaited<ReturnType<typeof setup>>;
  const OTHER = `sk-${'other'.repeat(12)}`;
  const ANT = `sk-ant-api03-${'a'.repeat(24)}`;
  const until = async (done: () => boolean) => {
    for (let n = 0; n < 30 && !done(); n += 1) await flush();
    expect(done()).toBe(true);
  };
  /** طلب التحقق يكتمل في الخلفية بالمفتاح الذي كان محفوظًا عند إرساله، ثم يتأخر ردّه إلى البطاقة حتى يُفرج عنه. */
  const gateVerify = (s: Setup) => {
    const calls: Array<{ readonly provider: string; readonly release: () => void }> = [];
    s.port.verify = async (p, o) => {
      const result = await s.service.verify(p, o?.suggest);
      await new Promise<void>((release) => calls.push({ provider: p, release }));
      return result;
    };
    return calls;
  };
  const message = (s: Setup) => s.$('[data-key-message]')?.textContent ?? null;

  it('حفظ بدأ لـOpenAI ثم تغيّر المزوّد من صفحة أخرى: تُفرج الأزرار فورًا، وختامه المتأخر لا يكتب رسالة ولا يُنهي انشغال حفظ Anthropic الجاري', async () => {
    const s = await setup();
    const calls = gateVerify(s);
    await s.submit(`sk-${'fresh'.repeat(12)}`);
    await until(() => calls.length === 1);
    expect(s.button('key-save').disabled).toBe(true);
    await act(async () => void (await s.settings.set(PROVIDER_ID_KEY, 'anthropic')));
    await flush();
    expect(s.$('[data-provider-card]')?.getAttribute('data-provider-card')).toBe('anthropic');
    expect(s.button('key-save').disabled).toBe(false);
    expect(message(s)).toBeNull();

    await s.submit(ANT);
    await until(() => calls.length === 2);
    expect(calls[1]?.provider).toBe('anthropic');
    await act(async () => calls[0]?.release());
    await flush();
    expect(message(s)).toBeNull();
    expect(s.button('key-save').disabled).toBe(true);

    await act(async () => calls[1]?.release());
    await flush();
    expect(message(s)).toContain('قبِل Anthropic');
    expect(s.button('key-save').disabled).toBe(false);
    // كل مفتاح حُفظ في مخزن المزوّد الذي لُصق له.
    expect((await s.stores('anthropic').info())?.place).toBe('session');
    expect((await s.stores('openai').info())?.place).toBe('session');
  });

  it('تحقق بدأ بمفتاح ثم استُبدل المفتاح قبل وصول ردّه: لا تُعرض «قبِل» للمفتاح الجديد ولا يُنسب إليه نجاح المفتاح السابق', async () => {
    const s = await setup();
    const calls = gateVerify(s);
    act(() => trustedClick(s.button('key-check')));
    await until(() => calls.length === 1);
    s.advance(60_000);
    await s.stores('openai').save(OTHER, 'session');
    await act(async () => calls[0]?.release());
    await flush();
    expect(message(s)).toBeNull();
    expect(s.$('[data-provider-key]')?.getAttribute('data-health')).toBe('unverified');
    expect(s.button('key-check').disabled).toBe(false);
  });

  it('رسالة نجاح المفتاح وتأكيد مسحه المفتوح لا يبقيان بعد مسح المفتاح من صفحة أخرى', async () => {
    const s = await setup();
    act(() => trustedClick(s.button('key-check')));
    await until(() => (message(s) ?? '').includes('قبِل OpenAI'));
    act(() => trustedClick(s.button('key-clear')));
    await flush();
    expect(s.$('[data-key-confirm]')).not.toBeNull();
    await s.stores('openai').clear();
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(s.$('[data-key-state]')?.getAttribute('data-key-state')).toBe('none');
    expect(message(s)).toBeNull();
    expect(s.$('[data-key-confirm]')).toBeNull();
  });

  it('مسح مفتاح OpenAI انتهى بعد التبديل إلى Anthropic: يُمسح مفتاح OpenAI وحده، ويبقى مفتاح Anthropic معروضًا بلا رسالة مسح', async () => {
    const s = await setup();
    await s.stores('anthropic').save(ANT, 'session');
    const store = s.stores('openai');
    const clear = store.clear.bind(store);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    store.clear = async () => {
      await gate;
      return clear();
    };
    act(() => trustedClick(s.button('key-clear')));
    await flush();
    act(() => trustedClick(s.button('key-clear-confirm')));
    await flush();
    await act(async () => void (await s.settings.set(PROVIDER_ID_KEY, 'anthropic')));
    await flush();
    expect(s.$('[data-key-state]')?.getAttribute('data-key-state')).toBe('session');
    await act(async () => release());
    await flush();
    expect(await store.info()).toBeNull();
    expect(s.$('[data-provider-card]')?.getAttribute('data-provider-card')).toBe('anthropic');
    expect(s.$('[data-key-state]')?.getAttribute('data-key-state')).toBe('session');
    expect(message(s)).toBeNull();
  });

  it('جلب القائمة بدأ بمفتاح ثم استُبدل المفتاح: يعود الحقل خاملًا ولا يُعرض فشل الطلب السابق حين يصل', async () => {
    const s = await setup();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    s.port.verify = async () => {
      await gate;
      return { ok: false, failure: 'network', status: null, message: 'ردّ متأخر للمفتاح السابق', retryAt: null };
    };
    act(() => trustedClick(s.button('model-list')));
    await flush();
    expect(s.$('[data-list-state]')?.getAttribute('data-list-state')).toBe('loading');
    s.advance(60_000);
    await s.stores('openai').save(OTHER, 'session');
    await act(async () => void document.dispatchEvent(new Event('visibilitychange')));
    await flush();
    expect(s.$('[data-list-state]')?.getAttribute('data-list-state')).not.toBe('loading');
    await act(async () => release());
    await flush();
    expect(s.$('[data-list-state]')?.getAttribute('data-list-state')).not.toBe('failed');
    expect(s.c.textContent).not.toContain('ردّ متأخر للمفتاح السابق');
  });
});

// @vitest-environment jsdom
/**
 * F-05 (Codex UI-2 وUI-3): دورة حياة حالة بطاقة المزوّد.
 * - مفتاح مُسح أو استُبدل من صفحة إعدادات أخرى لا يبقى معروضًا ولا تبقى نتيجة اختباره في البطاقة المفتوحة.
 * - ردّ متأخر لمزوّد سابق لا يكتب فوق حالة المزوّد المختار الآن.
 * المكوّن والإعدادات والمخازن والخدمة والمحوّلات حقيقية؛ الشبكة والصلاحيات محاكاة (لا مفاتيح حقيقية ولا طلبات حية).
 */
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
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
    fetch: (async () => new Response(JSON.stringify(reply), { status: 200 })) as typeof fetch,
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
  return { c, $, settings, stores, service, port, draw, advance };
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

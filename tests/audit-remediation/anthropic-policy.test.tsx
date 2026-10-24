// @vitest-environment jsdom
// COR-AUD-03 (Gemini): ملخص سياسة Anthropic يجمع الاحتفاظ (30 يومًا) وعدم التدريب، والرابط الوحيد كان مقالة الاحتفاظ (7996866). فيُسند كل شطر
// إلى مقالته: الاحتفاظ والتدريب (7996868، كما في Docs/Site/privacy.md)، في الدليل حيث الملخص وفي بطاقة المزوّد ونافذة الموافقة حيث رابط السياسة.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry } from '../../src/core';
import { SecretStore } from '../../src/core/connections/secrets';
import { ConnectionsService } from '../../src/core/connections/service';
import { ConsentSheet, prepareAnalysis } from '../../src/modules/e/provider';
import { ProviderCard } from '../../src/modules/e/provider/ProviderCard';
import { ANTHROPIC_ADAPTER } from '../../src/modules/e/provider/adapters/anthropic';
import { ANTHROPIC } from '../../src/modules/e/provider/descriptors/anthropic';
import type { ProviderPort } from '../../src/modules/e/provider/port';
import { createProviderRegistry } from '../../src/modules/e/provider/registry';
import { ProviderService, memoryModelsCache } from '../../src/modules/e/provider/service';
import { PROVIDER_ID_KEY, defineProviderSettings } from '../../src/modules/e/provider/settings';
import { ProviderKeyGuide } from '../../src/options/guide/ProviderKeyGuide';
import { fakePermissions } from '../core/ui-host/helpers';
import { memoryArea } from '../modules/d/token/helpers';
import { NOW, SAMPLES, contextOf } from '../modules/e/context/samples';

const RETENTION = 'https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data';
const TRAINING = 'https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training';

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const hrefs = (selector: string): string[] => [...container.querySelectorAll<HTMLAnchorElement>(selector)].map((a) => a.getAttribute('href') ?? '');
const flush = async () => {
  for (let n = 0; n < 10; n += 1) await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
};

describe('COR-AUD-03: كل شطر من ملخص سياسة Anthropic بمقالته', () => {
  it('الوصف: الاحتفاظ والتدريب كلٌّ برابطه وعنوانه، والملخص كما هو', () => {
    expect(ANTHROPIC.policy.url).toBe(RETENTION);
    expect(ANTHROPIC.policy.also?.url).toBe(TRAINING);
    expect(ANTHROPIC.policy.label).toContain('الاحتفاظ');
    expect(ANTHROPIC.policy.also?.label).toContain('التدريب');
    expect(ANTHROPIC.policy.summary).toMatch(/30 يومًا.*ولا يدرّب/);
  });

  it('الدليل: سطر Anthropic بجانب الملخص يربط المقالتين', () => {
    act(() => render(<ProviderKeyGuide onBack={() => {}} onAdd={() => {}} descriptors={[ANTHROPIC]} />, container));
    expect(hrefs('[data-retention-provider="anthropic"] a')).toEqual([RETENTION, TRAINING]);
  });

  it('نافذة الموافقة: رابطا السياسة', () => {
    const prepared = prepareAnalysis(contextOf(SAMPLES.pr, {}, { collectedAt: NOW }), { template: 'review', task: 'راجع التغييرات.' });
    const destination = { provider: 'Anthropic', host: ANTHROPIC.host, policy: ANTHROPIC.policy, model: { id: 'mock-sonnet-2', displayName: 'Mock Sonnet 2' }, permission: true };
    act(() => render(<ConsentSheet prepared={prepared} destination={destination} onConfirm={() => {}} onCancel={() => {}} onSettings={() => {}} />, container));
    expect(hrefs('[data-consent-policy]')).toEqual([RETENTION, TRAINING]);
  });

  it('بطاقة المزوّد في الإعدادات: رابطا السياسة', async () => {
    const descriptors = [ANTHROPIC_ADAPTER.descriptor];
    const area = new MemoryStorageArea();
    const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((r) => defineProviderSettings(r, descriptors)));
    await settings.set(PROVIDER_ID_KEY, 'anthropic');
    const key = new SecretStore({ session: memoryArea(), disk: null, now: () => NOW });
    const permissions = fakePermissions([ANTHROPIC.origin]);
    const connections = new ConnectionsService({ stores: {}, providerKeys: { selected: async () => 'anthropic', store: () => key }, fixable: [] });
    const service = new ProviderService({ registry: createProviderRegistry([ANTHROPIC_ADAPTER]), keys: () => key, permissions, settings: async () => settings, connections, cache: memoryModelsCache() });
    const port: ProviderPort = {
      status: (p?: string) => service.status(p),
      verify: (p, o) => service.verify(p, o?.suggest),
      probe: (p, m) => service.probe(p, m),
      analyze: (i) => service.analyze(i, 'audit-tab'),
      cancel: async (id) => void service.cancel(id),
    };
    act(() => render(<ProviderCard settings={settings} stores={() => key} permissions={permissions} port={port} descriptors={descriptors} target="chromium" />, container));
    await flush();
    expect(hrefs('[data-provider-policy]')).toEqual([RETENTION, TRAINING]);
  });
});

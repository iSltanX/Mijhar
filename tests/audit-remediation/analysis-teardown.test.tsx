// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// F-02 (تدقيق ما قبل الإصدار): تعطيل الوحدة أثناء انتظار تأكيد وجهة التحليل (بعد «إرسال للتحليل» وقبل رد status) لا يُرسل شيئًا بعد زوال واجهتها.
import { expect, it, vi } from 'vitest';
import { createPrStatusModule } from '../../src/modules/d/pr-status';
import type { SectionAnalysisDeps } from '../../src/modules/d/analysis';
import type { ProviderStatus } from '../../src/modules/e/provider';
import { trustedClick } from '../shared/trusted-click';
import { flush, hostsOf, loadHtml, mountModules } from '../modules/d/helpers';
import { providerSystem } from '../modules/e/provider/helpers';

it('F-02: لا طلب تحليل بعد تعطيل الوحدة أثناء انتظار تأكيد الوجهة', async () => {
  const system = await providerSystem();
  await system.options.verify('anthropic');
  const status = (await system.tab().status())!;
  let finish!: (s: ProviderStatus) => void;
  const deferred = new Promise<ProviderStatus>((r) => {
    finish = r;
  });
  const provider = {
    status: vi.fn().mockResolvedValueOnce(status).mockReturnValueOnce(deferred),
    verify: vi.fn(),
    probe: vi.fn(),
    analyze: vi.fn((input: Parameters<ReturnType<typeof system.tab>['analyze']>[0]) => system.tab().analyze(input)),
    cancel: vi.fn(async () => undefined),
  };
  const connections = { status: vi.fn(async () => [status.key]), pending: vi.fn(), returnToFeature: vi.fn(), dismiss: vi.fn() };
  const deps = { provider, connections, openSettings: vi.fn(), messages: null, newId: () => 'audit-teardown' } as unknown as SectionAnalysisDeps;
  loadHtml('fixture-pr-complex.html');
  const { manager, errors } = await mountModules([createPrStatusModule({ debounceMs: 5, api: null, connections: null, analysis: deps })]);
  await flush(30);
  const root = hostsOf('d.pr-status')[0]?.shadowRoot as ShadowRoot;
  trustedClick(root.querySelector('[data-action="analysis-open"]') as HTMLButtonElement);
  await flush(20);
  trustedClick(root.querySelector('[data-action="consent-confirm"]') as HTMLButtonElement);
  expect(provider.status).toHaveBeenCalledTimes(2);
  manager.stop();
  expect(hostsOf('d.pr-status')).toHaveLength(0);
  finish(status);
  await flush(30);
  expect(errors).toEqual([]);
  expect(provider.analyze).not.toHaveBeenCalled();
  expect(system.provider.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
});

// أداة تكامل طبقة المزوّد: الخلفية الفعلية (startBackground) بسجل الاتصالات وخدمة المزوّد، برمز GitHub ومفتاح مزوّد محفوظين معًا في مخزنيهما
// المستقلين، وfetch وهمي لكلٍّ من GitHub والمزوّد (fixture-provider-mock)، فلا يخرج طلب حقيقي. ومنفذا صفحة الإعدادات وسكربت المحتوى يراسلانها
// كما في الإضافة؛ وكل رسالة ورد تُنسخ بـJSON كما يفعل المتصفح، فيُفحص ألا سرّ فيها.
import { vi } from 'vitest';
import { startBackground } from '../../../../src/background/main';
import { MemoryStorageArea } from '../../../../src/core';
import { SecretStore } from '../../../../src/core/connections/secrets';
import { memoryHealthLog } from '../../../../src/core/connections/service';
import type { ExtensionApi, TabLike } from '../../../../src/core/ui-host/browser-api';
import { runtimeProviderPort } from '../../../../src/modules/e/provider';
import { memoryModelsCache } from '../../../../src/modules/e/provider/service';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { fakeToken, memoryArea } from '../../d/token/helpers';
import { fakeKey, providerMock } from './fixture-provider-mock';
import type { MockScenario } from './fixture-provider-mock';

export const ANTHROPIC_ORIGIN = 'https://api.anthropic.com/*';
export const GITHUB_ORIGIN = 'https://api.github.com/*';

export interface ProviderSystemOptions {
  readonly scenario?: MockScenario;
  /** صلاحيات المضيف الممنوحة مسبقًا. الافتراضي الاثنتان. */
  readonly granted?: readonly string[];
  readonly withKey?: boolean;
  readonly withToken?: boolean;
  readonly now?: () => number;
  /** هدف البناء؛ Firefox يشترط موافقة مشاركة محتوى المواقع للتحليل (AD-15). */
  readonly target?: 'chromium' | 'firefox';
  /** موافقات جمع البيانات الممنوحة مسبقًا (Firefox). */
  readonly collected?: readonly string[];
}

export async function providerSystem(options: ProviderSystemOptions = {}) {
  const provider = providerMock(options.scenario);
  const github: Array<{ url: string; init: RequestInit }> = [];
  const githubFetch = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    github.push({ url: String(url), init });
    return new Response(JSON.stringify({ resources: { core: { limit: 5000, remaining: 4999, reset: 1 } } }), { status: 200, headers: { 'content-type': 'application/json', 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4999' } });
  });
  const permissions = fakePermissions([...(options.granted ?? [GITHUB_ORIGIN, ANTHROPIC_ORIGIN])]);
  for (const d of options.collected ?? []) permissions.collected.add(d);
  const listeners: Array<(m: unknown, s: { tab?: TabLike; url?: string }, reply: (r?: unknown) => void) => unknown> = [];
  const api = {
    runtime: {
      getURL: (p: string) => `chrome-extension://mijhar/${p}`,
      sendMessage: vi.fn(async () => undefined),
      openOptionsPage: vi.fn(async () => undefined),
      onMessage: { addListener: (l: (typeof listeners)[number]) => void listeners.push(l), removeListener: () => {} },
    },
    permissions,
    tabs: { create: vi.fn(async () => ({ id: 99 })), query: vi.fn(async () => []), sendMessage: vi.fn(async () => undefined), update: vi.fn(async (id: number) => ({ id })) },
    windows: { getCurrent: vi.fn(async () => ({ id: 3 })), update: vi.fn(async () => ({})) },
  } as unknown as ExtensionApi;
  const now = options.now ?? (() => Date.now());
  const tokens = new SecretStore({ session: memoryArea(), disk: memoryArea(), now });
  const providerKeys = new SecretStore({ session: memoryArea(), disk: memoryArea(), now });
  const token = fakeToken('P');
  const key = fakeKey('P');
  if (options.withToken !== false) await tokens.save(token, 'session');
  if (options.withKey !== false) await providerKeys.save(key, 'session');
  const area = new MemoryStorageArea();
  const cache = memoryModelsCache();
  await startBackground({
    api,
    target: options.target ?? 'chromium',
    binding: { area, changes: area },
    fetch: githubFetch as unknown as typeof fetch,
    providerFetch: provider.fetch,
    tokens,
    providerKeys,
    healthLog: memoryHealthLog(),
    modelsCache: cache,
  }).ready;
  const sent: unknown[] = [];
  const replies: unknown[] = [];
  const dispatch = (message: unknown, sender: { tab?: TabLike; url?: string }) =>
    new Promise<unknown>((resolve) => {
      const copy = JSON.parse(JSON.stringify(message)) as unknown;
      sent.push(copy);
      let answered = false;
      const respond = (response?: unknown) => {
        answered = true;
        const back = JSON.parse(JSON.stringify(response ?? null)) as unknown;
        replies.push(back);
        resolve(back);
      };
      const async = listeners.some((l) => l(copy, sender, respond) === true);
      if (!async && !answered) resolve(undefined);
    });
  const optionsRuntime = { sendMessage: (m: unknown) => dispatch(m, { url: 'chrome-extension://mijhar/options.html' }) };
  const tabRuntime = (tabId = 41) => ({ sendMessage: (m: unknown) => dispatch(m, { tab: { id: tabId, windowId: 3, url: 'https://github.com/octo/demo/actions/runs/1/job/2' } }) });
  return {
    provider,
    github,
    githubFetch,
    permissions,
    tokens,
    providerKeys,
    token,
    key,
    area,
    cache,
    sent,
    replies,
    /** منفذ صفحة الإعدادات (التحقق). */
    options: runtimeProviderPort(optionsRuntime),
    /** منفذ سكربت المحتوى في تبويب. */
    tab: (tabId?: number) => runtimeProviderPort(tabRuntime(tabId)),
    tabRuntime,
  };
}

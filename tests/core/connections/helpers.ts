// أدوات اختبارات سجل الاتصالات (T-11.1، T-11.5): خلفية فعلية (startBackground) بمخزنَي سرّين ذاكريين مستقلين وشبكة وهمية وتبويبات وهمية،
// ورسائل تعبر تسلسل JSON كما في runtime.sendMessage، ومنفذا الطبقة العامة والسجل كما تستعملهما صفحة الإعدادات وسكربت المحتوى.
import { vi } from 'vitest';
import { startBackground } from '../../../src/background/main';
import { MemoryStorageArea, runtimePort } from '../../../src/core';
import type { ExtensionApi, TabLike } from '../../../src/core';
import { runtimeConnectionsPort } from '../../../src/core/connections/port';
import { SecretStore } from '../../../src/core/connections/secrets';
import { memoryHealthLog } from '../../../src/core/connections/service';
import { fakePermissions } from '../ui-host/helpers';
import { memoryArea } from '../../modules/d/token/helpers';
import type { Call, Reply } from '../../modules/d/token/helpers';

export { FIXTURE, TOKEN_PATTERN, authHeader, fakeToken, memoryArea, privateRepoReply } from '../../modules/d/token/helpers';
export type { Call, Reply };

/** مفتاح مزوّد بصيغة مختلَقة تُولَّد وقت التشغيل (لا يظهر حرفيًا في المستودع). */
export const fakeProviderKey = (tag = 'A'): string => ['sk', 'ant', 'api03', `${tag}MIJHARFAKEKEY`.repeat(6)].join('-');
export const PROVIDER_PATTERN = /sk-ant-api03-[A-Za-z0-9_-]{20,}/;

export const pathOf = (call: Call): string => {
  const url = new URL(call.url);
  return `${url.pathname}${url.search}`;
};

export interface SystemOptions {
  readonly granted?: boolean;
  readonly target?: 'chromium' | 'firefox';
  readonly now?: () => number;
}

/** الخلفية كاملة بسجل الاتصالات، ومنافذ صفحة الإعدادات وسكربت المحتوى، وتبويب ميزة رقمه 41 في النافذة 3. */
export async function connectionSystem(reply: (call: Call, index: number) => Reply, options: SystemOptions = {}) {
  const calls: Call[] = [];
  let mode: ((call: Call, index: number) => Reply) | null = null;
  const net = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    const r = (mode ?? reply)(call, calls.length - 1);
    if (r.status === 0) throw new TypeError('Failed to fetch');
    return new Response(r.status === 304 ? null : JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json', ...r.headers } });
  });
  const permissions = fakePermissions(options.granted === false ? [] : ['https://api.github.com/*']);
  const listeners: Array<(m: unknown, s: { tab?: TabLike }, reply: (r?: unknown) => void) => unknown> = [];
  const tabMessages: Array<{ tabId: number; message: unknown }> = [];
  const tabs = {
    create: vi.fn(async (p: { url: string }) => ({ id: 99, url: p.url })),
    query: vi.fn(async () => []),
    sendMessage: vi.fn(async (tabId: number, message: unknown) => {
      tabMessages.push({ tabId, message: JSON.parse(JSON.stringify(message)) as unknown });
    }),
    update: vi.fn(async (tabId: number) => ({ id: tabId })),
  };
  const windows = { getCurrent: vi.fn(async () => ({ id: 3 })), update: vi.fn(async () => ({})) };
  const backgroundApi = {
    runtime: {
      getURL: (p: string) => `chrome-extension://mijhar/${p}`,
      sendMessage: vi.fn(async () => undefined),
      openOptionsPage: vi.fn(async () => undefined),
      onMessage: { addListener: (l: (typeof listeners)[number]) => void listeners.push(l), removeListener: () => {} },
    },
    permissions,
    tabs,
    windows,
  } as unknown as ExtensionApi;
  const now = options.now ?? (() => Date.now());
  const tokenSession = memoryArea();
  const tokenDisk = memoryArea();
  const keySession = memoryArea();
  const keyDisk = memoryArea();
  const tokens = new SecretStore({ session: tokenSession, disk: options.target === 'firefox' ? null : tokenDisk, now });
  const providerKeys = new SecretStore({ session: keySession, disk: options.target === 'firefox' ? null : keyDisk, now });
  const healthLog = memoryHealthLog();
  const area = new MemoryStorageArea();
  await startBackground({ api: backgroundApi, target: options.target ?? 'chromium', binding: { area, changes: area }, fetch: net as unknown as typeof fetch, tokens, providerKeys, healthLog }).ready;
  const sent: unknown[] = [];
  const replies: unknown[] = [];
  /** رسالة من سياق: الإعدادات بلا تبويب، أو سكربت المحتوى بتبويبه. */
  const dispatch = (message: unknown, sender: { tab?: TabLike } = {}) =>
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
  const runtime = { sendMessage: (message: unknown) => dispatch(message) };
  const tabRuntime = { sendMessage: (message: unknown) => dispatch(message, { tab: { id: 41, windowId: 3, url: 'https://github.com/octo/demo/pull/1' } }) };
  return {
    calls,
    net,
    setReply: (next: ((call: Call, index: number) => Reply) | null) => {
      mode = next;
    },
    permissions,
    tokens,
    providerKeys,
    tokenSession,
    tokenDisk,
    keySession,
    keyDisk,
    healthLog,
    /** storage.local للإضافة كما تراه الخلفية والإعدادات والتصدير. */
    area,
    tabs,
    windows,
    tabMessages,
    sent,
    replies,
    dispatch,
    /** منفذا صفحة الإعدادات. */
    port: runtimePort(runtime, now),
    connections: runtimeConnectionsPort(runtime),
    /** منفذا سكربت المحتوى في تبويب الميزة. */
    tabPort: runtimePort(tabRuntime, now),
    tabConnections: runtimeConnectionsPort(tabRuntime),
    tabRuntime,
  };
}

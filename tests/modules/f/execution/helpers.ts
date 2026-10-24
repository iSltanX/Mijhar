// أداة تكامل مسار الإنجاز (T-11.8، T-11.9): الخلفية الفعلية (startBackground) برمز قراءة ورمز كتابة في مخزنيهما المستقلين، وGitHub وهمي واحد
// لكل الطلبات (القراءة والكتابة على fetch واحد) يسجّل كل طلب بطريقته ومساره وجسمه ووسم السرّ الذي يحمله (لا قيمته)، فيُفحص أن لا طلب قراءة يحمل
// رمز الكتابة وأن الكتابة ثلاث عمليات لا غير. واللوحة الأصلية (صفحة إضافة) وسكربت المحتوى (تبويب github.com) يراسلانها كما في الإضافة، وكل رسالة
// ورد تُنسخ بـJSON كما يفعل المتصفح.
import { vi } from 'vitest';
import { startBackground } from '../../../../src/background/main';
import { MemoryStorageArea, runtimePort } from '../../../../src/core';
import type { ExtensionApi, TabLike } from '../../../../src/core';
import { SecretStore } from '../../../../src/core/connections/secrets';
import { memoryHealthLog } from '../../../../src/core/connections/service';
import { utf8ToBase64 } from '../../../../src/core/guardrails';
import { runtimeExecutionPort } from '../../../../src/modules/f/execution';
import { fakePermissions } from '../../../core/ui-host/helpers';
import { fakeToken, memoryArea } from '../../d/token/helpers';

export const OWNER = 'octo';
export const REPO = 'demo';
export const BASE_SHA = 'a'.repeat(40);
export const FILE_SHA = 'b'.repeat(40);
export const COMMIT_SHA = 'c'.repeat(40);
export const README = '# Demo\n\nInstall:\n\n    yarn install && yarn dev\n\nOpen http://localhost:5173\n';
export const GITHUB_ORIGIN = 'https://api.github.com/*';
export const PANEL_URL = 'chrome-extension://mijhar/sidepanel.html';

export interface NetCall {
  readonly method: string;
  readonly path: string;
  /** وسم السرّ في ترويسة Authorization: read أو write أو other أو null. */
  readonly auth: 'read' | 'write' | 'other' | null;
  readonly body: unknown;
}

export interface Reply {
  readonly status: number;
  readonly body?: unknown;
}

export interface ExecSystemOptions {
  readonly withRead?: boolean;
  readonly withWrite?: boolean;
  /** رمز القراءة هو رمز الكتابة نفسه (خطأ فصل). */
  readonly sameToken?: boolean;
  readonly granted?: boolean;
  readonly private?: boolean;
  /** يستبدل رد GitHub الوهمي لطلب بعينه. */
  readonly override?: (call: NetCall) => Reply | null;
}

/** رد GitHub الوهمي للمستودع octo/demo: القراءة الثلاث والعمليات الثلاث. */
export function githubReply(call: NetCall, options: ExecSystemOptions): Reply {
  const repo = `/repos/${OWNER}/${REPO}`;
  if (call.method === 'GET' && call.path === repo) return { status: 200, body: { full_name: `${OWNER}/${REPO}`, default_branch: 'main', private: options.private === true } };
  if (call.method === 'GET' && call.path === `${repo}/git/ref/heads/main`) return { status: 200, body: { ref: 'refs/heads/main', object: { sha: BASE_SHA, type: 'commit' } } };
  if (call.method === 'GET' && call.path === `${repo}/contents/README.md?ref=${BASE_SHA}`) return { status: 200, body: { type: 'file', encoding: 'base64', content: utf8ToBase64(README).replace(/(.{60})/g, '$1\n'), sha: FILE_SHA, size: README.length } };
  if (call.method === 'GET' && call.path.startsWith(`${repo}/contents/`)) return { status: 404, body: { message: 'Not Found' } };
  if (call.method === 'POST' && call.path === `${repo}/git/refs`) return { status: 201, body: { ref: (call.body as { ref?: string }).ref, object: { sha: BASE_SHA } } };
  if (call.method === 'PUT' && call.path.startsWith(`${repo}/contents/`)) return { status: 201, body: { content: { sha: 'd'.repeat(40) }, commit: { sha: COMMIT_SHA, html_url: `https://github.com/${OWNER}/${REPO}/commit/${COMMIT_SHA}` } } };
  if (call.method === 'POST' && call.path === `${repo}/pulls`) return { status: 201, body: { number: 7, draft: (call.body as { draft?: boolean }).draft === true, html_url: 'https://evil.example/not-used' } };
  return { status: 404, body: { message: 'Not Found' } };
}

export async function execSystem(options: ExecSystemOptions = {}) {
  const readToken = fakeToken('R');
  const writeToken = options.sameToken ? readToken : fakeToken('W');
  const calls: NetCall[] = [];
  const label = (header: string | null): NetCall['auth'] => (header === null ? null : header === `Bearer ${writeToken}` && options.sameToken !== true ? 'write' : header === `Bearer ${readToken}` ? 'read' : 'other');
  const net = vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = new URL(String(url));
    const headers = new Headers(init.headers);
    const call: NetCall = { method: init.method ?? 'GET', path: `${u.pathname}${u.search}`, auth: label(headers.get('authorization')), body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : null };
    calls.push(call);
    const reply = options.override?.(call) ?? githubReply(call, options);
    return new Response(JSON.stringify(reply.body ?? {}), { status: reply.status, headers: { 'content-type': 'application/json', 'x-ratelimit-limit': '5000', 'x-ratelimit-remaining': '4990' } });
  });
  const permissions = fakePermissions(options.granted === false ? [] : [GITHUB_ORIGIN]);
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
  const tokens = new SecretStore({ session: memoryArea(), disk: memoryArea() });
  const writes = new SecretStore({ session: memoryArea(), disk: null });
  if (options.withRead !== false || options.sameToken) await tokens.save(readToken, 'session');
  if (options.withWrite !== false) await writes.save(writeToken, 'session');
  const area = new MemoryStorageArea();
  await startBackground({
    api,
    target: 'chromium',
    binding: { area, changes: area },
    fetch: net as unknown as typeof fetch,
    writeFetch: net as unknown as typeof fetch,
    tokens,
    providerKeys: null,
    writeToken: writes,
    healthLog: memoryHealthLog(),
  }).ready;
  const sent: unknown[] = [];
  const dispatch = (message: unknown, sender: { tab?: TabLike; url?: string }) =>
    new Promise<unknown>((resolve) => {
      const copy = JSON.parse(JSON.stringify(message)) as unknown;
      sent.push(copy);
      let answered = false;
      const respond = (response?: unknown) => {
        answered = true;
        resolve(JSON.parse(JSON.stringify(response ?? null)) as unknown);
      };
      const async = listeners.some((l) => l(copy, sender, respond) === true);
      if (!async && !answered) resolve(undefined);
    });
  const panelRuntime = { sendMessage: (m: unknown) => dispatch(m, { url: PANEL_URL }) };
  const tabRuntime = { sendMessage: (m: unknown) => dispatch(m, { tab: { id: 41, windowId: 3, url: `https://github.com/${OWNER}/${REPO}/issues/3` }, url: `https://github.com/${OWNER}/${REPO}/issues/3` }) };
  return {
    api,
    net,
    calls,
    permissions,
    tokens,
    writes,
    readToken,
    writeToken,
    sent,
    /** منافذ اللوحة الأصلية (صفحة إضافة). */
    panel: { api: runtimePort(panelRuntime), exec: runtimeExecutionPort(panelRuntime) },
    /** منفذ سكربت المحتوى في تبويب github.com. */
    tab: { exec: runtimeExecutionPort(tabRuntime) },
    writesOnly: () => calls.filter((c) => c.method !== 'GET'),
  };
}

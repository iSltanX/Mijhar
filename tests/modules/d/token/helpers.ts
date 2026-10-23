// أدوات اختبارات رمز الوصول (T-5.5): رمز بصيغة حقيقية يُولَّد وقت التشغيل (فلا يظهر حرفيًا في المستودع)، ومنطقة سرّ ذاكرية، وخلفية فعلية
// بشبكة وهمية تعبر رسائلها تسلسل JSON كما في runtime.sendMessage، وعينة fixture-token-states.json.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { startBackground } from '../../../../src/background/main';
import { MemoryStorageArea, runtimePort } from '../../../../src/core';
import type { ExtensionApi } from '../../../../src/core';
import { TokenStore } from '../../../../src/modules/d/token/store';
import type { SecretArea } from '../../../../src/modules/d/token/store';
import { fakePermissions } from '../../../core/ui-host/helpers';

/** رمز دقيق الحبيبات بالصيغة الحقيقية (github_pat_ + 22 + «_» + 59)، مختلَق. */
export function fakeToken(tag = 'A'): string {
  const head = `11${tag.repeat(4)}MIJHARFAKE0000`.padEnd(22, '0').slice(0, 22);
  const tail = `${tag}fakeTokenForTestsOnly${tag}`.repeat(4).slice(0, 59);
  return ['github', 'pat', `${head}_${tail}`].join('_');
}

/** نمط أي رمز دقيق الحبيبات (للبحث عن تسرّب في السجلات والرسائل والنصوص). */
export const TOKEN_PATTERN = /github_pat_[A-Za-z0-9_]{20,}/;

export interface MemorySecretArea extends SecretArea {
  value: { token: string; savedAt: number } | null;
  readonly set: ReturnType<typeof vi.fn>;
  readonly remove: ReturnType<typeof vi.fn>;
}

export function memoryArea(): MemorySecretArea {
  const area = {
    value: null as { token: string; savedAt: number } | null,
    get: vi.fn(async () => area.value),
    set: vi.fn(async (v: { token: string; savedAt: number }) => {
      area.value = v;
    }),
    remove: vi.fn(async () => {
      area.value = null;
    }),
  };
  return area;
}

export interface Reply {
  readonly status: number;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
}

export interface TokenFixture {
  readonly states: Record<string, Reply>;
  readonly privateRepo: {
    readonly owner: string;
    readonly repo: string;
    readonly number: number;
    readonly headSha: string;
    readonly baseRef: string;
    readonly responses: Record<string, Reply | string>;
  };
}

export const FIXTURE = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/fixture-token-states.json'), 'utf8')) as TokenFixture;

/** ردّ المستودع الخاص للمسار: بالرمز من العينة، وبلا رمز 404 (مستودع خاص لا يُرى). */
export function privateRepoReply(path: string, authorized: boolean): Reply {
  if (!authorized) return FIXTURE.states['not-found'] as Reply;
  const r = FIXTURE.privateRepo.responses[path];
  if (r === undefined) return FIXTURE.states['not-found'] as Reply;
  return typeof r === 'string' ? (FIXTURE.states[r] as Reply) : r;
}

export interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

export const authHeader = (call: Call | undefined): string | null => new Headers(call?.init.headers).get('authorization');

/** خلفية فعلية بمخزن رمز ذاكري + شبكة وهمية + منفذا الصفحة واللوحة. */
export async function tokenSystem(reply: (call: Call, index: number) => Reply, options: { granted?: boolean; target?: 'chromium' | 'firefox' } = {}) {
  const calls: Call[] = [];
  const net = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    const r = reply(call, calls.length - 1);
    return new Response(r.status === 304 ? null : JSON.stringify(r.body ?? {}), { status: r.status, headers: { 'content-type': 'application/json', ...r.headers } });
  });
  const permissions = fakePermissions(options.granted === false ? [] : ['https://api.github.com/*']);
  const listeners: Array<(m: unknown, s: object, reply: (r?: unknown) => void) => unknown> = [];
  const backgroundApi = {
    runtime: {
      getURL: (p: string) => p,
      sendMessage: vi.fn(async () => undefined),
      onMessage: { addListener: (l: (typeof listeners)[number]) => void listeners.push(l), removeListener: () => {} },
    },
    permissions,
  } as unknown as ExtensionApi;
  const session = memoryArea();
  const disk = memoryArea();
  const store = new TokenStore({ session, disk: options.target === 'firefox' ? null : disk });
  const area = new MemoryStorageArea();
  await startBackground({ api: backgroundApi, target: options.target ?? 'chromium', binding: { area, changes: area }, fetch: net as unknown as typeof fetch, tokens: store }).ready;
  const sent: unknown[] = [];
  const replies: unknown[] = [];
  const runtime = {
    sendMessage: (message: unknown) =>
      new Promise<unknown>((resolve) => {
        const copy = JSON.parse(JSON.stringify(message)) as unknown;
        sent.push(copy);
        listeners[0]?.(copy, {}, (response) => {
          const back = JSON.parse(JSON.stringify(response ?? null)) as unknown;
          replies.push(back);
          resolve(back);
        });
      }),
  };
  /** منفذ سكربت المحتوى وصفحة الإعدادات: رسائل إلى الخلفية. */
  const port = runtimePort(runtime, () => Date.now());
  return { calls, net, permissions, store, session, disk, sent, replies, port, runtime, listeners };
}

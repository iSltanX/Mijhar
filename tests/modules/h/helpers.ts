// أدوات اختبار الوحدة (ح): تحميل عينات، ووصول وهمي إلى api.github.com يسجّل كل طلب (تدقيق شبكة)، وعبارات الجزم بالغياب.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { JSDOM } from 'jsdom';
import type { GithubApiAccess } from '../../../src/modules/h/api-access';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const fixtureText = (name: string): string => fs.readFileSync(path.join(HERE, 'fixtures', name), 'utf8');
export const flush = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function loadFixture(name: string, url = 'https://github.com/octo/community'): JSDOM {
  return new JSDOM(fixtureText(name), { url, pretendToBeVisual: true });
}

/** عبارات تجزم بغياب الملف: ممنوع ظهورها في أي حالة من حالات الشريط (AC-H1). */
export const ASSERTIVE_ABSENCE: readonly RegExp[] = [
  /لا يوجد/,
  /لا توجد/,
  /غير موجود/,
  /ليس (لديه|له|فيه)/,
  /لا ملف/,
  /بلا README/,
  /no arabic readme/i,
  /does not (have|exist)/i,
];

export interface Recorded {
  readonly path: string;
  readonly init: RequestInit | undefined;
}

export type Responder = (path: string) => { status?: number; body?: unknown; headers?: Record<string, string> } | Error;

export interface FakeAccess extends GithubApiAccess {
  readonly calls: string[];
  readonly requests: Recorded[];
  request: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  granted: boolean;
}

/** وصول وهمي: request() يمنح أو يرفض بحسب granted، وfetch يرد من الدالة ويسجّل ترتيب النداءات. */
export function fakeAccess(responder: Responder, options: { available?: boolean; granted?: boolean } = {}): FakeAccess {
  const calls: string[] = [];
  const requests: Recorded[] = [];
  const access: FakeAccess = {
    available: options.available ?? true,
    granted: options.granted ?? true,
    calls,
    requests,
    has: async () => access.granted,
    request: vi.fn(async () => {
      calls.push('request');
      return access.granted;
    }),
    fetch: async (requestPath, init) => {
      calls.push('fetch');
      requests.push({ path: requestPath, init });
      if (!access.granted) throw new (await import('../../../src/core/ui-host/permissions')).PermissionNotGrantedError('https://api.github.com/*');
      const result = responder(requestPath);
      if (result instanceof Error) throw result;
      return new Response(JSON.stringify(result.body ?? []), { status: result.status ?? 200, headers: { 'content-type': 'application/json', ...(result.headers ?? {}) } });
    },
    subscribe: () => () => {},
  };
  return access;
}

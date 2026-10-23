// أدوات اختبار الوحدة (ح): تحميل عينات، ووصول وهمي إلى api.github.com يسجّل كل طلب (تدقيق شبكة)، وعبارات الجزم بالغياب.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { JSDOM } from 'jsdom';
import type { PublicApiResult } from '../../../src/core';
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
}

export type Responder = (path: string) => { status?: number; body?: unknown; headers?: Record<string, string> } | Error;

export interface FakeAccess extends GithubApiAccess {
  readonly calls: string[];
  readonly requests: Recorded[];
  request: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  granted: boolean;
}

const failed = <T>(failure: 'permission' | 'rate-limit' | 'not-found' | 'forbidden' | 'http' | 'network', status: number | null, message: string): PublicApiResult<T> => ({
  ok: false,
  failure,
  status,
  message,
  retryAt: null,
  readAt: 1,
  rate: null,
});

/**
 * وصول وهمي: request() يمنح أو يرفض بحسب granted، وget يرد من الدالة ويسجّل ترتيب النداءات (باسم 'fetch' كما كانت). الرد يُحوَّل إلى نتيجة
 * الطبقة كما تعيدها الخلفية: 404 غير موجود، و429 أو 403 بنفاد الحد «rate-limit»، وغيرها من غير 2xx «http».
 */
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
    get: async <T,>(requestPath: string): Promise<PublicApiResult<T>> => {
      calls.push('fetch');
      requests.push({ path: requestPath });
      if (!access.granted) return failed('permission', null, 'لم تُمنح الصلاحية');
      const result = responder(requestPath);
      if (result instanceof Error) return failed('network', null, result.message);
      const status = result.status ?? 200;
      if (status === 404) return failed('not-found', 404, 'Not Found');
      if (status === 429 || (status === 403 && result.headers?.['x-ratelimit-remaining'] === '0')) return failed('rate-limit', status, 'rate limit');
      if (status < 200 || status >= 300) return failed('http', status, `HTTP ${status}`);
      return { ok: true, status, data: (result.body ?? []) as T, fromCache: false, readAt: 1, rate: null };
    },
    subscribe: () => () => {},
  };
  return access;
}

// تخزين الرمز وفق DEC-04 (د-5) حرفيًا (TEST-SEC-03، AC-5.5 ‏(٤) و(٥)): الجلسة افتراضًا والقرص باختيار، بلا خلط بين المسارين، والمسح من
// كل المواضع، وضبط مستوى الوصول قبل الكتابة، وحجب القرص حيث لا يتيح المتصفح setAccessLevel (Firefox، HYP-07)، وصيغة الرمز المقبولة.
import { describe, expect, it, vi } from 'vitest';
import { checkTokenFormat, READ_ACCESS_LEVEL, READ_PERMISSIONS, TOKEN_LIMITS } from '../../../../src/modules/d/token/format';
import { TOKEN_SESSION_KEY, TokenStore, TokenUnavailableError, extensionTokenStore, sessionArea } from '../../../../src/modules/d/token/store';
import type { SessionStorageLike } from '../../../../src/modules/d/token/store';
import { fakeToken, memoryArea } from './helpers';

const TOKEN = fakeToken('C');

function fakeSession(withAccessLevel: boolean) {
  const data: Record<string, unknown> = {};
  const order: string[] = [];
  const session: SessionStorageLike & { data: Record<string, unknown>; order: string[] } = {
    data,
    order,
    get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      order.push('set');
      Object.assign(data, items);
    }),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
    ...(withAccessLevel
      ? {
          setAccessLevel: vi.fn(async () => {
            order.push('setAccessLevel');
          }),
        }
      : {}),
  };
  return session;
}

describe('مكان الحفظ يطابق الاختيار حرفيًا', () => {
  it('الافتراضي في الواجهة الجلسة؛ الحفظ في الجلسة لا يكتب على القرص ويمحو نسخة القرص', async () => {
    const session = memoryArea();
    const disk = memoryArea();
    disk.value = { token: fakeToken('OLD'), savedAt: 1 };
    const store = new TokenStore({ session, disk, now: () => 42 });
    expect(await store.save(TOKEN, 'session')).toEqual({ place: 'session', savedAt: 42 });
    expect(session.value).toEqual({ token: TOKEN, savedAt: 42 });
    expect(disk.value).toBeNull();
    expect(disk.set).not.toHaveBeenCalled();
    expect(await store.read()).toEqual({ token: TOKEN, place: 'session', savedAt: 42 });
    expect(await store.info()).toEqual({ place: 'session', savedAt: 42 });
  });

  it('الحفظ على القرص لا يُبقي نسخة في الجلسة', async () => {
    const session = memoryArea();
    const disk = memoryArea();
    session.value = { token: fakeToken('OLD'), savedAt: 1 };
    const store = new TokenStore({ session, disk, now: () => 7 });
    await store.save(TOKEN, 'disk');
    expect(disk.value).toEqual({ token: TOKEN, savedAt: 7 });
    expect(session.value).toBeNull();
    expect(await store.info()).toEqual({ place: 'disk', savedAt: 7 });
  });

  it('المسح يمحو الموضعين، ويكمل الثاني ولو فشل الأول ثم يعلن الفشل', async () => {
    const session = memoryArea();
    const disk = memoryArea();
    session.value = { token: TOKEN, savedAt: 1 };
    disk.value = { token: TOKEN, savedAt: 1 };
    const store = new TokenStore({ session, disk });
    await store.clear();
    expect(session.value).toBeNull();
    expect(disk.value).toBeNull();
    expect(await store.read()).toBeNull();

    disk.value = { token: TOKEN, savedAt: 1 };
    session.remove.mockRejectedValueOnce(new Error('session gone'));
    await expect(store.clear()).rejects.toThrow('session gone');
    expect(disk.value).toBeNull();
  });

  it('القرص غير المتاح (Firefox) يُرفض صراحةً ولا يُحفظ في الجلسة بدله', async () => {
    const session = memoryArea();
    const store = new TokenStore({ session, disk: null });
    expect(store.diskAvailable).toBe(false);
    await expect(store.save(TOKEN, 'disk')).rejects.toBeInstanceOf(TokenUnavailableError);
    expect(session.value).toBeNull();
  });
});

describe('منطقة الجلسة ومستوى الوصول', () => {
  it('يُضبط TRUSTED_CONTEXTS قبل كتابة الرمز حيث يُتاح (عائلة Chromium)', async () => {
    const session = fakeSession(true);
    await sessionArea(session).set({ token: TOKEN, savedAt: 1 });
    expect(session.order).toEqual(['setAccessLevel', 'set']);
    expect(session.setAccessLevel).toHaveBeenCalledWith({ accessLevel: 'TRUSTED_CONTEXTS' });
    expect(session.data[TOKEN_SESSION_KEY]).toEqual({ token: TOKEN, savedAt: 1 });
  });

  it('فشل ضبط مستوى الوصول يمنع الكتابة', async () => {
    const session = fakeSession(true);
    (session.setAccessLevel as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'));
    await expect(sessionArea(session).set({ token: TOKEN, savedAt: 1 })).rejects.toThrow('denied');
    expect(session.set).not.toHaveBeenCalled();
  });

  it('قيمة تالفة في المنطقة لا تُعدّ رمزًا', async () => {
    const session = fakeSession(false);
    session.data[TOKEN_SESSION_KEY] = { token: '', savedAt: 'x' };
    expect(await sessionArea(session).get()).toBeNull();
  });

  it('extensionTokenStore: القرص حيث يتيح المتصفح setAccessLevel وIndexedDB؛ وFirefox (بلا setAccessLevel) جلسة وحدها', () => {
    const idb = {} as IDBFactory;
    const chromium = extensionTokenStore({ chrome: { storage: { session: fakeSession(true) } }, indexedDB: idb } as unknown as typeof globalThis);
    expect(chromium.sessionAvailable).toBe(true);
    expect(chromium.diskAvailable).toBe(true);
    const firefox = extensionTokenStore({ browser: { storage: { session: fakeSession(false) } }, indexedDB: idb } as unknown as typeof globalThis);
    expect(firefox.sessionAvailable).toBe(true);
    expect(firefox.diskAvailable).toBe(false);
    const none = extensionTokenStore({} as typeof globalThis);
    expect(none.sessionAvailable).toBe(false);
    expect(none.diskAvailable).toBe(false);
  });
});

describe('الصيغة المقبولة والصلاحيات الدنيا', () => {
  it('يُقبل الرمز دقيق الحبيبات وحده، والمسافات حوله تُحذف', () => {
    expect(checkTokenFormat(`  ${TOKEN}\n`)).toEqual({ ok: true, token: TOKEN });
    expect(checkTokenFormat('')).toEqual({ ok: false, reason: 'empty' });
    expect(checkTokenFormat(['ghp', 'A'.repeat(36)].join('_'))).toEqual({ ok: false, reason: 'not-fine-grained' });
    expect(checkTokenFormat(['gho', 'b'.repeat(36)].join('_'))).toEqual({ ok: false, reason: 'not-fine-grained' });
    expect(checkTokenFormat('github_pat_short')).toEqual({ ok: false, reason: 'format' });
    expect(checkTokenFormat(`${TOKEN} extra`)).toEqual({ ok: false, reason: 'format' });
  });

  it('القائمة من T-0.5 كلها قراءة: ست صلاحيات Read-only بلا Checks ولا أي صلاحية كتابة', () => {
    expect(READ_PERMISSIONS.map((p) => p.name)).toEqual(['Metadata', 'Contents', 'Pull requests', 'Commit statuses', 'Actions', 'Issues']);
    expect(READ_ACCESS_LEVEL).toBe('Read-only');
    const text = JSON.stringify([READ_PERMISSIONS, READ_ACCESS_LEVEL]);
    expect(text).not.toMatch(/write|admin|Read and write/i);
    expect(TOKEN_LIMITS.join(' ')).toContain('Checks');
  });
});

// TEST-CONN-02 (وحدة، AC-11.1 ‏(٥) و(٦)، DEC-10): كل سرّ في مفتاح تخزين مستقل في الموضعين بمستوى وصول موثوق يُضبط قبل كل كتابة،
// وحفظ سرّ أو حذفه لا يمس الآخر، ولا قرص حيث لا يتيح المتصفح setAccessLevel (Firefox، HYP-07)؛ ومفتاحا رمز GitHub التاريخيان كما هما.
import { describe, expect, it, vi } from 'vitest';
import { CONNECTION_IDS } from '../../../src/core/connections/definitions';
import { SECRET_KEYS, connectionSecretStore } from '../../../src/core/connections/keys';
import { SECRETS_DB_NAME, SECRETS_DB_STORE, SecretStore, extensionSecretStore, indexedDbSecretArea, sessionSecretArea } from '../../../src/core/connections/secrets';
import type { SessionStorageLike } from '../../../src/core/connections/secrets';
import { TOKEN_SESSION_KEY } from '../../../src/modules/d/token/store';
import { fakeProviderKey, fakeToken } from './helpers';

const TOKEN = fakeToken('S');
const KEY = fakeProviderKey('S');

function fakeSession(withAccessLevel = true) {
  const data: Record<string, unknown> = {};
  const order: string[] = [];
  const session: SessionStorageLike & { data: Record<string, unknown>; order: string[] } = {
    data,
    order,
    get: vi.fn(async (key: string) => (key in data ? { [key]: data[key] } : {})),
    set: vi.fn(async (items: Record<string, unknown>) => {
      order.push(`set:${Object.keys(items).join(',')}`);
      Object.assign(data, items);
    }),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
    ...(withAccessLevel ? { setAccessLevel: vi.fn(async (d: { accessLevel: string }) => void order.push(`level:${d.accessLevel}`)) } : {}),
  };
  return session;
}

/** IndexedDB دنيا: قاعدة بمخازن، وطلبات تُستكمل في مهمة صغرى ثم تكتمل المعاملة. */
function fakeIndexedDb() {
  const dbs = new Map<string, Map<string, Map<IDBValidKey, unknown>>>();
  const later = (fn: () => void) => queueMicrotask(fn);
  const factory = {
    open(name: string) {
      const req: { result?: unknown; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void } = {};
      later(() => {
        const fresh = !dbs.has(name);
        const stores = dbs.get(name) ?? new Map<string, Map<IDBValidKey, unknown>>();
        dbs.set(name, stores);
        const db = {
          createObjectStore: (store: string) => stores.set(store, new Map()),
          transaction(store: string) {
            const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: (n: string) => unknown } = {
              objectStore: () => {
                const map = stores.get(store);
                if (!map) throw new Error(`no store ${store}`);
                const op = (fn: () => unknown) => {
                  const r: { result?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
                  later(() => {
                    r.result = fn();
                    r.onsuccess?.();
                    later(() => tx.oncomplete?.());
                  });
                  return r;
                };
                return {
                  get: (key: IDBValidKey) => op(() => map.get(key)),
                  put: (value: unknown, key: IDBValidKey) => op(() => void map.set(key, value)),
                  delete: (key: IDBValidKey) => op(() => void map.delete(key)),
                };
              },
            };
            return tx;
          },
          close: () => {},
        };
        req.result = db;
        if (fresh) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  return { factory: factory as unknown as IDBFactory, dbs };
}

describe('مفتاحان مستقلان لكل سرّ', () => {
  it('لكل اتصال مفتاح جلسة ومفتاح سجل لا يشاركه فيهما غيره؛ ومفتاحا الرمز تاريخيان (T-5.5)', () => {
    const session = CONNECTION_IDS.map((id) => SECRET_KEYS[id].session);
    const disk = CONNECTION_IDS.map((id) => SECRET_KEYS[id].disk);
    expect(new Set(session).size).toBe(CONNECTION_IDS.length);
    expect(new Set(disk).size).toBe(CONNECTION_IDS.length);
    expect(SECRET_KEYS['github-token']).toEqual({ session: TOKEN_SESSION_KEY, disk: 'githubToken' });
    expect(SECRET_KEYS['provider-key']).toEqual({ session: 'mijhar.secret.providerKey', disk: 'providerKey' });
  });

  it('الجلسة: يُضبط TRUSTED_CONTEXTS قبل كل كتابة، وكل سرّ في مفتاحه وحده، وحذف أحدهما يُبقي الآخر', async () => {
    const session = fakeSession();
    const tokens = new SecretStore({ session: sessionSecretArea(session, SECRET_KEYS['github-token'].session), disk: null });
    const keys = new SecretStore({ session: sessionSecretArea(session, SECRET_KEYS['provider-key'].session), disk: null });
    await tokens.save(TOKEN, 'session');
    await keys.save(KEY, 'session');
    expect(session.order).toEqual(['level:TRUSTED_CONTEXTS', 'set:mijhar.secret.githubToken', 'level:TRUSTED_CONTEXTS', 'set:mijhar.secret.providerKey']);
    expect(JSON.stringify(session.data['mijhar.secret.githubToken'])).toContain(TOKEN);
    expect(JSON.stringify(session.data['mijhar.secret.githubToken'])).not.toContain(KEY);
    expect(JSON.stringify(session.data['mijhar.secret.providerKey'])).not.toContain(TOKEN);
    await keys.clear();
    expect(await keys.read()).toBeNull();
    expect((await tokens.read())?.token).toBe(TOKEN);
    await keys.save(KEY, 'session');
    await tokens.clear();
    expect(await tokens.read()).toBeNull();
    expect((await keys.read())?.token).toBe(KEY);
  });

  it('القرص: قاعدة الإضافة الواحدة بمفتاح سجل لكل سرّ؛ الحفظ في موضع يمحوه من الآخر لهذا السرّ وحده', async () => {
    const session = fakeSession();
    const { factory, dbs } = fakeIndexedDb();
    const store = (id: 'github-token' | 'provider-key') => new SecretStore({ session: sessionSecretArea(session, SECRET_KEYS[id].session), disk: indexedDbSecretArea(factory, SECRET_KEYS[id].disk) });
    const tokens = store('github-token');
    const keys = store('provider-key');
    await tokens.save(TOKEN, 'disk');
    await keys.save(KEY, 'session');
    const disk = dbs.get(SECRETS_DB_NAME)?.get(SECRETS_DB_STORE);
    expect([...(disk?.keys() ?? [])]).toEqual(['githubToken']);
    expect(Object.keys(session.data)).toEqual(['mijhar.secret.providerKey']);
    await keys.save(KEY, 'disk');
    expect([...(disk?.keys() ?? [])].sort()).toEqual(['githubToken', 'providerKey']);
    expect(Object.keys(session.data)).toEqual([]);
    await tokens.clear();
    expect([...(disk?.keys() ?? [])]).toEqual(['providerKey']);
    expect((await keys.read())?.place).toBe('disk');
  });

  it('Firefox (بلا setAccessLevel): الجلسة وحدها للسرّين، ولا يُحفظ أيٌّ منهما على القرص', async () => {
    const { factory } = fakeIndexedDb();
    for (const id of CONNECTION_IDS) {
      const firefox = connectionSecretStore(id, { browser: { storage: { session: fakeSession(false) } }, indexedDB: factory } as unknown as typeof globalThis);
      expect(firefox.sessionAvailable).toBe(true);
      expect(firefox.diskAvailable).toBe(false);
      await expect(firefox.save(TOKEN, 'disk')).rejects.toThrow('غير متاح');
      const chromium = extensionSecretStore(SECRET_KEYS[id], { chrome: { storage: { session: fakeSession(true) } }, indexedDB: factory } as unknown as typeof globalThis);
      expect(chromium.diskAvailable).toBe(true);
    }
  });
});

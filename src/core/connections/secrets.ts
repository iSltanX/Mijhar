// مخزن الأسرار العام لسجل الاتصالات (T-11.1، DEC-04 د-5 وDEC-10 ح-4): لكل سرّ مفتاح تخزين مستقل في كل موضع، ولا يُخلط سرّان في مفتاح.
// عُمّم من مخزن رمز GitHub (T-5.5) بلا تغيير في سلوكه ولا في صيغة ما يُحفظ:
//  - الجلسة: storage.session بمفتاح السرّ. في عائلة Chromium مستواها السياقات الموثوقة ويُضبط صراحةً قبل كل كتابة (setAccessLevel)، وفي
//    Firefox لا تصلها سكربتات المحتوى أصلًا (evidence/T-0.5، HYP-07). تُمحى بإغلاق المتصفح.
//  - القرص: IndexedDB بأصل الإضافة (قاعدة واحدة ومخزن واحد، ومفتاح سجل لكل سرّ)، لا storage.local التي يقرؤها سكربت المحتوى لإعداداته.
//    غير مشفَّر، ويُتاح حيث يتيح المتصفح مستوى الوصول الموثوق (Firefox لا يتيحه فيبقى فيه ذاكرة الجلسة وحدها).
//  - الحفظ في موضع يمحوه من الآخر، والحذف يمحوه من الاثنين. يكتبه ويحذفه سياق إضافة موثوق (الإعدادات)، وتقرؤه الخلفية؛ فلا يعبر رسالة.
//  - الحفظ والحذف للسرّ الواحد متسلسلان بقفل بين سياقات الإضافة (Web Locks باسم السرّ) وبطابور في السياق نفسه (MJ-TA-04): حفظان من صفحتين
//    إلى موضعين مختلفين لا يمحو تنظيفُ أحدهما ما كتبه الآخر، فيبقى آخر حفظ اكتمل.
import type { LockManagerLike } from '../storage/store';

export type SecretPlace = 'session' | 'disk';

/** ما يُحفظ. اسم الحقل token تاريخي (T-5.5) ويُبقى عليه لكل سرّ، فلا يحتاج ما حُفظ قبل السجل إلى ترحيل. */
export interface StoredSecret {
  readonly token: string;
  readonly savedAt: number;
}

export interface SecretRecord extends StoredSecret {
  readonly place: SecretPlace;
}

/** ما يُعرض عن السرّ المحفوظ: مكانه ووقت حفظه، لا قيمته ولا جزء منها. */
export interface SecretInfo {
  readonly place: SecretPlace;
  readonly savedAt: number;
}

/** منطقة تحفظ قيمة سرّ واحد. */
export interface SecretArea {
  get(): Promise<StoredSecret | null>;
  set(value: StoredSecret): Promise<void>;
  remove(): Promise<void>;
}

/** مفاتيح سرّ واحد في الموضعين. */
export interface SecretKeys {
  /** مفتاح storage.session. */
  readonly session: string;
  /** مفتاح السجل في مخزن IndexedDB المشترك. */
  readonly disk: string;
}

export const SECRETS_DB_NAME = 'mijhar-secrets';
export const SECRETS_DB_STORE = 'secrets';

const isStored = (value: unknown): value is StoredSecret => {
  const v = value as Partial<StoredSecret> | null;
  return typeof v === 'object' && v !== null && typeof v.token === 'string' && v.token.length > 0 && typeof v.savedAt === 'number';
};

/** الجزء المستعمل من storage.session. */
export interface SessionStorageLike {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
  setAccessLevel?(details: { accessLevel: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }): Promise<void>;
}

export function sessionSecretArea(session: SessionStorageLike, key: string): SecretArea {
  return {
    async get() {
      const value = (await session.get(key))[key];
      return isStored(value) ? value : null;
    },
    async set(value) {
      // لا كتابة قبل تثبيت مستوى الوصول حيث يُتاح: إن فشل الضبط لا يُحفظ السرّ.
      if (session.setAccessLevel) await session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      await session.set({ [key]: value });
    },
    remove: () => session.remove(key),
  };
}

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });

export function indexedDbSecretArea(factory: IDBFactory, key: string): SecretArea {
  let opened: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(SECRETS_DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(SECRETS_DB_STORE);
      req.onsuccess = () => {
        const handle = req.result;
        // نسخة أخرى تطلب الترقية أو تُغلق القاعدة: يُعاد فتحها في الطلب التالي.
        handle.onversionchange = () => {
          handle.close();
          opened = null;
        };
        handle.onclose = () => {
          opened = null;
        };
        resolve(handle);
      };
      req.onerror = () => {
        opened = null;
        reject(req.error ?? new Error('IndexedDB'));
      };
    });
    return opened;
  };
  const run = async <T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const tx = (await db()).transaction(SECRETS_DB_STORE, mode);
    // الاكتمال لا الطلب وحده: الكتابة لا تُعدّ محفوظة قبل اكتمال المعاملة.
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB'));
    });
    const [result] = await Promise.all([request(op(tx.objectStore(SECRETS_DB_STORE))), done]);
    return result;
  };
  return {
    async get() {
      const value = await run('readonly', (store) => store.get(key));
      return isStored(value) ? value : null;
    },
    async set(value) {
      await run('readwrite', (store) => store.put(value, key));
    },
    async remove() {
      await run('readwrite', (store) => store.delete(key));
    },
  };
}

export interface SecretStoreOptions {
  /** null: لا ذاكرة جلسة في هذا السياق (فلا سرّ أصلًا). */
  readonly session: SecretArea | null;
  /** null: القرص غير متاح هنا (Firefox، أو سياق بلا IndexedDB). */
  readonly disk: SecretArea | null;
  readonly now?: () => number;
  /** قفل بين سياقات أصل الإضافة (navigator.locks) واسمه لهذا السرّ؛ وبدونه طابور السياق نفسه وحده. */
  readonly locks?: LockManagerLike | null;
  readonly lockName?: string;
}

/** طوابير السياق نفسه لكل سرّ، بموضع جلسته (أو قرصه): مخزنان لسرّ واحد في سياق واحد يتشاركان طابورًا. */
const realmQueues = new WeakMap<object, Promise<unknown>>();

export class SecretPlaceUnavailableError extends Error {
  readonly code = 'secret-place-unavailable';
  constructor(readonly place: SecretPlace) {
    super(place === 'disk' ? 'الحفظ على القرص غير متاح في هذا المتصفح' : 'ذاكرة الجلسة غير متاحة هنا');
    this.name = 'SecretPlaceUnavailableError';
  }
}

export class SecretStore {
  private readonly now: () => number;

  constructor(private readonly options: SecretStoreOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  get sessionAvailable(): boolean {
    return this.options.session !== null;
  }

  get diskAvailable(): boolean {
    return this.options.disk !== null;
  }

  /** السرّ المحفوظ ومكانه: الجلسة أولًا ثم القرص. للخلفية وحدها. */
  async read(): Promise<SecretRecord | null> {
    const fromSession = await this.options.session?.get();
    if (fromSession) return { ...fromSession, place: 'session' };
    const fromDisk = await this.options.disk?.get();
    if (fromDisk) return { ...fromDisk, place: 'disk' };
    return null;
  }

  async info(): Promise<SecretInfo | null> {
    const record = await this.read();
    return record ? { place: record.place, savedAt: record.savedAt } : null;
  }

  /** يحفظه في المكان المختار ثم يمحوه من الآخر، فلا يبقى في مكانين. */
  save(token: string, place: SecretPlace): Promise<SecretInfo> {
    const target = place === 'disk' ? this.options.disk : this.options.session;
    if (!target) return Promise.reject(new SecretPlaceUnavailableError(place));
    const other = place === 'disk' ? this.options.session : this.options.disk;
    return this.exclusive(async () => {
      const savedAt = this.now();
      await target.set({ token, savedAt });
      await other?.remove();
      return { place, savedAt };
    });
  }

  /** يمحوه من كل مواضع التخزين. يكمل الثاني ولو فشل الأول، ثم يرمي إن فشل أحدهما. */
  clear(): Promise<void> {
    return this.exclusive(async () => {
      const results = await Promise.allSettled([this.options.session?.remove(), this.options.disk?.remove()]);
      const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed) throw failed.reason;
    });
  }

  // قفل بين السياقات ثم طابور السياق، بهذا الترتيب دائمًا (كما في Store).
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const { locks, lockName } = this.options;
    return locks && lockName ? locks.request(lockName, () => this.enqueue(task)) : this.enqueue(task);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const owner = this.options.session ?? this.options.disk;
    if (!owner) return task();
    const run = (realmQueues.get(owner) ?? Promise.resolve()).then(task, task);
    realmQueues.set(owner, run.catch(() => undefined));
    return run;
  }
}

interface StorageNamespace {
  session?: SessionStorageLike;
}

/**
 * مخزن سرّ في سياقات الإضافة الموثوقة (الخلفية وصفحة الإعدادات). القرص حيث يتيح المتصفح setAccessLevel (عائلة Chromium) وتتوفر
 * IndexedDB؛ وإلا الجلسة وحدها.
 */
export function extensionSecretStore(keys: SecretKeys, scope: typeof globalThis = globalThis): SecretStore {
  const g = scope as { browser?: { storage?: StorageNamespace }; chrome?: { storage?: StorageNamespace }; indexedDB?: IDBFactory; navigator?: { locks?: LockManagerLike } };
  const session = g.browser?.storage?.session ?? g.chrome?.storage?.session ?? null;
  const trustedLevel = typeof session?.setAccessLevel === 'function';
  return new SecretStore({
    session: session ? sessionSecretArea(session, keys.session) : null,
    disk: trustedLevel && g.indexedDB ? indexedDbSecretArea(g.indexedDB, keys.disk) : null,
    locks: g.navigator?.locks ?? null,
    lockName: `mijhar-secret:${keys.session}`,
  });
}

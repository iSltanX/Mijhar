// تخزين رمز GitHub الاختياري وفق DEC-04 (د-5): ذاكرة الجلسة افتراضًا، والقرص الصريح باختيار معلن لا يُدَّعى له تشفير. لا خلط بين
// المسارين: الحفظ في أحدهما يمحوه من الآخر، والمسح يمحوه من الاثنين.
//  - الجلسة: storage.session. في عائلة Chromium مستواها السياقات الموثوقة افتراضًا ويُضبط صراحةً قبل الكتابة (setAccessLevel)، وفي Firefox
//    لا تصلها سكربتات المحتوى أصلًا (evidence/T-0.5، HYP-07). تُمحى بإغلاق المتصفح ولا تُكتب على القرص.
//  - القرص: IndexedDB بأصل الإضافة (chrome-extension://…)، لا storage.local: سكربت المحتوى يقرأ storage.local لإعداداته فلا يمكن حجبها
//    عنه دون كسرها، أما IndexedDB في سكربت المحتوى فهي لأصل الصفحة لا الإضافة، فلا تصلها إلا صفحات الإضافة وخلفيتها. غير مشفَّرة.
//  - القرص يُتاح حيث يتيح المتصفح مستوى الوصول الموثوق (setAccessLevel)، كما تشترط الخطة: Firefox لا يتيحه (HYP-07 خاطئة، T-0.5)
//    فيبقى فيه ذاكرة الجلسة وحدها ويُعلن القيد في الإعدادات.
//  - يكتبه ويمسحه قسم الإعدادات (صفحة إضافة)، وتقرؤه الخلفية وحدها لطلباتها؛ فلا يعبر الرمز أي رسالة (AC-5.5 ‏(١)).

export type TokenPlace = 'session' | 'disk';

export interface TokenRecord {
  readonly token: string;
  readonly place: TokenPlace;
  readonly savedAt: number;
}

/** ما يُعرض عن الرمز المحفوظ: مكانه ووقت حفظه، لا الرمز. */
export interface TokenInfo {
  readonly place: TokenPlace;
  readonly savedAt: number;
}

interface Stored {
  readonly token: string;
  readonly savedAt: number;
}

/** منطقة تحفظ قيمة واحدة. */
export interface SecretArea {
  get(): Promise<Stored | null>;
  set(value: Stored): Promise<void>;
  remove(): Promise<void>;
}

export const TOKEN_SESSION_KEY = 'mijhar.secret.githubToken';
export const TOKEN_DB_NAME = 'mijhar-secrets';
const TOKEN_DB_STORE = 'secrets';
const TOKEN_DB_KEY = 'githubToken';

const isStored = (value: unknown): value is Stored => {
  const v = value as Partial<Stored> | null;
  return typeof v === 'object' && v !== null && typeof v.token === 'string' && v.token.length > 0 && typeof v.savedAt === 'number';
};

/** الجزء المستعمل من storage.session. */
export interface SessionStorageLike {
  get(keys: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string): Promise<void>;
  setAccessLevel?(details: { accessLevel: 'TRUSTED_CONTEXTS' | 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }): Promise<void>;
}

export function sessionArea(session: SessionStorageLike): SecretArea {
  return {
    async get() {
      const value = (await session.get(TOKEN_SESSION_KEY))[TOKEN_SESSION_KEY];
      return isStored(value) ? value : null;
    },
    async set(value) {
      // لا كتابة قبل تثبيت مستوى الوصول حيث يُتاح: إن فشل الضبط لا يُحفظ الرمز.
      if (session.setAccessLevel) await session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
      await session.set({ [TOKEN_SESSION_KEY]: value });
    },
    remove: () => session.remove(TOKEN_SESSION_KEY),
  };
}

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });

export function indexedDbArea(factory: IDBFactory): SecretArea {
  let opened: Promise<IDBDatabase> | null = null;
  const db = (): Promise<IDBDatabase> => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(TOKEN_DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(TOKEN_DB_STORE);
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
    const tx = (await db()).transaction(TOKEN_DB_STORE, mode);
    // الاكتمال لا الطلب وحده: الكتابة لا تُعدّ محفوظة قبل اكتمال المعاملة.
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB'));
    });
    const [result] = await Promise.all([request(op(tx.objectStore(TOKEN_DB_STORE))), done]);
    return result;
  };
  return {
    async get() {
      const value = await run('readonly', (store) => store.get(TOKEN_DB_KEY));
      return isStored(value) ? value : null;
    },
    async set(value) {
      await run('readwrite', (store) => store.put(value, TOKEN_DB_KEY));
    },
    async remove() {
      await run('readwrite', (store) => store.delete(TOKEN_DB_KEY));
    },
  };
}

export interface TokenStoreOptions {
  /** null: لا ذاكرة جلسة في هذا السياق (فلا رمز أصلًا). */
  readonly session: SecretArea | null;
  /** null: القرص غير متاح هنا (Firefox، أو سياق بلا IndexedDB). */
  readonly disk: SecretArea | null;
  readonly now?: () => number;
}

export class TokenUnavailableError extends Error {
  readonly code = 'token-place-unavailable';
  constructor(readonly place: TokenPlace) {
    super(place === 'disk' ? 'الحفظ على القرص غير متاح في هذا المتصفح' : 'ذاكرة الجلسة غير متاحة هنا');
    this.name = 'TokenUnavailableError';
  }
}

export class TokenStore {
  private readonly now: () => number;

  constructor(private readonly options: TokenStoreOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  get sessionAvailable(): boolean {
    return this.options.session !== null;
  }

  get diskAvailable(): boolean {
    return this.options.disk !== null;
  }

  /** الرمز المحفوظ ومكانه: الجلسة أولًا ثم القرص. للخلفية وحدها. */
  async read(): Promise<TokenRecord | null> {
    const fromSession = await this.options.session?.get();
    if (fromSession) return { ...fromSession, place: 'session' };
    const fromDisk = await this.options.disk?.get();
    if (fromDisk) return { ...fromDisk, place: 'disk' };
    return null;
  }

  async info(): Promise<TokenInfo | null> {
    const record = await this.read();
    return record ? { place: record.place, savedAt: record.savedAt } : null;
  }

  /** يحفظه في المكان المختار ثم يمحوه من الآخر، فلا يبقى في مكانين. */
  async save(token: string, place: TokenPlace): Promise<TokenInfo> {
    const target = place === 'disk' ? this.options.disk : this.options.session;
    if (!target) throw new TokenUnavailableError(place);
    const other = place === 'disk' ? this.options.session : this.options.disk;
    const savedAt = this.now();
    await target.set({ token, savedAt });
    await other?.remove();
    return { place, savedAt };
  }

  /** يمحوه من كل مواضع التخزين. يكمل الثاني ولو فشل الأول، ثم يرمي إن فشل أحدهما. */
  async clear(): Promise<void> {
    const results = await Promise.allSettled([this.options.session?.remove(), this.options.disk?.remove()]);
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failed) throw failed.reason;
  }
}

interface StorageNamespace {
  session?: SessionStorageLike;
}

/**
 * مخزن الرمز في سياقات الإضافة الموثوقة (الخلفية وصفحة الإعدادات). القرص حيث يتيح المتصفح setAccessLevel (عائلة Chromium) وتتوفر
 * IndexedDB؛ وإلا الجلسة وحدها.
 */
export function extensionTokenStore(scope: typeof globalThis = globalThis): TokenStore {
  const g = scope as { browser?: { storage?: StorageNamespace }; chrome?: { storage?: StorageNamespace }; indexedDB?: IDBFactory };
  const session = g.browser?.storage?.session ?? g.chrome?.storage?.session ?? null;
  const trustedLevel = typeof session?.setAccessLevel === 'function';
  return new TokenStore({
    session: session ? sessionArea(session) : null,
    disk: trustedLevel && g.indexedDB ? indexedDbArea(g.indexedDB) : null,
  });
}

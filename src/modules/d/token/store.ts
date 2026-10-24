// تخزين رمز GitHub الاختياري وفق DEC-04 (د-5): ذاكرة الجلسة افتراضًا، والقرص الصريح باختيار معلن لا يُدَّعى له تشفير. الآلية عامة في
// مخزن الأسرار لسجل الاتصالات (src/core/connections/secrets.ts، T-11.1)، وهذا الملف يثبت مفتاحي الرمز فيه ويُبقي واجهة T-5.5 كما هي:
//  - الجلسة: storage.session بالمفتاح TOKEN_SESSION_KEY، ويُضبط مستوى السياقات الموثوقة قبل الكتابة حيث يُتاح.
//  - القرص: IndexedDB بأصل الإضافة بمفتاح السجل githubToken؛ ويُتاح حيث يتيح المتصفح setAccessLevel (Firefox لا يتيحه، HYP-07).
//  - يكتبه ويمسحه قسم الإعدادات (صفحة إضافة)، وتقرؤه الخلفية وحدها لطلباتها؛ فلا يعبر الرمز أي رسالة (AC-5.5 ‏(١)).
import { SECRET_KEYS } from '../../../core/connections/keys';
import {
  SECRETS_DB_NAME,
  SecretPlaceUnavailableError,
  SecretStore,
  extensionSecretStore,
  indexedDbSecretArea,
  sessionSecretArea,
} from '../../../core/connections/secrets';
import type { SecretArea, SecretInfo, SecretKeys, SecretPlace, SecretRecord, SecretStoreOptions, SessionStorageLike } from '../../../core/connections/secrets';

export type TokenPlace = SecretPlace;
export type TokenRecord = SecretRecord;
/** ما يُعرض عن الرمز المحفوظ: مكانه ووقت حفظه، لا الرمز. */
export type TokenInfo = SecretInfo;
export type TokenStoreOptions = SecretStoreOptions;
export type { SecretArea, SessionStorageLike };

/** مفتاحا رمز GitHub في الموضعين (من سجل الاتصالات)؛ مستقلان عن مفتاحي أي سرّ آخر (AC-11.1 ‏(٦)). */
export const TOKEN_KEYS: SecretKeys = SECRET_KEYS['github-token'];
export const TOKEN_SESSION_KEY = TOKEN_KEYS.session;
export const TOKEN_DB_NAME = SECRETS_DB_NAME;
const TOKEN_DB_KEY = TOKEN_KEYS.disk;

export const sessionArea = (session: SessionStorageLike): SecretArea => sessionSecretArea(session, TOKEN_SESSION_KEY);

export const indexedDbArea = (factory: IDBFactory): SecretArea => indexedDbSecretArea(factory, TOKEN_DB_KEY);

/** مخزن الرمز: مخزن الأسرار العام نفسه. */
export const TokenStore = SecretStore;
export type TokenStore = SecretStore;

export const TokenUnavailableError = SecretPlaceUnavailableError;
export type TokenUnavailableError = SecretPlaceUnavailableError;

/** مخزن الرمز في سياقات الإضافة الموثوقة (الخلفية وصفحة الإعدادات). */
export const extensionTokenStore = (scope: typeof globalThis = globalThis): TokenStore => extensionSecretStore(TOKEN_KEYS, scope);

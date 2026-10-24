// مفاتيح تخزين الأسرار ومخازنها (T-11.1، AC-11.1 ‏(٦)): لكل اتصال مفتاحان لا يشاركه فيهما غيره، في storage.session وفي سجل IndexedDB
// الإضافة. يستورده ما يقرأ الأسرار أو يكتبها (الخلفية وصفحة الإعدادات) وحده؛ ولا يصل سكربت المحتوى ولا اللوحة (فحص ساكن في الاختبار).
import type { ConnectionId } from './definitions';
import { extensionSecretStore } from './secrets';
import type { SecretKeys, SecretStore } from './secrets';

/** مفتاحا رمز GitHub تاريخيان (T-5.5) ويُبقى عليهما، فلا يُرحَّل ما حُفظ. */
export const SECRET_KEYS: Readonly<Record<ConnectionId, SecretKeys>> = {
  'github-token': { session: 'mijhar.secret.githubToken', disk: 'githubToken' },
  'provider-key': { session: 'mijhar.secret.providerKey', disk: 'providerKey' },
};

/** مخزن سرّ اتصال في سياق إضافة موثوق. */
export const connectionSecretStore = (id: ConnectionId, scope: typeof globalThis = globalThis): SecretStore => extensionSecretStore(SECRET_KEYS[id], scope);

// مفاتيح تخزين الأسرار ومخازنها (T-11.1، AC-11.1 ‏(٦)): لكل اتصال مفتاحان لا يشاركه فيهما غيره، في storage.session وفي سجل IndexedDB
// الإضافة. يستورده ما يقرأ الأسرار أو يكتبها (الخلفية وصفحة الإعدادات) وحده؛ ولا يصل سكربت المحتوى ولا اللوحة (فحص ساكن في الاختبار).
// MJ23 (T-11.10، DEC-10 ح-4، AC-E10 (٢)): مفتاح مزوّد التحليل لكل مزوّد على حدة بمفتاحين مستقلين؛ ومفتاح Anthropic المحفوظ قبل التوسعة يبقى بمفتاحيه
// التاريخيين بلا ترحيل، وغيره بمفتاحين يُشتقان من معرّف المزوّد فلا يمس مزوّدٌ يُضاف هذا الملف.
import type { ConnectionId } from './definitions';
import { extensionSecretStore } from './secrets';
import type { SecretKeys, SecretStore } from './secrets';

/** مفتاحا رمز GitHub تاريخيان (T-5.5) ويُبقى عليهما، فلا يُرحَّل ما حُفظ. */
export const SECRET_KEYS: Readonly<Record<ConnectionId, SecretKeys>> = {
  'github-token': { session: 'mijhar.secret.githubToken', disk: 'githubToken' },
  // مفتاحا مزوّد التحليل الأول (MJ21، Anthropic) التاريخيان.
  'provider-key': { session: 'mijhar.secret.providerKey', disk: 'providerKey' },
  // MJ22 (T-11.8، AC-F7 (١)): رمز الكتابة بمفتاحيه المستقلين عن رمز القراءة؛ وبطاقته تحفظه في الجلسة وحدها.
  'github-write': { session: 'mijhar.secret.githubWrite', disk: 'githubWrite' },
};

/** المزوّد الذي حُفظ مفتاحه قبل التوسعة بالمفتاحين التاريخيين. */
const HISTORICAL_PROVIDER = 'anthropic';
const PROVIDER_ID = /^[a-z][a-z0-9-]{0,31}$/;

/** مفتاحا تخزين مفتاح مزوّد: لا يشاركه فيهما مزوّد آخر ولا سرّ آخر. */
export function providerSecretKeys(provider: string): SecretKeys {
  if (provider === HISTORICAL_PROVIDER) return SECRET_KEYS['provider-key'];
  if (!PROVIDER_ID.test(provider)) throw new Error(`معرّف مزوّد غير صالح لمفتاح تخزين: ${provider}`);
  return { session: `mijhar.secret.providerKey.${provider}`, disk: `providerKey.${provider}` };
}

/** مخزن سرّ اتصال في سياق إضافة موثوق. */
export const connectionSecretStore = (id: ConnectionId, scope: typeof globalThis = globalThis): SecretStore => extensionSecretStore(SECRET_KEYS[id], scope);

/** مخزن مفتاح مزوّد في سياق إضافة موثوق (الخلفية وصفحة الإعدادات). */
export const providerSecretStore = (provider: string, scope: typeof globalThis = globalThis): SecretStore => extensionSecretStore(providerSecretKeys(provider), scope);

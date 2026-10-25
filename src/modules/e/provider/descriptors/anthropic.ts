// وصف المزوّد الأول (DEC-09 ز-4، MJ21): Anthropic عبر api.anthropic.com. وصف بلا ترويسة ولا مسار طلب: يصل سكربت المحتوى واللوحة والإعدادات، ومحوّله
// (adapters/anthropic.ts) في الخلفية وحدها (AC-E10 (١)). ومفتاحه المحفوظ قبل التوسعة يبقى بمفتاحَي تخزينه التاريخيين (keys.ts، DEC-10 ح-4).
// AD-38 (platform.claude.com/docs/en/manage-claude/authentication، قُرئ 2026-10-25): مفاتيح Claude API كلها تبدأ بـsk-ant-، وأنواعها: المفتاح الشخصي،
// ومفتاح حساب الخدمة، ومفتاح مساحة العمل (القديم)؛ ومفتاح الإدارة لواجهة الإدارة وحدها. فالفحص المحلي صيغة عامة (sk-ant- ثم جسم بلا مسافات) لا تحصر
// نوعًا، ويرفض الإدارة وحدها؛ والحكم على المفتاح للتحقق من المزوّد. والمفتاح غير المقيّد بمساحة عمل يلزمه anthropic-workspace-id في كل طلب، فتعرض البطاقة حقلًا لمعرّفها.
import type { ProviderDescriptor } from '../types';

const HOST = 'api.anthropic.com';

export const ANTHROPIC: ProviderDescriptor = {
  id: 'anthropic',
  title: 'Anthropic',
  host: HOST,
  origin: `https://${HOST}/*`,
  keyPrefix: 'sk-ant-',
  keyName: 'مفتاح Claude API من Claude Console (شخصي أو لحساب خدمة أو لمساحة عمل)',
  keyFormat: {
    pattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
    rejects: [{ prefix: 'sk-ant-admin', reason: 'هذا مفتاح إدارة (Admin) لواجهة الإدارة وحدها، لا يصلح للتحليل؛ أنشئ مفتاح API (شخصيًا أو لحساب خدمة) من Claude Console.' }],
    mismatch: 'لا يشبه مفتاح Claude API: مفاتيحه تبدأ بـsk-ant- ثم جسمه، في سطر واحد بلا مسافات. تأكد أنك نسخته كاملًا.',
  },
  workspaceHeader: 'anthropic-workspace-id',
  verifyRequest: `طلب واحد GET https://${HOST}/v1/models يقرأ قائمة المودلات المتاحة لمفتاحك، ولا يحمل شيئًا من صفحاتك.`,
  // واجهة المودلات الرسمية تعلن أن ما تسرده متاح لواجهة الرسائل التي يستعملها التحليل؛ فلا فحص صريح (DEC-13 ن-3).
  probeRequest: null,
  policy: {
    url: 'https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data',
    label: 'الاحتفاظ في privacy.claude.com',
    readOn: '2026-10-25',
    summary: 'يحذف مدخلات API ومخرجاتها من خوادمه خلال 30 يومًا مع استثناءات يذكرها، ولا يدرّب نماذجه عليها في المنتجات التجارية ما لم تأذن.',
    // شطر التدريب في مقالة شقيقة لا في مقالة الاحتفاظ (Docs/Site/privacy.md).
    also: { url: 'https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training', label: 'التدريب في privacy.claude.com' },
  },
};

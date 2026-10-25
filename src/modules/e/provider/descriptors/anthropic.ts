// وصف المزوّد الأول (DEC-09 ز-4، MJ21): Anthropic عبر api.anthropic.com. وصف بلا ترويسة ولا مسار طلب: يصل سكربت المحتوى واللوحة والإعدادات، ومحوّله
// (adapters/anthropic.ts) في الخلفية وحدها (AC-E10 (١)). ومفتاحه المحفوظ قبل التوسعة يبقى بمفتاحَي تخزينه التاريخيين (keys.ts، DEC-10 ح-4).
import type { ProviderDescriptor } from '../types';

const HOST = 'api.anthropic.com';

export const ANTHROPIC: ProviderDescriptor = {
  id: 'anthropic',
  title: 'Anthropic',
  host: HOST,
  origin: `https://${HOST}/*`,
  keyPrefix: 'sk-ant-',
  keyName: 'مفتاح Anthropic API من حسابك في Claude Console',
  keyFormat: {
    pattern: /^sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}$/,
    rejects: [{ prefix: 'sk-ant-admin', reason: 'هذا مفتاح إدارة (Admin) لا يصلح للتحليل؛ أنشئ مفتاح API عاديًا من Claude Console.' }],
    mismatch: 'لا يطابق صيغة مفتاح Anthropic API (sk-ant-api…). تأكد أنك نسخته كاملًا.',
  },
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

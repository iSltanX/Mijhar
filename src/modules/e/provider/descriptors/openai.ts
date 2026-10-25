// وصف مزوّد OpenAI (MJ24، T-11.11، DEC-09 ز-4، AD-32): api.openai.com. وصف بلا ترويسة ولا مسار طلب: يصل سكربت المحتوى واللوحة والإعدادات، ومحوّله
// (adapters/openai.ts) في الخلفية وحدها (AC-E10 (١)). قُرئت وثائقه الرسمية في 2026-10-24 (evidence/T-11.11/docs-read.md).
import type { ProviderDescriptor } from '../types';

const HOST = 'api.openai.com';

export const OPENAI: ProviderDescriptor = {
  id: 'openai',
  title: 'OpenAI',
  host: HOST,
  origin: `https://${HOST}/*`,
  keyPrefix: 'sk-',
  keyName: 'مفتاح OpenAI API من حسابك في منصة OpenAI',
  keyFormat: {
    // لا تعلن وثائق OpenAI الرسمية بادئة المفتاح ولا طوله (evidence/T-11.11/docs-read.md): الصيغة هنا فحص محلي متساهل (بادئة sk- وطول أدنى) يرفض ما يُعرف
    // أنه ليس مفتاح API عاديًا؛ والرفض الحاسم من المزوّد (401) عند التحقق.
    pattern: /^sk-(?!ant-|admin-)[A-Za-z0-9_-]{20,}$/,
    rejects: [
      { prefix: 'sk-admin', reason: 'هذا مفتاح إدارة (Admin) لا يصلح للتحليل؛ أنشئ مفتاح API عاديًا من منصة OpenAI.' },
      { prefix: 'sk-ant-', reason: 'هذا مفتاح Anthropic لا OpenAI؛ ألصقه في بطاقة Anthropic.' },
    ],
    mismatch: 'لا يطابق صيغة مفتاح OpenAI API (يبدأ بـsk-). تأكد أنك نسخته كاملًا.',
  },
  verifyRequest: `طلب واحد GET https://${HOST}/v1/models يقرأ قائمة المودلات المتاحة لمفتاحك، ولا يحمل شيئًا من صفحاتك.`,
  // قائمة مودلات OpenAI الرسمية لا تعلن أي نقطة تدعمها (id وcreated وowned_by وshutdown_date وحدها)؛ فلا يُستنتج توافق ولا يحجب نموذجًا يكتبه المستخدم، و«اختبر النموذج» بهذا الطلب اختياري لا شرط للحفظ ولا للتحليل (DEC-13 ن-5، HYP-22).
  probeRequest: `طلب واحد POST https://${HOST}/v1/responses بنص ثابت «ping» وحده وحد مخرجات 16 رمزًا وبلا حفظ للرد (store=false)، لا يحمل شيئًا من صفحاتك.`,
  policy: {
    url: 'https://developers.openai.com/api/docs/guides/your-data',
    label: 'developers.openai.com',
    readOn: '2026-10-25',
    summary:
      'يحتفظ بسجلات مراقبة إساءة الاستعمال حتى 30 يومًا افتراضيًا، ولا يدرّب نماذجه على بيانات الواجهة ما لم تشترك صراحةً؛ ويحفظ حالة طلبات /v1/responses ثلاثين يومًا افتراضيًا أو حين يُطلب الحفظ. ومِجهَر يرسل store=false، وأثره بحسب سياسة OpenAI.',
  },
};

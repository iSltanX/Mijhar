// وصف مزوّد التحليل الثالث (DEC-09 ز-4، MJ25، T-11.12): Google Gemini عبر generativelanguage.googleapis.com. وصف بلا ترويسة ولا مسار طلب: يصل سكربت
// المحتوى واللوحة والإعدادات، ومحوّله (adapters/gemini.ts) في الخلفية وحدها (AC-E10 (١)). ومفتاحه بمفتاحَي تخزين مشتقين من معرّفه (keys.ts، DEC-10 ح-4).
// صيغة المفتاح: لا تعلن وثائق Gemini صيغة له صراحةً، فالفحص المحلي تحذيري والحكم لرد الخادم. تُقبل صيغتان: مفتاح Google API المعتاد (AIza ثم 35 حرفًا)،
// والصيغة الجديدة التي يصدرها Google AI Studio (AQ. ثم نحو 50 حرفًا؛ رُصدت على مفتاح المالك التجريبي في MJ25 لا في وثيقة رسمية).
import type { ProviderDescriptor } from '../types';

const HOST = 'generativelanguage.googleapis.com';

export const GEMINI: ProviderDescriptor = {
  id: 'gemini',
  title: 'Google Gemini',
  host: HOST,
  origin: `https://${HOST}/*`,
  keyPrefix: 'AQ. / AIza',
  keyName: 'مفتاح Gemini API من حسابك في Google AI Studio',
  keyFormat: {
    pattern: /^(?:AIza[A-Za-z0-9_-]{35}|AQ\.[A-Za-z0-9_-]{30,80})$/,
    rejects: [],
    mismatch: 'لا يطابق صيغة مفتاح Gemini API (AQ… أو AIza…). تأكد أنك نسخته كاملًا من Google AI Studio.',
  },
  verifyRequest: `طلب واحد GET https://${HOST}/v1beta/models يقرأ قائمة المودلات المتاحة لمفتاحك ويحمل المفتاح في ترويسة الطلب لا في عنوانه، ولا يحمل شيئًا من صفحاتك.`,
  // DEC-13 ن-4 (تحديث 2026-10-24): قائمة Gemini تعلن طرق التوليد لكل مودل لكنها لا تضمن توافره لمفتاح المستخدم (قِيس: مودل معلن `generateContent` رُدَّ 404
  // «لم يعد متاحًا للمستخدمين الجدد»)، فالإعلان ترشيح لا إثبات؛ ولا يصير المودل خيارًا للتحليل إلا بفحص صريح ناجح يبدؤه المستخدم بهذا الطلب.
  probeRequest: `طلب واحد POST إلى نقطة generateContent للمودل الذي تفحصه على https://${HOST} بنص ثابت «ping» وحده، لا يحمل شيئًا من صفحاتك، ويحمل المفتاح في ترويسة الطلب لا في عنوانه`,
  policy: {
    url: 'https://ai.google.dev/gemini-api/terms',
    label: 'ai.google.dev/gemini-api/terms',
    readOn: '2026-10-24',
    summary:
      'في الخدمات غير المدفوعة قد تستعمل Google ما تُرسله وما يُولَّد لتحسين منتجاتها وتقنيات التعلم الآلي، وقد يراجعه بشر بعد فصله عن حسابك ومفتاحك ومشروعك، وتنصح بألا تُرسل إليها بيانات حساسة أو سرية. وفي الخدمات المدفوعة تقول إنها لا تستعمله لتحسين منتجاتها وتسجّله مدة محدودة لكشف المخالفات والالتزام القانوني.',
  },
};

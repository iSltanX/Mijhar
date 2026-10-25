// نصوص فشل إرسال البلاغ: لكل سبب نصّه وخطوة ممكنة، لا رسالة عامة واحدة (الإطار O-20، «بعد الإرسال»).
import type { SendFailure } from './client';

type Failure = SendFailure | 'refused';

const TEXT: Readonly<Record<Failure, string>> = {
  refused: 'رفضت خلفية الإضافة البلاغ قبل إرساله: لم يأتِ من صفحة الإعدادات أو جسمه غير صالح. لم يُرسل شيء.',
  permission: 'لم يُمنح إذن الاتصال بخادم البلاغات، فلم يُرسل شيء. أعد المحاولة واقبل الإذن حين يطلبه المتصفح، أو انسخ البلاغ.',
  network: 'تعذّر الوصول إلى خادم البلاغات. تحقق من اتصالك ثم أعد المحاولة.',
  timeout: 'لم يردّ خادم البلاغات في الوقت. أعد المحاولة؛ وإن كان قد استلم البلاغ فسيعيد رقمه نفسه.',
  invalid: 'رفض خادم البلاغات البلاغ لأن أحد حقوله غير مقبول. انسخه وأرسله بطريقتك.',
  'too-large': 'البلاغ أكبر مما يقبله خادم البلاغات. اختصر الوصف ثم أعد الإرسال.',
  unsupported: 'لم يقبل خادم البلاغات صيغة البلاغ. انسخه وأرسله بطريقتك.',
  'rate-limited': 'أُرسلت بلاغات كثيرة من شبكتك مؤخرًا، فأوقف الخادم الاستقبال مؤقتًا.',
  server: 'لم يستقبل خادم البلاغات البلاغ الآن، والعطل من جهته. أعد المحاولة بعد قليل.',
  unexpected: 'ردّ خادم البلاغات بما لا يُفهم. أعد المحاولة، أو انسخ البلاغ.',
};

const minutes = new Intl.NumberFormat('ar-u-nu-arab');

export function failureText(failure: Failure, retryAfterSeconds?: number): string {
  const base = TEXT[failure];
  if (failure !== 'rate-limited' || retryAfterSeconds === undefined) return base;
  const m = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  const when = m === 1 ? 'دقيقة' : m === 2 ? 'دقيقتين' : `${minutes.format(m)} ${m <= 10 ? 'دقائق' : 'دقيقة'}`;
  return `${base} أعد المحاولة بعد ${when}.`;
}

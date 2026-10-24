// بطاقة الاستئذان (T-4.4): بيانات صرفة تبنيها طبقة الإدارة ويعرضها الشريط وبطاقة التحديد. تحت ج-2 لا تعرض إلا ما يعلنه المتصفح: أن الحجم غير معلن،
// ومن يخزّن الحزمة، وشرط الاتصال، ووعد أن لا شيء من الإضافة يخرج. ولا يبدأ استدعاء المحرك (create) إلا بعد قبولها.
import { describeModel } from './model';
import { CONSENT_MESSAGES } from './messages';

export interface ConsentCard {
  readonly title: string;
  /** أسطر الإيضاح بالترتيب (الحجم والوجهة والاتصال والوعد). */
  readonly lines: readonly string[];
  readonly confirmLabel: string;
  readonly declineLabel: string;
}

/** بطاقة الحزمة غير المنزّلة. */
export function consentCard(): ConsentCard {
  const info = describeModel('downloadable');
  return {
    title: CONSENT_MESSAGES.title,
    lines: [`الحجم: ${info.size}.`, `الوجهة: ${info.destination}.`, `${info.connection}.`, CONSENT_MESSAGES.promise],
    confirmLabel: CONSENT_MESSAGES.confirmLabel,
    declineLabel: CONSENT_MESSAGES.declineLabel,
  };
}

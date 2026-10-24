// تصنيف أخطاء مسار الحزمة إلى رسائل واضحة (T-4.4، AC-C5): انقطاع الشبكة وامتلاء القرص. الأسماء من واجهات الويب المعيارية:
//  - NetworkError: فشل الشبكة أثناء التنزيل؛ وTypeError من fetch حين يرمي المتصفح خطأ شبكة عامًا.
//  - QuotaExceededError: تجاوز مساحة التخزين. وTranslator يرميه أيضًا من translate() لنص أطول من حده؛ فيُفرَّق بالمرحلة: قبل أن تثبت الحزمة على الجهاز
//    (لم تُرَ 'available' ولا نجحت ترجمة) هو التخزين، وبعد ثبوتها هو طول النص فتبقى رسالة T-4.3 «النص أطول…».
// لم يُقَس في متصفح حقيقي أي اسم يرميه امتلاء القرص فعلًا (لا يمكن افتعاله دون إتلاف جهاز الاختبار)، فالتصنيف على الأسماء المعيارية وقد اختُبر بمحرك
// وهمي يرميها؛ وما لا يعرفه التصنيف يمرّ كما هو بنص المتصفح.
import { EngineError } from '../engines';
import { MODEL_MESSAGES } from './messages';

export type ModelErrorKind = 'network' | 'storage';

export interface ModelErrorContext {
  /** هل ثبتت الحزمة على الجهاز (رُصدت 'available' أو نجحت ترجمة). */
  readonly packPresent: boolean;
}

export interface ModelError {
  readonly kind: ModelErrorKind;
  readonly message: string;
}

const nameOf = (error: unknown): string => {
  if (error instanceof EngineError) return error.code;
  return error instanceof Error || error instanceof DOMException ? error.name : '';
};

const NETWORK_TYPE_ERROR = /fetch|network|offline|load failed|internet/i;

/** خطأ مرحلة الحزمة إن عرفه التصنيف، وإلا null (يمرّ الخطأ كما هو). الإلغاء لا يُصنَّف. */
export function classifyModelError(error: unknown, context: ModelErrorContext): ModelError | null {
  const name = nameOf(error);
  if (name === 'AbortError') return null;
  if (name === 'NetworkError') return { kind: 'network', message: MODEL_MESSAGES.networkLost };
  if (error instanceof TypeError && NETWORK_TYPE_ERROR.test(error.message)) return { kind: 'network', message: MODEL_MESSAGES.networkLost };
  if (name === 'QuotaExceededError' && !context.packPresent) return { kind: 'storage', message: MODEL_MESSAGES.storageFull };
  return null;
}

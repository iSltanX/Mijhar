// النماذج (T-11.10، AC-E10 (٤)، DEC-13 ن-5): معرّف النموذج يكتبه المستخدم لكل مزوّد ويُستعمل كما هو وإن لم يكن في قائمة المزوّد؛ والقائمة (من واجهة
// المزوّد الرسمية وقت التشغيل) مساعدة لا شرط، والاختبار اختياري لا شرط. لا قائمة نماذج ولا اسم ولا نمط اسم هنا (AC-E9 (٣))؛ والحقل الفارغ لا تحليل
// معه ولا يُخمَّن نموذج (BLK-MODEL-COMPAT).
import type { ModelTest, ModelsList, ProviderFailure, ProviderModel } from './types';

export const isModelId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/.test(value);

/** نماذج القائمة التي تُعرض للمساعدة: ما لم يتقاعد، بترتيب المزوّد نفسه. */
export const listedModels = (list: Pick<ModelsList, 'models'> | null): ProviderModel[] => (list ? list.models.filter((m) => m.lifecycle !== 'retired') : []);

/**
 * النموذج المقترح في حقل فارغ بعد التحقق: أول نموذج أعلنت واجهة المزوّد الرسمية توافقه مع التحليل ولم يُعلَن إيقافه، بترتيب المزوّد؛ ولا يُفضَّل نموذج
 * باسمه ولا فئته. اقتراح يجوز ولا يُفرض (DEC-13 ن-5)، وحيث لا تعلن الواجهة توافقًا لا اقتراح.
 */
export function defaultModel(list: Pick<ModelsList, 'models'>): ProviderModel | null {
  const declared = listedModels(list).filter((m) => m.compatibility === 'declared');
  return declared.find((m) => m.lifecycle === null || m.lifecycle === 'active') ?? declared[0] ?? null;
}

/**
 * ما يعنيه فشل الاختبار: rejected = رفض المزوّد النموذج نفسه (غير موجود أو غير متاح للمفتاح أو لا يقبله الطلب)؛ inconclusive = لم يُحسم (الشبكة
 * والمصادقة والصلاحية وحد الطلبات وتعطل الخدمة)، فليس حكمًا على النموذج ولا «عدم توافق».
 */
export function testVerdict(failure: ProviderFailure): Exclude<ModelTest['verdict'], 'accepted'> {
  return failure === 'not-found' || failure === 'invalid' || failure === 'incompatible' ? 'rejected' : 'inconclusive';
}

/** نتيجة اختبار تخص هذا النموذج بمفتاح المزوّد الحالي وحدهما، وإلا null: لا تنتقل نتيجة إلى نموذج آخر ولا إلى مفتاح استُبدل. */
export const testFor = (test: ModelTest | null, model: string, keySavedAt: number | null): ModelTest | null =>
  test && model && test.model === model && keySavedAt !== null && test.keySavedAt === keySavedAt ? test : null;

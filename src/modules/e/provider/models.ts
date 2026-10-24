// المودلات المتوافقة مع التحليل (T-11.10، AC-E10 (٤)، DEC-13 ن-3): ما أعلنت واجهة المزوّد الرسمية توافقه، أو ما ثبت بفحص صريح بدأه المستخدم؛ وما
// سواهما لا يُعرض خيارًا ولا يُرسل إليه تحليل. لا قائمة مودلات ولا اسم ولا نمط اسم هنا: كل شيء من قائمة المزوّد وقت التشغيل (AC-E9 (٣)).
// ومزوّد بلا مودل متوافق يُعرض بلا خيار تحليل معلَّلًا (BLK-MODEL-COMPAT)، ولا يُخمَّن مودل.
import type { ModelsList, ProviderModel } from './types';

export const isModelId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/.test(value);

/** مودل يصلح للتحليل الآن: متوافق (معلن أو مفحوص) وغير متقاعد. */
export const isUsable = (m: ProviderModel): boolean => (m.compatibility === 'declared' || m.compatibility === 'checked') && m.lifecycle !== 'retired';

/** المودلات المتوافقة بترتيب المزوّد نفسه. */
export const compatibleModels = (list: Pick<ModelsList, 'models'> | null): ProviderModel[] => (list ? list.models.filter(isUsable) : []);

/** ما لم يُعلن توافقه ولم يثبت بعد (يُعرض للفحص الصريح وحده إن دعمه المحوّل). */
export const uncheckedModels = (list: Pick<ModelsList, 'models'> | null): ProviderModel[] => (list ? list.models.filter((m) => m.compatibility === 'unknown' && m.lifecycle !== 'retired') : []);

/**
 * المودل الافتراضي من قائمة المزوّد نفسها: أول مودل متوافق نشط بترتيب المزوّد (الأحدث أولًا حيث يعلن ذلك)، وإلا أول متوافق؛ ولا يُفضَّل مودل
 * باسمه ولا فئته (AC-E10 (٤)).
 */
export function defaultModel(list: Pick<ModelsList, 'models'>): ProviderModel | null {
  const usable = compatibleModels(list);
  return usable.find((m) => m.lifecycle === null || m.lifecycle === 'active') ?? usable[0] ?? null;
}

/** قائمة جديدة من المزوّد مع ما ثبت توافقه بفحص صريح في القائمة السابقة (فلا يُعاد الفحص بعد كل تحقق). */
export function keepChecked(fresh: ModelsList, previous: ModelsList | null): ModelsList {
  const checked = new Set(previous?.models.filter((m) => m.compatibility === 'checked').map((m) => m.id) ?? []);
  if (!checked.size) return fresh;
  return { ...fresh, models: fresh.models.map((m) => (m.compatibility === 'unknown' && checked.has(m.id) ? { ...m, compatibility: 'checked' as const } : m)) };
}

/** القائمة بعد فحص صريح ناجح لمودل. */
export const markChecked = (list: ModelsList, model: string): ModelsList => ({
  ...list,
  models: list.models.map((m) => (m.id === model && m.compatibility === 'unknown' ? { ...m, compatibility: 'checked' as const } : m)),
});

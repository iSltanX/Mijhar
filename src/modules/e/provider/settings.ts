// إعدادات التحليل (T-11.6، T-11.10، AC-E10 (٢)): المزوّد المختار من السجل الوصفي، والمودل المختار لكل مزوّد على حدة من قائمته وقت التشغيل (فارغ =
// الافتراضي من القائمة نفسها)؛ فتغيير المزوّد لا يمس مودل غيره. ومودل Anthropic في مفتاحه التاريخي (MJ21) بلا ترحيل.
// لا سرّ هنا ولا سعر ولا عتبة تكلفة ولا حد إنفاق (AD-31)؛ والموافقة قبل كل تحليل لا خيار لإيقافها، فليست إعدادًا.
import type { SettingsRegistry } from '../../../core/settings';
import { PROVIDER_DESCRIPTORS } from './catalog';
import { isModelId } from './models';
import type { ProviderDescriptor } from './types';

export const PROVIDER_ID_KEY = 'e.provider.id';
/** مفتاح مودل المزوّد الأول التاريخي (MJ21)، ويبقى له. */
export const PROVIDER_MODEL_KEY = 'e.provider.model';
const HISTORICAL_PROVIDER = 'anthropic';

/** مفتاح المودل المختار لمزوّد. */
export const modelSettingKey = (provider: string): string => (provider === HISTORICAL_PROVIDER ? PROVIDER_MODEL_KEY : `${PROVIDER_MODEL_KEY}.${provider}`);

export const isProviderId = (value: unknown): value is string => typeof value === 'string' && PROVIDER_DESCRIPTORS.some((p) => p.id === value);

const isModelChoice = (value: unknown): value is string => value === '' || isModelId(value);

export function defineProviderSettings(registry: SettingsRegistry, list: readonly ProviderDescriptor[] = PROVIDER_DESCRIPTORS): void {
  registry.define<string>({
    key: PROVIDER_ID_KEY,
    default: list[0]?.id ?? '',
    validate: (value): value is string => typeof value === 'string' && list.some((p) => p.id === value),
    description: 'مزوّد التحليل المختار من سجل المزوّدين',
  });
  for (const provider of list) {
    registry.define<string>({
      key: modelSettingKey(provider.id),
      default: '',
      validate: isModelChoice,
      description: `مودل التحليل لدى ${provider.title} من قائمته وقت التشغيل؛ والفارغ يختار الافتراضي من القائمة نفسها`,
    });
  }
}

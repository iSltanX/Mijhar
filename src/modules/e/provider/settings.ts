// إعدادات التحليل (T-11.6): المزوّد المختار من السجل، والمودل المختار من قائمة المزوّد وقت التشغيل (فارغ = الافتراضي من القائمة نفسها).
// لا سرّ هنا ولا سعر ولا عتبة تكلفة ولا حد إنفاق (AD-31)؛ والموافقة قبل كل تحليل لا خيار لإيقافها، فليست إعدادًا.
import type { SettingsRegistry } from '../../../core/settings';
import { PROVIDERS, isModelId } from './registry';

export const PROVIDER_ID_KEY = 'e.provider.id';
export const PROVIDER_MODEL_KEY = 'e.provider.model';

export const isProviderId = (value: unknown): value is string => typeof value === 'string' && PROVIDERS.some((p) => p.id === value);

export function defineProviderSettings(registry: SettingsRegistry): void {
  registry.define<string>({ key: PROVIDER_ID_KEY, default: PROVIDERS[0]?.id ?? '', validate: isProviderId, description: 'مزوّد التحليل المختار من سجل المزوّدين' });
  registry.define<string>({
    key: PROVIDER_MODEL_KEY,
    default: '',
    validate: (value): value is string => value === '' || isModelId(value),
    description: 'مودل التحليل من قائمة المزوّد وقت التشغيل؛ والفارغ يختار الافتراضي من القائمة نفسها',
  });
}

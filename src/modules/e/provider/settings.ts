// إعدادات التحليل (T-11.6، T-11.10، AC-E10 (٢)، DEC-13 ن-5): المزوّد المختار من السجل الوصفي، ومعرّف النموذج لكل مزوّد على حدة كما كتبه المستخدم أو
// اختاره من قائمة المزوّد (فارغ = لا تحليل عنده حتى يُكتب)؛ فتغيير المزوّد لا يمس نموذج غيره. ونموذج Anthropic في مفتاحه التاريخي (MJ21) بلا ترحيل.
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

/** AD-38: معرّف مساحة العمل لمزوّد له workspaceHeader؛ ليس سرًّا (يظهر في Claude Console)، ويكتبه المستخدم ولا يُخمَّن. الفارغ = بلا ترويسة. */
export const workspaceSettingKey = (provider: string): string => `e.provider.workspace.${provider}`;
/** صيغة معرّف مساحة العمل في Claude Console (wrkspc_…)؛ والحكم عليه (موجود، متاح للمفتاح) للمزوّد. */
export const WORKSPACE_ID = /^wrkspc_[A-Za-z0-9]{8,64}$/;
export const isWorkspaceChoice = (value: unknown): value is string => value === '' || (typeof value === 'string' && WORKSPACE_ID.test(value));

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
      description: `معرّف نموذج التحليل لدى ${provider.title} كما يكتبه المستخدم أو يختاره من قائمته؛ والفارغ لا تحليل معه`,
    });
    if (provider.workspaceHeader) {
      registry.define<string>({
        key: workspaceSettingKey(provider.id),
        default: '',
        validate: isWorkspaceChoice,
        description: `معرّف مساحة العمل لدى ${provider.title} لمفتاح غير مقيّد بمساحة عمل (ترويسة ${provider.workspaceHeader})؛ والفارغ بلا ترويسة`,
      });
    }
  }
}

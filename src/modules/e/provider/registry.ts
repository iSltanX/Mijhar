// سجل المزوّدين (T-11.6، AC-E9 (٦)): قائمة مغلقة من المحوّلات، والمزوّد الأول Anthropic (DEC-09). إضافة مزوّد = ملف محوّل في adapters/ وسطر
// هنا ومضيفه في optional_host_permissions؛ ولا تمس شيفرة الأقسام (d/analysis وما يعرضه)، فهي تتعامل مع السجل والخلفية لا مع محوّل بعينه.
// والمودل يُختار من قائمة المزوّد وقت التشغيل: لا معرّف مودل ولا سعر في الشيفرة (AC-E9 (٣)، AD-31).
import { ANTHROPIC } from './adapters/anthropic';
import type { ModelsList, ProviderAdapter, ProviderModel } from './types';

export const PROVIDERS: readonly ProviderAdapter[] = [ANTHROPIC];

export interface ProviderRegistry {
  readonly list: readonly ProviderAdapter[];
  byId(id: string): ProviderAdapter | null;
  /** المزوّد الافتراضي: الأول في القائمة. */
  readonly first: ProviderAdapter;
}

export function createProviderRegistry(list: readonly ProviderAdapter[] = PROVIDERS): ProviderRegistry {
  const first = list[0];
  if (!first) throw new Error('سجل المزوّدين فارغ');
  const ids = new Set<string>();
  for (const p of list) {
    if (ids.has(p.id)) throw new Error(`مزوّد بمعرّف مكرر: ${p.id}`);
    ids.add(p.id);
  }
  return { list, first, byId: (id) => list.find((p) => p.id === id) ?? null };
}

/**
 * المودل الافتراضي من قائمة المزوّد نفسها: أحدث مودل نشط من فئة «sonnet» كما يعلنها المزوّد، وإلا أول مودل نشط (القائمة الأحدث أولًا)؛
 * ولا يُستنتج شيء من المعرّف.
 */
export function defaultModel(list: Pick<ModelsList, 'models'>): ProviderModel | null {
  const active = list.models.filter((m) => m.lifecycle === null || m.lifecycle === 'active');
  return active.find((m) => m.line === 'sonnet') ?? active[0] ?? list.models[0] ?? null;
}

export const isModelId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/.test(value);

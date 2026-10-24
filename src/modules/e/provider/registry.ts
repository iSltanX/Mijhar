// سجل المحوّلات (T-11.6، T-11.10، AC-E10 (١)): قائمة مغلقة من محوّلات المزوّدين للخلفية وحدها، فلا تصل ترويساتها ولا مساراتها حزمة غير background.js
// (I-2). ووصف كل مزوّد (ما تعرضه الواجهات) في السجل الوصفي catalog.ts؛ واختبار يفرض أن القائمتين متطابقتان بالترتيب والوصف نفسه، فلا تعرض الواجهة
// مزوّدًا لم يُدمج محوّله ولا يبقى محوّل بلا وصف. ولا تمس إضافة محوّل شيفرة الأقسام (d/analysis وما يعرضه).
// والمودل يُختار من قائمة المزوّد وقت التشغيل: لا معرّف مودل ولا سعر في الشيفرة (AC-E9 (٣)، AD-31).
import { ANTHROPIC_ADAPTER } from './adapters/anthropic';
import { GEMINI_ADAPTER } from './adapters/gemini';
import type { ProviderAdapter } from './types';

export const PROVIDER_ADAPTERS: readonly ProviderAdapter[] = [ANTHROPIC_ADAPTER, GEMINI_ADAPTER];

export interface ProviderRegistry {
  readonly list: readonly ProviderAdapter[];
  byId(id: string): ProviderAdapter | null;
  /** المزوّد الافتراضي: الأول في القائمة. */
  readonly first: ProviderAdapter;
}

export function createProviderRegistry(list: readonly ProviderAdapter[] = PROVIDER_ADAPTERS): ProviderRegistry {
  const first = list[0];
  if (!first) throw new Error('سجل المزوّدين فارغ');
  const ids = new Set<string>();
  const hosts = new Set<string>();
  for (const { descriptor: d } of list) {
    if (ids.has(d.id)) throw new Error(`مزوّد بمعرّف مكرر: ${d.id}`);
    // مضيف لكل مزوّد: صلاحيته وسحبها ومفتاحه يخصونه وحده.
    if (hosts.has(d.host)) throw new Error(`مضيف مكرر بين مزوّدين: ${d.host}`);
    if (d.origin !== `https://${d.host}/*`) throw new Error(`نمط صلاحية لا يطابق مضيف المزوّد: ${d.origin}`);
    ids.add(d.id);
    hosts.add(d.host);
  }
  return { list, first, byId: (id) => list.find((p) => p.descriptor.id === id) ?? null };
}

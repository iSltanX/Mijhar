// السجل الوصفي لمزوّدي التحليل (T-11.10، AC-E10 (١)، AD-32): وصف كل مزوّد دُمج محوّله، منفصلًا عن المحوّلات. يستورده سكربت المحتوى واللوحة
// والإعدادات (قائمة المزوّد، وأسماء المزوّدين في النصوص، وفحص صيغة المفتاح محليًا)، ولا يستورد محوّلًا: الترويسات والمسارات في adapters/ وتصل
// الخلفية وحدها عبر registry.ts (I-2).
// إضافة مزوّد = ملف وصف في descriptors/ وسطر هنا، ومحوّله في adapters/ وسطر في registry.ts، وصلاحية مضيفه في المانيفست؛ ويفرض اختبار أن لكل وصف
// محوّلًا واحدًا بالوصف نفسه وصلاحية مضيف، فلا تعرض القائمة مزوّدًا لم يُدمج محوّله. ولا تمس شيفرة الأقسام. ولا سعر هنا (AD-31) ولا اسم مودل (DEC-13).
import { ANTHROPIC } from './descriptors/anthropic';
import type { ProviderDescriptor, ProviderInfo } from './types';

export const PROVIDER_DESCRIPTORS: readonly ProviderDescriptor[] = [ANTHROPIC];

export const descriptorById = (id: string, list: readonly ProviderDescriptor[] = PROVIDER_DESCRIPTORS): ProviderDescriptor | null => list.find((d) => d.id === id) ?? null;

/** يفحص صيغة المفتاح محليًا دون أي طلب. */
export function checkKey(descriptor: Pick<ProviderDescriptor, 'keyFormat'>, input: string): { readonly ok: true; readonly key: string } | { readonly ok: false; readonly reason: string } {
  const key = input.trim();
  if (!key) return { ok: false, reason: 'الحقل فارغ.' };
  const { pattern, rejects, mismatch } = descriptor.keyFormat;
  if (pattern.test(key)) return { ok: true, key };
  const known = rejects.find((r) => key.startsWith(r.prefix));
  return { ok: false, reason: known ? known.reason : mismatch };
}

/** المزوّد كما يعبر الرسائل (بلا نمط الصيغة). */
export function providerInfo(descriptor: ProviderDescriptor): ProviderInfo {
  const { keyFormat: _format, ...info } = descriptor;
  return info;
}

/** أسماء المزوّدين المدموجة محوّلاتهم بالعطف («Anthropic»، «Anthropic أو OpenAI»)؛ فلا يذكر نصٌّ مزوّدًا لم يُدمج (AC-E10 (٧)). */
export const providerNames = (list: readonly Pick<ProviderDescriptor, 'title'>[] = PROVIDER_DESCRIPTORS, joiner = ' أو '): string => list.map((d) => d.title).join(joiner);

/** مضيفات المزوّدين المدموجة بالعطف. */
export const providerHosts = (list: readonly Pick<ProviderDescriptor, 'host'>[] = PROVIDER_DESCRIPTORS, joiner = ' أو '): string => list.map((d) => d.host).join(joiner);

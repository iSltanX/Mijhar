// أماكن شائعة لتوسيع تهجئات حقل location (T-9.4، F-H4). الغرض مساعدة بحث بنص حقل علني يكتبه أصحاب الحسابات بتهجئات متعددة؛
// لا تصنّف القائمة أشخاصًا ولا تستنتج منها شيئًا عن أحد (F-H6)، والمستخدم يضيف صيغه ويعدّلها. الصيغ مرتبة بالأولوية.
import { locationQuery } from './queries';
import type { GeneratedQuery } from './queries';
import { MAX_OPERATORS } from './validate';

export interface Place {
  readonly id: string;
  readonly kind: 'country' | 'city';
  readonly label: string;
  readonly variants: readonly string[];
}

export const PLACES: readonly Place[] = [
  { id: 'sa', kind: 'country', label: 'السعودية', variants: ['Saudi Arabia', 'السعودية', 'KSA', 'المملكة العربية السعودية'] },
  { id: 'riyadh', kind: 'city', label: 'الرياض', variants: ['Riyadh', 'الرياض'] },
  { id: 'jeddah', kind: 'city', label: 'جدة', variants: ['Jeddah', 'Jiddah', 'جدة'] },
  { id: 'dammam', kind: 'city', label: 'الدمام', variants: ['Dammam', 'الدمام'] },
  { id: 'eg', kind: 'country', label: 'مصر', variants: ['Egypt', 'مصر'] },
  { id: 'cairo', kind: 'city', label: 'القاهرة', variants: ['Cairo', 'القاهرة'] },
  { id: 'alexandria', kind: 'city', label: 'الإسكندرية', variants: ['Alexandria', 'الإسكندرية', 'الاسكندرية'] },
  { id: 'ae', kind: 'country', label: 'الإمارات', variants: ['United Arab Emirates', 'UAE', 'الإمارات', 'الامارات'] },
  { id: 'dubai', kind: 'city', label: 'دبي', variants: ['Dubai', 'دبي'] },
  { id: 'abudhabi', kind: 'city', label: 'أبوظبي', variants: ['Abu Dhabi', 'أبوظبي', 'ابوظبي'] },
  { id: 'jo', kind: 'country', label: 'الأردن', variants: ['Jordan', 'الأردن', 'الاردن'] },
  { id: 'amman', kind: 'city', label: 'عمّان', variants: ['Amman', 'عمان', 'عمّان'] },
  { id: 'ma', kind: 'country', label: 'المغرب', variants: ['Morocco', 'المغرب'] },
  { id: 'rabat', kind: 'city', label: 'الرباط', variants: ['Rabat', 'الرباط'] },
  { id: 'casablanca', kind: 'city', label: 'الدار البيضاء', variants: ['Casablanca', 'الدار البيضاء'] },
  { id: 'dz', kind: 'country', label: 'الجزائر', variants: ['Algeria', 'الجزائر'] },
  { id: 'tn', kind: 'country', label: 'تونس', variants: ['Tunisia', 'تونس'] },
  { id: 'ly', kind: 'country', label: 'ليبيا', variants: ['Libya', 'ليبيا'] },
  { id: 'sd', kind: 'country', label: 'السودان', variants: ['Sudan', 'السودان'] },
  { id: 'iq', kind: 'country', label: 'العراق', variants: ['Iraq', 'العراق'] },
  { id: 'sy', kind: 'country', label: 'سوريا', variants: ['Syria', 'سوريا', 'سورية'] },
  { id: 'lb', kind: 'country', label: 'لبنان', variants: ['Lebanon', 'لبنان'] },
  { id: 'ps', kind: 'country', label: 'فلسطين', variants: ['Palestine', 'فلسطين'] },
  { id: 'ye', kind: 'country', label: 'اليمن', variants: ['Yemen', 'اليمن'] },
  { id: 'kw', kind: 'country', label: 'الكويت', variants: ['Kuwait', 'الكويت'] },
  { id: 'qa', kind: 'country', label: 'قطر', variants: ['Qatar', 'قطر'] },
  { id: 'bh', kind: 'country', label: 'البحرين', variants: ['Bahrain', 'البحرين'] },
  { id: 'om', kind: 'country', label: 'عُمان', variants: ['Oman', 'عمان', 'سلطنة عمان'] },
];

export const MAX_VARIANTS_PER_QUERY = MAX_OPERATORS + 1;

const normalize = (value: string): string => value.normalize('NFKC').trim().toLocaleLowerCase('en');

/** صيغ الأماكن المختارة مع صيغ المستخدم الخاصة، بلا تكرار، مرتبةً بالتناوب بين الأماكن ليأخذ كل مكان أولى صيغه أولًا. */
export function collectVariants(places: readonly Place[], custom: readonly string[] = []): string[] {
  const lists = [...places.map((p) => [...p.variants]), custom.map((c) => c.trim()).filter(Boolean)];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; lists.some((list) => i < list.length); i += 1) {
    for (const list of lists) {
      const variant = list[i];
      if (variant === undefined) continue;
      const key = normalize(variant);
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(variant);
      }
    }
  }
  return out;
}

/** يقسّم الصيغ إلى استعلامات لا يتجاوز كل منها حد المعاملات؛ فلا يضيع شيء باقتطاع. */
export function locationQueries(variants: readonly string[], extra: { readonly language?: string } = {}): GeneratedQuery[] {
  const chunks: string[][] = [];
  for (let i = 0; i < variants.length; i += MAX_VARIANTS_PER_QUERY) chunks.push(variants.slice(i, i + MAX_VARIANTS_PER_QUERY));
  return chunks.map((chunk) => locationQuery(chunk, extra));
}

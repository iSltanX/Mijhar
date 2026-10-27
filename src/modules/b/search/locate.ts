// «أبرز الموضع» (F-B6 / AC-B6): يحدد عنصر المدخل في الصفحة الحالية بالمطابقة الدلالية نفسها التي تستعملها بطاقة الشرح (b/card/match:
// الاسم والدور ونوع الصفحة والرابط، وعدم التخمين)، فإن لم يوجد فيها عُرض مسار التبويب أو الصفحة التي يوجد فيها. دالة نقية على DOM: لا تعدّله.
import type { GlossaryEntry } from '../../../data/glossary/types';
import { GLOSSARY_ENTRIES } from '../card/entries';
import { buildIndex, findMatches, pageKindsOf } from '../card';
import type { LabelIndex } from '../card';
import type { PageState } from '../../../core';
import { whereIs } from './paths';

export type LocateResult =
  /** وُجد العنصر في الصفحة الحالية: count كل ما طابق، وعناصره في LocatedElements. */
  | { readonly status: 'found'; readonly count: number }
  /** لم يوجد في الصفحة الحالية: هذه الصفحات يوجد فيها العنصر. here: هل صفحتنا من صفحاته (فربما غاب لصلاحية أو حالة). */
  | { readonly status: 'elsewhere'; readonly paths: readonly string[]; readonly here: boolean }
  /** مفهوم عام لا يقابله عنصر في الصفحة. */
  | { readonly status: 'concept' }
  | { readonly status: 'unknown-entry' }
  /** لا صفحة GitHub يُقاس عليها (الطلب من خارجها). */
  | { readonly status: 'unavailable' };

export interface Located {
  readonly result: LocateResult;
  readonly elements: readonly Element[];
}

type PageLike = Pick<PageState, 'type' | 'href'>;

/** المدخل بمعرّفه في القائمة المعطاة. */
export function findEntry(entries: readonly GlossaryEntry[], id: string): GlossaryEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

const indexes = new WeakMap<readonly GlossaryEntry[], LabelIndex>();
/** فهرس القاموس كله (مع المدخل إن لم يكن فيه): المطابق يفاضل بين كل المدخلات على العنصر الواحد كما تفعل بطاقة الشرح، فيرفض الملتبس. */
function indexWith(entries: readonly GlossaryEntry[], entry: GlossaryEntry): LabelIndex {
  if (!entries.includes(entry)) return buildIndex([...entries, entry]);
  let index = indexes.get(entries);
  if (!index) indexes.set(entries, (index = buildIndex(entries)));
  return index;
}

/** entries: القاموس الذي يُفاضَل فيه (الافتراضي كله)؛ لا يُعدّ عنصرًا للمدخل ما ينسبه القاموس إلى غيره أو يرفضه ملتبسًا (GEMINI-011). */
export function locateEntry(entry: GlossaryEntry | undefined, doc: Document, page: PageLike, entries: readonly GlossaryEntry[] = GLOSSARY_ENTRIES): Located {
  if (!entry) return { result: { status: 'unknown-entry' }, elements: [] };
  const where = whereIs(entry);
  if (where.kind === 'concept') return { result: { status: 'concept' }, elements: [] };
  const kinds = pageKindsOf(page);
  const matches = findMatches(doc, indexWith(entries, entry), { kinds, href: page.href }).matches.filter((m) => m.entry.id === entry.id);
  if (matches.length) return { result: { status: 'found', count: matches.length }, elements: matches.map((m) => m.element) };
  const signature = entry.signature;
  const here = Boolean(signature && (signature.pages.includes('any') || signature.pages.some((kind) => kinds.includes(kind))));
  return { result: { status: 'elsewhere', paths: where.paths, here }, elements: [] };
}

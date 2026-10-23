// «أبرز الموضع» (F-B6 / AC-B6): يحدد عنصر المدخل في الصفحة الحالية بالمطابقة الدلالية نفسها التي تستعملها بطاقة الشرح (b/card/match:
// الاسم والدور ونوع الصفحة والرابط، وعدم التخمين)، فإن لم يوجد فيها عُرض مسار التبويب أو الصفحة التي يوجد فيها. دالة نقية على DOM: لا تعدّله.
import type { GlossaryEntry } from '../../../data/glossary/types';
import { buildIndex, findMatches, pageKindsOf } from '../card';
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

export function locateEntry(entry: GlossaryEntry | undefined, doc: Document, page: PageLike): Located {
  if (!entry) return { result: { status: 'unknown-entry' }, elements: [] };
  const where = whereIs(entry);
  if (where.kind === 'concept') return { result: { status: 'concept' }, elements: [] };
  const kinds = pageKindsOf(page);
  const { matches } = findMatches(doc, buildIndex([entry]), { kinds, href: page.href });
  if (matches.length) return { result: { status: 'found', count: matches.length }, elements: matches.map((m) => m.element) };
  const signature = entry.signature;
  const here = Boolean(signature && (signature.pages.includes('any') || signature.pages.some((kind) => kinds.includes(kind))));
  return { result: { status: 'elsewhere', paths: where.paths, here }, elements: [] };
}

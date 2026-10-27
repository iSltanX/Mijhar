// تحديد عنصر الخطوة في الصفحة المفتوحة (F-B7 / AC-B7): بمطابقة بطاقة الشرح نفسها (b/card/match: الاسم والدور ونوع الصفحة والرابط، وعدم التخمين) لمدخل
// الخطوة، فلا تُبرز الجولة عنصرًا لا تتعرف عليه بثقة. قراءة فقط: دوال خالصة على DOM لا تعدّله ولا تنقر ولا تركّز ولا ترسل.
//  - خطوة الشرح البصري (visual) لا تُقرأ لها صفحة أبدًا: تُرجع فورًا دون لمس DOM (إعدادات حساسة).
//  - غياب العنصر ليس فشلًا: بطاقة تشرح سببه من بيانات القاموس (الصلاحية المطلوبة وصفحات وجود العنصر) وسبب الخطوة الخاص، لا تخمين.
import type { PageState } from '../../../core';
import type { GlossaryEntry } from '../../../data/glossary/types';
import { PERMISSION_LABELS } from '../card/display';
import { GLOSSARY_ENTRIES } from '../card/entries';
import { findEntry, locateEntry } from '../search/locate';
import type { TourStep } from './data';

type PageLike = Pick<PageState, 'type' | 'href'>;

export type StepResolution =
  /** شرح بصري فقط: لم تُقرأ الصفحة. */
  | { readonly kind: 'visual'; readonly entry: GlossaryEntry | null }
  | { readonly kind: 'found'; readonly entry: GlossaryEntry; readonly elements: readonly Element[] }
  | { readonly kind: 'absent'; readonly entry: GlossaryEntry | null; readonly reasons: readonly string[]; readonly paths: readonly string[] }
  /** خطوة شرح بلا عنصر (entry = null). */
  | { readonly kind: 'text' };

const entryIds = (step: TourStep): readonly string[] => (step.entry === null ? [] : typeof step.entry === 'string' ? [step.entry] : step.entry);

export function entriesOf(step: TourStep, entries: readonly GlossaryEntry[] = GLOSSARY_ENTRIES): GlossaryEntry[] {
  return entryIds(step).flatMap((id) => findEntry(entries, id) ?? []);
}

export function resolveStep(step: TourStep, doc: Document, page: PageLike, entries: readonly GlossaryEntry[] = GLOSSARY_ENTRIES): StepResolution {
  const found = entriesOf(step, entries);
  if (step.visual) return { kind: 'visual', entry: found[0] ?? null };
  if (!entryIds(step).length) return { kind: 'text' };
  const paths = new Set<string>();
  let here = false;
  for (const entry of found) {
    const { result, elements } = locateEntry(entry, doc, page, entries);
    if (result.status === 'found') return { kind: 'found', entry, elements };
    if (result.status === 'elsewhere') {
      for (const path of result.paths) paths.add(path);
      here ||= result.here;
    }
  }
  const reasons: string[] = [];
  if (step.absent) reasons.push(step.absent);
  const first = found[0] ?? null;
  if (!first) reasons.push('تعذّر تعريف هذا العنصر في القاموس، فلا تستطيع الجولة تحديده في الصفحة.');
  else {
    if (first.permission !== 'Read' && first.permission !== 'None') {
      reasons.push(`يتطلب هذا العنصر صلاحية ${PERMISSION_LABELS[first.permission]}${first.permissionNote ? `؛ ${first.permissionNote}` : ''}، فقد لا يظهر لحسابك.`);
    }
    reasons.push(
      here
        ? 'الصفحة المفتوحة من الصفحات التي يوجد فيها هذا العنصر لكنه غير ظاهر الآن: ربما لم يكتمل تحميلها، أو غيّر GitHub تسميته أو بنيته. لا تخمّن الجولة عنصرًا لا تتعرف عليه بثقة.'
        : `هذا العنصر ليس في الصفحة المفتوحة. يوجد في: ${[...paths].join(' أو ')}.`,
    );
  }
  return { kind: 'absent', entry: first, reasons, paths: [...paths] };
}

// ---------- روابط فتح الصفحة (بنقر المستخدم) ----------

const SEGMENT = /^[A-Za-z0-9._-]+$/;

/** الحساب الذي يُقصد بـ{user}: حساب الدخول من meta user-login، وإلا صاحب الصفحة المفتوحة. */
export function currentUser(doc: Document, owner: string | null): string | null {
  const login = doc.querySelector('meta[name="user-login"]')?.getAttribute('content')?.trim();
  if (login && SEGMENT.test(login)) return login;
  return owner && SEGMENT.test(owner) ? owner : null;
}

/** يحل قالب المسار بقيم الصفحة المفتوحة، أو null إن لم يكتمل (فلا يُعرض رابط مخمَّن). الناتج رابط github.com مطلق دائمًا. */
export function resolvePath(template: string | undefined, values: { owner: string | null; repo: string | null; user: string | null }): string | null {
  if (!template) return null;
  const parts = new Map<string, string | null>([
    ['{owner}', values.owner],
    ['{repo}', values.repo],
    ['{user}', values.user],
  ]);
  let path = template;
  for (const [token, value] of parts) {
    if (!path.includes(token)) continue;
    if (!value || !SEGMENT.test(value)) return null;
    path = path.split(token).join(encodeURIComponent(value));
  }
  return path.includes('{') ? null : `https://github.com${path}`;
}

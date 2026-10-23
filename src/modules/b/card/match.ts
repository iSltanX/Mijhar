// مطابقة عناصر الصفحة بتواقيع القاموس الدلالية (F-B1) مع قاعدة عدم التخمين (BLK-DOM-LOW-CONFIDENCE):
// لا يُلصق شرح بعنصر إلا إذا طابق توقيعًا واحدًا بثقة كافية، وثقة كافية = اجتماع هذه الشروط معًا:
//   1. التسمية: اسم العنصر (aria-label أو aria-labelledby أو نصه الظاهر أو title أو placeholder أو alt) يساوي إحدى تسميات التوقيع
//      مطابقة كاملة بلا حساسية لحالة الأحرف، بعد توحيد المسافات وعلامات الاتجاه والنقاط الثلاث وحذف عدّاد ملصق بآخر النص.
//   2. الدور: دور العنصر (الصريح role أو الضمني من الوسم) من أدوار التوقيع.
//   3. الصفحة: نوع الصفحة الحالية من أنواع التوقيع (أو 'any').
//   4. الرابط: إن كان للتوقيع أنماط href وكان العنصر رابطًا ذا href، طابق أحد الأنماط مسار الرابط واستعلامه.
// وعنصر يطابق مدخلين فأكثر بدرجة واحدة لا يُشرح (التباس). ما فشل منها يُحصى في skipped بسببه ولا يُشرح أبدًا.
// المطابقة لا تعدّل الصفحة: تقرأ فقط، ولا تغلّف عنصرًا ولا تضيف سمة.
import type { GlossaryEntry, PageKind, SignatureRole } from '../../../data/glossary/types';

export type SkipReason = 'role' | 'page' | 'href' | 'ambiguous' | 'hidden';

export interface Match {
  readonly element: Element;
  readonly entry: GlossaryEntry;
  /** 1 للتسمية والدور، +1 لنوع صفحة خاص (غير any)، +1 لنمط رابط مطابق. */
  readonly score: number;
  readonly label: string;
}

export interface Skipped {
  readonly element: Element;
  readonly reason: SkipReason;
  /** معرّفات المداخل التي طابقت تسميته ولم تكتمل شروطها. */
  readonly entries: readonly string[];
}

export interface MatchResult {
  readonly matches: readonly Match[];
  readonly skipped: readonly Skipped[];
}

export interface MatchContext {
  readonly kinds: readonly PageKind[];
  /** عنوان الصفحة الحالية لحل الروابط النسبية. */
  readonly href: string;
}

const CANDIDATES = 'button, a[href], summary, input, textarea, select, [role], h1, h2, h3, h4, h5, h6, [aria-label], [aria-labelledby], table, ul, ol, section, img[alt]';
const MAX_LABEL = 120;
const INVISIBLE = /[​-‏‪-‮⁠⁦-⁩﻿]/g;
/** أدوار يُقرأ اسمها من نصها الظاهر؛ الباقي (region وlist وtable…) يُقرأ من الاسم الموسوم وحده كي لا يُقرأ نص حاوية كاملة. */
const TEXT_NAMED: ReadonlySet<string> = new Set(['button', 'link', 'tab', 'menuitem', 'heading', 'switch', 'checkbox', 'status']);

export const normalizeLabel = (text: string): string => text.replace(INVISIBLE, '').replace(/…/g, '...').replace(/\s+/g, ' ').trim().toLowerCase();
const stripCounter = (text: string): string => text.replace(/\s+[\d.,]+\s*[kKmM]?\s*$/, '');
/** أجزاء لا تُحسب من اسم العنصر: العدّادات (Counter وCounterLabel وsocial-count) والنص المخصص لقارئ الشاشة «(12)» والرموز. */
const NOT_NAME = '.Counter, [data-component="CounterLabel"], .social-count, .sr-only, [class*="VisuallyHidden"], svg, style, script, template';

/** النص الظاهر للعنصر بلا عدّاداته: «Pull requests<span class=Counter>1</span><span class=sr-only> (1)</span>» ← «Pull requests». */
function visibleName(el: Element): string {
  const parts: string[] = [];
  const walk = (node: Node): void => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) parts.push(child.nodeValue ?? '');
      else if (child.nodeType === 1 && !(child as Element).matches(NOT_NAME)) walk(child);
    }
  };
  walk(el);
  return parts.join('');
}

export function roleOf(el: Element): SignatureRole | string | null {
  const explicit = el.getAttribute('role')?.trim().split(/\s+/)[0];
  if (explicit) return explicit;
  switch (el.localName) {
    case 'button':
    case 'summary':
      return 'button';
    case 'a':
      return el.hasAttribute('href') ? 'link' : null;
    case 'select':
      return 'combobox';
    case 'textarea':
      return 'textbox';
    case 'input': {
      const type = (el.getAttribute('type') ?? 'text').toLowerCase();
      if (type === 'checkbox') return 'checkbox';
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button';
      if (['hidden', 'radio', 'file', 'range', 'color'].includes(type)) return null;
      return 'textbox';
    }
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return 'heading';
    case 'table':
      return 'table';
    case 'ul':
    case 'ol':
      return 'list';
    case 'section':
      return 'region';
    case 'img':
      return 'img';
    default:
      return null;
  }
}

function labelledBy(el: Element): string {
  const ids = el.getAttribute('aria-labelledby')?.split(/\s+/).filter(Boolean) ?? [];
  const doc = el.ownerDocument;
  return ids.map((id) => doc.getElementById(id)?.textContent ?? '').join(' ');
}

/** أسماء العنصر المرشَّحة، موحَّدة ومرتبة بلا تكرار. */
export function namesOf(el: Element, role: string): string[] {
  const raw: string[] = [];
  const push = (value: string | null | undefined): void => {
    if (value && value.length <= MAX_LABEL * 4) raw.push(value);
  };
  push(el.getAttribute('aria-label'));
  push(labelledBy(el));
  push(el.getAttribute('title'));
  push(el.getAttribute('placeholder'));
  if (el.localName === 'img') push(el.getAttribute('alt'));
  if (el.localName === 'input' && ['button', 'submit', 'reset'].includes((el.getAttribute('type') ?? '').toLowerCase())) push(el.getAttribute('value'));
  if (TEXT_NAMED.has(role)) {
    const text = el.textContent ?? '';
    // نص طويل = حاوية لا زر: لا يُقرأ اسمًا. الاسم مرتان: بلا عدّاداته، وكاملًا (لما اسمه كله في نص لقارئ الشاشة).
    if (text.length <= MAX_LABEL * 2) {
      push(visibleName(el));
      push(text);
    }
  }
  const labels = (el as HTMLInputElement).labels;
  if (labels && (role === 'checkbox' || role === 'switch' || role === 'textbox')) for (const label of labels) push(label.textContent);
  const out = new Set<string>();
  for (const value of raw) {
    const base = normalizeLabel(value);
    if (!base || base.length > MAX_LABEL) continue;
    out.add(base);
    const bare = stripCounter(base);
    if (bare && bare !== base) out.add(bare);
  }
  return [...out];
}

export interface LabelIndex {
  readonly byLabel: ReadonlyMap<string, readonly GlossaryEntry[]>;
  readonly size: number;
}

/** يفهرس مداخل «عنصر واجهة» بتسمياتها الموحدة. المصطلحات المجردة (بلا توقيع) لا تُربط بعنصر أبدًا. */
export function buildIndex(entries: readonly GlossaryEntry[]): LabelIndex {
  const byLabel = new Map<string, GlossaryEntry[]>();
  for (const entry of entries) {
    if (entry.kind !== 'element' || !entry.signature) continue;
    for (const label of entry.signature.labels) {
      const key = normalizeLabel(label);
      const list = byLabel.get(key);
      if (list) {
        if (!list.includes(entry)) list.push(entry);
      } else byLabel.set(key, [entry]);
    }
  }
  return { byLabel, size: entries.length };
}

function hrefTests(el: Element, entry: GlossaryEntry, pageHref: string): boolean | null {
  const patterns = entry.signature?.hrefPatterns;
  const raw = el.getAttribute('href');
  if (!patterns?.length || raw === null) return null;
  let target: URL;
  try {
    target = new URL(raw, pageHref);
  } catch {
    return false;
  }
  if (target.origin !== new URL(pageHref).origin) return false;
  const path = `${target.pathname}${target.search}`;
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, 'i').test(path);
    } catch {
      return false;
    }
  });
}

const isHidden = (el: Element): boolean => el.closest('[hidden], [aria-hidden="true"], mijhar-host') !== null;

/** يبحث عن العناصر المطابقة تحت root. دالة نقية على DOM: لا تعدّله. */
export function findMatches(root: ParentNode, index: LabelIndex, ctx: MatchContext): MatchResult {
  const matches: Match[] = [];
  const skipped: Skipped[] = [];
  for (const el of root.querySelectorAll(CANDIDATES)) {
    const role = roleOf(el);
    if (!role) continue;
    const names = namesOf(el, role);
    if (!names.length) continue;
    const named = new Map<GlossaryEntry, string>();
    for (const name of names) for (const entry of index.byLabel.get(name) ?? []) if (!named.has(entry)) named.set(entry, name);
    if (!named.size) continue;

    const accepted: Array<{ entry: GlossaryEntry; score: number; label: string }> = [];
    const reasons = new Map<SkipReason, string[]>();
    const reject = (reason: SkipReason, entry: GlossaryEntry): void => void reasons.set(reason, [...(reasons.get(reason) ?? []), entry.id]);
    for (const [entry, label] of named) {
      const sig = entry.signature;
      if (!sig) continue;
      if (!(sig.roles as readonly string[]).includes(role)) {
        reject('role', entry);
        continue;
      }
      const pageSpecific = !sig.pages.includes('any');
      if (pageSpecific && !sig.pages.some((kind) => ctx.kinds.includes(kind))) {
        reject('page', entry);
        continue;
      }
      const href = hrefTests(el, entry, ctx.href);
      if (href === false) {
        reject('href', entry);
        continue;
      }
      accepted.push({ entry, label, score: 1 + (pageSpecific ? 1 : 0) + (href === true ? 1 : 0) });
    }

    if (!accepted.length) {
      const [reason, entries] = [...reasons].sort((a, b) => ['role', 'page', 'href'].indexOf(a[0]) - ['role', 'page', 'href'].indexOf(b[0]))[0] ?? [];
      if (reason && entries) skipped.push({ element: el, reason, entries });
      continue;
    }
    const best = Math.max(...accepted.map((a) => a.score));
    const top = accepted.filter((a) => a.score === best);
    if (top.length !== 1) {
      skipped.push({ element: el, reason: 'ambiguous', entries: top.map((a) => a.entry.id) });
      continue;
    }
    const [only] = top as [(typeof top)[number]];
    if (isHidden(el)) {
      skipped.push({ element: el, reason: 'hidden', entries: [only.entry.id] });
      continue;
    }
    matches.push({ element: el, entry: only.entry, score: only.score, label: only.label });
  }
  return { matches, skipped };
}

// قراءة صفحة مقارنة (بين فرعين أو التزامين أو وسمين) وبناء الإحصاء المصنَّف (T-5.4). الأرقام التي تعرضها الصفحة نفسها
// (عدد الملفات والأسطر المضافة والمحذوفة) هي المرجع؛ وإحصاء الملفات المقروءة يُقارَن بها صراحةً (AC-D6) فإن نقصت الملفات
// المحمّلة عن المعلن في الصفحة أُعلن ذلك ولم تُقدَّم أرقام جزئية على أنها كاملة.
// مصدر بنية الملفات: تخطيط React لعرض الفروقات كما في صفحة التزام حقيقية محفوظة (fixtures/spikes/gh-commit-bms-1.html): منطقة
// لكل ملف [role=region][aria-labelledby^=heading-] عنوانها h3 يضم المسار، و«Lines changed: N additions & M deletions» لكل ملف
// وللمجموع. وللتخطيط القديم بدائل (.file-header[data-path] و«Showing N changed files with…»). لم تُحفظ صفحة مقارنة حيّة (أُعلن في التقرير).
import type { SelectorEntry, SelectorsRegistry } from '../../../core';
import { have, missing, parseCount, squash } from '../pr-status/value';
import type { Value } from '../pr-status/value';
import { FILE_KINDS, classifyFile, cleanPath } from './file-kinds';
import type { FileKind } from './file-kinds';

export const COMPARE_SELECTORS: readonly SelectorEntry[] = [
  {
    key: 'd.compare.file',
    description: 'منطقة ملف واحد في عرض الفروقات',
    candidates: ['[role="region"][aria-labelledby^="heading-"]', '.file-header[data-path]', '[data-tagsearch-path]'],
  },
  {
    key: 'd.compare.anchor',
    description: 'حاوية الفروقات؛ يُدرج الملخص قبلها',
    candidates: ['#diff-comparison-viewer-container', '#files_bucket', '#files', '[data-testid="diff-view"]'],
  },
  {
    key: 'd.compare.ref-tag-icon',
    description: 'أيقونة وسم في ترويسة المقارنة (دليل على أن أحد الطرفين وسم)',
    candidates: ['.octicon-tag'],
  },
];

export type CompareKind = 'branches' | 'commits' | 'tags' | 'unknown';

export const COMPARE_KIND_LABELS: Readonly<Record<CompareKind, string>> = {
  branches: 'بين فرعين',
  commits: 'بين التزامين',
  tags: 'بين إصدارين (وسمين)',
  unknown: 'مقارنة',
};

export interface CompareFile {
  readonly path: string;
  readonly kind: FileKind;
  /** null حين لا تعرض الصفحة سطور هذا الملف (فروق كبيرة لم تُحمَّل). */
  readonly additions: number | null;
  readonly deletions: number | null;
}

export interface KindTotals {
  readonly files: number;
  readonly additions: number;
  readonly deletions: number;
}

export type Agreement = 'match' | 'mismatch' | 'unknown';

export interface Reconciliation {
  readonly files: Agreement;
  readonly additions: Agreement;
  readonly deletions: Agreement;
  /** هل قُرئت كل ملفات المقارنة بأسطرها (فتنطبق أرقام الصفحة على إحصاء الملخص). */
  readonly complete: boolean;
}

export interface CompareSummary {
  readonly kind: CompareKind;
  readonly base: Value<string>;
  readonly head: Value<string>;
  /** الأرقام كما تعرضها الصفحة. */
  readonly page: { readonly files: Value<number>; readonly additions: Value<number>; readonly deletions: Value<number> };
  readonly files: readonly CompareFile[];
  /** إحصاء الملفات المقروءة. */
  readonly read: KindTotals;
  readonly byKind: Readonly<Record<FileKind, KindTotals>>;
  readonly reconciliation: Reconciliation;
}

// ---- الطرفان ونوع المقارنة ----

/** يفصل «base...head» (أو «base..head») من مسار /compare/. المسار المشفَّر يُفك، ولا يُخمَّن شيء حين لا يطابق. */
export function parseCompareRefs(href: string): { base: string; head: string } | null {
  let pathname: string;
  try {
    pathname = new URL(href).pathname;
  } catch {
    return null;
  }
  const match = /^\/[^/]+\/[^/]+\/compare\/(.+)$/.exec(pathname);
  if (!match) return null;
  const spec = match[1] as string;
  const cut = spec.indexOf('...') >= 0 ? spec.indexOf('...') : spec.indexOf('..');
  if (cut <= 0) return null;
  const width = spec.startsWith('...', cut) ? 3 : 2;
  const decode = (part: string): string => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  };
  const base = decode(spec.slice(0, cut));
  const head = decode(spec.slice(cut + width));
  return base && head ? { base, head } : null;
}

const SHA = /^[0-9a-f]{7,40}$/i;
const VERSION_TAG = /^v?\d+(\.\d+){0,3}([-+.][\w.]+)?$/;

/** نوع المقارنة: التزامان إن كان الطرفان sha، ووسمان إن بدا الطرفان إصدارين أو ظهرت أيقونة وسم، وإلا فرعان. */
export function inferCompareKind(refs: { base: string; head: string } | null, tagIcons: number): CompareKind {
  if (!refs) return 'unknown';
  const strip = (ref: string): string => ref.replace(/^[^:]+:/, '');
  const a = strip(refs.base);
  const b = strip(refs.head);
  if (SHA.test(a) && SHA.test(b)) return 'commits';
  if ((VERSION_TAG.test(a) && VERSION_TAG.test(b)) || tagIcons >= 2) return 'tags';
  return 'branches';
}

// ---- الأرقام المعروضة ----

const LINES = /Lines changed:\s*([\d,]+)\s+additions?\s*&\s*([\d,]+)\s+deletions?/i;
const FILES_CHANGED = /^([\d,]+)\s*files?\s*changed\b/i;
const SHOWING = /Showing\s+([\d,]+)\s+changed files?\s+with\s+([\d,]+)\s+additions?\s+and\s+([\d,]+)\s+deletions?/i;

function linesOf(el: Element): { additions: number; deletions: number } | null {
  const m = LINES.exec(squash(el.textContent));
  if (!m) return null;
  const additions = parseCount(m[1]);
  const deletions = parseCount(m[2]);
  return additions === null || deletions === null ? null : { additions, deletions };
}

function pagePageTotals(doc: Document, fileEls: ReadonlySet<Element>): CompareSummary['page'] {
  let files: Value<number> = missing('لا تعرض الصفحة عدد الملفات المتغيرة');
  let additions: Value<number> = missing('لا تعرض الصفحة مجموع الأسطر المضافة');
  let deletions: Value<number> = missing('لا تعرض الصفحة مجموع الأسطر المحذوفة');

  const insideFile = (el: Element): boolean => {
    for (let node: Element | null = el; node; node = node.parentElement) if (fileEls.has(node)) return true;
    return false;
  };
  for (const el of doc.querySelectorAll('.sr-only, [class*="sr-only"]')) {
    if (insideFile(el)) continue;
    const lines = linesOf(el);
    if (lines) {
      additions = have(lines.additions);
      deletions = have(lines.deletions);
      break;
    }
  }
  for (const el of doc.querySelectorAll('p, span, strong, h2, h3, div')) {
    if (el.children.length > 4) continue;
    const t = squash(el.textContent);
    if (t.length > 60) continue;
    const m = FILES_CHANGED.exec(t);
    const n = m ? parseCount(m[1]) : null;
    if (n !== null) {
      files = have(n);
      break;
    }
  }
  // التخطيط القديم: «Showing N changed files with X additions and Y deletions».
  if (!files.available || !additions.available) {
    const m = SHOWING.exec(squash(doc.body.textContent).slice(0, 20000));
    if (m) {
      const [n, a, d] = [parseCount(m[1]), parseCount(m[2]), parseCount(m[3])];
      if (n !== null && !files.available) files = have(n);
      if (a !== null && d !== null && !additions.available) {
        additions = have(a);
        deletions = have(d);
      }
    }
  }
  return { files, additions, deletions };
}

// ---- الملفات ----

function pathOf(region: Element, doc: Document): string | null {
  const dataPath = region.getAttribute('data-path') ?? region.getAttribute('data-tagsearch-path');
  if (dataPath) return cleanPath(dataPath);
  const labelled = region.getAttribute('aria-labelledby');
  const heading = labelled ? doc.getElementById(labelled) : null;
  const code = heading?.querySelector('code') ?? heading;
  const path = cleanPath(code?.textContent ?? '');
  return path || null;
}

function fileLines(region: Element): { additions: number; deletions: number } | null {
  for (const el of region.querySelectorAll('.sr-only, [class*="sr-only"]')) {
    const lines = linesOf(el);
    if (lines) return lines;
  }
  // التخطيط القديم: aria-label على .diffstat مثل «5 changes: 3 additions & 2 deletions».
  const label = region.querySelector('.diffstat')?.getAttribute('aria-label') ?? '';
  const m = /([\d,]+)\s+additions?\s*&\s*([\d,]+)\s+deletions?/i.exec(label);
  const a = m ? parseCount(m[1]) : null;
  const d = m ? parseCount(m[2]) : null;
  return a !== null && d !== null ? { additions: a, deletions: d } : null;
}

export function readCompareFiles(doc: Document, selectors: SelectorsRegistry): { files: CompareFile[]; regions: Set<Element> } {
  const regions = selectors.resolveAll(doc, 'd.compare.file');
  const files: CompareFile[] = [];
  const seen = new Set<string>();
  for (const region of regions) {
    const path = pathOf(region, doc);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const lines = fileLines(region);
    files.push({ path, kind: classifyFile(path), additions: lines?.additions ?? null, deletions: lines?.deletions ?? null });
  }
  return { files, regions: new Set(regions) };
}

function emptyTotals(): Record<FileKind, KindTotals> {
  return Object.fromEntries(FILE_KINDS.map((k) => [k, { files: 0, additions: 0, deletions: 0 }])) as Record<FileKind, KindTotals>;
}

export function tally(files: readonly CompareFile[]): { read: KindTotals; byKind: Record<FileKind, KindTotals>; linesKnown: boolean } {
  const byKind = emptyTotals();
  let linesKnown = true;
  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    const t = byKind[file.kind];
    if (file.additions === null || file.deletions === null) linesKnown = false;
    byKind[file.kind] = { files: t.files + 1, additions: t.additions + (file.additions ?? 0), deletions: t.deletions + (file.deletions ?? 0) };
    additions += file.additions ?? 0;
    deletions += file.deletions ?? 0;
  }
  return { read: { files: files.length, additions, deletions }, byKind, linesKnown };
}

const agree = (page: Value<number>, ours: number, usable: boolean): Agreement => {
  if (!page.available || !usable) return 'unknown';
  return page.value === ours ? 'match' : 'mismatch';
};

export function readCompare(doc: Document, selectors: SelectorsRegistry, href: string): CompareSummary {
  const { files, regions } = readCompareFiles(doc, selectors);
  const page = pagePageTotals(doc, regions);
  const { read, byKind, linesKnown } = tally(files);
  const refs = parseCompareRefs(href);
  const tagIcons = selectors.resolveAll(doc, 'd.compare.ref-tag-icon').length;
  const filesAgree = agree(page.files, read.files, files.length > 0 || (page.files.available && page.files.value === 0));
  const complete = filesAgree === 'match' && linesKnown;
  return {
    kind: inferCompareKind(refs, tagIcons),
    base: refs ? have(refs.base) : missing('لم يُقرأ الطرفان من مسار المقارنة'),
    head: refs ? have(refs.head) : missing('لم يُقرأ الطرفان من مسار المقارنة'),
    page,
    files,
    read,
    byKind,
    reconciliation: {
      files: filesAgree,
      additions: agree(page.additions, read.additions, complete),
      deletions: agree(page.deletions, read.deletions, complete),
      complete,
    },
  };
}

// مواضع الصفحة التي تحتاجها الوحدة (ز): أين تُدرج البطاقة، وأين عنصر رقم السطر. المحددات في SelectorsRegistry (BLK-DOM-SELECTOR)،
// وما يحتاج قيمة (رقم السطر أو مسار الملف) يحمل {n} و{path} فتُستبدل هنا قبل الاستعلام. المقيس على صفحات حية: سمة data-line-number
// وعناصر #LC<n> في صفحة الملف، وسمات data-tagsearch-path وdata-anchor في صفحات الفروق (evidence/T-0.4/report.md ‏AC-S4.1).
import type { SelectorEntry, SelectorsRegistry } from '../../../core/detector';
import type { LineTarget } from './types';

export const SELECTOR_CARD_PARENT = 'g.notes.card-parent';
export const SELECTOR_BLOB_LINE = 'g.notes.blob-line';
export const SELECTOR_DIFF_FILE = 'g.notes.diff-file';
export const SELECTOR_DIFF_LINE = 'g.notes.diff-line';

export const NOTES_SELECTORS: readonly SelectorEntry[] = [
  {
    key: SELECTOR_CARD_PARENT,
    description: 'الحاوية التي تُدرج في أولها بطاقة الملاحظات (تحت ترويسة المستودع)',
    candidates: ['#repo-content-pjax-container', '#repo-content-turbo-frame', 'main', '[role="main"]'],
  },
  {
    key: SELECTOR_BLOB_LINE,
    description: 'عنصر رقم السطر {n} في صفحة عرض ملف',
    candidates: ['[data-line-number="{n}"]', 'td.blob-num[data-line-number="{n}"]', '#L{n}'],
  },
  {
    key: SELECTOR_DIFF_FILE,
    description: 'حاوية ملف في صفحة فروق بمساره {path}',
    candidates: ['[data-tagsearch-path="{path}"]', '[data-file-path="{path}"]', '[data-path="{path}"]'],
  },
  {
    key: SELECTOR_DIFF_LINE,
    description: 'عنصر رقم السطر {n} داخل حاوية ملف فروق',
    candidates: ['[data-line-number="{n}"]', 'td[data-line-number="{n}"]'],
  },
];

const escapeAttribute = (value: string): string => value.replace(/["\\]/g, '\\$&');

function resolveTemplate(root: ParentNode, selectors: SelectorsRegistry, key: string, values: Record<string, string>): Element | null {
  for (const template of selectors.entry(key).candidates) {
    const selector = template.replace(/\{(\w+)\}/g, (_, name: string) => escapeAttribute(values[name] ?? ''));
    try {
      const found = root.querySelector(selector);
      if (found) return found;
    } catch {
      // محدد معطوب في الجدول: يُعامل كغياب.
    }
  }
  return null;
}

/** حاوية البطاقة: أول مطابق، وإلا null (يقرر المستدعي البديل). */
export function cardParent(doc: Document, selectors: SelectorsRegistry): Element | null {
  return selectors.resolve(doc, SELECTOR_CARD_PARENT)?.element ?? null;
}

/** عنصر رقم السطر الأول في نطاق الملاحظة، أو null إن لم يكن ظاهرًا (عرض Markdown أو سطر خارج النافذة الافتراضية). */
export function lineElementFor(doc: Document, selectors: SelectorsRegistry, target: LineTarget): Element | null {
  const n = String(target.start);
  if (target.view === 'blob') return resolveTemplate(doc, selectors, SELECTOR_BLOB_LINE, { n });
  const file = resolveTemplate(doc, selectors, SELECTOR_DIFF_FILE, { path: target.path });
  if (!file) return null;
  const anchor = file.getAttribute('data-anchor') ?? file.closest('[data-anchor]')?.getAttribute('data-anchor');
  const byId = anchor ? doc.getElementById(`${anchor}${target.side}${n}`) : null;
  return byId ?? resolveTemplate(file, selectors, SELECTOR_DIFF_LINE, { n });
}

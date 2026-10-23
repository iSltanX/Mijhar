// قراءة صفحة المستودع لكاشف README العربي: صفوف شجرة الجذر وروابط README الأساسي وإعلان الاقتطاع.
// المحددات في SelectorsRegistry (BLK-DOM-SELECTOR) ومقيسة على صفحة مستودع حية محفوظة (fixtures/spikes/gh-repo-arabic-stop-words.html):
// table[aria-labelledby="folders-and-files"] ‏tr.react-directory-row ‏a.Link--primary، وarticle.markdown-body. الاقتطاع من
// بيانات الصفحة المضمّنة (items < totalCount) أو عبارة الصفحة «we had to truncate» (evidence/T-0.4: 1000 عنصر من 5108).
import type { SelectorEntry, SelectorsRegistry } from '../../../core/detector';
import type { PageLink, ReadmeScan, TreeEntry } from './detect';

export const README_SELECTORS: readonly SelectorEntry[] = [
  {
    key: 'h.readme.tree-links',
    description: 'روابط الملفات والمجلدات في جدول شجرة الجذر',
    candidates: [
      'table[aria-labelledby="folders-and-files"] tr.react-directory-row a.Link--primary[href]',
      'table[aria-labelledby="folders-and-files"] tbody a[href]',
      '.react-directory-row a[href]',
      '[role="grid"] [role="rowheader"] a[href]',
      '.js-navigation-container a.js-navigation-open[href]',
    ],
  },
  {
    key: 'h.readme.container',
    description: 'حاوية README الأساسي المعروض في الصفحة',
    candidates: ['#readme', '[data-testid="readme"]', 'article.markdown-body'],
  },
];

const text = (el: Element): string => (el.getAttribute('title') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();

function embeddedTree(doc: Document): { shown: number; total: number } | null {
  for (const script of doc.querySelectorAll('script[data-target="react-app.embeddedData"]')) {
    try {
      const payload = (JSON.parse(script.textContent ?? '') as { payload?: Record<string, { tree?: { items?: unknown[]; totalCount?: unknown } } | undefined> }).payload;
      const tree = payload?.codeViewRepoRoute?.tree ?? payload?.codeViewTreeRoute?.tree;
      if (tree && Array.isArray(tree.items) && typeof tree.totalCount === 'number') return { shown: tree.items.length, total: tree.totalCount };
    } catch {
      // بيانات غير مقروءة: يبقى الاعتماد على عبارة الصفحة.
    }
  }
  return null;
}

const TRUNCATE_PHRASE = /we had to truncate this directory to ([\d,]+) files?\.?\s*([\d,]+) entries were omitted/i;

export function extractReadmeScan(doc: Document, selectors: SelectorsRegistry): ReadmeScan {
  const links = selectors.resolveAll<HTMLAnchorElement>(doc, 'h.readme.tree-links');
  const seen = new Set<string>();
  const entries: TreeEntry[] = [];
  for (const a of links) {
    const href = a.href || a.getAttribute('href') || '';
    if (!href || seen.has(href)) continue;
    const kind = /\/blob\//.test(href) ? 'file' : /\/tree\//.test(href) ? 'dir' : null;
    if (!kind) continue;
    seen.add(href);
    entries.push({ name: text(a), href, kind });
  }

  const readme = selectors.resolve(doc, 'h.readme.container')?.element ?? null;
  const readmeLinks: PageLink[] = [];
  if (readme) {
    for (const a of readme.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const raw = a.getAttribute('href') ?? '';
      if (!raw || raw.startsWith('#')) continue;
      readmeLinks.push({ text: text(a), href: a.href || raw });
    }
  }

  let truncation: ReadmeScan['truncation'] = null;
  const embedded = embeddedTree(doc);
  if (embedded && embedded.shown < embedded.total) truncation = { shown: embedded.shown, total: embedded.total };
  else {
    const phrase = TRUNCATE_PHRASE.exec(doc.body?.textContent?.replace(/\s+/g, ' ') ?? '');
    if (phrase) {
      const shown = Number((phrase[1] as string).replace(/,/g, ''));
      truncation = { shown, total: shown + Number((phrase[2] as string).replace(/,/g, '')) };
    } else if (/we had to truncate/i.test(doc.body?.textContent ?? '')) truncation = { shown: entries.length, total: null };
  }
  return { entries, treeFound: entries.length > 0, links: readmeLinks, readmeFound: readme !== null, truncation };
}

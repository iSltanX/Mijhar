// أدوات اختبار بطاقة الشرح: تحميل عينة في المستند العام (jsdom)، وقاموس اختبار صغير، ومواضع ثابتة لعناصر لا يحسب jsdom تخطيطها.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GlossaryEntry, PageKind, SignatureRole } from '../../../../src/data/glossary/types';
import type { Rect } from '../../../../src/modules/b/card';

// لا tests/setup/paths: في بيئة jsdom يكون URL العام من jsdom فلا يقبله fileURLToPath.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
export const SAMPLE = path.join(ROOT, 'tests/modules/b/card/fixtures/fixture-github-ui-sample.html');

export function loadHtml(file: string): void {
  const html = fs.readFileSync(file, 'utf8');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.replaceChild(document.importNode(parsed.documentElement, true), document.documentElement);
}

/** مدخل اختبار بتوقيع دلالي؛ الحقول الباقية كاملة المخطط. */
export function testEntry(id: string, label: string | string[], roles: SignatureRole[], pages: PageKind[], extra: Partial<GlossaryEntry> & { hrefPatterns?: string[] } = {}): GlossaryEntry {
  const { hrefPatterns, ...rest } = extra;
  return {
    id,
    kind: 'element',
    ar: `مدخل ${id}`,
    en: `Entry ${id}`,
    category: 'repo',
    brief: `ملخص أثر ${id} بجملة كافية الطول.`,
    medium: `شرح متوسط للمدخل ${id} (Entry ${id}) بجملة تتجاوز الحد الأدنى للطول المعتمد.`,
    detailed: `شرح مفصّل للمدخل ${id} (Entry ${id}) بجمل أطول تتجاوز الحد الأدنى للطول المعتمد في مخطط البيانات كله.`,
    safety: 'آمن',
    reversible: 'نعم',
    permission: 'Read',
    whenToUse: `متى يُستخدم ${id} في مثال اختباري.`,
    reversalLimits: `حدود التراجع للمدخل ${id} في مثال اختباري.`,
    docsUrl: 'https://docs.github.com/en/get-started',
    verification: { status: 'verified', checkedOn: '2026-10-23', note: 'مدخل اختبار' },
    signature: { labels: Array.isArray(label) ? label : [label], roles, pages, ...(hrefPatterns ? { hrefPatterns } : {}) },
    ...rest,
  };
}

/** مواضع ثابتة مرئية لكل عنصر بترتيب المستند (jsdom لا يحسب التخطيط). */
export function stubRects(): (element: Element) => Rect {
  const order = new Map<Element, number>();
  return (element) => {
    if (!order.has(element)) order.set(element, order.size);
    const i = order.get(element) as number;
    return { left: 10 + (i % 8) * 120, top: 20 + Math.floor(i / 8) * 40, width: 100, height: 24 };
  };
}

export const flush = (ms = 0): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const hostsOf = (id: string): HTMLElement[] => [...document.querySelectorAll<HTMLElement>(`mijhar-host[data-mijhar-host="${id}"]`)];

/** كل عنصر ← أبوه المباشر (بدون مضيفات مِجهَر). */
export function parentMap(): Map<Element, Node | null> {
  const map = new Map<Element, Node | null>();
  for (const el of document.querySelectorAll('*')) if (el.localName !== 'mijhar-host') map.set(el, el.parentNode);
  return map;
}

/** نص الصفحة بلا مضيفات مِجهَر. */
export function pageHtmlWithoutHosts(): string {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  for (const host of clone.querySelectorAll('mijhar-host')) host.remove();
  return clone.outerHTML;
}

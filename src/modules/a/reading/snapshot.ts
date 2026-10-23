// لقطة وضع القراءة (T-2.5، F-A5، DEC-02 أ-2): نسخة منظَّفة من حاويات Markdown في الصفحة تُرسل إلى العارض المعزول (صفحة الإضافة
// reader.html). قراءة فقط: لا يُكتب شيء على عقد GitHub. والنصوص كما هي حرفيًا بتشكيلها، ويُخفى التشكيل في العارض وحده.
// قائمة سماح للعناصر والسمات: ما ليس فيها يُفكّ (يبقى نصه) أو يُسقط مع محتواه (سكربت وأنماط وأزرار ورسوم). الروابط http(s)
// مطلقة فقط، والصور نص بديل لا تحميل: العارض لا يطلب شيئًا من الشبكة. حدّ للحجم يعلَن في اللقطة إن بُلغ.

export const SNAPSHOT_VERSION = 1;

/** عقدة اللقطة: نص، أو عنصر [وسم، سمات، أبناء]. */
export type SnapNode = string | SnapElement;
export interface SnapElement {
  readonly t: string;
  readonly a?: Readonly<Record<string, string>>;
  readonly c?: readonly SnapNode[];
}

export interface SnapSection {
  /** readme: محتوى ملف أو README؛ comment: جسم تعليق أو وصف. */
  readonly kind: 'readme' | 'comment';
  readonly nodes: readonly SnapNode[];
}

export interface ReadingSnapshot {
  readonly version: typeof SNAPSHOT_VERSION;
  readonly url: string;
  readonly title: string;
  readonly sections: readonly SnapSection[];
  /** بلغت اللقطة حدّ الحجم فقُطعت. */
  readonly truncated: boolean;
  readonly chars: number;
}

/** العناصر التي تُنقل بوسمها. */
export const SNAPSHOT_TAGS: ReadonlySet<string> = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'kbd', 'samp', 'var',
  'em', 'strong', 'b', 'i', 'u', 'del', 's', 'ins', 'mark', 'sup', 'sub', 'small', 'abbr', 'q', 'cite', 'br', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'a', 'details', 'summary', 'dl', 'dt', 'dd', 'div', 'figure', 'figcaption',
]);

/** تُسقط مع محتواها. */
const DROPPED: ReadonlySet<string> = new Set([
  'script', 'style', 'template', 'noscript', 'svg', 'math', 'button', 'textarea', 'select', 'option', 'iframe', 'object', 'embed',
  'video', 'audio', 'canvas', 'clipboard-copy', 'mijhar-host', 'link', 'meta', 'form', 'dialog', 'tool-tip',
]);

const ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  '*': ['dir', 'lang'],
  a: ['href', 'title'],
  ol: ['start', 'reversed'],
  th: ['align', 'colspan', 'rowspan'],
  td: ['align', 'colspan', 'rowspan'],
  abbr: ['title'],
  details: ['open'],
};

export const SNAPSHOT_LIMITS = { chars: 2_000_000, nodes: 60_000, depth: 64 } as const;

interface Budget {
  chars: number;
  nodes: number;
  truncated: boolean;
}

function safeHref(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function attributes(el: Element, tag: string, base: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const name of [...(ATTRIBUTES['*'] ?? []), ...(ATTRIBUTES[tag] ?? [])]) {
    const value = el.getAttribute(name);
    if (value === null) continue;
    if (name === 'href') {
      const href = safeHref(value, base);
      if (href) out.href = href;
    } else if (name === 'dir') {
      const dir = value.toLowerCase();
      if (dir === 'ltr' || dir === 'rtl' || dir === 'auto') out.dir = dir;
    } else if (name === 'start' || name === 'colspan' || name === 'rowspan') {
      if (/^\d{1,4}$/.test(value)) out[name] = value;
    } else if (name === 'align') {
      if (/^(left|right|center|justify)$/i.test(value)) out.align = value.toLowerCase();
    } else if (name === 'reversed' || name === 'open') out[name] = '';
    else out[name] = value.slice(0, 500);
  }
  return Object.keys(out).length ? out : undefined;
}

function children(parent: Node, base: string, budget: Budget, depth: number): SnapNode[] {
  const out: SnapNode[] = [];
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (budget.truncated) break;
    if (child.nodeType === 3) {
      const data = (child as Text).data;
      if (!data) continue;
      if (budget.chars + data.length > SNAPSHOT_LIMITS.chars) {
        budget.truncated = true;
        break;
      }
      budget.chars += data.length;
      // نصوص متجاورة (بعد فكّ عنصر) تُدمج كما يسلسلها المتصفح.
      const last = out[out.length - 1];
      if (typeof last === 'string') out[out.length - 1] = last + data;
      else out.push(data);
    } else if (child.nodeType === 1) out.push(...element(child as Element, base, budget, depth));
  }
  return out;
}

function element(el: Element, base: string, budget: Budget, depth: number): SnapNode[] {
  const tag = el.localName;
  if (DROPPED.has(tag)) return [];
  if (tag === 'a' && el.classList.contains('anchor')) return []; // مرساة العنوان (رمز رابط بلا نص)
  if (budget.nodes >= SNAPSHOT_LIMITS.nodes || depth >= SNAPSHOT_LIMITS.depth) {
    budget.truncated = true;
    return [];
  }
  budget.nodes += 1;
  if (tag === 'img') {
    const alt = (el.getAttribute('alt') ?? '').trim();
    return alt ? [{ t: 'span', a: { 'data-img': '' }, c: [alt] }] : [];
  }
  if (tag === 'input') {
    if (el.getAttribute('type') !== 'checkbox') return [];
    return [(el as HTMLInputElement).checked || el.hasAttribute('checked') ? '☑ ' : '☐ '];
  }
  const kids = children(el, base, budget, depth + 1);
  if (!SNAPSHOT_TAGS.has(tag)) return kids; // يُفكّ: span وrelative-time وعناصر التغليف وغيرها
  const attrs = attributes(el, tag, base);
  return [{ t: tag, ...(attrs ? { a: attrs } : {}), ...(kids.length ? { c: kids } : {}) }];
}

/** حاويات اللقطة: الحاويات العليا (لا حاوية داخل أخرى) بترتيب المستند، خارج واجهات الإضافة. */
export function snapshotContainers(doc: Document, containerSelector: string): Element[] {
  return [...doc.querySelectorAll(containerSelector)].filter((el) => !el.parentElement?.closest(containerSelector) && !el.closest('mijhar-host'));
}

export function takeSnapshot(doc: Document, containers: readonly Element[]): ReadingSnapshot {
  const base = doc.baseURI;
  const budget: Budget = { chars: 0, nodes: 0, truncated: false };
  const sections: SnapSection[] = [];
  for (const container of containers) {
    if (budget.truncated) break;
    const nodes = children(container, base, budget, 0);
    if (!nodes.length) continue;
    sections.push({ kind: container.localName === 'article' ? 'readme' : 'comment', nodes });
  }
  return { version: SNAPSHOT_VERSION, url: doc.location?.href ?? base, title: doc.title, sections, truncated: budget.truncated, chars: budget.chars };
}

/** فحص بنية لقطة وصلت عبر الرسائل قبل عرضها (العارض لا يثق بشكلها). */
export function isSnapshot(value: unknown): value is ReadingSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<ReadingSnapshot>;
  return v.version === SNAPSHOT_VERSION && typeof v.url === 'string' && typeof v.title === 'string' && Array.isArray(v.sections) && typeof v.truncated === 'boolean';
}

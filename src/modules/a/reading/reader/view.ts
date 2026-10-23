// العارض المعزول (T-2.5، DEC-02 أ-2): يرسم اللقطة في مستند صفحة الإضافة بعناصر قائمة السماح وحدها (createElement وtextContent،
// لا innerHTML)، ويطبّق عليها الاتجاه والعزل نفسيهما (T-2.1 وT-2.2)، ويُخفي التشكيل في عقده النصية هو، لا في GitHub.
// إخفاء التشكيل: لكل عقدة مصفوفة إزاحة strippedToOriginalOffsets (Uint32Array بطول النص المجرد + 1) تربط كل فهرس مجرد بموضعه في
// الأصل، فيُقتطع المدى المحدد من الأصل. النسخ (copy) والسحب (dragstart): يُستنسخ مدى التحديد وتُعاد إليه النصوص الأصلية، ويُكتب
// text/plain (بمحاذاة تسلسل المتصفح نفسه للتحديد: أسطر الكتل ومسافاتها) وtext/html. منقول من نموذج T-0.1 المقيس في الأربعة.
// العارض يملك DOM كله، فلا حارس ملكية: لا طرف آخر يكتب فيه.
import { MutationRecorder } from '../../../../core/lifecycle/mutation-registry';
import { SelectorsRegistry } from '../../../../core/detector/selectors';
import { DIRECTION_SELECTORS } from '../../direction/selectors';
import { DirectionProcessor } from '../../direction/processor';
import { IsolationProcessor } from '../../isolation/processor';
import { SNAPSHOT_TAGS } from '../snapshot';
import type { ReadingSnapshot, SnapNode } from '../snapshot';

/** الحركات كما في T-0.1: U+064B..U+065F وألف الخنجرية U+0670. */
export const DIACRITIC = /[ً-ٰٟ]/;
const DIACRITICS = /[ً-ٰٟ]/g;

export const stripDiacritics = (text: string): string => text.replace(DIACRITICS, '');

export interface Stripped {
  readonly stripped: string;
  /** offsets[i] موضع الحرف المجرد i في الأصل؛ offsets[stripped.length] = طول الأصل. */
  readonly offsets: Uint32Array;
}

export function stripWithOffsets(text: string): Stripped {
  const offsets = new Uint32Array(text.length + 1);
  let out = '';
  let n = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (DIACRITIC.test(ch)) continue;
    offsets[n] = i;
    n += 1;
    out += ch;
  }
  offsets[n] = text.length;
  return { stripped: out, offsets: offsets.slice(0, n + 1) };
}

/** مدى [start, end) من النص المجرد يقابله في الأصل، بحركات آخر حرف فيه. */
export function originalSlice(original: string, offsets: Uint32Array, start: number, end: number): string {
  const from = offsets[Math.min(start, offsets.length - 1)] ?? 0;
  const to = offsets[Math.min(end, offsets.length - 1)] ?? original.length;
  return original.slice(from, to);
}

/**
 * يعيد الحركات إلى نص التحديد كما سلسله المتصفح (shown: مجرد، بأسطر الكتل ومسافاتها) بمحاذاته مع تسلسل النصوص الأصلية (stream).
 * المسافات التي يضيفها المتصفح أو يطويها لا تقطع المحاذاة.
 */
export function realign(shown: string, stream: string): string {
  let out = '';
  let j = 0;
  for (const ch of shown) {
    if (!/\s/.test(ch)) while (j < stream.length && /\s/.test(stream[j] as string)) j += 1;
    if (j < stream.length && stream[j] === ch) {
      out += ch;
      j += 1;
      while (j < stream.length && DIACRITIC.test(stream[j] as string)) out += stream[j++];
    } else out += ch;
  }
  return out;
}

// ---------- الرسم ----------

const ALLOWED_ATTRS: ReadonlySet<string> = new Set(['dir', 'lang', 'href', 'title', 'start', 'reversed', 'align', 'colspan', 'rowspan', 'open', 'data-img']);

function renderNode(doc: Document, node: SnapNode, depth: number): Node | null {
  if (typeof node === 'string') return doc.createTextNode(node);
  if (!node || typeof node !== 'object' || depth > 80) return null;
  const tag = node.t === 'span' && node.a && 'data-img' in node.a ? 'span' : SNAPSHOT_TAGS.has(node.t) ? node.t : null;
  if (!tag) return null;
  const el = doc.createElement(tag);
  for (const [name, value] of Object.entries(node.a ?? {})) {
    if (!ALLOWED_ATTRS.has(name) || typeof value !== 'string') continue;
    if (name === 'href') {
      if (!/^https?:\/\//i.test(value)) continue;
      el.setAttribute('href', value);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer');
    } else el.setAttribute(name, value);
  }
  if (tag === 'span') el.className = 'img-alt';
  for (const child of node.c ?? []) {
    const rendered = renderNode(doc, child, depth + 1);
    if (rendered) el.append(rendered);
  }
  return el;
}

export const SECTION_LABELS = { readme: 'المحتوى', comment: 'تعليق' } as const;

/** يرسم اللقطة في root (يُفرغ أولًا)، ثم يطبّق الاتجاه والعزل على أقسامها. */
export function renderSnapshot(root: Element, snapshot: ReadingSnapshot): void {
  const doc = root.ownerDocument;
  root.replaceChildren();
  let comment = 0;
  for (const section of snapshot.sections) {
    const wrapper = doc.createElement('section');
    wrapper.className = 'reader-section';
    const label = doc.createElement('div');
    label.className = 'reader-section-label';
    label.textContent = section.kind === 'comment' ? `${SECTION_LABELS.comment} ${(comment += 1)}` : SECTION_LABELS.readme;
    const body = doc.createElement('div');
    body.className = 'markdown-body';
    for (const node of section.nodes) {
      const rendered = renderNode(doc, node, 0);
      if (rendered) body.append(rendered);
    }
    wrapper.append(label, body);
    root.append(wrapper);
  }
  const selectors = new SelectorsRegistry(DIRECTION_SELECTORS);
  const mutations = new MutationRecorder('a.reading.reader');
  new DirectionProcessor({ document: doc, selectors, mutations }).scan(root);
  new IsolationProcessor({ document: doc, selectors, mutations }).scan(root);
}

// ---------- إخفاء التشكيل والحافظة ----------

interface Entry {
  readonly original: string;
  readonly offsets: Uint32Array;
}

export interface ClipboardData {
  readonly plain: string;
  readonly html: string;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] as string);
}

export class DiacriticsView {
  private readonly entries = new Map<Text, Entry>();
  private isHidden = false;

  constructor(private readonly root: Element) {}

  get hidden(): boolean {
    return this.isHidden;
  }

  /** عدد العقد التي أُخفي تشكيلها. */
  get size(): number {
    return this.entries.size;
  }

  hide(): number {
    if (this.isHidden) return this.entries.size;
    const doc = this.root.ownerDocument;
    const walker = doc.createTreeWalker(this.root, doc.defaultView?.NodeFilter.SHOW_TEXT ?? 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      if (!DIACRITIC.test(text.data) || text.parentElement?.closest('pre, code, kbd, samp')) continue;
      const { stripped, offsets } = stripWithOffsets(text.data);
      this.entries.set(text, { original: text.data, offsets });
      text.data = stripped;
    }
    this.isHidden = true;
    return this.entries.size;
  }

  show(): void {
    for (const [text, entry] of this.entries) text.data = entry.original;
    this.entries.clear();
    this.isHidden = false;
  }

  /** نص العقدة الأصلي في المدى [start, end) من نصها المعروض. */
  private original(text: Text, start: number, end: number): string {
    const entry = this.entries.get(text);
    return entry ? originalSlice(entry.original, entry.offsets, start, end) : text.data.slice(start, end);
  }

  /** نصا الحافظة بالأصل المشكول لمدى، أو null إن لم يمس عقدة أُخفي تشكيلها. shown: تسلسل المتصفح للتحديد. */
  clipboard(range: Range, shown: string = range.toString()): ClipboardData | null {
    if (!this.isHidden || ![...this.entries.keys()].some((node) => range.intersectsNode(node))) return null;
    const doc = this.root.ownerDocument;
    const SHOW_TEXT = doc.defaultView?.NodeFilter.SHOW_TEXT ?? 4;
    const common = range.commonAncestorContainer;
    const scope = common.nodeType === 3 ? (common.parentNode as Node) : common;
    const originals: string[] = [];
    const walker = doc.createTreeWalker(scope, SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!range.intersectsNode(node)) continue;
      const text = node as Text;
      const start = text === range.startContainer ? range.startOffset : 0;
      const end = text === range.endContainer ? range.endOffset : text.data.length;
      if (end <= start) continue;
      originals.push(this.original(text, start, end));
    }
    const fragment = range.cloneContents();
    const cloned: Text[] = [];
    const fw = doc.createTreeWalker(fragment, SHOW_TEXT);
    for (let node = fw.nextNode(); node; node = fw.nextNode()) if ((node as Text).data.length) cloned.push(node as Text);
    const plain = realign(shown, originals.join(''));
    let html: string;
    if (cloned.length === originals.length) {
      cloned.forEach((node, i) => {
        node.data = originals[i] as string;
      });
      const box = doc.createElement('div');
      box.append(fragment);
      html = box.innerHTML;
    } else html = `<span>${escapeHtml(plain)}</span>`;
    return { plain, html };
  }
}

/** يربط النسخ والسحب في مستند العارض: يكتب الأصل المشكول حين يكون التشكيل مخفيًا ويمس التحديد عقدة أُخفي تشكيلها. */
export function bindClipboard(doc: Document, view: DiacriticsView | (() => DiacriticsView | null), counters: { copy: number; drag: number } = { copy: 0, drag: 0 }): () => void {
  const current = typeof view === 'function' ? view : () => view;
  const data = (): ClipboardData | null => {
    const selection = doc.getSelection();
    const active = current();
    if (!active || !selection?.rangeCount || selection.isCollapsed) return null;
    return active.clipboard(selection.getRangeAt(0), selection.toString());
  };
  const onCopy = (event: Event): void => {
    const clip = (event as ClipboardEvent).clipboardData;
    const built = clip ? data() : null;
    if (!clip || !built) return;
    clip.setData('text/plain', built.plain);
    clip.setData('text/html', built.html);
    event.preventDefault();
    counters.copy += 1;
  };
  const onDrag = (event: Event): void => {
    const transfer = (event as DragEvent).dataTransfer;
    const built = transfer ? data() : null;
    if (!transfer || !built) return;
    transfer.setData('text/plain', built.plain);
    transfer.setData('text/html', built.html);
    counters.drag += 1;
  };
  doc.addEventListener('copy', onCopy, true);
  doc.addEventListener('dragstart', onDrag, true);
  return () => {
    doc.removeEventListener('copy', onCopy, true);
    doc.removeEventListener('dragstart', onDrag, true);
  };
}

/** سلوك بحث المتصفح في نص العارض كما قيس في T-0.1 (AC-S1.3، 05E) ويُعاد قياسه على العارض في TEST-RTL-05E. */
export const SEARCH_HINTS: Record<'chromium' | 'firefox', string> = {
  chromium:
    'البحث في الصفحة (Ctrl/⌘+F) في Chrome وEdge وBrave لا يفرّق بين المشكول وغيره: «كتب» تجد «كَتَبَ» والعكس، والتشكيل مخفي أو ظاهر. والبحث يجري في نص العارض هذا لا في صفحة GitHub.',
  firefox:
    'البحث في الصفحة في Firefox يتجاهل التشكيل افتراضًا فيجد الكلمة بتشكيلها وبدونه. وإن فعّلت «Match Diacritics» في شريط البحث والتشكيل مخفي فلن تجد الكلمة المشكولة؛ أظهر التشكيل أولًا. والبحث يجري في نص العارض هذا لا في صفحة GitHub.',
};

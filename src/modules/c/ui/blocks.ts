// من DOM إلى فقرات قابلة للترجمة (F-C1/F-C2): كل فقرة (p وli وh1–h6 وtd وth…) تُحوَّل إلى مقاطع للتقنيع (maskSegments): النص يُكتشف فيه المحمي،
// والعناصر المحمية (code وkbd وsamp والروابط والإشارات وما عُلِّم notranslate…) تُقنَّع حرفيًا. ما يُستثنى من دخول المترجم كليًا: pre وdiv.highlight
// وsvg وmath، وكل ما عُلِّم notranslate أو translate="no" على مستوى الكتلة. دوال على DOM لا تعدّله.
import { maskSegments } from '../masking';
import type { ExpectedTokens, MaskSegment, TokenType } from '../masking';

/** ما تُحسب «فقرة»؛ المتداخل منها (li داخل ul، p داخل li) فقرات مستقلة، ولكل فقرة محتواها المباشر وحده. */
export const BLOCK_SELECTOR = 'p, li, h1, h2, h3, h4, h5, h6, td, th, dt, dd, figcaption, summary, blockquote';
/** عناصر تمنع الفقرة كلها من الترجمة. */
export const EXCLUDED_SELECTOR = 'pre, .highlight, svg, math, script, style, template, mijhar-host, [data-mijhar-injected], [translate="no"], .notranslate, textarea, [contenteditable], details-menu, .octicon';
/** عناصر كتلية: لا تُقرأ ضمن نص الفقرة الحاوية، فهي فقرات مستقلة أو مستثناة. */
export const BLOCKISH = 'p, ul, ol, li, blockquote, pre, table, thead, tbody, tr, td, th, div, details, summary, h1, h2, h3, h4, h5, h6, hr, dl, dt, dd, section, article, figure, figcaption, form, center';
const CODE_INLINE = 'code, kbd, samp, tt';
const MEDIA = 'img, svg, picture, video, audio, canvas, iframe, input, button, select, textarea, object, embed';
const OPAQUE_INLINE = 'relative-time, time, g-emoji, .emoji, .notranslate, [translate="no"]';

export type ProtectedKind = 'code' | 'link' | 'plain';

/** عنصر محمي حدّده المحوِّل (يقابل مقطعًا صريحًا في maskSegments)، ليُعاد رسمه كما كان لا نصًا مجردًا. */
export interface ProtectedNode {
  readonly type: TokenType;
  readonly value: string;
  readonly kind: ProtectedKind;
  /** code وkbd وsamp وtt للعناصر الشيفرية. */
  readonly tag?: string;
  /** للروابط: العنوان المطلق. */
  readonly href?: string;
  readonly target?: string;
}

export interface TranslatableBlock {
  readonly element: Element;
  readonly segments: readonly MaskSegment[];
  /** العناصر المحمية الصريحة بترتيب ظهورها في segments. */
  readonly nodes: readonly ProtectedNode[];
  /** فيها وسائط (صورة وشارة ومربع مهمة) لا تُعرض في الترجمة. */
  readonly hasMedia: boolean;
  /** نص الفقرة بلا العناصر المحمية. */
  readonly plain: string;
}

export type SkipReason = 'excluded' | 'empty' | 'no-latin' | 'already-arabic';

const WS = /[ \t\r\n\f]+/g;
const LATIN = /[A-Za-z]/g;
const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/g;
const normalizeSpace = (text: string): string => text.replace(WS, ' ');

function classifyLink(a: Element, text: string): TokenType {
  const href = a.getAttribute('href') ?? '';
  if (a.matches('.user-mention, [data-hovercard-type="user"], [data-hovercard-type="organization"]') || /^@[\w-]+(\/[\w.-]+)?$/.test(text)) return 'USER';
  if (a.matches('.issue-link, .js-issue-link, [data-hovercard-type="issue"], [data-hovercard-type="pull_request"]') || /^#\d+$/.test(text) || /^[\w.-]+\/[\w.-]+#\d+$/.test(text)) return 'REF';
  void href;
  return 'LINK';
}

interface Walk {
  segments: MaskSegment[];
  nodes: ProtectedNode[];
  media: boolean;
}

function pushText(walk: Walk, text: string): void {
  if (!text) return;
  const last = walk.segments.at(-1);
  if (typeof last === 'string') walk.segments[walk.segments.length - 1] = last + text;
  else walk.segments.push(text);
}

function pushProtected(walk: Walk, node: ProtectedNode): void {
  if (!node.value) return;
  walk.segments.push({ type: node.type, value: node.value });
  walk.nodes.push(node);
}

function walkInline(parent: ParentNode, walk: Walk, flatten = false): void {
  for (const child of parent.childNodes) {
    if (child.nodeType === 3) {
      pushText(walk, normalizeSpace(child.nodeValue ?? ''));
      continue;
    }
    if (child.nodeType !== 1) continue;
    const el = child as Element;
    if (el.matches('br')) pushText(walk, '\n');
    else if (flatten && el.matches('pre, .highlight')) {
      // كتلة شيفرة داخل التحديد: تُحمى كاملة.
      const separator = walk.segments.length ? '\n' : '';
      pushText(walk, separator);
      pushProtected(walk, { type: 'CODE', value: (el.textContent ?? '').replace(/\s+$/, ''), kind: 'code', tag: 'pre' });
      pushText(walk, '\n');
    } else if (flatten && el.matches(BLOCKISH)) {
      // التحديد يعبر فقرات: كل كتلة تُسطَّر منفصلة بدل أن تُسقط.
      const last = walk.segments.at(-1);
      if (walk.segments.length && !(typeof last === 'string' && last.endsWith('\n'))) pushText(walk, '\n');
      walkInline(el, walk, true);
      pushText(walk, '\n');
    } else if (el.matches(BLOCKISH)) continue;
    else if (el.matches(CODE_INLINE)) pushProtected(walk, { type: 'CODE', value: normalizeSpace(el.textContent ?? ''), kind: 'code', tag: el.localName });
    else if (el.matches('a')) {
      const text = normalizeSpace(el.textContent ?? '').trim();
      if (!text) {
        walk.media = true;
        continue;
      }
      const a = el as HTMLAnchorElement;
      const type = classifyLink(el, text);
      pushProtected(walk, { type, value: text, kind: 'link', href: a.href || el.getAttribute('href') || '', ...(el.getAttribute('target') ? { target: el.getAttribute('target') as string } : {}) });
    } else if (el.matches(OPAQUE_INLINE)) pushProtected(walk, { type: 'TERM', value: normalizeSpace(el.textContent ?? '').trim(), kind: 'plain' });
    else if (el.matches(MEDIA)) walk.media = true;
    else walkInline(el, walk, flatten);
  }
}

/** مقاطع محتوى عنصر (أو شظية) المباشر. تُقصّ مسافات الطرفين. */
export function inlineSegments(parent: ParentNode, flatten = false): { segments: MaskSegment[]; nodes: ProtectedNode[]; media: boolean } {
  const walk: Walk = { segments: [], nodes: [], media: false };
  walkInline(parent, walk, flatten);
  const first = walk.segments[0];
  if (typeof first === 'string') walk.segments[0] = first.replace(/^ +/, '');
  const last = walk.segments.at(-1);
  if (typeof last === 'string') walk.segments[walk.segments.length - 1] = last.replace(/[ \n]+$/, '');
  return { segments: walk.segments.filter((s) => typeof s !== 'string' || s !== ''), nodes: walk.nodes, media: walk.media };
}

function plainOf(segments: readonly MaskSegment[]): string {
  return segments.filter((s): s is string => typeof s === 'string').join('');
}

/** هل في النص ما يستحق الترجمة: ثلاثة أحرف لاتينية على الأقل، ولا يغلب عليه العربي (فلا تُترجم فقرة عربية إلى العربية). */
export function skipReasonFor(plain: string): SkipReason | null {
  const latin = plain.match(LATIN)?.length ?? 0;
  const arabic = plain.match(ARABIC)?.length ?? 0;
  if (!plain.trim()) return 'empty';
  if (latin < 3) return arabic > 0 ? 'already-arabic' : 'no-latin';
  if (arabic > latin) return 'already-arabic';
  return null;
}

/** فقرة واحدة من عنصر، أو سبب تخطيها. */
export function blockOf(element: Element): TranslatableBlock | SkipReason {
  if (element.closest(EXCLUDED_SELECTOR)) return 'excluded';
  const { segments, nodes, media } = inlineSegments(element);
  const plain = plainOf(segments);
  const reason = skipReasonFor(plain);
  if (reason) return reason;
  return { element, segments, nodes, hasMedia: media, plain };
}

export interface CollectResult {
  readonly blocks: readonly TranslatableBlock[];
  readonly skipped: Readonly<Record<SkipReason, number>>;
}

/** كل الفقرات القابلة للترجمة تحت root بترتيب المستند. */
export function collectBlocks(root: Element): CollectResult {
  const blocks: TranslatableBlock[] = [];
  const skipped: Record<SkipReason, number> = { excluded: 0, empty: 0, 'no-latin': 0, 'already-arabic': 0 };
  const candidates = [...root.querySelectorAll(BLOCK_SELECTOR)];
  // الجذر نفسه فقرة إن كان من الفقرات (نص ملصق مباشرة في .markdown-body بلا p).
  if (root.matches(BLOCK_SELECTOR)) candidates.unshift(root);
  for (const el of candidates) {
    const result = blockOf(el);
    if (typeof result === 'string') {
      if (result !== 'empty') skipped[result] += 1;
      continue;
    }
    blocks.push(result);
  }
  // نص ملصق مباشرة في الجذر (بلا فقرة) فقرة أيضًا إن وُجد.
  if (!root.matches(BLOCK_SELECTOR) && [...root.childNodes].some((n) => n.nodeType === 3 && (n.nodeValue ?? '').trim())) {
    const loose = blockOf(root);
    if (typeof loose !== 'string') blocks.unshift(loose);
  }
  return { blocks, skipped };
}

/**
 * يربط كل رمز مقنَّع بعنصره المحمي الأصلي. maskSegments حتمية، فالسجلات بترتيب الفهرس هي ترتيب ظهور المقاطع الصريحة، تتخللها رموز
 * اكتشفها المقنِّع في النصوص (مسارات وإشارات…) فلا عنصر أصليًا لها. المطابقة تقدمية بالترتيب على (النوع والقيمة)، فتبقى صحيحة لو تكرر النص نفسه
 * وروابطه مختلفة (كلمة «هنا» برابطين).
 */
export function tokenNodes(block: Pick<TranslatableBlock, 'segments' | 'nodes'>, expected: ExpectedTokens): Map<string, ProtectedNode> {
  const out = new Map<string, ProtectedNode>();
  const records = [...expected.values()].sort((a, b) => a.index - b.index);
  let at = 0;
  for (const node of block.nodes) {
    while (at < records.length && !(records[at]!.type === node.type && records[at]!.original === node.value)) at += 1;
    const record = records[at];
    if (!record) break;
    out.set(record.token, node);
    at += 1;
  }
  return out;
}

export const maskBlock = (block: Pick<TranslatableBlock, 'segments'>) => maskSegments(block.segments);

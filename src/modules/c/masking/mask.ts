// التقنيع قبل الترجمة: كل عنصر محمي يُستبدل برمز مفهرس ⟦TYPE_INDEX⟧ ويُسجَّل في expectedTokens.

import { detectProtected } from './detect';
import { DO_NOT_TRANSLATE_TERMS } from './do-not-translate';
import type { MaskOptions, MaskResult, MaskSegment, ProtectedTokenRecord, TokenType } from './types';

export const TOKEN_OPEN = '⟦';
export const TOKEN_CLOSE = '⟧';
/** شكل أي رمز مهما كان محتواه؛ يستعمله الفاحص لاكتشاف الغريب، وفك التقنيع لتقسيم النص. */
export const TOKEN_SHAPE = /⟦[^⟦⟧]*⟧/g;

// أقواس الرمز نفسها إن وردت في النص الأصلي تُحمى حرفيًا، فلا يلتبس الأصيل بالمحقون في الفحص.
const BRACKET_RUN = /⟦[^⟦⟧]*⟧|[⟦⟧]/g;

export function tokenName(type: TokenType, index: number): string {
  return `${TOKEN_OPEN}${type}_${index}${TOKEN_CLOSE}`;
}

/** يقنّع مقاطع جاهزة: النصوص يُكتشف فيها المحمي، والعناصر المحددة (مثل <code>) تُقنَّع حرفيًا. */
export function maskSegments(segments: readonly MaskSegment[], options: MaskOptions = {}): MaskResult {
  const terms = options.terms ?? DO_NOT_TRANSLATE_TERMS;
  const records = new Map<string, ProtectedTokenRecord>();
  let masked = '';

  const protect = (type: TokenType, original: string): void => {
    if (original.length === 0) return;
    const index = records.size;
    const token = tokenName(type, index);
    records.set(token, { token, type, index, original });
    masked += token;
  };

  const maskPlain = (text: string): void => {
    let cursor = 0;
    for (const d of detectProtected(text, terms)) {
      masked += text.slice(cursor, d.start);
      protect(d.type, text.slice(d.start, d.end));
      cursor = d.end;
    }
    masked += text.slice(cursor);
  };

  for (const segment of segments) {
    if (typeof segment !== 'string') {
      protect(segment.type, segment.value);
      continue;
    }
    let cursor = 0;
    for (const m of segment.matchAll(BRACKET_RUN)) {
      maskPlain(segment.slice(cursor, m.index));
      protect('CODE', m[0]);
      cursor = m.index + m[0].length;
    }
    maskPlain(segment.slice(cursor));
  }
  return { masked, expectedTokens: records };
}

/**
 * يقنّع نص Markdown خامًا: الكتل المسوّرة (```) والمقاطع بين علامات الاقتباس العكسي تُحمى كاملة بحدودها
 * فيبقى Markdown صالحًا بعد الاستعادة، ثم يُكتشف الباقي كما في maskSegments.
 */
export function maskText(text: string, options: MaskOptions = {}): MaskResult {
  return maskSegments(splitMarkdownCode(text), options);
}

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

function splitMarkdownCode(text: string): MaskSegment[] {
  const out: MaskSegment[] = [];
  let plainFrom = 0;
  let offset = 0;
  let fence: { start: number; char: string; length: number } | null = null;

  const pushPlain = (until: number): void => {
    if (until > plainFrom) pushInlineCode(text.slice(plainFrom, until), out);
  };

  for (const line of text.split('\n')) {
    const lineEnd = offset + line.length;
    const m = FENCE_OPEN.exec(line);
    if (fence === null) {
      if (m?.[1]) {
        pushPlain(offset);
        fence = { start: offset, char: m[1][0] ?? '`', length: m[1].length };
      }
    } else if (m?.[1] && m[1][0] === fence.char && m[1].length >= fence.length && line.slice(m[0].length).trim() === '') {
      out.push({ type: 'CODE', value: text.slice(fence.start, lineEnd) });
      plainFrom = lineEnd;
      fence = null;
    }
    offset = lineEnd + 1;
  }
  if (fence !== null) {
    out.push({ type: 'CODE', value: text.slice(fence.start) });
    return out;
  }
  pushPlain(text.length);
  return out;
}

// مقطع شيفرة: سلسلة علامات اقتباس عكسي بطول n تُغلق بسلسلة بالطول نفسه تمامًا.
const INLINE_CODE = /(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;

function pushInlineCode(text: string, out: MaskSegment[]): void {
  let cursor = 0;
  for (const m of text.matchAll(INLINE_CODE)) {
    if (m.index > cursor) out.push(text.slice(cursor, m.index));
    out.push({ type: 'CODE', value: m[0] });
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
}

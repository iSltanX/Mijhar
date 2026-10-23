// صنع البصمة ومقارنتها. التطبيع كما في تجربة T-0.4 (AC-S4.4): حذف \r والمسافات الختامية فقط، فتبقى الإزاحة البادئة جزءًا من السطر.
// صيغة الخاص (DEC-05 ز-1): SHA-256 لـ«الملح \0 السطر»، والملح عشوائي محلي واحد لكل تثبيت يمنع الجداول الجاهزة ولا يمنع تخمين
// سطر قصير أو شائع ممن يملك الملح والبيانات؛ وsaltId بصمة قصيرة للملح تكشف مرساة صُنعت بملح آخر بدل أن تُقرأ «متغيّرة».
import { CONTEXT_LINES, MAX_ANCHOR_LINES, MAX_LINE_CHARS } from './types';
import type { Fingerprint, NoFingerprintReason, Visibility } from './types';

export const normalizeLine = (text: string): string => text.replace(/\r$/, '').replace(/\s+$/, '').slice(0, MAX_LINE_CHARS);

function subtle(): SubtleCrypto {
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (!crypto?.subtle) throw new Error('Web Crypto غير متاح في هذا السياق؛ لا تُصنع بصمة المستودع الخاص');
  return crypto.subtle;
}

const hex = (buffer: ArrayBuffer): string => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(text: string): Promise<string> {
  return hex(await subtle().digest('SHA-256', new TextEncoder().encode(text)));
}

export const hashLine = (salt: string, line: string): Promise<string> => sha256(`${salt}\u0000${line}`);

export const saltIdOf = async (salt: string): Promise<string> => (await sha256(`mijhar-anchor-salt\u0000${salt}`)).slice(0, 12);

/** ملح جديد: 32 بايتًا عشوائية بالست عشري. */
export function newSalt(): string {
  const bytes = new Uint8Array(32);
  (globalThis as { crypto: Crypto }).crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** أسطر الملف كما تُقرأ من الصفحة: رقم السطر ← نصه، وهل ظهر الملف كله (من 1 إلى آخره بلا فجوات). */
export interface PageLines {
  readonly lines: ReadonlyMap<number, string>;
  readonly max: number;
  readonly complete: boolean;
}

export function pageLinesFrom(texts: readonly string[]): PageLines {
  const lines = new Map<number, string>();
  texts.forEach((t, i) => lines.set(i + 1, t));
  return { lines, max: texts.length, complete: true };
}

const at = (page: PageLines, n: number): string | null => (n >= 1 && n <= page.max ? normalizeLine(page.lines.get(n) ?? '') : null);

export type FingerprintOutcome = { readonly ok: true; readonly fingerprint: Fingerprint } | { readonly ok: false; readonly reason: NoFingerprintReason };

/** البصمة من أسطر الصفحة للنطاق start..end. salt مطلوب للخاص وحده. */
export async function makeFingerprint(page: PageLines, start: number, end: number, visibility: Visibility, salt?: string): Promise<FingerprintOutcome> {
  if (end - start + 1 > MAX_ANCHOR_LINES) return { ok: false, reason: 'range-too-long' };
  const block: string[] = [];
  for (let n = start; n <= end; n += 1) {
    if (!page.lines.has(n)) return { ok: false, reason: 'lines-missing' };
    block.push(normalizeLine(page.lines.get(n) as string));
  }
  // سياق خارج ما ظهر من صفحة ناقصة لا يُعدّ «لا سطر»: لا بصمة بدل سياق مخمَّن.
  for (let d = 1; d <= CONTEXT_LINES; d += 1) {
    for (const n of [start - d, end + d]) {
      if (n >= 1 && (n <= page.max || !page.complete) && !page.lines.has(n)) return { ok: false, reason: 'lines-missing' };
    }
  }
  const before = Array.from({ length: CONTEXT_LINES }, (_, i) => at(page, start - CONTEXT_LINES + i));
  const after = Array.from({ length: CONTEXT_LINES }, (_, i) => at(page, end + 1 + i));
  if (visibility === 'public') return { ok: true, fingerprint: { mode: 'text', block, before, after } };
  if (!salt) throw new Error('بصمة المستودع الخاص تحتاج الملح المحلي');
  const hashAll = (list: readonly (string | null)[]) => Promise.all(list.map((l) => (l === null ? null : hashLine(salt, l))));
  const [hb, hbefore, hafter, saltId] = await Promise.all([hashAll(block), hashAll(before), hashAll(after), saltIdOf(salt)]);
  return { ok: true, fingerprint: { mode: 'hash', saltId, block: hb as string[], before: hbefore, after: hafter } };
}

/**
 * أسطر الصفحة بالصيغة التي تُقارن بها البصمة: النص المطبَّع للعامة، وبصمة كل سطر بالملح نفسه للخاصة. لا تغادر الصفحة شيئًا:
 * التجزئة محلية بـWeb Crypto.
 */
export async function comparableLines(page: PageLines, mode: Fingerprint['mode'], salt?: string): Promise<PageLines> {
  if (mode === 'text') {
    const lines = new Map<number, string>();
    for (const [n, t] of page.lines) lines.set(n, normalizeLine(t));
    return { lines, max: page.max, complete: page.complete };
  }
  if (!salt) throw new Error('مقارنة بصمة المستودع الخاص تحتاج الملح المحلي');
  const entries = await Promise.all([...page.lines].map(async ([n, t]) => [n, await hashLine(salt, normalizeLine(t))] as const));
  return { lines: new Map(entries), max: page.max, complete: page.complete };
}

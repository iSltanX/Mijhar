// إعادة التثبيت (T-8.3): مقارنة البصمة بأسطر الصفحة المفتوحة، بالنتائج الصريحة لا بادعاء الدقة. القواعد كما قيست في T-0.4 (AC-S4.4):
//   A مطابق: النطاق بنصه وسياقه ±2 في موضعه نفسه.
//   B منزاح: ليس في موضعه، ويوجد موضع واحد فقط يطابق النص والسياق معًا؛ يُقترح ولا يُطبَّق دون تأكيد المستخدم.
//   C ملتبس: أكثر من موضع يطابق النص والسياق؛ تُعرض المرشحات وتبقى الملاحظة غير مربوطة.
//   D متغيّر: لا موضع يطابق النص والسياق معًا. وطبقة احتياطية مقترحة في T-0.4: إن بقي نص النطاق وحده في موضع واحد بسياق آخر
//     عُرض مرشحًا «بالنص وحده» يحتاج تأكيدًا، ولا تتغير النتيجة عن D.
// والصفحة التي لم تُظهر الملف كله لا يُحكم فيها بغير A: موضع جديد أو غيابه يحتاج رؤية الملف كله.
// الدالة نقية ومتزامنة: الأسطر هنا بصيغة المقارنة (comparableLines)، فلا شبكة ولا تجزئة.
import type { PageLines } from './fingerprint';
import type { Fingerprint } from './types';

export type MatchResult =
  | { readonly status: 'matched'; readonly start: number }
  | { readonly status: 'shifted'; readonly candidate: number }
  | { readonly status: 'ambiguous'; readonly candidates: readonly number[] }
  | { readonly status: 'changed'; readonly textOnly: number | null }
  | { readonly status: 'partial' };

const lineAt = (page: PageLines, n: number): string | null | undefined => {
  if (n < 1) return null;
  if (page.lines.has(n)) return page.lines.get(n) as string;
  return page.complete && n > page.max ? null : undefined;
};

function blockAt(page: PageLines, fingerprint: Fingerprint, k: number): boolean {
  for (let i = 0; i < fingerprint.block.length; i += 1) if (page.lines.get(k + i) !== fingerprint.block[i]) return false;
  return true;
}

function contextAt(page: PageLines, fingerprint: Fingerprint, k: number): boolean {
  const n = fingerprint.before.length;
  for (let i = 0; i < n; i += 1) if (lineAt(page, k - n + i) !== fingerprint.before[i]) return false;
  const last = k + fingerprint.block.length - 1;
  for (let i = 0; i < fingerprint.after.length; i += 1) if (lineAt(page, last + 1 + i) !== fingerprint.after[i]) return false;
  return true;
}

/** المواضع (بداية النطاق) التي يطابق فيها النطاق نصًّا، وتلك التي يطابق فيها مع السياق. */
export function locate(page: PageLines, fingerprint: Fingerprint): { readonly strict: number[]; readonly textOnly: number[] } {
  const first = fingerprint.block[0];
  const strict: number[] = [];
  const textOnly: number[] = [];
  for (const [k, text] of page.lines) {
    if (text !== first || !blockAt(page, fingerprint, k)) continue;
    textOnly.push(k);
    if (contextAt(page, fingerprint, k)) strict.push(k);
  }
  strict.sort((a, b) => a - b);
  textOnly.sort((a, b) => a - b);
  return { strict, textOnly };
}

export function reanchor(page: PageLines, fingerprint: Fingerprint, start: number): MatchResult {
  if (blockAt(page, fingerprint, start) && contextAt(page, fingerprint, start)) return { status: 'matched', start };
  if (!page.complete) return { status: 'partial' };
  const { strict, textOnly } = locate(page, fingerprint);
  if (strict.length === 1) return { status: 'shifted', candidate: strict[0] as number };
  if (strict.length > 1) return { status: 'ambiguous', candidates: strict };
  return { status: 'changed', textOnly: textOnly.length === 1 ? (textOnly[0] as number) : null };
}

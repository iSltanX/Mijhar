// فرق ملف واحد سطرًا بسطر (T-11.8، AC-F6): يُعرض كاملًا قبل أي اتصال كتابة، ويُنسخ «نسخ الفرق» بصيغة unified المألوفة. دوال نقية بلا شبكة.
//  - السطر يحمل نهايته («\n»)، فإضافة سطر جديد في آخر الملف أو حذفه تغيير ظاهر كما في git («لا سطر جديد في نهاية الملف»).
//  - المشترك في أول الملف وآخره يُطرح أولًا، ثم أطول تتابع مشترك (LCS) على الوسط؛ وإن كبر الوسط عن حده يُعرض حذفه كله ثم إضافته كلها: فرق
//    كامل صحيح وإن لم يكن أقصر فرق.

export interface DiffLine {
  readonly kind: 'same' | 'del' | 'add';
  /** نص السطر بلا نهايته. */
  readonly text: string;
  /** رقمه في الأصل (same وdel). */
  readonly old: number | null;
  /** رقمه في الجديد (same وadd). */
  readonly new: number | null;
  /** سطر أخير بلا سطر جديد بعده. */
  readonly noEol: boolean;
}

export interface Hunk {
  readonly oldStart: number;
  readonly oldCount: number;
  readonly newStart: number;
  readonly newCount: number;
  readonly lines: readonly DiffLine[];
}

export interface FileDiff {
  readonly hunks: readonly Hunk[];
  readonly additions: number;
  readonly deletions: number;
}

/** أقصى خلايا لجدول LCS على الوسط. */
const MAX_CELLS = 4_000_000;
export const CONTEXT_LINES = 3;
export const NO_EOL_MARK = '\\ No newline at end of file';

const tokens = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];

function middleOps(a: readonly string[], b: readonly string[]): ('same' | 'del' | 'add')[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map(() => 'add');
  if (m === 0) return a.map(() => 'del');
  if (n * m > MAX_CELLS) return [...a.map(() => 'del' as const), ...b.map(() => 'add' as const)];
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = a[i] === b[j] ? (table[(i + 1) * width + j + 1] as number) + 1 : Math.max(table[(i + 1) * width + j] as number, table[i * width + j + 1] as number);
    }
  }
  const ops: ('same' | 'del' | 'add')[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push('same');
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] as number) >= (table[i * width + j + 1] as number)) {
      ops.push('del');
      i += 1;
    } else {
      ops.push('add');
      j += 1;
    }
  }
  while (i < n) {
    ops.push('del');
    i += 1;
  }
  while (j < m) {
    ops.push('add');
    j += 1;
  }
  return ops;
}

/** كل أسطر الملفين بنوعها ورقميها. */
export function diffLines(before: string, after: string): DiffLine[] {
  const a = tokens(before);
  const b = tokens(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end += 1;
  const ops = [...Array<'same'>(start).fill('same'), ...middleOps(a.slice(start, a.length - end), b.slice(start, b.length - end)), ...Array<'same'>(end).fill('same')];
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  for (const op of ops) {
    const raw = op === 'add' ? (b[j] as string) : (a[i] as string);
    const line = { text: raw.endsWith('\n') ? raw.slice(0, -1) : raw, noEol: !raw.endsWith('\n') };
    if (op === 'same') out.push({ kind: 'same', ...line, old: (i += 1), new: (j += 1) });
    else if (op === 'del') out.push({ kind: 'del', ...line, old: (i += 1), new: null });
    else out.push({ kind: 'add', ...line, old: null, new: (j += 1) });
  }
  return out;
}

/** الفرق بكتل حول كل تغيير بسطور سياقها. لا كتلة حين لا تغيير. */
export function fileDiff(before: string, after: string, context = CONTEXT_LINES): FileDiff {
  const lines = diffLines(before, after);
  const changed = lines.map((l, k) => (l.kind === 'same' ? -1 : k)).filter((k) => k >= 0);
  const hunks: Hunk[] = [];
  let k = 0;
  while (k < changed.length) {
    const first = changed[k] as number;
    let last = first;
    while (k + 1 < changed.length && (changed[k + 1] as number) - last <= 2 * context + 1) {
      k += 1;
      last = changed[k] as number;
    }
    k += 1;
    const from = Math.max(0, first - context);
    const to = Math.min(lines.length, last + context + 1);
    const slice = lines.slice(from, to);
    const oldLines = slice.filter((l) => l.old !== null);
    const newLines = slice.filter((l) => l.new !== null);
    // كتلة بلا أسطر في جانب تبدأ عند السطر الذي قبلها (اصطلاح unified).
    const before0 = lines.slice(0, from);
    const oldBefore = before0.filter((l) => l.old !== null).length;
    const newBefore = before0.filter((l) => l.new !== null).length;
    hunks.push({
      oldStart: oldLines.length ? (oldLines[0]?.old as number) : oldBefore,
      oldCount: oldLines.length,
      newStart: newLines.length ? (newLines[0]?.new as number) : newBefore,
      newCount: newLines.length,
      lines: slice,
    });
  }
  return { hunks, additions: lines.filter((l) => l.kind === 'add').length, deletions: lines.filter((l) => l.kind === 'del').length };
}

const range = (start: number, count: number): string => (count === 1 ? `${start}` : `${start},${count}`);

/** الفرق بصيغة unified («نسخ الفرق»): ‎--- a/… +++ b/…‎ ثم الكتل. ملف جديد من /dev/null. */
export function unifiedDiff(path: string, before: string, after: string, isNew = false): string {
  const diff = fileDiff(before, after);
  const out = [isNew ? '--- /dev/null' : `--- a/${path}`, `+++ b/${path}`];
  for (const h of diff.hunks) {
    out.push(`@@ -${range(h.oldStart, h.oldCount)} +${range(h.newStart, h.newCount)} @@`);
    for (const l of h.lines) {
      out.push(`${l.kind === 'same' ? ' ' : l.kind === 'del' ? '-' : '+'}${l.text}`);
      if (l.noEol) out.push(NO_EOL_MARK);
    }
  }
  return `${out.join('\n')}\n`;
}

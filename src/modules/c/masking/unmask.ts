// فك التقنيع: يستبدل كل رمز بعنصره الأصلي حرفيًا. لا يعمل إلا على نص اجتاز الفحوص الأربعة.

import { TOKEN_SHAPE } from './mask';
import { TokenIntegrityValidator } from './validator';
import type { ExpectedTokens, IntegrityFailure, UnmaskedPart } from './types';

/** يُرمى حين يُطلب فك تقنيع نص لم يجتز الفاحص؛ فلا يصل نص مشوَّه إلى العرض من هذا الطريق. */
export class TokenIntegrityError extends Error {
  constructor(readonly failures: readonly IntegrityFailure[]) {
    super(`سلامة الرموز المحمية مخلّة: ${failures.map((f) => f.detail).join(' | ')}`);
    this.name = 'TokenIntegrityError';
  }
}

/** يقسم النص المترجم إلى أجزاء نصية وأجزاء محمية معزولة dir="ltr". */
export function unmask(translated: string, expectedTokens: ExpectedTokens): UnmaskedPart[] {
  const report = new TokenIntegrityValidator(expectedTokens).validate(translated);
  if (!report.ok) throw new TokenIntegrityError(report.failures);

  const parts: UnmaskedPart[] = [];
  let cursor = 0;
  for (const m of translated.matchAll(TOKEN_SHAPE)) {
    const record = expectedTokens.get(m[0]);
    if (!record) throw new TokenIntegrityError([{ check: 'hallucination', tokens: [m[0]], detail: `رمز غير مسجل: ${m[0]}` }]);
    if (m.index > cursor) parts.push({ kind: 'text', value: translated.slice(cursor, m.index) });
    parts.push({ kind: 'protected', type: record.type, value: record.original, dir: 'ltr' });
    cursor = m.index + m[0].length;
  }
  if (cursor < translated.length) parts.push({ kind: 'text', value: translated.slice(cursor) });
  return parts;
}

/** النص الصرف بعد الاستعادة، بلا أي محارف تحكم مضافة، فيطابق ما يُنسخ الأصلَ. */
export function partsToText(parts: readonly UnmaskedPart[]): string {
  return parts.map((p) => p.value).join('');
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);

/** HTML مهرَّب القيم؛ الجزء المحمي في عنصر معزول بالاصطلاح نفسه الذي تستعمله الوحدة (أ) دون محارف خفية. */
export function partsToHtml(parts: readonly UnmaskedPart[]): string {
  return parts
    .map((p) =>
      p.kind === 'text'
        ? escapeHtml(p.value)
        : `<span class="mijhar-bidi-isolate" data-mijhar-injected="true" data-mijhar-protected="${p.type}" dir="${p.dir}">${escapeHtml(p.value)}</span>`,
    )
    .join('');
}

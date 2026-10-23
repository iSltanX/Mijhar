// TokenIntegrityValidator: الفحوص الأربعة الإلزامية على النص المترجم، قبل فك التقنيع وقبل عرض أي حرف منه.
// يتحقق من عقد الرموز فقط؛ نجاحه لا يعني خلو الترجمة من الخطأ، وجودتها تُقاس في T-0.2.

import { TOKEN_CLOSE, TOKEN_OPEN, TOKEN_SHAPE } from './mask';
import type { ExpectedTokens, IntegrityFailure, IntegrityReport } from './types';

export class TokenIntegrityValidator {
  constructor(private readonly expectedTokens: ExpectedTokens) {}

  validate(translated: string): IntegrityReport {
    const found = translated.match(TOKEN_SHAPE) ?? [];
    const frequency = new Map<string, number>();
    for (const token of found) frequency.set(token, (frequency.get(token) ?? 0) + 1);

    const failures: IntegrityFailure[] = [];

    // 1) العدد: ما استُخرج من النص يساوي ما سُجِّل، مع احتساب كل ظهور.
    if (found.length !== this.expectedTokens.size) {
      failures.push({
        check: 'count',
        tokens: [],
        detail: `عدد الرموز في الترجمة ${found.length} والمتوقع ${this.expectedTokens.size}`,
      });
    }

    // 2) الهوية وعدم الفقدان: كل رمز مسجَّل حاضر حرفيًا بأقواسه واسمه ورقمه.
    const missing = [...this.expectedTokens.keys()].filter((token) => !frequency.has(token));
    if (missing.length > 0) {
      failures.push({ check: 'identity', tokens: missing, detail: `رموز مفقودة أو محرّفة: ${missing.join(' ')}` });
    }

    // 3) عدم التكرار: ظهور كل رمز مسجَّل مرة واحدة بالضبط (الصفر تلتقطه فحص الهوية).
    const repeated = [...this.expectedTokens.keys()].filter((token) => (frequency.get(token) ?? 0) > 1);
    if (repeated.length > 0) {
      failures.push({ check: 'duplication', tokens: repeated, detail: `رموز مكررة: ${repeated.join(' ')}` });
    }

    // 4) عدم اختلاق رموز: لا رمز على شكل ⟦…⟧ غير مسجَّل، ولا قوس رمز يتيم بعد استبعاد الرموز التامة.
    const unknown = [...frequency.keys()].filter((token) => !this.expectedTokens.has(token));
    const stray = translated.replace(TOKEN_SHAPE, '');
    const orphan = stray.includes(TOKEN_OPEN) || stray.includes(TOKEN_CLOSE);
    if (unknown.length > 0 || orphan) {
      failures.push({
        check: 'hallucination',
        tokens: unknown,
        detail: [unknown.length > 0 ? `رموز غير مسجلة: ${unknown.join(' ')}` : '', orphan ? 'قوس رمز يتيم' : '']
          .filter(Boolean)
          .join('؛ '),
      });
    }

    return failures.length === 0 ? { ok: true, failures: [] } : { ok: false, failures };
  }
}

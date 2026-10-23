// محركات ترجمة وهمية للاختبار: تُنتج المخرجات المحددة في TEST-TR-02A إلى 02F دون أي محرك حقيقي.
import { TOKEN_SHAPE } from '../../../../src/modules/c/masking/mask';
import type { TranslateFn } from '../../../../src/modules/c/masking/fail-safe';

/** "يترجم" كل كلمة إنجليزية خارج الرموز إلى كلمة عربية ويُبقي الرموز كما هي. */
export function translateWords(masked: string): string {
  let out = '';
  let cursor = 0;
  for (const m of masked.matchAll(TOKEN_SHAPE)) {
    out += masked.slice(cursor, m.index).replace(/[A-Za-z]+/g, 'ترجمة');
    out += m[0];
    cursor = m.index + m[0].length;
  }
  return out + masked.slice(cursor).replace(/[A-Za-z]+/g, 'ترجمة');
}

export interface RecordingEngine {
  readonly translate: TranslateFn;
  readonly calls: string[];
}

/** محرك يسجّل مدخلاته ويدع دالة `behave` تقرر المخرج لكل استدعاء (رقمه من 0). */
export function recordingEngine(behave: (input: string, callIndex: number) => string): RecordingEngine {
  const calls: string[] = [];
  return {
    calls,
    translate: async (input) => {
      calls.push(input);
      return behave(input, calls.length - 1);
    },
  };
}

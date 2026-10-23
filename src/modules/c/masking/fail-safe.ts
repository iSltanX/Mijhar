// قاعدة الفشل الآمن: نص مترجم فشل فحصه لا يُعرض ولا يُخمَّن فيه موضع الكود. تُجرَّب إعادة الترجمة جملةً جملةً
// مرة واحدة فقط، فإن رُفضت أيضًا بقي الأصل مع تنبيه. المحرك دالة مجرّدة؛ هذا الملف لا يعرف أي محرك حقيقي.

import { maskSegments, maskText, TOKEN_SHAPE } from './mask';
import { INTEGRITY_WARNING } from './messages';
import { partsToText, unmask } from './unmask';
import { TokenIntegrityValidator } from './validator';
import type {
  ExpectedTokens,
  IntegrityFailure,
  MaskOptions,
  MaskSegment,
  ProtectedTokenRecord,
  UnmaskedPart,
} from './types';

/** يترجم نصًا مقنَّعًا ويعيد النص المترجم بالرموز كما هي. أخطاء المحرك نفسه (شبكة، إلغاء) تُرمى إلى المستدعي. */
export type TranslateFn = (maskedText: string, context: { readonly signal?: AbortSignal }) => Promise<string>;

export interface FailSafeOptions extends MaskOptions {
  readonly signal?: AbortSignal;
  /** لغة المصدر لتقسيم الجمل في إعادة المحاولة. */
  readonly locale?: string;
}

interface Attempts {
  /** 0 إن نجحت المحاولة الأولى، و1 إن جُرِّبت إعادة الترجمة جملةً جملةً. لا يتجاوز 1 أبدًا. */
  readonly retryAttempts: 0 | 1;
  /** مرات استدعاء المحرك الفعلية (الفقرة كاملة ثم جملها). */
  readonly engineCalls: number;
}

export type ProtectedTranslation =
  | ({
      readonly status: 'translated';
      /** النص المترجم مع رموزه، وقد اجتاز الفحوص الأربعة. */
      readonly masked: string;
      /** الأجزاء بعد فك التقنيع؛ المحمي فيها معزول dir="ltr". */
      readonly parts: readonly UnmaskedPart[];
      readonly text: string;
    } & Attempts)
  | ({
      readonly status: 'original-kept';
      /** النص الأصلي كما سُلِّم، دون أي تغيير. */
      readonly original: string;
      readonly warning: string;
      /** إخفاقات المحاولة الأخيرة (جملةً جملةً). */
      readonly failures: readonly IntegrityFailure[];
      /** إخفاقات المحاولة الأولى على الفقرة كاملة. */
      readonly firstAttemptFailures: readonly IntegrityFailure[];
    } & Attempts);

export async function translateProtected(
  source: string | readonly MaskSegment[],
  translate: TranslateFn,
  options: FailSafeOptions = {},
): Promise<ProtectedTranslation> {
  const { masked, expectedTokens } =
    typeof source === 'string' ? maskText(source, options) : maskSegments(source, options);
  const original = typeof source === 'string' ? source : source.map((s) => (typeof s === 'string' ? s : s.value)).join('');
  const validator = new TokenIntegrityValidator(expectedTokens);
  const context = { signal: options.signal };
  let engineCalls = 0;
  const call = async (text: string): Promise<string> => {
    options.signal?.throwIfAborted();
    engineCalls += 1;
    return translate(text, context);
  };

  const accept = (translated: string, retryAttempts: 0 | 1): ProtectedTranslation => {
    const parts = unmask(translated, expectedTokens);
    return { status: 'translated', masked: translated, parts, text: partsToText(parts), retryAttempts, engineCalls };
  };

  if (masked.trim() === '') return accept(masked, 0);

  const first = await call(masked);
  const firstReport = validator.validate(first);
  if (firstReport.ok) return accept(first, 0);

  const second = await translateSentences(masked, expectedTokens, call, options.locale ?? 'en');
  if (second.ok) {
    const whole = validator.validate(second.text);
    if (whole.ok) return accept(second.text, 1);
    return keep(original, whole.failures, firstReport.failures, engineCalls);
  }
  return keep(original, second.failures, firstReport.failures, engineCalls);
}

function keep(
  original: string,
  failures: readonly IntegrityFailure[],
  firstAttemptFailures: readonly IntegrityFailure[],
  engineCalls: number,
): ProtectedTranslation {
  return { status: 'original-kept', original, warning: INTEGRITY_WARNING, failures, firstAttemptFailures, retryAttempts: 1, engineCalls };
}

type SentenceOutcome = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly failures: readonly IntegrityFailure[] };

async function translateSentences(
  masked: string,
  expectedTokens: ExpectedTokens,
  call: (text: string) => Promise<string>,
  locale: string,
): Promise<SentenceOutcome> {
  let joined = '';
  for (const sentence of splitSentences(masked, locale)) {
    const core = sentence.trim();
    if (core === '') {
      joined += sentence;
      continue;
    }
    const lead = sentence.slice(0, sentence.indexOf(core));
    const trail = sentence.slice(lead.length + core.length);

    const own = new Map<string, ProtectedTokenRecord>();
    for (const token of core.match(TOKEN_SHAPE) ?? []) {
      const record = expectedTokens.get(token);
      if (record) own.set(token, record);
    }
    const translated = await call(core);
    const report = new TokenIntegrityValidator(own).validate(translated);
    if (!report.ok) return { ok: false, failures: report.failures };
    joined += lead + translated + trail;
  }
  return { ok: true, text: joined };
}

// كلمة تحل محل الرمز عند التقسيم: الرمز خارج نظر المقسِّم فلا يقطعه، ولا تعامله علامة الترقيم المجاورة كأنه اختصار.
const SEGMENTER_STAND_IN = 'Token';

/** يقسم النص المقنَّع إلى جمل بـIntl.Segmenter دون أن تقع حدود الجمل داخل رمز؛ والتجميع يعيد النص حرفيًا. */
function splitSentences(masked: string, locale: string): string[] {
  let view = '';
  const origin: number[] = [];
  let cursor = 0;
  const addText = (from: number, to: number): void => {
    for (let i = from; i < to; i += 1) origin.push(i);
    view += masked.slice(from, to);
  };
  for (const m of masked.matchAll(TOKEN_SHAPE)) {
    addText(cursor, m.index);
    for (let i = 0; i < SEGMENTER_STAND_IN.length; i += 1) origin.push(m.index);
    view += SEGMENTER_STAND_IN;
    cursor = m.index + m[0].length;
  }
  addText(cursor, masked.length);

  const starts = [...new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(view)].map((s) => origin[s.index] ?? masked.length);
  return starts.map((start, i) => masked.slice(start, starts[i + 1] ?? masked.length)).filter((s) => s.length > 0);
}

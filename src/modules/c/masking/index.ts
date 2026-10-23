// الواجهة العامة لتقنيع الرموز (T-4.2). تستهلكها واجهة الترجمة (T-4.1) ومساعد الكتابة (T-7.3) لاحقًا.

export { DO_NOT_TRANSLATE_TERMS } from './do-not-translate';
export { translateProtected } from './fail-safe';
export type { FailSafeOptions, ProtectedTranslation, TranslateFn } from './fail-safe';
export { maskSegments, maskText, tokenName } from './mask';
export { INTEGRITY_WARNING } from './messages';
export { TOKEN_TYPES } from './types';
export type {
  ExpectedTokens,
  IntegrityCheck,
  IntegrityFailure,
  IntegrityReport,
  MaskOptions,
  MaskResult,
  MaskSegment,
  ProtectedTokenRecord,
  TokenType,
  UnmaskedPart,
} from './types';
export { partsToHtml, partsToText, TokenIntegrityError, unmask } from './unmask';
export { TokenIntegrityValidator } from './validator';

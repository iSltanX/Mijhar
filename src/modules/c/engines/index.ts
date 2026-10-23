// الواجهة العامة لطبقة محركات الترجمة المحلية (T-4.3 / F-C4، DEC-03 ج-2). يستهلكها سكربت المحتوى (installTranslationEngine) وواجهة الترجمة (البديل).
export { copyMaskedText, maskedCopyText, writeClipboard } from './fallback';
export type { ClipboardWrite, MaskedCopy } from './fallback';
export { ENGINE_MESSAGES } from './messages';
export { installTranslationEngine, selectLocalEngine, UnavailableEngine } from './select';
export { EngineError, LANGUAGES, TranslatorApiEngine, translatorFactoryOf } from './translator-api';
export type { TranslatorApiOptions, TranslatorAvailability, TranslatorFactory, TranslatorInstance, TranslatorLanguages } from './translator-api';
export { encodeTokens, TRANSLATOR_WIRE_FORMATS } from './wire';
export type { WireCodec, WireFormat } from './wire';

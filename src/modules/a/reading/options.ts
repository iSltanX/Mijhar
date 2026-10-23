// إعدادات وضع القراءة (modules.a.reading.options): يقرؤها العارض ويكتبها، وتظهر في قسم الوحدة (أ) في الإعدادات.

export const READING_OPTIONS_KEY = 'modules.a.reading.options';

export interface ReadingOptions {
  /** إخفاء التشكيل في العارض افتراضًا عند فتحه. */
  readonly hideDiacritics: boolean;
}

export const DEFAULT_READING_OPTIONS: ReadingOptions = { hideDiacritics: true };

export function isReadingOptions(value: unknown): value is ReadingOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).every((key) => key === 'hideDiacritics') && typeof v.hideDiacritics === 'boolean';
}

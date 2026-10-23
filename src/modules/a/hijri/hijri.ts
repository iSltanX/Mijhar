// التاريخ الهجري (T-2.6، F-A6): يُحسب محليًا من datetime في <relative-time> عبر Intl.DateTimeFormat بتقويم أم القرى، مع تعديل
// ±1 أو ±2 يوم. توفر التقويم يختلف بحسب المتصفح وبيانات ICU (TEST-RTL-06)، فيُكشف وقت التشغيل: أم القرى، وإلا الهجري الحسابي
// (islamic-civil) بإعلان ذلك في التلميح، وإلا «غير متاح». دوال نقية لا تمس DOM.

export const HIJRI_OPTIONS_KEY = 'modules.a.hijri.options';
export const HIJRI_CALENDARS = ['islamic-umalqura', 'islamic-civil'] as const;
export type HijriCalendar = (typeof HIJRI_CALENDARS)[number];
export type Numerals = 'latn' | 'arab';

export interface HijriOptions {
  /** تعديل بالأيام: من −2 إلى +2. */
  readonly offset: number;
  readonly numerals: Numerals;
}

export const DEFAULT_HIJRI_OPTIONS: HijriOptions = { offset: 0, numerals: 'latn' };

export function isHijriOptions(value: unknown): value is HijriOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some((key) => key !== 'offset' && key !== 'numerals')) return false;
  return Number.isInteger(v.offset) && (v.offset as number) >= -2 && (v.offset as number) <= 2 && (v.numerals === 'latn' || v.numerals === 'arab');
}

const DAY_MS = 86_400_000;

/** صيغة المنسّق: اللغة ar-SA بالتقويم ونظام الأرقام في امتداد u. */
export const hijriLocale = (calendar: HijriCalendar, numerals: Numerals): string => `ar-SA-u-ca-${calendar}-nu-${numerals}`;

/** هل يدعم المتصفح التقويم فعلًا: يعيده المنسّق في resolvedOptions ولا يستبدل به الميلادي. */
export function calendarSupported(calendar: HijriCalendar): boolean {
  try {
    return new Intl.DateTimeFormat(hijriLocale(calendar, 'latn')).resolvedOptions().calendar === calendar;
  } catch {
    return false;
  }
}

/** أول تقويم هجري متاح بالترتيب، أو null. */
export function availableCalendar(): HijriCalendar | null {
  return HIJRI_CALENDARS.find(calendarSupported) ?? null;
}

export interface HijriDate {
  readonly text: string;
  readonly calendar: HijriCalendar;
  readonly offset: number;
}

/** التاريخ الهجري لسمة datetime بعد التعديل، أو null إن لم تصلح السمة أو لم يتوفر تقويم هجري. */
export function hijriDate(datetime: string, options: HijriOptions = DEFAULT_HIJRI_OPTIONS, calendar: HijriCalendar | null = availableCalendar()): HijriDate | null {
  if (!calendar) return null;
  const time = Date.parse(datetime);
  if (Number.isNaN(time)) return null;
  const formatter = new Intl.DateTimeFormat(hijriLocale(calendar, options.numerals), { dateStyle: 'full' });
  return { text: formatter.format(new Date(time + options.offset * DAY_MS)), calendar, offset: options.offset };
}

export const CALENDAR_LABELS: Record<HijriCalendar, string> = {
  'islamic-umalqura': 'تقويم أم القرى',
  'islamic-civil': 'الهجري الحسابي (أم القرى غير متاح في هذا المتصفح)',
};

/** وصف التعديل للتلميح: «بتعديل +يوم واحد» أو «بتعديل −يومين»، أو '' بلا تعديل. */
export function offsetLabel(offset: number): string {
  if (!offset) return '';
  const sign = offset > 0 ? '+' : '−';
  return Math.abs(offset) === 1 ? `بتعديل ${sign}يوم واحد` : `بتعديل ${sign}يومين`;
}

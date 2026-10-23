// قاعدة القلب (AC-A1 بند أ، مراجَعة بنتائج T-0.1): الخطة اقترحت عتبة أولية 30% أو ثلاث كلمات عربية متصلة «تُراجع بنتائج T-0.1»،
// وتقرير T-0.1 وجد أنها تقلب كتلًا ثنائية اللغة تبدأ بجملة إنجليزية كاملة (42 إلى 53%) واقترح رفعها نحو 60% أو اشتراط ألا تبدأ
// الكتلة بجملة لاتينية. القاعدة المعتمدة، وقياسها على عينات T-0.1 نفسها في evidence/T-2.1/threshold.json:
//  - كتلة عربية بوضوح (النسبة ≥ strong، افتراضيًا 60%) تُقلب.
//  - كتلة مختلطة (mixed ≤ النسبة < strong، أو تتابع ≥ minRun كلمات عربية) تُقلب بحسب سياقها: داخل حاوية محتوى (README أو
//    تعليق) إن كانت نسبة الحروف العربية في الحاوية كلها ≥ context (افتراضيًا 50%)؛ وخارج الحاويات (عنوان، رسالة التزام، وصف
//    مستودع) إن لم تبدأ بجملة لاتينية كاملة (أقل من latinSentence كلمات لاتينية قبل أول كلمة عربية).
// وكل ذلك فقط حيث يعرض GitHub الكتلة ltr أصلًا (AC-A1 بند و)، ولم يكتب مؤلف المحتوى dir="ltr" صريحة عليها أو على سلف لها:
// GitHub لا يضع dir="ltr" في صفحاته (صفر في عينات T-0.1 الثماني)، فالصريحة قصد المؤلف ولا يُكتب فوقها.
import type { BlockMeasure, NativeDirection } from './bidi';

export interface DirectionOptions {
  /** نسبة الحروف العربية التي تُقلب عندها الكتلة دون نظر إلى سياقها. */
  readonly strong: number;
  /** أدنى نسبة لكتلة مختلطة يُنظر في سياقها. */
  readonly mixed: number;
  /** تتابع كلمات عربية يجعل الكتلة مختلطة ولو قلّت نسبتها. */
  readonly minRun: number;
  /** نسبة الحروف العربية في الحاوية التي تُقلب عندها كتلها المختلطة. */
  readonly context: number;
  /** عدد الكلمات اللاتينية قبل أول كلمة عربية الذي يُعدّ جملة إنجليزية كاملة. */
  readonly latinSentence: number;
}

export const DEFAULT_DIRECTION_OPTIONS: DirectionOptions = { strong: 0.6, mixed: 0.3, minRun: 3, context: 0.5, latinSentence: 3 };

const ratioIn = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const countIn = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 50;

export function isDirectionOptions(value: unknown): value is DirectionOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return ratioIn(v.strong) && ratioIn(v.mixed) && ratioIn(v.context) && countIn(v.minRun) && countIn(v.latinSentence) && (v.mixed as number) <= (v.strong as number)
    && Object.keys(v).every((key) => key in DEFAULT_DIRECTION_OPTIONS);
}

export type BlockVerdict =
  | 'flip'
  | 'native-rtl'
  | 'explicit-ltr'
  | 'no-letters'
  | 'latin'
  | 'mixed-latin-context'
  | 'mixed-latin-sentence';

export interface BlockContext {
  /** اتجاه GitHub الأصلي للكتلة ومصدره. */
  readonly native: NativeDirection;
  /** نسبة الحروف العربية في حاوية المحتوى، أو null لكتلة خارج الحاويات. */
  readonly containerRatio: number | null;
}

export function decide(measure: BlockMeasure, context: BlockContext, options: DirectionOptions = DEFAULT_DIRECTION_OPTIONS): BlockVerdict {
  if (context.native.direction === 'rtl') return 'native-rtl';
  if (context.native.source === 'explicit') return 'explicit-ltr';
  if (!measure.letters) return 'no-letters';
  if (measure.ratio >= options.strong) return 'flip';
  const mixed = measure.ratio >= options.mixed || measure.arabicRun >= options.minRun;
  if (!mixed) return 'latin';
  if (context.containerRatio !== null) return context.containerRatio >= options.context ? 'flip' : 'mixed-latin-context';
  return measure.latinLead < options.latinSentence ? 'flip' : 'mixed-latin-sentence';
}

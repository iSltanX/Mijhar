// واجهة خدمة الترجمة المجرّدة (TranslationService) وسجلها (T-4.1 / F-C1): الواجهة وما فوقها (الأزرار وعرض الأصل والترجمة) لا تعرف أي محرك حقيقي؛
// تنفيذ المحرك يأتي بعدها (T-4.3، المرحلة MJ14) ويُسجَّل هنا بـsetTranslationService. العقد:
//  - translate يستقبل نصًا مقنَّعًا برموزه ⟦TYPE_N⟧ (T-4.2) ويعيد النص المترجم برموزه كما هي؛ فحص سلامة الرموز وقاعدة الفشل الآمن يتمّان خارج المحرك
//    (translateProtected)، فلا يثق أحد بمحرك في سلامة الكود.
//  - availability يجيب عن الجاهزية دون ترجمة ودون شبكة: 'absent' (لا محرك: الواجهة ساكنة ولا تُظهر زرًّا)، و'unavailable' بسبب (يُعرض صراحةً)، و'ready'،
//    و'consent' (T-4.4): المحرك جاهز لكن أول استدعاء سيبدأ تنزيل المتصفح حزمة لغة، فتعرض الواجهة البطاقة ولا تترجم إلا بعد grantConsent() من نقرة صريحة.
//  - لا شيء هنا يترجم أو يتصل بشبكة؛ ولا تبدأ ترجمة إلا من فعل صريح من المستخدم تستدعيه الواجهة.
import type { ConsentCard } from '../model-manager/consent';

export type Availability =
  | { readonly state: 'ready' }
  | { readonly state: 'consent'; readonly card: ConsentCard }
  | { readonly state: 'unavailable'; readonly reason: string }
  | { readonly state: 'absent' };

export interface TranslateContext {
  readonly signal?: AbortSignal;
}

export interface TranslationService {
  /** معرّف ثابت للمحرك (للتشخيص). */
  readonly id: string;
  /** اسم يُعرض للمستخدم. */
  readonly label: string;
  availability(): Promise<Availability>;
  /** موافقة المستخدم على بطاقة 'consent' (نقرة صريحة)؛ بعدها تعيد availability() 'ready'. للمحركات التي تطلب موافقة وحدها. */
  grantConsent?(): void;
  /** من الإنجليزية إلى العربية. أخطاء المحرك نفسه (إلغاء، تعطل) تُرمى. */
  translate(maskedText: string, context: TranslateContext): Promise<string>;
}

let current: TranslationService | null = null;
const listeners = new Set<() => void>();

/** يسجّل المحرك الحالي (أو null لإزالته). تستدعيه طبقة المحركات عند بدء سكربت المحتوى. */
export function setTranslationService(service: TranslationService | null): void {
  current = service;
  for (const listener of [...listeners]) listener();
}

export const getTranslationService = (): TranslationService | null => current;

/** يتابع تغيّر المحرك المسجَّل؛ يعيد دالة إلغاء الاشتراك. */
export function onTranslationServiceChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export const isAbort = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError';

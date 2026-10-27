// المحرك المُدار (T-4.4، DEC-03 ج-2): يلفّ محرك Translator API ويضيف ما يلزم قبل أن يبدأ المتصفح تنزيل حزمة اللغة:
//  - availability() تسأل المتصفح عن الحزمة (استعلام بلا تنزيل ولا إنشاء مترجم)؛ فإن كانت 'downloadable' ولم يوافق المستخدم بعد أعادت {state:'consent'} وبطاقة
//    الاستئذان، ولا تصير 'ready' إلا بعد grantConsent() من نقرة «موافق». وهكذا لا يُستدعى create() (الذي ينزّل) قبل فعل المستخدم ثم موافقته.
//  - أخطاء الحزمة (انقطاع الشبكة، امتلاء القرص) تُترجَم إلى رسائل واضحة (errors.ts)، وتسقط الموافقة بعد فشل لم تكتمل فيه الحزمة أو بعد إلغاء،
//    فيُسأل المستخدم من جديد قبل المحاولة التالية. ولا تسقط عند NotSupportedError المتقطع ولا NotAllowedError: الحزمة لم تُنزَّل لكنه وافق للتوّ.
//  - مهلة تأخّر: ما دامت الحزمة لم تثبت فالترجمة الأولى تنتظر تنزيل المتصفح. قاس الاختبار الحقيقي (شبكة مقطوعة بوكيل غير موجود) أن create() لا يرفض بل يبقى معلّقًا،
//    فيبقى الشريط عند «جارٍ الترجمة… 0 من N» بلا تفسير. فبعد stallMs (60 ثانية، قابلة للضبط، لم تُقَس على اتصال بطيء) تُرمى رسالة التأخر؛ ولا يُلغى طلب
//    المتصفح (المترجم قيد الإنشاء يبقى محفوظًا فتعيد الضغطة التالية انتظاره لا تنزيلًا جديدًا)، ولا تسقط الموافقة.
//  - ما سوى ذلك يمرّ كما هو: الترجمة والإلغاء بـAbortSignal وسائر الأخطاء.
import { ENGINE_MESSAGES, EngineError } from '../engines';
import type { Availability, TranslateContext, TranslationService } from '../ui/service';
import { consentCard } from './consent';
import { classifyModelError } from './errors';
import { MODEL_MESSAGES } from './messages';

export interface ManagedEngineOptions {
  /** مهلة انتظار تنزيل الحزمة بالمللي ثانية قبل رسالة التأخر؛ 0 يعطّلها. */
  readonly stallMs?: number;
}

export const DEFAULT_STALL_MS = 60_000;

export class ManagedTranslationEngine implements TranslationService {
  readonly id: string;
  readonly label: string;
  private consented = false;
  /** هل ثبتت الحزمة على الجهاز: رُصدت 'available' أو نجحت ترجمة. */
  private packPresent = false;

  constructor(
    private readonly inner: TranslationService,
    /** حالة الزوج en→ar كما يعلنها المتصفح (TranslatorApiEngine.status). */
    private readonly status: () => Promise<string>,
    private readonly options: ManagedEngineOptions = {},
  ) {
    this.id = inner.id;
    this.label = inner.label;
  }

  async availability(): Promise<Availability> {
    const base = await this.inner.availability();
    if (base.state !== 'ready') return base;
    let state: string;
    try {
      state = await this.status();
    } catch (error) {
      // لا يُفترض أن الحزمة موجودة: الفشل في السؤال يُغلق الباب بسبب صريح بدل أن يُنشئ مترجمًا قد ينزّل.
      return { state: 'unavailable', reason: `${ENGINE_MESSAGES.checkFailed}: ${error instanceof Error ? error.message : String(error)}` };
    }
    this.packPresent = state === 'available';
    // الموافقة لتنزيل واحد: متى رُصدت الحزمة منزّلة سقطت، فإن زالت لاحقًا (حذفها المستخدم من المتصفح) سُئل من جديد.
    if (this.packPresent) this.consented = false;
    if (state === 'downloadable' && !this.consented) return { state: 'consent', card: consentCard() };
    return base;
  }

  /** من نقرة «موافق» في البطاقة. */
  grantConsent(): void {
    this.consented = true;
  }

  async translate(maskedText: string, context: TranslateContext = {}): Promise<string> {
    try {
      const output = await this.run(maskedText, context);
      this.packPresent = true;
      return output;
    } catch (error) {
      // GEMINI-019: QuotaExceededError بعد اكتمال تنزيل الحزمة في هذا الطلب نفسه حدّ إدخال الفقرة لا امتلاء قرص: يُسأل المتصفح عن الحزمة قبل التصنيف،
      // فلا يُعرض «لا تتسع مساحة التخزين» ولا تُسحب الموافقة لحزمة صارت موجودة.
      if (!this.packPresent && (error instanceof Error || error instanceof DOMException) && error.name === 'QuotaExceededError') {
        const state = await this.status().catch(() => null);
        if (state === 'available') this.packPresent = true;
      }
      throw this.explain(error);
    }
  }

  /** الترجمة بالمحرك، وقبل ثبوت الحزمة تحت مهلة التأخر. */
  private async run(maskedText: string, context: TranslateContext): Promise<string> {
    const stallMs = this.options.stallMs ?? DEFAULT_STALL_MS;
    if (this.packPresent || stallMs <= 0) return this.inner.translate(maskedText, context);
    const own = new AbortController();
    const forward = (): void => own.abort(context.signal?.reason);
    if (context.signal?.aborted) forward();
    else context.signal?.addEventListener('abort', forward, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        own.abort();
        reject(new EngineError(MODEL_MESSAGES.downloadStalled, 'stalled'));
      }, stallMs);
    });
    const work = this.inner.translate(maskedText, { signal: own.signal });
    // بعد التأخر يرفض الانتظار الداخلي بـAbortError: لا يُترك رفضًا غير ملتقَط.
    work.catch(() => undefined);
    try {
      return await Promise.race([work, stalled]);
    } finally {
      clearTimeout(timer);
      context.signal?.removeEventListener('abort', forward);
    }
  }

  private explain(error: unknown): unknown {
    const classified = classifyModelError(error, { packPresent: this.packPresent });
    const aborted = (error instanceof Error || error instanceof DOMException) && error.name === 'AbortError';
    if (!this.packPresent && (classified || aborted)) this.consented = false;
    return classified ? new EngineError(classified.message, classified.kind) : error;
  }
}

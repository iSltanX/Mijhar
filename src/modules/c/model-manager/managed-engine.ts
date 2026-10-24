// المحرك المُدار (T-4.4، DEC-03 ج-2): يلفّ محرك Translator API ويضيف ما يلزم قبل أن يبدأ المتصفح تنزيل حزمة اللغة:
//  - availability() تسأل المتصفح عن الحزمة (استعلام بلا تنزيل ولا إنشاء مترجم)؛ فإن كانت 'downloadable' ولم يوافق المستخدم بعد أعادت {state:'consent'} وبطاقة
//    الاستئذان، ولا تصير 'ready' إلا بعد grantConsent() من نقرة «موافق». وهكذا لا يُستدعى create() (الذي ينزّل) قبل فعل المستخدم ثم موافقته.
//  - أخطاء الحزمة (انقطاع الشبكة، امتلاء القرص) تُترجَم إلى رسائل واضحة (errors.ts)، وتسقط الموافقة بعد فشل لم تكتمل فيه الحزمة أو بعد إلغاء،
//    فيُسأل المستخدم من جديد قبل المحاولة التالية. ولا تسقط عند NotSupportedError المتقطع ولا NotAllowedError: الحزمة لم تُنزَّل لكنه وافق للتوّ.
//  - ما سوى ذلك يمرّ كما هو: الترجمة والإلغاء بـAbortSignal وسائر الأخطاء.
import { ENGINE_MESSAGES, EngineError } from '../engines';
import type { Availability, TranslateContext, TranslationService } from '../ui/service';
import { consentCard } from './consent';
import { classifyModelError } from './errors';

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
    if (state === 'downloadable' && !this.consented) return { state: 'consent', card: consentCard() };
    return base;
  }

  /** من نقرة «موافق» في البطاقة. */
  grantConsent(): void {
    this.consented = true;
  }

  async translate(maskedText: string, context: TranslateContext = {}): Promise<string> {
    try {
      const output = await this.inner.translate(maskedText, context);
      this.packPresent = true;
      return output;
    } catch (error) {
      throw this.explain(error);
    }
  }

  private explain(error: unknown): unknown {
    const classified = classifyModelError(error, { packPresent: this.packPresent });
    const aborted = (error instanceof Error || error instanceof DOMException) && error.name === 'AbortError';
    if (!this.packPresent && (classified || aborted)) this.consented = false;
    return classified ? new EngineError(classified.message, classified.kind) : error;
  }
}

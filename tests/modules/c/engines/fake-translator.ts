// صنف Translator وهمي بشكل الواجهة العامة (TEST-TR-04 «بمحرك وهمي»): دالة بطريقتين ثابتتين availability وcreate، يحاكي ما قاسته T-0.2:
// حالات الزوج en→ar، وNotSupportedError المتقطع في أول create()، وNotAllowedError بلا نقرة والحزمة 'downloadable'، وتحريف صيغة الخطة ⟦CODE_0⟧ إلى code_0
// كما فعل Translator API في Chrome، مع حفظ {0} و[[0]]. لا شبكة ولا نموذج.
import type { TranslatorFactory, TranslatorInstance, TranslatorLanguages } from '../../../../src/modules/c/engines';

export interface FakeTranslatorOptions {
  /** ما تعيده availability(). */
  state?: string;
  /** أسماء أخطاء ترميها create() في استدعاءاتها الأولى بالترتيب ('NotSupportedError'…). */
  createFailures?: string[];
  /** الترجمة الوهمية للنص المرسل. الافتراضي: بادئة عربية مع تحريف ⟦…⟧ كما قيس في Chrome. */
  transform?: (input: string) => string;
  /** خطأ ترميه translate() (اسمه). */
  translateFailure?: string;
  /** تأخير create() بالمللي ثانية. */
  createDelayMs?: number;
}

/** يحاكي Translator API في Chrome (T-0.2، raw/token-formats.json): ⟦CODE_0⟧ ← code_0، وبقية الصيغ كما هي. */
export const chromeLike = (input: string): string => `ترجمة: ${input.replace(/⟦([A-Z]+)_(\d+)⟧/g, (_m, type: string, n: string) => `${type.toLowerCase()}_${n}`)}`;

const domError = (name: string): DOMException => new DOMException(`fake ${name}`, name);

export class FakeTranslatorApi {
  state: string;
  createFailures: string[];
  transform: (input: string) => string;
  translateFailure: string | null;
  createDelayMs: number;
  availabilityCalls = 0;
  createCalls = 0;
  /** النصوص التي وصلت translate() بالترتيب. */
  readonly received: string[] = [];
  readonly languages: TranslatorLanguages[] = [];

  constructor(options: FakeTranslatorOptions = {}) {
    this.state = options.state ?? 'available';
    this.createFailures = [...(options.createFailures ?? [])];
    this.transform = options.transform ?? chromeLike;
    this.translateFailure = options.translateFailure ?? null;
    this.createDelayMs = options.createDelayMs ?? 0;
  }

  /** كما يُرى في السياق العام: typeof Translator === 'function' بطريقتيه. */
  asGlobal(): TranslatorFactory {
    const self = this;
    const Translator = function Translator(): never {
      throw new TypeError('Illegal constructor');
    } as unknown as TranslatorFactory & (() => never);
    Translator.availability = async (languages: TranslatorLanguages) => {
      self.availabilityCalls += 1;
      self.languages.push(languages);
      return self.state;
    };
    Translator.create = async (languages: TranslatorLanguages): Promise<TranslatorInstance> => {
      self.createCalls += 1;
      self.languages.push(languages);
      if (self.createDelayMs) await new Promise((resolve) => setTimeout(resolve, self.createDelayMs));
      const failure = self.createFailures.shift();
      if (failure) throw domError(failure);
      if (self.state === 'unavailable') throw domError('NotSupportedError');
      return {
        translate: async (input: string, options?: { signal?: AbortSignal }) => {
          options?.signal?.throwIfAborted();
          self.received.push(input);
          if (self.translateFailure) throw domError(self.translateFailure);
          return self.transform(input);
        },
      };
    };
    return Translator;
  }
}

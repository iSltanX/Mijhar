// محرك ترجمة وهمي للاختبار (T-4.1: «محرك وهمي للاختبار»): ينفّذ TranslationService بسلوكات محددة سلفًا تُنتج المخرجات التي تُختبر بها واجهة الترجمة
// وقاعدة الفشل الآمن، دون أي نموذج ولا شبكة. لا يُسجَّل في أي مكان تلقائيًا ولا يستورده أي كود يُشحن (الاختبارات وحدها)، ويتحقق اختبار البناء من خلو
// الحزمة المشحونة منه. «الترجمة» الحتمية هنا: بادئة عربية ثابتة (أو عكس ترتيب الكلمات) مع بقاء الرموز كما هي؛ لا تدّعي ترجمة حقيقية.
import type { Availability, TranslateContext, TranslationService } from './service';

export type FakeMode =
  /** بادئة «ترجمة: » ثم النص برموزه كما هو. */
  | 'faithful'
  /** يعكس ترتيب الكلمات والرموز سليمة (يختبر ربط الرمز بعنصره حين تتبدل مواضعها). */
  | 'reorder'
  /** يُسقط الرمز الأول (فحص العدد والهوية). */
  | 'drop'
  /** يكرر الرمز الأول (فحص عدم التكرار). */
  | 'duplicate'
  /** يختلق رمزًا غير مسجل (فحص عدم الاختلاق). */
  | 'invent'
  /** يترجم اسم الرمز نفسه إلى [كود_N] (فحص الهوية). */
  | 'garble'
  /** يخل بالرموز حين يرسَل إليه أكثر من جملة، ويسلم حين تُرسَل جملة واحدة (يستدعي مسار إعادة الترجمة جملةً جملةً). */
  | 'flaky-whole'
  /** يرمي خطأً (تعطل المحرك). */
  | 'error';

export interface FakeOptions {
  readonly mode?: FakeMode;
  readonly delayMs?: number;
  readonly availability?: Availability;
  readonly label?: string;
}

const TOKEN = /⟦[^⟦⟧]*⟧/g;
const sentences = (text: string): string[] => text.split(/(?<=[.!?؟])\s+/).filter((s) => s.trim());

export class FakeTranslationEngine implements TranslationService {
  readonly id = 'fake';
  readonly label: string;
  /** عدد استدعاءات translate: يجب أن يبقى صفرًا قبل أي فعل صريح من المستخدم. */
  calls = 0;
  /** النصوص المرسلة إلى المحرك بالترتيب. */
  readonly received: string[] = [];
  mode: FakeMode;
  delayMs: number;
  availabilityState: Availability;

  constructor(options: FakeOptions = {}) {
    this.mode = options.mode ?? 'faithful';
    this.delayMs = options.delayMs ?? 0;
    this.availabilityState = options.availability ?? { state: 'ready' };
    this.label = options.label ?? 'محرك اختبار وهمي';
  }

  async availability(): Promise<Availability> {
    return this.availabilityState;
  }

  async translate(masked: string, context: TranslateContext = {}): Promise<string> {
    this.calls += 1;
    this.received.push(masked);
    await this.wait(context.signal);
    context.signal?.throwIfAborted();
    switch (this.mode) {
      case 'faithful':
        return `ترجمة: ${masked}`;
      case 'reorder':
        return masked.split(' ').reverse().join(' ');
      case 'drop':
        return `ترجمة: ${masked.replace(TOKEN, '')}`;
      case 'duplicate': {
        const first = masked.match(TOKEN)?.[0];
        return first ? `ترجمة: ${masked} ${first}` : `ترجمة: ${masked}`;
      }
      case 'invent':
        return `ترجمة: ${masked} ⟦CODE_99⟧`;
      case 'garble':
        return `ترجمة: ${masked.replace(/⟦([A-Z]+)_(\d+)⟧/g, '[كود_$2]')}`;
      case 'flaky-whole':
        return sentences(masked).length > 1 ? `ترجمة: ${masked.replace(TOKEN, '')}` : `ترجمة: ${masked}`;
      case 'error':
        throw new Error('تعطل محرك الاختبار الوهمي');
    }
  }

  private wait(signal?: AbortSignal): Promise<void> {
    if (!this.delayMs) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, this.delayMs);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }
}

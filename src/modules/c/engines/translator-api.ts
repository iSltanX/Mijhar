// مهايئ Translator API (T-4.3، DEC-03 ج-2): مترجم المتصفح المدمج خلف TranslationService، في سكربت المحتوى وحده، وهو السياق الذي ثبت فيه في T-0.2
// (create() تحتاج نقرة المستخدم ما دامت حزمة اللغة 'downloadable'، ثم تعمل بلا تفاعل). المتصفح ينزّل حزمته ويديرها بنفسه، فلا شبكة من الإضافة هنا.
//  - availability() تسأل المتصفح عن الزوج en→ar ولا تنشئ مترجمًا ولا تنزّل شيئًا؛ 'downloadable' و'downloading' و'available' جاهزة (التنزيل عند أول ضغط)،
//    و'unavailable' (Edge في T-0.2) سبب صريح، وأي قيمة أخرى غير معروفة لا تُعدّ جاهزة.
//  - المترجم يُنشأ عند أول ترجمة (وهي من فعل صريح) ويُعاد استعماله. NotSupportedError في أول create() متقطع في ملف تعريف جديد (Brave وChrome في T-0.2،
//    وBrave على github.com في evidence/T-4.3): يُعاد أولًا بعد مهلة قصيرة ضمن مدة نشاط النقرة، ثم بمهل أطول ما دامت الحزمة 'available' (لا يلزمها نشاط
//    نقرة)، ثم يُرمى خطأ يطلب الإعادة، ولا يُحفظ غيابًا: الضغط التالي يحاول من جديد.
//  - الرموز تعبر بصيغة يحفظها المحرك (wire.ts) وتعود ⟦TYPE_N⟧ قبل الفاحص؛ الفحص الرباعي والفشل الآمن خارج المحرك كما في عقد الخدمة.
import type { Availability, TranslateContext, TranslationService } from '../ui/service';
import { ENGINE_MESSAGES } from './messages';
import { encodeTokens } from './wire';

export type TranslatorAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

export interface TranslatorLanguages {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
}

export interface TranslatorInstance {
  translate(input: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?(): void;
}

/** ما تستعمله الطبقة من الصنف العام Translator. */
export interface TranslatorFactory {
  availability(options: TranslatorLanguages): Promise<string>;
  create(options: TranslatorLanguages): Promise<TranslatorInstance>;
}

export const LANGUAGES: TranslatorLanguages = { sourceLanguage: 'en', targetLanguage: 'ar' };
const READY: ReadonlySet<string> = new Set<TranslatorAvailability>(['downloadable', 'downloading', 'available']);
/** مهل إعادة create() بعد NotSupportedError؛ الأولى داخل مدة نشاط النقرة، والباقي والحزمة 'available' وحدها. */
const RETRY_DELAYS_MS: readonly number[] = [1000, 3000, 6000];

/** الصنف Translator في هذا السياق إن وُجد بطريقتيه، وإلا null. */
export function translatorFactoryOf(scope: object = globalThis): TranslatorFactory | null {
  const candidate = (scope as { Translator?: unknown }).Translator;
  if (typeof candidate !== 'function') return null;
  const factory = candidate as Partial<TranslatorFactory>;
  return typeof factory.create === 'function' && typeof factory.availability === 'function' ? (factory as TranslatorFactory) : null;
}

/** خطأ من المحرك بنص للمستخدم؛ code اسم الخطأ الأصلي للتشخيص. */
export class EngineError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}

const nameOf = (error: unknown): string => (error instanceof Error || error instanceof DOMException ? error.name : '');
const textOf = (error: unknown): string => (error instanceof Error || error instanceof DOMException ? error.message : String(error));

function explain(error: unknown): unknown {
  const name = nameOf(error);
  if (name === 'AbortError') return error;
  if (name === 'NotAllowedError') return new EngineError(ENGINE_MESSAGES.needsGesture, name);
  if (name === 'NotSupportedError') return new EngineError(ENGINE_MESSAGES.notReady, name);
  if (name === 'QuotaExceededError') return new EngineError(ENGINE_MESSAGES.tooLong, name);
  return error;
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export interface TranslatorApiOptions {
  readonly retryDelaysMs?: readonly number[];
}

export class TranslatorApiEngine implements TranslationService {
  readonly id = 'translator-api';
  readonly label = 'مترجم المتصفح المدمج (Translator API)';
  private instance: Promise<TranslatorInstance> | null = null;

  constructor(
    private readonly factory: TranslatorFactory,
    private readonly options: TranslatorApiOptions = {},
  ) {}

  /** حالة الزوج en→ar كما يعلنها المتصفح، بلا تحويل (لإدارة التنزيل في T-4.4). */
  status(): Promise<string> {
    return this.factory.availability(LANGUAGES);
  }

  async availability(): Promise<Availability> {
    let state: string;
    try {
      state = await this.status();
    } catch (error) {
      return { state: 'unavailable', reason: `${ENGINE_MESSAGES.checkFailed}: ${textOf(error)}` };
    }
    if (READY.has(state)) return { state: 'ready' };
    if (state === 'unavailable') return { state: 'unavailable', reason: ENGINE_MESSAGES.pairUnavailable };
    return { state: 'unavailable', reason: `${ENGINE_MESSAGES.unknownState} (${state})` };
  }

  async translate(maskedText: string, context: TranslateContext = {}): Promise<string> {
    const { signal } = context;
    signal?.throwIfAborted();
    const codec = encodeTokens(maskedText);
    const translator = await abortable(this.translator(), signal);
    let output: string;
    try {
      output = await translator.translate(codec.wire, signal ? { signal } : undefined);
    } catch (error) {
      throw explain(error);
    }
    return codec.decode(output);
  }

  private translator(): Promise<TranslatorInstance> {
    this.instance ??= this.create().catch((error: unknown) => {
      this.instance = null;
      throw explain(error);
    });
    return this.instance;
  }

  private async create(): Promise<TranslatorInstance> {
    const delays = this.options.retryDelaysMs ?? RETRY_DELAYS_MS;
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.factory.create(LANGUAGES);
      } catch (error) {
        if (nameOf(error) !== 'NotSupportedError' || attempt >= delays.length) throw error;
        if (attempt > 0 && (await this.status().catch(() => '')) !== 'available') throw error;
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
      }
    }
  }
}

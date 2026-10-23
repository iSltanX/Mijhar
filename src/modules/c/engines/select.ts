// اختيار المحرك وفق DEC-03 (ج-2، data/plan.json): محركات المتصفح وحدها بلا ONNX ولا تنزيل نموذج من الإضافة.
//  - Translator API إن وُجدت في هذا السياق؛ وتوفّر الزوج en→ar يُكتشف وقت التشغيل (availability)، لا من اسم المتصفح: ثبتت في Chrome وBrave، وتعلن
//    'unavailable' في Edge فيُعرض سببه، وتغيب في Firefox (T-0.2).
//  - وإلا «لا محرك محلي»: حالة صريحة وبديل نسخ النص المقنَّع، بلا أي اتصال.
//  - browser.trial.ml (Firefox) لا يُوصل: مهمة الترجمة فيه لم تُقَس إلا بنموذج `Xenova/opus-mt-en-ar` الذي لم يثبت ترخيصه (HYP-05)، ويُعاد النظر
//    حين يثبت ترخيص نموذج يقبله ويُقاس.
import { setTranslationService } from '../ui/service';
import type { Availability, TranslationService } from '../ui/service';
import { ENGINE_MESSAGES } from './messages';
import { TranslatorApiEngine, translatorFactoryOf } from './translator-api';

/** محرك يعلن غيابه بسبب صريح؛ لا يترجم ولا يتصل. */
export class UnavailableEngine implements TranslationService {
  readonly id = 'none';
  readonly label = 'لا مترجم محلي';

  constructor(readonly reason: string) {}

  async availability(): Promise<Availability> {
    return { state: 'unavailable', reason: this.reason };
  }

  async translate(): Promise<string> {
    throw new Error(this.reason);
  }
}

export function selectLocalEngine(scope: object = globalThis): TranslationService {
  const factory = translatorFactoryOf(scope);
  return factory ? new TranslatorApiEngine(factory) : new UnavailableEngine(ENGINE_MESSAGES.noEngine);
}

/** يسجّل المحرك المختار لواجهة الترجمة. يُستدعى عند بدء سكربت المحتوى؛ لا يسأل المتصفح ولا يترجم. */
export function installTranslationEngine(scope: object = globalThis): TranslationService {
  const engine = selectLocalEngine(scope);
  setTranslationService(engine);
  return engine;
}

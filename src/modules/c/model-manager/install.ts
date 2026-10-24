// تسجيل المحرك المُدار لواجهة الترجمة عند بدء سكربت المحتوى (T-4.4): يختار selectLocalEngine المحرك وفق DEC-03 (T-4.3)، فإن كان Translator API لُفَّ
// بإدارة الحزمة، وإلا (لا محرك) يبقى كما هو بسببه الصريح وبديل النسخ. لا يسأل المتصفح ولا ينشئ مترجمًا ولا يتصل.
import { selectLocalEngine, TranslatorApiEngine } from '../engines';
import { setTranslationService } from '../ui/service';
import type { TranslationService } from '../ui/service';
import { ManagedTranslationEngine } from './managed-engine';

export function installManagedTranslationEngine(scope: object = globalThis): TranslationService {
  const engine = selectLocalEngine(scope);
  const managed = engine instanceof TranslatorApiEngine ? new ManagedTranslationEngine(engine, () => engine.status()) : engine;
  setTranslationService(managed);
  return managed;
}

// عقد الوحدة (ExtensionModule) وسجل الوحدات. لا تستدعي وحدة وحدةً أخرى مباشرة (EXECUTION_PLAN.md ‏4.1)؛
// تتصل كلها بالنواة عبر ModuleContext وحده.
//
// ملف مشترك بين المراحل (Docs/MJ/README.md «الملكية ومناطق التعارض»): تضيف كل مرحلة وحدةً سطرًا واحدًا
// في BUILTIN_MODULES أدناه، فتُضم الأسطر بترتيب الدمج ولا يُختار فيها نسخة.
import type { Confidence, PageState, PageType, SelectorEntry, SelectorsRegistry } from './detector';
import type { MutationRecorder } from './lifecycle/mutation-registry';
import { MODULE_A } from '../modules/a/scope/module';
import { CARD_MODULE } from '../modules/b/card/module';
import { SEARCH_MODULE } from '../modules/b/search/module';
import { TOURS_MODULE } from '../modules/b/tours/module';
import { TRANSLATE_MODULE } from '../modules/c/ui/module';
import { COMPARE_MODULE } from '../modules/d/compare/module';
import { LOG_MODULE } from '../modules/d/log-parser/module';
import { PR_STATUS_MODULE } from '../modules/d/pr-status/module';
import { CONTEXT_BUILDER_MODULE } from '../modules/e/builder/module';
import { COPY_PROMPT_MODULE } from '../modules/e/copy-prompt/module';
import { COMPOSER_MODULE } from '../modules/f/composer/module';
import { BOOKMARKS_MODULE } from '../modules/g/bookmarks/module';
import { MODULE_G } from '../modules/g/notes/module';
import { MODULE_H } from '../modules/h/module';

/** ما تراه الوحدة من النواة وقت التركيب. كل ما ينشئه عبره يُزال بإيقافها. */
export interface ModuleContext {
  readonly moduleId: string;
  readonly document: Document;
  /** الصفحة وقت التركيب. تنقّل Turbo لا يغيّرها: تُركَّب الوحدة من جديد بسياق جديد. */
  readonly page: PageState;
  readonly selectors: SelectorsRegistry;
  /** كل تعديل DOM يمرّ هنا ليُسجَّل عكسه (انظر «استثناءات الاستعادة»). */
  readonly mutations: MutationRecorder;
  /** يُلغى عند الإيقاف: توقف عنده كل عمل غير متزامن بدأته الوحدة. */
  readonly signal: AbortSignal;
  /** مستمع يُزال تلقائيًا عند الإيقاف. */
  listen(target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean): void;
  /** مراقب تعديلات يُفصل تلقائيًا عند الإيقاف. */
  observe(target: Node, init: MutationObserverInit, callback: MutationCallback): MutationObserver;
  /** عمل تنظيف مخصص يُنفَّذ عند الإيقاف بترتيب معاكس للتسجيل، قبل استعادة DOM. */
  onTeardown(cleanup: () => void): void;
}

export interface ExtensionModule {
  /** معرّف ثابت فريد، وهو مفتاح تشغيل الوحدة في الإعدادات (modules.<id>.enabled). */
  readonly id: string;
  readonly title: string;
  /** أنواع الصفحات التي تُركَّب فيها الوحدة، أو '*' لكل صفحات GitHub. */
  readonly pages: readonly PageType[] | '*';
  /** أدنى ثقة في الاكتشاف للتركيب. الافتراضي 'low' (يكفي المسار)؛ 'high' يشترط تأكيد بنية الصفحة. */
  readonly minConfidence?: Confidence;
  /** شرط إضافي بعد pages وminConfidence. */
  readonly shouldMount?: (page: PageState) => boolean;
  /** محددات تضيفها الوحدة إلى SelectorsRegistry؛ لا تستبدل مفتاحًا عُدِّل قبلها. */
  readonly selectors?: readonly SelectorEntry[];
  /**
   * يركّب الوحدة. متزامنة: يبدأ العمل غير المتزامن داخلها ويراقب ctx.signal. استثناء هنا يُعزل: تُستعاد
   * التعديلات الجزئية وتبقى بقية الوحدات تعمل.
   */
  mount(ctx: ModuleContext): void;
  /** تنظيف إضافي يسبق الاستعادة المسجَّلة. اختياري. */
  unmount?(ctx: ModuleContext): void;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, high: 1 };

/** هل تلائم الوحدة الصفحة بحسب pages وminConfidence وshouldMount (دون النظر إلى مفتاح التشغيل). */
export function moduleMatchesPage(module: ExtensionModule, page: PageState): boolean {
  if (module.pages !== '*' && !module.pages.includes(page.type)) return false;
  if (page.type === 'external') return false;
  if (CONFIDENCE_RANK[page.confidence] < CONFIDENCE_RANK[module.minConfidence ?? 'low']) return false;
  return module.shouldMount ? module.shouldMount(page) : true;
}

export class ModuleRegistry {
  private readonly modules = new Map<string, ExtensionModule>();

  constructor(initial: readonly ExtensionModule[] = []) {
    for (const module of initial) this.register(module);
  }

  register(module: ExtensionModule): void {
    if (!module.id) throw new Error('ExtensionModule بلا id');
    if (this.modules.has(module.id)) throw new Error(`وحدة بمعرّف مكرر: ${module.id}`);
    if (typeof module.mount !== 'function') throw new Error(`الوحدة ${module.id} بلا mount`);
    this.modules.set(module.id, module);
  }

  get(id: string): ExtensionModule | undefined {
    return this.modules.get(id);
  }

  /** بترتيب التسجيل (وهو ترتيب التركيب؛ الإيقاف بالعكس). */
  list(): ExtensionModule[] {
    return [...this.modules.values()];
  }
}

// الوحدات الجاهزة للتركيب في الإضافة. سطر واحد لكل وحدة، تضيفه مرحلتها.
export const BUILTIN_MODULES: readonly ExtensionModule[] = [
  MODULE_A, // MJ6 (T-2.1، T-2.7): الوحدة (أ)
  CARD_MODULE, // MJ8 (T-3.2): الوحدة (ب): بطاقة الشرح
  SEARCH_MODULE, // MJ10 (T-3.4): الوحدة (ب): البحث في القاموس وإبراز الموضع
  TRANSLATE_MODULE, // MJ10 (T-4.1): الوحدة (ج): واجهة الترجمة عند الطلب
  PR_STATUS_MODULE, // MJ8 (T-5.1): الوحدة (د): ملخص حالة طلب الدمج
  COMPARE_MODULE, // MJ8 (T-5.4): الوحدة (د): ملخص المقارنة
  COMPOSER_MODULE, // MJ10 (T-7.1): الوحدة (و): مساعد تنظيم Issue/PR
  LOG_MODULE, // MJ11 (T-5.3): الوحدة (د): شرح سجل الفحص
  MODULE_G, // MJ9 (T-8.1): الوحدة (ز) الملاحظات الخاصة
  MODULE_H, // MJ9 (T-9.1، T-9.4): الوحدة (ح) شريط README العربي وبطاقة الملف الشخصي
  BOOKMARKS_MODULE, // MJ12 (T-8.2): الوحدة (ز) زر «أكمل لاحقًا»
  TOURS_MODULE, // MJ13 (T-3.5): الوحدة (ب): الجولات الإرشادية القرائية الآمنة
  CONTEXT_BUILDER_MODULE, // MJ15 (T-6.1): الوحدة (هـ): منشئ حزمة السياق
  COPY_PROMPT_MODULE, // MJ20 (T-11.3): الوحدة (هـ): زر نسخ البرومبت
];

export function createModuleRegistry(modules: readonly ExtensionModule[] = BUILTIN_MODULES): ModuleRegistry {
  return new ModuleRegistry(modules);
}

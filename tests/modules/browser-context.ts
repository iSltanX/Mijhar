// تركيب وحدة في صفحة حقيقية داخل المتصفح لاختبارات e2e (لا تُشحن): ModuleContext أدنى يطابق ما يبنيه LifecycleManager
// (إلغاء signal ← التنظيف بترتيب معاكس ← استعادة السجل). العينات تُخدم من 127.0.0.1 فيعدّها PageDetector صفحة خارجية؛ لذا تُمرَّر
// حالة الصفحة صراحةً بعنوان github.com المقابل (PageState.href) والمحددات هي نفسها (DEFAULT_SELECTORS ومحددات الوحدة).
import { DEFAULT_SELECTORS, MutationRecorder, SelectorsRegistry, classifyPath } from '../../src/core';
import type { ExtensionModule, ModuleContext, PageState, RestoreReport } from '../../src/core';

export interface MountedModule {
  readonly ctx: ModuleContext;
  /** يوقف الوحدة بترتيب الإيقاف الفعلي ويعيد تقرير الاستعادة. */
  stop(): RestoreReport;
}

export function pageStateFor(href: string, confidence: PageState['confidence'] = 'high'): PageState {
  const url = new URL(href);
  const route = classifyPath(url.pathname);
  const contentRoot = document.querySelector('#js-repo-pjax-container, #repo-content-turbo-frame, main') ?? document.body;
  return { href, type: route.type, owner: route.owner, repo: route.repo, number: route.number, confidence, contentRoot };
}

export function mountInPage(module: ExtensionModule, href: string): MountedModule {
  const selectors = new SelectorsRegistry(DEFAULT_SELECTORS);
  for (const entry of module.selectors ?? []) if (!selectors.has(entry.key)) selectors.define(entry);
  const mutations = new MutationRecorder(module.id);
  const controller = new AbortController();
  const disposers: Array<() => void> = [];
  const ctx: ModuleContext = {
    moduleId: module.id,
    document,
    page: pageStateFor(href),
    selectors,
    mutations,
    signal: controller.signal,
    listen(target, type, listener, options) {
      target.addEventListener(type, listener, options);
      disposers.push(() => target.removeEventListener(type, listener, options));
    },
    observe(target, init, callback) {
      const observer = new MutationObserver(callback);
      observer.observe(target, init);
      disposers.push(() => observer.disconnect());
      return observer;
    },
    onTeardown(cleanup) {
      disposers.push(cleanup);
    },
  };
  module.mount(ctx);
  return {
    ctx,
    stop() {
      controller.abort();
      module.unmount?.(ctx);
      for (const dispose of disposers.splice(0).reverse()) dispose();
      return mutations.restore();
    },
  };
}

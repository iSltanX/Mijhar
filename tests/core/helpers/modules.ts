// وحدات وهمية تغطي كل ما يسجّله Mutation Registry: إدراج وسمات وأصناف وأنماط وبديل ومستمعات ومراقب.
import type { ExtensionModule, PageType } from '../../../src/core';

/** العنصر الذي تعدّل الوحدات الوهمية سمته dir وstyle (أول مطابق بترتيب المستند). */
export const MARKER_TARGET = '#readme, .comment-body, .gh-header-title';

export interface MarkerOptions {
  id: string;
  pages: readonly PageType[] | '*';
  /** يُركَّب هذا العنصر المحقون في الحاوية الرئيسية. */
  containerSelector?: string;
}

export interface MarkerStats {
  mounts: number;
  unmounts: number;
}

/** وحدة وهمية «كاملة»: كل تعديل فيها يمر بـctx.mutations. تعيد الوحدة وعدّادي mount/unmount. */
export function markerModule(options: MarkerOptions): { module: ExtensionModule; stats: MarkerStats } {
  const stats: MarkerStats = { mounts: 0, unmounts: 0 };
  const { id } = options;
  const module: ExtensionModule = {
    id,
    title: `وحدة وهمية ${id}`,
    pages: options.pages,
    mount(ctx) {
      stats.mounts += 1;
      const { document: doc, mutations } = ctx;
      const host = doc.querySelector(options.containerSelector ?? 'main') ?? doc.body;
      const badge = doc.createElement('div');
      badge.setAttribute('data-mijhar-injected', id);
      badge.textContent = `حقن ${id}`;
      mutations.insert(host, badge);

      const style = doc.createElement('style');
      style.id = `mijhar-${id}-styles`;
      style.textContent = `.mijhar-${id}{color:inherit}`;
      mutations.insert(doc.head, style);

      mutations.setAttribute(doc.body, `data-mijhar-${id}`, 'on');
      mutations.addClass(doc.body, `mijhar-${id}`);
      const readme = doc.querySelector(MARKER_TARGET);
      if (readme) {
        mutations.setStyle(readme as HTMLElement, 'direction', 'rtl');
        mutations.setAttribute(readme, 'dir', 'rtl');
      }
      ctx.listen(doc, 'click', () => {});
      ctx.listen(doc.defaultView as Window, 'resize', () => {});
      ctx.observe(doc.body, { childList: true }, () => {});
    },
    unmount() {
      stats.unmounts += 1;
    },
  };
  return { module, stats };
}

export const injectedCount = (doc: Document, id?: string): number =>
  doc.querySelectorAll(id ? `[data-mijhar-injected="${id}"]` : '[data-mijhar-injected]').length;

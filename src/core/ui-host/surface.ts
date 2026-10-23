// سطح واجهة لوحدة: مضيف Shadow DOM يُدرج في الصفحة عبر ctx.mutations فيُزال بإيقاف الوحدة، ويُرسم فيه بـPreact.
// ترتيب الإزالة: onTeardown (render(null) يفك مكوّنات Preact ومستمعاتها) ثم استعادة DOM (إزالة المضيف).
import { render } from 'preact';
import type { ComponentChild } from 'preact';
import type { ModuleContext } from '../registry';
import { createShadowHost } from './shadow';
import type { ShadowParts } from './shadow';

export interface SurfaceOptions {
  readonly parent: Node;
  readonly before?: Node | null;
  /** inline: inline-block داخل سطر (زر صغير بجوار عنصر من GitHub). الافتراضي block. */
  readonly display?: 'block' | 'inline';
  readonly styles?: string;
  readonly label?: string;
}

export interface UiSurface extends ShadowParts {
  render(child: ComponentChild): void;
}

export function mountSurface(ctx: ModuleContext, options: SurfaceOptions): UiSurface {
  const parts = createShadowHost(ctx.document, {
    name: ctx.moduleId,
    ...(options.styles ? { styles: options.styles } : {}),
    ...(options.label ? { label: options.label } : {}),
  });
  if (options.display === 'inline') parts.host.setAttribute('data-display', 'inline');
  ctx.mutations.insert(options.parent, parts.host, options.before ?? null);
  let rendered = false;
  ctx.onTeardown(() => {
    if (rendered) render(null, parts.root);
    rendered = false;
  });
  return {
    ...parts,
    render(child) {
      if (ctx.signal.aborted) return;
      render(child, parts.root);
      rendered = true;
    },
  };
}

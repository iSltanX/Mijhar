// سطح واجهة لوحدة: مضيف Shadow DOM يُدرج في الصفحة عبر ctx.mutations فيُزال بإيقاف الوحدة، ويُرسم فيه بـPreact.
// ترتيب الإزالة: onTeardown (render(null) يفك مكوّنات Preact ومستمعاتها) ثم استعادة DOM (إزالة المضيف).
// البقاء بعد إعادة رسم الصفحة (MJ-F-01، F-01): في التحميل الكامل لصفحات طلب الدمج والمشكلة يستبدل GitHub بعد الإماهة الشجرةَ التي أُدرج فيها
// المضيف، والكاشف لا يعلن تنقلًا (البصمة كما هي)؛ فسطح بمرساة (keep) يراقب المستند ويعيد المضيف نفسه إلى موضعه الجديد، فتبقى حالة واجهته.
import { render } from 'preact';
import type { ComponentChild } from 'preact';
import type { ModuleContext } from '../registry';
import { createShadowHost } from './shadow';
import type { ShadowParts } from './shadow';

/** موضع إدراج: الأب والعقدة التي يُدرج قبلها (null: في آخره). */
export interface Spot {
  readonly parent: Node;
  readonly before: Node | null;
}

export interface KeepOptions {
  /** موضع المضيف عند مرساته في الصفحة الآن، أو null إن لم تظهر المرساة بعد (فيُنتظر تعديل تالٍ). */
  readonly anchor: () => Spot | null;
  /** موضع احتياطي (كما في التركيب الأول بلا مرساة) يُستعمل إن بقيت المرساة غائبة KEEP_FALLBACK_MS. */
  readonly fallback?: () => Spot | null;
  /** بعد كل إعادة (لتقرأ الوحدة ما رسمته الصفحة من جديد). */
  readonly onReattach?: () => void;
}

/** مهلة انتظار المرساة قبل الموضع الاحتياطي: كحد هدوء الكاشف (settleMaxMs). */
export const KEEP_FALLBACK_MS = 1000;

export interface SurfaceOptions {
  readonly parent: Node;
  readonly before?: Node | null;
  /** inline: inline-block داخل سطر (زر صغير بجوار عنصر من GitHub). الافتراضي block. */
  readonly display?: 'block' | 'inline';
  readonly styles?: string;
  readonly label?: string;
  /** يُبقي المضيف في الصفحة إن أبعدته إعادة رسمها (keepAttached). */
  readonly keep?: KeepOptions;
}

export type KeepContext = Pick<ModuleContext, 'document' | 'mutations' | 'signal' | 'observe' | 'onTeardown'>;

/** موضع صالح الآن: أبوه في المستند، والعقدة التي يُدرج قبلها (إن وُجدت) من أبنائه. */
const usable = (spot: Spot | null): spot is Spot => spot !== null && spot.parent.isConnected && (spot.before === null || spot.before.parentNode === spot.parent);

/**
 * يُبقي مضيفًا أدرجته الوحدة (ctx.mutations.insert) في الصفحة: حين يجده مفصولًا بعد تعديل في المستند يعيده بـreattach إلى موضع مرساته الحالي، أو
 * إلى الموضع الاحتياطي إن غابت المرساة KEEP_FALLBACK_MS. المضيف نفسه يُعاد فلا تكرار ولا ضياع لحالة واجهته؛ والمراقب والمؤقت يُفكّان بإيقاف الوحدة،
 * وبعدها لا يُعاد شيء (السجل مغلق).
 */
export function keepAttached(ctx: KeepContext, host: Element, options: KeepOptions): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const place = (spot: Spot): void => {
    try {
      if (ctx.mutations.reattach(spot.parent, host, spot.before)) options.onReattach?.();
    } catch (error) {
      console.error(`[mijhar] ${host.getAttribute('data-mijhar-host') ?? 'mijhar-host'}: تعذّرت إعادة المضيف`, error);
    }
  };
  const check = (): void => {
    if (ctx.signal.aborted || host.isConnected) {
      clear();
      return;
    }
    const spot = options.anchor();
    if (usable(spot)) {
      clear();
      place(spot);
      return;
    }
    if (!options.fallback || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      if (ctx.signal.aborted || host.isConnected) return;
      const spot = options.anchor() ?? options.fallback?.() ?? null;
      if (usable(spot)) place(spot);
    }, KEEP_FALLBACK_MS);
  };
  ctx.observe(ctx.document, { childList: true, subtree: true }, check);
  ctx.onTeardown(clear);
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
  if (options.keep) keepAttached(ctx, parts.host, options.keep);
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

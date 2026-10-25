// زر «أكمل لاحقًا» في الصفحة (الوحدة ز): شريط مدمج في أول حاوية المحتوى يحفظ الصفحة بموضع التمرير أو السطر المحدد، ويعرض حالتها
// إن كانت محفوظة. يفتح التخزين كسولًا (context.ts) ويتبع تنقل الصفحة والهاش؛ والإيقاف يفك الشريط ويعيد DOM كما كان. لا يصدر طلبًا.
import type { ComponentChildren } from 'preact';
import type { ExtensionModule, ModuleContext } from '../../../core/registry';
import { mountSurface } from '../../../core/ui-host/surface';
import type { Spot } from '../../../core/ui-host/surface';
import type { UiSurface } from '../../../core/ui-host/surface';
import { documentPageSource, pageInfoFromUrl } from '../../../shared/page';
import type { PageInfo, PageSource } from '../../../shared/page';
import { useSetting } from '../../../shared/ui/useSetting';
import { NOTES_SELECTORS, SELECTOR_CARD_PARENT, cardParent } from '../notes/dom';
import { NOTES_PAGES } from '../notes/module';
import { bookmarkDraftFromPage, scrollOf } from './capture';
import { laterContext } from './context';
import type { LaterContext } from './context';
import { BOOKMARKS_PAGE_BUTTON_KEY } from './settings';
import type { Bookmark } from './types';
import { QuickSave } from './ui/QuickSave';

export const BOOKMARKS_MODULE_ID = 'g-bookmarks';

export interface BookmarksModuleOptions {
  readonly context?: () => Promise<LaterContext>;
  readonly source?: (doc: Document) => PageSource;
  readonly onError?: (error: unknown) => void;
}

const PAGE_DEBOUNCE_MS = 40;

function Gate({ context, children }: { context: LaterContext; children: ComponentChildren }) {
  const enabled = useSetting<boolean>(context.settings, BOOKMARKS_PAGE_BUTTON_KEY);
  return enabled ? <>{children}</> : null;
}

class BookmarksPageRuntime {
  private page: PageInfo;
  private surface: UiSurface | null = null;
  private context: LaterContext | null = null;
  private source: PageSource | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly options: BookmarksModuleOptions,
  ) {
    this.page = pageInfoFromUrl(ctx.document.URL, ctx.document.title || null);
  }

  start(): void {
    (this.options.context ?? laterContext)().then(
      (context) => {
        if (this.ctx.signal.aborted) return;
        this.context = context;
        const source = (this.options.source ?? documentPageSource)(this.ctx.document);
        this.source = source;
        source.read().then(
          (page) => {
            if (this.ctx.signal.aborted) return;
            if (page) this.page = page;
            this.attach(source);
          },
          (error: unknown) => this.fail(error),
        );
      },
      (error: unknown) => this.fail(error),
    );
  }

  private attach(source: PageSource): void {
    const { ctx } = this;
    const parent = cardParent(ctx.document, ctx.selectors) ?? ctx.page.contentRoot ?? ctx.document.body;
    // إعادة رسم الصفحة تبعد المضيف (MJ-F-01): يعيده keep إلى أول موضع البطاقة الجديد بحالته.
    const anchor = (): Spot | null => {
      const at = cardParent(ctx.document, ctx.selectors);
      return at ? { parent: at, before: at.firstChild } : null;
    };
    const fallback = (): Spot => {
      const at = ctx.page.contentRoot ?? ctx.document.body;
      return { parent: at, before: at.firstChild };
    };
    this.surface = mountSurface(ctx, { parent, before: parent.firstChild, label: 'أكمل لاحقًا', keep: { anchor, fallback } });
    const unsubscribe = source.subscribe(() => this.refreshPage());
    ctx.onTeardown(() => {
      unsubscribe();
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
    });
    this.render();
  }

  private refreshPage(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.source?.read().then(
        (page) => {
          if (this.ctx.signal.aborted || !page) return;
          this.page = page;
          this.render();
        },
        (error: unknown) => this.fail(error),
      );
    }, PAGE_DEBOUNCE_MS);
  }

  private jump = (bookmark: Bookmark): void => {
    const view = this.ctx.document.defaultView;
    if (!view || bookmark.position?.kind !== 'scroll') return;
    const max = Math.max(0, this.ctx.document.documentElement.scrollHeight - view.innerHeight);
    const top = bookmark.position.y <= max ? bookmark.position.y : Math.round(bookmark.position.ratio * max);
    view.scrollTo({ top, behavior: 'auto' });
  };

  private render(): void {
    const { surface, context, ctx } = this;
    if (!surface || !context) return;
    const capture = () => bookmarkDraftFromPage(this.page, { doc: ctx.document, scroll: scrollOf(ctx.document.defaultView) });
    surface.render(
      <Gate context={context}>
        <QuickSave repository={context.bookmarks} page={this.page} capture={capture} onJump={this.jump} mode="page" />
      </Gate>,
    );
  }

  private fail(error: unknown): void {
    if (this.ctx.signal.aborted) return;
    (this.options.onError ?? ((e: unknown) => console.error('[mijhar] الوحدة (ز): أكمل لاحقًا', e)))(error);
  }
}

export function createBookmarksModule(options: BookmarksModuleOptions = {}): ExtensionModule {
  return {
    id: BOOKMARKS_MODULE_ID,
    title: 'أكمل لاحقًا',
    pages: NOTES_PAGES,
    selectors: NOTES_SELECTORS.filter((s) => s.key === SELECTOR_CARD_PARENT),
    mount(ctx) {
      new BookmarksPageRuntime(ctx, options).start();
    },
  };
}

export const BOOKMARKS_MODULE: ExtensionModule = createBookmarksModule();

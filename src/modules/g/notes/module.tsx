// الوحدة (ز) في الصفحة: بطاقة «ملاحظاتي» في أول حاوية المحتوى، وعلامات الأسطر. تفتح التخزين كسولًا (context.ts) وتعمل بالتزامن
// مع تنقل الصفحة والهاش (تحديد الأسطر)؛ والإيقاف يفك البطاقة والعلامات ويعيد DOM كما كان.
import type { ExtensionModule, ModuleContext } from '../../../core/registry';
import { mountSurface } from '../../../core/ui-host/surface';
import type { UiSurface } from '../../../core/ui-host/surface';
import { documentPageSource, pageInfoFromUrl } from '../../../shared/page';
import type { PageInfo, PageSource } from '../../../shared/page';
import { notesContext } from './context';
import type { NotesContext } from './context';
import { NOTES_SELECTORS, cardParent, lineElementFor } from './dom';
import { LineMarkers } from './markers';
import { NOTES_LINE_MARKERS_KEY } from './settings';
import type { LineTarget } from './types';
import { PageCard } from './ui/PageCard';

export const MODULE_G_ID = 'g';

export const NOTES_PAGES = ['repo', 'tree', 'blob', 'issue', 'pr', 'pr-files', 'pr-commits', 'pr-checks', 'commit'] as const;

export interface ModuleGOptions {
  /** الافتراضي notesContext: يفتح التخزين في سياق الصفحة. */
  readonly context?: () => Promise<NotesContext>;
  /** الافتراضي documentPageSource. */
  readonly source?: (doc: Document) => PageSource;
  readonly onError?: (error: unknown) => void;
}

const PAGE_DEBOUNCE_MS = 40;

class NotesPageRuntime {
  private page: PageInfo;
  private surface: UiSurface | null = null;
  private markers: LineMarkers | null = null;
  private highlightId: string | null = null;
  private openRequest = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private context: NotesContext | null = null;
  private source: PageSource | null = null;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly options: ModuleGOptions,
  ) {
    this.page = pageInfoFromUrl(ctx.document.URL, ctx.document.title || null);
  }

  start(): void {
    const open = this.options.context ?? notesContext;
    open().then(
      (context) => {
        if (!this.ctx.signal.aborted) this.begin(context);
      },
      (error: unknown) => this.fail(error),
    );
  }

  private begin(context: NotesContext): void {
    const { ctx } = this;
    this.context = context;
    const source = (this.options.source ?? documentPageSource)(ctx.document);
    this.source = source;
    source.read().then(
      (page) => {
        if (ctx.signal.aborted) return;
        if (page) this.page = page;
        this.attach(context, source);
      },
      (error: unknown) => this.fail(error),
    );
  }

  private attach(context: NotesContext, source: PageSource): void {
    const { ctx } = this;
    const parent = cardParent(ctx.document, ctx.selectors) ?? ctx.page.contentRoot ?? ctx.document.body;
    this.surface = mountSurface(ctx, { parent, before: parent.firstChild, label: 'ملاحظاتي الخاصة' });
    const markers = new LineMarkers({
      ctx,
      page: () => this.page,
      notes: () => context.repository.list(),
      enabled: () => context.settings.get<boolean>(NOTES_LINE_MARKERS_KEY),
      onActivate: (ids) => this.activate(ids),
    });
    this.markers = markers;

    const unsubscribers = [
      context.repository.subscribe(() => markers.schedule()),
      context.settings.subscribe((change) => {
        if (change.key === NOTES_LINE_MARKERS_KEY) markers.schedule();
      }),
      source.subscribe(() => this.refreshPage()),
    ];
    ctx.observe(ctx.document.body, { childList: true, subtree: true }, () => markers.schedule());
    ctx.onTeardown(() => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (this.timer !== null) clearTimeout(this.timer);
      this.timer = null;
      markers.dispose();
    });
    this.render();
    markers.sync();
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
          this.markers?.schedule();
        },
        (error: unknown) => this.fail(error),
      );
    }, PAGE_DEBOUNCE_MS);
  }

  private activate(ids: readonly string[]): void {
    this.highlightId = ids[0] ?? null;
    this.openRequest += 1;
    this.render();
  }

  private render(): void {
    const { surface, context } = this;
    if (!surface || !context) return;
    const locate = (target: LineTarget): boolean => lineElementFor(this.ctx.document, this.ctx.selectors, target) !== null;
    surface.render(
      <PageCard
        repository={context.repository}
        settings={context.settings}
        page={this.page}
        locate={locate}
        highlightId={this.highlightId}
        openRequest={this.openRequest}
      />,
    );
  }

  private fail(error: unknown): void {
    if (this.ctx.signal.aborted) return;
    (this.options.onError ?? ((e: unknown) => console.error('[mijhar] الوحدة (ز)', e)))(error);
  }
}

export function createModuleG(options: ModuleGOptions = {}): ExtensionModule {
  return {
    id: MODULE_G_ID,
    title: 'الملاحظات وحفظ موضع العمل',
    pages: NOTES_PAGES,
    selectors: NOTES_SELECTORS,
    mount(ctx) {
      new NotesPageRuntime(ctx, options).start();
    },
  };
}

export const MODULE_G: ExtensionModule = createModuleG();

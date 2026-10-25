// الوحدة (ز) في الصفحة: بطاقة «ملاحظاتي» في أول حاوية المحتوى، وعلامات الأسطر، ومرساة الأسطر (T-8.3). تفتح التخزين كسولًا
// (context.ts) وتعمل بالتزامن مع تنقل الصفحة والهاش (تحديد الأسطر)؛ والإيقاف يفك البطاقة والعلامات ويعيد DOM كما كان.
// المرساة تُحفظ عند إنشاء ملاحظة سطر من البطاقة، وتُعاد على الصفحة المفتوحة دون شبكة؛ والعلامة لا توضع لملاحظة لها مرساة إلا مطابقة.
import type { ExtensionModule, ModuleContext } from '../../../core/registry';
import { mountSurface } from '../../../core/ui-host/surface';
import type { Spot } from '../../../core/ui-host/surface';
import type { UiSurface } from '../../../core/ui-host/surface';
import { documentPageSource, pageInfoFromUrl } from '../../../shared/page';
import type { PageInfo, PageSource } from '../../../shared/page';
import { anchorStore } from '../anchor/context';
import { AnchorController } from '../anchor/controller';
import { ANCHOR_SELECTORS } from '../anchor/page-view';
import type { AnchorStore } from '../anchor/store';
import { AnchorStatusView } from '../anchor/ui/AnchorStatusView';
import { notesContext } from './context';
import type { NotesContext } from './context';
import { NOTES_SELECTORS, cardParent, lineElementFor } from './dom';
import { LineMarkers } from './markers';
import { NOTES_LINE_MARKERS_KEY } from './settings';
import type { LineTarget, Note } from './types';
import { PageCard } from './ui/PageCard';

export const MODULE_G_ID = 'g';

export const NOTES_PAGES = ['repo', 'tree', 'blob', 'issue', 'pr', 'pr-files', 'pr-commits', 'pr-checks', 'commit'] as const;

export interface ModuleGOptions {
  /** الافتراضي notesContext: يفتح التخزين في سياق الصفحة. */
  readonly context?: () => Promise<NotesContext>;
  /** مخزن مراسي الأسطر (T-8.3). الافتراضي anchorStore. */
  readonly anchors?: () => Promise<AnchorStore>;
  /** الافتراضي documentPageSource. */
  readonly source?: (doc: Document) => PageSource;
  readonly onError?: (error: unknown) => void;
}

const PAGE_DEBOUNCE_MS = 40;
const ANCHOR_DEBOUNCE_MS = 150;

class NotesPageRuntime {
  private page: PageInfo;
  private surface: UiSurface | null = null;
  private markers: LineMarkers | null = null;
  private highlightId: string | null = null;
  private openRequest = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private context: NotesContext | null = null;
  private source: PageSource | null = null;
  private anchor: AnchorController | null = null;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly options: ModuleGOptions,
  ) {
    this.page = pageInfoFromUrl(ctx.document.URL, ctx.document.title || null);
  }

  start(): void {
    const open = this.options.context ?? notesContext;
    // تعذّر فتح مخزن المراسي لا يوقف الملاحظات: تعمل البطاقة والعلامات كما في T-8.1 بلا إعادة تثبيت.
    const anchors = (this.options.anchors ?? anchorStore)().catch((error: unknown) => {
      this.fail(error);
      return null;
    });
    Promise.all([open(), anchors]).then(
      ([context, anchors]) => {
        if (!this.ctx.signal.aborted) this.begin(context, anchors);
      },
      (error: unknown) => this.fail(error),
    );
  }

  private begin(context: NotesContext, anchors: AnchorStore | null): void {
    const { ctx } = this;
    this.context = context;
    this.anchor = anchors && new AnchorController({
      doc: ctx.document,
      selectors: ctx.selectors,
      notes: context.repository,
      anchors,
      page: () => this.page,
      onChange: () => {
        this.render();
        this.markers?.schedule();
      },
      onError: (error) => this.fail(error),
    });
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
    // إعادة رسم الصفحة تبعد المضيف (MJ-F-01): يعيده keep إلى أول موضع البطاقة الجديد بحالته.
    const cardSpot = (): Spot | null => {
      const at = cardParent(ctx.document, ctx.selectors);
      return at ? { parent: at, before: at.firstChild } : null;
    };
    const rootSpot = (): Spot => {
      const at = ctx.page.contentRoot ?? ctx.document.body;
      return { parent: at, before: at.firstChild };
    };
    this.surface = mountSurface(ctx, { parent, before: parent.firstChild, label: 'ملاحظاتي الخاصة', keep: { anchor: cardSpot, fallback: rootSpot } });
    const anchor = this.anchor;
    const markers = new LineMarkers({
      ctx,
      page: () => this.page,
      notes: () => context.repository.list().filter((note) => !anchor || anchor.markable(note)),
      enabled: () => context.settings.get<boolean>(NOTES_LINE_MARKERS_KEY),
      onActivate: (ids) => this.activate(ids),
    });
    this.markers = markers;

    const unsubscribers = [
      context.repository.subscribe(() => {
        markers.schedule();
        this.scheduleAnchor();
      }),
      context.settings.subscribe((change) => {
        if (change.key === NOTES_LINE_MARKERS_KEY) markers.schedule();
      }),
      source.subscribe(() => this.refreshPage()),
    ];
    ctx.observe(ctx.document.body, { childList: true, subtree: true }, () => {
      markers.schedule();
      this.scheduleAnchor();
    });
    ctx.onTeardown(() => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      if (this.timer !== null) clearTimeout(this.timer);
      if (this.anchorTimer !== null) clearTimeout(this.anchorTimer);
      this.timer = null;
      this.anchorTimer = null;
      markers.dispose();
      this.anchor?.dispose();
    });
    this.render();
    markers.sync();
    void this.anchor?.refresh();
  }

  private anchorTimer: ReturnType<typeof setTimeout> | null = null;

  /** إعادة تثبيت واحدة بعد هدوء قصير (الصفحة ترسم أسطرها متأخرة، وكل تغيّر في الملاحظات قد يمسها). */
  private scheduleAnchor(): void {
    if (this.anchorTimer !== null || this.ctx.signal.aborted) return;
    this.anchorTimer = setTimeout(() => {
      this.anchorTimer = null;
      this.anchor?.refresh().catch((error: unknown) => this.fail(error));
    }, ANCHOR_DEBOUNCE_MS);
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
          this.scheduleAnchor();
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
    const anchor = this.anchor;
    const onCreated = (note: Note): void => {
      anchor?.capture(note).catch((error: unknown) => this.fail(error));
    };
    const renderAnchor = (note: Note) =>
      anchor ? <AnchorStatusView note={note} view={anchor.view(note.id)} onRelocate={(id, start) => anchor.relocate(id, start)} /> : null;
    surface.render(
      <PageCard
        repository={context.repository}
        settings={context.settings}
        page={this.page}
        locate={locate}
        highlightId={this.highlightId}
        openRequest={this.openRequest}
        onCreated={onCreated}
        renderAnchor={renderAnchor}
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
    selectors: [...NOTES_SELECTORS, ...ANCHOR_SELECTORS],
    mount(ctx) {
      new NotesPageRuntime(ctx, options).start();
    },
  };
}

export const MODULE_G: ExtensionModule = createModuleG();

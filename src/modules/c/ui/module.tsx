// الوحدة c.ui: واجهة الترجمة عند الطلب (T-4.1 / F-C1، F-C3). تضع شريطًا هادئًا فوق كل نص مرسوم (README وتعليق ووصف مشكلة أو PR…) فيه زر «ترجمة إلى العربية»،
// وزرًا عائمًا عند تحديد نص إنجليزي؛ ولا تبدأ ترجمة قبل ضغط صريح. المحرك خلف TranslationService (service.ts):
//  - لا محرك مسجَّل: الوحدة ساكنة تمامًا — لا شريط ولا مراقب ولا مستمع تحديد — فلا يرى المستخدم زرًّا بلا فعل وراءه. سكربت المحتوى يسجّل محرك
//    DEC-03 عند بدئه (src/modules/c/engines، MJ14)، فيكون مسجَّلًا دائمًا: جاهزًا أو غير متاح بسببه.
//  - محرك مسجَّل غير متاح (غير مدعوم في هذا المتصفح…): الأزرار تظهر ويُعرض السبب صراحةً، ومعه بديل «نسخ النص المقنَّع» (AC-C4)، بلا أي اتصال.
//  - محرك جاهز: الترجمة بالتقنيع والفحص الرباعي والفشل الآمن (translateProtected)، وأنماط العرض وإلغاء الترجمة (session.ts).
import { render } from 'preact';
import type { ExtensionModule, ModuleContext, SelectorEntry } from '../../../core';
import { createShadowHost } from '../../../core/ui-host/shadow';
import type { ShadowParts } from '../../../core/ui-host/shadow';
import { copyMaskedText } from '../engines/fallback';
import type { ClipboardWrite } from '../engines/fallback';
import { TranslationBar } from './bar';
import type { BarKind } from './bar';
import { collectBlocks } from './blocks';
import { TRANSLATE_MODULE_ID } from './ids';
import { SelectionTranslator } from './selection';
import type { SelectionOptions } from './selection';
import { TranslationSession } from './session';
import type { DisplayMode, SessionSnapshot } from './session';
import { getTranslationService, onTranslationServiceChange } from './service';
import type { Availability, TranslationService } from './service';
import { BAR_CSS, BAR_HOST_CSS } from './styles';

export { TRANSLATE_MODULE_ID };
export const BAR_HOST_NAME = 'c.ui.bar';

export const TRANSLATE_SELECTOR_KEYS = { body: 'c.ui.body' } as const;
export const TRANSLATE_SELECTORS: readonly SelectorEntry[] = [
  {
    key: TRANSLATE_SELECTOR_KEYS.body,
    description: 'نص مرسوم قابل للترجمة (README وتعليق ووصف مشكلة أو PR): .markdown-body، والأصلي منها فقط (لا المتداخل)',
    candidates: ['.markdown-body', '[data-testid="markdown-body"]', '.comment-body'],
  },
];

/** أجزاء لا تُعرض عليها أزرار: محرر الكتابة ومعاينته وما يضيفه مِجهَر. */
const NOT_A_TARGET = 'mijhar-host, [contenteditable], textarea, .js-preview-body, .js-preview-panel, .preview-content, [data-testid="markdown-editor-preview"]';

export interface TranslateModuleOptions {
  /** المحرك: افتراضيًا المسجَّل بـsetTranslationService؛ null يعني غيابه؛ ودالة تُستدعى عند كل حاجة. */
  readonly service?: TranslationService | null | (() => TranslationService | null);
  readonly debounceMs?: number;
  readonly maxBlocks?: number;
  /** خيارات ترجمة التحديد، أو false لتعطيلها. */
  readonly selection?: SelectionOptions | false;
  /** الكتابة إلى الحافظة لبديل «نسخ النص المقنَّع»؛ الافتراضي navigator.clipboard. */
  readonly copy?: ClipboardWrite;
}

interface Bar {
  readonly body: Element;
  readonly kind: BarKind;
  readonly parts: ShadowParts;
  session: TranslationSession | null;
  snapshot: SessionSnapshot;
  unavailable: string | null;
  copied: string | null;
}

const IDLE: SessionSnapshot = { phase: 'idle', mode: 'both', total: 0, done: 0, kept: 0, skipped: 0, truncated: false };

async function availabilityOf(service: TranslationService | null): Promise<Availability> {
  if (!service) return { state: 'absent' };
  try {
    return await service.availability();
  } catch (error) {
    return { state: 'unavailable', reason: error instanceof Error ? error.message : 'تعذّر فحص المحرك' };
  }
}

export function barKindOf(body: Element): BarKind {
  if (body.closest('#readme, article.entry-content')) return 'readme';
  if (body.closest('.timeline-comment, [data-testid^="comment-viewer-outer-box"], [data-testid="issue-body"], .js-comment-container, .review-comment')) return 'comment';
  return 'text';
}

export function createTranslateModule(options: TranslateModuleOptions = {}): ExtensionModule {
  return {
    id: TRANSLATE_MODULE_ID,
    title: 'ترجمة تقنية عند الطلب',
    pages: '*',
    selectors: TRANSLATE_SELECTORS,
    mount(ctx) {
      new TranslateController(ctx, options).start();
    },
  };
}

class TranslateController {
  private readonly bars = new Map<Element, Bar>();
  private readonly selection: SelectionTranslator | null;
  private observer: MutationObserver | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private unavailable: string | null = null;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly options: TranslateModuleOptions,
  ) {
    // التحديد يقبل كل محددات النص المرسوم المسجلة لا .markdown-body وحدها (VR-21).
    const bodySelector = ctx.selectors.entry(TRANSLATE_SELECTOR_KEYS.body).candidates.join(', ');
    this.selection =
      options.selection === false ? null : new SelectionTranslator(ctx, () => this.service(), { bodySelector, ...(options.copy ? { copy: options.copy } : {}), ...options.selection });
  }

  private service(): TranslationService | null {
    const { service } = this.options;
    if (service === undefined) return getTranslationService();
    return typeof service === 'function' ? service() : service;
  }

  start(): void {
    const { ctx } = this;
    ctx.onTeardown(() => this.dispose());
    if (this.options.service === undefined) ctx.onTeardown(onTranslationServiceChange(() => void this.refresh()));
    void this.refresh();
  }

  /** يطابق حالة الوحدة مع المحرك: غائب ← ساكنة، وإلا فعّالة (والسبب إن كان غير متاح). */
  private async refresh(): Promise<void> {
    const availability = await availabilityOf(this.service());
    if (this.ctx.signal.aborted) return;
    if (availability.state === 'absent') {
      this.deactivate();
      return;
    }
    this.unavailable = availability.state === 'unavailable' ? availability.reason : null;
    if (!this.active) this.activate();
    for (const bar of this.bars.values()) {
      bar.unavailable = this.unavailable;
      this.paint(bar);
    }
  }

  private activate(): void {
    const { ctx } = this;
    this.active = true;
    this.scan();
    const root = ctx.document.body ?? ctx.document.documentElement;
    this.observer = ctx.observe(root, { childList: true, subtree: true }, (records) => {
      const own = (n: Node): boolean => (n as Element).localName === 'mijhar-host' || (n as Element).localName === 'mijhar-original';
      if (records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => !own(n)))) this.schedule();
    });
    this.selection?.bind(true);
  }

  private deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.selection?.bind(false);
    for (const bar of this.bars.values()) this.removeBar(bar);
    this.bars.clear();
  }

  private schedule(): void {
    if (this.timer || this.ctx.signal.aborted) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.active) this.scan();
    }, this.options.debounceMs ?? 300);
  }

  private targets(): Element[] {
    return this.ctx.selectors
      .resolveAll(this.ctx.document, TRANSLATE_SELECTOR_KEYS.body)
      .filter((el) => !el.parentElement?.closest('.markdown-body') && !el.closest(NOT_A_TARGET) && !el.closest('template'));
  }

  private scan(): void {
    if (this.ctx.signal.aborted) return;
    const found = new Set(this.targets());
    for (const [body, bar] of this.bars) {
      if (!found.has(body) || !body.isConnected) {
        this.removeBar(bar);
        this.bars.delete(body);
      } else if (!bar.parts.host.isConnected) this.insertBar(bar);
    }
    for (const body of found) if (!this.bars.has(body)) this.addBar(body);
  }

  private addBar(body: Element): void {
    const parts = createShadowHost(this.ctx.document, { name: BAR_HOST_NAME, hostCss: BAR_HOST_CSS, styles: BAR_CSS, label: 'ترجمة إلى العربية' });
    parts.root.classList.add('bar-root');
    const bar: Bar = { body, kind: barKindOf(body), parts, session: null, snapshot: IDLE, unavailable: this.unavailable, copied: null };
    this.bars.set(body, bar);
    this.insertBar(bar);
    this.paint(bar);
  }

  private insertBar(bar: Bar): void {
    const parent = bar.body.parentNode;
    if (parent) this.ctx.mutations.insert(parent, bar.parts.host, bar.body);
  }

  private removeBar(bar: Bar): void {
    bar.session?.cancel();
    bar.session = null;
    render(null, bar.parts.root);
    bar.parts.host.remove();
  }

  private paint(bar: Bar): void {
    const service = this.service();
    render(
      <TranslationBar
        kind={bar.kind}
        snapshot={bar.snapshot}
        unavailable={bar.unavailable}
        engineLabel={service?.label ?? ''}
        copyNote={bar.copied}
        onTranslate={() => void this.translate(bar)}
        onCancel={() => bar.session?.cancel()}
        onMode={(mode: DisplayMode) => bar.session?.setMode(mode)}
        onCopyMasked={() => void this.copyMasked(bar)}
      />,
      bar.parts.root,
    );
  }

  /** فعل صريح: بديل غياب المحرك (AC-C4)، نص الفقرات مقنَّعًا إلى الحافظة، بلا أي اتصال. */
  private async copyMasked(bar: Bar): Promise<void> {
    const { blocks } = collectBlocks(bar.body);
    const note = await copyMaskedText(
      blocks.map((block) => block.segments),
      this.options.copy,
    );
    if (this.ctx.signal.aborted) return;
    bar.copied = note;
    this.paint(bar);
  }

  /** فعل صريح: ضغط زر الترجمة. */
  private async translate(bar: Bar): Promise<void> {
    const service = this.service();
    const availability = await availabilityOf(service);
    if (this.ctx.signal.aborted || !service) return;
    if (availability.state !== 'ready') {
      bar.unavailable = availability.state === 'unavailable' ? availability.reason : 'لا محرك ترجمة محلي مُفعَّل';
      this.paint(bar);
      return;
    }
    bar.unavailable = null;
    bar.session ??= new TranslationSession(
      this.ctx,
      bar.body,
      service,
      (snapshot) => {
        bar.snapshot = snapshot;
        this.paint(bar);
      },
      this.options.maxBlocks === undefined ? {} : { maxBlocks: this.options.maxBlocks },
    );
    await bar.session.run();
  }

  private dispose(): void {
    this.deactivate();
  }
}

export const TRANSLATE_MODULE: ExtensionModule = createTranslateModule();

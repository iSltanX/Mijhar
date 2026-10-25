// الوحدة e.builder: منشئ حزمة السياق في صفحة طلب الدمج والمشكلة ومهمة Actions (T-6.1). شريط صغير بعد الترويسة يفتح نافذة
// «تجهيز حزمة السياق» داخل جذر Shadow DOM عبر ctx.mutations، فتُزال بإيقاف الوحدة.
//  - الجمع عند فتح النافذة وعند «أعد الجمع» وحدهما، بجامع طبقة السياق المشتركة (T-11.2)، بلا أي طلب شبكة (لا fetch في هذه الوحدة).
//  - مقتطفات الأدلة: آخر نص حدّده المستخدم في الصفحة (خارج واجهتنا) يقرؤه الجامع (readSelection) ويُضاف بنقر صريح.
//  - النسخ يدوي بنقر (AD-06): writeText في معالج النقر نفسه، والبديل execCommand('copy') من حقل المعاينة داخل جذر الظل (evidence/T-0.5).
//  - التنزيل `.md` (T-6.2) محلي بنقر أيضًا: Blob ورابط blob: وعنصر a[download] داخل جذر الظل، بلا صلاحية downloads ولا شبكة.
import type { ExtensionModule, ModuleContext } from '../../../core';
import { mountSurface } from '../../../core/ui-host/surface';
import type { Spot } from '../../../core/ui-host/surface';
import { JOB_PAGE_SELECTORS, isJobPath } from '../../d/log-parser/job-page';
import { PR_STATUS_SELECTORS } from '../../d/pr-status/extract';
import { CONTEXT_SELECTORS, collectContext, pageKind, readSelection } from '../context';
import type { ContextPageKind, ContextSource, Snippet } from '../context';
import { PRIVACY_CSS } from '../privacy-check';
import { BUILDER_MODULE_ID } from './ids';
import { BUILDER_CSS } from './style';
import { BuilderPanel } from './view';
import type { CopyResult, DownloadResult } from './view';

export { BUILDER_MODULE_ID };

export interface BuilderOptions {
  readonly now?: () => number;
  /** النسخ (للاختبار). الافتراضي الحافظة ثم البديل من حقل المعاينة. */
  readonly copy?: (text: string, preview: HTMLTextAreaElement | null) => Promise<CopyResult>;
  /** التنزيل (للاختبار). الافتراضي downloadMarkdown. */
  readonly download?: (text: string, fileName: string, host: ParentNode) => Promise<DownloadResult>;
}

const ANCHOR = {
  key: 'e.anchor',
  description: 'ترويسة الصفحة (طلب دمج أو مشكلة)؛ يُدرج شريط حزمة السياق بعدها',
  candidates: ['[data-component="PageHeader"]', '[data-testid="issue-header"]', '#partial-discussion-header', '.gh-header'],
};

// في صفحة المهمة يُدرج الشريط قبل قسم التنبيهات، لا قبل #logs: بطاقة شرح السجل (d.log) ملاصقة لـ#logs ولا يُفصل بينهما.
const JOB_ANCHOR = {
  key: 'e.job.anchor',
  description: 'قسم تنبيهات المهمة فوق السجلات في صفحة مهمة Actions؛ يُدرج شريط حزمة السياق قبله',
  candidates: ['job-annotations', '.js-job-annotations'],
};

/** الحافظة في فعل المستخدم، والبديل: تحديد حقل المعاينة داخل جذر الظل وexecCommand('copy'). */
export async function copyWithFallback(text: string, preview: HTMLTextAreaElement | null): Promise<CopyResult> {
  const nav = preview?.ownerDocument.defaultView?.navigator ?? (typeof navigator === 'undefined' ? undefined : navigator);
  try {
    if (nav?.clipboard?.writeText) {
      await nav.clipboard.writeText(text);
      return 'copied';
    }
  } catch {
    // يُجرَّب البديل.
  }
  if (!preview) return 'failed';
  preview.focus();
  preview.select();
  try {
    return preview.ownerDocument.execCommand('copy') ? 'copied' : 'failed';
  } catch {
    return 'failed';
  }
}

/** ينزّل النص ملف Markdown: Blob محلي ورابط blob: لعنصر a[download] داخل `host` (جذر الظل) ينقر عليه. بلا شبكة ولا صلاحية downloads. */
export async function downloadMarkdown(text: string, fileName: string, host: ParentNode & Node): Promise<DownloadResult> {
  const doc = host.ownerDocument;
  if (!doc || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return 'failed';
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    const link = doc.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.hidden = true;
    // نقرة التنزيل لا تخرج إلى معالجات صفحة GitHub (روابط Turbo وغيرها).
    link.addEventListener('click', (event) => event.stopPropagation());
    host.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export function createContextBuilderModule(options: BuilderOptions = {}): ExtensionModule {
  return {
    id: BUILDER_MODULE_ID,
    title: 'منشئ حزمة السياق',
    pages: ['pr', 'issue', 'actions-run'],
    shouldMount: (page) => page.type !== 'actions-run' || isJobPath(page.href),
    selectors: [...PR_STATUS_SELECTORS, ...JOB_PAGE_SELECTORS, ...CONTEXT_SELECTORS, ANCHOR, JOB_ANCHOR],
    mount(ctx) {
      new BuilderController(ctx, options).start();
    },
  };
}

class BuilderController {
  private surface: ReturnType<typeof mountSurface> | null = null;
  private open = false;
  private source: ContextSource | null = null;
  private collectedAt: number | undefined;
  private snippets: Snippet[] = [];
  private pending: Omit<Snippet, 'id'> | null = null;
  private counter = 0;
  private readonly now: () => number;
  private readonly kind: ContextPageKind;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly options: BuilderOptions,
  ) {
    this.now = options.now ?? (() => Date.now());
    this.kind = pageKind(ctx.page) ?? 'job';
  }

  start(): void {
    const { ctx } = this;
    const spot = this.place();
    // أعادت الصفحة رسم حاويتها فأبعدت المضيف (MJ-F-01): يعيده keep إلى موضعه الجديد بحالته (النافذة المفتوحة والمقتطفات).
    this.surface = mountSurface(ctx, { parent: spot.parent, before: spot.before, styles: BUILDER_CSS + PRIVACY_CSS, label: 'حزمة السياق', keep: { anchor: () => this.anchorSpot(), fallback: () => this.place() } });
    ctx.listen(ctx.document, 'selectionchange', () => this.trackSelection());
    this.draw();
  }

  private place(): Spot {
    const spot = this.anchorSpot();
    if (spot) return spot;
    const parent = this.ctx.page.contentRoot ?? this.ctx.document.body;
    return { parent, before: parent.firstChild };
  }

  private anchorSpot(): Spot | null {
    const { ctx } = this;
    if (this.kind === 'job') {
      const annotations = ctx.selectors.resolve(ctx.document, 'e.job.anchor')?.element;
      if (annotations?.parentNode) return { parent: annotations.parentNode, before: annotations };
      const logs = ctx.selectors.resolve(ctx.document, 'd.job.logs')?.element;
      if (logs?.parentNode) return { parent: logs.parentNode, before: logs.parentNode.firstChild };
    }
    const header = ctx.selectors.resolve(ctx.document, 'e.anchor')?.element;
    return header?.parentNode ? { parent: header.parentNode, before: header.nextSibling } : null;
  }

  /** آخر نص محدد خارج واجهتنا، ومصدره (تعليق بصاحبه، أو سجل، أو الصفحة). */
  private trackSelection(): void {
    const selected = readSelection(this.ctx.document, this.surface?.host ?? null);
    if (!selected) return;
    const had = this.pending !== null;
    this.pending = selected;
    if (!had && this.open) this.draw();
  }

  private collect(): void {
    this.source = collectContext(this.ctx.document, this.ctx.selectors, this.ctx.page, this.kind);
    this.collectedAt = this.now();
  }

  private draw(): void {
    const { surface } = this;
    if (!surface || this.ctx.signal.aborted) return;
    surface.render(
      <section class="e-builder" data-section="context-builder">
        <div class="e-bar">
          <button
            type="button"
            class="btn"
            data-action="builder-toggle"
            aria-expanded={this.open ? 'true' : 'false'}
            onClick={() => {
              this.open = !this.open;
              if (this.open && !this.source) this.collect();
              this.draw();
            }}
          >
            {this.open ? 'أغلق حزمة السياق' : 'جهّز حزمة السياق'}
          </button>
          <span class="muted small">ملخص قابل للمراجعة والنسخ لنموذج أو زميل، يُجمع من هذه الصفحة محليًا ولا يُرسل إلى أي جهة.</span>
        </div>
        {this.open && this.source && (
          <BuilderPanel
            source={this.source}
            snippets={this.snippets}
            canAddSelection={this.pending !== null}
            onAddSelection={() => this.addSelection()}
            onRemoveSnippet={(id) => {
              this.snippets = this.snippets.filter((s) => s.id !== id);
              this.draw();
            }}
            onRecollect={() => {
              this.collect();
              this.draw();
            }}
            copy={(text) => (this.options.copy ?? copyWithFallback)(text, surface.root.querySelector<HTMLTextAreaElement>('[data-preview]'))}
            download={(text, fileName) => (this.options.download ?? downloadMarkdown)(text, fileName, surface.root)}
            {...(this.collectedAt !== undefined ? { collectedAt: this.collectedAt } : {})}
          />
        )}
        {this.open && this.pending && (
          <p class="muted small" data-pending-selection="">
            النص المحدد ({this.pending.where}): «{this.pending.text.length > 80 ? `${this.pending.text.slice(0, 79)}…` : this.pending.text}»
          </p>
        )}
      </section>,
    );
  }

  private addSelection(): void {
    if (!this.pending) return;
    this.counter += 1;
    this.snippets = [...this.snippets, { id: String(this.counter), ...this.pending }];
    this.pending = null;
    this.draw();
  }
}

export const CONTEXT_BUILDER_MODULE: ExtensionModule = createContextBuilderModule();

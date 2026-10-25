// الوحدة e.copy-prompt: زر «نسخ البرومبت» في صفحة طلب الدمج والمشكلة ومهمة Actions (T-11.3، F-E7). النقرة تجمع وتجهّز وتنسخ إلى الحافظة؛ لا صندوق نص ولا
// معاينة، ولا يُعرض البرومبت في أي موضع. الجمع والتنقيح والبناء من طبقة السياق المشتركة (prepareContext بحجب الأسرار mask) وقالب البرومبت من
// modules/e/prompt-templates (renderPrompt)؛ ولا مسار موازٍ هنا (AD-22، TEST-CTX-05).
//  - لا شبكة: لا fetch ولا قراءة API ولا مفتاح ولا رمز (AD-30: لا تمرّر هذه المرحلة قراءة API إلى الطبقة). تعمل بلا أي إعداد أو ربط.
//  - الحافظة بجدول T-0.5: writeText في معالج النقر نفسه، والبديل execCommand من حقل مؤقت في جذر الظل (clipboard.ts)؛ ولا «تم النسخ» إلا بعد نجاح فعلي.
//  - الفشل يُعلن بسببه ويُعرض بديل يدوي بلا حافظة: تنزيل البرومبت ملف .md محليًا (Blob ورابط blob: داخل جذر الظل) بنقر المستخدم.
//  - الموضع: صف رفيع في مضيفه الخاص يوضع بعد القسم المعني: بطاقة ملخص طلب الدمج (d.pr-status) أو شريط حزمة السياق (e.builder)؛ لا يُمَس جذر ظل وحدة أخرى.
import type { ExtensionModule, ModuleContext, SelectorEntry } from '../../../core';
import { mountSurface } from '../../../core/ui-host/surface';
import type { Spot } from '../../../core/ui-host/surface';
import { downloadMarkdown } from '../builder';
import { COLLECTOR_SELECTORS, limitsOf, pageKind, prepareContext } from '../context';
import type { ContextPageKind } from '../context';
import { promptOf, renderPrompt } from '../prompt-templates';
import type { PromptId } from '../prompt-templates';
import { copyText } from './clipboard';
import type { CopyFn } from './clipboard';
import { COPY_PROMPT_MODULE_ID } from './ids';
import { DEFAULT_COPY_PROMPT_SETTINGS, storedCopyPromptSettings, templateFor } from './settings';
import type { CopyPromptSettings } from './settings';
import { COPY_PROMPT_CSS } from './style';
import { CopyPromptView } from './view';
import type { CopyState, DownloadState, PrivateNote } from './view';

export { COPY_PROMPT_MODULE_ID };

export interface CopyPromptOptions {
  readonly now?: () => number;
  /** الكتابة إلى الحافظة (للاختبار). الافتراضي copyText بجدول T-0.5. */
  readonly copy?: CopyFn;
  /** التنزيل البديل (للاختبار). الافتراضي downloadMarkdown. */
  readonly download?: (text: string, fileName: string, host: ParentNode & Node) => Promise<'downloaded' | 'failed'>;
  /** القالب الافتراضي وحد الأسطر. الافتراضي من التخزين. */
  readonly settings?: CopyPromptSettings;
  /** مدة بقاء «تم النسخ» قبل العودة إلى الحالة الافتراضية. */
  readonly successMs?: number;
}

const HEADER_CANDIDATES = ['[data-component="PageHeader"]', '[data-testid="issue-header"]', '#partial-discussion-header', '.gh-header'];

const SELECTORS: readonly SelectorEntry[] = [
  ...COLLECTOR_SELECTORS,
  { key: 'e.copy.header', description: 'ترويسة الصفحة (طلب دمج أو مشكلة)؛ موضع زر النسخ إن لم يوجد القسم المعني', candidates: HEADER_CANDIDATES },
  { key: 'e.copy.job-top', description: 'قسم تنبيهات المهمة فوق السجلات في صفحة مهمة Actions؛ موضع زر النسخ قبله إن لم يوجد شريط حزمة السياق', candidates: ['job-annotations', '.js-job-annotations'] },
  { key: 'e.copy.pr-card', description: 'مضيف بطاقة ملخص حالة طلب الدمج (d.pr-status)؛ يوضع زر النسخ بعده في صفحة الطلب', candidates: ['mijhar-host[data-mijhar-host="d.pr-status"]'] },
  { key: 'e.copy.bar', description: 'مضيف شريط حزمة السياق (e.builder)؛ يوضع زر النسخ بعده', candidates: ['mijhar-host[data-mijhar-host="e.builder"]'] },
];

const SUPPORTED: readonly ContextPageKind[] = ['pr', 'issue', 'job'];

/** اسم ملف البرومبت البديل: القالب والمستودع والرقم، بحروف آمنة لاسم ملف. */
export function promptFileName(id: PromptId, page: { readonly owner?: string | null; readonly repo?: string | null; readonly number?: number | string | null }): string {
  const part = (value: unknown): string => String(value ?? '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${['mijhar-prompt', id, part(page.owner), part(page.repo), part(page.number)].filter(Boolean).join('-')}.md`;
}

export function createCopyPromptModule(options: CopyPromptOptions = {}): ExtensionModule {
  const settings = options.settings ?? storedCopyPromptSettings();
  return {
    id: COPY_PROMPT_MODULE_ID,
    title: 'نسخ البرومبت',
    pages: ['pr', 'issue', 'actions-run'],
    shouldMount: (page) => {
      const kind = pageKind(page);
      return kind !== null && SUPPORTED.includes(kind);
    },
    selectors: SELECTORS,
    mount(ctx) {
      new CopyPromptController(ctx, options, settings).start();
    },
  };
}

class CopyPromptController {
  private surface: ReturnType<typeof mountSurface> | null = null;
  private state: CopyState = 'idle';
  private reason: string | null = null;
  private note: PrivateNote | null = null;
  private download: DownloadState = 'idle';
  /** البرومبت المجهّز بعد نجاح التجهيز: يُنزَّل بديلًا يدويًا إن فشلت الكتابة، ولا يُعرض في أي موضع. */
  private text: string | null = null;
  private menuOpen = false;
  /** القالب المختار من قائمة الزر لهذه الصفحة وحدها. */
  private picked: PromptId | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;
  private readonly kind: ContextPageKind;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly options: CopyPromptOptions,
    private readonly settings: CopyPromptSettings,
  ) {
    this.now = options.now ?? (() => Date.now());
    this.kind = pageKind(ctx.page) ?? 'issue';
  }

  start(): void {
    const { ctx } = this;
    const spot = this.place();
    // أعادت الصفحة رسم حاويتها فأبعدت المضيف (MJ-F-01): يعيده keep إلى موضعه الجديد بحالته (القائمة والقالب المختار).
    this.surface = mountSurface(ctx, { parent: spot.parent, before: spot.before, styles: COPY_PROMPT_CSS, label: 'نسخ البرومبت', keep: { anchor: () => this.anchorSpot(), fallback: () => this.place() } });
    ctx.listen(ctx.document, 'pointerdown', (event) => {
      const host = this.surface?.host;
      if (this.menuOpen && host && !(event as PointerEvent).composedPath().includes(host)) this.closeMenu();
    });
    ctx.onTeardown(() => this.clearTimer());
    this.draw();
  }

  /** بعد القسم المعني إن كان مركَّبًا، وإلا بعد الترويسة؛ وإلا أول الحاوية. */
  private place(): Spot {
    const spot = this.anchorSpot();
    if (spot) return spot;
    const parent = this.ctx.page.contentRoot ?? this.ctx.document.body;
    return { parent, before: parent.firstChild };
  }

  private anchorSpot(): Spot | null {
    const { ctx } = this;
    const after = (key: string): Spot | null => {
      const el = ctx.selectors.resolve(ctx.document, key)?.element;
      return el?.parentNode ? { parent: el.parentNode, before: el.nextSibling } : null;
    };
    const before = (key: string): Spot | null => {
      const el = ctx.selectors.resolve(ctx.document, key)?.element;
      return el?.parentNode ? { parent: el.parentNode, before: el } : null;
    };
    const spot =
      this.kind === 'pr'
        ? (after('e.copy.pr-card') ?? after('e.copy.bar') ?? after('e.copy.header'))
        : this.kind === 'job'
          ? (after('e.copy.bar') ?? before('e.copy.job-top') ?? before('d.job.logs'))
          : (after('e.copy.bar') ?? after('e.copy.header'));
    return spot;
  }

  private templateId(): PromptId {
    return this.picked ?? templateFor(this.settings.template(), this.kind);
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private closeMenu(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.draw();
  }

  private draw(): void {
    const { surface } = this;
    if (!surface || this.ctx.signal.aborted) return;
    const id = this.templateId();
    surface.render(
      <CopyPromptView
        state={this.state}
        template={id}
        menuOpen={this.menuOpen}
        reason={this.reason}
        privateNote={this.note}
        download={this.download}
        canDownload={this.text !== null}
        fileName={promptFileName(id, this.ctx.page)}
        onCopy={() => this.copy()}
        onToggleMenu={() => {
          this.menuOpen = !this.menuOpen;
          this.draw();
        }}
        onCloseMenu={() => this.closeMenu()}
        onPick={(picked) => this.pick(picked)}
        onDownload={() => this.downloadFallback()}
      />,
    );
  }

  /** قالب جديد من القائمة: يبدأ فعلًا جديدًا، فلا يبقى تأكيد ولا فشل ولا تنبيه من النسخ السابق. */
  private pick(id: PromptId): void {
    this.picked = id;
    this.menuOpen = false;
    this.clearTimer();
    this.reset();
    this.draw();
  }

  private reset(): void {
    this.state = 'idle';
    this.reason = null;
    this.note = null;
    this.download = 'idle';
    this.text = null;
  }

  /** الجمع والتجهيز في خطوة متزامنة بلا شبكة: طبقة السياق بحجب الأسرار ثم القالب. */
  private prepare(): { text: string; note: PrivateNote | null } {
    const { ctx } = this;
    const structure = prepareContext(ctx.document, ctx.selectors, ctx.page, { secrets: 'mask', limits: limitsOf(this.settings.lineLimit()), collectedAt: this.now() });
    if (!structure) throw new Error('لا سياق لهذه الصفحة');
    const { text } = renderPrompt(promptOf(this.templateId()), structure);
    const { secrets } = structure;
    // التنبيه مختصر: اسم النمط بلا قوسه التفصيلي (بادئات لاتينية تشوّش ترتيب الاتجاهين في سطر عربي)، والعدد قبله.
    return { text, note: secrets.total ? { total: secrets.total, items: secrets.hits.map((h) => `${h.count}× ${h.label.replace(/\s*\(.*\)\s*$/, '')}`) } : null };
  }

  /** معالج النقر: كل ما قبل الكتابة إلى الحافظة متزامن، فتبقى الكتابة في فعل المستخدم نفسه (T-0.5). */
  private copy(): void {
    if (this.state === 'loading') return;
    this.clearTimer();
    this.reset();
    this.menuOpen = false;
    this.state = 'loading';
    this.draw();
    let prepared: { text: string; note: PrivateNote | null };
    try {
      prepared = this.prepare();
    } catch (error) {
      this.fail(`تعذّر تجهيز البرومبت (${error instanceof Error ? error.message : 'خطأ غير معروف'})`);
      return;
    }
    this.text = prepared.text;
    this.note = prepared.note;
    void this.write(prepared.text);
  }

  private async write(text: string): Promise<void> {
    const { surface, ctx } = this;
    if (!surface) return;
    let reason: string | null;
    try {
      const outcome = await (this.options.copy ?? copyText)(text, surface.root);
      reason = outcome.ok ? null : outcome.reason;
    } catch (error) {
      reason = `تعذّرت الكتابة إلى الحافظة (${error instanceof Error ? error.name : 'خطأ غير معروف'})`;
    }
    if (ctx.signal.aborted) return;
    // «تم النسخ» لا يُعرض إلا هنا، بعد أن أعاد مسار الكتابة نجاحًا فعليًا.
    if (reason === null) {
      this.state = 'success';
      this.draw();
      this.timer = setTimeout(() => {
        this.timer = null;
        if (this.state !== 'success') return;
        this.state = 'idle';
        this.draw();
      }, this.options.successMs ?? 3000);
    } else this.fail(reason);
  }

  private fail(reason: string): void {
    this.state = 'failed';
    this.reason = reason;
    this.draw();
  }

  private downloadFallback(): void {
    const { surface, text } = this;
    if (!surface || text === null) return;
    const name = promptFileName(this.templateId(), this.ctx.page);
    (this.options.download ?? downloadMarkdown)(text, name, surface.root).then(
      (result) => this.settleDownload(result),
      () => this.settleDownload('failed'),
    );
  }

  private settleDownload(result: 'downloaded' | 'failed'): void {
    if (this.ctx.signal.aborted) return;
    this.download = result;
    this.draw();
  }
}

export const COPY_PROMPT_MODULE: ExtensionModule = createCopyPromptModule();

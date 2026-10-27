// الوحدة f.composer: مساعد تنظيم Issue/PR والمعاينة وحماية المسودة (T-7.1 / F-F1، F-F4). يضع زر «مساعد» في شريط أدوات كل حقل كتابة مدعوم (textarea) في صفحات
// البلاغات وطلبات الدمج، فيفتح لوحة عائمة تنظّم المتوقع والفعلي وخطوات التكرار والبيئة والأدلة وتعرض معاينة كاملة، ثم يُدرج النص عند المؤشر أو بالإلحاق دون مسح المسودة
// (لقطة تراجع قبل كل إدراج وزر «التراجع عن آخر إدراج»). لا نشر ولا إرسال تلقائيان: الوحدة لا تلمس زر الإرسال ولا نموذج الصفحة.
// BLK-GH-EDITOR-DOM: إن غاب شريط الأدوات التقط الحقلَ محدد احتياطي ووُضع الزر قبله؛ ومحرر غير textarea (CodeMirror) بلا زر.
import { render } from 'preact';
import type { ExtensionModule, ModuleContext } from '../../../core';
import { createShadowHost } from '../../../core/ui-host/shadow';
import type { ShadowParts } from '../../../core/ui-host/shadow';
import type { TextField } from '../../../shared/fields';
import { COMPOSER_SELECTORS, COMPOSER_SELECTOR_KEYS, fieldForToolbar, isSupportedField } from './fields';
import { COMPOSER_MODULE_ID } from './ids';
import { insertBlock } from './insert';
import type { InsertMode, Insertion } from './insert';
import { ComposerPanel } from './panel';
import type { PanelState, PanelStatus } from './panel';
import { BAR_HOST_CSS, BUTTON_CSS, PANEL_CSS, PANEL_HOST_CSS } from './styles';
import { EMPTY_FIELDS } from './template';
import type { ComposerKind } from './template';
import { applyEdits, undoGroup } from '../template/apply';
import { detectTemplate } from '../template/detect';
import type { Output } from '../template/output';

export { COMPOSER_MODULE_ID };
export const COMPOSER_BUTTON_HOST = 'f.composer.button';
export const COMPOSER_PANEL_HOST = 'f.composer.panel';

export interface ComposerOptions {
  /** مهلة تجميع تعديلات الصفحة قبل إعادة الفحص. الافتراضي 250ms. */
  readonly debounceMs?: number;
}

export function createComposerModule(options: ComposerOptions = {}): ExtensionModule {
  return {
    id: COMPOSER_MODULE_ID,
    title: 'مساعد كتابة البلاغات والمراجعات',
    pages: ['issue', 'issue-new', 'pr', 'pr-files', 'compare', 'discussion'],
    selectors: COMPOSER_SELECTORS,
    mount(ctx) {
      new ComposerController(ctx, options).start();
    },
  };
}

const kindFor = (type: string): ComposerKind => (type === 'pr' || type === 'pr-files' || type === 'compare' ? 'pr' : 'issue');

interface Session {
  state: PanelState;
}

/** زر مساعد أدرجته الوحدة: مضيفه والحقل الذي يخدمه الآن. */
interface Binding {
  readonly host: HTMLElement;
  readonly button: HTMLButtonElement;
  field: TextField;
}

class ComposerController {
  // CODEX-005: الربط يُطابَق مع الصفحة في كل فحص (الحقل الحالي للشريط ووجود المضيف فيه)، لا بسجل تاريخي لما رُكِّب مرة.
  /** شريط الأدوات ← زره. */
  private readonly toolbars = new Map<Element, Binding>();
  /** حقل بلا شريط ← زره الاحتياطي قبله. */
  private readonly fallbacks = new Map<TextField, Binding>();
  private readonly hosts = new WeakSet<Node>();
  private readonly sessions = new WeakMap<TextField, Session>();
  private panel: ShadowParts | null = null;
  private current: TextField | null = null;
  /** إدراجات آخر عملية (إدراج واحد، أو عدة إدراجات تحت عناوين قالب) بترتيب تنفيذها، للتراجع عنها معًا. */
  private last: readonly Insertion[] | null = null;
  private status: PanelStatus | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** الحقل الذي تتبع المعاينة نصه ما دام المساعد مفتوحًا له. */
  private watched: TextField | null = null;
  private readonly repaint = (): void => this.paint();

  constructor(
    private readonly ctx: ModuleContext,
    private readonly options: ComposerOptions,
  ) {}

  start(): void {
    const { ctx } = this;
    ctx.onTeardown(() => this.dispose());
    this.scan();
    const root = ctx.document.body ?? ctx.document.documentElement;
    ctx.observe(root, { childList: true, subtree: true }, (records) => {
      const own = (n: Node): boolean => (n as Element).localName === 'mijhar-host';
      // تعديل من الصفحة، أو إزالة أحد أزرارنا (ولو وحده): يُعاد الفحص فيعود الزر إلى شريطه.
      if (records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => !own(n)) || [...r.removedNodes].some((n) => this.hosts.has(n)))) this.schedule();
    });
  }

  private schedule(): void {
    if (this.timer || this.ctx.signal.aborted) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.scan();
      if (this.current && !this.current.isConnected) this.close();
    }, this.options.debounceMs ?? 250);
  }

  private scan(): void {
    const { ctx } = this;
    if (ctx.signal.aborted) return;
    const covered = new Set<TextField>();
    for (const toolbar of ctx.selectors.resolveAll(ctx.document, COMPOSER_SELECTOR_KEYS.toolbar)) {
      const field = fieldForToolbar(toolbar);
      if (!field || !isSupportedField(field)) continue;
      covered.add(field);
      const bound = this.toolbars.get(toolbar);
      if (!bound) this.attachToToolbar(toolbar, field);
      else {
        // حقل استُبدل والشريط باقٍ: الزر نفسه يخدم الحقل الجديد؛ ومضيف أُزيل من شريط حي يعود إليه (هو نفسه لا نسخة).
        bound.field = field;
        if (bound.host.parentNode !== toolbar) this.ctx.mutations.reattach(toolbar, bound.host);
      }
    }
    for (const toolbar of [...this.toolbars.keys()]) if (!toolbar.isConnected) this.toolbars.delete(toolbar);
    // احتياطي: حقل كتابة بلا شريط أدوات (تغيّر المحرر). المحددات كلها معًا (اتحاد)، لا أولها ذو النتائج: الحقل المقصود غالبًا ما يطابق غير الأول.
    // وحين يصل شريط الحقل بعد زره الاحتياطي يُزال الاحتياطي، فيبقى زر واحد للحقل.
    for (const [field, bound] of [...this.fallbacks]) {
      if (covered.has(field) || !field.isConnected || !isSupportedField(field)) {
        bound.host.remove();
        this.fallbacks.delete(field);
      } else if (bound.host.nextSibling !== field && field.parentNode) this.ctx.mutations.reattach(field.parentNode, bound.host, field);
    }
    const fieldSelector = ctx.selectors.entry(COMPOSER_SELECTOR_KEYS.field).candidates.join(', ');
    for (const field of ctx.document.querySelectorAll<HTMLTextAreaElement>(fieldSelector)) {
      if (covered.has(field) || !isSupportedField(field) || this.fallbacks.has(field) || this.hasToolbar(field)) continue;
      this.attachBeforeField(field);
    }
  }

  /** أزرار المساعد الحية الآن بحقولها. */
  private bindings(): Binding[] {
    return [...this.toolbars.values(), ...this.fallbacks.values()];
  }

  private hasToolbar(field: TextField): boolean {
    for (const toolbar of this.ctx.document.querySelectorAll('markdown-toolbar')) if (fieldForToolbar(toolbar) === field) return true;
    return false;
  }

  private makeButton(field: TextField, parts: ShadowParts): Binding {
    const { ctx } = this;
    const button = ctx.document.createElement('button');
    button.type = 'button';
    button.className = 'btn trigger';
    button.textContent = 'مساعد';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    const text = 'افتح مساعد كتابة البلاغات والمراجعات لهذا الحقل';
    button.setAttribute('aria-label', text);
    button.title = text;
    // الضغط لا ينقل التركيز من الحقل فيبقى المؤشر والتحديد حيث هما (موضع الإدراج «عند المؤشر»). المستمع على زر الإضافة نفسه لا على GitHub.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    const binding: Binding = { host: parts.host, button, field };
    button.addEventListener('click', () => (this.panel && this.current === binding.field ? this.close() : this.open(binding.field)));
    parts.root.append(button);
    this.hosts.add(parts.host);
    return binding;
  }

  private attachToToolbar(toolbar: Element, field: TextField): void {
    const parts = createShadowHost(this.ctx.document, { name: COMPOSER_BUTTON_HOST, styles: BUTTON_CSS });
    parts.host.setAttribute('data-display', 'inline');
    this.toolbars.set(toolbar, this.makeButton(field, parts));
    this.ctx.mutations.insert(toolbar, parts.host);
  }

  private attachBeforeField(field: TextField): void {
    const parent = field.parentNode;
    if (!parent) return;
    const parts = createShadowHost(this.ctx.document, { name: COMPOSER_BUTTON_HOST, hostCss: BAR_HOST_CSS, styles: BUTTON_CSS });
    this.fallbacks.set(field, this.makeButton(field, parts));
    this.ctx.mutations.insert(parent, parts.host, field);
  }

  // كتابة المستخدم في الحقل والمساعد مفتوح تعيد رسم المعاينة على النص الحالي (مستمع input لا يغيّر شيئًا في الحقل).
  private watch(field: TextField | null): void {
    if (this.watched === field) return;
    this.watched?.removeEventListener('input', this.repaint);
    this.watched = field;
    field?.addEventListener('input', this.repaint);
  }

  private session(field: TextField): Session {
    let session = this.sessions.get(field);
    if (!session) {
      session = { state: { kind: kindFor(this.ctx.page.type), language: 'auto', fields: EMPTY_FIELDS } };
      this.sessions.set(field, session);
    }
    return session;
  }

  private open(field: TextField): void {
    if (this.ctx.signal.aborted) return;
    this.current = field;
    this.watch(field);
    if (this.last?.[0] && this.last[0].field !== field) this.last = null;
    this.status = null;
    if (!this.panel) {
      const parts = createShadowHost(this.ctx.document, { name: COMPOSER_PANEL_HOST, hostCss: PANEL_HOST_CSS, styles: PANEL_CSS, label: 'مساعد كتابة البلاغات والمراجعات' });
      parts.root.classList.add('panel-root');
      this.ctx.mutations.insert(this.ctx.document.body ?? this.ctx.document.documentElement, parts.host);
      this.panel = parts;
    }
    for (const { button, field: f } of this.bindings()) button.setAttribute('aria-expanded', f === field ? 'true' : 'false');
    this.paint();
  }

  private close(): void {
    const field = this.current;
    this.current = null;
    this.watch(null);
    this.status = null;
    for (const { button } of this.bindings()) button.setAttribute('aria-expanded', 'false');
    if (this.panel) {
      render(null, this.panel.root);
      this.panel.host.remove();
      this.panel = null;
    }
    // يعود التركيز إلى زر المساعد الذي فتح اللوحة.
    if (field) this.bindings().find((b) => b.field === field && b.host.isConnected)?.button.focus({ preventScroll: true });
  }

  private paint(): void {
    const field = this.current;
    if (!this.panel || !field) return;
    const session = this.session(field);
    render(
      <ComposerPanel
        state={session.state}
        onState={(next) => {
          session.state = next;
          this.paint();
        }}
        draft={field.value}
        template={detectTemplate(field, this.ctx.page.type)}
        canUndo={this.last !== null && this.last[0]?.field === field}
        status={this.status}
        onInsert={(mode, output) => this.insert(field, mode, output)}
        onCopy={(text) => void this.copyText(text)}
        onInsertText={(text, mode) => this.insertText(field, text, mode)}
        onUndo={() => this.undo()}
        onCopyPrevious={() => void this.copyPrevious()}
        onClose={() => this.close()}
      />,
      this.panel.root,
    );
  }

  private say(status: PanelStatus | null): void {
    this.status = status;
    this.paint();
  }

  private insert(field: TextField, mode: InsertMode, output: Output): void {
    if (!field.isConnected) {
      this.say({ tone: 'warn', text: 'حقل الكتابة لم يعد في الصفحة؛ أعد فتح المساعد من الحقل الجديد.' });
      return;
    }
    if (output.kind === 'copy') return; // هيكل القالب غير معروف: لا إدراج في حقول الصفحة (يُنسخ يدويًا).
    if (output.kind === 'edits') {
      // فهارس الخطة من المسودة التي رُسمت عليها المعاينة؛ نص تغيّر بعدها (كتابة المستخدم أو GitHub) يجعلها تقع وسط كلماته، فلا إدراج حتى تُعاد المعاينة على النص الحالي.
      if (field.value !== output.plan.draft) {
        this.say({ tone: 'warn', text: 'تغيّر نص الحقل بعد آخر معاينة، فلم يُدرج شيء ولم يُمس نصك. حُدّثت المعاينة على النص الحالي؛ راجعها ثم أدرج من جديد.' });
        return;
      }
      const done = applyEdits(field, output.plan.edits);
      if (!done.length) return;
      this.last = done;
      const under = output.plan.mapped.length;
      const loose = output.plan.appended.length;
      this.say({
        tone: 'ok',
        text: `أُدرج ${under ? `${under} تحت عناوين القالب` : ''}${under && loose ? ' و' : ''}${loose ? `${loose} في آخر المسودة` : ''}. بقيت ترويسات القالب وقوائم التحقق كما هي، ولم يُرسل شيء؛ يمكنك التراجع.`,
      });
      return;
    }
    this.insertText(field, output.text, mode);
  }

  private insertText(field: TextField, text: string, mode: InsertMode): void {
    if (!field.isConnected) {
      this.say({ tone: 'warn', text: 'حقل الكتابة لم يعد في الصفحة؛ أعد فتح المساعد من الحقل الجديد.' });
      return;
    }
    const insertion = insertBlock(field, text, mode);
    if (!insertion) return;
    this.last = [insertion];
    const where = mode === 'append' ? 'أُلحق في نهاية المسودة' : 'أُدرج عند المؤشر';
    this.say({ tone: 'ok', text: `${where} (${insertion.inserted.trim().length} حرفًا). لم يُمسح شيء من مسودتك، ولم يُرسل شيء؛ يمكنك التراجع.` });
  }

  private undo(): void {
    const insertions = this.last;
    if (!insertions?.length) return;
    const result = undoGroup(insertions);
    if (result.status === 'modified') {
      this.last = insertions.slice(0, result.remaining);
      this.say({ tone: 'warn', text: 'تعذّر التراجع تلقائيًا لأن النص المُدرج تغيّر أو لم يعد في الحقل. استعمل Ctrl+Z أو ⌘+Z في الحقل، أو انسخ المسودة السابقة.', copyPrevious: true });
      return;
    }
    this.last = null;
    this.say({
      tone: 'ok',
      text: result.status === 'restored' ? 'تراجع الإدراج: عادت مسودتك كما كانت قبله حرفيًا.' : 'أُزيل النص المُدرج وبقيت تعديلاتك اللاحقة في الحقل.',
    });
  }

  /** نسخ يدوي لنص المعاينة حين لا يُدرج المساعد في الصفحة (قالب غير معروف الهيكل). لا يمس حقول الصفحة. */
  private async copyText(text: string): Promise<void> {
    try {
      await this.ctx.document.defaultView?.navigator.clipboard.writeText(text);
      this.say({ tone: 'ok', text: 'نُسخ النص إلى الحافظة. الصقه في الحقل الذي تريده بنفسك؛ لم يُمس شيء في الصفحة.' });
    } catch {
      this.say({ tone: 'warn', text: 'تعذّر النسخ تلقائيًا من هذه الصفحة؛ حدّد النص في المعاينة بنفسك وانسخه (Ctrl+C أو ⌘+C).' });
    }
  }

  private async copyPrevious(): Promise<void> {
    const text = this.last?.[0]?.snapshot.value;
    if (text === undefined) return;
    try {
      await this.ctx.document.defaultView?.navigator.clipboard.writeText(text);
      this.say({ tone: 'ok', text: 'نُسخت المسودة السابقة إلى الحافظة.', copyPrevious: true });
    } catch {
      this.say({ tone: 'warn', text: 'تعذّر النسخ إلى الحافظة من هذه الصفحة؛ استعمل Ctrl+Z أو ⌘+Z في الحقل.', copyPrevious: false });
    }
  }

  private dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.current = null;
    this.watch(null);
    this.last = null;
    if (this.panel) {
      render(null, this.panel.root);
      this.panel.host.remove();
      this.panel = null;
    }
  }
}

export const COMPOSER_MODULE: ExtensionModule = createComposerModule();

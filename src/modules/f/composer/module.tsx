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
import { insertBlock, undoInsertion } from './insert';
import type { InsertMode, Insertion } from './insert';
import { ComposerPanel } from './panel';
import type { PanelState, PanelStatus } from './panel';
import { BAR_HOST_CSS, BUTTON_CSS, PANEL_CSS, PANEL_HOST_CSS } from './styles';
import { EMPTY_FIELDS, compose } from './template';
import type { ComposerKind } from './template';

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

class ComposerController {
  private readonly attached = new WeakSet<Element>();
  private readonly buttons = new Map<TextField, HTMLButtonElement>();
  private readonly sessions = new WeakMap<TextField, Session>();
  private panel: ShadowParts | null = null;
  private current: TextField | null = null;
  private last: Insertion | null = null;
  private status: PanelStatus | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

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
      if (records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => !own(n)))) this.schedule();
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
      if (!this.attached.has(toolbar)) this.attachToToolbar(toolbar, field);
    }
    // احتياطي: حقل كتابة بلا شريط أدوات (تغيّر المحرر). المحددات كلها معًا (اتحاد)، لا أولها ذو النتائج: الحقل المقصود غالبًا ما يطابق غير الأول.
    const fieldSelector = ctx.selectors.entry(COMPOSER_SELECTOR_KEYS.field).candidates.join(', ');
    for (const field of ctx.document.querySelectorAll<HTMLTextAreaElement>(fieldSelector)) {
      if (covered.has(field) || !isSupportedField(field) || this.attached.has(field) || this.hasToolbar(field)) continue;
      this.attachBeforeField(field);
    }
  }

  private hasToolbar(field: TextField): boolean {
    for (const toolbar of this.ctx.document.querySelectorAll('markdown-toolbar')) if (fieldForToolbar(toolbar) === field) return true;
    return false;
  }

  private makeButton(field: TextField, parts: ShadowParts): HTMLButtonElement {
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
    button.addEventListener('click', () => (this.panel && this.current === field ? this.close() : this.open(field)));
    parts.root.append(button);
    this.buttons.set(field, button);
    return button;
  }

  private attachToToolbar(toolbar: Element, field: TextField): void {
    const parts = createShadowHost(this.ctx.document, { name: COMPOSER_BUTTON_HOST, styles: BUTTON_CSS });
    parts.host.setAttribute('data-display', 'inline');
    this.makeButton(field, parts);
    this.attached.add(toolbar);
    this.attached.add(field);
    this.ctx.mutations.insert(toolbar, parts.host);
  }

  private attachBeforeField(field: TextField): void {
    const parent = field.parentNode;
    if (!parent) return;
    const parts = createShadowHost(this.ctx.document, { name: COMPOSER_BUTTON_HOST, hostCss: BAR_HOST_CSS, styles: BUTTON_CSS });
    this.makeButton(field, parts);
    this.attached.add(field);
    this.ctx.mutations.insert(parent, parts.host, field);
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
    if (this.last && this.last.field !== field) this.last = null;
    this.status = null;
    if (!this.panel) {
      const parts = createShadowHost(this.ctx.document, { name: COMPOSER_PANEL_HOST, hostCss: PANEL_HOST_CSS, styles: PANEL_CSS, label: 'مساعد كتابة البلاغات والمراجعات' });
      parts.root.classList.add('panel-root');
      this.ctx.mutations.insert(this.ctx.document.body ?? this.ctx.document.documentElement, parts.host);
      this.panel = parts;
    }
    for (const [f, button] of this.buttons) button.setAttribute('aria-expanded', f === field ? 'true' : 'false');
    this.paint();
  }

  private close(): void {
    const field = this.current;
    this.current = null;
    this.status = null;
    for (const button of this.buttons.values()) button.setAttribute('aria-expanded', 'false');
    if (this.panel) {
      render(null, this.panel.root);
      this.panel.host.remove();
      this.panel = null;
    }
    // يعود التركيز إلى زر المساعد الذي فتح اللوحة.
    if (field) this.buttons.get(field)?.focus({ preventScroll: true });
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
        draftLength={field.value.length}
        canUndo={this.last !== null && this.last.field === field}
        status={this.status}
        onInsert={(mode) => this.insert(field, session, mode)}
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

  private insert(field: TextField, session: Session, mode: InsertMode): void {
    if (!field.isConnected) {
      this.say({ tone: 'warn', text: 'حقل الكتابة لم يعد في الصفحة؛ أعد فتح المساعد من الحقل الجديد.' });
      return;
    }
    const { text } = compose(session.state.fields, { kind: session.state.kind, language: session.state.language });
    const insertion = insertBlock(field, text, mode);
    if (!insertion) return;
    this.last = insertion;
    const where = mode === 'append' ? 'أُلحق في نهاية المسودة' : 'أُدرج عند المؤشر';
    this.say({ tone: 'ok', text: `${where} (${insertion.inserted.trim().length} حرفًا). لم يُمسح شيء من مسودتك، ولم يُرسل شيء؛ يمكنك التراجع.` });
  }

  private undo(): void {
    const insertion = this.last;
    if (!insertion) return;
    const result = undoInsertion(insertion);
    if (result.status === 'modified') {
      this.say({ tone: 'warn', text: 'تعذّر التراجع تلقائيًا لأن النص المُدرج تغيّر أو لم يعد في الحقل. استعمل Ctrl+Z أو ⌘+Z في الحقل، أو انسخ المسودة السابقة.', copyPrevious: true });
      return;
    }
    this.last = null;
    this.say({
      tone: 'ok',
      text: result.status === 'restored' ? 'تراجع الإدراج: عادت مسودتك كما كانت قبله حرفيًا.' : 'أُزيل النص المُدرج وبقيت تعديلاتك اللاحقة في الحقل.',
    });
  }

  private async copyPrevious(): Promise<void> {
    const text = this.last?.snapshot.value;
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
    this.last = null;
    if (this.panel) {
      render(null, this.panel.root);
      this.panel.host.remove();
      this.panel = null;
    }
  }
}

export const COMPOSER_MODULE: ExtensionModule = createComposerModule();

// حالة وضع الشرح (F-B1): تعيش في سكربت المحتوى وتبقى بعد تنقل Turbo (الوحدة تُعاد تركيبها بسياق جديد وتقرأ الحالة من هنا).
// يُفعَّل بالاختصار الافتراضي Alt+H (DEC-08 ح-2؛ داخل الصفحة لا في manifest.commands) أو بزر في
// اللوحة الجانبية/الدرج. اللوحة الأصلية صفحة إضافة لا تبلغ هذا السياق مباشرة، فتراسل التبويب النشط برسالة EXPLAIN_MESSAGE.

export const EXPLAIN_SHORTCUT = 'Alt+H';
export const EXPLAIN_MESSAGE = 'mijhar:explain';

export type ExplainAction = 'toggle' | 'on' | 'off' | 'status';

export interface ExplainMessage {
  readonly type: typeof EXPLAIN_MESSAGE;
  readonly action: ExplainAction;
}

export const isExplainMessage = (message: unknown): message is ExplainMessage =>
  typeof message === 'object' &&
  message !== null &&
  (message as ExplainMessage).type === EXPLAIN_MESSAGE &&
  ['toggle', 'on', 'off', 'status'].includes((message as ExplainMessage).action);

export class ExplainMode {
  private on = false;
  private readonly listeners = new Set<(active: boolean) => void>();

  get active(): boolean {
    return this.on;
  }

  set(active: boolean): void {
    if (this.on === active) return;
    this.on = active;
    for (const listener of [...this.listeners]) listener(active);
  }

  toggle(): boolean {
    this.set(!this.on);
    return this.on;
  }

  subscribe(listener: (active: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** يطبّق رسالة لوحة أو درج ويعيد الحالة بعدها. */
  apply(action: ExplainAction): boolean {
    if (action === 'toggle') this.toggle();
    else if (action === 'on') this.set(true);
    else if (action === 'off') this.set(false);
    return this.on;
  }
}

/** الحالة المشتركة داخل سكربت المحتوى للوحدة المسجَّلة. */
export const EXPLAIN_MODE = new ExplainMode();

/**
 * هل للوضع اختصار في هذا المتصفح؟ لا في Firefox على Windows وLinux: Alt+H يفتح فيه قائمة «Help» (مفتاح وصول القائمة)، فيُرجع إلى «بلا اختصار» كما
 * يقضي DEC-08 لما يثبت تعارضه، ويبقى الوضع من زر «وضع الشرح» في اللوحة والدرج.
 */
export function explainShortcutAvailable(target: 'chromium' | 'firefox' = __TARGET__, userAgent: string = globalThis.navigator?.userAgent ?? ''): boolean {
  return target !== 'firefox' || /Macintosh|Mac OS X/.test(userAgent);
}

/** هل الحدث ضغطة الاختصار Alt+H (على code لأن Alt يغيّر key في macOS) خارج حقول الإدخال، حيث للوضع اختصار. */
export function isExplainShortcut(event: KeyboardEvent): boolean {
  if (event.repeat || event.defaultPrevented || !explainShortcutAvailable()) return false;
  if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.code !== 'KeyH') return false;
  const target = event.target as Element | null;
  const editable = target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
  return !editable;
}

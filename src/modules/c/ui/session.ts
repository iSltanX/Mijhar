// جلسة ترجمة نص واحد (README أو تعليق أو وصف) بعد فعل صريح من المستخدم (F-C1/F-C3): تجمع فقرات النص، وتترجم كلًّا منها بالتقنيع والفحص الرباعي وقاعدة
// الفشل الآمن (translateProtected)، وتعرض الترجمة في مضيف Shadow DOM بجانب الأصل أو مكانه، وتعيد الصفحة إلى حالتها السابقة بإلغاء الترجمة.
//  - أنماط العرض: both (الأصل ثم الترجمة تحته)، translation (الترجمة مكان الأصل)، original (الأصل وحده: «إظهار الأصل» بفعل واحد، والترجمة محفوظة).
//  - الإخفاء بلا تغليف حيث أمكن: الفقرة (p وh…) تُخفى بـdisplay:none !important وتُعاد قيمتها السابقة؛ وما محتواه نص مباشر (li وtd وth وdt وdd وsummary)
//    يُلفّ محتواه المباشر بعنصر مؤقت <mijhar-original> عند «الترجمة فقط» وحدها، ويُفكّ عند الرجوع.
//  - كل إدراج عبر ctx.mutations، وتسجّل الجلسة عكسًا واحدًا (revert) لما لا يغطيه السجل، فيعيد إيقاف الوحدة الصفحة حرفيًا.
import type { ModuleContext } from '../../../core';
import { INTEGRITY_WARNING, maskSegments, translateProtected } from '../masking';
import type { ProtectedTranslation } from '../masking';
import { BLOCKISH, collectBlocks, tokenNodes } from './blocks';
import type { TranslatableBlock } from './blocks';
import { MAX_BLOCKS } from './ids';
import { isAbort } from './service';
import type { TranslationService } from './service';
import { buildTranslationBody, createTranslationHost, createWarningHost } from './translation-dom';

export type DisplayMode = 'both' | 'translation' | 'original';
export type Phase = 'idle' | 'working' | 'done' | 'error' | 'empty';

export interface SessionSnapshot {
  readonly phase: Phase;
  readonly mode: DisplayMode;
  /** عدد الفقرات القابلة للترجمة، وما تُرجم منها، وما بقي أصله لسلامة الرموز. */
  readonly total: number;
  readonly done: number;
  readonly kept: number;
  /** فقرات تُركت (عربية أصلًا أو بلا نص يُترجم أو داخل شيفرة). */
  readonly skipped: number;
  /** اقتُصر على أول MAX_BLOCKS فقرة. */
  readonly truncated: boolean;
  readonly error?: string;
}

interface Entry {
  readonly block: TranslatableBlock;
  readonly kind: 'translated' | 'kept';
  readonly host: HTMLElement;
  readonly placement: 'after' | 'inside';
  readonly anchor: Element;
  hidden: (() => void) | null;
}

const INSIDE = 'li, td, th, dt, dd, summary';

const firstBlockishChild = (element: Element): Element | null => [...element.children].find((c) => c.matches(BLOCKISH) && c.localName !== 'mijhar-host') ?? null;

/** الفقرة تُدرج الترجمة بعدها، إلا العنوان داخل غلاف .markdown-heading فبعد الغلاف (الغلاف تخطيط مرن لا يُدرج فيه شيء). */
function anchorOf(element: Element): Element {
  const wrapper = /^h[1-6]$/.test(element.localName) ? element.parentElement : null;
  return wrapper?.matches('.markdown-heading') ? wrapper : element;
}

function hideAfter(anchor: Element): () => void {
  const el = anchor as HTMLElement;
  const value = el.style.getPropertyValue('display');
  const priority = el.style.getPropertyPriority('display');
  const had = el.hasAttribute('style');
  el.style.setProperty('display', 'none', 'important');
  return () => {
    if (value) el.style.setProperty('display', value, priority);
    else el.style.removeProperty('display');
    if (!had && el.getAttribute('style') === '') el.removeAttribute('style');
  };
}

function hideInside(element: Element, host: Element): () => void {
  const doc = element.ownerDocument;
  const stop = firstBlockishChild(element);
  const nodes: ChildNode[] = [];
  for (const node of element.childNodes) {
    if (node === host) continue;
    if (stop && node === stop) break;
    nodes.push(node);
  }
  if (!nodes.length) return () => {};
  const wrapper = doc.createElement('mijhar-original');
  wrapper.setAttribute('data-mijhar-injected', 'true');
  wrapper.style.setProperty('display', 'none', 'important');
  element.insertBefore(wrapper, nodes[0] as ChildNode);
  for (const node of nodes) wrapper.append(node);
  return () => {
    for (const node of [...wrapper.childNodes]) element.insertBefore(node, wrapper);
    wrapper.remove();
  };
}

export interface SessionOptions {
  readonly mode?: DisplayMode;
  readonly maxBlocks?: number;
}

export class TranslationSession {
  private controller: AbortController | null = null;
  private entries: Entry[] = [];
  private state: SessionSnapshot;
  private mode: DisplayMode;
  private reverted = false;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly body: Element,
    private readonly service: TranslationService,
    private readonly onChange: (snapshot: SessionSnapshot) => void,
    private readonly options: SessionOptions = {},
  ) {
    this.mode = options.mode ?? 'both';
    this.state = { phase: 'idle', mode: this.mode, total: 0, done: 0, kept: 0, skipped: 0, truncated: false };
    ctx.mutations.custom('c.ui.session', () => this.revert());
  }

  get snapshot(): SessionSnapshot {
    return this.state;
  }

  private set(patch: Partial<SessionSnapshot>): void {
    this.state = { ...this.state, ...patch, mode: this.mode };
    this.onChange(this.state);
  }

  /** يبدأ الترجمة. يُستدعى من فعل صريح من المستخدم وحده. */
  async run(): Promise<void> {
    if (this.state.phase === 'working') return;
    this.revert(false);
    const controller = new AbortController();
    this.controller = controller;
    const { signal } = controller;
    const collected = collectBlocks(this.body);
    const skipped = Object.values(collected.skipped).reduce((a, b) => a + b, 0);
    const blocks = collected.blocks.slice(0, this.options.maxBlocks ?? MAX_BLOCKS);
    const truncated = collected.blocks.length > blocks.length;
    if (!blocks.length) {
      this.set({ phase: 'empty', total: 0, done: 0, kept: 0, skipped, truncated: false });
      return;
    }
    this.set({ phase: 'working', total: blocks.length, done: 0, kept: 0, skipped, truncated });
    let done = 0;
    let kept = 0;
    for (const block of blocks) {
      if (signal.aborted || this.ctx.signal.aborted) return;
      let result: ProtectedTranslation;
      try {
        result = await translateProtected(block.segments, (masked, context) => this.service.translate(masked, context), { signal, locale: 'en' });
      } catch (error) {
        if (isAbort(error) || signal.aborted) return;
        this.set({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
        return;
      }
      if (signal.aborted || this.ctx.signal.aborted) return;
      if (result.status === 'translated') {
        const { expectedTokens } = maskSegments(block.segments);
        const body = buildTranslationBody(this.ctx.document, result.masked, expectedTokens, tokenNodes(block, expectedTokens));
        this.add(block, 'translated', createTranslationHost(this.ctx.document, body).parts.host);
      } else {
        kept += 1;
        this.add(block, 'kept', createWarningHost(this.ctx.document, result.warning ?? INTEGRITY_WARNING).parts.host);
      }
      done += 1;
      this.set({ done, kept });
    }
    if (!signal.aborted) this.set({ phase: 'done' });
  }

  private add(block: TranslatableBlock, kind: Entry['kind'], host: HTMLElement): void {
    const element = block.element;
    const placement: Entry['placement'] = element.matches(INSIDE) ? 'inside' : 'after';
    const anchor = placement === 'after' ? anchorOf(element) : element;
    if (placement === 'after') this.ctx.mutations.insert(anchor.parentNode as Node, host, anchor.nextSibling);
    else this.ctx.mutations.insert(element, host, firstBlockishChild(element));
    const entry: Entry = { block, kind, host, placement, anchor, hidden: null };
    this.entries.push(entry);
    this.apply(entry);
  }

  /** يطابق ظهور الأصل والترجمة مع النمط الحالي. */
  private apply(entry: Entry): void {
    const showTranslation = this.mode !== 'original';
    if (showTranslation) entry.host.removeAttribute('data-hidden');
    else entry.host.setAttribute('data-hidden', '');
    const hideOriginal = this.mode === 'translation' && entry.kind === 'translated' && !entry.block.hasMedia;
    if (hideOriginal && !entry.hidden) entry.hidden = entry.placement === 'after' ? hideAfter(entry.anchor) : hideInside(entry.anchor, entry.host);
    else if (!hideOriginal && entry.hidden) {
      entry.hidden();
      entry.hidden = null;
    }
  }

  setMode(mode: DisplayMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    for (const entry of this.entries) this.apply(entry);
    this.set({});
  }

  /** إلغاء الترجمة (أو الإلغاء أثناءها): يوقف الطلب ويعيد الصفحة إلى حالتها قبل الترجمة، ويعود الشريط إلى حاله الأول. */
  cancel(): void {
    this.controller?.abort();
    this.controller = null;
    this.mode = this.options.mode ?? 'both';
    this.revert(false);
    this.state = { phase: 'idle', mode: this.mode, total: 0, done: 0, kept: 0, skipped: 0, truncated: false };
    this.onChange(this.state);
  }

  /** يزيل مضيفات الجلسة ويعيد الأصل. final: إيقاف الوحدة (لا إشعار ولا إعادة استعمال). */
  private revert(final = true): void {
    if (final) {
      this.reverted = true;
      this.controller?.abort();
    }
    for (const entry of this.entries.splice(0).reverse()) {
      entry.hidden?.();
      entry.hidden = null;
      entry.host.remove();
    }
  }

  get isReverted(): boolean {
    return this.reverted;
  }
}

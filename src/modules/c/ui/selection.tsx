// ترجمة نص محدد (F-C1: «عند تحديد أي فقرة نصية داخل .markdown-body»): عند تحديد نص إنجليزي داخل نص مرسوم يظهر زر عائم «ترجمة المحدد» ولا يُترجم شيء قبل ضغطه؛
// وبعد الضغط تظهر بطاقة قرب التحديد بالأصل والترجمة وزر إغلاق (و Escape). لا تعدّل الصفحة ولا التحديد (الزر لا ينقل التركيز). العناصر المحمية داخل
// التحديد (code والروابط…) تُقنَّع وتُعاد كما كانت، والفشل الآمن كما في الفقرات.
import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { ModuleContext } from '../../../core';
import { createShadowHost } from '../../../core/ui-host/shadow';
import type { ShadowParts } from '../../../core/ui-host/shadow';
import { copyMaskedText } from '../engines/fallback';
import type { ClipboardWrite } from '../engines/fallback';
import { INTEGRITY_WARNING, maskSegments, translateProtected } from '../masking';
import type { ProtectedTranslation } from '../masking';
import { inlineSegments, skipReasonFor, tokenNodes } from './blocks';
import { isAbort } from './service';
import type { TranslationService } from './service';
import { FLOAT_CSS, FLOAT_HOST_CSS } from './styles';
import { buildTranslationBody } from './translation-dom';

export const SELECTION_HOST_NAME = 'c.ui.selection';
const MARGIN = 8;
const CARD_WIDTH = 380;

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface SelectionTarget {
  readonly range: Range;
  readonly body: Element;
  /** نص التحديد الخام للعرض. */
  readonly text: string;
}

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), Math.max(min, max));

/** هل التحديد الحالي نص إنجليزي داخل نص مرسوم (.markdown-body) يستحق الترجمة. */
export function selectionTarget(doc: Document, bodySelector = '.markdown-body'): SelectionTarget | null {
  const selection = doc.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const root = range.commonAncestorContainer;
  const start = root.nodeType === 1 ? (root as Element) : root.parentElement;
  const body = start?.closest(bodySelector);
  if (!body || start?.closest('mijhar-host, textarea, [contenteditable], input')) return null;
  const text = selection.toString().replace(/\s+/g, ' ').trim();
  if (text.length < 3 || skipReasonFor(text) !== null) return null;
  return { range, body, text };
}

function Button({ left, top, onTranslate }: { left: number; top: number; onTranslate: () => void }) {
  return (
    <button
      type="button"
      class="btn btn-primary sel-btn"
      data-action="translate-selection"
      style={{ left: `${left}px`, top: `${top}px` }}
      // الضغط لا ينقل التركيز فيبقى التحديد قائمًا حتى تُقرأ الشظية.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onTranslate}
    >
      ترجمة المحدد
    </button>
  );
}

export interface SelectionCardState {
  readonly status: 'working' | 'translated' | 'kept' | 'error' | 'unavailable';
  readonly original: string;
  readonly body?: HTMLElement;
  readonly message?: string;
  /** بديل غياب المحرك (AC-C4): نسخ التحديد مقنَّعًا، ونتيجة آخر نسخ. */
  readonly copy?: () => void;
  readonly copyNote?: string;
}

function Card({ state, left, top, onClose }: { state: SelectionCardState; left: number; top: number; onClose: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const holder = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const slot = holder.current;
    if (!slot) return;
    slot.replaceChildren();
    if (state.body) slot.append(state.body);
  }, [state.body]);
  return (
    <div
      class="sel-card"
      ref={card}
      role="dialog"
      aria-modal="false"
      aria-label="ترجمة النص المحدد"
      tabIndex={-1}
      style={{ left: `${left}px`, top: `${top}px` }}
      data-status={state.status}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <h2>ترجمة المحدد</h2>
        <button type="button" class="btn icon-btn" data-action="close" aria-label="إغلاق" title="إغلاق (Esc)" onClick={onClose}>
          ×
        </button>
      </header>
      <p class="sel-original" lang="en" dir="ltr" data-section="original">
        {state.original}
      </p>
      {state.status === 'working' && (
        <p class="sel-result" role="status" data-section="status">
          جارٍ الترجمة…
        </p>
      )}
      {state.status === 'translated' && <p class="sel-result" lang="ar" dir="rtl" data-section="translation" ref={holder} />}
      {(state.status === 'kept' || state.status === 'error' || state.status === 'unavailable') && (
        <p class="tr-warning" role="note" data-section="notice">
          {state.message}
        </p>
      )}
      {state.copy && (
        <button type="button" class="btn" data-action="copy-masked" title="ينسخ التحديد إلى الحافظة والشيفرة والمسارات والروابط مستبدلة برموز ⟦…⟧، بلا أي اتصال" onClick={state.copy}>
          نسخ النص المقنَّع
        </button>
      )}
      {state.copyNote && (
        <p class="sel-result" role="status" data-section="copy-note">
          {state.copyNote}
        </p>
      )}
    </div>
  );
}

export interface SelectionOptions {
  readonly debounceMs?: number;
  readonly rectOf?: (range: Range) => Rect;
  /** محددات النص المرسوم القابل للترجمة (مرشحات c.ui.body المسجلة، VR-21). الافتراضي .markdown-body. */
  readonly bodySelector?: string;
  /** الكتابة إلى الحافظة لبديل «نسخ النص المقنَّع»؛ الافتراضي navigator.clipboard. */
  readonly copy?: ClipboardWrite;
}

const defaultRect = (range: Range): Rect => {
  const rects = range.getClientRects();
  const r = rects.length ? (rects[rects.length - 1] as DOMRect) : range.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

/** يراقب التحديد ويعرض زر الترجمة وبطاقتها؛ لا يعمل إلا بعد bind(true) (حين يكون المحرك حاضرًا). */
export class SelectionTranslator {
  private parts: ShadowParts | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private target: SelectionTarget | null = null;
  private anchor: Rect | null = null;
  private card: SelectionCardState | null = null;
  private bound = false;

  constructor(
    private readonly ctx: ModuleContext,
    private readonly service: () => TranslationService | null,
    private readonly options: SelectionOptions = {},
  ) {
    ctx.onTeardown(() => this.dispose());
  }

  bind(on: boolean): void {
    if (on === this.bound) return;
    this.bound = on;
    if (on) this.ctx.document.addEventListener('selectionchange', this.onSelection);
    else {
      this.ctx.document.removeEventListener('selectionchange', this.onSelection);
      this.dispose();
    }
  }

  private readonly onSelection = (): void => {
    if (this.card) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.evaluate();
    }, this.options.debounceMs ?? 150);
  };

  private evaluate(): void {
    if (this.ctx.signal.aborted || this.card) return;
    const target = selectionTarget(this.ctx.document, this.options.bodySelector);
    if (!target) {
      this.hide();
      return;
    }
    this.target = target;
    this.anchor = (this.options.rectOf ?? defaultRect)(target.range);
    this.draw();
  }

  private host(): ShadowParts {
    if (this.parts) return this.parts;
    const parts = createShadowHost(this.ctx.document, { name: SELECTION_HOST_NAME, hostCss: FLOAT_HOST_CSS, styles: FLOAT_CSS, label: 'ترجمة النص المحدد' });
    parts.root.classList.add('float-root');
    this.ctx.mutations.insert(this.ctx.document.body ?? this.ctx.document.documentElement, parts.host);
    this.parts = parts;
    return parts;
  }

  private viewport(): { width: number; height: number } {
    const doc = this.ctx.document;
    return { width: doc.documentElement.clientWidth || doc.defaultView?.innerWidth || 0, height: doc.documentElement.clientHeight || doc.defaultView?.innerHeight || 0 };
  }

  private draw(): void {
    const parts = this.host();
    const vp = this.viewport();
    const a = this.anchor ?? { left: 0, top: 0, width: 0, height: 0 };
    if (this.card) {
      const left = clamp(a.left + a.width - CARD_WIDTH, MARGIN, vp.width - Math.min(CARD_WIDTH, vp.width - 2 * MARGIN) - MARGIN);
      const below = a.top + a.height + MARGIN;
      const top = below + 160 > vp.height ? Math.max(MARGIN, a.top - 220) : below;
      render(<Card state={this.card} left={left} top={top} onClose={() => this.closeCard()} />, parts.root);
    } else {
      const left = clamp(a.left + a.width - 90, MARGIN, vp.width - 130);
      const top = clamp(a.top + a.height + 6, MARGIN, vp.height - 44);
      render(<Button left={left} top={top} onTranslate={() => void this.translate()} />, parts.root);
    }
  }

  /** فعل صريح: ضغط زر «ترجمة المحدد». */
  async translate(): Promise<void> {
    const target = this.target;
    if (!target || this.ctx.signal.aborted) return;
    const service = this.service();
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const original = target.text;
    const set = (state: SelectionCardState): void => {
      if (controller.signal.aborted) return;
      this.card = state;
      this.draw();
    };
    set({ status: 'working', original });
    const { segments, nodes } = inlineSegments(target.range.cloneContents(), true);
    const unavailable = (message: string): void => {
      const state: SelectionCardState = {
        status: 'unavailable',
        original,
        message,
        copy: () => void copyMaskedText([segments], this.options.copy).then((copyNote) => set({ ...state, copyNote })),
      };
      set(state);
    };
    if (!service) return unavailable('لا محرك ترجمة محلي مُفعَّل.');
    const availability = await service.availability().catch(() => ({ state: 'unavailable' as const, reason: 'تعذّر فحص المحرك' }));
    if (availability.state !== 'ready') return unavailable(availability.state === 'unavailable' ? `المحرك غير متاح: ${availability.reason}` : 'لا محرك ترجمة محلي مُفعَّل.');
    let result: ProtectedTranslation;
    try {
      result = await translateProtected(segments, (masked, context) => service.translate(masked, context), { signal: controller.signal, locale: 'en' });
    } catch (error) {
      if (isAbort(error) || controller.signal.aborted) return;
      return set({ status: 'error', original, message: `تعذّرت الترجمة: ${error instanceof Error ? error.message : String(error)}` });
    }
    if (result.status === 'translated') {
      const { expectedTokens } = maskSegments(segments);
      set({ status: 'translated', original, body: buildTranslationBody(this.ctx.document, result.masked, expectedTokens, tokenNodes({ segments, nodes }, expectedTokens)) });
    } else set({ status: 'kept', original, message: result.warning ?? INTEGRITY_WARNING });
  }

  closeCard(): void {
    this.controller?.abort();
    this.controller = null;
    this.card = null;
    this.target = null;
    this.hide();
  }

  private hide(): void {
    if (!this.parts) return;
    render(null, this.parts.root);
    this.parts.host.remove();
    this.parts = null;
  }

  private dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
    this.card = null;
    this.target = null;
    this.hide();
  }
}

// علامات الأسطر: زر هادئ صغير داخل عنصر رقم السطر لكل سطر عليه ملاحظة، ينقل إلى الملاحظة في البطاقة. لا تُعلَّم إلا ملاحظات أسطر
// المرجع الظاهر نفسه (علاقة exact): ملاحظة محفوظة على مرجع آخر لا تُلصق بسطر لم يُتحقق منه في هذا المرجع (يُعرض في البطاقة وحدها).
// الصفحات تعيد رسم أرقام الأسطر (نافذة افتراضية)، فتُوفَّق العلامات عند كل تعديل في الصفحة بتأخير قصير، وتُزال بإزالة الوحدة.
import { render } from 'preact';
import type { ModuleContext } from '../../../core/registry';
import { createShadowHost } from '../../../core/ui-host/shadow';
import type { ShadowParts } from '../../../core/ui-host/shadow';
import type { PageInfo } from '../../../shared/page';
import { lineElementFor } from './dom';
import { notesForPage } from './targets';
import type { LineTarget, Note } from './types';
import { NOTES_CSS } from './ui/styles';

export interface LineMarkersDeps {
  readonly ctx: ModuleContext;
  readonly page: () => PageInfo;
  readonly notes: () => Note[];
  readonly enabled: () => boolean;
  /** نقر علامة: معرّفات الملاحظات على ذلك السطر. */
  readonly onActivate: (noteIds: readonly string[]) => void;
}

interface Placed {
  readonly element: Element;
  readonly parts: ShadowParts;
  signature: string;
}

const MARKER_HOST = 'g-line-marker';
const DEBOUNCE_MS = 120;

const lineKey = (target: LineTarget): string => (target.view === 'blob' ? `blob:${target.start}` : `diff:${target.path}:${target.side}${target.start}`);

export class LineMarkers {
  private readonly placed = new Map<string, Placed>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly deps: LineMarkersDeps) {}

  /** يجدول توفيقًا واحدًا بعد هدوء قصير. */
  schedule(): void {
    if (this.disposed || this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.sync();
    }, DEBOUNCE_MS);
  }

  sync(): void {
    if (this.disposed || this.deps.ctx.signal.aborted) return;
    const { ctx } = this.deps;
    const wanted = this.wanted();
    for (const [key, placed] of [...this.placed]) {
      if (!wanted.has(key) || !placed.element.isConnected) this.remove(key);
    }
    for (const [key, group] of wanted) {
      const target = group[0]?.target as LineTarget | undefined;
      if (!target) continue;
      const signature = group.map((n) => n.id).join(',');
      const existing = this.placed.get(key);
      if (existing) {
        if (existing.signature !== signature) this.draw(existing, group, signature);
        continue;
      }
      const element = lineElementFor(ctx.document, ctx.selectors, target);
      if (!element) continue;
      const parts = createShadowHost(ctx.document, { name: MARKER_HOST, styles: NOTES_CSS });
      parts.host.setAttribute('data-display', 'inline');
      ctx.mutations.insert(element, parts.host, element.firstChild);
      const placed: Placed = { element, parts, signature };
      this.placed.set(key, placed);
      this.draw(placed, group, signature);
    }
  }

  get count(): number {
    return this.placed.size;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    for (const key of [...this.placed.keys()]) this.remove(key);
  }

  // ملاحظات الأسطر ذات العلاقة exact بالصفحة، مجموعةً بحسب موضع العلامة.
  private wanted(): Map<string, Note[]> {
    const groups = new Map<string, Note[]>();
    if (!this.deps.enabled()) return groups;
    const page = this.deps.page();
    const { byLevel, relations } = notesForPage(this.deps.notes(), page);
    for (const note of byLevel.line) {
      if (relations.get(note.id) !== 'exact' || note.target.level !== 'line') continue;
      const key = lineKey(note.target);
      groups.set(key, [...(groups.get(key) ?? []), note]);
    }
    return groups;
  }

  private draw(placed: Placed, group: readonly Note[], signature: string): void {
    placed.signature = signature;
    const ids = group.map((n) => n.id);
    const label = group.length === 1 ? 'ملاحظة خاصة على هذا السطر' : `${group.length} ملاحظات خاصة على هذا السطر`;
    render(
      <button
        type="button"
        class="line-marker"
        data-note-count={group.length}
        title={label}
        aria-label={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          this.deps.onActivate(ids);
        }}
      >
        {group.length > 1 ? group.length : '✎'}
      </button>,
      placed.parts.root,
    );
  }

  private remove(key: string): void {
    const placed = this.placed.get(key);
    if (!placed) return;
    this.placed.delete(key);
    render(null, placed.parts.root);
    placed.parts.host.remove();
  }
}

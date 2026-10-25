// Mutation Registry: كل تعديل DOM تجريه الوحدة عبر MutationRecorder يُسجَّل معه عكسه، فيعيد restore()
// الحالة السابقة بترتيب معاكس. يُجري كل عكس فحص ملكية قبل الكتابة: إن غيّر طرف آخر ما كتبته الإضافة
// فلا يُلمس، ويُسجَّل في RestoreReport.skipped برقم من «استثناءات الاستعادة» (restore-exceptions.ts).
import type { RestoreExceptionId } from './restore-exceptions';

export interface RestoreSkip {
  readonly exception: RestoreExceptionId;
  readonly detail: string;
}

export interface RestoreReport {
  readonly moduleId: string;
  /** تعديلات أُعيدت فعلًا. */
  readonly restored: number;
  /** تعديلات كان أثرها قد زال بغير الإضافة (مثل عنصر محقون أزاله Turbo): لا شيء يُعاد والنتيجة متطابقة. */
  readonly alreadyGone: number;
  readonly skipped: readonly RestoreSkip[];
  /** كتابات رُفضت لأنها وصلت بعد الإغلاق (استمرار غير متزامن بعد الإيقاف). */
  readonly rejectedAfterClose: number;
  readonly durationMs: number;
}

type Outcome = { kind: 'restored' } | { kind: 'already-gone' } | { kind: 'skipped'; exception: RestoreExceptionId; detail: string };

const RESTORED: Outcome = { kind: 'restored' };
const ALREADY_GONE: Outcome = { kind: 'already-gone' };
const skipped = (exception: RestoreExceptionId, detail: string): Outcome => ({ kind: 'skipped', exception, detail });

interface Entry {
  readonly label: string;
  readonly undo: () => Outcome;
}

const describe = (el: Element): string => `<${el.localName}${el.id ? `#${el.id}` : ''}>`;

export class MutationRecorder {
  private readonly entries: Entry[] = [];
  /** ما أدرجه هذا السجل بـinsert: وحده يُعاد بـreattach. */
  private readonly inserted = new WeakSet<Node>();
  private isClosed = false;
  private rejected = 0;

  constructor(
    readonly moduleId: string,
    private readonly now: () => number = () => globalThis.performance.now(),
  ) {}

  get closed(): boolean {
    return this.isClosed;
  }

  /** عدد التعديلات المسجَّلة غير المستعادة بعد. */
  get size(): number {
    return this.entries.length;
  }

  /** يدرج عقدة جديدة. لا يقبل عقدة مرتبطة بأب (النقل غير عكوس هنا) ولا DocumentFragment (يفرغ بعد الإدراج). */
  insert<N extends Node>(parent: Node, node: N, before: Node | null = null): N {
    if (node.nodeType === 11) throw new Error('insert: DocumentFragment غير مدعوم؛ أدرج عقده واحدة واحدة');
    if (node.parentNode) throw new Error('insert: العقدة مرتبطة بأب؛ استعمل replace أو custom');
    if (this.reject()) return node;
    parent.insertBefore(node, before);
    this.inserted.add(node);
    this.entries.push({
      label: 'insert',
      undo: () => {
        if (!node.parentNode) return ALREADY_GONE;
        node.parentNode.removeChild(node);
        return RESTORED;
      },
    });
    return node;
  }

  /**
   * يعيد عقدة أدرجها هذا السجل نفسه إلى موضع جديد بعد أن أبعدتها الصفحة (MJ-F-01): GitHub يستبدل بعد الإماهة الشجرة التي فيها المضيف، فيبقى
   * مفصولًا عن المستند وله أب في الشجرة المفصولة. تُنزع من أبيها أيًّا كان ثم تُدرج. لا قيد جديد: عكس إدراجها الأول يزيلها من أي أب تكون فيه، فلا
   * تتراكم القيود بتكرار الإعادة. لا يقبل عقدة لم يُدرجها (الصفحة لا تُنقل عقدها هنا)، ويعيد false بعد الإغلاق.
   */
  reattach(parent: Node, node: Node, before: Node | null = null): boolean {
    if (!this.inserted.has(node)) throw new Error('reattach: العقدة لم يُدرجها هذا السجل؛ استعمل insert');
    if (this.reject()) return false;
    node.parentNode?.removeChild(node);
    parent.insertBefore(node, before);
    return true;
  }

  /** يستبدل عقدة موجودة بأخرى ويحفظ الأصل لإعادته. */
  replace(oldNode: ChildNode, newNode: Node): void {
    const parent = oldNode.parentNode;
    if (!parent) throw new Error('replace: العقدة الأصلية غير مرتبطة بأب');
    if (newNode.nodeType === 11 || newNode.parentNode) throw new Error('replace: البديلة يجب أن تكون عقدة جديدة غير مرتبطة');
    if (this.reject()) return;
    parent.replaceChild(newNode, oldNode);
    this.entries.push({
      label: 'replace',
      undo: () => {
        if (oldNode.parentNode) {
          newNode.parentNode?.removeChild(newNode);
          return skipped('replaced-original-reattached', 'أعادت الصفحة العقدة الأصلية بنفسها');
        }
        if (!newNode.parentNode) return skipped('replaced-node-lost', 'فُصلت العقدة البديلة فلا موضع لإعادة الأصل');
        newNode.parentNode.replaceChild(oldNode, newNode);
        return RESTORED;
      },
    });
  }

  setAttribute(el: Element, name: string, value: string): void {
    if (this.reject()) return;
    const had = el.hasAttribute(name);
    const original = el.getAttribute(name);
    el.setAttribute(name, value);
    const written = el.getAttribute(name);
    this.entries.push({
      label: `attribute:${name}`,
      undo: () => {
        if (el.getAttribute(name) !== written) return skipped('external-attribute-change', `${describe(el)}[${name}] تغيّرت بعد كتابة الإضافة`);
        if (had && original !== null) el.setAttribute(name, original);
        else el.removeAttribute(name);
        return RESTORED;
      },
    });
  }

  removeAttribute(el: Element, name: string): void {
    if (!el.hasAttribute(name)) return;
    if (this.reject()) return;
    const original = el.getAttribute(name) as string;
    el.removeAttribute(name);
    this.entries.push({
      label: `remove-attribute:${name}`,
      undo: () => {
        if (el.hasAttribute(name)) return skipped('external-attribute-change', `${describe(el)}[${name}] أعاد طرف آخر كتابتها`);
        el.setAttribute(name, original);
        return RESTORED;
      },
    });
  }

  /** يضيف الأصناف الغائبة فقط، فلا يُزال عند العكس صنف كان موجودًا قبلها. */
  addClass(el: Element, ...names: string[]): void {
    const added = names.filter((name) => !el.classList.contains(name));
    if (!added.length) return;
    if (this.reject()) return;
    const hadAttribute = el.hasAttribute('class');
    el.classList.add(...added);
    this.entries.push({
      label: 'class:add',
      undo: () => {
        for (const name of added) el.classList.remove(name);
        if (!hadAttribute && el.getAttribute('class') === '') el.removeAttribute('class');
        return RESTORED;
      },
    });
  }

  /** يزيل الأصناف الموجودة فقط، ويعيدها عند العكس إن لم تكن عادت. */
  removeClass(el: Element, ...names: string[]): void {
    const removed = names.filter((name) => el.classList.contains(name));
    if (!removed.length) return;
    if (this.reject()) return;
    el.classList.remove(...removed);
    this.entries.push({
      label: 'class:remove',
      undo: () => {
        for (const name of removed) el.classList.add(name);
        return RESTORED;
      },
    });
  }

  setStyle(el: ElementCSSInlineStyle & Element, property: string, value: string, priority = ''): void {
    if (this.reject()) return;
    const { style } = el;
    const hadAttribute = el.hasAttribute('style');
    const previousValue = style.getPropertyValue(property);
    const previousPriority = style.getPropertyPriority(property);
    style.setProperty(property, value, priority);
    const writtenValue = style.getPropertyValue(property);
    const writtenPriority = style.getPropertyPriority(property);
    this.entries.push({
      label: `style:${property}`,
      undo: () => {
        if (style.getPropertyValue(property) !== writtenValue || style.getPropertyPriority(property) !== writtenPriority) {
          return skipped('external-style-change', `${describe(el)} style.${property} تغيّرت بعد كتابة الإضافة`);
        }
        if (previousValue) style.setProperty(property, previousValue, previousPriority);
        else style.removeProperty(property);
        if (!hadAttribute && el.getAttribute('style') === '') el.removeAttribute('style');
        return RESTORED;
      },
    });
  }

  /** استعادة صريحة لما لا تغطيه الدوال أعلاه (مثل محرك T-2.7 للنصوص). تُنفَّذ بترتيب معاكس مع غيرها. */
  custom(label: string, undo: () => void): void {
    if (this.reject()) return;
    this.entries.push({
      label: `custom:${label}`,
      undo: () => {
        try {
          undo();
        } catch (error) {
          return skipped('custom-undo-failed', `${label}: ${error instanceof Error ? error.message : String(error)}`);
        }
        return RESTORED;
      },
    });
  }

  /** يعكس كل ما سُجِّل بترتيب معاكس ثم يُغلق السجل. استدعاؤه ثانية يعيد تقريرًا فارغًا. */
  restore(): RestoreReport {
    const started = this.now();
    this.isClosed = true;
    let restored = 0;
    let alreadyGone = 0;
    const skips: RestoreSkip[] = [];
    for (const entry of this.entries.splice(0).reverse()) {
      let outcome: Outcome;
      try {
        outcome = entry.undo();
      } catch (error) {
        outcome = skipped('undo-threw', `${entry.label}: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (outcome.kind === 'restored') restored += 1;
      else if (outcome.kind === 'already-gone') alreadyGone += 1;
      else skips.push({ exception: outcome.exception, detail: outcome.detail });
    }
    return {
      moduleId: this.moduleId,
      restored,
      alreadyGone,
      skipped: skips,
      rejectedAfterClose: this.rejected,
      durationMs: this.now() - started,
    };
  }

  private reject(): boolean {
    if (!this.isClosed) return false;
    this.rejected += 1;
    return true;
  }
}

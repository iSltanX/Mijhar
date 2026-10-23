// معالج الاتجاه (T-2.1، F-A1): يقلب إلى rtl الكتل العربية في حاويات المحتوى والكتل المستقلة فقط، حيث يعرضها GitHub ltr، بالسمتين
// data-mijhar-dir="rtl" وdata-mijhar-orig-dir (قيمة dir الأصلية، أو '' إن غابت) عبر سجل التعديلات، ولا يمس سمة dir نفسها ولا
// هيكل الصفحة (شجرة الملفات والترويسة والمخطط تبقى ltr). القائمة تُقلب كلها حين تكون كل عناصرها عربية، فتنتقل علاماتها وحشوتها
// معها؛ وفي القائمة المختلطة يُقلب العنصر العربي وحده فلا يتغير اتجاه عنصر إنجليزي (AC-A1 بند ب).
// الكتلة التي قُلبت لا يُعاد تقييمها؛ وما لم يُقلب يُقاس ثانية إذا تغيّر محتواه أو أضاف GitHub محتوى جديدًا.
import type { MutationRecorder, SelectorsRegistry } from '../../../core';
import { measureBlock, measureContainer, resolveNative } from './bidi';
import type { BlockMeasure } from './bidi';
import { DEFAULT_DIRECTION_OPTIONS, decide } from './decide';
import type { BlockVerdict, DirectionOptions } from './decide';
import { CONTAINER_BLOCKS, DIRECTION_SELECTOR_KEYS, LISTS, NEVER_INSIDE, STANDALONE_KEYS } from './selectors';

export const DIR_ATTR = 'data-mijhar-dir';
export const ORIG_DIR_ATTR = 'data-mijhar-orig-dir';

export interface DirectionHost {
  readonly document: Document;
  readonly selectors: SelectorsRegistry;
  readonly mutations: Pick<MutationRecorder, 'setAttribute'>;
}

export interface DirectionStats {
  /** كتل قيست في هذا الاستدعاء. */
  scanned: number;
  /** كتل قُلبت (دون القوائم). */
  flipped: number;
  /** قوائم قُلبت كاملة. */
  lists: number;
  readonly verdicts: Record<BlockVerdict, number>;
}

const emptyStats = (): DirectionStats => ({
  scanned: 0,
  flipped: 0,
  lists: 0,
  verdicts: { flip: 0, 'native-rtl': 0, 'explicit-ltr': 0, 'no-letters': 0, latin: 0, 'mixed-latin-context': 0, 'mixed-latin-sentence': 0 },
});

export class DirectionProcessor {
  private readonly host: DirectionHost;
  private readonly options: DirectionOptions;
  private readonly containerSelector: string;
  private readonly standaloneSelector: string;

  constructor(host: DirectionHost, options: DirectionOptions = DEFAULT_DIRECTION_OPTIONS) {
    this.host = host;
    this.options = options;
    const { selectors } = host;
    this.containerSelector = selectors.entry(DIRECTION_SELECTOR_KEYS.container).candidates.join(', ');
    this.standaloneSelector = STANDALONE_KEYS.flatMap((key) => selectors.entry(key).candidates).join(', ');
  }

  /** يعالج كل الحاويات والكتل المستقلة تحت root (بالجدول، فتُسجَّل صحة المحددات). */
  scan(root: ParentNode = this.host.document): DirectionStats {
    const stats = emptyStats();
    const { selectors } = this.host;
    for (const container of selectors.resolveAll(root, DIRECTION_SELECTOR_KEYS.container)) this.processContainer(container, stats);
    for (const key of STANDALONE_KEYS) {
      for (const el of selectors.resolveAll(root, key)) this.processStandalone(el, stats);
    }
    return stats;
  }

  /** يعيد المعالجة حول ما غيّره GitHub: الحاويات والكتل المستقلة التي تحوي العقد المتغيرة أو أُضيفت فيها. */
  update(records: readonly MutationRecord[]): DirectionStats {
    const stats = emptyStats();
    const containers = new Set<Element>();
    const standalone = new Set<Element>();
    const visit = (el: Element | null): void => {
      if (!el || !el.isConnected) return;
      const container = this.nearestContainer(el);
      if (container) containers.add(container);
      else {
        const target = el.closest(this.standaloneSelector);
        if (target) standalone.add(target);
      }
      if (el.firstElementChild) {
        for (const inner of el.querySelectorAll(this.containerSelector)) containers.add(inner);
        for (const inner of el.querySelectorAll(this.standaloneSelector)) if (!this.nearestContainer(inner)) standalone.add(inner);
      }
    };
    for (const record of records) {
      if (record.type === 'characterData') visit(record.target.parentElement);
      else if (record.type === 'childList') {
        visit(record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement);
        for (const added of record.addedNodes) if (added.nodeType === 1) visit(added as Element);
      }
    }
    for (const container of containers) this.processContainer(container, stats);
    for (const el of standalone) this.processStandalone(el, stats);
    return stats;
  }

  private nearestContainer(el: Element): Element | null {
    return el.closest(this.containerSelector);
  }

  private processContainer(container: Element, stats: DirectionStats): void {
    if (container.closest(NEVER_INSIDE)) return;
    const blocks = [...container.querySelectorAll(CONTAINER_BLOCKS)].filter((block) => this.nearestContainer(block) === container && !block.closest(NEVER_INSIDE));
    if (!blocks.length) return;
    const containerRatio = measureContainer(container).ratio;
    const flippedOrRtl = new Set<Element>();
    const measured = new Map<Element, BlockMeasure>();
    for (const block of blocks) {
      if (block.hasAttribute(DIR_ATTR)) {
        flippedOrRtl.add(block);
        continue;
      }
      const measure = measureBlock(block);
      measured.set(block, measure);
      const verdict = decide(measure, { native: resolveNative(block), containerRatio }, this.options);
      stats.scanned += 1;
      stats.verdicts[verdict] += 1;
      if (verdict === 'flip') {
        this.flip(block);
        stats.flipped += 1;
        flippedOrRtl.add(block);
      }
    }
    for (const list of container.querySelectorAll(LISTS)) {
      if (list.hasAttribute(DIR_ATTR) || this.nearestContainer(list) !== container || list.closest(NEVER_INSIDE)) continue;
      const items = [...list.children].filter((child) => child.localName === 'li' && (measured.get(child) ?? measureBlock(child)).letters > 0);
      const native = resolveNative(list);
      if (items.length && items.every((item) => flippedOrRtl.has(item)) && native.direction === 'ltr' && native.source !== 'explicit') {
        this.flip(list);
        stats.lists += 1;
      }
    }
  }

  private processStandalone(el: Element, stats: DirectionStats): void {
    if (el.hasAttribute(DIR_ATTR) || el.closest(NEVER_INSIDE)) return;
    const container = this.nearestContainer(el);
    const measure = measureBlock(el);
    const verdict = decide(measure, { native: resolveNative(el), containerRatio: container ? measureContainer(container).ratio : null }, this.options);
    stats.scanned += 1;
    stats.verdicts[verdict] += 1;
    if (verdict === 'flip') {
      this.flip(el);
      stats.flipped += 1;
    }
  }

  private flip(el: Element): void {
    const { mutations } = this.host;
    mutations.setAttribute(el, ORIG_DIR_ATTR, el.getAttribute('dir') ?? '');
    mutations.setAttribute(el, DIR_ATTR, 'rtl');
  }
}

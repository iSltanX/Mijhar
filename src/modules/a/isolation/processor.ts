// معالج العزل (T-2.2، F-A2): داخل الكتل التي تُعرض rtl في حاويات Markdown (قلبتها ميزة الاتجاه، أو يعرضها GitHub rtl أصلًا)
//  - العناصر الموجودة (code وkbd وsamp وpre والإشارات والمراجع) تعزلها قاعدة CSS وحدها (ISOLATION_CSS) فلا تُمس.
//  - الروابط التي نصها لاتيني خالص تُعلَّم بسمة data-mijhar-isolate تعزلها القاعدة نفسها.
//  - المسارات والإصدارات والمراجع والإشارات المكتوبة نصًا عاديًا تُغلَّف: تُستبدل العقدة النصية بعنصر تجميع يحوي النص نفسه
//    مقسومًا وعناصر span معزولة، عبر سجل التعديلات (replace) فيعيد الإيقاف العقدة الأصلية نفسها.
// لا محرف توجيه خفي ولا سمة dir على ما يُحقن: dir تغيّر حساب dir="auto" للفقرة في المتصفح (يتخطى ما عليه dir)، والعزل من CSS.
// فيبقى textContent لكل عنصر أصلي كما هو، ويبقى المنسوخ مطابقًا للأصل (AC-A2). والتغليف داخل حاويات Markdown وحدها: نصها HTML
// يضعه GitHub كتلة واحدة، أما العناوين وصفوف الالتزامات في صفحات React فنصها تملكه React فلا تُقسم عقدها (يعزل CSS عناصرها فقط).
import type { MutationRecorder, SelectorsRegistry } from '../../../core';
import { resolveNative } from '../direction/bidi';
import type { Direction } from '../direction/bidi';
import { DIR_ATTR } from '../direction/processor';
import { CONTAINER_BLOCKS, DIRECTION_SELECTOR_KEYS } from '../direction/selectors';
import { findIsolateRuns, hasIsolateRun } from './patterns';

export const ISOLATE_CLASS = 'mijhar-bidi-isolate';
export const GROUP_CLASS = 'mijhar-bidi-group';
export const INJECTED_ATTR = 'data-mijhar-injected';
export const LINK_ATTR = 'data-mijhar-isolate';

/** العناصر الموجودة أصلًا التي تُعزل بالقاعدة وحدها. */
export const ISOLATED_ELEMENTS = 'code, kbd, samp, a.user-mention, a.team-mention, a.issue-link, a.commit-link, span.reference';

// قاعدتان منفصلتان: :dir() إن لم يدعمها متصفح أسقطت قاعدتها وحدها. الأولى للكتل التي قلبتها الإضافة (اتجاهها من CSS لا من dir، فلا
// تطابقها :dir(rtl))، والثانية لما يعرضه GitHub rtl بسمة dir="auto".
const TARGETS = `:is(${ISOLATED_ELEMENTS}, [${LINK_ATTR}])`;
export const ISOLATION_CSS = [
  `[${DIR_ATTR}="rtl"] ${TARGETS}{direction:ltr;unicode-bidi:isolate}`,
  `.markdown-body ${TARGETS}:dir(rtl){direction:ltr;unicode-bidi:isolate}`,
  `[${DIR_ATTR}="rtl"] pre{direction:ltr;unicode-bidi:isolate;text-align:left}`,
  `.${ISOLATE_CLASS}{direction:ltr;unicode-bidi:isolate}`,
].join('\n');

/** ما لا يُغلَّف نصه ولا تُعلَّم روابطه: الكود والمحررات وما حقنته الإضافة والتاريخ النسبي. */
const SKIP = `code, pre, kbd, samp, a, textarea, input, script, style, svg, math, relative-time, time, [${INJECTED_ATTR}], mijhar-host, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]`;

const LATIN = /(?=\p{L})\p{Script=Latin}/u;
const ARABIC = /(?=\p{L})\p{Script=Arabic}/u;

export interface IsolationHost {
  readonly document: Document;
  readonly selectors: SelectorsRegistry;
  readonly mutations: Pick<MutationRecorder, 'replace' | 'setAttribute'>;
}

export interface IsolationStats {
  /** كتل rtl فُحصت. */
  blocks: number;
  /** عقد نصية غُلّفت. */
  wrappedNodes: number;
  /** مواضع عُزلت داخلها. */
  runs: number;
  /** روابط لاتينية عُلّمت. */
  links: number;
}

const emptyStats = (): IsolationStats => ({ blocks: 0, wrappedNodes: 0, runs: 0, links: 0 });

export class IsolationProcessor {
  private readonly containerSelector: string;

  constructor(private readonly host: IsolationHost) {
    this.containerSelector = host.selectors.entry(DIRECTION_SELECTOR_KEYS.container).candidates.join(', ');
  }

  scan(root: ParentNode = this.host.document): IsolationStats {
    const stats = emptyStats();
    for (const container of this.host.selectors.resolveAll(root, DIRECTION_SELECTOR_KEYS.container)) this.processContainer(container, stats);
    return stats;
  }

  /** يعيد المعالجة في الحاويات التي مسّتها السجلات: محتوى جديد، أو نص متغير، أو كتلة قلبتها ميزة الاتجاه بعد التركيب. */
  update(records: readonly MutationRecord[]): IsolationStats {
    const stats = emptyStats();
    const containers = new Set<Element>();
    const visit = (el: Element | null): void => {
      if (!el?.isConnected) return;
      const container = el.closest(this.containerSelector);
      if (container) containers.add(container);
      else if (el.firstElementChild) for (const inner of el.querySelectorAll(this.containerSelector)) containers.add(inner);
    };
    for (const record of records) {
      if (record.type === 'childList') {
        // تغليف المعالج نفسه: عقدة نصية خرجت وعنصر تجميع دخل. لا جديد فيه.
        if (record.addedNodes.length === 1 && (record.addedNodes[0] as Element).classList?.contains(GROUP_CLASS)) continue;
        visit(record.target.nodeType === 1 ? (record.target as Element) : record.target.parentElement);
        for (const added of record.addedNodes) if (added.nodeType === 1) visit(added as Element);
      } else if (record.type === 'characterData') visit(record.target.parentElement);
      else if (record.type === 'attributes') visit(record.target as Element);
    }
    for (const container of containers) this.processContainer(container, stats);
    return stats;
  }

  private processContainer(container: Element, stats: IsolationStats): void {
    if (container.closest(SKIP)) return;
    const auto = new Map<Element, Direction>();
    for (const block of container.querySelectorAll(CONTAINER_BLOCKS)) {
      if (block.closest(this.containerSelector) !== container || block.closest(SKIP)) continue;
      if (!this.isRtl(block, auto)) continue;
      stats.blocks += 1;
      this.processBlock(block, stats);
    }
  }

  private isRtl(block: Element, auto: Map<Element, Direction>): boolean {
    return block.closest(`[${DIR_ATTR}="rtl"]`) !== null || resolveNative(block, auto).direction === 'rtl';
  }

  // عقد الكتلة نفسها: ما يقع في كتلة متداخلة (p داخل li مثلًا) تعالجه كتلته.
  private ownedBy(node: Node, block: Element): boolean {
    const parent = node.parentElement;
    return parent !== null && parent.closest(CONTAINER_BLOCKS) === block;
  }

  private processBlock(block: Element, stats: IsolationStats): void {
    const doc = this.host.document;
    for (const link of block.querySelectorAll('a')) {
      if (link.hasAttribute(LINK_ATTR) || link.matches(ISOLATED_ELEMENTS) || !this.ownedBy(link, block)) continue;
      if (link.parentElement?.closest(SKIP)) continue;
      const text = link.textContent ?? '';
      if (LATIN.test(text) && !ARABIC.test(text)) {
        this.host.mutations.setAttribute(link, LINK_ATTR, 'ltr');
        stats.links += 1;
      }
    }
    const NodeFilterRef = doc.defaultView?.NodeFilter ?? NodeFilter;
    const walker = doc.createTreeWalker(block, NodeFilterRef.SHOW_TEXT);
    const targets: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      if (!hasIsolateRun(text.data) || !this.ownedBy(text, block) || text.parentElement?.closest(SKIP)) continue;
      targets.push(text);
    }
    for (const text of targets) {
      const runs = findIsolateRuns(text.data);
      if (!runs.length) continue;
      this.host.mutations.replace(text, this.group(text.data, runs));
      stats.wrappedNodes += 1;
      stats.runs += runs.length;
    }
  }

  private group(data: string, runs: ReturnType<typeof findIsolateRuns>): HTMLElement {
    const doc = this.host.document;
    const group = doc.createElement('span');
    group.className = GROUP_CLASS;
    group.setAttribute(INJECTED_ATTR, 'true');
    let last = 0;
    for (const run of runs) {
      if (run.start > last) group.append(data.slice(last, run.start));
      const span = doc.createElement('span');
      span.className = ISOLATE_CLASS;
      span.setAttribute(INJECTED_ATTR, 'true');
      span.textContent = data.slice(run.start, run.end);
      group.append(span);
      last = run.end;
    }
    if (last < data.length) group.append(data.slice(last));
    return group;
  }
}

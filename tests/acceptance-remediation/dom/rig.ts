// مختبر «استبدال الحاوية بعد التركيب» (React hydration على github.com): أدوات لاختبارات سلوكية لا تعرف تفاصيل الإصلاح.
//
// ما يحاكيه: تُركَّب الوحدات على صفحة، ثم يستبدل GitHub الشجرة المحيطة بالترويسة بشجرة مكافئة جديدة (SSR ← hydration) بينما حاوية
// المحتوى (content-root) نفسها تبقى. فيصير مضيف الوحدة (mijhar-host) غير مرتبط بالمستند (isConnected=false) مع بقاء parentNode غير فارغ
// (ما زال داخل الشجرة المفصولة القديمة). هذا ما قيس على github.com الحي (MJ-F-01).
//
// لا يُستورد هنا أي اسم واجهة داخلية جديدة: التحقق كله على DOM الظاهر (مضيفون متصلون، موضعهم، أخطاء، تقرير الاستعادة).
// يفترض المؤقتات الوهمية (vi.useFakeTimers) فتُلتقط استثناءات المؤقتات بدل أن تتحول إلى خطأ غير معالج يُسقط التشغيل كله.
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { DEFAULT_SELECTORS, LifecycleManager, ModuleRegistry, PageDetector, SelectorsRegistry } from '../../../src/core';
import type { ExtensionModule, RestoreReport } from '../../../src/core';
import { HOST_ATTR, HOST_TAG } from '../../../src/core/ui-host/shadow';

/** يسجّل المؤقتات الوهمية لكل اختبار في الملف. يُستدعى مرة على مستوى الملف. */
export function useRigTimers(): void {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  // يُسجَّل بعد استعادة المؤقتات الحقيقية فيعمل قبلها (ترتيب المكدس)، ويضمن فكّ كل مختبر حتى لو فشل اختباره قبل dispose().
  afterEach(() => {
    for (const rig of live.splice(0)) rig.dispose();
  });
}

const live: Rig[] = [];

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : typeof error === 'string' ? error : error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error));

export interface RigOptions {
  /** يحمّل الصفحة في المستند العام (قبل أي تركيب). */
  readonly load: () => void;
  /** المسار (مع البحث) الذي يُضبط بـhistory.replaceState، فيحدد الكاشف نوع الصفحة. */
  readonly path: string;
  /** وحدات طازجة لهذا الاختبار. */
  readonly modules: readonly ExtensionModule[];
}

export interface Rig {
  readonly manager: LifecycleManager;
  /** كل ما بلغ معالجات الأخطاء: أحداث error في النافذة، واستثناءات المؤقتات، وأخطاء مدير دورة الحياة. */
  readonly errors: string[];
  /** تقارير الاستعادة لكل وحدة أُوقفت. */
  readonly reports: RestoreReport[];
  /** حاوية المحتوى كما يحددها الكاشف؛ لا تتغير بالاستبدال. */
  readonly contentRoot: Element;
  /** الغلاف الحالي (الشجرة التي يستبدلها «hydration»). */
  wrapper(): Element;
  /** يستبدل الغلاف بنسخة جديدة مكافئة من الحالة الأصلية قبل التركيب؛ transform يعدّل النسخة قبل إدراجها. */
  hydrate(transform?: (fresh: Element) => void): Element;
  /** يمضي بالزمن الوهمي ويلتقط أي استثناء مؤقت. */
  settle(ms?: number): Promise<void>;
  /** المضيفون المتصلون بالمستند باسم الوحدة (أو كلهم). */
  hosts(name?: string): HTMLElement[];
  /** كل مضيف أُدرج يومًا في المستند ثم فُصل وما زال له أب (عالق في شجرة مفصولة). */
  stranded(name?: string): HTMLElement[];
  /** كل مضيف أُدرج يومًا في المستند. */
  everSeen(name?: string): HTMLElement[];
  /** يعطّل/يفعّل الوحدة عبر isEnabled ثم manager.refresh(). */
  setEnabled(moduleId: string, enabled: boolean): void;
  /** كل مضيف ما زال متصلًا بعد التنظيف. */
  dispose(): void;
}

/** حاوية المحتوى بمحدد الكاشف نفسه (لا نسخة منه). */
export function contentRootOf(): Element {
  const found = new SelectorsRegistry(DEFAULT_SELECTORS).resolve(document, 'content-root')?.element;
  if (!found) throw new Error('rig: لا حاوية محتوى في العينة');
  return found;
}

export async function mountRig(options: RigOptions): Promise<Rig> {
  if (!vi.isFakeTimers()) throw new Error('rig: استدعِ useRigTimers() في الملف');
  options.load();
  window.history.replaceState(null, '', options.path);
  const contentRoot = contentRootOf();

  // الغلاف: كل أبناء الحاوية داخل عنصر واحد، وهو ما سيستبدله hydration. تُحفظ نسخته الأصلية قبل التركيب (بلا مضيفينا).
  const first = document.createElement('div');
  first.id = 'ssr';
  first.append(...contentRoot.childNodes);
  contentRoot.append(first);
  const pristine = first.cloneNode(true) as Element;
  let current: Element = first;

  const errors: string[] = [];
  const reports: RestoreReport[] = [];
  const onWindowError = (event: ErrorEvent): void => {
    errors.push(messageOf(event.error ?? event.message));
    event.preventDefault();
  };
  window.addEventListener('error', onWindowError);

  const seen = new Set<HTMLElement>();
  const harvest = (node: Node): void => {
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.localName === HOST_TAG) seen.add(el as HTMLElement);
    for (const inner of el.querySelectorAll?.(HOST_TAG) ?? []) seen.add(inner as HTMLElement);
  };
  harvest(document.documentElement);
  const spy = new MutationObserver((records) => {
    for (const record of records) for (const added of record.addedNodes) harvest(added);
  });
  spy.observe(document, { childList: true, subtree: true });

  const enabled = new Set(options.modules.map((module) => module.id));
  const manager = new LifecycleManager({
    registry: new ModuleRegistry(options.modules),
    detector: new PageDetector({ document, settleMs: 5 }),
    isEnabled: (id) => enabled.has(id),
    document,
    onError: (event) => errors.push(`lifecycle ${event.moduleId}/${event.phase}: ${messageOf(event.error)}`),
    onRestore: (report) => reports.push(report),
  });

  const selectorFor = (name?: string): string => (name ? `${HOST_TAG}[${HOST_ATTR}="${name}"]` : `${HOST_TAG}[${HOST_ATTR}]`);
  const nameOf = (el: Element): string | null => el.getAttribute(HOST_ATTR);

  const rig: Rig = {
    manager,
    errors,
    reports,
    contentRoot,
    wrapper: () => current,
    hydrate(transform) {
      const next = pristine.cloneNode(true) as Element;
      transform?.(next);
      current.replaceWith(next);
      current = next;
      return next;
    },
    async settle(ms = 50) {
      try {
        await vi.advanceTimersByTimeAsync(ms);
      } catch (error) {
        errors.push(messageOf(error));
      }
    },
    hosts: (name) => [...document.querySelectorAll<HTMLElement>(selectorFor(name))],
    stranded: (name) => [...seen].filter((el) => !el.isConnected && el.parentNode !== null && (!name || nameOf(el) === name)),
    everSeen: (name) => [...seen].filter((el) => !name || nameOf(el) === name),
    setEnabled(moduleId, on) {
      if (on) enabled.add(moduleId);
      else enabled.delete(moduleId);
      manager.refresh();
    },
    dispose() {
      manager.stop();
      spy.disconnect();
      window.removeEventListener('error', onWindowError);
    },
  };

  live.push(rig);
  manager.start();
  await rig.settle(30);
  return rig;
}

/** ما يُتوقع من مضيفي وحدة بعد أي استبدال. */
export interface HostSpec {
  /** اسم المضيف (data-mijhar-host). */
  readonly name: string;
  /** عدد المضيفين المتصلين المتوقع لهذا الاسم (الافتراضي 1؛ d.compare مضيفان). */
  readonly count?: number;
  /** محدد العنصر الذي يجاور المضيف (يُحل على المستند الحالي كل مرة). */
  readonly anchorSelector: string;
  /** after: المضيف يلي المرساة مباشرة؛ before: يسبقها مباشرة. */
  readonly side: 'after' | 'before';
}

/**
 * يجمع كل المشكلات في قائمة واحدة نصية (فيظهر الفشل كله مرة واحدة بدل أول تأكيد فاشل):
 * أخطاء، وعدد المتصلين، ومضيف عالق، وموضعه من المرساة الجديدة.
 */
export function problems(rig: Rig, spec: HostSpec, options: { adjacency?: boolean } = {}): string[] {
  const out: string[] = [];
  for (const error of rig.errors) out.push(`خطأ: ${error}`);
  const expected = spec.count ?? 1;
  const hosts = rig.hosts(spec.name);
  if (hosts.length !== expected) out.push(`${spec.name}: متصل ${hosts.length} من ${expected} (عالق في شجرة مفصولة: ${rig.stranded(spec.name).length})`);
  if (options.adjacency !== false && hosts.length === expected) {
    const anchor = document.querySelector(spec.anchorSelector);
    if (!anchor) out.push(`${spec.name}: لا مرساة في الصفحة الجديدة`);
    else if (spec.side === 'after') {
      let cursor: Element = anchor;
      for (const host of hosts) {
        if (cursor.nextElementSibling !== host) out.push(`${spec.name}: ليس تاليًا للمرساة الجديدة (${tagOf(anchor)})`);
        cursor = host;
      }
    } else {
      let cursor: Element = anchor;
      for (const host of [...hosts].reverse()) {
        if (cursor.previousElementSibling !== host) out.push(`${spec.name}: ليس سابقًا للمرساة الجديدة (${tagOf(anchor)})`);
        cursor = host;
      }
    }
  }
  return out;
}

export const tagOf = (el: Element): string => `<${el.localName}${el.id ? `#${el.id}` : ''}${el.getAttribute('data-component') ? `[${el.getAttribute('data-component')}]` : ''}>`;

/** تأكيد واحد بنص المشكلات كلها. */
export function expectHealthy(rig: Rig, spec: HostSpec, options: { adjacency?: boolean } = {}): void {
  expect(problems(rig, spec, options)).toEqual([]);
}

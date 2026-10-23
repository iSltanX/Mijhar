// TEST-NAV-01 (AC-1.2 بنود 2 و3): محاكي تنقل Turbo على العينات؛ ثلاثون تنقلًا متتاليًا على الأقل (هنا 40):
// تُزال الوحدات غير الملائمة وتُركَّب الملائمة، ولا حقن مكرر ولا مستمعات ولا مراقبات متراكمة، ويُسجَّل ميل نمو
// الذاكرة دون مقارنة (تُقارَن في T-10.1 وحده). قياس PB-07 هنا تمهيدي على وحدات وهمية ولا يُعدّ قبولًا.
import { describe, expect, it, vi } from 'vitest';
import type { JSDOM } from 'jsdom';
import { LifecycleManager, ModuleRegistry, PageDetector } from '../../../src/core';
import type { ExtensionModule, PageType } from '../../../src/core';
import { ListenerLedger, fixtureHtml, loadPage, trackObservers, turboNavigate } from '../helpers/dom';
import { markerModule } from '../helpers/modules';
import { createHarness } from '../helpers/runtime';
import { recordMeasurement, round, slope, summarize } from '../helpers/stats';

const NAVIGATIONS = 40;
const WARMUP = 3;

const CYCLE: ReadonlyArray<{ fixture: string; url: string; type: PageType; expected: string[] }> = [
  { fixture: 'repo', url: 'https://github.com/octo/demo', type: 'repo', expected: ['a', 'c'] },
  { fixture: 'pr', url: 'https://github.com/octo/demo/pull/42', type: 'pr', expected: ['a', 'b'] },
  { fixture: 'issue', url: 'https://github.com/octo/demo/issues/7', type: 'issue', expected: ['a', 'b'] },
  { fixture: 'blob', url: 'https://github.com/octo/demo/blob/main/README.md', type: 'blob', expected: ['a'] },
];

function setup(): { dom: JSDOM; h: ReturnType<typeof createHarness>; ledger: ListenerLedger; observers: ReturnType<typeof trackObservers>; stats: Record<string, { mounts: number; unmounts: number }> } {
  const dom = loadPage('repo', CYCLE[0]?.url as string);
  const ledger = new ListenerLedger(dom.window);
  const observers = trackObservers(dom);
  const a = markerModule({ id: 'a', pages: ['repo', 'pr', 'issue', 'blob'] });
  const b = markerModule({ id: 'b', pages: ['pr', 'issue'] });
  const c = markerModule({ id: 'c', pages: ['repo'] });
  const d = markerModule({ id: 'd', pages: '*' });
  const modules: ExtensionModule[] = [a.module, b.module, c.module, d.module];
  const h = createHarness(dom, modules, ['a', 'b', 'c']);
  return { dom, h, ledger, observers, stats: { a: a.stats, b: b.stats, c: c.stats, d: d.stats } };
}

const injected = (dom: JSDOM): string[] =>
  [...dom.window.document.querySelectorAll('[data-mijhar-injected]')].map((el) => el.getAttribute('data-mijhar-injected') as string).sort();

describe('ثلاثون تنقلًا متتاليًا على الأقل', () => {
  it('كل تنقل: الوحدات الملائمة والمفعَّلة فقط مركَّبة، وكل واحدة بحقن واحد', () => {
    const { dom, h } = setup();
    h.manager.start();
    expect(h.manager.mountedIds()).toEqual(['a', 'c']);

    for (let i = 1; i <= NAVIGATIONS; i += 1) {
      const step = CYCLE[i % CYCLE.length] as (typeof CYCLE)[number];
      turboNavigate(dom, step.fixture, step.url);
      expect(h.manager.mountedIds().sort(), `التنقل ${i} إلى ${step.type}`).toEqual(step.expected);
      expect(injected(dom), `حقن مكرر عند ${i}`).toEqual(step.expected);
      const doc = dom.window.document;
      expect(doc.querySelectorAll('#mijhar-a-styles'), `ورقة أنماط مكررة عند ${i}`).toHaveLength(1);
      expect(doc.querySelectorAll('#mijhar-d-styles')).toHaveLength(0);
      expect(doc.querySelectorAll('#mijhar-b-styles').length).toBe(step.expected.includes('b') ? 1 : 0);
      expect(doc.querySelectorAll('#mijhar-c-styles').length).toBe(step.expected.includes('c') ? 1 : 0);
    }
  });

  it('حدث التنقل الواحد (render ثم load) يوفّق مرة واحدة فقط', () => {
    const { dom, h } = setup();
    h.manager.start();
    const initial = h.reconciles.length;
    for (let i = 1; i <= NAVIGATIONS; i += 1) {
      const step = CYCLE[i % CYCLE.length] as (typeof CYCLE)[number];
      turboNavigate(dom, step.fixture, step.url);
    }
    expect(h.reconciles.length - initial).toBe(NAVIGATIONS);
    expect(h.reconciles.every((r) => r.reason === 'navigation')).toBe(true);
    expect(h.errors).toEqual([]);
  });

  it('لا مستمعات ولا مراقبات متراكمة: العدد في كل نوع صفحة يثبت عبر الدورات', () => {
    const { dom, h, ledger, observers } = setup();
    h.manager.start();
    const listenerBaseline = new Map<PageType, number>();
    const observerBaseline = new Map<PageType, number>();
    for (let i = 1; i <= NAVIGATIONS; i += 1) {
      const step = CYCLE[i % CYCLE.length] as (typeof CYCLE)[number];
      turboNavigate(dom, step.fixture, step.url);
      // الدورة الأولى تسخّن مستمعات jsdom الداخلية، فتُؤخذ خطوط الأساس منها ثم يُقارَن ما بعدها.
      if (i <= CYCLE.length) {
        listenerBaseline.set(step.type, ledger.net());
        observerBaseline.set(step.type, observers.live());
      } else {
        expect(ledger.net(), `مستمعات متراكمة عند ${i} (${step.type})`).toBe(listenerBaseline.get(step.type));
        expect(observers.live(), `مراقبات متراكمة عند ${i} (${step.type})`).toBe(observerBaseline.get(step.type));
      }
    }
  });

  it('الوحدة المركَّبة في صفحتين متتاليتين تُعاد تركيبها (لا تُحمَل سياقاتها القديمة)', () => {
    const { dom, h, stats } = setup();
    h.manager.start();
    turboNavigate(dom, 'pr', CYCLE[1]?.url as string);
    turboNavigate(dom, 'issue', CYCLE[2]?.url as string);
    // a: بداية + pr + issue = ثلاث تركيبات وتوقفان؛ c: بداية فقط ثم أوقفت عند pr.
    expect(stats.a).toEqual({ mounts: 3, unmounts: 2 });
    expect(stats.c).toEqual({ mounts: 1, unmounts: 1 });
    expect(stats.b).toEqual({ mounts: 2, unmounts: 1 });
    expect(stats.d).toEqual({ mounts: 0, unmounts: 0 });
  });

  it('popstate بلا تغيّر فعلي لا يعيد التركيب، وتنقل بلا أحداث Turbo يلتقطه الكاشف بعد الهدوء', async () => {
    vi.useFakeTimers();
    try {
      const { dom, h } = setup();
      h.manager.start();
      const before = h.reconciles.length;
      dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
      vi.advanceTimersByTime(20);
      expect(h.reconciles.length).toBe(before);

      // تنقل SPA يدفع مسارًا جديدًا ويستبدل body دون أن يطلق Turbo حدثًا؛ يلتقطه مراقب الجذر بعد الهدوء.
      const doc = dom.window.document;
      const next = new dom.window.DOMParser().parseFromString(fixtureHtml('issue'), 'text/html');
      dom.window.history.pushState({}, '', CYCLE[2]?.url as string);
      doc.documentElement.replaceChild(doc.adoptNode(next.body), doc.body);
      await Promise.resolve();
      vi.advanceTimersByTime(20);
      expect(h.reconciles.length).toBe(before + 1);
      expect(h.manager.mountedIds().sort()).toEqual(['a', 'b']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stop بعد التنقلات يعيد الصفحة الحالية نظيفة من أي حقن', () => {
    const { dom, h } = setup();
    h.manager.start();
    for (let i = 1; i <= NAVIGATIONS; i += 1) {
      const step = CYCLE[i % CYCLE.length] as (typeof CYCLE)[number];
      turboNavigate(dom, step.fixture, step.url);
    }
    h.manager.stop();
    expect(injected(dom)).toEqual([]);
    expect(dom.window.document.querySelectorAll('style[id^="mijhar-"]')).toHaveLength(0);
    expect([...dom.window.document.body.attributes].filter((a) => a.name.startsWith('data-mijhar-'))).toEqual([]);
  });
});

describe('قياس تمهيدي: PB-07 وميل نمو الذاكرة (يُسجَّل ولا يُقارَن؛ المقارنة في T-10.1)', () => {
  // لا يحتفظ القياس بنتائج التوفيق ولا بتقارير الاستعادة (تمسك عقد jsdom) كي لا يُقاس احتباس الاختبار نفسه.
  // يُقاس ميل المكدس مع الوحدات ومعه شاهد بلا وحدات (يبقى فيه جزء jsdom: تحليل عينة جديدة في كل تنقل).
  function measure(withModules: boolean): { durations: number[]; heap: number[] } {
    const dom = loadPage('repo', CYCLE[0]?.url as string);
    const durations: number[] = [];
    const modules = withModules ? [markerModule({ id: 'a', pages: '*' }).module, markerModule({ id: 'b', pages: ['pr', 'issue'] }).module, markerModule({ id: 'c', pages: ['repo'] }).module] : [];
    const detector = new PageDetector({ document: dom.window.document });
    const manager = new LifecycleManager({
      registry: new ModuleRegistry(modules),
      detector,
      document: dom.window.document,
      isEnabled: () => true,
      onReconcile: (result) => void durations.push(result.durationMs),
    });
    manager.start();
    const heap: number[] = [];
    for (let i = 1; i <= WARMUP + 30; i += 1) {
      const step = CYCLE[i % CYCLE.length] as (typeof CYCLE)[number];
      turboNavigate(dom, step.fixture, step.url);
      if (i > WARMUP) {
        globalThis.gc?.();
        heap.push(process.memoryUsage().heapUsed);
      }
    }
    manager.stop();
    return { durations: durations.slice(1 + WARMUP), heap };
  }

  it('ثلاثون تنقلًا بعد ثلاثة تسخين، بوحدات وهمية ومعها شاهد بلا وحدات', () => {
    const forced = typeof globalThis.gc === 'function';
    const control = measure(false);
    const real = measure(true);
    const summary = summarize(real.durations);
    expect(summary.n).toBe(30);
    expect(Number.isFinite(summary.median)).toBe(true);
    expect(Number.isFinite(slope(real.heap))).toBe(true);
    recordMeasurement('T-1.2', 'PB-07-and-heap-slope', {
      note: 'jsdom على Node، وحدات وهمية؛ تمهيدي لا قبول. ميل الذاكرة يُسجَّل دون مقارنة بخط أساس (T-0.1) وفق TEST-NAV-01. الشاهد بلا وحدات يفصل نمو jsdom نفسه (تحليل عينة جديدة في كل تنقل) عن أثر الطبقة والوحدات',
      warmup: WARMUP,
      navigations: 30,
      pb07Ms: { ...summary, median: round(summary.median), p95: round(summary.p95), min: round(summary.min), max: round(summary.max) },
      heap: {
        gcForced: forced,
        withModules: { slopeBytesPerNavigation: round(slope(real.heap), 1), firstBytes: real.heap[0], lastBytes: real.heap.at(-1) },
        controlNoModules: { slopeBytesPerNavigation: round(slope(control.heap), 1), firstBytes: control.heap[0], lastBytes: control.heap.at(-1) },
      },
    });
  });
});

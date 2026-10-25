// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/4242"}
// MJ-F-01 / F-01 (تدقيقا القبول لـ b63f9c4): على github.com الحي يستبدل React (hydration) الشجرة المحيطة بترويسة طلب الدمج أو المشكلة بعد أن
// ركّبت الوحدات مضيفاتها، فيصير المضيف غير مرتبط بالمستند (isConnected=false) وparentNode غير فارغ (داخل الشجرة المفصولة)، وحاوية المحتوى نفسها
// لا تتغير فلا يُعلن الكاشف تنقلًا. اختبارات سلوكية لا تفترض طريقة الإصلاح: تتحقق مما يراه المستخدم والمستند فقط.
//   [فشل على b63f9c4] اختبارات الاستبدال (مرة، مرتين، مرتين في دورة واحدة، مؤقت الـ15 ث، غياب المرساة ثم ظهورها، الحمل الكامل لصفحة PR).
//   [حارس: يمر على b63f9c4 ويجب أن يبقى] الإدراج الأول، التنظيف بعد الاستبدال، شريط الترجمة حين تُستبدل الأجسام معها.
//   [استمرارية الحالة: يتوقع حفظ حالة الواجهة عبر الاستبدال؛ إن اختار الإصلاح إعادة تركيب كاملة فعدّل أو احذف هذه المجموعة وحدها].
import { describe, expect, it } from 'vitest';
import { MutationRecorder } from '../../../src/core';
import { HEADER_ANCHORS, SURFACES, markdownPage, prPageWithAllModules, translateModule } from './surfaces';
import type { Surface } from './surfaces';
import { expectHealthy, mountRig, problems, useRigTimers } from './rig';
import type { HostSpec, Rig } from './rig';

useRigTimers();

const SETTLE = 500;
const surfaces = Object.values(SURFACES);

async function mount(surface: Surface): Promise<Rig> {
  return mountRig({ load: surface.load, path: surface.path, modules: surface.modules() });
}

/** ينزع كل مرساة ترويسة من الشجرة الجديدة ويعيد ما يلزم لإرجاعها في تعديل لاحق. */
function detachAnchors(fresh: Element, selectors: readonly string[]): Array<{ el: Element; parent: Node; next: Node | null }> {
  const hits = selectors.flatMap((selector) => [...fresh.querySelectorAll(selector)]);
  const outer = hits.filter((el) => !hits.some((other) => other !== el && other.contains(el)));
  const removed = outer.map((el) => ({ el, parent: el.parentNode as Node, next: el.nextSibling }));
  for (const { el } of removed) el.remove();
  return removed;
}

describe.each(surfaces)('$id', (surface) => {
  const spec = surface.spec;

  it('[حارس] الإدراج الأول: مضيف متصل واحد (أو العدد المتوقع) مجاور للمرساة بلا أخطاء', async () => {
    const rig = await mount(surface);
    expectHealthy(rig, spec);
    rig.dispose();
  });

  it('استبدال الشجرة المحيطة بالمرساة مرة: يبقى مضيف متصل واحد بجوار المرساة الجديدة، بلا استثناء', async () => {
    const rig = await mount(surface);
    rig.hydrate();
    await rig.settle(SETTLE);
    expectHealthy(rig, spec);
    rig.dispose();
  });

  it('استبدالان متتاليان (يعيد React الرسم أكثر من مرة): لا تكرار ولا استثناء ولا مضيف متروك', async () => {
    const rig = await mount(surface);
    rig.hydrate();
    await rig.settle(SETTLE);
    rig.hydrate();
    await rig.settle(SETTLE);
    expectHealthy(rig, spec);
    rig.dispose();
  });

  it('استبدالان في الدورة نفسها قبل أن تعمل المراقبات: تجمّع واحد ونتيجة سليمة', async () => {
    const rig = await mount(surface);
    rig.hydrate();
    rig.hydrate();
    await rig.settle(SETTLE);
    expectHealthy(rig, spec);
    rig.dispose();
  });

  it('بعد الاستبدال تمر المؤقتات الدورية (20 ثانية) دون استثناء أو تكرار', async () => {
    const rig = await mount(surface);
    rig.hydrate();
    await rig.settle(SETTLE);
    await rig.settle(20_000);
    expectHealthy(rig, spec);
    rig.dispose();
  });

  it('المرساة غائبة بعد الاستبدال ثم تظهر في تعديل لاحق: لا إدراج في عقدة مفصولة، ويستقر مضيف واحد بجوارها حين تظهر', async () => {
    const rig = await mount(surface);
    const anchors = surface.id === 'a.reading (issue)' || surface.id === 'd.compare' ? [spec.anchorSelector] : HEADER_ANCHORS;
    let removed: ReturnType<typeof detachAnchors> = [];
    rig.hydrate((fresh) => {
      removed = detachAnchors(fresh, anchors);
    });
    await rig.settle(SETTLE);
    // أثناء الغياب: لا خطأ، ولا أكثر من مضيف متصل (المكان البديل مقبول، والعالق في الشجرة القديمة وحده لا يُحسب)
    expect(rig.errors).toEqual([]);
    expect(rig.hosts(spec.name).length).toBeLessThanOrEqual(spec.count ?? 1);
    for (const { el, parent, next } of [...removed].reverse()) parent.insertBefore(el, next);
    await rig.settle(SETTLE);
    expectHealthy(rig, spec);
    rig.dispose();
  });

  it('[حارس] التنظيف بعد الاستبدال: تعطيل الوحدة يزيل كل مضيف، ولا تعيده تعديلات لاحقة، وتقرير الاستعادة بلا skipped', async () => {
    const rig = await mount(surface);
    rig.hydrate();
    await rig.settle(SETTLE);
    const before = rig.errors.length;
    for (const id of surface.moduleIds) rig.setEnabled(id, false);
    await rig.settle(SETTLE);
    expect(rig.hosts(spec.name)).toEqual([]);
    expect(rig.everSeen(spec.name).filter((host) => host.isConnected)).toEqual([]);
    expect(rig.reports.filter((report) => surface.moduleIds.includes(report.moduleId)).flatMap((report) => report.skipped)).toEqual([]);
    expect(rig.reports.filter((report) => surface.moduleIds.includes(report.moduleId)).map((report) => report.rejectedAfterClose)).toEqual(surface.moduleIds.map(() => 0));
    // مراقبات مفصولة: استبدال آخر بعد الإيقاف لا يعيد شيئًا ولا يُصدر خطأ
    rig.hydrate();
    await rig.settle(SETTLE);
    await rig.settle(20_000);
    expect(rig.hosts(spec.name)).toEqual([]);
    expect(rig.errors.slice(before)).toEqual([]);
    rig.dispose();
  });
});

describe('الحمل الكامل لصفحة PR (الوحدات الأربع معًا كما تركّبها الإضافة)', () => {
  const page = prPageWithAllModules();
  const header = '[data-component="PageHeader"]';

  async function mountAll(): Promise<Rig> {
    return mountRig({ load: page.load, path: page.path, modules: page.modules() });
  }

  function allHealthy(rig: Rig): string[] {
    const out = rig.errors.map((e) => `خطأ: ${e}`);
    for (const name of page.names) {
      const connected = rig.hosts(name);
      if (connected.length !== 1) out.push(`${name}: متصل ${connected.length} من 1`);
      else if (!rig.wrapper().contains(connected[0] as Node)) out.push(`${name}: خارج الشجرة الجديدة`);
    }
    // المضيفون الثلاثة التابعون للترويسة في سلسلة متجاورة تبدأ بالمرساة الجديدة
    const anchor = document.querySelector(header);
    const run: string[] = [];
    for (let el = anchor?.nextElementSibling ?? null; el && el.localName === 'mijhar-host'; el = el.nextElementSibling) run.push(el.getAttribute('data-mijhar-host') ?? '');
    for (const name of ['d.pr-status', 'e.builder', 'e.copy-prompt']) if (!run.includes(name)) out.push(`${name}: ليس ضمن مضيفي ترويسة الصفحة الجديدة (${run.join(',') || 'لا شيء'})`);
    return out;
  }

  it('[حارس] قبل الاستبدال كل المضيفين الأربعة موجودون مرة واحدة', async () => {
    const rig = await mountAll();
    expect(allHealthy(rig)).toEqual([]);
    rig.dispose();
  });

  it('بعد استبدال واحد ثم ثانٍ: المضيفون الأربعة متصلون مرة واحدة في الشجرة الجديدة بلا استثناء', async () => {
    const rig = await mountAll();
    rig.hydrate();
    await rig.settle(SETTLE);
    expect(allHealthy(rig)).toEqual([]);
    rig.hydrate();
    await rig.settle(SETTLE);
    expect(allHealthy(rig)).toEqual([]);
    rig.dispose();
  });

  it('[حارس] إيقاف الوحدات الأربع بعد الاستبدال يزيل كل مضيف ولا يترك skipped في أي تقرير', async () => {
    const rig = await mountAll();
    rig.hydrate();
    await rig.settle(SETTLE);
    rig.manager.stop();
    expect(rig.hosts()).toEqual([]);
    expect(rig.reports.flatMap((report) => report.skipped)).toEqual([]);
    rig.dispose();
  });
});

describe('استمرارية حالة الواجهة عبر الاستبدال (تتوقع الاحتفاظ بالحالة؛ تُعدَّل إن اعتُمدت إعادة تركيب كاملة)', () => {
  it('e.builder: النافذة المفتوحة قبل الاستبدال تبقى مفتوحة في المضيف المتصل بعده', async () => {
    const surface = SURFACES['e.builder (PR)'] as Surface;
    const rig = await mount(surface);
    (rig.hosts('e.builder')[0]?.shadowRoot?.querySelector('[data-action="builder-toggle"]') as HTMLButtonElement).click();
    await rig.settle(20);
    expect(rig.hosts('e.builder')[0]?.shadowRoot?.querySelector('[data-builder-window]')).not.toBeNull();
    rig.hydrate();
    await rig.settle(SETTLE);
    expectHealthy(rig, surface.spec);
    expect(rig.hosts('e.builder')[0]?.shadowRoot?.querySelector('[data-builder-window]')).not.toBeNull();
    expect(rig.hosts('e.builder')[0]?.shadowRoot?.querySelector('[data-action="builder-toggle"]')?.getAttribute('aria-expanded')).toBe('true');
    rig.dispose();
  });

  it('e.copy-prompt: قائمة القوالب المفتوحة قبل الاستبدال تبقى مفتوحة بعده', async () => {
    const surface = SURFACES['e.copy-prompt (PR)'] as Surface;
    const rig = await mount(surface);
    (rig.hosts('e.copy-prompt')[0]?.shadowRoot?.querySelector('[data-action="template-menu"]') as HTMLButtonElement).click();
    await rig.settle(20);
    expect(rig.hosts('e.copy-prompt')[0]?.shadowRoot?.querySelector('[data-template-menu]')).not.toBeNull();
    rig.hydrate();
    await rig.settle(SETTLE);
    expectHealthy(rig, surface.spec);
    expect(rig.hosts('e.copy-prompt')[0]?.shadowRoot?.querySelector('[data-template-menu]')).not.toBeNull();
    rig.dispose();
  });
});

describe('c.ui: شريط الترجمة فوق كل نص مرسوم', () => {
  const bars = (rig: Rig) => rig.hosts('c.ui.bar');
  const barSpec = (id: string): HostSpec => ({ name: 'c.ui.bar', anchorSelector: `#${id}`, side: 'before' });
  const mountBars = (): Promise<Rig> => mountRig({ load: markdownPage, path: '/octo/demo/issues/1', modules: [translateModule()] });

  it('[حارس] تُستبدل الأجسام مع الغلاف: يُنشأ لكل جسم جديد شريط واحد متصل ولا يبقى شريط عالق', async () => {
    const rig = await mountBars();
    expect(bars(rig)).toHaveLength(2);
    rig.hydrate();
    await rig.settle(SETTLE);
    rig.hydrate();
    await rig.settle(SETTLE);
    expect(rig.errors).toEqual([]);
    expect(bars(rig)).toHaveLength(2);
    expect(problems(rig, barSpec('c1'), { adjacency: false })).toEqual(['c.ui.bar: متصل 2 من 1 (عالق في شجرة مفصولة: 0)']);
    for (const id of ['c1', 'c2']) expect(document.getElementById(id)?.previousElementSibling?.localName).toBe('mijhar-host');
    rig.dispose();
  });

  it('يتبنّى الغلاف الجديد الجسم نفسه (React يعيد استعمال العقدة): يبقى شريطه متصلًا وواحدًا بجواره بلا استثناء', async () => {
    const rig = await mountBars();
    const body = document.getElementById('c1') as Element;
    const oldParent = body.parentElement as Element;
    const newParent = oldParent.cloneNode(false) as Element;
    newParent.append(body); // الجسم ينتقل إلى الأب الجديد، ويبقى مضيف الشريط في الأب القديم المفصول
    oldParent.replaceWith(newParent);
    await rig.settle(SETTLE);
    expect(rig.errors).toEqual([]);
    expect(bars(rig).filter((bar) => bar.nextElementSibling === body)).toHaveLength(1);
    expect(bars(rig)).toHaveLength(2);
    rig.dispose();
  });
});

describe('سجل التعديلات (MutationRecorder): إعادة إدراج مضيف أبوه شجرة مفصولة', () => {
  function stranded() {
    const doc = document;
    const recorder = new MutationRecorder('x.test');
    const root = doc.createElement('main');
    doc.body.append(root);
    const oldWrapper = doc.createElement('div');
    root.append(oldWrapper);
    const host = doc.createElement('mijhar-host');
    recorder.insert(oldWrapper, host);
    const newWrapper = doc.createElement('div');
    oldWrapper.replaceWith(newWrapper);
    return { recorder, host, oldWrapper, newWrapper, root };
  }

  it('[توصيف لسلوك b63f9c4 — يُعدَّل إن تغيّر عقد السجل] insert لمضيف أبوه شجرة مفصولة يرمي "العقدة مرتبطة بأب" كما يحدث في الصفحة الحية', () => {
    const { recorder, host, oldWrapper, newWrapper } = stranded();
    expect(host.isConnected).toBe(false);
    expect(host.parentNode).toBe(oldWrapper);
    expect(() => recorder.insert(newWrapper, host)).toThrow(/مرتبطة بأب/);
  });

  it('[حارس] النزع من الأب القديم ثم الإدراج في الجديد يعمل ويستعيد بلا skipped', () => {
    const { recorder, host, newWrapper } = stranded();
    host.remove();
    recorder.insert(newWrapper, host);
    expect(host.isConnected).toBe(true);
    expect(host.parentNode).toBe(newWrapper);
    const report = recorder.restore();
    expect(report.skipped).toEqual([]);
    expect(host.isConnected).toBe(false);
    expect(host.parentNode).toBeNull();
  });
});


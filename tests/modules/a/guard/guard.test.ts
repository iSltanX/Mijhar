// TEST-GUARD-01 إلى 04 (AC-A7 البندان ٣ و٤): حارس ملكية الكتابة في TextTransformRegistry على MutationObserver حقيقي (jsdom) وعينة
// fixture-diacritics-live من T-0.1. يُثبت أن قرار الاستعادة من سجل الكتابات لا من مقارنة النص، وأن النص يُترك عند الشك.
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { TextTransformRegistry } from '../../../../src/modules/a/guard';
import { deliver, easternDigits, guardHarness, strip, stripDiacritics } from './helpers';
import type { GuardHarness } from './helpers';

const IDS = ['c1', 'c2', 'c4', 'c5', 'c6', 'c7'] as const;

function originals(h: GuardHarness): Record<string, string> {
  return Object.fromEntries(IDS.map((id) => [id, h.text(id)]));
}

/** يسجّل كل كتابة characterData على العقدة بعد هذه اللحظة (للتحقق من «لا كتابة»). */
function watchWrites(h: GuardHarness, node: Node): () => number {
  let count = 0;
  const observer = new h.dom.window.MutationObserver((records) => {
    count += records.length;
  });
  observer.observe(node, { characterData: true });
  return () => {
    count += observer.takeRecords().length;
    observer.disconnect();
    return count;
  };
}

describe('TEST-GUARD-01: كتابة خارجية بنص مختلف بعد كتابة الإضافة ثم استعادة', () => {
  it.each([
    ['بعد تسليم سجلات المراقب', true],
    ['قبل تسليم سجلات المراقب (في المهمة نفسها)', false],
  ])('%s: لا استعادة، ويُعتمد النص الخارجي، وتُستعاد بقية العقد', async (_label, delivered) => {
    const h = guardHarness();
    const before = originals(h);
    const written = h.engine.apply('strip-diacritics', h.diacriticNodes());
    expect(written).toBeGreaterThanOrEqual(IDS.length);
    expect(h.text('c2')).toBe(strip(before.c2 as string));
    if (delivered) await deliver();

    h.gh.update('c2', 'نصٌّ جديدٌ كتبه GitHub');
    if (delivered) await deliver();
    const node = h.node('c2');
    const stop = watchWrites(h, node);
    const report = h.engine.dispose();

    expect(stop()).toBe(0);
    expect(h.text('c2')).toBe('نصٌّ جديدٌ كتبه GitHub');
    expect(report.skipped).toEqual([expect.objectContaining({ exception: 'text-foreign-write', transforms: ['strip-diacritics'] })]);
    for (const id of IDS.filter((i) => i !== 'c2')) expect(h.text(id)).toBe(before[id]);
    expect(report.restored).toBe(written - 1);
  });

  it('أثناء التفعيل: تُعلَّم العقدة ملوّثة ويُعتمد نص GitHub أصلًا جديدًا، ولا يكتب عليها تطبيق لاحق', async () => {
    const h = guardHarness([stripDiacritics, easternDigits]);
    h.engine.apply('strip-diacritics', h.diacriticNodes());
    await deliver();
    h.gh.update('c2', 'تحديثٌ 2026');
    await deliver();
    expect(h.engine.inspect(h.node('c2'))).toMatchObject({ dirty: 'text-foreign-write', original: 'تحديثٌ 2026' });
    const stop = watchWrites(h, h.node('c2'));
    h.engine.apply('eastern-digits', [h.node('c2')]);
    expect(stop()).toBe(0);
    expect(h.text('c2')).toBe('تحديثٌ 2026');
    expect(h.engine.counters.foreignWrites).toBe(1);
  });
});

describe('TEST-GUARD-02: كتابة خارجية بنص يساوي ما كتبته الإضافة', () => {
  it.each([
    ['يساوي المنزوع، بعد التسليم', 'stripped', true],
    ['يساوي المنزوع، قبل التسليم', 'stripped', false],
    ['يساوي الأصل المشكول، بعد التسليم', 'original', true],
  ])('%s: لا استعادة؛ الكشف من سجل الكتابات لا من مقارنة القيم', async (_label, kind, delivered) => {
    const h = guardHarness();
    const before = originals(h);
    h.engine.apply('strip-diacritics', h.diacriticNodes());
    if (delivered) await deliver();
    const value = kind === 'stripped' ? strip(before.c2 as string) : (before.c2 as string);
    h.gh.update('c2', value);
    expect(h.node('c2').nodeValue).toBe(value);
    if (delivered) await deliver();

    const stop = watchWrites(h, h.node('c2'));
    const report = h.engine.dispose();
    expect(stop()).toBe(0);
    expect(h.text('c2')).toBe(value);
    expect(report.skipped.map((s) => s.exception)).toEqual(['text-foreign-write']);
  });

  it('النص الحالي يساوي المنزوع لكن آخر كاتب هو GitHub: المساواة لا تكفي دليلًا', async () => {
    const h = guardHarness();
    h.engine.apply('strip-diacritics', [h.node('c1')]);
    await deliver();
    const state = h.engine.inspect(h.node('c1'));
    expect(state).toMatchObject({ pending: 0, dirty: null });
    expect(state?.confirmed).toBe(state?.generation);
    h.gh.update('c1', state?.display as string);
    h.engine.flush();
    expect(h.engine.inspect(h.node('c1'))?.dirty).toBe('text-foreign-write');
  });
});

describe('TEST-GUARD-03: كتابات خارجية متتالية مع التعطيل قبل تسليم سجلات المراقب', () => {
  const WRITES = [
    { id: 'c5', text: 'GitHub: الخامس أ' },
    { id: 'c5', text: 'GitHub: الخامس ب' },
    { id: 'c6', text: 'GitHub: السادس' },
  ] as const;
  const ORDERS = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ] as const;
  const cases = ORDERS.flatMap((order) => [0, 1, 2, 3].map((stopAt) => [order.join(''), stopAt, order] as const));

  it.each(cases)('الترتيب %s والتعطيل بعد %i كتابات: تُفرَّغ السجلات قبل الاستعادة ولا تُستعاد عقدة لمسها طرف خارجي', async (_name, stopAt, order) => {
    const h = guardHarness();
    const before = originals(h);
    h.engine.apply('strip-diacritics', h.diacriticNodes());
    await deliver();

    const sequence = order.map((i) => WRITES[i] as (typeof WRITES)[number]);
    for (const write of sequence.slice(0, stopAt)) h.gh.update(write.id, write.text);
    // التعطيل في المهمة نفسها: لم يُسلَّم أي سجل للكتابات الخارجية بعد.
    const report = h.engine.dispose();
    const touched = new Map<string, string>();
    for (const write of sequence.slice(0, stopAt)) touched.set(write.id, write.text);

    for (const id of IDS) {
      if (touched.has(id)) expect(h.text(id)).toBe(touched.get(id));
      else expect(h.text(id)).toBe(before[id]);
    }
    expect(report.skipped).toHaveLength(touched.size);
    expect(report.skipped.every((s) => s.exception === 'text-foreign-write')).toBe(true);

    // ما يكتبه GitHub بعد التعطيل يبقى كما كتبه: المراقب مفصول ولا كتابة من المحرك.
    for (const write of sequence.slice(stopAt)) h.gh.update(write.id, write.text);
    await deliver();
    const last = new Map<string, string>();
    for (const write of sequence) last.set(write.id, write.text);
    for (const [id, text] of last) expect(h.text(id)).toBe(text);
  });

  it('تسليم جزئي: كتابة سُلِّمت وأخرى لم تُسلَّم قبل التعطيل، ولكل منهما الحكم نفسه', async () => {
    const h = guardHarness();
    const before = originals(h);
    h.engine.apply('strip-diacritics', h.diacriticNodes());
    await deliver();
    h.gh.update('c5', 'GitHub: سُلِّم');
    await deliver();
    h.gh.update('c6', 'GitHub: لم يُسلَّم');
    const report = h.engine.dispose();
    expect(h.text('c5')).toBe('GitHub: سُلِّم');
    expect(h.text('c6')).toBe('GitHub: لم يُسلَّم');
    expect(h.text('c7')).toBe(before.c7);
    expect(report.skipped).toHaveLength(2);
  });

  it('تطبيق تحويل ثانٍ في المهمة نفسها بعد كتابة خارجية: التفريغ أولًا يمنع الكتابة فوقها', () => {
    const h = guardHarness([stripDiacritics, easternDigits]);
    h.engine.apply('strip-diacritics', [h.node('c1')]);
    h.gh.update('c1', 'GitHub 42');
    const written = h.engine.apply('eastern-digits', [h.node('c1')]);
    expect(written).toBe(0);
    expect(h.text('c1')).toBe('GitHub 42');
  });
});

describe('TEST-GUARD-04: استبدال العقدة أو فصلها أو نقلها', () => {
  it('استبدال: لا كتابة على العقدة القديمة المفصولة، والجديدة لا يمسها المحرك', async () => {
    const h = guardHarness();
    const before = originals(h);
    h.engine.apply('strip-diacritics', h.diacriticNodes());
    await deliver();
    const old = h.node('c2');
    const fresh = h.gh.replace('c2', strip(before.c2 as string));
    const stopOld = watchWrites(h, old);
    const stopFresh = watchWrites(h, fresh);
    const report = h.engine.dispose();
    expect(stopOld()).toBe(0);
    expect(stopFresh()).toBe(0);
    expect(old.nodeValue).toBe(strip(before.c2 as string));
    expect(h.text('c2')).toBe(strip(before.c2 as string));
    expect(report.skipped.map((s) => s.exception)).toEqual(['text-node-removed']);
  });

  it('العقدة الجديدة تُعامل جديدة: يطبَّق عليها التحويل بسجل جديد ويُستعاد أصلها هي', async () => {
    const h = guardHarness();
    h.engine.apply('strip-diacritics', [h.node('c2')]);
    await deliver();
    const fresh = h.gh.replace('c2', 'تَعْلِيقٌ جَدِيدٌ');
    await deliver();
    expect(h.engine.inspect(fresh)).toBeUndefined();
    h.engine.apply('strip-diacritics', [fresh]);
    expect(h.text('c2')).toBe('تعليق جديد');
    await deliver();
    const report = h.engine.dispose();
    expect(h.text('c2')).toBe('تَعْلِيقٌ جَدِيدٌ');
    expect(report.restored).toBe(1);
    expect(report.skipped.map((s) => s.exception)).toEqual(['text-node-removed']);
  });

  it('فصل حاوية التعليق: لا كتابة على العقد المفصولة', () => {
    const h = guardHarness();
    const before = originals(h);
    h.engine.apply('strip-diacritics', h.diacriticNodes());
    const detached = h.node('c4');
    h.gh.detach('c4');
    const stop = watchWrites(h, detached);
    const report = h.engine.dispose();
    expect(stop()).toBe(0);
    expect(detached.nodeValue).toBe(strip(before.c4 as string));
    expect(report.skipped.map((s) => s.exception)).toEqual(['text-node-removed']);
  });

  it('نقل الفقرة إلى موضع آخر ثم إعادتها: متصلة لكنها حالة شك فتُترك كما هي', async () => {
    const h = guardHarness();
    const before = originals(h);
    h.engine.apply('strip-diacritics', h.diacriticNodes());
    await deliver();
    const paragraph = h.doc.querySelector('#c1 p') as HTMLElement;
    const host = h.doc.getElementById('c1') as HTMLElement;
    h.doc.getElementById('c7')?.append(paragraph);
    host.append(paragraph);
    await deliver();
    const report = h.engine.dispose();
    expect(h.node('c1').isConnected).toBe(true);
    expect(h.text('c1')).toBe(strip(before.c1 as string));
    expect(report.skipped.map((s) => s.exception)).toEqual(['text-node-removed']);
  });

  it('فصل الحاوية المراقَبة نفسها (لا يراه المراقب): فحص الاتصال وقت الاستعادة يمنع الكتابة', () => {
    const h = guardHarness();
    const container = h.doc.getElementById('c3') as HTMLElement;
    const engine = new TextTransformRegistry({ root: container });
    engine.register(stripDiacritics);
    const nodes = h.diacriticNodes().filter((n) => container.contains(n));
    expect(engine.apply('strip-diacritics', nodes)).toBe(nodes.length);
    container.remove();
    const report = engine.dispose();
    expect(report.restored).toBe(0);
    expect(report.skipped).toHaveLength(nodes.length);
    expect(new Set(report.skipped.map((s) => s.exception))).toEqual(new Set(['text-node-detached']));
    for (const node of nodes) expect(node.nodeValue).toBe(strip(node.nodeValue as string));
  });

  it('لا يكتب المحرك على عقدة خارج حاويته', () => {
    const h = guardHarness();
    const container = h.doc.getElementById('c3') as HTMLElement;
    const engine = new TextTransformRegistry({ root: container });
    engine.register(stripDiacritics);
    expect(engine.apply('strip-diacritics', [h.node('c1')])).toBe(0);
    expect(engine.size).toBe(0);
  });
});

describe('تركيب التحويلات وإزالة كل منها', () => {
  function small(): { doc: Document; node: Text; engine: TextTransformRegistry } {
    const dom = new JSDOM('<div class="markdown-body"><p>عُنْصُرٌ رَقْمُ 42</p></div>', { url: 'https://github.com/octo/demo' });
    const doc = dom.window.document;
    const engine = new TextTransformRegistry({ root: doc.body });
    engine.register(stripDiacritics);
    engine.register(easternDigits);
    return { doc, node: doc.querySelector('p')?.firstChild as Text, engine };
  }

  it('يتركّب التحويلان بترتيب تعريفهما أيًّا كان ترتيب التطبيق، وإزالة أحدهما تعيد عرض الآخر', async () => {
    for (const order of [['strip-diacritics', 'eastern-digits'], ['eastern-digits', 'strip-diacritics']]) {
      const { node, engine } = small();
      for (const id of order) engine.apply(id, [node]);
      expect(node.data).toBe('عنصر رقم ٤٢');
      await deliver();
      const first = engine.remove('strip-diacritics');
      expect(first).toMatchObject({ rewritten: 1, restored: 0, skipped: [] });
      expect(node.data).toBe('عُنْصُرٌ رَقْمُ ٤٢');
      const second = engine.remove('eastern-digits');
      expect(second).toMatchObject({ rewritten: 0, restored: 1, skipped: [] });
      expect(node.data).toBe('عُنْصُرٌ رَقْمُ 42');
      expect(engine.size).toBe(0);
    }
  });

  it('إزالة تحويل بعد كتابة خارجية تُسرد مرة واحدة وتتحرر العقدة', async () => {
    const { node, engine } = small();
    engine.apply('strip-diacritics', [node]);
    engine.apply('eastern-digits', [node]);
    await deliver();
    node.data = 'GitHub كتب هذا';
    const first = engine.remove('eastern-digits');
    expect(first.skipped).toEqual([expect.objectContaining({ exception: 'text-foreign-write', transforms: ['strip-diacritics', 'eastern-digits'] })]);
    expect(engine.remove('strip-diacritics').skipped).toEqual([]);
    expect(node.data).toBe('GitHub كتب هذا');
  });

  it('تحويل لا يغيّر العقدة لا يُكتب ولا يُسجَّل', () => {
    const dom = new JSDOM('<p>plain English 42</p>', { url: 'https://github.com/' });
    const engine = new TextTransformRegistry({ root: dom.window.document.body });
    engine.register(stripDiacritics);
    expect(engine.apply('strip-diacritics', [dom.window.document.querySelector('p')?.firstChild as Text])).toBe(0);
    expect(engine.size).toBe(0);
  });

  it('dispose مرة ثانية تقرير فارغ، وبعده لا يقبل المحرك كتابة', () => {
    const { node, engine } = small();
    engine.apply('strip-diacritics', [node]);
    expect(engine.dispose().restored).toBe(1);
    expect(engine.dispose()).toMatchObject({ restored: 0, skipped: [], transforms: [] });
    expect(() => engine.apply('strip-diacritics', [node])).toThrow();
  });
});

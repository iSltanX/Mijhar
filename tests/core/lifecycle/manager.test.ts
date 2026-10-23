// TEST-CORE-01 (AC-1.2 بند 1): تركيب الوحدة وإزالتها متكرران ومتكافئان؛ إيقاف وحدة لا يمس غيرها. على وحدات وهمية.
import { describe, expect, it } from 'vitest';
import { LifecycleManager, ModuleRegistry, moduleMatchesPage } from '../../../src/core';
import type { ExtensionModule, PageState } from '../../../src/core';
import { ListenerLedger, loadPage, turboNavigate } from '../helpers/dom';
import { injectedCount, markerModule } from '../helpers/modules';
import { createHarness, snapshot } from '../helpers/runtime';

const PR_URL = 'https://github.com/octo/demo/pull/42';

describe('التركيب والإيقاف', () => {
  it('عند البدء تُركَّب الوحدات المفعَّلة الملائمة للصفحة فقط', () => {
    const dom = loadPage('pr', PR_URL);
    const a = markerModule({ id: 'a', pages: ['pr', 'issue'] });
    const b = markerModule({ id: 'b', pages: ['repo'] });
    const c = markerModule({ id: 'c', pages: '*' });
    const d = markerModule({ id: 'd', pages: ['pr'] });
    const h = createHarness(dom, [a.module, b.module, c.module, d.module], ['a', 'b', 'c']);
    h.manager.start();
    expect(h.manager.mountedIds()).toEqual(['a', 'c']);
    expect(h.manager.stateOf('b')).toBe('unmounted');
    expect(h.manager.stateOf('d')).toBe('unmounted');
    expect(injectedCount(dom.window.document)).toBe(2);
  });

  it('start مرتين لا يركّب مرتين', () => {
    const dom = loadPage('pr', PR_URL);
    const a = markerModule({ id: 'a', pages: '*' });
    const h = createHarness(dom, [a.module]);
    h.manager.start();
    h.manager.start();
    expect(a.stats.mounts).toBe(1);
    expect(injectedCount(dom.window.document, 'a')).toBe(1);
  });

  it('refresh بلا تغيير في الإعدادات لا يركّب ولا يوقف ولا يعيد تركيب أحد', () => {
    const dom = loadPage('pr', PR_URL);
    const a = markerModule({ id: 'a', pages: '*' });
    const h = createHarness(dom, [a.module]);
    h.manager.start();
    const result = h.manager.refresh();
    expect(result).toMatchObject({ reason: 'settings', mounted: [], unmounted: [], remounted: [] });
    expect(a.stats).toEqual({ mounts: 1, unmounts: 0 });
  });

  it('إيقاف وحدة لا يمس غيرها، وإعادة تفعيلها تركّبها مرة واحدة', () => {
    const dom = loadPage('pr', PR_URL);
    const doc = dom.window.document;
    const a = markerModule({ id: 'a', pages: '*' });
    const b = markerModule({ id: 'b', pages: '*' });
    const h = createHarness(dom, [a.module, b.module]);
    h.manager.start();

    h.enabled.delete('a');
    const off = h.manager.refresh();
    expect(off).toMatchObject({ unmounted: ['a'], mounted: [], remounted: [] });
    expect(injectedCount(doc, 'a')).toBe(0);
    expect(injectedCount(doc, 'b')).toBe(1);
    expect(doc.body.hasAttribute('data-mijhar-a')).toBe(false);
    expect(doc.body.getAttribute('data-mijhar-b')).toBe('on');
    expect(doc.getElementById('mijhar-a-styles')).toBeNull();
    expect(doc.getElementById('mijhar-b-styles')).not.toBeNull();
    expect(doc.body.classList.contains('mijhar-a')).toBe(false);
    expect(doc.body.classList.contains('mijhar-b')).toBe(true);
    expect(b.stats).toEqual({ mounts: 1, unmounts: 0 });

    h.enabled.add('a');
    h.manager.refresh();
    h.manager.refresh();
    expect(injectedCount(doc, 'a')).toBe(1);
    expect(a.stats).toEqual({ mounts: 2, unmounts: 1 });
  });

  it('stop يعيد DOM إلى لقطة ما قبل البدء حرفيًا ويفك كل المستمعات', () => {
    const dom = loadPage('pr', PR_URL);
    const ledger = new ListenerLedger(dom.window);
    const a = markerModule({ id: 'a', pages: '*' });
    const b = markerModule({ id: 'b', pages: '*' });
    const h = createHarness(dom, [a.module, b.module]);
    // تسخين: أول مراقب في jsdom يثبّت مستمعات داخلية لا تخص الإضافة.
    h.manager.start();
    h.manager.stop();
    const before = snapshot(dom);
    const listenersBefore = ledger.net();

    h.manager.start();
    expect(snapshot(dom)).not.toBe(before);
    h.manager.stop();
    expect(snapshot(dom)).toBe(before);
    expect(ledger.net()).toBe(listenersBefore);
    expect(h.manager.running).toBe(false);
    expect(h.manager.mountedIds()).toEqual([]);
  });

  it('stop يوقف الوحدات بترتيب معاكس لتركيبها، وstop الثاني بلا أثر', () => {
    const dom = loadPage('pr', PR_URL);
    const order: string[] = [];
    const make = (id: string): ExtensionModule => ({ id, title: id, pages: '*', mount() {}, unmount: () => void order.push(id) });
    const h = createHarness(dom, [make('a'), make('b'), make('c')]);
    h.manager.start();
    h.manager.stop();
    h.manager.stop();
    expect(order).toEqual(['c', 'b', 'a']);
  });

  it('إلغاء ctx.signal عند الإيقاف، والكتابة اللاحقة من استمرار غير متزامن تُرفض', async () => {
    const dom = loadPage('pr', PR_URL);
    let captured: { signal: AbortSignal; late: () => void } | undefined;
    const mod: ExtensionModule = {
      id: 'a',
      title: 'a',
      pages: '*',
      mount(ctx) {
        ctx.mutations.setAttribute(ctx.document.body, 'data-a', '1');
        captured = {
          signal: ctx.signal,
          late: () => ctx.mutations.setAttribute(ctx.document.body, 'data-late', 'x'),
        };
      },
    };
    const h = createHarness(dom, [mod]);
    h.manager.start();
    expect(captured?.signal.aborted).toBe(false);
    h.enabled.delete('a');
    h.manager.refresh();
    expect(captured?.signal.aborted).toBe(true);
    await Promise.resolve();
    captured?.late();
    expect(dom.window.document.body.hasAttribute('data-late')).toBe(false);
    expect(dom.window.document.body.hasAttribute('data-a')).toBe(false);
  });

  it('ctx.onTeardown ينفَّذ بترتيب معاكس قبل استعادة DOM', () => {
    const dom = loadPage('pr', PR_URL);
    const log: string[] = [];
    const mod: ExtensionModule = {
      id: 'a',
      title: 'a',
      pages: '*',
      mount(ctx) {
        ctx.mutations.setAttribute(ctx.document.body, 'data-a', '1');
        ctx.onTeardown(() => log.push(`أولى:${ctx.document.body.getAttribute('data-a')}`));
        ctx.onTeardown(() => log.push(`ثانية:${ctx.document.body.getAttribute('data-a')}`));
      },
    };
    const h = createHarness(dom, [mod]);
    h.manager.start();
    h.manager.stop();
    expect(log).toEqual(['ثانية:1', 'أولى:1']);
  });
});

describe('عزل الأخطاء', () => {
  const failing = (): ExtensionModule => ({
    id: 'bad',
    title: 'bad',
    pages: '*',
    mount(ctx) {
      ctx.mutations.setAttribute(ctx.document.body, 'data-bad', '1');
      ctx.mutations.insert(ctx.document.body, ctx.document.createElement('div'));
      ctx.listen(ctx.document, 'click', () => {});
      throw new Error('فشل التركيب');
    },
  });

  it('فشل تركيب وحدة يستعيد تعديلاتها الجزئية ولا يمس بقية الوحدات', () => {
    const dom = loadPage('pr', PR_URL);
    const ledger = new ListenerLedger(dom.window);
    const good = markerModule({ id: 'good', pages: '*' });
    const h = createHarness(dom, [failing(), good.module]);
    h.manager.start();
    const doc = dom.window.document;
    expect(h.manager.stateOf('bad')).toBe('failed');
    expect(h.manager.stateOf('good')).toBe('mounted');
    expect(doc.body.hasAttribute('data-bad')).toBe(false);
    expect(h.errors).toEqual([{ moduleId: 'bad', phase: 'mount', error: expect.objectContaining({ message: 'فشل التركيب' }) }]);
    expect(h.reports.find((r) => r.moduleId === 'bad')).toMatchObject({ restored: 2 });
    expect(injectedCount(doc, 'good')).toBe(1);
    // لا مستمع يتيم للوحدة الفاشلة: ما بقي هو ما ركّبته الوحدة السليمة (نقرة document وresize النافذة).
    h.manager.stop();
    const warmed = ledger.net();
    h.manager.start();
    h.manager.stop();
    expect(ledger.net()).toBe(warmed);
  });

  it('الوحدة الفاشلة تُعاد محاولتها عند التوفيق التالي (تنقل أو تغيّر إعدادات) وتُمسح حالة الفشل بنجاحها', () => {
    const dom = loadPage('pr', PR_URL);
    let attempts = 0;
    const failUntil = 3;
    const flaky: ExtensionModule = {
      id: 'flaky',
      title: 'flaky',
      pages: '*',
      mount(ctx) {
        attempts += 1;
        ctx.mutations.setAttribute(ctx.document.body, 'data-flaky', String(attempts));
        if (attempts < failUntil) throw new Error(`فشل ${attempts}`);
      },
    };
    const h = createHarness(dom, [flaky]);
    h.manager.start();
    expect(h.manager.stateOf('flaky')).toBe('failed');
    expect(h.manager.failures().has('flaky')).toBe(true);
    expect(dom.window.document.body.hasAttribute('data-flaky')).toBe(false);

    turboNavigate(dom, 'issue', 'https://github.com/octo/demo/issues/7');
    expect(h.manager.stateOf('flaky')).toBe('failed');
    expect(attempts).toBe(2);

    h.manager.refresh();
    expect(h.manager.stateOf('flaky')).toBe('mounted');
    expect(h.manager.failures().size).toBe(0);
    expect(attempts).toBe(3);
    h.manager.refresh();
    expect(attempts).toBe(3);
  });

  it('mount غير المتزامنة تُعدّ فشلًا وتُستعاد تعديلاتها', () => {
    const dom = loadPage('pr', PR_URL);
    const asyncModule = {
      id: 'async',
      title: 'async',
      pages: '*',
      mount: (ctx) => {
        ctx.mutations.setAttribute(ctx.document.body, 'data-async', '1');
        return Promise.resolve();
      },
    } as ExtensionModule;
    const h = createHarness(dom, [asyncModule]);
    h.manager.start();
    expect(h.manager.stateOf('async')).toBe('failed');
    expect(dom.window.document.body.hasAttribute('data-async')).toBe(false);
    expect(String((h.errors[0]?.error as Error).message)).toContain('متزامنة');
  });

  it('استثناء في unmount يُبلَّغ وتبقى الاستعادة المسجَّلة تعمل', () => {
    const dom = loadPage('pr', PR_URL);
    const mod: ExtensionModule = {
      id: 'a',
      title: 'a',
      pages: '*',
      mount: (ctx) => ctx.mutations.setAttribute(ctx.document.body, 'data-a', '1'),
      unmount() {
        throw new Error('تنظيف تالف');
      },
    };
    const h = createHarness(dom, [mod]);
    h.manager.start();
    h.manager.stop();
    expect(dom.window.document.body.hasAttribute('data-a')).toBe(false);
    expect(h.errors).toEqual([{ moduleId: 'a', phase: 'unmount', error: expect.objectContaining({ message: 'تنظيف تالف' }) }]);
  });

  it('استثناء في isEnabled يعني معطَّلة ويُبلَّغ', () => {
    const dom = loadPage('pr', PR_URL);
    const a = markerModule({ id: 'a', pages: '*' });
    const h = createHarness(dom, [a.module]);
    const manager = new LifecycleManager({
      registry: h.registry,
      detector: h.detector,
      document: dom.window.document,
      isEnabled: () => {
        throw new Error('إعدادات غير متاحة');
      },
      onError: (event) => h.errors.push(event),
    });
    manager.start();
    expect(manager.mountedIds()).toEqual([]);
    expect(h.errors[0]).toMatchObject({ moduleId: 'a', phase: 'enabled-check' });
  });

  it('استثناء في إنشاء ctx.observe بعد الإغلاق لا يفتح مراقبًا', () => {
    const dom = loadPage('pr', PR_URL);
    let late: (() => unknown) | undefined;
    const mod: ExtensionModule = {
      id: 'a',
      title: 'a',
      pages: '*',
      mount(ctx) {
        late = () => ctx.observe(ctx.document.body, { childList: true }, () => {});
      },
    };
    const h = createHarness(dom, [mod]);
    h.manager.start();
    h.manager.stop();
    expect(() => late?.()).not.toThrow();
  });
});

describe('SelectorsRegistry والوحدات', () => {
  it('تضيف الوحدة محدداتها مرة، ولا تستبدل مفتاحًا رُقّع قبلها', () => {
    const dom = loadPage('pr', PR_URL);
    const mod: ExtensionModule = {
      id: 'a',
      title: 'a',
      pages: '*',
      selectors: [
        { key: 'a.comment', description: 'نص التعليق', candidates: ['.comment-body'] },
        { key: 'confirm.pr', description: 'مقترح الوحدة', candidates: ['.لن-يطابق'] },
      ],
      mount: (ctx) => {
        expect(ctx.selectors.resolve(ctx.document, 'a.comment')?.element.className).toContain('comment-body');
      },
    };
    const h = createHarness(dom, [mod]);
    h.manager.start();
    expect(h.manager.stateOf('a')).toBe('mounted');
    expect(h.errors).toEqual([]);
    expect(h.detector.selectors.entry('confirm.pr').candidates).toContain('#discussion_bucket');
  });
});

describe('عقد الوحدة وسجلها', () => {
  const pageOf = (overrides: Partial<PageState>): PageState => ({
    href: 'https://github.com/octo/demo/pull/1',
    type: 'pr',
    owner: 'octo',
    repo: 'demo',
    number: 1,
    confidence: 'high',
    contentRoot: null,
    ...overrides,
  });
  const base = (extra: Partial<ExtensionModule>): ExtensionModule => ({ id: 'm', title: 'm', pages: ['pr'], mount() {}, ...extra });

  it('pages وminConfidence وshouldMount معًا', () => {
    expect(moduleMatchesPage(base({}), pageOf({}))).toBe(true);
    expect(moduleMatchesPage(base({ pages: ['issue'] }), pageOf({}))).toBe(false);
    expect(moduleMatchesPage(base({ pages: '*' }), pageOf({ type: 'other', confidence: 'low' }))).toBe(true);
    expect(moduleMatchesPage(base({ minConfidence: 'high' }), pageOf({ confidence: 'low' }))).toBe(false);
    expect(moduleMatchesPage(base({ minConfidence: 'low' }), pageOf({ confidence: 'low' }))).toBe(true);
    expect(moduleMatchesPage(base({ shouldMount: (p) => p.number === 2 }), pageOf({}))).toBe(false);
  });

  it('صفحة external لا تُركَّب فيها وحدة ولو كانت pages = "*"', () => {
    expect(moduleMatchesPage(base({ pages: '*' }), pageOf({ type: 'external', confidence: 'low' }))).toBe(false);
  });

  it('السجل يرفض المعرّف المكرر والفارغ وغياب mount ويحفظ ترتيب التسجيل', () => {
    const registry = new ModuleRegistry([base({ id: 'b' }), base({ id: 'a' })]);
    expect(registry.list().map((m) => m.id)).toEqual(['b', 'a']);
    expect(registry.get('a')?.id).toBe('a');
    expect(() => registry.register(base({ id: 'a' }))).toThrow(/مكرر/);
    expect(() => registry.register(base({ id: '' }))).toThrow(/بلا id/);
    expect(() => registry.register({ id: 'x', title: 'x', pages: '*' } as unknown as ExtensionModule)).toThrow(/بلا mount/);
  });
});

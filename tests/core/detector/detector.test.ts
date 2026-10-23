// PageDetector على عينات fixtures/pages: النوع والثقة وعزل المحددات (BLK-DOM-SELECTOR) ومصادر التنقل.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageDetector, SelectorsRegistry, DEFAULT_SELECTORS } from '../../../src/core';
import type { PageState } from '../../../src/core';
import { ListenerLedger, fixtureHtml, loadPage, trackObservers, turboNavigate } from '../helpers/dom';

afterEach(() => {
  vi.useRealTimers();
});

describe('detect: النوع والثقة', () => {
  it.each([
    ['repo', 'https://github.com/octo/demo', 'repo'],
    ['pr', 'https://github.com/octo/demo/pull/42', 'pr'],
    ['issue', 'https://github.com/octo/demo/issues/7', 'issue'],
    ['blob', 'https://github.com/octo/demo/blob/main/README.md', 'blob'],
  ])('عينة %s: النوع %s بثقة high مع حاوية رئيسية', (fixture, url, type) => {
    const dom = loadPage(fixture, url);
    const page = new PageDetector({ document: dom.window.document }).detect();
    expect(page.type).toBe(type);
    expect(page.confidence).toBe('high');
    expect(page.contentRoot?.id).toBe('js-repo-pjax-container');
  });

  it('ينقل المستودع ورقم طلب الدمج من المسار', () => {
    const dom = loadPage('pr', 'https://github.com/octo/demo/pull/42');
    const page = new PageDetector({ document: dom.window.document }).detect();
    expect(page).toMatchObject({ owner: 'octo', repo: 'demo', number: 42 });
  });

  it('المسار لا يطابق البنية: ثقة low دون انهيار، والحاوية بديلة (BLK-DOM-SELECTOR)', () => {
    const dom = loadPage('unrecognized-layout', 'https://github.com/octo/demo/pull/42');
    const detector = new PageDetector({ document: dom.window.document });
    const page = detector.detect();
    expect(page.type).toBe('pr');
    expect(page.confidence).toBe('low');
    expect(page.contentRoot).toBeNull();
    expect(detector.selectors.degraded()).toEqual(expect.arrayContaining(['content-root', 'confirm.pr']));
  });

  it('ترقيع محدد واحد في الجدول يعيد الثقة دون المساس بغيره', () => {
    const dom = loadPage('unrecognized-layout', 'https://github.com/octo/demo/pull/42');
    const detector = new PageDetector({ document: dom.window.document });
    expect(detector.detect().confidence).toBe('low');
    detector.selectors.define({ key: 'confirm.pr', description: 'محدد مرقَّع', candidates: ['.new-thread'] });
    expect(detector.detect().confidence).toBe('high');
    expect(detector.selectors.entry('confirm.repo').candidates).toEqual(DEFAULT_SELECTORS.find((e) => e.key === 'confirm.repo')?.candidates);
  });

  it('مضيف غير github.com يُصنَّف external بثقة low', () => {
    const dom = loadPage('repo', 'https://example.com/octo/demo');
    const page = new PageDetector({ document: dom.window.document }).detect();
    expect(page.type).toBe('external');
    expect(page.confidence).toBe('low');
  });

  it('نوع بلا مفتاح confirm يبقى low (other)', () => {
    const dom = loadPage('repo', 'https://github.com/octo/demo/wiki');
    expect(new PageDetector({ document: dom.window.document }).detect()).toMatchObject({ type: 'other', confidence: 'low' });
  });

  it('محدد معطوب الصياغة في الجدول يُعامَل كغياب لا استثناء', () => {
    const dom = loadPage('repo', 'https://github.com/octo/demo');
    const selectors = new SelectorsRegistry([{ key: 'content-root', description: 'معطوب ثم سليم', candidates: ['##bad(', '#js-repo-pjax-container'] }]);
    const page = new PageDetector({ document: dom.window.document, selectors }).detect();
    expect(page.contentRoot?.id).toBe('js-repo-pjax-container');
    expect(selectors.health()['content-root']).toMatchObject({ status: 'fallback', index: 1 });
  });
});

describe('start/subscribe/stop', () => {
  const setup = (fixture = 'repo', url = 'https://github.com/octo/demo', settleMs = 20) => {
    const dom = loadPage(fixture, url);
    const ledger = new ListenerLedger(dom.window);
    const detector = new PageDetector({ document: dom.window.document, settleMs });
    const seen: Array<[PageState, PageState | null]> = [];
    detector.subscribe((page, previous) => seen.push([page, previous]));
    return { dom, ledger, detector, seen };
  };

  it('start يعلن الحالة الأولى بلا سابق، وتكراره بلا أثر', () => {
    const { detector, seen } = setup();
    detector.start();
    detector.start();
    expect(seen).toHaveLength(1);
    expect(seen[0]?.[1]).toBeNull();
    expect(detector.current()?.type).toBe('repo');
  });

  it('turbo:render ثم turbo:load للتنقل الواحد يعلنان تغيّرًا واحدًا', () => {
    const { dom, detector, seen } = setup();
    detector.start();
    turboNavigate(dom, 'pr', 'https://github.com/octo/demo/pull/42');
    expect(seen).toHaveLength(2);
    expect(seen[1]?.[0].type).toBe('pr');
    expect(seen[1]?.[1]?.type).toBe('repo');
  });

  it('تغيّر الهاش وحده لا يُعلن تغيّرًا', () => {
    const { dom, detector, seen } = setup();
    detector.start();
    dom.window.history.pushState({}, '', '#readme');
    dom.window.document.dispatchEvent(new dom.window.CustomEvent('turbo:load'));
    expect(seen).toHaveLength(1);
  });

  it('تنقل يستبدل body لنفس المسار يُعلن (إعادة تحميل فعلية)', () => {
    const { dom, detector, seen } = setup();
    detector.start();
    turboNavigate(dom, 'repo', 'https://github.com/octo/demo');
    expect(seen).toHaveLength(2);
  });

  // VR-08: كان يُعلن المسار وحده بعد settleMs على DOM الصفحة السابقة؛ صار يُعلن بعد هدوء DOM الجديد، وبلا DOM عند الحد الأقصى.
  it('popstate يُعلن بعد هدوء DOM الجديد (settleMs) لا فورًا، وبلا DOM جديد عند الحد الأقصى', async () => {
    vi.useFakeTimers();
    const { dom, detector, seen } = setup();
    detector.start();
    dom.window.history.pushState({}, '', '/octo/demo/issues');
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    expect(seen).toHaveLength(1);
    vi.advanceTimersByTime(40);
    expect(seen).toHaveLength(1);
    dom.window.document.querySelector('#js-repo-pjax-container')!.append(dom.window.document.createElement('div'));
    await Promise.resolve();
    vi.advanceTimersByTime(19);
    expect(seen).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(seen).toHaveLength(2);
    expect(seen[1]?.[0].type).toBe('issue-list');

    dom.window.history.pushState({}, '', '/octo/demo/pulls');
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    vi.advanceTimersByTime(999);
    expect(seen).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(seen.at(-1)?.[0].type).toBe('pr-list');
  });

  it('خطأ مشترك لا يمنع بقية المشتركين ويصل إلى onError', () => {
    const dom = loadPage('repo', 'https://github.com/octo/demo');
    const onError = vi.fn();
    const detector = new PageDetector({ document: dom.window.document, onError });
    const good = vi.fn();
    detector.subscribe(() => {
      throw new Error('عطل مشترك');
    });
    detector.subscribe(good);
    detector.start();
    expect(good).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('stop يفك كل المستمعات والمراقبات والمؤقتات ولا يعلن بعده', () => {
    vi.useFakeTimers();
    const { dom, ledger, detector, seen } = setup();
    // jsdom يثبّت مستمعاته الداخلية (التركيز والفأرة) عند أول مراقب؛ يُسخَّن بكاشف مؤقت حتى لا تُحسب.
    const warmUp = new PageDetector({ document: dom.window.document });
    warmUp.start();
    warmUp.stop();
    const before = ledger.net();
    detector.start();
    expect(ledger.net()).toBeGreaterThan(before);
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    detector.stop();
    expect(ledger.net()).toBe(before);
    dom.window.history.pushState({}, '', '/octo/demo/issues');
    turboNavigate(dom, 'issue', 'https://github.com/octo/demo/issues/7');
    vi.advanceTimersByTime(500);
    expect(seen).toHaveLength(1);
    expect(detector.current()).toBeNull();
  });

  it('subscribe يعيد دالة إلغاء', () => {
    const { dom, detector } = setup();
    const listener = vi.fn();
    const off = detector.subscribe(listener);
    off();
    detector.start();
    turboNavigate(dom, 'pr', 'https://github.com/octo/demo/pull/42');
    expect(listener).not.toHaveBeenCalled();
  });
});

// تنقل github.com الحي بلا أحداث Turbo (evidence/T-1.2/live-selector-check.md): صفحات React يتغير مسارها قبل DOM،
// وتبويبات طلب الدمج يصل DOM فيها قبل المسار. لا يُحكم على DOM لحظة تغيّر المسار بل بعد هدوئه.
describe('تنقل بلا أحداث Turbo', () => {
  const SETTLE = 100;
  const tick = async (ms: number): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(ms);
  };

  const setup = (fixture = 'repo', url = 'https://github.com/octo/demo', extra: { settleMaxMs?: number } = {}) => {
    vi.useFakeTimers();
    const dom = loadPage(fixture, url);
    const navigation = new dom.window.EventTarget();
    (dom.window as unknown as { navigation: EventTarget }).navigation = navigation;
    const observers = trackObservers(dom);
    const detector = new PageDetector({ document: dom.window.document, settleMs: SETTLE, ...extra });
    const seen: PageState[] = [];
    detector.subscribe((page) => seen.push(page));
    detector.start();
    const nav = (type: 'navigatesuccess' | 'currententrychange' = 'navigatesuccess') => navigation.dispatchEvent(new dom.window.Event(type));
    const swapContent = (fixtureName: string): void => {
      const body = new dom.window.DOMParser().parseFromString(fixtureHtml(fixtureName), 'text/html').body;
      dom.window.document.body.innerHTML = body.innerHTML;
    };
    return { dom, detector, seen, nav, swapContent, observers, navigation };
  };

  // VR-08: التعديل الذي يحرّك إعلان التنقل داخل حاوية المحتوى؛ وما في body خارجها (بطاقة تحويم) لا يُعدّ DOM الصفحة الجديدة.
  it('تعديل شجرة الحاوية يُحرّك الفحص بعد الهدوء، والدفعات المتتالية تؤجله', async () => {
    const { dom, detector, seen } = setup();
    const root = dom.window.document.querySelector('#js-repo-pjax-container')!;
    dom.window.history.pushState({}, '', '/octo/demo/issues/7');
    root.appendChild(dom.window.document.createElement('div'));
    await tick(60);
    root.appendChild(dom.window.document.createElement('div'));
    await tick(60);
    expect(seen).toHaveLength(1);
    await tick(60);
    expect(seen).toHaveLength(2);
    expect(detector.current()?.type).toBe('issue');
  });

  it('نمط React: يتغير المسار أولًا ثم يصل DOM: إعلان واحد بثقة high لا حالة low وسيطة', async () => {
    const { dom, seen, nav, swapContent } = setup();
    dom.window.history.pushState({}, '', '/octo/demo/issues/7');
    nav();
    await tick(60);
    expect(seen).toHaveLength(1);
    swapContent('issue');
    await tick(60);
    expect(seen).toHaveLength(1);
    await tick(50);
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject({ type: 'issue', confidence: 'high', number: 7 });
  });

  it('نمط تبويبات طلب الدمج: يصل DOM أولًا ثم يتغير المسار في آخر التنقل', async () => {
    const { dom, seen, nav, swapContent } = setup('pr', 'https://github.com/octo/demo/pull/42');
    swapContent('issue');
    await tick(SETTLE + 10);
    const afterDom = seen.length;
    expect(afterDom).toBe(2);
    dom.window.history.pushState({}, '', '/octo/demo/pull/42/commits');
    nav();
    await tick(SETTLE + 10);
    expect(seen).toHaveLength(afterDom + 1);
    expect(seen.at(-1)).toMatchObject({ type: 'pr-commits', number: 42 });
  });

  // VR-08: الحدث وحده بلا DOM جديد يُعلن عند الحد الأقصى (settleMaxMs) لا بعد settleMs.
  it.each(['navigatesuccess', 'currententrychange'] as const)('حدث Navigation API «%s» وحده يحرّك الفحص، ويُعلن عند الحد الأقصى إن لم يصل DOM', async (type) => {
    const { dom, seen, nav } = setup();
    dom.window.history.pushState({}, '', '/octo/demo/pulls');
    nav(type);
    await tick(SETTLE + 10);
    expect(seen.at(-1)?.type).toBe('repo');
    await tick(1000);
    expect(seen.at(-1)?.type).toBe('pr-list');
  });

  it('استبدال body كاملًا بلا أحداث يُلتقط، ويُعاد ربط المراقب بالجديد', async () => {
    const { dom, detector, seen } = setup();
    const doc = dom.window.document;
    const next = new dom.window.DOMParser().parseFromString(fixtureHtml('issue'), 'text/html');
    dom.window.history.pushState({}, '', '/octo/demo/issues/7');
    doc.documentElement.replaceChild(doc.adoptNode(next.body), doc.body);
    await tick(SETTLE + 10);
    expect(seen).toHaveLength(2);

    // تعديل لاحق داخل حاوية body الجديد وحده يلتقطه المراقب الجديد.
    dom.window.history.pushState({}, '', '/octo/demo/issues');
    doc.querySelector('#js-repo-pjax-container')!.appendChild(doc.createElement('div'));
    await tick(SETTLE + 10);
    expect(detector.current()?.type).toBe('issue-list');
  });

  it('استمرار التعديلات لا يؤخر الفحص أكثر من settleMaxMs', async () => {
    const { dom, detector } = setup('repo', 'https://github.com/octo/demo', { settleMaxMs: 300 });
    dom.window.history.pushState({}, '', '/octo/demo/issues/7');
    for (let t = 0; t < 400; t += 50) {
      dom.window.document.body.appendChild(dom.window.document.createElement('i'));
      await tick(50);
    }
    expect(detector.current()?.type).toBe('issue');
  });

  it('تعديلات الوحدات (حقن عناصر) بلا تغيّر في الصفحة لا تُعلن تغيّرًا', async () => {
    const { dom, seen } = setup();
    for (let i = 0; i < 5; i += 1) {
      dom.window.document.body.appendChild(dom.window.document.createElement('div'));
      await tick(SETTLE + 10);
    }
    expect(seen).toHaveLength(1);
  });

  it('stop يفصل المراقب ومستمعات Navigation API فلا يُعلن شيء بعده', async () => {
    const { dom, detector, seen, nav, observers, navigation } = setup();
    expect(observers.live()).toBe(1);
    detector.stop();
    expect(observers.live()).toBe(0);
    dom.window.history.pushState({}, '', '/octo/demo/issues/7');
    nav();
    navigation.dispatchEvent(new dom.window.Event('currententrychange'));
    dom.window.document.body.appendChild(dom.window.document.createElement('div'));
    await tick(SETTLE * 3);
    expect(seen).toHaveLength(1);
  });

  it('observeDom=false: لا مراقب إطلاقًا، ويبقى Navigation API وTurbo', async () => {
    vi.useFakeTimers();
    const dom = loadPage('repo', 'https://github.com/octo/demo');
    const observers = trackObservers(dom);
    const detector = new PageDetector({ document: dom.window.document, observeDom: false, settleMs: SETTLE });
    detector.start();
    expect(observers.live()).toBe(0);
    turboNavigate(dom, 'issue', 'https://github.com/octo/demo/issues/7');
    expect(detector.current()?.type).toBe('issue');
  });
});

// VR-08 (أجزاء 1–4 من MJ-AUDIT-003): إعلان واحد لكل تنقل بعد وصول DOM الجديد، بترتيبي evidence/T-1.2 المقيسين: المسار أولًا ثم DOM
// (قوائم المشكلات ← طلبات الدمج: المسار ~13ms وDOM ~236ms)، وDOM أولًا ثم المسار (تبويبات PR: DOM ~111–152ms والمسار ~508ms).
// التعديل «المؤهل» childList داخل حاوية المحتوى لا من صنع الإضافة؛ وما في body خارجها (بطاقة تحويم أو إشعار) لا يؤهل.
describe('توقيت الإعلان بعد DOM الجديد (VR-08)', () => {
  type Seen = { at: number; href: string; marker: string };
  const harness = () => {
    vi.useFakeTimers();
    const dom = loadPage('blob', 'https://github.com/octo/demo/blob/main/a.ts');
    const doc = dom.window.document;
    const detector = new PageDetector({ document: doc });
    const seen: Seen[] = [];
    let now = 0;
    detector.subscribe((page) => seen.push({ at: now, href: page.href, marker: doc.querySelector('[data-marker]')?.getAttribute('data-marker') ?? 'old' }));
    detector.start();
    const root = doc.querySelector('#js-repo-pjax-container')!;
    const step = async (ms: number) => {
      for (let i = 0; i < ms; i += 1) {
        vi.advanceTimersByTime(1);
        now += 1;
        await Promise.resolve();
        await Promise.resolve();
      }
    };
    const go = (path: string) => {
      dom.window.history.pushState({}, '', path);
      dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    };
    const render = (marker: string) => {
      const fresh = doc.createElement('div');
      fresh.setAttribute('data-marker', marker);
      fresh.innerHTML = '<div id="repos-sticky-header"></div>';
      root.replaceChildren(fresh);
    };
    const host = () => {
      const el = doc.createElement('mijhar-host');
      root.prepend(el);
      const wrap = doc.createElement('span');
      wrap.setAttribute('data-mijhar-injected', '');
      root.append(wrap);
    };
    return { dom, doc, detector, seen, step, go, render, host, now: () => now };
  };

  it('1. DOM بعد المسار بـ240ms: إعلان واحد بعد DOM الجديد (F-003 late)', async () => {
    const h = harness();
    await h.step(13);
    h.go('/octo/demo/blob/main/b.ts');
    await h.step(227);
    h.render('new-b.ts');
    await h.step(1200);
    expect(h.seen).toHaveLength(2);
    expect(h.seen[1]).toMatchObject({ href: 'https://github.com/octo/demo/blob/main/b.ts', marker: 'new-b.ts' });
    expect(h.seen[1]!.at).toBeGreaterThanOrEqual(240);
    h.detector.stop();
  });

  it('2. تعديل غريب في body خارج الحاوية قبل المسار بـ200ms لا يُعدّ DOM جديدًا: إعلان واحد بعد DOM', async () => {
    const h = harness();
    await h.step(100);
    h.doc.body.append(Object.assign(h.doc.createElement('div'), { className: 'Popover hovercard' }));
    await h.step(200);
    h.go('/octo/demo/blob/main/b.ts');
    await h.step(240);
    h.render('new-b.ts');
    await h.step(1200);
    expect(h.seen).toHaveLength(2);
    expect(h.seen[1]).toMatchObject({ marker: 'new-b.ts' });
    h.detector.stop();
  });

  it('3. DOM أولًا داخل الحاوية (120ms) ثم المسار (500ms): إعلان واحد بالـDOM الجديد بعد هدوء المسار', async () => {
    const h = harness();
    await h.step(120);
    h.render('new-b.ts');
    await h.step(380);
    h.go('/octo/demo/blob/main/b.ts');
    await h.step(1200);
    expect(h.seen).toHaveLength(2);
    expect(h.seen[1]).toMatchObject({ href: 'https://github.com/octo/demo/blob/main/b.ts', marker: 'new-b.ts' });
    const latency = h.seen[1]!.at - 500;
    console.log('VR-08 DOM-first latency after URL change (ms):', latency);
    expect(latency).toBeLessThanOrEqual(110);
    h.detector.stop();
  });

  it('4. تغيّر الهاش وحده لا يُعلن', async () => {
    const h = harness();
    await h.step(10);
    h.dom.window.history.pushState({}, '', '#L5');
    h.dom.window.dispatchEvent(new h.dom.window.HashChangeEvent('hashchange'));
    h.dom.window.dispatchEvent(new h.dom.window.PopStateEvent('popstate'));
    await h.step(1500);
    expect(h.seen).toHaveLength(1);
    h.detector.stop();
  });

  it('5. إدراج مضيفات الوحدات لا يعلن ولا يدور ولا يؤخر إعلانًا قائمًا', async () => {
    const h = harness();
    await h.step(13);
    h.go('/octo/demo/blob/main/b.ts');
    await h.step(227);
    h.render('new-b.ts');
    await h.step(60);
    h.host();
    await h.step(30);
    h.host();
    await h.step(1200);
    expect(h.seen).toHaveLength(2);
    expect(h.seen[1]!.at).toBeLessThanOrEqual(341);
    for (let i = 0; i < 5; i += 1) {
      h.host();
      await h.step(150);
    }
    expect(h.seen).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
    h.detector.stop();
  });

  it('6. تغيّر المسار بلا أي تغيّر في DOM يُعلن عند الحد الأقصى', async () => {
    const h = harness();
    await h.step(13);
    h.go('/octo/demo/blob/main/b.ts');
    await h.step(999);
    expect(h.seen).toHaveLength(1);
    await h.step(10);
    expect(h.seen).toHaveLength(2);
    // عند الحد الأقصى من تغيّر المسار (13 + 1000)؛ والعدّاد يسجّل الإعلان قبل تقدّمه بنبضة.
    expect(h.seen[1]).toMatchObject({ href: 'https://github.com/octo/demo/blob/main/b.ts', marker: 'old' });
    expect(h.seen[1]!.at).toBeGreaterThanOrEqual(1012);
    h.detector.stop();
  });

  it('7. ضابط: DOM بعد المسار بـ60ms: إعلان واحد بالـDOM الجديد (F-003 control)', async () => {
    const h = harness();
    await h.step(13);
    h.go('/octo/demo/blob/main/b.ts');
    await h.step(47);
    h.render('new-b.ts');
    await h.step(1200);
    expect(h.seen).toHaveLength(2);
    expect(h.seen[1]).toMatchObject({ marker: 'new-b.ts' });
    h.detector.stop();
  });
});

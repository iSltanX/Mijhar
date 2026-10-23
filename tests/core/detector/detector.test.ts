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

  it('popstate يُعلن بعد هدوء settleMs لا فورًا', () => {
    vi.useFakeTimers();
    const { dom, detector, seen } = setup();
    detector.start();
    dom.window.history.pushState({}, '', '/octo/demo/issues');
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    expect(seen).toHaveLength(1);
    vi.advanceTimersByTime(19);
    expect(seen).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(seen).toHaveLength(2);
    expect(seen[1]?.[0].type).toBe('issue-list');
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

  it('تعديل شجرة body يُحرّك الفحص بعد الهدوء، والدفعات المتتالية تؤجله', async () => {
    const { dom, detector, seen } = setup();
    dom.window.history.pushState({}, '', '/octo/demo/issues/7');
    dom.window.document.body.appendChild(dom.window.document.createElement('div'));
    await tick(60);
    dom.window.document.body.appendChild(dom.window.document.createElement('div'));
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

  it.each(['navigatesuccess', 'currententrychange'] as const)('حدث Navigation API «%s» وحده يحرّك الفحص', async (type) => {
    const { dom, seen, nav } = setup();
    dom.window.history.pushState({}, '', '/octo/demo/pulls');
    nav(type);
    await tick(SETTLE + 10);
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

    // تعديل لاحق داخل body الجديد وحده يلتقطه المراقب الجديد.
    dom.window.history.pushState({}, '', '/octo/demo/issues');
    doc.body.appendChild(doc.createElement('div'));
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

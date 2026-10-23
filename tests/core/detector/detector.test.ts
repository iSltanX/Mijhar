// PageDetector على عينات fixtures/pages: النوع والثقة وعزل المحددات (BLK-DOM-SELECTOR) ومصادر التنقل.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PageDetector, SelectorsRegistry, DEFAULT_SELECTORS } from '../../../src/core';
import type { PageState } from '../../../src/core';
import { ListenerLedger, loadPage, turboNavigate } from '../helpers/dom';

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

  it('تغيّر <title> يُحرّك الفحص المؤجَّل', async () => {
    vi.useFakeTimers();
    const { dom, detector, seen } = setup();
    detector.start();
    dom.window.history.pushState({}, '', '/octo/demo/pulls');
    dom.window.document.title = 'تغيّر العنوان';
    await Promise.resolve();
    vi.advanceTimersByTime(30);
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

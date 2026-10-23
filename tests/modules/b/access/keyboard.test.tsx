// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// TEST-A11Y-01 (AC-B5، الجزء الآلي): الشارات أزرار أصلية قابلة للتركيز بترتيب Tab، باسم وصول، تُفتح وتُغلق، ويعود التركيز، ولا تتسرب
// ضغطاتها إلى اختصارات GitHub. الضغط الفعلي Enter وSpace وTab في المتصفحات يقيسه e2e (tests/modules/b/access/browser/run.mjs): jsdom لا
// يحوّل الضغطة إلى click ولا يحرّك التركيز بـTab.
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auditBadges, auditCard } from '../../../../src/modules/b/access';
import { SAMPLE, loadHtml } from '../card/helpers';
import { altH, badge, badges, flush, host, mountCard, press, shadow } from './harness';
import type { Live } from './harness';

let live: Live | null = null;
beforeEach(() => loadHtml(SAMPLE));
afterEach(() => {
  live?.manager.stop();
  live = null;
});

/** عناصر قابلة للتركيز بـTab داخل الجذر بترتيب المستند (tabindex غير سالب، وأزرار غير معطلة). */
const tabStops = (root: ParentNode): Element[] =>
  [...root.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')].filter((el) => {
    const tabindex = el.getAttribute('tabindex');
    return (tabindex === null || Number(tabindex) >= 0) && !(el as HTMLButtonElement).disabled;
  });

describe('الشارات عناصر وصول حقيقية', () => {
  it('كل شارة <button type="button"> باسم وصول وحالة فتح، ولا مخالفة في المدقق', async () => {
    live = await mountCard();
    altH();
    await flush();
    expect(badges()).toHaveLength(20);
    for (const b of badges()) {
      expect(b.localName).toBe('button');
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('aria-label')).toMatch(/^شرح «.+ \(.+\)» — (آمن|حساس|خطر)$/);
      expect(b.getAttribute('aria-expanded')).toBe('false');
      expect(b.getAttribute('aria-haspopup')).toBe('dialog');
    }
    expect(auditBadges(shadow(), { sizeOf: () => ({ width: 20, height: 20 }), minTarget: 20 })).toEqual([]);
  });

  it('كل الشارات في ترتيب Tab بالتتابع في مستند الطبقة (لا tabindex سالب ولا شارة خارج الترتيب)', async () => {
    live = await mountCard();
    altH();
    await flush();
    const stops = tabStops(shadow());
    for (const b of badges()) expect(stops, b.dataset.entry).toContain(b);
    const positions = badges().map((b) => stops.indexOf(b));
    expect(positions).toEqual([...positions].sort((a, c) => a - c));
    // ثم زر «إيقاف» في شريط الوضع آخر عنصر في الترتيب.
    expect(stops.at(-1)?.getAttribute('data-action')).toBe('stop');
  });

  it('الشارة تعمل بمجرد click الذي ينتجه Enter وSpace في المتصفح، فلا مستمع مفاتيح خاص يحجب الفتح', async () => {
    live = await mountCard();
    altH();
    await flush();
    const star = badge('star');
    for (const key of ['Enter', ' ']) {
      const event = press({ key, code: key === ' ' ? 'Space' : 'Enter' }, star);
      // لا نمنع الافتراضي: المتصفح يحوّل Enter/Space على الزر إلى click.
      expect(event.defaultPrevented, key).toBe(false);
    }
    act(() => void star.click());
    await flush();
    expect(star.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('البطاقة والتركيز', () => {
  it('الفتح ينقل التركيز إلى البطاقة وهي حوار باسم وزر إغلاق باسم وصول', async () => {
    live = await mountCard();
    altH();
    await flush();
    act(() => void badge('star').click());
    await flush();
    const card = shadow().querySelector('.card') as HTMLElement;
    expect(shadow().activeElement).toBe(card);
    expect(card.getAttribute('role')).toBe('dialog');
    expect(auditCard(shadow())).toEqual([]);
    expect(card.querySelector('[data-action="close"]')?.getAttribute('aria-label')).toBe('إغلاق الشرح');
  });

  it('Escape على البطاقة يغلقها ويعود التركيز إلى الشارة التي فتحتها', async () => {
    live = await mountCard();
    altH();
    await flush();
    act(() => void badge('watch').click());
    await flush();
    press({ key: 'Escape' }, shadow().querySelector('.card') as HTMLElement);
    await flush(20);
    expect(shadow().querySelector('.card')).toBeNull();
    expect(shadow().activeElement).toBe(badge('watch'));
    expect(badge('watch').getAttribute('aria-expanded')).toBe('false');
  });

  it('Escape والتركيز على الشارة نفسها والبطاقة مفتوحة يغلقها أيضًا', async () => {
    live = await mountCard();
    altH();
    await flush();
    act(() => void badge('fork').click());
    await flush();
    act(() => badge('fork').focus());
    const event = press({ key: 'Escape' }, badge('fork'));
    await flush(20);
    expect(event.defaultPrevented).toBe(true);
    expect(shadow().querySelector('.card')).toBeNull();
    expect(shadow().activeElement).toBe(badge('fork'));
  });

  it('زر الإغلاق يغلق البطاقة بالنقر (مسار اللمس والفأرة) ويعيد التركيز إلى الشارة', async () => {
    live = await mountCard();
    altH();
    await flush();
    act(() => void badge('star').click());
    await flush();
    act(() => void shadow().querySelector<HTMLButtonElement>('[data-action="close"]')!.click());
    await flush(20);
    expect(shadow().querySelector('.card')).toBeNull();
    expect(shadow().activeElement).toBe(badge('star'));
  });

  it('النقر على الشارة المفتوحة ثانيةً يغلقها (تبديل)', async () => {
    live = await mountCard();
    altH();
    await flush();
    act(() => void badge('star').click());
    await flush();
    act(() => void badge('star').click());
    await flush();
    expect(shadow().querySelector('.card')).toBeNull();
  });
});

describe('التفعيل بلوحة المفاتيح ينقل التركيز إلى الطبقة ويعيده', () => {
  it('Alt+H يضع التركيز على أول شارة، وAlt+H ثانيةً تعيد التركيز إلى العنصر الذي كان مركَّزًا', async () => {
    live = await mountCard();
    const star = document.querySelector<HTMLElement>('#star-btn')!;
    star.focus();
    expect(document.activeElement).toBe(star);
    altH(star);
    await flush();
    expect(shadow().activeElement).toBe(badges()[0]);
    altH(badges()[0]);
    await flush();
    expect(live.mode.active).toBe(false);
    expect(document.activeElement).toBe(star);
  });

  it('التفعيل من اللوحة (الواجهة البرمجية) لا ينقل التركيز: المستخدم لا يزال في اللوحة', async () => {
    live = await mountCard();
    const star = document.querySelector<HTMLElement>('#star-btn')!;
    star.focus();
    act(() => void live!.mode.set(true));
    await flush();
    expect(badges().length).toBeGreaterThan(0);
    expect(shadow().activeElement).toBeNull();
    expect(document.activeElement).toBe(star);
  });
});

// VR-15 (الجزء (أ) من MJ-AUDIT-008) وVR-16 (البند 2 من الجزء (ب)): الإغلاق بنقرة خارج البطاقة لا يسحب التركيز من حيث نقر المستخدم،
// وزر «إيقاف» داخل الطبقة يعيد التركيز كما يعيده Alt+H.
describe('التركيز عند الإغلاق من الخارج والإيقاف من الطبقة', () => {
  it('نقرة خارج الطبقة على حقل في الصفحة تغلق البطاقة ويبقى التركيز في الحقل', async () => {
    live = await mountCard();
    altH();
    await flush();
    act(() => void badge('star').click());
    await flush();
    expect(shadow().querySelector('.card')).not.toBeNull();
    const input = document.createElement('input');
    document.body.append(input);
    act(() => {
      input.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
      input.focus();
    });
    await flush(30);
    expect(shadow().querySelector('.card')).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('زر «إيقاف» في الطبقة يعيد التركيز إلى العنصر المركَّز قبل التفعيل', async () => {
    live = await mountCard();
    const star = document.querySelector<HTMLElement>('#star-btn')!;
    star.focus();
    altH(star);
    await flush();
    const stop = shadow().querySelector<HTMLButtonElement>('[data-action="stop"]')!;
    stop.focus();
    act(() => stop.click());
    await flush(20);
    expect(live.mode.active).toBe(false);
    expect(document.activeElement).toBe(star);
  });
});

describe('الطبقة لا تسرّب الضغطات إلى اختصارات GitHub', () => {
  it('حرف أو Enter أو Space أو سهم أو "?" على الشارة لا يبلغ مستمع المستند، وAlt+H يبلغه', async () => {
    live = await mountCard();
    altH();
    await flush();
    const seen: string[] = [];
    const spy = (event: Event): void => void seen.push((event as KeyboardEvent).key);
    document.addEventListener('keydown', spy);
    try {
      for (const key of ['g', 'i', 's', 't', '?', 'Enter', ' ', 'ArrowDown', 'Home']) press({ key }, badge('star'));
      expect(seen).toEqual([]);
      press({ key: 'Tab' }, badge('star'));
      press({ key: 'x', ctrlKey: true }, badge('star'));
      expect(seen).toEqual(['Tab', 'x']);
      seen.length = 0;
      altH(badge('star'));
      expect(seen).toEqual(['˙']);
    } finally {
      document.removeEventListener('keydown', spy);
    }
  });

  it('ضغطات الصفحة نفسها خارج الطبقة تبلغ مستمعاتها كما هي', async () => {
    live = await mountCard();
    altH();
    await flush();
    const spy = vi.fn();
    document.addEventListener('keydown', spy);
    try {
      press({ key: 'g' }, document.querySelector('#star-btn')!);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', spy);
    }
  });
});

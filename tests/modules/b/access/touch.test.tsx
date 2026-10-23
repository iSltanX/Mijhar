// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// TEST-A11Y-02 (AC-B5، الجزء الآلي): مؤشر لمسي وبيئة hover: none — اللمسة تفتح الشرح المثبَّت ولا شيء يُكشف بالتحويم، والأهداف أكبر في المؤشر
// الخشن، ولمسة خارج الطبقة تغلق البطاقة. اللمس الفعلي في المتصفحات (جهاز لمسي محاكى بـhasTouch وisMobile) يقيسه e2e.
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditBadges } from '../../../../src/modules/b/access';
import { BADGE_SIZE, MIN_TARGET, isCoarsePointer } from '../../../../src/modules/b/access';
import { SAMPLE, loadHtml } from '../card/helpers';
import { altH, badge, badges, flush, host, mountCard, shadow, stubMedia, tap } from './harness';
import type { Live } from './harness';

let live: Live | null = null;
let restoreMedia: (() => void) | null = null;
beforeEach(() => loadHtml(SAMPLE));
afterEach(() => {
  live?.manager.stop();
  live = null;
  restoreMedia?.();
  restoreMedia = null;
});

const size = (b: HTMLElement): number => Number.parseFloat(b.style.inlineSize);

describe('بيئة hover: none ومؤشر خشن', () => {
  it('isCoarsePointer: مؤشر خشن أو بلا تحويم يُعدّ لمسيًا، وغياب matchMedia يعني مؤشرًا دقيقًا', () => {
    expect(isCoarsePointer(undefined)).toBe(false);
    expect(isCoarsePointer({} as Window)).toBe(false);
    restoreMedia = stubMedia(['pointer: coarse']);
    expect(isCoarsePointer(window)).toBe(true);
    restoreMedia();
    restoreMedia = stubMedia(['nothing']);
    expect(isCoarsePointer(window)).toBe(false);
  });

  it('المؤشر الدقيق: شارات 20px كما سُلِّمت في MJ8', async () => {
    live = await mountCard();
    altH();
    await flush();
    expect(badges()).toHaveLength(20);
    expect(badges().every((b) => size(b) === BADGE_SIZE.fine)).toBe(true);
    expect(shadow().querySelector('.overlay')?.getAttribute('data-pointer')).toBe('fine');
  });

  it('المؤشر الخشن (لمسي): الشارات أكبر من الحد الأدنى لهدف الضغط ولا مخالفة في المدقق', async () => {
    restoreMedia = stubMedia(['hover: none']);
    live = await mountCard();
    altH();
    await flush();
    expect(badges()).toHaveLength(20);
    expect(badges().every((b) => size(b) === BADGE_SIZE.coarse && BADGE_SIZE.coarse >= MIN_TARGET)).toBe(true);
    expect(shadow().querySelector('.overlay')?.getAttribute('data-pointer')).toBe('coarse');
    expect(auditBadges(shadow(), { sizeOf: (el) => ({ width: size(el as HTMLElement), height: size(el as HTMLElement) }) })).toEqual([]);
  });

  it('أنماط الوصول تضيف touch-action وأهداف 44px للمؤشر الخشن داخل الجذر', async () => {
    live = await mountCard();
    altH();
    await flush();
    const css = [...(shadow().adoptedStyleSheets ?? [])].flatMap((sheet) => [...sheet.cssRules].map((r) => r.cssText)).join('\n') || shadow().querySelector('style')?.textContent || '';
    expect(css).toContain('touch-action: manipulation');
    expect(css).toMatch(/pointer: coarse/);
    expect(css).toMatch(/min-height: 44px/);
  });
});

describe('اللمس يفتح الشرح ويغلقه', () => {
  it('لمسة (pointerdown ثم pointerup ثم click) على الشارة تفتح البطاقة بلا تحويم قبلها', async () => {
    restoreMedia = stubMedia(['hover: none', 'pointer: coarse']);
    live = await mountCard();
    altH();
    await flush();
    const star = badge('star');
    tap(star, 'touch');
    await flush();
    expect(star.getAttribute('aria-expanded')).toBe('true');
    const card = shadow().querySelector('.card') as HTMLElement;
    expect(card.dataset.entry).toBe('star');
    expect(card.querySelector('[data-level-text]')?.textContent?.length).toBeGreaterThan(10);
  });

  it('كل شارة من العشرين تُفتح بلمسة، وكل بطاقة فيها الحقول الخمسة (لا شرح بعيد عن المتناول)', async () => {
    live = await mountCard();
    altH();
    await flush();
    for (const entry of badges().map((b) => b.dataset.entry as string)) {
      tap(badge(entry), 'touch');
      await flush();
      const card = shadow().querySelector('.card') as HTMLElement | null;
      expect(card?.dataset.entry, entry).toBe(entry);
      expect(card?.querySelectorAll('[data-section="decision"] > div'), entry).toHaveLength(5);
      tap(shadow().querySelector('[data-action="close"]')!, 'touch');
      await flush(20);
      expect(shadow().querySelector('.card'), entry).toBeNull();
    }
  });

  it('لمس شارة أخرى ينقل الشرح إليها', async () => {
    live = await mountCard();
    altH();
    await flush();
    tap(badge('star'));
    await flush();
    tap(badge('watch'));
    await flush();
    expect((shadow().querySelector('.card') as HTMLElement).dataset.entry).toBe('watch');
    expect(badge('star').getAttribute('aria-expanded')).toBe('false');
  });

  it('لمسة خارج الطبقة (على الصفحة) تغلق البطاقة، ولمسة داخلها (على الشارة أو البطاقة) لا تغلقها', async () => {
    live = await mountCard();
    altH();
    await flush();
    tap(badge('star'));
    await flush();
    const card = shadow().querySelector('.card') as HTMLElement;
    act(() => void card.dispatchEvent(new (window.PointerEvent ?? MouseEvent)('pointerdown', { bubbles: true, composed: true, pointerType: 'touch' } as PointerEventInit)));
    await flush();
    expect(shadow().querySelector('.card')).not.toBeNull();
    act(() => void document.querySelector('#readme-block, main, body')!.dispatchEvent(new (window.PointerEvent ?? MouseEvent)('pointerdown', { bubbles: true, composed: true, pointerType: 'touch' } as PointerEventInit)));
    await flush(20);
    expect(shadow().querySelector('.card')).toBeNull();
    expect(live.mode.active).toBe(true);
  });

  it('لمسة الشارة لا تنقل التركيز خارج الطبقة ولا تغيّر الصفحة: الأب المباشر للعنصر الأصلي ثابت', async () => {
    const star = document.querySelector('#star-btn')!;
    const parentBefore = star.parentNode;
    live = await mountCard();
    altH();
    await flush();
    tap(badge('star'));
    await flush();
    expect(star.parentNode).toBe(parentBefore);
    expect(host().parentNode).toBe(document.body);
  });
});

describe('لا شرح يعتمد على التحويم', () => {
  it('تحويم الفأرة أو مرور المؤشر على الشارة أو على العنصر الأصلي لا يفتح شيئًا', async () => {
    live = await mountCard();
    altH();
    await flush();
    const targets: EventTarget[] = [badge('star'), document.querySelector('#star-btn')!];
    for (const target of targets) {
      for (const type of ['mouseover', 'mouseenter', 'pointerover', 'pointerenter', 'mousemove', 'focusin']) {
        act(() => void target.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true })));
      }
    }
    await flush(20);
    expect(shadow().querySelector('.card')).toBeNull();
    expect(badges().every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true);
  });

  it('التركيز بلوحة المفاتيح على الشارة لا يفتح البطاقة وحده (الفتح بفعل صريح)', async () => {
    live = await mountCard();
    altH();
    await flush();
    act(() => badge('watch').focus());
    await flush(20);
    expect(shadow().querySelector('.card')).toBeNull();
  });
});

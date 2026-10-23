// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// TEST-GLOSS-01 (AC-B1): تفعيل وضع الشرح بالاختصار Alt+H وبزر اللوحة، ثم يظهر شرح لكل عنصر مطابق بثقة كافية، ولا يظهر لغير
// المطابق، ويظل الأب المباشر لكل عنصر أصلي كما كان، وتُعرض المصطلحات بصيغة «العربي (English)».
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LifecycleManager, ModuleRegistry, PageDetector } from '../../../../src/core';
import type { ExtensionApi } from '../../../../src/core';
import { EXPLAIN_MESSAGE, ExplainMode, createCardModule } from '../../../../src/modules/b/card';
import { SAMPLE, flush, hostsOf, loadHtml, pageHtmlWithoutHosts, parentMap, stubRects } from './helpers';

interface Setup {
  manager: LifecycleManager;
  mode: ExplainMode;
  errors: unknown[];
}

async function setup(options: { api?: ExtensionApi | null } = {}): Promise<Setup> {
  const mode = new ExplainMode();
  const errors: unknown[] = [];
  const manager = new LifecycleManager({
    registry: new ModuleRegistry([createCardModule({ mode, api: options.api ?? null, rectOf: stubRects(), debounceMs: 5 })]),
    detector: new PageDetector({ document, settleMs: 5 }),
    isEnabled: () => true,
    document,
    onError: (event) => errors.push(event),
  });
  manager.start();
  await flush(20);
  return { manager, mode, errors };
}

const host = (): HTMLElement => hostsOf('b.card')[0] as HTMLElement;
const badges = (): HTMLButtonElement[] => [...(host()?.shadowRoot?.querySelectorAll<HTMLButtonElement>('.badge') ?? [])];
const press = (init: KeyboardEventInit, target: EventTarget = document): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => void target.dispatchEvent(event));
  return event;
};
const altH = (target?: EventTarget) => press({ key: '˙', code: 'KeyH', altKey: true }, target);

let live: Setup | null = null;
beforeEach(() => loadHtml(SAMPLE));
afterEach(() => {
  live?.manager.stop();
  live = null;
});

describe('وضع الشرح بالاختصار Alt+H', () => {
  it('قبل التفعيل لا أثر في الصفحة: لا مضيف ولا تعديل', async () => {
    const before = document.documentElement.outerHTML;
    live = await setup();
    expect(hostsOf('b.card')).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
    expect(live.errors).toEqual([]);
  });

  it('Alt+H يفعّل الوضع: شارة لكل عنصر مطابق (٢٠) ولا شارة لأي شرك', async () => {
    live = await setup();
    const event = altH();
    expect(event.defaultPrevented).toBe(true);
    expect(live.mode.active).toBe(true);
    await flush();
    expect(hostsOf('b.card')).toHaveLength(1);
    expect(badges()).toHaveLength(20);
    const entries = badges().map((b) => b.dataset.entry);
    for (const id of ['star', 'watch', 'fork', 'repo-tab-settings', 'nav-search', 'readme-block', 'download_zip', 'clone_https']) expect(entries, id).toContain(id);
    for (const trap of ['delete_repo', 'archive_repo']) expect(entries).not.toContain(trap);
    // الأسماء المنطوقة بالعربي (English) وبالحساسية.
    const star = badges().find((b) => b.dataset.entry === 'star');
    expect(star?.getAttribute('aria-label')).toBe('شرح «النجمة (Star)» — آمن');
    const settings = badges().find((b) => b.dataset.entry === 'repo-tab-settings');
    expect(settings?.dataset.safety).toBe('حساس');
    expect(settings?.textContent).toBe('!');
    expect(star?.textContent).toBe('؟');
  });

  it('الأب المباشر لكل عنصر أصلي لم يتغير، والصفحة كما هي عدا مضيف مِجهَر واحد في نهاية body', async () => {
    const parents = parentMap();
    const beforeHtml = pageHtmlWithoutHosts();
    live = await setup();
    altH();
    await flush();
    expect(badges().length).toBeGreaterThan(0);
    const after = parentMap();
    expect(after.size).toBe(parents.size);
    for (const [element, parent] of parents) expect(after.get(element), element.outerHTML.slice(0, 60)).toBe(parent);
    expect(pageHtmlWithoutHosts()).toBe(beforeHtml);
    expect(host().parentNode).toBe(document.body);
    expect(document.body.lastElementChild).toBe(host());
    expect(document.querySelectorAll('mijhar-host')).toHaveLength(1);
  });

  it('Alt+H ثانيةً توقف الوضع وتُزيل الطبقة كلها فتعود الصفحة حرفيًا بلا أثر، وتعود الشارات عند التفعيل التالي', async () => {
    const before = document.documentElement.outerHTML;
    live = await setup();
    altH();
    await flush();
    expect(badges().length).toBeGreaterThan(0);
    altH();
    await flush();
    expect(live.mode.active).toBe(false);
    expect(hostsOf('b.card')).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
    altH();
    await flush();
    expect(hostsOf('b.card')).toHaveLength(1);
    expect(badges()).toHaveLength(20);
  });

  it('مراقب الصفحة ومستمعا التمرير وتغيير الحجم لا يعملون إلا والوضع مفعَّل', async () => {
    const added: string[] = [];
    const removed: string[] = [];
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, ...rest: unknown[]) => (added.push(type), (add as (...a: unknown[]) => void)(type, ...rest))) as typeof window.addEventListener;
    window.removeEventListener = ((type: string, ...rest: unknown[]) => (removed.push(type), (remove as (...a: unknown[]) => void)(type, ...rest))) as typeof window.removeEventListener;
    try {
      live = await setup();
      expect(added.filter((t) => t === 'scroll' || t === 'resize')).toEqual([]);
      altH();
      await flush();
      expect(added.filter((t) => t === 'scroll' || t === 'resize').sort()).toEqual(['resize', 'scroll']);
      altH();
      await flush();
      expect(removed.filter((t) => t === 'scroll' || t === 'resize').sort()).toEqual(['resize', 'scroll']);
    } finally {
      window.addEventListener = add as typeof window.addEventListener;
      window.removeEventListener = remove as typeof window.removeEventListener;
    }
  });

  it('لا تلتقط ضغطة داخل حقل إدخال ولا اختصارًا مختلفًا', async () => {
    live = await setup();
    const input = document.querySelector('#nav-search') as HTMLElement;
    expect(altH(input).defaultPrevented).toBe(false);
    expect(press({ code: 'KeyH', altKey: true, shiftKey: true }).defaultPrevented).toBe(false);
    expect(press({ code: 'KeyH', altKey: true, ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press({ code: 'KeyH', key: 'h' }).defaultPrevented).toBe(false);
    expect(press({ code: 'KeyH', altKey: true, repeat: true }).defaultPrevented).toBe(false);
    expect(live.mode.active).toBe(false);
  });

  it('شريط الوضع يعلن العدد ويتيح الإيقاف', async () => {
    live = await setup();
    altH();
    await flush();
    const bar = host().shadowRoot?.querySelector('[data-bar="explain-mode"]');
    expect(bar?.textContent).toContain('وضع الشرح مفعَّل');
    expect(bar?.querySelector('[data-count]')?.textContent).toBe('20');
    act(() => void bar?.querySelector<HTMLButtonElement>('[data-action="stop"]')?.click());
    expect(live.mode.active).toBe(false);
    await flush();
    expect(badges()).toHaveLength(0);
  });
});

describe('بطاقة الشارة', () => {
  it('النقر على الشارة يفتح البطاقة بصيغة «العربي (English)» والإنجليزي dir=ltr، وEscape يغلقها ويعيد التركيز', async () => {
    live = await setup();
    altH();
    await flush();
    const star = badges().find((b) => b.dataset.entry === 'star') as HTMLButtonElement;
    act(() => void star.click());
    await flush();
    const card = host().shadowRoot?.querySelector('.card') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.dataset.entry).toBe('star');
    const title = card.querySelector('h2') as HTMLElement;
    expect(title.textContent?.replace(/\s+/g, ' ').trim()).toBe('النجمة (Star)');
    expect(title.querySelector('bdi[dir="ltr"]')?.textContent).toBe('Star');
    expect(star.getAttribute('aria-expanded')).toBe('true');
    expect(host().shadowRoot?.activeElement).toBe(card);
    act(() => void card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await flush();
    expect(host().shadowRoot?.querySelector('.card')).toBeNull();
    expect(host().shadowRoot?.activeElement?.getAttribute('data-entry')).toBe('star');
  });

  it('لا تعترض البطاقة نقرات الصفحة: النقر على العنصر الأصلي يصل إليه', async () => {
    live = await setup();
    altH();
    await flush();
    const clicked = vi.fn();
    document.querySelector('#star-btn')!.addEventListener('click', clicked);
    act(() => void (document.querySelector('#star-btn') as HTMLElement).click());
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(host().style.pointerEvents || getComputedStyle(host()).pointerEvents).toBeTruthy();
  });
});

describe('الرسائل من اللوحة والدرج', () => {
  const fakeApi = () => {
    const listeners = new Set<(message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown>();
    const api = { runtime: { onMessage: { addListener: (l: never) => listeners.add(l), removeListener: (l: never) => listeners.delete(l) } } } as unknown as ExtensionApi;
    const send = (message: unknown): unknown => {
      let response: unknown;
      for (const listener of listeners) listener(message, {}, (r) => (response = r));
      return response;
    };
    return { api, send, listeners };
  };

  it('toggle وstatus وon وoff تعيد الحالة، ورسالة غريبة تُتجاهل', async () => {
    const { api, send, listeners } = fakeApi();
    live = await setup({ api });
    expect(send({ type: EXPLAIN_MESSAGE, action: 'status' })).toEqual({ active: false });
    expect(send({ type: EXPLAIN_MESSAGE, action: 'toggle' })).toEqual({ active: true });
    await flush();
    expect(badges()).toHaveLength(20);
    expect(send({ type: EXPLAIN_MESSAGE, action: 'toggle' })).toEqual({ active: false });
    expect(send({ type: EXPLAIN_MESSAGE, action: 'on' })).toEqual({ active: true });
    expect(send({ type: EXPLAIN_MESSAGE, action: 'off' })).toEqual({ active: false });
    expect(send({ type: 'other', action: 'toggle' })).toBeUndefined();
    expect(send({ type: EXPLAIN_MESSAGE, action: 'explode' })).toBeUndefined();
    expect(send('نص')).toBeUndefined();
    live.manager.stop();
    expect(listeners.size).toBe(0);
    live = null;
  });
});

describe('الإيقاف والتنقل', () => {
  it('إيقاف الوحدة وهي مفعَّلة يزيل المضيف ويعيد الصفحة حرفيًا', async () => {
    const before = document.documentElement.outerHTML;
    live = await setup();
    altH();
    await flush();
    expect(hostsOf('b.card')).toHaveLength(1);
    live.manager.stop();
    expect(hostsOf('b.card')).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
    live = null;
  });

  it('الوضع يبقى بعد إعادة تركيب الوحدة (تنقل Turbo) لأنه حالة مشتركة', async () => {
    live = await setup();
    altH();
    await flush();
    live.manager.refresh();
    await flush(20);
    expect(live.mode.active).toBe(true);
    expect(badges().length).toBeGreaterThan(0);
  });

  it('عنصر جديد يظهر في الصفحة بعد التفعيل يُشرح بعد إعادة الفحص، وعنصر أُزيل تسقط شارته', async () => {
    live = await setup();
    altH();
    await flush();
    const count = badges().length;
    const added = document.createElement('button');
    added.textContent = 'Watch';
    added.id = 'late-watch';
    document.querySelector('#repository-container-header')!.append(added);
    await flush(40);
    expect(badges()).toHaveLength(count + 1);
    added.remove();
    await flush(40);
    expect(badges()).toHaveLength(count);
  });

  it('الفتح قبل التحميل الكامل لا يكسر: وحدة بلا عناصر مطابقة لا تعرض شارات ولا تخطئ', async () => {
    document.body.innerHTML = '<main><p>لا عناصر</p></main>';
    live = await setup();
    altH();
    await flush();
    expect(badges()).toHaveLength(0);
    expect(host().shadowRoot?.querySelector('[data-count]')?.textContent).toBe('0');
    expect(live.errors).toEqual([]);
  });
});

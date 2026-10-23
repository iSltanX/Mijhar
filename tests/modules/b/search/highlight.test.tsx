// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// إبراز الموضع (AC-B6) ووحدة b.search: حلقات في طبقة عائمة واحدة بلا مساس بأي عنصر من الصفحة، تزول بـEscape أو بمهلة أو بطلب أو بإيقاف الوحدة،
// فتعود الصفحة حرفيًا. والوحدة بلا أثر قبل أول طلب، وتجيب رسائل اللوحة.
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LifecycleManager, ModuleRegistry, PageDetector } from '../../../../src/core';
import type { ExtensionApi } from '../../../../src/core';
import { ACTIVE_LOCATOR, Highlighter, LOCATE_MESSAGE, MAX_RINGS, createSearchModule } from '../../../../src/modules/b/search';
import { mountInPage } from '../../browser-context';
import { SAMPLE, flush, hostsOf, loadHtml, pageHtmlWithoutHosts, parentMap, stubRects } from '../card/helpers';

const HOST = 'b.search.highlight';
const rings = (): Element[] => [...(hostsOf(HOST)[0]?.shadowRoot?.querySelectorAll('.ring') ?? [])];

function fakeApi() {
  const listeners = new Set<(message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => unknown>();
  const api = { runtime: { onMessage: { addListener: (l: never) => listeners.add(l), removeListener: (l: never) => listeners.delete(l) } } } as unknown as ExtensionApi;
  const send = (message: unknown): unknown => {
    let response: unknown;
    for (const listener of listeners) listener(message, {}, (r) => (response = r));
    return response;
  };
  return { api, send, size: () => listeners.size };
}

let manager: LifecycleManager | null = null;
beforeEach(() => loadHtml(SAMPLE));
afterEach(() => {
  manager?.stop();
  manager = null;
  vi.useRealTimers();
});

async function mount(options: Parameters<typeof createSearchModule>[0] = {}) {
  const errors: unknown[] = [];
  manager = new LifecycleManager({
    registry: new ModuleRegistry([createSearchModule({ rectOf: stubRects(), ...options })]),
    detector: new PageDetector({ document, settleMs: 5 }),
    isEnabled: () => true,
    document,
    onError: (event) => errors.push(event),
  });
  manager.start();
  await flush(20);
  return { errors };
}

describe('وحدة b.search قبل أي طلب', () => {
  it('لا مضيف ولا تعديل في الصفحة، وتُسجَّل مستمع الرسائل وحده', async () => {
    const before = document.documentElement.outerHTML;
    const fake = fakeApi();
    const { errors } = await mount({ api: fake.api });
    expect(document.documentElement.outerHTML).toBe(before);
    expect(hostsOf(HOST)).toHaveLength(0);
    expect(fake.size()).toBe(1);
    expect(ACTIVE_LOCATOR.current).not.toBeNull();
    expect(errors).toEqual([]);
  });

  it('الإيقاف يزيل المستمع ويفرّغ المتحكم المركَّب', async () => {
    const fake = fakeApi();
    await mount({ api: fake.api });
    manager!.stop();
    manager = null;
    expect(fake.size()).toBe(0);
    expect(ACTIVE_LOCATOR.current).toBeNull();
  });
});

describe('رسائل اللوحة', () => {
  it('طلب إبراز عنصر موجود يعيد found ويرسم حلقة فوق العنصر الأصلي دون مساس بالصفحة', async () => {
    const parents = parentMap();
    const html = pageHtmlWithoutHosts();
    const fake = fakeApi();
    await mount({ api: fake.api });
    const response = fake.send({ type: LOCATE_MESSAGE, action: 'show', entryId: 'star' });
    expect(response).toEqual({ status: 'found', count: 1 });
    expect(hostsOf(HOST)).toHaveLength(1);
    expect(document.body.lastElementChild).toBe(hostsOf(HOST)[0]);
    expect(rings()).toHaveLength(1);
    expect(hostsOf(HOST)[0]!.shadowRoot!.querySelector('.ring-label')?.textContent).toBe('النجمة (Star)');
    // الأب المباشر لكل عنصر أصلي لم يتغير، والصفحة كما هي خارج المضيف.
    const after = parentMap();
    for (const [el, parent] of parents) expect(after.get(el), el.outerHTML.slice(0, 50)).toBe(parent);
    expect(pageHtmlWithoutHosts()).toBe(html);
  });

  it('غير الموجود في الصفحة: elsewhere بالمسارات وبلا حلقات؛ والمفهوم العام: concept؛ والمجهول: unknown-entry', async () => {
    const fake = fakeApi();
    await mount({ api: fake.api });
    const elsewhere = fake.send({ type: LOCATE_MESSAGE, action: 'show', entryId: 'settings-ssh-add' }) as { status: string; paths: string[] };
    expect(elsewhere.status).toBe('elsewhere');
    expect(elsewhere.paths.length).toBeGreaterThan(0);
    expect(fake.send({ type: LOCATE_MESSAGE, action: 'show', entryId: 'repository' })).toEqual({ status: 'concept' });
    expect(fake.send({ type: LOCATE_MESSAGE, action: 'show', entryId: 'ما-في-قاموس' })).toEqual({ status: 'unknown-entry' });
    expect(hostsOf(HOST)).toHaveLength(0);
  });

  it('طلب جديد يستبدل الإبراز السابق (مضيف واحد دائمًا)، وclear يزيله', async () => {
    const fake = fakeApi();
    await mount({ api: fake.api });
    fake.send({ type: LOCATE_MESSAGE, action: 'show', entryId: 'star' });
    fake.send({ type: LOCATE_MESSAGE, action: 'show', entryId: 'watch' });
    expect(hostsOf(HOST)).toHaveLength(1);
    expect(hostsOf(HOST)[0]!.shadowRoot!.querySelector('.ring-label')?.textContent).toContain('Watch');
    expect(fake.send({ type: LOCATE_MESSAGE, action: 'clear' })).toEqual({ status: 'cleared' });
    expect(hostsOf(HOST)).toHaveLength(0);
  });

  it('رسالة غريبة لا تُجاب ولا تغيّر شيئًا', async () => {
    const fake = fakeApi();
    await mount({ api: fake.api });
    expect(fake.send({ type: 'other' })).toBeUndefined();
    expect(fake.send({ type: LOCATE_MESSAGE, action: 'explode' })).toBeUndefined();
    expect(fake.send({ type: LOCATE_MESSAGE, action: 'show', entryId: 5 })).toBeUndefined();
    expect(hostsOf(HOST)).toHaveLength(0);
  });
});

describe('زوال الإبراز', () => {
  it('Escape في الصفحة يزيله', async () => {
    const fake = fakeApi();
    await mount({ api: fake.api });
    fake.send({ type: LOCATE_MESSAGE, action: 'show', entryId: 'star' });
    expect(hostsOf(HOST)).toHaveLength(1);
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(hostsOf(HOST)).toHaveLength(0);
  });

  it('المهلة تزيله (holdMs)', async () => {
    vi.useFakeTimers();
    const fake = fakeApi();
    await (async () => {
      const errors: unknown[] = [];
      manager = new LifecycleManager({
        registry: new ModuleRegistry([createSearchModule({ api: fake.api, rectOf: stubRects(), holdMs: 500 })]),
        detector: new PageDetector({ document, settleMs: 5 }),
        isEnabled: () => true,
        document,
        onError: (event) => errors.push(event),
      });
      manager.start();
      await vi.advanceTimersByTimeAsync(30);
    })();
    fake.send({ type: LOCATE_MESSAGE, action: 'show', entryId: 'star' });
    expect(hostsOf(HOST)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(hostsOf(HOST)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(hostsOf(HOST)).toHaveLength(0);
  });

  it('إيقاف الوحدة والإبراز قائم يعيد الصفحة حرفيًا بلا مضيف ولا مستمعي تمرير', async () => {
    const before = document.documentElement.outerHTML;
    const fake = fakeApi();
    await mount({ api: fake.api });
    fake.send({ type: LOCATE_MESSAGE, action: 'show', entryId: 'star' });
    manager!.stop();
    manager = null;
    expect(hostsOf(HOST)).toHaveLength(0);
    expect(document.documentElement.outerHTML).toBe(before);
  });

  it('عنصر أُزيل من الصفحة بعد الإبراز لا يُرسم له شيء ولا يكسر إعادة الرسم', async () => {
    const fake = fakeApi();
    const { errors } = await mount({ api: fake.api });
    fake.send({ type: LOCATE_MESSAGE, action: 'show', entryId: 'star' });
    document.querySelector('#star-btn')!.remove();
    act(() => void window.dispatchEvent(new Event('resize')));
    await flush(30);
    expect(rings()).toHaveLength(0);
    expect(errors).toEqual([]);
  });
});

describe('النداء المباشر (الدرج)', () => {
  it('ACTIVE_LOCATOR يحدد ويبرز كما تفعل الرسالة', async () => {
    await mount({ api: null });
    const result = ACTIVE_LOCATOR.current!.locate('fork');
    expect(result.status).toBe('found');
    expect(rings().length).toBeGreaterThanOrEqual(1);
    ACTIVE_LOCATOR.current!.clear();
    expect(hostsOf(HOST)).toHaveLength(0);
  });

  it(`الحلقات لا تتجاوز ${MAX_RINGS} والباقي يُعدّ في ملصق الإبراز`, () => {
    const { ctx, stop } = mountInPage({ id: 'x.test', title: 'اختبار', pages: '*', mount() {} }, 'https://github.com/octo/demo');
    const targets = Array.from({ length: MAX_RINGS + 5 }, (_, i) => {
      const el = document.createElement('button');
      el.textContent = `زر ${i}`;
      document.body.append(el);
      return el;
    });
    const highlighter = new Highlighter(ctx);
    highlighter.show(targets, { label: 'اختبار', rectOf: () => ({ left: 10, top: 10, width: 80, height: 24 }) });
    expect(rings()).toHaveLength(MAX_RINGS);
    expect(hostsOf(HOST)[0]!.shadowRoot!.querySelector('.ring-label')?.textContent).toBe('اختبار (+5)');
    highlighter.clear();
    expect(hostsOf(HOST)).toHaveLength(0);
    stop();
  });
});

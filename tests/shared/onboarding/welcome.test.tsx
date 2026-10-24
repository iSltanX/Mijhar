// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/42"}
// الترحيب عند أول فتح للوحة (AD-29، الإطارات P-55 وP-56a وP-58): لا يظهر إلا بحالة 'pending'، ولا يحجب التبويبات، وينتهي بـ«ابدأ» أو
// «تخطَّ» أو اختيار أي تبويب أو طلب تبويب من خارج اللوحة، ولا يعود بعد انتهائه؛ و«جولة الترحيب» في الإعدادات تعيده؛ ولا يعرض ميزة لم
// تُنفَّذ كأنها تعمل، ولا حقل إدخال فيه (يُرسم في الدرج أيضًا).
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PANEL_REQUEST_KEY, WELCOME_KEY } from '../../../src/core';
import { OPTIONAL_CONNECTIONS, WELCOME_FEATURES } from '../../../src/shared/onboarding/content';
import type { OptionalConnection } from '../../../src/shared/onboarding/content';
import { Welcome } from '../../../src/shared/onboarding/Welcome';
import { PanelApp } from '../../../src/sidepanel/PanelApp';
import type { PanelView } from '../../../src/sidepanel/views';
import { flush, memorySettings } from '../../core/ui-host/helpers';

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  container.className = 'mj-root';
  container.setAttribute('dir', 'rtl');
  document.body.append(container);
});
afterEach(() => {
  render(null, container);
  container.remove();
});

const settle = async () => {
  await act(async () => {
    await flush(5);
  });
};
const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const el = container.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};
const click = async (selector: string) => {
  act(() => $(selector).click());
  await settle();
};
const VIEWS: readonly PanelView[] = [{ id: 'fake-context', tab: 'context', unit: 'd', title: 'وهمية', component: () => <p data-fake-context="">محتوى السياق</p> }];

async function mount(state?: 'pending' | 'done', extra: { openOptionsAt?: (t: string) => void; surface?: 'native' | 'drawer' } = {}) {
  const { settings, reopen } = await memorySettings();
  if (state) await settings.set(WELCOME_KEY, state);
  act(() =>
    render(<PanelApp surface={extra.surface ?? 'native'} settings={settings} views={VIEWS} {...(extra.openOptionsAt ? { openOptionsAt: extra.openOptionsAt as never } : {})} />, container),
  );
  await settle();
  return { settings, reopen };
}

describe('متى يظهر الترحيب', () => {
  it('المخزن الجديد بلا حالة ترحيب (اختبارات الوحدات وتحديث الإضافة): لا ترحيب، والمحتوى كما كان', async () => {
    const { settings } = await mount();
    expect(settings.get(WELCOME_KEY)).toBe('done');
    expect(container.querySelector('.welcome')).toBeNull();
    expect(container.querySelector('[data-fake-context]')).not.toBeNull();
  });

  it("'pending': الترحيب مكان المحتوى والتبويبات الخمسة ظاهرة، بلا حقل إدخال، وأولى خطواته تعدّد ما يعمل بلا إعداد", async () => {
    await mount('pending');
    expect($('.welcome').getAttribute('data-welcome-step')).toBe('1');
    expect($('.panel-app').hasAttribute('data-welcome')).toBe(true);
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(5);
    expect(container.querySelector('[data-fake-context]')).toBeNull();
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect([...container.querySelectorAll('.feature strong')].map((e) => e.textContent)).toEqual(WELCOME_FEATURES.map((f) => f.title));
    expect($('#mj-welcome-title').textContent).toBe('أهلًا بك في مِجهَر');
  });
});

describe('الخطوة الثانية: الاتصالات الاختيارية', () => {
  it('«التالي» ينقل التركيز إلى عنوانها؛ الرمز متاح وله دليل، ومفتاح المزوّد متاح (MJ21) برابط «لماذا المفتاح؟» ووجهته', async () => {
    const openOptionsAt = vi.fn();
    await mount('pending', { openOptionsAt });
    await click('[data-action="welcome-next"]');
    expect($('.welcome').getAttribute('data-welcome-step')).toBe('2');
    expect(document.activeElement?.id).toBe('mj-welcome-title');
    const token = $('[data-connection="github-token"]');
    const key = $('[data-connection="provider-key"]');
    expect(token.getAttribute('data-status')).toBe('available');
    expect(token.querySelector('[data-action="guide-github-token"]')?.textContent).toContain('كيف أحصل على الرمز؟');
    expect(key.getAttribute('data-status')).toBe('available');
    expect(key.textContent).toContain('يُرسل ما توافق عليه إلى Anthropic وحدها');
    expect(key.textContent).not.toMatch(/سعر|تكلف|دولار|مجاني|تدفع/);
    await click('[data-action="guide-provider-key"]');
    expect(openOptionsAt).toHaveBeenLastCalledWith('guide/provider-key');
  });

  it('AC-E9 (٨): الترحيب لا يذكر المزوّد قبل طبقة التحليل («لم يُتح بعد» بلا رابط)، ويذكره بعدها برابط شرحه', async () => {
    const token = OPTIONAL_CONNECTIONS.find((c) => c.id === 'github-token') as OptionalConnection;
    const after = OPTIONAL_CONNECTIONS.find((c) => c.id === 'provider-key') as OptionalConnection;
    // قبل MJ21 كما كان في الترحيب المدمج (AD-29): «لم يُتح بعد» بلا حقائق ولا رابط.
    const before: OptionalConnection = { id: 'provider-key', icon: 'message', title: 'مفتاح مزوّد التحليل', text: 'تضيفه طبقة التحليل في تحديث لاحق.', status: 'not-yet', facts: [] };
    const show = async (connections: readonly OptionalConnection[]) => {
      act(() => render(<Welcome onDone={() => {}} openOptions={() => {}} connections={connections} />, container));
      await settle();
      await click('[data-action="welcome-next"]');
      return $('[data-connection="provider-key"]');
    };
    const was = await show([token, before]);
    expect(was.getAttribute('data-status')).toBe('not-yet');
    expect(was.textContent).toContain('لم يُتح بعد');
    expect(was.textContent).not.toMatch(/Anthropic/);
    expect(was.querySelector('[data-action="guide-provider-key"]')).toBeNull();
    render(null, container);
    const now = await show([token, after]);
    expect(now.getAttribute('data-status')).toBe('available');
    expect(now.textContent).toMatch(/Anthropic/);
    expect(now.querySelector('[data-action="guide-provider-key"]')?.textContent).toContain('لماذا المفتاح؟');
    expect(after.guide?.target).toBe('guide/provider-key');
  });

  it('«كيف أحصل على الرمز؟» يفتح الدليل ولا ينهي الترحيب؛ و«اربط الرمز من الإعدادات» يفتح قسم الرمز وينهيه', async () => {
    const openOptionsAt = vi.fn();
    const { settings } = await mount('pending', { openOptionsAt });
    await click('[data-action="welcome-next"]');
    await click('[data-action="guide-github-token"]');
    expect(openOptionsAt).toHaveBeenLastCalledWith('guide/github-token');
    expect(settings.get(WELCOME_KEY)).toBe('pending');
    await click('[data-action="welcome-setup"]');
    expect(openOptionsAt).toHaveBeenLastCalledWith('token');
    expect(settings.get(WELCOME_KEY)).toBe('done');
    expect(container.querySelector('.welcome')).toBeNull();
  });

  it('دون فاتح للإعدادات لا تظهر أزرار الإعدادات والشرح (لا زر ميت)', async () => {
    await mount('pending');
    await click('[data-action="welcome-next"]');
    expect(container.querySelector('[data-action="welcome-setup"]')).toBeNull();
    expect(container.querySelector('[data-action="guide-github-token"]')).toBeNull();
  });

  it('«السابق» يعود إلى الأولى', async () => {
    await mount('pending');
    await click('[data-action="welcome-next"]');
    await click('[data-action="welcome-back"]');
    expect($('.welcome').getAttribute('data-welcome-step')).toBe('1');
    expect(document.activeElement?.id).toBe('mj-welcome-title');
  });
});

describe('إنهاء الترحيب وعدم تكراره', () => {
  for (const [name, steps] of [
    ['«تخطَّ وابدأ الاستخدام»', ['[data-action="welcome-skip"]']],
    ['«ابدأ الاستخدام»', ['[data-action="welcome-next"]', '[data-action="welcome-done"]']],
  ] as const) {
    it(`${name} يكتب 'done' ويُظهر التبويب، ولا يعود في فتح تالٍ`, async () => {
      const { settings, reopen } = await mount('pending');
      for (const step of steps) await click(step);
      expect(settings.get(WELCOME_KEY)).toBe('done');
      expect(container.querySelector('[data-fake-context]')).not.toBeNull();
      expect((await reopen()).get(WELCOME_KEY)).toBe('done');
      render(null, container);
      await mount();
      expect(container.querySelector('.welcome')).toBeNull();
    });
  }

  it('اختيار أي تبويب ينهيه ويفتح التبويب المختار', async () => {
    const { settings } = await mount('pending');
    await click('#mj-native-tab-glossary');
    expect(settings.get(WELCOME_KEY)).toBe('done');
    expect($('#mj-native-tab-glossary').getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('.welcome')).toBeNull();
  });

  it('طلب تبويب من خارج اللوحة (Alt+K) ينهيه وينقل إلى التبويب', async () => {
    const { settings } = await mount('pending');
    await act(async () => {
      await settings.set(PANEL_REQUEST_KEY, { tab: 'glossary', at: Date.now() });
      await flush(5);
    });
    await settle();
    expect(settings.get(WELCOME_KEY)).toBe('done');
    expect($('#mj-native-tab-glossary').getAttribute('aria-selected')).toBe('true');
  });

  it('«جولة الترحيب» في تبويب الإعدادات تعيده من أوله', async () => {
    const { settings } = await mount();
    await click('#mj-native-tab-settings');
    await click('[data-action="welcome-replay"]');
    expect(settings.get(WELCOME_KEY)).toBe('pending');
    expect($('.welcome').getAttribute('data-welcome-step')).toBe('1');
  });
});

describe('الدرج داخل صفحة GitHub', () => {
  it('الترحيب ودليل الرمز في إعدادات الدرج أزرار فقط، بلا حقل ولا رابط إلى صفحة خارجية', async () => {
    const openOptionsAt = vi.fn();
    await mount('pending', { surface: 'drawer', openOptionsAt });
    await click('[data-action="welcome-next"]');
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect(container.querySelectorAll('a[href^="http"]')).toHaveLength(0);
    await click('[data-action="welcome-skip"], [data-action="welcome-done"]');
    await click('#mj-drawer-tab-settings');
    await click('[data-action="token-guide-help"]');
    expect(openOptionsAt).toHaveBeenLastCalledWith('guide/github-token');
  });
});

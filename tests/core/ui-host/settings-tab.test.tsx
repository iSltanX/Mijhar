// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/42"}
// TEST-CORE-06 (AC-1.4) على مستوى الوحدة: مفاتيح الوحدات الثماني تعمل وتُحفظ وتُسترجع بعد «إعادة التحميل» وتركّب وتزيل
// وحدة وهمية؛ وصلاحية api.github.com لا تُطلب إلا بنقر صريح وتُعرض حالتها وتُسحب؛ والاختصار يُعرض ويُعاد ربطه.
// والجزء الفعلي في المتصفحات الأربعة في tests/core/ui-host/browser.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_GITHUB_ORIGIN, ApiGithubPermission, LifecycleManager, ModuleRegistry, PageDetector, SURFACE_KEY, UNITS, bindModuleToggles, isModuleEnabled, moduleEnabledKey } from '../../../src/core';
import { SettingsTab } from '../../../src/options/SettingsTab';
import type { SettingsSection } from '../../../src/options/sections';
import { PanelApp } from '../../../src/sidepanel/PanelApp';
import type { PanelView } from '../../../src/sidepanel/views';
import { fakeUnitModules, mountedFakeUnits } from './fake-modules';
import { fakePermissions, flush, loadIntoDocument, memorySettings } from './helpers';

let container: HTMLElement;
beforeEach(() => {
  loadIntoDocument('pages/pr.html');
  container = document.createElement('div');
  container.className = 'mj-root';
  container.setAttribute('dir', 'rtl');
  document.body.append(container);
});
afterEach(() => render(null, container));

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const el = container.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};
const settle = async () => {
  await act(async () => {
    await flush(5);
  });
};

describe('مفاتيح الوحدات الثماني', () => {
  it('ثمانية مفاتيح بأسماء الوحدات، كلها مفعَّلة افتراضيًا ومسمّاة لقارئ الشاشة', async () => {
    const { settings } = await memorySettings();
    act(() => render(<SettingsTab settings={settings} surface="options" />, container));
    const toggles = [...container.querySelectorAll<HTMLInputElement>('[data-section="units"] input[role="switch"]')];
    expect(toggles).toHaveLength(8);
    expect(toggles.map((t) => t.checked)).toEqual(Array(8).fill(true));
    expect(toggles.map((t) => t.getAttribute('aria-label'))).toEqual(UNITS.map((u) => `الوحدة (${u.letter}): ${u.title}`));
    for (const toggle of toggles) expect(container.querySelector(`label[for="${toggle.id}"]`)).not.toBeNull();
  });

  it('كل مفتاح من الثمانية: يُحفظ، ويُسترجع بعد إعادة الفتح، ويركّب ويزيل وحدته في الصفحة المفتوحة', async () => {
    const { area, settings, reopen } = await memorySettings();
    // سياقان: صفحة الإعدادات (هنا) وسكربت المحتوى (إعدادات مفتوحة على المنطقة نفسها ومدير دورة حياة).
    const content = await reopen();
    const manager = new LifecycleManager({ registry: new ModuleRegistry(fakeUnitModules()), detector: new PageDetector({ document, settleMs: 1 }), document, isEnabled: (id) => isModuleEnabled(content, id) });
    act(() => manager.start());
    bindModuleToggles(content, manager);
    act(() => render(<SettingsTab settings={settings} surface="options" />, container));
    expect(mountedFakeUnits(document)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);

    const expected = new Set(UNITS.map((u) => u.id));
    for (const unit of UNITS) {
      act(() => $<HTMLInputElement>(`#mj-unit-${unit.id}`).click());
      await settle();
      expected.delete(unit.id);
      expect(settings.get(moduleEnabledKey(unit.id)), unit.id).toBe(false);
      expect(content.get(moduleEnabledKey(unit.id)), `وصل إلى سياق المحتوى: ${unit.id}`).toBe(false);
      expect(mountedFakeUnits(document), `أُزيلت ${unit.id}`).toEqual([...expected].sort());
    }
    // «إعادة التحميل»: سياق جديد على التخزين نفسه يجد القيم المحفوظة.
    const reloaded = await reopen();
    expect(UNITS.map((u) => reloaded.get(moduleEnabledKey(u.id)))).toEqual(Array(8).fill(false));
    expect(Object.keys(await area.get(null)).filter((k) => k.includes('modules.'))).toHaveLength(8);

    for (const unit of UNITS) {
      act(() => $<HTMLInputElement>(`#mj-unit-${unit.id}`).click());
      await settle();
      expected.add(unit.id);
      expect(mountedFakeUnits(document), `رُكّبت ${unit.id}`).toEqual([...expected].sort());
    }
    manager.stop();
  });

  it('فشل الحفظ يعرض رسالة ويعيد المفتاح إلى قيمته الفعلية', async () => {
    const { area, settings } = await memorySettings();
    act(() => render(<SettingsTab settings={settings} surface="options" />, container));
    area.beforeWrite = () => {
      throw new Error('القرص ممتلئ');
    };
    act(() => $<HTMLInputElement>('#mj-unit-c').click());
    await settle();
    expect($('[data-section="units"] [role="alert"]').textContent).toContain('القرص ممتلئ');
    expect($<HTMLInputElement>('#mj-unit-c').checked).toBe(true);
    expect(settings.get(moduleEnabledKey('c'))).toBe(true);
  });

  it('مكان اللوحة: اختيار الدرج يُحفظ', async () => {
    const { settings } = await memorySettings();
    act(() => render(<SettingsTab settings={settings} surface="native" />, container));
    act(() => $<HTMLInputElement>('input[name="mj-surface"][value="drawer"]').click());
    await settle();
    expect(settings.get(SURFACE_KEY)).toBe('drawer');
    expect($<HTMLInputElement>('input[name="mj-surface"][value="native"]').checked).toBe(false);
  });
});

describe('صلاحية api.github.com الاختيارية', () => {
  it('تُعرض «غير ممنوحة» ولا تُطلب بالرسم ولا بتبديل المفاتيح؛ النقر يطلبها مرة متزامنًا داخل معالجه', async () => {
    const api = fakePermissions();
    const { settings } = await memorySettings();
    act(() => render(<SettingsTab settings={settings} surface="options" permission={new ApiGithubPermission(api)} />, container));
    await settle();
    expect($('[data-permission-state]').getAttribute('data-permission-state')).toBe('denied');
    expect($('[data-permission-state]').textContent).toBe('غير ممنوحة');
    act(() => $<HTMLInputElement>('#mj-unit-a').click());
    await settle();
    expect(api.request).not.toHaveBeenCalled();

    let calledDuringClick = false;
    const button = $<HTMLButtonElement>('[data-action="grant"]');
    button.addEventListener('click', () => (calledDuringClick = api.request.mock.calls.length === 1));
    act(() => button.click());
    expect(calledDuringClick).toBe(true);
    await settle();
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(api.request).toHaveBeenCalledWith({ origins: [API_GITHUB_ORIGIN] });
    expect($('[data-permission-state]').textContent).toBe('ممنوحة');
  });

  it('رفض المستخدم يبقيها «غير ممنوحة» برسالة، والسحب يعيدها، والسحب من إعدادات المتصفح يظهر هنا', async () => {
    const api = fakePermissions();
    api.answer = false;
    const { settings } = await memorySettings();
    act(() => render(<SettingsTab settings={settings} surface="native" permission={new ApiGithubPermission(api)} />, container));
    await settle();
    act(() => $<HTMLButtonElement>('[data-action="grant"]').click());
    await settle();
    expect($('[data-permission-state]').textContent).toBe('غير ممنوحة');
    expect($('[data-section="permission"] [role="alert"]').textContent).toBe('لم تُمنح الصلاحية.');

    act(() => api.external('added', { origins: [API_GITHUB_ORIGIN] }));
    expect($('[data-permission-state]').textContent).toBe('ممنوحة');
    act(() => $<HTMLButtonElement>('[data-action="revoke"]').click());
    await settle();
    expect(api.remove).toHaveBeenCalledWith({ origins: [API_GITHUB_ORIGIN] });
    expect($('[data-permission-state]').textContent).toBe('غير ممنوحة');

    act(() => api.external('added', { origins: [API_GITHUB_ORIGIN] }));
    act(() => api.external('removed', { origins: [API_GITHUB_ORIGIN] }));
    expect($('[data-permission-state]').textContent).toBe('غير ممنوحة');
  });

  it('الدرج: لا زر طلب ولا سحب، بل زر يفتح صفحة الإعدادات', async () => {
    const { settings } = await memorySettings();
    const openOptions = vi.fn();
    act(() => render(<SettingsTab settings={settings} surface="drawer" openOptions={openOptions} />, container));
    expect(container.querySelector('[data-action="grant"], [data-action="revoke"]')).toBeNull();
    act(() => $<HTMLButtonElement>('[data-action="open-options"]').click());
    expect(openOptions).toHaveBeenCalledTimes(1);
  });
});

describe('الاختصار وأقسام الوحدات', () => {
  it('يعرض اختصار toggle-panel ويفتح إعدادات الاختصارات، ويعرض «لا اختصار» حين يُلغى', async () => {
    const { settings } = await memorySettings();
    const getAll = vi.fn(async () => [{ name: 'toggle-panel', shortcut: '⌥G' }]);
    const openSettings = vi.fn();
    act(() => render(<SettingsTab settings={settings} surface="options" shortcuts={{ getAll, openSettings }} />, container));
    await settle();
    expect($('[data-section="shortcut"] kbd').textContent).toBe('⌥G');
    act(() => $<HTMLButtonElement>('[data-action="shortcuts"]').click());
    expect(openSettings).toHaveBeenCalledTimes(1);
    getAll.mockResolvedValue([{ name: 'toggle-panel', shortcut: '' }]);
    act(() => void window.dispatchEvent(new Event('focus')));
    await settle();
    expect($('[data-section="shortcut"] [data-shortcut]').textContent).toBe('لا اختصار مضبوط الآن لفتح اللوحة.');
  });

  it('قسم وحدة لا يبلغ الدرج إلا إن طلب ذلك صراحةً', async () => {
    const { settings } = await memorySettings();
    const sections: SettingsSection[] = [
      { id: 'secret', unit: 'd', title: 'رمز الوصول', component: () => <input type="password" /> },
      { id: 'public', unit: 'a', title: 'عتبة الاتجاه', surfaces: ['options', 'native', 'drawer'], component: ({ unitEnabled }) => <p data-unit-enabled={String(unitEnabled)}>عتبة</p> },
    ];
    act(() => render(<SettingsTab settings={settings} surface="drawer" sections={sections} />, container));
    expect(container.querySelector('[data-section="module-secret"]')).toBeNull();
    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect($('[data-section="module-public"] [data-unit-enabled]').textContent).toBe('عتبة');
    act(() => render(<SettingsTab settings={settings} surface="options" sections={sections} />, container));
    expect(container.querySelector('[data-section="module-secret"]')).not.toBeNull();
  });
});

describe('PanelApp', () => {
  it('خمسة تبويبات، والأسهم تتنقل باتجاه RTL، وكل تبويب محتوى فارغ يقول ما سيظهر فيه', async () => {
    const { settings } = await memorySettings();
    act(() => render(<PanelApp surface="native" settings={settings} views={[]} />, container));
    const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs()).toHaveLength(5);
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    expect($('[data-empty-tab="context"]').textContent).toContain('لا شيء هنا بعد');
    act(() => tabs()[0]!.focus());
    act(() => void tabs()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(tabs()[1]!.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tabs()[1]);
    act(() => void tabs()[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })));
    expect(tabs()[4]!.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-section="units"]')).not.toBeNull();
    expect($('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe(tabs()[4]!.id);
  });

  it('واجهة وحدة مسجّلة تظهر في تبويبها، وتُستبدل برسالة حين تُوقف وحدتها', async () => {
    const { settings } = await memorySettings();
    const views: PanelView[] = [{ id: 'notes-list', tab: 'notes', unit: 'g', title: 'ملاحظاتي', component: () => <p class="view">قائمة الملاحظات</p> }];
    act(() => render(<PanelApp surface="drawer" settings={settings} views={views} initialTab="notes" />, container));
    expect($('.view').textContent).toBe('قائمة الملاحظات');
    await act(async () => {
      await settings.set(moduleEnabledKey('g'), false);
    });
    expect(container.querySelector('.view')).toBeNull();
    expect($('.empty').textContent).toContain('الوحدة (ز) موقوفة');
  });
});

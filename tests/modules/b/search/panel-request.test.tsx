// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// طلب تبويب من خارج اللوحة (أمر فتح القاموس): اللوحة المفتوحة حديثًا تقرأ الطلب الحديث وتختار تبويبه، والمفتوحة بالفعل تلاحظ تغيّره، ويُطبَّق مرة
// لكل طلب فلا يسحب المستخدم بعد تنقله. القديم والمجهول لا يُطبَّق. وتبويب القاموس يعرض واجهة البحث وبجوارها زر وضع الشرح.
import { act } from 'preact/test-utils';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStorageArea, PANEL_REQUEST_KEY, SettingsStore, Store, createSettingsRegistry, requestPanelTab } from '../../../../src/core';
import { defineSectionSettings } from '../../../../src/options/sections';
import { PanelApp } from '../../../../src/sidepanel/PanelApp';
import { flush } from '../card/helpers';

const open = async (): Promise<SettingsStore> => {
  const area = new MemoryStorageArea();
  return SettingsStore.open(await Store.open({ area, changes: area, locks: null }), createSettingsRegistry((registry) => defineSectionSettings(registry)));
};

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
});
afterEach(() => {
  act(() => void render(null, container));
  container.remove();
});

const selected = (): string => container.querySelector('[role="tab"][aria-selected="true"]')!.id.replace(/^.*-tab-/, '');
const mount = async (settings: SettingsStore, surface: 'native' | 'drawer' = 'native'): Promise<void> => {
  await act(async () => {
    render(<PanelApp surface={surface} settings={settings} />, container);
    await flush();
  });
};

describe('PanelApp وطلب التبويب', () => {
  it('اللوحة المفتوحة حديثًا بطلب حديث تبدأ على تبويب القاموس وفيها خانة البحث', async () => {
    const settings = await open();
    await requestPanelTab(settings, 'glossary');
    await mount(settings);
    expect(selected()).toBe('glossary');
    expect(container.querySelector('[data-view="glossary-search"]')).not.toBeNull();
    expect(container.querySelector('[data-view="explain-toggle"]')).not.toBeNull();
    expect(document.activeElement?.id).toBe('mj-gs-input');
  });

  it('اللوحة المفتوحة بالفعل تلاحظ طلبًا جديدًا فتنتقل إلى القاموس وتركّز الخانة', async () => {
    const settings = await open();
    await mount(settings);
    expect(selected()).toBe('context');
    await act(async () => {
      await requestPanelTab(settings, 'glossary');
      await flush();
    });
    expect(selected()).toBe('glossary');
    expect(document.activeElement?.id).toBe('mj-gs-input');
  });

  it('الطلب يُطبَّق مرة: تنقّل المستخدم بعده لا يُعاد إلى القاموس', async () => {
    const settings = await open();
    await requestPanelTab(settings, 'glossary');
    await mount(settings);
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[role="tab"]#mj-native-tab-notes')!.click();
      await flush();
    });
    expect(selected()).toBe('notes');
    // إعادة رسم بلا طلب جديد لا تسحبه.
    await act(async () => {
      await settings.set('ui.surface', 'drawer');
      await flush();
    });
    expect(selected()).toBe('notes');
  });

  it('طلب قديم (أكثر من المهلة) أو لتبويب مجهول لا يُطبَّق', async () => {
    const settings = await open();
    await settings.set(PANEL_REQUEST_KEY, { tab: 'glossary', at: Date.now() - 60_000 });
    await mount(settings);
    expect(selected()).toBe('context');
    await act(async () => {
      await requestPanelTab(settings, 'لا-يوجد');
      await flush();
    });
    expect(selected()).toBe('context');
  });

  it('طلب تبويب الإعدادات يُطبَّق أيضًا', async () => {
    const settings = await open();
    await mount(settings);
    await act(async () => {
      await requestPanelTab(settings, 'settings');
      await flush();
    });
    expect(selected()).toBe('settings');
  });

  it('الدرج المحقون بلا حقول إدخال (DEC-04): تبويب القاموس فيه بيان يدل على اللوحة الأصلية بدل خانة البحث، وفيه زر وضع الشرح', async () => {
    const settings = await open();
    await requestPanelTab(settings, 'glossary');
    await mount(settings, 'drawer');
    expect(selected()).toBe('glossary');
    expect(container.querySelector('[data-native-only="البحث في القاموس"]')).not.toBeNull();
    expect(container.querySelector('[data-view="glossary-search"]')).toBeNull();
    expect([...container.querySelectorAll('input, textarea, select, [contenteditable]')].filter((el) => !['checkbox', 'radio'].includes((el as HTMLInputElement).type))).toEqual([]);
    expect(container.querySelector('[data-view="explain-toggle"]')).not.toBeNull();
    expect(container.textContent).toContain('Alt+K');
  });

  it('الدرج داخل الصفحة يتبع الطلب نفسه (الإعدادات مشتركة بين السياقات)', async () => {
    const settings = await open();
    await mount(settings, 'drawer');
    await act(async () => {
      await requestPanelTab(settings, 'glossary');
      await flush();
    });
    expect(selected()).toBe('glossary');
  });
});

// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo/pull/42"}
// الدرج داخل الصفحة: الإنشاء عند الطلب، والفتح والإغلاق وEscape وإعادة التركيز، والبقاء بعد تنقل Turbo، وخلوّه من
// أي حقل لسرّ (جزء من TEST-CORE-05). العرض الفعلي في الطبقة العليا يُقاس في المتصفحات الأربعة.
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DRAWER_OPEN_ATTR, Drawer, HOST_ATTR } from '../../../src/core';
import { PanelApp } from '../../../src/sidepanel/PanelApp';
import { loadIntoDocument, memorySettings } from './helpers';

let drawer: Drawer | null = null;
beforeEach(() => loadIntoDocument('pages/pr.html'));
afterEach(() => {
  drawer?.dispose();
  drawer = null;
});

const simpleDrawer = (onChange?: (open: boolean) => void) => {
  drawer = new Drawer({ document, content: () => <p class="probe">محتوى</p>, ...(onChange ? { onChange } : {}) });
  return drawer;
};

describe('Drawer', () => {
  it('لا يُنشئ شيئًا قبل أول فتح، ثم يلحق بـ<html> لا بـ<body>', () => {
    const d = simpleDrawer();
    expect(d.host).toBeNull();
    expect(document.querySelector('mijhar-host')).toBeNull();
    act(() => d.open());
    expect(d.host?.parentElement).toBe(document.documentElement);
    expect(d.host?.getAttribute(HOST_ATTR)).toBe('drawer');
    expect(d.host?.hasAttribute(DRAWER_OPEN_ATTR)).toBe(true);
    expect(d.host?.shadowRoot?.querySelector('aside.drawer .probe')?.textContent).toBe('محتوى');
  });

  it('الفتح ينقل التركيز إلى عنوان الدرج، وEscape يغلقه ويعيد التركيز إلى ما كان عليه', () => {
    const changes: boolean[] = [];
    const d = simpleDrawer((open) => changes.push(open));
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    act(() => d.open());
    const shadow = d.host!.shadowRoot!;
    expect(shadow.activeElement?.id).toBe('mj-drawer-title');
    shadow.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true }));
    expect(d.isOpen).toBe(false);
    expect(d.host?.hasAttribute(DRAWER_OPEN_ATTR)).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(changes).toEqual([true, false]);
  });

  it('زر الإغلاق يغلقه، وtoggle يبدّل، وفتح المفتوح لا يكرر شيئًا', () => {
    const onChange = vi.fn();
    const d = simpleDrawer(onChange);
    act(() => d.toggle());
    act(() => d.open());
    expect(onChange).toHaveBeenCalledTimes(1);
    (d.host!.shadowRoot!.querySelector('button[aria-label="إغلاق الدرج"]') as HTMLButtonElement).click();
    expect(d.isOpen).toBe(false);
    act(() => d.toggle());
    expect(d.isOpen).toBe(true);
    expect(document.querySelectorAll('mijhar-host')).toHaveLength(1);
  });

  it('يبقى بعد استبدال body (تنقل Turbo)، ويعود إن أُزيل من المستند', () => {
    const d = simpleDrawer();
    act(() => d.open());
    const host = d.host!;
    document.documentElement.replaceChild(document.createElement('body'), document.body);
    expect(host.isConnected).toBe(true);
    act(() => d.close());
    host.remove();
    act(() => d.open());
    expect(host.isConnected).toBe(true);
    expect(d.isOpen).toBe(true);
  });

  it('dispose يزيله من المستند', () => {
    const d = simpleDrawer();
    act(() => d.open());
    d.dispose();
    expect(document.querySelector('mijhar-host')).toBeNull();
    drawer = null;
  });
});

describe('محتوى الدرج الحقيقي (PanelApp في الدرج)', () => {
  it('لا حقل نص ولا كلمة مرور في أي تبويب من الخمسة، ولا زر طلب صلاحية', async () => {
    const { settings } = await memorySettings();
    const openOptions = vi.fn();
    drawer = new Drawer({ document, content: () => <PanelApp surface="drawer" settings={settings} views={[]} openOptions={openOptions} /> });
    act(() => drawer!.open());
    const shadow = drawer.host!.shadowRoot!;
    const tabs = [...shadow.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    // الاسم المقروء كامل كما في EXECUTION_PLAN.md ‏5، والمكتوب على التبويب مختصر ليتسع في عرض الدرج.
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(['السياق والفحوص', 'القاموس والتعلّم', 'ملاحظاتي وأكمل لاحقًا', 'المجتمع وأول مساهمة', 'الإعدادات والخصوصية']);
    expect(tabs.map((t) => t.textContent)).toEqual(['السياق', 'القاموس', 'ملاحظاتي', 'المجتمع', 'الإعدادات']);
    for (const tab of tabs) {
      act(() => tab.click());
      expect(shadow.querySelector('[role="tabpanel"] > h2.panel-title')?.textContent).toBe(tab.getAttribute('aria-label'));
      const fields = [...shadow.querySelectorAll('input, textarea, [contenteditable]')].filter((el) => !(el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)));
      expect(fields, tab.textContent ?? '').toEqual([]);
    }
    expect(shadow.querySelector('[data-action="grant"]')).toBeNull();
    (shadow.querySelector('[data-action="open-options"]') as HTMLButtonElement).click();
    expect(openOptions).toHaveBeenCalledTimes(1);
  });
});

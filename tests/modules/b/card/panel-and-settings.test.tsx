// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// زر وضع الشرح في اللوحة والدرج (AC-B1: بزر في شريط الإضافة)، وأقسام إعدادات الوحدتين (ب) و(د): مفاتيح الوحدات البرمجية تحكم
// تركيبها عبر isModuleEnabled، وتظهر في صفحة الإعدادات واللوحة، ولا حقل سرّ ولا طلب صلاحية فيها.
import { act } from 'preact/test-utils';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorageArea, SettingsStore, Store, createSettingsRegistry, isModuleEnabled } from '../../../../src/core';
import type { ExtensionApi } from '../../../../src/core';
import { SettingsTab } from '../../../../src/options/SettingsTab';
import { SETTINGS_SECTIONS, defineSectionSettings } from '../../../../src/options/sections';
import { PanelApp } from '../../../../src/sidepanel/PanelApp';
import { PANEL_VIEWS } from '../../../../src/sidepanel/views';
import { EXPLAIN_MESSAGE, ExplainMode, ExplainToggleViewForTest } from './panel-exports';
import { flush } from './helpers';

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

const button = () => container.querySelector<HTMLButtonElement>('[data-action="toggle-explain"]') as HTMLButtonElement;

describe('زر وضع الشرح (الدرج: الحالة المشتركة مباشرة)', () => {
  it('يفعّل الوضع ويوقفه، ويتبع تغيّره من الاختصار', async () => {
    const settings = await open();
    const mode = new ExplainMode();
    act(() => render(<ExplainToggleViewForTest settings={settings} mode={mode} />, container));
    await act(() => flush());
    expect(button().textContent).toBe('فعّل وضع الشرح');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    await act(async () => {
      button().click();
      await flush();
    });
    expect(mode.active).toBe(true);
    expect(button().textContent).toBe('أوقف وضع الشرح');
    expect(button().getAttribute('aria-pressed')).toBe('true');
    // تغيّر من خارج الواجهة (الاختصار) ينعكس عليها.
    await act(() => void mode.set(false));
    expect(button().textContent).toBe('فعّل وضع الشرح');
    expect(container.textContent).toContain('Alt+H');
  });

  it('بطاقة الشرح موقوفة: الزر معطّل وتنبيه يدلّ على المفتاح', async () => {
    const settings = await open();
    await settings.set('modules.b.card.enabled', false);
    act(() => render(<ExplainToggleViewForTest settings={settings} mode={new ExplainMode()} />, container));
    await act(() => flush());
    expect(button().disabled).toBe(true);
    expect(container.querySelector('[data-notice="disabled"]')?.textContent).toContain('موقوفة');
  });
});

describe('زر وضع الشرح (اللوحة الأصلية: رسائل إلى التبويب النشط)', () => {
  const fakeApi = (reply: (message: { type: string; action: string }) => unknown, tabs: Array<{ id?: number }> = [{ id: 7 }]) => {
    const sent: Array<{ tabId: number; message: { type: string; action: string } }> = [];
    const api = {
      runtime: {},
      tabs: {
        query: vi.fn(async () => tabs),
        sendMessage: vi.fn(async (tabId: number, message: { type: string; action: string }) => {
          sent.push({ tabId, message });
          return reply(message);
        }),
      },
    } as unknown as ExtensionApi;
    return { api, sent };
  };

  it('يقرأ الحالة ثم يبدّلها عبر الرسالة المعتمدة', async () => {
    const settings = await open();
    let active = false;
    const { api, sent } = fakeApi((m) => {
      if (m.action === 'toggle') active = !active;
      return { active };
    });
    act(() => render(<ExplainToggleViewForTest settings={settings} api={api} />, container));
    await act(() => flush());
    expect(sent.map((s) => s.message.action)).toEqual(['status']);
    expect(sent[0]?.message.type).toBe(EXPLAIN_MESSAGE);
    await act(async () => {
      button().click();
      await flush();
    });
    expect(sent.map((s) => [s.tabId, s.message.action])).toEqual([[7, 'status'], [7, 'toggle']]);
    expect(button().textContent).toBe('أوقف وضع الشرح');
  });

  it('تبويب ليس صفحة GitHub (الرسالة ترفض) أو بلا تبويب نشط: تنبيه ولا حالة مخمّنة', async () => {
    const settings = await open();
    const { api } = fakeApi(() => {
      throw new Error('Could not establish connection');
    });
    act(() => render(<ExplainToggleViewForTest settings={settings} api={api} />, container));
    await act(() => flush());
    expect(container.querySelector('[data-notice="unreachable"]')?.textContent).toContain('github.com');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('غير معروف');
    act(() => void render(null, container));
    const none = fakeApi(() => ({ active: true }), []);
    act(() => render(<ExplainToggleViewForTest settings={settings} api={none.api} />, container));
    await act(() => flush());
    expect(container.querySelector('[data-notice="unreachable"]')).not.toBeNull();
  });
});

describe('اللوحة', () => {
  it('الزر مسجَّل في تبويب القاموس للوحدة (ب)', () => {
    const view = PANEL_VIEWS.find((v) => v.id === 'b-explain-mode');
    expect(view).toMatchObject({ tab: 'glossary', unit: 'b' });
  });

  it('PanelApp الحقيقي يعرضه في تبويب القاموس', async () => {
    const settings = await open();
    act(() => render(<PanelApp surface="drawer" settings={settings} initialTab="glossary" />, container));
    await act(() => flush());
    expect(container.querySelector('[data-view="explain-toggle"]')).not.toBeNull();
    expect(container.querySelector('[data-empty-tab="glossary"]')).toBeNull();
  });
});

describe('أقسام الإعدادات', () => {
  it('قسما (ب) و(د) مسجَّلان وبمفاتيح الوحدات البرمجية مفعَّلة افتراضيًا', async () => {
    // السجل مشترك بين المراحل: يُقاس قسما (ب) و(د) وحدهما، لا أقسام الوحدات الأخرى المدمجة معهما. قسم البحث (b-search) أضافته MJ10 (T-3.4).
    expect(SETTINGS_SECTIONS.filter((s) => s.unit === 'b' || s.unit === 'd').map((s) => [s.id, s.unit])).toEqual([['b-card', 'b'], ['b-search', 'b'], ['d-status', 'd']]);
    const settings = await open();
    for (const id of ['b.card', 'd.pr-status', 'd.compare']) {
      expect(settings.registry.has(`modules.${id}.enabled`), id).toBe(true);
      expect(isModuleEnabled(settings, id), id).toBe(true);
    }
  });

  it('مفتاح الوحدة البرمجية وحده يوقفها دون الوحدة (د) كلها، ومفتاح الوحدة يوقف الاثنتين', async () => {
    const settings = await open();
    await settings.set('modules.d.compare.enabled', false);
    expect(isModuleEnabled(settings, 'd.compare')).toBe(false);
    expect(isModuleEnabled(settings, 'd.pr-status')).toBe(true);
    await settings.set('modules.d.enabled', false);
    expect(isModuleEnabled(settings, 'd.pr-status')).toBe(false);
    await settings.set('modules.d.compare.enabled', true);
    expect(isModuleEnabled(settings, 'd.compare')).toBe(false);
  });

  it('تظهر الأقسام بمفاتيحها في صفحة الإعدادات والدرج، والمفتاح يكتب في الإعدادات', async () => {
    const settings = await open();
    for (const surface of ['options', 'drawer'] as const) {
      act(() => render(<SettingsTab settings={settings} surface={surface} sections={SETTINGS_SECTIONS} />, container));
      await act(() => flush());
      for (const key of ['modules.b.card.enabled', 'modules.d.pr-status.enabled', 'modules.d.compare.enabled']) expect(container.querySelector(`[data-setting="${key}"]`), `${surface} ${key}`).not.toBeNull();
      act(() => void render(null, container));
    }
    act(() => render(<SettingsTab settings={settings} surface="options" sections={SETTINGS_SECTIONS} />, container));
    await act(() => flush());
    const sw = container.querySelector<HTMLInputElement>('[data-setting="modules.d.compare.enabled"] input[role="switch"]') as HTMLInputElement;
    await act(async () => {
      sw.click();
      await flush();
    });
    expect(settings.get('modules.d.compare.enabled')).toBe(false);
  });

  it('لا حقل نص ولا كلمة مرور في الأقسام ولا زر صلاحية، ولا خيار لإخفاء المصطلح الإنجليزي', async () => {
    const settings = await open();
    act(() => render(<SettingsTab settings={settings} surface="drawer" sections={SETTINGS_SECTIONS} />, container));
    await act(() => flush());
    const modules = [...container.querySelectorAll('[data-section^="module-"]')];
    expect(modules).toHaveLength(2);
    for (const section of modules) {
      expect(section.querySelectorAll('input[type="text"], input[type="password"], textarea')).toHaveLength(0);
      expect(section.textContent).not.toMatch(/إخفاء المصطلح|إخفاء الإنجليزي/);
    }
    expect(modules.map((m) => m.textContent).join(' ')).toContain('api.github.com');
  });
});

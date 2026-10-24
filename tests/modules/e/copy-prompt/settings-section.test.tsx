// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// إعدادات «نسخ البرومبت» وقسمها في «الإعدادات والخصوصية» (T-11.3): مفتاح ظهور الزر (modules.e.copy-prompt.enabled) يحكم تركيب الوحدة وحده، والقالب الافتراضي وحد الأسطر
// (PP-03، من الطبقة المشتركة) قابلان للضبط بقيم صالحة فقط، وتسجيل الوحدة والقسم في الملفين المشتركين.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_MODULES, MemoryStorageArea, SettingsStore, Store, createSettingsRegistry, isModuleEnabled } from '../../../../src/core';
import { SettingsRegistry, moduleEnabledKey } from '../../../../src/core/settings';
import {
  AUTO_TEMPLATE,
  COPY_PROMPT_MODULE_ID,
  COPY_PROMPT_SECTION,
  TEMPLATE_DEFAULT,
  TEMPLATE_KEY,
  defineCopyPromptSettings,
  isTemplateChoice,
  templateFor,
} from '../../../../src/modules/e/copy-prompt';
import { LINE_LIMIT_DEFAULT, LINE_LIMIT_KEY, defineContextSettings } from '../../../../src/modules/e/context';
import { PROMPT_IDS } from '../../../../src/modules/e/prompt-templates';
import { SETTINGS_SECTIONS, defineSectionSettings, sectionsFor } from '../../../../src/options/sections';
import { SettingsTab } from '../../../../src/options/SettingsTab';
import { flush } from '../../d/helpers';

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

describe('القالب الافتراضي', () => {
  it('تلقائي أولًا؛ والتلقائي لكل نوع صفحة، والاختيار الصريح يغلبه', () => {
    expect(TEMPLATE_DEFAULT).toBe('auto');
    expect(AUTO_TEMPLATE).toEqual({ pr: 'next-step', issue: 'understand', job: 'diagnose', diff: 'review' });
    expect(templateFor('auto', 'job')).toBe('diagnose');
    expect(templateFor('handoff', 'job')).toBe('handoff');
    for (const id of PROMPT_IDS) expect(isTemplateChoice(id)).toBe(true);
    expect(isTemplateChoice('auto')).toBe(true);
    for (const bad of ['', 'other', null, 7, {}]) expect(isTemplateChoice(bad)).toBe(false);
  });

  it('يُعرَّف المفتاحان بقيمهما الافتراضية، ولا يُعرَّف حد الأسطر مرتين إن عرّفته مرحلة أخرى قبلها', () => {
    const registry = new SettingsRegistry();
    defineContextSettings(registry);
    expect(() => defineCopyPromptSettings(registry)).not.toThrow();
    expect(registry.get(TEMPLATE_KEY)?.default).toBe('auto');
    expect(registry.get(LINE_LIMIT_KEY)?.default).toBe(LINE_LIMIT_DEFAULT);
    const fresh = new SettingsRegistry();
    defineCopyPromptSettings(fresh);
    expect(fresh.has(LINE_LIMIT_KEY)).toBe(true);
  });
});

describe('التسجيل في الملفين المشتركين', () => {
  it('الوحدة في BUILTIN_MODULES بمعرّف فريد تحت الوحدة (هـ)، والقسم في SETTINGS_SECTIONS لصفحة الإعدادات واللوحة الأصلية لا للدرج', () => {
    const ids = BUILTIN_MODULES.map((m) => m.id);
    expect(ids.filter((id) => id === COPY_PROMPT_MODULE_ID)).toHaveLength(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SETTINGS_SECTIONS.filter((s) => s.id === 'e-copy-prompt')).toEqual([COPY_PROMPT_SECTION]);
    for (const surface of ['options', 'native'] as const) expect(sectionsFor(surface).map((s) => s.id)).toContain('e-copy-prompt');
    // لا يُضاف إلى الدرج: أقسامه قسمان كما اعتمدتهما MJ8 (tests/modules/b/card/panel-and-settings.test.tsx).
    expect(sectionsFor('drawer').map((s) => s.id)).not.toContain('e-copy-prompt');
    expect(new Set(SETTINGS_SECTIONS.map((s) => s.id)).size).toBe(SETTINGS_SECTIONS.length);
  });

  it('مفتاح الوحدة مفعَّل افتراضيًا، وإيقافه يوقف الوحدة وحدها لا الوحدة (هـ) كلها', async () => {
    const settings = await open();
    expect(isModuleEnabled(settings, COPY_PROMPT_MODULE_ID)).toBe(true);
    await settings.set(moduleEnabledKey(COPY_PROMPT_MODULE_ID), false);
    expect(isModuleEnabled(settings, COPY_PROMPT_MODULE_ID)).toBe(false);
    expect(isModuleEnabled(settings, 'e.builder')).toBe(true);
    await settings.set(moduleEnabledKey(COPY_PROMPT_MODULE_ID), true);
    await settings.set(moduleEnabledKey('e'), false);
    expect(isModuleEnabled(settings, COPY_PROMPT_MODULE_ID)).toBe(false);
  });
});

describe('القسم في صفحة الإعدادات', () => {
  it('مفتاح الظهور والقالب وحد الأسطر، وتغييرها يُحفظ بقيم صالحة', async () => {
    const settings = await open();
    act(() => render(<SettingsTab settings={settings} surface="options" sections={sectionsFor('options')} />, container));
    await act(() => flush());
    expect(container.textContent).toContain('نسخ البرومبت (الوحدة هـ)');
    expect(container.querySelector('[data-setting="modules.e.copy-prompt.enabled"]')).not.toBeNull();

    const template = container.querySelector<HTMLSelectElement>(`[data-setting="${TEMPLATE_KEY}"] select`) as HTMLSelectElement;
    expect(template.value).toBe('auto');
    expect([...template.options].map((o) => o.value)).toEqual(['auto', ...PROMPT_IDS]);
    await act(async () => {
      template.value = 'handoff';
      template.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    expect(settings.get(TEMPLATE_KEY)).toBe('handoff');

    const limit = container.querySelector<HTMLSelectElement>(`[data-setting="${LINE_LIMIT_KEY}"] select`) as HTMLSelectElement;
    expect(limit.value).toBe(String(LINE_LIMIT_DEFAULT));
    await act(async () => {
      limit.value = '800';
      limit.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    expect(settings.get(LINE_LIMIT_KEY)).toBe(800);
    // البيان: يعمل بلا مفتاح ولا رمز ولا اتصال.
    expect(container.textContent).toContain('بلا أي مفتاح ولا رمز');
    expect(container.textContent).toContain('لا يضمن إزالة كل سرّ');
  });
});

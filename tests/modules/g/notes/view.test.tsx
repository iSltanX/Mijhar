// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// الملاحظات في اللوحة الجانبية والدرج (AC-G1): واجهة التبويب على الصفحة النشطة، وتتبع تبديل التبويب، وبوابة الوحدة، وقسم الإعدادات.
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { moduleEnabledKey } from '../../../../src/core';
import { NOTES_LINE_MARKERS_KEY, NOTES_PAGE_CARD_KEY, NOTES_PANEL_VIEW, NOTES_SETTINGS_SECTION, connectNotes, createNotesView } from '../../../../src/modules/g/notes';
import { SETTINGS_SECTIONS, defineSectionSettings, sectionsFor } from '../../../../src/options/sections';
import { SettingsTab } from '../../../../src/options/SettingsTab';
import { PANEL_VIEWS } from '../../../../src/sidepanel/views';
import { PanelApp } from '../../../../src/sidepanel/PanelApp';
import { documentPageSource, pageInfoFromUrl, tabsPageSource } from '../../../../src/shared/page';
import type { ActiveTabsApi, PageSource } from '../../../../src/shared/page';
import { memorySettings } from '../../../core/ui-host/helpers';
import { TARGETS, draft, flush, memoryNotes } from './helpers';

const BASE = 'https://github.com/octo/demo';
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
  connectNotes(null);
});

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const el = container.querySelector<E>(selector);
  if (!el) throw new Error(`لا عنصر: ${selector}`);
  return el;
};
// act لا يشغّل تأثيرات تتولّد داخله إلا عند خروجه: ثلاث جولات تبلغ سلسلة (فتح السياق ← تركيب ← قراءة الصفحة).
const settle = async (ms = 8) => {
  for (let i = 0; i < 3; i += 1) await act(async () => void (await flush(ms)));
};
const click = async (el: Element) => {
  await act(async () => {
    (el as HTMLElement).click();
    await flush(4);
  });
};
const type = async (el: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

/** مصدر صفحة يدوي: يغيّر الصفحة ويُعلم. */
function manualSource(initial: string) {
  let href = initial;
  const listeners = new Set<() => void>();
  const source: PageSource = {
    read: async () => pageInfoFromUrl(href, 'عنوان'),
    subscribe: (notify) => {
      listeners.add(notify);
      return () => void listeners.delete(notify);
    },
  };
  return {
    source,
    go(next: string) {
      href = next;
      for (const l of [...listeners]) l();
    },
    listeners: () => listeners.size,
  };
}

describe('واجهة التبويب', () => {
  it('تعرض ملاحظات الصفحة النشطة وتنشئ عليها، وتتبع تغيّر الصفحة', async () => {
    const context = await memoryNotes();
    connectNotes(async () => context);
    await context.repository.create(draft(TARGETS.repo!, 'قديمة'));
    const page = manualSource(BASE);
    const View = createNotesView({ source: () => page.source });
    await act(async () => render(<View settings={context.settings} surface="native" />, container));
    await settle(80);
    expect($('[data-notes-page]').textContent).toContain('octo/demo');
    expect([...container.querySelectorAll('.note-text')].map((n) => n.textContent)).toEqual(['قديمة']);

    await type($('textarea'), 'من اللوحة');
    await click($('[data-action="create"]'));
    await settle();
    expect(context.repository.size).toBe(2);

    await act(async () => {
      page.go(`${BASE}/pull/42`);
      await flush(120);
    });
    expect($('.chip[data-level="thread"]').getAttribute('aria-pressed')).toBe('true');
    await type($('textarea'), 'على طلب الدمج');
    await click($('[data-action="create"]'));
    await settle();
    expect(context.repository.list().find((n) => n.text === 'على طلب الدمج')?.target).toMatchObject({ level: 'thread', number: 42 });
    expect(page.listeners()).toBe(1);
  });

  it('فك الواجهة يلغي اشتراك المصدر', async () => {
    const context = await memoryNotes();
    connectNotes(async () => context);
    const page = manualSource(BASE);
    const View = createNotesView({ source: () => page.source });
    await act(async () => render(<View settings={context.settings} surface="drawer" />, container));
    await settle(80);
    expect(page.listeners()).toBe(1);
    act(() => render(null, container));
    expect(page.listeners()).toBe(0);
  });

  it('صفحة ليست مستودعًا: إرشاد وعدد الملاحظات المحفوظة', async () => {
    const context = await memoryNotes();
    connectNotes(async () => context);
    await context.repository.create(draft(TARGETS.repo!));
    const View = createNotesView({ source: () => manualSource('https://github.com/').source });
    await act(async () => render(<View settings={context.settings} surface="native" />, container));
    await settle(80);
    expect($('[data-notes-page]').textContent).toContain('1 ملاحظة');
    expect(container.querySelector('[data-notes-empty="no-repo"]')).not.toBeNull();
  });

  it('لا تبويب نشط أو خارج GitHub: الإرشاد نفسه بلا انهيار', async () => {
    const context = await memoryNotes();
    connectNotes(async () => context);
    const View = createNotesView({ source: () => null });
    await act(async () => render(<View settings={context.settings} surface="native" />, container));
    await settle(80);
    expect(container.querySelector('[data-notes-empty="no-repo"]')).not.toBeNull();
  });

  it('تعذّر فتح التخزين يظهر خطأً مقروءًا', async () => {
    connectNotes(async () => {
      throw new Error('التخزين غير متاح');
    });
    const View = createNotesView({ source: () => null });
    const { settings } = await memorySettings();
    await act(async () => render(<View settings={settings} surface="native" />, container));
    await settle(30);
    expect($('[role="alert"]').textContent).toContain('التخزين غير متاح');
  });

  it('بيان الخصوصية المحلية ظاهر', async () => {
    const context = await memoryNotes();
    connectNotes(async () => context);
    const View = createNotesView({ source: () => manualSource(BASE).source });
    await act(async () => render(<View settings={context.settings} surface="native" />, container));
    await settle(80);
    expect($('[data-notes-privacy]').textContent).toMatch(/محليًا/);
  });
});

describe('مصدر التبويبات (اللوحة الأصلية)', () => {
  it('يقرأ رابط التبويب النشط ويجدّد عند تفعيل تبويب آخر وعند تحديثه', async () => {
    const urls = [`${BASE}/issues/3`];
    const activated = new Set<() => void>();
    const updated = new Set<() => void>();
    const tabs: ActiveTabsApi = {
      query: vi.fn(async () => [{ url: urls[0], title: 't' }]),
      onActivated: { addListener: (l) => void activated.add(l), removeListener: (l) => void activated.delete(l) },
      onUpdated: { addListener: (l) => void updated.add(l), removeListener: (l) => void updated.delete(l) },
    };
    const source = tabsPageSource(tabs)!;
    expect(await source.read()).toMatchObject({ type: 'issue', number: 3 });
    const notify = vi.fn();
    const off = source.subscribe(notify);
    expect(activated.size + updated.size).toBe(2);
    for (const l of [...activated, ...updated]) l();
    expect(notify).toHaveBeenCalledTimes(2);
    off();
    expect(activated.size + updated.size).toBe(0);
  });

  it('بلا تبويب نشط: null، وبلا واجهة تبويبات: لا مصدر', async () => {
    expect(await tabsPageSource({ query: async () => [] })!.read()).toBeNull();
    expect(tabsPageSource(undefined)).toBeNull();
  });

  it('مصدر المستند يقرأ رابط الصفحة الحالي ويغنيه من DOM ويتتبع الهاش', async () => {
    window.history.replaceState({}, '', '/octo/demo/blob/main/a.js#L4');
    const source = documentPageSource(document);
    expect(await source.read()).toMatchObject({ type: 'blob', lines: { start: 4, end: 4 } });
    const notify = vi.fn();
    const off = source.subscribe(notify);
    window.dispatchEvent(new Event('hashchange'));
    expect(notify).toHaveBeenCalledTimes(1);
    off();
    window.dispatchEvent(new Event('hashchange'));
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('التسجيل في اللوحة والإعدادات', () => {
  it('الواجهة مسجّلة في تبويب «ملاحظاتي» للوحدة (ز) وفي PANEL_VIEWS', () => {
    expect(PANEL_VIEWS).toContain(NOTES_PANEL_VIEW);
    expect(NOTES_PANEL_VIEW).toMatchObject({ tab: 'notes', unit: 'g' });
    expect(SETTINGS_SECTIONS).toContain(NOTES_SETTINGS_SECTION);
  });

  it('PanelApp: التبويب يعرض الواجهة، وإيقاف الوحدة (ز) يحجبها برسالة', async () => {
    const context = await memoryNotes();
    connectNotes(async () => context);
    const { settings } = await memorySettings(context.area);
    const view = { ...NOTES_PANEL_VIEW, component: createNotesView({ source: () => manualSource(BASE).source }) };
    await act(async () => render(<PanelApp surface="native" settings={settings} views={[view]} initialTab="notes" />, container));
    await settle(80);
    expect(container.querySelector('.notes')).not.toBeNull();
    await act(async () => {
      await settings.set(moduleEnabledKey('g'), false);
      await flush(4);
    });
    expect(container.querySelector('.notes')).toBeNull();
    expect(container.textContent).toContain('الوحدة (ز) موقوفة');
  });

  it('قسم الإعدادات يظهر في الصفحة واللوحة الأصلية لا في الدرج، ويحفظ المفتاحين', async () => {
    expect(sectionsFor('options').map((s) => s.id)).toContain('g-notes');
    expect(sectionsFor('native').map((s) => s.id)).toContain('g-notes');
    expect(sectionsFor('drawer').map((s) => s.id)).not.toContain('g-notes');
    const { settings } = await memorySettings();
    // تعريف المفاتيح كما يفعل كل سياق عبر defineSectionSettings.
    const { createSettingsRegistry, SettingsStore, Store, MemoryStorageArea } = await import('../../../../src/core');
    const area = new MemoryStorageArea();
    const registry = createSettingsRegistry((r) => defineSectionSettings(r));
    const real = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), registry);
    expect(real.get(NOTES_PAGE_CARD_KEY)).toBe(true);
    expect(real.get(NOTES_LINE_MARKERS_KEY)).toBe(true);
    await act(async () => render(<SettingsTab settings={real} surface="options" sections={SETTINGS_SECTIONS} />, container));
    const row = $('[data-setting="notes.lineMarkers"] input[role="switch"]') as HTMLInputElement;
    expect(row.checked).toBe(true);
    await act(async () => {
      row.click();
      await flush(6);
    });
    expect(real.get(NOTES_LINE_MARKERS_KEY)).toBe(false);
    expect(settings).toBeDefined();
  });
});

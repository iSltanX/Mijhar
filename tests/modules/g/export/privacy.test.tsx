// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://github.com/octo/demo"}
// TEST-PRIV-03 (AC-G5، وشطر AC-G4 الأخير): أثناء إنشاء الملاحظات والبحث فيها وتصديرها لا يوجد أي طلب شبكي ولا حاجة إلى حساب إضافي؛ ويظهر تنبيه الجهاز
// المشترك بنصه المعتمد (القسم 3.ز) وبيان مكان التخزين في واجهة الوحدة (اللوحة والدرج) وفي الإعدادات (صفحة الإعدادات وتبويب الإعدادات من اللوحة).
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LaterCenter, buildIndex, queryCenter } from '../../../../src/modules/g/bookmarks';
import { connectExport, EXPORT_DRAWER_VIEW, EXPORT_PANEL_VIEW, EXPORT_SETTINGS_SECTION, SHARED_DEVICE_BODY, SHARED_DEVICE_TITLE, STORAGE_LOCATION_TEXT, buildBundle, serializeJson, toMarkdown } from '../../../../src/modules/g/export';
import type { DataToolsDeps } from '../../../../src/modules/g/export';
import { readSnapshot, sourceOf } from '../../../../src/modules/g/export/snapshot';
import { SETTINGS_SECTIONS } from '../../../../src/options/sections';
import { PANEL_VIEWS } from '../../../../src/sidepanel/views';
import { PanelApp } from '../../../../src/sidepanel/PanelApp';
import type { SettingsSurface } from '../../../../src/options/sections';
import { memoryLater } from '../bookmarks/helpers';
import { TARGETS, draft } from '../notes/helpers';
import { closeAll, flush, notesSet, seed, world } from './helpers';

const net = { fetch: vi.fn(), xhr: vi.fn(), ws: vi.fn(), beacon: vi.fn(), source: vi.fn() };
let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  container.className = 'mj-root';
  document.body.append(container);
  for (const spy of Object.values(net)) spy.mockClear();
  vi.stubGlobal('fetch', net.fetch);
  vi.stubGlobal('XMLHttpRequest', net.xhr);
  vi.stubGlobal('WebSocket', net.ws);
  vi.stubGlobal('EventSource', net.source);
  Object.defineProperty(navigator, 'sendBeacon', { value: net.beacon, configurable: true });
});
afterEach(() => {
  render(null, container);
  container.remove();
  vi.unstubAllGlobals();
  connectExport(null);
  closeAll();
});

const settle = async (ms = 6) => {
  for (let i = 0; i < 4; i += 1) await act(async () => void (await flush(ms)));
};

async function show(vnode: preact.VNode): Promise<void> {
  await act(async () => {
    render(vnode, container);
    await flush(6);
  });
  await settle();
}

async function provide(): Promise<DataToolsDeps> {
  const w = await world();
  await seed(w.background);
  const ctx = await w.context();
  const deps: DataToolsDeps = {
    store: ctx.store,
    writer: w.writer,
    subscribe: (listener) => {
      const stops = [ctx.notes.subscribe(listener), ctx.bookmarks.subscribe(listener)];
      return () => stops.forEach((stop) => stop());
    },
  };
  connectExport(async () => deps);
  return deps;
}

const NOTICE = '[data-shared-device-warning]';

function expectNotice(): void {
  const warning = container.querySelector(NOTICE);
  expect(warning, 'تنبيه الجهاز المشترك').not.toBeNull();
  expect(warning!.textContent).toContain(SHARED_DEVICE_TITLE);
  // النص المعتمد حرفيًا، بما فيه عبارة الملف الشخصي للمتصفح والنصيحة بالتصدير ثم المسح.
  expect(warning!.textContent).toContain(SHARED_DEVICE_BODY);
  expect(SHARED_DEVICE_BODY).toContain('الملف الشخصي (Browser Profile) لهذا المتصفح');
  expect(SHARED_DEVICE_BODY).toContain('يُنصح بتصدير ملاحظاتك كنسخة احتياطية ثم مسحها من الإضافة قبل مغادرة الجهاز');
  expect(container.querySelector('[data-storage-location]')?.textContent).toContain(STORAGE_LOCATION_TEXT);
  expect(STORAGE_LOCATION_TEXT).toMatch(/لا مزامنة سحابية ولا حساب إضافي/);
}

describe('التنبيه ومكان التخزين (AC-G4/AC-G5)', () => {
  it('مسجَّلان في اللوحة (تبويب ملاحظاتي) وفي أقسام الإعدادات', () => {
    expect(PANEL_VIEWS.map((v) => v.id)).toEqual(expect.arrayContaining(['g-export', 'g-export-drawer']));
    expect(PANEL_VIEWS.find((v) => v.id === 'g-export')).toMatchObject({ tab: 'notes', unit: 'g', surfaces: ['native'] });
    expect(PANEL_VIEWS.find((v) => v.id === 'g-export-drawer')).toMatchObject({ tab: 'notes', unit: 'g', surfaces: ['drawer'] });
    expect(SETTINGS_SECTIONS.map((s) => s.id)).toContain('g-export');
    // الافتراضي (صفحة الإعدادات واللوحة الأصلية)؛ الدرج المحقون يحمل التنبيه في تبويب ملاحظاتي لا في أقسام الإعدادات.
    expect(EXPORT_SETTINGS_SECTION.surfaces).toBeUndefined();
  });

  it('واجهة الوحدة في اللوحة الأصلية: التنبيه ومكان التخزين وأدوات التصدير', async () => {
    await provide();
    const View = EXPORT_PANEL_VIEW.component;
    await show(<View settings={undefined as never} surface="native" />);
    expectNotice();
    expect(container.querySelector('[data-data-tools="ready"]')).not.toBeNull();
    expect(container.querySelector('[data-action="export-json"]')).not.toBeNull();
  });

  it('واجهة الوحدة في الدرج: التنبيه ومكان التخزين بلا حقول إدخال', async () => {
    await provide();
    const View = EXPORT_DRAWER_VIEW.component;
    await show(<View settings={undefined as never} surface="drawer" />);
    expectNotice();
    expect(container.querySelector('input, select, textarea')).toBeNull();
  });

  it.each<SettingsSurface>(['options', 'native'])('الإعدادات (%s): التنبيه ومكان التخزين دائمًا؛ وأدوات الملف في صفحة الإعدادات وحدها', async (surface) => {
    await provide();
    const Section = EXPORT_SETTINGS_SECTION.component;
    await show(<Section settings={undefined as never} surface={surface} unitEnabled />);
    expectNotice();
    expect(container.querySelector('[data-data-tools]') !== null).toBe(surface === 'options');
    expect(container.querySelector('[data-export-pointer]') !== null).toBe(surface !== 'options');
  });

  it('الوحدة (ز) موقوفة: التنبيه يبقى ويُعلن أن البيانات المحفوظة تبقى', async () => {
    await provide();
    const Section = EXPORT_SETTINGS_SECTION.component;
    await show(<Section settings={undefined as never} surface="native" unitEnabled={false} />);
    expectNotice();
    expect(container.textContent).toContain('الوحدة (ز) موقوفة');
  });

  it('تبويب ملاحظاتي في اللوحة الكاملة يعرض التنبيه (تكامل PanelApp)', async () => {
    const later = await memoryLater();
    await provide();
    await show(<PanelApp surface="native" settings={later.settings} initialTab="notes" />);
    expect(container.querySelector(NOTICE)).not.toBeNull();
  });
});

describe('لا طلب شبكي ولا حساب (AC-G5)', () => {
  it('إنشاء ملاحظة والبحث في ملاحظاتك وروابطك وتصديرها JSON وMarkdown وعرض مركز البحث: صفر طلبات', async () => {
    const later = await memoryLater();
    const set = notesSet();
    for (const bookmark of set.bookmarks.slice(0, 20)) await later.store.write(`bookmarks.${bookmark.id}`, bookmark);
    later.bookmarks.dispose();
    const fresh = await later.reopen();
    const created = await fresh.notes.create(draft(TARGETS.blobLine!, 'ملاحظة جديدة للتجربة'));

    const index = buildIndex(fresh.notes.list(), fresh.bookmarks.list());
    const found = queryCenter(index, { text: 'جديدة' });
    expect(found.some((entry) => entry.note?.id === created.id)).toBe(true);

    await show(<LaterCenter notes={fresh.notes} bookmarks={fresh.bookmarks} />);

    const bundle = buildBundle(sourceOf(await readSnapshot(fresh.store)), { includeSalt: true });
    expect(serializeJson(bundle)).toContain('ملاحظة جديدة للتجربة');
    expect(toMarkdown(bundle)).toContain('ملاحظة جديدة للتجربة');

    expect(net.fetch).not.toHaveBeenCalled();
    expect(net.xhr).not.toHaveBeenCalled();
    expect(net.ws).not.toHaveBeenCalled();
    expect(net.source).not.toHaveBeenCalled();
    expect(net.beacon).not.toHaveBeenCalled();
  });
});

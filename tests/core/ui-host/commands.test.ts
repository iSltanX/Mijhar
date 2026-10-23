// أمر فتح اللوحة أو الدرج: المسار المتزامن حتى أول استدعاء (قيد فعل المستخدم)، والرجوع إلى الدرج، وتطبيق التفضيل.
import { describe, expect, it, vi } from 'vitest';
import { DRAWER_MESSAGE, MemoryStorageArea, PANEL_COMMAND, SURFACE_KEY, SURFACE_MIRROR_KEY, applySurface, openPanel, readSurfaceMirror, toggleDrawer } from '../../../src/core';
import { startBackground } from '../../../src/background/main';
import { fakeExtensionApi, flush, memorySettings } from './helpers';

const memoryStorage = (): Storage => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k), clear: () => data.clear(), key: () => null, length: 0 } as Storage;
};

describe('openPanel في عائلة Chromium', () => {
  it('يستدعي sidePanel.open متزامنًا قبل أي انتظار، بنافذة التبويب', () => {
    const open = vi.fn(async () => {});
    const { api } = fakeExtensionApi({ sidePanel: { open, setOptions: vi.fn(async () => {}) } });
    openPanel({ api, target: 'chromium' }, { id: 3, windowId: 11 });
    // متزامن: قبل أي microtask.
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ windowId: 11 });
  });

  it('رفض open (تفضيل الدرج أو غياب فعل المستخدم) يبدّل الدرج في التبويب نفسه', async () => {
    const outcomes: string[] = [];
    const { api, sent } = fakeExtensionApi({ sidePanel: { open: vi.fn(async () => Promise.reject(new Error('No active side panel for windowId: 11'))), setOptions: vi.fn(async () => {}) } });
    openPanel({ api, target: 'chromium', onOutcome: (o) => outcomes.push(o) }, { id: 3, windowId: 11 });
    await flush();
    expect(sent).toEqual([{ tabId: 3, message: { type: DRAWER_MESSAGE, action: 'toggle' } }]);
    expect(outcomes).toEqual(['drawer']);
  });

  it('بلا sidePanel أو بلا نافذة: الدرج مباشرة، وتبويب بلا سكربت محتوى يعطي unavailable', async () => {
    const outcomes: string[] = [];
    const { api } = fakeExtensionApi();
    vi.mocked(api.tabs.sendMessage).mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'));
    openPanel({ api, target: 'chromium', onOutcome: (o) => outcomes.push(o) }, { id: 5 });
    await flush();
    expect(outcomes).toEqual(['unavailable']);
  });

  it('applySurface: التفضيل يُحفظ في المتصفح بـsetOptions({ enabled })', async () => {
    const setOptions = vi.fn(async () => {});
    const { api } = fakeExtensionApi({ sidePanel: { open: vi.fn(async () => {}), setOptions } });
    await applySurface({ api, target: 'chromium' }, 'drawer');
    await applySurface({ api, target: 'chromium' }, 'native');
    expect(setOptions.mock.calls).toEqual([[{ enabled: false }], [{ enabled: true }]]);
  });
});

describe('openPanel في Firefox', () => {
  it('الأصلية: sidebarAction.toggle متزامنًا', () => {
    const toggle = vi.fn(async () => {});
    const { api, sent } = fakeExtensionApi({ sidebarAction: { open: vi.fn(async () => {}), close: vi.fn(async () => {}), toggle } });
    openPanel({ api, target: 'firefox', surface: () => 'native' }, { id: 3 });
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([]);
  });

  it('تفضيل الدرج يُقرأ متزامنًا من الانعكاس فلا يُمس الشريط الجانبي', async () => {
    const toggle = vi.fn(async () => {});
    const { api, sent } = fakeExtensionApi({ sidebarAction: { open: vi.fn(async () => {}), close: vi.fn(async () => {}), toggle } });
    const mirror = memoryStorage();
    await applySurface({ api, target: 'firefox' }, 'drawer', mirror);
    expect(mirror.getItem(SURFACE_MIRROR_KEY)).toBe('drawer');
    openPanel({ api, target: 'firefox', surface: () => readSurfaceMirror(mirror) }, { id: 4 });
    await flush();
    expect(toggle).not.toHaveBeenCalled();
    expect(sent).toEqual([{ tabId: 4, message: { type: DRAWER_MESSAGE, action: 'toggle' } }]);
  });

  it('فشل toggle يرجع إلى الدرج، وانعكاس تالف يُعامل غير معروف', async () => {
    const { api, sent } = fakeExtensionApi({ sidebarAction: { open: vi.fn(async () => {}), close: vi.fn(async () => {}), toggle: vi.fn(async () => Promise.reject(new Error('sidebarAction.toggle may only be called from a user input handler'))) } });
    const mirror = memoryStorage();
    mirror.setItem(SURFACE_MIRROR_KEY, 'sideways');
    expect(readSurfaceMirror(mirror)).toBeUndefined();
    openPanel({ api, target: 'firefox', surface: () => readSurfaceMirror(mirror) }, { id: 4 });
    await flush();
    expect(sent).toHaveLength(1);
  });
});

describe('toggleDrawer', () => {
  it('بلا تبويب: يسأل عن التبويب النشط', async () => {
    const { api, sent } = fakeExtensionApi();
    expect(await toggleDrawer(api, undefined, 'open')).toBe('drawer');
    expect(api.tabs.query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    expect(sent).toEqual([{ tabId: 7, message: { type: DRAWER_MESSAGE, action: 'open' } }]);
  });
});

describe('startBackground', () => {
  it('يسجّل المستمعات متزامنًا قبل فتح التخزين، ثم يطبّق مكان اللوحة ويتبع تغيّره', async () => {
    const setOptions = vi.fn(async () => {});
    const open = vi.fn(async () => {});
    const fake = fakeExtensionApi({ sidePanel: { open, setOptions } });
    const area = new MemoryStorageArea();
    const handle = startBackground({ api: fake.api, target: 'chromium', binding: { area, changes: area } });
    expect(fake.listenerCounts()).toEqual({ messages: 1, commands: 1 });
    // أمر يصل قبل اكتمال فتح التخزين (خلفية أُيقظت للتو): يُفتح متزامنًا ولا ينتظر.
    fake.command(PANEL_COMMAND, { id: 1, windowId: 2 });
    expect(open).toHaveBeenCalledTimes(1);
    fake.command('other-command', { id: 1, windowId: 2 });
    expect(open).toHaveBeenCalledTimes(1);

    await handle.ready;
    await flush();
    expect(setOptions).toHaveBeenLastCalledWith({ enabled: true });
    const { settings } = await memorySettings(area);
    await settings.set(SURFACE_KEY, 'drawer');
    await flush();
    expect(setOptions).toHaveBeenLastCalledWith({ enabled: false });
  });

  it('رسالة فتح الإعدادات من الدرج تفتح صفحة الإعدادات', async () => {
    const fake = fakeExtensionApi();
    const area = new MemoryStorageArea();
    await startBackground({ api: fake.api, target: 'chromium', binding: { area, changes: area } }).ready;
    fake.message({ type: 'mijhar:open-options' });
    fake.message({ type: 'something-else' });
    expect(fake.api.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
  });
});

// سجل الإعدادات وبث تغيّرها (AC-1.3): تغيّر حالة تشغيل/إيقاف الوحدات يصل إلى جميع السياقات المفتوحة.
// السياقات هنا مخزنان يتشاركان المنطقة نفسها كما تتشارك السياقات storage.local؛ البث الفعلي في المتصفحات: TEST-CORE-04 (browser/run.mjs).
import { describe, expect, it, vi } from 'vitest';
import {
  LifecycleManager,
  MemoryStorageArea,
  ModuleRegistry,
  PageDetector,
  SETTING_PREFIX,
  SettingsRegistry,
  SettingsStore,
  Store,
  StorageQuotaError,
  bindModuleToggles,
  moduleEnabledKey,
} from '../../../src/core';
import type { SettingChange } from '../../../src/core';
import { loadPage } from '../helpers/dom';
import { injectedCount, markerModule } from '../helpers/modules';
import { flush } from './helpers';

const makeRegistry = (): SettingsRegistry => {
  const registry = new SettingsRegistry();
  registry.defineModuleToggle('a', true);
  registry.defineModuleToggle('b', false);
  registry.define<number>({ key: 'reading.scale', default: 1, validate: (v): v is number => typeof v === 'number' && v > 0 && v <= 3 });
  registry.define<string[]>({ key: 'scope.repos', default: [] });
  return registry;
};

async function context(area: MemoryStorageArea, registry = makeRegistry()): Promise<{ settings: SettingsStore; changes: SettingChange[] }> {
  const store = await Store.open({ area, changes: area });
  const settings = await SettingsStore.open(store, registry);
  const changes: SettingChange[] = [];
  settings.subscribe((change) => changes.push(change));
  return { settings, changes };
}

describe('SettingsRegistry', () => {
  it('يرفض المفتاح المكرر والمفتاح غير الصالح والافتراضي الذي لا يجتاز مدققه', () => {
    const registry = makeRegistry();
    expect(() => registry.defineModuleToggle('a', false)).toThrow(/مسبقًا/);
    expect(() => registry.define({ key: '1x', default: 1 })).toThrow(/غير صالح/);
    expect(() => registry.define<number>({ key: 'x.bad', default: 0, validate: (v): v is number => typeof v === 'number' && v > 0 })).toThrow(/المدقق/);
  });

  it('defineModuleToggle يعرّف modules.<id>.enabled بافتراضي صريح', () => {
    const registry = makeRegistry();
    expect(moduleEnabledKey('a')).toBe('modules.a.enabled');
    expect(registry.get('modules.a.enabled')?.default).toBe(true);
    expect(registry.get('modules.b.enabled')?.default).toBe(false);
    expect(registry.list().map((d) => d.key)).toEqual(['modules.a.enabled', 'modules.b.enabled', 'reading.scale', 'scope.repos']);
  });
});

describe('القراءة والكتابة', () => {
  it('الافتراضي ثم الكتابة ثم إعادة الضبط؛ ولا يُخزَّن إلا ما خالف الافتراضي', async () => {
    const area = new MemoryStorageArea();
    const { settings } = await context(area);
    expect(settings.get('reading.scale')).toBe(1);
    expect(settings.isModuleEnabled('a')).toBe(true);
    expect(settings.isModuleEnabled('b')).toBe(false);
    expect(settings.isModuleEnabled('غير-معرَّفة')).toBe(false);

    const stored = () => Object.fromEntries(Object.entries(area.dump()).filter(([key]) => key.startsWith(`mijhar:data:${SETTING_PREFIX}`)));
    await settings.set('reading.scale', 1.5);
    expect(settings.get('reading.scale')).toBe(1.5);
    expect(stored()).toEqual({ [`mijhar:data:${SETTING_PREFIX}reading.scale`]: 1.5 });

    await settings.set('reading.scale', 1);
    expect(stored()).toEqual({});

    await settings.set('modules.b.enabled', true);
    await settings.reset('modules.b.enabled');
    expect(settings.isModuleEnabled('b')).toBe(false);
    expect(stored()).toEqual({});
  });

  it('يرفض قيمة لا تجتاز المدقق ومفتاحًا غير معرَّف دون كتابة', async () => {
    const area = new MemoryStorageArea();
    const { settings, changes } = await context(area);
    const before = area.dump();
    await expect(settings.set('reading.scale', 99)).rejects.toThrow(/غير صالحة/);
    await expect(settings.set('مجهول', 1)).rejects.toThrow(/غير معرَّف/);
    expect(() => settings.get('مجهول')).toThrow(/غير معرَّف/);
    expect(area.dump()).toEqual(before);
    expect(changes).toEqual([]);
  });

  it('كتابة بقيمة مساوية للفعلية لا تكتب ولا تُصدر حدثًا', async () => {
    const area = new MemoryStorageArea();
    const { settings, changes } = await context(area);
    const writes = area.writes;
    await settings.set('reading.scale', 1);
    await settings.reset('reading.scale');
    await flush();
    expect(area.writes).toBe(writes);
    expect(changes).toEqual([]);
  });

  it('قيم مخزنة غير صالحة أو لمفاتيح مجهولة تُهمل في العرض وتبقى في التخزين كما هي', async () => {
    const area = new MemoryStorageArea({
      initial: {
        'mijhar:meta': { schemaVersion: 1, createdAt: 'x' },
        [`mijhar:data:${SETTING_PREFIX}reading.scale`]: 'نص',
        [`mijhar:data:${SETTING_PREFIX}future.flag`]: true,
        [`mijhar:data:${SETTING_PREFIX}modules.a.enabled`]: false,
      },
    });
    const { settings } = await context(area);
    expect(settings.get('reading.scale')).toBe(1);
    expect(settings.isModuleEnabled('a')).toBe(false);
    await settings.set('scope.repos', ['octo/demo']);
    const dump = area.dump();
    expect(dump[`mijhar:data:${SETTING_PREFIX}reading.scale`]).toBe('نص');
    expect(dump[`mijhar:data:${SETTING_PREFIX}future.flag`]).toBe(true);
    expect(dump[`mijhar:data:${SETTING_PREFIX}scope.repos`]).toEqual(['octo/demo']);
  });

  it('all يعيد القيم الفعلية لكل المعرَّف', async () => {
    const { settings } = await context(new MemoryStorageArea());
    await settings.set('reading.scale', 2);
    expect(settings.all()).toEqual({ 'modules.a.enabled': true, 'modules.b.enabled': false, 'reading.scale': 2, 'scope.repos': [] });
  });
});

describe('البث إلى السياقات المفتوحة (AC-1.3)', () => {
  it('تغيّر في سياق يصل الآخر بمصدر remote، ويرى الكاتب حدثًا واحدًا local دون تكرار', async () => {
    const area = new MemoryStorageArea();
    const one = await context(area);
    const two = await context(area);
    await one.settings.set('modules.a.enabled', false);
    await flush();
    expect(one.changes).toEqual([{ key: 'modules.a.enabled', value: false, oldValue: true, source: 'local' }]);
    expect(two.changes).toEqual([{ key: 'modules.a.enabled', value: false, oldValue: true, source: 'remote' }]);
    expect(two.settings.isModuleEnabled('a')).toBe(false);
  });

  it('سياق ثالث يُفتح لاحقًا يرى الحالة المحفوظة', async () => {
    const area = new MemoryStorageArea();
    const one = await context(area);
    await one.settings.set('modules.b.enabled', true);
    const late = await context(area);
    expect(late.settings.isModuleEnabled('b')).toBe(true);
  });

  it('عشر كتابات متتابعة: يرى الآخر النتيجة النهائية وبترتيب الكتابة، والكاتب أحداثه local العشرة', async () => {
    const area = new MemoryStorageArea();
    const one = await context(area);
    const two = await context(area);
    for (let i = 1; i <= 10; i += 1) await one.settings.set('reading.scale', 1 + i / 10);
    await flush();
    expect(one.changes.map((c) => c.value)).toEqual([1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2]);
    expect(one.changes.every((c) => c.source === 'local')).toBe(true);
    expect(two.changes.map((c) => c.value)).toEqual([1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2]);
    expect(two.settings.get('reading.scale')).toBe(2);
  });

  it('كتابات من سياقين في وقت واحد تنتهي بحالة واحدة متفق عليها في الاثنين', async () => {
    const area = new MemoryStorageArea();
    const one = await context(area);
    const two = await context(area);
    await Promise.all([one.settings.set('reading.scale', 1.5), two.settings.set('scope.repos', ['a/b'])]);
    await flush();
    expect(one.settings.all()).toEqual(two.settings.all());
    expect(one.settings.get('reading.scale')).toBe(1.5);
    expect(one.settings.get('scope.repos')).toEqual(['a/b']);
  });

  it('فشل الكتابة بالحصة: لا تغيير ولا حدث، ويبقى البث اللاحق سليمًا', async () => {
    const area = new MemoryStorageArea();
    const one = await context(area);
    const two = await context(area);
    area.quotaBytes = JSON.stringify(area.dump()).length + 10;
    const before = area.dump();
    await expect(one.settings.set('scope.repos', ['x'.repeat(500)])).rejects.toBeInstanceOf(StorageQuotaError);
    await flush();
    expect(area.dump()).toEqual(before);
    expect(one.settings.get('scope.repos')).toEqual([]);
    expect(one.changes).toEqual([]);
    expect(two.changes).toEqual([]);

    area.quotaBytes = undefined;
    await one.settings.set('reading.scale', 2);
    await flush();
    expect(two.changes).toEqual([{ key: 'reading.scale', value: 2, oldValue: 1, source: 'remote' }]);
  });

  it('dispose يفك الاشتراك فلا يصل شيء بعده', async () => {
    const area = new MemoryStorageArea();
    const one = await context(area);
    const two = await context(area);
    two.settings.dispose();
    await one.settings.set('reading.scale', 2);
    await flush();
    expect(two.changes).toEqual([]);
    expect(two.settings.get('reading.scale')).toBe(1);
  });
});

describe('ربط مفاتيح الوحدات بمدير دورة الحياة في سياقين', () => {
  it('إيقاف وحدة في سياق يزيلها من صفحة السياق الآخر، وتفعيلها يعيد تركيبها', async () => {
    const area = new MemoryStorageArea();
    const makeContext = async () => {
      const dom = loadPage('pr', 'https://github.com/octo/demo/pull/42');
      const { module } = markerModule({ id: 'a', pages: '*' });
      const registry = new SettingsRegistry();
      registry.defineModuleToggle('a', true);
      const store = await Store.open({ area, changes: area });
      const settings = await SettingsStore.open(store, registry);
      const manager = new LifecycleManager({
        registry: new ModuleRegistry([module]),
        detector: new PageDetector({ document: dom.window.document }),
        document: dom.window.document,
        isEnabled: (id) => settings.isModuleEnabled(id),
      });
      manager.start();
      const unbind = bindModuleToggles(settings, manager);
      return { dom, settings, manager, unbind };
    };
    const one = await makeContext();
    const two = await makeContext();
    expect(injectedCount(one.dom.window.document, 'a')).toBe(1);
    expect(injectedCount(two.dom.window.document, 'a')).toBe(1);

    await one.settings.set('modules.a.enabled', false);
    await flush();
    expect(injectedCount(one.dom.window.document)).toBe(0);
    expect(injectedCount(two.dom.window.document)).toBe(0);
    expect(two.manager.mountedIds()).toEqual([]);

    await two.settings.set('modules.a.enabled', true);
    await flush();
    expect(injectedCount(one.dom.window.document, 'a')).toBe(1);
    expect(injectedCount(two.dom.window.document, 'a')).toBe(1);

    one.unbind();
    await one.settings.set('modules.a.enabled', false);
    await flush();
    expect(injectedCount(one.dom.window.document, 'a')).toBe(1);
    expect(injectedCount(two.dom.window.document)).toBe(0);
  });

  it('تغيّر إعداد غير مفتاح وحدة لا يعيد توفيق الوحدات', async () => {
    const area = new MemoryStorageArea();
    const dom = loadPage('pr', 'https://github.com/octo/demo/pull/42');
    const registry = makeRegistry();
    const store = await Store.open({ area, changes: area });
    const settings = await SettingsStore.open(store, registry);
    const manager = new LifecycleManager({
      registry: new ModuleRegistry([markerModule({ id: 'a', pages: '*' }).module]),
      detector: new PageDetector({ document: dom.window.document }),
      document: dom.window.document,
      isEnabled: (id) => settings.isModuleEnabled(id),
    });
    manager.start();
    const refresh = vi.spyOn(manager, 'refresh');
    bindModuleToggles(settings, manager);
    await settings.set('reading.scale', 2);
    await flush();
    expect(refresh).not.toHaveBeenCalled();
  });
});

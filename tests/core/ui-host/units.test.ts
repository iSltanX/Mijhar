// مفاتيح الوحدات الثماني وربطها بالوحدات البرمجية (جزء من TEST-CORE-06).
import { describe, expect, it } from 'vitest';
import { DEFAULT_SURFACE, MemoryStorageArea, PANEL_REQUEST_KEY, SURFACE_KEY, SettingsRegistry, UNITS, UNIT_IDS, WELCOME_KEY, createSettingsRegistry, isModuleEnabled, moduleEnabledKey, unitOf } from '../../../src/core';
import { memorySettings } from './helpers';

describe('سجل الإعدادات الأساسي', () => {
  it('يعرّف مفاتيح الوحدات الثماني أ–ح مفعَّلة افتراضيًا ومكان اللوحة', () => {
    const registry = createSettingsRegistry();
    expect(UNITS.map((u) => u.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(UNITS.map((u) => u.letter)).toEqual(['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح']);
    for (const id of UNIT_IDS) expect(registry.get(moduleEnabledKey(id))?.default).toBe(true);
    expect(registry.get(SURFACE_KEY)?.default).toBe(DEFAULT_SURFACE);
    expect(registry.get(SURFACE_KEY)?.validate?.('sideways')).toBe(false);
    // مفتاح طلب تبويب اللوحة أضافته MJ10 (T-3.4) لأمر فتح القاموس: قيمته الافتراضية null.
    expect(registry.get(PANEL_REQUEST_KEY)?.default).toBeNull();
    // حالة الترحيب (AD-29): الافتراضي 'done' فلا يظهر إلا بعد تثبيت أول أو «جولة الترحيب».
    expect(registry.get(WELCOME_KEY)?.default).toBe('done');
    expect(registry.get(WELCOME_KEY)?.validate?.('maybe')).toBe(false);
    expect(registry.list()).toHaveLength(11);
  });

  it('extend يضيف إعدادات الأقسام فوق الأساسي', () => {
    const registry = createSettingsRegistry((r: SettingsRegistry) => r.define({ key: 'a.threshold', default: 30 }));
    expect(registry.has('a.threshold')).toBe(true);
    expect(registry.has(moduleEnabledKey('a'))).toBe(true);
  });
});

describe('unitOf وisModuleEnabled', () => {
  it('حرف الوحدة من المعرّف وحده أو متبوعًا بنقطة أو شرطة', () => {
    expect(unitOf('a')).toBe('a');
    expect(unitOf('a.direction')).toBe('a');
    expect(unitOf('h-readme')).toBe('h');
    expect(unitOf('direction')).toBeUndefined();
    expect(unitOf('z')).toBeUndefined();
  });

  it('مفتاح الوحدة يحكم كل وحداتها البرمجية، ومفتاح خاص يُضاف فوقه', async () => {
    const area = new MemoryStorageArea();
    const { settings } = await memorySettings(area);
    expect(isModuleEnabled(settings, 'a')).toBe(true);
    expect(isModuleEnabled(settings, 'a.direction')).toBe(true);
    await settings.set(moduleEnabledKey('a'), false);
    expect(isModuleEnabled(settings, 'a')).toBe(false);
    expect(isModuleEnabled(settings, 'a.direction')).toBe(false);
    expect(isModuleEnabled(settings, 'b.card')).toBe(true);
    // معرّف خارج الاصطلاح: يعود إلى مفتاحه الخاص، وغيابه يعني «معطَّلة».
    expect(isModuleEnabled(settings, 'legacy')).toBe(false);
  });

  it('وحدة برمجية بمفتاح خاص: تُركَّب حين يكون مفتاحها ومفتاح وحدتها مفعَّلين', async () => {
    const area = new MemoryStorageArea();
    const registry = createSettingsRegistry((r) => r.defineModuleToggle('a.fonts', false));
    const { SettingsStore, Store } = await import('../../../src/core');
    const settings = await SettingsStore.open(await Store.open({ area, changes: area, locks: null }), registry);
    expect(isModuleEnabled(settings, 'a.fonts')).toBe(false);
    await settings.set(moduleEnabledKey('a.fonts'), true);
    expect(isModuleEnabled(settings, 'a.fonts')).toBe(true);
    await settings.set(moduleEnabledKey('a'), false);
    expect(isModuleEnabled(settings, 'a.fonts')).toBe(false);
  });
});

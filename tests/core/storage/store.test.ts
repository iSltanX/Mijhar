// Store: السجلات والتسلسل والقيم والاشتراك والنسخ الاحتياطية والتصدير والاستيراد.
import { describe, expect, it, vi } from 'vitest';
import { CURRENT_SCHEMA_VERSION, META_KEY, MemoryStorageArea, Store, StorageImportError, StorageValueError } from '../../../src/core';
import type { Migration } from '../../../src/core';
import { areaFrom, backupKeys, flush, userData } from './helpers';

const open = (area: MemoryStorageArea, extra: Partial<Parameters<typeof Store.open>[0]> = {}) => Store.open({ area, changes: area, ...extra });

describe('الفتح والسجلات', () => {
  it('مخزن جديد: يختم الإصدار الحالي ولا ينشئ نسخة احتياطية', async () => {
    const area = new MemoryStorageArea();
    const store = await open(area);
    expect(store.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(area.dump()[META_KEY]).toMatchObject({ schemaVersion: CURRENT_SCHEMA_VERSION });
    expect(backupKeys(area.dump())).toEqual([]);
  });

  it('قراءة سجل غير موجود تعيد نسخة من الافتراضي لا مرجعه', async () => {
    const store = await open(new MemoryStorageArea());
    const fallback = { items: [] as number[] };
    const read = await store.read('notes', fallback);
    read.items.push(1);
    expect(fallback.items).toEqual([]);
  });

  it('كتابة ثم قراءة ثم حذف', async () => {
    const store = await open(new MemoryStorageArea());
    await store.write('notes', [{ id: 1, text: 'مرحبا' }]);
    expect(await store.read('notes', [])).toEqual([{ id: 1, text: 'مرحبا' }]);
    await store.remove('notes');
    expect(await store.read('notes', 'غائب')).toBe('غائب');
  });

  it('عشرون update متزامنة لا تدهس بعضها (تسلسل داخل السياق)', async () => {
    const store = await open(new MemoryStorageArea());
    await Promise.all(Array.from({ length: 20 }, () => store.update('counter', { n: 0 }, (draft) => void (draft.n += 1))));
    expect(await store.read('counter', { n: 0 })).toEqual({ n: 20 });
  });

  it('update تعيد القيمة المكتوبة وتقبل قيمة جديدة بدل تعديل المسودة', async () => {
    const store = await open(new MemoryStorageArea());
    expect(await store.update('list', [] as number[], () => [1, 2, 3])).toEqual([1, 2, 3]);
    expect(await store.read('list', [])).toEqual([1, 2, 3]);
  });

  it('فشل update في المنتصف لا يعطّل ما بعده من الكتابات', async () => {
    const store = await open(new MemoryStorageArea());
    await expect(store.update('x', { n: 0 }, () => { throw new Error('خطأ مستخدم'); })).rejects.toThrow('خطأ مستخدم');
    await store.write('x', { n: 5 });
    expect(await store.read('x', { n: 0 })).toEqual({ n: 5 });
  });

  it.each([
    ['undefined', undefined],
    ['دالة', () => 1],
    ['NaN داخل كائن', { n: Number.NaN }],
    ['Date', new Date()],
    ['undefined داخل كائن', { a: undefined }],
  ])('قيمة غير قابلة للتخزين مرفوضة: %s', async (_label, value) => {
    const store = await open(new MemoryStorageArea());
    await expect(store.write('bad', value)).rejects.toBeInstanceOf(StorageValueError);
    expect(await store.read('bad', 'لم يُكتب')).toBe('لم يُكتب');
  });

  it.each(['', '1abc', 'a b', 'a:b', 'mijhar:x'])('اسم سجل غير صالح مرفوض: «%s»', async (name) => {
    const store = await open(new MemoryStorageArea());
    await expect(store.write(name, 1)).rejects.toBeInstanceOf(StorageValueError);
    await expect(store.read(name, 1)).rejects.toBeInstanceOf(StorageValueError);
  });

  it('usage يعيد البايتات المستعملة (بـgetBytesInUse إن وُجدت، وإلا بالتقدير)', async () => {
    const area = new MemoryStorageArea();
    const store = await open(area);
    await store.write('notes', 'س'.repeat(100));
    expect((await store.usage()).bytesInUse).toBeGreaterThan(100);
    const bare = { get: area.get.bind(area), set: area.set.bind(area), remove: area.remove.bind(area) };
    const noBytes = await Store.open({ area: bare });
    expect((await noBytes.usage()).bytesInUse).toBeGreaterThan(100);
  });
});

describe('الاشتراك والبث بين السياقات', () => {
  it('تغيّر سجل في سياق يصل مشتركي سياق آخر (يتشاركان المنطقة)', async () => {
    const area = new MemoryStorageArea();
    const ctx1 = await open(area);
    const ctx2 = await open(area);
    const seen = vi.fn();
    ctx2.subscribe('notes', seen);
    await ctx1.write('notes', ['أ']);
    await flush();
    expect(seen).toHaveBeenCalledWith(['أ'], undefined);
    await ctx1.write('notes', ['أ', 'ب']);
    await flush();
    expect(seen).toHaveBeenLastCalledWith(['أ', 'ب'], ['أ']);
  });

  it('الكاتب نفسه يستلم الحدث (كما storage.onChanged) والإلغاء يوقفه', async () => {
    const area = new MemoryStorageArea();
    const store = await open(area);
    const seen = vi.fn();
    const off = store.subscribe('notes', seen);
    await store.write('notes', 1);
    await flush();
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    await store.write('notes', 2);
    await flush();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('لا يصل المشترك تغيّر سجل آخر ولا مفاتيح النظام', async () => {
    const area = new MemoryStorageArea();
    const store = await open(area);
    const seen = vi.fn();
    store.subscribe('notes', seen);
    await store.write('other', 1);
    await store.createBackup();
    await flush();
    expect(seen).not.toHaveBeenCalled();
  });

  it('dispose يفك الاشتراكات من المصدر', async () => {
    const area = new MemoryStorageArea();
    const store = await open(area);
    const seen = vi.fn();
    store.subscribe('notes', seen);
    store.dispose();
    await store.write('notes', 1);
    await flush();
    expect(seen).not.toHaveBeenCalled();
  });

  it('subscribe بلا ChangeSource خطأ صريح', async () => {
    const store = await Store.open({ area: new MemoryStorageArea() });
    expect(() => store.subscribe('notes', () => {})).toThrow(/ChangeSource/);
  });
});

describe('النسخ الاحتياطية اليدوية والإرجاع', () => {
  it('createBackup ثم تغيير ثم restoreBackup يعيد الحالة السابقة بعد نسخة أمان', async () => {
    const area = areaFrom('v1-stamped');
    const store = await open(area, { keepBackups: 5 });
    const original = userData(area.dump());
    const id = await store.createBackup();
    await store.write('settings', { 'modules.a.enabled': true });
    await store.write('extra', 1);
    await store.restoreBackup(id);
    expect(userData(area.dump())).toEqual(original);
    expect(backupKeys(area.dump()).length).toBe(2);
    expect((await store.listBackups()).map((b) => b.reason)).toEqual(['manual', 'manual']);
  });

  it('restoreBackup لنسخة غير موجودة يرفض ولا يغيّر شيئًا', async () => {
    const area = areaFrom('v1-stamped');
    const store = await open(area);
    const before = area.dump();
    await expect(store.restoreBackup('لا-توجد')).rejects.toBeInstanceOf(StorageImportError);
    expect(area.dump()).toEqual(before);
  });

  it('keepBackups يحتفظ بالأحدث فقط', async () => {
    let tick = 0;
    const store = await open(areaFrom('v1-stamped'), { keepBackups: 2, now: () => new Date(Date.UTC(2026, 9, 23, 0, 0, (tick += 1))) });
    for (let i = 0; i < 5; i += 1) await store.createBackup();
    const list = await store.listBackups();
    expect(list).toHaveLength(2);
    expect((list[0]?.createdAt ?? '') > (list[1]?.createdAt ?? '')).toBe(true);
  });
});

describe('التصدير والاستيراد', () => {
  it('تصدير ثم استيراد في مخزن آخر يعيد السجلات نفسها', async () => {
    const source = await open(areaFrom('v1-stamped'));
    const envelope = await source.exportData();
    expect(envelope).toMatchObject({ format: 'mijhar-export', schemaVersion: CURRENT_SCHEMA_VERSION });
    expect(Object.keys(envelope.records).sort()).toEqual(['notes', 'settings']);

    const target = await open(new MemoryStorageArea());
    const result = await target.importData(JSON.parse(JSON.stringify(envelope)));
    expect(result.imported.sort()).toEqual(['notes', 'settings']);
    expect(await target.exportData()).toMatchObject({ records: envelope.records });
  });

  it('replace يستبدل ما ليس في الملف ويحذفه، وmerge يبقيه', async () => {
    const make = async () => {
      const area = areaFrom('v1-stamped');
      const store = await open(area);
      await store.write('keep', { a: 1 });
      return { area, store };
    };
    const envelope = { format: 'mijhar-export', schemaVersion: CURRENT_SCHEMA_VERSION, exportedAt: 'x', records: { settings: { 'modules.b.enabled': true } } };

    const replaced = await make();
    const resultReplace = await replaced.store.importData(envelope);
    expect(resultReplace.removed.sort()).toEqual(['keep', 'notes']);
    expect(Object.keys((await replaced.store.exportData()).records)).toEqual(['settings']);

    const merged = await make();
    await merged.store.importData(envelope, { mode: 'merge' });
    expect(Object.keys((await merged.store.exportData()).records).sort()).toEqual(['keep', 'notes', 'settings']);
    expect((await merged.store.exportData()).records.settings).toEqual({ 'modules.b.enabled': true });
  });

  it('الاستيراد ينشئ نسخة احتياطية من الحالة السابقة قبل أي كتابة', async () => {
    const area = areaFrom('v1-stamped');
    const store = await open(area);
    const original = userData(area.dump());
    const { backupId } = await store.importData({ format: 'mijhar-export', schemaVersion: 1, exportedAt: 'x', records: { settings: {} } });
    const backups = await store.listBackups();
    expect(backups.map((b) => b.id)).toContain(backupId);
    expect(backups.find((b) => b.id === backupId)?.reason).toBe('import');
    await store.restoreBackup(backupId);
    expect(userData(area.dump())).toEqual(original);
  });

  it.each([
    ['ليس كائنًا', 'نص'],
    ['صيغة مجهولة', { format: 'x', schemaVersion: 1, records: {} }],
    ['إصدار غير صالح', { format: 'mijhar-export', schemaVersion: 'a', records: {} }],
    ['records ليست كائنًا', { format: 'mijhar-export', schemaVersion: 1, records: [] }],
    ['إصدار أحدث من المدعوم', { format: 'mijhar-export', schemaVersion: 99, exportedAt: 'x', records: {} }],
  ])('ملف استيراد غير صالح مرفوض ولا يمس البيانات: %s', async (_label, input) => {
    const area = areaFrom('v1-stamped');
    const store = await open(area);
    const before = area.dump();
    await expect(store.importData(input)).rejects.toBeInstanceOf(StorageImportError);
    expect(area.dump()).toEqual(before);
  });

  it('اسم سجل أو قيمة غير صالحة داخل الملف ترفض الاستيراد كله', async () => {
    const area = areaFrom('v1-stamped');
    const store = await open(area);
    const before = area.dump();
    await expect(store.importData({ format: 'mijhar-export', schemaVersion: 1, exportedAt: 'x', records: { 'اسم عربي': 1 } })).rejects.toBeInstanceOf(StorageValueError);
    expect(area.dump()).toEqual(before);
  });

  it('ملف بمخطط أقدم يُرحَّل في الذاكرة قبل الكتابة', async () => {
    const wrap: Migration = {
      from: 1,
      to: 2,
      description: 'لفّ الملاحظات',
      up: (s) => ({ records: { ...s.records, notes: { items: s.records.notes ?? [] } } }),
    };
    const store = await open(new MemoryStorageArea(), { currentVersion: 2, migrations: [wrap] });
    await store.importData({ format: 'mijhar-export', schemaVersion: 1, exportedAt: 'x', records: { notes: [{ id: 1 }] } });
    expect((await store.exportData()).records.notes).toEqual({ items: [{ id: 1 }] });
  });

  it('فشل ترحيل ملف الاستيراد يرفض دون كتابة', async () => {
    const broken: Migration = { from: 1, to: 2, description: 'تالف', up: () => { throw new Error('خطأ ترحيل'); } };
    const area = new MemoryStorageArea();
    const store = await open(area, { currentVersion: 2, migrations: [broken] });
    const before = area.dump();
    await expect(store.importData({ format: 'mijhar-export', schemaVersion: 1, exportedAt: 'x', records: {} })).rejects.toThrow(/خطأ ترحيل/);
    expect(area.dump()).toEqual(before);
  });

  it('فشل الكتابة أثناء الاستيراد يعيد البيانات كما كانت', async () => {
    const area = areaFrom('v1-stamped');
    const store = await open(area);
    const original = userData(area.dump());
    let armed = true;
    area.beforeWrite = (op, keys) => {
      if (armed && op === 'set' && keys.includes('mijhar:data:settings') && keys.includes('mijhar:journal')) {
        armed = false;
        throw new Error('عطل القرص');
      }
    };
    await expect(store.importData({ format: 'mijhar-export', schemaVersion: 1, exportedAt: 'x', records: { settings: { a: 1 } } })).rejects.toBeInstanceOf(StorageImportError);
    expect(userData(area.dump())).toEqual(original);
    expect(area.dump()['mijhar:journal']).toBeUndefined();
  });
});

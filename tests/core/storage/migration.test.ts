// TEST-CORE-03 (AC-1.3): ترحيل المخطط من إصدار سابق مع نسخة احتياطية تلقائية، والتراجع عند فشل الترحيل دون فقد بيانات.
// ملفات الإصدار السابق: fixtures/v0-unstamped.json (سجلات بلا ختم إصدار) وfixtures/v1-stamped.json.
import { describe, expect, it } from 'vitest';
import {
  BACKUP_PREFIX,
  JOURNAL_KEY,
  META_KEY,
  MemoryStorageArea,
  Store,
  StorageMigrationError,
  StorageNotMigratedError,
  StorageSchemaTooNewError,
  measureEntry,
  migrationPath,
} from '../../../src/core';
import type { BackupRecord, Migration } from '../../../src/core';
import { areaFrom, backupKeys, userData } from './helpers';

const open = (area: MemoryStorageArea, extra: Partial<Parameters<typeof Store.open>[0]> = {}) => Store.open({ area, changes: area, ...extra });

// خطوات اختبارية فوق الإصدار 1: 1←2 يعيد تسمية مفتاح إعداد، 2←3 يلفّ الملاحظات في {items} ويحذف سجلًّا.
const rename: Migration = {
  from: 1,
  to: 2,
  description: 'إعادة تسمية reading.fontScale إلى reading.scale',
  up: ({ records }) => {
    const settings = { ...(records.settings as Record<string, unknown>) };
    if ('reading.fontScale' in settings) {
      settings['reading.scale'] = settings['reading.fontScale'];
      delete settings['reading.fontScale'];
    }
    return { records: { ...records, settings } };
  },
};
const wrap: Migration = {
  from: 2,
  to: 3,
  description: 'لفّ الملاحظات في {items} وحذف السجل القديم legacy',
  up: ({ records }) => {
    const { legacy: _legacy, ...rest } = records;
    return { records: { ...rest, notes: { items: records.notes ?? [] } } };
  },
};

describe('من الإصدار 0 (بلا ختم) إلى الحالي بالترحيل المرفق', () => {
  it('ينجح، ويختم الإصدار، ويحفظ نسخة احتياطية حرفية قبل الترحيل، ولا يترك سجل عملية', async () => {
    const area = areaFrom('v0-unstamped');
    const original = area.dump();
    const store = await open(area);
    expect(store.schemaVersion).toBe(1);

    const dump = area.dump();
    expect(dump[META_KEY]).toMatchObject({ schemaVersion: 1 });
    expect(dump[JOURNAL_KEY]).toBeUndefined();
    expect(dump['mijhar:data:settings']).toEqual(original['mijhar:data:settings']);
    expect(dump['mijhar:data:notes']).toEqual(original['mijhar:data:notes']);

    const keys = backupKeys(dump);
    expect(keys).toHaveLength(1);
    const backup = dump[keys[0] as string] as BackupRecord;
    expect(backup).toMatchObject({ reason: 'migration', fromVersion: 0, toVersion: 1, meta: null });
    expect(backup.records).toEqual({ settings: original['mijhar:data:settings'], notes: original['mijhar:data:notes'] });
  });

  it('فتح ثانٍ لا يرحّل ولا ينشئ نسخة جديدة', async () => {
    const area = areaFrom('v0-unstamped');
    await open(area);
    const before = area.dump();
    await open(area);
    expect(area.dump()).toEqual(before);
  });
});

describe('سلسلة خطوات من إصدار مختوم', () => {
  it('1←2←3: تتحول البيانات خطوة خطوة بنسخة احتياطية واحدة للحالة الأصلية', async () => {
    const area = areaFrom('v1-stamped');
    area.dump();
    await area.set({ 'mijhar:data:legacy': { stale: true } });
    const original = userData(area.dump());
    const store = await open(area, { currentVersion: 3, migrations: [rename, wrap] });
    expect(store.schemaVersion).toBe(3);

    const dump = area.dump();
    expect(dump[META_KEY]).toMatchObject({ schemaVersion: 3 });
    expect((dump['mijhar:data:settings'] as Record<string, unknown>)['reading.scale']).toBe(1.25);
    expect((dump['mijhar:data:settings'] as Record<string, unknown>)['reading.fontScale']).toBeUndefined();
    expect(dump['mijhar:data:notes']).toEqual({ items: (original['mijhar:data:notes'] as unknown[]) });
    expect(dump['mijhar:data:legacy']).toBeUndefined();

    const [key] = backupKeys(dump);
    const backup = dump[key as string] as BackupRecord;
    expect(backup).toMatchObject({ fromVersion: 1, toVersion: 3 });
    expect(backup.records).toEqual({ settings: original['mijhar:data:settings'], notes: original['mijhar:data:notes'], legacy: { stale: true } });
  });

  it('migrationPath: يتصل أو ينقطع', () => {
    expect(migrationPath([rename, wrap], 1, 3)?.map((m) => m.to)).toEqual([2, 3]);
    expect(migrationPath([rename, wrap], 2, 3)?.map((m) => m.to)).toEqual([3]);
    expect(migrationPath([rename], 1, 3)).toBeNull();
    expect(migrationPath([rename, wrap], 3, 3)).toEqual([]);
    expect(migrationPath([{ ...rename, to: 1 }], 1, 2)).toBeNull();
  });
});

describe('الفشل لا يفقد بيانات', () => {
  const failing: Migration = { from: 2, to: 3, description: 'يفشل', up: () => { throw new Error('انفجار الترحيل'); } };

  it('خطأ في دالة ترحيل: لا يُكتب شيء إطلاقًا (لا نسخة ولا سجل)، ويُعرف الموضع', async () => {
    const area = areaFrom('v1-stamped');
    const before = area.dump();
    const attempt = open(area, { currentVersion: 3, migrations: [rename, failing] });
    await expect(attempt).rejects.toBeInstanceOf(StorageMigrationError);
    await expect(attempt).rejects.toMatchObject({ failure: { fromVersion: 1, toVersion: 3, failedStep: { from: 2, to: 3 }, restored: true } });
    expect(area.dump()).toEqual(before);
    expect(area.writes).toBe(0);
  });

  it('ناتج ترحيل غير صالح (قيمة لا تُخزَّن) يُعامل كفشل خطوة ولا يُكتب', async () => {
    const area = areaFrom('v1-stamped');
    const before = area.dump();
    const bad: Migration = { from: 1, to: 2, description: 'NaN', up: () => ({ records: { settings: { n: Number.NaN } } }) };
    await expect(open(area, { currentVersion: 2, migrations: [bad] })).rejects.toMatchObject({ failure: { failedStep: { from: 1, to: 2 }, restored: true } });
    expect(area.dump()).toEqual(before);
  });

  it('انقطاع المسار (لا خطوة من الإصدار الحالي) يرفض دون كتابة', async () => {
    const area = areaFrom('v1-stamped');
    const before = area.dump();
    await expect(open(area, { currentVersion: 3, migrations: [wrap] })).rejects.toBeInstanceOf(StorageMigrationError);
    expect(area.dump()).toEqual(before);
  });

  it('فشل الكتابة الذرّية: يُعاد كل شيء وتبقى النسخة الاحتياطية ولا يبقى سجل عملية', async () => {
    const area = areaFrom('v1-stamped');
    const original = userData(area.dump());
    area.beforeWrite = (op, keys) => {
      if (op === 'set' && keys.includes(META_KEY) && keys.includes(JOURNAL_KEY)) throw new Error('عطل أثناء الكتابة');
    };
    const attempt = open(area, { currentVersion: 3, migrations: [rename, wrap] });
    await expect(attempt).rejects.toBeInstanceOf(StorageMigrationError);
    await expect(attempt).rejects.toMatchObject({ failure: { restored: true, fromVersion: 1, toVersion: 3 } });
    expect(userData(area.dump())).toEqual(original);
    expect(area.dump()[JOURNAL_KEY]).toBeUndefined();
    expect(backupKeys(area.dump())).toHaveLength(1);
  });

  it('كتابة جزئية (منطقة غير ذرّية) ثم فشل: الإرجاع يعيد المفاتيح كلها', async () => {
    const area = areaFrom('v1-stamped', { atomic: false });
    const original = userData(area.dump());
    const used = Object.entries(area.dump()).reduce((sum, [key, value]) => sum + measureEntry(key, value), 0);
    // الحصة تكفي للنسخة والسجل وسجل واحد من اثنين مضافين بالترحيل، فتُكتب الكتابة الذرّية المفترضة جزئيًا ثم تفشل.
    const grow: Migration = { from: 1, to: 2, description: 'يضخّم', up: ({ records }) => ({ records: { ...records, extra: 'ض'.repeat(900), extra2: 'ض'.repeat(900) } }) };
    area.quotaBytes = used * 2 + 700 + 1000;
    const attempt = open(area, { currentVersion: 2, migrations: [grow] });
    await expect(attempt).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', details: { phase: 'migration' } });
    expect(userData(area.dump())).toEqual(original);
    expect(area.dump()[JOURNAL_KEY]).toBeUndefined();
    expect(area.dump()['mijhar:data:extra']).toBeUndefined();
  });

  it('انهيار الاسترجاع نفسه: يبقى السجل، وفتح لاحق يستردّ تلقائيًا بلا فقد ثم يرحّل بنجاح', async () => {
    const area = areaFrom('v1-stamped');
    const original = userData(area.dump());
    let dead = false;
    area.beforeWrite = (_op, keys) => {
      if (keys.includes(META_KEY) && keys.includes(JOURNAL_KEY)) dead = true;
      if (dead) throw new Error('القرص غاب');
    };
    await expect(open(area, { currentVersion: 3, migrations: [rename, wrap] })).rejects.toMatchObject({ failure: { restored: false } });
    expect(area.dump()[JOURNAL_KEY]).toBeDefined();
    expect(userData(area.dump())).toEqual(original);

    area.beforeWrite = undefined;
    const store = await open(area, { currentVersion: 3, migrations: [rename, wrap] });
    expect(store.schemaVersion).toBe(3);
    expect(area.dump()[JOURNAL_KEY]).toBeUndefined();
    expect((area.dump()['mijhar:data:notes'] as { items: unknown[] }).items).toEqual(original['mijhar:data:notes']);
  });

  it('انهيار بعد انتصاف الكتابة: الفتح التالي يُرجع النسخة ويبقى الترحيل الفاشل فاشلًا دون فقد', async () => {
    const area = areaFrom('v1-stamped', { atomic: false });
    const original = userData(area.dump());
    // كتابة تضع نصف المفاتيح ثم ينقطع كل شيء بعدها.
    let dead = false;
    const origSet = area.set.bind(area);
    area.set = async (items) => {
      if (Object.keys(items).includes(JOURNAL_KEY) && Object.keys(items).includes(META_KEY)) {
        await origSet({ 'mijhar:data:settings': { 'half-written': true } });
        dead = true;
        throw new Error('انقطع التيار');
      }
      if (dead) throw new Error('القرص غاب');
      return origSet(items);
    };
    await expect(open(area, { currentVersion: 3, migrations: [rename, wrap] })).rejects.toMatchObject({ failure: { restored: false } });
    expect(area.dump()['mijhar:data:settings']).toEqual({ 'half-written': true });

    area.set = origSet;
    const store = await open(area, { currentVersion: 3, migrations: [rename, failing] }).catch((e: unknown) => e);
    expect(store).toBeInstanceOf(StorageMigrationError);
    expect(userData(area.dump())).toEqual(original);
    expect(area.dump()[JOURNAL_KEY]).toBeUndefined();
  });

  it('فشل التنظيف بعد الكتابة الذرّية لا يُرجع ترحيلًا ناجحًا، ويُكمَل عند الفتح التالي', async () => {
    const area = areaFrom('v1-stamped');
    await area.set({ 'mijhar:data:legacy': { stale: true } });
    area.beforeWrite = (op, keys) => {
      if (op === 'remove' && keys.some((k) => k === 'mijhar:data:legacy' || k === JOURNAL_KEY)) throw new Error('فشل الحذف');
    };
    const store = await open(area, { currentVersion: 3, migrations: [rename, wrap] });
    expect(store.schemaVersion).toBe(3);
    expect(area.dump()[META_KEY]).toMatchObject({ schemaVersion: 3 });
    expect((area.dump()['mijhar:data:notes'] as { items: unknown[] }).items).toHaveLength(2);
    expect(area.dump()[JOURNAL_KEY]).toBeDefined();
    expect(area.dump()['mijhar:data:legacy']).toBeDefined();

    area.beforeWrite = undefined;
    await open(area, { currentVersion: 3, migrations: [rename, wrap] });
    expect(area.dump()[JOURNAL_KEY]).toBeUndefined();
    expect(area.dump()['mijhar:data:legacy']).toBeUndefined();
    expect(area.dump()[META_KEY]).toMatchObject({ schemaVersion: 3 });
  });

  it('النسخة الاحتياطية الأكبر من الحصة توقف الترحيل قبل أي تغيير بخطأ مفهوم', async () => {
    const area = areaFrom('v0-unstamped');
    area.quotaBytes = JSON.stringify(area.dump()).length + 200;
    const before = area.dump();
    const attempt = open(area);
    await expect(attempt).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', details: { phase: 'backup' } });
    expect(area.dump()).toEqual(before);
  });
});

describe('إصدارات لا يرحّلها هذا السياق', () => {
  it('بيانات بمخطط أحدث من المدعوم: يرفض ولا يعدّل (لا تراجع للأقدم)', async () => {
    const area = areaFrom('v1-stamped');
    await area.set({ [META_KEY]: { schemaVersion: 9, createdAt: 'x' } });
    const before = area.dump();
    await expect(open(area)).rejects.toBeInstanceOf(StorageSchemaTooNewError);
    expect(area.dump()).toEqual(before);
  });

  it('سياق migrate:false يرفض بيانات أقدم بدل أن يرحّلها', async () => {
    const area = areaFrom('v0-unstamped');
    const before = area.dump();
    await expect(open(area, { migrate: false })).rejects.toBeInstanceOf(StorageNotMigratedError);
    expect(area.dump()).toEqual(before);
  });

  it('سياق migrate:false يفتح بيانات بالإصدار الحالي', async () => {
    const area = areaFrom('v1-stamped');
    const store = await open(area, { migrate: false });
    expect(store.schemaVersion).toBe(1);
  });
});

describe('النسخ الاحتياطية بعد ترحيلات متتالية', () => {
  it('تحتفظ بالأحدث فقط (keepBackups)', async () => {
    const area = areaFrom('v1-stamped');
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 9, 23, 12, 0, (tick += 1)));
    const steps: Migration[] = [
      { from: 1, to: 2, description: 'a', up: (s) => s },
      { from: 2, to: 3, description: 'b', up: (s) => s },
      { from: 3, to: 4, description: 'c', up: (s) => s },
    ];
    for (const target of [2, 3, 4]) await open(area, { currentVersion: target, migrations: steps, keepBackups: 2, now });
    const keys = backupKeys(area.dump()).map((k) => (area.dump()[k] as BackupRecord).fromVersion).sort();
    expect(keys).toEqual([2, 3]);
    expect(BACKUP_PREFIX).toBe('mijhar:backup:');
  });
});

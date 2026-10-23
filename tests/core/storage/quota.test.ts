// TEST-STORAGE-02 (جزء المحاكاة، AC-1.3): امتلاء الحصة يعطي رسالة مفهومة وخيار التصدير (وunlimitedStorage حيث ثبت)
// ولا يفقد بيانات. تجربة المتصفحات الفعلية (HYP-06): tests/core/storage/browser/run.mjs وتقاريرها في evidence/T-1.3.
import { describe, expect, it } from 'vitest';
import { MemoryStorageArea, Store, StorageQuotaError, isQuotaError } from '../../../src/core';
import { areaFrom, userData } from './helpers';

const open = (area: MemoryStorageArea, extra: Partial<Parameters<typeof Store.open>[0]> = {}) => Store.open({ area, changes: area, ...extra });
const big = (n: number): string => 'ب'.repeat(n);

describe('تجاوز الحصة عند الكتابة', () => {
  it('يرفع StorageQuotaError برسالة عربية وعلاج التصدير، ولا يغيّر ما سبق', async () => {
    const area = new MemoryStorageArea({ quotaBytes: 2000 });
    const store = await open(area);
    await store.write('notes', [{ id: 1, text: big(300) }]);
    const before = area.dump();

    const error = await store.write('notes', [{ id: 1, text: big(5000) }]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageQuotaError);
    const quota = error as StorageQuotaError;
    expect(quota.code).toBe('QUOTA_EXCEEDED');
    expect(quota.details).toMatchObject({ phase: 'write', key: 'notes', remedies: ['export'] });
    expect(quota.details.requestedBytes).toBeGreaterThan(5000);
    expect(quota.message).toContain('امتلأت');
    expect(quota.message).toContain('صدِّر بياناتك');
    expect(quota.message).not.toContain('غير المحدود');
    expect(area.dump()).toEqual(before);
    expect(await store.read('notes', [])).toEqual([{ id: 1, text: big(300) }]);
  });

  it('يعرض طلب unlimitedStorage علاجًا حين يُعلَن أنه يُطلب وقت التشغيل', async () => {
    const area = new MemoryStorageArea({ quotaBytes: 600 });
    const store = await open(area, { canRequestUnlimitedStorage: true });
    const error = (await store.write('notes', big(2000)).catch((e: unknown) => e)) as StorageQuotaError;
    expect(error.details.remedies).toEqual(['export', 'request-unlimited-storage']);
    expect(error.message).toContain('التخزين غير المحدود');
  });

  it('بعد الفشل تنجح الكتابة الأصغر (لا حالة معطوبة)', async () => {
    const area = new MemoryStorageArea({ quotaBytes: 800 });
    const store = await open(area);
    await expect(store.write('notes', big(3000))).rejects.toBeInstanceOf(StorageQuotaError);
    await store.write('notes', big(50));
    expect(await store.read('notes', '')).toBe(big(50));
  });

  it('update التي تتجاوز الحصة تبقي القيمة القديمة', async () => {
    const area = new MemoryStorageArea({ quotaBytes: 1200 });
    const store = await open(area);
    await store.write('list', ['أ']);
    await expect(store.update('list', [] as string[], (draft) => void draft.push(big(4000)))).rejects.toBeInstanceOf(StorageQuotaError);
    expect(await store.read('list', [])).toEqual(['أ']);
  });

  it('التصدير يعمل والحصة ممتلئة (يقرأ ولا يكتب)', async () => {
    const area = new MemoryStorageArea({ quotaBytes: 1000 });
    const store = await open(area);
    await store.write('notes', [{ id: 1, text: big(200) }]);
    await expect(store.write('more', big(5000))).rejects.toBeInstanceOf(StorageQuotaError);
    const envelope = await store.exportData();
    expect(envelope.records.notes).toEqual([{ id: 1, text: big(200) }]);
  });
});

describe('تجاوز الحصة عند الاستيراد', () => {
  it('الاستيراد الأكبر من الحصة يُرفض بخطأ مفهوم وتعود البيانات كما كانت', async () => {
    const area = areaFrom('v1-stamped', { quotaBytes: 2600 });
    const store = await open(area);
    const original = userData(area.dump());
    const envelope = { format: 'mijhar-export', schemaVersion: 1, exportedAt: 'x', records: { notes: [{ text: big(3000) }] } };
    const error = (await store.importData(envelope).catch((e: unknown) => e)) as StorageQuotaError;
    expect(error).toBeInstanceOf(StorageQuotaError);
    expect(['backup', 'import']).toContain(error.details.phase);
    expect(userData(area.dump())).toEqual(original);
    expect(area.dump()['mijhar:journal']).toBeUndefined();
  });
});

describe('isQuotaError', () => {
  it.each([
    [{ name: 'QuotaExceededError', message: '' }, true],
    [new Error('QUOTA_BYTES quota exceeded'), true],
    [new Error('Resource::kQuotaBytes quota exceeded'), true],
    [new Error('storage.local set: QuotaExceededError: disk quota'), true],
    [new Error('شيء آخر'), false],
    [null, false],
    ['quota', false],
  ])('%j → %s', (error, expected) => {
    expect(isQuotaError(error)).toBe(expected);
  });
});

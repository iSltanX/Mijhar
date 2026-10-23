// صفحة إضافة اختبارية (ليست من الحزمة المشحونة): تعرض واجهة window.__mj لتجارب TEST-CORE-04 وHYP-06 وTEST-STORAGE-02
// في المتصفحات الحقيقية. تستعمل طبقتي التخزين والإعدادات الحقيقيتين من src/core.
import { SettingsRegistry, SettingsStore, StorageQuotaError, Store, extensionStorage } from '../../../../../src/core';
import type { JsonValue, SettingChange } from '../../../../../src/core';

type Api = {
  storage: { local: { get(k: unknown): Promise<Record<string, unknown>>; set(i: unknown): Promise<void>; clear(): Promise<void>; remove(k: unknown): Promise<void>; getBytesInUse?(k: unknown): Promise<number>; QUOTA_BYTES?: number } };
  permissions: { request(p: unknown): Promise<boolean>; getAll(): Promise<unknown>; remove(p: unknown): Promise<boolean> };
  runtime: { getManifest(): unknown };
};
const api = ((globalThis as { browser?: Api }).browser ?? (globalThis as { chrome?: Api }).chrome) as Api;

const registry = new SettingsRegistry();
registry.defineModuleToggle('a', true);
registry.defineModuleToggle('b', false);

let settings: SettingsStore | null = null;
const events: Array<SettingChange & { at: number }> = [];
const need = (): SettingsStore => {
  if (!settings) throw new Error('استدعِ init() أولًا');
  return settings;
};

let requestResult: unknown = null;

const mj = {
  async init(): Promise<{ schemaVersion: number }> {
    const { area, changes } = extensionStorage();
    const store = await Store.open({ area, changes });
    settings = await SettingsStore.open(store, registry);
    settings.subscribe((change) => events.push({ ...change, at: Date.now() }));
    return { schemaVersion: store.schemaVersion };
  },
  async set(key: string, value: JsonValue): Promise<number> {
    const started = Date.now();
    await need().set(key, value);
    return Date.now() - started;
  },
  get: (key: string): JsonValue => need().get(key),
  all: (): Record<string, JsonValue> => need().all(),
  events: (): typeof events => events,
  clearEvents: (): void => void events.splice(0),
  requestResult: (): unknown => requestResult,
  clearRequestResult: (): void => {
    requestResult = null;
  },
  now: (): number => Date.now(),

  /** تجارب الحصة والصلاحية: تعمل على storage.local مباشرة لتقيس سلوك المتصفح لا سلوك الطبقة. */
  async probe(): Promise<unknown> {
    return {
      quotaBytes: api.storage.local.QUOTA_BYTES ?? null,
      hasGetBytesInUse: typeof api.storage.local.getBytesInUse === 'function',
      manifestPermissions: (api.runtime.getManifest() as { permissions?: string[]; optional_permissions?: string[] }),
      permissions: await api.permissions.getAll(),
    };
  },
  async quotaExperiment(megabytes: number): Promise<unknown> {
    const out: Record<string, unknown> = {};
    const text = (mb: number): string => 'x'.repeat(Math.floor(mb * 1024 * 1024));
    const describe = (error: unknown): { name: string; message: string } => {
      const e = error as { name?: string; message?: string };
      return { name: String(e?.name), message: String(e?.message) };
    };
    await api.storage.local.clear();
    // 1) كتابة دفعة واحدة تتجاوز الحصة: هل تفشل كاملة (ذرّية) أم تُكتب جزئيًا؟
    try {
      await api.storage.local.set({ small: 'قيمة صغيرة', big: text(megabytes) });
      out.batchOverQuota = 'نجحت';
    } catch (error) {
      out.batchOverQuota = describe(error);
    }
    out.keysAfterBatch = Object.keys(await api.storage.local.get(null));
    out.bytesAfterBatch = api.storage.local.getBytesInUse ? await api.storage.local.getBytesInUse(null) : 'غير مدعومة';
    await api.storage.local.clear();
    // 2) ملء تدريجي ثم تجاوز: هل يبقى ما قبل الفشل سليمًا؟
    try {
      await api.storage.local.set({ keep: text(megabytes * 0.7) });
      out.fillBelowQuota = 'نجحت';
    } catch (error) {
      out.fillBelowQuota = describe(error);
    }
    try {
      await api.storage.local.set({ overflow: text(megabytes * 0.7) });
      out.overflow = 'نجحت';
    } catch (error) {
      out.overflow = describe(error);
    }
    const kept = await api.storage.local.get(['keep', 'overflow']);
    out.keepIntact = typeof kept.keep === 'string' && (kept.keep as string).length === Math.floor(megabytes * 0.7 * 1024 * 1024);
    out.overflowWritten = 'overflow' in kept;
    await api.storage.local.clear();
    return out;
  },
  async clear(): Promise<void> {
    await api.storage.local.clear();
  },
  /** طبقة Store الحقيقية فوق storage.local الحقيقية: كتابة واستيراد يتجاوزان الحصة ثم فحص أن شيئًا لم يُفقد. */
  async layerQuotaExperiment(megabytes: number): Promise<unknown> {
    const out: Record<string, unknown> = {};
    const text = 'x'.repeat(Math.floor(megabytes * 1024 * 1024));
    const describe = (error: unknown): Record<string, unknown> => {
      const e = error as { name?: string; code?: string; message?: string; details?: unknown; cause?: { message?: string } };
      return { name: e?.name, code: e?.code, message: e?.message, details: e?.details, causeMessage: e?.cause?.message, isStorageQuotaError: error instanceof StorageQuotaError };
    };
    await api.storage.local.clear();
    const { area, changes } = extensionStorage();
    const store = await Store.open({ area, changes });
    const safe = [{ id: 1, text: 'ملاحظة سليمة' }];
    await store.write('notes', safe);
    try {
      await store.write('notes', text);
      out.overQuotaWrite = 'نجحت';
    } catch (error) {
      out.overQuotaWrite = describe(error);
    }
    out.notesAfterWrite = JSON.stringify(await store.read('notes', null)) === JSON.stringify(safe) ? 'سليمة' : 'تغيّرت';
    try {
      await store.importData({ format: 'mijhar-export', schemaVersion: 1, exportedAt: 'x', records: { notes: text } });
      out.overQuotaImport = 'نجحت';
    } catch (error) {
      out.overQuotaImport = describe(error);
    }
    out.notesAfterImport = JSON.stringify(await store.read('notes', null)) === JSON.stringify(safe) ? 'سليمة' : 'تغيّرت';
    out.leftoverJournal = Object.keys(await api.storage.local.get(null)).filter((key) => key.includes('journal'));
    out.exportStillWorks = (await store.exportData()).records.notes !== undefined;
    await api.storage.local.clear();
    return out;
  },
  /** لمشغّلات لا تعيد وعودًا عبر حدود الأمان (Marionette): تكتب النتيجة JSON في سمة على الجذر. */
  async runToDom(name: 'probe' | 'quotaExperiment' | 'layerQuota', megabytes?: number): Promise<void> {
    document.documentElement.removeAttribute('data-mj-out');
    const value = name === 'probe' ? await mj.probe() : name === 'layerQuota' ? await mj.layerQuotaExperiment(megabytes ?? 12) : await mj.quotaExperiment(megabytes ?? 12);
    document.documentElement.setAttribute('data-mj-out', JSON.stringify(value));
  },
};

(globalThis as { __mj?: typeof mj }).__mj = mj;

// الطلب يجري داخل معالج نقر فعلي (فعل مستخدم كما تشترط VER-05). زر الشاهد يطلب صلاحية اختيارية عادية (alarms)
// عبر المسار نفسه ليثبت أن فعل المستخدم وصل، فيكون رفض unlimitedStorage بسبب المانيفست لا بسبب غياب النقر.
async function requestOnClick(permission: string): Promise<void> {
  const activation = (navigator as { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? null;
  try {
    requestResult = { permission, activation, granted: await api.permissions.request({ permissions: [permission] }) };
  } catch (error) {
    requestResult = { permission, activation, error: String((error as Error)?.message ?? error) };
  }
}
document.getElementById('request')?.addEventListener('click', () => void requestOnClick('unlimitedStorage'));
document.getElementById('request-control')?.addEventListener('click', () => void requestOnClick('alarms'));

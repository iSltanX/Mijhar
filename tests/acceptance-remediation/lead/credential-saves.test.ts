/**
 * MJ-TA-04 (Codex): حفظان متزامنان للسرّ نفسه من صفحتين، أحدهما في الجلسة والآخر على القرص، كانا يمحوان السرّ كله رغم نجاحهما: كلٌّ يكتب موضعه ثم
 * يمحو الآخر، فيمحو كلٌّ ما كتبه صاحبه. الإصلاح يسلسل الحفظ والحذف للسرّ الواحد بقفل بين السياقات (Web Locks باسم السرّ) وطابور في السياق نفسه.
 * محاكاة محلية: مناطق تخزين في الذاكرة بكتابة بطيئة، ومدير أقفال بسيط بدل navigator.locks؛ ومفاتيح اصطناعية.
 */
import { describe, expect, it } from 'vitest';
import { SecretStore } from '../../../src/core/connections/secrets';
import type { SecretArea, StoredSecret } from '../../../src/core/connections/secrets';
import type { LockManagerLike } from '../../../src/core/storage/store';
import { fakeKey } from '../../modules/e/provider/fixture-provider-mock';

const tick = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * قيمة مشتركة (كما storage.session أو IndexedDB لأصل الإضافة) ومنطقة تصلها؛ لكل صفحة منطقتها (كائن مستقل) على القيمة نفسها. ومدة الكتابة والمسح
 * تضبط التداخل الذي يكشف السباق على b63f9c4.
 */
function shared(setMs: number, removeMs: number) {
  const cell: { value: StoredSecret | null } = { value: null };
  const area = (): SecretArea => ({
    get: async () => cell.value,
    set: async (v) => {
      await tick(setMs);
      cell.value = v;
    },
    remove: async () => {
      await tick(removeMs);
      cell.value = null;
    },
  });
  return { cell, area };
}

/** مدير أقفال واحد لأصل الإضافة: طلبان باسم واحد يتواليان. */
function fakeLocks(): LockManagerLike {
  const queues = new Map<string, Promise<unknown>>();
  return {
    request<T>(name: string, callback: () => Promise<T>): Promise<T> {
      const run = (queues.get(name) ?? Promise.resolve()).then(callback, callback);
      queues.set(name, run.catch(() => undefined));
      return run;
    },
  };
}

describe('MJ-TA-04: حفظان متزامنان للسرّ نفسه لا يمحوانه', () => {
  it('صفحتان (منطقتان مستقلتان وقفل مشترك): يبقى آخر حفظ اكتمل', async () => {
    // الكتابتان تكتملان قبل أي مسح (كما في 99 من 100 محاولة طبيعية في Brave عند Codex).
    const session = shared(1, 5);
    const disk = shared(1, 5);
    const locks = fakeLocks();
    let clock = 1000;
    const page = () => new SecretStore({ session: session.area(), disk: disk.area(), now: () => (clock += 1), locks, lockName: 'mijhar-secret:test' });
    const [a, b] = [page(), page()];
    const results = await Promise.all([a.save(fakeKey('ONE'), 'session'), b.save(fakeKey('TWO'), 'disk')]);
    expect(results.map((r) => r.place)).toEqual(['session', 'disk']);
    const info = await a.info();
    expect(info).not.toBeNull();
    // لا يبقى في موضعين، والباقي هو الحفظ الأخير.
    expect([session.cell.value, disk.cell.value].filter(Boolean)).toHaveLength(1);
    expect(info).toEqual({ place: 'disk', savedAt: results[1]?.savedAt });
  });

  it('مخزنان في السياق نفسه (المنطقتان نفسهما) بلا قفل: يتواليان أيضًا', async () => {
    const session = shared(1, 5);
    const disk = shared(1, 5);
    const sessionArea = session.area();
    const diskArea = disk.area();
    let clock = 1000;
    const a = new SecretStore({ session: sessionArea, disk: diskArea, now: () => (clock += 1) });
    const b = new SecretStore({ session: sessionArea, disk: diskArea, now: () => (clock += 1) });
    await Promise.all([a.save(fakeKey('ONE'), 'disk'), b.save(fakeKey('TWO'), 'session')]);
    expect(await a.info()).toMatchObject({ place: 'session' });
    expect(disk.cell.value).toBeNull();
  });

  it('حفظ ثم مسح متزامنان: لا يعود السرّ بعد اكتمال المسح', async () => {
    // كتابة بطيئة ومسح سريع: المسح الذي طُلب بعد الحفظ كان يسبق اكتمال كتابته فيعود السرّ.
    const session = shared(5, 1);
    const disk = shared(5, 1);
    const locks = fakeLocks();
    const page = () => new SecretStore({ session: session.area(), disk: disk.area(), locks, lockName: 'mijhar-secret:test' });
    const [a, b] = [page(), page()];
    await a.save(fakeKey('OLD'), 'disk');
    const saved = a.save(fakeKey('NEW'), 'session');
    const cleared = b.clear();
    await Promise.all([saved, cleared]);
    // المسح طُلب بعد الحفظ فيتلوه: لا يبقى شيء.
    expect(await a.info()).toBeNull();
  });
});

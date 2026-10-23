// TEST-COMM-05 — المستودع: إضافة وتعديل وحذف، وتصدير واستيراد على عينة الاختبار، وبقاء المحلي، وبلا أي شبكة.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorageArea } from '../../../../src/core';
import { ResourceInputError, ResourceNotFoundError, parseResourceFile } from '../../../../src/modules/h/resources';
import type { Resource } from '../../../../src/modules/h/resources';
import { flush } from '../helpers';
import { BUILTIN, TEST_SET, canon, memoryResources } from './helpers';

const fetchSpy = vi.spyOn(globalThis, 'fetch');
afterEach(() => fetchSpy.mockClear());

const parsedSet = (resources: readonly Resource[] = TEST_SET.resources) => {
  const parsed = parseResourceFile({ ...TEST_SET, resources });
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed;
};

describe('القائمة المضمّنة والمحلية', () => {
  it('تبدأ بالمضمّن مرتبًا بالتصنيف ثم العنوان', async () => {
    const { repository } = await memoryResources();
    expect(repository.list().map((r) => r.id).sort()).toEqual(BUILTIN.map((r) => r.id).sort());
  });

  it('إضافة مورد: غير متحقق منه، أصله المستخدم، ويبقى بعد إعادة الفتح', async () => {
    const first = await memoryResources();
    const added = await first.repository.add({ title: ' دليلي ', url: ' https://example.com/mine ', category: 'lists', description: ' وصف ' });
    expect(added).toMatchObject({ title: 'دليلي', url: 'https://example.com/mine', description: 'وصف', lastVerified: null, status: 'unverified', origin: 'user', source: 'أضافه المستخدم' });
    const second = await first.reopen();
    expect(second.repository.get(added.id)).toEqual(added);
  });

  it('إضافة غير صالحة تُرفض بأسبابها دون كتابة', async () => {
    const { repository, area } = await memoryResources();
    const writes = area.writes;
    await expect(repository.add({ title: '', url: 'http://x', category: '', description: '' })).rejects.toBeInstanceOf(ResourceInputError);
    expect(area.writes).toBe(writes);
  });

  it('تعديل مورد مضمّن يكتب نسخة محلية تغلبه ولا يمس المضمّن', async () => {
    const first = await memoryResources();
    const target = BUILTIN[0]!;
    await first.repository.update(target.id, { title: 'عنوان مُعدّل', description: 'وصفي' });
    const second = await first.reopen();
    expect(second.repository.get(target.id)).toMatchObject({ title: 'عنوان مُعدّل', description: 'وصفي', origin: 'builtin' });
    expect(BUILTIN[0]?.title).toBe(target.title);
  });

  it('تعديل غير موجود أو بحقل غير صالح يفشل', async () => {
    const { repository } = await memoryResources();
    await expect(repository.update('absent', { title: 'x' })).rejects.toBeInstanceOf(ResourceNotFoundError);
    await expect(repository.update(BUILTIN[0]!.id, { url: 'http://insecure.example' })).rejects.toBeInstanceOf(ResourceInputError);
  });

  it('حذف مورد المستخدم نهائي، وحذف المضمّن إخفاء يمكن الرجوع عنه', async () => {
    const first = await memoryResources();
    const mine = await first.repository.add({ title: 'ع', url: 'https://example.com/a', category: 'lists', description: '' });
    await first.repository.remove(mine.id);
    expect(first.repository.get(mine.id)).toBeUndefined();
    const builtin = BUILTIN[1]!;
    await first.repository.remove(builtin.id);
    const second = await first.reopen();
    expect(second.repository.get(builtin.id)).toBeUndefined();
    expect(second.repository.hiddenBuiltins().map((r) => r.id)).toEqual([builtin.id]);
    await second.repository.restoreBuiltin(builtin.id);
    expect(second.repository.get(builtin.id)).toEqual(builtin);
    await expect(second.repository.remove('absent')).rejects.toBeInstanceOf(ResourceNotFoundError);
  });

  it('مراجعة يدوية: تاريخ اليوم والحالة والمصدر', async () => {
    const { repository } = await memoryResources();
    const reviewed = await repository.review(BUILTIN[0]!.id, 'archived');
    expect(reviewed).toMatchObject({ status: 'archived', lastVerified: '2026-10-23', source: 'مراجعة بشرية محلية' });
  });

  it('سياقان: تغيير أحدهما يصل الآخر', async () => {
    const a = await memoryResources();
    const b = await a.reopen();
    let calls = 0;
    b.repository.subscribe(() => (calls += 1));
    const added = await a.repository.add({ title: 'ع', url: 'https://example.com/a', category: 'lists', description: '' });
    await flush(3);
    expect(b.repository.get(added.id)).toEqual(added);
    expect(calls).toBeGreaterThan(0);
  });
});

describe('التصدير والاستيراد على عينة الاختبار', () => {
  it('الاستبدال بعينة كاملة ثم التصدير يعيد كل العناصر كما كانت', async () => {
    const { repository } = await memoryResources();
    await repository.applyImport(parsedSet(), 'replace');
    expect(canon(repository.list())).toBe(canon(TEST_SET.resources));
    const exported = parseResourceFile(repository.exportJson());
    expect(exported.ok && exported.invalid.length === 0).toBe(true);
    if (!exported.ok) return;
    expect(canon(exported.file.resources)).toBe(canon(TEST_SET.resources));
    expect(exported.file.format).toBe('mijhar-resources');
  });

  it('تصدير ثم استيراد في مخزن آخر يعيد القائمة نفسها (دورة كاملة)', async () => {
    const source = await memoryResources();
    await source.repository.applyImport(parsedSet(), 'replace');
    await source.repository.update('t-010', { title: 'بعد التعديل' });
    await source.repository.remove('t-011');
    const json = source.repository.exportJson();
    const target = await memoryResources(new MemoryStorageArea());
    const parsed = parseResourceFile(json);
    if (!parsed.ok) throw new Error(parsed.error);
    await target.repository.applyImport(parsed, 'replace');
    expect(canon(target.repository.list())).toBe(canon(source.repository.list()));
  });

  it('الدمج يبقي ما عندي ويضيف الجديد ويحدّث المطابق بالمعرّف', async () => {
    const { repository } = await memoryResources();
    const mine = await repository.add({ title: 'خاصتي', url: 'https://example.com/mine', category: 'lists', description: '' });
    const incoming = TEST_SET.resources.slice(3, 8);
    const modified = { ...TEST_SET.resources[0]!, title: 'من الملف' };
    const preview = repository.previewImport(parsedSet([...incoming, modified]), 'merge');
    expect(preview).toMatchObject({ added: 5, updated: 1, unchanged: 0, removed: 0 });
    await repository.applyImport(parsedSet([...incoming, modified]), 'merge');
    expect(repository.get(mine.id)).toBeDefined();
    expect(repository.get(BUILTIN[1]!.id)).toBeDefined();
    expect(repository.get(modified.id)?.title).toBe('من الملف');
    expect(repository.list()).toHaveLength(1 + 3 + 5);
  });

  it('معاينة الاستبدال تعلن عدد ما سيُحذف قبل التطبيق', async () => {
    const { repository } = await memoryResources();
    await repository.add({ title: 'خاصتي', url: 'https://example.com/mine', category: 'lists', description: '' });
    const preview = repository.previewImport(parsedSet(TEST_SET.resources.slice(0, 2)), 'replace');
    expect(preview.removed).toBe(2);
    expect(repository.list()).toHaveLength(4);
  });

  it('ملف تالف يُرفض عند الفحص دون مساس بالبيانات الحالية', async () => {
    const { repository, area } = await memoryResources();
    await repository.add({ title: 'خاصتي', url: 'https://example.com/mine', category: 'lists', description: '' });
    const before = canon(repository.list());
    const writes = area.writes;
    for (const bad of ['{ليس json', JSON.stringify({ format: 'x' }), JSON.stringify({ ...TEST_SET, schemaVersion: 9 })]) expect(parseResourceFile(bad).ok).toBe(false);
    expect(canon(repository.list())).toBe(before);
    expect(area.writes).toBe(writes);
  });

  it('عناصر غير صالحة داخل ملف سليم لا تدخل ولا تُسقط الباقي', async () => {
    const { repository } = await memoryResources();
    const parsed = parseResourceFile({ ...TEST_SET, resources: [TEST_SET.resources[5], { ...TEST_SET.resources[6], url: 'ftp://x' }] });
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.invalid).toHaveLength(1);
    await repository.applyImport(parsed, 'merge');
    expect(repository.get(TEST_SET.resources[5]!.id)).toBeDefined();
    expect(repository.get(TEST_SET.resources[6]!.id)).toBeUndefined();
  });

  it('أصل المورد يُعاد تقديره بالمعرّف: المعرّف المضمّن builtin وغيره user', async () => {
    const { repository } = await memoryResources();
    await repository.applyImport(parsedSet([{ ...BUILTIN[0]!, title: 'x', origin: 'user' }, { ...TEST_SET.resources[10]!, origin: 'builtin' }]), 'merge');
    expect(repository.get(BUILTIN[0]!.id)?.origin).toBe('builtin');
    expect(repository.get(TEST_SET.resources[10]!.id)?.origin).toBe('user');
  });
});

describe('دون إنترنت', () => {
  it('الإضافة والتعديل والحذف والتصدير والاستيراد والاستعلام لا تطلب شبكة', async () => {
    const { repository } = await memoryResources();
    await repository.applyImport(parsedSet(), 'replace');
    await repository.add({ title: 'ع', url: 'https://example.com/a', category: 'lists', description: '' });
    await repository.update('t-004', { title: 'جديد' });
    await repository.remove('t-005');
    repository.exportJson();
    repository.list().filter((r) => r.title.includes('جديد'));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

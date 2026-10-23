// مستودع الملاحظات: إنشاء وتحرير وحذف وبقاء بعد إعادة الفتح، وتزامن السياقات، وحالة المرساة المستقلة، وحدود النص والحصة.
import { describe, expect, it } from 'vitest';
import { MemoryStorageArea, StorageQuotaError } from '../../../../src/core';
import { MAX_NOTE_LENGTH, NoteNotFoundError, NoteTextError, NotesRepository, noteRecordName } from '../../../../src/modules/g/notes';
import { TARGETS, draft, flush, memoryNotes } from './helpers';

describe('الإنشاء والقراءة', () => {
  it('كل مستوى من الخمسة (وسطر الفروق) يُنشأ ويُقرأ كما أُدخل', async () => {
    const { repository } = await memoryNotes();
    for (const [name, target] of Object.entries(TARGETS)) {
      const note = await repository.create(draft(target, `ملاحظة ${name}`));
      expect(repository.get(note.id)).toEqual(note);
      expect(note.target).toEqual(target);
      expect(note.text).toBe(`ملاحظة ${name}`);
    }
    expect(repository.size).toBe(Object.keys(TARGETS).length);
  });

  it('حالة المرساة الافتراضية: بلا موضع لغير السطر، وغير متحقق منه للسطر', async () => {
    const { repository } = await memoryNotes();
    expect((await repository.create(draft(TARGETS.repo!))).anchorStatus).toBe('not-applicable');
    expect((await repository.create(draft(TARGETS.file!))).anchorStatus).toBe('not-applicable');
    expect((await repository.create(draft(TARGETS.blobLine!))).anchorStatus).toBe('unverified');
  });

  it('النص يُهذَّب، والفارغ والمفرط الطول مرفوضان بلا كتابة', async () => {
    const { repository, area } = await memoryNotes();
    expect((await repository.create(draft(TARGETS.repo!, '  نص  \n'))).text).toBe('نص');
    const writes = area.writes;
    await expect(repository.create(draft(TARGETS.repo!, '   '))).rejects.toBeInstanceOf(NoteTextError);
    await expect(repository.create(draft(TARGETS.repo!, 'x'.repeat(MAX_NOTE_LENGTH + 1)))).rejects.toBeInstanceOf(NoteTextError);
    expect(area.writes).toBe(writes);
    expect(repository.size).toBe(1);
  });

  it('هدف تالف يُرفض', async () => {
    const { repository } = await memoryNotes();
    await expect(repository.create(draft({ level: 'line', view: 'blob', owner: 'o', repo: 'r', ref: 'm', refKind: 'ref', path: 'a', start: 5, end: 1 }))).rejects.toThrow();
  });

  it('الترتيب: الأحدث تعديلًا أولًا', async () => {
    const { repository } = await memoryNotes();
    const a = await repository.create(draft(TARGETS.repo!, 'أ'));
    const b = await repository.create(draft(TARGETS.repo!, 'ب'));
    expect(repository.list().map((n) => n.id)).toEqual([b.id, a.id]);
    await repository.update(a.id, { text: 'أ معدّلة' });
    expect(repository.list().map((n) => n.id)).toEqual([a.id, b.id]);
  });
});

describe('التحرير والحذف', () => {
  it('تعديل النص لا يمس حالة المرساة، وتعديل الحالة لا يمس النص', async () => {
    const { repository } = await memoryNotes();
    const note = await repository.create(draft(TARGETS.blobLine!, 'نص أصلي'));
    const edited = await repository.update(note.id, { text: 'نص جديد' });
    expect(edited).toMatchObject({ text: 'نص جديد', anchorStatus: 'unverified', createdAt: note.createdAt });
    expect(edited.updatedAt > note.updatedAt).toBe(true);
    const moved = await repository.update(note.id, { anchorStatus: 'unanchored' });
    expect(moved).toMatchObject({ text: 'نص جديد', anchorStatus: 'unanchored' });
  });

  it('تعديل ملاحظة غير موجودة يفشل بخطأ مفهوم ولا ينشئها', async () => {
    const { repository } = await memoryNotes();
    await expect(repository.update('absent', { text: 'x' })).rejects.toBeInstanceOf(NoteNotFoundError);
    expect(repository.size).toBe(0);
  });

  it('الحذف يزيلها من الذاكرة والتخزين', async () => {
    const { repository, store } = await memoryNotes();
    const note = await repository.create(draft(TARGETS.pr!));
    await repository.remove(note.id);
    expect(repository.get(note.id)).toBeUndefined();
    expect(await store.read(noteRecordName(note.id), null)).toBeNull();
    await repository.remove(note.id);
  });
});

describe('البقاء والتزامن', () => {
  it('تبقى الملاحظات بعد إعادة الفتح (إعادة تحميل المتصفح)', async () => {
    const first = await memoryNotes();
    const created = await first.repository.create(draft(TARGETS.file!, 'تبقى'));
    const second = await first.reopen();
    expect(second.repository.list()).toEqual([created]);
  });

  it('سياقان: ما يكتبه أحدهما يظهر في الآخر ويُبلَّغ به، والحذف كذلك', async () => {
    const a = await memoryNotes();
    const b = await a.reopen();
    let calls = 0;
    b.repository.subscribe(() => (calls += 1));
    const note = await a.repository.create(draft(TARGETS.commit!));
    await flush(2);
    expect(b.repository.get(note.id)).toEqual(note);
    expect(calls).toBe(1);
    await a.repository.update(note.id, { text: 'معدّلة' });
    await flush(2);
    expect(b.repository.get(note.id)?.text).toBe('معدّلة');
    await a.repository.remove(note.id);
    await flush(2);
    expect(b.repository.get(note.id)).toBeUndefined();
  });

  it('لا إشعار مكرر لكتابة المستودع نفسه (الحدث الوارد مطابق للذاكرة)', async () => {
    const { repository } = await memoryNotes();
    let calls = 0;
    repository.subscribe(() => (calls += 1));
    await repository.create(draft(TARGETS.repo!));
    await flush(2);
    expect(calls).toBe(1);
  });

  it('سجل غير صالح في التخزين يُهمل في العرض ويبقى في التخزين', async () => {
    const area = new MemoryStorageArea();
    const first = await memoryNotes(area);
    const good = await first.repository.create(draft(TARGETS.repo!));
    await first.store.write('notes.future', { id: 'future', version: 99, anything: true });
    await first.store.write('notes.mismatch', { ...good, id: 'other-id' });
    const second = await first.reopen();
    expect(second.repository.list().map((n) => n.id)).toEqual([good.id]);
    expect(await second.store.read('notes.future', null)).toEqual({ id: 'future', version: 99, anything: true });
  });

  it('dispose يوقف الإشعارات', async () => {
    const a = await memoryNotes();
    const b = await a.reopen();
    let calls = 0;
    b.repository.subscribe(() => (calls += 1));
    b.repository.dispose();
    await a.repository.create(draft(TARGETS.repo!));
    await flush(2);
    expect(calls).toBe(0);
  });
});

describe('الحصة', () => {
  it('تجاوز الحصة يرفع StorageQuotaError ولا يضيع ما سبق', async () => {
    const area = new MemoryStorageArea({ quotaBytes: 4000 });
    const { repository } = await memoryNotes(area);
    const first = await repository.create(draft(TARGETS.repo!, 'سابقة'));
    await expect(repository.create(draft(TARGETS.repo!, 'ط'.repeat(5000)))).rejects.toBeInstanceOf(StorageQuotaError);
    expect(repository.list().map((n) => n.id)).toEqual([first.id]);
  });
});

describe('open', () => {
  it('بلا ملاحظات مخزنة مستودع فارغ', async () => {
    const { store } = await memoryNotes();
    expect((await NotesRepository.open(store)).size).toBe(0);
  });
});

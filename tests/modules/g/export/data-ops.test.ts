// TEST-STORAGE-01 (AC-G4): التصدير (JSON كامل وMarkdown) والاستيراد (فحص المخطط ومعاينة العدد والدمج أو الاستبدال مع نسخة احتياطية تلقائية) والحذف
// (مفرد/مستودع/كلي) على مجموعة PB-04 (500 عنصر)؛ استيراد ملف تالف يُرفض دون المساس بالموجود؛ ودورة تصدير ثم استيراد تعيد كل عناصر المجموعة كما كانت.
// وكل الكتابة هنا تمر بالوسيط في «الخلفية» (AD-25): السياقان يرسلان رسائل ولا يكتبان.
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryStorageArea } from '../../../../src/core';
import { NoteNotFoundError } from '../../../../src/modules/g/notes';
import { DataImportError, NoBackupError } from '../../../../src/modules/g/export/errors';
import { EXPORT_FORMAT_NAME, buildBundle, countsOf, exportFileName, parseBundle, serializeJson, toMarkdown } from '../../../../src/modules/g/export/format';
import { planDelete, planImport } from '../../../../src/modules/g/export/plan';
import { readBackup, readSnapshot, reposOf, sourceOf } from '../../../../src/modules/g/export/snapshot';
import { SALT, SALT_RECORD, YieldingArea, anchorFor, closeAll, dataOf, flush, notesSet, seed, world } from './helpers';

afterEach(closeAll);

const NOW = () => new Date('2026-10-24T09:00:00.000Z');

describe('التصدير (AC-G4)', () => {
  it('JSON كامل يحمل كل عناصر المجموعة بترتيب حتمي، وبلا ملح ما لم يُطلب', async () => {
    const w = await world();
    const { anchors } = await seed(w.background);
    const snapshot = await readSnapshot(w.background);
    const bundle = buildBundle(sourceOf(snapshot), { now: NOW });
    expect(bundle).toMatchObject({ format: EXPORT_FORMAT_NAME, version: 1, scope: { kind: 'all' } });
    expect(countsOf(bundle)).toEqual({ notes: 250, anchors: anchors.length, bookmarks: 250 });
    expect(bundle.salt).toBeUndefined();
    expect(serializeJson(bundle)).not.toContain(SALT);
    expect(buildBundle(sourceOf(snapshot), { now: NOW }).notes.map((n) => n.id)).toEqual(bundle.notes.map((n) => n.id));
    const withSalt = buildBundle(sourceOf(snapshot), { includeSalt: true, now: NOW });
    expect(withSalt.salt).toEqual(SALT_RECORD);
  });

  it('تصدير مستودع محدد: ملاحظاته وروابطه ومراسي ملاحظاته وحدها', async () => {
    const w = await world();
    await seed(w.background);
    const snapshot = await readSnapshot(w.background);
    const [first] = reposOf(snapshot);
    const [owner, repo] = first!.split('/') as [string, string];
    const bundle = buildBundle(sourceOf(snapshot), { scope: { kind: 'repo', owner, repo }, now: NOW });
    expect(bundle.notes.length).toBeGreaterThan(0);
    expect(bundle.notes.every((n) => n.target.owner === owner && n.target.repo === repo)).toBe(true);
    expect(bundle.bookmarks.every((b) => b.owner === owner && b.repo === repo)).toBe(true);
    const ids = new Set(bundle.notes.map((n) => n.id));
    expect(bundle.anchors.every((a) => ids.has(a.noteId))).toBe(true);
    expect(exportFileName(bundle, 'json')).toMatch(/^mijhar-notes-.+-2026-10-24\.json$/);
  });

  it('Markdown مقروء: مجموعات بالمستودع وأقسام الملاحظات و«أكمل لاحقًا»، وبلا ملح ولا بصمات', async () => {
    const w = await world();
    await seed(w.background);
    const snapshot = await readSnapshot(w.background);
    const bundle = buildBundle(sourceOf(snapshot), { includeSalt: true, now: NOW });
    const md = toMarkdown(bundle);
    expect(md).toMatch(/^# ملاحظات مِجهَر وروابط «أكمل لاحقًا»/);
    expect(md).toContain('### الملاحظات');
    expect(md).toContain('### أكمل لاحقًا');
    expect(md).toContain('## kubernetes/kubernetes');
    expect(md).not.toContain(SALT);
    expect(md).not.toContain('function a() {}');
    // نص الملاحظة يظهر كما كُتب داخل اقتباس.
    const note = bundle.notes[0]!;
    expect(md).toContain(`> ${note.text.split('\n')[0]}`);
  });
});

describe('الفحص الصارم لملف الاستيراد (AC-G4)', () => {
  const good = (): Record<string, unknown> => JSON.parse(serializeJson(buildBundle({ notes: notesSet().notes.slice(0, 5), anchors: [], bookmarks: notesSet().bookmarks.slice(0, 3), salt: null }, { now: NOW })));

  it('يقبل ملفًا سليمًا نصًّا أو كائنًا', () => {
    expect(parseBundle(good()).ok).toBe(true);
    expect(parseBundle(JSON.stringify(good())).ok).toBe(true);
  });

  it.each([
    ['نص ليس JSON', 'ليس json{', 'ليس JSON صالحًا'],
    ['ليس كائنًا', [], 'ليس كائنًا'],
    ['صيغة غير معروفة', { ...good(), format: 'other' }, 'صيغة الملف غير معروفة'],
    ['إصدار أحدث', { ...good(), version: 9 }, 'أحدث'],
    ['إصدار غير صالح', { ...good(), version: 0 }, 'إصدار المخطط'],
    ['حقل غير معروف', { ...good(), secret: 'x' }, 'حقل غير معروف'],
    ['قائمة مفقودة', { ...good(), notes: undefined }, 'notes'],
    ['ملاحظة بهدف خارج المخطط', { ...good(), notes: [{ ...notesSet().notes[0]!, target: { level: 'nope' } }] }, 'غير صالحة'],
    ['معرّف مكرر', { ...good(), notes: [notesSet().notes[0], notesSet().notes[0]] }, 'مكرر'],
    ['رابط خارج github.com', { ...good(), bookmarks: [{ ...notesSet().bookmarks[0]!, url: 'https://evil.example/x' }] }, 'رابط محفوظ'],
    ['مرساة بلا ملاحظة', { ...good(), anchors: [anchorFor(notesSet().notes.slice(5).find((n) => n.target.level === 'line' && n.target.view === 'blob')!)] }, 'بلا ملاحظة'],
    ['ملح غير صالح', { ...good(), salt: { salt: 'short', createdAt: 'x' } }, 'الملح'],
  ])('يرفض: %s', (_name, input, fragment) => {
    const result = parseBundle(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain(fragment);
  });

  it('ملف تالف يُرفض في الخلفية دون المساس بالبيانات الحالية ودون نسخة احتياطية', async () => {
    const w = await world();
    await seed(w.background);
    const before = await dataOf(w.area);
    const panel = await w.context();
    for (const content of [JSON.stringify({ ...JSON.parse(serializeJson(buildBundle(sourceOf(await readSnapshot(w.background))))), notes: [{ id: 'x' }] }), '{"format":"mijhar-notes-export"']) {
      await expect(panel.writer.importBundle(content, 'replace')).rejects.toBeInstanceOf(DataImportError);
    }
    expect(await dataOf(w.area)).toEqual(before);
    expect(await readBackup(w.background)).toBeNull();
  });
});

describe('الاستيراد: الدمج والاستبدال والنسخة الاحتياطية (AC-G4)', () => {
  it('تصدير ثم استيراد (استبدال) في تخزين فارغ يعيد كل عناصر المجموعة كما كانت', async () => {
    const source = await world();
    await seed(source.background);
    const bundle = buildBundle(sourceOf(await readSnapshot(source.background)), { includeSalt: true, now: NOW });
    const file = serializeJson(bundle);
    const original = await dataOf(source.area);

    const target = await world();
    const panel = await target.context();
    const summary = await panel.writer.importBundle(file, 'replace');
    expect(summary.notes).toMatchObject({ added: 250, updated: 0, removed: 0 });
    expect(summary.bookmarks).toMatchObject({ added: 250 });
    expect(summary.salt).toBe('adopted');
    const { ['export-backup']: backup, ...restored } = await dataOf(target.area);
    expect(restored).toEqual(original);
    expect(backup).toBeDefined();
  });

  it('المعاينة (planImport من القراءة) تطابق ما تكتبه الخلفية فعلًا', async () => {
    const source = await world();
    await seed(source.background);
    const file = serializeJson(buildBundle(sourceOf(await readSnapshot(source.background)), { now: NOW }));
    const parsed = parseBundle(file);
    if (!parsed.ok) throw new Error('ملف التجربة غير صالح');
    const target = await world();
    const seedSet = notesSet();
    await seed(target.background, { notes: seedSet.notes.slice(0, 100), bookmarks: seedSet.bookmarks.slice(0, 50) }, { salt: false });
    const preview = planImport(await readSnapshot(target.background), parsed.bundle, 'merge').summary;
    const real = await (await target.context()).writer.importBundle(file, 'merge');
    expect(real).toEqual(preview);
    expect(preview.notes).toMatchObject({ added: 150, unchanged: 100 });
  });

  it('الدمج لا يمسح الحالي ويُبقي الأحدث تعديلًا من الجهتين', async () => {
    const w = await world();
    const set = notesSet();
    const [a, b, c] = set.notes.slice(0, 3) as [(typeof set.notes)[0], (typeof set.notes)[0], (typeof set.notes)[0]];
    await seed(w.background, { notes: [a, b], bookmarks: [] }, { salt: false });
    // المحلي: b عُدّل بعد الملف؛ a كما في الملف.
    await w.background.write(`notes.${b.id}`, { ...b, text: 'تعديل محلي أحدث', updatedAt: '2030-01-01T00:00:00.000Z' });
    const file = buildBundle({ notes: [a, { ...b, text: 'نسخة الملف الأقدم' }, c, { ...a, id: 'extra', text: 'جديدة' }], anchors: [], bookmarks: [], salt: null }, { now: NOW });
    const summary = await (await w.context()).writer.importBundle(serializeJson(file), 'merge');
    expect(summary.notes).toEqual({ added: 2, updated: 0, unchanged: 1, keptNewer: 1, removed: 0 });
    const data = await dataOf(w.area);
    expect((data[`notes.${b.id}`] as { text: string }).text).toBe('تعديل محلي أحدث');
    expect(Object.keys(data).filter((k) => k.startsWith('notes.')).length).toBe(4);
  });

  it('الاستبدال يحذف ما ليس في الملف ويأخذ نسخة احتياطية في الخلفية يمكن استعادتها', async () => {
    const w = await world();
    const set = notesSet();
    await seed(w.background, { notes: set.notes.slice(0, 20), bookmarks: set.bookmarks.slice(0, 10) });
    const before = await dataOf(w.area);
    const small = buildBundle({ notes: set.notes.slice(0, 5), anchors: [], bookmarks: set.bookmarks.slice(0, 2), salt: null }, { now: NOW });
    const panel = await w.context();
    const summary = await panel.writer.importBundle(serializeJson(small), 'replace');
    expect(summary.notes).toMatchObject({ unchanged: 5, removed: 15 });
    expect(summary.bookmarks).toMatchObject({ unchanged: 2, removed: 8 });
    // ما أُرسل للخلفية: الملف والوضع لا سجلات محسوبة في المرسل.
    const message = w.sent.at(-1) as { op: string; mode: string; content: unknown };
    expect(Object.keys(message).sort()).toEqual(['content', 'mode', 'op', 'type']);
    expect(message).toMatchObject({ op: 'data-import', mode: 'replace' });
    // النسخة الاحتياطية في الخلفية تحوي الحالة السابقة كاملة.
    const backup = await readBackup(w.background);
    expect(backup?.bundle.notes).toHaveLength(20);
    expect(backup?.bundle.salt).toEqual(SALT_RECORD);
    const afterImport = await dataOf(w.area);
    expect(Object.keys(afterImport).filter((k) => k.startsWith('notes.'))).toHaveLength(5);

    const restored = await panel.writer.restoreImportBackup();
    expect(restored.notes).toMatchObject({ added: 15, removed: 0 });
    const { ['export-backup']: gone, ...after } = await dataOf(w.area);
    expect(gone).toBeUndefined();
    expect(after).toEqual(before);
    await expect(panel.writer.restoreImportBackup()).rejects.toBeInstanceOf(NoBackupError);
  });

  it('الملح: يُتبنّى حين يغيب محليًا، ويبقى المحلي في الدمج عند الاختلاف ويُستبدل في الاستبدال، والاستعادة ترجع الحال بدقة', async () => {
    const other = { salt: 'b'.repeat(64), createdAt: '2026-10-01T00:00:00.000Z' };
    const w = await world();
    const panel = await w.context();
    const fileOf = (salt: typeof other | null) => serializeJson(buildBundle({ notes: [], anchors: [], bookmarks: [], salt }, { includeSalt: true, now: NOW }));
    // محليًا: لا ملح ← يُتبنّى.
    expect((await panel.writer.importBundle(fileOf(other), 'merge')).salt).toBe('adopted');
    expect((await dataOf(w.area))['anchor-salt']).toEqual(other);
    // محليًا ملح آخر + دمج ← يبقى المحلي.
    await w.background.write('anchor-salt', SALT_RECORD);
    expect((await panel.writer.importBundle(fileOf(other), 'merge')).salt).toBe('conflict-kept-local');
    expect((await dataOf(w.area))['anchor-salt']).toEqual(SALT_RECORD);
    // استبدال ← يستبدل.
    expect((await panel.writer.importBundle(fileOf(other), 'replace')).salt).toBe('replaced');
    expect((await dataOf(w.area))['anchor-salt']).toEqual(other);
  });

  it('فشل منتصف الاستيراد (حصة أو انقطاع) يُرجع البيانات كما كانت ويبلّغ بذلك', async () => {
    const area = new MemoryStorageArea();
    const w = await world(area);
    const set = notesSet();
    await seed(w.background, { notes: set.notes.slice(0, 10), bookmarks: [] }, { salt: false });
    const before = await dataOf(area);
    const incoming = buildBundle({ notes: set.notes.slice(10, 20).map((n) => ({ ...n })), anchors: [], bookmarks: [], salt: null }, { now: NOW });
    let writes = 0;
    area.beforeWrite = (operation, keys) => {
      if (operation === 'set' && keys.some((k) => k.startsWith('mijhar:data:notes.')) && ++writes === 4) throw new Error('انقطاع اختباري');
    };
    const panel = await w.context();
    await expect(panel.writer.importBundle(serializeJson(incoming), 'replace')).rejects.toThrow(/أُعيدت بياناتك/);
    area.beforeWrite = undefined;
    const { ['export-backup']: backup, ...after } = await dataOf(area);
    expect(after).toEqual(before);
    expect(backup).toBeDefined();
  });
});

describe('الحذف المفرد والمستودعي والكلي (AC-G4)', () => {
  it('حذف ملاحظة يزيل سجلها ومرساتها معًا، وحذف رابط يزيل سجله', async () => {
    const w = await world();
    const { anchors } = await seed(w.background);
    const panel = await w.context();
    const withAnchor = anchors[0]!.noteId;
    expect(await panel.writer.deleteData({ kind: 'note', id: withAnchor })).toEqual({ notes: 1, anchors: 1, bookmarks: 0 });
    const data = await dataOf(w.area);
    expect(data[`notes.${withAnchor}`]).toBeUndefined();
    expect(data[`anchors.${withAnchor}`]).toBeUndefined();
    expect(await panel.writer.deleteData({ kind: 'bookmark', id: 'b000' })).toEqual({ notes: 0, anchors: 0, bookmarks: 1 });
    expect((await dataOf(w.area))['bookmarks.b000']).toBeUndefined();
    expect(await panel.writer.deleteData({ kind: 'note', id: 'missing-id' })).toEqual({ notes: 0, anchors: 0, bookmarks: 0 });
  });

  it('حذف مستودع يزيل ملاحظاته ومراسيه وروابطه وحدها', async () => {
    const w = await world();
    await seed(w.background);
    const snapshot = await readSnapshot(w.background);
    const [owner, repo] = reposOf(snapshot)[0]!.split('/') as [string, string];
    const expected = planDelete(snapshot, { kind: 'repo', owner, repo });
    const counts = await (await w.context()).writer.deleteData({ kind: 'repo', owner, repo });
    expect(counts).toEqual(expected.counts);
    expect(counts.notes).toBeGreaterThan(0);
    const after = await readSnapshot(w.background);
    expect([...after.notes.values()].some((n) => n.target.owner === owner && n.target.repo === repo)).toBe(false);
    expect([...after.bookmarks.values()].some((b) => b.owner === owner && b.repo === repo)).toBe(false);
    expect(after.notes.size).toBe(250 - counts.notes);
    expect(after.salt).toEqual(SALT_RECORD);
  });

  it('المسح الكلي يزيل كل سجل تحت البادئات الثلاث حتى غير الصالح، ويحذف النسخة الاحتياطية فلا يبقى نص خلفه', async () => {
    const w = await world();
    await seed(w.background);
    await w.background.write('notes.stray', { from: 'نسخة أحدث', text: 'نص سري' });
    const panel = await w.context();
    await panel.writer.importBundle(serializeJson(buildBundle(sourceOf(await readSnapshot(w.background)), { now: NOW })), 'merge');
    // لا تغيير ← لا نسخة؛ نُحدث ملاحظة ثم نستورد استبدالًا لإنشاء نسخة.
    await panel.writer.importBundle(serializeJson(buildBundle({ notes: notesSet().notes.slice(0, 3), anchors: [], bookmarks: [], salt: null }, { now: NOW })), 'replace');
    expect(await readBackup(w.background)).not.toBeNull();
    const counts = await panel.writer.deleteData({ kind: 'all' });
    expect(counts.notes).toBe(4);
    const data = await dataOf(w.area);
    expect(Object.keys(data).filter((k) => /^(notes|anchors|bookmarks)\./.test(k))).toEqual([]);
    expect(data['export-backup']).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain('نص سري');
  });

  it('حذف مستودع ينقّي النسخة الاحتياطية من سجلاته ويُبقي غيره قابلًا للاستعادة', async () => {
    const w = await world();
    const set = notesSet();
    await seed(w.background, { notes: set.notes.slice(0, 30), bookmarks: set.bookmarks.slice(0, 30) });
    const panel = await w.context();
    await panel.writer.importBundle(serializeJson(buildBundle({ notes: [], anchors: [], bookmarks: [], salt: null }, { now: NOW })), 'replace');
    const backup = (await readBackup(w.background))!;
    const target = backup.bundle.notes[0]!.target;
    await panel.writer.deleteData({ kind: 'repo', owner: target.owner, repo: target.repo });
    const pruned = (await readBackup(w.background))!;
    expect(pruned.bundle.notes.some((n) => n.target.owner === target.owner && n.target.repo === target.repo)).toBe(false);
    expect(pruned.bundle.notes.length).toBeGreaterThan(0);
  });
});

describe('الكتابة في الوسيط وحده (AD-25): تزامن مع تعديل من صفحة', () => {
  it('استبدال من اللوحة أثناء تعديل وحذف من الصفحة: لا ضياع تعديل ولا عودة ملاحظة محذوفة، والنسخة الاحتياطية في الخلفية', async () => {
    const w = await world(new YieldingArea());
    const set = notesSet();
    const picked = set.notes.slice(0, 40);
    await seed(w.background, { notes: picked, bookmarks: [] }, { salt: false });
    const file = serializeJson(buildBundle(sourceOf(await readSnapshot(w.background)), { now: NOW }));
    const page = await w.context();
    const panel = await w.context();
    const [edited, deleted] = [picked[0]!, picked[39]!];

    // الاستيراد جارٍ (كتابات متتابعة بطيئة) حين يصل التعديل والحذف من الصفحة: يُنفَّذان بعده في الطابور نفسه.
    const importing = panel.writer.importBundle(file, 'replace');
    await flush(2);
    const results = await Promise.allSettled([page.notes.update(edited.id, { text: 'تعديل المستخدم أثناء الاستيراد' }), page.notes.remove(deleted.id), importing]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
    const data = await dataOf(w.area);
    expect((data[`notes.${edited.id}`] as { text: string }).text).toBe('تعديل المستخدم أثناء الاستيراد');
    expect(data[`notes.${deleted.id}`]).toBeUndefined();
    expect(data[`anchors.${deleted.id}`]).toBeUndefined();
    await flush(5);
    expect(page.notes.get(deleted.id)).toBeUndefined();
    expect(panel.notes.get(deleted.id)).toBeUndefined();
    // النسخة الاحتياطية أنشأتها الخلفية (سجل واحد)، وكل ما أرسله السياقان رسائل.
    expect(await readBackup(w.background)).toBeNull(); // لا تغيير في المحتوى ← لا نسخة
    await panel.writer.importBundle(serializeJson(buildBundle({ notes: [], anchors: [], bookmarks: [], salt: null }, { now: NOW })), 'replace');
    expect(await readBackup(w.background)).not.toBeNull();
    expect(w.sent.every((m) => (m as { type: string }).type === 'mijhar/notes-write')).toBe(true);
  });

  it('حذف يصل قبل تعديل بدأ لاحقًا يفشل التعديل ولا يعيد الملاحظة', async () => {
    const w = await world(new YieldingArea());
    const set = notesSet();
    await seed(w.background, { notes: set.notes.slice(0, 3), bookmarks: [] }, { salt: false });
    const page = await w.context();
    const panel = await w.context();
    const target = set.notes[0]!;
    const results = await Promise.allSettled([panel.writer.deleteData({ kind: 'note', id: target.id }), page.notes.update(target.id, { text: 'متأخر' })]);
    expect(results[0]!.status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: expect.any(NoteNotFoundError) });
    expect((await dataOf(w.area))[`notes.${target.id}`]).toBeUndefined();
  });
});

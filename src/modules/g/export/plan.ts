// تخطيط الاستيراد والحذف والاستعادة (T-8.4، AD-25): دوال خالصة تحسب ما سيُكتب وما سيُحذف وملخص الأعداد من حالة التخزين الحالية والملف.
//  - الواجهة تستدعيها للمعاينة (قراءة فقط)، والخلفية تستدعيها وحدها لتنفيذ الكتابة من حالتها هي لا من حالة المرسل: الرسالة تحمل الملف والوضع،
//    لا سجلات محسوبة (writer.ts). فالمعاينة والتنفيذ يشتركان في المنطق نفسه دون أن يثق التنفيذ بحساب الواجهة.
//  - لا كتابة هنا: التنفيذ في NotesBroker (broker.ts) وحده.
import { anchorRecordName } from '../anchor/types';
import type { LineAnchor } from '../anchor/types';
import { bookmarkRecordName } from '../bookmarks/types';
import type { Bookmark } from '../bookmarks/types';
import { noteRecordName } from '../notes/types';
import type { Note } from '../notes/types';
import { bookmarkInScope, buildBundle, noteInScope } from './format';
import type { ExportBundle, ExportScope, SaltRecord } from './format';

/** اسم سجل الملح المحلي (anchor/types.ts: SALT_RECORD) واسم سجل نسخة الاستيراد الاحتياطية. */
export const SALT_NAME = 'anchor-salt';
export const BACKUP_NAME = 'export-backup';

export type ImportMode = 'merge' | 'replace';

/** حالة البيانات الحالية كما يقرؤها snapshot.ts: الصالح منها مفهرسًا، وأسماء كل السجلات (صالحة أو لا) لمسح كلي لا يترك شيئًا. */
export interface DataSnapshot {
  readonly notes: ReadonlyMap<string, Note>;
  readonly anchors: ReadonlyMap<string, LineAnchor>;
  readonly bookmarks: ReadonlyMap<string, Bookmark>;
  readonly salt: SaltRecord | null;
  readonly names: { readonly notes: readonly string[]; readonly anchors: readonly string[]; readonly bookmarks: readonly string[] };
}

export interface KindSummary {
  readonly added: number;
  readonly updated: number;
  readonly unchanged: number;
  /** في الدمج: سجل محلي أحدث (أو مساوٍ) من الذي في الملف فبقي كما هو. */
  readonly keptNewer: number;
  /** في الاستبدال: سجل محلي ليس في الملف فحُذف. */
  readonly removed: number;
}

export type SaltOutcome = 'unchanged' | 'adopted' | 'replaced' | 'removed' | 'conflict-kept-local';

export interface ImportSummary {
  readonly mode: ImportMode;
  readonly notes: KindSummary;
  readonly anchors: KindSummary;
  readonly bookmarks: KindSummary;
  readonly salt: SaltOutcome;
}

export interface PlannedWrite {
  readonly name: string;
  readonly value: unknown;
}

export interface ImportPlan {
  readonly writes: readonly PlannedWrite[];
  readonly removes: readonly string[];
  readonly summary: ImportSummary;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

class Tally {
  added = 0;
  updated = 0;
  unchanged = 0;
  keptNewer = 0;
  removed = 0;
  freeze(): KindSummary {
    return { added: this.added, updated: this.updated, unchanged: this.unchanged, keptNewer: this.keptNewer, removed: this.removed };
  }
}

type Decision = 'added' | 'updated' | 'unchanged' | 'keptNewer';

/** الدمج: الأحدث تعديلًا يغلب؛ والمتساوي زمنًا المختلف محتوى يبقى المحلي. */
function decide<T>(existing: T | undefined, incoming: T, stamp: (value: T) => string, mode: ImportMode): Decision {
  if (existing === undefined) return 'added';
  if (same(existing, incoming)) return 'unchanged';
  if (mode === 'replace') return 'updated';
  return stamp(incoming) > stamp(existing) ? 'updated' : 'keptNewer';
}

export interface PlanOptions {
  /** الاستعادة: الملح يطابق الملف تمامًا حتى حين يخلو منه فيُحذف المحلي. الافتراضي false. */
  readonly exactSalt?: boolean;
}

/** خطة الاستيراد: الكتابة بترتيب الملاحظات فالمراسي فالروابط فالملح، ثم الحذف (استبدال)، فلا مرساة بلا ملاحظتها في أي نقطة انقطاع. */
export function planImport(current: DataSnapshot, bundle: ExportBundle, mode: ImportMode, options: PlanOptions = {}): ImportPlan {
  const writes: PlannedWrite[] = [];
  const noteTally = new Tally();
  const anchorTally = new Tally();
  const bookmarkTally = new Tally();
  const winners = new Map<string, Decision>();

  for (const note of bundle.notes) {
    const decision = decide(current.notes.get(note.id), note, (n) => n.updatedAt, mode);
    winners.set(note.id, decision);
    noteTally[decision] += 1;
    if (decision === 'added' || decision === 'updated') writes.push({ name: noteRecordName(note.id), value: note });
  }

  for (const anchor of bundle.anchors) {
    const existing = current.anchors.get(anchor.noteId);
    const owner = winners.get(anchor.noteId);
    // المرساة تتبع قرار ملاحظتها: ملاحظة فازت ← مرساتها؛ ملاحظة محلية أحدث ← بقاء مرساتها المحلية؛ ملاحظة متطابقة ← الأحدث التقاطًا.
    const decision: Decision = owner === 'keptNewer' ? 'keptNewer' : owner === 'unchanged' ? decide(existing, anchor, (a) => a.capturedAt, mode) : decide(existing, anchor, () => '', 'replace');
    anchorTally[decision] += 1;
    if (decision === 'added' || decision === 'updated') writes.push({ name: anchorRecordName(anchor.noteId), value: anchor });
  }

  for (const bookmark of bundle.bookmarks) {
    const decision = decide(current.bookmarks.get(bookmark.id), bookmark, (b) => b.updatedAt, mode);
    bookmarkTally[decision] += 1;
    if (decision === 'added' || decision === 'updated') writes.push({ name: bookmarkRecordName(bookmark.id), value: bookmark });
  }

  let salt: SaltOutcome = 'unchanged';
  const removes: string[] = [];
  if (bundle.salt) {
    if (!current.salt) {
      salt = 'adopted';
      writes.push({ name: SALT_NAME, value: bundle.salt });
    } else if (current.salt.salt !== bundle.salt.salt) {
      if (mode === 'replace') {
        salt = 'replaced';
        writes.push({ name: SALT_NAME, value: bundle.salt });
      } else salt = 'conflict-kept-local';
    }
  } else if (options.exactSalt && current.salt) {
    salt = 'removed';
    removes.push(SALT_NAME);
  }

  if (mode === 'replace') {
    const keptNotes = new Set(bundle.notes.map((n) => n.id));
    for (const id of current.notes.keys()) {
      if (keptNotes.has(id)) continue;
      removes.push(noteRecordName(id));
      noteTally.removed += 1;
    }
    const keptAnchors = new Set(bundle.anchors.map((a) => a.noteId));
    for (const id of current.anchors.keys()) {
      if (keptAnchors.has(id)) continue;
      removes.push(anchorRecordName(id));
      anchorTally.removed += 1;
    }
    const keptBookmarks = new Set(bundle.bookmarks.map((b) => b.id));
    for (const id of current.bookmarks.keys()) {
      if (keptBookmarks.has(id)) continue;
      removes.push(bookmarkRecordName(id));
      bookmarkTally.removed += 1;
    }
  }

  return { writes, removes, summary: { mode, notes: noteTally.freeze(), anchors: anchorTally.freeze(), bookmarks: bookmarkTally.freeze(), salt } };
}

// ---------- الحذف ----------

export type DeleteScope =
  | { readonly kind: 'note'; readonly id: string }
  | { readonly kind: 'bookmark'; readonly id: string }
  | { readonly kind: 'repo'; readonly owner: string; readonly repo: string }
  | { readonly kind: 'all' };

export interface DeleteCounts {
  readonly notes: number;
  readonly anchors: number;
  readonly bookmarks: number;
}

export interface DeletePlan {
  readonly removes: readonly string[];
  readonly counts: DeleteCounts;
}

/** ما يُحذف لنطاق: المفرد ملاحظة بمرساتها أو رابط، والمستودعي كل ما يخصه، والكلي كل سجل تحت البادئات الثلاث صالحًا أو لا. */
export function planDelete(current: DataSnapshot, scope: DeleteScope): DeletePlan {
  if (scope.kind === 'all') {
    const removes = [...current.names.notes, ...current.names.anchors, ...current.names.bookmarks];
    return { removes, counts: { notes: current.names.notes.length, anchors: current.names.anchors.length, bookmarks: current.names.bookmarks.length } };
  }
  const noteIds = new Set<string>();
  const bookmarkIds = new Set<string>();
  if (scope.kind === 'note') {
    if (current.notes.has(scope.id)) noteIds.add(scope.id);
  } else if (scope.kind === 'bookmark') {
    if (current.bookmarks.has(scope.id)) bookmarkIds.add(scope.id);
  } else {
    const repoScope: ExportScope = { kind: 'repo', owner: scope.owner, repo: scope.repo };
    for (const note of current.notes.values()) if (noteInScope(note, repoScope)) noteIds.add(note.id);
    for (const bookmark of current.bookmarks.values()) if (bookmarkInScope(bookmark, repoScope)) bookmarkIds.add(bookmark.id);
  }
  const anchorIds = [...current.anchors.keys()].filter((id) => noteIds.has(id));
  return {
    removes: [...[...noteIds].map(noteRecordName), ...anchorIds.map(anchorRecordName), ...[...bookmarkIds].map(bookmarkRecordName)],
    counts: { notes: noteIds.size, anchors: anchorIds.length, bookmarks: bookmarkIds.size },
  };
}

/**
 * النسخة الاحتياطية بعد حذف: تُزال منها السجلات المحذوفة نفسها، فلا يبقى في الإضافة نص ملاحظة محذوفة (حذف يترك نسخة منه لا يفي بغرضه على جهاز
 * مشترك). null: لا يبقى فيها شيء فيُحذف سجلها.
 */
export function pruneBundle(bundle: ExportBundle, scope: DeleteScope): ExportBundle | null {
  if (scope.kind === 'all') return null;
  // النطاق يُحسب على محتوى النسخة نفسه: الملاحظة تحمل مستودعها، والرابط كذلك، فلا حاجة إلى الحالة الحالية.
  const gone = new Set(
    planDelete(
      {
        notes: new Map(bundle.notes.map((n) => [n.id, n])),
        anchors: new Map(bundle.anchors.map((a) => [a.noteId, a])),
        bookmarks: new Map(bundle.bookmarks.map((b) => [b.id, b])),
        salt: null,
        names: { notes: [], anchors: [], bookmarks: [] },
      },
      scope,
    ).removes,
  );
  const notes = bundle.notes.filter((n) => !gone.has(noteRecordName(n.id)));
  const kept = new Set(notes.map((n) => n.id));
  const anchors = bundle.anchors.filter((a) => kept.has(a.noteId));
  const bookmarks = bundle.bookmarks.filter((b) => !gone.has(bookmarkRecordName(b.id)));
  if (!notes.length && !anchors.length && !bookmarks.length) return null;
  return { ...bundle, notes, anchors, bookmarks };
}

/** حزمة كاملة بحالة التخزين الآن، للنسخة الاحتياطية قبل الاستيراد (الملح المحلي يدخلها فتعيده الاستعادة كما كان). */
export function snapshotBundle(current: DataSnapshot, now: () => Date): ExportBundle {
  return buildBundle({ notes: [...current.notes.values()], anchors: [...current.anchors.values()], bookmarks: [...current.bookmarks.values()], salt: current.salt }, { includeSalt: true, now });
}

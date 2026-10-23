// ما تعرضه الصفحة المفتوحة من مستويات الملاحظات: أي مستوى يمكن إنشاء ملاحظة عليه الآن (وهدفها)، وأي الملاحظات المحفوظة تخص هذه
// الصفحة. المطابقة بالمعرّفات لا بالرابط: الهاش والنص بعد ? لا يغيّران الهدف.
import type { LineRange, PageInfo } from '../../../shared/page';
import type { BlobLineTarget, DiffLineTarget, Note, NoteLevel, NoteTarget } from './types';

export const THREAD_PAGES = ['issue', 'pr', 'pr-files', 'pr-commits', 'pr-checks'] as const;

const lower = (value: string): string => value.toLowerCase();
const sameRepo = (a: { owner: string; repo: string }, b: { owner: string | null; repo: string | null }): boolean =>
  b.owner !== null && b.repo !== null && lower(a.owner) === lower(b.owner) && lower(a.repo) === lower(b.repo);

/** معرّفا التزام متطابقان، ولو اختُصر أحدهما (سبعة أحرف فأكثر). */
export function sameSha(a: string, b: string): boolean {
  const x = lower(a);
  const y = lower(b);
  const short = x.length <= y.length ? x : y;
  return short.length >= 7 && (x.startsWith(y) || y.startsWith(x));
}

/** هل الصفحة مستودعية (تحمل owner/repo). */
export const isRepoPage = (page: PageInfo): boolean => page.type !== 'external' && page.owner !== null && page.repo !== null;

export interface TargetOption {
  readonly level: NoteLevel;
  /** null: المستوى مطروح في هذه الصفحة لكن لا يمكن إنشاء ملاحظة عليه الآن؛ والسبب في reason. */
  readonly target: NoteTarget | null;
  readonly reason: string | null;
}

function blobLine(page: PageInfo, lines: LineRange): BlobLineTarget | null {
  if (!page.owner || !page.repo || !page.ref || !page.path) return null;
  return { level: 'line', view: 'blob', owner: page.owner, repo: page.repo, ref: page.ref, refKind: page.refKind, path: page.path, start: lines.start, end: lines.end };
}

function diffLine(page: PageInfo): DiffLineTarget | null {
  if (!page.owner || !page.repo || !page.diff || !page.diffPath) return null;
  const context = page.type === 'pr-files' && page.number !== null ? ({ kind: 'pr', number: page.number } as const) : page.type === 'commit' && page.sha ? ({ kind: 'commit', sha: page.sha } as const) : null;
  if (!context) return null;
  return { level: 'line', view: 'diff', owner: page.owner, repo: page.repo, context, path: page.diffPath, side: page.diff.side, start: page.diff.start, end: page.diff.end };
}

/** مستويات الصفحة بأهدافها. الترتيب من الأعم إلى الأخص. */
export function targetOptions(page: PageInfo): TargetOption[] {
  if (!isRepoPage(page)) return [];
  const { owner, repo } = page as PageInfo & { owner: string; repo: string };
  const options: TargetOption[] = [{ level: 'repo', target: { level: 'repo', owner, repo }, reason: null }];
  if ((THREAD_PAGES as readonly string[]).includes(page.type) && page.number !== null) {
    options.push({ level: 'thread', target: { level: 'thread', owner, repo, kind: page.type === 'issue' ? 'issue' : 'pr', number: page.number }, reason: null });
  }
  if (page.type === 'commit' && page.sha) options.push({ level: 'commit', target: { level: 'commit', owner, repo, sha: page.sha }, reason: null });
  if (page.type === 'blob') {
    options.push(
      page.ref && page.path
        ? { level: 'file', target: { level: 'file', owner, repo, ref: page.ref, refKind: page.refKind, path: page.path }, reason: null }
        : { level: 'file', target: null, reason: 'تعذّر تحديد مسار الملف في هذه الصفحة.' },
    );
  }
  if (page.type === 'blob' || page.diff !== null || page.type === 'pr-files' || page.type === 'commit') {
    const target = page.type === 'blob' ? (page.lines ? blobLine(page, page.lines) : null) : diffLine(page);
    options.push({
      level: 'line',
      target,
      reason: target ? null : page.type === 'blob' ? 'حدّد سطرًا أو نطاقًا بنقر رقم السطر (واضغط Shift لنطاق).' : 'حدّد سطرًا في الفروق بنقر رقمه.',
    });
  }
  return options;
}

/** علاقة الملاحظة بالصفحة: exact في موضعها، وother-ref لملف أو سطر محفوظ على مرجع آخر غير الظاهر الآن. */
export type Relation = 'exact' | 'other-ref';

export function relationTo(note: Note, page: PageInfo): Relation | null {
  const target = note.target;
  if (!sameRepo(target, page)) return null;
  switch (target.level) {
    case 'repo':
      return 'exact';
    case 'thread':
      return (THREAD_PAGES as readonly string[]).includes(page.type) && page.number === target.number ? 'exact' : null;
    case 'commit':
      return page.type === 'commit' && page.sha !== null && sameSha(page.sha, target.sha) ? 'exact' : null;
    case 'file':
      return blobRelation(target.ref, target.path, page);
    case 'line':
      if (target.view === 'blob') return blobRelation(target.ref, target.path, page);
      return sameDiffPage(target, page) ? 'exact' : null;
  }
}

function blobRelation(ref: string, path: string, page: PageInfo): Relation | null {
  if (page.type !== 'blob' || page.blobRest === null) return null;
  if (page.blobRest === `${ref}/${path}`) return 'exact';
  return page.blobRest.endsWith(`/${path}`) ? 'other-ref' : null;
}

function sameDiffPage(target: DiffLineTarget, page: PageInfo): boolean {
  if (target.context.kind === 'pr') return page.type === 'pr-files' && page.number === target.context.number;
  return page.type === 'commit' && page.sha !== null && sameSha(page.sha, target.context.sha);
}

export interface PageNotes {
  readonly byLevel: Readonly<Record<NoteLevel, Note[]>>;
  readonly relations: ReadonlyMap<string, Relation>;
  readonly total: number;
}

/** الملاحظات التي تخص الصفحة موزعة على المستويات (الأحدث أولًا حسب ترتيب المدخل). */
export function notesForPage(notes: readonly Note[], page: PageInfo): PageNotes {
  const byLevel: Record<NoteLevel, Note[]> = { repo: [], thread: [], commit: [], file: [], line: [] };
  const relations = new Map<string, Relation>();
  let total = 0;
  for (const note of notes) {
    const relation = relationTo(note, page);
    if (!relation) continue;
    byLevel[note.target.level].push(note);
    relations.set(note.id, relation);
    total += 1;
  }
  return { byLevel, relations, total };
}

/** ملاحظات المستودع الحالي كلها على أي مستوى (للوحة الجانبية). */
export function notesForRepo(notes: readonly Note[], page: PageInfo): Note[] {
  return notes.filter((note) => sameRepo(note.target, page));
}

/** المستوى الأخص المتاح للإنشاء، وهو المحدد افتراضيًا. */
export function defaultLevel(options: readonly TargetOption[]): NoteLevel {
  for (const level of ['line', 'file', 'commit', 'thread', 'repo'] as const) {
    const option = options.find((o) => o.level === level);
    if (option?.target) return level;
  }
  return 'repo';
}


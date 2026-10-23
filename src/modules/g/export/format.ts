// صيغة تصدير الملاحظات والروابط المحفوظة (T-8.4، F-G4): JSON مهيكل كامل للنسخ الاحتياطي والاستعادة، وMarkdown مقروء للأرشفة والمشاركة.
// دوال خالصة لا تقرأ تخزينًا ولا تكتب فيه ولا تتصل بشبكة (F-G5):
//  - parseBundle يفحص الملف فحصًا صارمًا ويرفضه كاملًا عند أول سجل لا يصح، فلا يُكتب شيء من ملف تالف (AC-G4).
//  - الملح المحلي للمراسي (SaltRecord) لا يدخل التصدير إلا بطلب صريح (includeSalt)، ولا يدخل Markdown أبدًا (DEC-05).
import { isLineAnchor } from '../anchor/types';
import type { LineAnchor } from '../anchor/types';
import { BOOKMARK_LEVEL_LABELS, STATUS_LABELS, describePosition, isBookmark } from '../bookmarks/types';
import type { Bookmark } from '../bookmarks/types';
import { ANCHOR_LABELS, LEVEL_LABELS, describeTarget, isNote } from '../notes/types';
import type { Note } from '../notes/types';

export const EXPORT_FORMAT_NAME = 'mijhar-notes-export';
export const EXPORT_VERSION = 1;
/** سقف عدد السجلات من كل صنف في ملف واحد: يمنع ملفًا هائلًا من استهلاك ذاكرة الخلفية. */
export const MAX_EXPORT_ITEMS = 20000;
/** سقف حجم الملف المقروء بالأحرف قبل التحليل. */
export const MAX_IMPORT_CHARS = 10_000_000;

export type ExportScope = { readonly kind: 'all' } | { readonly kind: 'repo'; readonly owner: string; readonly repo: string };

/** الملح المحلي للمراسي كما يُخزَّن (anchor-salt). */
export interface SaltRecord {
  readonly salt: string;
  readonly createdAt: string;
}

export interface ExportBundle {
  readonly format: typeof EXPORT_FORMAT_NAME;
  readonly version: typeof EXPORT_VERSION;
  readonly exportedAt: string;
  readonly scope: ExportScope;
  readonly notes: readonly Note[];
  readonly anchors: readonly LineAnchor[];
  readonly bookmarks: readonly Bookmark[];
  /** حاضر فقط إن طلب المستخدم تضمينه. */
  readonly salt?: SaltRecord;
}

/** ما يُقرأ من التخزين ويُبنى منه التصدير. */
export interface ExportSource {
  readonly notes: readonly Note[];
  readonly anchors: readonly LineAnchor[];
  readonly bookmarks: readonly Bookmark[];
  readonly salt: SaltRecord | null;
}

export interface BuildOptions {
  readonly scope?: ExportScope;
  readonly includeSalt?: boolean;
  readonly now?: () => Date;
}

const sameRepo = (a: { owner: string | null; repo: string | null }, scope: { owner: string; repo: string }): boolean =>
  a.owner !== null && a.repo !== null && a.owner.toLowerCase() === scope.owner.toLowerCase() && a.repo.toLowerCase() === scope.repo.toLowerCase();

export const noteInScope = (note: Note, scope: ExportScope): boolean => scope.kind === 'all' || sameRepo(note.target, scope);
export const bookmarkInScope = (bookmark: Bookmark, scope: ExportScope): boolean => scope.kind === 'all' || sameRepo(bookmark, scope);

const byCreated = (a: Note, b: Note): number => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt));
const bySaved = (a: Bookmark, b: Bookmark): number => (a.savedAt === b.savedAt ? a.id.localeCompare(b.id) : a.savedAt.localeCompare(b.savedAt));

/** يبني حزمة التصدير من المصدر بترتيب حتمي. المراسي تتبع ملاحظاتها المضمَّنة فلا مرساة بلا ملاحظة. */
export function buildBundle(source: ExportSource, options: BuildOptions = {}): ExportBundle {
  const scope = options.scope ?? { kind: 'all' };
  const notes = source.notes.filter((note) => noteInScope(note, scope)).sort(byCreated);
  const ids = new Set(notes.map((note) => note.id));
  const anchors = source.anchors.filter((anchor) => ids.has(anchor.noteId)).sort((a, b) => a.noteId.localeCompare(b.noteId));
  const bookmarks = source.bookmarks.filter((bookmark) => bookmarkInScope(bookmark, scope)).sort(bySaved);
  const salt = options.includeSalt && source.salt ? source.salt : null;
  return {
    format: EXPORT_FORMAT_NAME,
    version: EXPORT_VERSION,
    exportedAt: (options.now ?? (() => new Date()))().toISOString(),
    scope,
    notes,
    anchors,
    bookmarks,
    ...(salt ? { salt } : {}),
  };
}

export const serializeJson = (bundle: ExportBundle): string => `${JSON.stringify(bundle, null, 2)}\n`;

export interface BundleCounts {
  readonly notes: number;
  readonly anchors: number;
  readonly bookmarks: number;
}

export const countsOf = (bundle: Pick<ExportBundle, 'notes' | 'anchors' | 'bookmarks'>): BundleCounts => ({
  notes: bundle.notes.length,
  anchors: bundle.anchors.length,
  bookmarks: bundle.bookmarks.length,
});

// ---------- الفحص الصارم ----------

export type ParseResult = { readonly ok: true; readonly bundle: ExportBundle } | { readonly ok: false; readonly errors: readonly string[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
// المعرّف جزء من اسم السجل (notes.<id> وbookmarks.<id> وanchors.<id>): الحروف التي يقبلها Store في الأسماء.
const isRecordId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value);
const TOP_KEYS = ['format', 'version', 'exportedAt', 'scope', 'notes', 'anchors', 'bookmarks', 'salt'];
const MAX_ERRORS = 8;

export function isSaltRecord(value: unknown): value is SaltRecord {
  return isRecord(value) && typeof value.salt === 'string' && /^[0-9a-f]{64}$/.test(value.salt) && typeof value.createdAt === 'string' && value.createdAt.length > 0;
}

function parseScope(value: unknown): ExportScope | null {
  if (!isRecord(value)) return null;
  if (value.kind === 'all') return Object.keys(value).length === 1 ? { kind: 'all' } : null;
  if (value.kind === 'repo' && typeof value.owner === 'string' && value.owner && typeof value.repo === 'string' && value.repo && Object.keys(value).length === 3) {
    return { kind: 'repo', owner: value.owner, repo: value.repo };
  }
  return null;
}

/**
 * يفحص نص الملف أو كائنه. أي خلل (صيغة أو إصدار أو سجل لا يجتاز مخططه أو معرّف مكرر أو مرساة بلا ملاحظة سطر) يرفض الملف كاملًا.
 * الإصدار الأقدم من الحالي يُقبل إن عُرف؛ والأحدث يُرفض بطلب تحديث الإضافة.
 */
export function parseBundle(input: unknown): ParseResult {
  let value: unknown = input;
  if (typeof input === 'string') {
    if (input.length > MAX_IMPORT_CHARS) return { ok: false, errors: ['الملف أكبر من الحد المسموح للاستيراد'] };
    try {
      value = JSON.parse(input);
    } catch {
      return { ok: false, errors: ['الملف ليس JSON صالحًا'] };
    }
  }
  if (!isRecord(value)) return { ok: false, errors: ['الملف ليس كائنًا يحمل نسخة مِجهَر الاحتياطية'] };
  if (value.format !== EXPORT_FORMAT_NAME) return { ok: false, errors: [`صيغة الملف غير معروفة (المتوقع ${EXPORT_FORMAT_NAME})`] };
  if (typeof value.version !== 'number' || !Number.isInteger(value.version) || value.version < 1) return { ok: false, errors: ['إصدار المخطط في الملف غير صالح'] };
  if (value.version > EXPORT_VERSION) return { ok: false, errors: [`الملف بإصدار مخطط أحدث (${value.version}) من المدعوم (${EXPORT_VERSION})؛ حدّث الإضافة ثم أعد المحاولة`] };

  const errors: string[] = [];
  const fail = (message: string): void => void (errors.length < MAX_ERRORS && errors.push(message));
  for (const key of Object.keys(value)) if (!TOP_KEYS.includes(key)) fail(`حقل غير معروف في الملف: ${key}`);
  if (typeof value.exportedAt !== 'string' || !value.exportedAt) fail('تاريخ التصدير مفقود');
  const scope = parseScope(value.scope);
  if (!scope) fail('نطاق التصدير غير صالح');
  for (const key of ['notes', 'anchors', 'bookmarks'] as const) {
    if (!Array.isArray(value[key])) fail(`قائمة ${key} مفقودة أو ليست قائمة`);
    else if ((value[key] as unknown[]).length > MAX_EXPORT_ITEMS) fail(`قائمة ${key} أطول من الحد (${MAX_EXPORT_ITEMS})`);
  }
  if (value.salt !== undefined && !isSaltRecord(value.salt)) fail('الملح المحلي في الملف غير صالح');
  if (errors.length) return { ok: false, errors };

  const notes = value.notes as unknown[];
  const anchors = value.anchors as unknown[];
  const bookmarks = value.bookmarks as unknown[];
  const noteIds = new Map<string, Note>();
  notes.forEach((item, i) => {
    if (!isNote(item) || !isRecordId(item.id)) return fail(`ملاحظة رقم ${i + 1} غير صالحة`);
    if (noteIds.has(item.id)) return fail(`معرّف ملاحظة مكرر: ${item.id}`);
    noteIds.set(item.id, item);
  });
  const seenAnchors = new Set<string>();
  anchors.forEach((item, i) => {
    if (!isLineAnchor(item) || !isRecordId(item.noteId)) return fail(`مرساة رقم ${i + 1} غير صالحة`);
    if (seenAnchors.has(item.noteId)) return fail(`مرساة مكررة للملاحظة ${item.noteId}`);
    seenAnchors.add(item.noteId);
    const owner = noteIds.get(item.noteId);
    if (!owner) return fail(`مرساة بلا ملاحظة في الملف: ${item.noteId}`);
    if (owner.target.level !== 'line') fail(`مرساة لملاحظة ليست سطرًا: ${item.noteId}`);
  });
  const seenBookmarks = new Set<string>();
  bookmarks.forEach((item, i) => {
    if (!isBookmark(item) || !isRecordId(item.id)) return fail(`رابط محفوظ رقم ${i + 1} غير صالح`);
    if (seenBookmarks.has(item.id)) return fail(`معرّف رابط مكرر: ${item.id}`);
    seenBookmarks.add(item.id);
  });
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    bundle: {
      format: EXPORT_FORMAT_NAME,
      version: EXPORT_VERSION,
      exportedAt: value.exportedAt as string,
      scope: scope as ExportScope,
      notes: notes as Note[],
      anchors: anchors as LineAnchor[],
      bookmarks: bookmarks as Bookmark[],
      ...(value.salt ? { salt: value.salt as SaltRecord } : {}),
    },
  };
}

// ---------- Markdown ----------

const escapeInline = (text: string): string => text.replace(/\r?\n/g, ' ').replace(/([\\`*_{}[\]<>#|])/g, '\\$1').trim();
const quote = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n');

function repoOfNote(note: Note): string {
  return `${note.target.owner}/${note.target.repo}`;
}

function repoOfBookmark(bookmark: Bookmark): string {
  return bookmark.owner && bookmark.repo ? `${bookmark.owner}/${bookmark.repo}` : 'صفحات GitHub الأخرى';
}

function noteBlock(note: Note, anchor: LineAnchor | undefined): string {
  const status = note.target.level === 'line' ? `؛ حالة المرساة: ${ANCHOR_LABELS[note.anchorStatus]}` : '';
  const lines = [
    `#### ${LEVEL_LABELS[note.target.level]}: ${escapeInline(describeTarget(note.target))}`,
    '',
    `- أُنشئت: ${note.createdAt}؛ عُدّلت: ${note.updatedAt}${status}`,
    ...(note.url ? [`- الرابط: <${note.url}>`] : []),
    ...(anchor ? [`- المرساة: ${anchor.fingerprint?.mode === 'text' ? 'مقتطف السطر محفوظ نصًّا (مستودع عام)' : anchor.fingerprint ? 'بصمة مجزّأة بلا نص' : 'بلا بصمة'}`] : []),
    '',
    quote(note.text),
  ];
  return lines.join('\n');
}

function bookmarkBlock(bookmark: Bookmark): string {
  const title = escapeInline(bookmark.title ?? bookmark.url);
  const position = describePosition(bookmark.position);
  const facts = [STATUS_LABELS[bookmark.status], BOOKMARK_LEVEL_LABELS[bookmark.level], ...(bookmark.branch ? [`الفرع/المرجع: ${bookmark.branch}`] : []), ...(position ? [position] : []), `حُفظ: ${bookmark.savedAt}`];
  const tags = bookmark.tags.length ? `\n- الوسوم: ${bookmark.tags.map((tag) => `\`${tag.replace(/`/g, '')}\``).join('، ')}` : '';
  const note = bookmark.note ? `\n\n${quote(bookmark.note)}` : '';
  return `- [${title}](${bookmark.url}) — ${facts.join('؛ ')}${tags}${note}`;
}

/** Markdown مقروء للأرشفة: مجموعات بالمستودع، وبلا مفاتيح سرّ ولا ملح ولا بصمات (للقراءة لا للاستعادة). */
export function toMarkdown(bundle: ExportBundle): string {
  const anchors = new Map(bundle.anchors.map((anchor) => [anchor.noteId, anchor]));
  const repos = new Set<string>();
  for (const note of bundle.notes) repos.add(repoOfNote(note));
  for (const bookmark of bundle.bookmarks) repos.add(repoOfBookmark(bookmark));
  const scope = bundle.scope.kind === 'all' ? 'كل المستودعات' : `${bundle.scope.owner}/${bundle.scope.repo}`;
  const out = [
    '# ملاحظات مِجهَر وروابط «أكمل لاحقًا»',
    '',
    `- تاريخ التصدير: ${bundle.exportedAt}`,
    `- النطاق: ${scope}`,
    `- العدد: ${bundle.notes.length} ملاحظة، ${bundle.bookmarks.length} رابطًا محفوظًا`,
    '',
    '> هذا الملف للقراءة والأرشفة. للاستعادة داخل مِجهَر استعمل تصدير JSON الكامل.',
  ];
  for (const repo of [...repos].sort((a, b) => a.localeCompare(b))) {
    out.push('', `## ${repo}`);
    const notes = bundle.notes.filter((note) => repoOfNote(note) === repo);
    if (notes.length) {
      out.push('', '### الملاحظات');
      for (const note of notes) out.push('', noteBlock(note, anchors.get(note.id)));
    }
    const bookmarks = bundle.bookmarks.filter((bookmark) => repoOfBookmark(bookmark) === repo);
    if (bookmarks.length) {
      out.push('', '### أكمل لاحقًا', '');
      for (const bookmark of bookmarks) out.push(bookmarkBlock(bookmark));
    }
  }
  return `${out.join('\n')}\n`;
}

/** اسم ملف التصدير: التاريخ والنطاق والصيغة. */
export function exportFileName(bundle: Pick<ExportBundle, 'exportedAt' | 'scope'>, format: 'json' | 'md'): string {
  const day = bundle.exportedAt.slice(0, 10) || 'export';
  const scope = bundle.scope.kind === 'all' ? 'all' : `${bundle.scope.owner}-${bundle.scope.repo}`.replace(/[^A-Za-z0-9._-]/g, '_');
  return `mijhar-notes-${scope}-${day}.${format}`;
}

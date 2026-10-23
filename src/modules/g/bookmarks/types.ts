// نموذج الرابط المحفوظ (T-8.2، F-G2): زر الحفظ السريع يحفظ الرابط والعنوان وowner/repo والفرع وموضع التمرير أو السطر وتاريخ الحفظ
// ووسم الحالة والوسوم والملاحظة السريعة. كل رابط سجل مستقل (bookmarks.<id>) كالملاحظات، فلا تتنازع كتابتان لرابطين من سياقين.
import type { RefKind } from '../../../shared/page';
import { NOTE_LEVELS } from '../notes/types';
import type { NoteLevel } from '../notes/types';

export const BOOKMARK_STATUSES = ['reading', 'review', 'awaiting', 'done'] as const;
export type BookmarkStatus = (typeof BOOKMARK_STATUSES)[number];

export const STATUS_LABELS: Readonly<Record<BookmarkStatus, string>> = {
  reading: 'قيد القراءة',
  review: 'للمراجعة',
  awaiting: 'بانتظار رد',
  done: 'مكتمل',
};

/** مستوى الرابط كمستويات الملاحظات، وpage لصفحة GitHub خارج مستودع (بحث أو حساب). */
export const BOOKMARK_LEVELS = [...NOTE_LEVELS, 'page'] as const;
export type BookmarkLevel = NoteLevel | 'page';

export const BOOKMARK_LEVEL_LABELS: Readonly<Record<BookmarkLevel, string>> = {
  repo: 'المستودع',
  thread: 'طلب دمج أو مشكلة',
  commit: 'الالتزام',
  file: 'الملف',
  line: 'سطر أو نطاق',
  page: 'صفحة أخرى',
};

/** موضع العودة: السطر أو النطاق المحدد (من هاش الرابط)، أو موضع التمرير (يُعرف في الصفحة نفسها لا في اللوحة الأصلية). */
export type BookmarkPosition =
  | { readonly kind: 'lines'; readonly start: number; readonly end: number; readonly side?: 'L' | 'R' }
  | { readonly kind: 'scroll'; readonly y: number; readonly ratio: number };

export const BOOKMARK_SCHEMA_VERSION = 1;
export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 40;
export const MAX_QUICK_NOTE_LENGTH = 2000;
export const MAX_TITLE_LENGTH = 300;

export interface Bookmark {
  readonly id: string;
  readonly version: typeof BOOKMARK_SCHEMA_VERSION;
  readonly url: string;
  readonly title: string | null;
  readonly owner: string | null;
  readonly repo: string | null;
  /** الفرع أو المرجع الظاهر وقت الحفظ (sha حين يكون المرجع التزامًا)، أو null إن لم يُعرف. */
  readonly branch: string | null;
  readonly refKind: RefKind;
  readonly level: BookmarkLevel;
  readonly position: BookmarkPosition | null;
  readonly status: BookmarkStatus;
  readonly tags: readonly string[];
  readonly note: string;
  readonly savedAt: string;
  readonly updatedAt: string;
}

export interface BookmarkDraft {
  readonly url: string;
  readonly title: string | null;
  readonly owner: string | null;
  readonly repo: string | null;
  readonly branch: string | null;
  readonly refKind: RefKind;
  readonly level: BookmarkLevel;
  readonly position: BookmarkPosition | null;
  readonly status?: BookmarkStatus;
  readonly tags?: readonly string[];
  readonly note?: string;
}

export interface BookmarkPatch {
  readonly status?: BookmarkStatus;
  readonly tags?: readonly string[];
  readonly note?: string;
  readonly title?: string | null;
  readonly position?: BookmarkPosition | null;
  readonly branch?: string | null;
}

export const BOOKMARK_PREFIX = 'bookmarks.';
export const bookmarkRecordName = (id: string): string => `${BOOKMARK_PREFIX}${id}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isNullableText = (value: unknown): value is string | null => value === null || isText(value);
const isLine = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1;

export const isBookmarkStatus = (value: unknown): value is BookmarkStatus => (BOOKMARK_STATUSES as readonly unknown[]).includes(value);
export const isBookmarkLevel = (value: unknown): value is BookmarkLevel => (BOOKMARK_LEVELS as readonly unknown[]).includes(value);

export function isBookmarkPosition(value: unknown): value is BookmarkPosition {
  if (!isRecord(value)) return false;
  if (value.kind === 'lines') {
    return isLine(value.start) && isLine(value.end) && (value.start as number) <= (value.end as number) && (value.side === undefined || value.side === 'L' || value.side === 'R');
  }
  if (value.kind === 'scroll') {
    return typeof value.y === 'number' && Number.isFinite(value.y) && value.y >= 0 && typeof value.ratio === 'number' && value.ratio >= 0 && value.ratio <= 1;
  }
  return false;
}

export function isTagList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= MAX_TAGS && value.every((t) => isText(t) && t.length <= MAX_TAG_LENGTH);
}

export function isBookmark(value: unknown): value is Bookmark {
  if (!isRecord(value)) return false;
  return (
    isText(value.id) &&
    value.version === BOOKMARK_SCHEMA_VERSION &&
    typeof value.url === 'string' &&
    value.url.startsWith('https://github.com/') &&
    (value.title === null || (typeof value.title === 'string' && value.title.length <= MAX_TITLE_LENGTH)) &&
    isNullableText(value.owner) &&
    isNullableText(value.repo) &&
    isNullableText(value.branch) &&
    (value.refKind === 'sha' || value.refKind === 'ref' || value.refKind === 'unknown') &&
    isBookmarkLevel(value.level) &&
    (value.position === null || isBookmarkPosition(value.position)) &&
    isBookmarkStatus(value.status) &&
    isTagList(value.tags) &&
    typeof value.note === 'string' &&
    value.note.length <= MAX_QUICK_NOTE_LENGTH &&
    isText(value.savedAt) &&
    isText(value.updatedAt)
  );
}

/** الوسوم من نص يكتبه المستخدم (فاصلة عربية أو لاتينية أو سطر): بلا تكرار ولا فراغ، بحدود العدد والطول. */
export function parseTags(input: string | readonly string[]): string[] {
  const parts = typeof input === 'string' ? input.split(/[,،\n]/) : input;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const tag = part.replace(/\s+/g, ' ').trim().replace(/^#/, '').slice(0, MAX_TAG_LENGTH).trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** هوية الصفحة للرابط المحفوظ: الرابط بلا الهاش (الهاش موضع لا صفحة). */
export function pageKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return url.split('#', 1)[0] ?? url;
  }
}

export function describePosition(position: BookmarkPosition | null): string | null {
  if (!position) return null;
  if (position.kind === 'lines') {
    const side = position.side ? (position.side === 'L' ? 'القديم ' : 'الجديد ') : '';
    return `${side}${position.start === position.end ? `السطر ${position.start}` : `الأسطر ${position.start}–${position.end}`}`;
  }
  return `موضع التمرير ${Math.round(position.ratio * 100)}%`;
}

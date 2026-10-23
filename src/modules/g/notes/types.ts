// نموذج الملاحظة الخاصة (T-8.1، F-G1): خمسة مستويات، وحالة المرساة حقل مستقل عن نصها.
// كل ملاحظة سجل مستقل في التخزين (notes.<id>) فلا تتنازع كتابتان لملاحظتين مختلفتين من سياقين، كما في الإعدادات.
import type { RefKind } from '../../../shared/page';

export const NOTE_LEVELS = ['repo', 'thread', 'commit', 'file', 'line'] as const;
export type NoteLevel = (typeof NOTE_LEVELS)[number];

/**
 * حالة المرساة. تكتبها هذه المرحلة: not-applicable (مستوى بلا موضع)، وunverified (موضع السطر كما كان وقت الحفظ ولم يُتحقق منه
 * بعد)، وunanchored (تعذّر تحديد موضع السطر في الصفحة؛ الملاحظة محفوظة ولا تُربط بسطر). وتحجز القيم الست لإعادة التثبيت (T-8.3)
 * فلا يلزم ترحيل مخطط: matched=A، shifted=B، ambiguous=C، changed=D، resource-unavailable=E، access-lost=F.
 */
export const ANCHOR_STATUSES = [
  'not-applicable',
  'unverified',
  'unanchored',
  'matched',
  'shifted',
  'ambiguous',
  'changed',
  'resource-unavailable',
  'access-lost',
] as const;
export type AnchorStatus = (typeof ANCHOR_STATUSES)[number];

interface RepoScoped {
  readonly owner: string;
  readonly repo: string;
}

export interface RepoTarget extends RepoScoped {
  readonly level: 'repo';
}

export interface ThreadTarget extends RepoScoped {
  readonly level: 'thread';
  readonly kind: 'pr' | 'issue';
  readonly number: number;
}

export interface CommitTarget extends RepoScoped {
  readonly level: 'commit';
  readonly sha: string;
}

export interface FileTarget extends RepoScoped {
  readonly level: 'file';
  readonly ref: string;
  readonly refKind: RefKind;
  readonly path: string;
}

/** سطر أو نطاق في صفحة عرض ملف (#L10-L25). */
export interface BlobLineTarget extends RepoScoped {
  readonly level: 'line';
  readonly view: 'blob';
  readonly ref: string;
  readonly refKind: RefKind;
  readonly path: string;
  readonly start: number;
  readonly end: number;
}

export type DiffContext = { readonly kind: 'pr'; readonly number: number } | { readonly kind: 'commit'; readonly sha: string };

/** سطر أو نطاق في صفحة فروق (ملفات طلب دمج أو التزام)، في جهة L (القديم) أو R (الجديد). */
export interface DiffLineTarget extends RepoScoped {
  readonly level: 'line';
  readonly view: 'diff';
  readonly context: DiffContext;
  readonly path: string;
  readonly side: 'L' | 'R';
  readonly start: number;
  readonly end: number;
}

export type LineTarget = BlobLineTarget | DiffLineTarget;
export type NoteTarget = RepoTarget | ThreadTarget | CommitTarget | FileTarget | LineTarget;

export const NOTE_SCHEMA_VERSION = 1;
/** سقف نص الملاحظة بالأحرف: يمنع ملاحظة واحدة من استهلاك حصة التخزين. */
export const MAX_NOTE_LENGTH = 20000;

export interface Note {
  readonly id: string;
  readonly version: typeof NOTE_SCHEMA_VERSION;
  readonly target: NoteTarget;
  readonly text: string;
  /** حقل مستقل عن النص: تعديل أحدهما لا يمس الآخر. */
  readonly anchorStatus: AnchorStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  /** رابط الصفحة وعنوانها وقت الحفظ، لعرضهما في القوائم. */
  readonly url: string;
  readonly title: string | null;
}

export interface NoteDraft {
  readonly target: NoteTarget;
  readonly text: string;
  readonly url: string;
  readonly title?: string | null;
  /** الافتراضي not-applicable لمستوى بلا موضع، وunverified للسطر. */
  readonly anchorStatus?: AnchorStatus;
}

export interface NotePatch {
  readonly text?: string;
  readonly anchorStatus?: AnchorStatus;
}

export const NOTE_PREFIX = 'notes.';
export const noteRecordName = (id: string): string => `${NOTE_PREFIX}${id}`;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isLine = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1;
const isRefKind = (value: unknown): value is RefKind => value === 'sha' || value === 'ref' || value === 'unknown';

function isRange(target: Record<string, unknown>): boolean {
  return isLine(target.start) && isLine(target.end) && (target.start as number) <= (target.end as number);
}

export function isNoteTarget(value: unknown): value is NoteTarget {
  if (!isRecord(value) || !isText(value.owner) || !isText(value.repo)) return false;
  switch (value.level) {
    case 'repo':
      return true;
    case 'thread':
      return (value.kind === 'pr' || value.kind === 'issue') && isLine(value.number);
    case 'commit':
      return isText(value.sha);
    case 'file':
      return isText(value.ref) && isRefKind(value.refKind) && isText(value.path);
    case 'line': {
      if (!isText(value.path) || !isRange(value)) return false;
      if (value.view === 'blob') return isText(value.ref) && isRefKind(value.refKind);
      if (value.view !== 'diff' || (value.side !== 'L' && value.side !== 'R') || !isRecord(value.context)) return false;
      return (value.context.kind === 'pr' && isLine(value.context.number)) || (value.context.kind === 'commit' && isText(value.context.sha));
    }
    default:
      return false;
  }
}

export function isNote(value: unknown): value is Note {
  if (!isRecord(value)) return false;
  return (
    isText(value.id) &&
    value.version === NOTE_SCHEMA_VERSION &&
    isNoteTarget(value.target) &&
    typeof value.text === 'string' &&
    value.text.length <= MAX_NOTE_LENGTH &&
    (ANCHOR_STATUSES as readonly unknown[]).includes(value.anchorStatus) &&
    isText(value.createdAt) &&
    isText(value.updatedAt) &&
    typeof value.url === 'string' &&
    (value.title === null || typeof value.title === 'string')
  );
}

export const LEVEL_LABELS: Readonly<Record<NoteLevel, string>> = {
  repo: 'المستودع',
  thread: 'طلب دمج أو مشكلة',
  commit: 'الالتزام',
  file: 'الملف',
  line: 'سطر أو نطاق',
};

export const ANCHOR_LABELS: Readonly<Record<AnchorStatus, string>> = {
  'not-applicable': 'بلا موضع',
  unverified: 'موضع غير متحقق منه',
  unanchored: 'غير مثبتة',
  matched: 'مطابق',
  shifted: 'منزاح',
  ambiguous: 'ملتبس',
  changed: 'متغيّر',
  'resource-unavailable': 'المورد غير متاح',
  'access-lost': 'تعذّر التحقق',
};

const rangeLabel = (target: LineTarget): string => (target.start === target.end ? `${target.start}` : `${target.start}–${target.end}`);

/** وصف قصير للهدف يُعرض في القوائم. */
export function describeTarget(target: NoteTarget): string {
  const slug = `${target.owner}/${target.repo}`;
  switch (target.level) {
    case 'repo':
      return slug;
    case 'thread':
      return `${slug}#${target.number}`;
    case 'commit':
      return `${slug}@${target.sha.slice(0, 7)}`;
    case 'file':
      return `${slug}: ${target.path}`;
    case 'line':
      return `${slug}: ${target.path} (${target.view === 'diff' ? `${target.side === 'L' ? 'القديم' : 'الجديد'} ` : ''}${rangeLabel(target)})`;
  }
}

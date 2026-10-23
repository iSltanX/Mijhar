// مرساة السطر الاحتمالية (T-8.3، F-G3): ما يُحفظ لملاحظة سطر في صفحة ملف لإعادة تثبيتها لاحقًا على الصفحة المفتوحة دون شبكة.
// المرساة مزدوجة: رابط الفرع، ورابط ثابت على الالتزام حين يُستخرج (refInfo.currentOid، مقيس في evidence/T-0.4)، وبصمة للسطر
// وسياقه ±2. صيغة البصمة بحسب DEC-05 (ز-1): نص في المستودع العام، وSHA-256 بملح محلي في الخاص أو ما لم يثبت أنه عام.
// كل مرساة سجل مستقل (anchors.<noteId>) بجانب الملاحظة، فلا يتغير مخطط الملاحظات (T-8.1).
import type { RefKind } from '../../../shared/page';

export const ANCHOR_SCHEMA_VERSION = 1;
/** أطول نطاق تُحفظ له بصمة؛ ما زاد يُحفظ موضعه ولا يُتحقق منه. */
export const MAX_ANCHOR_LINES = 40;
/** طول السطر المقارن بعد التطبيع؛ ما زاد يُقتطع في الحفظ والمقارنة معًا. */
export const MAX_LINE_CHARS = 1000;
export const CONTEXT_LINES = 2;

export type Visibility = 'public' | 'private';

/** أسطر النطاق وسياقه ±2. null في السياق: لا سطر هناك (قبل أول الملف أو بعد آخره). */
interface FingerprintLines {
  readonly block: readonly string[];
  readonly before: readonly (string | null)[];
  readonly after: readonly (string | null)[];
}

export type Fingerprint = (FingerprintLines & { readonly mode: 'text' }) | (FingerprintLines & { readonly mode: 'hash'; readonly saltId: string });

/** لماذا لا بصمة: عرض بلا أسطر (Markdown معروض أو ملف ثنائي)، أو نطاق أطول من الحد، أو أسطر النطاق غير ظاهرة في الصفحة. */
export type NoFingerprintReason = 'rendered' | 'range-too-long' | 'lines-missing';

export interface LineAnchor {
  readonly noteId: string;
  readonly version: typeof ANCHOR_SCHEMA_VERSION;
  readonly owner: string;
  readonly repo: string;
  readonly path: string;
  readonly ref: string;
  readonly refKind: RefKind;
  /** معرّف الالتزام الظاهر وقت الحفظ، أو null إن لم يُستخرج. */
  readonly commit: string | null;
  readonly start: number;
  readonly end: number;
  readonly visibility: Visibility;
  readonly fingerprint: Fingerprint | null;
  readonly missing: NoFingerprintReason | null;
  readonly capturedAt: string;
}

export const ANCHOR_PREFIX = 'anchors.';
export const anchorRecordName = (noteId: string): string => `${ANCHOR_PREFIX}${noteId}`;
export const SALT_RECORD = 'anchor-salt';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isLine = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1;
const isLineList = (value: unknown, nullable: boolean): boolean =>
  Array.isArray(value) && value.every((v) => typeof v === 'string' || (nullable && v === null));

function isFingerprint(value: unknown): value is Fingerprint {
  if (!isRecord(value)) return false;
  if (!isLineList(value.block, false) || !isLineList(value.before, true) || !isLineList(value.after, true)) return false;
  if ((value.block as unknown[]).length === 0 || (value.before as unknown[]).length !== CONTEXT_LINES || (value.after as unknown[]).length !== CONTEXT_LINES) return false;
  return value.mode === 'text' || (value.mode === 'hash' && isText(value.saltId));
}

export function isLineAnchor(value: unknown): value is LineAnchor {
  if (!isRecord(value)) return false;
  return (
    isText(value.noteId) &&
    value.version === ANCHOR_SCHEMA_VERSION &&
    isText(value.owner) &&
    isText(value.repo) &&
    isText(value.path) &&
    isText(value.ref) &&
    (value.refKind === 'sha' || value.refKind === 'ref' || value.refKind === 'unknown') &&
    (value.commit === null || isText(value.commit)) &&
    isLine(value.start) &&
    isLine(value.end) &&
    (value.start as number) <= (value.end as number) &&
    (value.visibility === 'public' || value.visibility === 'private') &&
    (value.fingerprint === null ? value.missing === 'rendered' || value.missing === 'range-too-long' || value.missing === 'lines-missing' : isFingerprint(value.fingerprint) && value.missing === null) &&
    isText(value.capturedAt)
  );
}

const encodePath = (path: string): string => path.split('/').map(encodeURIComponent).join('/');
const lineHash = (start: number, end: number): string => (start === end ? `#L${start}` : `#L${start}-L${end}`);

/** رابط الملف على الفرع أو المرجع المحفوظ عند السطر. */
export function branchUrl(anchor: Pick<LineAnchor, 'owner' | 'repo' | 'ref' | 'path' | 'start' | 'end'>): string {
  return `https://github.com/${encodeURIComponent(anchor.owner)}/${encodeURIComponent(anchor.repo)}/blob/${encodePath(anchor.ref)}/${encodePath(anchor.path)}${lineHash(anchor.start, anchor.end)}`;
}

/** الرابط الثابت على الالتزام المحفوظ، أو null. محاولة لا ضمان: قد يزول بإعادة كتابة التاريخ أو حذف المستودع أو فقد الصلاحية. */
export function permalinkUrl(anchor: Pick<LineAnchor, 'owner' | 'repo' | 'commit' | 'path' | 'start' | 'end'>): string | null {
  if (!anchor.commit) return null;
  return `https://github.com/${encodeURIComponent(anchor.owner)}/${encodeURIComponent(anchor.repo)}/blob/${anchor.commit}/${encodePath(anchor.path)}${lineHash(anchor.start, anchor.end)}`;
}

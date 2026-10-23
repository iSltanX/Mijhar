// الإدراج الآمن في حقل الكتابة وحماية المسودة (F-F4 / AC-F4): النص يُدرج عند المؤشر أو يُلحق بالنهاية دون مسح حرف من المسودة، وتؤخذ لقطة تراجع قبل الإدراج،
// ويعمل «التراجع عن آخر إدراج» بإزالة ما أُدرج وحده. لا يُكتب value مباشرة (shared/fields): الإدراج بأمر التحرير insertText فيمر بسجل التراجع الأصلي ويطلق input كما
// لو كتب المستخدم فيراه GitHub، والإزالة بأمر delete على المدى نفسه. لا يُلمس شيء خارج الحقل: لا إرسال ولا نقر على زر نشر.
import { insertIntoField, restoreField, snapshotField } from '../../../shared/fields';
import type { FieldSnapshot, TextField } from '../../../shared/fields';

export type InsertMode = 'cursor' | 'append';

/** لقطة التراجع: المسودة (نصها وتحديدها وتمريرها) كما كانت قبل الإدراج. */
export interface UndoSnapshot {
  readonly value: string;
  readonly selection: FieldSnapshot;
}

export interface Insertion {
  readonly field: TextField;
  readonly mode: InsertMode;
  readonly snapshot: UndoSnapshot;
  /** ما أُدرج فعلًا (الكتلة مع فواصل الفقرات حولها). */
  readonly inserted: string;
  /** موضعها في الحقل. */
  readonly start: number;
  /** قيمة الحقل بعد الإدراج مباشرة. */
  readonly valueAfter: string;
  readonly method: 'execCommand' | 'setRangeText';
}

export interface Plan {
  readonly position: number;
  readonly prefix: string;
  readonly suffix: string;
}

/** أين تقع الكتلة وما يفصلها عما حولها: سطر فارغ قبلها وبعدها، وسطر جديد في آخر المسودة لتكملها بالكتابة. */
export function plan(value: string, selectionEnd: number | null, mode: InsertMode): Plan {
  const position = mode === 'append' ? value.length : Math.min(Math.max(selectionEnd ?? value.length, 0), value.length);
  const before = value.slice(0, position);
  const after = value.slice(position);
  const prefix = !before ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = !after ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  return { position, prefix, suffix };
}

/**
 * يدرج الكتلة. عند المؤشر: يطوى التحديد إلى طرفه الأخير فلا يُستبدل نص محدد. يعيد null للنص الفارغ دون أي مساس بالحقل.
 */
export function insertBlock(field: TextField, text: string, mode: InsertMode): Insertion | null {
  const block = text.replace(/\n+$/, '');
  if (!block.trim()) return null;
  const snapshot: UndoSnapshot = { value: field.value, selection: snapshotField(field) };
  const { position, prefix, suffix } = plan(field.value, field.selectionEnd, mode);
  const payload = `${prefix}${block}${suffix}`;
  field.setSelectionRange(position, position);
  const result = insertIntoField(field, payload);
  return { field, mode, snapshot, inserted: payload, start: position, valueAfter: field.value, method: result.method };
}

function dispatchInput(field: TextField, inputType: string, data: string | null): void {
  const View = field.ownerDocument.defaultView;
  const Ctor = View?.InputEvent ?? View?.Event ?? Event;
  field.dispatchEvent(new Ctor('input', { bubbles: true, inputType, data } as InputEventInit));
}

/** يزيل المدى [start, end) بأمر التحرير delete (سجل التراجع وحدث input الأصليان)، وإن رُفض فـsetRangeText وحدث input واحد. */
export function deleteRange(field: TextField, start: number, end: number): void {
  const doc = field.ownerDocument;
  const before = field.value;
  if (doc.activeElement !== field) field.focus({ preventScroll: true });
  field.setSelectionRange(start, end);
  let ok = false;
  try {
    ok = typeof doc.execCommand === 'function' && doc.execCommand('delete', false);
  } catch {
    ok = false;
  }
  if (ok && field.value !== before) return;
  field.setRangeText('', start, end, 'start');
  dispatchInput(field, 'deleteContentBackward', null);
}

export type UndoResult =
  /** عادت المسودة كما كانت قبل الإدراج حرفيًا. */
  | { readonly status: 'restored' }
  /** عُدّلت المسودة بعد الإدراج: أُزيلت الكتلة وحدها وبقيت التعديلات. */
  | { readonly status: 'removed'; readonly remaining: number }
  /** تعذّر: الكتلة المُدرجة نفسها تغيّرت، أو لم يثبت موضعها (تعديل قبلها وبعدها)، أو الحقل زال. previous: نص المسودة السابقة ليُنسخ. */
  | { readonly status: 'modified'; readonly previous: string };

/**
 * موضع المُدرج الآن إن ثبتت ملكيته (VR-02)، أو -1. يُقبل موضعه الأصلي إن لم يتغير شيء قبله، أو موضعه مزاحًا بفرق الطول إن لم يتغير
 * شيء بعده؛ وفي الحالين نصه نفسه في ذلك الموضع. لا بحث في الحقل كله: كتلة مطابقة كانت في المسودة ليست المُدرج.
 */
function ownedPosition(value: string, insertion: Insertion): number {
  const { inserted, start, valueAfter } = insertion;
  const end = start + inserted.length;
  const holds = (at: number): boolean => at >= 0 && value.slice(at, at + inserted.length) === inserted;
  if (value.slice(0, start) === valueAfter.slice(0, start) && holds(start)) return start;
  const shifted = start + (value.length - valueAfter.length);
  if (value.slice(shifted + inserted.length) === valueAfter.slice(end) && holds(shifted)) return shifted;
  return -1;
}

/** «التراجع عن آخر إدراج». */
export function undoInsertion(insertion: Insertion): UndoResult {
  const { field, snapshot, inserted, start } = insertion;
  if (!field.isConnected) return { status: 'modified', previous: snapshot.value };
  // تراجع المستخدم عنه بنفسه (Ctrl/⌘+Z الأصلي): المسودة عادت كما كانت، فلا شيء يُزال ولا تحذير.
  if (field.value === snapshot.value) return { status: 'restored' };
  if (field.value === insertion.valueAfter) {
    deleteRange(field, start, start + inserted.length);
    if (field.value === snapshot.value) {
      restoreField(field, snapshot.selection);
      return { status: 'restored' };
    }
  }
  // عُدّلت المسودة بعد الإدراج (أو رمّمها معالج الصفحة): تُزال الكتلة وحدها حيث هي الآن، إن ثبت أنها المُدرج نفسه. تعديل قبلها
  // وبعدها معًا لا يثبت الموضع، فيُعاد modified دون مساس (والمسودة السابقة تُنسخ).
  const at = ownedPosition(field.value, insertion);
  if (at === -1) return { status: 'modified', previous: snapshot.value };
  deleteRange(field, at, at + inserted.length);
  field.setSelectionRange(at, at);
  return { status: 'removed', remaining: field.value.length };
}

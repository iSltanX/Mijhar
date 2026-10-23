// تنفيذ إدراجات القالب في الحقل (F-F2 / F-F4): كل إدراج بالإدراج الآمن نفسه (أمر التحرير insertText، فيمر بسجل التراجع الأصلي ويطلق input موثوقًا)، من الأدنى
// موضعًا إلى الأعلى كي لا ينزاح فهرس سابق، فالمسودة الناتجة تطابق المعاينة حرفيًا. التراجع بترتيب عكسي (آخر إدراج أولًا)، وكل خطوة تتحقق من ملكيتها لما أدرجته
// (undoInsertion)، فلا يُزال إلا ما أدرجه المساعد وتبقى تعديلات المستخدم اللاحقة.
import { insertBlock, undoInsertion } from '../composer/insert';
import type { Insertion, UndoResult } from '../composer/insert';
import type { TextField } from '../../../shared/fields';
import { applicationOrder } from './markdown';
import type { FillEdit } from './markdown';

/** يدرج كل تعديلات الخطة، ويعيد الإدراجات بترتيب تنفيذها. */
export function applyEdits(field: TextField, edits: readonly FillEdit[]): Insertion[] {
  const done: Insertion[] = [];
  for (const edit of applicationOrder(edits)) {
    field.setSelectionRange(Math.min(edit.index, field.value.length), Math.min(edit.index, field.value.length));
    const insertion = insertBlock(field, edit.text, 'cursor');
    if (insertion) done.push(insertion);
  }
  return done;
}

export type GroupUndo =
  /** عادت المسودة كما كانت قبل أول إدراج في المجموعة. */
  | { readonly status: 'restored' }
  /** أُزيلت الإدراجات وبقيت تعديلات المستخدم اللاحقة. */
  | { readonly status: 'removed' }
  /** توقف عند إدراج تغيّر نصه أو لم يثبت موضعه؛ remaining ما لم يُتراجع عنه. previous نص المسودة قبل المجموعة ليُنسخ. */
  | { readonly status: 'modified'; readonly remaining: number; readonly previous: string };

export function undoGroup(insertions: readonly Insertion[]): GroupUndo {
  if (!insertions.length) return { status: 'restored' };
  let removed = false;
  for (let i = insertions.length - 1; i >= 0; i -= 1) {
    const result: UndoResult = undoInsertion(insertions[i]!);
    if (result.status === 'modified') return { status: 'modified', remaining: i + 1, previous: insertions[0]!.snapshot.value };
    if (result.status === 'removed') removed = true;
  }
  return removed ? { status: 'removed' } : { status: 'restored' };
}

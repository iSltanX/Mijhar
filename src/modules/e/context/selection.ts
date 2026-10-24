// مقتطف دليل من تحديد المستخدم في الصفحة (T-6.1، جزء من الجامع): آخر نص حدّده خارج واجهتنا، ومصدره (تعليق بصاحبه، أو سجل المهمة، أو الصفحة).
// لا قسم يقرأ تحديد الصفحة ومصدره لنفسه؛ والمقتطف يدخل الطبقة من هنا ويمرّ بالمنقّح كغيره.
import { squash } from '../../d/pr-status/value';
import type { Snippet } from './collect';

/** النص المحدد في المستند ومصدره، أو null إن لم يكن تحديد أو كان داخل `exclude` (مضيف واجهتنا). */
export function readSelection(doc: Document, exclude: Node | null = null): Omit<Snippet, 'id'> | null {
  const selection = doc.getSelection();
  const text = selection?.toString().trim() ?? '';
  if (!text || !selection?.anchorNode) return null;
  const anchor = selection.anchorNode.nodeType === 1 ? (selection.anchorNode as Element) : selection.anchorNode.parentElement;
  if (!anchor || (exclude && exclude.contains(anchor))) return null;
  const comment = anchor.closest('.react-issue-comment, .js-comment-container, [data-testid="issue-body"]');
  const author = squash(comment?.querySelector('a.author, [data-testid="avatar-link"]')?.textContent);
  const where = comment ? (author ? `تعليق ${author}` : 'تعليق') : anchor.closest('#logs, check-steps, .CheckRun, annotation-message') ? 'سجل المهمة' : 'الصفحة';
  return { text, where };
}

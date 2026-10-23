// حقول الكتابة التي يخدمها المساعد في صفحات GitHub (T-0.1، BLK-GH-EDITOR-DOM): textarea يربطه شريط أدوات Markdown (<markdown-toolbar for=…>) في محرر React الجديد
// والتقليدي. حقل بلا شريط (تغيّر المحرر) يُلتقط بمحدداته الاحتياطية فيوضع الزر قبله في حاويته. CodeMirror وcontenteditable غير مدعومين فلا زر لهما.
import type { SelectorEntry } from '../../../core';
import type { TextField } from '../../../shared/fields';

export const COMPOSER_SELECTOR_KEYS = { toolbar: 'f.composer.toolbar', field: 'f.composer.field' } as const;

export const COMPOSER_SELECTORS: readonly SelectorEntry[] = [
  {
    key: COMPOSER_SELECTOR_KEYS.toolbar,
    description: 'شريط أدوات Markdown المرتبط بحقل الكتابة (for = معرّف textarea). T-0.1: موجود في محرر React الجديد والتقليدي',
    candidates: ['markdown-toolbar'],
  },
  {
    key: COMPOSER_SELECTOR_KEYS.field,
    description: 'حقل كتابة نصي بلا شريط أدوات (احتياطي إن تغيّر المحرر): textarea التعليق أو الوصف، أو حقل في نموذج Issue Form (T-7.2)',
    candidates: ['textarea[aria-label="Markdown value"]', 'textarea[name="issue[body]"]', 'textarea[name="pull_request[body]"]', 'textarea[name="comment[body]"]', 'textarea.js-comment-field', 'textarea[name^="issue_form["]'],
  },
];

/** محررات لا يظهر لها زر المساعد، وسببها (تُقاس في الاختبار). */
export const UNSUPPORTED_EDITORS: ReadonlyArray<{ readonly editor: string; readonly selector: string; readonly reason: string }> = [
  { editor: 'محرر الملفات (CodeMirror 6)', selector: '.cm-editor', reason: 'حقل contenteditable لا قيمة له (value) ولا سجل تراجع نصي يقبل أمر التحرير نفسه؛ الإدراج الآمن لـtextarea فقط.' },
];

/** حقل النص الذي يخدمه الشريط: بسمة for، وإلا textarea وحيد في أقرب حاوية مشتركة قريبة. */
export function fieldForToolbar(toolbar: Element): TextField | null {
  const doc = toolbar.ownerDocument;
  const id = toolbar.getAttribute('for');
  const byId = id ? doc.getElementById(id) : null;
  if (byId) return byId.localName === 'textarea' ? (byId as HTMLTextAreaElement) : null;
  let scope: Element | null = toolbar.parentElement;
  for (let depth = 0; scope && depth < 4; depth += 1, scope = scope.parentElement) {
    const fields = scope.querySelectorAll('textarea');
    if (fields.length === 1) return fields[0] as HTMLTextAreaElement;
    if (fields.length > 1) return null;
  }
  return null;
}

/** هل الحقل مما يُدعم: textarea ظاهر وقابل للكتابة خارج CodeMirror. */
export function isSupportedField(field: Element): field is HTMLTextAreaElement {
  return field.localName === 'textarea' && !(field as HTMLTextAreaElement).readOnly && !(field as HTMLTextAreaElement).disabled && !field.closest('.cm-editor, mijhar-host');
}

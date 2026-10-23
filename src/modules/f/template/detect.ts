// حارس «القالب أولًا» (F-F2 / AC-F2): يحدد ما أمام المساعد في الحقل المفتوح قبل أن يقترح شيئًا.
//  - issue-form: بلاغ بنموذج Issue Form (صفحة بلاغ جديد وحدها): لا يستبدل المساعد النموذج ولا يتجاوز حقوله، ويعمل دليلًا جانبيًا للحقل الذي فُتح منه.
//  - markdown: قالب Markdown في المسودة نفسها (قالب بلاغ أو طلب دمج): تبقى ترويساته وقوائم تحقيقه كما هي ويُدرج النص تحتها.
//  - unknown: قالب لا يُتعرَّف على هيكله: يُعرض النص في معاينة مع نسخ يدوي ولا يُدرج شيء في حقول الصفحة.
//  - none: لا قالب؛ يعمل المساعد كما في T-7.1.
import type { PageType } from '../../../core';
import type { TextField } from '../../../shared/fields';
import { analyzeForm } from './form';
import type { FormAnalysis } from './form';
import { isMarkdownTemplate, parseMarkdownTemplate } from './markdown';
import type { ParsedTemplate } from './markdown';

export type TemplateInfo =
  | { readonly kind: 'none' }
  | { readonly kind: 'issue-form'; readonly form: Extract<FormAnalysis, { status: 'form' }> }
  | { readonly kind: 'markdown'; readonly template: ParsedTemplate }
  | { readonly kind: 'unknown'; readonly reason: string };

export const NO_TEMPLATE: TemplateInfo = { kind: 'none' };

/** صفحات يظهر فيها النموذج: بلاغ جديد وحده (نماذج Issue Forms لا تكون في تعليق ولا في طلب دمج). */
const FORM_PAGES: ReadonlySet<PageType> = new Set<PageType>(['issue-new']);

export function detectTemplate(field: TextField, pageType: PageType): TemplateInfo {
  if (field.localName === 'textarea' && FORM_PAGES.has(pageType)) {
    const form = analyzeForm(field as HTMLTextAreaElement);
    if (form.status === 'form') return { kind: 'issue-form', form };
    if (form.status === 'unknown') return { kind: 'unknown', reason: form.reason };
  }
  const template = parseMarkdownTemplate(field.value);
  return isMarkdownTemplate(template) ? { kind: 'markdown', template } : NO_TEMPLATE;
}

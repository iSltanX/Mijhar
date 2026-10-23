// ما سيفعله المساعد بالنص الجاهز بحسب القالب (F-F2): دالة خالصة تبني «الخرج» الذي تعرضه المعاينة وتنفّذه أزرار الإدراج.
//  - block: كتلة واحدة تُدرج عند المؤشر أو بالإلحاق (بلا قالب، أو نص حقل واحد في Issue Form، أو عبارة من البنك)؛
//  - edits: قالب Markdown: إدراجات تحت ترويساته (المعاينة هي المسودة الناتجة كاملة)؛
//  - copy: قالب غير معروف الهيكل: معاينة ونسخ يدوي فقط، ولا يُدرج شيء في حقول الصفحة.
import { bulleted, compose, numbered, paragraph } from '../composer/template';
import type { ComposerFields, ComposerKind, FieldId, LanguageChoice } from '../composer/template';
import { conceptOf } from './concepts';
import type { TemplateInfo } from './detect';
import { planFill } from './markdown';
import type { FillPlan } from './markdown';

export type Output =
  | { readonly kind: 'block'; readonly text: string; readonly source: 'compose' | 'field' | 'phrase' }
  | { readonly kind: 'edits'; readonly plan: FillPlan }
  | { readonly kind: 'copy'; readonly text: string; readonly source: 'compose' | 'phrase' };

export interface OutputInput {
  readonly info: TemplateInfo;
  readonly kind: ComposerKind;
  readonly language: LanguageChoice;
  readonly fields: ComposerFields;
  /** نص الحقل الواحد في وضع Issue Form. */
  readonly single: string;
  /** العبارة المختارة من بنك العبارات، وهي تحل محل التنظيم. */
  readonly phrase: string | null;
  /** مسودة الحقل الآن (لخطة القالب). */
  readonly draft: string;
}

const SINGLE_FORMAT: Readonly<Record<FieldId, (text: string) => string>> = { expected: paragraph, actual: paragraph, steps: numbered, environment: bulleted, evidence: bulleted };

/** نص حقل نموذج واحد مهيّأً بحسب ما يطلبه الحقل (خطوات مرقّمة، بيئة وأدلة نقطية، وغيرها فقرة): بلا ترويسات، فالنموذج هو الذي يضع عنوان الحقل. */
export function formatForField(label: string, text: string): string {
  const concept = conceptOf(label);
  return (concept ? SINGLE_FORMAT[concept] : paragraph)(text);
}

export function buildOutput(input: OutputInput): Output {
  const { info } = input;
  if (input.phrase !== null) return info.kind === 'unknown' ? { kind: 'copy', text: input.phrase, source: 'phrase' } : { kind: 'block', text: input.phrase, source: 'phrase' };
  switch (info.kind) {
    case 'issue-form':
      return { kind: 'block', text: formatForField(info.form.current.label, input.single), source: 'field' };
    case 'markdown':
      return { kind: 'edits', plan: planFill(input.draft, input.fields, { kind: input.kind, language: input.language }) };
    case 'unknown':
      return { kind: 'copy', text: compose(input.fields, { kind: input.kind, language: input.language }).text, source: 'compose' };
    case 'none':
      return { kind: 'block', text: compose(input.fields, { kind: input.kind, language: input.language }).text, source: 'compose' };
  }
}

/** النص الذي تعرضه المعاينة. */
export function previewText(output: Output): string {
  return output.kind === 'edits' ? (output.plan.edits.length ? output.plan.result : '') : output.text;
}

export function isEmptyOutput(output: Output): boolean {
  return previewText(output).trim() === '';
}

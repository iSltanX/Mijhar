// قوالب Markdown داخل textarea (F-F2 / AC-F2): تحليل ترويسات القالب وقوائم التحقق، وخطة ملء تُدرج نص المستخدم تحت العنوان المقابل دون حذف حرف من
// القالب. دوال خالصة على النص: تحسب القيمة الناتجة وتعدّ الإدراجات، فتطابق المعاينة ما يُدرج فعلًا (التنفيذ في apply.ts بالإدراج الآمن نفسه).
//  - الإدراج وحده يغيّر النص: القالب الأصلي حرفيًا «تتابع جزئي» من الناتج (preservesOriginal)، فتبقى الترويسات وقوائم التحقق وتعليقات الإرشاد كما هي.
//  - الحقل بلا عنوان مقابل لا يُسقَط ولا يُخمَّن له عنوان: يُلحق في آخر المسودة بعنوانه من المساعد، ويُبلَّغ بذلك في المعاينة.
import { plan } from '../composer/insert';
import { FIELD_IDS, bulleted, compose, numbered, paragraph } from '../composer/template';
import type { ComposerFields, ComposerKind, FieldId, LanguageChoice } from '../composer/template';
import { conceptOf } from './concepts';

export interface TemplateHeading {
  readonly level: number;
  readonly text: string;
  /** فهرس أول المحتوى تحت الترويسة: بعد سطر الترويسة ونهايته. */
  readonly bodyStart: number;
}

export interface ParsedTemplate {
  readonly headings: readonly TemplateHeading[];
  readonly checklistItems: number;
}

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCE = /^ {0,3}(```|~~~)/;
const CHECKLIST = /^\s*[-*+]\s+\[[ xX]\]\s+\S/;

/** ترويسات النص وقوائم التحقق فيه، متجاهلةً ما داخل أسوار الكود. */
export function parseMarkdownTemplate(value: string): ParsedTemplate {
  const headings: TemplateHeading[] = [];
  let checklistItems = 0;
  let fence: string | null = null;
  let offset = 0;
  for (const raw of value.split('\n')) {
    const lineEnd = offset + raw.length;
    const line = raw.replace(/\r$/, '');
    const f = FENCE.exec(line);
    if (f) fence = fence === null ? f[1]! : fence === f[1] ? null : fence;
    else if (fence === null) {
      const h = HEADING.exec(line);
      if (h) headings.push({ level: h[1]!.length, text: h[2]!.trim(), bodyStart: Math.min(lineEnd + 1, value.length) });
      else if (CHECKLIST.test(line)) checklistItems += 1;
    }
    offset = lineEnd + 1;
  }
  return { headings, checklistItems };
}

/** قالب معروف: ترويستان فأكثر، أو ترويسة وقائمة تحقق. مسودة بترويسة واحدة كتبها المستخدم ليست قالبًا فلا يتغير سلوك الإدراج المعتاد (T-7.1). */
export const isMarkdownTemplate = (parsed: ParsedTemplate): boolean => parsed.headings.length >= 2 || (parsed.headings.length >= 1 && parsed.checklistItems >= 1);

/** حقل المساعد ← الترويسة المقابلة، بترويسة واحدة لكل حقل ولا ترويسة لحقلين. */
export function mapHeadings(parsed: ParsedTemplate): Map<FieldId, TemplateHeading> {
  const mapped = new Map<FieldId, TemplateHeading>();
  const used = new Set<TemplateHeading>();
  for (const heading of parsed.headings) {
    const id = conceptOf(heading.text);
    if (!id || mapped.has(id) || used.has(heading)) continue;
    mapped.set(id, heading);
    used.add(heading);
  }
  return mapped;
}

const FORMAT: Readonly<Record<FieldId, (text: string) => string>> = { expected: paragraph, actual: paragraph, steps: numbered, environment: bulleted, evidence: bulleted };

export interface FillEdit {
  readonly field: FieldId;
  /** الفهرس في المسودة الأصلية الذي تُدرج عنده الكتلة. */
  readonly index: number;
  readonly text: string;
  /** عنوان القالب الذي تقع تحته، أو null لما يُلحق في الآخر. */
  readonly heading: string | null;
}

export interface FillPlan {
  /** المسودة التي حُسبت عليها الفهارس: إن تغيّر نص الحقل بعدها فالخطة قديمة ولا تُطبَّق (فهارسها تقع في غير موضعها). */
  readonly draft: string;
  readonly edits: readonly FillEdit[];
  /** المسودة بعد تطبيق كل الإدراجات، كما سيراها الحقل. */
  readonly result: string;
  readonly mapped: ReadonlyArray<{ readonly field: FieldId; readonly heading: string }>;
  readonly appended: readonly FieldId[];
  /** حقول بلا نص: لا إدراج لها. */
  readonly skipped: readonly FieldId[];
}

/** يحاكي إدراج الكتلة عند الفهرس بقاعدة الفواصل نفسها التي يطبقها الإدراج الآمن (plan في composer/insert). */
export function simulateInsert(value: string, index: number, block: string): string {
  const text = block.replace(/\n+$/, '');
  const { position, prefix, suffix } = plan(value, index, 'cursor');
  return `${value.slice(0, position)}${prefix}${text}${suffix}${value.slice(position)}`;
}

export interface FillOptions {
  readonly kind: ComposerKind;
  readonly language: LanguageChoice;
}

export function planFill(draft: string, fields: ComposerFields, options: FillOptions): FillPlan {
  const parsed = parseMarkdownTemplate(draft);
  const map = mapHeadings(parsed);
  const edits: FillEdit[] = [];
  const mapped: Array<{ field: FieldId; heading: string }> = [];
  const loose: FieldId[] = [];
  const skipped: FieldId[] = [];
  for (const id of FIELD_IDS) {
    const body = FORMAT[id](fields[id] ?? '');
    if (!body.trim()) {
      skipped.push(id);
      continue;
    }
    const heading = map.get(id);
    if (heading) {
      edits.push({ field: id, index: heading.bodyStart, text: body, heading: heading.text });
      mapped.push({ field: id, heading: heading.text });
    } else loose.push(id);
  }
  if (loose.length) {
    const subset = Object.fromEntries(FIELD_IDS.map((id) => [id, loose.includes(id) ? (fields[id] ?? '') : ''])) as unknown as ComposerFields;
    const { text } = compose(subset, { kind: options.kind, language: options.language });
    if (text.trim()) edits.push({ field: loose[0]!, index: draft.length, text, heading: null });
  }
  return { draft, edits, result: applyToString(draft, edits), mapped, appended: loose, skipped };
}

/** ترتيب التطبيق: من الأعلى فهرسًا إلى الأدنى فلا ينزاح فهرس سابق؛ وعند التساوي يُلحق ما في الآخر أولًا فيبقى بعد ما تحت عنوان آخر القالب. */
export function applicationOrder(edits: readonly FillEdit[]): FillEdit[] {
  return edits
    .map((edit, order) => ({ edit, order }))
    .sort((a, b) => b.edit.index - a.edit.index || (a.edit.heading === null ? -1 : 0) - (b.edit.heading === null ? -1 : 0) || a.order - b.order)
    .map((entry) => entry.edit);
}

export function applyToString(draft: string, edits: readonly FillEdit[]): string {
  let value = draft;
  for (const edit of applicationOrder(edits)) value = simulateInsert(value, edit.index, edit.text);
  return value;
}

/** هل المسودة الأصلية «تتابع جزئي» حرفي من الناتج: لا حرف منها حُذف أو بُدّل أو أُعيد ترتيبه. */
export function preservesOriginal(original: string, result: string): boolean {
  let at = 0;
  for (const char of result) {
    if (at < original.length && char === original[at]) at += 1;
  }
  return at === original.length;
}

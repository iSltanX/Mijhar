// تنظيم البلاغ أو طلب الدمج (F-F1): المتوقع والفعلي وخطوات التكرار والبيئة والأدلة تُجمَّع في نص Markdown بعناوين ثابتة. دوال خالصة حتمية:
//  - لا تغيّر كلمات المستخدم: يُقصّ الفراغ في الطرفين فقط، وتُوحَّد نهايات الأسطر؛ وما لم يكتبه المستخدم لا يُضاف (قسم فارغ لا يُدرج).
//  - الخطوات قائمة مرقّمة، والبيئة والأدلة قوائم نقطية (سطر لكل بند؛ علامة قائمة كتبها المستخدم تُستبدل بعلامة القسم فلا تتكرر)، والمتوقع والفعلي فقرات كما كُتبت.
//  - لغة العناوين بحسب لغة ما كتبه (عربي غالب ← عربية، وإلا إنجليزية)، ويمكن فرضها: عناوين المستودعات الإنجليزية بالإنجليزية تتفق مع المشرفين.
export const FIELD_IDS = ['expected', 'actual', 'steps', 'environment', 'evidence'] as const;
export type FieldId = (typeof FIELD_IDS)[number];
export type ComposerFields = Readonly<Record<FieldId, string>>;
export type ComposerKind = 'issue' | 'pr';
export type HeadingLanguage = 'ar' | 'en';
export type LanguageChoice = HeadingLanguage | 'auto';

export const EMPTY_FIELDS: ComposerFields = { expected: '', actual: '', steps: '', environment: '', evidence: '' };

export const KIND_LABELS: Readonly<Record<ComposerKind, string>> = { issue: 'بلاغ (Issue)', pr: 'طلب دمج (Pull Request)' };

/** وصف كل حقل في المساعد بحسب النوع: تسمية الحقل والتلميح الذي يرشد المستخدم. */
export const FIELD_GUIDE: Readonly<Record<ComposerKind, Readonly<Record<FieldId, { readonly label: string; readonly hint: string }>>>> = {
  issue: {
    expected: { label: 'المتوقع', hint: 'ماذا كنتَ تتوقع أن يحدث؟' },
    actual: { label: 'الفعلي', hint: 'ماذا حدث فعلًا؟ ونص الخطأ إن ظهر' },
    steps: { label: 'خطوات التكرار', hint: 'خطوة في كل سطر، من حالة نظيفة' },
    environment: { label: 'البيئة', hint: 'النظام والمتصفح والإصدار؛ بند في كل سطر' },
    evidence: { label: 'الأدلة', hint: 'روابط لقطات وسجلات وأمثلة؛ بند في كل سطر' },
  },
  pr: {
    expected: { label: 'المتوقع بعد التغيير', hint: 'ما السلوك الصحيح بعد هذا الطلب؟' },
    actual: { label: 'ما كان يحدث قبله', hint: 'السلوك أو المشكلة التي يعالجها' },
    steps: { label: 'خطوات التحقق', hint: 'كيف يتحقق المراجع من التغيير؛ خطوة في كل سطر' },
    environment: { label: 'البيئة', hint: 'النظام والمتصفح والإصدار الذي جُرِّب عليه؛ بند في كل سطر' },
    evidence: { label: 'الأدلة', hint: 'اختبارات ولقطات ونتائج؛ بند في كل سطر' },
  },
};

const HEADINGS: Readonly<Record<ComposerKind, Readonly<Record<HeadingLanguage, Readonly<Record<FieldId, string>>>>>> = {
  issue: {
    ar: { expected: 'السلوك المتوقع', actual: 'السلوك الفعلي', steps: 'خطوات إعادة الإنتاج', environment: 'البيئة', evidence: 'الأدلة' },
    en: { expected: 'Expected behavior', actual: 'Actual behavior', steps: 'Steps to reproduce', environment: 'Environment', evidence: 'Evidence' },
  },
  pr: {
    ar: { expected: 'المتوقع بعد هذا التغيير', actual: 'ما كان يحدث قبله', steps: 'كيفية التحقق', environment: 'البيئة', evidence: 'الأدلة' },
    en: { expected: 'Expected after this change', actual: 'Behavior before this change', steps: 'How to verify', environment: 'Environment', evidence: 'Evidence' },
  },
};

export const headingFor = (kind: ComposerKind, language: HeadingLanguage, field: FieldId): string => HEADINGS[kind][language][field];

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/g;
const LATIN = /[A-Za-z]/g;

/** لغة العناوين المقترحة من نص الحقول: العربية إن غلبت حروفها، وإلا الإنجليزية (وبلا نص بعد: الإنجليزية). */
export function detectLanguage(fields: ComposerFields): HeadingLanguage {
  const text = FIELD_IDS.map((id) => fields[id]).join(' ');
  const arabic = text.match(ARABIC)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  return arabic > latin ? 'ar' : 'en';
}

const MARKER = /^\s*(?:\d+[.)]|[-*+•])\s+/;

const lines = (text: string): string[] =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line) => line.trim() !== '');

/** الفقرة كما كُتبت: قص الطرفين وتوحيد نهايات الأسطر فقط. */
export const paragraph = (text: string): string => text.replace(/\r\n?/g, '\n').replace(/^\s*\n+/, '').replace(/\s+$/, '');

export const numbered = (text: string): string =>
  lines(text)
    .map((line, i) => `${i + 1}. ${line.replace(MARKER, '').trimStart()}`)
    .join('\n');

export const bulleted = (text: string): string =>
  lines(text)
    .map((line) => `- ${line.replace(MARKER, '').trimStart()}`)
    .join('\n');

export interface ComposeOptions {
  readonly kind: ComposerKind;
  readonly language: LanguageChoice;
}

export interface Composition {
  readonly text: string;
  readonly language: HeadingLanguage;
  /** الأقسام المُدرجة بترتيبها، وما تُرك لأنه فارغ. */
  readonly included: readonly FieldId[];
  readonly omitted: readonly FieldId[];
}

const FORMAT: Readonly<Record<FieldId, (text: string) => string>> = {
  expected: paragraph,
  actual: paragraph,
  steps: numbered,
  environment: bulleted,
  evidence: bulleted,
};

/** النص الذي يُدرج: قسم لكل حقل غير فارغ بعنوانه من المستوى الثاني، بفراغ واحد بين الأقسام، وينتهي بسطر جديد. */
export function compose(fields: ComposerFields, options: ComposeOptions): Composition {
  const language = options.language === 'auto' ? detectLanguage(fields) : options.language;
  const included: FieldId[] = [];
  const omitted: FieldId[] = [];
  const sections: string[] = [];
  for (const id of FIELD_IDS) {
    const body = FORMAT[id](fields[id] ?? '');
    if (!body.trim()) {
      omitted.push(id);
      continue;
    }
    included.push(id);
    sections.push(`## ${headingFor(options.kind, language, id)}\n\n${body}`);
  }
  return { text: sections.length ? `${sections.join('\n\n')}\n` : '', language, included, omitted };
}

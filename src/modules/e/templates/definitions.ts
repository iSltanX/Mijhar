// القوالب الأربعة لحزمة السياق (T-6.2، F-E3): نصوص محلية ثابتة بلا نموذج ولا اتصال، لكلٍّ منها أقسامه المعرّفة بالترتيب.
// القسم إما من الصفحة (يُبنى من أجزاء المنشئ نفسها بقائمة الاختيار نفسها)، أو ثابت (توجيه للقارئ)، أو «يُملأ» يدويًا في المعاينة؛
// وقسم «ما تعذّر جمعه أو اقتُطع لطوله» الإلزامي يُلحقه التوليد بكل قالب فلا يُعرَّف هنا. لا قالب يملأ قسمًا من عنده (لا اختلاق).

export type TemplateId = 'diagnose' | 'review' | 'handoff' | 'resume';

/** أجزاء الصفحة التي يستهلكها قسم القالب: «المصدر» هو المستودع والرابط والفرع والالتزام. */
export type PageKey = 'source' | 'description' | 'comments' | 'checks' | 'error' | 'snippets';

export type SectionSpec =
  | { readonly kind: 'page'; readonly key: PageKey; readonly heading: string }
  | { readonly kind: 'fixed'; readonly heading: string; readonly lines: readonly string[] }
  | { readonly kind: 'fill'; readonly heading: string; readonly hint: string };

export interface TemplateDef {
  readonly id: TemplateId;
  /** اسمه في الواجهة. */
  readonly label: string;
  /** اسمه الإنجليزي كما في الخطة (Bug / CI Failure Diagnosis…). */
  readonly english: string;
  /** يسبق عنوان الصفحة في عنوان الحزمة: «تشخيص مشكلة: …». */
  readonly titlePrefix: string;
  readonly sections: readonly SectionSpec[];
}

/** ما يُكتب في قسم من الصفحة لم يُختر أو لم يتوفر. */
export const EMPTY_SECTION_LINE = '- لم يُدرج: غير مختار أو غير متاح في هذه الصفحة.';

export const TEMPLATES: readonly TemplateDef[] = [
  {
    id: 'diagnose',
    label: 'تشخيص مشكلة',
    english: 'Bug / CI Failure Diagnosis',
    titlePrefix: 'تشخيص مشكلة',
    sections: [
      { kind: 'fixed', heading: 'المطلوب', lines: ['هذه المشكلة وهذه الفحوص الفاشلة وهذه مقتطفات السجل. حدّد الخطأ المثبت والسبب المحتمل مع أدلته، ثم رتّب خطوات التشخيص والإصلاح، واذكر المعلومات الناقصة بدل اختلاقها.'] },
      { kind: 'page', key: 'source', heading: 'المصدر' },
      { kind: 'page', key: 'description', heading: 'وصف المشكلة' },
      { kind: 'page', key: 'checks', heading: 'الفحوص ونتائجها' },
      { kind: 'page', key: 'error', heading: 'مقتطف الخطأ' },
      { kind: 'page', key: 'comments', heading: 'التعليقات ذات الصلة' },
      { kind: 'page', key: 'snippets', heading: 'مقتطفات الأدلة' },
    ],
  },
  {
    id: 'review',
    label: 'مراجعة تغيير',
    english: 'Code / PR Review',
    titlePrefix: 'مراجعة تغيير',
    sections: [
      { kind: 'fixed', heading: 'المطلوب', lines: ['راجع هذا التغيير وفرّق بين ما أثبته المصدر وما يحتاج تحققًا منك، واذكر المعلومات الناقصة بدل اختلاقها.'] },
      {
        kind: 'fixed',
        heading: 'نقاط المراجعة',
        lines: ['- هل يطابق التغيير ما يصفه؟', '- هل الحالات الطرفية والأخطاء مغطاة، وهل الاختبارات تكفيها؟', '- هل الفحوص الفاشلة (إن وُجدت) مرتبطة بالتغيير؟', '- هل يمسّ الأمان أو الخصوصية أو التوافق مع ما قبله؟'],
      },
      { kind: 'page', key: 'source', heading: 'المصدر' },
      { kind: 'page', key: 'description', heading: 'وصف التغيير' },
      { kind: 'page', key: 'checks', heading: 'نتائج الفحوص' },
      { kind: 'page', key: 'error', heading: 'مقتطف الخطأ' },
      { kind: 'page', key: 'comments', heading: 'ملاحظات المراجعين' },
      { kind: 'page', key: 'snippets', heading: 'مقتطفات الأدلة' },
    ],
  },
  {
    id: 'handoff',
    label: 'تسليم مهمة',
    english: 'Task Handoff',
    titlePrefix: 'تسليم مهمة',
    sections: [
      { kind: 'fixed', heading: 'المطلوب', lines: ['أسلّمك هذه المهمة لتتابعها. اقرأ السياق أدناه، وما لم يُذكر فيه فاسأل عنه بدل أن تفترضه.'] },
      { kind: 'page', key: 'source', heading: 'المهمة والمصدر' },
      { kind: 'page', key: 'description', heading: 'الوصف' },
      { kind: 'page', key: 'checks', heading: 'الحالة الحالية للفحوص' },
      { kind: 'page', key: 'error', heading: 'مقتطف الخطأ' },
      { kind: 'page', key: 'comments', heading: 'آخر ما قيل' },
      { kind: 'page', key: 'snippets', heading: 'الأدلة' },
      { kind: 'fill', heading: 'ما أُنجز', hint: 'يكتبه من يسلّم المهمة' },
      { kind: 'fill', heading: 'ما تبقّى', hint: 'يكتبه من يسلّم المهمة' },
      { kind: 'fill', heading: 'قرارات وتنبيهات', hint: 'يكتبها من يسلّم المهمة' },
    ],
  },
  {
    id: 'resume',
    label: 'استكمال عمل',
    english: 'Resume Work Summary',
    titlePrefix: 'استكمال عمل',
    sections: [
      { kind: 'fixed', heading: 'المطلوب', lines: ['ملخص لاستئناف العمل لاحقًا من حيث توقفنا: أين نحن، وما حال الفحوص، وما الخطوة التالية. لا تفترض ما لم يُذكر هنا.'] },
      { kind: 'page', key: 'source', heading: 'أين توقفنا' },
      { kind: 'page', key: 'description', heading: 'الوصف' },
      { kind: 'page', key: 'checks', heading: 'حال الفحوص' },
      { kind: 'page', key: 'error', heading: 'مقتطف الخطأ' },
      { kind: 'page', key: 'comments', heading: 'آخر التعليقات' },
      { kind: 'page', key: 'snippets', heading: 'مقتطفات الأدلة' },
      { kind: 'fill', heading: 'الخطوة التالية', hint: 'يكتبها صاحب العمل' },
    ],
  },
];

export const TEMPLATE_IDS: readonly TemplateId[] = TEMPLATES.map((t) => t.id);

export function templateOf(id: TemplateId): TemplateDef {
  const found = TEMPLATES.find((t) => t.id === id);
  if (!found) throw new Error(`قالب غير معروف: ${id}`);
  return found;
}

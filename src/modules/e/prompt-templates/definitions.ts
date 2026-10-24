// قوالب البرومبت الخمسة (T-11.4، F-E8): نصوص محلية ثابتة بلا نموذج ولا اتصال، مفصولة عن طبقة المزوّد (T-11.6) كما يفصل F-F5 القوالب عن
// الترجمة. كل قالب أقسامه المعرّفة بترتيبها: توجيه ثابت لا يفترض بيانًا («المطلوب»)، ثم أقسام من أجزاء بنية السياق المشتركة (T-11.2) نفسها،
// وقسم «المعلومات الناقصة» الإلزامي آخرها يلحقه التوليد بما لم يصل وسببه. والتوجيه لا يذكر بيانًا («هذه الفحوص الفاشلة…») قد لا يصل:
// ما وصل يظهر في قسمه، وما لم يصل يُقال في قسمه وفي «المعلومات الناقصة». لا قالب يملأ قسمًا من عنده (لا اختلاق).
import type { ContextPageKind, PartKey } from '../context';

export type PromptId = 'understand' | 'diagnose' | 'review' | 'next-step' | 'handoff';

/** أجزاء بنية السياق التي يعرضها قسم من القالب. source: المستودع والرابط والفرع والالتزام معًا؛ repo وbranch كلٌّ وحده. */
export type PromptPart = 'source' | 'repo' | 'branch' | 'description' | 'comments' | 'checks' | 'failedChecks' | 'error' | 'log' | 'causes' | 'changes' | 'status' | 'snippets' | 'links';

/** جرد الجزء في البنية (سبب غيابه في «المعلومات الناقصة»). */
export const PART_INVENTORY: Readonly<Record<PromptPart, PartKey>> = {
  source: 'source',
  repo: 'source',
  branch: 'branch',
  description: 'description',
  comments: 'comments',
  checks: 'checks',
  failedChecks: 'checks',
  error: 'error',
  log: 'log',
  causes: 'log',
  changes: 'changes',
  status: 'status',
  snippets: 'snippets',
  links: 'links',
};

export type PromptSection =
  | { readonly kind: 'fixed'; readonly heading: string; readonly lines: readonly string[] }
  /** `on`: أنواع الصفحات التي يظهر فيها القسم (غيابه = كلها). */
  | { readonly kind: 'part'; readonly part: PromptPart; readonly heading: string; readonly on?: readonly ContextPageKind[] };

export interface PromptDef {
  readonly id: PromptId;
  readonly label: string;
  readonly english: string;
  readonly sections: readonly PromptSection[];
}

export const MISSING_HEADING = 'المعلومات الناقصة';

/** ما يُكتب في قسم لم يصل جزؤه إلى بنية السياق. */
export const NOT_RECEIVED_LINE = '- لم يصل إلى بنية السياق (السبب في «المعلومات الناقصة»).';

/** آخر سطر في كل برومبت: الاعتماد على ما ورد وحده. */
export const CLOSING_LINE = 'اعتمد على ما ورد أعلاه وحده: ما في «المعلومات الناقصة» لم يصل إليك، فاسأل عنه أو اذكر أنه ينقص ولا تفترضه.';

const ON_DISCUSSION: readonly ContextPageKind[] = ['pr', 'issue'];
const ON_CHECKS: readonly ContextPageKind[] = ['pr', 'job'];

export const PROMPTS: readonly PromptDef[] = [
  {
    id: 'understand',
    label: 'فهم المشكلة',
    english: 'Understand the Issue',
    sections: [
      {
        kind: 'fixed',
        heading: 'المطلوب',
        lines: [
          'اشرح ما في السياق أدناه بلغة واضحة: ما المطلوب ولماذا، وما اتُّفق عليه وما بقي معلّقًا إن ورد نقاش، وما الأسئلة المفتوحة.',
          'افصل بين ما ينص عليه السياق وما تستنتجه أنت.',
        ],
      },
      { kind: 'part', part: 'source', heading: 'المصدر' },
      { kind: 'part', part: 'description', heading: 'العنوان والوصف' },
      { kind: 'part', part: 'comments', heading: 'النقاش', on: ON_DISCUSSION },
      { kind: 'part', part: 'status', heading: 'حالة الطلب', on: ['pr'] },
      { kind: 'part', part: 'checks', heading: 'الفحوص', on: ON_CHECKS },
      { kind: 'part', part: 'changes', heading: 'التغييرات', on: ['diff'] },
      { kind: 'part', part: 'snippets', heading: 'مقتطفات الأدلة' },
    ],
  },
  {
    id: 'diagnose',
    label: 'تشخيص الخطأ',
    english: 'Diagnose the Error',
    sections: [
      {
        kind: 'fixed',
        heading: 'المطلوب',
        lines: [
          'حدّد من السياق أدناه الخطأ المثبت بنصه وموضعه إن ورد، ثم السبب المحتمل مع دليله منه، ثم رتّب خطوات التشخيص والإصلاح.',
          'ما وُسم «احتمال يحتاج تحققًا» ليس مثبتًا. واذكر المعلومات الناقصة بدل اختلاقها.',
        ],
      },
      { kind: 'part', part: 'source', heading: 'المصدر' },
      { kind: 'part', part: 'description', heading: 'وصف المشكلة' },
      { kind: 'part', part: 'failedChecks', heading: 'الفحوص الفاشلة' },
      { kind: 'part', part: 'error', heading: 'مقتطف الخطأ' },
      { kind: 'part', part: 'log', heading: 'مقتطفات السجل' },
      { kind: 'part', part: 'causes', heading: 'ما استخرجه محلل السجل' },
      { kind: 'part', part: 'changes', heading: 'التغييرات المرتبطة' },
      { kind: 'part', part: 'snippets', heading: 'مقتطفات الأدلة' },
      { kind: 'part', part: 'links', heading: 'روابط الأدلة' },
    ],
  },
  {
    id: 'review',
    label: 'مراجعة التغييرات',
    english: 'Review the Changes',
    sections: [
      {
        kind: 'fixed',
        heading: 'المطلوب',
        lines: [
          'راجع التغييرات الواردة في السياق أدناه: هل تطابق ما يصفه الوصف إن ورد، وما الحالات الطرفية والأخطاء المحتملة، وهل تكفيها الاختبارات، وهل تمسّ الأمان أو الخصوصية أو التوافق مع ما قبلها.',
          'فرّق بين ما يثبته السياق وما يحتاج تحققًا منك، واذكر ما ينقص بدل اختلاقه.',
        ],
      },
      { kind: 'part', part: 'source', heading: 'المصدر' },
      { kind: 'part', part: 'description', heading: 'وصف التغيير' },
      { kind: 'part', part: 'changes', heading: 'التغييرات' },
      { kind: 'part', part: 'checks', heading: 'نتائج الفحوص', on: ON_CHECKS },
      { kind: 'part', part: 'comments', heading: 'ملاحظات المراجعين', on: ON_DISCUSSION },
      { kind: 'part', part: 'snippets', heading: 'مقتطفات الأدلة' },
      { kind: 'part', part: 'links', heading: 'روابط الأدلة' },
    ],
  },
  {
    id: 'next-step',
    label: 'تحديد الخطوة التالية',
    english: 'Decide the Next Step',
    sections: [
      {
        kind: 'fixed',
        heading: 'المطلوب',
        lines: [
          'من الحالة في السياق أدناه وحدها، حدّد الخطوة التالية الأنسب ومن يقوم بها وسببها منه، ثم رتّب ما بعدها باختصار.',
          'إن لم يكفِ السياق لتحديدها فقل ما الذي ينقص بدل افتراضه.',
        ],
      },
      { kind: 'part', part: 'source', heading: 'المصدر' },
      { kind: 'part', part: 'description', heading: 'الوصف' },
      { kind: 'part', part: 'status', heading: 'الحالة والموانع', on: ['pr'] },
      { kind: 'part', part: 'checks', heading: 'نتائج الفحوص', on: ON_CHECKS },
      { kind: 'part', part: 'error', heading: 'مقتطف الخطأ', on: ON_CHECKS },
      { kind: 'part', part: 'comments', heading: 'آخر النقاش', on: ON_DISCUSSION },
      { kind: 'part', part: 'changes', heading: 'التغييرات', on: ['pr', 'diff'] },
      { kind: 'part', part: 'snippets', heading: 'مقتطفات الأدلة' },
    ],
  },
  {
    id: 'handoff',
    label: 'تسليم المهمة لجلسة برمجة',
    english: 'Hand Off to a Coding Session',
    sections: [
      {
        kind: 'fixed',
        heading: 'المطلوب',
        lines: [
          'أنت في جلسة برمجة على هذا المستودع، وهذه مهمة مسلَّمة إليك بسياقها كما جُمع من GitHub.',
          'ابدأ بالتحقق من الفرع والالتزام كما وردا في قسمهما (وإن لم يردا فاسأل عنهما)، ثم اقرأ الملفات المعنية في المستودع، ونفّذ المطلوب بأصغر تغيير يحققه مع اختبار يثبته، ثم لخّص ما غيّرته.',
          'لا تبنِ على ما ورد في «المعلومات الناقصة» قبل أن تسأل عنه.',
        ],
      },
      { kind: 'part', part: 'repo', heading: 'المستودع' },
      { kind: 'part', part: 'branch', heading: 'الفرع والالتزام' },
      { kind: 'part', part: 'description', heading: 'المهمة' },
      { kind: 'part', part: 'checks', heading: 'حال الفحوص', on: ON_CHECKS },
      { kind: 'part', part: 'error', heading: 'مقتطف الخطأ', on: ON_CHECKS },
      { kind: 'part', part: 'log', heading: 'مقتطفات السجل', on: ON_CHECKS },
      { kind: 'part', part: 'causes', heading: 'ما استخرجه محلل السجل', on: ON_CHECKS },
      { kind: 'part', part: 'changes', heading: 'التغييرات المرتبطة' },
      { kind: 'part', part: 'comments', heading: 'آخر ما قيل', on: ON_DISCUSSION },
      { kind: 'part', part: 'snippets', heading: 'مقتطفات الأدلة' },
      { kind: 'part', part: 'links', heading: 'روابط الأدلة' },
    ],
  },
];

export const PROMPT_IDS: readonly PromptId[] = PROMPTS.map((p) => p.id);

export function promptOf(id: PromptId): PromptDef {
  const found = PROMPTS.find((p) => p.id === id);
  if (!found) throw new Error(`قالب برومبت غير معروف: ${id}`);
  return found;
}

/** أقسام القالب التي تظهر في نوع صفحة، بترتيبها. */
export const sectionsFor = (def: PromptDef, kind: ContextPageKind): PromptSection[] => def.sections.filter((s) => s.kind === 'fixed' || !s.on || s.on.includes(kind));

// «استثناءات الاستعادة»: كل ما لا يغطيه سجل التعديلات (AC-1.2 بند 4). مصدر الحقيقة الوحيد في الشيفرة؛
// evidence/T-1.2/restore-exceptions.md يعرضه ويفحص tests/core/lifecycle/restore-exceptions.test.ts اتساقهما.
// النص يطابق حدود المنتج في EXECUTION_PLAN.md ‏1.1 (البند 2): لا إزالة بلا أثر في كل حالة، وما غيّره GitHub بعد
// الإضافة لا يُلمس.

export interface RestoreException {
  readonly id: string;
  readonly title: string;
  /** ما الذي لا يُستعاد ولماذا. */
  readonly description: string;
  /** ما يحدث فعلًا وقت الإيقاف. */
  readonly behavior: string;
  /** هل يظهر وقت التشغيل في RestoreReport.skipped (وإلا فهو حدّ تصميمي لا يُرصد). */
  readonly reported: boolean;
}

export const RESTORE_EXCEPTIONS = [
  {
    id: 'direct-dom-mutation',
    title: 'تعديل DOM بغير واجهة السجل',
    description: 'ما تكتبه الوحدة مباشرة (innerHTML وtextContent وel.hidden وappendChild وغيرها) لا يراه السجل.',
    behavior: 'لا يُستعاد. على الوحدة استعمال ctx.mutations أو تسجيل استعادة صريحة بـctx.mutations.custom.',
    reported: false,
  },
  {
    id: 'text-nodes',
    title: 'نصوص العقد النصية',
    description: 'السجل لا يسجّل كتابة nodeValue ولا يستعيدها: حارس ملكية الكتابة مبني على سجل الكتابات لا على مقارنة النص، وهو من عمل T-2.7.',
    behavior: 'لا يُدّعى استعادة نص لم يمرّ بمحرك T-2.7. المحرك يسجّل استعادته عبر ctx.mutations.custom.',
    reported: false,
  },
  {
    id: 'external-attribute-change',
    title: 'سمة غيّرها طرف آخر بعد كتابة الإضافة',
    description: 'قيمة السمة الحالية تخالف ما كتبته الإضافة (غيّرها GitHub أو المستخدم أو إضافة أخرى أو حذفتها).',
    behavior: 'تُترك بقيمتها الحالية ولا تُستعاد. حدّ: كتابة طرف آخر بقيمة مطابقة لما كتبته الإضافة تُعامَل كملكها.',
    reported: true,
  },
  {
    id: 'external-style-change',
    title: 'خاصية style مضمّنة غيّرها طرف آخر',
    description: 'قيمة الخاصية أو أولويتها الحالية تخالف ما كتبته الإضافة.',
    behavior: 'تُترك كما هي. نفس حدّ المساواة في السمات.',
    reported: true,
  },
  {
    id: 'replaced-node-lost',
    title: 'عقدة استبدلتها الإضافة ثم فصلها GitHub',
    description: 'بعد replace فُصلت العقدة البديلة من الشجرة، فلا موضع معروف لإعادة الأصل.',
    behavior: 'يُعتمد ما صنعه GitHub ولا يُدرَج الأصل.',
    reported: true,
  },
  {
    id: 'replaced-original-reattached',
    title: 'عقدة أصلية أعادها GitHub بنفسه',
    description: 'بعد replace أعادت الصفحة العقدة الأصلية إلى الشجرة، فإدراجها ثانية ينسخ الحالة أو يسرقها.',
    behavior: 'لا يُكتب فوقها؛ تبقى كما وضعتها الصفحة، وتُزال العقدة البديلة إن وُجدت.',
    reported: true,
  },
  {
    id: 'custom-undo-failed',
    title: 'استعادة مخصصة رمت استثناءً',
    description: 'دالة تسجّلها الوحدة عبر ctx.mutations.custom فشلت وقت الإيقاف.',
    behavior: 'يُسجَّل الخطأ في التقرير وتستمر بقية الاستعادة؛ ما فشلت استعادته غير مضمون.',
    reported: true,
  },
  {
    id: 'undo-threw',
    title: 'استعادة داخلية رمت استثناءً',
    description: 'عملية DOM وقت الاستعادة رمت (مثل HierarchyRequestError لأن الصفحة غيّرت الشجرة).',
    behavior: 'يُسجَّل في التقرير وتستمر بقية الاستعادة؛ ما فشلت استعادته غير مضمون.',
    reported: true,
  },
  {
    id: 'form-and-focus-state',
    title: 'قيم الحقول والتركيز والتحديد والتمرير',
    description: 'حالة غير مخزَّنة في سمات: value وchecked وselection وfocus وscrollTop. قد تتغير بسبب تدخل الإضافة ولا يسجلها السجل.',
    behavior: 'لا تُستعاد. تُعاد إلى المستخدم حالته الحالية.',
    reported: false,
  },
  {
    id: 'page-owned-state',
    title: 'حالة الصفحة غير المرئية في DOM',
    description: 'مستمعات الصفحة وحالة React وذاكرة التخزين المؤقت لـTurbo وسجل التاريخ وdocument.title وlocation.',
    behavior: 'خارج نطاق الإضافة؛ الوحدات لا تُعدّلها ولا تُستعاد.',
    reported: false,
  },
  {
    id: 'adopted-stylesheets',
    title: 'أوراق الأنماط المعتمدة',
    description: 'document.adoptedStyleSheets وShadowRoot.adoptedStyleSheets ليست عقدًا في الشجرة فلا يلتقطها insert.',
    behavior: 'تسجَّل عبر ctx.mutations.custom أو لا تُستعمل خارج مضيف الواجهات (T-1.4).',
    reported: false,
  },
  {
    id: 'third-party-changes',
    title: 'تعديلات أطراف ثالثة',
    description: 'إضافات متصفح أخرى أو أدوات ترجمة المتصفح التي تعدّل DOM نفسه أثناء تشغيل الإضافة.',
    behavior: 'لا يُعرف مصدر التعديل ولا يُلمس؛ تُعامَل كتغيير خارجي.',
    reported: false,
  },
] as const satisfies readonly RestoreException[];

export type RestoreExceptionId = (typeof RESTORE_EXCEPTIONS)[number]['id'];

export const RESTORE_EXCEPTION_IDS: readonly RestoreExceptionId[] = RESTORE_EXCEPTIONS.map((e) => e.id);

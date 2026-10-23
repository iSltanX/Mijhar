// «استثناءات استعادة النصوص»: تفصيل البند text-nodes في قائمة النواة (src/core/lifecycle/restore-exceptions.ts) لما يمرّ بمحرك
// TextTransformRegistry (T-2.7، AC-A7 بند 5). كل نص لا يستعيده الحارس يُترك كما هو ويُسرد في TextRestoreReport.skipped برقم من هنا؛
// وما لا يُرصد وقت التشغيل حدّ تصميمي مكتوب لا يُدّعى له استعادة. evidence/T-2.7/restore-exceptions.md يعرض القائمة ويفحص
// tests/modules/a/guard/exceptions.test.ts اتساقهما.

export interface TextRestoreException {
  readonly id: string;
  readonly title: string;
  /** ما الذي لا يُستعاد ولماذا. */
  readonly description: string;
  /** ما يحدث فعلًا وقت الإيقاف. */
  readonly behavior: string;
  /** هل يظهر وقت التشغيل في TextRestoreReport.skipped (وإلا فهو حدّ تصميمي لا يُرصد). */
  readonly reported: boolean;
}

export const TEXT_RESTORE_EXCEPTIONS = [
  {
    id: 'text-foreign-write',
    title: 'كتابة خارجية على عقدة كتبتها الإضافة',
    description:
      'رصد المراقب على العقدة سجل characterData لا يقابله كتابة ذاتية معلّقة، أو سجلًا لا تطابق قيمته السابقة تسلسل كتابات الإضافة. '
      + 'ويشمل ذلك كتابة بنص يساوي ما كتبته الإضافة حرفيًا: الملكية من سجل الكتابات لا من مقارنة النص.',
    behavior: 'يُعتمد نص GitHub (أو المستخدم) أصلًا جديدًا، ولا تكتب الإضافة على العقدة بعدها ولا تستعيد شيئًا فوقها.',
    reported: true,
  },
  {
    id: 'text-node-removed',
    title: 'عقدة أُزيلت أو نُقلت أو استُبدلت',
    description: 'رصد المراقب إزالة العقدة أو أحد أسلافها من موضعها (استبدال أو فصل أو نقل)، حتى لو أُعيدت إلى الشجرة بعد ذلك.',
    behavior: 'لا كتابة عليها؛ والعقدة البديلة عقدة جديدة لم يمسها المحرك.',
    reported: true,
  },
  {
    id: 'text-node-detached',
    title: 'عقدة غير متصلة بالمستند وقت الاستعادة',
    description: 'فُصلت العقدة بطريق لم يرصده المراقب (مثل إزالة الحاوية المراقَبة نفسها من المستند).',
    behavior: 'لا كتابة على عقدة مفصولة.',
    reported: true,
  },
  {
    id: 'text-stale-record',
    title: 'سجل لا يخص العقدة الحالية',
    description: 'السجل ليس الكائن المسجَّل لهذه العقدة، أو جيله (epoch) من جلسة محرك سابقة.',
    behavior: 'يُترك النص كما هو.',
    reported: true,
  },
  {
    id: 'text-unconfirmed-write',
    title: 'كتابة ذاتية لم يؤكدها المراقب',
    description: 'بعد تفريغ takeRecords() ما زال رقم آخر كتابة للإضافة على العقدة غير مطابق لآخر رقم أكّده المراقب.',
    behavior: 'حالة شك: يُترك النص كما هو.',
    reported: true,
  },
  {
    id: 'text-value-mismatch',
    title: 'نص العقدة يخالف آخر ما كتبته الإضافة',
    description: 'فحص إضافي لا دليل ملكية: الشروط السابقة كلها مستوفاة لكن nodeValue لا يساوي آخر قيمة كتبتها الإضافة.',
    behavior: 'حالة شك: يُترك النص كما هو.',
    reported: true,
  },
  {
    id: 'text-transform-threw',
    title: 'تحويل رمى استثناءً وقت الحساب',
    description: 'تعذّر حساب النص الذي يُعاد إليه بعد إزالة التحويل لأن أحد التحويلات الباقية رمى.',
    behavior: 'يُترك النص كما هو وتتحرر العقدة من المحرك.',
    reported: true,
  },
  {
    id: 'text-not-reapplied',
    title: 'تحديث GitHub لا يُعاد عليه التحويل',
    description: 'بعد كتابة خارجية تتحرر العقدة من المحرك: يُعرض نص GitHub الجديد كما هو ولو كان التحويل ما زال مفعّلًا.',
    behavior: 'حد تصميمي: لا كتابة على عقدة لمسها طرف آخر. تعيد الميزة تطبيقه على العقد الجديدة فقط إن شاءت.',
    reported: false,
  },
  {
    id: 'text-separate-engines',
    title: 'محركان منفصلان على العقدة نفسها',
    description: 'وحدة أخرى تحوّل العقدة نفسها بمحرك مستقل؛ كل محرك يرى كتابة الآخر خارجية.',
    behavior: 'يترك كلاهما النص كما هو (فشل آمن: لا نص قديم فوق جديد، ولا استعادة). يُتجنب بمحرك مشترك واحد للصفحة.',
    reported: false,
  },
  {
    id: 'text-unobserved-write',
    title: 'كتابة لا يراها المراقب',
    description: 'كتابة على العقدة وهي خارج الحاوية المراقَبة ثم أُعيدت دون أن يرصد المراقب إزالتها، أو كتابة في سياق لا يُسلِّم سجلات.',
    behavior: 'يلتقطها فحص المساواة الإضافي إن غيّرت النص؛ وكتابة بنص مطابق في هذه الحالة وحدها لا تُكتشف.',
    reported: false,
  },
] as const satisfies readonly TextRestoreException[];

export type TextRestoreExceptionId = (typeof TEXT_RESTORE_EXCEPTIONS)[number]['id'];

export const TEXT_RESTORE_EXCEPTION_IDS: readonly TextRestoreExceptionId[] = TEXT_RESTORE_EXCEPTIONS.map((e) => e.id);

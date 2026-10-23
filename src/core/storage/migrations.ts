// ترحيل مخطط التخزين. كل خطوة دالة نقية على لقطة السجلات (name → value) تعيد لقطة جديدة؛ تُنفَّذ في الذاكرة قبل
// أن تُكتب كلمة واحدة، فخطأ منطق الترحيل لا يلمس التخزين. الكتابة بعدها ببروتوكول: نسخة احتياطية ← سجل عملية ←
// كتابة ذرّية بما فيها ختم الإصدار ← حذف السجل (انظر store.ts).

export interface Snapshot {
  /** السجلات بأسمائها المنطقية (من دون بادئة المفتاح). */
  records: Record<string, unknown>;
}

export interface Migration {
  readonly from: number;
  readonly to: number;
  readonly description: string;
  up(snapshot: Snapshot): Snapshot;
}

/** إصدار المخطط الذي تكتبه هذه النسخة. يرتفع مع كل ترحيل جديد يُضاف إلى MIGRATIONS. */
export const CURRENT_SCHEMA_VERSION = 1;

// الإصدار 0 = بيانات سجلات mijhar:data:* بلا ختم إصدار (أول بنية قبل أن تُسجَّل meta). بنيتها هي بنية الإصدار 1 نفسها،
// فالترحيل يختم الإصدار فقط بعد النسخة الاحتياطية. المراحل اللاحقة تضيف خطواتها هنا (ملف مشترك بترتيب الدمج).
export const MIGRATIONS: readonly Migration[] = [
  { from: 0, to: 1, description: 'ختم بيانات غير مؤرقمة بإصدار المخطط 1 دون تغيير في البنية', up: (snapshot) => snapshot },
];

/** سلسلة الخطوات المتصلة من from إلى to، أو null إن انقطعت. */
export function migrationPath(migrations: readonly Migration[], from: number, to: number): Migration[] | null {
  const steps: Migration[] = [];
  let version = from;
  while (version < to) {
    const step = migrations.find((m) => m.from === version);
    if (!step || step.to <= version) return null;
    steps.push(step);
    version = step.to;
  }
  return version === to ? steps : null;
}

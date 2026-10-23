// أخطاء طبقة التخزين: لكل خطأ code ثابت تقرؤه الواجهة ورسالة عربية مفهومة، وسببه الأصلي في cause.

/** ما يعرضه المستخدم حين تمتلئ الحصة: التصدير دائمًا، وطلب unlimitedStorage حيث ثبت أنه يُطلب وقت التشغيل. */
export type QuotaRemedy = 'export' | 'request-unlimited-storage';

export type QuotaPhase = 'write' | 'backup' | 'migration' | 'import';

export interface QuotaDetails {
  readonly phase: QuotaPhase;
  readonly key?: string;
  /** حجم ما أُريد كتابته بالبايت (تقدير JSON). */
  readonly requestedBytes: number;
  readonly remedies: readonly QuotaRemedy[];
}

const PHASE_TEXT: Record<QuotaPhase, string> = {
  write: 'تعذّر الحفظ لأن مساحة التخزين المحلية المتاحة للإضافة امتلأت. لم تُغيَّر بياناتك السابقة.',
  backup: 'تعذّر إنشاء النسخة الاحتياطية قبل الترحيل لضيق مساحة التخزين، فأُوقف الترحيل ولم تُغيَّر بياناتك.',
  migration: 'امتلأت مساحة التخزين أثناء ترحيل البيانات، فأُعيدت بياناتك إلى حالتها السابقة.',
  import: 'امتلأت مساحة التخزين أثناء الاستيراد، فأُعيدت بياناتك إلى حالتها السابقة.',
};

export class StorageQuotaError extends Error {
  readonly code = 'QUOTA_EXCEEDED';

  constructor(
    readonly details: QuotaDetails,
    options?: { cause?: unknown },
  ) {
    const hints = details.remedies.map((r) => (r === 'export' ? 'صدِّر بياناتك أو احذف ما لا تحتاجه' : 'اطلب صلاحية «التخزين غير المحدود» الاختيارية من الإعدادات'));
    super(`${PHASE_TEXT[details.phase]}${hints.length ? ` ${hints.join('، أو ')}.` : ''}`, options);
    this.name = 'StorageQuotaError';
  }
}

export interface MigrationFailure {
  readonly fromVersion: number;
  readonly toVersion: number;
  /** الخطوة التي فشلت إن كان الفشل في دالة ترحيل بعينها. */
  readonly failedStep?: { from: number; to: number };
  /** هل أُعيدت البيانات إلى ما قبل الترحيل. false تعني أن الاسترجاع نفسه فشل وسيُستأنف عند الفتح التالي. */
  readonly restored: boolean;
  readonly backupId?: string;
}

export class StorageMigrationError extends Error {
  readonly code = 'MIGRATION_FAILED';

  constructor(
    readonly failure: MigrationFailure,
    options?: { cause?: unknown },
  ) {
    const where = failure.failedStep ? ` عند الخطوة ${failure.failedStep.from} ← ${failure.failedStep.to}` : '';
    const outcome = failure.restored
      ? 'أُعيدت بياناتك إلى حالتها قبل الترحيل ولم يضع منها شيء.'
      : 'تعذّر إرجاع البيانات فورًا؛ النسخة الاحتياطية محفوظة وستُستعاد تلقائيًا عند الفتح التالي.';
    super(`فشل ترحيل البيانات من الإصدار ${failure.fromVersion} إلى ${failure.toVersion}${where}. ${outcome}`, options);
    this.name = 'StorageMigrationError';
  }
}

export class StorageSchemaTooNewError extends Error {
  readonly code = 'SCHEMA_TOO_NEW';

  constructor(
    readonly found: number,
    readonly supported: number,
  ) {
    super(`البيانات المحفوظة بإصدار مخطط أحدث (${found}) من الذي تدعمه هذه النسخة (${supported}). لم تُعدَّل البيانات؛ حدّث الإضافة.`);
    this.name = 'StorageSchemaTooNewError';
  }
}

export class StorageNotMigratedError extends Error {
  readonly code = 'NOT_MIGRATED';

  constructor(
    readonly found: number,
    readonly required: number,
  ) {
    super(`مخطط البيانات (${found}) أقدم من المطلوب (${required}) وهذا السياق لا يرحّل؛ يتولى الترحيل سياق الخلفية.`);
    this.name = 'StorageNotMigratedError';
  }
}

export class StorageBusyError extends Error {
  readonly code = 'MIGRATION_IN_PROGRESS';

  constructor() {
    super('عملية ترحيل أو استيراد جارية في سياق آخر؛ أعد المحاولة بعد قليل. لم تُلمس البيانات.');
    this.name = 'StorageBusyError';
  }
}

export class StorageValueError extends Error {
  readonly code = 'INVALID_VALUE';

  constructor(
    readonly key: string,
    reason: string,
  ) {
    super(`قيمة غير قابلة للتخزين في «${key}»: ${reason}.`);
    this.name = 'StorageValueError';
  }
}

export class StorageImportError extends Error {
  readonly code = 'IMPORT_INVALID';

  constructor(reason: string) {
    super(`ملف الاستيراد غير صالح: ${reason}.`);
    this.name = 'StorageImportError';
  }
}

/** يتعرف على أخطاء تجاوز الحصة في عائلة Chromium وFirefox بالاسم أو بنص الرسالة (تُثبَّت صياغتها بالتجربة في كل متصفح). */
export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return name === 'QuotaExceededError' || /quota/i.test(String(message ?? ''));
}

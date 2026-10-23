// أخطاء عمليات البيانات في الوسيط (T-8.4). تُبنى في الخلفية وتعبر الرسالة باسمها فتُعاد في الواجهة بصنفها (writer.ts: rebuild).

/** ملف استيراد لا يجتاز الفحص: لم يُكتب منه شيء ولم تُمس البيانات الحالية. */
export class DataImportError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`رُفض الملف ولم تُمس بياناتك: ${problems.join('؛ ')}`);
    this.name = 'DataImportError';
  }
}

/** لا نسخة احتياطية للاستيراد لتُستعاد (لم يُجرَ استيراد، أو حُذفت بحذف المستودع أو المسح الكلي). */
export class NoBackupError extends Error {
  constructor() {
    super('لا توجد نسخة احتياطية للاستيراد لاستعادتها');
    this.name = 'NoBackupError';
  }
}

// نتيجة تجربة HYP-06 («يمكن طلب unlimitedStorage وقت التشغيل بوصفها صلاحية اختيارية»): دُحضت في المتصفحات الأربعة.
// المصدر: evidence/T-1.3/browser-report.md (تجربة فعلية بنقر مستخدم حقيقي، وشاهد يثبت وصول فعل المستخدم)، بتاريخ 2026-10-23:
//  - Chrome 156 وEdge 155 وBrave 156: المانيفست يقبل unlimitedStorage في optional_permissions بلا خطأ ولا تحذير لكن
//    permissions.request ترفضها («Only permissions specified in the manifest may be requested.»)، بينما يمنح الشاهد (alarms) عبر
//    المسار نفسه. بلا إعلان أساسي: الحصة 10,485,760 بايت وتجاوزها يرفع «Resource::kQuotaBytes quota exceeded». معلنة أساسية: تُرفع الحصة.
//  - Firefox 158.0.1: المانيفست يحذّر من أنها غير مسموحة اختيارية، وpermissions.request ترفضها بخطأ نوع؛ ولم يظهر سقف للحصة
//    حتى 96 ميغابايت دون إعلان.
// نتيجة التصميم: واجهة التوسعة لا تعرض «اطلب التخزين غير المحدود» علاجًا لامتلاء الحصة (العلاج الوحيد المثبت: التصدير). وإن احتاجت
// مهمة لاحقة (T-4.4 تنزيل نموذج) مساحة تتجاوز 10 ميغابايت في عائلة Chromium فالطريق المثبت الوحيد إعلانها أساسية في المانيفست،
// وهو قرار صلاحيات يخص مالك المشروع وDEC-03، لا هذه الطبقة.

export type UnlimitedStorageHandling = 'declare-required-in-manifest' | 'not-needed-in-tested-range';

export interface UnlimitedStorageFinding {
  readonly browser: 'chrome' | 'edge' | 'brave' | 'firefox';
  readonly version: string;
  readonly requestableAtRuntime: false;
  /** سقف الحصة الافتراضي بالبايت إن كان له سقف مقيس. */
  readonly defaultQuotaBytes: number | null;
  readonly handling: UnlimitedStorageHandling;
}

export const UNLIMITED_STORAGE_REQUESTABLE_AT_RUNTIME = false as const;

export const UNLIMITED_STORAGE_FINDINGS: readonly UnlimitedStorageFinding[] = [
  { browser: 'chrome', version: '156.0.8078.47', requestableAtRuntime: false, defaultQuotaBytes: 10_485_760, handling: 'declare-required-in-manifest' },
  { browser: 'edge', version: '155.0.4283.60', requestableAtRuntime: false, defaultQuotaBytes: 10_485_760, handling: 'declare-required-in-manifest' },
  { browser: 'brave', version: '156.0.8078.48', requestableAtRuntime: false, defaultQuotaBytes: 10_485_760, handling: 'declare-required-in-manifest' },
  { browser: 'firefox', version: '158.0.1', requestableAtRuntime: false, defaultQuotaBytes: null, handling: 'not-needed-in-tested-range' },
];

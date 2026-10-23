# تجارب المتصفحات الفعلية لـT-1.3 (`tests/core/storage/browser/run.mjs`)

- التاريخ: 2026-10-23. المتصفحات تباعًا بملف تعريف مؤقت لكل تشغيل؛ لا شبكة (طلبات github.com تُخدَم من العينة المحلية).
- الإضافة الاختبارية (لا تُشحن) تُبنى بـ`tests/core/storage/browser/build.mjs` وتستعمل طبقتي التخزين والإعدادات الحقيقيتين من `src/core`.
- النتائج الخام: [`browser-results.json`](browser-results.json).

## TEST-CORE-04 — بث تغيّر مفتاح وحدة بين السياقات (`AC-1.3`)

السياقات: صفحتا إضافة (تبويبان) وسكربت محتوى فعلي على صفحة `https://github.com/octo/demo/pull/42` تُخدَم من `fixtures/pages/pr.html`. تُبدَّل `modules.a.enabled` من سياق فيُلاحَظ الأثر في الآخرين (حدث remote في الصفحة الأخرى وإزالة/إعادة حقن الوحدة في DOM سكربت المحتوى).

| المتصفح | الإصدار | النتيجة | وصل الإيقاف للصفحة الثانية | أُزيلت الوحدة من سكربت المحتوى | وصل التفعيل للصفحة الأولى | أُعيد حقنها | تقارب بعد 10 تبديلات متناوبة | تبقى بعد إعادة التحميل | الوسيط صفحة←صفحة (مللي) | الوسيط صفحة←DOM المحتوى (مللي) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| Chrome | 156.0.8078.47 | **اجتاز** | نعم | نعم | نعم | نعم | نعم | نعم | 1 | 1 |
| Edge | 155.0.4283.60 | **اجتاز** | نعم | نعم | نعم | نعم | نعم | نعم | 1 | 1 |
| Brave | 156.0.8078.48 | **اجتاز** | نعم | نعم | نعم | نعم | نعم | نعم | 1 | 1 |
| Firefox | 158.0.1 | لم يُجرَ: الخطة تحصر TEST-CORE-04 في Chrome وEdge وBrave | — | — | — | — | — | — | — | — |

لم يُجرَ: اللوحة الجانبية (`sidePanel`) لأنها لا تُفتح دون فعل مستخدم فعلي (تغطيها `T-1.4` في `TEST-CORE-05` و`TEST-CORE-06`)؛ ونافذة ثانية منفصلة (تشترك التبويبات في ملف التعريف ومسار البث نفسه).

## HYP-06 — هل تُطلب `unlimitedStorage` وقت التشغيل؟ (`TEST-STORAGE-02`)

ثلاثة متغيرات للمانيفست: **baseline** (`storage` وحدها) و**optional** (`unlimitedStorage` و`alarms` الشاهد في `optional_permissions`) و**declared** (`unlimitedStorage` في `permissions`). الطلب يجري داخل معالج نقر فعلي (`activation` تعني `navigator.userActivation.isActive` وقت النقر)؛ والشاهد `alarms` يُطلب بالمسار نفسه ليثبت أن فعل المستخدم وصل.

| المتصفح | تحميل المتغير optional | طلب `unlimitedStorage` | الشاهد `alarms` | الحصة بلا إعلان (baseline) | خطأ تجاوز الحصة | الدفعة المتجاوزة ذرّية؟ | بعد الطلب المحاوَل | إعلانها أساسية (declared) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Chrome 156.0.8078.47 | يُقبل بلا خطأ ولا تحذير | رُفضت (activation=true): Only permissions specified in the manifest may be requested. | مُنحت (activation=true) | 10485760 بايت | Error: Resource::kQuotaBytes quota exceeded | نعم | الحصة كما هي (تجاوزها ما زال يفشل) | رُفع السقف (نجحت 12 ميغابايت) |
| Edge 155.0.4283.60 | يُقبل بلا خطأ ولا تحذير | رُفضت (activation=true): Only permissions specified in the manifest may be requested. | مُنحت (activation=true) | 10485760 بايت | Error: Resource::kQuotaBytes quota exceeded | نعم | الحصة كما هي (تجاوزها ما زال يفشل) | رُفع السقف (نجحت 12 ميغابايت) |
| Brave 156.0.8078.48 | يُقبل بلا خطأ ولا تحذير | رُفضت (activation=true): Only permissions specified in the manifest may be requested. | مُنحت (activation=true) | 10485760 بايت | Error: Resource::kQuotaBytes quota exceeded | نعم | الحصة كما هي (تجاوزها ما زال يفشل) | رُفع السقف (نجحت 12 ميغابايت) |
| Firefox 158.0.1 | تحذير مانيفست: غير مسموحة اختيارية | رُفضت (activation=true): Type error for parameter permissions (Error processing permissions.0: … | رُفضت: Type error for parameter permissions (Error proces… | بلا QUOTA_BYTES | لا خطأ (نجحت الكتابة) | لا ينطبق (لم يُرفض شيء) | لا سقف أصلًا | نجحت 12 ميغابايت (لا سقف في baseline أيضًا) |

ملاحظة Firefox: الشاهد `alarms` ليس صلاحية اختيارية في Firefox أيضًا (يرفضه بخطأ نوع)، فلا يصلح شاهدًا هناك؛ ورفض `unlimitedStorage` ثابت بتحذير المانيفست وبخطأ النوع ذاته مع `activation=true`.

Firefox بلا إعلان: كُتبت دفعة بحجم 96 ميغابايت (100663360 بايت محفوظة) بلا خطأ؛ فلا سقف ظاهرًا في المدى المقيس، والمقيس لا يثبت غياب كل سقف (قد يحدّه القرص).

**الحكم على HYP-06:** دُحضت في المتصفحات الأربعة المقيسة. لا تُطلب `unlimitedStorage` وقت التشغيل في أي منها؛ في عائلة Chromium تُرفع الحصة (10 ميغابايت) بإعلانها أساسية فقط، وFirefox لا يُظهر سقفًا في المدى المقيس. لذا لا يعرض الخطأ الصادر عن الطبقة علاج «اطلب التخزين غير المحدود»، ويبقى علاجه التصدير (`src/core/storage/capabilities.ts`).

## طبقة `Store` الحقيقية فوق `storage.local` الحقيقية (`TEST-STORAGE-02`، الجزء الفعلي)

كتابة سجل بحجم 12 ميغابايت ثم استيراد سجل بالحجم نفسه، والمتوقع: خطأ `StorageQuotaError` مفهوم، والبيانات السابقة سليمة، ولا يبقى سجل عملية.

| المتصفح | الكتابة المتجاوزة | بيانات ما قبلها | الاستيراد المتجاوز | بيانات ما قبله | سجل عملية متبقٍّ | التصدير يعمل |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| Chrome | `QUOTA_EXCEEDED` (المرحلة write؛ العلاج export؛ السبب «Resource::kQuotaBytes quota exceeded») | سليمة | `QUOTA_EXCEEDED` (المرحلة import) | سليمة | لا | نعم |
| Edge | `QUOTA_EXCEEDED` (المرحلة write؛ العلاج export؛ السبب «Resource::kQuotaBytes quota exceeded») | سليمة | `QUOTA_EXCEEDED` (المرحلة import) | سليمة | لا | نعم |
| Brave | `QUOTA_EXCEEDED` (المرحلة write؛ العلاج export؛ السبب «Resource::kQuotaBytes quota exceeded») | سليمة | `QUOTA_EXCEEDED` (المرحلة import) | سليمة | لا | نعم |
| Firefox | لا خطأ: لا سقف في هذا المتصفح (نجحت الكتابة) | لا ينطبق | لا خطأ: لا سقف (نجح الاستيراد) | لا ينطبق | لا | نعم |

# تقرير `T-5.5`: رمز الوصول الاختياري (فرع الدعم، `DEC-04` د-5)

- **التاريخ:** 2026-10-24 · **المرحلة:** `MJ15` على `mj/15-token-context-builder` من `main` (`464d632`).
- **الفرع المنطبق:** فرع الدعم (`AC-D7` و`AC-5.5` و`TEST-PR-05` و`TEST-SEC-01` إلى `03`). فرع عدم الدعم (`AC-5.5N` و`TEST-SEC-04`) **لا ينطبق** بـ`DEC-04`/د-5 ولم يُشغَّل.
- **المدخل:** `evidence/T-0.5/report.md` (قائمة أقل الصلاحيات وجدول الإشارات وحكم `HYP-07`)، وقيد `AD-24` (`evidence/wave-E/h-background-api/report.md`).

## ما نُفِّذ

| الجزء | الملفات | ما يفعله |
| :--- | :--- | :--- |
| الطبقة الواحدة (`AD-24`) | `src/core/api/client.ts` و`port.ts` و`index.ts` | `PublicApiClient` يقبل مصدر رمز (`token`) في الخلفية وحدها، ويضيف `Authorization: Bearer` هناك وحده. متعقّب حد وذاكرة `ETag` منفصلان للموثَّق، وتفريغهما بتغيّر الرمز أو مسحه (يُكشف بمقارنة الرمز في كل طلب، بلا اعتماد على رسالة). 401 فشل `unauthorized` معلن بلا رجوع صامت إلى الوصول المجهول؛ 403 يسمّي الصلاحية من `x-accepted-github-permissions`؛ 404 بالرمز «لا يشمله الرمز»؛ موعد الانتهاء من `github-authentication-token-expiration`؛ وتعذّر قراءة الرمز فشل `token` بلا طلب. أي ظهور للرمز في رسالة خطأ يُستبدل (`redactToken`). الحالة عبر المنفذ تحمل «بالرمز» وموعد الانتهاء لا الرمز. مسارات `isPublicPath` لم تتسع. |
| المخزن | `src/modules/d/token/store.ts` | ذاكرة الجلسة (`storage.session`، ويُضبط `TRUSTED_CONTEXTS` قبل الكتابة حيث يُتاح) افتراضًا، والقرص الصريح (IndexedDB بأصل الإضافة) باختيار؛ الحفظ في أحدهما يمحوه من الآخر، والمسح يمحوه من الاثنين. القرص حيث يتيح المتصفح `setAccessLevel` (عائلة Chromium)؛ وFirefox جلسة وحدها (`HYP-07` خاطئة). |
| الإدخال | `src/modules/d/token/TokenSection.tsx` و`format.ts`، و`src/options/main.tsx` و`SettingsTab.tsx` | قسم في صفحة الإعدادات وحدها (فتحة `secretSections` تمرّرها صفحة الإعدادات؛ لا الدرج ولا اللوحة). حقل غير متحكَّم به يُفرَّغ بعد الحفظ، ولا يُعرض الرمز ولا جزء منه. الرمز دقيق الحبيبات (`github_pat_`) وحده. قائمة الصلاحيات الست Read-only ظاهرة عند الإدخال، وما لا يُتاح بالرمز معلن (Checks). التحقق `/rate_limit` عبر منفذ الخلفية. المسح متاح دائمًا. |
| الخلفية | `src/background/main.ts` | تقرأ الرمز من مخزنه لكل طلب، فلا يعبر الرمز أي رسالة (الإعدادات تكتبه في المخزن مباشرة). |
| الوحدة (د) بالرمز | `src/modules/d/token/actions-checks.ts`، و`src/modules/d/blockers/api-read.ts` و`view.tsx`، و`src/modules/d/pr-status/module.tsx` | في المستودع الخاص ترفض check-runs الرمز (403، لا صلاحية Checks للرموز دقيقة الحبيبات)، فتُقرأ مهام Actions لالتزام الرأس (Actions: read) بخطواتها، ويُعلن أن فحوص التطبيقات الأخرى غير متاحة بالرمز. الشارة «DOM + API (بالرمز)» ولوحة API تعلن القراءة بالرمز. |
| النوع | `src/modules/h/api-access.ts` | سطرا ربط لفشلَي `unauthorized` و`token` (اكتمال النوع). |

## القرارات التقنية (داخل المرحلة، لا قرار مفوَّض)

1. **القرص في IndexedDB لا `storage.local`:** سكربت المحتوى يقرأ `storage.local` لإعداداته (`openSettings` في `src/content/main.tsx`)، فضبط `setAccessLevel(TRUSTED_CONTEXTS)` عليها يكسر الإضافة. وIndexedDB في سكربت المحتوى لأصل الصفحة لا الإضافة، فلا يصلها إلا صفحات الإضافة وخلفيتها (مقيس في الأربعة أدناه). غير مشفَّرة، ونص الواجهة يقول ذلك.
2. **Firefox جلسة وحدها:** كما تنص «المخاطر» ونتيجة `HYP-07`، مع أن آلية IndexedDB نفسها لا تحتاج `setAccessLevel`. فتح القرص في Firefox قرار للمالك لا للمرحلة.
3. **الرمز دقيق الحبيبات وحده:** الرمز الكلاسيكي لا يُقصر على القراءة في المستودعات الخاصة، فيُرفض قبل أي حفظ أو طلب.
4. **لا رسالة تحمل الرمز:** الكتابة من صفحة الإعدادات إلى المخزن مباشرة، والخلفية تقرأ؛ وأحداث `storage.onChanged` للجلسة لا تصل سكربت المحتوى (مقيس).

## الفحوص ونتائجها

| الفحص | النتيجة | الدليل |
| :--- | :--- | :--- |
| `npx vitest run tests/modules/d/token` | 4 ملفات، 41 اجتازت | `evidence/MJ15/tests-stage.txt` |
| `tests/modules/h/background-api.test.ts` (موسَّع بحالة الرمز كما يطلب `AD-24`) | 12 اجتازت | `evidence/MJ15/tests-full.txt` |
| `TEST-SEC-01` و`TEST-SEC-03` وتدقيق الشبكة في المتصفحات (`tests/modules/d/token/browser/token-check.mjs`) | فحص ساكن ✓، Chrome 27/27، Edge 27/27، Brave 27/27، Firefox 24/24 = **106/106** | `browser-token-check.txt` و`browser-token-check.json` |
| الطقم كاملًا | 108 ملفات، 1790 اجتازت و2 متخطيان (المشروطان المعروفان) | `evidence/MJ15/tests-full.txt` |

### معايير القبول

- **`AC-5.5` (١):** الإدخال في صفحة الإعدادات وحدها (`token-section.test.tsx`: SettingsTab لا يرسم قسم السرّ في `drawer` ولا `native`). الفحص الساكن للحزم المبنية: مفتاح الجلسة وقاعدة IndexedDB و`Authorization` و`Bearer` في `background.js` و`options.js` وحدهما، **صفر** في `content.js` و`sidepanel.js` و`reader.js` في الحزمتين. في المتصفحات من عالم سكربت المحتوى نفسه (ملفات مسبار تُنفَّذ بـ`scripting.executeScript`): `storage.session` ترمي خطأ رفض (عائلة Chromium) أو غير معرّفة أصلًا (Firefox)، و`storage.local` وIndexedDB (لأصل `https://github.com`) بلا رمز، وأحداث `storage.onChanged` ورسائل `runtime.onMessage` التي وصلته بلا رمز، وDOM الصفحة وجذور الظل بلا رمز. Firefox: القرص محجوب ويُعلن قيد `setAccessLevel`. ✓
- **`AC-5.5` (٢):** كل طلبات `api.github.com` في الأربعة من الخلفية (Chromium: `service worker`؛ Firefox: بلا `Origin` صفحة)، وصفر من الصفحة. ✓
- **`AC-5.5` (٣) / `TEST-SEC-02`:** صفر ظهور للرمز في الرسائل والردود ورسائل الخطأ والروابط والكونسول وحزمة السياق (`background-token.test.tsx` و`client-token.test.ts` و`tests/modules/e/builder-ui.test.tsx`، والكونسول في المتصفحات الأربعة). ملفات التصدير والملاحظات (`MJ13`) لم تُدمج بعد في هذا الفرع: لم يُجرَ عليها، ولا يصلها الرمز لأن سكربت المحتوى واللوحة لا يملكانه.
- **`AC-5.5` (٤) و(٥) / `TEST-SEC-03`:** الجلسة افتراضًا، والقرص بنص «غير مشفَّر» صريح، وكل حفظ في مكان واحد (`store.test.ts`، والمتصفحات: الجلسة وحدها ثم IndexedDB وحدها)؛ والمسح يمحوه من الموضعين والطلب التالي بلا `Authorization`. ✓
- **`AC-5.5` (٦):** قائمة `T-0.5` (Metadata وContents وPull requests وCommit statuses وActions وIssues، كلها Read-only) ظاهرة بجوار الحقل في الأربعة. ✓
- **`AC-D7` / `TEST-PR-05`:** على `fixture-token-states.json` (جدول إشارات `T-0.5` بمستودع خاص مختلَق): بالرمز يُقرأ الطلب وحماية الفرع وحالة الالتزام، وفحوص Actions بدل check-runs المرفوضة، وتظهر في البطاقة بمصدرها «DOM + API (بالرمز)» مع الخطوة الفاشلة؛ وبعد المسح تعمل البطاقة على الصفحة وتعلن 404 بلا خطأ موقِف ولا نسخة محفوظة من المستودع الخاص؛ وكل الطلبات `GET` لمسارات قراءة؛ ولا صلاحية كتابة في الواجهة (فحص النص). ✓ على العينة وفي المتصفحات الأربعة. **لم يُجرَ** على مستودع المالك الخاص برمز حقيقي: يتطلب إدخال رمز المالك نفسه، ولا تُدخل الجلسة أسرارًا حقيقية؛ وينتظر المالك (الخطوات في تقرير التسليم).

## ما لم يُجرَ ولماذا

- المستودع الخاص الحقيقي برمز المالك (`TEST-PR-05` الحي): أعلاه.
- نص سجل المهمة عبر API بالرمز: يُحوَّل إلى رابط موقَّع خارج `api.github.com` (T-0.5)، فلا يُطلب؛ ويُقرأ من صفحة المهمة (شرح سجل الفحص، same-origin للمسجَّل). معلن في الواجهة.
- رمز منتهٍ فعلًا وتجاوز حد 5000: غير مقيسين في `T-0.5`؛ والعينة تتبع التوثيق (401، و403 بنفاد).

## كيف يُعاد

```bash
npx vitest run tests/modules/d/token tests/modules/h/background-api.test.ts
npm run build
node tests/modules/d/token/browser/token-check.mjs chrome edge brave firefox --out-dir evidence/T-5.5
```

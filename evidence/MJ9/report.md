# تقرير تحقق المرحلة `MJ9` (الملاحظات وكاشف README والمرشد والاكتشاف والدليل)

> التاريخ 2026-10-23. الفرع `mj/9-notes-community-first-layer`. الأساس `mj-D/base`. المودل: Sonnet 5.5 (`claude-sonnet-5-5`) كما في الترويسة.

## أوامر التحقق ونتائجها

| الفحص | الأمر | النتيجة | الدليل |
| :--- | :--- | :--- | :--- |
| الأنواع | `npx tsc --noEmit` | بلا أخطاء | `typecheck.txt` |
| أمر المرحلة | `npx vitest run tests/modules/g/notes tests/modules/h` | 21 ملفًا، **376 اجتازت** | `vitest-stage-command.txt` |
| الطقم كاملًا | `npx vitest run` | 52 ملفًا، **958 اجتازت و1 متخطى** (المتخطى من `MJ3`: إعادة نقل القاموس المشروط بـ`GHSIM_SOURCE`) | `vitest-full.txt` |
| البناء | `npm run build` | الحزمتان بلا أخطاء | `build.txt` |
| lint الحزمة | `npm run lint:firefox` | 0 أخطاء و0 تنبيهات و0 ملاحظات | `web-ext-lint.txt` |
| تحميل الحزم | `node scripts/load-check.mjs` | Chrome 156 وEdge 155 وBrave 156 وFirefox 158.0.1: مفعَّلة بلا أخطاء مانيفست ولا تشغيل ولا تحذيرات والخلفية تعمل | `load-check.md` |
| تكامل الحزمة المشحونة | `node evidence/MJ9/integration-check.mjs` | Chrome وEdge وBrave: **48/48**؛ Firefox: **50/50**؛ أخطاء الإضافة 0 | `integration.json` و`integration-run.txt` و`integration-screens/` |

فحص التكامل يركّب الوحدتين الحقيقيتين من سكربت المحتوى المشحون على عينات تُخدَم بدل `github.com`، ويشغّل اللوحة الأصلية في تبويب (التبويب النشط صفحة GitHub)، ويختبر أربعة محاور: (1) شريط README وبطاقة الملف الشخصي، (2) الملاحظات من الصفحة إلى اللوحة وبالعكس بسياقين حقيقيين، وإيقاف الوحدة (ز) من صفحة الإعدادات يعيد `<main>` حرفيًا، (3) الدرج بلا حقول كتابة في أي تبويب، (4) لوحة المجتمع وتدقيق الشبكة. وكشف خطأً حقيقيًا (سباق في `GuideView` يُسقط نتيجة القراءة) أُصلح وأُضيف له اختبار.

## ما لم يُجرَ

- **على صفحات github.com الحية**: لم يُجرَ لأي ميزة هنا (المرحلة محلية بلا شبكة حقيقية)؛ العينات اصطناعية ببنى مقيسة في `T-0.4` ولقطة حية محفوظة وقياس قراءة فقط لصفحتي ملف شخصي. محددات رقم السطر في الفروق وبطاقة الملف الشخصي في صفحات غير المقيسة تبقى بذورًا.
- **قبول نافذة الصلاحية الاختيارية في عائلة Chromium** آليًا؛ المنح الفعلي اختُبر في Firefox وحده بتعطيل نافذته (`extensions.webextOptionalPermissionPrompts=false`) وبنقر موثوق. في Chromium يبقى الطلب معلّقًا بلا أي طلب إلى `api.github.com` (مقيس).
- التحويل `github.com/raw` ← `raw.githubusercontent.com` طرفًا لطرف (انظر `T-9.3`).
- فحص إمكانية الوصول (`axe-core`) وميزانيات الأداء: من `T-10.1`.

## حجم الحزمة (غير مصغَّرة)

| الملف | الأساس `mj-D/base` | بعد `MJ9` |
| :--- | ---: | ---: |
| `content.js` | 178,379 | 391,964 |
| `sidepanel.js` | 95,145 | 279,350 |
| `options.js` | 90,251 | 97,373 |
| `background.js` | 39,825 | 65,061 |

(قرار التصغير للتغليف.) زيادة `background.js` (نحو 25 KB) سببها أن الخلفية تستورد `defineSectionSettings` من `src/options/sections.ts` فتحمل كل ما تستورده الأقسام المسجَّلة فيه، فصار Preact (النواة والخطّافات وjsx-runtime) في الخلفية بعد أول قسم مسجَّل؛ تجنّبتُ `preact/compat` في قسمي الإعدادات. حلّ أوسع (فصل التعريفات عن المكوّنات في `sections.ts`) خارج هذه المرحلة.

## ملفات مشتركة مُسّت (تُضم بترتيب الدمج)

| الملف | التغيير |
| :--- | :--- |
| `src/core/registry.ts` | سطران في `BUILTIN_MODULES`: `MODULE_G` و`MODULE_H` + استيرادهما. |
| `src/options/sections.ts` | قسمان في `SETTINGS_SECTIONS` + استيرادهما. |
| `src/sidepanel/views.ts` | واجهات الوحدتين في `PANEL_VIEWS` (`NOTES_PANEL_VIEW` و`NOTES_DRAWER_VIEW` و`...COMMUNITY_PANEL_VIEWS`) + استيراداتها. |

وملفات جديدة في مجلد مشترك لا يمسّها غيري: `src/shared/page/` (وصف الصفحة ومصدراها) و`src/shared/ui/useStyles.ts` و`src/shared/ui/NativeOnlyNotice.tsx`. لم يُمسّ `package.json` ولا القفل ولا المانيفست ولا `src/content` ولا `src/background` ولا أي اختبار من مراحل سابقة. لا اعتمادية جديدة ولا صلاحية جديدة (`api.github.com` الاختيارية من `MJ5` كما هي).

## قرارات اتخذتها المرحلة وتستحق انتباه المالك

1. **الدرج بلا حقول كتابة**: اختبار `tests/core/ui-host/drawer.test.tsx` (من `MJ5`، وقاعدة DEC-04 في قائمة مراجعتها «أي حقل إدخال…») يمنع أي حقل نص في الدرج. فاقتُصرت واجهات الإدخال (الملاحظات والاكتشاف والموارد) على اللوحة الأصلية، وفي الدرج رسالة تدل عليها؛ والمرشد وREADME العربي (أزرار وروابط) يظهران في الاثنين. البديل: يعدّل المالك ذلك الاختبار (وسكربتي المتصفح في `tests/core/ui-host/browser`) ليحظر حقول الأسرار لا كل حقل، ثم يرفع `surfaces` في الواجهات.
2. **القائمة الأولى لدليل الموارد** بانتظار مراجعة بشرية (انظر `T-9.5`).
3. **فتح التخزين كسولًا داخل الوحدتين** (`openSettings` عند أول استعمال) بدل ربط يضيفه سكربت المحتوى؛ فلا تغيير في `src/content` ولا اللوحة. الثمن: نسخة ثانية من `Store` في كل سياق (سجلات بأسماء مختلفة فلا تنازع).

## ما يحتاجه منسّق الدمج

- **ملفات مشتركة**: الثلاثة أعلاه، إضافات سطرية متوقع تقاطعها مع `MJ7` و`MJ8` في المواضع نفسها؛ تُضم كلها بترتيب الدمج.
- **اختبارات تُسجَّل في `data/status.json`**: `TEST-NOTE-01` (`AC-G1`) و`TEST-COMM-01` (`AC-H1`) و`TEST-COMM-03` (`AC-H3`) و`TEST-COMM-04` (`AC-H4`) و`TEST-COMM-05` (`AC-H5`) و`TEST-COMM-06` (`AC-H6`، **بشرط المراجعة البشرية للشيفرة** التي تكمله): اجتازت بوحدات وجولة متصفحات بأدلتها أعلاه. المتصفحات الأربعة نُفِّذت كلها.
- **ما ينتظر المالك**: مراجعة قائمة الموارد الأولى؛ قرار الدرج (1)؛ المراجعة المستقلة (أدناه)؛ وملاحظة `AC-10.1` عن `raw.githubusercontent.com` لـ`T-10.1`.

## برومبت مراجعة مستقل جاهز للنسخ

> راجع للقراءة فقط الفرع `mj/9-notes-community-first-layer` في مستودع مجهر (`git diff mj-D/base...mj/9-notes-community-first-layer -- src tests/modules/g tests/modules/h tests/shared evidence/MJ9/integration-check.mjs`). ابحث عن: (1) أي مسار يصدر منه طلب إلى `api.github.com` دون `fetchApiGithub` (`src/modules/h/api-access.ts`) أو قبل `permissions.request()`، أو لا يكون `request()` فيه أول استدعاء متزامن في معالج نقر (`docs-scan.ts` و`counts.ts` و`check.ts` وما يستدعيها في `ReadmeBanner.tsx` و`GuideView.tsx` و`ResourcesView.tsx`)؛ وأي استدعاء لها من تأثير (`useEffect`) أو عند الرسم؛ وأي `fetch` إلى مضيف غير `github.com` و`api.github.com`. (2) في الوحدة (ز): أي مسار يرسل نص الملاحظة أو رابطها إلى أي جهة، وأي موضع يُعامَل فيه نص ملاحظة أو مورد مستورد أو `url` مخزَّن على أنه HTML أو رابط غير `https`، وأي كتابة تخزين بلا `assertJsonValue` أو تتنازع بين السياقات (`src/modules/g/notes/repository.ts` و`src/modules/h/resources/repository.ts`)، وحالة المرساة: هل يمكن أن يغيّر تعديل النص حالتها أو العكس. (3) دورة الحياة: تسرب مستمعات أو مراقبات أو مؤقتات بعد الإيقاف في `src/modules/g/notes/module.tsx` و`markers.tsx` و`src/modules/h/module.tsx`، وعدم عكس DOM (`ctx.mutations`)، وسلوكها عند تنقل Turbo وعند إعادة رسم GitHub لأرقام الأسطر. (4) F-H6: اقرأ `src/modules/h/discovery/*` وكل ما يمس الاسم أو اسم المستخدم أو الموقع أو النبذة، وأي نص معروض، ثم أبلغ عن أي مسار يستنتج أو يوحي بجنسية أو هوية أو لغة أم أو يضع وسمًا على شخص؛ وقيّم اختبار المسح `tests/modules/h/discovery/no-inference.test.ts`: ما الذي يفوته؟ (5) تقاطع الملفات المشتركة (`src/core/registry.ts` و`src/options/sections.ts` و`src/sidepanel/views.ts`) مع `MJ7` و`MJ8`، وأثر استيراد الأقسام في حزمة الخلفية. (6) دقة `src/data/resources/resources.json` وصدق ادعاءاته. لا تعدّل شيئًا؛ أبلغ بالملف والسطر والسيناريو الذي يكشف الخلل.

# تقرير الدليل — T-1.1 (هيكل الإضافة ونظام البناء)

- المرحلة: `MJ1` · الفرع: `mj/1-core-scaffold` · الأساس: `mj-A/base`
- التاريخ: 2026-10-23
- البيئة: Node v24.18.1 · npm 11.16.0 · TypeScript 7.0.2 · Vite 8.3.5 · Vitest 5.0.5 · web-ext 10.8.0 · playwright-core 1.64.1
- المتصفحات: Chrome 156.0.8078.47 · Edge 155.0.4283.60 · Brave 156.0.8078.48 (Chromium 156) · Firefox 158.0.1 (ثبّته المالك في 2026-10-23 بعد التسليم الأول).

## النتيجة بإيجاز

| الفحص | الأمر | النتيجة | الملف |
| :--- | :--- | :--- | :--- |
| بناء الحزمتين | `npm run build` | نجح: `dist/chromium/` و`dist/firefox/` (مانيفست وbackground.js وcontent.js وsidepanel.html لكل منهما) | [`build.txt`](build.txt) |
| فحص نص المانيفست | `grep -c '<all_urls>\|\*://\*/\*' dist/*/manifest.json` | 0 في الحزمتين؛ `host_permissions` = `["https://github.com/*"]` وحدها | هذا الملف |
| فحص مانيفست Firefox | `npx web-ext lint --source-dir dist/firefox` | 0 أخطاء · 0 ملاحظات · 0 تحذيرات | [`web-ext-lint.txt`](web-ext-lint.txt) |
| تحميل في Chrome وEdge وBrave وFirefox | `node scripts/load-check.mjs` | نجح في الأربعة: الحالة `ENABLED`، لا أخطاء مانيفست ولا أخطاء تشغيل ولا تحذيرات، وبدأت الخلفية | [`load-check.md`](load-check.md) |
| الأنواع والاختبارات (`TEST-BUILD-01`) | `npx tsc --noEmit` · `npx vitest run` | tsc بلا أخطاء · 14 من 14 اختبارًا اجتازت | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |

## معيار القبول `AC-1.1` جزءًا جزءًا

| الجزء | الحالة | الدليل |
| :--- | :--- | :--- |
| تُبنى حزمتا عائلة Chromium وFirefox | تحقق | `build.txt` |
| تُحمَّل حزمة Chromium في Chrome بلا أخطاء مانيفست | تحقق | `load-check.md` (Chrome 156) |
| تُحمَّل حزمة Chromium في Edge وBrave بلا أخطاء مانيفست | تحقق (زيادة على المطلوب في المعيار) | `load-check.md` |
| تُحمَّل حزمة Firefox في Firefox بلا أخطاء مانيفست | تحقق: Firefox 158.0.1 ثبّتها مؤقتًا (`Addon:Install`) فكانت مفعَّلة ومتوافقة بلا أخطاء مانيفست ولا تحذيرات، وخلفيتها `running`، ومضيفها المسموح `https://github.com/*` وحده | `load-check.md` + `web-ext-lint.txt` |
| صلاحيات المضيف الأساسية `https://github.com/*` وحدها، ولا `<all_urls>` | تحقق | فحص نصي أعلاه + `tests/build/build.test.ts` + حارس `assertManifest` في وقت البناء |
| الاسم في المانيفست هو الاسم المعتمد في `DEC-06` | تحقق | `"name": "مِجهَر"` في الحزمتين (ويطابق نص `AC-1.1` في `EXECUTION_PLAN.md`) |

## كيف عُمل التحميل في المتصفحات

- **عائلة Chromium:** `--load-extension` معطَّل في إصدارات Chrome المعبَّأة الحديثة، فيحمّل `load-check.mjs` الحزمة عبر CDP بالأمر `Extensions.loadUnpacked` (يتطلب `--enable-unsafe-extension-debugging`) ثم يقرأ `chrome.developerPrivate.getExtensionsInfo` من `chrome://extensions` فيعرف أخطاء المانيفست وتحذيرات التثبيت وحالة التفعيل، وينتظر بدء الـservice worker.
- **Firefox:** يشغَّل `/Applications/Firefox.app` بلا نافذة (`-headless -marionette -remote-allow-system-access -no-remote`) على ملف تعريف مؤقت ومنفذ Marionette عشوائي، ثم `Addon:Install` بـ`temporary: true` لحزمة `dist/firefox`، ثم في سياق chrome: `AddonManager.getAddonByID` (التفعيل والتوافق) و`WebExtensionPolicy` (المضيف المسموح، `extension.errors`/`extension.warnings`، `backgroundState`) ورسائل وحدة التحكم الصادرة من أصل الإضافة لأخطاء التشغيل. البديل `web-ext run` اعتُبر أضعف دليلًا لأنه لا يعيد أخطاء المانيفست ولا حالة الخلفية.
- كل متصفح بملف تعريف مؤقت جديد في `os.tmpdir()` يُحذف عند الانتهاء؛ فلا يُمس ملف تعريف المستخدم ولا نوافذه المفتوحة (Brave كان مفتوحًا أثناء الفحص). المتصفحات تُفحص تباعًا، ولا يُفتح موقع ولا تُستعمل الشبكة. بعد كل تشغيل: لا عمليات متبقية ولا مجلدات مؤقتة.
- **تحكمات سلبية** (للتأكد أن الفحص يفشل حين يجب):
  - Chrome: حزمة بلا `background.js` رُفضت («تعذر تحميل النص البرمجي للخلفية»)، وحزمة تشير إلى سكربت محتوى غائب رُفضت («تعذَّر تحميل ملف JavaScript 'nope.js'»).
  - Firefox: حزمة Chromium داخل Firefox رُفضت («background.service_worker is currently disabled. Add background.scripts»)؛ وحزمة بـ`strict_min_version: 999.0` رُفضت («not compatible with application version»)؛ وحزمة بصلاحية غير موجودة نجحت مع تحذير ظاهر في عمود التحذيرات؛ وحزمة بلا `background.js` سجّلت فشلًا بخطأ تشغيل («Loading failed for the <script>») لأن Firefox لا يرفضها عند التثبيت.
  - الاختبارات: إدخال `<all_urls>` في `src/manifest/chromium.json` أسقط المجموعة بخطأ الحارس («يوجد نمط يشمل كل المواقع») ثم استُعيد الملف.

## القرارات والتغييرات بعد التسليم الأول

1. **الاسم (تعارض الوثائق):** مواصفة المرحلة و`data/plan.json` كانتا تقولان معرّفًا محايدًا (`placeholder`)، بينما نص `T-1.1` و`AC-1.1` في `EXECUTION_PLAN.md` يذكران الاسم المعتمد في `DEC-06`. حُسم وفق `DEC-06` (معتمد 2026-10-22): `"name": "مِجهَر"` في الحزمتين، ومعرّف Firefox `mijhar@mijhar.invalid` (نطاق `.invalid` محجوز لا يدّعي ملكية نطاق، ويُراجع عند التغليف `T-10.2`). عُدّل `data/plan.json` ليطابق `EXECUTION_PLAN.md`.
2. **`data_collection_permissions`:** `"required": ["none"]` في `browser_specific_settings.gecko`، مع `strict_min_version` = `140.0` (أقل إصدار يدعم المفتاح؛ الإصدار 140 هو ESR) و`gecko_android.strict_min_version` = `142.0` (أقل إصدار أندرويد يدعمه، وبه يزول تحذير `web-ext lint`). السبب: السلوك الفعلي للإضافة الآن لا يجمع ولا يرسل شيئًا (نقطتا الدخول فارغتان، والحزمة بلا شبكة، وصلاحية المضيف `https://github.com/*` فقط)، والخطة تلتزم بمعالجة محلية دون خدمات سحابية (`AD-07`) وبطلب `api.github.com` اختياريًا بنقر صريح (`AD-08`). يراجع الإعلان كل ما يغيّره: رمز الوصول (`DEC-04`/`T-5.5`) وتنزيل النموذج (`T-4.4`) وأي إرسال لبيانات إلى طرف غير GitHub. يسجَّل القرار في `data/plan.json` (`AD-15`) ويحرسه اختبار في `tests/build/build.test.ts`.
3. **Firefox:** أُضيف إلى `scripts/load-check.mjs` (وكان خارجه بسبب `EV-06`)؛ وأزالت `data_collection_permissions` وجه التحذير الوحيد في `web-ext lint` فصار 0 تحذيرات.

## ملاحظات

1. **`side_panel` في Edge وBrave:** لم يظهر أي تحذير تثبيت على المفتاح `side_panel` ولا الصلاحية `sidePanel` في Edge 155 ولا Brave 156. هذا لا يثبت أن اللوحة تُفتح فعلًا (يلزم `T-1.4`)، فلا يُعامَل معلومة نهائية لفرضية `HYP-14`.
2. **حزم فارغة:** `background.js` و`content.js` ملفان فارغان (0 بايت) لأن نقطتي الدخول فارغتا الوظيفة؛ تحمَّلا وبدأت الخلفية في الأربعة (في Firefox: `backgroundState = running`).
3. **لوحة مؤقتة:** `sidepanel.html` يُنسخ من `src/manifest/sidepanel.placeholder.html` لأن `sidebar_action.default_panel` إلزامي في Firefox. تستبدله `T-1.4`.
4. **حدود فحص Firefox:** الفحص لا يزور موقعًا، فلا يقيس حقن سكربت المحتوى في `github.com` (فارغ الوظيفة الآن)؛ وهو لمرحلة الوحدات.
5. **`npm audit`:** 3 ثغرات بدرجة high كلها من مسار واحد: `web-ext` ← `@devicefarmer/adbkit` ← `node-forge`. أداة تطوير لا تدخل الحزمة، والإصلاح المقترح (`--force`) يخفّض `web-ext`. لم يُطبَّق شيء.

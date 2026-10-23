# تقرير الدليل — T-1.1 (هيكل الإضافة ونظام البناء)

- المرحلة: `MJ1` · الفرع: `mj/1-core-scaffold` · الأساس: `mj-A/base`
- التاريخ: 2026-10-23
- البيئة: Node v24.18.1 · npm 11.16.0 · TypeScript 7.0.2 · Vite 8.3.5 · Vitest 5.0.5 · web-ext 10.8.0 · playwright-core 1.64.1
- المتصفحات المثبتة: Chrome 156.0.8078.47 · Edge 155.0.4283.60 · Brave 156.0.8078.48 (Chromium 156). Firefox غير مثبت (`EV-06`).

## النتيجة بإيجاز

| الفحص | الأمر | النتيجة | الملف |
| :--- | :--- | :--- | :--- |
| بناء الحزمتين | `npm run build` | نجح: `dist/chromium/` و`dist/firefox/` (مانيفست وbackground.js وcontent.js وsidepanel.html لكل منهما) | [`build.txt`](build.txt) |
| فحص نص المانيفست | `grep -c '<all_urls>\|\*://\*/\*' dist/*/manifest.json` | 0 في الحزمتين؛ `host_permissions` = `["https://github.com/*"]` وحدها | هذا الملف |
| فحص مانيفست Firefox | `npx web-ext lint --source-dir dist/firefox` | 0 أخطاء · 0 ملاحظات · 1 تحذير (`MISSING_DATA_COLLECTION_PERMISSIONS`، انظر الملاحظات) | [`web-ext-lint.txt`](web-ext-lint.txt) |
| تحميل في Chrome وEdge وBrave | `node scripts/load-check.mjs` | نجح في الثلاثة: الحالة `ENABLED`، لا أخطاء مانيفست ولا أخطاء تشغيل ولا تحذيرات تثبيت، وبدأ الـservice worker | [`load-check.md`](load-check.md) |
| تحميل في Firefox | — | **لم يُجرَ**: Firefox غير مثبت (`EV-06`) | — |
| الأنواع والاختبارات (`TEST-BUILD-01`) | `npx tsc --noEmit` · `npx vitest run` | tsc بلا أخطاء · 13 من 13 اختبارًا اجتازت | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |

## معيار القبول `AC-1.1` جزءًا جزءًا

| الجزء | الحالة | الدليل |
| :--- | :--- | :--- |
| تُبنى حزمتا عائلة Chromium وFirefox | تحقق | `build.txt` |
| تُحمَّل حزمة Chromium في Chrome بلا أخطاء مانيفست | تحقق | `load-check.md` (Chrome 156) |
| تُحمَّل حزمة Chromium في Edge وBrave بلا أخطاء مانيفست | تحقق (زيادة على المطلوب في المعيار) | `load-check.md` |
| تُحمَّل حزمة Firefox في Firefox بلا أخطاء مانيفست | **لم يُجرَ**: `EV-06` | `web-ext lint` بلا أخطاء، وهو فحص ساكن لا يغني عن التحميل؛ يبقى هذا الشق مفتوحًا بعلم المالك |
| صلاحيات المضيف الأساسية `https://github.com/*` وحدها، ولا `<all_urls>` | تحقق | فحص نصي أعلاه + `tests/build/build.test.ts` + حارس `assertManifest` في وقت البناء |
| الاسم في المانيفست معرّف عمل محايد | تحقق | `"name": "placeholder"` في الحزمتين |

## كيف عُمل التحميل في المتصفحات

- `--load-extension` معطَّل في إصدارات Chrome المعبَّأة الحديثة، فيحمّل `load-check.mjs` الحزمة عبر CDP بالأمر `Extensions.loadUnpacked` (يتطلب `--enable-unsafe-extension-debugging`) ثم يقرأ `chrome.developerPrivate.getExtensionsInfo` من `chrome://extensions` فيعرف أخطاء المانيفست وتحذيرات التثبيت وحالة التفعيل.
- كل متصفح بملف تعريف مؤقت جديد في `os.tmpdir()` يُحذف عند الانتهاء؛ فلا يُمس ملف تعريف المستخدم ولا نوافذه المفتوحة (Brave كان مفتوحًا أثناء الفحص). المتصفحات تُفحص تباعًا، ولا يُفتح موقع ولا تُستعمل الشبكة.
- **تحكم سلبي** (للتأكد أن الفحص يفشل حين يجب): حزمة نُزع منها `background.js` رُفضت بـ«تعذر تحميل النص البرمجي للخلفية»، وحزمة تشير إلى سكربت محتوى غير موجود رُفضت بـ«تعذَّر تحميل ملف JavaScript 'nope.js'». وفي الاختبارات: إدخال `<all_urls>` في `src/manifest/chromium.json` أسقط المجموعة بخطأ الحارس («يوجد نمط يشمل كل المواقع») ثم استُعيد الملف.

## ملاحظات للمالك ومنسّق الدمج

1. **تعارض في الوثائق حول اسم المانيفست:** مواصفة المرحلة وملف `phases/phase-01-core.md` تقولان معرّف عمل محايدًا (`placeholder`) يُستبدل في `T-10.2`، بينما نص `T-1.1` في `EXECUTION_PLAN.md` (القسم 6.2) يذكر اسم `DEC-06` المعتمد «مِجهَر» والمعرّف `mijhar`. اتُّبعت المواصفة وطلب الجلسة: `placeholder`. استبدال الاسم لاحقًا في `src/manifest/chromium.json` و`firefox.json` (وكذا `browser_specific_settings.gecko.id`) وتعديل اختبار الاسم في `tests/build/build.test.ts`.
2. **تحذير `MISSING_DATA_COLLECTION_PERMISSIONS`:** مفتاح `browser_specific_settings.gecko.data_collection_permissions` إلزامي للإضافات الجديدة في AMO. لم يُضف لأنه إقرار خصوصية (مثل `required: ["none"]`) يخص المالك ومرحلة التغليف، وليس خطأ مانيفست. لا يمنع التحميل.
3. **`side_panel` في Edge وBrave:** لم يظهر أي تحذير تثبيت في Edge 155 ولا Brave 156 على المفتاح `side_panel` ولا الصلاحية `sidePanel`. هذا لا يثبت أن اللوحة تُفتح فعلًا (يلزم `T-1.4`)، فلا يُعامَل معلومة نهائية لفرضية `HYP-14`.
4. **حزم فارغة:** `background.js` و`content.js` ملفان فارغان (0 بايت) لأن نقطتي الدخول فارغتا الوظيفة؛ سُجّل التحميل وبدء الـservice worker في المتصفحات الثلاثة. سلوك Firefox مع `background.scripts` فارغ لم يُجرَّب (`EV-06`).
5. **لوحة مؤقتة:** `sidepanel.html` يُنسخ من `src/manifest/sidepanel.placeholder.html` لأن `sidebar_action.default_panel` إلزامي في Firefox (وإلا فشل الفحص). تستبدله `T-1.4` (MJ5)، ومسار الاستبدال في `scripts/build.mjs`.
6. **`npm audit`:** 3 ثغرات بدرجة high كلها من مسار واحد: `web-ext` ← `@devicefarmer/adbkit` ← `node-forge`. أداة تطوير لا تدخل الحزمة، والإصلاح المقترح (`--force`) يخفّض `web-ext`. لم يُطبَّق شيء.

# فحص تحميل الحزم في المتصفحات (`scripts/load-check.mjs`)

- التاريخ: 2026-10-25
- عائلة Chromium: تحميل غير معبَّأ عبر `Extensions.loadUnpacked` في ملف تعريف مؤقت، ثم قراءة `chrome.developerPrivate.getExtensionsInfo` من `chrome://extensions`.
- Firefox: تثبيت مؤقت عبر Marionette (`Addon:Install`) في ملف تعريف مؤقت بلا نافذة، ثم قراءة `AddonManager` و`WebExtensionPolicy` في سياق chrome.

| المتصفح | الإصدار | الحزمة | النتيجة | الحالة | أخطاء المانيفست | أخطاء التشغيل | التحذيرات | الخلفية |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Firefox | 158.0.1 | `dist/firefox` | نجح | ENABLED | لا شيء | لا شيء | لا شيء | الخلفية تعمل |
| Chrome | 156.0.8078.47 | `dist/chromium` | نجح | ENABLED | لا شيء | لا شيء | لا شيء | service worker بدأ |

لم تُفحص: Edge، Brave (لم تُطلب في هذا التشغيل).

# بوابة الموجة A على الشجرة المجمّعة

- الموجة: `A` (المرحلة `MJ1` وحدها) · فرع التكامل: `integration/mj-A` · الشجرة المفحوصة: التزام الدمج `345c6d2` (دمج `mj/1-core-scaffold` في `main` بلا تعارض، وشجرته مطابقة لشجرة الفرع: `git diff mj/1-core-scaffold HEAD` فارغ).
- التاريخ: 2026-10-23
- البوابة بحسب `Docs/MJ/waves.json`: «بناء نظيف للحزمتين و`web-ext lint` وتحميل حزمة Chromium في المتصفحات المتاحة»، والجولة اليدوية: لا شيء. وزِيد عليها لأن Firefox صار مثبتًا (`EV-09`): تحميل حزمة Firefox فيه.
- كل فحص بعد `npm ci` نظيف على الشجرة المجمّعة، وتباعًا (المتصفحات تشترك في الجهاز).

| الفحص | الأمر | النتيجة | الملف |
| :--- | :--- | :--- | :--- |
| تثبيت نظيف وبناء الحزمتين | `npm ci` ثم `npm run build` | نجح؛ `dist/chromium/` و`dist/firefox/` | [`build.txt`](build.txt) |
| فحص مانيفست Firefox | `npx web-ext lint --source-dir dist/firefox` | 0 أخطاء · 0 ملاحظات · 0 تحذيرات | [`web-ext-lint.txt`](web-ext-lint.txt) |
| الأنواع والاختبارات | `npx tsc --noEmit` · `npx vitest run` | بلا أخطاء · 14 من 14 (`TEST-BUILD-01`) | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| تحميل الحزم في المتصفحات | `node scripts/load-check.mjs` | نجح في Chrome 156 وEdge 155 وBrave 156 (حزمة Chromium) وFirefox 158.0.1 (حزمة Firefox): `ENABLED` بلا أخطاء مانيفست ولا تشغيل ولا تحذيرات، والخلفية تعمل | [`load-check.md`](load-check.md) |

**الحكم:** اجتازت البوابة. الدليل التفصيلي للمهمة في [`../T-1.1/report.md`](../T-1.1/report.md).

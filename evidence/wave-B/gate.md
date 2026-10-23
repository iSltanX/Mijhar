# بوابة الموجة B على الشجرة المجمّعة

- الموجة: `B` (`MJ2` ثم `MJ3` ثم `MJ4`) · فرع التكامل: `integration/mj-B` · التزامات الدمج: `abeb8f3` (MJ2) · `bc4aaa6` (MJ3) · `4e97a2c` (MJ4)، كلها `--no-ff` بلا تعارض نصي.
- التاريخ: 2026-10-23
- البوابة بحسب `Docs/MJ/waves.json`: «اختبارات `tests/core` و`tests/modules/c/masking` و`tests/data` مجتمعة بعد الدمج، وبناء نظيف. تقارير الجدوى تُراجع لاكتمال معايير القبول». وزِيد عليها ما يمسّه الدمج: المانيفست (`storage`) فتحميل الحزم في المتصفحات، وبث `TEST-CORE-04` في متصفحات فعلية، ومدقق القاموس.
- كل فحص بعد `npm ci` نظيف على الشجرة المجمّعة، وتباعًا (المتصفحات تشترك في الجهاز).

## لا دمج أسقط غيره

لكل فرع: `git diff --name-only mj-B/base...<الفرع>` ثم `git diff --name-only <الفرع> HEAD -- <ملفاته>`:

- `mj/3-masking-glossary-data`: فارغ.
- `mj/2-detector-lifecycle-storage` و`mj/4-feasibility-spikes`: ملف واحد هو `Docs/MJ/stages/MJ3.md`، وفرقه نسخة المرحلة الأقدم (`planned`) في فرعيهما مقابل نسخة فرع `MJ3` الأحدث، وفق القاعدة «ملف المرحلة بنسخة فرعها». لا تغيير سقط.
- المشترك: `package.json` وملف القفل من `MJ2` وحده (`jsdom` و`@types/jsdom`)، و`data/plan.json` من `MJ4` وحده (`DEC-04`)، و`src/manifest/*` من `MJ2` وحده؛ لا تقاطع.

## الفحوص

| الفحص | الأمر | النتيجة | الملف |
| :--- | :--- | :--- | :--- |
| تثبيت نظيف وبناء الحزمتين | `npm ci` ثم `npm run build` | نجح؛ `dist/chromium/` و`dist/firefox/` | [`build.txt`](build.txt) |
| الأنواع | `npx tsc --noEmit` | بلا أخطاء | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| اختبارات البوابة مجتمعة | `npx vitest run tests/core tests/modules/c/masking tests/data` | 16 ملفًا · 337 اجتازت · 1 متخطى | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| الطقم كاملًا | `npx vitest run` | 17 ملفًا · 351 اجتازت · 1 متخطى | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| مدقق القاموس | `node scripts/glossary/validate.mjs` | اجتاز: 112 مدخلًا · 52 مصطلحًا أساسيًا | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| فحص مانيفست Firefox | `npx web-ext lint --source-dir dist/firefox` | 0 أخطاء · 0 ملاحظات · 0 تحذيرات | [`web-ext-lint.txt`](web-ext-lint.txt) |
| تحميل الحزم في المتصفحات | `node scripts/load-check.mjs` | Chrome 156 وEdge 155 وBrave 156 وFirefox 158.0.1: `ENABLED` بلا أخطاء مانيفست ولا تشغيل ولا تحذيرات | [`load-check.md`](load-check.md) |
| بث التغيّر بين السياقات (`TEST-CORE-04`) | `node tests/core/storage/browser/run.mjs chrome edge brave` | اجتاز في الثلاثة | [`storage-browser.txt`](storage-browser.txt) |

- **المتخطى الوحيد:** `tests/data/glossary/glossary.test.ts` اختبار «إعادة النقل من ghsim-source» يتخطاه الشرط `GHSIM_SOURCE` غير المضبوط في البيئة؛ فلم يُجرَ هنا، وهو تحقق من إعادة إنتاج النقل لا من البيانات المسلَّمة (التي يفحصها المدقق وبقية الاختبارات).
- إعادة تشغيل تجارب المتصفحات تكتب فوق `evidence/T-1.3/browser-*` بقياسات زمن مختلفة؛ استُعيد دليل المرحلة كما سلّمته (`git checkout`) وحُفظ خرج الإعادة في `storage-browser.txt`.
- لم يُجرَ: `TEST-CORE-04` في Firefox (الخطة تحصره في Chrome وEdge وBrave).

## الجولة اليدوية: تغطية `evidence/T-0.*` لمعايير القبول

معايير `MJ4` السبعة عشر (`AC-S1.1` إلى `AC-S4.4`) كلها تظهر في تقارير `T-0.1` (S1.1–S1.4) و`T-0.2` (S2.1–S2.5) و`T-0.3` (S3.1–S3.4) و`T-0.4` (S4.1–S4.4)، وكل منها بنتيجة أو «لا ينطبق» أو «لم يُجرَ» معلَّلًا، وتطابق ما في تقرير التسليم. بنود «لم يُجرَ» المعلنة: حقل تعليق PR التقليدي وتعليق المراجعة وسحب الأصل وواجهة البحث (`AC-S1.2` و`AC-S1.3`)، وقيود النماذج الأخرى (`AC-S2.3`)، وبندا ترخيص النموذج المفتوحان (`AC-S2.5`)؛ و`AC-S3.3` «لا ينطبق» بحسم `DEC-04` (د-4).

**الحكم:** اجتازت البوابة. التفاصيل: [`../T-1.2/report.md`](../T-1.2/report.md) · [`../T-1.3/report.md`](../T-1.3/report.md) · [`../T-4.2/report.md`](../T-4.2/report.md) · [`../T-3.1/report.md`](../T-3.1/report.md) · [`../T-0.1/report.md`](../T-0.1/report.md) إلى [`../T-0.4/report.md`](../T-0.4/report.md).

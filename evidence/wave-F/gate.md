# بوابة الموجة F على الشجرة المجمّعة

- الموجة: `F` (`MJ13` ثم `MJ14` ثم `MJ15`) · فرع التكامل: `integration/mj-F` من `main` عند `25d8170` (`464d632` = `mj-F/base` ثم التزاما تنظيم المراجعة `AD-26`) · التزامات الدمج `--no-ff`: `7893f07` (MJ13) · `4d928a6` (MJ14) · `c71ae19` (MJ15).
- التاريخ: 2026-10-24.
- **المراجعة قبل الدمج** (`AD-26`): أجرتها هذه الجلسة على الفروع الثلاثة قبل أول دمج، والتقرير في [`review.md`](review.md): لا خلل يمنع الدمج، وثماني ملاحظات لا تمنع. وفحوصها التشغيلية جزء من هذه البوابة (`review/`).
- البوابة بحسب `Docs/MJ/waves.json`: «اختبارات الوحدات المدمجة مجتمعة، وفحص ساكن للشيفرة المبنية بحسب `DEC-04`، وتجربة ترجمة حقيقية واحدة على Chrome»؛ والجولة اليدوية: «لا شيء». وزِيد عليها ما يمسّه الدمج: الطقم كاملًا (`registry.ts` و`src/options/` و`sections.ts` و`views.ts` وطبقة API و`content/main.tsx` مشتركة أو مسّت وحدات سابقة)، والبناء والفحص والتحميل، وفحوص كل مرحلة على الحزمة المشحونة، وتكامل الوحدات كلها، وتدقيق شبكة طبقة API بعد إضافة الرمز إليها، وعدم تراجع المضيف (`TEST-CORE-05` و`06`)، وتقاطع التصدير مع الرمز.
- المتصفحات تباعًا (Chrome 156.0.8078.47 · Edge 155.0.4283.60 · Brave 156.0.8078.48 · Firefox 158.0.1)، بسكربت واحد متسلسل ([`gate-run.log`](gate-run.log)). لا `npm ci`: `package.json` وملف القفل والمانيفست لم تتغير في أي فرع (`git diff --stat main HEAD -- package.json package-lock.json src/manifest` فارغ).
- مخرجات إعادة الفحوص كُتبت في `evidence/wave-F/` لا فوق أدلة المراحل (`--out-dir` و`--out`). وحُذفت لقطات PNG من مجلدات إعادة فحوص المراحل (`modules/mj13` و`template` و`tours` و`h-background-api`) لأن نتائجها كاملة في ملفاتها النصية وJSON ولقطاتها الأصلية في أدلة مراحلها؛ وبقيت لقطات التكامل (`modules/integration` و`modules/mj11`) والمضيف (`ui-host/screens`).

## لا دمج أسقط غيره

لكل فرع: `git diff --name-only main...<الفرع>` ثم `git diff --name-only <الفرع> HEAD -- <ملفاته>` (133 ملفًا لـ`MJ13` و32 لـ`MJ14` و54 لـ`MJ15`):

| الفرع | الفرق عن `HEAD` | منسوب إلى |
| :--- | :--- | :--- |
| `MJ13` | `src/core/registry.ts` +2 | `MJ15` (استيراد `CONTEXT_BUILDER_MODULE` وسطره) |
| `MJ14` | `data/plan.json` +6 | `main` (`AD-26`، التزام `124a4bf` قبل التكامل) |
| `MJ15` | `src/core/registry.ts` +2 | `MJ13` (استيراد `TOURS_MODULE` وسطره) |

لا ملف خارج هذه يفترق عن أي فرع.

## التعارضات وحلها

تعارض واحد عند دمج `MJ15`: `src/core/registry.ts` (سطر `TOURS_MODULE` من `MJ13` وسطر `CONTEXT_BUILDER_MODULE` من `MJ15` في الموضع نفسه من `BUILTIN_MODULES`). إضافتان من الجانبين في ملف تنص «الملكية ومناطق التعارض» على ضمه بترتيب الدمج، فضُمّتا بترتيب `MJ13` ثم `MJ15`. وما عداه دُمج آليًا: `src/options/` (`sections.ts` من `MJ13`، و`SettingsTab.tsx` و`main.tsx` من `MJ15`) و`src/sidepanel/views.ts` (`MJ13`) و`src/content/main.tsx` (`MJ14`) و`data/plan.json` (`DEC-03` من `MJ14` و`AD-26` من `main` في موضعين مختلفين). ولم يتعارض ملف مرحلة.

## الفحوص

| الفحص | الأمر | النتيجة | الملف |
| :--- | :--- | :--- | :--- |
| الأنواع | `npx tsc --noEmit` | بلا أخطاء | [`typecheck.txt`](typecheck.txt) |
| الطقم كاملًا (الوحدات المدمجة مجتمعة) | `npx vitest run` | 122 ملفًا · **1983 اجتازت** · 2 متخطيان (المشروطان المعروفان `GHSIM_SOURCE` والتواريخ التسعة) | [`tests-full.txt`](tests-full.txt) |
| بناء الحزمتين | `npm run build` | `dist/chromium` و`dist/firefox`؛ `content.js` ‏1,347,494 بايتًا و`background.js` ‏327,465 (يُقاسان في `T-10.1`) | [`build.txt`](build.txt) |
| فحص مانيفست Firefox | `npx web-ext lint --source-dir dist/firefox` | 0 أخطاء · 0 ملاحظات · 0 تحذيرات | [`web-ext-lint.txt`](web-ext-lint.txt) |
| تحميل الحزم | `node scripts/load-check.mjs` | الأربعة: `ENABLED` بلا أخطاء مانيفست ولا تشغيل ولا تحذيرات، والخلفية بدأت | [`load-check.txt`](load-check.txt) |
| **فحص ساكن للشيفرة المبنية بحسب `DEC-04`** (د-5) وعزل الرمز (`TEST-SEC-01` و`03`) | `node tests/modules/d/token/browser/token-check.mjs chrome edge brave firefox` | الساكن: شيفرة الرمز (مفتاح الجلسة وقاعدة IndexedDB و`Authorization` و`Bearer`) في `background.js` و`options.js` وحدهما. والمتصفحات: Chrome وEdge وBrave ‏27/27 وFirefox ‏24/24 = **106/106** | [`review/token-check.txt`](review/token-check.txt) |
| **تجربة ترجمة حقيقية على Chrome** (`TEST-TR-04`) | `node tests/modules/c/engines/browser/run.mjs chrome edge brave firefox` | Chrome 12/12: `Translator API` جاهز، و17 عنصر README وتعليقان ووصفان وتحديد مترجمة فعلًا إلى العربية، والمجموعة المرجعية 28/28 برموزها من أول محاولة (خط الأساس 0/28)؛ Brave 12/12 مثلها؛ Edge 7/7 وFirefox 7/7 حالة صريحة وبديل النسخ المقنَّع = **38/38** | [`modules/engines.txt`](modules/engines.txt) |
| التصدير والاستيراد عبر الوسيط (`MJ13`، `TEST-STORAGE-01` و`TEST-PRIV-03`) | `node tests/modules/g/browser/mj13-check.mjs <متصفح>` | Chrome وEdge وBrave ‏27/27 وFirefox ‏26/26 = **107/107** | [`modules/mj13-chrome.txt`](modules/mj13-chrome.txt) وأخواتها |
| **تقاطع التصدير مع الرمز** (`TEST-SEC-02`) | `node evidence/wave-F/review/export-token-check.mjs chrome edge brave` | 15/15 في كل متصفح = **45/45**: رمز `github_pat_` محفوظ من واجهة الإعدادات (الجلسة ثم القرص) ثم تنزيلات JSON (بلا ملح وبالملح) وMarkdown حقيقية من 250 ملاحظة و250 رابطًا، وتفريغ `storage.local` كاملًا، وDOM صفحة الإعدادات: لا الرمز ولا نمط `github_pat_` في شيء منها | [`review/export-token-check.txt`](review/export-token-check.txt) |
| منشئ حزمة السياق (`MJ15`، `TEST-CTX-01` و`02`) | `node tests/modules/e/browser/builder-check.mjs chrome edge brave firefox` | 14/14 ×3 و13/13 = **55/55** (أُعيد بعد نقل الشريط في `211c27c`) | [`modules/builder.txt`](modules/builder.txt) |
| الجولات (`MJ13`، `TEST-TOUR-01`) | `node tests/modules/b/tours/browser/run.mjs chrome firefox` | 220/220 في كلٍّ = **440/440**: صفر أحداث اصطناعية على عناصر GitHub | [`modules/tours.txt`](modules/tours.txt) |
| حارس القالب وبنك العبارات و«ترجمة مسودتي» (`MJ13`، `TEST-WRITE-02` و`03` و`05`) | `node tests/modules/f/template/browser/run.mjs chrome firefox` | 45/45 في كلٍّ = **90/90** | [`modules/template.txt`](modules/template.txt) |
| تكامل الحزمة المشحونة بكل وحداتها (`MJ8`) | `node tests/modules/browser/integration.mjs chrome edge brave firefox` | 26/26 ×3 و25/25 = **103/103**، وأخطاء الكونسول 0، على `BUILTIN_MODULES` بعد إضافة الجولات ومنشئ الحزمة | [`modules/integration.txt`](modules/integration.txt) |
| **تكامل `MJ11` وتدقيق شبكة API** بعد إضافة الرمز إلى الطبقة | `node tests/modules/d/browser/mj11-integration.mjs chrome edge brave firefox` | 18/18 في كلٍّ = **72/72**: صفر طلبات قبل المنح وقبل النقر، وكلها من الخلفية بلا `Authorization` (لا رمز محفوظ) | [`modules/mj11-integration.txt`](modules/mj11-integration.txt) |
| الوحدة (ح) عبر الخلفية (`AD-24`) | `node tests/modules/h/browser/background-api-check.mjs chrome` | **14/14**: كل الطلبات من service worker بلا `Authorization`، ولا مضيف غير `github.com` و`api.github.com` | [`modules/h-background-api.txt`](modules/h-background-api.txt) |
| **عدم تراجع المضيف** (`TEST-CORE-05` و`06`) | `node tests/core/ui-host/browser/run.mjs chrome edge brave firefox --out evidence/wave-F/ui-host` | الأربعة **اجتاز** في كل الأعمدة؛ 0 اختلاف داخل الواجهة بين الصفحة الضابطة والمعادية؛ المفاتيح الثمانية؛ **0 طلب إلى `api.github.com` قبل المنح** في الأربعة. وسطر التاريخ في رأس التقرير (2026-10-23) ثابت في قالب السكربت؛ التشغيل في 2026-10-24 (`gate-run.log`) | [`ui-host/browser-report.md`](ui-host/browser-report.md) |

## لم يُجرَ

- `TEST-PR-05` الحي على مستودع المالك الخاص برمز حقيقي (لا تُدخل الجلسات أسرارًا حقيقية): يبقى الاختبار «مخطَّطًا» وينتظر المالك.
- قراءة الحافظة الحقيقية في Firefox لبديل النسخ (محجوبة من الصفحة؛ قيست في المرحلة في Edge).
- تقاطع التصدير مع الرمز في Firefox: لا قرص فيه، وشيفرة التصدير واحدة؛ والعزل في Firefox مقيس في `token-check` (24/24).
- تدقيق شبكة مسار الترجمة من جهة عملية المتصفح (تنزيل حزمة اللغة والترجمة نفسها): مكانه `T-4.5` في `MJ16` وبوابة الموجة G.
- الجولات وحارس القالب أُعيدا في Chrome وFirefox فقط (أُجريا في الأربعة في المرحلة، ولا يمسهما الدمج إلا بسطر السجل).
- صفحات github.com الحية، ومنح الصلاحية بنقرة فعلية في عائلة Chromium، والضغطة الفعلية للاختصارات.

# بوابة الموجة C على الشجرة المجمّعة

- الموجة: `C` (`MJ5` ثم `MJ6`) · فرع التكامل: `integration/mj-C` · التزاما الدمج: `339c5c5` (MJ5) · `8f348a1` (MJ6)، كلاهما `--no-ff` بلا تعارض نصي.
- التاريخ: 2026-10-23
- البوابة بحسب `Docs/MJ/waves.json`: «اختبارات core وmodules/a مجتمعة، وعزل الأنماط على الصفحات المعادية بعد الدمج، وتدقيق شبكة لغياب أي طلب قبل الصلاحية»؛ والجولة اليدوية: «فتح اللوحة الجانبية والدرج في Chrome وEdge وBrave بعد الدمج». وزِيد عليها ما يمسّه الدمج: الطقم كاملًا (`vite.config.ts` و`tsconfig.json` و`registry.ts` مشتركة)، والبناء والفحص والتحميل (المانيفست تغيّر)، وقياس الوحدة (أ) في المتصفحات، و**فحص تكامل جديد** للحزمة المشحونة (أدناه).
- كل فحص بعد `npm ci` نظيف على الشجرة المجمّعة، والمتصفحات تباعًا.

## لا دمج أسقط غيره

لكل فرع: `git diff --name-only mj-C/base...<الفرع>` ثم `git diff --name-only <الفرع> HEAD -- <ملفاته>`: فارغ للفرعين (110 ملفات لـ`MJ5` و65 لـ`MJ6`، منها التزاما `main` بعد الوسم `17a794c` و`0c075ad` في الفرعين كليهما). ولا ملف مشترك بين فرقي المرحلتين عن `main`: `MJ5` وحدها مسّت `package.json` والقفل و`src/core/index.ts` والمانيفست و`vite.config.ts` و`tsconfig.json` و`scripts/build.mjs`، و`MJ6` وحدها `src/core/registry.ts` (سطر `MODULE_A` في `BUILTIN_MODULES`).

**نقطة الالتقاء** التي نبّه إليها تقريرا التسليم: معرّف وحدة `MJ6` هو `a` (`MODULE_A_ID`)، فيحكمها مفتاح `modules.a.enabled` من `MJ5` (`isModuleEnabled` و`unitOf`). ومفاتيح `defineModuleASettings` (`modules.a.direction` و`modules.a.direction.options`) لا تتقاطع مع مفاتيح `defineCoreSettings` (`modules.<a..h>.enabled` و`ui.surface`).

## الفحوص

| الفحص | الأمر | النتيجة | الملف |
| :--- | :--- | :--- | :--- |
| تثبيت نظيف | `npm ci` | 402 حزمة؛ تحذيرات `npm audit` الثلاثة قديمة: `node-forge` عبر `web-ext` (أداة تطوير لا تُشحن)، لا من `preact` | — |
| الأنواع | `npx tsc --noEmit` | بلا أخطاء | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| اختبارات البوابة مجتمعة | `npx vitest run tests/core tests/modules/a` | 24 ملفًا · 416 اجتازت | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| الطقم كاملًا | `npx vitest run` | 30 ملفًا · 551 اجتازت · 1 متخطى (`GHSIM_SOURCE` كما في B) = 351 من B + 54 من `MJ5` + 146 من `MJ6` | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| مدقق القاموس | `node scripts/glossary/validate.mjs` | اجتاز | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| بناء الحزمتين | `npm run build` | `dist/chromium` و`dist/firefox`؛ و`content.js` يحمل الوحدة (أ) الحقيقية | [`build.txt`](build.txt) |
| فحص مانيفست Firefox | `npx web-ext lint --source-dir dist/firefox` | 0 أخطاء · 0 ملاحظات · 0 تحذيرات | [`web-ext-lint.txt`](web-ext-lint.txt) |
| تحميل الحزم | `node scripts/load-check.mjs` | Chrome 156 وEdge 155 وBrave 156 وFirefox 158.0.1: `ENABLED` بلا أخطاء ولا تحذيرات، والخلفية بدأت | [`load-check.md`](load-check.md) |
| **عزل الأنماط وتدقيق الشبكة** (`TEST-CORE-05` و`TEST-CORE-06`) | `node tests/core/ui-host/browser/run.mjs --out evidence/wave-C/ui-host` | الأربعة: 0 اختلاف في 13 عنصرًا × 37 خاصية بين صفحة الضبط والمعادية (CSP `style-src 'self'`)، و0 تغيّر في أنماط الصفحة، والدرج في الطبقة العليا؛ و**0 طلب إلى `api.github.com` قبل المنح** من كل السياقات، ولا مضيف آخر؛ والمفاتيح الثمانية؛ واللوحة الأصلية بنقر. مطابق لدليل المرحلة عدا أرقام النوافذ | [`ui-host/browser-report.md`](ui-host/browser-report.md) |
| قياس الوحدة (أ) | `node tests/modules/a/direction/browser/run.mjs` | الأربعة: العينة 51/51، وفعّال 205/205، وPB-01 بلا بقايا ومستند مطابق؛ PB-02 البارد 1.56 / 1.59 / 1.56 / 4.65 ms (Chrome / Edge / Brave / Firefox) | [`direction-bench.txt`](direction-bench.txt) |
| **تكامل الحزمة المشحونة** | `node evidence/wave-C/integration-check.mjs` | الأربعة: انظر القسم التالي | [`integration.json`](integration.json) · [`integration-run.txt`](integration-run.txt) |

- إعادة التجارب كُتبت في `evidence/wave-C/` لا فوق أدلة المرحلتين (`--out`، وقياس `MJ6` بلا `--out-dir`).
- لم يُجرَ: `TEST-CORE-04` من جديد (لا تغيير في `src/core/storage` ولا `src/core/settings`)؛ وصفحات github.com الحية.

## فحص التكامل: ما لم يختبره أي فرع وحده

بعد الدمج صار سكربت المحتوى الحقيقي (`src/content/main.tsx` من `MJ5`) يركّب `BUILTIN_MODULES`، وفيها الوحدة (أ) الحقيقية من `MJ6`. تجارب `MJ5` تستعمل ثماني وحدات وهمية، وقياس `MJ6` يحقن الوحدة في الصفحة بلا إضافة؛ فلا أحد منهما شغّل الوحدة الحقيقية داخل الإضافة المشحونة. [`integration-check.mjs`](integration-check.mjs) يحمّل `dist/chromium` و`dist/firefox` نفسيهما ويخدم العينات محليًا (لا شبكة خارجية):

| المتصفح | التركيب: `rtl` محسوب / المتوقع، وأخطاء | الدرج فوق الوحدة: مفتوح / مُسّ مضيفه | إيقاف «(أ)» من الإعدادات: سمات / ورقة / `<main>` يطابق العينة الخام | إعادة التشغيل | العينة بـCSP `style-src 'self'` | `api.github.com` / مضيفات أخرى | أخطاء الإضافة |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Chrome 156 | 26/26 · 0 | نعم / لا | 0 / لا / نعم | 26/26 | 26/26 | 0 / 0 | لا شيء |
| Edge 155 | 26/26 · 0 | نعم / لا | 0 / لا / نعم | 26/26 | 26/26 | 0 / 0 | لا شيء |
| Brave 156 | 26/26 · 0 | نعم / لا | 0 / لا / نعم | 26/26 | 26/26 | 0 / 0 | لا شيء |
| Firefox 158.0.1 | 26/26 · 0 | نعم / لا | 0 / لا / نعم | 26/26 | 26/26 | 0 / 0 (رفض الوكيل 3 مضيفات لخدمات Firefox نفسه) | لا شيء |

- 51 حالة `data-expect` في العينة: 26 `rtl` قُلبت ومحسوبها `rtl`، و25 `keep` لم تُلمس، بافتراضيات الإعدادات (لا ربط لـ`defineModuleASettings` في سكربت المحتوى بعد؛ مسجَّل خارج نطاق `MJ6`).
- **إيقاف الوحدة من مفتاح `MJ5` يستعيد الصفحة حرفيًا:** لا `data-mijhar-dir` ولا `data-mijhar-orig-dir` ولا `#mijhar-reading-styles`، و`<main>` الحي يطابق تحليل العينة الخام بـ`DOMParser` حرفًا بحرف.
- ورقة الوحدة (`<style>` في المستند) لم تمنعها CSP `style-src 'self'` في أي من الأربعة: المحسوب `rtl` 26/26.
- الخطأ الوحيد في وحدة التحكم في عائلة Chromium هو منع CSP لـ`<style>` العينة المعادية نفسها (بصمته `sha256-l+yJjV84…` تطابق محتواها)، وهو مقصود في العينة.
- **أثر أداة لا منتج:** في التشغيل الأول ظهر `style=""` على مربع المهمة بعد الإيقاف؛ عُزل السبب فإذا هو لقطة Playwright نفسها (يظهر بلا إضافة أصلًا)، فنُقلت اللقطة إلى ما بعد المقارنة. وفي اللقطات الطويلة بلا نافذة لا يُرسم نص README تحت شجرة الملفات، بالإضافة وبدونها؛ والحكم من مجسّات DOM لا من الصورة.

## الجولة اليدوية: اللوحة الجانبية والدرج بنوافذ مرئية

[`manual-round.mjs`](manual-round.mjs) يشغّل Chrome وEdge وBrave **بنوافذ مرئية** (`headless: false`) على الإضافة الاختبارية لـ`T-1.4` (فتح اللوحة الأصلية يشترط فعل مستخدم في صفحة إضافة)، فيفتح الدرج بالرسالة في صفحة GitHub مرئية، واللوحة الأصلية بنقر فعلي على `#open-native`، ويقيس وثيقة اللوحة كما تعرضها النافذة (`chrome.extension.getViews`) ويلتقطها عبر CDP.

| المتصفح | الدرج: مفتوح / مستطيله / الأعلى في مركزه / أُغلق | اللوحة الأصلية: الفتح / أبعاد نافذتها / الظهور / التبويبات | اللقطات |
| :--- | :--- | :--- | :--- |
| Chrome 156 | نعم / 400×631 / نعم / نعم | نجح / 360×639 / `visible` / 5 | [`drawer`](manual-screens/chrome-drawer.png) · [`sidepanel`](manual-screens/chrome-sidepanel.png) |
| Edge 155 | نعم / 400×643 / نعم / نعم | نجح / 382×645 / `visible` / 5 | [`drawer`](manual-screens/edge-drawer.png) · [`sidepanel`](manual-screens/edge-sidepanel.png) |
| Brave 156 | نعم / 400×637 / نعم / نعم | نجح / 417×693 / `visible` / 5 | [`drawer`](manual-screens/brave-drawer.png) · [`sidepanel`](manual-screens/brave-sidepanel.png) |

- يسدّ هذا ما سجّله `MJ5` «لم يُجرَ (وضع بلا نافذة)»: اللوحة الأصلية معروضة فعلًا في نافذة المتصفح الثلاثة.
- **ملاحظة واجهة (لا تمنع الدمج):** بعرض اللوحة الافتراضي في Chrome (360px) يفيض شريط التبويبات الخمسة: يظهر شريط تمرير أفقي ويُقصّ «الإعدادات» ([اللقطة](manual-screens/chrome-sidepanel.png)). التبويب يُبلغ بالتمرير، لكنه يستحق معالجة في مرحلة تمسّ اللوحة.
- **لم يُجرَ آليًا وينتظر يد المالك** (كما في تقرير `MJ5`): ضغطة `⌥G` الفعلية في Chrome وEdge وBrave، وقبول نافذة صلاحية `api.github.com` ثم «اسحب». لا تبلغهما CDP، وأداة التحكم بالشاشة لا تكتب في المتصفحات. والمعالج نفسه ومسار الصلاحية مقيسان آليًا (وفي Firefox بالضغطة والمنح والسحب الفعليين).

**الحكم:** اجتازت البوابة. التفاصيل: [`../T-1.4/report.md`](../T-1.4/report.md) · [`../T-2.1/report.md`](../T-2.1/report.md) · [`../T-2.7/report.md`](../T-2.7/report.md).

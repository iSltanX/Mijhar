# بوابة الموجة D على الشجرة المجمّعة

- الموجة: `D` (`MJ7` ثم `MJ8` ثم `MJ9`) · فرع التكامل: `integration/mj-D` · التزامات الدمج `--no-ff`: `9d543ee` (MJ7) · `da99279` (MJ8) · `6e2c912` (MJ9)، والتزاما إصلاح التكامل `5b2bb87` و`8a50f3c` (أدناه).
- التاريخ: 2026-10-23
- البوابة بحسب `Docs/MJ/waves.json`: «اختبارات الوحدات المدمجة مجتمعة، وفحص عدم تراجع المضيف (`TEST-CORE-05`) مرة واحدة بعد الدمج»؛ والجولة اليدوية: «جولة سريعة على صفحة README وصفحة PR عامة في Chrome». وزِيد عليها ما يمسّه الدمج: الطقم كاملًا (`registry.ts` و`sections.ts` و`views.ts` مشتركة)، والبناء والفحص والتحميل، وقياس كل مرحلة في المتصفحات على الشجرة المجمّعة (تفاصيل في `modules/`)، وفحص تكامل الحزمة المشحونة بالوحدات الخمس معًا.
- المتصفحات تباعًا؛ لا `npm ci` لأن `package.json` وملف القفل لم يتغيرا في أي فرع (`git diff main integration/mj-D -- package.json package-lock.json` فارغ).

## لا دمج أسقط غيره

لكل فرع: `git diff --name-only mj-D/base...<الفرع>` ثم `git diff --stat <الفرع> HEAD -- <ملفاته>` (79 ملفًا لـ`MJ7` و119 لـ`MJ8` و142 لـ`MJ9`): كل الفرق **إضافات سطرية فقط** في الملفات المشتركة الثلاثة، وتُنسب كلها إلى مرحلة أخرى دُمجت:

| الفرع | الفرق عن `HEAD` | منسوب إلى |
| :--- | :--- | :--- |
| `MJ7` | `src/options/sections.ts` +8 | أربعة أسطر من `MJ8` (استيرادان وسطران) وأربعة من `MJ9` (كذلك) |
| `MJ8` | `registry.ts` +4 · `sections.ts` +6 · `views.ts` +5 | `MJ9` (`MODULE_G` و`MODULE_H`، وقسمان، وواجهات اللوحة) · `MJ7` (`MODULE_A_SECTION`) |
| `MJ9` | `registry.ts` +6 · `sections.ts` +6 · `views.ts` +2 | `MJ8` (ثلاث وحدات، وقسمان، وواجهة وضع الشرح) · `MJ7` (`MODULE_A_SECTION`) |

لا ملف خارج هذه الثلاثة يفترق عن أي فرع.

## التعارضات وحلها بالمواصفة

كلها في الملفات المشتركة التي تنص «الملكية ومناطق التعارض» على أنها تُضم بترتيب الدمج، وكلها **إضافات من الجانبين** فضُمّت بترتيب `MJ7` ثم `MJ8` ثم `MJ9` بلا اختيار نسخة:

- دمج `MJ8`: `src/options/sections.ts` (استيراد `MODULE_A_SECTION` من `MJ7` مع `CARD_SECTION` و`PR_STATUS_SECTION`، وأسطر `SETTINGS_SECTIONS`).
- دمج `MJ9`: `src/core/registry.ts` (استيرادات `MODULE_G` و`MODULE_H` وسطرا `BUILTIN_MODULES`) · `src/options/sections.ts` (`NOTES_SETTINGS_SECTION` و`COMMUNITY_SETTINGS_SECTION`) · `src/sidepanel/views.ts` (`NOTES_PANEL_VIEW` و`NOTES_DRAWER_VIEW` و`COMMUNITY_PANEL_VIEWS`).
- ملفات المراحل (`MJ7.md` و`MJ8.md` و`MJ9.md`) لم تتعارض: لكلٍّ نسخة فرعها.
- `package.json` وملف القفل والمانيفست و`tsconfig.json` لم تتعارض (المانيفست من `MJ7` وحدها، و`tsconfig.json` من `MJ8` وحدها).

## إصلاحا تكامل (اختباران كتبتهما مرحلتان على افتراض أن السجل المشترك لا يحوي غير وحداتهما)

الأول بعد الطقم الكامل على الشجرة المجمّعة (فشل اختباران، وجُرِّد الباقي)، والثاني بعد فحص تكامل الحزمة المشحونة (فشل بند واحد في كل متصفح):

| الالتزام | الاختبار | الفشل | الإصلاح |
| :--- | :--- | :--- | :--- |
| `5b2bb87` | `tests/modules/b/card/panel-and-settings.test.tsx` (`MJ8`) | يتوقع أن `SETTINGS_SECTIONS` فيها قسما (ب) و(د) وحدهما، وفيها الآن (أ) و(ز) و(ح) | يقيس أقسام الوحدتين (ب) و(د) بترشيح `unit` |
| `5b2bb87` | `tests/modules/h/panel.test.tsx` (`MJ9`) | يتوقع أن كل `PANEL_VIEWS` من الوحدتين (ز) و(ح)، وفيها الآن واجهة (ب) | يقيس واجهات (ز) و(ح) وحدها |
| `8a50f3c` | `tests/modules/browser/integration.mjs` (`MJ8`)، بند «مفتاح بطاقة الشرح مطفأ… وDOM الصفحة كما أُرسل» | يقارن `<main>` بالأصل، وفيه الآن مضيف بطاقة الصفحة للوحدة (ز) (`<mijhar-host data-mijhar-host="g">`) | يستثني مضيفي (ز) و(ح) كما كان يستثني ورقة (أ) (`#mijhar-reading-styles`) من `MJ6`؛ وأُبقي الاستثناء ضيّقًا بالبادئة |

التشغيل الأول الفاشل محفوظ: [`modules/integration-first-run-failed.txt`](modules/integration-first-run-failed.txt) (99/103). والإعادة بعد الإصلاح: 103/103. **ليس تراجعًا في وحدة**: المضيف الظاهر في الفرق لوحدة (ز) نفسها وهو مقصود (بطاقة «ملاحظاتي على هذه الصفحة»)، وبند «مطفأ» يثبت أن مفتاح (ب) يزيل مضيفه ولا يترك أثرًا.

## الفحوص

| الفحص | الأمر | النتيجة | الملف |
| :--- | :--- | :--- | :--- |
| الأنواع | `npx tsc --noEmit` | بلا أخطاء | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| اختبارات البوابة مجتمعة | `npx vitest run tests/core tests/modules tests/data` | 64 ملفًا · 1159 اجتازت · 1 متخطى | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| الطقم كاملًا | `npx vitest run` | 66 ملفًا · 1204 اجتازت · 1 متخطى (`GHSIM_SOURCE` كما في B وC) = 551 من C + 106 من `MJ7` + 140 من `MJ8` + 407 من `MJ9` | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| مدقق القاموس | `node scripts/glossary/validate.mjs` | اجتاز | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| بناء الحزمتين | `npm run build` | `dist/chromium` و`dist/firefox` | [`build.txt`](build.txt) |
| فحص مانيفست Firefox | `npx web-ext lint --source-dir dist/firefox` | 0 أخطاء · 0 ملاحظات · 0 تحذيرات | [`web-ext-lint.txt`](web-ext-lint.txt) |
| تحميل الحزم | `node scripts/load-check.mjs` | Chrome 156 وEdge 155 وBrave 156 وFirefox 158.0.1: `ENABLED` بلا أخطاء ولا تحذيرات، والخلفية بدأت | [`load-check.txt`](load-check.txt) |
| **عدم تراجع المضيف** (`TEST-CORE-05` و`TEST-CORE-06`) | `node tests/core/ui-host/browser/run.mjs chrome edge brave firefox --out evidence/wave-D/ui-host` | الأربعة: 0 اختلاف في 13 عنصرًا × 37 خاصية بين صفحة الضبط والمعادية (CSP `style-src 'self'`)، و0 تغيّر في أنماط الصفحة، والدرج في الطبقة العليا، والمفاتيح الثمانية، واللوحة الأصلية بنقر؛ **0 طلب إلى `api.github.com` قبل المنح** من كل السياقات | [`ui-host/browser-report.md`](ui-host/browser-report.md) |
| بطاقة الشرح (`MJ8`) | `node tests/modules/b/card/browser/run.mjs chrome edge brave firefox --out-dir evidence/wave-D/modules/card-out` | 45/45 في كل متصفح (180/180) | [`modules/card.txt`](modules/card.txt) |
| حالة الـPR والمقارنة (`MJ8`) | `node tests/modules/d/browser/run.mjs … --out-dir evidence/wave-D/modules/d-out` | 86/86 في كل متصفح (344/344) | [`modules/d-status.txt`](modules/d-status.txt) |
| الاتجاه (`MJ6`، على الشجرة المجمّعة) | `node tests/modules/a/direction/browser/run.mjs … --out-dir evidence/wave-D/modules/direction-out` | العينة 51/51 وفعّال 205/205 في الأربعة؛ `PB-01` بلا بقايا ومطابق؛ `PB-02` البارد 1.23 / 1.30 / 1.23 / 4.20 ms (Chrome / Edge / Brave / Firefox) | [`modules/direction.txt`](modules/direction.txt) |
| الوحدة (أ) (`MJ7`) | `node tests/modules/a/browser/bundle-run.mjs … --out evidence/wave-D/modules/a-bundle-run.json` | الأربعة: عزل 9/9 وقائمة 7/7 والنص كما هو، نسخ مطابق، أرقام 15/15، هجري 4/4 لكل تعديل، محرر 0 إخفاق؛ التراجع سليم في Chrome وEdge وBrave، وفي Firefox `false` وهو المقيَّد المعلن (`AC-A4`، قبِله المالك) | [`modules/a-bundle.txt`](modules/a-bundle.txt) · [`modules/a-bundle-run.json`](modules/a-bundle-run.json) |
| الملاحظات والمجتمع (`MJ9`) | `node evidence/MJ9/integration-check.mjs` | Chrome وEdge وBrave 48/48 وFirefox 50/50 (منح فعلي للصلاحية الاختيارية، 16 `GET` كلها من الفحوص الثلاثة الصريحة)؛ `api.github.com` 0 في عائلة Chromium؛ 0 مضيف آخر؛ 0 خطأ إضافة | [`modules/mj9-integration.txt`](modules/mj9-integration.txt) · [`modules/mj9-integration.json`](modules/mj9-integration.json) |
| **تكامل الحزمة المشحونة بكل وحداتها** | `node tests/modules/browser/integration.mjs … --out-dir evidence/wave-D/modules/integration-out` | 26/26 في Chrome وEdge وBrave و25/25 في Firefox (103/103)، وأخطاء الكونسول 0: Alt+H الفعلي ورسالة الزر ومفتاح الإعدادات وPR حقيقية على `BUILTIN_MODULES` كلها (أ وب وج د ز ح) | [`modules/integration.txt`](modules/integration.txt) |

- إعادة التجارب كُتبت في `evidence/wave-D/` لا فوق أدلة المراحل: `ui-host` و`card` و`d` و`direction` و`integration` بـ`--out`/`--out-dir`، وفحص `MJ9` يكتب في مجلده فنُقلت نتائجه إلى `modules/mj9-integration*` واستُعيدت نسخة `evidence/MJ9/` الملتزمة (`git checkout`).
- حجم الحزمة المشحونة (`dist/chromium`): `content.js` 782 KB (509 KB من `MJ8` وحدها قبل (ز) و(ح)) · `background.js` 195 KB · `options.js` 207 KB · `sidepanel.js` 394 KB · `reader.js` 215 KB. **نمو الخلفية** (من نحو 40 KB في C): `SETTINGS_SECTIONS` تحمل مكوّنات الأقسام (Preact) وتستوردها الخلفية لتعريف الإعدادات، كما نبّه `MJ7` و`MJ9`؛ فصل تعريفات الأقسام عن مكوّناتها مسجَّل خارج نطاق المراحل، ويُقاس بميزانيات `T-10.1`.
- لم يُجرَ: `TEST-CORE-04` من جديد (لا تغيير في `src/core/storage` ولا `src/core/settings`)؛ صفحات github.com الحية؛ `fonts-github.mjs` (يزور github.com الحقيقي، وقد أُجري في `MJ7`)؛ و`editor-undo.mjs` (قياس Firefox المنتهي في `MJ7`).

## الجولة اليدوية: صفحة README وصفحة PR عامة في Chrome

[`manual-round.mjs`](manual-round.mjs) يشغّل Chrome 156.0.8078.47 **بنافذة مرئية** (`headless: false`) ويحمّل `dist/chromium` المشحونة نفسها بعد الدمج، ويفتح صفحتين عامتين حقيقيتين محفوظتين من `fixtures/spikes` بأصل `github.com` (تُخدَمان محليًا عبر Playwright route؛ كل مضيف آخر مرفوض، فلا أنماط GitHub في اللقطات ولا شبكة خارجية): README «`Barqawiz/Shakkala`» وطلب الدمج «`Watad-Project/Watad#80`».

| الصفحة | المضيفات المركّبة | ما قيس | اللقطة |
| :--- | :--- | :--- | :--- |
| README | `g` (ملاحظاتي على هذه الصفحة) · `a.reading` (وضع القراءة) · `h` | الاتجاه: 6 كتل قُلبت `rtl` وصفر محفوظة؛ بطاقة (ح): «لم يُعثر على ملف README عربي ضمن نطاق الفحص الحالي» مع تنبيه نقص القائمة، وهو الصحيح لمستودع READMEه إنجليزي بأمثلة عربية | [`chrome-readme.png`](manual-screens/chrome-readme.png) |
| PR | `g` · `d.pr-status` · `a.reading` | ملخص حالة طلب الدمج: «مفتوح»، الفرع المصدر ← الهدف `feature/contractor-work-tabs` ← `main`، «التأخر عن الهدف: غير متاح»، الالتزامات 8، الملفات 56، `+5,381 / −1`، المراجعات «طُلبت تغييرات» | [`chrome-pr.png`](manual-screens/chrome-pr.png) |
| PR + **Alt+H فعلي** | يُضاف `b.card` ويُزال بالضغطة الثانية | شريط «وضع الشرح مفعَّل · 1 عنصرًا مشروحًا» وزر «إيقاف»؛ الإيقاف يعيد المضيفات كما كانت | [`chrome-pr-explain.png`](manual-screens/chrome-pr-explain.png) |

- طلبات الشبكة: `api.github.com` **0**؛ المضيفات الأخرى المحجوبة عمدًا: `github.githubassets.com` و`camo.githubusercontent.com` و`avatars.githubusercontent.com`. أخطاء الكونسول 110 كلها من هذه الأصول المحجوبة (79 + 1 + 23) ومن مسارات `github.com` غير المحفوظة (7: 404)، و**0 من الإضافة** (مصنَّفة بمصدرها في [`manual-round.json`](manual-round.json)).
- ما لا تثبته هذه الجولة: المظهر على صفحة GitHub حية بأنماطها (الأنماط محجوبة)، وتعارض `Alt+H` مع المتصفح بيد المالك (`DEC-08`).

## ما بقي لدى المالك أو لمراحل لاحقة (لا يمنع الإغلاق)

- **المراجعات المستقلة (ثلاث):** `MJ7` (يمس صلاحيات `web_accessible_resources` وخصوصية نقل محتوى الصفحة إلى `reader.html`)، و`MJ8` (طلب شبكة بنفس الأصل بملفات تعريف الارتباط وواجهة محقونة)، و`MJ9` (تخزين وصلاحيات وشبكة وضوابط هوية). برومبتاتها جاهزة في تقارير تسليمها.
- **`MJ7`:** إقرار افتراضيات الميزات (العزل والخطوط والتلميح وزر المحرر ووضع القراءة مفعّلة، والأرقام المشرقية معطّلة)؛ والفحص اليدوي على محرر GitHub الحي. وزر الاتجاه مخفي في Firefox بقبول المالك (`AC-A4`).
- **`MJ8`:** قرار بيانات: توسيع `pages` في توقيعات تبويبات المستودع لتُشرح بطاقة الشرح في صفحات المشكلة والطلب؛ وقيمة اختصار `Alt+H` النهائية (`DEC-08`) والجولة اليدوية بنافذة مرئية لزر وضع الشرح في اللوحة الأصلية.
- **`MJ9`:** قرار الدرج (اختبار `MJ5` يمنع أي حقل نص فيه، فاقتُصرت الإدخالات على اللوحة الأصلية)؛ ومراجعة قائمة الموارد الأولى؛ والمراجعة البشرية لـ`AC-H6`؛ و`AC-10.1`: تحويل `raw` إلى `raw.githubusercontent.com` يُظهر ذلك المضيف في سجل الشبكة (يُدرج في المضيفات المعلنة أو تُستبدل القراءة، لـ`T-10.1`).
- **`DEC-02`** حُسم بأ-2 من منفّذ `MJ7` بتفويض `AD-14` وسُجّل في `data/plan.json`؛ فبقي المعلّق `DEC-03` و`DEC-05` و`DEC-07`.
- **لم يُجرَ في الموجة كلها:** صفحات github.com الحية، وضغطة `Alt+H` وقبول نافذة الصلاحية في نافذة المالك، والسحب الأصلي.

**الحكم:** اجتازت البوابة بعد إصلاحي تكامل في اختبارين وفحص تكامل كتبتها المراحل على افتراض انفرادها بالسجل. التفاصيل: [`../T-2.2/report.md`](../T-2.2/report.md) · [`../T-2.3/report.md`](../T-2.3/report.md) · [`../T-2.4/report.md`](../T-2.4/report.md) · [`../T-2.5/report.md`](../T-2.5/report.md) · [`../T-2.6/report.md`](../T-2.6/report.md) · [`../T-3.2/report.md`](../T-3.2/report.md) · [`../T-5.1/report.md`](../T-5.1/report.md) · [`../T-5.4/report.md`](../T-5.4/report.md) · [`../MJ9/report.md`](../MJ9/report.md).

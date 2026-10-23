# بوابة الموجة E على الشجرة المجمّعة

- الموجة: `E` (`MJ10` ثم `MJ11` ثم `MJ12`) · فرع التكامل: `integration/mj-E` · التزامات الدمج `--no-ff`: `3d33352` (MJ10) · `a329064` (MJ11) · `bf04659` (MJ12)، والتزام إصلاح التكامل `abd6f8d` (أدناه).
- التاريخ: 2026-10-23
- البوابة بحسب `Docs/MJ/waves.json`: «اختبارات الوحدات المدمجة مجتمعة، وتدقيق شبكة لطبقة API العامة»؛ والجولة اليدوية: «لا شيء». وزِيد عليها ما يمسّه الدمج: الطقم كاملًا (`registry.ts` و`sections.ts` و`views.ts` و`background/main.ts` مشتركة)، والبناء والفحص والتحميل، وعدم تراجع المضيف (`TEST-CORE-05` و`06`)، وقياس كل مرحلة في المتصفحات على الشجرة المجمّعة، وإعادة فحصي تكامل الموجتين السابقتين (`MJ8` و`MJ9`) وفحص تكامل الحزمة المشحونة بكل وحداتها.
- المتصفحات تباعًا (Chrome 156.0.8078.47 · Edge 155.0.4283.60 · Brave 156.0.8078.48 · Firefox 158.0.1)؛ لا `npm ci` لأن `package.json` وملف القفل لم يتغيرا في أي فرع (`git diff --name-only mj-E/base...<الفرع> -- package.json package-lock.json` فارغ للثلاثة).
- إعادة التجارب كُتبت في `evidence/wave-E/` لا فوق أدلة المراحل (`--out` و`--out-dir`)؛ وفحص `MJ9` يكتب في مجلده فنُقلت نتيجته إلى `modules/mj9-integration.json` واستُعيدت نسخة `evidence/MJ9/` الملتزمة (`git checkout`). حُذفت لقطات PNG من مجلدات إعادة فحوص المراحل (`card-out` و`d-out` و`access-out` و`search-out` و`ui-out` و`composer-out`) لأن نتائجها الكاملة في ملفاتها النصية وJSON، ولقطاتها الأصلية في أدلة مراحلها؛ وبقيت لقطات التكامل على الشجرة المجمّعة.

## لا دمج أسقط غيره

لكل فرع: `git diff --name-only mj-E/base...<الفرع>` ثم `git diff --stat <الفرع> HEAD -- <ملفاته>` (152 ملفًا لـ`MJ10` و82 لـ`MJ11` و86 لـ`MJ12`) على الرأس بعد الإصلاح. كل الفرق **إضافات سطرية** إلا حلّين مكتوبين، وتُنسب كلها:

| الفرع | الفرق عن `HEAD` | منسوب إلى |
| :--- | :--- | :--- |
| `MJ10` | `background/main.ts` +22/−1 · `registry.ts` +4 · `sections.ts` +2 · `views.ts` +4 · `tests/modules/h/panel.test.tsx` +3/−2 · `tests/modules/b/card/panel-and-settings.test.tsx` +15 | `MJ11` (طبقة API في الخلفية: ثلاثة استيرادات وخيار `fetch` ومعالج الرسائل بـ`sendResponse`، ووحدة `LOG_MODULE`) · `MJ12` (وحدة وقسم وواجهتا لوحة) · حل `panel.test.tsx` (أدناه) · اختبار إصلاح التكامل (أدناه) |
| `MJ11` | `background/main.ts` +12/−3 · `registry.ts` +8 · `d/pr-status/section.tsx` +21/−4 | `MJ10` (استيراد `requestPanelTab` ومعرّفات القاموس ومعالج أمر `open-glossary` و`panelDeps`، وثلاث وحدات في السجل) · `MJ12` (`BOOKMARKS_MODULE`) · إصلاح التكامل (قسم الدرج) |
| `MJ12` | `registry.ts` +8 · `sections.ts` +6 · `views.ts` +3 · `tests/modules/h/panel.test.tsx` +5/−2 | `MJ10` (ثلاث وحدات وثلاثة أقسام وواجهتا بحث) · `MJ11` (`LOG_MODULE`) · حل `panel.test.tsx` (أدناه) |

لا ملف خارج هذه يفترق عن أي فرع.

## التعارضات وحلها بالمواصفة

كلها في الملفات المشتركة التي تنص «الملكية ومناطق التعارض» على أنها تُضم بترتيب الدمج، وكلها **إضافات من الجانبين** فضُمّت بترتيب `MJ10` ثم `MJ11` ثم `MJ12` بلا اختيار نسخة:

- دمج `MJ11`: `src/core/registry.ts` (سطر `LOG_MODULE` بعد `COMPOSER_MODULE`) · `src/background/main.ts` (استيرادات طبقة API بعد استيراد معرّفات القاموس؛ أما موضعا الأمر ورسائل الخلفية فدُمجا آليًا بلا تعارض لأنهما في مقطعين مختلفين).
- دمج `MJ12`: `src/core/registry.ts` (استيراد `BOOKMARKS_MODULE`) · `src/options/sections.ts` (استيراد `LATER_SETTINGS_SECTION`) · `src/sidepanel/views.ts` (استيراد `LATER_PANEL_VIEWS`) · **`tests/modules/h/panel.test.tsx`**: كتبت `MJ10` قائمة مغلقة (`toEqual` مع `native.sort()`) بإضافة `b-glossary-search`، وكتبت `MJ12` `arrayContaining` بدلها كإصلاح الموجة D لأن السجل مشترك وتضيف المراحل واجهات. حُلّ بالمواصفة لا بانتقاء نسخة: `arrayContaining` (القائمة المغلقة تكسر بإضافة `MJ12` واجهات) مع بقاء معرّف `b-glossary-search` ضمن المقاس.
- ملفات المراحل (`MJ10.md` و`MJ11.md` و`MJ12.md`) لم تتعارض: لكلٍّ نسخة فرعها. `package.json` وملف القفل والمانيفستان لم تتعارض (المانيفستان من `MJ10` وحدها: أمر `open-glossary`).

## إصلاح تكامل (التزام `abd6f8d`)

شُغِّل فحص تكامل `MJ9` على الشجرة المجمّعة فأخرج **5 بنود ساقطة في كل متصفح** (43/48 في الثلاثة و45/50 في Firefox). السكربت يخرج برمز 0 مهما سقط من بنوده، فلا يُقرأ رمز الخروج وحده؛ قُرئت بنوده. المحفوظ: [`modules/mj9-integration-first-run-failed.txt`](modules/mj9-integration-first-run-failed.txt) و[`.json`](modules/mj9-integration-first-run-failed.json). وبعد الإصلاح 48/48 و50/50 ([`modules/mj9-integration.txt`](modules/mj9-integration.txt)).

| البند الساقط | السبب | الحكم | الإصلاح |
| :--- | :--- | :--- | :--- |
| `notes.line-note-stored` · `notes.card-lists-note` · `notes.edit-keeps-anchor-status-separate` | تتوقع `anchorStatus === 'unverified'`، والمخزَّن صار `matched` | **ليس تراجعًا**: بعد `MJ12` (`T-8.3`) تُنشأ للملاحظة مرساة عند إنشائها فتُعدّ مطابقة (قاعدة `AC-G3`: لا علامة سطر لملاحظة لها مرساة إلا «مطابقة»)؛ والبنود كُتبت قبل وجود المحرك | تُقاس القيمة `matched` في `evidence/MJ9/integration-check.mjs` مع تعليق بالسبب |
| `drawer.community-tab` | يحصر إشعارات تبويب المجتمع في اثنين، وأضافت `MJ12` (`T-9.2`) ثالثًا لمعالج README | **ليس تراجعًا**: واجهة معالج README في الدرج رسالة للوحة الأصلية وحدها | يُقاس الإشعاران الأصليان ولا يُحصر العدد |
| `drawer.no-text-fields-in-any-tab` | تبويب **الإعدادات** في الدرج يحوي `fields: 1`، وهو `<select>` | **تراجع حقيقي** أدخلته `MJ11` (عتبة التقادم `PP-01` في قسم حالة الـPR، وسطحه يشمل `drawer`) على قاعدة «لا حقول إدخال في الدرج» | في الدرج تُعرض العتبة **نصًّا للقراءة فقط** ("5 دقائق — تُعدَّل من اللوحة الجانبية الأصلية أو صفحة الإعدادات")، وتبقى القائمة في صفحة الإعدادات واللوحة الأصلية؛ واختبار يحرس السطحين في `tests/modules/b/card/panel-and-settings.test.tsx` |

ملاحظة على تفسير القاعدة: اختبار الدرج في `MJ5` (`tests/core/ui-host/drawer.test.tsx` وسكربتا المتصفح) يعدّ `input, textarea, [contenteditable]` ولا يعدّ `select`، بينما مسبار `MJ9` يعدّه. اختير الأحوط (لا عنصر إدخال في الدرج) بدل تخفيف الحارس بتفسير؛ وإن رأى المالك أن عناصر الاختيار مسموحة فذلك قرار له يُضم إلى بند «السماح بحقول في الدرج» المنتظر من `MJ10`.

## الفحوص

نتائج الجدول على الرأس النهائي (بعد `abd6f8d`).

| الفحص | الأمر | النتيجة | الملف |
| :--- | :--- | :--- | :--- |
| الأنواع | `npx tsc --noEmit` | بلا أخطاء | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| اختبارات البوابة مجتمعة | `npx vitest run tests/core tests/modules tests/data` | 96 ملفًا · 1616 اجتازت · 2 متخطى | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| الطقم كاملًا | `npx vitest run` | 98 ملفًا · 1661 اجتازت · 2 متخطى = 1204 من D + 457 | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| مدقق القاموس | `node scripts/glossary/validate.mjs` | اجتاز (أُجري قبل الإصلاح؛ لا يمسه الإصلاح) | [`typecheck-and-tests.txt`](typecheck-and-tests.txt) |
| بناء الحزمتين | `npm run build` | `dist/chromium` و`dist/firefox` | [`build.txt`](build.txt) |
| فحص مانيفست Firefox | `npx web-ext lint --source-dir dist/firefox` | 0 أخطاء · 0 ملاحظات · 0 تحذيرات | [`web-ext-lint.txt`](web-ext-lint.txt) |
| تحميل الحزم | `node scripts/load-check.mjs` | الأربعة: `ENABLED` بلا أخطاء مانيفست ولا تشغيل ولا تحذيرات، والخلفية بدأت | [`load-check.txt`](load-check.txt) |
| **عدم تراجع المضيف** (`TEST-CORE-05` و`06`) | `node tests/core/ui-host/browser/run.mjs chrome edge brave firefox --out evidence/wave-E/ui-host` | الأربعة: **اجتاز** في العزل والدرج واللوحة الأصلية والمفاتيح الثمانية والصلاحية والشبكة؛ 0 اختلاف في 13 عنصرًا × 37 خاصية؛ **0 طلب إلى `api.github.com` قبل المنح** (راجع «سقوط عابر» أدناه) | [`ui-host/browser-report.md`](ui-host/browser-report.md) |
| تكامل الحزمة المشحونة بكل وحداتها (`MJ8`) | `node tests/modules/browser/integration.mjs … --out-dir evidence/wave-E/modules/integration-out` | 26/26 في Chrome وEdge وBrave و25/25 في Firefox (103/103)، وأخطاء الكونسول 0 — على `BUILTIN_MODULES` بعد إضافة الوحدات الثلاث الجديدة | [`modules/integration.txt`](modules/integration.txt) |
| تكامل `MJ10` على الحزمة المشحونة | `node tests/modules/browser/mj10-integration.mjs …` | 27/27 ×3 و26/26 (107/107): أمر `open-glossary` مسجَّل، والوحدات الجديدة تُركَّب، ووحدة الترجمة ساكنة، والصلاحيات كما هي | [`modules/mj10-integration.txt`](modules/mj10-integration.txt) |
| الوصول (`MJ10`، `TEST-A11Y-01/02`) | `node tests/modules/b/access/browser/run.mjs …` | 55/55 ×3 و48/48 (213/213) | [`modules/access.txt`](modules/access.txt) |
| البحث (`MJ10`، `TEST-GLOSS-04`) | `node tests/modules/b/search/browser/run.mjs …` | 30/30 في كل متصفح (120/120)؛ `PB-03` إدخال ← DOM: p95 بين 2.1 و3.0ms | [`modules/search.txt`](modules/search.txt) |
| واجهة الترجمة (`MJ10`، `TEST-TR-01/03`) | `node tests/modules/c/ui/browser/run.mjs …` | 44/44 في كل متصفح (176/176) | [`modules/ui.txt`](modules/ui.txt) |
| مساعد الكتابة (`MJ10`، `TEST-WRITE-01/04`) | `node tests/modules/f/composer/browser/run.mjs …` | 29/29 في كل متصفح (116/116) | [`modules/composer.txt`](modules/composer.txt) |
| **تكامل `MJ11` وتدقيق شبكة API** | `node tests/modules/d/browser/mj11-integration.mjs …` | 18/18 في كل متصفح (72/72) (التفاصيل أدناه) | [`modules/mj11-integration.txt`](modules/mj11-integration.txt) · [`modules/mj11-integration-out/`](modules/mj11-integration-out/MJ11-integration.json) |
| `MJ12` على الحزمة المشحونة | `node tests/modules/g/browser/mj12-check.mjs <متصفح> --out-dir evidence/wave-E/modules/mj12-out` | Chrome وEdge وBrave 16/16، وFirefox 15/15 | [`modules/mj12-chrome.txt`](modules/mj12-chrome.txt) وأخواتها |
| انحدار بطاقة الشرح (`MJ8`) | `node tests/modules/b/card/browser/run.mjs …` | 45/45 في كل متصفح (180/180) | [`modules/card.txt`](modules/card.txt) |
| انحدار حالة الـPR والمقارنة (`MJ8`) | `node tests/modules/d/browser/run.mjs …` | 86/86 في كل متصفح (344/344) | [`modules/d-status.txt`](modules/d-status.txt) |
| انحدار الملاحظات والمجتمع (`MJ9`) | `node evidence/MJ9/integration-check.mjs …` | Chrome وEdge وBrave 48/48 وFirefox 50/50؛ `api.github.com` 0 في عائلة Chromium و16 `GET` في Firefox كلها من الفحوص الصريحة بمنح فعلي؛ 0 مضيف آخر | [`modules/mj9-integration.txt`](modules/mj9-integration.txt) · [`.json`](modules/mj9-integration.json) |

## تدقيق شبكة طبقة API العامة (شرط البوابة)

- **ساكن** (المصدر المجمّع): كل ما في `src/` من `fetch(` و`XMLHttpRequest` و`sendBeacon` و`WebSocket` و`EventSource` خمسة أسطر (تعريف واجهة وأربعة استدعاءات). **الطريق الوحيد إلى `api.github.com` هو `fetchApiGithub`** (`core/ui-host/permissions.ts`، ترفض أي مضيف غيره وتتحقق من الصلاحية قبل الإرسال) ولا يستدعيه إلا موضعان: `src/core/api/client.ts` بـ`method: 'GET'` و`credentials: 'omit'` بلا `Authorization` ومسارات `/repos/…` و`/rate_limit` وحدها (`isPublicPath` ترفض `..`)، و`h/api-access.ts` (واجهة الوحدة (ح) الممرَّرة عبرها). والاستدعاءات الثلاثة الباقية لا تخص `api.github.com`: `h/first-contribution/sources.ts` (جلب بنقر من `github.com/<…>/raw/HEAD/<ملف>` الذي يحوّل إلى `raw.githubusercontent.com`، وهو بند `AC-10.1` القائم من `MJ9` ينتظر المالك) و`d/pr-status/module.tsx` و`d/log-parser/module.tsx` (`github.com` بنفس الأصل بنقر).
- **ديناميكي** (`mj11-integration.mjs` على الحزمة المشحونة في الأربعة): قبل المنح لا زر API وتُعرض «افتح الإعدادات»، و**صفر طلبات إلى `api.github.com` قبل المنح** في كل الصفحات؛ بعد المنح يظهر زر «أكمل من GitHub API العامة» **ولا طلب قبل النقر**؛ وبعد النقر كل الطلبات من service worker الخلفية لا من الصفحة (عائلة Chromium)، وفي Firefox بلا `Authorization` ولا ملفات تعريف. ومن المضيف (`TEST-CORE-06`): 0 طلب قبل المنح من كل السياقات.
- **لم يُجرَ**: منح الصلاحية بنقرة فعلية في عائلة Chromium (نافذة الطلب لا تُقبل آليًا؛ قيس ما بعد المنح بنسخة مشتقة بصلاحية ممنوحة عند التثبيت، وفي Firefox بمنح فعلي)؛ وصفحات github.com الحية.

## سقوط عابر في جولة Firefox لفحص المضيف (السبب محدد، الإصلاح لم يُطبَّق)

شغّلتُ `ui-host` الرباعي **داخل سلسلة البوابة المتسلسلة** مرتين (قبل الإصلاح وبعده)، وفي المرتين أتمّت Chrome وEdge وBrave ثم خرجت العملية برمز 13 بتحذير «Detected unsettled top-level await» بلا سطر لـFirefox. الملفان: [`ui-host-first-run-failed.txt`](ui-host-first-run-failed.txt) و[`ui-host-second-run-failed-after-load-check.txt`](ui-host-second-run-failed-after-load-check.txt). [`ui-host-run.txt`](ui-host-run.txt) هو التشغيل المعتمد، واجتاز الفحص نفسه في 17 تشغيلًا رباعيًا آخر على الشجرة نفسها.

**حُقِّق فيه بعد إغلاق الموجة** ([`ui-host-firefox/README.md`](ui-host-firefox/README.md)): السبب عيب في **أداة الفحص لا في المنتج**. وكيل CONNECT المحلي في `tests/core/ui-host/browser/firefox.mjs` قد يترك نفقًا نصف مغلق متوقف القراءة (بايتات وصلت من Firefox بعد أن أنهى الخادم المحلي جهته فارتدّ `pipe`)، فيبقى `proxy._connections=1` ولا يُستدعى ردّ `proxy.close()` أبدًا؛ ويُغلق مقبض الاستماع فتفرغ حلقة Node والوعد معلّق وتخرج برمز 13 قبل `fs.rmSync`. أُعيد السقوط بالتتبع والتُقط المقبس العالق، وعُزلت الآلية بلا Firefox (خروج 13 بالتحذير نفسه، ويزول بمعالجَي `close` متقابلين). يحدث في نحو 10% من جولات Firefox (3 من 31).

الإصلاح ([`ui-host-firefox/proxy-fix.patch`](ui-host-firefox/proxy-fix.patch)، 22 سطرًا) جُرّب في نسخة معزولة: 60 جولة من 60 وتشغيلان رباعيان اجتازت، و`_connections=0` عند كل إغلاق. **لم يُطبَّق على `main`** لأن الملف ضمن ملكية `MJ5` المدمجة، ولأن السطر نفسه مكرَّر في سبعة سكربتات أخرى (مذكورة في ملف التحقيق) ينتظر المالك قراره في نطاق التطبيق. وبقي أن `TEST-CORE-05` و`06` **اجتازا** على الرأس النهائي؛ ولا بند منهما سقط في أي مرة.

## الجولة اليدوية

`waves.json` ينص: «لا شيء». لم تُجرَ.

## الحجم

الحزمة المشحونة (`dist/chromium`): `content.js` 1112 KB (كان 782 KB بعد D) · `background.js` 215 KB (195) · `options.js` 216 KB (207) · `sidepanel.js` 755 KB (394) · `reader.js` 224 KB (215). يُقاس كله بميزانيات `T-10.1`.

## ما بقي لدى المالك أو لمراحل لاحقة (لا يمنع الإغلاق)

- **ثلاث مراجعات مستقلة:** `MJ10` (خصوصية ومسودات وأمر `open-glossary`) و`MJ11` (طبقة شبكة جديدة ومنفذ رسائل الخلفية) و`MJ12` (بصمات الأسطر والملح المحلي في الخاص)؛ برومبتاتها جاهزة في تقارير تسليمها.
- **`MJ11` (`T-0.5`):** إبطال الرمزين `mijhar-t05-min` و`mijhar-t05-read` ومفتاح `mijhar-t05`، وحذف المستودع `iSltanX/mijhar-t05-spike` والمجلد `~/mijhar-t05`. وتعذّر في المستودع التجريبي الخاص تشغيل مهام Actions لقيد فوترة على حساب المالك.
- **`MJ12`:** `DEC-05` حُسم من منفّذ المرحلة بـ**ز-1** (نص في العام وبصمة مملّحة في الخاص) بتفويض `AD-14` من نص المرحلة، وهو توصية الخطة؛ يقرّه المالك أو يعدّله.
- **`MJ10`:** السماح بخانة بحث غير سرّية في الدرج (يقتضي تخفيف قاعدة «لا حقول إدخال في الدرج»، ويشمل ما ذُكر أعلاه عن `<select>`)، وشارة المؤشر الدقيق 20px دون هدف `WCAG 2.2` (24px)، والضغطة الفعلية على `Alt+K` وتعارضها (`DEC-08`)، وتجربة بقارئ شاشة وجهاز لمسي حقيقيين.
- **لم يُجرَ:** صفحات github.com الحية، ومنح الصلاحية بنقرة فعلية في عائلة Chromium، واختبار التواريخ التسعة لـ`MJ12` (`MIJHAR_HISTORIES`: يتطلب ملف تواريخ تسعة مستودعات خارجية يولّده `extract.mjs`؛ جرى منفصلًا في المرحلة، ونسخة `flask/README.md` المضمّنة تعمل في كل تشغيل).
- **تحذير ترميز (`MJ12`):** محرف «غير حرفي» (U+FFFE/U+FFFF أو U+FDD0–U+FDEF) في أي شيفرة تبلغ `content.js` يجعل Chromium يرفض الإضافة كلها؛ `npm run load-check` على الشجرة المجمّعة يكشفه، وقد اجتاز.

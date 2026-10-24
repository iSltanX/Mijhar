# تقرير `T-11.6`: طبقة مزوّد التحليل وتجربة الموافقة وتدقيق الشبكة (`F-E9`)

> الفرع `mj/21-provider-analysis`، 2026-10-24. مزوّد واحد (Anthropic، `DEC-09` ز-1) بتوجيه المالك؛ وإضافة مزوّدين آخرين خارج النطاق. ولا أسعار ولا تكلفة ولا حدود إنفاق (`AD-31`)، وزر الموافقة «إرسال للتحليل». وبقرار المالك في إعلان Firefox (`AD-15`): «مشاركة محتوى المواقع» (`websiteContent`) اختيارية تُطلب في نقرة حفظ المفتاح.
> لا مفتاح حقيقي ولا طلب إلى المزوّد الحقيقي: كل طلب إلى `api.anthropic.com` في الاختبارات والمتصفحات يخدمه `fixture-provider-mock` محليًا، والمفتاح والرمز مختلَقان يُركَّبان وقت التشغيل (فُحص الناتج: 0 ظهور لصيغتيهما).

## ما نُفِّذ

| الجزء | الملفات |
| :--- | :--- |
| عقد المحوّل والنتائج المصنَّفة | `src/modules/e/provider/types.ts` |
| محوّل Anthropic: `GET /v1/models` (التحقق المعلن والمودلات وقت التشغيل) و`POST /v1/messages` بلا بث، بترويسات `T-0.5` (`x-api-key` و`anthropic-version: 2023-06-01` و`anthropic-dangerous-direct-browser-access`)، وتصنيف 401/403/404/413/400/429/529 وموعد `retry-after` | `adapters/anthropic.ts` |
| سجل المزوّدين والمودل الافتراضي من القائمة نفسها (فئة sonnet كما يعلنها المزوّد) | `registry.ts`، `settings.ts` |
| بوابة الطلب: مضيف المحوّل وحده بعد صلاحيته الاختيارية، `credentials: omit` و`no-referrer`؛ وتنقيح المفتاح من أي نص | `gate.ts` |
| خدمة الخلفية: المفتاح يُقرأ لكل طلب ولا يعبر رسالة؛ طلب واحد لكل نقرة (حجز متزامن قبل أي await)؛ احترام موعد إعادة المحاولة المعلن؛ لا إرسال بمفتاح رفضه المزوّد؛ المودل هو ما عرضته الموافقة؛ لا إعادة تلقائية؛ صحة المفتاح في سجل الاتصالات | `service.ts`، `port.ts`، `src/background/main.ts` |
| ما يُرسل: قالب برومبت من الطبقة المشتركة بعد الحجب، وتعليمات صيغة رد تعامل السياق بيانات لا تعليمات | `request.ts` |
| قراءة الرد: المثبت من المصدر هو الاقتباس الوارد حرفيًا فيما أُرسل، وما لم يرد يُعلن | `result.ts` |
| تجربة الموافقة «إرسال للتحليل» | `ui/ConsentSheet.tsx`، `ui/styles.ts` |
| بطاقة المفتاح وإعدادات التحليل و«لماذا المفتاح؟» | `KeySection.tsx`، `section.tsx`، `src/options/guide/ProviderKeyGuide.tsx`، `src/options/OptionsApp.tsx`، `src/options/main.tsx` |
| قلب مفتاح المزوّد إلى متاح في السجل والترحيب، وميزات التحليل الثلاث، وموضعا الإعدادات | `src/core/connections/{definitions,features,service,text}.ts`، `src/shared/onboarding/content.ts`، `src/core/ui-host/commands.ts` |
| صلاحية مضيف اختيارية `https://api.anthropic.com/*` وحدها | `src/manifest/{chromium,firefox}.json`، `generate.mjs`؛ وتدقيق الترجمة يقبلها خارج مسارها وحده (`src/modules/c/network-audit/*`) |
| إعلان Firefox (`AD-15`، قرار المالك): `data_collection_permissions` بـ`required: ["none"]` و`optional: ["websiteContent"]`؛ وتُطلب الموافقة مع صلاحية المضيف في طلب واحد من نقرة حفظ المفتاح قبل أي await، وتُسحب معها؛ والخلفية لا ترسل تحليلًا في Firefox دونها (والتحقق المعلن بلا محتوى فلا يحتاجها)؛ وعائلة Chromium بلا تغيير | `src/manifest/firefox.json`، `gate.ts` (`ProviderHostPermission`)، `service.ts` (`contentPermission`)، `KeySection.tsx`، `ui/ConsentSheet.tsx`، `src/options/main.tsx`، `src/background/main.ts`، `src/core/ui-host/browser-api.ts` (`data_collection`) |

## `AC-E9` بندًا بندًا

| البند | الدليل | النتيجة |
| :--- | :--- | :--- |
| (١) إضافة المفتاح تفعّل الخيارات ولا تبدأ تحليلًا؛ الطلب الوحيد التحقق المعلن | `service.test.ts` («الحالة لا تطلب شيئًا؛ والتحقق طلب واحد…»)؛ `ui.test.tsx` (الإعلان قبل الحفظ، والصلاحية في النقرة نفسها ثم الحفظ ثم التحقق وحده)؛ المتصفحات: «بعد إضافة المفتاح طلب واحد إلى المزوّد هو التحقق المعلن GET /v1/models من الخلفية» و«فتح صفحة الفحوص لا يرسل شيئًا» | اجتاز (Chrome وEdge وBrave وFirefox) |
| (٢) لا طلب قبل الموافقة، والموافقة تبيّن ما يُرسل وحجمه وما استُبعد والوجهة (المزوّد والمودل) | `request.test.ts`، `ui.test.tsx`، `analysis.test.tsx`؛ المتصفحات: «فتح الموافقة لا يرسل شيئًا» و«نقرة الفأرة الحقيقية تفتح الموافقة: ما يُرسل ولأي مزوّد ومودل» | اجتاز |
| (٣) المودلات من المزوّد وقت التشغيل بمصدرها ووقتها، ولا مودل ولا سعر ولا تكلفة ولا حد إنفاق في الشيفرة | `service.test.ts` (القائمة والمصدر والوقت والمتقاعد والافتراضي)؛ `static.test.ts` (لا معرّف مودل في src، ولا كلمة سعر أو تكلفة أو ميزانية أو إنفاق في مسار التحليل، ولا رابط أسعار)؛ المتصفحات: المودلات في «إعدادات التحليل» بمصدرها؛ واحترام حد المزوّد وموعده: `service.test.ts` (429، والطلب الجاري، ولا إعادة تلقائية) | اجتاز |
| (٤) المفتاح إلى المزوّد وحده، ولا رمز GitHub ولا سرّ آخر في طلبه، ولا مفتاح في رسالة ولا سجل ولا برومبت؛ وصيغته نمطٌ في قائمة الحجب | `service.test.ts` (الترويسات والجسم والرسائل والردود، وتنقيح ما يردّده الخادم)؛ `adapter.test.ts` (البوابة)؛ `tests/modules/e/context/api-binding.test.ts` (النمط السابع `anthropic-key` يُحجب في البرومبت ويُرصد في الحزمة)؛ المتصفحات: `TEST-PRIV-04` أدناه | اجتاز |
| (٥) فصل المثبت من المصدر عن الاحتمال وبيان ما نقص | `request.test.ts`، `analysis.test.tsx` | اجتاز |
| (٦) محوّل ثانٍ لا يمس شيفرة الأقسام | `service.test.ts` (سجل بالمزوّدين والمختار الثاني `MOCK_PROVIDER_B`: طلباته إلى مضيفه وحده)؛ `static.test.ts` (الأقسام لا تذكر محوّلًا ولا مضيفه ولا الخدمة، والسجل وحده يستورد المحوّلات) | اجتاز |
| (٧) «إرسال للتحليل» يقبل التفعيل الحقيقي وحده | `ui.test.tsx` و`analysis.test.tsx` (`click()` وحدث مُنشأ لا يُصدران شيئًا، والنقرة الموثوقة تُصدر طلبًا واحدًا)؛ `tests/shared/user-activation.test.ts` (الحارس الساكن يشمل `ConsentSheet.tsx`)؛ المتصفحات: النقر البرمجي من عالم الصفحة مرفوض في «حلّل…» وفي «إرسال للتحليل»، ونقرة الفأرة وEnter وSpace الحقيقية تُصدر كلٌّ منها طلبًا واحدًا (ثلاثة لثلاثة) | اجتاز في الأربعة. وتقنيات الإتاحة **لم تُقَس مباشرة**: لا أداة هنا تقود قارئ شاشة؛ والزر `<button>` أصلي بلا اشتراط `event.detail`، وتفعيل تقنيات الإتاحة حدث click موثوق يولّده المتصفح كما لوحة المفاتيح |
| (٨) «لماذا المفتاح؟» والترحيب | `ui.test.tsx` (الأماكن الثلاثة بأمثلة موسومة، والوجهة وما يُرسل وما يبقى دونه، بلا أسعار ولا «نسخ البرومبت» لأنها لم تُدمج، وتاريخ سياسة الاحتفاظ)؛ `tests/shared/onboarding/welcome.test.tsx` (قبل: «لم يُتح بعد» بلا رابط ولا Anthropic؛ وبعد: متاح برابط شرحه) | اجتاز |

## إعلان Firefox (`AD-15`)

| ما يُقاس | الدليل | النتيجة |
| :--- | :--- | :--- |
| الإعلان في الحزمة المبنية | `tests/build/build.test.ts` (`{ required: ['none'], optional: ['websiteContent'] }`، و`strict_min_version` 140 فأعلى)؛ و`npm run lint:firefox` | اجتاز؛ و`web-ext lint` بلا أخطاء ولا تحذيرات ولا ملاحظات |
| الطلب في نقرة الحفظ نفسها مع المضيف قبل أي حفظ، ورفضه يحفظ المفتاح «غير متحقق منه» بلا طلب، والسحب يسحبهما معًا، وعائلة Chromium تطلب المضيف وحده | `ui.test.tsx` (4) | اجتاز |
| لا تحليل في Firefox دون الموافقة (لا طلب، والسبب معلن)، وبها طلب واحد؛ وعائلة Chromium لا تشترطها | `service.test.ts` (3) | اجتاز |
| في Firefox 158.0.1 على الحزمة: قبل الحفظ «غير ممنوحتين» والبطاقة تعلن الموافقة؛ ونقرة الحفظ الحقيقية منحت `websiteContent` (من `permissions.getAll()`)، ثم التحليل كما في غيره | `browser-provider-check.{txt,json}` | اجتاز؛ وفي Chrome وEdge وBrave لا إعلان ولا طلب لها |

## الاختبارات المسماة

- `TEST-AI-01` (تكامل + تدقيق شبكة): `tests/modules/e/provider/service.test.ts` (15) و`browser/provider-check.mjs`.
- `TEST-AI-02` (وحدة + مراجعة شيفرة): `service.test.ts` (المحوّل الثاني) و`request.test.ts` و`static.test.ts`.
- `TEST-PRIV-04` (تدقيق شبكة + مراجعة شيفرة): المتصفحات الأربعة برمز GitHub ومفتاح المزوّد معًا: كل طلبات المزوّد (4) إلى `api.anthropic.com` من الخلفية بـ`x-api-key` وحده، بلا `Authorization` ولا رمز GitHub في ترويسة أو جسم؛ ولا مفتاح في أي طلب إلى `api.github.com`؛ ولا وجهة للإضافة غير `github.com` و`api.github.com` و`api.anthropic.com` (ومضيف أنماط صفحة GitHub المحفوظة `github.githubassets.com` تطلبه الصفحة نفسها: يرد في HTMLها ولا يرد في أي ملف من الحزمة، ويُسرد منفصلًا)؛ ولا سرّ في الكونسول.

## النتائج

| الأمر | النتيجة | الدليل |
| :--- | :--- | :--- |
| `npx vitest run tests/modules/e/provider tests/modules/d/analysis` | 62/62 | `vitest-provider-analysis.txt` |
| `npx vitest run tests/modules/e` (انحدار الوحدة (هـ) بلا تعديل في التوقعات القائمة) | 220/220؛ ومنه `bundle-golden` 6/6 و`templates` 31/31 و`privacy-check` 21/21 و`prompts` 36/36 | `vitest-module-e-regression.txt`، `vitest-ad30-golden.txt` |
| `node tests/modules/e/provider/browser/provider-check.mjs chrome edge brave firefox` | 96/96 (Chrome 156 وEdge 155 وBrave 156 وFirefox 158.0.1: 24 لكلٍّ) | `browser-provider-check.{txt,json}` |
| `node tests/modules/e/browser/templates-check.mjs chrome edge brave firefox` (انحدار القوالب وتنبيه الأسرار على الحزمة الجديدة) | 127/127 | `regression/templates-check.txt` و`regression/browser-{templates,privacy}-check.json` |
| `node tests/modules/e/browser/builder-check.mjs chrome edge brave firefox` (انحدار منشئ الحزمة) | 55/55 | `regression/builder-check.txt` و`regression/browser-builder-check.json` |
| `node tests/core/connections/browser/connections-check.mjs chrome edge brave firefox` (سجل الاتصالات بعد قلب بطاقة المفتاح) | 124/124 | `regression/connections-check.txt` و`regression/browser-connections-check.json` |
| `node scripts/network-audit.mjs static` (مسار الترجمة) | لا مخالفة ولا تحذير؛ `api.anthropic.com` صلاحية اختيارية وحدها | `translation-static-audit.txt` |
| `npm run build` ثم `npm run lint:firefox` | بلا أخطاء ولا تحذيرات ولا ملاحظات | — |
| الطقم كاملًا `npx vitest run` | 2398 اجتازت و2 متخطى | — |

## ما لم يُجرَ

- طلب إلى `api.anthropic.com` الحقيقي بمفتاح حقيقي: لا مفتاح تجريبي في هذه الجلسة، ولا يُدخل مفتاح حي في متصفح آلي. المسار الحقيقي (الترويسات وCORS والرد) قاسته `T-0.5` (`evidence/T-0.5/report.md`)، والمحوّل يطابقه.
- نافذة إذن المضيف في عائلة Chromium: لا تُقبل آليًا، فمُنحت الصلاحيتان في نسخة مشتقة؛ وطلبها في نقرة الحفظ نفسها قبل أي حفظ يقيسه `ui.test.tsx`.
- تفعيل الزر بتقنيات الإتاحة (قارئ شاشة) لم يُقَس مباشرة (البند ٧ أعلاه).
- نافذة موافقة Firefox نفسها (شكلها ونصها): قبِل التفضيل `extensions.webextOptionalPermissionPrompts=false` الطلب آليًا؛ فقيس أن نقرة الحفظ الحقيقية تطلب `websiteContent` وتمنحها، ولم تُقَس النافذة.

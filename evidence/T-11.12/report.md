# `T-11.12` — محوّل Google Gemini: التحقق والنماذج المتوافقة والتحليل وتفسير الأخطاء (`AC-E12`، `F-E9`)

- المرحلة `MJ25` (الموجة L)، الفرع `mj/25-gemini-adapter` من `main` (`37d86c0`)، 2026-10-24. آخر التزام عمل: `c09b035`.
- **محاكاة، ثم اتصال حقيقي واحد (`TEST-AI-09`):** كل الفحوص الآلية على مضيف Gemini وهمي محلي بأشكال ردود مقيسة (`geminiMock` في [`fixture-provider-mock.ts`](../../tests/modules/e/provider/fixture-provider-mock.ts)) وتُسجَّل **محاكاة**. والاتصال الحقيقي أُجري بمفتاح تجريبي (مجاني) وفّره المالك في ملف خارج المستودع (لا يُطبع ولا يُكتب في أي دليل؛ فُحص آليًا: 0 ظهور)، على عينة عامة محفوظة بلا محتوى خاص: §6. وما خرج إلى Google خارج ذلك: طلبا الوصول المباشر بمفتاح غير صالح عمدًا وبلا محتوى (ونص «ping» وحده في طلب التوليد)، وثلاثة طلبات ضابط بلا جسم.

## 1. الوثائق والوصول المباشر (`AC-E12` (١)، `HYP-21`)

الوثائق الرسمية وتاريخ قراءتها وما أُخذ منها وما حُسم بالقياس بدلها: [`official-docs.md`](official-docs.md).

القياس: [`direct-access.json`](direct-access.json) بـ[`gemini-direct-access.mjs`](../../tests/modules/e/provider/gemini-direct-access.mjs) (إضافة اختبار مؤقتة بصلاحية مضيف واحدة، ملف تعريف مؤقت لكل متصفح، الطلب من **خلفية الإضافة** — service worker في Chromium وصفحة الخلفية في Firefox — بلا وسيط).

| المتصفح | الإصدار | `GET /v1beta/models` | `POST …:generateContent` («ping» وحده) | قُرئ الرد؟ |
| :--- | :--- | :--- | :--- | :--- |
| Chrome | 156.0.8078.47 | 400 `INVALID_ARGUMENT` / `API_KEY_INVALID` (`type: basic`) | 400 مثله | نعم: الرمز والجسم والترويسات |
| Edge | 155.0.4283.60 | مثله | مثله | نعم |
| Brave | 156.0.8078.48 | مثله | مثله | نعم |
| Firefox | 158.0.1 | مثله | مثله | نعم |

**الحكم على `HYP-21`: صحيحة** — الطلب يصل من الخلفية في الأربعة ويُقرأ رده كاملًا، فلا ينطبق `BLK-PROVIDER-DIRECT-ACCESS` ولا وسيط. لم تلزم ترويسة خاصة (لا ما يقابل `anthropic-dangerous-direct-browser-access`)؛ ورد `POST` يحمل `access-control-allow-origin` لأصل الإضافة في Chromium، ورد `GET` وكل ردود Firefox تُقرأ بلا ترويسة CORS (صلاحية المضيف تكفي). ما قِيس بالمفتاح غير الصالح لا يثبت نجاح طلب بمفتاح صالح (`TEST-AI-09`).
**ضابط:** [`header-control.txt`](header-control.txt) — بلا مفتاح 403 «unregistered callers»، وبمفتاح غير صالح في الترويسة 400 «API key not valid»: فالخادم يقرأ `x-goog-api-key`.

## 2. ما بُني

| الجزء | الملفات | الأثر |
| :--- | :--- | :--- |
| الوصف | `src/modules/e/provider/descriptors/gemini.ts` + سطر في `catalog.ts` | المعرّف `gemini` والمضيف `generativelanguage.googleapis.com` وصلاحيته الاختيارية وصيغتا المفتاح (`AIza` + 35، و`AQ.` + نحو 50 التي يصدرها AI Studio الآن) وطلب التحقق المعلن ورابط سياسة البيانات الرسمي (`ai.google.dev/gemini-api/terms`، قُرئ 2026-10-24) وملخصها كما قالته الصفحة |
| المحوّل | `src/modules/e/provider/adapters/gemini.ts` + سطر في `registry.ts` | `listModels` (طلب التحقق المعلن) و`analyze` (`generateContent`) وتصنيف الأخطاء وموعد إعادة المحاولة وحجب الأمان؛ المفتاح في الترويسة وحدها؛ لا `probe` (`probeRequest: null`) |
| الحجب | `src/modules/e/privacy-check/scan.ts` | النمط `gemini-key` (`AIza` أو `AQ.` ثم 30 حرفًا فأكثر، بنظرة خلفية) |
| الصلاحية | `src/manifest/chromium.json` و`firefox.json` و`generate.mjs` | `https://generativelanguage.googleapis.com/*` في `optional_host_permissions` وفي قائمة المضيفات المسموحة؛ و`websiteContent` الاختيارية في Firefox كما هي |
| التدقيق | `src/modules/c/network-audit/policy.mjs` (`ANALYSIS_PROVIDER_HOSTS`) و`scripts/network-audit.mjs` (`PROVIDER_ADAPTER_MARKERS.gemini`) | مضيف تحليل مقبول صلاحيةً اختيارية وخارج مسار الترجمة وحده؛ وعلامات المحوّل في `background.js` وحده |

## 3. معايير القبول (`AC-E12`)

| البند | الدليل | النتيجة |
| :--- | :--- | :--- |
| (١) الوصول المباشر قبل المحوّل | §1 أعلاه؛ [`official-docs.md`](official-docs.md) | ✓ ممكن بلا وسيط في الأربعة |
| (٢) محوّل فعلي: التحقق بطلب معلن واحد بلا محتوى | `gemini.test.ts` (طلب واحد `GET`، بلا جسم)؛ [`browser-gemini-check.json`](browser-gemini-check.json) (الأربعة: الطلب الوحيد بعد الحفظ `GET /v1beta/models?pageSize=1000` من الخلفية) | ✓ محاكاة |
| (٢) التحليل بنقطة الواجهة الرسمية وتفسير الرد إلى عقد العرض (المثبت بدليل حرفي، والاحتمال، والناقص) | `gemini.test.ts` (جسم الطلب ومساره؛ والرد عبر `parseAnalysis`: الدليل الوارد حرفيًا `found` والذي لم يرد لا؛ و`MAX_TOKENS` ⇒ قطع؛ وأجزاء «التفكير» لا تدخل النص)؛ المتصفحات الأربعة (النتيجة في الطبقة الثالثة «احتمال يحتاج تحققًا» بالمودل والمضيف) | ✓ محاكاة |
| (٢) تصنيف الأخطاء بنص عربي منقّح من المفتاح | `gemini.test.ts`: مفتاح مرفوض (400 + `API_KEY_INVALID`)، صلاحية ناقصة (403، و400 `FAILED_PRECONDITION`)، مودل غير متاح (404)، حجم زائد (400 برسالة الرموز)، حد طلبات (429 بـ`retry-after` أو `RetryInfo`)، تعطل (503)، شبكة، إيقاف — كلٌّ بنص عربي لا مفتاح فيه (والخادم يردّد المفتاح في الاختبار فيُنقّح) | ✓ محاكاة |
| (٢) لا إعادة تلقائية ولا تحويل | `gemini.test.ts` (كل فشل = طلب واحد إلى مضيف Gemini وحده؛ وحد الطلبات يمنع التالي حتى موعده عبر `ProviderService`)؛ المتصفحات الأربعة (بعد حجب الأمان: طلب واحد ولا طلب إلى Anthropic) | ✓ محاكاة |
| (٣) النماذج بسياسة `DEC-13` | `gemini.test.ts` (مودل بـ`generateContent` وحده؛ ما بـ`embedContent` أو `predict` أو بلا طرق معلنة لا يُعرض؛ والحدّان `inputTokenLimit`/`outputTokenLimit` ⇒ `maxInputTokens`/`maxTokens`)؛ `static.test.ts` (لا أسماء مودلات في الشيفرة)؛ الأربعة (القائمة في البطاقة بمصدرها) | ✓ محاكاة |
| (٤) المفتاح في الخلفية وحدها، في الترويسة لا العنوان، إلى مضيفه وحده | `gemini.test.ts` (لا مفتاح في العنوان ولا الجسم؛ ولا `Authorization` ولا `x-api-key`)؛ الأربعة (كل طلبات Gemini `from: background` بـ`x-goog-api-key` وحده، ولا رمز GitHub ولا مفتاح Anthropic فيها، ولا مفتاح Gemini في طلب Anthropic)؛ [`provider-isolation.txt`](provider-isolation.txt) (علامات المحوّل في `background.js` وحده) و[`provider-isolation-control.json`](provider-isolation-control.json) (ضابط إيجابي يكشف علامة محقونة في `content.js`) | ✓ |
| (٤) صيغتا المفتاح (`AIza…` و`AQ.…`) في قائمة الحجب تحجبهما «نسخ البرومبت» والتحليل وتنبيه الحزمة (مفتاح مختلَق يُركَّب وقت التشغيل) | `gemini-privacy.test.tsx` (الفاحص يرصد الصيغتين بموضعهما؛ «نسخ البرومبت» يحجبه ويعدّه في التنبيه؛ والتحليل: الموافقة تعلن الحجب وما يُرسل بلا المفتاح) | ✓ |
| (٤) صلاحية المضيف اختيارية في المانيفستين، وتدقيق الشبكة الساكن والديناميكي يعرف مضيفه، وإعلان Firefox كما هو | `manifest.test.ts` و`static.test.ts` (مدقق الشبكة) و`static.test.ts` للمزوّد؛ [`static/`](static/) (مخالفات 0) و[`dynamic/`](dynamic/) (Chrome: طلبات الشبكة في الترجمة 0، مخالفات 0، تسرب 0)؛ `dist/firefox` يعلن `websiteContent` اختيارية كما كانت؛ وFirefox في الاختبار الآلي: نقرة الحفظ تمنح `websiteContent` مع المضيف | ✓ |
| (٥) المحاكاة والاتصال الحقيقي | كل ما سبق بمضيف وهمي محلي (محاكاة). **الاتصال الحقيقي (`TEST-AI-09`) أُجري بمفتاح المالك التجريبي في Chrome:** التحقق 200 وقراءة 60 مودلًا (46 منها متوافق)، وتحليل واحد بعد موافقة بنقرة حقيقية 200 بدليل حرفي مثبت: §6 | محاكاة ✓ · حقيقي ✓ (Chrome وحده، مفتاح مجاني) |
| (٦) لا أسعار ولا تكلفة؛ لا تغيير في شيفرة الأقسام؛ انحدار Anthropic أخضر | `static.test.ts` (`AD-31` يمر على الوصف والمحوّل)؛ الفرق لا يمس `src/modules/d/**`؛ [`regression/`](regression/) | ✓ |
| (٦) الترحيب و«لماذا المفتاح؟» يذكرون Google Gemini بعد دمجه | `ui.test.tsx`: النص يُبنى من السجل فيذكر «Google Gemini» ومضيفه وسياسته عند وجوده في السجل. (`PRIVACY.md`: `MJ26`) | ✓ |
| حجب الأمان يُعرض سببًا لا تحليلًا ولا يُعاد | `gemini.test.ts` (`promptFeedback.blockReason` و`finishReason` الأمني ولو حمل نصًّا مقطوعًا، وانتهاء بلا نص، و`MAX_TOKENS` قبل أي نص)؛ الأربعة (نص «حجبت Google … SAFETY»، لا نتيجة، طلب واحد) | ✓ محاكاة |

## 4. الفحوص بحسب الأثر

| الفحص | النتيجة | الملف |
| :--- | :--- | :--- |
| `tsc --noEmit` | بلا أخطاء | [`typecheck.txt`](typecheck.txt) |
| `vitest run` كاملًا | 173 ملفًا، 2641 اجتازت (و2 تخطّاهما التصميم) | [`vitest-full.txt`](vitest-full.txt) |
| المرحلة وحدها | 13 ملفًا، 186 اجتازت (منها `gemini.test.ts` 33 و`gemini-privacy.test.tsx` 4) | [`vitest-stage.txt`](vitest-stage.txt) |
| محاكاة Gemini في المتصفحات الأربعة (`TEST-AI-08`، جزء `TEST-PRIV-05`) | Chrome 24/24 · Edge 24/24 · Brave 24/24 · Firefox 24/24 — **96/96، محاكاة** | [`browser-gemini-check.txt`](browser-gemini-check.txt) و[`.json`](browser-gemini-check.json) |
| عزل المحوّلات والأسرار في الحزم (مع ضابط إيجابي) | 0 مخالفات | [`provider-isolation.txt`](provider-isolation.txt) |
| التدقيق الساكن / الديناميكي (Chrome) | 0 مخالفات | [`static/`](static/) و[`dynamic/`](dynamic/) |
| `load-check` (الأربعة) | نجح، بلا أخطاء مانيفست ولا تشغيل | [`load-check.txt`](load-check.txt) |
| `web-ext lint` | 0 أخطاء و0 تحذيرات | [`web-ext-lint.txt`](web-ext-lint.txt) |
| انحدار Anthropic: `provider-check` (الأربعة) | 100/100 | [`regression/provider-check.txt`](regression/provider-check.txt) |
| انحدار سجل الاتصالات | 124/124 (الأربعة) | [`regression/connections-check.txt`](regression/connections-check.txt) |
| انحدار «نسخ البرومبت» بلا مفتاح (`TEST-AI-10`) | Chromium 87/87 · Firefox 28/28 | [`regression/`](regression/) |

الاتصال الحقيقي: Chrome وحده (§6)؛ وFirefox والبقية بالمحاكاة. لم يُشغَّل: نافذة موافقة Firefox الأصلية بلا قبول آلي لمضيف Gemini (`evidence/T-11.10/firefox-native-consent` على Anthropic)؛ الآلية واحدة لا تتعلق بالمزوّد (طلب `permissions.request` للمضيف و`websiteContent` معًا) وقد قيس في الاختبار الآلي أن نقرة الحفظ تمنح الاثنتين لـGemini، لكن النافذة الأصلية نفسها بمضيف Gemini لم تُعرض. وهي من بوابة الموجة L اليدوية.

## 5. ما وُجد ويراه منسّق الدمج

1. **تسمية «401» ثابتة في شيفرة القسم:** `PROVIDER_FAILURE.unauthorized` في [`controller.tsx`](../../src/modules/d/analysis/controller.tsx) يكتب «(401)»، وGoogle تردّ 400 بسبب `API_KEY_INVALID`. لم يُعدَّل لأنه خارج النطاق (شيفرة الأقسام، `MJ23`)؛ والمحوّل يلحق برسالته الرمز الفعلي («HTTP 400، API_KEY_INVALID») فيظهر الصحيح بجانب الثابت. الإصلاح المقترح: حذف الرقم من التسمية.
2. **المودل الافتراضي:** قائمة Gemini لا تعلن تاريخ إصدار ولا دورة حياة، فالافتراضي أول متوافق بترتيب المزوّد، ولا يُفضَّل مودل باسمه (`DEC-13`). ويدخل القائمةَ كل ما يعلن `generateContent` ولو كان مخرجه صورًا أو صوتًا؛ واختياره يفشل عند Google برفض مصنَّف لا بتحليل خاطئ. لم يُستنتج توافق من الاسم.
3. **`retryDelay`:** مدة `RetryInfo` من أدلة المنتديات لا الوثائق الرسمية، ولم تُقَس (لا 429 بلا مشروع حقيقي)؛ ما لم يعلنه المزوّد لا يُخمَّن (`retryAt = null`).
4. **تكرار:** دالة `send` ومساعدات الأرقام والنصوص مكررة بين محوّلَي Anthropic وGemini (ومثلها في OpenAI من `MJ24`)؛ توحيدها بعد الدمج أنسب من مسّ ملف مرحلة أخرى هنا.
5. **سياسة البيانات:** ملخص الوصف يقول ما قالته الصفحة عن الخدمات غير المدفوعة والمدفوعة معًا، لأن مِجهَر لا يعرف أيّ فئة يستعمل المستخدم؛ وتظهر في الموافقة ورابطها.
6. **صيغة المفتاح الجديدة (وُجدت بالاتصال الحقيقي):** مفتاح AI Studio التجريبي بصيغة `AQ.` + 50 حرفًا لا `AIza…`، فرفضه فحصي المحلي (وكنت قد نبّهت أن الصيغة غير معلنة في الوثائق). أُصلح: يقبل الوصف الصيغتين، وفاحص الحجب يرصدهما. ومنتديات Google تذكر أن AI Studio صار يصدر `AQ.` فقط، وأن بعض مفاتيحها ترجع 401 `ACCESS_TOKEN_TYPE_UNSUPPORTED` على REST (أدلة ثانوية لا وثيقة رسمية)؛ **وهذا المفتاح نجح من الخلفية بالترويسة** (§6). فإن ردّ مفتاح آخر بذلك فالمحوّل يصنّفه «مفتاحًا مرفوضًا» (401) ويعرض سببه.
7. **المودل الافتراضي قد يكون مما لم يعد متاحًا لمفتاحك:** أول متوافق بترتيب Google كان `gemini-2.5-flash`، فردّ 404 «no longer available to new users» رغم أن `models.list` تسرده وتعلن `generateContent`؛ والقائمة لا تعلن دورة حياة ولا وقت تقاعد (المحاولة الأولى: [`real-connection-attempt-1-default-model.json`](real-connection-attempt-1-default-model.json)). و`DEC-13` يمنع الاستنتاج من الاسم، فلم أستنتج. المحوّل يعرض رفض Google بنصه، والمستخدم يختار من القائمة (وبهذا نجح التشغيل). والقائمة فيها أيضًا مودلات صور وصوت وتضمين تعلن `generateContent` (46 من 60 بقيت بعد تصفية الطرق). **اقتراح للمالك** (يمس `DEC-13`، فلم أنفّذه): أن يدعم Gemini «الفحص الصريح» (`probe`) كالمزوّد الوهمي C، فيصير المتوافق ما ثبت بفحص يبدؤه المستخدم لا ما تعلنه القائمة وحدها.

## 6. الاتصال الحقيقي (`TEST-AI-09`) — بمفتاح المالك التجريبي

- **كيف:** [`gemini-real-check.mjs`](../../tests/modules/e/provider/gemini-real-check.mjs) على `dist/chromium` في Chrome 156.0.8078.47 بملف تعريف مؤقت؛ المفتاح من ملف خارج المستودع (`GEMINI_KEY_FILE`)، ومضيف Gemini **حقيقي** (طلبات الإضافة تمرّ بوكيل Node يعيد إرسالها كما هي إلى Google ويعيد ردها)، وصفحة GitHub عينة عامة محفوظة (مهمة Actions فاشلة في `microsoft/vscode`). مفتاح **مجاني**: شروط Google للخدمات غير المدفوعة تجيز استعمال ما يُرسل لتحسين منتجاتها؛ فلم يُرسل إلا العينة العامة.
- **النتيجة** ([`real-connection.json`](real-connection.json)، 2026-10-24): حفظ المفتاح بالواجهة ← التحقق المعلن `GET /v1beta/models?pageSize=1000` **200**، و60 مودلًا في الرد، 46 منها متوافق مع التوليد فعُرضت؛ المفتاح «سليم». الموافقة تذكر «Google Gemini · Gemini 3.5 Flash Lite عبر مفتاحك، إلى generativelanguage.googleapis.com وحده» وسياسته. ونقرة حقيقية على «إرسال للتحليل» أصدرت طلبًا واحدًا `POST …/gemini-3.5-flash-lite:generateContent` **200**، والرد فُسِّر وعُرض موسومًا «احتمال يحتاج تحققًا» بدليل **مثبت من المصدر**: اقتباس `Process completed with exit code 1.` ورد حرفيًا فيما أُرسل، وما نقص مذكور.
- **المودل:** اختاره المالك من القائمة (`GEMINI_MODEL`، مُدخل اختبار لا يدخل الشيفرة)؛ وبالافتراضي (أول القائمة) كان 404 (§5.7).
- **الأسرار:** كل طلبات المحوّل من الخلفية إلى مضيف Gemini وحده؛ لا مفتاح في عنوان ولا جسم ولا كونسول؛ ولا أخطاء تشغيل ولا مانيفست؛ وفُحص أن المفتاح لا يظهر في أي ملف من `evidence` و`src` و`tests` و`Docs` (0).
- **ما لم يُقَس:** Edge وBrave وFirefox بالمفتاح الحقيقي (قيست محاكاة)؛ و429 الحقيقي وما يعلنه من موعد؛ وحجب الأمان الحقيقي (لا عينة تثيره).

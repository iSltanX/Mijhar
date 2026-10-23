# تقرير `T-0.2`: محركات الترجمة المحلية عبر المتصفحات (`TEST-SPIKE-02`)

> تجربة جدوى تنتج معرفة لا التزامًا. القياسات في 2026-10-23، وخامها في `raw/`. إضافة القياس في `scripts/spikes/t02-ext/` تُبنى وتُحمَّل بـ`scripts/spikes/t02-engines.mjs`، وهي لا تُشحن.

## ظروف القياس

| البند | القيمة |
| :--- | :--- |
| الجهاز | Apple M4، ‏8 أنوية، ‏16 GB، ‏macOS 27.0.1 |
| المتصفحات | Chrome 156.0.8078.47 · Edge 155.0.4283.60 · Brave 156.0.8078.48 · Firefox 158.0.1؛ ملف تعريف مؤقت جديد لكل تشغيل |
| الإضافة | MV3، تحمَّل غير معبأة (Chromium: `Extensions.loadUnpacked` بواجهة؛ Firefox: تثبيت مؤقت عبر Marionette). `transformers.js` 4.3.1 و`onnxruntime-web` 1.31.0-dev داخل الإضافة، بلا شيفرة بعيدة |
| النموذج | `Xenova/opus-mt-en-ar` بالدقة `q8`. نُزِّل من huggingface.co **مرة واحدة** عبر مرآة محلية تحفظ نسخة، ثم قُدِّم منها للمتصفحات الأربعة. وFirefox ML نزّله بنفسه من huggingface.co مرتين (تشغيلان) |
| الصلاحيات الاختيارية | نافذة الاستئذان لا تُشغَّل آليًا. حالة «ممنوحة» محاكاة بنسخة تطلب المضيف إلزاميًا (Chromium)، أو بـ`ExtensionPermissions.add` من سياق chrome (Firefox) |
| المجموعة المرجعية | `fixtures/spikes/t02-reference.json`: عشرون جملة تقنية فيها 29 عنصرًا محميًا، وخمس فقرات README (167 إلى 186 حرفًا) |

## `AC-S2.1`: مصفوفة `Translator API` (`HYP-01` و`HYP-02`)

| المتصفح | الواجهة | `availability()` لـen→ar | سكربت المحتوى | وثيقة offscreen | صفحة الإضافة | الخلفية (service worker) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Chrome | `Translator` موجودة | `downloadable` في ملف تعريف جديد، ثم `available` | بلا تفاعل: **`NotAllowedError`** («Requires a user gesture when availability is "downloading" or "downloadable"»). بنقرة حقيقية: ✓ (تنزيل 7.3 ثانية بثلاثين حدث تقدم ثم ترجمة صحيحة) | قبل التنزيل: **`NotAllowedError`** (لا تفاعل ممكن فيها: `isActive=false`). بعد التنزيل: ✓ (76 ms بلا تفاعل) | ✓ (`create()` في 69 ms بعد التنزيل) | `Translator` موجودة و`availability()` تعمل؛ `create()` لم يُجرَ |
| Edge | `Translator` موجودة | **`unavailable`** في كل السياقات | `NotSupportedError` | `NotSupportedError` | `NotSupportedError` | `unavailable` |
| Brave | `Translator` موجودة | `downloadable` ثم `available` | ✓ في إعادة التشغيل (72 ms بعد التنزيل) | قبل التنزيل `NotAllowedError`، وبعده ✓ | ✓ | `downloadable` |
| Firefox | **لا واجهة** (`typeof Translator === 'undefined'`) | — | — | لا واجهة offscreen | — | — |

**تفاعل المستخدم في كل سياق:**

- يتاح بنقرة في سكربت المحتوى (`isActive=true` عند النقر)، وفي صفحة الإضافة.
- لا يتاح أبدًا في offscreen: `hasBeenActive=false` دائمًا.

ومعنى ذلك أن `create()` يحتاج نقرة المستخدم ما دامت حزمة اللغة `downloadable`. بعد تنزيلها يعمل في كل السياقات بلا تفاعل، ومنها offscreen.

**حالة متقطعة:** أول `create()` في ملف تعريف جديد أعاد `NotSupportedError` («Unable to create translator for the given source and target language») ولو كانت `availability()` تقول `available` بعده:

- Brave في تشغيل كامل: فشلت كل سياقاته، ونجحت كلها في إعادة التشغيل (`raw/engines.json` و`raw/engines-brave-rerun.json`).
- Chrome: مرة في استكشاف الصيغ (فشل التشغيل الأول ونجح الثاني بإعادة المحاولة)، ومرة في تشغيل بلا واجهة مع الإضافة لم يُحفظ خامه.

وفي الصفحة العادية نجح Chrome وBrave بالوضعين، بواجهة وبلا واجهة (`raw/translator-modes.json`). فالبديل عند `NotSupportedError` يجب ألا يفترض أن المحرك غائب نهائيًا.

**الحكم:**

- `HYP-01` **صحيحة بشرط**: `create()` تعمل في سكربت المحتوى بنقرة، وفي offscreen بعد أن تكون الحزمة منزَّلة فقط.
- `HYP-02`: **Edge لا يقدر** (`unavailable`)، و**Brave يقدر** في القياسين الأخيرين مع فشل متقطع في الأول. المانع `BLK-BROWSER-TRANSLATOR-UNSUPPORTED` يتحقق في Edge (السبب: `availability()` = `unavailable`) وFirefox (الواجهة غائبة).
- حجم حزمة لغة Chrome لا يُعلن ولم يُقَس.

## `AC-S2.2`: مسار ONNX (`HYP-03`)

**الملفات التي طلبها `transformers.js` فعلًا** (سجل المرآة، متطابق في المتصفحات الأربعة): `config.json` (1,389، مرتين)، `tokenizer_config.json` (282، مرتين)، `generation_config.json` (293)، `tokenizer.json` (6,748,848)، `onnx/encoder_model_quantized.onnx` (51,773,854)، `onnx/decoder_model_merged_quantized.onnx` (59,078,120). **المجموع الفريد 117,602,786 بايت.** ولم يُطلب `vocab.json` ولا ملفا `spm`.

**التنزيل من المضيف المعلن** (`raw/engines*.json`):
- الجلب من صفحة الإضافة إلى `huggingface.co` نجح **بلا** الصلاحية الاختيارية في الأربعة: `config.json` أعاد 200، وطلب `Range` لملف ONNX أعاد 206 بعد توجيه إلى `us.aws.cdn.hf.co`. السبب أن المضيف يتيح CORS.
- مع الصلاحية «ممنوحة» النتيجة نفسها.

إذن **الصلاحية الاختيارية ليست بوابة تقنية للتنزيل**، فالموافقة الصريحة يفرضها منطق الإضافة نفسه، ويُعلن المضيفان `huggingface.co` و`*.hf.co`.

**WebAssembly ضمن CSP الإضافة:**

- CSP الافتراضية لصفحات الإضافة **تمنع** WebAssembly في الأربعة. رسالة Chromium: «neither 'wasm-eval' nor 'unsafe-eval' is an allowed source… "script-src 'self'"»، ورسالة Firefox: «call to WebAssembly.instantiate() blocked by CSP».
- بإعلان `"content_security_policy": { "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'" }` يعمل في الأربعة.
- الصفحة غير معزولة الأصل (`crossOriginIsolated=false`)، فالتشغيل بخيط واحد.

**الزمن والذاكرة** (صفحة إضافة، النموذج من مرآة محلية، الفقرات الخمس والجمل العشرون):

| المتصفح | التحميل وإنشاء الجلسة | فقرة (~170 حرفًا): الوسيط [أدنى–أعلى] | جملة: الوسيط | قمة RSS لأكبر عملية (قبلها) | قمة RSS لشجرة المتصفح (قبلها) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Chrome | 900 ms | 420 [361–539] ms | 185 ms | 1,331 MB (299) | 2,313 MB (1,347) |
| Edge | 854 ms | 431 [363–535] ms | 187 ms | 1,387 MB (302) | 2,404 MB (1,314) |
| Brave | 784 ms | 419 [350–525] ms | 183 ms | 1,357 MB (275) | 2,350 MB (1,156) |
| Firefox | 722 ms | 859 [720–902] ms | 381 ms | 1,260 MB | 3,077 MB |

- الذاكرة عينات `ps` كل 500 ms لشجرة عمليات ملف التعريف المؤقت.
- زمن التنزيل الحقيقي من huggingface.co لا يدخل في «التحميل» لأن الملفات قُدِّمت من المرآة.
- **رمز اللغة:** بطاقة النموذج تشترط `>>id<<` في أول الجملة (هنا `>>ara<<`). لكن مجزئ `transformers.js` لا يعامله رمزًا خاصًا، فيتسرب إلى المخرجات بأشكال مثل `<>ara><` و`>aar<>`. والمخرجات بلا الرمز عربية في العينة كلها.

## `AC-S2.3`: `browser.trial.ml` في Firefox (`HYP-04`)

| البند | القياس (`raw/engines-firefox.json` و`raw/firefox-ml.json`) |
| :--- | :--- |
| الصلاحية | `browser.trial` غير موجودة قبل منح `trialML` الاختيارية، وتظهر بعده بالطرق `createEngine` و`runEngine` و`deleteCachedModels` و`onProgress` |
| التفضيلات | الافتراضي `browser.ml.enable=false` و`extensions.ml.enabled=true`، فيرفض الطلب: «Trial ML API is disabled. This API is only available when "extensions.ml.enabled" and browser.ml.enable" preferences are set to true.» وبعد `browser.ml.enable=true` يعمل |
| السياق | صفحة الإضافة: يعمل فعليًا. الخلفية: الواجهة موجودة ولم يُشغَّل فيها محرك. سكربت المحتوى: `browser.trial.ml` موجودة (`object`) ولم يُشغَّل فيها |
| مهمة الترجمة | `taskName: 'translation'` مع `Xenova/opus-mt-en-ar` من `huggingface` بدقة `q8`: **مفعّلة وتعمل**. التنزيل والإنشاء 10.6 و11.5 ثانية في تشغيلين؛ الجملة وسيطها 181 ms؛ الفقرات 266 إلى 361 ms؛ قمة RSS لأكبر عملية 983 MB والشجرة 2,939 MB |
| قيود النماذج | قيس فقط أن مستودع `Xenova` على huggingface مقبول. التفضيلات المقروءة: `browser.ml.modelHubRootUrl = https://model-hub.mozilla.org/`، و`modelCacheMaxSize = 4`، و`modelCacheTimeout = 120000`. ولا تفضيل قائمة سماح ظاهر، فقيود النماذج الأخرى **لم تُقَس** |
| محرك واحد | `createEngine` ثانٍ في الإضافة نفسها يُرفض: «Error: Engine already created» (20/20). فالترجمة المتعددة بـ`runEngine` على محرك واحد |
| نقص الذاكرة | الافتراضي `browser.ml.checkForMemory=true` و`minimumPhysicalMemory=3`. برفع الحد إلى 1024 (فوق ذاكرة الجهاز 16 GB) رفض `createEngine` فورًا (6 ms، قبل أي تنزيل): «Error: Not enough physical memory available» |

**الحكم على `HYP-04`:** صحيحة بشروط: تفضيل يغيّره المستخدم في `about:config`، وصلاحية اختيارية، ومحرك واحد في كل مرة.

## `AC-S2.4`: المدقق المرجعي المؤقت على مخرجات حقيقية

المدقق في `scripts/spikes/t02-validator.mjs`، وهو مؤقت لا ينتظر `T-4.2`:

- **التقنيع** بصيغة `⟦TYPE_INDEX⟧` للكود والمسارات والروابط والأعلام والإصدارات والإشارات والمراجع وبعض المصطلحات.
- **الفحوص الأربعة:** العدد، والهوية وعدم الفقدان، وعدم التكرار، وعدم الاختلاق.
- **تصنيف الفشل:** «فقد» للرمز الغائب كليًا، و«تحريف» للرمز الباقي بشكل آخر، و«تكرار»، و«اختلاق».

النتائج في `raw/validator.json`.

| المحرك | المتصفح | جمل اجتازت الفحوص الأربعة | جمل فيها فقد | فيها تحريف | تكرار | اختلاق | رموز سليمة من 29 (مفقودة / محرَّفة) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `Translator API` | Chrome | **0/20** | 0 | 20 | 0 | 0 | **0** (0 / 29): `⟦CODE_0⟧` ← `code_0`، `⟦PATH_0` بلا قوس |
| ONNX بلا رمز اللغة | Chrome وEdge وBrave وFirefox (متطابقة) | **0/20** | 11 | 15 | 0 | 0 | **0** (12 / 17): `⟦CODE_0⟧` ← `.CDE_0.` |
| ONNX مع `>>ara<<` | الأربعة | 0/20 | 11 | 12 | 0 | 0 | 0 (14 / 15) |
| Firefox `trial.ml` | Firefox | 0/20 | 11 | 14 | 0 | 0 | 0 (13 / 16) |

**استكشاف إضافي معلَن (خارج المعيار):** صيغ رموز بديلة على الجمل نفسها، والقيمة عدد الرموز السليمة من 29 (`raw/token-formats*.json`).

| الصيغة | `Translator API` (Chrome) | ONNX |
| :--- | :--- | :--- |
| `⟦CODE_0⟧` (صيغة الخطة) | 0 | 0 |
| `{0}` | **29** | 19 |
| `[[0]]` | **29** | 9 |
| `XQZ0` | 27 | **24** |
| `__C0__` | 24 | 0 |
| `<x0/>` | 19 | 20 |
| `#0#` | 0 | — |

لا صيغة سلمت في المحركين معًا، فصيغة الرمز تحتاج قرارًا لكل محرك. وهذه **معلومة مهمة لـ`T-4.2`** الجارية في `MJ3`: الصيغة المعرّفة في الخطة (`⟦TYPE_INDEX⟧`) تفشل في كل المحركات المقيسة، فيرفضها الفاحص دائمًا ويبقى الأصل مع تنبيه.

## `AC-S2.5`: الترخيص وشروط التنزيل (`HYP-05`)

| العنصر | ما يقوله مصدره | المصدر (مقروء في 2026-10-23) |
| :--- | :--- | :--- |
| `Xenova/opus-mt-en-ar` (أوزان ONNX المحوّلة) | **لا حقل ترخيص**: لا وسم `license:` ولا `license` في بطاقة النموذج. البطاقة تقول إنه `Helsinki-NLP/opus-mt-en-ar` بأوزان ONNX فقط (`base_model`) | `https://huggingface.co/api/models/Xenova/opus-mt-en-ar` و`README.md` في المستودع (sha `034a684…`) |
| `Helsinki-NLP/opus-mt-en-ar` (الأصل) | `license: apache-2.0` في بطاقة النموذج ووسم `license:apache-2.0` | `https://huggingface.co/api/models/Helsinki-NLP/opus-mt-en-ar` (sha `0308798…`) |
| مستودع `Helsinki-NLP/Tatoeba-Challenge` (مصدر النموذج وبياناته) | ملف `LICENSE` في جذره نصه **CC BY-NC-SA 4.0**. وقسم License في README: بيانات الاختبار والتطوير CC-BY 2.0 FR، وبيانات التدريب CC-BY-NC-SA 4.0. ولا يذكر ترخيص الأوزان نفسها | `raw.githubusercontent.com/Helsinki-NLP/Tatoeba-Challenge/master/{LICENSE,README.md}` |
| `@huggingface/transformers` 4.3.1 | Apache-2.0 (ملف `LICENSE` في الحزمة) | `package.json` في الحزمة |
| `onnxruntime-web` 1.31.0-dev.20260914 | MIT (حقل `license`، ولا ملف LICENSE داخل الحزمة) | `package.json` في الحزمة |
| حزمة لغة Chrome لـ`Translator API` | يديرها المتصفح وينزّلها بنفسه، فلا تُوزَّع مع الإضافة | سلوك مقيس |

الخام: `raw/licenses.json`.

**بنود مفتوحة (لا تُحسم هنا):**

1. غياب حقل الترخيص في مستودع التحويل `Xenova/opus-mt-en-ar`، فلا نص يمنح شروطًا لأوزان ONNX نفسها.
2. تعارض ظاهري بين Apache-2.0 في بطاقة الأصل وCC BY-NC-SA 4.0 في ملف `LICENSE` لمستودع Tatoeba-Challenge، والأخير ينص على بيانات التدريب. وأثر شرط «غير تجاري» على الأوزان غير محسوم من النصوص المقروءة.
3. الإضافة لا توزّع الأوزان في الحزمة، والتنزيل من المستخدم عند الطلب، لكن هذا لا يرفع البندين السابقين.

`HYP-05` إذن **غير مثبتة**: لا يُعتمد النموذج للتوزيع أو التنزيل المباشر قبل حسم البندين، وهذا مدخل لـ`DEC-03`.

## ما لم يُجرَ

- حجم حزمة لغة Chrome، وزمن تنزيل ONNX الحقيقي من huggingface.co داخل الإضافة: قُدِّم النموذج من المرآة حتى لا يتكرر التنزيل أربع مرات.
- `create()` في الخلفية (service worker) لـ`Translator`، وتشغيل `trial.ml` في سكربت المحتوى والخلفية.
- قيود Firefox على نماذج غير `Xenova/opus-mt-en-ar`.
- سلوك `trial.ml` مع `checkForMemory=false`: لم يُطلب المحرك حتى لا يُنزَّل النموذج مرة ثالثة.
- ذاكرة محرك `Translator API` نفسه: يعمل في عملية المتصفح الخدمية ولم تُعزل قياساته.

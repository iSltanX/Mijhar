# تقرير `T-0.5`: تجربة جدوى الطبقة المساعدة (`TEST-SPIKE-05`)

> تجربة جدوى تنتج معرفة لا التزامًا. كل ما أدناه مقيس في 2026-10-23 بين 13:20 و14:30 (UTC)، وخامه في `raw/`. وما لم يُقَس يُكتب «لم يُجرَ» بسببه ولا يُعدّ نجاحًا. لا مستودع خاص لغير المالك، ولا نشر محتوى.

## ظروف القياس

| البند | القيمة |
| :--- | :--- |
| الجهاز | Apple M4، ‏8 أنوية، ‏16 GB، ‏macOS 27.0.1 |
| المتصفحات | Chrome 156.0.8078.47 وEdge 155.0.4283.60 وBrave 156.0.8078.48 (playwright-core، بلا واجهة) وFirefox 158.0.1 (Marionette، بلا واجهة)، بملف تعريف مؤقت جديد لكل تشغيل |
| السياق المحقون | إضافة اختبار لا تُشحن (`scripts/spikes/t05-ext/`) تُحقن في صفحة GitHub عامة حية (`https://github.com/octocat/Hello-World`) بزر داخل Shadow DOM، والنقر حدث إدخال موثوق (Playwright/WebDriver) |
| المانيفست | نسختان: **`base`** بلا `clipboardWrite` (كالمنتج: `storage` و`host_permissions` لـ`github.com` و`api.anthropic.com`)، و**`clipboardWrite`** للمقارنة |
| حافظة النظام | داخلية في المتصفح بلا واجهة: عدّاد `NSPasteboard.changeCount` بقي 216 قبل كل تشغيل وبعده، وسؤال «نعم/لا» عن بادئة التجربة في حافظة النظام كان «لا» بعد كل تشغيل؛ فلم تُمس حافظة المالك ولم يُقرأ محتواها |
| مزوّد التحليل | Anthropic (`DEC-09` ز-1)، المودل `claude-haiku-5-5`، `anthropic-version: 2023-06-01`. بلا مفتاح: طلبات بمفتاح غير صالح عمدًا ونص «ping» وحده؛ وبمفتاح تجريبي أتاحه المالك في ملف خارج المستودع لم يُطبع ولم يُكتب في أي دليل (فُحص آليًا: 0 ظهور) |
| GitHub | مستودع خاص تجريبي يملكه المالك أُنشئ بإذنه لهذه التجربة (`iSltanX/mijhar-t05-spike`، فيه PR وتشغيل Actions)، ورمزان دقيقا الحبيبات في ملفين خارج المستودع: «أدنى» (Metadata وحدها) و«قراءة» (Actions وCommit statuses وContents وIssues وPull requests، قراءة فقط)؛ لا يُطبعان ولا يُكتبان (0 ظهور) |
| السكربتات | `scripts/spikes/t05-browser.mjs` (والإضافتان `t05-ext/` و`t05-reader/`)، `t05-github.mjs`، `t05-cost.mjs` |

## `AC-S5.1` (`HYP-18`): الكتابة إلى الحافظة من سياق محقون في صفحة GitHub

الخام: `raw/browser.json`. ✓ = نُجح والتُقط النص نفسه من حافظة المتصفح (قارئ مستقل بإضافة ثانية بصلاحية `clipboardRead`، فلا تمس صلاحياته السياقَ المقيس).

**بمانيفست المنتج (`base`، بلا `clipboardWrite`):**

| الحالة | Chrome | Edge | Brave | Firefox |
| :--- | :---: | :---: | :---: | :---: |
| `writeText` بنقر مستخدم على زر في جذر الظل | ✓ | ✓ | ✓ | ✓ |
| `writeText` بلا نقر (عند التحميل) | ✗ `NotAllowedError: Write permission denied.` | ✗ مثله | ✗ مثله | ✗ `NotAllowedError: Clipboard write was blocked due to lack of user activation.` |
| `writeText` بعد 6 ثوانٍ من النقر (انقضاء التفعيل العابر) | ✗ مثل «بلا نقر» | ✗ | ✗ | ✗ |
| `execCommand('copy')` بنقر، حقل مؤقت في الصفحة | ✓ | ✓ | ✓ | ✓ |
| `execCommand('copy')` بنقر، حقل داخل جذر الظل (لا يمس DOM الصفحة) | ✓ | ✓ | ✓ | ✓ |
| تبويب غير أمامي ونقر فعلي عليه | ✓ (`hasFocus` = true) | ✓ (true) | ✓ (true) | ✓ (`hasFocus` = **false**) |
| من الخلفية | ✗ لا `navigator.clipboard` في service worker | ✗ | ✗ | ✗ صفحة الخلفية: `lack of user activation` |
| من صفحة الإضافة بنقر | ✓ | ✓ | ✓ | ✓ |

**بإضافة `clipboardWrite`:** تنجح الكتابة بلا نقر وبعد انقضاء التفعيل في الأربعة (من سكربت المحتوى أيضًا)، وفي Firefox من صفحة الخلفية أيضًا؛ وتبقى خلفية Chromium بلا واجهة حافظة.

**ما يلزم:** فعل مستخدم حديث (نحو 5 ثوانٍ) وحده؛ لا صلاحية في المانيفست ولا نافذة إذن. و`Permissions-Policy` لصفحة GitHub لم تُرسل (الترويسة غائبة). **البديل اليدوي العامل عند الفشل:** `execCommand('copy')` من حقل داخل جذر الظل بنقر المستخدم نفسه (نجح في الأربعة)، أو النسخ من صفحة الإضافة/اللوحة. **الحكم على `HYP-18`: صحيحة بشرط النقر** (والكتابة بعد عمل غير متزامن طويل تفشل: يُجهَّز النص قبل النقر أو يُنسخ في معالج النقر نفسه).

**لم يُقَس فعليًا:** نافذة متصفح غير مركَّزة في عائلة Chromium: المتصفح بلا واجهة يعدّ الصفحة مركَّزة (`hasFocus` = true) حتى في تبويب خلفي وبعد تعطيل محاكاة التركيز عبر CDP؛ وقياسه بنافذة مرئية يمس حافظة النظام فلم يُجرَ. (وفي Firefox نجحت الكتابة و`hasFocus` = false.)

## `AC-S5.2` (`HYP-17`): مسار طلب مزوّد التحليل من سياق الإضافة

الخام: `raw/browser.json` (بمفتاح غير صالح) و`raw/browser-provider-key.json` (بمفتاح المالك التجريبي). النتائج متطابقة في المتصفحات الأربعة إلا ما ذُكر.

| السياق | بلا `anthropic-dangerous-direct-browser-access` | معها |
| :--- | :--- | :--- |
| **الخلفية** (service worker / صفحة الخلفية)، بصلاحية مضيف `api.anthropic.com` | يصل الطلب (`type: basic`، لا CORS)، لكن الخادم يرفض بمفتاح صالح: **401** `authentication_error` «CORS requests must set 'anthropic-dangerous-direct-browser-access' header» (يرسل المتصفح ترويسة `Origin` للإضافة) | **200**، والرد يُقرأ؛ `access-control-allow-origin: *` |
| **صفحة الإضافة** | مثل الخلفية: 401 بالرسالة نفسها | **200** |
| **سكربت المحتوى** (أصل `github.com`) | Chromium: `TypeError: Failed to fetch` (فشل الطلب التمهيدي لـCORS). Firefox: `NetworkError` | Chromium: يصل الطلب ويُقرأ الرد (`type: cors`، 401 بمفتاح غير صالح). Firefox: `NetworkError` |

- **الترويسات التي لزمت:** `x-api-key` و`anthropic-version` و`content-type: application/json` و**`anthropic-dangerous-direct-browser-access: true`**. لا وسيط خارجي.
- **البث** (`stream: true`) من الخلفية: 200 و`text/event-stream`، والأحداث `message_start` و`content_block_*` و`message_delta` و`message_stop` و`ping` تُقرأ تدريجيًا عبر `ReadableStream`؛ أول جزء بعد 0.8–1.6 ثانية.
- **قائمة المودلات** `GET /v1/models` بالمفتاح: 200 و14 مودلًا (منها `claude-haiku-5-5` و`claude-sonnet-5-5` و`claude-opus-5-5` و`claude-fable-5-1`)؛ تُقرأ وقت التشغيل كما يشترط `DEC-09`.
- **ترويسات الحد:** `anthropic-ratelimit-requests-limit` و`anthropic-ratelimit-input-tokens-remaining` حاضرة في ردود الرسائل.
- **الحكم على `HYP-17`: صحيحة** من الخلفية وصفحة الإضافة، بشرط ترويسة الوصول المباشر؛ ولا يلزم وسيط فلا ينطبق `BLK-PROVIDER-DIRECT-ACCESS`. وسكربت المحتوى ليس مسارًا: يفشل في Firefox، ولا يصله سرّ في الخطة أصلًا.

## `AC-S5.4`: تقدير التكلفة قبل الإرسال (`HYP-19`)

الخام: `raw/cost.json`. الأسعار من `raw/pricing.md` (المصدر `platform.claude.com/docs/en/about-claude/pricing`، قُرئ 2026-10-23؛ Haiku 5.5 حتى 100,000 رمز: 0.10 إدخال و0.50 إخراج للمليون).

| الحمولة | عدّ الرموز قبل الإرسال | `usage.input_tokens` المعلن | الفرق | الإخراج الفعلي (حدّه `max_tokens` = 64) | التقدير (إدخال بالعدّ + حدّ الإخراج) | الفعلي |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| «ping» | 10 | 10 | 0 | 13 | 0.000033$ | 0.0000075$ |
| نص عربي مختلط (6,000 حرف من تقرير) | 3,712 | 3,712 | 0 | 64 | 0.0004032$ | 0.0004032$ |
| السجل المرجعي (500 سطر) | 28,923 | 28,923 | 0 | 64 | 0.0029243$ | 0.0029243$ |

- نقطة العدّ `POST /v1/messages/count_tokens` متاحة من سياق الإضافة (200 في الأربعة، والعدّ 10 = `usage`)، **ومجانية** بحد مستقل بحسب التوثيق، الذي يصفها بأنها «تقدير» قد يختلف قليلًا؛ وفي القياس لم يختلف.
- **الحكم على `HYP-19`: صحيحة للإدخال** (فرق صفر)، **والإخراج لا يُعرف قبل التوليد** فيُعرض بحدّ أعلى من `max_tokens` معلنًا. وسعر Haiku 5.5 متدرج بحجم البرومبت (100,000 رمز)، فيُختار السعر بعد العدّ. ولا يُثبَّت سعر في الشيفرة: المصدر وتاريخه يُعرضان.

## `AC-S5.3` (`HYP-09`): أقل صلاحيات رمز GitHub دقيق الحبيبات (قراءةً فقط)

الخام: `raw/github.json`. الرمز «الأدنى» لم يُربط بالمستودع التجريبي (أعاد 404 حتى لنقطة المستودع نفسه)، فلا يُعدّ رفضه دليلًا على نقص صلاحية. والدليل على الصلاحية الدنيا لكل نقطة: ترويسة **`x-accepted-github-permissions`** التي يعيدها GitHub في كل استجابة لرمز دقيق الحبيبات، مع قبول الطلب برمز القراءة.

| نقطة النهاية (المستودع الخاص) | بلا مصادقة | برمز القراءة | `x-accepted-github-permissions` | ما في التوثيق |
| :--- | :---: | :---: | :--- | :--- |
| `GET /repos/{o}/{r}` | 404 | **200** | `metadata=read` | Metadata |
| `GET …/pulls/{n}` | 404 | **200** | `pull_requests=read; contents=read` (أيهما يكفي) | Pull requests |
| `GET …/commits/{sha}/check-runs` | 404 | **403** «Resource not accessible by personal access token» | `checks=read` | **لا صلاحية Checks للرموز دقيقة الحبيبات** (صفحة «Permissions required for fine-grained personal access tokens» لا تذكر Checks ولا نقاط check-runs) |
| `GET …/check-runs/{id}/annotations` | 404 | **403** بالرسالة نفسها | `checks=read` | كذلك |
| `GET …/commits/{sha}/status` | 404 | **200** | `statuses=read` | Commit statuses |
| `GET …/branches/{base}` | 404 | **200** | `contents=read` | Contents |
| `GET …/contents/README.md` | 404 | **200** | `contents=read` | Contents |
| `GET …/compare/{base}...{head}` | 404 | **200** | `contents=read` | Contents |
| `GET …/actions/jobs/{job}` | 404 | **200** | `actions=read` | Actions |
| `GET …/actions/jobs/{job}/logs` | 404 | **302** إلى رابط موقّع | `actions=read` | Actions |
| `GET …/actions/runs/{run}/logs` | 404 | **302** إلى رابط موقّع | `actions=read` | Actions |
| `GET /search/issues?q=repo:{o}/{r} is:pr` | 422 «Validation Failed» | **200** | `allows_permissionless_access=true` | بحسب نوع النتائج |

**الحكم على `HYP-09`: صحيحة جزئيًا.** القائمة المرشحة للقراءة (Metadata وContents وPull requests وCommit statuses وActions وIssues) تكفي لكل النقاط **إلا check-runs وannotations**: تطلبان `checks=read` ولا تتاح هذه الصلاحية للرموز دقيقة الحبيبات أصلًا. فبحسب `BLK-TOKEN-SCOPE` تُستبعدان من مسار الرمز في `T-5.5`، وتبقى للمستودعات الخاصة: مهام Actions وخطواتها (`actions/runs?head_sha=` و`runs/{id}/jobs`، Actions: read) وcommit status؛ أما فحوص التطبيقات الأخرى (غير Actions) في مستودع خاص فلا تُقرأ بالرمز، وتُعلَن غير متاحة. (وللمستودعات العامة تبقى check-runs متاحة بلا مصادقة كما في T-0.3.)

### جدول الإشارات

| الإشارة | رمز الاستجابة | الجسم | الترويسات | مقيس |
| :--- | :---: | :--- | :--- | :--- |
| رمز غير صالح أو ملغى (صيغة صحيحة ومحتوى مختلَق) | 401 | `Bad credentials` | **لا** ترويسات `x-ratelimit-*` | نعم، ولو على مستودع عام: لا رجوع صامت إلى الوصول المجهول |
| نقص صلاحية لنقطة بعينها | 403 | `Resource not accessible by personal access token` ورابط توثيق النقطة | `x-accepted-github-permissions: checks=read` | نعم |
| الرمز لا يشمل المستودع، أو مستودع خاص بلا مصادقة، أو غير موجود | 404 | `Not Found` | `x-accepted-github-permissions` (لا تميّز الحالات الثلاث) | نعم |
| بحث في مستودع لا يُرى | 422 | `Validation Failed` | — | نعم |
| موعد انتهاء الرمز | — | — | **`github-authentication-token-expiration: 2026-10-30 14:25:10 UTC`** في كل استجابة موثَّقة: يُنبَّه منه قبل الانتهاء | نعم |
| رمز منتهٍ فعلًا | — | — | — | **لم يُجرَ**: الرمزان المُنشآن ينتهيان في 2026-10-30؛ والتوثيق ينص على 401 |
| تجاوز الحد الموثَّق | — | — | — | **لم يُجرَ**: لم يُستنفد 5000؛ وللعام قاس T-0.3: 403 و`x-ratelimit-remaining: 0` بلا `retry-after` |

## `AC-S5.4`: حدود الطلبات والسجل الخام بمصادقة

| | المورد core | البحث | الوقت |
| :--- | :--- | :--- | :--- |
| بلا مصادقة (`/rate_limit`، لا يُحتسب) | 60 في الساعة | 10 في الدقيقة | 2026-10-23T14:06Z، `x-ratelimit-reset` = 1792767982 |
| برمز دقيق الحبيبات | **5000** في الساعة | **30** في الدقيقة | 2026-10-23T14:25Z، `x-ratelimit-reset` = 1792768532 |

**السجل الخام بمصادقة:** التخويل مقيس: `actions/jobs/{job}/logs` برمز Actions: read يعيد **302** إلى `productionresultssa8.blob.core.windows.net` برابط موقّع صلاحيته **605 ثوانٍ** (من `st`/`se`؛ مطابق لعشر دقائق T-0.3)، و`actions/runs/{run}/logs` يعيد 302 إلى `results-receiver.actions.githubusercontent.com`؛ وبلا وصول 404. **أما نص السجل فلم يُقرأ**: تتبّع الرابط أعاد `BlobNotFound`، لأن مهام المستودع التجريبي لم تبدأ أصلًا (أعلن GitHub في تنبيه المهمة أنها لم تبدأ لقيد فوترة Actions على الحساب للمستودعات الخاصة؛ وأُعيد التشغيل فتكرر). ولم يُجعل المستودع عامًا لتجاوز ذلك لأن التجربة لا تنشر محتوى. فـ«قراءة نص السجل الخام بالرمز» **لم يُجرَ** بسببه، والمسار المقيس هو التخويل والتوجيه ومدة الرابط.

## `HYP-07`: مستوى وصول التخزين (`setAccessLevel`)

| | Chrome / Edge / Brave | Firefox 158.0.1 |
| :--- | :--- | :--- |
| `storage.local.setAccessLevel` | دالة | **غير موجودة** (`undefined`) |
| `storage.session.setAccessLevel` | دالة | **غير موجودة** |
| سكربت المحتوى يقرأ `local` افتراضًا | نعم | نعم |
| سكربت المحتوى يقرأ `session` افتراضًا | لا («Access to storage is not allowed from this context.») | لا: `storage.session` غير معرّفة في سكربت المحتوى |
| بعد `TRUSTED_CONTEXTS` للمنطقتين | `local` و`session` مرفوضتان | (لا ضبط) `local` مقروءة |
| بعد `TRUSTED_AND_UNTRUSTED_CONTEXTS` | المنطقتان مقروءتان | — |

**الحكم على `HYP-07`: خاطئة.** في Firefox لا يمكن حجب `storage.local` عن سكربتات المحتوى، فيتحقق مسار `ifFalse`: خيار حفظ السرّ على القرص (د-2 في `DEC-04` وح-2 في `DEC-10`) يُعطَّل في Firefox، ويبقى فيه ذاكرة الجلسة وحدها؛ و`storage.session` في Firefox لا تصلها سكربتات المحتوى أصلًا (مقيس)، فهي مناسبة للجلسة. وفي عائلة Chromium يعمل الضبط كما تصفه وثيقة Chrome.

## ما يُسلَّم للمهام التي تفتحها التجربة

| المهمة | ما تبني عليه |
| :--- | :--- |
| `T-5.5` (رمز GitHub) | الطلبات من الخلفية بـ`Authorization: Bearer`؛ قائمة الإدخال المعلنة: Metadata وContents وPull requests وCommit statuses وActions وIssues (قراءة)، **بلا Checks** (غير متاحة)؛ check-runs وannotations للمستودعات الخاصة خارج مسار الرمز؛ تنبيه الانتهاء من `github-authentication-token-expiration`؛ وفي Firefox ذاكرة الجلسة وحدها |
| `T-11.1` (سجل الاتصالات والمفاتيح) | `setAccessLevel(TRUSTED_CONTEXTS)` في عائلة Chromium؛ وفي Firefox `storage.session` وحدها (لا قرص) |
| `T-11.3` (زر نسخ البرومبت) | `writeText` في معالج النقر نفسه من الزر المحقون، بلا صلاحية `clipboardWrite`؛ والبديل عند الفشل `execCommand('copy')` من حقل في جذر الظل، ثم النسخ من اللوحة؛ ولا «تم النسخ» إلا بعد نجاح الوعد |
| `T-11.5` (دقة الحالة الموثَّقة) | جدول الإشارات أعلاه: 401 و403 بـ`x-accepted-github-permissions` و404 الملتبس و`x-ratelimit-*`؛ وغياب Checks يُعلَن «غير متاح بالرمز» لا نجاحًا |
| `T-11.6` (المزوّد) | الطلب من الخلفية (أو صفحة الإضافة) بترويسة `anthropic-dangerous-direct-browser-access: true`؛ البث يعمل؛ `count_tokens` قبل الإرسال والمودلات من `/v1/models` وقت التشغيل؛ والتكلفة: إدخال دقيق + حدّ أعلى للإخراج |

## ما لم يُجرَ

- نافذة غير مركَّزة في عائلة Chromium (المتصفح بلا واجهة لا يُحدث عدم التركيز مع نقر فعلي؛ والنافذة المرئية تمس حافظة النظام).
- نص السجل الخام بالرمز (لم تبدأ مهام المستودع التجريبي لقيد فوترة Actions على حساب المالك)؛ وقيس التخويل والتوجيه ومدة الرابط.
- رفض نقاط النهاية بالرمز «الأدنى» (Metadata وحدها): لم يُربط بالمستودع فأعاد 404 للجميع؛ والدليل على الصلاحية الدنيا ترويسة `x-accepted-github-permissions` مع القبول برمز القراءة.
- رمز منتهٍ فعلًا، وتجاوز الحد الموثَّق (5000).

## كيف يُعاد

```bash
node scripts/spikes/t05-browser.mjs chrome edge brave firefox --out evidence/T-0.5/raw/browser.json
T05_PROVIDER_KEY_FILE=<ملف المفتاح> node scripts/spikes/t05-browser.mjs chrome edge brave firefox --variants base --out evidence/T-0.5/raw/browser-provider-key.json
T05_PROVIDER_KEY_FILE=<ملف المفتاح> node scripts/spikes/t05-cost.mjs --out evidence/T-0.5/raw/cost.json
T05_REPO=<owner/repo> T05_TOKEN_FILE_MIN=<ملف> T05_TOKEN_FILE_READ=<ملف> node scripts/spikes/t05-github.mjs --out evidence/T-0.5/raw/github.json
```

**بعد التجربة (للمالك):** أبطِل الرمزين `mijhar-t05-min` و`mijhar-t05-read` ومفتاح `mijhar-t05`، واحذف المستودع `iSltanX/mijhar-t05-spike` والمجلد `~/mijhar-t05`.

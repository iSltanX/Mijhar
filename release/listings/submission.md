# مواد التقديم إلى المتاجر

> إجابات نماذج التقديم في Chrome Web Store وMicrosoft Edge Add-ons (Partner Center) وFirefox Add-ons (AMO) للإصدار 1.0.2 (إعادة إصدار لـ1.0.1 بالمحتوى نفسه، لأن Firefox Add-ons لا يقبل رقمًا محذوفًا؛ وكانت للإصدار 1.0.0 كما هي: لا تغيير في الصلاحيات ولا في البيانات ولا في الميزات المعلنة، والفرق في [`CHANGELOG.md`](../../CHANGELOG.md))، مطابقة للحزم المبنية في `MJ26` (2026-10-25) ولمتطلبات المتاجر الرسمية كما قُرئت في التاريخ نفسه، وتُراجع مع نموذج كل متجر وقت التقديم. لا يُرفع شيء ولا يُقدَّم إلا بأمر المالك.
>
> العلامات: **[قرار]** ينتظر المالك، و`⟨…⟩` قيمة لا تُملأ إلا بعد وجودها فعلًا.

## الاسم في المتاجر: من أين يأتي وكيف يتغير

العنوان «مِجهَر - مساعدك على GitHub» والوصف القصير في [`store-listing.ar.md`](store-listing.ar.md#الاسم). ومصدرهما الواحد حقلا `name` و`description` في `src/manifest/chromium.json` و`src/manifest/firefox.json` (لا ملفات ترجمة في المشروع)، ويكتبهما `src/manifest/generate.mjs` في `dist/*/manifest.json` كما هما، ويحرسهما `tests/build/build.test.ts`. قُرئ التوثيق الرسمي في 2026-10-25:

| المتجر | من أين يأتي العنوان | كيف يتغير | الحد |
| :--- | :--- | :--- | :--- |
| Chrome Web Store | حقل `name` في المانيفست: يظهر في المتجر ونافذة التثبيت و`chrome://extensions`. والوصف القصير من `description` | لا تُعدَّل بيانات المانيفست في لوحة المطوّر بعد الرفع: تُعدَّل في المانيفست وتُرفع حزمة بنسخة أعلى | `name` حتى 75، و`description` حتى 132، و`short_name` يُستحسن حتى 12 |
| Microsoft Edge Add-ons | حقلا `name` و`description` يملآن «Extension name» و«Short description» في Partner Center، وهما للقراءة فقط هناك | تحديث المانيفست ثم رفع حزمة جديدة (بنسخة أعلى إن كانت تحديثًا) | 45 للاسم بحسب MDN |
| Firefox Add-ons (AMO) | الاسم من المانيفست يعرّف الإضافة في Firefox وفي AMO، وحقل «Name» في خطوة «Describe Add-on» عند التقديم، ويُشتق منه رابط الصفحة (slug) | يُراجَع حقل الاسم في صفحة القائمة في Developer Hub؛ ولم أجد في التوثيق الرسمي هل تحدّثه نسخة جديدة آليًا، فيُتحقق منه بعد الرفع | 45، والملخص حتى 250 |

- **عنوان زر الإضافة** (`action.default_title`، وفي Firefox `sidebar_action.default_title`) منفصل عن عنوان المتجر، ويبقى «مِجهَر». و`short_name` «مِجهَر» حيث يضيق المكان.
- **ما يلزم لاحقًا:** لم تُرفع الإضافة إلى أي متجر، فيأخذ أول رفع للحزم الجديدة (1.0.0) العنوان الجديد مباشرة دون رفع نسخة. ولا يتغير عنوان منشور بتعديل الملفات محليًا. وبعد القبول: التحقق أن صفحة كل متجر تعرض العنوان الجديد، ومراجعة حقل الاسم في AMO.
- **المراجع:** [Chrome: manifest name](https://developer.chrome.com/docs/extensions/reference/manifest/name) · [Chrome: short_name](https://developer.chrome.com/docs/extensions/reference/manifest/short-name) · [Chrome: description](https://developer.chrome.com/docs/extensions/reference/manifest/description) · [Chrome: Prepare your extension](https://developer.chrome.com/docs/webstore/prepare) · [Chrome: Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing) · [Edge: Publish an extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension) · [MDN: manifest name](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/name) · [MDN: short_name](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/short_name) · [AMO: Submitting an add-on](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) · [AMO: Create an appealing listing](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/)

## بطاقة المستودع على GitHub

نسخة مرجعية من وصف المستودع `iSltanX/Mijhar` وموضوعاته كما طُبّقت على GitHub في 2026-10-25 بأمر المالك (`gh repo edit`). الوصف يظهر تحت اسم المستودع في بطاقته وقائمة المستودعات، وهو غير مقدمة README. ولا تكتبه ولا تفرغه أي أداة في المستودع (لا سكربت ولا سير عمل يستدعي `gh repo edit` أو واجهة الموضوعات)؛ فإن تغيّر فبيد من يملك صلاحية المستودع، ويُعاد من هنا. والمستودع عام منذ 2026-10-26 (`AD-42`)، فيظهران لكل زائر، وتجعل الموضوعات المستودع قابلًا للاكتشاف في البحث.

```text
إضافة متصفح تجعل GitHub أوضح بالعربية: تصحّح اتجاه النص، وتشرح الواجهة في مكانها، وتلخّص حالة طلب الدمج وسبب فشل الفحوص.
```

الموضوعات (10): `browser-extension` · `chrome-extension` · `firefox-addon` · `manifest-v3` · `github` · `github-actions` · `pull-requests` · `code-review` · `arabic` · `rtl`. أحرف لاتينية صغيرة وأرقام وشرطات، حتى 50 حرفًا لكل موضوع وحتى 20 موضوعًا ([Classifying your repository with topics](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics)). وكلها لميزة منفَّذة: الإضافة بصيغة Manifest V3 لعائلة Chromium وFirefox، وتقرأ سجل Actions، وتلخّص طلبات الدمج وتساعد في مراجعة تغييراتها، وتعالج اتجاه العربية.

## الغرض الواحد

لـChrome وEdge:

```text
يساعد من يعمل على GitHub بالعربية على قراءة صفحات github.com وفهمها والعمل عليها: يضبط اتجاه النص العربي ويعزل الكود داخله، ويشرح الواجهة في مكانها، ويلخّص حالة طلبات الدمج والفحوص من الصفحة نفسها.
```

## مبررات الأذونات

من `src/manifest/chromium.json` و`src/manifest/firefox.json`:

| الإذن | المتصفح | المبرر |
| :--- | :--- | :--- |
| `storage` | الكل | حفظ الإعدادات والملاحظات وروابط «أكمل لاحقًا» في تخزين الإضافة على الجهاز، وحفظ رمز GitHub ومفتاح مزوّد التحليل الاختياريين في ذاكرة الجلسة افتراضًا. لا يُرسل شيء منها إلى المطوّر. |
| `sidePanel` | Chrome وEdge | عرض لوحة مِجهَر جانبيًا بجوار صفحة GitHub. وفي Firefox يقوم بذلك `sidebar_action`. |
| `https://github.com/*` (أساسي) | الكل | سكربت المحتوى الذي يضبط الاتجاه ويعرض الشرح والبطاقات على صفحات github.com وحدها. ويطلب من github.com نفسه جزء الفحوص الذي تطلبه صفحة طلب الدمج لعرضها، وسجل الخطوة بنقر المستخدم. |
| `https://api.github.com/*` (اختياري) | الكل | يُطلب بنقر المستخدم في الإعدادات. لقراءة حالة طلب الدمج وفحوصه من GitHub API، ولـ«تجهيز تعديل» برمز كتابة منفصل بعد معاينة الفرق والموافقة على النطاق. |
| `https://api.anthropic.com/*` و`https://api.openai.com/*` و`https://generativelanguage.googleapis.com/*` (اختيارية) | الكل | يُطلب مضيف المزوّد الذي يختاره المستخدم وحده، حين يحفظ مفتاحه. للتحقق من المفتاح، وجلب قائمة النماذج للمساعدة، واختبار النموذج الاختياري، والتحليل بموافقة على كل طلب. |
| `https://app-reports.isultantf.workers.dev/*` (اختياري) | الكل | خادم قناة البلاغات الخاصة. يُطلب بنقر المستخدم «أرسل البلاغ» أول مرة في «الإبلاغ عن مشكلة»، بعد أن يرى كل ما سيُرسل. ولا يُرسل إليه شيء دون ذلك. |
| `data_collection_permissions`: `required: none`، `optional: websiteContent` و`technicalAndInteraction` | Firefox | «محتوى المواقع» يُطلب مع صلاحية مضيف المزوّد لأن التحليل الاختياري يرسل محتوى من الصفحة إلى المزوّد الذي يختاره المستخدم، ولا يُرسل تحليل دونه. و«البيانات التقنية والتفاعل» تُطلب مع مضيف خادم البلاغات لأن البلاغ يحمل إصدار مِجهَر والمتصفح والنظام، ولا يُرسل بلاغ دونها. |
| `action` (زر شريط الأدوات) | الكل | يفتح لوحة مِجهَر كما يفتحها الاختصار. لا صلاحية. |
| `commands` (`Alt+G` و`Alt+K`، وفي macOS `MacCtrl+Shift+G` و`MacCtrl+Shift+K`) | الكل | فتح اللوحة، والبحث في القاموس. اختصاران نهائيان بعد فحص التعارض (`DEC-08` ح-2)، يعيد المستخدم ربطهما من صفحة اختصارات المتصفح. |
| `web_accessible_resources` (`fonts/*.woff2` لـgithub.com) | الكل | خطوط عربية مضمّنة ترسم بها واجهات مِجهَر داخل صفحات GitHub، بلا تحميل خطوط من الإنترنت. |

## الشيفرة البعيدة

لا. الإضافة بصيغة Manifest V3، وكل شيفرتها في الحزمة، ولا تحمّل شيفرة من الشبكة ولا تنفّذ نصًّا من رد المزوّد.

## إفصاح البيانات

**ما لا يحدث:** لا حساب، ولا قياس استخدام، ولا إعلانات، ولا بيع بيانات ولا نقلها لغرض آخر. ولا يصل إلى المطوّر إلا البلاغ الذي يرسله المستخدم بنفسه.

**ما يُفصح عنه** (المقترح، ويُطابَق مع فئات النموذج وقت التقديم):

| الفئة | لماذا |
| :--- | :--- |
| محتوى المواقع (<bdi>Website content</bdi>) | التحليل الاختياري يرسل محتوى من صفحة GitHub إلى مزوّد التحليل الذي يختاره المستخدم، بعد أن يراه ويوافق على كل طلب. |
| معلومات المصادقة (<bdi>Authentication information</bdi>) | رمز GitHub ومفتاح المزوّد الاختياريان يُحفظان في المتصفح، ويُرسل كل منهما إلى خدمته وحدها للمصادقة. |
| المراسلات الشخصية (<bdi>Personal communications</bdi>) | «الإبلاغ عن مشكلة»: النص الذي يكتبه المستخدم ويرسله بنفسه إلى المطوّر عبر قناة البلاغات، ومعه إصدار مِجهَر والمتصفح والنظام. يُفصَح عنه احتياطًا لأنه رسالة من المستخدم؛ ويُطابق مع تعريفات النموذج وقت التقديم. |

والإقرارات المعتادة: لا بيع لطرف ثالث، ولا استعمال لغير الغرض الواحد، ولا استعمال لتقدير الجدارة الائتمانية.

## الروابط

| الحقل | القيمة |
| :--- | :--- |
| سياسة الخصوصية | `https://bysltan.com/Mjhr/privacy`، منشورة منذ 2026-10-26 وفُحصت بـHTTP 200؛ ونصها من [`Docs/Site/privacy.md`](../../Docs/Site/privacy.md) (ومنه [`PRIVACY.md`](../../PRIVACY.md) في المستودع). **المتاجر الثلاثة تطلب رابطًا يعمل، وقد تحقق هذا الشرط.** |
| الصفحة الرئيسية | `https://bysltan.com/Mjhr`، منشورة وفُحصت بـHTTP 200 في 2026-10-26. |
| الدعم | `isultanby@gmail.com`، و«الإبلاغ عن مشكلة» داخل الإضافة (`DEC-12`: قناة `iSltanX/app-reports` الخاصة عبر خادمها، بُني في `MJ26`)، و`https://bysltan.com/Mjhr/support` (منشورة وفُحصت بـHTTP 200 في 2026-10-26). |
| المستودع | `https://github.com/iSltanX/Mijhar` عام منذ 2026-10-26 (`AD-42`) ويفتح دون تسجيل دخول. وهل يُذكر رابطه في حقل متجر قرار مستقل لم يُحسم هنا. |

## التصنيف

يُختار من قوائم المتاجر وقت التقديم. المقترح: «أدوات المطوّرين» في Chrome وEdge، و«تطوير الويب» و«دعم اللغات» في AMO.

## Firefox Add-ons وحده

- **التوافق: Firefox للحاسوب وحده** (`AD-40`). لا يُختار «Firefox for Android» في خطوة التوافق بنموذج AMO، ولا يحمل المانيفست `browser_specific_settings.gecko_android`: وجوده ولو فارغًا يعلن لـAMO توافق أندرويد، وغيابه يجعل AMO يعدّ الإضافة للحاسوب وحده ([Developing extensions for Firefox for Android](https://extensionworkshop.com/documentation/develop/developing-extensions-for-firefox-for-android/)، و[MDN: browser_specific_settings](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings)). ولم يُختبر مِجهَر على أندرويد.
- **الترخيص:** يُختار في نموذج AMO **All Rights Reserved** (`all-rights-reserved`، «ليس مفتوح المصدر») بقرار المالك (`AD-36`، 2026-10-25)، مطابقًا لملف [`LICENSE`](../../LICENSE): «© 2026 تصميم وتطوير سلطان. جميع الحقوق محفوظة.» ولا يُختار ترخيص مفتوح المصدر. وتبقى الخطوط وPreact بتراخيصها في `THIRD_PARTY_NOTICES.txt` المشحون مع الحزمة.
- **الشيفرة المصدرية:** الحزمة مجمّعة بـVite (`vite.config.ts`، بلا تصغير)، وسياسة AMO تطلب رفع المصدر حين تكون الشيفرة مولَّدة آليًا. حزمة المصدر `release/packages/firefox/mijhar-1.0.2-source.zip` (يبنيها `node scripts/package.mjs`) بلا أسرار ولا `node_modules` ولا `dist` ولا تقارير تدقيق، وفيها `SOURCE-README.txt` بهذه التعليمات للمراجع، بالإنجليزية لأن مراجعي AMO يقرؤونها؛ وبيئة AMO الافتراضية (Node 24.14 وnpm 11.9) تبنيها كما هي:

```text
Requirements: Node.js 22 or later, npm.
npm ci
npm run build
The Firefox build is written to dist/firefox (manifest.json at its root).
```

- **ملاحظة للمراجع:** الميزات الأساسية تعمل بلا حساب ولا مفتاح. والتحليل الاختياري يحتاج مفتاحًا من حساب المراجع لدى المزوّد، ولا يُرفق مفتاح من المطوّر **[قرار]** إن طلب المراجع حساب تجربة.

## Microsoft Edge وحده

- **الوصف القصير** يُقرأ من حقل `description` في المانيفست، وهو فيه حرفًا من [`store-listing.ar.md`](store-listing.ar.md#الوصف-القصير).
- **ملاحظات الاعتماد:** كملاحظة AMO أعلاه، ومعها أن الإضافة لا تعمل خارج github.com.

## ما لا يُقدَّم

لا أسعار ولا روابط أسعار ولا تكلفة (`AD-31`)، ولا رابط متجر أو مستودع لا يفتح للعموم، ولا لقطة غير حقيقية.

## إطارات Figma

الصفحة «مجهر — مواد الإصدار والمتاجر»: <https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=182-699>

| الإطار | الرابط |
| :--- | :--- |
| R-00 دليل الصفحة | <https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=188-4627> |
| A — قوالب اللقطات (R-01 إلى R-12) | <https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=182-700> |
| المكوّن `Release/Caption band` | <https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=182-704> |
| R-01 القراءة، بشريط عنوان | <https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=183-704> |
| R-07 القراءة، بلا نص | <https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=184-3022> |
| B — صورتا الترويج (R-13 وR-14) | <https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=182-701> |
| C — الأيقونات (R-15) | <https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=182-702> |
| R-16 صورة README فاتحة | <https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=186-4603> |
| R-17 صورة README داكنة | <https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=186-4627> |
| R-18 README كما يعرضه GitHub | <https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=187-4617> |

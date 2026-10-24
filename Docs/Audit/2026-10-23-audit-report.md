# تقرير المراجعة المستقلة لمشروع «مِجهَر» (`Mijhar`) بعد إتمام الموجات الخمس الأولى

* **تاريخ التقرير:** `2026-10-23`
* **الفرع المراجَع (`Branch`):** `main` (متقدم بـ 78 التزامًا على `origin/main`)
* **الالتزام المراجَع (`HEAD Commit`):** `6e333faa7a063042e0d541caca810dd48fef748e` (`Merge branch 'stage/MJ12' — إتمام المرحلة MJ12`)
* **حالة شجرة العمل عند المراجعة (`Working Tree`):** نظيفة تمامًا (`git status --short` فارغ؛ لا تعديلات غير ملتزَم بها قبل إنشاء ملف التقرير هذا)

---

## 1. نطاق المراجعة وحالة المستودع

* **الوثائق والقرارات المرجعية المطبَّقة:**
  * [CLAUDE.md](../../CLAUDE.md)
  * [DECISIONS.md](../../DECISIONS.md) (`DEC-01` إلى `DEC-05`)
  * [Docs/MJ/README.md](../MJ/README.md) و[Docs/MJ/waves.json](../MJ/waves.json)
  * ملفات المراحل المنفَّذة: [MJ1.md](../MJ/stages/MJ1.md) حتى [MJ12.md](../MJ/stages/MJ12.md)
  * ملفات المواصفات التفصيلية: `phases/phase-01-core.md` حتى `phases/phase-09-module-h.md` وتقارير الأدلة في `evidence/`

### التمييز بين النطاق المنفَّذ (الموجات الخمس `A`–`E`) والنطاق المؤجَّل (`F`–`K`)

| النطاق | الموجات والمراحل | المهام المشمولة | الحالة |
| :--- | :--- | :--- | :--- |
| **منفَّذ ومشمول بالمراجعة** | **الموجة A** (`MJ1`)، **الموجة B** (`MJ2`–`MJ4`)، **الموجة C** (`MJ5`–`MJ6`)، **الموجة D** (`MJ7`–`MJ9`)، **الموجة E** (`MJ10`–`MJ12`) | **35 مهمة مدمجة**: `T-0.1`..`T-0.5`، `T-1.1`..`T-1.4`، `T-2.1`..`T-2.7`، `T-3.1`..`T-3.4`، `T-4.1`..`T-4.2`، `T-5.1`..`T-5.4`، `T-7.1`، `T-8.1`..`T-8.3`، `T-9.1`..`T-9.5` | مدمج في `main` ومفحوص في هذا التقرير |
| **مؤجَّل صراحةً لموجات لاحقة (مستبعد من قائمة العيوب)** | **الموجة F** (`MJ13`–`MJ16`)، **الموجة G** (`MJ17`–`MJ18`)، **الموجة H** (`MJ19`–`MJ20`)، **الموجة I** (`MJ21`)، **الموجة J** (`MJ22`)، **الموجة K** (`MJ23`) | **22 مهمة مجدولة لاحقًا**: الجولات التفاعلية (`T-3.5`)، قوالب المستودع وبنك العبارات (`T-7.2`، `T-7.3`)، تصدير/استيراد الملاحظات وتنبيه الجهاز المشترك (`T-8.4`)، محركات الترجمة المحلية ومدير النماذج (`T-4.3`–`T-4.5` المرهونة بـ`DEC-03`)، رمز GitHub الاختياري PAT (`T-5.5` وفق `DEC-04` د-5)، الوحدة (هـ) لبناء السياق وقوالب الأسئلة وفحص الخصوصية (`T-6.1`–`T-6.3`)، الوحدة (ي) لطبقة المساندة الذكية ومفاتيح مزوّدي AI (`T-11.1`–`T-11.9`)، والتكامل الشامل والتغليف (`T-10.1`–`T-10.2`) | مجدول رسميًا في [waves.json](../MJ/waves.json) ولم يُعدّ غيابه عيبًا |

> [!NOTE]
> بخصوص بنود التحقق المتعلقة بـ**رموز GitHub (PAT) ومفاتيح مزوّدي الذكاء الاصطناعي وبناء/نسخ مطالبات AI**: لم تُنفَّذ هذه الميزات بعد لأنها مجدولة صراحةً في المراحل `MJ15` (`T-5.5`) و`MJ16` (`T-6.1`–`T-6.3`) و`MJ17`–`MJ22` (`T-11.*`). في المقابل، جرى فحص ما نُفِّذ فعليًا في الموجات `C`–`E` من طلب صلاحية `https://api.github.com/*` الاختيارية عند الطلب (`T-1.4`، `T-5.2`، `T-9.1`، `T-9.3`، `T-9.5`) وسياسة خصوصية مقتطفات الشيفرة في الملاحظات وفق `DEC-05` (`T-8.3`).

---

## 2. العيوب المؤكدة مرتبةً حسب الأثر

---

### `MJ-AUDIT-001` — فساد استخراج `ref` و`path` في `tabsPageSource` داخل اللوحة الأصلية (`sidepanel.html`) على الفروع المحتوية على `/`، وانقطاع ربط الملاحظات السطرية بـ`AnchorController`

* **الخطورة:** عالية (`High`)
* **المواضع المتأثرة:**
  * [`tabsPageSource`](../../src/shared/page/page-source.ts#L51-L73) في `src/shared/page/page-source.ts:51-73`
  * [`pageInfoFromUrl`](../../src/shared/page/page-info.ts#L113-L126) و[`enrichFromDocument`](../../src/shared/page/page-info.ts#L168-L185) في `src/shared/page/page-info.ts:113-185`
  * [`NotesView`](../../src/modules/g/notes/view.tsx#L17-L44) في `src/modules/g/notes/view.tsx:17-44` و[`LaterView`](../../src/modules/g/bookmarks/view.tsx#L20-L38) في `src/modules/g/bookmarks/view.tsx:20-38`
  * [`relationTo`](../../src/modules/g/notes/targets.ts#L95-L110) في `src/modules/g/notes/targets.ts:95-110` و[`AnchorController`](../../src/modules/g/anchor/controller.ts#L41-L136) في `src/modules/g/anchor/controller.ts:41-136`
* **الموجات ومعايير القبول المتأثرة:** تكامل عابر للموجات `MJ2` (`T-1.2`) و`MJ4` (`T-0.4` / `AC-S4.1`) و`MJ9` (`T-8.1` / `AC-G1`) و`MJ12` (`T-8.2`، `T-8.3` / `AC-G2`، `AC-G3`).
* **السلوك المتوقع مقابل الفعلي وشروط الحدوث:**
  * **المتوقع:** عند فتح اللوحة الجانبية الأصلية (`sidepanel.html` — وهي السطح الوحيد الذي يسمح بإنشاء الملاحظات والعلامات من اللوحة لأن الدرج المحقون يعرض `NativeOnlyNotice` وفق `DEC-04`) على ملف أو مجلد في فرع يحتوي اسمه على شرطة مائلة (مثل `feat/rtl` أو `chore/v2-pnpm-monorepo`)، يجب أن تحصل اللوحة على `ref` و`path` و`refKind` الصحيحة مطابقةً لما يرصده سكربت المحتوى في الصفحة، وأن تُلتقط بصمة السطر (`AnchorRecord`) فور إنشاء ملاحظة سطرية.
  * **الفعلي:**
    1. أثبتت تجربة الجدوى [evidence/T-0.4/report.md](../../evidence/T-0.4/report.md#L19-L21) أن عناوين GitHub للفروع المحتوية على `/` (مثل `/blob/chore/v2-pnpm-monorepo/README.md#L5`) لا يمكن فصل الفرع عن المسار فيها من الرابط وحده، ولذلك يعتمد سكربت المحتوى على [`enrichFromDocument`](../../src/shared/page/page-info.ts#L168-L185) لقراءة `react-app.embeddedData` من DOM الصفحة.
    2. في اللوحة الأصلية (`sidepanel.html`)، تستعمل [`NotesView`](../../src/modules/g/notes/view.tsx#L17) و[`LaterView`](../../src/modules/g/bookmarks/view.tsx#L20) دالة [`tabsPageSource`](../../src/shared/page/page-source.ts#L51-L73) التي تستدعي `pageInfoFromUrl(tab.url, tab.title)` فقط دون أي إثراء من DOM التبويب النشط. في [`pageInfoFromUrl`](../../src/shared/page/page-info.ts#L114-L119) يُقسَّم الرابط ساذجًا باعتبار `segments[3]` هو الفرع (`ref = "chore"`) و`segments.slice(4)` هو المسار (`path = "v2-pnpm-monorepo/README.md"`) مع `refKind = "unknown"`.
    3. النتيجة: أي ملاحظة تُنشأ من `NotesWorkspace` داخل `sidepanel.html` على فرع فيه `/` تُحفظ بـ`target.ref = "chore"` و`target.path = "v2-pnpm-monorepo/README.md"`. وفي سكربت المحتوى داخل الصفحة (حيث `page.ref = "chore/v2-pnpm-monorepo"` و`page.path = "README.md"`)، تعيد [`relationTo(note, page)`](../../src/modules/g/notes/targets.ts#L101) القيمة `null` لأن `note.target.path !== page.path`؛ فلا تظهر الملاحظة في بطاقة الصفحة (`PageCard`)، ولا ترسم شارة السطر (`LineMarker`)، ولا يعثر عليها `AnchorController` أبدًا.
    4. حتى على الفروع البسيطة (مثل `main`)، لا تمرّر [`NotesView`](../../src/modules/g/notes/view.tsx#L42) معاملَي `onCreated` أو `locate` إلى `<NotesWorkspace repository={repository} pageSource={pageSource} />`، وتعتمد بدلًا من ذلك على حيلة زمنية مدتها 15 ثانية (`RECENT_MS = 15_000`) في [`AnchorController.shouldCaptureFromPage`](../../src/modules/g/anchor/controller.ts#L41)؛ ولكن إذا أنشأ المستخدم ملاحظة سطرية بينما لم تكن الصفحة في وضع `'code'` أو لم يُستدعَ `refresh()` خلال 15 ثانية، تبقى الملاحظة بلا بصمة (`unverified`) إلى الأبد. كما أن حفظ علامة بـ`QuickSave` من [`LaterView`](../../src/modules/g/bookmarks/view.tsx#L25) يستدعي `bookmarkDraftFromPage(current)` بلا `document`، فيفقد موضع التمرير (`scrollY`) واسم الفرع في صفحات PR والالتزامات.
* **الدليل:** فحص ثابت مباشر لتدفق البيانات بين `src/shared/page/page-source.ts:51-73` و`src/shared/page/page-info.ts:113-126` و`src/modules/g/notes/targets.ts:95-110` ومقارنته بنتيجة `evidence/T-0.4/report.md:20`.
* **الإصلاح المقترح واختبار الانحدار:**
  * **الإصلاح:** إضافة جسر رسائل خفيف (`tabs.sendMessage` إلى التبويب النشط، على غرار جسر `b/search/bridge.ts` و`a/reading/messages.ts`) يعيد `PageInfo` المُثرى من `documentPageSource` في سكربت المحتوى (بالإضافة إلى `scrollY` وحالة الالتقاط السطري)، مع fallback إلى `pageInfoFromUrl` عندما لا يكون التبويب صفحة GitHub نشطة فيها سكربت محتوى.
  * **اختبار الانحدار:** اختبار تكامل يفتح عنوان `/octo/demo/blob/feat/rtl/src/index.ts#L10` مع `react-app.embeddedData`، وينشئ ملاحظة سطرية من `NotesView` عبر `tabsPageSource`، ويتحقق من تطابق `note.target.ref === 'feat/rtl'` و`note.target.path === 'src/index.ts'` وظهورها في `PageCard` والتقاط بصمتها في `AnchorController`.

---

### `MJ-AUDIT-002` — عزلة `githubApiAccess` في الوحدة (ح) عن عميل الخلفية `PublicApiClient` (`MJ11`)، مما يعطّل فحص `docs/` وأعداد الوسوم في الصفحة والدرج ويتجاوز `ETag` وميزانية `RateLimitTracker`

* **الخطورة:** عالية (`High`)
* **المواضع المتأثرة:**
  * [`githubApiAccess`](../../src/modules/h/api-access.ts#L28-L58) و[`fetchApiGithub`](../../src/modules/h/api-access.ts#L63-L81) في `src/modules/h/api-access.ts:28-81`
  * [`CommunityController`](../../src/modules/h/module.tsx#L66-L143) في `src/modules/h/module.tsx:66-143`
  * [`DocsScanControl`](../../src/modules/h/readme-detector/ReadmeBanner.tsx#L36-L78) في `src/modules/h/readme-detector/ReadmeBanner.tsx:36-78` و[`ReadmePanelView`](../../src/modules/h/readme-detector/ReadmePanelView.tsx#L41-L51) في `src/modules/h/readme-detector/ReadmePanelView.tsx:41-51`
  * [`GuideView`](../../src/modules/h/first-contribution/GuideView.tsx#L215-L246) في `src/modules/h/first-contribution/GuideView.tsx:215-246`
  * [`isPublicPath`](../../src/core/api/client.ts#L57-L58) في `src/core/api/client.ts:57-58`
* **الموجات ومعايير القبول المتأثرة:** تكامل عابر للموجات `MJ5` (`T-1.4`) و`MJ9` (`T-9.1` / `AC-H1`، `T-9.3` / `AC-H3`) و`MJ11` (`T-5.2` / `AC-D5`).
* **السلوك المتوقع مقابل الفعلي وشروط الحدوث:**
  * **المتوقع:** عندما يمنح المستخدم صلاحية `https://api.github.com/*` الاختيارية من الإعدادات، يجب أن يعمل زر «فحص مجلد `docs/` عند الطلب» في شريط الصفحة (`ReadmeBanner`) وفي الدرج (`ReadmePanelView`) وزر «اعرض عدد كل وسم» في دليل أول مساهمة (`GuideView`)، وأن تمر جميع طلبات `api.github.com` عبر عميل الخلفية الموحّد `PublicApiClient` للاستفادة من التخزين الشرطي (`ETag` / `304`) وتتبع ميزانية الطلبات (`RateLimitTracker`).
  * **الفعلي:**
    1. كُتبت [`githubApiAccess`](../../src/modules/h/api-access.ts#L28-L31) في `MJ9` قبل بناء `PublicApiClient` في `MJ11`، وهي تفحص `if (!api?.permissions) return UNAVAILABLE_ACCESS;`. في سكربتات المحتوى (Content Scripts) في Chromium وFirefox، الكائن `chrome.permissions` غير متاح أصلًا (`undefined`).
    2. عندما بُني `PublicApiClient` وجسر الرسائل [`runtimePort`](../../src/core/api/port.ts#L74-L86) في `MJ11` لتمكين سكربت المحتوى من استخدام `api.github.com` عبر الخلفية، رُبطت به الوحدة (د) (`d/blockers`) ولم تُربط به الوحدة (ح).
    3. النتيجة المباشرة في الصفحة والدرج:
       * في شريط الصفحة `ReadmeBanner.tsx:48-51` يُرسم الزر `<button data-action="scan-docs">فحص مجلد docs/ عند الطلب</button>` **مفعَّلًا**، ولكن عند نقره يفشل دائمًا برسالة `«يتطلب الفحص صلاحية GitHub API الاختيارية...»` حتى لو كان المستخدم قد منح الصلاحية بالفعل.
       * في الدرج المحقون (`Drawer`)، يظهر الزر نفسه في `ReadmePanelView` وزر `<button data-action="load-counts">اعرض عدد كل وسم</button>` في `GuideView.tsx:215-218` **مفعَّلَين**، وعند نقرهما يفشلان فورًا لأن `Drawer` يعمل داخل سكربت المحتوى حيث `chrome.permissions` غير معرف.
    4. وحتى عند التشغيل من اللوحة الأصلية (`sidepanel.html`)، تستدعي `fetchApiGithub` دالة `fetch` مباشرةً متجاوزةً [`PublicApiClient`](../../src/core/api/client.ts#L65-L176): فلا ترسل الترويسة `X-GitHub-Api-Version: 2022-11-28`، ولا تضبط `credentials: 'omit'`، ولا تخزّن `ETag` في `ApiCache`، ولا تحدّث `RateLimitTracker` المشترك في الخلفية. (ويُلاحظ أيضًا أن `isPublicPath` في `src/core/api/client.ts:57` تسمح فقط بـ`/repos/...` و`/rate_limit` ولا تسمح بعد بـ`/search/issues` الذي تحتاجه `src/modules/h/first-contribution/counts.ts:48`).
* **الدليل:** فحص ثابت للكود في `src/modules/h/api-access.ts:28-81` ومقارنته مع `src/core/api/client.ts:48-58` و`src/background/main.ts:39`.
* **الإصلاح المقترح واختبار الانحدار:**
  * **الإصلاح:** السماح بالمسار `/search/issues` في `isPublicPath` (`src/core/api/client.ts:57`)، وتعديل `githubApiAccess` في `src/modules/h/api-access.ts` ليستخدم `runtimePort` / `PublicApiClient` في الخلفية عند غياب `api.permissions` في السياق المحلي (وتمرير طلبات `sidepanel` أيضًا عبر `runtimePort` لتوحيد `ETag` و`RateLimitTracker`).
  * **اختبار الانحدار:** اختبار تكامل يحاكي بيئة سكربت المحتوى (`api.permissions = undefined` مع وجود `api.runtime.sendMessage` متصل بـ`attachPublicApiHandler` في الخلفية مع صلاحية ممنوحة)، وينقر زر `scan-docs` في `ReadmeBanner` وزر `load-counts` في `GuideView` ويتحقق من نجاح الطلبين وتحديث `RateLimitTracker`.

---

### `MJ-AUDIT-003` — استقرار `PageDetector` المبكر أثناء تنقلات GitHub (React SPA) المتأخرة، وعدم إعادة تركيب الوحدات أو إعادة ربط أسطحها بعد وصول DOM الفعلي

* **الخطورة:** عالية (`High`)
* **المواضع المتأثرة:**
  * [`PageDetector.schedule`](../../src/core/detector/detector.ts#L134-L164) و[`PageDetector.signature`](../../src/core/detector/detector.ts#L194-L203) في `src/core/detector/detector.ts:134-203`
  * [`CORE_SELECTORS`](../../src/core/detector/selectors.ts#L137-L195) في `src/core/detector/selectors.ts:137-195`
  * [`PrStatusController.start`](../../src/modules/d/pr-status/module.tsx#L140-L143) في `src/modules/d/pr-status/module.tsx:140-143`، و[`MODULE_G`](../../src/modules/g/notes/module.tsx#L101-L102)، و[`BOOKMARKS_MODULE`](../../src/modules/g/bookmarks/module.tsx#L70-L71)، و[`LOG_MODULE`](../../src/modules/d/log-parser/module.tsx#L114-L118)
* **الموجات ومعايير القبول المتأثرة:** `MJ2` (`T-1.2` / `AC-CORE-01`، `AC-CORE-02`)، ويمتد أثره إلى وحدات `MJ8` و`MJ9` و`MJ11` و`MJ12`.
* **السلوك المتوقع مقابل الفعلي وشروط الحدوث:**
  * **المتوقع:** عند التنقل بدون إعادة تحميل كاملة (Turbo أو React SPA عبر `history.pushState` / `navigation`)، يجب أن تُركَّب الوحدات على DOM الصفحة الجديدة بعد اكتمال تحديثه، وألا تبقى مربوطة بعقد DOM قديمة أزالتها React.
  * **الفعلي:**
    1. يوثّق التعليق في `src/core/detector/detector.ts:6` أن عنوان URL في صفحات React يتغير عند ~13ms بينما يصل DOM الجديد عند ~240ms. ومع ذلك، يضبط `PageDetector` مهلة الاستقرار `DEFAULT_SETTLE_MS = 100`.
    2. عند التنقل بين صفحتين من **النوع نفسه** (`PageType` ذاته، مثل الانتقال من ملف `blob` أ إلى ملف `blob` ب، أو من `issue` #1 إلى `issue` #2، أو من `pr` #1 إلى `pr` #2) أو بين صفحتين تشتركان في محدّد التأكيد الاحتياطي `#repository-container-header` (الموجود في `confirm.repo` و`confirm.tree` في `src/core/detector/selectors.ts:143,148`)، ينقضي مؤقت `100ms` عند `t=113ms` **قبل** وصول DOM الصفحة الجديدة (`t=240ms`).
    3. عند `t=113ms`، يفحص `PageDetector.check()` الـDOM القديم فيجد محدّد التأكيد (`confirm.<type>`) متحققًا فيه، فيُصدر حدث الصفحة الجديدة بثقة `'high'` ويحفظ البصمة في `this.lastSignature`:
       `"<new-url>|<type>|high|<id(body)>|<id(main)>"`
       فيقوم `LifecycleManager` بتركيب الوحدات على **DOM الصفحة القديمة**!
    4. عند `t=240ms`، تحدّث React محتويات `<main>` الداخلية دون استبدال عنصر `<body>` أو عنصر `<main>` نفسه. وحين يعمل مراقب `MutationObserver` ويستدعي `this.check()`، تكون هوية `doc.body` وهوية `page.contentRoot` (`<main>`) لم تتغيرا، فتطابق `this.signature(page)` القيمة `this.lastSignature` ويتجاهل `PageDetector` التغيير تمامًا (`if (sig === this.lastSignature) return;`)!
    5. نتيجة لذلك:
       * في `PrStatusController.start` (`src/modules/d/pr-status/module.tsx:140-143`)، يرتبط المراقب بـ`watched = selectors.resolve(doc, 'd.pr.checks-region') ?? page.contentRoot` من الصفحة القديمة التي أُزيلت من `<main>`.
       * في `MODULE_G` (`src/modules/g/notes/module.tsx:101-102`) و`BOOKMARKS_MODULE` (`src/modules/g/bookmarks/module.tsx:70-71`) و`LOG_MODULE` (`src/modules/d/log-parser/module.tsx:114-118`)، يُدرج `this.surface` مرة واحدة فقط عند `start()` ولا يُعاد إرفاقه إذا استبدلت React عقد `<main>` الفرعية عند `t=240ms`.
* **الدليل:** فحص ثابت لمنطق `src/core/detector/detector.ts:194-203` ومحددات `src/core/detector/selectors.ts:137-195` ومقارنته بتوقيت `evidence/T-0.2` المذكور في ترويسة `detector.ts`.
* **الإصلاح المقترح واختبار الانحدار:**
  * **الإصلاح:** تضمين هوية عنصر التأكيد الفعلي (`confirmElement`) وبصمة المسار المعمق داخل `<main>` (أو محتوى `react-app[initial-path]` / أول طفل دلالي داخل `contentRoot`) ضمن `PageDetector.signature(page)`، وعدم الاكتفاء بـ`#repository-container-header` العام لتأكيد `repo`/`tree` متى كانت الصفحة السابقة داخل المستودع نفسه، مع التحقق في `refresh()` بالوحدات من أن `this.surface.host.isConnected` لا يزال `true` وإعادة إدراجه إن فُصل.
  * **اختبار الانحدار:** اختبار في `tests/core/detector.test.ts` يحاكي الانتقال من `/octo/demo/blob/main/a.ts` إلى `/octo/demo/blob/main/b.ts` عبر `history.pushState` عند `t=0` مع تأخير استبدال محتوى `<main>` الداخلي (دون تغيير عنصر `<main>` نفسه) إلى `t=250ms`، ويتحقق من إطلاق `PageDetector` وإعادة تركيب الوحدات بعد وصول DOM الملف `b.ts`.

---

### `MJ-AUDIT-004` — غياب التحقق من تطابق بصمة الالتزام (`headSha`) عند دمج بيانات `PublicApiClient` مع ملخص DOM في `mergeApi` و`explainBlockers`

* **الخطورة:** عالية (`High`)
* **المواضع المتأثرة:**
  * [`PrStatusController.renderSummary`](../../src/modules/d/pr-status/module.tsx#L247-L252) في `src/modules/d/pr-status/module.tsx:247-252`
  * [`mergeApi`](../../src/modules/d/blockers/merge.ts#L11-L46) في `src/modules/d/blockers/merge.ts:11-46`
  * [`explainBlockers`](../../src/modules/d/blockers/explain.ts#L100-L204) في `src/modules/d/blockers/explain.ts:100-204`
* **الموجات ومعايير القبول المتأثرة:** `MJ8` (`T-5.1` / `AC-D1`) و`MJ11` (`T-5.2` / `AC-D2`، `AC-D5`).
* **السلوك المتوقع مقابل الفعلي وشروط الحدوث:**
  * **المتوقع:** ألا تُدمج نتائج `api.github.com` (`pulls/{n}` و`commits/{headSha}/check-runs` و`commits/{headSha}/status`) مع ملخص DOM للصفحة إلا إذا كانت عائدة لنفس المستودع ورقم طلب السحب **ونفس التزام الرأس (`headSha`)**.
  * **الفعلي:**
    1. يتحقق `PrStatusController.refresh` (`src/modules/d/pr-status/module.tsx:217-218`) من أن استجابة `status-details` تطابق `initial.checks.detailsUrl` (الذي يتضمن معرف الالتزام)، ولكنه في السطرين `249-250` يمرر `this.apiData` مباشرةً إلى `mergeApi(summary, this.apiData)` و`explainBlockers(merged, evidence, this.apiData)` دون أي تحقق من تطابق `this.apiData.pull.value.headSha` مع بصمة الالتزام في DOM (المستخرجة في `evidence.headSha` أو في رابط `summary.checks.detailsUrl`).
    2. إذا دُفع التزام جديد (`git push`) إلى طلب السحب وحدّث GitHub الصفحة حيةً بعد أن ضغط المستخدم «تحديث من GitHub API» (أو بالعكس: إذا كان DOM الصفحة لم يُحدَّث بعد بينما أعادت API التزامًا أحدث)، فإن `mergeApi` (`src/modules/d/blockers/merge.ts:15-34`) تستبدل عناصر الفحوص في DOM بفحوص الالتزام الآخر، وتنسخ شارة `Required` (`isRequired`) بالاسم من التزام إلى التزام مختلف!
* **الدليل:** فحص ثابت للكود في `src/modules/d/blockers/merge.ts:11-46` و`src/modules/d/pr-status/module.tsx:247-252`.
* **الإصلاح المقترح واختبار الانحدار:**
  * **الإصلاح:** مقارنة `api.pull.value.headSha` مع `evidence.headSha` (ومع معرف الالتزام في `summary.checks.detailsUrl` إن وُجدت بصمة كاملة أو بادئة مطابقة `startsWith`)؛ وعند عدم التطابق يُبطَل `this.apiData` (أو يُوسم بـ`stale-commit`) ولا يُدمج في `mergeApi` مع إظهار تنبيه للمستخدم بأن التزام الرأس تغيّر.
  * **اختبار الانحدار:** اختبار وحدة في `tests/modules/d/blockers/` يمرر `summary` و`evidence` ببصمة `headSha: 'aaaa111'` مع `apiData` ببصمة `headSha: 'bbbb222'` ويتحقق من رفض الدمج وعدم تلويث عناصر الفحوص.

---

### `MJ-AUDIT-005` — خلل ربط العناصر المحمية (`ProtectedNode`) في `tokenNodes` عند سبق نص عادي مطابق، وابتلاع `splitMarkdownCode` لبقية المستند عند بدء السطر بشيفرة مضمّنة ثلاثية العلامات

* **الخطورة:** متوسطة (`Medium`)
* **المواضع المتأثرة:**
  * [`tokenNodes`](../../src/modules/c/ui/blocks.ts#L180-L192) في `src/modules/c/ui/blocks.ts:180-192`
  * [`splitMarkdownCode`](../../src/modules/c/masking/mask.ts#L67-L100) في `src/modules/c/masking/mask.ts:67-100`
* **الموجات ومعايير القبول المتأثرة:** `MJ3` (`T-4.2` / `AC-C2`) و`MJ10` (`T-4.1` / `AC-C1`).
* **السلوك المتوقع مقابل الفعلي وشروط الحدوث:**
  * **المتوقع:** أن تحافظ طبقة التقنيع وبناء DOM المترجَم على كل رابط وعنصر `<code>` في موضعه الصحيح دون تبديل، وألا تبتلع `maskText` فقرات كاملة كشيفرة إذا بدأ سطر بمقطع شيفرة مضمّن مثل ```` ```npm test``` ````.
  * **الفعلي:**
    1. في `tokenNodes` (`src/modules/c/ui/blocks.ts:180-192`)، تحتوي `block.nodes` على العناصر الصريحة فقط (`<a>` و`<code>`)، بينما تحتوي `expected` على الرموز المكتشفة تلقائيًا في النصوص العادية **إضافةً** إلى رموز العناصر الصريحة. تبحث الحلقة عن أول سجل يحقق `records[at]!.type === node.type && records[at]!.original === node.value`. فإذا ورد في فقرة واحدة نص عادي غير مربوط مثل `#123` (أو `@octocat` أو `https://...` أو مصطلح `GitHub`) متبوعًا برابط فعلي `<a href=".../issues/123">#123</a>`، ينشئ المقنِّع `⟦REF_0⟧` للنص العادي و`⟦REF_1⟧` للرابط، لكن `tokenNodes` تربط عقدة الرابط `<a href="...">` بـ`⟦REF_0⟧` (فيتحول النص العادي إلى رابط) وتترك `⟦REF_1⟧` (الرابط الحقيقي!) بلا عقدة فيُعرض كـ`<span>` غير قابل للنقر، وتنحرف مطابقة أي روابط مطابقة لاحقة في الفقرة نفسها.
    2. في `splitMarkdownCode` (`src/modules/c/masking/mask.ts:67-97`)، التعبير `FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/` يعامل أي سطر يبدأ بثلاث علامات `` ` `` على أنه فتح لكتلة شيفرة متعددة الأسطر، حتى لو أُغلقت العلامات الثلاث على السطر نفسه (مثل ```` ```npm install``` is fast ````، وهو شيفرة مضمّنة في CommonMark §4.5 لأن سلسلة معلومات الكتلة المسوّرة بـ`` ` `` لا يجوز أن تحوي `` ` ``). النتيجة أن `fence` يُفتح ولا يُغلق أبدًا، فتبتلع الدالة **جميع أسطر المستند التالية** داخل رمز `⟦CODE_0⟧` واحد فلا يُترجم منها شيء.
* **الدليل:** فحص ثابت للكود في `src/modules/c/ui/blocks.ts:180-192` و`src/modules/c/masking/mask.ts:67-97`.
* **الإصلاح المقترح واختبار الانحدار:**
  * **الإصلاح:**
    1. في `blockOf` / `maskSegments`، الاحتفاظ بفهرس المقطع الصريح (`segmentIndex`) أو تمرير `nodes` بمحاذاة المقاطع الصريحة بدل المطابقة النصية العمياء في `tokenNodes`.
    2. في `splitMarkdownCode`، اشتراط عدم احتواء بقية السطر الافتتاحي لسياج `` ` `` على علامة `` ` `` (وفق CommonMark §4.5: `if (char === '`' && line.slice(m[0].length).includes('`'))` لا يُعدّ سياجًا مفتوحًا بل يمر إلى `pushInlineCode`).
  * **اختبار الانحدار:**
    1. اختبار في `tests/modules/c/ui/blocks.test.ts` على فقرة `<p>See #7 and <a href="https://github.com/o/r/issues/7">#7</a></p>` يتحقق من أن `⟦REF_1⟧` هو الذي يرتبط بالرابط `<a>` وليس `⟦REF_0⟧`.
    2. اختبار في `tests/modules/c/masking/` على نص يبدأ بـ```` ```foo``` bar\nNext line ```` يتحقق من تقنيع ```` ```foo``` ```` وحده وبقاء `bar\nNext line` نصًا قابلًا للترجمة.

---

### `MJ-AUDIT-006` — تعارض دورة حياة العزل (`a.isolation`) والأرقام المشرقية (`a.digits`) عند إيقاف العزل أو إعادة الضبط (`reconcile`)، وغياب واجهة لتجاوز «الصفحة الحالية مؤقتًا» (`MODULE_A_OVERRIDES`)

* **الخطورة:** متوسطة (`Medium`)
* **المواضع المتأثرة:**
  * [`ModuleARuntime.reconcile`](../../src/modules/a/scope/runtime.ts#L226-L237) في `src/modules/a/scope/runtime.ts:226-237`
  * [`DIGITS_FEATURE`](../../src/modules/a/digits/feature.ts#L13-L54) في `src/modules/a/digits/feature.ts:13-54` و[`isPureArabicProse`](../../src/modules/a/digits/convert.ts#L28-L41) في `src/modules/a/digits/convert.ts:28-41`
  * [`MODULE_A_OVERRIDES`](../../src/modules/a/scope/module.ts#L74-L75) في `src/modules/a/scope/module.ts:74-75` و[`ModuleASection.tsx`](../../src/modules/a/settings/ModuleASection.tsx#L3-L95) في `src/modules/a/settings/ModuleASection.tsx:3-95`
* **الموجات ومعايير القبول المتأثرة:** `MJ6` (`T-2.7` / `AC-A7`) و`MJ7` (`T-2.2`، `T-2.6` / `AC-A2`، `AC-A6`).
* **السلوك المتوقع مقابل الفعلي وشروط الحدوث:**
  * **المتوقع:**
    1. ألا يتسبب إيقاف ميزة «عزل المعرّفات» (`a.isolation`) أو تغيّر نطاق الوحدة (أ) أثناء بقاء «الأرقام المشرقية» (`a.digits`) مفعَّلة في تلويث سجل `TextTransformRegistry` أو إبطال تحويل الأرقام في الفقرات المختلطة.
    2. أن يتمكن المستخدم من اختيار النطاق الثالث المنصوص عليه في `AC-A7` («الصفحة الحالية مؤقتًا») من واجهة الإعدادات أو الدرج.
  * **الفعلي:**
    1. عندما تعمل `ISOLATION_FEATURE` قبل `DIGITS_FEATURE` على عقدة نصية مثل `"في الخطوة 3 راجع #12"`، تستبدل `IsolationProcessor` العقدة النصية بعنصر `<span class="mijhar-bidi-group" data-mijhar-injected="true">` يفصل `"في الخطوة 3 راجع "` في عقدة نصية فرعية و`#12` في `<span class="mijhar-bidi-isolate">`. بعد ذلك تمر `DIGITS_FEATURE` (التي تستثني `.mijhar-bidi-group` من `DIGITS_SKIP` في `src/modules/a/digits/feature.ts:13`) فتحوّل `"في الخطوة 3 راجع "` عبر `TextTransformRegistry` إلى `"في الخطوة ٣ راجع "`.
    2. إذا أوقف المستخدم ميزة `isolation` وحدها (أو عند استدعاء `ModuleARuntime.reconcile()` في `src/modules/a/scope/runtime.ts:228-236` التي توقف الميزات **بترتيب أمامي** `for (const feature of this.options.features)` عكس `stop()` في السطر 244!)، تستعيد `isolation` العقدة النصية الأصلية `"في الخطوة 3 راجع #12"` وتزيل `<span class="mijhar-bidi-group">` بينما لا تزال العقدة الفرعية مسجلة في `TextTransformRegistry` لصالح `digits`. فيرصد مراقب `TextTransformRegistry` (`src/modules/a/guard/text-transform-registry.ts:272-282`) إزالة السلف ويلوّث السجل بـ`text-node-removed`، وعندما تعود العقدة الأصلية `"في الخطوة 3 راجع #12"` ترفض `isPureArabicProse` تحويل الرقم `3` لوجود `#12` معها في العقدة نفسها!
    3. بخصوص `AC-A7` («نطاق التفعيل: كل GitHub، أو مستودعات محددة، أو الصفحة الحالية مؤقتًا»): على الرغم من تصدير `MODULE_A_OVERRIDES = new PageOverrides()` في `src/modules/a/scope/module.ts:74-75` بالتعليق `«تكتبها واجهة الإعدادات أو اللوحة»`، لا يوجد أي استدعاء لـ`MODULE_A_OVERRIDES.set(...)` في كامل `src/`، وتقتصر `ModuleASection.tsx:84-93` على خيارَي `all` و`repos` فقط.
* **الدليل:** فحص ثابت للكود في `src/modules/a/scope/runtime.ts:226-245` و`src/modules/a/digits/feature.ts:13-54` وبحث شامل عن `MODULE_A_OVERRIDES` في `src/`.
* **الإصلاح المقترح واختبار الانحدار:**
  * **الإصلاح:**
    1. في `ModuleARuntime.reconcile()`، إيقاف الميزات التي تغيّر قرارها بترتيب **عكسي** قبل تركيب أو إعادة تركيب الميزات بترتيب أمامي، وإعادة تطبيق `DIGITS_FEATURE` على العقد المستعادة عند إيقاف `isolation`.
    2. إضافة مفتاح تجاوز «الصفحة الحالية مؤقتًا» في الدرج/اللوحة يتصل بـ`MODULE_A_OVERRIDES.set(featureId, href, mode)`.
  * **اختبار الانحدار:** اختبار في `tests/modules/a/guard/scope.test.ts` يفعّل `isolation` و`digits` معًا على فقرة `"في الخطوة 3 راجع #12"` ثم يوقفهما عبر تغيير النطاق في `reconcile()`، ويتحقق من خلو `TextTransformRegistry` من استثناءات `text-node-removed`.

---

### `MJ-AUDIT-007` — قصور في ميزة وضع القراءة (`a.reading`): غياب مراقب DOM للحاويات المتأخرة، وحجب سبب التعطيل `ERRORS.disabled` وبقاء المقالة القديمة عند فشل التحديث، وإسقاط الحركات الابتدائية في `stripWithOffsets`

* **الخطورة:** متوسطة (`Medium`)
* **المواضع المتأثرة:**
  * [`READING_FEATURE.mount`](../../src/modules/a/reading/feature.ts#L53-L86) في `src/modules/a/reading/feature.ts:53-86`
  * [`ReaderApp`](../../src/modules/a/reading/reader/ReaderApp.tsx#L28-L107) في `src/modules/a/reading/reader/ReaderApp.tsx:28-107`
  * [`stripWithOffsets`](../../src/modules/a/reading/reader/view.ts#L27-L47) و[`DiacriticsView.clipboard`](../../src/modules/a/reading/reader/view.ts#L181-L196) في `src/modules/a/reading/reader/view.ts:27-196`
* **الموجات ومعايير القبول المتأثرة:** `MJ7` (`T-2.5` / `AC-A5` و`DEC-02` أ-2).
* **السلوك المتوقع مقابل الفعلي وشروط الحدوث:**
  * **المتوقع:**
    1. أن يظهر زر «وضع القراءة» حتى لو رُسمت حاوية `.markdown-body` بشكل غير متزامن بعد تركيب الميزة.
    2. عند الضغط على «تحديث من الصفحة» في تبويب القراءة (`reader.html`) بعد إيقاف الميزة في التبويب الأصلي، أن تظهر رسالة `ERRORS.disabled` (`«وضع القراءة غير مفعَّل في الصفحة الأصلية.»`)، وأن يُمسح المحتوى القديم عند فشل التحديث حتى لا يُقرأ محتوى قديم تحت شريط خطأ.
    3. عند إخفاء التشكيل في عرض القراءة ونسخ نص يبدأ بحركة أو عقدة نصية مكونة من حركات فقط (مثلاً عقب وسم مضمّن `<code>` أو `<strong>`)، أن تُستعاد جميع الحركات كاملة في الحافظة.
  * **الفعلي:**
    1. تفحص `READING_FEATURE.mount` (`src/modules/a/reading/feature.ts:69`) حاويات `snapshotContainers(doc, containerSelector)` مرة واحدة فقط متزامنةً عند التركيب ولا تسجل `ctx.observe(body, ...)` كبقية ميزات الوحدة (أ) (`direction` و`isolation` و`digits` و`editor-toggle`).
    2. تُعرّف `ReaderApp.tsx:31` الرسالة `disabled: 'وضع القراءة غير مفعَّل في الصفحة الأصلية.'`، لكن `src/modules/a/reading/feature.ts:58-67` تزيل مستمع `runtime.onMessage` فور إيقاف الميزة، فلن يردّ أي مستمع بـ`{ ok: false, reason: 'disabled' }`، وتُظهر `ReaderApp` دائمًا رسالة `ERRORS.unreachable` (`«تعذّر الوصول إلى التبويب الأصلي — ربما أُغلق...»`).
    3. في `ReaderApp.tsx:89-107`، يظل المكون `<Article ref={article} />` مركَّبًا مع `shouldComponentUpdate() { return false; }`. فإذا نجح التحميل الأول ثم فشل «تحديث من الصفحة» لاحقًا (`status.kind === 'error'`)، لا يُستدعى `article.current.replaceChildren()` ويبقى نص المقالة القديمة معروضًا تحت تنبيه الخطأ. (كما أن `ReaderApp.tsx:69` يشترك في تغييرات `TYPOGRAPHY_KEY` دون `READING_OPTIONS_KEY`).
    4. في `stripWithOffsets` (`src/modules/a/reading/reader/view.ts:28-40`)، إذا بدأت عقدة نصية بحركة تشكيل، فإن `offsets[0]` يحمل موضع أول حرف غير مشكول (`> 0`). وعند استدعاء `originalSlice(original, offsets, 0, end)` لنسخ بداية العقدة (`start = 0`)، تكون `from = offsets[0] > 0` فتسقط الحركة الابتدائية. وإذا كانت العقدة النصية مكونة من حركات فقط، يكون طول النص المجرد `0` فيتخطاها `clipboard` (`src/modules/a/reading/reader/view.ts:194`) بالشرط `if (end <= start) continue;`.
* **الدليل:** فحص ثابت للكود في `src/modules/a/reading/feature.ts:58-85` و`src/modules/a/reading/reader/ReaderApp.tsx:28-107` و`src/modules/a/reading/reader/view.ts:28-47,189-196`.
* **الإصلاح المقترح واختبار الانحدار:**
  * **الإصلاح:**
    1. إضافة `ctx.observe` في `READING_FEATURE.mount` لرصد ظهور حاويات Markdown المتأخرة، وإبقاء مستمع خفيف في `ModuleARuntime` يردّ بـ`{ ok: false, reason: 'disabled' }` عندما تكون الميزة معطلة.
    2. مسح `article.current?.replaceChildren()` في `ReaderApp` عندما يتحول `status.kind` إلى `'error'`، والاشتراك في `READING_OPTIONS_KEY`.
    3. في `originalSlice`، جعل `from = start === 0 ? 0 : (offsets[Math.min(start, offsets.length - 1)] ?? 0)` وعدم تخطي العقد المسجلة في `this.entries` حتى لو كان `text.data.length === 0`.
  * **اختبار الانحدار:** اختبار في `tests/modules/a/reading/reading.test.tsx` يتحقق من ظهور `ERRORS.disabled` ومسح `<article>` عند تعطيل الميزة وتحديث الصفحة، واستعادة الحركات لعقدة نصية تبدأ بشدّة أو حركة بعد عنصر مضمّن.

---

### `MJ-AUDIT-008` — اختطاف التركيز عند النقر خارج بطاقة الشرح (`ExplainOverlay`)، وتعطّل استعادة التركيز الأصلي (`FocusReturn.restore`) عند إيقاف وضع الشرح، وتضليل المستخدم حول `Alt+K` في وضع الدرج

* **الخطورة:** متوسطة (`Medium`)
* **المواضع المتأثرة:**
  * [`CardController.start`](../../src/modules/b/card/module.tsx#L85-L104) و[`CardController.release`](../../src/modules/b/card/module.tsx#L159-L168) و[`CardController.draw`](../../src/modules/b/card/module.tsx#L227) في `src/modules/b/card/module.tsx:85-227`
  * [`ExplainOverlay`](../../src/modules/b/card/overlay.tsx#L138-L147) في `src/modules/b/card/overlay.tsx:138-147`
  * [`GlossarySearchDrawerNotice`](../../src/modules/b/search/view.tsx#L307-L309) في `src/modules/b/search/view.tsx:307-309` مقابل [`startBackground`](../../src/background/main.ts#L46-L50) و[`openPanel`](../../src/core/ui-host/commands.ts#L60-L82)
* **الموجات ومعايير القبول المتأثرة:** `MJ8` (`T-3.2` / `AC-B1`) و`MJ10` (`T-3.3` / `AC-B5`، `T-3.4` / `AC-B6`).
* **السلوك المتوقع مقابل الفعلي وشروط الحدوث:**
  * **المتوقع:**
    1. عند إغلاق بطاقة الشرح بـ`Escape` أو بزر الإغلاق يعود التركيز إلى الشارة التي فتحتها، أما عند النقر بالماوس خارج البطاقة (مثلاً على حقل بحث أو رابط في صفحة GitHub) فتُغلق البطاقة دون سرقة التركيز من العنصر الذي نقر عليه المستخدم.
    2. عند إيقاف وضع الشرح بـ`Alt+H` أو بزر «إيقاف» في الشريط، يعود التركيز إلى العنصر الأصلي الذي كان مركزًا قبل تفعيل الوضع (`FocusReturn`).
    3. ألا تعد رسالة الدرج المستخدم بأن `Alt+K` يفتح اللوحة الأصلية بينما هو يفتح الدرج نفسه عندما يكون إعداد السطح `drawer`.
  * **الفعلي:**
    1. في `ExplainOverlay` (`src/modules/b/card/overlay.tsx:138-147`)، ينفّذ `useEffect([openIndex])` السطر `root.querySelector('.badge[data-index="${lastOpen.current}"]')?.focus({ preventScroll: true })` كلما أصبحت `openIndex === null` دون تفرقة بين الإغلاق بلوحة المفاتيح/زر الإغلاق وبين الإغلاق بالنقر خارج البطاقة (`src/modules/b/card/module.tsx:98-104`) أو الإغلاق بسبب إزالة العنصر من DOM أثناء `scan()` (`src/modules/b/card/module.tsx:173`). بذلك كل نقرة خارج البطاقة تختطف التركيز قسرًا إلى الشارة داخل Shadow DOM.
    2. في `src/modules/b/card/module.tsx:89-90`:
       ```ts
       this.mode.set(false);
       this.focusReturn.restore((element) => this.parts?.shadow.contains(element) === true || element?.getRootNode() === this.parts?.shadow);
       ```
       استدعاء `this.mode.set(false)` يستدعي متزامنًا `this.sync()` ثم `this.release()` التي تحذف المضيف وتعيّن `this.parts = null` (`src/modules/b/card/module.tsx:166-167`) **قبل** تنفيذ السطر 90! لذا تكون `this.parts` دائمًا `null` حين تعمل دالة التحقق `isOurs`، كما أن زر «إيقاف» في الشريط (`src/modules/b/card/module.tsx:227`: `onStop={() => this.mode.set(false)}`) لا يستدعي `this.focusReturn.restore` أصلًا.
    3. في `src/modules/b/search/view.tsx:308`، تخبر `GlossarySearchDrawerNotice` المستخدم في الدرج: `«يفتح أمر «ابحث في قاموس مِجهَر» (Alt+K) اللوحة الأصلية على هذا البحث.»`، لكن معالج `GLOSSARY_COMMAND` في `src/background/main.ts:48` يستدعي `openPanel(panelDeps(), tab, 'open')` الذي يتبع إعداد `ui.surface`؛ فإذا كان السطح المختار هو `drawer`، فإن ضغط `Alt+K` يفتح **الدرج نفسه** (حيث لا توجد خانة بحث) ولا يفتح اللوحة الأصلية.
* **الدليل:** فحص ثابت للكود في `src/modules/b/card/module.tsx:88-104,159-168,227` و`src/modules/b/card/overlay.tsx:138-147` و`src/modules/b/search/view.tsx:308`.
* **الإصلاح المقترح واختبار الانحدار:**
  * **الإصلاح:**
    1. قصر إعادة التركيز إلى `.badge` عند إغلاق البطاقة على الإغلاق الصريح (`Escape` أو زر الإغلاق داخل البطاقة) دون نقرات خارج الطبقة أو تغيّر نتائج `scan`.
    2. استدعاء `this.focusReturn.restore(...)` **قبل** `this.mode.set(false)` (أو تمرير مرجع `shadow` المحفوظ محليًا قبل `release()`)، وتمريره أيضًا داخل `onStop`.
    3. في `GlossarySearchDrawerNotice`، توضيح أن البحث النصي يتطلب تفعيل «اللوحة الجانبية الأصلية» من تبويب الإعدادات (أو جعل `GLOSSARY_COMMAND` يفتح `sidePanel.open` متى كان متاحًا).
  * **اختبار الانحدار:** اختبار في `tests/modules/b/access/keyboard.test.tsx` يركّز عنصرًا في الصفحة، يفعّل الوضع، ينقر زر «إيقاف» في الشريط، ويتحقق من عودة `document.activeElement` إلى العنصر الأصلي، واختبار ثانٍ ينقر على `<input>` خارج الطبقة أثناء فتح البطاقة ويتحقق من بقاء التركيز على `<input>`.

---

### `MJ-AUDIT-009` — بقاء نتائج فحص `docs/` القديمة عند تبديل المستودع في `ReadmePanelView` وفتح روابطها داخل إطار اللوحة، وتراكم سجلات `anchors.<id>` اليتيمة عند حذف الملاحظات من اللوحة الأصلية

* **الخطورة:** متوسطة (`Medium`)
* **المواضع المتأثرة:**
  * [`ReadmePanelView`](../../src/modules/h/readme-detector/ReadmePanelView.tsx#L35-L45) في `src/modules/h/readme-detector/ReadmePanelView.tsx:35-45` و[`MatchLinks`](../../src/modules/h/readme-detector/ReadmeBanner.tsx#L17-L27) و[`DocsScanControl`](../../src/modules/h/readme-detector/ReadmeBanner.tsx#L36-L78) في `src/modules/h/readme-detector/ReadmeBanner.tsx:17-78`
  * [`NotesView`](../../src/modules/g/notes/view.tsx#L41-L43) في `src/modules/g/notes/view.tsx:41-43` و[`NotesRepository.remove`](../../src/modules/g/notes/repository.ts#L129-L132) في `src/modules/g/notes/repository.ts:129-132`
* **الموجات ومعايير القبول المتأثرة:** `MJ9` (`T-9.1` / `AC-H1`، `T-8.1` / `AC-G1`) و`MJ12` (`T-8.3` / `AC-G2` و`DEC-05`).
* **السلوك المتوقع مقابل الفعلي وشروط الحدوث:**
  * **المتوقع:**
    1. عند تبديل التبويب أو المستودع أثناء فتح اللوحة الجانبية، أن تُصَفَّر حالة فحص `docs/` في `ReadmePanelView` فلا تُعرض نتائج مستودع أ تحت اسم مستودع ب، وأن تفتح روابط ملفات README العربية المكتشفة في تبويب مستقل (`target="_blank" rel="noopener noreferrer"`).
    2. عند حذف ملاحظة سطرية من اللوحة الأصلية (`NotesView`)، أن يُحذف سجل بصمتها `anchors.<id>` (الذي يحوي مقتطف ±2 أسطر نصًا صريحًا للمستودعات العامة وفق `DEC-05`) فورًا من التخزين.
  * **الفعلي:**
    1. في `src/modules/h/readme-detector/ReadmePanelView.tsx:41`، يُرسم `<DocsScanControl owner={page.owner} repo={page.repo} access={access} />` بلا خاصية `key={slug}`، كما أن `DocsScanControl` (`src/modules/h/readme-detector/ReadmeBanner.tsx:36-44`) لا يملك `useEffect` يعيد ضبط `state` إلى `{ kind: 'idle' }` عند تغيّر `owner` أو `repo`. فإذا فحص المستخدم `docs/` في المستودع الأول ثم انتقل إلى مستودع ثانٍ، تبقى روابط المستودع الأول معروضة تحت اسم المستودع الثاني.
    2. في `MatchLinks` (`src/modules/h/readme-detector/ReadmeBanner.tsx:21`)، الروابط `<a class="btn" href={match.href}>` تفتقر إلى `target="_blank" rel="noopener noreferrer"` (عكس بقية روابط اللوحة في `GuideView` و`DiscoveryView` و`ResourcesView`)، فالنقر عليها من داخل `sidepanel.html` يحوّل نافذة اللوحة الجانبية نفسها إلى موقع `github.com` بدل فتح الملف في تبويب المتصفح.
    3. في `NotesRepository.remove(id)` (`src/modules/g/notes/repository.ts:129-132`)، يُحذف المفتاح `notes.<id>` وحده. وبينما تمرر بطاقة الصفحة `PageCard.tsx:100-103` دالة `onDeleted` لحذف البصمة، فإن `NotesView.tsx:42` في اللوحة الأصلية لا تمرر `onDeleted` ولا تنظف `anchors.<id>`، مما يترك سجلات البصمات ومقتطفات الشيفرة يتيمة في `chrome.storage.local` حتى يزور المستخدم صفحة مستودع تشغّل `AnchorController.pruneOrphans`.
* **الدليل:** فحص ثابت للكود في `src/modules/h/readme-detector/ReadmePanelView.tsx:41` و`src/modules/h/readme-detector/ReadmeBanner.tsx:21,36-44` و`src/modules/g/notes/view.tsx:42`.
* **الإصلاح المقترح واختبار الانحدار:**
  * **الإصلاح:**
    1. إضافة `key={slug}` إلى `<DocsScanControl>` في `ReadmePanelView.tsx` وإضافة `useEffect(() => setState({ kind: 'idle' }), [owner, repo])` في `DocsScanControl`، وإضافة `target="_blank" rel="noopener noreferrer"` في `MatchLinks` (أو فتحها في التبويب النشط/تبويب جديد).
    2. حذف `anchors.${id}` داخل `NotesRepository.remove(id)` نفسها (أو في مستمع تخزين موحّد) لضمان عدم بقاء أي بصمة يتيمة بغض النظر عن الواجهة التي حذفت الملاحظة.
  * **اختبار الانحدار:**
    1. اختبار في `tests/modules/h/panel.test.tsx` يفحص `docs/` على `octo/one` ثم يحدّث `pageSource` إلى `octo/two` ويتحقق من اختفاء نتائج `octo/one` ومن وجود `target="_blank"` على الروابط.
    2. اختبار في `tests/modules/g/notes/repository.test.ts` يتحقق من أن حذف ملاحظة يحذف سجل `anchors.<id>` المقابل لها في `Store`.

---

### `MJ-AUDIT-010` — فشل إقلاع سكربت المحتوى (`openSettings({ migrate: false })`) عند خمول عامل الخلفية قبل الترحيل، وتعدد نسخ `Store` في السياق الواحد، وتكرار إشعارات الدرج، وعدم تفاعلية `PP-01` في `PrStatusController`

* **الخطورة:** متوسطة (`Medium`)
* **المواضع المتأثرة:**
  * [`openSettings`](../../src/core/ui-host/settings-runtime.ts#L28-L44) في `src/core/ui-host/settings-runtime.ts:28-44` و[`Store.initialize`](../../src/core/storage/store.ts#L409-L435) في `src/core/storage/store.ts:409-435`
  * [`PANEL_VIEWS`](../../src/sidepanel/views.ts#L37-L41) في `src/sidepanel/views.ts:37-41`، و`src/modules/g/notes/view.tsx:75-81`، و`src/modules/g/bookmarks/view.tsx:58-63`، و`src/modules/h/views.tsx:11-21`، و`src/modules/h/readme-wizard/WizardView.tsx:222-227`
  * `src/modules/g/notes/context.ts:17-24`، و`src/modules/g/bookmarks/context.ts:23-38`، و`src/modules/h/context.ts:21-26`
  * [`settingsStaleMs`](../../src/modules/d/pr-status/module.tsx#L84-L109) و[`PrStatusController`](../../src/modules/d/pr-status/module.tsx#L179-L189) في `src/modules/d/pr-status/module.tsx:84-189`
* **الموجات ومعايير القبول المتأثرة:** تكامل عابر للموجات `MJ2` و`MJ5` و`MJ8` و`MJ9` و`MJ11` و`MJ12`.
* **السلوك المتوقع مقابل الفعلي وشروط الحدوث:**
  * **المتوقع:**
    1. إذا فُتح تبويب GitHub بينما عامل الخلفية (`service_worker`) خامل وكان التخزين بحاجة إلى ترحيل (`StorageNotMigratedError`)، أن يُوقظ سكربت المحتوى عامل الخلفية لإتمام الترحيل ثم يفتح الإعدادات بنجاح.
    2. أن تتشارك الوحدات داخل السياق الواحد نسخة `Store` و`SettingsStore` واحدة، وألا تتكرر بطاقات `NativeOnlyNotice` داخل التبويب الواحد في الدرج، وأن ينعكس تعديل إعداد `PP-01` (`d.pr-status.staleMinutes`) فورًا على بطاقة حالة PR المعروضة.
  * **الفعلي:**
    1. في `src/core/ui-host/settings-runtime.ts:28-44`، تعيد `openSettings({ migrate: false })` المحاولة 6 مرات (`2,250ms`) عند حدوث `StorageNotMigratedError` دون إرسال أي رسالة `runtime.sendMessage` لإيقاظ عامل الخلفية الخامل في MV3؛ فإذا كان عامل الخلفية نائمًا يفشل `startContent()` نهائيًا. كما أن `Store.initialize` (`src/core/storage/store.ts:412-415`) يكتب `META_KEY` حتى عندما يكون `migrate: false` و`locks: null` إذا كان التخزين فارغًا تمامًا، مما قد يتسابق مع الخلفية في التثبيت الأول.
    2. يفتح سكربت المحتوى الواحد ما يصل إلى **5 نسخ منفصلة من `Store`** (`startContent`، و`notesContext`، و`laterContext`، و`communityContext`، و`settingsStaleMs`) مع `locks: null`، فلا تتسلسل عمليات الكتابة المتزامنة بينها عبر `this.queue`.
    3. في `src/sidepanel/views.ts:37-41`، عند فتح الدرج المحقون (`Drawer`)، يعرض تبويب `notes` بطاقتَي `<NativeOnlyNotice>` مكررتين فوق بعضهما (`NotesDrawerNotice` و`LaterDrawerNotice`)، ويعرض تبويب `community` **ثلاث** بطاقات `<NativeOnlyNotice>` منفصلة (`WizardDrawerNotice` و`DiscoveryDrawerNotice` و`ResourcesDrawerNotice`) تحت بطاقتي `ReadmePanelView` و`GuideView`. وفي اللوحة الأصلية (`sidepanel.html`)، يعرض تبويب `notes` تذييلَي خصوصية منفصلين ويفتح نسختين منفصلتين من `NotesRepository`.
    4. في `src/modules/d/pr-status/module.tsx:84-109,179-189`:
       * تُفتح `SettingsStore` بشكل كسول أثناء أول `refresh('initial')`، لذا فإن الرسم الأولي يستخدم دائمًا المهلة الافتراضية (`5` دقائق) حتى لو كان المستخدم قد حفظ قيمة أخرى لـ`PP-01`.
       * يحدّث اشتراك `settings.subscribe` المتغير المحلي `value` فقط دون استدعاء `this.refresh('tick')` على البطاقة المركَّبة، فلا تتحدث حالة الحداثة (`fresh` / `stale`) في البطاقة عند تغيير المستخدم لإعداد `PP-01` إلا بعد مرور دقيقة كاملة من مؤقت `FRESHNESS_TICK_MS`.
* **الدليل:** فحص ثابت للكود في `src/core/ui-host/settings-runtime.ts:28-44` و`src/sidepanel/views.ts:37-41` و`src/modules/d/pr-status/module.tsx:84-109,179-189`.
* **الإصلاح المقترح واختبار الانحدار:**
  * **الإصلاح:**
    1. عند اعتراض `StorageNotMigratedError` في `openSettings({ migrate: false })`، إرسال رسالة إيقاظ خفيفة (`{ type: 'mijhar:wake' }`) إلى الخلفية قبل إعادة المحاولة، ومنع `Store.initialize` من الكتابة عندما يكون `migrate: false`.
    2. توحيد `sharedStore()` و`sharedSettings()` عبر السياق الواحد، ودمج إشعار `NativeOnlyNotice` في تبويبَي `notes` و`community` بإشعار موحّد لكل تبويب، وتمرير إشعار تغيّر `PP-01` لاستدعاء `this.refresh('tick')` فورًا في `PrStatusController`.
  * **اختبار الانحدار:** اختبار وحدة في `tests/modules/d/blockers/` يغيّر قيمة `d.pr-status.staleMinutes` في `SettingsStore` ويتحقق من تحدّث `data-freshness` في بطاقة `PR_STATUS_MODULE` فورًا دون انتظار مؤقت الدقيقة.

---

### `MJ-AUDIT-011` — حالة سباق (`Race Condition`) في `PrStatusController.load`، ونسبة الفحوص التراثية (`/status`) خطأً إلى `/check-runs` في `whereOf`، وقصور محددات وإغلاق `SelectionTranslator`

* **الخطورة:** منخفضة (`Low`)
* **المواضع المتأثرة:**
  * [`PrStatusController.load`](../../src/modules/d/pr-status/module.tsx#L308-L329) في `src/modules/d/pr-status/module.tsx:222,308-329`
  * [`whereOf`](../../src/modules/d/blockers/explain.ts#L95-L98) في `src/modules/d/blockers/explain.ts:95-98`
  * [`SelectionTranslator`](../../src/modules/c/ui/selection.tsx#L38-L185) في `src/modules/c/ui/selection.tsx:38-185`
* **الموجات ومعايير القبول المتأثرة:** `MJ8` (`T-5.1`)، `MJ11` (`T-5.2` / `AC-D2`)، `MJ10` (`T-4.1` / `AC-C1`).
* **السلوك المتوقع مقابل الفعلي وشروط الحدوث:**
  * **المتوقع:**
    1. إلغاء أو تجاهل طلب `status-details` الأقدم إذا تغيّر `detailsUrl` أثناء انتظار الجلب.
    2. أن ينسب `whereOf` الفحص القادم من نقطة النهاية التراثية `/commits/{sha}/status` إلى `api.requests[2]` (`/status`) لا إلى `api.requests[1]` (`/check-runs`).
    3. أن يعمل `SelectionTranslator` على جميع محددات `TRANSLATE_SELECTORS` (بما فيها `[data-testid="markdown-body"]` و`.comment-body`)، وأن تُغلق بطاقة الترجمة المحددة بـ`Escape` من أي موضع في المستند أو عند تحديد نص جديد.
  * **الفعلي:**
    1. في `PrStatusController.load` (`src/modules/d/pr-status/module.tsx:308-329`)، يُحفظ `this.pendingUrl` كسلسلة نصية واحدة بلا `AbortController` أو معرف طلب؛ فإذا بدأ جلب `url2` قبل انتهاء `url1`، فإن اكتمال `url1` المتأخر يصفّر `this.pendingUrl = null` ويكتب `this.fetched = { url: url1, ... }` فوق الحالة الأحدث.
    2. في `src/modules/d/blockers/explain.ts:95-98`:
       ```ts
       if (item.source === 'api') return api?.requests[1] ? `GitHub API: ${api.requests[1].endpoint}` : 'GitHub API (check-runs)';
       ```
       ينسب الدليل دائمًا أي فحص مصدره `'api'` إلى `api.requests[1]` (`check-runs`)، حتى لو كان الفحص حالة التزام تراثية (`item.id === null`) قادمة من `api.requests[2]` (`/commits/{sha}/status`).
    3. في `src/modules/c/ui/selection.tsx:38,177`، تفحص `selectionTarget` المحدد `.markdown-body` وحده متجاهلةً بقية مرشحات `TRANSLATE_SELECTORS`، وفي السطر `167` يمنع الشرط `if (this.card) return;` ظهور زر الترجمة لأي تحديد جديد طالما البطاقة السابقة مفتوحة، كما أن مستمع `Escape` مربوط بعنصر `.sel-card` وحده (`onKeyDown` في السطر `96`) فيتوقف عن العمل إذا انتقل التركيز إلى الصفحة.
* **الدليل:** فحص ثابت للكود في المواضع المذكورة أعلاه.
* **الإصلاح المقترح واختبار الانحدار:**
  * **الإصلاح:**
    1. التحقق من `if (this.pendingUrl !== url) return;` قبل تحديث `this.fetched` و`this.pendingUrl` في `PrStatusController.load`.
    2. في `whereOf`، التمييز بين `item.id !== null` (`api.requests[1]` — `check-runs`) و`item.id === null` (`api.requests[2]` — `status`).
    3. تمرير `ctx.selectors.entry(TRANSLATE_SELECTOR_KEYS.body).candidates.join(', ')` إلى `selectionTarget`، وإضافة مستمع `keydown` (`Escape`) ومستمع `pointerdown` خارج البطاقة على `ctx.document` أثناء فتح `.sel-card`.
  * **اختبار الانحدار:** اختبار وحدة في `tests/modules/d/blockers/explain.test.ts` يتحقق من أن عنصر فحص قادم من `status` (`id: null, source: 'api'`) يشير في `where` إلى `/commits/.../status`.

---

## 3. التقييم النقدي للاختبارات الحالية

على الرغم من اجتياز **98 ملف اختبار (1,661 اختبارًا)** في `vitest` بـ0 أخطاء، كشفت المراجعة أن بنية الاختبارات الحالية اعتمدت في عدة مواضع على **محاكاة معزولة لكل مرحلة (`Single-Wave Harness`)** أخفت عيوب التكامل بين الموجات:

1. **حقن `pageSource` وهمي في اختبارات اللوحة للوحدة (ز):**
   في `tests/modules/g/notes/view.test.tsx` و`tests/modules/g/bookmarks/ui.test.tsx`، تُمرَّر كائنات `PageInfo` جاهزة أو روابط ذات فرع بسيط (`main`)، ولم يُختبر مسار `tabsPageSource` في `sidepanel.html` مقابل `documentPageSource` في سكربت المحتوى على فرع يحوي `/` (وهو السيناريو الذي أوجبت تجربة الجدوى `T-0.4` دعمه)، مما أخفى العيب `MJ-AUDIT-001`.
2. **حقن `access` وهمي في اختبارات الوحدة (ح):**
   في `tests/modules/h/readme/docs-scan.test.tsx` و`tests/modules/h/guide/guide-view.test.tsx`، يُمرَّر كائن `access` مزيّف (`{ available: true, hasPermission: async () => true, ... }`) مباشرةً إلى المكونات، بدل اختبار `githubApiAccess()` الفعلي في بيئة سكربت المحتوى (`api.permissions === undefined`) أو التحقق من مروره عبر `PublicApiClient` الذي أُضيف في `MJ11`، مما أخفى العيب `MJ-AUDIT-002`.
3. **تحديث DOM متزامن في اختبارات `PageDetector`:**
   في `tests/core/detector.test.ts`، يتم تغيير `history.pushState` وتحديث DOM في اللحظة نفسها (`t=0`) قبل انقضاء `settleMs`، فلم يُختبر سيناريو تأخر وصول DOM الجديد في React SPA إلى ما بعد `settleMs = 100ms` (رغم توثيقه في `T-0.2`!)، مما أخفى العيب `MJ-AUDIT-003`.
4. **اختبار ميزات الوحدة (أ) منفردةً عند الإيقاف الجزئي:**
   في `tests/modules/a/isolation/isolation.test.ts` و`tests/modules/a/digits/digits.test.ts`، لم يُختبر تفعيل `isolation` و`digits` معًا ثم إيقاف `isolation` وحدها عبر `ModuleARuntime.reconcile()`، مما أخفى العيب `MJ-AUDIT-006`.
5. **اختبارات `tokenNodes` في الوحدة (ج):**
   في `tests/modules/c/ui/blocks.test.ts:100-113`، اختُبرت حالة تكرر نص رابطين صريحين (`<a>here</a> ... <a>here</a>`)، ولم تُختبر حالة سبق نص عادي غير مربوط (`#7`) لرابط صريح يحمل النص والنوع نفسه (`<a>#7</a>`)، مما أخفى العيب `MJ-AUDIT-005`.

---

## 4. مخاوف غير متحقَّق منها بعد (`Unverified Concerns`) وكيفية حسمها

1. **تطابق محددات DOM الحية على واجهة `github.com` الحالية بعد تاريخ التقاط العينات المرجعية:**
   * **الوصف:** تعتمد الوحدات (أ، ب، ج، د، و، ز، ح) على محددات موثقة في `SelectorsRegistry` وعينات HTML ثابتة التُقطت أثناء `MJ4`–`MJ12`. لم نُجرِ اتصالًا حيًا بصفحات `github.com` الفعلية داخل متصفح حقيقي أثناء هذه المراجعة للتثبت من عدم تغيّر هياكل React/Primer في GitHub منذ تاريخ التقاط العينات.
   * **ما يحسمها:** تشغيل سكربتات التحقق الحية في متصفح فعلي على مستودع عام حقيقي ومراجعة سجل `selectors.fallbacks` و`selectors.misses`.
2. **سلوك اختصارات الأوامر (`Alt+Shift+M` و`Alt+K`) وتفاعل `sidePanel.open` في المتصفحات الأربعة الفعلية (Chrome, Edge, Brave, Firefox):**
   * **الوصف:** توجد في المستودع سكربتات تكامل متصفح مبنية على Playwright/web-ext (مثل `tests/modules/browser/integration.mjs` و`tests/modules/browser/mj10-integration.mjs` و`tests/modules/d/browser/mj11-check.mjs` و`tests/modules/g/browser/mj12-check.mjs`)، وقد سُجلت نتائج تشغيلها السابقة في `evidence/MJ*/`، لكننا **لم نُشغّل المتصفحات الأربعة فعليًا في جلسة المراجعة هذه** («لم يُجرَ»).
   * **ما يحسمها:** تنفيذ `npm run build` متبوعًا بتشغيل سكربتات `tests/modules/browser/*.mjs` في بيئة تتوفر فيها المتصفحات الأربعة ومراجعة تقاريرها الحية.
3. **سلوك إدراج المسودة (`document.execCommand('insertText')`) مع سجل التراجع الأصلي (`Ctrl/⌘+Z`) في محررات GitHub الفعلية:**
   * **الوصف:** في `jsdom` لا تتوفر `document.execCommand('insertText')` فيُختبر المسار الاحتياطي (`setRangeText`). التحقق من بقاء سجل التراجع الأصلي للمتصفح سليمًا بعد الإدراج يتطلب تشغيل اختبار المتصفح الفعلي `tests/modules/f/composer/browser/run.mjs`.

---

## 5. الخلاصة التنفيذية

### أولًا: ما تمت مراجعته فعليًا
* مراجعة شاملة لملفات الحوكمة والقرارات والخطة (`CLAUDE.md`، `DECISIONS.md`، `Docs/MJ/README.md`، `Docs/MJ/waves.json`، ومواصفات `phases/phase-01` إلى `phase-09`، وتقارير المراحل `MJ1` إلى `MJ12`).
* فحص الشيفرة المصدرية الكاملة في `src/core/`، `src/background/`، `src/content/`، `src/sidepanel/`، `src/options/`، `src/shared/`، `src/manifest/`، `src/data/`، وجميع الوحدات المنفَّذة في الموجات الخمس (`src/modules/{a,b,c,d,f,g,h}/`)، ومجموعات اختبارات `tests/` المقابلة لها على الفرع `main` عند الالتزام `6e333faa7a063042e0d541caca810dd48fef748e`.

### ثانيًا: الفحوص والأوامر المنفَّذة ونتائجها الفعلية

| الأمر المنفَّذ | الحالة | النتيجة الفعلية |
| :--- | :--- | :--- |
| `git status --short` و`git rev-parse HEAD` | **أُجريَ** | شجرة العمل نظيفة تمامًا (0 تعديلات قبل حفظ هذا التقرير)، والالتزام `6e333faa7a063042e0d541caca810dd48fef748e` |
| `npm run typecheck` (`tsc --noEmit`) | **أُجريَ** | رمز الخروج `0` — لا أخطاء أنماط (`0 errors`) |
| `node scripts/glossary/validate.mjs` | **أُجريَ** | رمز الخروج `0` — `القاموس صالح: 112 مدخلًا، 52 مصطلحًا أساسيًا، 94 مصطلحًا في المعجم.` |
| `node tools/check.mjs` | **أُجريَ** | رمز الخروج `0` — `فحص الخطة والحالة والملفات المولَّدة سليم.` |
| `npm test` (`vitest run`) | **أُجريَ** | رمز الخروج `0` — نجاح **98 ملف اختبار** (**1,661 اختبارًا ناجحًا**، 2 متخطَّيان خاصان بقياس الذاكرة في GC) خلال `20.82s` |
| `npm run lint:firefox` (`web-ext lint --source-dir dist/firefox`) | **أُجريَ** | رمز الخروج `0` — `0 errors, 0 notices, 0 warnings` |
| تشغيل اختبارات المتصفحات الحقيقية (`Playwright` / Chrome, Edge, Brave, Firefox عبر `tests/modules/browser/*.mjs`) | **لم يُجرَ** | لم يُدعَ أي تحقق متصفح حي في هذه الجلسة؛ الفحوص أعلاه تمت عبر الفحص الثابت و`tsc` و`vitest` (`jsdom`) و`web-ext lint`. |

### ثالثًا: ما يبقى غير متحقَّق منه
* التحقق الحي في المتصفحات الأربعة (Chrome, Edge, Brave, Firefox) من سلوك `sidePanel`، و`execCommand('insertText')`، ومحددات DOM على واجهة `github.com` الحية، وتوقيت إيقاظ عامل الخلفية (`service_worker`) تحت ضغط الذاكرة الفعلي.

### رابعًا: العوائق المؤكدة الواجب إصلاحها قبل بدء الموجة السادسة (`Wave F` / المرحلة `MJ13`)
يُوصى بحسم العيوب الأربعة العالية التالية (إضافةً إلى تنظيف بصمات الملاحظات في `MJ-AUDIT-009` قبل البدء بـ`T-8.4` في `MJ13`) قبل الشروع في الموجة `Wave F`:
1. **`MJ-AUDIT-001`:** إصلاح `tabsPageSource` في اللوحة الأصلية (`sidepanel.html`) لئلا تُحفظ الملاحظات والعلامات بـ`ref`/`path` فاسدة على الفروع المحتوية على `/` ولضمان التقاط بصمات الأسطر فور إنشائها (شرط أساسي قبل بناء استيراد/تصدير الملاحظات `T-8.4` في `MJ13`).
2. **`MJ-AUDIT-002`:** ربط `githubApiAccess` في الوحدة (ح) بـ`PublicApiClient` / `runtimePort` في الخلفية وإضافة `/search/issues` إلى المسارات المسموحة، لإصلاح فشل زر فحص `docs/` وزر أعداد الوسوم في الصفحة والدرج (شرط أساسي قبل التوسع في ميزات API في `MJ15`).
3. **`MJ-AUDIT-003`:** إصلاح بصمة `PageDetector.signature` واستقرار التنقلات المتأخرة في React SPA لضمان إعادة تركيب الوحدات على DOM الصفحة الجديدة (أساسي لجولات `T-3.5` وقوالب `T-7.2` في `MJ13`).
4. **`MJ-AUDIT-004`:** التحقق من تطابق `headSha` بين استجابة `PublicApiClient` وملخص DOM قبل دمج فحوص طلب السحب في `mergeApi` و`explainBlockers` (أساسي قبل إضافة دعم PAT في `T-5.5` ضمن `MJ15`).

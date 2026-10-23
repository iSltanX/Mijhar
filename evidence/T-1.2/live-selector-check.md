# فحص حي لمحددات البذرة وسلوك التنقل على github.com (T-1.2)

- التاريخ: 2026-10-23. الأداة: متصفح التطبيق المدمج (Chromium 152 المعبَّأ في تطبيق Claude)، بقراءة DOM بـ`querySelector` وتسجيل الأحداث فقط. **قراءة فقط**: لم يُنقر زر ولم يُرسل نموذج ولم تُقرأ قيمة أي بيانات حساب (فُحص وجود وسم الدخول بوصفه منطقيًا فقط). أُحمّلت صفحات المستودع العام `octocat/Hello-World` وصفحة `octocat`؛ والتنقل بين التبويبات بنقر روابط التنقل العادية. ملاحظة: كانت الجلسة في المتصفح المدمج مسجَّلة الدخول إلى GitHub، فقد يختلف ما يظهر للزائر المجهول؛ ولم تُفحص صفحات المستودعات الخاصة ولا لوحة المستخدم.
- هذا فحص يدوي موجَّه لتصحيح البذرة وتصميم الكاشف، ولا يُغني عن تجارب `T-0.1` و`T-0.4` (عينات مراجَعة ومتصفحات متعددة).

## 1) محددات `confirm.*` و`content-root` على صفحات حية

كل خانة سلسلة 0/1 بترتيب المرشَّحات في `src/core/detector/selectors.ts` عند الفحص (1 = يطابق عنصرًا). المرشَّحات في الجدول أدناه هي ما كانت قبل تعديلها بنتيجة هذا الفحص، وما بعده هو الجدول الحالي.

| الصفحة (مسار) | المفتاح | المرشَّحات قبل المراجعة (بالترتيب) | النتيجة | الحكم |
| :--- | :--- | :--- | :---: | :--- |
| `/pull/6` (طلب دمج) | `content-root` | `#js-repo-pjax-container` · `#repo-content-pjax-container` · `main` · `[role=main]` | 1110 | الأساسي يطابق |
| `/pull/6` | `confirm.pr` | `#discussion_bucket` · `.pull-discussion-timeline` · `.js-discussion` · `#partial-discussion-header` | 0110 | الأساسي غاب والبدائل تطابق ← أُعيد ترتيبه |
| `/pull/6/changes` (حُوِّل من `/files`) | `confirm.pr-files` | `#files` · `.js-diff-progressive-container` · `[data-testid=diff-view]` · `#diff-comparison-viewer-container` | 0001 | الأخير وحده يطابق ← صار الأول |
| `/` المستودع (`Hello-World`) | `content-root` | كما أعلاه | 0010 | `main` وحده (بديل) |
| المستودع | `confirm.repo` | `#repository-container-header` · `#repo-title-component` · meta octolytics | 101 | بنية React: `#repo-title-component` ← صار الأول وحُذف meta (في `<head>` وقد يبقى من صفحة سابقة) |
| `/tree/master` | `confirm.tree` | `#repository-container-header` · `[aria-labelledby=folders-and-files]` · `table[…]` | 011 | الأول غاب ← أُعيد ترتيبه |
| `/blob/master/README` | `confirm.blob` | `#repos-sticky-header` · … | 10000 | الأساسي يطابق |
| `/issues` (قائمة) | `confirm.issue-list` | `[data-testid=issue-list]` · `.js-navigation-container` · `#js-issues-toolbar` | **000** | **لا شيء يطابق** ← بُدّل بـ`[data-testid=issues-list-surface]` و`issue-listitem-title-link` |
| `/pulls` (قائمة) | `confirm.pr-list` | `#js-issues-toolbar` · `.js-navigation-container` · `[data-testid=issue-list]` | **000** | **لا شيء يطابق** ← بُدّل بـ`[data-testid=listitem-title-link]` و`#repo-pulls-dashboard-filter` |
| `/issues/11603` (مشكلة) | `confirm.issue` | `#partial-discussion-header` · `[data-testid=issue-viewer-container]` · `.js-discussion` | **000** | **لا شيء يطابق** ← بُدّل بـ`issue-viewer-issue-container` و`issue-header` و`issue-title` (وُجدت بالفحص) |
| `/commit/<sha>` | `confirm.commit` | `.commit` · `#diff-comparison-viewer-container` · `.js-diff-progressive-container` · `#files` | **00000** | **لا شيء يطابق** ← بُدّل بـ`#diff-content-parent` و`#diff_file_tree` (أسماء الفئات مجزّأة `…__PiJ49A` فلا يُعتمد عليها) |
| `/octocat` (ملف شخصي) | `confirm.profile` | `.h-card` · `.vcard-names` · `.orghead` · `[itemtype=Person]` | 1101 | يطابق |
| `/issues` و`/pulls` | `content-root` | كما أعلاه | 1010 / 1110 | `#repo-content-turbo-frame` موجود فأُضيف مرشَّحًا |

**لم يُقَس:** `confirm.actions-run` و`confirm.discussion` (المستودع المختار بلا تشغيلات ولا نقاشات)، و`confirm.home` (لوحة المستخدم). هي بذرة لم تُثبَت وتبقى كذلك في وصف المفتاح.

**الأثر:** لو بقيت البذرة الأصلية لظلّت الثقة `low` على صفحات المشكلات والقوائم والالتزامات الحية، فلا تُركَّب فيها وحدة تشترط `minConfidence: 'high'`. وهذا بالتحديد ما يعزله `SelectorsRegistry`: الفحص كشف ذلك وأُصلح في الجدول وحده.

## 2) سلوك التنقل: لا Turbo في ما قيس

سُجّلت أحداث `turbo:*` وNavigation API وتعديلات DOM أثناء نقر روابط تبويبات. النتائج (الأزمنة بالميلي ثانية منذ النقر):

| التنقل | أحداث Turbo | تغيّر المسار | وصول DOM | هويات body والحاوية والعنوان |
| :--- | :--- | :--- | :--- | :--- |
| قائمة المشكلات ← قائمة طلبات الدمج (React) | `turbo:click` فقط؛ لا `turbo:render` ولا `turbo:load` ولا `turbo:frame-*` | ~13 (`navigate` وcurrententrychange وnavigatesuccess) | ~236 (أول تعديل داخل `#repo-content-turbo-frame`) | body والإطار بقيا؛ **عنصر `<title>` استُبدل** |
| قائمة طلبات الدمج ← قائمة المشكلات (React، المرة الثانية) | لا شيء | ~13 | ~236 | كما أعلاه |
| محادثة طلب الدمج ← تبويب الالتزامات | لا شيء إطلاقًا | ~508 (`navigatesuccess` بعد وصول DOM) | من ~111 إلى ~152 (والمسار ما زال القديم) | body والحاوية والعنوان بقيت |

**الدروس:** (أ) كاشف قائم على `turbo:render`/`turbo:load` وحدهما لا يرى هذه التنقلات (وهما سلوك المحاكاة في `TEST-NAV-01` فقط). (ب) الترتيب بين المسار وDOM يختلف بين الحالتين، فلا يُحكم على DOM لحظة تغيّر المسار. (ج) مراقبة `<title>` عديمة الجدوى. لذلك يعتمد `PageDetector` على Navigation API (`navigatesuccess` وcurrententrychange) وعلى تعديلات شجرة `body`، ويفحص بعد «هدوء» (`settleMs`) لا فورًا، ويبقى Turbo مصدرًا فوريًا إن أُطلق. اختُبر هذا في المتصفحات الحقيقية بسكربت محتوى فعلي (`evidence/T-1.3/browser-report.md`، قسم تنقل SPA).

**حدود:** Navigation API موجود في Chromium 152 (المقيس هنا) وفي Chrome 156 وEdge 155 وBrave 156 (تجربة الإضافة)، وفي Firefox 158.0.1 (فُحص بـMarionette: `typeof window.navigation === 'object'`)، لكن لم يُجرَ اكتشاف تنقل SPA بسكربت محتوى فعلي في Firefox (لا اعتراض لصفحات github.com هناك)، فتغطيه اختبارات الوحدة فقط. ولم يُقَس سلوك التنقل في صفحات أخرى غير ما في الجدول.

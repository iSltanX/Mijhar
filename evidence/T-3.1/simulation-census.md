# حصر عبارات المحاكاة التي أُزيلت — T-3.1

الحصر الأولي في الخطة: 11 مدخلًا. الحصر المستكمَل بعد قراءة المدخلات الـ107 كلها قراءةً يدوية: **22 مدخلًا** تأثرت بإزالة نص محاكاة أو مثال/مسار شخصي من المشروع السابق، منها **14** بنصوص محاكاة صريحة و9 بأمثلة أو مسارات شخصية. المصدر الآلي: scripts/glossary/removed-log.json (كل بند بنصه المُزال وبديله وسببه).

## الأحد عشر المذكورة في الخطة

- `delete_repo` — أُزيل (detailed)
- `webhook` — أُزيل (detailed)
- `nav-search` — أُزيل (route، brief، medium، detailed)
- `nav-create` — أُزيل (detailed)
- `nav-profile-menu` — أُزيل (detailed)
- `pr-merge-demo` — أُزيل (*)
- `actions-run-row` — أُزيل (detailed)
- `settings-theme-toggle` — أُزيل (medium، detailed)
- `settings-2fa-enable` — أُزيل (medium، detailed)
- `settings-ssh-add` — أُزيل (medium، detailed)
- `settings-danger-delete` — أُزيل (detailed، detailed)

## ما زاد على الحصر الأولي

- `repository` — route (مسار)، example — مسار الصفحة في المحاكاة (مستودع شخصي من المشروع السابق)
- `nav-notifications` — route (مسار) — مسار الصفحة في المحاكاة (مستودع شخصي من المشروع السابق)
- `profile-edit-btn` — route (مسار) — مسار الصفحة في المحاكاة (مستودع شخصي من المشروع السابق)
- `release` — example — اسم ملف من تطبيق شخصي في المشروع السابق
- `clone_https` — example — رابط مستودع شخصي من المشروع السابق
- `clone_ssh` — example — رابط مستودع شخصي من المشروع السابق
- `clone_cli` — example — اسم مستودع شخصي من المشروع السابق
- `license` — example — مثال بمستودع شخصي من المشروع السابق
- `search_repos` — detailed — إشارة إلى بحث المحاكاة الذي يشمل المصطلحات والإعدادات
- `repos-new-btn` — brief — نموذج تعليمي خاص بالمحاكاة
- `settings-privacy-toggle` — medium، detailed — مفاتيح فورية الحفظ خاصة بالمحاكاة

## جدول البنود

| المدخل | الحقل | النوع | السبب |
| :--- | :--- | :--- | :--- |
| `repository` | route | simulation | مسار الصفحة في المحاكاة (مستودع شخصي من المشروع السابق) |
| `nav-search` | route | simulation | مسار الصفحة في المحاكاة (مستودع شخصي من المشروع السابق) |
| `nav-notifications` | route | simulation | مسار الصفحة في المحاكاة (مستودع شخصي من المشروع السابق) |
| `profile-edit-btn` | route | simulation | مسار الصفحة في المحاكاة (مستودع شخصي من المشروع السابق) |
| `pr-merge-demo` | * | simulation | مدخل يصف رسم المحاكاة التفاعلي في المشروع السابق وليس عنصرًا في GitHub؛ وطرق الدمج الثلاث مشروحة في مداخلها (الدمج بضغط الالتزامات، إعادة الأساس والدمج، التزام الدمج). |
| `repository` | example | simulation | مثال بمستودع شخصي من المشروع السابق |
| `release` | example | simulation | اسم ملف من تطبيق شخصي في المشروع السابق |
| `clone_https` | example | simulation | رابط مستودع شخصي من المشروع السابق |
| `clone_ssh` | example | simulation | رابط مستودع شخصي من المشروع السابق |
| `clone_cli` | example | simulation | اسم مستودع شخصي من المشروع السابق |
| `license` | example | simulation | مثال بمستودع شخصي من المشروع السابق |
| `delete_repo` | detailed | simulation | جملة عن سلوك المحاكاة لا عن GitHub |
| `webhook` | detailed | simulation | جملة عن سلوك المحاكاة لا عن GitHub |
| `nav-search` | brief | simulation | وصف بحث المحاكاة (المصطلحات والشروحات) لا بحث GitHub |
| `nav-search` | medium | simulation | وصف بحث المحاكاة (مصطلحات القاموس ومسارات التعلم) لا بحث GitHub |
| `nav-search` | detailed | simulation | مقارنة بين المحاكاة وGitHub الحقيقي وترتيب نتائج خاص بالمحاكاة |
| `nav-create` | detailed | simulation | جملة عن خيارات غير مفعّلة في المحاكاة |
| `nav-profile-menu` | detailed | simulation | اختصاران خاصان بالتطبيق التعليمي وتسجيل خروج معلوماتي |
| `search_repos` | detailed | simulation | إشارة إلى بحث المحاكاة الذي يشمل المصطلحات والإعدادات |
| `repos-new-btn` | brief | simulation | نموذج تعليمي خاص بالمحاكاة |
| `actions-run-row` | detailed | simulation | وصف توسيع الصف كأكورديون والمقارنة بـGitHub الحقيقي |
| `settings-privacy-toggle` | medium | simulation | مفاتيح فورية الحفظ خاصة بالمحاكاة |
| `settings-privacy-toggle` | detailed | simulation | مفاتيح فورية الحفظ خاصة بالمحاكاة |
| `settings-theme-toggle` | medium | simulation | حفظ التفضيل في متصفح المحاكاة لا في حساب GitHub |
| `settings-theme-toggle` | detailed | simulation | مقارنة بين المحاكاة وحساب GitHub الحقيقي في حفظ المظهر |
| `settings-2fa-enable` | medium | simulation | نموذج تعليمي لا يولّد سرًّا حقيقيًا |
| `settings-2fa-enable` | detailed | simulation | فقرة عن الفارق بين المحاكاة والتفعيل الحقيقي |
| `settings-ssh-add` | medium | simulation | جملة عن سلوك المحاكاة |
| `settings-ssh-add` | detailed | simulation | مقارنة بين المحاكاة وGitHub الحقيقي |
| `settings-danger-delete` | detailed | simulation | جملة عن سلوك المحاكاة |
| `settings-danger-delete` | detailed | simulation | مقارنة بين المحاكاة وGitHub الحقيقي |

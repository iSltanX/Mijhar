# مطابقة تصريحات الصلاحية والتراجع على وثائق GitHub — T-3.1

تاريخ المطابقة: 2026-10-23. الوثائق: مصدر github/docs المفتوح (المحتوى نفسه المنشور في docs.github.com). `verified`: طُوبق التصريح على نص صفحة قُرئت في هذه الجلسة؛ `unverified`: لم يُطابَق على نص صريح (الحكم من معرفة عامة أو لم تُقرأ العبارة)، فلا يُعامل مصدرًا نهائيًا.

- طوبقت: 43 · لم تُطابَق: 69 · الإجمالي: 112

## ما طوبق

| المدخل | الصلاحية | الصفحة | ما طوبق |
| :--- | :--- | :--- | :--- |
| `repository` | None | repositories/creating-and-managing-repositories/about-repositories | طوبقت صلاحية الحذف وعدم التراجع عن صلاحيات الفرق ونافذة 90 يومًا وشرط شبكة النسخ المتفرعة على صفحتي حذف المستودع واستعادته. |
| `branch` | Write | pull-requests/reference/branches | طوبق اشتراط الكتابة لإنشاء الفرع وحذفه، وإغلاق الطلبات المفتوحة بحذف فرعها، واسترجاع الفروع من طلب مغلق أو مدموج (صفحتا إدارة الفروع وحذفها واستعادتها). |
| `pull_request` | Write | pull-requests/get-started/about-pull-requests | طوبق اشتراط الكتابة لفتح طلب من فرع داخل المستودع، وعدم الحاجة إليها عند العمل من نسخة متفرعة، وعكس طلب مدموج بطلب جديد. |
| `issue` | Read | issues/tracking-your-work-with-issues/learning-about-issues/about-issues | طوبقت صلاحية الإغلاق (Triage فأعلى في المنظمات، وصاحب المشكلة) وأن الحذف نهائي ويحتاج Admin أو Owner (صفحتا إغلاق مشكلة وحذفها). |
| `fork` | Read | pull-requests/get-started/about-forks | طوبق استقلال النسخة المتفرعة عن الأصل (صفحة الفروع المتفرعة)، وحذف نسخ المستودع الخاص عند حذفه (صفحة حذف المستودع). |
| `star` | None | get-started/exploring-projects-on-github/saving-repositories-with-stars | طوبق إلغاء النجمة بالضغط على Starred وإزالة المستودع من القائمة. |
| `download_zip` | Read | repositories/working-with-files/using-files/downloading-source-code-archives | طوبق أن الأرشيف لقطة من الفرع أو الوسم أو الالتزام ولا يحوي كامل السجل، وأن الاستنساخ هو الطريق لسجل كامل. |
| `topics` | Admin | repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics | طوبقت صلاحية مديري المستودع (Admin) لإضافة الوسوم وحد العشرين وسمًا في صفحة الوثائق؛ وحذف الوسم في أي وقت من حكم الواجهة العام. |
| `create_new_file` | Write | repositories/working-with-files/managing-files/creating-new-files | طوبق اشتراط صلاحية الكتابة وإنشاء المجلدات الفرعية بكتابة / في اسم الملف. |
| `upload_files` | Write | repositories/working-with-files/managing-files/adding-a-file-to-a-repository | طوبقت حدود الرفع: 25 ميبيبايت للملف عبر المتصفح و100 عبر سطر الأوامر وحتى 100 ملف دفعة واحدة؛ وبقية عبارات التراجع من معرفة Git العامة. |
| `pin_repo` | None | account-and-profile/how-tos/profile-customization/pinning-items-to-your-profile | طوبق حد الستة عناصر (مستودعات وGists معًا)؛ وإلغاء التثبيت وإعادة الترتيب من حكم الواجهة العام. |
| `visibility_private` | Admin | repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility | طوبق أن تحويل المستودع إلى خاص يوقف قراءة Git المجهولة ويعطّل قواعد تنبيه مخصصة وقواعد الدفع (rulesets) المعيّنة له، وأن المنظمة قد تقصر التغيير على مالكيها. |
| `archive_repo` | Admin | repositories/archiving-a-github-repository/archiving-repositories | طوبق كون المستودع المؤرشف للقراءة فقط في عناصره، وإمكانية إلغاء الأرشفة من منطقة الخطر؛ وصلاحية Admin حكم عام لم يُطابَق على نص صريح. |
| `delete_repo` | Admin | repositories/creating-and-managing-repositories/deleting-a-repository | طوبقت الصلاحية (Admin أو مالك المنظمة)، ونافذة 90 يومًا، وشرط شبكة النسخ المتفرعة، وعدم استعادة صلاحيات الفرق، وحذف نسخ المستودع الخاص (صفحتا حذف المستودع واستعادته). |
| `transfer_ownership` | Admin | repositories/creating-and-managing-repositories/transferring-a-repository | طوبق: قبول النقل بين حسابين شخصيين خلال يوم، وإضافة المالك السابق متعاونًا، وإعادة توجيه الروابط والاستنساخ، وسحب اسم المستودع المشهور نهائيًا؛ وتفصيل الصلاحية في المنظمات لم يُطابَق. |
| `rebase_merge` | Write | repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github | طوبق أن إعادة الأساس والدمج قد تتطلب إعادة أساس محليًا ودفعًا قسريًا حذرًا؛ وإعادة كتابة SHA حكم Git عام. |
| `merge_conflict` | Write | pull-requests/how-tos/merge-and-close-pull-requests/resolving-a-merge-conflict-on-github | طوبق أن التعارضات البسيطة تُحل من محرر GitHub والمعقدة من سطر الأوامر؛ وصلاحية الكتابة وإمكانية إعادة المحاولة حكم عام. |
| `two_factor` | None | authentication/securing-your-account-with-two-factor-authentication-2fa/disabling-two-factor-authentication-for-your-personal-account | طوبق على صفحتي تعطيل المصادقة الثنائية وطرق الاسترداد: فقدان الوصول إلى منظمات تشترطها عند التعطيل، وعدم إمكان التعطيل لبعض الحسابات الملزَمة، واستعمال رمز الاسترداد مرة واحدة وإبطال المجموعة القديمة بتوليد جديدة. |
| `passkey` | None | authentication/authenticating-with-a-passkey/about-passkeys | طوبق أن بعض مفاتيح المرور مقيّدة بجهاز واحد ولا يمكن نسخها أو نقلها (صفحة الوثائق)؛ والحذف من الإعدادات حكم واجهة عام. |
| `ssh_key` | None | authentication/keeping-your-account-and-data-secure/reviewing-your-ssh-keys | طوبق على صفحة مراجعة مفاتيح SSH: حذف مفتاح غير مصرَّح أو مشتبه فيه يمنع المهاجم من الوصول إلى المستودعات؛ وبقاء المفتاح الخاص على الجهاز حكم عام. |
| `personal_access_token` | None | authentication/keeping-your-account-and-data-secure/token-expiration-and-revocation | طوبق على صفحة انتهاء الرموز وإبطالها: الرمز المنتهي أو المُبطَل لا يُستعاد ولا يصلح للمصادقة؛ وعلى صفحة إدارة الرموز أنه بديل عن كلمة المرور. |
| `fine_grained_token` | None | authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens | طوبق أن الرمز الدقيق لا يدعم كل مهام الرمز الكلاسيكي، وأن مدة الانتهاء غير المحدودة مسموحة لكن قد تمنعها سياسة المنظمة؛ وقد صُحّح بذلك ادعاء المصدر «تاريخ انتهاء إلزامي». |
| `github_app` | None | apps/using-github-apps/reviewing-and-revoking-authorization-of-github-apps | طوبق على صفحة مراجعة تفويض تطبيقات GitHub وإلغائه: لا يلغي التفويض إلا من فوّض، ويمكن للمالكين إلغاء التثبيت فقط. |
| `webhook` | Admin | webhooks/using-webhooks/disabling-webhooks | طوبق على صفحة تعطيل الخطافات: التعطيل يوقف الإرسال ويقبل إعادة التفعيل، والحذف لا يُستعاد؛ وصلاحية Admin حكم عام لم يُطابَق. |
| `push_protection` | Admin | code-security/concepts/secret-security/push-protection | طوبق أن حماية الدفع معطلة افتراضيًا ويفعّلها مدير المستودع أو مالك المنظمة أو مدير الأمان أو مالك المؤسسة (صفحة الوثائق)؛ وتفصيل التجاوز لم يُقرأ. |
| `environment` | Admin | actions/concepts/workflows-and-actions/deployment-environments | طوبق حد ستة مراجعين مطلوبين كحد أقصى، وأن المراجعين يلزم أن تكون لديهم قراءة على الأقل، وأن المراجعين المطلوبين في الخطط المجانية والفريق متاحون للمستودعات العامة فقط (صفحة المرجع)؛ وصلاحية Admin لم تُطابَق على نص صريح. |
| `pages_deploy` | Maintain | pages/getting-started-with-github-pages/unpublishing-a-github-pages-site | طوبق على صفحة إلغاء نشر موقع Pages: يلغيه من يملك Admin أو Maintain، ولا يتأثر المستودع ولا محتواه، وهو ليس حذفًا للموقع. |
| `collaborator` | Admin | repositories/managing-your-repositorys-settings-and-features/repository-access-and-collaboration/permission-levels-for-a-personal-account-repository | طوبق: مستودع الحساب الشخصي بمستويين فقط (مالك ومتعاون)، والمتعاون في المستودع الخاص يحصل على الكتابة لا القراءة وحدها، ولا وصول قبل قبول الدعوة (صفحتا مستويات الصلاحية ودعوة المتعاونين)؛ وقد صُحّح بذلك ادعاء المصدر عن تدرج الأدوار. |
| `wiki` | Write | communities/documenting-your-project-with-wikis/changing-access-permissions-for-wikis | طوبق أن تعديل ويكي المستودع العام محصور افتراضيًا بالمتعاونين وأنه يُفتح بإلغاء خيار تقييد التعديل بالمتعاونين فقط؛ وقد صُحّح بذلك ادعاء المصدر. أما سجل Git للويكي فحكم عام. |
| `prerelease` | Write | repositories/releasing-projects-on-github/managing-releases-in-a-repository | طوبق أن تغيير تعليم الإصدار بين تجريبي وأحدث إصدار يبقى ممكنًا حتى مع الإصدارات غير القابلة للتعديل، وأن الكتابة تكفي لتعديل الإصدار. |
| `billing_plan` | Owner | billing/concepts/budgets-and-alerts | طوبق أن الميزانيات تتبع الإنفاق على المنتجات المقيسة وأن الميزانية الصارمة تمنع الاستهلاك الإضافي؛ وقد استُبدل بها مصطلح «حد الإنفاق» القديم في المصدر. |
| `profile-pinned-repos` | None | account-and-profile/how-tos/profile-customization/pinning-items-to-your-profile | طوبق حد ستة عناصر (مستودعات وGists معًا) وتخصيص التثبيت من الملف الشخصي. |
| `repo-tab-issues` | Read | issues/tracking-your-work-with-issues/learning-about-issues/about-issues | طوبقت صلاحيات الإغلاق ونهائية الحذف على صفحتي إغلاق المشكلة وحذفها. |
| `repo-tab-pulls` | Read | pull-requests/get-started/about-pull-requests | طوبق عكس الطلب المدموج بطلب جديد على صفحة عكس طلب السحب. |
| `about-panel` | Read | repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/classifying-your-repository-with-topics | طوبقت صلاحية Admin لإضافة الوسوم وحدها؛ وبقية العناصر لم تُطابَق. |
| `add-file-menu` | Write | repositories/working-with-files/managing-files/adding-a-file-to-a-repository | طوبقت حدود الرفع من المتصفح واشتراط الكتابة لإنشاء الملفات من صفحتي إضافة الملف وإنشاء ملفات جديدة. |
| `release-new-btn` | Write | repositories/releasing-projects-on-github/managing-releases-in-a-repository | طوبقت صلاحية الكتابة لإنشاء الإصدار وتعديله وحذفه، وقيود الإصدارات غير القابلة للتعديل. |
| `settings-visibility` | Admin | repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility | طوبق أن المنظمة قد تقصر تغيير الظهور على مالكيها وأن التحويل إلى خاص يوقف قراءة Git المجهولة. |
| `settings-2fa-enable` | None | authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication | طوبق على صفحتي تعطيل المصادقة الثنائية وطرق الاسترداد: فقدان الوصول إلى منظمات تشترطها عند التعطيل، واستعمال رمز الاسترداد مرة واحدة وإبطال المجموعة القديمة بتوليد جديدة. |
| `settings-ssh-add` | None | authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account | طوبق على صفحة مراجعة مفاتيح SSH أن حذف المفتاح يمنع الوصول به؛ ووجود صفحة إضافة المفتاح لا يغيّر الحكم. |
| `settings-danger-delete` | Admin | repositories/creating-and-managing-repositories/deleting-a-repository | طوبقت حدود الحذف (90 يومًا وشروطها) وإلغاء الأرشفة وقبول النقل بين حسابين شخصيين على صفحاتها. |
| `checks` | Read | pull-requests/reference/status-checks | طوبق في صفحتي حالات الفحوص وحماية الفروع أن الفحوص تتدرج بين حالات وتنتهي بنتيجة، وأن اشتراط نجاحها قبل الدمج يُفرض بقاعدة حماية. |
| `draft_pull_request` | Write | pull-requests/how-tos/create-pull-requests/changing-the-stage-of-a-pull-request | طوبق في صفحة تغيير مرحلة الطلب: من يغيّرها (الكتابة وصاحب الطلب)، وعدم إمكان دمجه إلى أن يُعلَّم جاهزًا، وبقاء اشتراك المشتركين عند التحويل إلى مسودة. |

## ما لم يُطابَق بعد

| المدخل | الحساسية | سبب عدم المطابقة |
| :--- | :--- | :--- |
| `commit` | آمن | صفحة الوثائق تصف الالتزامات ولا تنص على التراجع بـrevert؛ الحكم من معرفة Git العامة ولم يُطابَق على صفحة GitHub. |
| `release` | حساس | طوبقت صلاحية الكتابة وقيود الإصدارات غير القابلة للتعديل على صفحة إدارة الإصدارات؛ ولم تُطابَق عبارة «حذف الإصدار لا يحذف الوسم» على نص صريح. |
| `tag` | حساس | طوبق قيد الإصدارات غير القابلة للتعديل على وثائق الإصدارات؛ وبقية الحكم من معرفة Git العامة ولم تُطابَق على صفحة GitHub. |
| `watch` | آمن | طوبق أن الاشتراك يُلغى من زر Unsubscribe أو بإيقاف المراقبة؛ وبقاء الإشعارات السابقة في الصندوق لم يُطابَق على نص صريح. |
| `workflow` | حساس | الحكم مبني على أن سير العمل ملف في المستودع (Git يحفظ نسخه)؛ لم يُطابَق على نص صريح في صفحة الوثائق. |
| `action` | حساس | الحكم مبني على أن الإجراء سطر في ملف سير العمل؛ لم يُطابَق على نص صريح في صفحة الوثائق. |
| `deployment` | حساس | لم تُطابَق عبارتا «سجل النشر لا يُحذف» و«الموافقة قبل النشر» على نص صريح في الصفحة. |
| `contributions` | آمن | الصفحة تصف عرض المساهمات؛ وإخفاء المساهمات الخاصة من الإعدادات لم يُطابَق على نص ظاهر في الاستخراج. |
| `followers` | آمن | الحكم الخاص بالحظر لم يُطابَق على نص صريح؛ المطابَق أن المتابعة اجتماعية وتُلغى بإلغاء المتابعة. |
| `following` | آمن | طوبقت إمكانية إلغاء المتابعة بزر Unfollow؛ وعدم إشعار الطرف الآخر لم يُطابَق على نص صريح. |
| `clone_https` | آمن | طوبق أن روابط HTTPS متاحة لكل المستودعات وأن Git يطلب بيانات الدخول للمستودعات الخاصة؛ ولم يُطابَق صراحةً أن الاستنساخ لا يغيّر شيئًا في GitHub. |
| `clone_ssh` | آمن | لم تُطابَق عبارات التراجع على نص صريح في صفحة الاستنساخ. |
| `clone_cli` | آمن | صفحة التعريف بالأداة لا تتناول التراجع؛ الحكم مبني على طبيعة الاستنساخ. |
| `readme` | آمن | صفحة التعريف لا تتناول التراجع؛ الحكم مبني على أن README ملف عادي في Git. |
| `license` | آمن | الصفحة تنص على حق المستخدمين الآخرين في عرض المستودع العام ونسخه المتفرعة؛ وعبارة بقاء الشروط السابقة حكم قانوني عام لم يُطابَق على نص صريح ولا يُعدّ استشارة قانونية. |
| `default_branch` | حساس | طوبقت صلاحية Admin لتغيير الفرع الافتراضي؛ أما أثر التغيير في الطلبات المفتوحة فلم يُطابَق على نص صريح. |
| `commit_changes` | آمن | طوبق أن إنشاء الملفات من المتصفح يحتاج صلاحية الكتابة؛ وبقية عبارات التراجع من معرفة Git العامة. |
| `visibility_public` | حساس | طوبق أن المنظمة قد تقصر تغيير الظهور على مالكيها؛ وعبارات النسخ والفهرسة بعد النشر العام لم تُطابَق على نص صريح في الصفحة. |
| `squash_merge` | حساس | طوبقت صفحة أساليب الدمج (تخصيصها بدفع الوصول) وعكس الطلب المدموج بطلب جديد؛ ولم يُطابَق نص «التفاصيل تبقى في صفحة الطلب». |
| `merge_commit` | حساس | طوبق عكس الطلب المدموج بطلب جديد؛ وبقية الأحكام من معرفة Git العامة. |
| `force_push` | خطر | طوبق أن قاعدة الحماية تمنع الدفع القسري افتراضيًا؛ وعبارة عدم ضمان بقاء الالتزامات القديمة لم تُطابَق على نص صريح. |
| `branch_protection` | حساس | طوبق أن كل قاعدة تمنع الدفع القسري والحذف افتراضيًا ويمكن تعطيل ذلك؛ وصلاحية Admin وعبارة الأثر الفوري لم تُطابَقا على نص صريح. |
| `ruleset` | حساس | لم تُقرأ تفاصيل الصلاحية ولا وضع التقييم من صفحة الوثائق؛ الحكم من معرفة عامة. |
| `tag_protection` | حساس | طوبق أن مجموعات القواعد تستهدف الفروع والوسوم؛ ولم تعد وثائق GitHub تحوي صفحة لقواعد حماية الوسوم القديمة. وصلاحية Admin وبقية العبارات لم تُطابَق على نص صريح. |
| `gpg_key` | حساس | لم تُقرأ عبارات الحذف وأثره في الشارة من صفحات الوثائق. |
| `verified_commit` | آمن | لم تُقرأ عبارة تغير الشارة بعد حذف المفتاح من الصفحة. |
| `oauth_app` | حساس | صفحة الوثائق تقارن بين التطبيقات؛ عبارات الإلغاء والأثر لم تُطابَق على نص صريح. |
| `secret_scanning` | آمن | صفحة الوثائق مدخل لمفاهيم أمان الأسرار؛ لم تُقرأ عباراتها التفصيلية. وصلاحية Admin لتفعيله طُوبقت على صفحة حماية الدفع. |
| `dependabot_alerts` | آمن | لم تُقرأ تفاصيل الصلاحية ولا عبارات الإغلاق من صفحة الوثائق. |
| `code_scanning` | آمن | لم تُقرأ تفاصيل الصلاحية ولا عبارات الإغلاق من صفحة الوثائق. |
| `security_policy` | آمن | صفحة الوثائق تشرح إضافة السياسة؛ لم تُقرأ عبارات الصلاحية. |
| `secrets_var` | حساس | طوبق أن الأسرار لا تُقرأ مباشرة في الشروط (if:) وأن القيم الحساسة غير الأسرار تُقنَّع بـ::add-mask::؛ وعدم إمكان قراءتها بعد الحفظ لم يُطابَق على نص صريح في الاستخراج. |
| `variables` | آمن | لم تُقرأ صلاحية الإدارة ولا عبارات التعديل والحذف من صفحة الوثائق. |
| `runner` | آمن | لم تُقرأ عبارات الصلاحية ولا التنظيف من صفحة الوثائق. |
| `artifact` | آمن | وُجدت صفحتا المُخرَجات وحذفها في الوثائق؛ ولم تُقرأ عباراتهما. |
| `codespaces` | آمن | لم تُقرأ عبارات الحذف ولا الحصة من صفحة الوثائق. |
| `team_permission` | حساس | لم تُقرأ تفاصيل الصلاحية ولا الوراثة من صفحة الوثائق. |
| `insights` | آمن | الحكم مبني على أن التبويب عرض بيانات؛ لم يُطابَق على نص صريح. |
| `project_board` | آمن | لم تُقرأ عبارات الأرشفة والحذف ولا تفاصيل الصلاحية من صفحة الوثائق. |
| `package_registry` | آمن | وُجدت صفحة الأذونات؛ ولم تُقرأ مدة الاستعادة وشروطها. |
| `draft_release` | آمن | طوبقت صلاحية الكتابة على الإصدارات؛ وعبارات المسودة والوسم لم تُطابَق على نص صريح. |
| `nav-search` | آمن | لم تُقرأ صفحة الوثائق؛ الحكم من طبيعة البحث. واختصار / يوافق صفحة اختصارات لوحة المفاتيح. |
| `nav-create` | آمن | لم تُقرأ صفحة الوثائق؛ الخيارات المعروضة تختلف باختلاف نوع الحساب والخطة. |
| `nav-notifications` | آمن | لم تُقرأ عبارات التعليم بالمقروء والمنجز من صفحة الوثائق. |
| `nav-profile-menu` | آمن | لم تُقرأ صفحة الوثائق؛ محتوى القائمة يتغير بتغير الواجهة. |
| `search_repos` | آمن | صفحة الوثائق تخص البحث في GitHub كله لا حقل التصفية في قائمة مستودعاتك؛ ولم تُطابَق. |
| `repos-new-btn` | آمن | لم تُقرأ صفحة الوثائق؛ حدود الاستعادة مأخوذة من مدخل حذف المستودع الموثَّق. |
| `profile-edit-btn` | آمن | لم تُقرأ حقول النموذج الحالية من صفحة الوثائق. |
| `profile-followers` | آمن | طوبق إلغاء المتابعة بزر Unfollow؛ ولم تُطابَق عبارة الرقمين كرابطين على نص صريح. |
| `profile-contrib-graph` | آمن | وُجدت صفحة المساهمات وصفحة رؤية المساهمات الخاصة؛ ولم تُقرأ عباراتهما. |
| `repo-tab-code` | آمن | الحكم من طبيعة التبويب؛ لم يُطابَق على نص صريح. |
| `repo-tab-actions` | حساس | وُجدت صفحات إدارة التشغيلات (إلغاء وحذف وتعطيل)؛ ولم تُقرأ صلاحياتها. |
| `repo-tab-releases` | آمن | لم تُقرأ عبارة رؤية المسودات من صفحة الوثائق. |
| `repo-tab-wiki` | آمن | طوبقت قيود التعديل في صفحة صلاحيات الويكي؛ ولم تُقرأ صفحة «حول الويكي». |
| `repo-tab-security` | آمن | طوبقت صلاحية Admin ومدير الأمان لتفعيل حماية الدفع؛ وظهور التبويب لغير الإداريين لم يُطابَق على نص صريح. |
| `repo-tab-insights` | آمن | الحكم مبني على أن التبويب عرض بيانات؛ لم يُطابَق على نص صريح. |
| `repo-tab-settings` | حساس | لم يُطابَق ظهور التبويب لمن لا يملك Admin على نص صريح، ولا أي من أدوار الصيانة (Maintain). |
| `file-tree` | آمن | الحكم من طبيعة العرض؛ لم يُطابَق على نص صريح. |
| `readme-block` | آمن | الحكم مبني على أن README ملف عادي في Git. |
| `branch-select` | آمن | الحكم من طبيعة العرض؛ لم يُطابَق على نص صريح. |
| `tag-list` | حساس | الحكم من طبيعة العرض؛ لم يُطابَق على نص صريح. |
| `actions-run-row` | آمن | وُجدت صفحات الإلغاء والحذف؛ ولم تُقرأ عباراتها. |
| `settings-privacy-toggle` | حساس | وُجدت صفحة إدارة ظهور المساهمات الخاصة؛ ولم تُقرأ تفاصيلها. |
| `settings-theme-toggle` | آمن | وُجدت صفحة إعدادات المظهر؛ ولم تُقرأ عبارة حفظ التفضيل في الحساب. |
| `settings-branch-protect-add` | حساس | وُجدت صفحة إدارة القاعدة؛ ولم تُقرأ صلاحيتها. |
| `rebase` | حساس | طوبق أن إعادة الأساس والدمج تتطلب أحيانًا إعادة أساس محليًا ودفعًا قسريًا حذرًا؛ وعبارة reflog من معرفة Git العامة. |
| `close_issue` | آمن | طوبقت صلاحية الإغلاق وأن الإغلاق يعبّر عن إصلاح الخطأ أو التنفيذ أو عدم الجدولة؛ وإعادة الفتح لم تُطابَق على نص صريح في الاستخراج. |
| `close_with_comment` | آمن | طوبقت صلاحية الإغلاق؛ وعبارات الإشعار والتعديل من معرفة الواجهة العامة ولم تُطابَق على نص صريح. |
| `pr_review` | آمن | طوبقت خيارات المراجعة الثلاثة وأن القراءة تكفي للمراجعة والتعليق وأن طلب المراجعة يحتاج كتابة؛ وعبارتا إلغاء المراجعة والإشعار لم تُطابَقا على نص صريح. |

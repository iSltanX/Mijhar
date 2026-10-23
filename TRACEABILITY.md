# التتبع: ميزة ← مهمة ← مرحلة ← معيار قبول ← اختبار

> **ملف مولَّد** من `data/plan.json` و`data/status.json` بالأمر `node tools/build.mjs`؛ لا تحرّره يدويًا، وعدّل البيانات ثم أعد التوليد. تاريخ البيانات: `2026-10-23`. لا يحوي هذا الملف أي تقدير زمني.

## نتيجة الفحص الآلي

- **فشل** فحص `tools/check.mjs` لسلامة البيانات ومطابقة `EXECUTION_PLAN.md`: 1 خطأ.
- 56 ميزة في 8 وحدات؛ لكلٍّ منها مهمة منفِّذة واحدة تحمل معيار قبولها، واختبار محدد واحد على الأقل مرتبط بتلك المهمة.
- لا ميزة مكررة (صفر)، ولا معرّف مذكور بلا تعريف، وكل معيار قبول (88) يتحقق منه اختبار واحد على الأقل، وكل اختبار (107) مربوط بمهمة.
- **لا اعتماد دائري:** رتّب الفحص المهام الـ57 ترتيبًا طوبولوجيًا بلا دورة، وأطول سلسلة 12 مهام.
- الزوج الشرطي في `T-5.5` متنافٍ: لكل خيار من `DEC-04` ينطبق معيار واحد بالضبط (`AC-5.5` أو `AC-5.5N`) وفرع اختبارات واحد.

## الوحدة (أ): اتجاه عربي وقراءة مريحة

| الميزة | الوصف | المرحلة | المهمة المنفِّذة | المهام الداعمة | معيار القبول | اختبارات القبول | قرار يمسّها |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `F-A1` | معالجة اتجاه النص العربي والمختلط (`RTL/Bidi`) في المواضع التي يثبت وجود مشكلة فيها | [المرحلة 2](phases/phase-02-module-a.md) | [`T-2.1`](phases/phase-02-module-a.md#T-2.1) | [`T-0.1`](phases/phase-00-feasibility.md#T-0.1) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-A1` | `TEST-RTL-01` | — |
| `F-A2` | عزل الكود والمسارات وأسماء الملفات و`#123` و`@mentions` والروابط باتجاه `LTR` دون تغيير محتواها | [المرحلة 2](phases/phase-02-module-a.md) | [`T-2.2`](phases/phase-02-module-a.md#T-2.2) | [`T-0.1`](phases/phase-00-feasibility.md#T-0.1) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-A2` | `TEST-RTL-02` | — |
| `F-A3` | خطوط عربية مضمّنة مرخصة مع ضبط الحجم وارتفاع السطر والتباعد | [المرحلة 2](phases/phase-02-module-a.md) | [`T-2.3`](phases/phase-02-module-a.md#T-2.3) | — | `AC-A3` | `TEST-RTL-03` | — |
| `F-A4` | زر تبديل `RTL/LTR` في حقول التحرير المناسبة مع الحفاظ على المؤشر والتحديد وعدم إفساد محرر GitHub | [المرحلة 2](phases/phase-02-module-a.md) | [`T-2.4`](phases/phase-02-module-a.md#T-2.4) | [`T-0.1`](phases/phase-00-feasibility.md#T-0.1) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-A4` | `TEST-RTL-04` | — |
| `F-A5` | وضع قراءة اختياري لـMarkdown مع خيار إخفاء التشكيل في العرض فقط دون تغيير المصدر أو المنسوخ (الجزئي/الممتد/الغني) أو البحث الأصلي، ومنع استعادة نص قديم فوق تحديث حي | [المرحلة 2](phases/phase-02-module-a.md) | [`T-2.5`](phases/phase-02-module-a.md#T-2.5) | [`T-0.1`](phases/phase-00-feasibility.md#T-0.1) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-A5` | `TEST-RTL-05A`، `TEST-RTL-05B`، `TEST-RTL-05C`، `TEST-RTL-05D`، `TEST-RTL-05E`، `TEST-RTL-05F`، `TEST-RTL-05G` | `DEC-02` |
| `F-A6` | تلميح التاريخ الهجري، وخيار شكل الأرقام في النصوص المناسبة مع إبقاء التواريخ الأصلية وعدم تحويل أرقام الكود والمعرّفات والإصدارات | [المرحلة 2](phases/phase-02-module-a.md) | [`T-2.6`](phases/phase-02-module-a.md#T-2.6) | — | `AC-A6` | `TEST-RTL-06` | — |
| `F-A7` | تحديد نطاق كل إعداد في الوحدة (أ) وإلغاء أثره واستعادة عرض الصفحة الأصلي فوريًا | [المرحلة 2](phases/phase-02-module-a.md) | [`T-2.7`](phases/phase-02-module-a.md#T-2.7) | — | `AC-A7` | `TEST-RTL-07`، `TEST-GUARD-01`، `TEST-GUARD-02`، `TEST-GUARD-03`، `TEST-GUARD-04` | — |

## الوحدة (ب): قاموس الواجهة وشرح الاستخدام

| الميزة | الوصف | المرحلة | المهمة المنفِّذة | المهام الداعمة | معيار القبول | اختبارات القبول | قرار يمسّها |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `F-B1` | شرح المصطلحات والأزرار (`Fork`, `Commit`, `Rebase`, `Merge conflict` وغيرها) في سياقها داخل الواجهة | [المرحلة 3](phases/phase-03-module-b.md) | [`T-3.2`](phases/phase-03-module-b.md#T-3.2) | [`T-3.1`](phases/phase-03-module-b.md#T-3.1) ([المرحلة 3](phases/phase-03-module-b.md)) | `AC-B1` | `TEST-GLOSS-01` | — |
| `F-B2` | مستويات الشرح الثلاثة («مختصر، متوسط، مفصّل») مع أمثلة عملية | [المرحلة 3](phases/phase-03-module-b.md) | [`T-3.2`](phases/phase-03-module-b.md#T-3.2) | [`T-3.1`](phases/phase-03-module-b.md#T-3.1) ([المرحلة 3](phases/phase-03-module-b.md)) | `AC-B2` | `TEST-GLOSS-02`، `TEST-GLOSS-05` | — |
| `F-B3` | إبقاء المصطلح الإنجليزي ظاهرًا بجانب الشرح العربي دائمًا | [المرحلة 3](phases/phase-03-module-b.md) | [`T-3.2`](phases/phase-03-module-b.md#T-3.2) | [`T-3.1`](phases/phase-03-module-b.md#T-3.1) ([المرحلة 3](phases/phase-03-module-b.md)) | `AC-B3` | `TEST-GLOSS-03` | — |
| `F-B4` | بيان متى تُستخدم الوظيفة، وما أثرها، وما تحتاجه من صلاحيات، وإمكانية التراجع وحدودها | [المرحلة 3](phases/phase-03-module-b.md) | [`T-3.2`](phases/phase-03-module-b.md#T-3.2) | [`T-3.1`](phases/phase-03-module-b.md#T-3.1) ([المرحلة 3](phases/phase-03-module-b.md)) | `AC-B4` | `TEST-GLOSS-06`، `TEST-GLOSS-05` | — |
| `F-B5` | الوصول للشرح بالماوس والكيبورد واللمس، لا بالتحويم وحده | [المرحلة 3](phases/phase-03-module-b.md) | [`T-3.3`](phases/phase-03-module-b.md#T-3.3) | — | `AC-B5` | `TEST-A11Y-01`، `TEST-A11Y-02` | — |
| `F-B6` | بحث شامل داخل القاموس وروابط إلى الوثائق الرسمية والمكان المناسب في الواجهة | [المرحلة 3](phases/phase-03-module-b.md) | [`T-3.4`](phases/phase-03-module-b.md#T-3.4) | — | `AC-B6` | `TEST-GLOSS-04` | — |
| `F-B7` | تكييف طرق التعليم من المشروع السابق كجولات إرشادية داخل الموقع الحقيقي دون تنفيذ إجراءات حساسة تلقائيًا | [المرحلة 3](phases/phase-03-module-b.md) | [`T-3.5`](phases/phase-03-module-b.md#T-3.5) | — | `AC-B7` | `TEST-TOUR-01` | — |

## الوحدة (ج): ترجمة تقنية عند الطلب

| الميزة | الوصف | المرحلة | المهمة المنفِّذة | المهام الداعمة | معيار القبول | اختبارات القبول | قرار يمسّها |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `F-C1` | ترجمة تقنية عند الطلب (`EN→AR`) لفقرات README والتعليقات ووصف المشكلات وطلبات الدمج | [المرحلة 4](phases/phase-04-module-c.md) | [`T-4.1`](phases/phase-04-module-c.md#T-4.1) | — | `AC-C1` | `TEST-TR-01` | — |
| `F-C2` | الحفاظ الصارم على الكود والأوامر والمسارات والروابط وأسماء الملفات وقائمة مصطلحات لا تُترجم + **التحقق الصارم بعد الترجمة من هوية وعدد الرموز وعدم عرض نتيجة مشوهة** | [المرحلة 4](phases/phase-04-module-c.md) | [`T-4.2`](phases/phase-04-module-c.md#T-4.2) | — | `AC-C2` | `TEST-TR-02A`، `TEST-TR-02B`، `TEST-TR-02C`، `TEST-TR-02D`، `TEST-TR-02E`، `TEST-TR-02F` | — |
| `F-C3` | عرض الأصل والترجمة معًا أو التبديل بينهما وإمكانية الرجوع للأصل بضغطة واحدة | [المرحلة 4](phases/phase-04-module-c.md) | [`T-4.1`](phases/phase-04-module-c.md#T-4.1) | — | `AC-C3` | `TEST-TR-03` | — |
| `F-C4` | دراسة وتشغيل الترجمة المحلية على الجهاز وفق دعم المتصفح واللغة والعتاد الفعلي (مع تفصيل سياق وصلاحيات ووجهة تنزيل وبديل كل متصفح) | [المرحلة 4](phases/phase-04-module-c.md) | [`T-4.3`](phases/phase-04-module-c.md#T-4.3) | [`T-0.2`](phases/phase-00-feasibility.md#T-0.2) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-C4` | `TEST-TR-04` | `DEC-03` |
| `F-C5` | إدارة تنزيل النموذج وحجمه ومتطلبات الاتصال الأولي وحالات عدم الدعم والإلغاء والأخطاء | [المرحلة 4](phases/phase-04-module-c.md) | [`T-4.4`](phases/phase-04-module-c.md#T-4.4) | [`T-0.2`](phases/phase-00-feasibility.md#T-0.2) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-C5` | `TEST-TR-05` | `DEC-03` |
| `F-C6` | منع استخدام أي خدمة سحابية بديلة بصمت، واشتراط قرار واضح وموافقة صريحة قبل إرسال أي محتوى | [المرحلة 4](phases/phase-04-module-c.md) | [`T-4.5`](phases/phase-04-module-c.md#T-4.5) | — | `AC-C6` | `TEST-PRIV-01` | `DEC-03` |

## الوحدة (د): فهم حالة العمل والفحوص

| الميزة | الوصف | المرحلة | المهمة المنفِّذة | المهام الداعمة | معيار القبول | اختبارات القبول | قرار يمسّها |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `F-D1` | بطاقة تلخص حالة طلب الدمج: الفرع المصدر والهدف، التغييرات، المراجعات، التعارضات، والفحوص المطلوبة | [المرحلة 5](phases/phase-05-module-d.md) | [`T-5.1`](phases/phase-05-module-d.md#T-5.1) | [`T-0.3`](phases/phase-00-feasibility.md#T-0.3) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-D1` | `TEST-PR-01` | — |
| `F-D2` | التفريق الدقيق بين حالات الفحص السبع: ناجح، فاشل، قيد التشغيل، متجاوز، ملغى، لم يُشغّل، وغير معروف | [المرحلة 5](phases/phase-05-module-d.md) | [`T-5.1`](phases/phase-05-module-d.md#T-5.1) | [`T-0.3`](phases/phase-00-feasibility.md#T-0.3) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-D2` | `TEST-PR-02` | — |
| `F-D3` | تفسير ما يمنع الدمج عندما توجد أدلة، وعدم مساواة نجاح بعض الفحوص بجاهزية المشروع أو الإصدار | [المرحلة 5](phases/phase-05-module-d.md) | [`T-5.2`](phases/phase-05-module-d.md#T-5.2) | — | `AC-D3` | `TEST-PR-03` | — |
| `F-D4` | عرض وقت تحديث المعلومات ومصدرها (صفحة حالية / API)، والتنبيه عند نقصها أو تقادمها | [المرحلة 5](phases/phase-05-module-d.md) | [`T-5.2`](phases/phase-05-module-d.md#T-5.2) | [`T-5.5`](phases/phase-05-module-d.md#T-5.5) ([المرحلة 5](phases/phase-05-module-d.md)) | `AC-D4` | `TEST-PR-04` | `DEC-04` |
| `F-D5` | شرح سجل الفحص: استخراج موضع الخطأ وسياقه، والتمييز بين رسالة الخطأ والسبب الجذري المثبت والاحتمال | [المرحلة 5](phases/phase-05-module-d.md) | [`T-5.3`](phases/phase-05-module-d.md#T-5.3) | [`T-0.3`](phases/phase-00-feasibility.md#T-0.3) ([المرحلة 0](phases/phase-00-feasibility.md))، [`T-5.5`](phases/phase-05-module-d.md#T-5.5) ([المرحلة 5](phases/phase-05-module-d.md)) | `AC-D5` | `TEST-LOG-01` | `DEC-04` |
| `F-D6` | المقارنة بين فرعين أو التزامين أو إصدارين، مع الفصل بين ملخص الملفات والتغييرات المؤكدة وبين تفسير أثرها | [المرحلة 5](phases/phase-05-module-d.md) | [`T-5.4`](phases/phase-05-module-d.md#T-5.4) | — | `AC-D6` | `TEST-DIFF-01` | — |
| `F-D7` | رمز GitHub اختياري للقراءة: جلب التفاصيل المصرّح بها (المستودعات الخاصة والفحوص والسجلات) بأقل صلاحية لازمة، مع بقاء الوحدة كاملة بدونه | [المرحلة 5](phases/phase-05-module-d.md) | [`T-5.5`](phases/phase-05-module-d.md#T-5.5) | [`T-0.3`](phases/phase-00-feasibility.md#T-0.3) ([المرحلة 0](phases/phase-00-feasibility.md))، [`T-0.5`](phases/phase-00-feasibility.md#T-0.5) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-D7` | `TEST-PR-05` (مشروط) | `DEC-04` |
| `F-D8` | دقة الحالة مع الرمز: انتهاء الرمز ونقص الصلاحيات وتجاوز حدود الطلبات والبيانات غير المتاحة تُعرض صريحة، ولا يُعرض تعذّر الوصول نجاحًا للفحوص، وكل نتيجة مربوطة بالمستودع والفرع والالتزام ووقت التحديث | [المرحلة 11](phases/phase-11-assist-layer.md) | [`T-11.5`](phases/phase-11-assist-layer.md#T-11.5) | [`T-0.5`](phases/phase-00-feasibility.md#T-0.5) ([المرحلة 0](phases/phase-00-feasibility.md))، [`T-11.1`](phases/phase-11-assist-layer.md#T-11.1) ([المرحلة 11](phases/phase-11-assist-layer.md)) | `AC-D8` | `TEST-PR-06` | `DEC-10` |
| `F-D9` | تحليل فشل الفحص داخل قسم الفحوص نفسه عند توفر مفتاح المزوّد: السبب المقترح والإصلاح والخطوة التالية بالأدلة، بفصل المثبت عن الاحتمال وبيان ما نقص؛ ويبقى القسم عاملًا دون مفتاح | [المرحلة 11](phases/phase-11-assist-layer.md) | [`T-11.7`](phases/phase-11-assist-layer.md#T-11.7) | [`T-11.1`](phases/phase-11-assist-layer.md#T-11.1) ([المرحلة 11](phases/phase-11-assist-layer.md)) | `AC-D9` | `TEST-AI-03` | `DEC-10` |

## الوحدة (هـ): تجهيز المعلومات للنموذج أو الزميل

| الميزة | الوصف | المرحلة | المهمة المنفِّذة | المهام الداعمة | معيار القبول | اختبارات القبول | قرار يمسّها |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `F-E1` | إنشاء ملخص قابل للمراجعة والنسخ يشمل المستودع والفرع والالتزام والرابط والمشكلة ونتائج الفحص ومقتطفات الأدلة | [المرحلة 6](phases/phase-06-module-e.md) | [`T-6.1`](phases/phase-06-module-e.md#T-6.1) | — | `AC-E1` | `TEST-CTX-01` | — |
| `F-E2` | اختيار ما يدخل الملخص (قائمة اختيار)، وإظهار ما تعذّر جمعه أو اقتُطع لطوله بوضوح | [المرحلة 6](phases/phase-06-module-e.md) | [`T-6.1`](phases/phase-06-module-e.md#T-6.1) | — | `AC-E2` | `TEST-CTX-02` | — |
| `F-E3` | قوالب مخصصة لتشخيص مشكلة، أو مراجعة تغيير، أو تسليم مهمة، أو استكمال عمل | [المرحلة 6](phases/phase-06-module-e.md) | [`T-6.2`](phases/phase-06-module-e.md#T-6.2) | — | `AC-E3` | `TEST-CTX-03` | — |
| `F-E4` | معاينة المحتوى الكامل وتعديله قبل النسخ، وعدم إرسال أي شيء تلقائيًا إلى نموذج أو خدمة أخرى | [المرحلة 6](phases/phase-06-module-e.md) | [`T-6.2`](phases/phase-06-module-e.md#T-6.2) | — | `AC-E4` | `TEST-CTX-04` | — |
| `F-E5` | تنبيه المستخدم إلى احتمال احتواء السجلات على بيانات خاصة، مع فحص تحذيري غير جازم (دون وعد بإزالة مضمونة للأسرار) | [المرحلة 6](phases/phase-06-module-e.md) | [`T-6.3`](phases/phase-06-module-e.md#T-6.3) | — | `AC-E5` | `TEST-PRIV-02` | — |
| `F-E6` | طبقة سياق مشتركة واحدة للجمع والتنقيح والبناء بحسب الصفحة والمهمة، تخدم «نسخ البرومبت» والتحليل وحزمة السياق بعقد موحّد دون تكرار البنية في أي قسم | [المرحلة 11](phases/phase-11-assist-layer.md) | [`T-11.2`](phases/phase-11-assist-layer.md#T-11.2) | — | `AC-E6` | `TEST-CTX-05` | — |
| `F-E7` | زر «نسخ البرومبت» صغير ومتناسق داخل القسم المناسب دون صندوق نص ولا نافذة معاينة إلزامية: يجمع ويجهّز وينسخ إلى الحافظة بحالات تحميل وفشل ونجاح، ولا يُظهر «تم النسخ» إلا بعد نجاح النسخ فعليًا، وينبّه مختصرًا عند محتوى خاص | [المرحلة 11](phases/phase-11-assist-layer.md) | [`T-11.3`](phases/phase-11-assist-layer.md#T-11.3) | [`T-0.5`](phases/phase-00-feasibility.md#T-0.5) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-E7` | `TEST-CTX-06`، `TEST-CTX-07` | — |
| `F-E8` | قوالب البرومبت الخمسة: فهم المشكلة، وتشخيص الخطأ، ومراجعة التغييرات، وتحديد الخطوة التالية، وتسليم المهمة لجلسة برمجة؛ تذكر المعلومات الناقصة صراحة بدل اختلاقها ولا تنسخ الصفحة كاملة بلا تمييز | [المرحلة 11](phases/phase-11-assist-layer.md) | [`T-11.4`](phases/phase-11-assist-layer.md#T-11.4) | — | `AC-E8` | `TEST-CTX-08` | — |
| `F-E9` | طبقة مزوّد تحليل اختيارية: اختيار المزوّد وإضافة مفتاحه والتحقق من صلاحيته، ثم تحليل لا يبدأ إلا بطلب صريح عبر تجربة موافقة مختصرة تبيّن المحتوى المرسل والوجهة والتكلفة التقديرية، وتُعرض نتائجه بالأدلة بفصل المثبت عن الاحتمال | [المرحلة 11](phases/phase-11-assist-layer.md) | [`T-11.6`](phases/phase-11-assist-layer.md#T-11.6) | [`T-0.5`](phases/phase-00-feasibility.md#T-0.5) ([المرحلة 0](phases/phase-00-feasibility.md))، [`T-11.1`](phases/phase-11-assist-layer.md#T-11.1) ([المرحلة 11](phases/phase-11-assist-layer.md)) | `AC-E9` | `TEST-AI-01`، `TEST-AI-02`، `TEST-PRIV-04` | `DEC-09`، `DEC-10` |

## الوحدة (و): كتابة البلاغات والمراجعات

| الميزة | الوصف | المرحلة | المهمة المنفِّذة | المهام الداعمة | معيار القبول | اختبارات القبول | قرار يمسّها |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `F-F1` | مساعد لتنظيم Issue أو PR: المتوقع، الفعلي، خطوات التكرار، البيئة، والأدلة | [المرحلة 7](phases/phase-07-module-f.md) | [`T-7.1`](phases/phase-07-module-f.md#T-7.1) | — | `AC-F1` | `TEST-WRITE-01` | — |
| `F-F2` | احترام قالب المستودع الحالي (`ISSUE_TEMPLATE` / `PULL_REQUEST_TEMPLATE` / `Issue Forms`) وعدم استبداله أو تجاوز حقوله الإلزامية | [المرحلة 7](phases/phase-07-module-f.md) | [`T-7.2`](phases/phase-07-module-f.md#T-7.2) | [`T-0.4`](phases/phase-00-feasibility.md#T-0.4) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-F2` | `TEST-WRITE-02` | — |
| `F-F3` | بنك عبارات مراجعة بالعربية والإنجليزية مصنف بحسب الغرض (سؤال، اقتراح، ملاحظة بسيطة، إشادة) | [المرحلة 7](phases/phase-07-module-f.md) | [`T-7.3`](phases/phase-07-module-f.md#T-7.3) | — | `AC-F3` | `TEST-WRITE-03` | — |
| `F-F4` | معاينة النص قبل إدراجه في الحقل، وعدم مسح مسودة المستخدم أو نشرها تلقائيًا | [المرحلة 7](phases/phase-07-module-f.md) | [`T-7.1`](phases/phase-07-module-f.md#T-7.1) | — | `AC-F4` | `TEST-WRITE-04` | — |
| `F-F5` | الفصل التام في الواجهة والمنطق بين القوالب المحلية الثابتة وبين الترجمة أو الصياغة التي تتطلب نموذجًا | [المرحلة 7](phases/phase-07-module-f.md) | [`T-7.3`](phases/phase-07-module-f.md#T-7.3) | — | `AC-F5` | `TEST-WRITE-05` | — |
| `F-F6` | مسار إنجاز تدريجي بنطاق أولي محدود: تجهيز تعديل، ومعاينة فرقه، ثم إنشاء الفرع وطلب الدمج بطلب صريح من المستخدم وموافقته على النطاق، دون تحويل مِجهَر إلى بيئة برمجة كاملة | [المرحلة 11](phases/phase-11-assist-layer.md) | [`T-11.8`](phases/phase-11-assist-layer.md#T-11.8) | — | `AC-F6` | `TEST-EXEC-01`، `TEST-EXEC-02` | `DEC-11` |
| `F-F7` | ضوابط الأمان التنفيذي: فصل تام بين صلاحيات القراءة والتحليل وصلاحيات التعديل، ولا تنفيذ تلقائي لأي أمر يقترحه النموذج، ومعاملة محتوى الصفحات والسجلات والبرومبتات بيانات لا تعليمات تتحكم في الإضافة (حقن الأوامر) | [المرحلة 11](phases/phase-11-assist-layer.md) | [`T-11.9`](phases/phase-11-assist-layer.md#T-11.9) | — | `AC-F7` | `TEST-SEC-06`، `TEST-SEC-07` | — |

## الوحدة (ز): الملاحظات وحفظ موضع العمل

| الميزة | الوصف | المرحلة | المهمة المنفِّذة | المهام الداعمة | معيار القبول | اختبارات القبول | قرار يمسّها |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `F-G1` | ملاحظات خاصة مرتبطة بالمستودع أو الملف أو الالتزام أو طلب الدمج أو سطر محدد (المستويات الخمسة) | [المرحلة 8](phases/phase-08-module-g.md) | [`T-8.1`](phases/phase-08-module-g.md#T-8.1) | [`T-0.4`](phases/phase-00-feasibility.md#T-0.4) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-G1` | `TEST-NOTE-01` | — |
| `F-G2` | روابط محفوظة وقائمة «أكمل لاحقًا» مع تصنيفها وتنظيمها والبحث الفوري فيها | [المرحلة 8](phases/phase-08-module-g.md) | [`T-8.2`](phases/phase-08-module-g.md#T-8.2) | — | `AC-G2` | `TEST-NOTE-02` | — |
| `F-G3` | التعامل مع تغيّر السطور والفروع وحذف الموارد، وتوليد روابط مثبتة على التزام (`Permalink SHA`) عند الحاجة | [المرحلة 8](phases/phase-08-module-g.md) | [`T-8.3`](phases/phase-08-module-g.md#T-8.3) | [`T-0.4`](phases/phase-00-feasibility.md#T-0.4) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-G3` | `TEST-NOTE-03A`، `TEST-NOTE-03B`، `TEST-NOTE-03C`، `TEST-NOTE-03D`، `TEST-NOTE-03E`، `TEST-NOTE-03F` | `DEC-05` |
| `F-G4` | توضيح مكان التخزين المحلي، وأدوات التصدير والاستيراد والنسخ الاحتياطي والحذف، وحدود الخصوصية على الجهاز المشترك | [المرحلة 8](phases/phase-08-module-g.md) | [`T-8.4`](phases/phase-08-module-g.md#T-8.4) | — | `AC-G4` | `TEST-STORAGE-01`، `TEST-PRIV-03` | — |
| `F-G5` | العمل محليًا بالكامل دون افتراض وجود مزامنة سحابية أو حساب إضافي | [المرحلة 8](phases/phase-08-module-g.md) | [`T-8.4`](phases/phase-08-module-g.md#T-8.4) | — | `AC-G5` | `TEST-PRIV-03` | — |

## الوحدة (ح): المجتمع وأول مساهمة

| الميزة | الوصف | المرحلة | المهمة المنفِّذة | المهام الداعمة | معيار القبول | اختبارات القبول | قرار يمسّها |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `F-H1` | اكتشاف `README` عربي وإظهار رابط إليه مع توضيح نطاق البحث، وعدم الجزم بعدم وجوده عندما تكون قائمة الملفات ناقصة | [المرحلة 9](phases/phase-09-module-h.md) | [`T-9.1`](phases/phase-09-module-h.md#T-9.1) | [`T-0.4`](phases/phase-00-feasibility.md#T-0.4) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-H1` | `TEST-COMM-01` | — |
| `F-H2` | تجهيز اقتراح لإضافة `README` عربي مع مراعاة سياسة المساهمة (`CONTRIBUTING.md`) وفحص البلاغات/الطلبات السابقة لمنع التكرار ودون نشر تلقائي | [المرحلة 9](phases/phase-09-module-h.md) | [`T-9.2`](phases/phase-09-module-h.md#T-9.2) | [`T-0.4`](phases/phase-00-feasibility.md#T-0.4) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-H2` | `TEST-COMM-02` | — |
| `F-H3` | مرشد أول مساهمة يقرأ تعليمات المشروع المتاحة (`CONTRIBUTING`, `README`, `good first issue`) ويشرح المسار المناسب خطوة بخطوة | [المرحلة 9](phases/phase-09-module-h.md) | [`T-9.3`](phases/phase-09-module-h.md#T-9.3) | [`T-0.4`](phases/phase-00-feasibility.md#T-0.4) ([المرحلة 0](phases/phase-00-feasibility.md)) | `AC-H3` | `TEST-COMM-03` | — |
| `F-H4` | روابط اكتشاف المحتوى العربي و`Trending` والبحث بتنوع تهجئات المواقع (`location`) بوضوح وشفافية | [المرحلة 9](phases/phase-09-module-h.md) | [`T-9.4`](phases/phase-09-module-h.md#T-9.4) | — | `AC-H4` | `TEST-COMM-04` | — |
| `F-H5` | قوائم مصادر عربية مفيدة مدمجة مع آلية تحديث ومراجعة محلية شفافة | [المرحلة 9](phases/phase-09-module-h.md) | [`T-9.5`](phases/phase-09-module-h.md#T-9.5) | — | `AC-H5` | `TEST-COMM-05` | — |
| `F-H6` | التمييز الصارم بين المحتوى المكتوب بالعربية وبين البيانات التي يعلنها صاحب الحساب، ومنع استنتاج جنسية المطور أو هويته من اسمه أو لغته أو موقعه | [المرحلة 9](phases/phase-09-module-h.md) | [`T-9.4`](phases/phase-09-module-h.md#T-9.4) | — | `AC-H6` | `TEST-COMM-06` | — |

## مهام لا تنفذ ميزة بعينها

| المهمة | النوع | المرحلة | ما تدعمه | معيار القبول | الاختبارات |
| :--- | :--- | :--- | :--- | :--- | :--- |
| [`T-0.1`](phases/phase-00-feasibility.md#T-0.1) | تجربة جدوى | [المرحلة 0](phases/phase-00-feasibility.md) | `F-A1`، `F-A2`، `F-A4`، `F-A5` | `AC-S1.1`، `AC-S1.2`، `AC-S1.3`، `AC-S1.4` | `TEST-SPIKE-01` |
| [`T-0.2`](phases/phase-00-feasibility.md#T-0.2) | تجربة جدوى | [المرحلة 0](phases/phase-00-feasibility.md) | `F-C4`، `F-C5` | `AC-S2.1`، `AC-S2.2`، `AC-S2.3`، `AC-S2.4`، `AC-S2.5` | `TEST-SPIKE-02` |
| [`T-0.3`](phases/phase-00-feasibility.md#T-0.3) | تجربة جدوى | [المرحلة 0](phases/phase-00-feasibility.md) | `F-D1`، `F-D2`، `F-D5`، `F-D7` | `AC-S3.1`، `AC-S3.2`، `AC-S3.3` (إن كان DEC-04 معلقًا أو داعمًا وقت التجربة)، `AC-S3.4` | `TEST-SPIKE-03` |
| [`T-0.4`](phases/phase-00-feasibility.md#T-0.4) | تجربة جدوى | [المرحلة 0](phases/phase-00-feasibility.md) | `F-F2`، `F-G1`، `F-G3`، `F-H1`، `F-H2`، `F-H3` | `AC-S4.1`، `AC-S4.2`، `AC-S4.3`، `AC-S4.4` | `TEST-SPIKE-04` |
| [`T-0.5`](phases/phase-00-feasibility.md#T-0.5) | تجربة جدوى | [المرحلة 0](phases/phase-00-feasibility.md) | `F-D7`، `F-D8`، `F-E7`، `F-E9` | `AC-S5.1`، `AC-S5.2`، `AC-S5.3` (ينطبق في: فرع دعم الرمز)، `AC-S5.4` | `TEST-SPIKE-05` |
| [`T-1.1`](phases/phase-01-core.md#T-1.1) | بنية | [المرحلة 1](phases/phase-01-core.md) | كل المهام المعتمدة عليها | `AC-1.1` | `TEST-BUILD-01` |
| [`T-1.2`](phases/phase-01-core.md#T-1.2) | بنية | [المرحلة 1](phases/phase-01-core.md) | كل المهام المعتمدة عليها | `AC-1.2` | `TEST-CORE-01`، `TEST-CORE-02`، `TEST-NAV-01` |
| [`T-1.3`](phases/phase-01-core.md#T-1.3) | بنية | [المرحلة 1](phases/phase-01-core.md) | كل المهام المعتمدة عليها | `AC-1.3` | `TEST-CORE-03`، `TEST-CORE-04`، `TEST-STORAGE-02` |
| [`T-1.4`](phases/phase-01-core.md#T-1.4) | بنية | [المرحلة 1](phases/phase-01-core.md) | كل المهام المعتمدة عليها | `AC-1.4` | `TEST-CORE-05`، `TEST-CORE-06` |
| [`T-3.1`](phases/phase-03-module-b.md#T-3.1) | بيانات | [المرحلة 3](phases/phase-03-module-b.md) | `F-B1`، `F-B2`، `F-B3`، `F-B4` | `AC-3.1` | `TEST-GLOSS-05` |
| [`T-5.5`](phases/phase-05-module-d.md#T-5.5) | تمكين | [المرحلة 5](phases/phase-05-module-d.md) | `F-D4`، `F-D5`، `F-D7` | `AC-D7` (فرع دعم الرمز)، `AC-5.5` (فرع دعم الرمز)، `AC-5.5N` (فرع عدم دعم الرمز) | `TEST-SEC-01`، `TEST-SEC-02`، `TEST-SEC-03`، `TEST-SEC-04`، `TEST-PR-05` |
| [`T-11.1`](phases/phase-11-assist-layer.md#T-11.1) | تمكين | [المرحلة 11](phases/phase-11-assist-layer.md) | `F-D8`، `F-D9`، `F-E9` | `AC-11.1` | `TEST-CONN-01`، `TEST-CONN-02` |
| [`T-10.1`](phases/phase-10-integration.md#T-10.1) | تكامل | [المرحلة 10](phases/phase-10-integration.md) | كل المهام المعتمدة عليها | `AC-10.1` | `TEST-NAV-01`، `TEST-PERF-01`، `TEST-A11Y-ALL`، `TEST-BROW-01` |
| [`T-10.2`](phases/phase-10-integration.md#T-10.2) | تكامل | [المرحلة 10](phases/phase-10-integration.md) | كل المهام المعتمدة عليها | `AC-10.2`، `AC-10.3` | `TEST-PKG-01` |

## عناصر مشروطة بقرار

| العنصر | النوع | ينطبق في | الحالة الآن |
| :--- | :--- | :--- | :--- |
| `AC-S3.3` | معيار قبول | إن كان DEC-04 معلقًا أو داعمًا وقت التجربة (`DEC-04`) | ينطبق |
| `AC-5.5` | معيار قبول | فرع دعم الرمز (`DEC-04`) | ينطبق |
| `AC-5.5N` | معيار قبول | فرع عدم دعم الرمز (`DEC-04`) | لا ينطبق |
| `AC-D7` | معيار قبول | فرع دعم الرمز (`DEC-04`) | ينطبق |
| `AC-S5.3` | معيار قبول | ينطبق في: فرع دعم الرمز (`DEC-04`) | ينطبق |
| `TEST-SEC-01` | اختبار | فرع دعم الرمز (`DEC-04`) | مخطط (لم يُنفَّذ) |
| `TEST-SEC-02` | اختبار | فرع دعم الرمز (`DEC-04`) | مخطط (لم يُنفَّذ) |
| `TEST-SEC-03` | اختبار | فرع دعم الرمز (`DEC-04`) | مخطط (لم يُنفَّذ) |
| `TEST-SEC-04` | اختبار | فرع عدم دعم الرمز (`DEC-04`) | لا ينطبق |
| `TEST-PR-05` | اختبار | فرع دعم الرمز (`DEC-04`) | مخطط (لم يُنفَّذ) |

`AC-S3.3` ينطبق ما دام `DEC-04` معلقًا، فإن اعتُمد د-4 قبل `T-0.3` صار «لا ينطبق». والفرضيتان `HYP-07` و`HYP-09` تسقطان إن اعتُمد د-4.

## فهرس الاختبارات

| الاختبار | المستوى | المهام | معايير القبول | الميزات |
| :--- | :--- | :--- | :--- | :--- |
| `TEST-SPIKE-01` | تجربة موثقة | [`T-0.1`](phases/phase-00-feasibility.md#T-0.1) | `AC-S1.1`، `AC-S1.2`، `AC-S1.3`، `AC-S1.4` | `F-A1`، `F-A2`، `F-A4`، `F-A5` |
| `TEST-SPIKE-02` | تجربة موثقة | [`T-0.2`](phases/phase-00-feasibility.md#T-0.2) | `AC-S2.1`، `AC-S2.2`، `AC-S2.3`، `AC-S2.4`، `AC-S2.5` | `F-C4`، `F-C5` |
| `TEST-SPIKE-03` | تجربة موثقة | [`T-0.3`](phases/phase-00-feasibility.md#T-0.3) | `AC-S3.1`، `AC-S3.2`، `AC-S3.3`، `AC-S3.4` | `F-D1`، `F-D2`، `F-D5` |
| `TEST-SPIKE-04` | تجربة موثقة | [`T-0.4`](phases/phase-00-feasibility.md#T-0.4) | `AC-S4.1`، `AC-S4.2`، `AC-S4.3`، `AC-S4.4` | `F-F2`، `F-G1`، `F-G3`، `F-H1`، `F-H2`، `F-H3` |
| `TEST-BUILD-01` | آلي | [`T-1.1`](phases/phase-01-core.md#T-1.1) | `AC-1.1` | — |
| `TEST-CORE-01` | وحدة | [`T-1.2`](phases/phase-01-core.md#T-1.2) | `AC-1.2` | — |
| `TEST-CORE-02` | تكامل | [`T-1.2`](phases/phase-01-core.md#T-1.2) | `AC-1.2` | — |
| `TEST-NAV-01` | تكامل | [`T-1.2`](phases/phase-01-core.md#T-1.2)، [`T-10.1`](phases/phase-10-integration.md#T-10.1) | `AC-1.2`، `AC-10.1` | — |
| `TEST-CORE-03` | وحدة | [`T-1.3`](phases/phase-01-core.md#T-1.3) | `AC-1.3` | — |
| `TEST-CORE-04` | تكامل | [`T-1.3`](phases/phase-01-core.md#T-1.3) | `AC-1.3` | — |
| `TEST-STORAGE-02` | وحدة + تجربة | [`T-1.3`](phases/phase-01-core.md#T-1.3) | `AC-1.3` | — |
| `TEST-CORE-05` | تكامل | [`T-1.4`](phases/phase-01-core.md#T-1.4) | `AC-1.4` | — |
| `TEST-CORE-06` | تكامل | [`T-1.4`](phases/phase-01-core.md#T-1.4) | `AC-1.4` | — |
| `TEST-PERF-01` | قياس | [`T-10.1`](phases/phase-10-integration.md#T-10.1) | `AC-10.1` | — |
| `TEST-A11Y-ALL` | آلي + يدوي | [`T-10.1`](phases/phase-10-integration.md#T-10.1) | `AC-10.1` | — |
| `TEST-BROW-01` | تشغيل عبر المتصفحات | [`T-10.1`](phases/phase-10-integration.md#T-10.1) | `AC-10.1` | — |
| `TEST-PKG-01` | آلي | [`T-10.2`](phases/phase-10-integration.md#T-10.2) | `AC-10.2`، `AC-10.3` | — |
| `TEST-RTL-01` | وحدة + e2e | [`T-2.1`](phases/phase-02-module-a.md#T-2.1) | `AC-A1` | `F-A1` |
| `TEST-RTL-02` | وحدة + e2e | [`T-2.2`](phases/phase-02-module-a.md#T-2.2) | `AC-A2` | `F-A2` |
| `TEST-RTL-03` | e2e | [`T-2.3`](phases/phase-02-module-a.md#T-2.3) | `AC-A3` | `F-A3` |
| `TEST-RTL-04` | e2e | [`T-2.4`](phases/phase-02-module-a.md#T-2.4) | `AC-A4` | `F-A4` |
| `TEST-RTL-05A` | e2e | [`T-2.5`](phases/phase-02-module-a.md#T-2.5) | `AC-A5` | `F-A5` |
| `TEST-RTL-05B` | e2e | [`T-2.5`](phases/phase-02-module-a.md#T-2.5) | `AC-A5` | `F-A5` |
| `TEST-RTL-05C` | e2e | [`T-2.5`](phases/phase-02-module-a.md#T-2.5) | `AC-A5` | `F-A5` |
| `TEST-RTL-05D` | e2e | [`T-2.5`](phases/phase-02-module-a.md#T-2.5) | `AC-A5` | `F-A5` |
| `TEST-RTL-05E` | e2e + يدوي | [`T-2.5`](phases/phase-02-module-a.md#T-2.5) | `AC-A5` | `F-A5` |
| `TEST-RTL-05F` | e2e | [`T-2.5`](phases/phase-02-module-a.md#T-2.5) | `AC-A5` | `F-A5` |
| `TEST-RTL-05G` | e2e | [`T-2.5`](phases/phase-02-module-a.md#T-2.5) | `AC-A5` | `F-A5` |
| `TEST-RTL-06` | وحدة + e2e | [`T-2.6`](phases/phase-02-module-a.md#T-2.6) | `AC-A6` | `F-A6` |
| `TEST-RTL-07` | e2e | [`T-2.7`](phases/phase-02-module-a.md#T-2.7) | `AC-A7`، `AC-1.2` | `F-A7` |
| `TEST-GUARD-01` | وحدة | [`T-2.7`](phases/phase-02-module-a.md#T-2.7) | `AC-A7` | `F-A7` |
| `TEST-GUARD-02` | وحدة | [`T-2.7`](phases/phase-02-module-a.md#T-2.7) | `AC-A7` | `F-A7` |
| `TEST-GUARD-03` | وحدة | [`T-2.7`](phases/phase-02-module-a.md#T-2.7) | `AC-A7` | `F-A7` |
| `TEST-GUARD-04` | وحدة | [`T-2.7`](phases/phase-02-module-a.md#T-2.7) | `AC-A7` | `F-A7` |
| `TEST-GLOSS-01` | وحدة + e2e | [`T-3.2`](phases/phase-03-module-b.md#T-3.2) | `AC-B1` | `F-B1`، `F-B2`، `F-B3`، `F-B4` |
| `TEST-GLOSS-02` | وحدة | [`T-3.2`](phases/phase-03-module-b.md#T-3.2) | `AC-B2` | `F-B1`، `F-B2`، `F-B3`، `F-B4` |
| `TEST-GLOSS-03` | وحدة + e2e | [`T-3.2`](phases/phase-03-module-b.md#T-3.2) | `AC-B3` | `F-B1`، `F-B2`، `F-B3`، `F-B4` |
| `TEST-GLOSS-06` | وحدة | [`T-3.2`](phases/phase-03-module-b.md#T-3.2) | `AC-B4` | `F-B1`، `F-B2`، `F-B3`، `F-B4` |
| `TEST-GLOSS-04` | وحدة + e2e | [`T-3.4`](phases/phase-03-module-b.md#T-3.4) | `AC-B6` | `F-B6` |
| `TEST-GLOSS-05` | آلي (بيانات) | [`T-3.1`](phases/phase-03-module-b.md#T-3.1)، [`T-3.2`](phases/phase-03-module-b.md#T-3.2) | `AC-3.1` | `F-B1`، `F-B2`، `F-B3`، `F-B4` |
| `TEST-TOUR-01` | e2e | [`T-3.5`](phases/phase-03-module-b.md#T-3.5) | `AC-B7` | `F-B7` |
| `TEST-A11Y-01` | آلي + يدوي | [`T-3.3`](phases/phase-03-module-b.md#T-3.3) | `AC-B5` | `F-B5` |
| `TEST-A11Y-02` | آلي + يدوي | [`T-3.3`](phases/phase-03-module-b.md#T-3.3) | `AC-B5` | `F-B5` |
| `TEST-TR-01` | وحدة + e2e | [`T-4.1`](phases/phase-04-module-c.md#T-4.1) | `AC-C1` | `F-C1`، `F-C3` |
| `TEST-TR-02A` | وحدة | [`T-4.2`](phases/phase-04-module-c.md#T-4.2) | `AC-C2` | `F-C2` |
| `TEST-TR-02B` | وحدة | [`T-4.2`](phases/phase-04-module-c.md#T-4.2) | `AC-C2` | `F-C2` |
| `TEST-TR-02C` | وحدة | [`T-4.2`](phases/phase-04-module-c.md#T-4.2) | `AC-C2` | `F-C2` |
| `TEST-TR-02D` | وحدة | [`T-4.2`](phases/phase-04-module-c.md#T-4.2) | `AC-C2` | `F-C2` |
| `TEST-TR-02E` | وحدة | [`T-4.2`](phases/phase-04-module-c.md#T-4.2) | `AC-C2` | `F-C2` |
| `TEST-TR-02F` | وحدة | [`T-4.2`](phases/phase-04-module-c.md#T-4.2) | `AC-C2` | `F-C2` |
| `TEST-TR-03` | e2e | [`T-4.1`](phases/phase-04-module-c.md#T-4.1) | `AC-C3` | `F-C1`، `F-C3` |
| `TEST-TR-04` | تكامل + يدوي | [`T-4.3`](phases/phase-04-module-c.md#T-4.3) | `AC-C4`، `AC-C1` | `F-C4` |
| `TEST-TR-05` | تكامل | [`T-4.4`](phases/phase-04-module-c.md#T-4.4) | `AC-C5` | `F-C5` |
| `TEST-PRIV-01` | تكامل (تدقيق شبكة) | [`T-4.5`](phases/phase-04-module-c.md#T-4.5) | `AC-C6` | `F-C6` |
| `TEST-PR-01` | e2e | [`T-5.1`](phases/phase-05-module-d.md#T-5.1) | `AC-D1` | `F-D1`، `F-D2` |
| `TEST-PR-02` | وحدة + e2e | [`T-5.1`](phases/phase-05-module-d.md#T-5.1) | `AC-D2` | `F-D1`، `F-D2` |
| `TEST-PR-03` | e2e | [`T-5.2`](phases/phase-05-module-d.md#T-5.2) | `AC-D3` | `F-D3`، `F-D4` |
| `TEST-PR-04` | وحدة + e2e | [`T-5.2`](phases/phase-05-module-d.md#T-5.2) | `AC-D4` | `F-D3`، `F-D4` |
| `TEST-LOG-01` | وحدة | [`T-5.3`](phases/phase-05-module-d.md#T-5.3) | `AC-D5` | `F-D5` |
| `TEST-DIFF-01` | e2e | [`T-5.4`](phases/phase-05-module-d.md#T-5.4) | `AC-D6` | `F-D6` |
| `TEST-SEC-01` | تكامل + مراجعة شيفرة | [`T-5.5`](phases/phase-05-module-d.md#T-5.5) | `AC-5.5` | `F-D4`، `F-D5` |
| `TEST-SEC-02` | آلي | [`T-5.5`](phases/phase-05-module-d.md#T-5.5) | `AC-5.5` | `F-D4`، `F-D5` |
| `TEST-SEC-03` | تكامل | [`T-5.5`](phases/phase-05-module-d.md#T-5.5) | `AC-5.5` | `F-D4`، `F-D5` |
| `TEST-SEC-04` | آلي + تدقيق شبكة + مراجعة شيفرة | [`T-5.5`](phases/phase-05-module-d.md#T-5.5) | `AC-5.5N` | `F-D4`، `F-D5` |
| `TEST-CTX-01` | وحدة + e2e | [`T-6.1`](phases/phase-06-module-e.md#T-6.1) | `AC-E1` | `F-E1`، `F-E2` |
| `TEST-CTX-02` | وحدة + e2e | [`T-6.1`](phases/phase-06-module-e.md#T-6.1) | `AC-E2` | `F-E1`، `F-E2` |
| `TEST-CTX-03` | وحدة | [`T-6.2`](phases/phase-06-module-e.md#T-6.2) | `AC-E3` | `F-E3`، `F-E4` |
| `TEST-CTX-04` | e2e + تدقيق شبكة | [`T-6.2`](phases/phase-06-module-e.md#T-6.2) | `AC-E4` | `F-E3`، `F-E4` |
| `TEST-PRIV-02` | وحدة | [`T-6.3`](phases/phase-06-module-e.md#T-6.3) | `AC-E5` | `F-E5` |
| `TEST-WRITE-01` | e2e | [`T-7.1`](phases/phase-07-module-f.md#T-7.1) | `AC-F1` | `F-F1`، `F-F4` |
| `TEST-WRITE-02` | e2e | [`T-7.2`](phases/phase-07-module-f.md#T-7.2) | `AC-F2` | `F-F2` |
| `TEST-WRITE-03` | وحدة + e2e | [`T-7.3`](phases/phase-07-module-f.md#T-7.3) | `AC-F3` | `F-F3`، `F-F5` |
| `TEST-WRITE-04` | e2e | [`T-7.1`](phases/phase-07-module-f.md#T-7.1) | `AC-F4` | `F-F1`، `F-F4` |
| `TEST-WRITE-05` | وحدة + تدقيق شبكة | [`T-7.3`](phases/phase-07-module-f.md#T-7.3) | `AC-F5` | `F-F3`، `F-F5` |
| `TEST-NOTE-01` | e2e | [`T-8.1`](phases/phase-08-module-g.md#T-8.1) | `AC-G1` | `F-G1` |
| `TEST-NOTE-02` | وحدة + e2e | [`T-8.2`](phases/phase-08-module-g.md#T-8.2) | `AC-G2` | `F-G2` |
| `TEST-NOTE-03A` | وحدة + e2e | [`T-8.3`](phases/phase-08-module-g.md#T-8.3) | `AC-G3` | `F-G3` |
| `TEST-NOTE-03B` | وحدة + e2e | [`T-8.3`](phases/phase-08-module-g.md#T-8.3) | `AC-G3` | `F-G3` |
| `TEST-NOTE-03C` | وحدة + e2e | [`T-8.3`](phases/phase-08-module-g.md#T-8.3) | `AC-G3` | `F-G3` |
| `TEST-NOTE-03D` | وحدة + e2e | [`T-8.3`](phases/phase-08-module-g.md#T-8.3) | `AC-G3` | `F-G3` |
| `TEST-NOTE-03E` | وحدة + e2e | [`T-8.3`](phases/phase-08-module-g.md#T-8.3) | `AC-G3` | `F-G3` |
| `TEST-NOTE-03F` | وحدة + e2e | [`T-8.3`](phases/phase-08-module-g.md#T-8.3) | `AC-G3` | `F-G3` |
| `TEST-STORAGE-01` | وحدة + e2e | [`T-8.4`](phases/phase-08-module-g.md#T-8.4) | `AC-G4` | `F-G4`، `F-G5` |
| `TEST-PRIV-03` | تكامل (تدقيق شبكة) | [`T-8.4`](phases/phase-08-module-g.md#T-8.4) | `AC-G5`، `AC-G4` | `F-G4`، `F-G5` |
| `TEST-COMM-01` | e2e | [`T-9.1`](phases/phase-09-module-h.md#T-9.1) | `AC-H1` | `F-H1` |
| `TEST-COMM-02` | e2e | [`T-9.2`](phases/phase-09-module-h.md#T-9.2) | `AC-H2` | `F-H2` |
| `TEST-COMM-03` | e2e | [`T-9.3`](phases/phase-09-module-h.md#T-9.3) | `AC-H3` | `F-H3` |
| `TEST-COMM-04` | وحدة | [`T-9.4`](phases/phase-09-module-h.md#T-9.4) | `AC-H4` | `F-H4`، `F-H6` |
| `TEST-COMM-05` | وحدة + e2e (دون اتصال) | [`T-9.5`](phases/phase-09-module-h.md#T-9.5) | `AC-H5` | `F-H5` |
| `TEST-COMM-06` | وحدة + مراجعة شيفرة | [`T-9.4`](phases/phase-09-module-h.md#T-9.4) | `AC-H6` | `F-H4`، `F-H6` |
| `TEST-SPIKE-05` | تجربة موثقة | [`T-0.5`](phases/phase-00-feasibility.md#T-0.5) | `AC-S5.1`، `AC-S5.2`، `AC-S5.3`، `AC-S5.4` | `F-D7`، `F-D8`، `F-E7`، `F-E9` |
| `TEST-PR-05` | تكامل + تدقيق شبكة | [`T-5.5`](phases/phase-05-module-d.md#T-5.5) | `AC-D7` | `F-D7` |
| `TEST-PR-06` | وحدة + تكامل | [`T-11.5`](phases/phase-11-assist-layer.md#T-11.5) | `AC-D8` | `F-D8` |
| `TEST-CTX-05` | وحدة + مراجعة شيفرة (فحص ساكن) | [`T-11.2`](phases/phase-11-assist-layer.md#T-11.2) | `AC-E6` | `F-E6` |
| `TEST-CTX-06` | تكامل + e2e | [`T-11.3`](phases/phase-11-assist-layer.md#T-11.3) | `AC-E7` | `F-E7` |
| `TEST-CTX-07` | تدقيق شبكة + فحص بصري | [`T-11.3`](phases/phase-11-assist-layer.md#T-11.3) | `AC-E7` | `F-E7` |
| `TEST-CTX-08` | وحدة | [`T-11.4`](phases/phase-11-assist-layer.md#T-11.4) | `AC-E8` | `F-E8` |
| `TEST-CONN-01` | وحدة + تكامل | [`T-11.1`](phases/phase-11-assist-layer.md#T-11.1) | `AC-11.1` | `F-D8`، `F-D9`، `F-E9` |
| `TEST-CONN-02` | تكامل + مراجعة شيفرة | [`T-11.1`](phases/phase-11-assist-layer.md#T-11.1) | `AC-11.1` | `F-D8`، `F-D9`، `F-E9` |
| `TEST-AI-01` | تكامل + تدقيق شبكة | [`T-11.6`](phases/phase-11-assist-layer.md#T-11.6) | `AC-E9` | `F-E9` |
| `TEST-AI-02` | وحدة + مراجعة شيفرة | [`T-11.6`](phases/phase-11-assist-layer.md#T-11.6) | `AC-E9` | `F-E9` |
| `TEST-AI-03` | تكامل + e2e | [`T-11.7`](phases/phase-11-assist-layer.md#T-11.7) | `AC-D9` | `F-D9` |
| `TEST-PRIV-04` | تدقيق شبكة + مراجعة شيفرة | [`T-11.6`](phases/phase-11-assist-layer.md#T-11.6) | `AC-E9` | `F-E9` |
| `TEST-EXEC-01` | تكامل + تدقيق شبكة | [`T-11.8`](phases/phase-11-assist-layer.md#T-11.8) | `AC-F6` | `F-F6` |
| `TEST-EXEC-02` | آلي + مراجعة شيفرة | [`T-11.8`](phases/phase-11-assist-layer.md#T-11.8) | `AC-F6` | `F-F6` |
| `TEST-SEC-06` | مراجعة شيفرة (فحص ساكن) + آلي | [`T-11.9`](phases/phase-11-assist-layer.md#T-11.9) | `AC-F7` | `F-F7` |
| `TEST-SEC-07` | تكامل + e2e | [`T-11.9`](phases/phase-11-assist-layer.md#T-11.9) | `AC-F7` | `F-F7` |

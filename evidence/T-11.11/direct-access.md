# قياس الوصول المباشر إلى واجهة OpenAI من خلفية الإضافة (`HYP-20`، `AC-E11` (١))

- المرحلة `MJ24`، التاريخ 2026-10-24. السكربت: [`scripts/spikes/t1111-openai-direct.mjs`](../../scripts/spikes/t1111-openai-direct.mjs) وإضافة الاختبار `scripts/spikes/t1111-ext/` (لا تُشحن). النتيجة الخام: [`raw/direct-access.json`](raw/direct-access.json).
- **المنهج (كما في `T-0.5`):** إضافة اختبار تُحمَّل في Chrome وEdge وBrave وFirefox بملف تعريف مؤقت جديد، وتطلب `https://api.openai.com` **من خلفيتها** بمفتاح **غير صالح عمدًا** (مختلَق) وبلا أي محتوى من أي صفحة: `GET /v1/models` (طلب التحقق المعلن في المحوّل)، و`POST /v1/responses` (نقطة التحليل) بنص «ping» وحده وحد مخرجات 16 و`store: false`. كل طلب بلا وسيط. تشغيلان لكل متصفح: بصلاحية المضيف في المانيفست، وبدونها ضابطًا سلبيًا.
- الاتصال بمفتاح غير صالح لا يستهلك شيئًا ولا يحمل بيانات مستخدم؛ المفتاح لا يطابق أي حساب، والرد المتوقع 401.

## النتائج

| المتصفح | صلاحية المضيف | سياق الخلفية | الطلب | النتيجة |
| :--- | :--- | :--- | :--- | :--- |
| Chrome 156.0.8078.47 | في المانيفست | service-worker | `GET /v1/models` | 401 · type=`basic` · `invalid_request_error/invalid_api_key` |
| Chrome 156.0.8078.47 | في المانيفست | service-worker | `POST /v1/responses` | 401 · type=`basic` · `invalid_request_error/invalid_api_key` |
| Chrome 156.0.8078.47 | غائبة (ضابط سلبي) | service-worker | `GET /v1/models` | 401 · type=`cors` · `invalid_request_error/invalid_api_key` |
| Chrome 156.0.8078.47 | غائبة (ضابط سلبي) | service-worker | `POST /v1/responses` | فشل: `TypeError` — Failed to fetch |
| Edge 155.0.4283.60 | في المانيفست | service-worker | `GET /v1/models` | 401 · type=`basic` · `invalid_request_error/invalid_api_key` |
| Edge 155.0.4283.60 | في المانيفست | service-worker | `POST /v1/responses` | 401 · type=`basic` · `invalid_request_error/invalid_api_key` |
| Edge 155.0.4283.60 | غائبة (ضابط سلبي) | service-worker | `GET /v1/models` | 401 · type=`cors` · `invalid_request_error/invalid_api_key` |
| Edge 155.0.4283.60 | غائبة (ضابط سلبي) | service-worker | `POST /v1/responses` | فشل: `TypeError` — Failed to fetch |
| Brave 156.0.8078.48 | في المانيفست | service-worker | `GET /v1/models` | 401 · type=`basic` · `invalid_request_error/invalid_api_key` |
| Brave 156.0.8078.48 | في المانيفست | service-worker | `POST /v1/responses` | 401 · type=`basic` · `invalid_request_error/invalid_api_key` |
| Brave 156.0.8078.48 | غائبة (ضابط سلبي) | service-worker | `GET /v1/models` | 401 · type=`cors` · `invalid_request_error/invalid_api_key` |
| Brave 156.0.8078.48 | غائبة (ضابط سلبي) | service-worker | `POST /v1/responses` | فشل: `TypeError` — Failed to fetch |
| Firefox 158.0.1 | في المانيفست | background-page | `GET /v1/models` | 401 · type=`basic` · `invalid_request_error/invalid_api_key` |
| Firefox 158.0.1 | في المانيفست | background-page | `POST /v1/responses` | 401 · type=`basic` · `invalid_request_error/invalid_api_key` |
| Firefox 158.0.1 | غائبة (ضابط سلبي) | background-page | `GET /v1/models` | 401 · type=`cors` · `invalid_request_error/invalid_api_key` |
| Firefox 158.0.1 | غائبة (ضابط سلبي) | background-page | `POST /v1/responses` | فشل: `TypeError` — NetworkError when attempting to fetch resource. |

## الحكم

- **`HYP-20` صحيحة للمزوّد OpenAI في المتصفحات الأربعة:** خلفية الإضافة (عامل خدمة في Chrome وEdge وBrave، وصفحة خلفية في Firefox) تطلب واجهته مباشرة وتقرأ رده وجسم الخطأ المعلن (`401 invalid_api_key`)، **بلا ترويسة وصول مباشر خاصة** (على خلاف Anthropic، الذي يشترط `anthropic-dangerous-direct-browser-access`) وبلا وسيط. فلا ينطبق `BLK-PROVIDER-DIRECT-ACCESS` ويُضاف المحوّل.
- **الضابط السلبي:** بلا صلاحية المضيف يفشل `POST /v1/responses` بفشل الطلب التمهيدي لـCORS (`Failed to fetch` / `NetworkError`) في الأربعة، ويصل `GET` بنوع `cors` ويُقرأ رده (طلب بسيط بلا طلب تمهيدي). أي أن نجاح الطلب يعتمد على **صلاحية المضيف الممنوحة**، وهو ما يفرضه تصميم المنتج (`optional_host_permissions` تُطلب بنقر صريح، والبوابة `gatedFetch` ترفض الطلب قبل إرساله بدونها). ولا يُنقل أي طلب إلى صفحة المحتوى.
- **حدّ القياس:** الصلاحية هنا في `host_permissions` لإضافة الاختبار، لا اختيارية تُمنح بنقر؛ أثرها في الطلب واحد حين تُمنح. وتدفق الطلب والمنح الفعلي في الحزمة المشحونة تقيسه `browser-openai-check.json` (صلاحية ممنوحة في نسخة مشتقة لأن نافذة الإذن لا تُقبل آليًا، وفي Firefox موافقة `websiteContent` تُمنح بنقرة الحفظ) ولقطة النافذة الأصلية لـFirefox ضمن `MJ23`.
- **ما لم يُقس:** نجاح الطلب بمفتاح صالح، وسلوك البث، وحدود الحجم الفعلية: `TEST-AI-09` (الاتصال الحقيقي) يحتاج مفتاحًا تجريبيًا من المالك ولم يتوفر، فيُسجَّل «لم يُجرَ».

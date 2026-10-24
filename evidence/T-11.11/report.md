# `T-11.11` — محوّل OpenAI: التحقق والنماذج المتوافقة والتحليل وتفسير الأخطاء (`AC-E11`، `F-E9`)

- المرحلة `MJ24` (الموجة L)، الفرع `mj/24-openai-adapter` من `main` (`37d86c0`)، 2026-10-24. **محاكاة لا اتصال حقيقي:** كل فحص على مضيف OpenAI وهمي محلي؛ الاتصال الحقيقي (`TEST-AI-09`) **لم يُجرَ** (لا مفتاح تجريبي من المالك).

## معايير القبول (`AC-E11`)

| البند | الدليل | النتيجة |
| :--- | :--- | :--- |
| (١) الوثائق الرسمية ثم الوصول المباشر | [`docs-read.md`](docs-read.md) (روابط وتاريخ 2026-10-24) · [`direct-access.md`](direct-access.md) و[`raw/direct-access.json`](raw/direct-access.json) بمفتاح غير صالح عمدًا وبلا محتوى | ✓ صحيح في Chrome 156 وEdge 155 وBrave 156 وFirefox 158.0.1: الخلفية تطلب `api.openai.com` وتقرأ رده (401 `invalid_api_key`) بلا وسيط ولا ترويسة خاصة؛ والضابط السلبي بلا صلاحية يفشل في `POST`. لا `BLK-PROVIDER-DIRECT-ACCESS` |
| (٢) محوّل فعلي | [`openai.ts`](../../src/modules/e/provider/adapters/openai.ts)؛ `openai-adapter.test.ts` (28) و`openai-service.test.ts` (10): تحقق `GET /v1/models`، تحليل `POST /v1/responses`، تفسير الرد إلى `parseAnalysis` (اقتباس وارد مثبت وغير وارد معلن، والناقص)، وأصناف الأخطاء: 401 مفتاح مرفوض · 403 · 404 غير متاح · 400 `context_length_exceeded`/413 حجم زائد · 429 بـ`retry-after` المعلن · 5xx/503 · الشبكة · الإيقاف · الصلاحية؛ منقّحة من المفتاح؛ لا إعادة ولا تحويل | ✓ محاكاة |
| (٣) النماذج بـ`DEC-13` | قائمة OpenAI الرسمية لا تعلن توافقًا ⇒ كلها `unknown`؛ لا مودل ولا خيار قبل «افحص التوافق» (`POST /v1/responses` بـ«ping» وحد 16 و`store:false`)؛ `browser-openai-check.json` (الأربعة) و`static.test.ts` (لا أسماء مودلات) | ✓ محاكاة (`HYP-22`: الفحص الصريح هو المسار) |
| (٤) الأسرار والشبكة | المفتاح في ترويسة `Authorization` وحدها إلى `api.openai.com` من الخلفية؛ لا `x-api-key` ولا رمز GitHub ولا مفتاح Anthropic ولا طلب إلى Anthropic (`browser-openai-check`: 83/83)؛ `openai-key` في `scan.ts` (`openai-key.test.ts`: يحجبه «نسخ البرومبت» والتحليل ويرصده تنبيه الحزمة)؛ `https://api.openai.com/*` اختيارية في المانيفستين (`openai-static.test.ts`)؛ تدقيق الشبكة الساكن (0 مخالفة) والديناميكي (Chrome/Brave: 0 طلب، الضابط كُشف) والعزل (`provider-isolation.txt`: علامات OpenAI في `background.js` وحده، والضابط الإيجابي كشف التسرب)؛ Firefox بلا تغيير في الإعلان | ✓ محاكاة |
| (٥) المحاكاة والاتصال الحقيقي | `fixture-provider-mock.ts` موسّعًا بمضيف OpenAI الوهمي | محاكاة ✓ · الاتصال الحقيقي: **لم يُجرَ** (يحتاج مفتاحًا تجريبيًا من المالك) |
| (٦) لا أسعار ولا تغيير في الأقسام ولا انحدار | `static.test.ts` (`AD-31`، `DEC-13`، الأقسام لا تعرف محوّلًا)؛ لا ملف من `d/analysis` أو `d/log-parser` أو `d/pr-status` في الفرق؛ انحدار: [`browser-provider-check.json`](browser-provider-check.json) 100/100 · [`regression/`](regression/) «نسخ البرومبت» بلا مفتاح 87/87 (Chromium) و28/28 (Firefox) وسجل الاتصالات 124/124 · [`browser-sim-check.json`](browser-sim-check.json) 14/14. الترحيب و«لماذا المفتاح؟» يذكران OpenAI من السجل (`ui.test.tsx`, `welcome.test.tsx`)، و`PRIVACY.md` يكتبه `MJ26` | ✓ |

## الفحوص

| الفحص | النتيجة |
| :--- | :--- |
| `npx tsc --noEmit` ([`typecheck.txt`](typecheck.txt)) | نظيف |
| `npx vitest run` الكامل ([`vitest-full.txt`](vitest-full.txt)) | 175 ملفًا، **2655 اجتازت** و2 متخطاة. التشغيل الأول سقط فيه اختبار توقيت `PB-04` في `g/bookmarks/ui.test.tsx` (17.47ms > 15) تحت حِمل المتصفحات، وأُعيد منفردًا ثم كاملًا فاجتاز؛ ليس من هذه المرحلة |
| مرحلة المزوّد ([`vitest-stage.txt`](vitest-stage.txt)) | 11 ملفًا، 131 اختبارًا |
| `scripts/load-check.mjs` ([`load-check.txt`](load-check.txt)) | الأربعة نجحت بلا أخطاء مانيفست ولا تشغيل |
| `web-ext lint` ([`web-ext-lint.txt`](web-ext-lint.txt)) | 0 أخطاء و0 تحذيرات |
| تدقيق الشبكة ([`network-audit/`](network-audit/)) | ساكن 0 مخالفة؛ ديناميكي Chrome وBrave جاهز 0 طلب 0 تسرب (Edge: المحرك غير متاح كما في الموجات السابقة)؛ العزل 0 مخالفة |

## ما لم يُجرَ

- **`TEST-AI-09` الاتصال الحقيقي:** لم يتوفر مفتاح تجريبي؛ لا نجاح حقيقي مسجَّل. القياس الوحيد الحقيقي هو الوصول المباشر بمفتاح غير صالح (`direct-access.md`).
- **نافذة موافقة Firefox الأصلية:** لم تُعَد؛ إعلان `websiteContent` وتدفق الطلب لم يتغيرا (قياس `MJ23`: 21/21)، وفحص الأربعة هنا بصلاحية ممنوحة في نسخة مشتقة.
- **رسالة الرفض الجزئي `content_filter`:** رد مقطوع بنص جزئي يُعرض تحليلًا بسبب توقف `content_filter` دون وسم خاص في الواجهة (لا نص → فشل معلن).

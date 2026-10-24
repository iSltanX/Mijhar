# بوابة الموجة L — على الشجرة المجمّعة

- **التاريخ:** 2026-10-24، 22:34 إلى 22:50 بتوقيت الجهاز، ثم إعادة ما مسّه تعديل CSS بعدها.
- **الشجرة:** `integration/mj-L` عند `17a1067` (بعد دمج `MJ24` و`MJ25` وفرع الصفحات وحقل النموذج و`DEC-13` ن-5 وفحوص البوابة)، و`main` لم يتقدم عليها (`main-ahead=0`). ثم `009ab54` (CSS وحده في `ModelField.tsx` بعد مراجعة اللقطات، [`review.md`](review.md) `L-S8`) وأُعيد عليها ما يمسّه: [`gate/rerun/steps.txt`](gate/rerun/steps.txt). ولا شيفرة بعد `009ab54` (التزامات الحالة والأدلة وحدها).
- **الأمر:** [`gate/run.sh`](gate/run.sh) يشغّل الخطوات **متسلسلة** (المتصفحات والمنافذ لا تُشارَك)، وسجل الخطوات ورموز خروجها في [`gate/steps.txt`](gate/steps.txt)، ومخرج كل خطوة في `gate/<الخطوة>.txt` وملفات JSON بجانبها؛ والإعادة [`gate/rerun.sh`](gate/rerun.sh).
- **المتصفحات:** Chrome 156.0.8078.47 وEdge 155.0.4283.60 وBrave 156.0.8078.48 وFirefox 158.0.1 (`EV-09`).
- **كل ما في البوابة محاكاة** بمضيفات مزوّدين وهمية محلية ومفاتيح مختلَقة تُركَّب وقت التشغيل، إلا ما يُذكر غير ذلك صراحة.
- **النتيجة: خضراء.** كل خطوة خرجت بـ0 في البوابة وفي الإعادة، ولا بند فاشل. وفُحصت الأدلة كلها بأنماط المفاتيح والرموز: لا سرّ فيها.

## فحوص `gate` الموجة (`Docs/MJ/waves.json`)

| البند | الأمر والدليل | النتيجة |
| :--- | :--- | :--- |
| اختبارات المحوّلين مجتمعة (`TEST-AI-07` و`TEST-AI-08`) وما تمسّه الموجة | `npx vitest run tests/modules/e/provider … tests/core/guardrails` (12 مسارًا) ← [`gate/vitest-gate.txt`](gate/vitest-gate.txt)؛ وبعد CSS: [`gate/rerun/vitest-provider.txt`](gate/rerun/vitest-provider.txt) | 32 ملفًا، 428/428؛ ثم 22 ملفًا، 330/330 |
| OpenAI في المتصفحات الأربعة (`TEST-AI-07`، `TEST-PRIV-05`) | `openai-check.mjs` ← [`gate/openai-check.txt`](gate/openai-check.txt) و[`gate/browser-openai-check.json`](gate/browser-openai-check.json) | 91/91 (23 لكل Chromium و22 لـFirefox) |
| Google Gemini في المتصفحات الأربعة (`TEST-AI-08`، `TEST-PRIV-05`) | `gemini-browser-check.mjs` ← [`gate/gemini-check.txt`](gate/gemini-check.txt) و[`gate/browser-gemini-check.json`](gate/browser-gemini-check.json) | 116/116 (29 لكلٍّ) |
| انحدار `TEST-AI-10` (Anthropic) في الأربعة | `provider-check.mjs` ← [`gate/provider-check.txt`](gate/provider-check.txt) | 100/100 (25 لكلٍّ) |
| تدقيق الشبكة في الأربعة: لكل مزوّد مضيفه وحده ومفتاحه وحده، ولا رمز GitHub، ولا طلب قبل الموافقة، ولا تحويل ولا إعادة | بنود الشبكة في الفحوص الثلاثة أعلاه، و`model-field-check.mjs` بالمفاتيح الثلاثة ورمز GitHub معًا (فحص تسرّب كل سرّ إلى غير مضيفه في العنوان والترويسات والجسم) ← [`gate/model-field-check.txt`](gate/model-field-check.txt)؛ وبعد CSS: [`gate/rerun/model-field-check.txt`](gate/rerun/model-field-check.txt) | ✓ في الأربعة؛ 87/87 ثم 87/87 |
| أنماط حجب صيغ المفاتيح الثلاث على «نسخ البرومبت» والتحليل | `tests/modules/e/wave-l-crossing.test.tsx` (جديد: Anthropic وOpenAI وGemini بصيغتيه في صفحة واحدة) ضمن `vitest-gate`؛ وطفرتا حذف `openai-key` و`gemini-key` أسقطتا 6 و7 اختبارات ([`review.md`](review.md)) | ✓ |
| الصلاحيات الاختيارية الثلاث في المانيفستين وإعلان Firefox كما هو | `tests/core/ui-host/manifest.test.ts` ضمن `vitest-gate`؛ والتدقيق الساكن ← [`gate/static-audit.txt`](gate/static-audit.txt)؛ ونافذة Firefox الأصلية (انحدار Anthropic) ← [`gate/firefox-native.txt`](gate/firefox-native.txt) و[`gate/firefox-native-consent/`](gate/firefox-native-consent/) | `optional_host_permissions`: `api.github.com` و`api.anthropic.com` و`api.openai.com` و`generativelanguage.googleapis.com`؛ و`websiteContent` اختيارية؛ 0 مخالفات؛ والنافذة الأصلية 21/21 بلا قبول آلي |
| عزل المحوّلات في `background.js` وحده (`I-2`) | `network-audit.mjs providers` ← [`gate/provider-isolation.txt`](gate/provider-isolation.txt)؛ وبعد CSS: [`gate/rerun/provider-isolation.txt`](gate/rerun/provider-isolation.txt) | 0 مخالفات (علامات Anthropic وOpenAI وGemini في `background.js` وحده، ومخزن الأسرار في الخلفية والإعدادات وحدهما) |
| الاتصال الحقيقي (`TEST-AI-09`) | — | **لم يُجرَ في البوابة**: لا مفتاح تجريبي متاح لجلسة الدمج. والاتصالان الحقيقيان السابقان جزئيان ([`review.md`](review.md) `L-1` و`L-4`)، فلا يُسجَّل اجتيازًا للمسار الكامل في المتصفح |

## حقل النموذج اليدوي (`DEC-13` ن-5) — ما طلب المالك اختباره خصوصًا

`model-field-check.mjs` على الحزمة المشحونة في الأربعة، وكل نقرة نقرة فعلية (Playwright/Marionette):

| الحالة | البند | النتيجة |
| :--- | :--- | :--- |
| معرّف يدوي خارج القائمة | يُكتب `gpt-future-x` ويُحفظ بلا أي طلب عند الكتابة، والموافقة تعرضه، والتحليل يُرسل إليه بطلب واحد من الخلفية والنتيجة موسومة به | ✓ |
| زر + والإغلاق | زر + بنقرة فعلية يعرض القائمة أو يجلبها، والاختيار يملأ الحقل ويغلقها ويعيد التركيز إليه | ✓ |
| تبديل المزوّد والعزل | حقل كل مزوّد ونتيجة اختباره له وحده، ولا تظهر نتيجة OpenAI عند Gemini؛ والمفاتيح الثلاثة إلى مضيفاتها وحدها | ✓ |
| فشل جلب القائمة | Gemini 503: «تعذّر جلب القائمة (…). الحقل يعمل كما هو» و«أعد المحاولة»، والحقل يُكتب ويُحفظ بلا طلب، وإعادة المحاولة تعرض القائمة | ✓ |
| لا شرط للاختبار قبل التحليل | التحليل بمعرّف لم يُختبر قط؛ والموافقة والصلاحيات باقية (لا طلب قبل «إرسال للتحليل») | ✓ |
| الرفض بلا تبديل ولا إعادة | `gpt-gone-1`: الاختبار «رفض» بسبب المزوّد، والتحليل به طلب واحد يعرض سبب الرفض، ولا طلب بعده خلال 1.5 ث، ولا طلب إلى Gemini ولا Anthropic، والحقل باقٍ | ✓ |
| «لم يُحسم» | 429 في الاختبار: «لم يُحسم الاختبار… ليس حكمًا على النموذج» لا رفض | ✓ |

وفي jsdom (`card.test.tsx` 18 اختبارًا): النقرة البرمجية على + و«اختبر النموذج» لا تفعل شيئًا، والأسهم وEnter وEsc والنقر خارج القائمة، والقائمة الخالية، ورفض صلاحية المضيف، وFirefox: + والاختبار بصلاحية المضيف وحدها بلا موافقة محتوى.

**المطابقة البصرية** ([`screens/`](screens/)، `model-field-screens.mjs` على الحزمة المشحونة في Chrome، فاتحًا وداكنًا): بلا مفتاح (O-24)، والقائمة مفتوحة (O-23 وO-27)، والاختبار مقبولًا ومرفوضًا، وفشل الجلب والقائمة الخالية (O-28). وقائمة المزوّد `select` أصلية بحالة المفتاح في نص الخيار ([`review.md`](review.md) `L-S4`). ولقطتا البطاقة كاملة في [`gate/screens/`](gate/screens/).

## ما يمسه الدمج من اختبارات المراحل المدمجة

| الفحص | الدليل | النتيجة |
| :--- | :--- | :--- |
| البناء | [`gate/build.txt`](gate/build.txt)؛ [`gate/rerun/build.txt`](gate/rerun/build.txt) | الحزمتان |
| الأنواع | `npx tsc --noEmit -p .` ← [`gate/typecheck.txt`](gate/typecheck.txt)؛ [`gate/rerun/typecheck.txt`](gate/rerun/typecheck.txt) | بلا أخطاء |
| الطقم كاملًا | `npx vitest run` ← [`gate/vitest-full.txt`](gate/vitest-full.txt) | 178 ملفًا، 2713 اجتازت و2 متخطيان قائمان |
| مرجع `AD-28` الحرفي | [`gate/ad28.txt`](gate/ad28.txt) | 6/6 |
| `web-ext lint` | [`gate/web-ext-lint.txt`](gate/web-ext-lint.txt)؛ [`gate/rerun/web-ext-lint.txt`](gate/rerun/web-ext-lint.txt) | 0 أخطاء و0 ملاحظات و0 تحذيرات |
| التحميل في الأربعة | `scripts/load-check.mjs` ← [`gate/load-check.txt`](gate/load-check.txt)؛ [`gate/rerun/load-check.txt`](gate/rerun/load-check.txt) | نجح في الأربعة بلا أخطاء مانيفست ولا تشغيل |
| «نسخ البرومبت» بلا مفتاح | `copy-prompt-check.mjs` ← [`gate/copy-prompt-chromium.txt`](gate/copy-prompt-chromium.txt) و[`gate/copy-prompt-firefox.txt`](gate/copy-prompt-firefox.txt) | 87/87 و28/28 (وفي Firefox «لم يُجرَ» قراءة الحافظة بسببه المعتاد) |
| سجل الاتصالات (البطاقة فيه) | `connections-check.mjs` ← [`gate/connections-check.txt`](gate/connections-check.txt) | 124/124 |
| التعدد بمحوّل وهمي ثانٍ (`MJ23`) | `sim-check.mjs` في Chrome ← [`gate/sim-check.txt`](gate/sim-check.txt) | 14/14 |

## ما لم يُجرَ ولماذا

- **الاتصال الحقيقي داخل الإضافة** بمفتاح OpenAI أو Gemini بالواجهة الجديدة: لا مفتاح تجريبي متاح لهذه الجلسة، ولم يُطلب لصق سرّ. ولا يُعدّ نجاح OpenAI من Node ولا Gemini عبر وكيل قبل الواجهة الجديدة نجاحًا للمسار الكامل.
- **نافذة Firefox الأصلية بمضيف OpenAI أو Gemini:** الفحص الأصلي لمضيف Anthropic، وأُعيد انحدارًا (21/21)؛ والآلية واحدة والإعلان لم يتغير.
- **تدقيق الشبكة الديناميكي لمسار الترجمة** (`network-audit.mjs dynamic`) و**مسار الإنجاز** (`exec-check`): الموجة لا تمسّهما.
- **إعادة الفحوص المتصفحية غير حقل النموذج بعد تعديل CSS** (`009ab54`): التعديل في سلسلة أنماط حزمة الإعدادات وحدها، لا DOM ولا منطق ولا شبكة؛ فأُعيد البناء والأنواع واختبارات المزوّد و`web-ext lint` والتدقيقان الساكنان والتحميل وفحص حقل النموذج في الأربعة.

# بوابة الموجة I على الشجرة المجمّعة

- الموجة: `I` (`MJ20` ثم `MJ21`) · فرع التكامل: `integration/mj-I` من `main` عند `6f78196` (= `mj-I/base`) · التزاما الدمج `--no-ff`: `0ff0874` (`MJ20`) · `941637f` (`MJ21`، ومعه حل التعارض النصي في `src/core/registry.ts` و`src/options/sections.ts`: سطرا المرحلتين معًا).
- التاريخ: 2026-10-24.
- **المراجعة قبل الدمج** (`AD-26`): أجرتها هذه الجلسة على الفرعين قبل أول دمج، والتقرير في [`review.md`](review.md): لا خلل يمنع الدمج، وتسع ملاحظات لا تمنع. وفحوصها التشغيلية (ست طفرات) في [`review/`](review/).
- البوابة بحسب `Docs/MJ/waves.json`: «اختبارات `tests/modules/e/copy-prompt` و`tests/modules/e/provider` و`tests/modules/d/analysis` مجتمعة بعد الدمج، وتدقيق شبكة كامل: لا طلب إلى المزوّد قبل موافقة صريحة، ولا وجهة غير `github.com` و`api.github.com` ومضيف المزوّد، ولا رمز GitHub في أي طلب إلى المزوّد، و«نسخ البرومبت» يعمل مع إزالة كل المفاتيح. وقيدا `AD-30` على الشجرة المجمّعة (`H-5` و`H-1`)، ومرجع المخرج الحرفي 6/6 (`AD-28`)»؛ والجولة اليدوية: «في Chrome بلا أي مفتاح: نقر «نسخ البرومبت» في قسم الفحوص وفي صفحة مشكلة، واللصق في محرر نصي؛ ثم بمفتاح وهمي: ظهور تجربة الموافقة قبل أي طلب». وزِيد عليها ما يمسّه الدمج: الطقم كاملًا، و`tsc`، والبناء والفحص والتحميل، وانحدار الاتصالات (`MJ18`) والرمز (`MJ15`) والبطاقة (`MJ11`) والمنشئ والقوالب (`MJ15`–`MJ19`) وتكامل الوحدات كلها والمضيف (`TEST-CORE-05` و`06`).
- المتصفحات تباعًا (Chrome 156.0.8078.47 · Edge 155.0.4283.60 · Brave 156.0.8078.48 · Firefox 158.0.1)، بسكربت واحد متسلسل ([`gate-run.txt`](gate-run.txt): كل خطوة خرجها 0). لا `npm ci`: `package.json` وملف القفل لم يتغيرا (`git diff --name-only main HEAD -- package.json package-lock.json` فارغ)؛ والمانيفست تغيّر بـ`MJ21` وحدها (المضيف الاختياري `api.anthropic.com` وإعلان Firefox).
- مخرجات الفحوص كُتبت في `evidence/wave-I/` لا فوق أدلة المراحل (`--out-dir`، و`--out` لفحص المضيف)؛ و`git status` بعد البوابة لا يُظهر تعديلًا في `evidence/T-*`.

## لا دمج أسقط غيره

لكل فرع: كل سطر أضافه في فرقه `git diff main...<الفرع>` موجود في الشجرة المجمّعة، وكل سطر حذفه غائب عنها، في الملفات الثلاثة المشتركة (`src/core/registry.ts` و`src/options/sections.ts` و`tests/modules/d/token/browser/drivers.mjs`)؛ وبقية ملفات كل فرع (55 لـ`MJ20` و87 لـ`MJ21`) بلا أي فرق بين الفرع والشجرة المجمّعة (`git diff <الفرع> HEAD -- <ملفاته>` لا يمس غير الثلاثة). وفي `drivers.mjs` تبقى إضافة `MJ20` (`context` و`githubPage`) فوق تعميم `MJ21` (`extra` لمضيفات إضافية).

## ما شُغِّل

| الفحص | الأمر | النتيجة | الدليل |
| :--- | :--- | :--- | :--- |
| الأنواع | `npx tsc --noEmit` | خروج 0 | [`typecheck.txt`](typecheck.txt) |
| **بوابة الموجة: الاختبارات مجتمعة** | `npx vitest run tests/modules/e/copy-prompt tests/modules/e/provider tests/modules/d/analysis tests/modules/e/wave-i-crossing.test.tsx tests/modules/e/context/api-binding.test.ts tests/modules/e/context/bundle-golden.test.ts` | **13 ملفًا، 116 اجتازت** (منها مرجع `AD-28` الحرفي 6/6 واختبار التقاطع 4/4) | [`vitest-gate.txt`](vitest-gate.txt) |
| الطقم كاملًا | `npx vitest run` | **160 ملفًا، 2438 اجتازت و2 متخطيان** (المشروطان المعروفان) | [`vitest-full.txt`](vitest-full.txt) |
| البناء | `npm run build` | الحزمتان، خروج 0 | [`build.txt`](build.txt) |
| فحص Firefox | `npx web-ext lint --source-dir dist/firefox` | 0 أخطاء، 0 ملاحظات، 0 تحذيرات | [`web-ext-lint.txt`](web-ext-lint.txt) |
| التحميل | `npm run load-check` | نجح في الأربعة: ENABLED، بلا أخطاء مانيفست ولا تشغيل ولا تحذيرات، والخلفية تعمل | [`load-check.md`](load-check.md) |
| **بوابة الموجة: «نسخ البرومبت» بلا مفاتيح** (`TEST-CTX-06` و`07`) | `node tests/modules/e/browser/copy-prompt-check.mjs chrome edge brave firefox` | **115/115** (29/29 ×3 و28/28)؛ `PB-08` بين 3.0 و62.8ms (< 300ms) | [`modules/copy-prompt/`](modules/copy-prompt/) |
| **بوابة الموجة: المزوّد وتدقيق الشبكة** (`TEST-AI-01` و`03` و`TEST-PRIV-04`) | `node tests/modules/e/provider/browser/provider-check.mjs chrome edge brave firefox` | **96/96** (24/24 في كل متصفح) | [`modules/provider/`](modules/provider/) |
| انحدار الاتصالات (`TEST-CONN-01` و`02`) | `node tests/core/connections/browser/connections-check.mjs chrome edge brave firefox` | **124/124** | [`modules/connections/`](modules/connections/) |
| انحدار الرمز (`MJ15`، `DEC-04`) | `node tests/modules/d/token/browser/token-check.mjs chrome edge brave firefox` | **106/106** | [`modules/token/`](modules/token/) |
| انحدار البطاقة (`MJ11`، `TEST-PR-06`) | `node tests/modules/d/browser/mj11-integration.mjs chrome edge brave firefox` | **72/72**، ورسائل كونسول الإضافة 0 | [`modules/mj11/`](modules/mj11/) |
| انحدار المنشئ (`TEST-CTX-01` و`02`) | `node tests/modules/e/browser/builder-check.mjs chrome edge brave firefox` | **55/55** | [`modules/builder/`](modules/builder/) |
| انحدار القوالب (`TEST-CTX-03` و`04` و`TEST-PRIV-02`) | `node tests/modules/e/browser/templates-check.mjs chrome edge brave firefox` | **127/127** | [`modules/templates/`](modules/templates/) |
| تكامل الوحدات كلها على الحزمة المشحونة | `node tests/modules/browser/integration.mjs chrome edge brave firefox` | **103/103**، وأخطاء الكونسول 0 في الأربعة | [`modules/integration/`](modules/integration/) |
| عدم تراجع المضيف (`TEST-CORE-05` و`06`) | `node tests/core/ui-host/browser/run.mjs --out evidence/wave-I/ui-host` | اجتاز في الأربعة | [`ui-host/browser-report.md`](ui-host/browser-report.md) |
| تدقيق الشبكة الساكن | `node scripts/network-audit.mjs static --out-dir evidence/wave-I/network-audit` | 0 مخالفات و0 تحذيرات | [`network-audit/static-audit.txt`](network-audit/static-audit.txt) |

## قيدا `AD-30` على الشجرة المجمّعة

`tests/modules/e/wave-i-crossing.test.tsx` (كتبته هذه الجلسة، 4/4، والمفتاح مختلَق يُركَّب وقت التشغيل):
- **`H-5`:** «نسخ البرومبت» (`MJ20`) يحجب مفتاحًا بصيغة `sk-ant-api03-…` بنمط `MJ21` ويعدّه في التنبيه «1× مفتاح Anthropic API»، ولا يظهر في المنسوخ ولا واجهة الزر؛ والتحليل من بطاقة الطلب تعلن موافقته «حُجب 1 موضعًا» وما يصل منفذ المزوّد بلا المفتاح.
- **`H-1`:** قراءة API لالتزام غير الظاهر لا تدخل ما يُرسل للتحليل، وسطرها في «المعلومات الناقصة»: «قراءة API لالتزام آخر (0123456 …) غير الظاهر الآن (22c15d5 …)؛ تغيّر الالتزام، فلم تدخل الفحوص ولا الموانع وقيمها غير معروف»؛ وضابطها لالتزام الرأس يدخل.
- **`AD-28`:** `bundle-golden.test.ts` 6/6 (الحزمة والقوالب بلا قراءة API كما كانت حرفيًا).
- والتطفير يثبت أن الاختبارين يحرسان فعلًا: حذف النمط يُسقط اختباري `H-5`، وقبول كل قراءة في `bindApi` يُسقط اختبار `H-1` ([`review.md`](review.md)، القسم 4).

## تدقيق الشبكة: لا طلب قبل الموافقة، ولا وجهة غير المعلنة، ولا رمز إلى المزوّد

- **ديناميكي** (فحص المزوّد في الأربعة، مضيف المزوّد وهمي محلي و`github.com` و`api.github.com` محليان، وكل مضيف آخر يُحجب ويُسجَّل): لا طلب إلى المزوّد قبل حفظ المفتاح؛ وبعده طلب التحقق المعلن وحده `GET /v1/models?limit=100` من الخلفية؛ وفتح صفحة الفحوص لا يرسل شيئًا؛ والنقر البرمجي من عالم الصفحة لا يفتح الموافقة ولا يرسل؛ وطلب تحليل واحد لكل تفعيل حقيقي (فأرة وEnter وSpace)؛ وكل طلبات المزوّد من الخلفية بالمفتاح وحده (`x-api-key`) **بلا `Authorization` ولا رمز GitHub**؛ ولا مفتاح في طلب إلى GitHub ولا في الكونسول؛ و**لا وجهة للإضافة غير `github.com` و`api.github.com` و`api.anthropic.com`**. وفي Firefox لا تحليل قبل موافقة `websiteContent` (بالقبول الآلي في ملف التعريف؛ معاينة النافذة الأصلية لم تُجرَ هنا، `I-8`).
- **«نسخ البرومبت» بلا أي مفتاح** (فحص النسخ في الأربعة): لا طلب إلى `api.github.com` ولا إلى `github.com` أثناء الجمع والتجهيز والنسخ، ولا مفتاح ولا رمز في التخزين.
- **ساكن:** المانيفستان: `sidePanel` و`storage` (Chromium) و`storage` (Firefox)، ومضيف `https://github.com/*`، واختياريان `https://api.github.com/*` و`https://api.anthropic.com/*`؛ وإعلان Firefox `required: ["none"]` و`optional: ["websiteContent"]`. ومواضع الأسرار في الحزمة المبنية ([`security-static.txt`](security-static.txt)): مخزن السرّين في `background.js` و`options.js` وحدهما، و`Authorization` في `background.js` وحده.

## الجولة اليدوية في Chrome

[`manual-round.mjs`](manual-round.mjs) يشغّل Chrome 156.0.8078.47 **بنافذة مرئية** (`headless: false`) بنقرات فأرة وضغطات لوحة مفاتيح حقيقية من Playwright، بلا شبكة خارجية (`github.com` من العينات المحفوظة، و`api.anthropic.com` مضيف وهمي محلي). **17/17** ([`manual-round.txt`](manual-round.txt)، [`manual-round.json`](manual-round.json)، واللقطات في [`manual-screens/`](manual-screens/)، والمنسوخ كما لُصق في [`manual-round-clipboard/`](manual-round-clipboard/)):

| الجزء | ما قيس | النتيجة | اللقطة |
| :--- | :--- | :--- | :--- |
| أ. `dist/chromium` المشحونة كما هي، بلا أي مفتاح ولا رمز | صفحة مهمة Actions (قسم الفحوص): نقرة فأرة على «نسخ البرومبت» ← «تم النسخ»، وحافظة النظام (`pbpaste`) تبدأ بـ«# تشخيص الخطأ:»، واللصق بـ⌘V في محرر نصي يطابقها حرفًا بحرف (59 سطرًا) وفيه «exit code 1» و«المعلومات الناقصة» | ✓ | `a-job-copied.png` · `a-job-pasted.png` |
| | خيار التحليل في قسم الفحوص بوابة معلَّلة بالمفتاح، ولا زر «حلّل…» | ✓ | |
| | صفحة مشكلة: النسخ نفسه، والمنسوخ يبدأ بـ«# فهم المشكلة: Local Debug» واللصق يطابقه (201 سطرًا) | ✓ | `a-issue-copied.png` · `a-issue-pasted.png` |
| | صفر طلبات إلى `api.anthropic.com` و`api.github.com` طوال الجزء | ✓ | |
| ب. نسخة مشتقة تمنح المضيفين (الشيفرة كما هي)، بمفتاح وهمي | حفظ المفتاح بالكتابة والنقر: طلب التحقق المعلن وحده، من الخلفية، بلا `Authorization`، ولا مفتاح في DOM الإعدادات | ✓ | `b-key-saved.png` |
| | قسم الفحوص وصفحة المشكلة: نقرة فأرة على «حلّل…» تُظهر الموافقة (Anthropic و`api.anthropic.com` وMock Sonnet 2 وما يُرسل وحجمه، والزر «إرسال للتحليل») **وصفر طلبات تحليل**؛ و«إلغاء» يغلقها ولا يرسل شيئًا | ✓ | `b-job-consent.png` · `b-issue-consent.png` |
| | نهاية الجولة: طلبات المزوّد كلها طلب التحقق الواحد، ولا مفتاح في صفحة GitHub | ✓ | |

وحافظة النظام حُفظت قبل الجولة وأُعيدت بعدها. وما لا تثبته هذه الجولة: مفتاح حقيقي واتصال حقيقي بـ`api.anthropic.com` (لا تُدخل الجلسة أسرارًا حقيقية)، وصفحات github.com الحية بأنماطها.

## لم يُجرَ

- اتصال حقيقي بمزوّد التحليل بمفتاح حقيقي (`TEST-AI-01` يذكر «مفتاح تجريبي إن توفر»): كل ما سبق بمضيف وهمي محلي.
- معاينة نافذة موافقة Firefox الأصلية (`websiteContent`) بلا قبول آلي (`I-8`): طلب المالك إجراءها بعد الدمج، ونتيجتها في دليلها المستقل.
- تحديث تصميم Figma بجملة موافقة Firefox وحالاتها (`I-9`): بعد الدمج بطلب المالك.
- `TEST-PR-05` (مستودع خاص حقيقي برمز المالك): كما كان منذ `MJ15`.

# بوابة الموجة H على الشجرة المجمّعة

- الموجة: `H` (`MJ18` ثم `MJ19`) · فرع التكامل: `integration/mj-H` من `main` عند `b1dfb1a` (= `mj-H/base`) · التزامات الدمج `--no-ff`: `124b87b` (MJ18) · `ddf3b0b` (MJ19) · وحل التعارض الدلالي: `8cbe8fc`.
- التاريخ: 2026-10-24.
- **المراجعة قبل الدمج** (`AD-26`): أجرتها هذه الجلسة على الفرعين قبل أول دمج، والتقرير في [`review.md`](review.md): لا خلل يمنع الدمج، وتعارض دلالي واحد حُلّ هنا (`H-2`)، وملاحظات لا تمنع. وفحوصها التشغيلية (التطفير) جزء من هذه البوابة ([`review/`](review/)).
- البوابة بحسب `Docs/MJ/waves.json`: «اختبارات `tests/core/connections` و`tests/modules/d/status` و`tests/modules/e` مجتمعة بعد الدمج، وإعادة تشغيل `TEST-CTX-01` و`TEST-CTX-02` للتأكد أن نقل الجمع والتنقيح لم يكسر منشئ الحزمة، وتدقيق شبكة يثبت أن لا طلب يصدر إلا طلب التحقق المُعلن ولا سرّ يظهر في سجل أو تصدير»؛ والجولة اليدوية: «فتح صفحة الإعدادات في Chrome: إدخال نص غير صالح لا يجعل الحالة «سليم»، وحذف سرّ يعطّل ما يعتمد عليه وحده». وزِيد عليها ما يمسّه الدمج: الطقم كاملًا (`background/main.ts` وطبقة API وبطاقة الطلب و`options/main.tsx` ومنشئ الحزمة وقوالبه مشتركة)، و`tsc`، والبناء والفحص والتحميل، وانحدار رمز `MJ15` وبطاقة `MJ11` وقوالب `MJ17` وتكامل الوحدات كلها، وعدم تراجع المضيف (`TEST-CORE-05` و`06`).
- المتصفحات تباعًا (Chrome 156.0.8078.47 · Edge 155.0.4283.60 · Brave 156.0.8078.48 · Firefox 158.0.1)، بسكربت واحد متسلسل ([`gate-run.txt`](gate-run.txt): كل خطوة خرجها 0). لا `npm ci`: `package.json` وملف القفل والمانيفست لم تتغير في أي فرع (`git diff --name-only main HEAD -- package.json package-lock.json src/manifest` فارغ).
- مخرجات إعادة الفحوص كُتبت في `evidence/wave-H/` لا فوق أدلة المراحل (`--out-dir`). وفحص المضيف `tests/core/ui-host/browser/run.mjs` لا يقبل مجلد مخرج ويكتب في `evidence/T-1.4/`: نُقل مخرجه إلى [`ui-host/`](ui-host/) واستُعيدت `evidence/T-1.4/` كما هي في `main` (`git checkout -- evidence/T-1.4`).

## لا دمج أسقط غيره

لكل فرع: `git diff --name-only main...<الفرع>` ثم `git diff <الفرع> HEAD -- <ملفاته>` (58 ملفًا لـ`MJ18` و44 لـ`MJ19`): **صفر أسطر فرق** في الاثنين بعد الدمجين. ولا ملف مشترك بين الفرعين (`comm` فارغ)، فلا تعارض نصي.

## تعارض دلالي حُلّ على فرع التكامل (`8cbe8fc`)

أول `tsc` على الشجرة المجمّعة سقط بخطأ واحد ([`review.md`](review.md)، `H-2`): `tests/modules/e/context/samples.ts:61` (قبل الإصلاح) (`MJ19`) يبني `ApiPrData` بالنوع الذي كان على `main`، و`MJ18` أضافت إليه بالتوازي `access` و`binding` وإلى `ApiPull` حقل `headRef` (`T-11.5`). كل فرع أخضر وحده، والشجرة المجمّعة وحدها حمراء. الحل في ملف الاختبار وحده (لا `src`): القيم كما يعيدها `readPrApi` لقراءة عامة ناجحة بلا رمز على فرع غير محمي. بعده `tsc` خروج 0، وكل ما يلي شُغِّل على `8cbe8fc`.

## ما شُغِّل

| الفحص | الأمر | النتيجة | الدليل |
| :--- | :--- | :--- | :--- |
| الأنواع | `npx tsc --noEmit` | خروج 0 (بعد `8cbe8fc`) | [`typecheck.txt`](typecheck.txt) |
| **بوابة الموجة: الاختبارات مجتمعة** | `npx vitest run tests/core/connections tests/modules/d/status tests/modules/e` | **15 ملفًا، 212 اجتازت** (48 من `MJ18` و164 من `MJ19`، ومنها الـ94 القديمة في `tests/modules/e` بلا تعديل ومرجع `AD-28` الحرفي 6/6) | [`vitest-gate.txt`](vitest-gate.txt) |
| الطقم كاملًا | `npx vitest run` | **147 ملفًا، 2318 اجتازت و2 متخطيان** (المشروطان المعروفان) | [`vitest-full.txt`](vitest-full.txt) |
| البناء | `npm run build` | الحزمتان، خروج 0 | [`build.txt`](build.txt) |
| فحص Firefox | `npx web-ext lint --source-dir dist/firefox` | 0 أخطاء، 0 ملاحظات، 0 تحذيرات | [`web-ext-lint.txt`](web-ext-lint.txt) |
| التحميل | `npm run load-check` | نجح في الأربعة: ENABLED، بلا أخطاء مانيفست ولا تشغيل ولا تحذيرات، والخلفية تعمل | [`load-check.txt`](load-check.txt) |
| **بوابة الموجة: `TEST-CTX-01` و`TEST-CTX-02`** | `node tests/modules/e/browser/builder-check.mjs chrome edge brave firefox` | **55/55** (14/14 في عائلة Chromium و13/13 في Firefox)؛ `PB-05` الوسيط 0.20ms في الثلاثة و0.00ms في Firefox (p95 ≤ 1.00ms) | [`modules/builder/`](modules/builder/) |
| انحدار قوالب `MJ17` (`TEST-CTX-03` و`04` و`TEST-PRIV-02`) | `node tests/modules/e/browser/templates-check.mjs chrome edge brave firefox` | **127/127** (32/32 ×3 و31/31) | [`modules/templates/`](modules/templates/) |
| **بوابة الموجة: `TEST-CONN-01` و`02` وتدقيق الشبكة** | `node tests/core/connections/browser/connections-check.mjs chrome edge brave firefox` | **124/124** (فحص ساكن ✓، 31/31 ×3 و30/30) | [`modules/connections/`](modules/connections/) |
| انحدار رمز `MJ15` (عزل الرمز و`DEC-04`) | `node tests/modules/d/token/browser/token-check.mjs chrome edge brave firefox` | **106/106** | [`modules/token/`](modules/token/) |
| انحدار بطاقة `MJ11` | `node tests/modules/d/browser/mj11-integration.mjs chrome edge brave firefox` | **72/72**، ورسائل كونسول الإضافة 0 | [`modules/mj11/`](modules/mj11/) |
| تكامل الوحدات كلها على الحزمة المشحونة | `node tests/modules/browser/integration.mjs` | **103/103**، وأخطاء الكونسول 0 في الأربعة | [`modules/integration/`](modules/integration/) |
| عدم تراجع المضيف (`TEST-CORE-05` و`06`) | `node tests/core/ui-host/browser/run.mjs` | اجتاز في الأربعة (العزل بلا اختلاف في 13×37 خاصية، والمفاتيح الثمانية، والصلاحية والشبكة) | [`ui-host/browser-report.md`](ui-host/browser-report.md) |

## تدقيق الشبكة: لا طلب إلا طلب التحقق المعلن، ولا سرّ في سجل أو تصدير

- **ساكن** (`node scripts/network-audit.mjs static --out-dir evidence/wave-H/network-audit`): 0 مخالفات و0 تحذيرات على المانيفستين والمصدر والحزمتين ([`network-audit/static-audit.txt`](network-audit/static-audit.txt)). المانيفستان كما كانا: `sidePanel` و`storage` (Chromium) و`storage` (Firefox)، ومضيف `https://github.com/*` واختياري `https://api.github.com/*`؛ ولا صلاحية جديدة.
- **مواضع الأسرار في الحزمة المبنية** ([`security-static.txt`](security-static.txt)): مفتاحا السرّين في الجلسة (`mijhar.secret.githubToken` و`mijhar.secret.providerKey`) وقاعدة القرص `mijhar-secrets` و`setAccessLevel` في `background.js` و`options.js` وحدهما؛ وسجل الصحة `mijhar.connections.health` وترويسة `Authorization` في `background.js` وحده؛ ولا شيء منها في `content.js` ولا `sidepanel.js` ولا `reader.js`، في الحزمتين. وواجهات الشبكة (`fetch` وXHR و`sendBeacon` وWebSocket وEventSource) في `e/context` و`e/prompt-templates` و`core/connections` و`d/status`: لا شيء خارج التعليقات.
- **ديناميكي** (من فحص السجل في الأربعة، [`network-audit/connections-requests.txt`](network-audit/connections-requests.txt)): 11 طلبًا إلى `api.github.com` في كل متصفح، كلها `GET` ومن الخلفية وحدها؛ طلبات السجل نفسه `GET /rate_limit` وحدها، واحد لكل تحقق أعلنه المستخدم (5: ثلاثة في مسار الحالات، وواحد في «متجاوز الحد»، وواحد بعد إعادة الربط من بوابة البطاقة)؛ والباقي قراءة البطاقة بنقر «اقرأ» (5 بالرمز و1 بلا رمز بعد مسحه). ولا مضيف خارجي للإضافة غير `github.com` و`api.github.com` (في Firefox حُجبت طلبات المتصفح نفسه إلى `*.mozilla.net` و`firefox.settings.services.mozilla.com` وحدها، ولا ذكر لها في `dist/firefox`).
- **لا سرّ في سجل ولا تصدير ولا رسالة:** في الأربعة، لا سرّ في كونسول الصفحة والإعدادات والخلفية، ولا في DOM الإعدادات بعد الحفظ، ولا في `storage.local` ولا IndexedDB عالم سكربت المحتوى ولا أحداث `storage.onChanged` ورسائل `runtime.onMessage` التي تصله، ولا في ردود حالة السجل؛ وسكربت المحتوى لا يقرأ `storage.session` (Chromium: رفض، وFirefox: غير معرّفة). والتصدير: `tests/core/connections/export.test.ts` (تصدير المخزن ونسخة البيانات بصيغتيها بعد حفظ السرّين في الجلسة والقرص والتحقق والاستعمال: بلا سرّ) ضمن الـ212 أعلاه.

## الجولة اليدوية: صفحة الإعدادات في Chrome

[`manual-round.mjs`](manual-round.mjs) يشغّل Chrome 156.0.8078.47 **بنافذة مرئية** (`headless: false`) بكتابة لوحة مفاتيح ونقرات فأرة حقيقية من Playwright، بلا شبكة خارجية (`github.com` و`api.github.com` يُخدمان محليًا بردود جدول إشارات `T-0.5`). **13/13** ([`manual-round.txt`](manual-round.txt)، [`manual-round.json`](manual-round.json)، واللقطات في [`manual-screens/`](manual-screens/)):

| الجزء | ما قيس | النتيجة | اللقطة |
| :--- | :--- | :--- | :--- |
| أ. `dist/chromium` المشحونة كما هي (`api.github.com` غير ممنوحة) | السجل في البدء: الرمز «غير مربوط»، ومفتاح المزوّد «لم يُتح بعد» | ✓ | `a1-registry-start.png` |
| | نص غير صالح (`my-password-123`) بلوحة المفاتيح ونقرة «احفظ الرمز»: رسالة «لا يطابق صيغة الرمز دقيق الحبيبات»، والشارة «غير مربوط» لا «سليم»، وصفر طلبات | ✓ | `a2-invalid-text.png` |
| | رمز بصيغة صحيحة بلا تحقق فعلي ممكن: «غير متحقق منه» بسبب الصلاحية لا «سليم»، وصفر طلبات، ولا رمز في DOM | ✓ | `a3-saved-unverified.png` |
| | المسح بتأكيد يسمّي ما يتعطل وحده («قراءة طلب الدمج وفحوص Actions في مستودع خاص») ثم «غير مربوط» | ✓ | `a4-clear-confirm.png` |
| ب. نسخة مشتقة تمنح `api.github.com` (الشيفرة كما هي) | رمز يرفضه GitHub (401): «منتهٍ» لا «سليم»؛ ثم «سليم» بعد قبول فعلي (حد 5000)؛ وطلبات السجل `GET /rate_limit` من الخلفية وحدها، اثنان لتحققين | ✓ | `b1-expired.png` · `b2-healthy.png` |
| | البطاقة تقرأ الطلب الخاص بالرمز بنقرة «اقرأ» فعلية | ✓ | `b3-card-read-with-token.png` |
| | **حذف سرّ:** حذف الرمز يجعله «غير مربوط»، ومفتاح المزوّد المحفوظ يبقى في مفتاحه المستقل؛ وفي البطاقة يُعرض خيار «اربط رمز GitHub للقراءة» في لوحة API وحدها، وبقية البطاقة (الملخص والموانع والفحوص) كاملة | ✓ | `b4-token-cleared.png` · `b5-card-gate-after-delete.png` |

وما لا تثبته هذه الجولة: رمز حقيقي على مستودع خاص يملكه المالك (لا تُدخل الجلسة أسرارًا حقيقية)، وانتهاء رمز فعلي وتجاوز حد 5000 الحقيقي (غير مقيسين في `T-0.5`)، وصفحات github.com الحية بأنماطها.

## لم يُجرَ

- التحقق الحي برمز المالك على مستودعه الخاص (`TEST-PR-05` القائم من `MJ15`، والحالات الحقيقية لـ`AC-11.1` و`AC-D8`)، وانتهاء رمز فعلي وتجاوز الحد الحقيقي.
- «نسخ البرومبت» (`AC-11.1` ‏(٤)، و`AC-E6` لـ`T-11.3` و`T-11.6`): لم تُبنَ بعد (`MJ20` و`MJ21`)؛ وحارسها الساكن في `static.test.ts` مكتوب ويسري حين يُضاف مجلداهما.
- «غير متحقق منه» في Firefox الحقيقي بلا منح الصلاحية: الفحص يمنحها آليًا في النسخة المشتقة، والحالة مختبرة في التكامل وفي الجولة اليدوية في Chrome على الحزمة المشحونة.
- صفحتا `pr-files` و`commit` في طبقة السياق: لا عينة محفوظة (`H-7`).

# حزم مِجهَر بعد عنوان المتجر الوصفي (`AD-39`)

> **حلّت محلها** حزم `AD-40` للحاسوب وحده في [`../desktop-only/report.md`](../desktop-only/report.md) (حزمة Chromium نفسها؛ وحزمتا Firefox والمصدر جديدتان). وما يلي سجل بنائها كما كان.
>
> 2026-10-25، بُنيت في النسخة الرئيسية عند `3dcafeb` (دمج `claude/mijhar-pages-repo-79d5c0`، والتزامه `3332e87`). لم يُرفع شيء ولم يُقدَّم شيء إلى متجر.

## ما تغيّر في المانيفست

| الحقل | قبل | بعد |
| :--- | :--- | :--- |
| `name` | مِجهَر | مِجهَر - مساعدك على GitHub |
| `short_name` | — | مِجهَر |
| `description` | يصحّح اتجاه العربية في GitHub، ويشرح الواجهة في مكانها، ويلخّص حالة طلب الدمج وسبب فشل الفحص. يعمل بلا حساب ولا مفتاح. | يصحّح اتجاه العربية، ويشرح الأزرار والمصطلحات في مكانها، ويلخّص ما يمنع دمج الطلب وسبب فشل الفحص. يعمل بلا حساب ولا مفتاح. |
| `action.default_title`، و`sidebar_action.default_title` في Firefox | مِجهَر | مِجهَر (بلا تغيير) |
| `version`، ومعرّف Firefox `mijhar@bysltan.com`، والصلاحيات | — | بلا تغيير |

المصدر الواحد `src/manifest/chromium.json` و`src/manifest/firefox.json`، ويكتبهما `src/manifest/generate.mjs` في `dist/*/manifest.json`. والقيم داخل الأرشيفين في [`manifests.txt`](manifests.txt).

## الحزم ومصدرها وتجزئاتها

بناها `npm run build` ثم `node scripts/package.mjs` في `release/packages/` بالنسخة الرئيسية (`node_modules` تثبيت حقيقي لا رابط رمزي)، والسجل في [`package.txt`](package.txt):

| الحزمة | الحجم (بايت) | SHA-256 |
| :--- | :--- | :--- |
| `release/packages/chromium/mijhar-1.0.0-chromium.zip` (Chrome وEdge وBrave) | 1,798,367 | `c611a68763dd05793e63c4321b6a1dafd66a390c38776370b1eeea9b9313e710` |
| `release/packages/firefox/mijhar-1.0.0-firefox.zip` | 1,798,479 | `56e3f45a2f699e91b55e3bf53d86a7a1867a7dfba7e50bdd75a932ba136c8b0d` |
| `release/packages/firefox/mijhar-1.0.0-source.zip` (لمراجعي AMO) | 1,837,426 | `980c8bb1477c2fe0647ccf15388ff4829548eedd4dd6969441d5f8266f7392bb` |

**تحلّ محل** حزم `AD-38` المبنية عند `8b91ff0` (`56c68dd1…` و`73f8b413…` و`36873b08…`، و`SHA256SUMS` القديم في [`SHA256SUMS.before`](SHA256SUMS.before))؛ ولا تُقدَّم أيٌّ من الحزم السابقة بوصفها الحالية. والنسخة 1.0.0 كما هي لأن الإضافة لم تُرفع إلى أي متجر. ودمج هذا الدليل وسجل الموجات بعد `3dcafeb` لا يمس مدخلات البناء ولا حزمة المصدر.

## ما فُحص

- `node scripts/package.mjs --check`: القائمة المسموحة، ولا أنماط أسرار ولا مسارات جهاز، وحزمتا التثبيت = `dist/`. و`shasum -a 256 -c SHA256SUMS` و`unzip -t` سليمة.
- `npm run lint:firefox`: 0 أخطاء و0 تنبيهات و0 تحذيرات.
- **إعادة البناء من حزمة المصدر وحدها** (`npm ci` ثم `npm run build` في مجلد مؤقت): `dist/chromium` و`dist/firefox` مطابقان بايتًا ببايت لما في النسخة الرئيسية ([`source-rebuild.txt`](source-rebuild.txt)).
- **التحميل** في Chrome 156 وEdge 155 وBrave 156 وFirefox 158.0.1 بملفات تعريف مؤقتة: نجح في الأربعة بلا أخطاء مانيفست ولا تشغيل ([`load-check.md`](load-check.md)).
- على الفرع قبل الدمج: `npm run typecheck`، و`tests/build` (18)، والاختبارات التي تقرأ المانيفست والوثائق (46)، و`node scripts/privacy.mjs --check`، وروابط الوثائق المعدّلة، وgitleaks على الالتزام بلا تسريب. وفي النسخة الرئيسية بعد الدمج: `node tools/build.mjs` و`node tools/check.mjs` أخضر.

## ما يلزم لاحقًا

- أول رفع لهذه الحزم إلى المتاجر يأخذ العنوان الجديد؛ ولا يتغير عنوان منشور بتعديل الملفات محليًا. والتفصيل والمراجع الرسمية في [`release/listings/submission.md`](../../release/listings/submission.md#الاسم-في-المتاجر-من-أين-يأتي-وكيف-يتغير).
- بعد القبول: التحقق أن صفحة كل متجر تعرض «مِجهَر - مساعدك على GitHub»، ومراجعة حقل الاسم في AMO.

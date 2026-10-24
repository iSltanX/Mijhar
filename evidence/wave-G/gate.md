# بوابة الموجة G على الشجرة المجمّعة

- الموجة: `G` (`MJ16` ثم `MJ17`) · فرع التكامل: `integration/mj-G` من `main` عند `4518ca5` (يحوي `mj-G/base` = `98126ff`) · التزامات الدمج `--no-ff`: `d18e8e0` (MJ16) · `b1256b3` (MJ17).
- التاريخ: 2026-10-24.
- **المراجعة قبل الدمج** (`AD-26`): أجرتها هذه الجلسة على الفرعين قبل أول دمج، والتقرير في [`review.md`](review.md): لا خلل يمنع الدمج، وست ملاحظات لا تمنع (`G-1` إلى `G-6`). وفحوصها التشغيلية جزء من هذه البوابة ([`review/`](review/)).
- البوابة بحسب `Docs/MJ/waves.json`: «اختبارات modules/c وmodules/e مجتمعة، وتدقيق شبكة كامل لمسار الترجمة بعد الدمج»؛ والجولة اليدوية: «لا شيء». وزِيد عليها ما يمسّه الدمج: الطقم كاملًا (`c/ui` و`content/main.tsx` و`options/sections.ts` و`builder` مشتركة أو مسّت وحدات سابقة)، والبناء والفحص والتحميل، وفحوص كل مرحلة على الحزمة المشحونة، وانحدار `T-4.3` ومنشئ الحزمة، وتكامل الوحدات كلها، وعدم تراجع المضيف (`TEST-CORE-05` و`06`).
- المتصفحات تباعًا (Chrome 156.0.8078.47 · Edge 155.0.4283.60 · Brave 156.0.8078.48 · Firefox 158.0.1)، بسكربت واحد متسلسل ([`gate-run.log`](gate-run.log): كل خطوة خرجها 0). لا `npm ci`: `package.json` وملف القفل والمانيفست لم تتغير في أي فرع (`git diff --stat main HEAD -- package.json package-lock.json src/manifest` فارغ).
- مخرجات إعادة الفحوص كُتبت في `evidence/wave-G/` لا فوق أدلة المراحل (`--out-dir` و`--out-root` و`--out`)؛ وحُذفت لقطات PNG من مجلدات إعادة فحوص المراحل التي لم تُنتجها، وبقيت لقطات التكامل (`modules/integration`) والمضيف (`ui-host/screens`).

## لا دمج أسقط غيره

لكل فرع: `git diff --name-only main...<الفرع>` ثم `git diff <الفرع> HEAD -- <ملفاته>` (52 ملفًا لـ`MJ16` و29 لـ`MJ17`): **صفر أسطر فرق** في الاثنين. ولا ملف مشترك بين الفرعين (`comm` فارغ).

## التعارضات وحلها

لا تعارض. الفرعان بملكيتين منفصلتين (`c/model-manager` و`c/network-audit` و`c/ui` و`options/sections.ts` و`content/main.tsx` لـ`MJ16`؛ `e/builder` و`e/templates` و`e/privacy-check` لـ`MJ17`)، ودُمجا آليًا؛ ولم يُضمّ سطر مشترك (`registry.ts` لم يُمسّ).

## الفحوص

| الفحص | الأمر | النتيجة | الملف |
| :--- | :--- | :--- | :--- |
| الأنواع | `npx tsc --noEmit` | بلا أخطاء | [`typecheck.txt`](typecheck.txt) |
| **الوحدات المدمجة مجتمعة (بوابة الموجة)** | `npx vitest run tests/modules/c tests/modules/e` | 26 ملفًا · **410 اجتازت** | [`modules/vitest-c-e.txt`](modules/vitest-c-e.txt) |
| الطقم كاملًا | `npx vitest run` | 131 ملفًا · **2161 اجتازت** · 2 متخطيان (المشروطان المعروفان: `GHSIM_SOURCE` والتواريخ التسعة `MIJHAR_HISTORIES`) | [`vitest-full.txt`](vitest-full.txt) |
| بناء الحزمتين | `npm run build` | `dist/chromium` و`dist/firefox`؛ `content.js` ‏1,385,008 بايتًا و`background.js` ‏334,102 (يُقاسان في `T-10.1`؛ كانا 1,347,494 و327,465 بعد F) | [`build.txt`](build.txt) |
| فحص مانيفست Firefox | `npm run lint:firefox` | 0 أخطاء · 0 ملاحظات · 0 تحذيرات | [`web-ext-lint.txt`](web-ext-lint.txt) |
| تحميل الحزم | `node scripts/load-check.mjs` | الأربعة: `ENABLED` بلا أخطاء مانيفست ولا تشغيل ولا تحذيرات، والخلفية بدأت | [`load-check.txt`](load-check.txt) |
| **تدقيق شبكة كامل لمسار الترجمة** (`TEST-PRIV-01`، `AC-C6`) | `node scripts/network-audit.mjs all chrome edge brave --out-dir evidence/wave-G/network-audit` | الساكن: **0 مخالفات و0 تحذيرات** (4 مانيفستات، المصدر، الحزمتان). الديناميكي بسجل CDP لكل الأهداف: Chrome وBrave (ترجمة كاملة بعد الموافقة وتنزيل حقيقي) وEdge (مسار الغياب): **0 طلب شبكة، 0 مخالفة، 0 تسرب**، والضابط الإيجابي يُكشف في الثلاثة؛ Firefox ديناميكيًا **لم يُجرَ** (Marionette لا يرصد الشبكة) | [`network-audit/`](network-audit/audit-run.txt) |
| فحص ساكن إضافي للشيفرة المبنية | `grep` على المصدر و`dist` (`security-static.txt`) | أداة التدقيق لا يستوردها شيء من `src` خارج مجلدها؛ وصفر ملفات في `dist/*` فيها `attachNetworkRecorder` أو `CLOUD_TRANSLATION_HOSTS` أو مضيف ترجمة سحابي؛ وصفر واجهات شبكة في `engines|masking|model-manager|ui` وفي `src/modules/e`؛ وفرق المانيفست والاعتماديات عن `main` فارغ؛ وصلاحيات `dist`: `sidePanel` و`storage` وحدها | [`security-static.txt`](security-static.txt) |
| إدارة النموذج على الحزمة المشحونة (`MJ16`، `TEST-TR-05`) | `node tests/modules/c/model-manager/browser/run.mjs chrome edge brave` | Chrome ‏16/16 وEdge ‏1/1 وBrave ‏16/16 = **33/33**: لا تنزيل عند التركيب ولا بعد 3 ث ولا أثناء البطاقة ولا بعد «ليس الآن»؛ «موافق» تنزّل وتترجم 17/17؛ وشبكة مقطوعة فعلًا ← رسالة التأخر عند 60 ث والأصل باقٍ | [`modules/model-manager.txt`](modules/model-manager.txt) |
| انحدار طبقة المحركات (`T-4.3`، `TEST-TR-04`) | `node tests/modules/c/engines/browser/run.mjs chrome edge brave firefox` | Chrome ‏12/12 (المجموعة المرجعية 28/28 من أول محاولة) وEdge ‏7/7 وBrave ‏12/12 وFirefox ‏7/7 = **38/38** | [`modules/engines.txt`](modules/engines.txt) |
| القوالب والتنبيه والفاحص (`MJ17`، `TEST-CTX-03` و`04` و`TEST-PRIV-02`) | `node tests/modules/e/browser/templates-check.mjs chrome edge brave firefox --out-root evidence/wave-G/modules/templates` | Chrome ‏32/32 وEdge ‏32/32 وBrave ‏32/32 وFirefox ‏31/31 = **127/127**: صفر طلبات شبكة، ومحتوى ملف `blob:` = المعاينة المعدَّلة بعينها، والمرصود الوحيد في السطر 457 | [`modules/templates.txt`](modules/templates.txt) |
| انحدار منشئ الحزمة (`MJ15`، `TEST-CTX-01` و`02`، `PB-05`) | `node tests/modules/e/browser/builder-check.mjs chrome edge brave firefox` | 14/14 ×3 و13/13 = **55/55** | [`modules/builder.txt`](modules/builder.txt) |
| تكامل الحزمة المشحونة بكل وحداتها | `node tests/modules/browser/integration.mjs chrome edge brave firefox` | 26/26 ×3 و25/25 = **103/103**، وأخطاء الكونسول 0 | [`modules/integration.txt`](modules/integration.txt) |
| **عدم تراجع المضيف** (`TEST-CORE-05` و`06`) | `node tests/core/ui-host/browser/run.mjs chrome edge brave firefox --out evidence/wave-G/ui-host` | الأربعة **اجتاز** في كل الأعمدة؛ 0 اختلاف داخل الواجهة بين الصفحة الضابطة والمعادية (13×37)؛ المفاتيح الثمانية؛ **0 طلب إلى `api.github.com` قبل المنح** في الأربعة | [`ui-host/browser-report.md`](ui-host/browser-report.md) |

## فحوص المراجعة التشغيلية ([`review/`](review/))

| الفحص | النتيجة |
| :--- | :--- |
| اختبار تطفير بوابة الموافقة (`mutation-consent-gate.txt`) | تعطيل شرط `consent` يُسقط 14 من 51 اختبارًا في `tests/modules/c/model-manager`؛ واستُعيد الملف مطابقًا للالتزام |
| أداء فاحص الأسرار على مدخلات معادية (`scan-check.mjs`) | 19/19: 12 مدخلًا من 1 إلى 5 ميغابايت بين 5 و13 ملّي ثانية؛ والسجل المرجعي: مرصود واحد في السطر 457 |
| تزوير «موافق» (`consent-forge-check.mjs`) | Chrome 156 وBrave 156: بلا نشاط مستخدم عابر يرفض المتصفح `create()` ولا تنزيل (الحزمة `downloadable`)؛ محاولة أولى أُهملت لأن `page.evaluate` يمنح نشاطًا (`review/discarded/`) |
| اجتماع `MJ16` مع «ترجمة مسودتي» (`consent-draft-check.test.tsx.txt`) | يعرض «المحرك غير متاح» والحزمة `downloadable` بلا موافقة (`G-1`)؛ ولا `create()` في الحالات الثلاث |

## لم يُجرَ

- تدقيق الشبكة الديناميكي في Firefox (لا رصد شبكة في Marionette)، وامتلاء القرص الحقيقي، ومهلة التأخر على اتصال بطيء حقيقي، ووصول ملف `.md` إلى مجلد التنزيلات على github.com الحقيقية، وصفحات github.com الحية، والجولة اليدوية (`manual` الموجة: «لا شيء»).
- قراءة الحافظة الحقيقية في Firefox لبديل النسخ (محجوبة من الصفحة).

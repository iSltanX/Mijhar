# بوابة الدمج — إصلاحات التدقيق وتجهيز الإصدار

على شجرة `cd84948` في worktree نظيف (`git status --porcelain` فارغ)، وهي ما صار على `main` بعد الدمجين (`git diff cd84948 f6539eb` فارغ). Node 24.18.1، و`npm ci` من القفل.

| الفحص | الأمر | النتيجة |
| :--- | :--- | :--- |
| الأنواع | `npm run typecheck` | بلا أخطاء |
| الطقم كاملًا مرة واحدة | `node node_modules/vitest/vitest.mjs run` | 193 ملفًا: 2793 نجح و2 متخطيان قائمان، بلا فشل |
| البناء | `npm run build` | `dist/chromium` و`dist/firefox` |
| تدقيق الشبكة الساكن | `node scripts/network-audit.mjs static` | لا مخالفة ولا تحذير ([`network/static-audit.txt`](network/static-audit.txt)) |
| عزل المحوّلات والأسرار في الحزم | `node scripts/network-audit.mjs providers` | لا مخالفة: ترويسات المحوّلات ومساراتها في `background.js` وحده، ومخزن الأسرار في الخلفية والإعدادات وحدهما ([`network/provider-isolation.txt`](network/provider-isolation.txt)) |
| حزمة Firefox | `npm run lint:firefox` (`web-ext lint`) | 0 أخطاء، 0 تحذيرات، 0 ملاحظات |
| بيانات الخطة والمراحل | `node tools/check.mjs --data` (في الفرع)، ثم `node tools/build.mjs` و`node tools/check.mjs` (في `main`) | اجتاز |

- **الاختبارات الجديدة للفرعين** ضمن الطقم: 15 ملفًا في `tests/audit-remediation/` من الإصلاحات، وحالات `key-changed` الثلاث وبيان ما يُشتق من السرّ من التجهيز. وأدلة «قبل» في تقرير المعالجة وفي سجل التجهيز (الحالات الثلاث تفشل على `39fa4a2`).

## لم يُجرَ، والسبب

- **التحميل في المتصفحات الحقيقية** (`scripts/load-check.mjs`) و**تدقيق الشبكة الديناميكي** (`network-audit.mjs dynamic`): من بوابة `MJ26` (`waves.json`، الموجة M). والمانيفست والصلاحيات لم تتغير في الفرعين.
- **فحوص المتصفح الحقيقي المعلّقة من التدقيق:** نافذة الصلاحية عند «تحقق من المفتاح» (`BLK-AUD-02`)، وإيقاظ عامل الخدمة (`F-06`)، وأكثر من نافذة إعدادات (`F-05` و`F-07` و`COR-AUD-02`). مكتوبة في `Docs/MJ/stages/MJ26.md`، ولا تُعدّ الاختبارات المحاكاة دليلًا من المتصفح.
- **اللقطات الحقيقية وتصدير الأيقونات والصور والحزم وقناة البلاغات:** من `MJ26`، ولم يُسجَّل شيء منها مكتملًا.

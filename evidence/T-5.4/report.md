# تقرير الدليل — T-5.4 (المقارنة بين فرعين أو التزامين أو إصدارين)

- المرحلة: `MJ8` · الفرع: `mj/8-glossary-card-pr-status` · الأساس: `mj-D/base`
- التاريخ: 2026-10-23 · البيئة: Node v24.18.1 · Vitest 5.0.5 · Chrome 156.0.8078.47 وEdge 155.0.4283.60 وBrave 156.0.8078.48 وFirefox 158.0.1
- الموضع: `src/modules/d/compare/` (الوحدة `d.compare`) و`tests/modules/d/compare.test.tsx` والعينات `tests/modules/d/fixtures/fixture-compare-*.html`.

## النتيجة بإيجاز

| الفحص | الأمر | النتيجة | الملف |
| :--- | :--- | :--- | :--- |
| `TEST-DIFF-01` | `npx vitest run tests/modules/d/compare.test.tsx` | 22 من 22 | [`vitest.txt`](vitest.txt) |
| e2e على الشيفرة المحقونة (تخطيط حقيقي وأنماط محسوبة) | `node tests/modules/d/browser/run.mjs …` | 36/36 في كل من الأربعة (144/144) | [`browser-run.txt`](browser-run.txt) · [`browser-results.json`](browser-results.json) |
| تكامل الحزمة المشحونة (صفحة مقارنة، مفتاح الوحدة) | `node tests/modules/browser/integration.mjs …` | 103/103 | [`../T-3.2/integration.json`](../T-3.2/integration.json) |

اللقطات: [`screens/`](screens) و[`../T-3.2/integration-screens/`](../T-3.2/integration-screens) (`*-compare-branches.png`).

## العينات

مسارات الملفات وأعداد أسطرها لـ**27 ملفًا حقيقية** من صفحة التزام عام محفوظة (`fixtures/spikes/gh-commit-bms-1.html`، بتخطيط عرض الفروقات الفعلي: منطقة `role="region"` لكل ملف وعنوان `h3` بالمسار و«Lines changed: N additions & M deletions»). ثلاث صفحات:

| العينة | الملفات | الطرفان | ما أُضيف بخلاف الحقيقي |
| :--- | :--- | :--- | :--- |
| `fixture-compare-branches.html` | 30 (+4,301 −733) | `main...feature/ui-refresh` | `package.json` و`.github/workflows/ci.yml` و`README.md` بأسماء توضيحية ليظهر كل نوع |
| `fixture-compare-commits.html` | 27 (+4,268 −726) | `98ea6bc...86a863a` | لا شيء |
| `fixture-compare-tags.html` | 12 (+1,891 −387) | `v1.4.0...v1.5.0` (أيقونتا وسم) | لا شيء |

وفي e2e رُكِّبت الوحدة على **صفحة الالتزام الحقيقية نفسها** بعنوان مقارنة (`real-commit-as-compare`) فطابق الاستخراج أرقامها الحقيقية (27 ملفًا و4,268 و726) في الأربعة.

## معيار القبول `AC-D6`

| الجزء | الحالة | الدليل |
| :--- | :--- | :--- |
| إحصاء الملفات يطابق الأرقام المعروضة في الصفحة: العدد والمضاف والمحذوف | تحقق في الحالات الثلاث وفي الصفحة الحقيقية: الملفات المقروءة وأسطرها تطابق «N files changed» و«Lines changed» في الصفحة نفسها، وجدول الأنواع يجمع إلى أرقامها | `compare.test.tsx` · `browser-results.json` (`agreement: match`) |
| تصنيف النوع (كود، اختبارات، اعتماديات، سير عمل، توثيق) | تحقق: بقاعدة ثابتة من المسار (+ «أخرى» لتجتمع الأعداد)، وأسبقيتها سير العمل ثم الاعتماديات ثم الاختبارات ثم التوثيق ثم الكود؛ وأعداد كل نوع في كل عينة | `compare.test.tsx` |
| الصفحة لم تُحمَّل كل ملفاتها | تحقق: لا تُقدَّم أرقام جزئية على أنها كاملة؛ الأرقام المعتمدة ما تعرضه الصفحة، وتُعلَن «الملفات المقروءة أقل من المعلن»، وتتجدد حين تُحمَّل الملفات | `compare.test.tsx` |
| قسم تفسير الأثر منفصل **بصريًا** | تحقق: حدّ متقطع وخلفية مختلفة محسوبان في المتصفحات الأربعة (`getComputedStyle`) | `browser-results.json` (`border`, `background`) |
| منفصل **هيكليًا** | تحقق: مضيفان شقيقان في الصفحة بجذري ظل مختلفين لا يحتوي أحدهما الآخر؛ لا ملاحظات أثر في قسم الحقائق ولا جدول أنواع في قسم الأثر | `compare.test.tsx` · `browser-results.json` |
| موسوم «يحتاج مراجعة بشرية» | تحقق: وسم على القسم، وكل ملاحظة تذكر الرقم الذي بُنيت عليه، وتصريح بأنها آلية من أسماء الملفات | `compare.test.tsx` |

## حدود معلنة

1. **لم تُحفظ صفحة مقارنة حية** (`/compare/a...b`): حفظها طلب شبكة إلى github.com لتنزيل ملفات، فلم يُجرَ بلا إذن المالك. تخطيط الفروقات مُثبت على صفحة التزام حقيقية (مشتركة التخطيط مع صفحة PR الملفات)، أما ترويسة المقارنة (منتقيا الفرعين وأيقونة الوسم) فمكتوبة. **اقتراح**: حفظ ثلاث صفحات مقارنة عامة (فرعان والتزامان ووسمان) بـ`scripts/spikes/t01-capture.mjs` وإعادة `TEST-DIFF-01` عليها.
2. **نوع المقارنة** مُستدَلّ عليه: التزامان إن كان الطرفان `sha`، ووسمان إن بدوا إصدارين أو ظهرت أيقونتا `octicon-tag` في الترويسة، وإلا فرعان؛ وفرع اسمه `v2` يُصنَّف وسمًا (يُعلَن «بين إصدارين» ولا يغيّر الأرقام).
3. **تخطيط Rails القديم** (`.file-header[data-path]` و«Showing N changed files with…») مغطى بمحددات بديلة ومُختبَر على جزء منه فقط؛ لم يُرصد حيًّا.
4. **`pyproject.toml`** يُصنَّف اعتماديات (يضم اعتماديات وإعدادات)، و`fixtures/` اختبارات، و`.txt` توثيقًا ما لم يكن `requirements*.txt`؛ قواعد ثابتة تُراجَع عند الحاجة.

## كيف يُعاد

```bash
npm run build
npx vitest run tests/modules/d/compare.test.tsx
node tests/modules/d/browser/run.mjs chrome edge brave firefox --out-dir evidence
```

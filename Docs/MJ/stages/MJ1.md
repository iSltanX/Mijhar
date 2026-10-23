---
id: MJ1
title: هيكل الإضافة ونظام البناء
status: active
delivery: branch
wave: A
order: 1
depends: []
tasks: [T-1.1]
model: Sonnet 5.5
model_id: claude-sonnet-5-5
why_model: افتراضي الخطة: مهام محددة المواصفات بمعايير قبول واضحة.
session: worktree
branch: mj/1-core-scaffold
base: mj-A/base
commit: 104ca8c
updated: 2026-10-23
resume: سُلّمت للدمج في الموجة A (التسليم `branch`) بعد استكمال شق Firefox وحسم الاسم وإعلان جمع البيانات. لا عمل آخر في هذه الجلسة.
---

# MJ1 — هيكل الإضافة ونظام البناء

> «ماذا ولماذا» في الخطة: [`T-1.1`](../../phases/phase-01-core.md#T-1.1)، والقسم 6 من [`EXECUTION_PLAN.md`](../../EXECUTION_PLAN.md). و«متى وكيف» في [`Docs/MJ/README.md`](../README.md).

## الهدف

إنشاء نواة المشروع بـTypeScript وVite وأمر بناء ينتج حزمتين: عائلة Chromium وFirefox، بمانيفست لكل منهما، والاسم المعتمد في `DEC-06` («مِجهَر»)، وصلاحية مضيف `https://github.com/*` وحدها. لا إطار واجهة ولا منطق وحدات.

## لماذا الآن

كل شيفرة لاحقة تُبنى فوق هذا الهيكل، ولا يمكن لأي مرحلة أخرى برمجية أن تجاوره قبل دمجه. وهي أصغر تجربة كاملة لطريقة العمل.

## النطاق

**الملفات التي تملكها المرحلة**

- `package.json` و`pnpm-lock.yaml` أو `package-lock.json` و`tsconfig.json` و`vite.config.ts`
- `src/manifest/chromium.json` و`src/manifest/firefox.json` ومولّدهما
- `src/background/` و`src/content/` نقاط دخول فارغة الوظيفة
- `scripts/build.mjs` و`scripts/load-check.mjs` (تحميل الحزمة في Chrome وEdge وBrave عبر Playwright، وفي Firefox عبر Marionette)
- `tests/setup/` وإعداد vitest
- `.gitignore` (إضافات node_modules وdist)

**الملفات المشتركة مع مراحل الموجة** (تُضم بترتيب الدمج لا باختيار نسخة)

- لا شيء؛ المرحلة وحدها في موجتها.

**خارج النطاق**

- إطار الواجهة (`DEC-01`) ومضيف الواجهات: `MJ5`.
- أي وحدة من الوحدات الثماني.
- الاسم في المانيفست هو الاسم المعتمد في `DEC-06` («مِجهَر»؛ المعرّف `mijhar`)؛ ويبقى في `T-10.2` التحقق من استعماله في الحزم والنصوص وتعميم معرّف Firefox النهائي.

## المهام

1. `T-1.1` — إعداد هيكل إضافة Manifest V3 متعدد المتصفحات ونظام البناء (مستقل عن إطار الواجهة) ([التفاصيل ومعايير القبول](../../phases/phase-01-core.md#T-1.1)).

## الاعتماديات

- **مراحل يلزم دمجها قبل البدء:** لا شيء.
- **تعمل بالتوازي مع:** لا شيء (منفردة في موجتها).
- **قرارات تمسّها:** لا شيء.

## معايير القبول

- `AC-1.1`: تُبنى حزمتا عائلة Chromium وFirefox وتُحمَّلان في Chrome وFirefox دون أخطاء مانيفست؛ وتنحصر صلاحيات المضيف الأساسية في `https://github.com/*`؛ ولا يوجد `<all_urls>`؛ والاسم في المانيفست هو الاسم المعتمد في `DEC-06` («مِجهَر» / `Mijhar`).

## الفحوص

- اختبارات الخطة لمهام المرحلة: `TEST-BUILD-01`.
- `npm run build` ينتج `dist/chromium/` و`dist/firefox/` بلا أخطاء، ومانيفست كل منهما يحمل مفاتيحه (`service_worker` لعائلة Chromium و`background.scripts` و`sidebar_action` لFirefox).
- `npx web-ext lint --source-dir dist/firefox` بلا أخطاء.
- `node scripts/load-check.mjs` يحمّل `dist/chromium/` في Chrome وEdge وBrave و`dist/firefox/` في Firefox ويطبع غياب أخطاء المانيفست؛ النتيجة في `evidence/T-1.1/report.md`.
- المتصفحات المتاحة Chrome وEdge وBrave وFirefox 158.0.1 (ثبّته المالك في 2026-10-23 بعد التسليم الأول؛ `EV-09`).
- الفحوص بحسب الأثر: ما تمسّه المرحلة فقط، ولا يُعاد طقم كامل بعد كل تعديل؛ والفحوص التي تشترك في متصفح أو منفذ تُجرى متسلسلة.

## المخاطر

- اختيار إضافة Vite للمانيفست المتعدد: الأبسط هو مدخلات Vite متعددة ونسخ المانيفست سكربتًا، دون إضافة خارجية ثقيلة.
- كان شق Firefox من `AC-1.1` مفتوحًا لأن Firefox غير مثبت (`EV-06`)؛ أُغلق بعد تثبيته (`EV-09`) باختبار تحميل فعلي.

## المراجع

- ملفات المرحلة في الخطة: [البنية والنواة](../../phases/phase-01-core.md).
- [`TRACEABILITY.md`](../../TRACEABILITY.md) و[`DECISIONS.md`](../../DECISIONS.md).
- إن فشل `node` برسالة `_load_nvm` فابدأ الجلسة بـ`unfunction node npm npx corepack 2>/dev/null; hash -r`.

## حالة المهام

| المهمة | الحالة | ما أُنجز | الدليل |
| :--- | :--- | :--- | :--- |
| `T-1.1` | منفّذة | هيكل TypeScript وVite وvitest؛ `npm run build` يبني `dist/chromium/` و`dist/firefox/` بمانيفست لكل هدف ومولّد يفرض `https://github.com/*` وحدها؛ `web-ext lint` بلا أخطاء ولا تحذيرات؛ وتحميل فعلي بلا أخطاء مانيفست في Chrome 156 وEdge 155 وBrave 156 وFirefox 158.0.1؛ والاسم «مِجهَر» (`DEC-06`)؛ و14 اختبارًا (`TEST-BUILD-01`) | [`evidence/T-1.1/report.md`](../../../evidence/T-1.1/report.md) |

الحالات: لم تبدأ · جارٍ التنفيذ · متوقفة: السبب · منفّذة (على الفرع) · مدمجة (يكتبها منسّق الدمج وحده). الدليل مسار تقرير في `evidence/` أو رابط.

## سجل التنفيذ

| التاريخ | ما أُنجز | الدليل |
| :--- | :--- | :--- |
| 2026-10-23 | كُتبت المواصفة | — |
| 2026-10-23 | تحقق من worktree والفرع والأساس والاعتماديات؛ أُنشئ `mj/1-core-scaffold` من `main`؛ الحالة `active` | `b1db5f2` |
| 2026-10-23 | `T-1.1` جارٍ التنفيذ ← منفّذة: هيكل المشروع ومانيفستا الهدفين ومولّدهما وسكربتا `build` و`load-check` واختبارات `TEST-BUILD-01` | `394c576` |
| 2026-10-23 | أدلة `T-1.1`: بناء وlint وtypecheck واختبارات وتحميل في Chrome وEdge وBrave، مع تحكمات سلبية | `dc3a20d` · [`evidence/T-1.1/report.md`](../../../evidence/T-1.1/report.md) |
| 2026-10-23 | بعد تثبيت Firefox 158.0.1: فحص تحميل فعلي فيه (Marionette)؛ الاسم «مِجهَر» وفق `DEC-06` بدل `placeholder`؛ إعلان `data_collection_permissions: none` مع `strict_min_version 140` ← `web-ext lint` بلا تحذيرات | `104ca8c` |

**المتبقي:** الدمج في الموجة A.

### تقرير التسليم — MJ1

- الفرع: `mj/1-core-scaffold` · الأساس: `mj-A/base` (`e02c53f`) · آخر التزام عمل: `104ca8c`
- الفرق: `28 files changed, 6601 insertions(+), 121 deletions(-)` من `git diff --stat mj-A/base...HEAD` عند `104ca8c`؛ منها 8 ملفات ليست من المرحلة بل من ثلاثة التزامات على `main` بعد الوسم (`Docs/MJ/README.md` و`STATUS.md` و`dashboard/` و`tools/build.mjs`) إضافة إلى ملف المرحلة نفسه. وفرق المرحلة وحدها عن `main`: `21 files changed, 6355 insertions(+), 7 deletions(-)` (نحو 5586 سطرًا منها `package-lock.json`).
- المهام: `T-1.1` منفّذة. هيكل TypeScript وVite وvitest؛ مدخلا `background` و`content` فارغا الوظيفة؛ `src/manifest/chromium.json` و`firefox.json` ومولّد `generate.mjs` (يضيف النسخة من `package.json` ويفرض الحدّ الأدنى من الصلاحيات ومفاتيح كل هدف)؛ `scripts/build.mjs` و`scripts/load-check.mjs`. الدليل: `evidence/T-1.1/report.md`.
- معايير القبول:
  - `AC-1.1` بناء الحزمتين: `npm run build` ← `dist/chromium/` و`dist/firefox/` بلا أخطاء (خروج 0) — تحقق.
  - `AC-1.1` التحميل في Chrome بلا أخطاء مانيفست: `node scripts/load-check.mjs` ← Chrome 156.0.8078.47 `ENABLED` بلا أخطاء مانيفست ولا تشغيل ولا تحذيرات وبدأ الـservice worker؛ وكذلك Edge 155.0.4283.60 وBrave 156.0.8078.48 — تحقق.
  - `AC-1.1` التحميل في Firefox: Firefox 158.0.1 ← تثبيت مؤقت عبر Marionette: مفعَّلة ومتوافقة، بلا أخطاء مانيفست ولا تحذيرات ولا أخطاء تشغيل، والخلفية `running`، والمضيف المسموح `https://github.com/*` وحده؛ و`npx web-ext lint --source-dir dist/firefox` ← 0 أخطاء و0 ملاحظات و0 تحذيرات — تحقق.
  - `AC-1.1` المضيف: `host_permissions` = `["https://github.com/*"]` في الحزمتين، و`grep -c '<all_urls>\|\*://\*/\*'` ← 0 فيهما — تحقق.
  - `AC-1.1` الاسم: `"name": "مِجهَر"` في الحزمتين (`DEC-06`) — تحقق.
- الفحوص بحسب الأثر: شُغّل `npm run build` و`web-ext lint` و`npx tsc --noEmit` (بلا أخطاء) و`npx vitest run` (14 من 14) و`load-check` على المتصفحات الأربعة تباعًا. تحكمات سلبية: في Chrome (حزمة بلا `background.js` وحزمة تشير إلى سكربت محتوى غائب) وفي Firefox (حزمة Chromium داخله، و`strict_min_version: 999.0`، وصلاحية غير موجودة ← تحذير ظاهر، وخلفية غائبة ← خطأ تشغيل) كلها سُجّلت كما يجب؛ وإدخال `<all_urls>` في مصدر المانيفست أسقط الاختبارات ثم استُعيد. لم يُشغَّل شيء خارج أثر المرحلة (لا وحدات ولا واجهة ولا شبكة).
- القرار المفوَّض: ثلاثة قرارات بتفويض المالك في 2026-10-23:
  - **الاسم:** تعارض نص `T-1.1` في `EXECUTION_PLAN.md` (الاسم المعتمد في `DEC-06`) مع `data/plan.json` ومواصفة المرحلة (`placeholder`) حُسم وفق `DEC-06`؛ المانيفستان بالاسم «مِجهَر» ومعرّف Firefox `mijhar@mijhar.invalid`. تعديل `data/plan.json` ومواءمة هذا الملف على المنسّق.
  - **`data_collection_permissions`:** `required: ["none"]` لأن السلوك الفعلي لا يجمع ولا يرسل شيئًا ولأن الخطة محلية (`AD-07`) وطلب `api.github.com` اختياري بنقر صريح (`AD-08`)؛ مع `strict_min_version: 140.0` و`gecko_android.strict_min_version: 142.0` (أقل إصدارين يدعمانه). يُسجَّل في `data/plan.json` باسم `AD-15` (على المنسّق) مع شروط المراجعة: رمز الوصول (`DEC-04`/`T-5.5`) وتنزيل النموذج (`T-4.4`) وأي إرسال لبيانات إلى طرف غير GitHub.
  - **طريقة فحص Firefox:** Marionette (تثبيت مؤقت وقراءة `AddonManager`/`WebExtensionPolicy`) بدل `web-ext run`، لأنها تعيد أخطاء المانيفست وحالة الخلفية دون تنزيل شيء؛ ولا تحتاج `geckodriver`.
- المراجعة المستقلة: لم تلزم. المرحلة لا تمس تخزينًا ولا شبكة، وصلاحيتها الوحيدة (`https://github.com/*` مع `sidePanel`) يحرسها `assertManifest` عند كل بناء واختبار آلي، وإعلان جمع البيانات يحرسه اختبار.
- خارج النطاق — مسجَّل لا منفَّذ:
  - تحديث نصوص «Firefox غير مثبت (`EV-06`)» في `CLAUDE.md` و`Docs/MJ/README.md` و`tools/build.mjs` ودليل `data/status.json`: على المنسّق.
  - `sidepanel.html` المؤقت (من `src/manifest/sidepanel.placeholder.html`) تستبدله `T-1.4` (MJ5)؛ ولم يظهر تحذير `side_panel` في Edge وBrave لكن فتح اللوحة فعليًا غير مُختبَر (`HYP-14`).
  - `scripts/load-check.mjs` يفترض مسارات macOS للمتصفحات الأربعة؛ التعميم لمنصات أخرى غير مطلوب الآن.
  - `npm audit`: 3 ثغرات high في مسار أداة التطوير `web-ext` ← `@devicefarmer/adbkit` ← `node-forge`، لا تدخل الحزمة؛ لم يُطبَّق `--force` لأنه يخفّض `web-ext`.
- ما يحتاجه منسّق الدمج:
  - ملفات مشتركة مُسّت: `package.json` و`package-lock.json` (أنشأتهما المرحلة؛ تضم الموجات اللاحقة فوقهما بترتيب الدمج) و`src/manifest/*`.
  - اعتماديات جديدة: `typescript` و`vite` و`vitest` و`web-ext` و`playwright-core` و`@types/node` (مثبَّتة بإصدارات دقيقة) ← `npm ci` بعد الدمج.
  - اختبار اجتاز ليُسجَّل في `data/status.json`: `TEST-BUILD-01` (14 من 14 وبناء الحزمتين وتحميل الحزمتين في المتصفحات الأربعة) بدليل `evidence/T-1.1/report.md`.
  - يحتاج الدمج إعادة `npm run build` و`npx vitest run` و`node scripts/load-check.mjs` على الشجرة المجمّعة؛ ولا يتقاطع شيء مع التزامات `main` التي بعد الوسم.

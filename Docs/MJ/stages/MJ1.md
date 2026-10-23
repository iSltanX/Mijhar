---
id: MJ1
title: هيكل الإضافة ونظام البناء
status: active
delivery: none
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
commit: —
updated: 2026-10-23
resume: بدأت. فُحصت الشروط وأُنشئ الفرع؛ الخطوة التالية بناء الهيكل (package.json وvite وtsconfig) ثم المانيفستات.
---

# MJ1 — هيكل الإضافة ونظام البناء

> «ماذا ولماذا» في الخطة: [`T-1.1`](../../phases/phase-01-core.md#T-1.1)، والقسم 6 من [`EXECUTION_PLAN.md`](../../EXECUTION_PLAN.md). و«متى وكيف» في [`Docs/MJ/README.md`](../README.md).

## الهدف

إنشاء نواة المشروع بـTypeScript وVite وأمر بناء ينتج حزمتين: عائلة Chromium وFirefox، بمانيفست لكل منهما، ومعرّف عمل محايد، وصلاحية مضيف `https://github.com/*` وحدها. لا إطار واجهة ولا منطق وحدات.

## لماذا الآن

كل شيفرة لاحقة تُبنى فوق هذا الهيكل، ولا يمكن لأي مرحلة أخرى برمجية أن تجاوره قبل دمجه. وهي أصغر تجربة كاملة لطريقة العمل.

## النطاق

**الملفات التي تملكها المرحلة**

- `package.json` و`pnpm-lock.yaml` أو `package-lock.json` و`tsconfig.json` و`vite.config.ts`
- `src/manifest/chromium.json` و`src/manifest/firefox.json` ومولّدهما
- `src/background/` و`src/content/` نقاط دخول فارغة الوظيفة
- `scripts/build.mjs` و`scripts/load-check.mjs` (تحميل الحزمة في Chrome وEdge وBrave عبر Playwright)
- `tests/setup/` وإعداد vitest
- `.gitignore` (إضافات node_modules وdist)

**الملفات المشتركة مع مراحل الموجة** (تُضم بترتيب الدمج لا باختيار نسخة)

- لا شيء؛ المرحلة وحدها في موجتها.

**خارج النطاق**

- إطار الواجهة (`DEC-01`) ومضيف الواجهات: `MJ5`.
- أي وحدة من الوحدات الثماني.
- اسم المنتج في المانيفست يبقى معرّف عمل محايدًا حتى `T-10.2`.

## المهام

1. `T-1.1` — إعداد هيكل إضافة Manifest V3 متعدد المتصفحات ونظام البناء (مستقل عن إطار الواجهة) ([التفاصيل ومعايير القبول](../../phases/phase-01-core.md#T-1.1)).

## الاعتماديات

- **مراحل يلزم دمجها قبل البدء:** لا شيء.
- **تعمل بالتوازي مع:** لا شيء (منفردة في موجتها).
- **قرارات تمسّها:** لا شيء.

## معايير القبول

- `AC-1.1`: تُبنى حزمتا عائلة Chromium وFirefox وتُحمَّلان في Chrome وFirefox دون أخطاء مانيفست؛ وتنحصر صلاحيات المضيف الأساسية في `https://github.com/*`؛ ولا يوجد `<all_urls>`؛ والاسم في المانيفست معرّف عمل محايد.

## الفحوص

- اختبارات الخطة لمهام المرحلة: `TEST-BUILD-01`.
- `npm run build` ينتج `dist/chromium/` و`dist/firefox/` بلا أخطاء، ومانيفست كل منهما يحمل مفاتيحه (`service_worker` لعائلة Chromium و`background.scripts` و`sidebar_action` لFirefox).
- `npx web-ext lint --source-dir dist/firefox` بلا أخطاء.
- `node scripts/load-check.mjs` يحمّل `dist/chromium/` في Chrome وEdge وBrave ويطبع غياب أخطاء المانيفست؛ النتيجة في `evidence/T-1.1/report.md`.
- المتصفحات المتاحة Chrome وEdge وBrave؛ وكل بند يخص Firefox يُسجَّل «لم يُجرَ» ما دام غير مثبت (`EV-06`)، ولا يُغلق به معيار.
- الفحوص بحسب الأثر: ما تمسّه المرحلة فقط، ولا يُعاد طقم كامل بعد كل تعديل؛ والفحوص التي تشترك في متصفح أو منفذ تُجرى متسلسلة.

## المخاطر

- اختيار إضافة Vite للمانيفست المتعدد: الأبسط هو مدخلات Vite متعددة ونسخ المانيفست سكربتًا، دون إضافة خارجية ثقيلة.
- Firefox غير مثبت، فيبقى شق Firefox من `AC-1.1` مفتوحًا بعلم المالك (`EV-06`).

## المراجع

- ملفات المرحلة في الخطة: [البنية والنواة](../../phases/phase-01-core.md).
- [`TRACEABILITY.md`](../../TRACEABILITY.md) و[`DECISIONS.md`](../../DECISIONS.md).
- إن فشل `node` برسالة `_load_nvm` فابدأ الجلسة بـ`unfunction node npm npx corepack 2>/dev/null; hash -r`.

## حالة المهام

| المهمة | الحالة | ما أُنجز | الدليل |
| :--- | :--- | :--- | :--- |
| `T-1.1` | لم تبدأ | — | — |

الحالات: لم تبدأ · جارٍ التنفيذ · متوقفة: السبب · منفّذة (على الفرع) · مدمجة (يكتبها منسّق الدمج وحده). الدليل مسار تقرير في `evidence/` أو رابط.

## سجل التنفيذ

| التاريخ | ما أُنجز | الدليل |
| :--- | :--- | :--- |
| 2026-10-23 | كُتبت المواصفة | — |

**المتبقي:** كل المهام.

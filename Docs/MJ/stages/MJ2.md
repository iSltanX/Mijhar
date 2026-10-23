---
id: MJ2
title: اكتشاف الصفحة ودورة الحياة والتخزين
status: done
delivery: merged
wave: B
order: 1
depends: [MJ1]
tasks: [T-1.2, T-1.3]
model: Sonnet 5.5
model_id: claude-sonnet-5-5
why_model: افتراضي الخطة: مهام محددة المواصفات بمعايير قبول واضحة.
session: worktree
branch: mj/2-detector-lifecycle-storage
base: mj-B/base
commit: abeb8f3
updated: 2026-10-23
resume: مغلقة — دُمجت في الموجة B
---

# MJ2 — اكتشاف الصفحة ودورة الحياة والتخزين

> «ماذا ولماذا» في الخطة: [`T-1.2`](../../phases/phase-01-core.md#T-1.2) · [`T-1.3`](../../phases/phase-01-core.md#T-1.3)، والقسم 6 من [`EXECUTION_PLAN.md`](../../EXECUTION_PLAN.md). و«متى وكيف» في [`Docs/MJ/README.md`](../README.md).

## الهدف

الطبقتان المنطقيتان للنواة: `PageDetector` و`LifecycleManager` وعقد `ExtensionModule` وسجل التعديلات و`SelectorsRegistry`، وطبقة التخزين بإصدار مخطط ومرحّل ونسخة احتياطية وبث تغيّر الإعدادات. بلا واجهة.

## لماذا الآن

تعتمد عليهما كل الوحدات ومضيف الواجهات، ولا تحتاجان إلا الهيكل المدمج في الموجة A.

## النطاق

**الملفات التي تملكها المرحلة**

- `src/core/detector/` و`src/core/lifecycle/` و`src/core/registry.ts` (عقد الوحدة وتسجيلها)
- `src/core/storage/` و`src/core/settings/`
- `tests/core/detector/` و`tests/core/lifecycle/` و`tests/core/storage/` و`fixtures/pages/` (عينات HTML محفوظة)

**الملفات المشتركة مع مراحل الموجة** (تُضم بترتيب الدمج لا باختيار نسخة)

- `package.json`: إضافة اعتماديات الاختبار (vitest وjsdom) — تُضم بترتيب الدمج مع `MJ3`.
- `src/core/index.ts`: تصدير الطبقات الجديدة.

**خارج النطاق**

- مضيف الواجهات واللوحة الجانبية (`MJ5`).
- أي وحدة تستعمل هذه الطبقات.

## المهام

1. `T-1.2` — طبقة اكتشاف الصفحة (`PageDetector`) ومدير دورة حياة الوحدات (`LifecycleManager`) ([التفاصيل ومعايير القبول](../../phases/phase-01-core.md#T-1.2)).
2. `T-1.3` — طبقة التخزين المحلي والترحيل وسجل الإعدادات (`Storage, Settings & Migration`) ([التفاصيل ومعايير القبول](../../phases/phase-01-core.md#T-1.3)).

## الاعتماديات

- **مراحل يلزم دمجها قبل البدء:** `MJ1`.
- **تعمل بالتوازي مع:** `MJ3`، `MJ4`.
- **قرارات تمسّها:** لا شيء.

## معايير القبول

- `AC-1.2`: (١) إيقاف أي وحدة يعيد التعديلات المسجَّلة إلى حالتها الأصلية، ويُتحقق من ذلك على وحدات اختبارية وهمية. (٢) تحديث الحالة بعد تنقل `Turbo` يزيل الوحدات غير الملائمة ويركّب الملائمة. (٣) لا حقن مكرر بعد ثلاثين تنقلًا سريعًا على الأقل. (٤) كل ما لا يغطيه تسجيل التعديلات موثق في قائمة «استثناءات الاستعادة». (٥) القياس الرقمي لـ`PB-01` و`PB-06` و`PB-07` على الوحدات الحقيقية مجتمعةً يُجرى ويُغلق في `T-10.1` (`AC-10.1`)، ولا يُشترط لإغلاق `T-1.2` لأن تلك الوحدات لا تكون قد بُنيت حينها.
- `AC-1.3`: ترحيل المخطط من إصدار تجريبي سابق ينجح مع نسخة احتياطية تلقائية؛ تغيّر حالة تشغيل/إيقاف الوحدات يصل إلى جميع السياقات المفتوحة؛ وتجاوز الحصة يعطي خطأً مفهومًا بلا فقد بيانات؛ ويُثبَت بتجربة فعلية في كل متصفح مُختبَر هل يمكن طلب `unlimitedStorage` وقت التشغيل أم يجب إعلانها أساسية، وتُبنى واجهة التوسعة وفق النتيجة.

## الفحوص

- اختبارات الخطة لمهام المرحلة: `TEST-CORE-01`، `TEST-CORE-02`، `TEST-NAV-01`، `TEST-CORE-03`، `TEST-CORE-04`، `TEST-STORAGE-02`.
- `npx vitest run tests/core` أخضر: الاستعادة النظيفة على وحدات وهمية (`TEST-CORE-01`)، والتنقل على عينات (`TEST-CORE-02` و`TEST-NAV-01`)، والترحيل والحصة (`TEST-CORE-03` و`TEST-STORAGE-02`).
- `TEST-CORE-04` (البث بين السياقات) على Chrome وEdge وBrave عبر Playwright مع حزمة اختبار صغيرة؛ وتجربة `unlimitedStorage` وقت التشغيل لكل متصفح متاح (`HYP-06`) تُسجَّل كما هي.
- المتصفحات المتاحة Chrome وEdge وBrave وFirefox 158.0.1 (`EV-09`)؛ وأي بند يتعذر في متصفح يُسجَّل «لم يُجرَ» بسببه، ولا يُغلق به معيار.
- الفحوص بحسب الأثر: ما تمسّه المرحلة فقط، ولا يُعاد طقم كامل بعد كل تعديل؛ والفحوص التي تشترك في متصفح أو منفذ تُجرى متسلسلة.

## المخاطر

- تغيّر محددات GitHub (`BLK-DOM-SELECTOR`): تُعزل في `SelectorsRegistry`.
- حصة `storage.local` (`BLK-STORAGE-QUOTA`): خطأ مفهوم بلا فقد.

## المراجع

- ملفات المرحلة في الخطة: [البنية والنواة](../../phases/phase-01-core.md).
- [`TRACEABILITY.md`](../../TRACEABILITY.md) و[`DECISIONS.md`](../../DECISIONS.md).
- إن فشل `node` برسالة `_load_nvm` فابدأ الجلسة بـ`unfunction node npm npx corepack 2>/dev/null; hash -r`.

## حالة المهام

| المهمة | الحالة | ما أُنجز | الدليل |
| :--- | :--- | :--- | :--- |
| `T-1.2` | مدمجة | عقد `ExtensionModule` و`ModuleRegistry`؛ `PageDetector` بتصنيف 24 نوع صفحة وثقة `high`/`low` وبصمة لا تعلن التنقل الواحد مرتين؛ `SelectorsRegistry` بمرشَّحات مرتبة وترقيع نقطي وتقرير تدهور؛ `LifecycleManager` يعزل أخطاء الوحدات ويعيد تركيب الملائم عند التنقل؛ `MutationRecorder` بفحص ملكية وقائمة «استثناءات الاستعادة» (12 مدخلة). قيس على github.com الحي أن تنقل React وتبويبات طلب الدمج لا يطلق أحداث Turbo فاعتمد الكاشف Navigation API وتعديلات `body` بفحص بعد الهدوء، وصُحّحت محددات البذرة. 124 اختبارًا (`TEST-CORE-01` و`TEST-CORE-02` و`TEST-NAV-01`) | [`evidence/T-1.2/report.md`](../../../evidence/T-1.2/report.md) · [`live-selector-check.md`](../../../evidence/T-1.2/live-selector-check.md) · [`restore-exceptions.md`](../../../evidence/T-1.2/restore-exceptions.md) · [`evidence/wave-B/gate.md`](../../../evidence/wave-B/gate.md) |
| `T-1.3` | مدمجة | `Store` بإصدار مخطط وسجلات مسمّاة وتصدير واستيراد ونسخ احتياطية وبروتوكول كتابة محمية (نسخة ← سجل عملية ← كتابة ذرّية ← حذف) مع استرداد تلقائي وقفل بين السياقات؛ `StorageQuotaError` عربي بلا فقد؛ `SettingsStore` بسجل لكل إعداد وبث إلى السياقات وربط بمدير دورة الحياة؛ صلاحية `storage` في المانيفستين. **`HYP-06` دُحضت** في Chrome 156 وEdge 155 وBrave 156 وFirefox 158.0.1: لا تُطلب `unlimitedStorage` وقت التشغيل. `TEST-CORE-04` اجتاز في Chrome وEdge وBrave بسكربت محتوى فعلي وصفحتي إضافة. 92 اختبارًا (`TEST-CORE-03` و`TEST-STORAGE-02`) | [`evidence/T-1.3/report.md`](../../../evidence/T-1.3/report.md) · [`browser-report.md`](../../../evidence/T-1.3/browser-report.md) · [`evidence/wave-B/gate.md`](../../../evidence/wave-B/gate.md) |

الحالات: لم تبدأ · جارٍ التنفيذ · متوقفة: السبب · منفّذة (على الفرع) · مدمجة (يكتبها منسّق الدمج وحده). الدليل مسار تقرير في `evidence/` أو رابط.

## سجل التنفيذ

| التاريخ | ما أُنجز | الدليل |
| :--- | :--- | :--- |
| 2026-10-23 | كُتبت المواصفة | — |
| 2026-10-23 | تحقق من worktree والفرع والأساس والاعتماديات؛ أُنشئ `mj/2-detector-lifecycle-storage` من `main`؛ الحالة `active` | `7ab9a86` |
| 2026-10-23 | `T-1.2` جارٍ التنفيذ ← منفّذة: الكاشف والمدير والسجل والمحددات وعينات HTML واختباراتها | `ab009e5` |
| 2026-10-23 | `T-1.3` جارٍ التنفيذ ← منفّذة: `Store` والترحيل والإعدادات والمحوّلان واختباراتها | `4e5f7f1` |
| 2026-10-23 | تجارب المتصفحات الفعلية (`TEST-CORE-04` و`HYP-06`) وصلاحية `storage` وثوابت القدرات؛ فحص تحميل الحزمتين بعدها | `f9b1d5f` |
| 2026-10-23 | فحص حي لمحددات github.com وسلوك تنقله: لا Turbo في تنقل React ولا تبويبات طلب الدمج ← إعادة بناء مصادر الكاشف وتصحيح البذرة | `1730660` · [`live-selector-check.md`](../../../evidence/T-1.2/live-selector-check.md) |
| 2026-10-23 | مراجعة ذاتية للمخزن: قفل `navigator.locks` وحماية استرداد سياق لا يرحّل، وتجربة ترحيل متزامن في المتصفحات | `4fdc687` |
| 2026-10-23 | تقارير `T-1.2` و`T-1.3` وأدلة الاختبارات والتجارب الفعلية | `ee98c14` |
| 2026-10-23 | دُمجت في الموجة B (التزام الدمج `abeb8f3`)؛ المهام «مدمجة» واجتازت بوابة الموجة على الشجرة المجمّعة | [`evidence/wave-B/gate.md`](../../../evidence/wave-B/gate.md) |

**المتبقي:** لا شيء — دُمجت في الموجة B (`abeb8f3`) واجتازت بوابتها.

### تقرير التسليم — MJ2

- الفرع: `mj/2-detector-lifecycle-storage` · الأساس: `mj-B/base` (`a089b0d`) · آخر التزام عمل: `ee98c14`
- الفرق: `77 files changed, 9033 insertions(+), 38 deletions(-)` من `git diff --stat mj-B/base...HEAD` عند `ee98c14`؛ منها ملفات من التزامين على `main` بعد الوسم (`4bef976` و`662205d`). وفرق المرحلة وحدها عن `main`: `68 files changed, 8965 insertions(+), 3 deletions(-)` (مضافة 8965 سطرًا: نحو 2556 للشيفرة والعينات و3413 للاختبارات وحزمة المتصفحات و2469 للأدلة، منها 1850 في `browser-results.json` الخام، و523 في `package-lock.json`).
- المهام:
  - `T-1.2` منفّذة. `src/core/{registry.ts,detector/,lifecycle/}`، و5 عينات `fixtures/pages/`. 124 اختبارًا. الدليل: `evidence/T-1.2/report.md`.
  - `T-1.3` منفّذة. `src/core/{storage/,settings/}` وصلاحية `storage` في `src/manifest/*`، وحزمة اختبار المتصفحات `tests/core/storage/browser/`. 92 اختبارًا. الدليل: `evidence/T-1.3/report.md`.
- معايير القبول:
  - `AC-1.2` (١) إيقاف الوحدة يعيد التعديلات: `npx vitest run tests/core/lifecycle` ← `manager.test.ts` 18 و`restore.test.ts` 11 و`mutation-registry.test.ts` 22، وبثماني وحدات وهمية على أربع عينات تتطابق لقطة DOM بعد الإيقاف مع ما قبل التركيب حرفيًا — تحقق.
  - `AC-1.2` (٢) التنقل يزيل غير الملائم ويركّب الملائم: `navigation.test.ts` (40 تنقلًا)، وتنقل SPA بلا Turbo في سكربت محتوى فعلي في Chrome 156 وEdge 155 وBrave 156 (`evidence/T-1.3/browser-report.md`) — تحقق. لم يُجرَ في سكربت محتوى فعلي في Firefox (لا اعتراض لصفحات github.com هناك)؛ تغطيه اختبارات الوحدة.
  - `AC-1.2` (٣) لا حقن مكرر بعد 30 تنقلًا: `TEST-NAV-01` (40 تنقلًا): حقن واحد لكل وحدة وعدد مستمعات ومراقبات ثابت وتوفيق واحد للتنقل — تحقق.
  - `AC-1.2` (٤) استثناءات الاستعادة موثقة: `evidence/T-1.2/restore-exceptions.md` (12 مدخلة) وفحص آلي لاتساقها مع الشيفرة — تحقق.
  - `AC-1.2` (٥) القياس الرقمي على الوحدات الحقيقية: لم يُجرَ بنص المعيار (يُغلق في `T-10.1`). قياس تمهيدي على وحدات وهمية في jsdom: `PB-01` وسيط 0.19–0.24 مللي ثانية، `PB-06` 1.1–2.4، `PB-07` 0.82 (`evidence/T-1.2/measurements.json`) — لا يُعدّ قبولًا.
  - `AC-1.3` ترحيل من إصدار سابق مع نسخة احتياطية: `npx vitest run tests/core/storage` ← `migration.test.ts` (22) على `v0-unstamped.json` و`v1-stamped.json` وخطوات `1←2←3`؛ فشل الترحيل لا يفقد بيانات (في الذاكرة، وفي الكتابة، وجزئيًا، وانهيار الاسترجاع نفسه) — تحقق. ملاحظة: لا نسخة سابقة شُحنت؛ الإصدار 0 معرَّف بغياب ختم المخطط.
  - `AC-1.3` بث تغيّر تشغيل/إيقاف الوحدات إلى كل السياقات: `node tests/core/storage/browser/run.mjs chrome edge brave` ← `TEST-CORE-04` اجتاز في الثلاثة (صفحتا إضافة وسكربت محتوى فعلي؛ إيقاف وتفعيل وعشرة تبديلات متناوبة وإعادة تحميل) — تحقق. لم يُجرَ: اللوحة الجانبية (`T-1.4`) وFirefox (الخطة تحصره في الثلاثة).
  - `AC-1.3` تجاوز الحصة بخطأ مفهوم بلا فقد: `quota.test.ts` (13) بالمحاكاة، وبالتجربة الفعلية في Chrome وEdge وBrave (كتابة واستيراد 12 ميغابايت ← `StorageQuotaError` والبيانات سليمة ولا سجل عملية) — تحقق. Firefox لا يُنتج خطأ حصة حتى 96 ميغابايت: لم يُجرَ فيه اختبار الخطأ لعدم وجود سقف في المدى المقيس.
  - `AC-1.3` تجربة `unlimitedStorage` وقت التشغيل لكل متصفح (`HYP-06`): **دُحضت** في Chrome 156 وEdge 155 وBrave 156 وFirefox 158.0.1 (`evidence/T-1.3/browser-report.md`)؛ وبُنيت الواجهة وفق النتيجة (علاج الامتلاء التصدير وحده؛ `capabilities.ts`).
- الفحوص بحسب الأثر: `npx tsc --noEmit` بلا أخطاء، و`npx vitest run` ← 230 من 230 (منها 14 لـ`TEST-BUILD-01` بعد إضافة `storage`)، و`npm run build` ثم `web-ext lint --source-dir dist/firefox` ← 0/0/0، و`node scripts/load-check.mjs` ← Chrome وEdge وBrave وFirefox `ENABLED` بلا أخطاء مانيفست ولا تشغيل ولا تحذيرات (`evidence/T-1.3/load-check.md`). تجارب المتصفحات الفعلية شُغّلت تباعًا (Chrome ثم Edge ثم Brave ثم Firefox). لم يُشغَّل طقم كامل بعد كل تعديل، ولا شيء خارج أثر المرحلة.
- القرار المفوَّض: لا شيء (المرحلة لا تمسّ قرارًا). قرارات هندسية داخل النطاق مسجَّلة بأسبابها في تقريري المهمتين: لا اعتماد على Turbo، وسجل لكل إعداد، وبروتوكول الكتابة المحمية والقفل، وتعريف الإصدار 0. ولم يُمسّ `data/plan.json`.
- المراجعة المستقلة: **تلزم** (تمس التخزين والصلاحيات وبروتوكول استرداد). انسخ البرومبت التالي إلى جلسة مراجعة في worktree جديد على الفرع نفسه (قراءة فقط):

  ```text
  أنت مراجع مستقل لفرع mj/2-detector-lifecycle-storage في مستودع مجهر (Mijhar) المحلي. اقرأ CLAUDE.md ثم Docs/MJ/stages/MJ2.md (تقرير التسليم) ثم evidence/T-1.2/report.md وevidence/T-1.3/report.md. لا تعدّل شيئًا ولا تدمج ولا ترفع؛ كل تواصلك بالعربية.
  راجع بحثًا عن أخطاء حقيقية لا ملاحظات أسلوب، مع سيناريو إخفاق ملموس لكل ملاحظة:
  1) src/core/storage/store.ts: بروتوكول الكتابة المحمية (نسخة ← journal ← كتابة ذرّية بعلامة committed ← حذف ← إزالة journal)، والاسترداد في initialize/recover/rollback/applyBackup، وهل توجد نافذة يضيع فيها بيانات مستخدم أو يُرجَع ترحيل ناجح خطأً؛ والقفل navigator.locks وسياق migrate:false وStorageBusyError؛ وreadPrefix/subscribePrefix.
  2) src/core/settings/settings.ts: التصنيف local/remote عبر pending وسباق وصول الحدث قبل عودة وعد الكتابة، وتقارب الذاكرة المؤقتة إلى حالة التخزين.
  3) src/core/lifecycle/{mutation-registry.ts,manager.ts}: صحة عكس كل عملية وفحص الملكية، وترتيب الإيقاف، وعزل الأخطاء، وتسرب المستمعات والمراقبات.
  4) src/core/detector/detector.ts: مصادر التنقل والفحص بعد الهدوء (settleMs/settleMaxMs)؛ هل تضيع تنقلات أو تتكرر إعلانات؛ وصحة افتراضات evidence/T-1.2/live-selector-check.md.
  5) الصلاحيات والخصوصية: إضافة "storage" إلى src/manifest/*.json؛ وأن storage.local مكشوفة لسكربتات المحتوى افتراضيًا (VER-04) وأثر ذلك على ملاحظات T-8.1؛ وأن لا شيء يُرسل خارج الجهاز.
  شغّل: npm ci && npx tsc --noEmit && npx vitest run (المتوقع 230 من 230). وللتجارب الفعلية: node tests/core/storage/browser/run.mjs chrome (تشغّل متصفحًا بملف تعريف مؤقت؛ لا تشغّلها إن كان Chrome مفتوحًا بحساب مهم). صنّف كل ملاحظة بالخطورة (يوقف الدمج / يُصلح قبل الاستعمال / تحسين) وأرفق مسار الملف والسطر.
  ```
- خارج النطاق — مسجَّل لا منفَّذ:
  - ناقل الأحداث الداخلي (مخطط 4.1) لم يُبنَ؛ ليس من مخرجات `T-1.2`.
  - حسم افتراضي تفعيل كل وحدة (`defineModuleToggle(id, defaultEnabled)` يطلبه صراحة) وتبويب الإعدادات: `T-1.4`.
  - إعلان `unlimitedStorage` أساسية في المانيفست: الطريق المثبت الوحيد لرفع حصة 10 ميغابايت في عائلة Chromium إن احتاجته `T-4.4` (تنزيل نموذج)؛ قرار صلاحيات للمالك مع `DEC-03`، ولم يُفعل.
  - تقييد وصول `storage.local` لسكربتات المحتوى (`setAccessLevel`): قرار لاحق مع `T-8.1`.
  - اكتشاف تنقل SPA في سكربت محتوى فعلي في Firefox؛ واللوحة الجانبية في `TEST-CORE-04`؛ ومحددات صفحات تتطلب صلاحية خاصة؛ و`confirm.actions-run` و`confirm.discussion` و`confirm.home` (بذرة لم تُقَس حيًّا).
  - اللقطات الحية المراجَعة يدويًا لـ`fixtures/` (عيناتي اصطناعية): من تجارب `MJ4`. وإن أنتجت `T-0.1` تعديلًا على المحددات فيُطبَّق في `src/core/detector/selectors.ts` وحده.
- ما يحتاجه منسّق الدمج:
  - ملفات مشتركة مُسّت: `package.json` و`package-lock.json` (أُضيف `jsdom` و`@types/jsdom` بإصدارين دقيقين) · `src/core/index.ts` (تصدير الطبقات) · `src/core/registry.ts` (`BUILTIN_MODULES`: سطر لكل وحدة تضيفه مرحلتها) · `src/core/storage/migrations.ts` (`MIGRATIONS`: خطوة لكل مرحلة تغيّر المخطط) · `src/manifest/chromium.json` و`firefox.json` (أُضيفت `storage`؛ ولا يتقاطع مع `MJ3` و`MJ4` وفق ملكياتهما).
  - اعتماديات جديدة: `jsdom` 30.1.3 و`@types/jsdom` 30.0.0 ← `npm ci` بعد الدمج.
  - اختبارات اجتازت لتُسجَّل في `data/status.json` بدليلها: `TEST-CORE-01` و`TEST-CORE-02` و`TEST-NAV-01` (`evidence/T-1.2/`)؛ `TEST-CORE-03` و`TEST-STORAGE-02` (محاكاة + فعلي في Chromium الثلاثة؛ Firefox لم يُنتج خطأ حصة) و`TEST-CORE-04` (Chrome وEdge وBrave) (`evidence/T-1.3/`)؛ وبقاء `TEST-BUILD-01` ناجحًا بعد إضافة `storage`. فرضية `HYP-06`: دُحضت (للتسجيل في `data/plan.json` على المنسّق بوصفه حالة الفرضية).
  - يحتاج الدمج إعادة `npm ci` ثم `npx tsc --noEmit` و`npx vitest run` على الشجرة المجمّعة، و`npm run build` و`node scripts/load-check.mjs` (لتغيّر المانيفست)؛ وتجارب `node tests/core/storage/browser/run.mjs` تُعاد إن لزم (تشغّل المتصفحات بملفات تعريف مؤقتة).
  - ما ينتظر المالك: (أ) مراجعة التخزين المستقلة بالبرومبت أعلاه؛ (ب) قرار `unlimitedStorage` عند `T-4.4`؛ (ج) جلسة `claude/mj2-5fba18` (worktree آخر على الأساس نفسه لـMJ2 لم يبدأ فيه شيء) فهي مكررة وتحجز اسمًا قريبًا؛ يُنصح بأرشفتها؛ (د) في هذه الجلسة قُرئت صفحات مستودع عام (`octocat/Hello-World`) في المتصفح المدمج وجلسته كانت مسجَّلة الدخول إلى GitHub: قراءة فقط لـDOM والأحداث، ولم يُنقر زر ولم يُرسل نموذج ولم تُقرأ بيانات حساب.


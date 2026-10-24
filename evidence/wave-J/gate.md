# بوابة الموجة J على شجرة الفرع (`AD-34`)

> الفرع `mj/22-execution-path-guardrails` عند `33f94b1` (ومعه تصحيح لفظي في ملف المرحلة)، و`main` لم تتقدّم عليه (`git rev-list --count HEAD..main` = 0)، فشجرة الفرع هي ما سيصير على `main`. 2026-10-24. الفحوص التي تشترك في متصفح جرت متسلسلة. وفحوص `gate` من `Docs/MJ/waves.json`، و`manual`: «لا شيء: الكتابة الفعلية تُجرى في `TEST-EXEC-01` داخل المرحلة» (`evidence/T-11.8/report.md`، طلب الدمج التجريبي #1).

| الفحص | الأمر | النتيجة | الدليل |
| :--- | :--- | :--- | :--- |
| البناء | `npm run build` | الحزمتان | `build.txt` |
| الأنواع | `npx tsc --noEmit` | بلا أخطاء | `tsc.txt` (فارغ) |
| اختبارات `tests/modules/f/execution` و`tests/core/guardrails` مجتمعة، ومعها `TEST-SEC-07` على العينة المعادية | ضمن `npx vitest run` | اجتازت | `vitest-full.txt` |
| الطقم كاملًا (ما يمسه التغيير من اختبارات المراحل المدمجة) | `npx vitest run` | 169 ملفًا، 2575 اجتازت و2 متخطّيان قائمان قبل المرحلة | `vitest-full.txt` |
| الفحص الساكن للشيفرة المبنية: صلاحية الكتابة لا تُقرأ ولا تُرسل إلا في مسارها، ولا مسار يشغّل نصًّا أو يدرجه | `node tests/core/guardrails/built-check.mjs --out-dir evidence/wave-J` | Chromium 21/21 وFirefox 21/21 | `built-check.txt` و`built-check.json` |
| `web-ext lint` لحزمة Firefox | `npm run lint:firefox` | 0 أخطاء و0 تحذيرات و0 ملاحظات | `web-ext-lint.txt` |
| التحميل في المتصفحات الأربعة | `node scripts/load-check.mjs chrome edge brave firefox` | نجح في الأربعة بلا أخطاء مانيفست ولا تشغيل | `load-check.md` |
| `AD-33` وحراسة `AD-27` الساكنة تشمل زرّي التنزيل؛ والنقرة البرمجية عليهما لا تنزّل ونقرة الفأرة تنزّل؛ والمسار (B1 وB2 وB3) | `node tests/modules/f/execution/browser/exec-check.mjs chrome edge brave firefox` و`tests/shared/user-activation.test.ts` | 76/76: Chrome 156 وEdge 155 وBrave 156 21/21 لكلٍّ، وFirefox 158.0.1 13/13 (B3 «لم يُجرَ»: لوحة `sidebar_action` لا يقودها Marionette) | `exec-check.txt` و`browser-exec-check.json` |
| «نسخ البرومبت» بلا تراجع في المتصفحات الأربعة | `node tests/modules/e/browser/copy-prompt-check.mjs chrome edge brave firefox` | 115/115 (Firefox: قراءة الحافظة «لم يُجرَ» بسببها كما في `MJ20`) | `copy-prompt-check.txt` و`browser-copy-prompt-check.json` |
| المنشئ بلا تراجع في المتصفحات الأربعة | `node tests/modules/e/browser/builder-check.mjs chrome edge brave firefox` | 55/55 | `builder-check.txt` و`browser-builder-check.json` |

**الحكم:** البوابة خضراء، والمراجعة الذاتية (`review.md`) بلا ملاحظة تمنع الدمج.

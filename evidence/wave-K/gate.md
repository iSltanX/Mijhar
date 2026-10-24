# بوابة الموجة K — على شجرة الفرع (`AD-34`)

- التاريخ: 2026-10-24، 19:22 إلى 19:27 بتوقيت الجهاز. الشجرة: `mj/23-multi-provider-core` عند `0e3f261` (آخر التزام شيفرة، بعد إصلاح المراجعة الذاتية `K-1`)، و`main` لم يتقدم عليها (`git rev-list --count HEAD..main` = 0)، فهي الشجرة التي تصير على `main` بالدمج.
- الأمر: سكربت البوابة يشغّل الخطوات **متسلسلة** (المتصفحات والمنافذ لا تُشارَك)، وسجل الخطوات ورموز خروجها في [`gate/steps.txt`](gate/steps.txt)، ومخرج كل خطوة في `gate/<الخطوة>.txt` وملفات JSON بجانبها. وبُنيت الحزمتان أولًا (`npm run build`) ففحصت كل الخطوات `dist` من هذه الشجرة.
- المتصفحات: Chrome 156.0.8078.47 وEdge 155.0.4283.60 وBrave 156.0.8078.48 وFirefox 158.0.1 (`EV-09`).
- **النتيجة: خضراء.** كل خطوة خرجت بـ0، ولا بند فاشل.

## فحوص `gate` الموجة (`Docs/MJ/waves.json`)

| البند | الأمر والدليل | النتيجة |
| :--- | :--- | :--- |
| اختبارات `tests/modules/e/provider` و`tests/modules/d/analysis` و`tests/core/connections` و`tests/modules/e/copy-prompt` مجتمعة، ومعها مرجع `AD-28` | `npx vitest run … tests/modules/e/context/bundle-golden.test.ts` ← [`gate/vitest-gate.txt`](gate/vitest-gate.txt) | 17 ملفًا، 166/166 |
| مرجع `AD-28` الحرفي | `bundle-golden.test.ts --reporter=verbose` ← [`gate/ad28.txt`](gate/ad28.txt) | 6/6 |
| محوّلان وهميان يثبتان التبديل والعزل والموافقة الفعلية (**محاكاة**) | `multi-provider.test.ts` و`card.test.tsx` و`analysis.test.tsx` ضمن الطقم؛ وفي Chrome على بناء محاكاة بمحوّل وهمي محقون وقت البناء ([`sim-check.mjs`](../../tests/modules/e/provider/browser/sim-check.mjs)) ← [`gate/sim-check.txt`](gate/sim-check.txt) و[`gate/browser-sim-check.json`](gate/browser-sim-check.json) | ✓، والمتصفح 14/14 |
| انحدار Anthropic في المتصفحات الأربعة (`provider-check`) | ← [`gate/provider-check.txt`](gate/provider-check.txt) و[`gate/browser-provider-check.json`](gate/browser-provider-check.json) | 100/100 (25 لكلٍّ) |
| «نسخ البرومبت» بلا مفتاح | `copy-prompt-check.mjs` لعائلة Chromium ثم Firefox منفصلًا (`K-5`) ← [`gate/copy-prompt-chromium.txt`](gate/copy-prompt-chromium.txt) و[`gate/copy-prompt-firefox.txt`](gate/copy-prompt-firefox.txt) | 87/87 و28/28 (وفي Firefox «لم يُجرَ» قراءة الحافظة بسببه المعتاد) |
| فحص ساكن: ترويسات المحوّلات في `background.js` وحده (`I-2`) | `node scripts/network-audit.mjs providers` ← [`gate/provider-isolation.txt`](gate/provider-isolation.txt)؛ وضابطه الإيجابي في [`evidence/T-11.10/provider-isolation-control.json`](../T-11.10/provider-isolation-control.json) | 0 مخالفة في الحزمتين |
| لكل مزوّد مفتاحا تخزين مستقلان | `multi-provider.test.ts` (التفرد، والتاريخي بلا ترحيل) ضمن الطقم؛ وفي Chrome بعد حذف مفتاح Mock B: `mijhar.secret.providerKey` باقٍ و`mijhar.secret.providerKey.mock-b` غائب (sim-check) | ✓ |
| Firefox بنافذة الإذن الأصلية بلا قبول آلي | [`evidence/T-11.10/firefox-native-consent/check.mjs`](../T-11.10/firefox-native-consent/check.mjs) ← [`gate/firefox-native.txt`](gate/firefox-native.txt) و[`gate/firefox-native-consent/`](gate/firefox-native-consent/) | 21/21، 0 لم يُجرَ |

## الجولة اليدوية (`manual`)

«في Chrome: تبديل المزوّد في البطاقة الموحّدة بين Anthropic ومحوّل وهمي ثانٍ: المفتاح والحالة والنماذج تخص المختار، وحذف مفتاح أحدهما لا يمس الآخر، والموافقة تذكر المختار فعلًا» — أُجريت **آليًا محاكاةً** بأحداث Playwright على الصفحة (كتابة المفتاح ونقر الحفظ واختيار المزوّد من القائمة ونقر الموافقة) في `sim-check`، لا بيد بشرية: 14/14 ([`gate/sim-check.txt`](gate/sim-check.txt))، ولقطتا البطاقة فاتحًا وداكنًا في [`evidence/T-11.10/screens/`](../T-11.10/screens/).

## ما يمسه التغيير من اختبارات المراحل المدمجة

| الفحص | الدليل | النتيجة |
| :--- | :--- | :--- |
| الأنواع | `npx tsc --noEmit -p .` ← [`gate/typecheck.txt`](gate/typecheck.txt) | بلا أخطاء |
| الطقم كاملًا | `npx vitest run` ← [`gate/vitest-full.txt`](gate/vitest-full.txt) | 171 ملفًا، 2604 اجتازت و2 متخطيان |
| `web-ext lint` | ← [`gate/web-ext-lint.txt`](gate/web-ext-lint.txt) | 0 أخطاء و0 تحذيرات |
| تدقيق الشبكة الساكن (`T-4.5`، ومعه عزل المحوّلات) | `network-audit.mjs static` ← [`gate/static-audit.txt`](gate/static-audit.txt) | 0 مخالفات و0 تحذيرات |
| التحميل في الأربعة | `scripts/load-check.mjs` ← [`gate/load-check.txt`](gate/load-check.txt) | نجح في الأربعة بلا أخطاء مانيفست ولا تشغيل |
| سجل الاتصالات وتدقيق شبكته (`MJ18`؛ مُسّ `src/core/connections/`) | `connections-check.mjs` ← [`gate/connections-check.txt`](gate/connections-check.txt) | 124/124 |
| مسار الإنجاز وزرّا التنزيل (`MJ22`؛ مُسّ مستمع الخلفية) | `exec-check.mjs` ← [`gate/exec-check.txt`](gate/exec-check.txt) | 76/76 (وفي Firefox B3 «لم يُجرَ» بسببه المعتاد) |

## ما لم يُجرَ

- نقرة يد بشرية على زر نافذة Firefox الأصلية (ضُغط زرها بـ`click()` من سياق المتصفح)، ولقطة النافذة المنبثقة نفسها (تحتاج صلاحية «تسجيل الشاشة» في macOS)؛ كما في [`evidence/T-11.10/firefox-native-consent/report.md`](../T-11.10/firefox-native-consent/report.md).
- مزوّد ثانٍ على الحزمة المشحونة: لا مزوّد غير Anthropic مدموج المحوّل (`MJ24` و`MJ25`)؛ فالتعدد محاكاة كما تشترط المواصفة.

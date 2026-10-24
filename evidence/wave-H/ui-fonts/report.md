# إصلاح ما بعد H: خطّا هوية الواجهة مضمّنان (Cairo للعناوين، وAlmarai للنص)

- التاريخ: 2026-10-24 · بأمر المالك بعد إغلاق الموجة H وقبل بدء أي مرحلة في I · الفرع `fix/ui-identity-fonts` من `main` (`583e66b`).
- الملاحظة (المالك، بلقطتين من الجولة اليدوية للموجة H): الخط في العناوين غير خط النص، وليسا Cairo وAlmarai.

## السبب (مقيس)

- الرموز في `src/shared/ui/tokens.ts` كانت تسمّي `Cairo` للعناوين و`Almarai` للنص **بالاسم وحده**، ولا `@font-face` ولا `FontFace` لهما في أي واجهة؛ فيُرسم كلٌّ منهما حيث ثُبّت على الجهاز فقط، وإلا الخط التالي في القائمة.
- القياس الأول بـ`CSS.getPlatformFontsForNode` في صفحة الإعدادات المبنية (Chrome، قبل أن يثبّت المالك Almarai): العناوين «Cairo من النظام» (مثبت في `~/Library/Fonts`)، والنص «Noto Sans Arabic من النظام»؛ ولا وجه مسجّل في الصفحة.
- وقياس «قبل» في [`before-browser.txt`](before-browser.txt) بعد أن ثبّت المالك Almarai: كل شيء «من النظام» في Chrome وEdge وBrave، و**Brave يرسم Tahoma في صفحة github.com** للعنوان والنص لأنه يحجب خطوط الجهاز غير القياسية عن المواقع (حماية البصمة): فالهوية تختفي فيه حتى مع تثبيت الخطين.
- المنشأ: `MJ5` سجّلت «تضمين خطّي الهوية Cairo وAlmarai» خارج نطاقها وأحالته إلى `T-2.3`، و`T-2.3` تخص خطوط قراءة محتوى GitHub الثلاثة (Plex وCairo وNoto) بعائلات `Mijhar …` ونطاق عربي للوحدة (أ) وحدها؛ فلم يدخل Almarai أي مهمة ولم تُسجَّل للواجهة أوجه. وتقرير المضيف (`TEST-CORE-05`) كان يقيس الخط **المطلوب** في CSS («Almarai») لا المرسوم.

## الإصلاح

| الجزء | الملفات | ما تغيّر |
| :--- | :--- | :--- |
| الخطوط | `assets/fonts/Almarai-Regular.woff2` (55,772 بايت) و`Almarai-Bold.woff2` (57,520) و`OFL-Almarai.txt` | من `Almarai/` في الملف الذي أرسله المالك (Almarai 1.10، OFL 1.1)، والترخيص منسوخ حرفيًا. Cairo في الملف (3.130) مطابق بايتًا ببايت لمصدر الملفين المضمّنين، فبقيا كما هما |
| المحوّل | `scripts/fonts/convert.mjs` (جديد) | fontTools غير مثبتة وتثبيتها تنزيل، فكُتب مرمّز WOFF2 بـNode وحده (brotli المدمج) بقيود `convert.py` نفسها: لا تجزئة ولا تحويل جداول ولا بيانات وصفية. **ناتجه لـ`Cairo-Regular.ttf` و`Cairo-Bold.ttf` مطابق بايتًا ببايت لملفي fontTools المضمّنين** (`cmp`) |
| التحقق | `scripts/fonts/verify.mjs` | خطا Almarai في `FONT_FILES`؛ واختلاف سطر الحقوق في توزيع Almarai نفسه (الخط «by Almarai» والترخيص «The Almarai Project Authors») مقبول بالنصّين الحرفيين وحدهما ويُسجَّل ملاحظة. **الخطوط السبعة: كل جدول مطابق لأصله بايتًا ببايت** ([`fonts-verify.json`](fonts-verify.json)) |
| التسجيل | `src/shared/ui/fonts.ts` (جديد) | `UI_FONTS` (Cairo 400 و700، وAlmarai 400 و700) و`registerUiFonts(doc)`: `FontFace` في `document.fonts` من `runtime.getURL`، مرة لكل مستند، بلا عنصر أنماط في المستند (فلا يُكسر مبدأ `shadow.ts`: لا ورقة أنماط في مستند GitHub)، والأوجه المسجّلة في المستند تسري في كل جذور الظل؛ والملف لا يُحمَّل إلا حين يُرسم به نص. بعائلتي `Mijhar UI Cairo` و`Mijhar UI Almarai` لأن `Mijhar Cairo` في الوحدة (أ) مقيّد بالحروف العربية لنص الصفحة |
| نقطتا التركيب | `src/core/ui-host/shadow.ts` (`createShadowHost`) و`src/options/page.tsx` (`installStyles`) | الأولى تغطي كل واجهة في صفحة GitHub والدرج، والثانية الإعدادات واللوحة الأصلية والقارئ |
| الرموز | `src/shared/ui/tokens.ts` | `--mijhar-font-display: "Mijhar UI Cairo", Cairo, …` و`--mijhar-font-text: "Mijhar UI Almarai", Almarai, …` |
| الاختبارات | `tests/shared/ui/fonts.test.ts` (جديد، 8) و`tests/shared/ui/browser/fonts-check.mjs` (جديد)، و`tests/modules/a/fonts/fonts.test.ts` | الاختبار القديم يقارن قائمة التحقق بخطوط القراءة وحدها، والجديد يشترط أن **كل** woff2 في الحزمة في قائمة التحقق (أقوى من قبل) |

لا صلاحية جديدة: `fonts/*.woff2` في `web_accessible_resources` لـ`github.com` منذ `T-2.3`، ويشمل Almarai بالنمط نفسه. ولا اعتمادية جديدة. والحزمة أكبر بـ113,292 بايتًا للخطين و4,485 للترخيص.

## الأدلة: قبل وبعد

| الفحص | قبل (الحزمة من `main`) | بعد |
| :--- | :--- | :--- |
| `tests/shared/ui/fonts.test.ts` | يسقط: الوحدة غير موجودة، واختبارا الوحدة (أ) لـAlmarai ([`before-unit.txt`](before-unit.txt)) | 8/8، ومعها ui-host والوحدة (أ): 77 اجتازت ([`after-unit.txt`](after-unit.txt)) |
| `fonts-check.mjs` في الأربعة | **8/44** ([`before-browser.txt`](before-browser.txt)) | **44/44** ([`after-browser.txt`](after-browser.txt)، [`after-browser.json`](after-browser.json)) |

ما يقيسه `fonts-check.mjs` على الحزمة المشحونة نفسها بلا تعديل:

- **Chrome وEdge وBrave** (`CSS.getPlatformFontsForNode`، الخط المرسوم فعلًا): في صفحة الإعدادات، واللوحة الجانبية، وبطاقة ملخص طلب الدمج داخل جذر الظل في صفحة github.com: العنوان **Cairo مضمّن** والنص **Almarai مضمّن** (`isCustomFont`)، لا «من النظام»، رغم أن الخطين مثبتان على هذا الجهاز؛ والأوجه الأربعة في `document.fonts`؛ ولا عنصر أنماط للواجهة في مستند GitHub؛ ولا مضيف خارجي. وفي Brave على github.com صار Cairo وAlmarai بعد Tahoma.
- **Firefox 158.0.1** (Marionette لا يكشف الخط المرسوم): الأوجه الأربعة في `document.fonts`، والمستعمل منها `loaded` (Cairo 700 وAlmarai 400 و700) وCairo 400 غير المستعمل `unloaded` (التحميل كسول كما صُمّم)، و`document.fonts.check` صحيح، وقائمة font-family المحسوبة تبدأ بالعائلة المضمّنة، في الثلاثة.
- اللقطات بعد الإصلاح في Chrome: [`screens/`](screens/).

## الانحدار على شجرة الفرع (الحزمة المبنية بعد الإصلاح)

| الفحص | النتيجة | الدليل |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | خروج 0 | [`typecheck.txt`](typecheck.txt) |
| الطقم كاملًا `npx vitest run` | 148 ملفًا، **2326 اجتازت** و2 متخطيان (2318 قبله و8 جديدة) | [`vitest-full.txt`](vitest-full.txt) |
| `npm run build` و`web-ext lint --source-dir dist/firefox` | الحزمتان؛ 0 أخطاء و0 ملاحظات و0 تحذيرات | [`build.txt`](build.txt)، [`web-ext-lint.txt`](web-ext-lint.txt) |
| `npm run load-check` | نجح في الأربعة: ENABLED بلا أخطاء مانيفست ولا تشغيل ولا تحذيرات | [`run.txt`](run.txt) |
| `node scripts/network-audit.mjs static` | 0 مخالفات و0 تحذيرات | [`network-audit/`](network-audit/) |
| تكامل الوحدات `tests/modules/browser/integration.mjs` | **103/103**، وأخطاء الكونسول 0 في الأربعة | [`run.txt`](run.txt) |
| عدم تراجع المضيف (`TEST-CORE-05` و`06`، `tests/core/ui-host/browser/run.mjs`) | اجتاز في الأربعة: العزل بلا اختلاف في 13×37 خاصية بين صفحة الضبط والمعادية (`style-src 'self'`)، والدرج واللوحة الأصلية والمفاتيح الثمانية والصلاحية والشبكة؛ وخط النص المحسوب في الدرج صار `Mijhar UI Almarai` | [`ui-host/browser-report.md`](ui-host/browser-report.md) |

وفحص المضيف يكتب مخرجه في `evidence/T-1.4/`: نُقل إلى [`ui-host/`](ui-host/) واستُعيدت `evidence/T-1.4/` كما هي.

## ما لم يُجرَ

- الخط المرسوم فعلًا في Firefox: Marionette لا يكشفه؛ والمقيس فيه تحميل الوجه المستعمل وترتيب القائمة المحسوبة.
- جهاز بلا Cairo ولا Almarai مثبتين: الخطان مثبتان على هذا الجهاز؛ والفيصل في Chromium أن الخط المرسوم «مضمّن» لا «من النظام»، وBrave على github.com (يحجب خطوط الجهاز) يحاكي جهازًا بلا الخطين، فصار Cairo وAlmarai المضمّنين بعد Tahoma.
- صفحات github.com الحية بأنماطها.

## ما يعرفه المالك

- أسماء العائلتين في `document.fonts` لصفحة GitHub (`Mijhar UI Cairo` و`Mijhar UI Almarai`) يراها سكربت الصفحة كما يرى خطوط الوحدة (أ) وملفات `fonts/` المتاحة لـgithub.com منذ `T-2.3`؛ لا جديد في كشف وجود الإضافة.
- `T-10.1` (`MJ23`): الحزمة أكبر بـ117,777 بايتًا (الخطان والترخيص)؛ وفحص الخطوط المرسومة (`fonts-check.mjs`) يُضم إلى التحقق الشامل.

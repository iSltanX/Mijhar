# الترحيب والتعريف والاتصالات والإبلاغ (`AD-29`) — تقرير التنفيذ والأدلة

- **التاريخ:** 2026-10-24 · **بأمر المالك** قبل أن تبدأ أي مرحلة في الموجة H.
- **الفرع:** `feat/welcome-help` من `main` عند `8e27432` (رأس `main` و`mj-H/base`)، في worktree مستقل `.claude/worktrees/welcome-help`. لم يُدمج ولم يُرفع شيء.
- **التصميم:** القسم «J — الترحيب والتعريف والمساعدة والإبلاغ» في الصفحة «03 الشاشات والتدفقات» من [ملف Figma المعتمد](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=102-18928).

## ما صُمّم وما نُفّذ وما بقي لمرحلته

| البند | التصميم (Figma) | التنفيذ | المرحلة والمعيار |
| :--- | :--- | :--- | :--- |
| الترحيب عند أول فتح | [P-55](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=102-18929) و[P-56](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=102-19012) و[P-56a](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=102-19138) و[P-57 داكن](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=102-19243) | **نُفّذ** (اللوحة والدرج) بنسخة P-56a: مفتاح المزوّد «لم يُتح بعد» | `MJ21` تقلبه إلى P-56 (`AC-E9` البند ٨) |
| «جولة الترحيب» ودليل الرمز في إعدادات اللوحة | [P-58](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=103-20332) | **نُفّذ** (قسم «البداية والمساعدة») | — |
| مدخل «كيف تحصل على الرمز؟» | [O-16](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=103-19929) | **نُفّذ** في قسم الرمز الحالي | `MJ18` تبقيه في سجل الاتصالات (`AC-11.1` البند ٧) |
| دليل رمز GitHub بالصور | [O-17](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=104-19494) و[O-21 داكن](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=109-20770) | **نُفّذ** (`#guide/github-token`) | — |
| «لماذا المفتاح؟» | [O-18](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=108-19599) ومدخله في O-16 | لم يُنفَّذ: لا مفتاح ولا تحليل في الشيفرة بعد | `MJ21` (`AC-E9` البند ٨)، ومدخله `MJ18` (`AC-11.1` البند ٧) |
| «الإبلاغ عن مشكلة» في «حول» | [O-19](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=103-20192) و[O-20](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=109-19687) | لم يُنفَّذ: شاشة «حول» نفسها لم تُبنَ، والقناة قرار معلّق | `MJ23` (`AC-10.3`) بعد `DEC-12` |
| خريطة الانتقالات | [J-00](https://www.figma.com/design/D7FBsBSCEyY3gRgOqZ4xYp/?node-id=110-19880)، وروابط Prototype بين الأزرار والإطارات | — | — |

وفي الصفحة «02 — المكوّنات»: علامات الرسوم التوضيحية (`Guide/Step marker` و`Guide/Highlight` و`Guide/Illustration tag`)، وخاصية «رابط الشرح» الاختيارية في `Connection card` (مطفأة افتراضيًا فلا تتغير الإطارات القائمة). وجدول الحصر «00» فيه صفوف الإطارات الجديدة، وحُذف منه «جولة ترحيب بعد التثبيت» من «خارج النطاق عمدًا».

## قرارات التصميم والتنفيذ (بتفويض المالك في التفاصيل، ومسجّلة في `AD-29`)

1. **متى يظهر الترحيب:** يكتبه التثبيت الأول وحده (`runtime.onInstalled` بالسبب `install`) في `ui.welcome = pending`؛ الافتراضي `done` فلا يظهر بعد تحديث الإضافة ولا في مخزن قائم ولا في اختبارات الوحدات.
2. **أين:** داخل لوحة التبويبات (الأصلية والدرج)، **والتبويبات ظاهرة فوقه**؛ واختيار أي تبويب أو طلب تبويب من خارج اللوحة (`Alt+K`) يُعدّ تجاوزًا وينهيه. فلا يحجب الترحيب أي قسم، ولا تنكسر فحوص المتصفح القائمة التي تنتظر التبويبات (قيس أدناه).
3. **لا يتكرر:** ينهيه «ابدأ الاستخدام» أو «تخطَّ» أو «اربط الرمز من الإعدادات» أو اختيار تبويب؛ ويُعاد من «جولة الترحيب» في الإعدادات.
4. **الصدق في الميزات:** يعدّد أربع ميزات منفَّذة ومدمجة فقط؛ ولم يُذكر «التنقيح» لأن حزمة السياق تنبّه على الأنماط المشبوهة ولا تحذفها بعد (التنقيح في `T-11.2`). ومفتاح المزوّد «لم يُتح بعد» بلا اسم مزوّد ولا رابط.
5. **رابط القالب:** يملأ في صفحة GitHub الاسم `Mijhar read-only` ووصفًا ومدة 90 يومًا وصلاحيات القراءة الست وحدها من `READ_PERMISSIONS` (أُضيف إليها اسم المعامل `param`)؛ ولا `target_name` ولا كتابة. والإنشاء بضغط المستخدم نفسه.
6. **الرسوم:** SVG مضمّن يتبع الوضعين، كل رسم `role="img"` باسم يصفه ووسم ظاهر «رسم توضيحي، ليس لقطة من GitHub»؛ والأسماء نائبة والرمز مقنَّع، والتسميات الإنجليزية من خطوات توثيق GitHub (مثل Token name وExpiration وResource owner وRepository access وOnly select repositories وPermissions وDelete) وما لم يُنقل نصّه شريط رمادي؛ فالرسم ليس مرجعًا لنص الواجهة، والنص المرافق هو المرجع. والخطوة نصًّا تكفي دونه.
7. **فتح الإعدادات على موضع:** قائمة مغلقة `OPTIONS_TARGETS` (`token` و`guide/github-token`) تتحقق منها الخلفية قبل `tabs.create` بعنوان داخل الإضافة؛ وما عداها صفحة الإعدادات نفسها.
8. **الخطان:** `var(--mijhar-font-display)` (Cairo) للعناوين و`var(--mijhar-font-text)` (Almarai) للنص، كما في بقية الواجهة. ملاحظة سابقة لهذا العمل: Almarai غير مضمّن في الحزمة فيُعرض خط النظام البديل إن لم يكن مثبتًا (يخص `T-10.1`).

## قرار للمالك: `DEC-12` (قناة الإبلاغ)

المستودع المطلوب `iSltanX/app-reports` **خاص** لا عام: يعطي 404 بلا تسجيل دخول (`curl` على `github.com/iSltanX/app-reports` و`/issues/new` في 2026-10-24)، **ولا قوالب Issues فيه** (`.github/ISSUE_TEMPLATE` غير موجود) ولا وسم `product:mijhar`؛ وعقده في README (v1) خادم Cloudflare Worker يرسل إليه التطبيق بعد المعاينة والموافقة، ويشترط بقاءه خاصًّا. فرابط `issues/new` يعطي 404 لكل مستخدم، ولم يُخمَّن قالب ولا وسم. سُجّل `DEC-12` معلّقًا بثلاثة خيارات والتوصية **ي-1** (الانضمام منتجًا `mijhar` عبر الخادم كما فعلت إضافة رصد)، وصُمّم O-20 عليها موسومًا «مقترح». لم يُنشأ بلاغ ولم يُرسل شيء.

## حقائق من التوثيق الرسمي (قُرئت 2026-10-24)

- GitHub: المسار Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token، ومعاملات رابط القالب (`name` و`description` و`expires_in` و`contents=read`…)، والحذف بزر `Delete`، والإبطال التلقائي إن نُشر الرمز علنًا أو لم يُستعمل سنة، وتعليق الرمز (`Pending`) إن اشترطت المنظمة موافقة، والحدان 60 و5000 في الساعة. وغياب صلاحية Checks للرموز دقيقة الحبيبات قِيس في `evidence/T-0.5`.
- Anthropic (لصفحة O-18 التي تبنيها `MJ21`): فوترة API منفصلة عن اشتراك المحادثة، مع رصيد شهري محدود لـAPI في بعض الخطط (Max وTeam)؛ والمفاتيح من `platform.claude.com`؛ وسياسة البيانات المعلنة (لا تدريب افتراضيًا، والحذف خلال 30 يومًا مع استثناءات). تُعاد قراءتها وقت التنفيذ بنص `AC-E9` (٨).
- لم يُنشأ أي رمز ولا مفتاح من حساب المالك لإعداد الشرح.

## الفحوص

| الفحص | النتيجة | الدليل |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | 0 أخطاء | [`checks.txt`](checks.txt) |
| الطقم كاملًا `npx vitest run` | 137 ملفًا: 2200 اجتازت و2 متخطيان (`GHSIM_SOURCE` و`MIJHAR_HISTORIES`) | [`checks.txt`](checks.txt) |
| الاختبارات الجديدة | الترحيب 12 (`tests/shared/onboarding/welcome.test.tsx`)، والخلفية والمواضع 4 (`tests/core/ui-host/welcome-background.test.ts`)، والدليل والتنقل 6 (`tests/options/guide.test.tsx`)؛ وتحديث عدّ مفاتيح السجل في `tests/core/ui-host/units.test.ts` من 10 إلى 11 | — |
| `npm run build` | الحزمتان | [`checks.txt`](checks.txt) |
| `web-ext lint` لـ`dist/firefox` | 0 أخطاء و0 ملاحظات و0 تحذيرات | [`checks.txt`](checks.txt) |
| التحميل `scripts/load-check.mjs` | Chrome 156 وEdge 155 وBrave 156 وFirefox 158.0.1: نجح بلا أخطاء مانيفست ولا تشغيل | [`checks.txt`](checks.txt) |
| فحص الترحيب والدليل على الحزمة المشحونة [`browser-check.mjs`](browser-check.mjs) | Chrome 16/16 وEdge 16/16 وBrave 16/16، وصفر طلبات إلى أي مضيف خارجي | [`browser-check.txt`](browser-check.txt) و[`browser-check.json`](browser-check.json) واللقطات في [`screens/`](screens/) (Chrome؛ لقطات Edge وBrave مطابقة فحُذفت) |
| انحدار: فحص المضيف `tests/core/ui-host/browser/run.mjs chrome` | نجح: اللوحة الأصلية بتبويباتها الخمسة، والدرج والأمر كما كانا | نتيجة في مجلد مؤقت (لا يكتب في المستودع) |
| انحدار: `tests/modules/browser/mj10-integration.mjs chrome` | 26/27؛ والساقط «وحدة الترجمة (ج) ساكنة» يسقط **على بناء `main` نفسه** (26/27): الفحص كُتب قبل أن تسجّل `MJ14` محرك الترجمة دائمًا، ولا صلة له بهذا العمل؛ وبنود اللوحة («تبدأ على السياق» وطلب Alt+K والبحث) اجتازت مع الترحيب | — |

**لم يُجرَ:** فحص الترحيب في Firefox الحقيقي (السكربت لعائلة Chromium؛ والتحميل فيه نجح، والسلوك مغطّى باختبارات jsdom)؛ والدرج داخل صفحة GitHub حقيقية (مغطّى باختبارات الوحدة بلا حقول وبزر الدليل)؛ وفتح روابط GitHub نفسها (حُجبت الشبكة الخارجية عمدًا).

## نطاق المراجعة (لمن يدمج)

- **التخزين:** مفتاح إعداد واحد غير سرّي `ui.welcome` (`pending`/`done`) في سجل الإعدادات الأساسي؛ لا سرّ ولا محتوى.
- **الرسائل والصلاحيات:** `OPEN_OPTIONS_MESSAGE` يقبل `target` من قائمة مغلقة تتحقق منها الخلفية (`optionsPageUrl`) ثم `tabs.create` بعنوان `options.html#…` داخل الإضافة؛ لا صلاحية جديدة ولا تغيير في المانيفست.
- **الشبكة:** لا طلب من الترحيب ولا من الدليل؛ روابط `github.com` و`docs.github.com` تُفتح بنقر المستخدم في تبويب جديد بـ`rel="noopener noreferrer"`، ورابط القالب لا يحمل بيانات المستخدم.
- **الملفات المشتركة التي مُسّت:** `src/core/ui-host/units.ts` و`commands.ts` و`index.ts`، و`src/background/main.ts`، و`src/content/main.tsx`، و`src/sidepanel/PanelApp.tsx` و`main.tsx`، و`src/options/` (`SettingsTab.tsx` و`main.tsx` و`index.html` و`OptionsApp.tsx` الجديد و`guide/`)، و`src/modules/d/token/format.ts` و`TokenSection.tsx`، و`src/shared/ui/tokens.ts` و`icons.tsx`، و`src/shared/onboarding/`.
- **الخطة:** `data/plan.json` (`AD-29` و`DEC-12` و`AC-11.1` و`AC-E9` و`AC-10.3`) و`EXECUTION_PLAN.md` (القسم 0.6 وغيره) وملفات `MJ18` و`MJ21` و`MJ23`. **المولَّدات** (`DECISIONS.md` و`phases/` و`ROADMAP.md` و`STATUS.md` وكتلة `Docs/MJ/README.md` والمناطق المولّدة في الخطة) لم تُولَّد في الـworktree بحسب `CLAUDE.md`: تُولَّد في النسخة الرئيسية بعد الدمج بـ`node tools/build.mjs` ثم `node tools/check.mjs` (يفشل الفحص قبلها بسبع ملاحظات «ملف مولَّد قديم» وحدها، وبيانات الخطة نفسها بلا خطأ). وسطر «المعلّق الآن واحد: `DEC-07`» في `Docs/MJ/README.md` (خارج الكتلة، يملكه منسّق الدمج) يصير اثنين.
- **الأساس:** إن دُمج هذا الفرع قبل أن تبدأ `MJ18` و`MJ19` يُنقل `mj-H/base` إلى رأس `main` الجديد بأمر المالك (القاعدة في README)؛ وإن بدأتا قبله تُحدَّث فروعهما بـ`git merge main` بأمره.

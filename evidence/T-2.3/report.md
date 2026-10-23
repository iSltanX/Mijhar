# تقرير `T-2.3`: الخطوط العربية المضمّنة المرخصة وضبط الطباعة (`TEST-RTL-03`، `AC-A3`، `HYP-16`)

> قيس في 2026-10-23 على Apple M4 (8 أنوية، 16 GB، macOS 27.0)، Node v24.18.1. الخام:
> - `license-check.json`: التراخيص ومطابقة الملفات.
> - `fonts-github.json`: صفحة GitHub حقيقية.
> - `evidence/MJ7/extension-run.json`: الحزمة المشحونة بـCSP الحقيقية لـGitHub.

## الملفات والتراخيص (تحقق قبل التضمين)

| الملف | الخط | الرخصة من `nameID 13` في الخط | ملف الترخيص المرافق | صاحب الحقوق (الخط = الملف) | الاسم المحجوز |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `fonts/IBMPlexSansArabic-Regular.woff2` (80,852 بايت) و`-Bold` (82,428) | IBM Plex Sans Arabic 1.101 | SIL OFL 1.1 | `fonts/OFL-IBMPlexSansArabic.txt` | IBM Corp. | `Plex` |
| `fonts/Cairo-Regular.woff2` (39,408) و`-Bold` (40,360) | Cairo 3.130 | SIL OFL 1.1 | `fonts/OFL-Cairo.txt` | The Cairo Project Authors | — |
| `fonts/NotoSansArabic-Variable.woff2` (366,836، متغير wdth وwght) | Noto Sans Arabic 2.012 | SIL OFL 1.1 | `fonts/OFL-NotoSansArabic.txt` | The Noto Project Authors | — |

- **ملفات الترخيص** منسوخة حرفيًا من `google/fonts` (`ofl/<الخط>/OFL.txt`) بإذن المالك في الجلسة، وبصماتها في `license-check.json`.
- **الخطوط** من ملفات TTF المثبتة عند المالك (توزيع Google Fonts). حُوّلت بـ`scripts/fonts/convert.py`: بلا تجزئة، وبلا تحويل `glyf`/`loca`، وبلا بيانات وصفية WOFF.
- **مطابقة الجداول:** `scripts/fonts/verify.mjs --source ~/Library/Fonts` يفك WOFF2 بنفسه (brotli) ويقارن كل جدول بأصله بايتًا ببايت: 18/18 و16/16 و21/21. يُستثنى حقلان في `head` يفرضهما ترميز WOFF2:
  - `checkSumAdjustment`.
  - البت 11 من `flags`، وهو علامة الضغط في مواصفة OpenType.
- **الاسم المحجوز «Plex».** شرط OFL-FAQ 2.2.1: النسخة WOFF لا تُعد معدّلة ويبقى اسمها، بشرط أن تبقى البيانات كما هي عدا الضغط وألا تُضاف بيانات وصفية. الشرطان متحققان، فلم يُعَد تسمية الخط.

## HYP-16: تحميل الخطوط داخل صفحة GitHub مع CSP

سياسة GitHub الحقيقية فيها `font-src github.githubassets.com`. يُضمَّن `@font-face` بعنوان الإضافة (`runtime.getURL`) في `#mijhar-reading-styles`.

| المتصفح | صفحة حقيقية `github.com/Barqawiz/Shakkala` | الحزمة المشحونة على صفحة بـCSP GitHub |
| :--- | :--- | :--- |
| Chrome 156 | وجها 400 و700 `loaded`، `fonts.check` صحيح، 0 انتهاك CSP، طلبات الخطوط إلى `chrome-extension://` وحده | `loaded`، 0 انتهاك |
| Edge 155 | كذلك | كذلك |
| Brave 156 | كذلك | كذلك |
| Firefox 158.0.1 | `loaded`، 0 انتهاك | `loaded`، 0 انتهاك |

- **الحكم:** `HYP-16` ثبتت. سياسة CSP للصفحة لا تمنع الخطوط المضمّنة من حزمة الإضافة في المتصفحات الأربعة، فلم يُطبَّق بديل `BLK-CSP-FONT`.
- **إن تغيّر ذلك مستقبلًا:** قائمة `font-family` تسقط إلى خطوط GitHub نفسها (`var(--fontStack-sansSerif)`) دون كسر.
- **الخط المحسوب** لفقرة عربية حقيقية: `"Mijhar IBM Plex Sans Arabic", "Mona Sans VF", -apple-system, …`، أي الخط المضمّن ثم قائمة GitHub. والنطاق `unicode-range` عربي، فلا يتغير خط اللاتيني والكود.
- **سجل الشبكة:** لا طلب إلى `fonts.googleapis.com` ولا `fonts.gstatic.com` ولا أي نطاق خطوط خارجي. في الفحص على الحزمة المشحونة لم يُطلب غير `github.com` وموارد الإضافة نفسها.

## عناصر التحكم: تُطبَّق وتُحفظ وتُعاد إلى الافتراضي

- **الإعداد** `modules.a.fonts.options` = `{ family, scale, lineHeight, spacing }`:
  - `family`: IBM Plex (الافتراضي) أو Cairo أو Noto أو خط النظام.
  - `scale`: حجم الخط من 100% إلى 130%.
  - `lineHeight`: ارتفاع السطر من 1.6 إلى 2.0، والافتراضي 1.8.
  - `spacing`: تباعد الفقرات من ×0.5 إلى ×2.
  - `letter-spacing: 0` دائمًا.
- **مكان التطبيق:** الحجم وارتفاع السطر والتباعد على الكتل العربية وحدها، الخارجية منها فقط حتى لا يتضاعف الحجم في `li > p`.
- **صفحة الإعدادات:** قسم «الخطوط والطباعة» فيه زر «أعد الافتراضي» (`settings.reset`).
- **في المتصفحات الأربعة على الحزمة المشحونة:** اختيار Cairo يستبدل `@font-face` في الصفحة المفتوحة بلا إعادة تحميل، وزر الإعادة يعيد IBM Plex.
- **على jsdom** (`tests/modules/a/fonts/fonts.test.ts`، 11 اختبارًا): CSS بعناوين الإضافة وحدها، وحدود القيم، والحفظ في المخزن وقراءته بسجل جديد، و`reset`، وإزالة الكتلة بالإيقاف.
- **العارض** (`reader.html`) يستعمل الخطوط والطباعة نفسها بعناوين نسبية داخل صفحة الإضافة.

## لم يُجرَ

- المقارنة البصرية لجودة عرض الخطوط الثلاثة (حكم تصميمي لا قياس). الخط الافتراضي IBM Plex كما في الخطة.

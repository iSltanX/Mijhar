# إصلاح `G-1`: «ترجمة مسودتي» وحالة `consent` (الفرع `fix/g-consent-draft`)

- الفرع: `fix/g-consent-draft` من `main` عند `9aad649` · التاريخ: 2026-10-24 · بأمر المالك بعد بلاغ إغلاق الموجة G.
- الخلل (`evidence/wave-G/review.md`، ملاحظة `G-1`): `MJ16` وسّعت عقد `Availability` بحالة `consent` (الحزمة `downloadable`)، وقسم «ترجمة مسودتي» (`MJ13`) كان يحوّل أي حالة ليست `ready` ولا `unavailable` إلى `absent` فيعرض «المحرك غير متاح: لم يُفعَّل محرك ترجمة محلي» والمحرك موجود. آمن (لا `create()`) لكنه تضليل، ولا طريق لمنح الموافقة من المساعد.

## الإصلاح

ملف واحد: [`src/modules/f/phrasebank/translate-draft.tsx`](../../../src/modules/f/phrasebank/translate-draft.tsx)، على نهج شريط الترجمة وبطاقة التحديد في `c/ui`:

- `consent` عند فتح القسم ← القسم **جاهز** (`data-service="ready"`) وزر «ترجم مسودة الحقل» ظاهر؛ لا يُقال «غير متاح».
- **كل نقرة** على «ترجم مسودة الحقل» تسأل المحرك عن حالته (`availability()`) قبل أي ترجمة: `consent` ← بطاقة الاستئذان **بدل** الأزرار ولا `create()`؛ `ready` ← ترجمة كما كانت؛ `unavailable` أو غائب ← حالة القسم المعتادة. وبهذا إذا سقطت الموافقة (فشل لم تكتمل فيه الحزمة) عادت البطاقة، وإذا ثبتت الحزمة ترجمت النقرة التالية بلا بطاقة.
- «موافق، نزّل الحزمة وترجم» ← `grantConsent()` ثم الترجمة من النقرة نفسها (`create()` تحتاج نشاط نقرة)؛ «ليس الآن» ← تزول البطاقة ويعود الزر والتركيز إليه.
- البطاقة من بيانات المحرك نفسه (نوع مشتق من `Availability`)، فلا استيراد لوحدة `model-manager`، ولا مساس بالقسم الثابت ولا بملف آخر.

## الاختبار أولًا

[`tests/modules/f/phrasebank/consent.test.tsx`](../../../tests/modules/f/phrasebank/consent.test.tsx) (8 اختبارات) بمحرك مُدار حقيقي (`ManagedTranslationEngine` فوق `TranslatorApiEngine` فوق `Translator` وهمي):

| قبل الإصلاح ([`before-fix.txt`](before-fix.txt)) | بعده ([`after-fix-phrasebank.txt`](after-fix-phrasebank.txt)) |
| :--- | :--- |
| **6 سقطت** (أولها `expected 'absent' to be 'ready'`) و2 اجتازتا (الحزمة `available` و`unavailable` لم تتغير) | **8/8** مع القسمين الآخرين في `tests/modules/f/phrasebank` = 27/27 |

وتأكدتُ أن الاختبارات تكشف الخلل: تعطيل فرع `consent` في الإصلاح (`if (false && …)`) يُسقط 5 من 8، واستُعيد الملف.

## الفحوص

| الفحص | النتيجة | الملف |
| :--- | :--- | :--- |
| `npx tsc --noEmit` | بلا أخطاء | [`typecheck.txt`](typecheck.txt) |
| الطقم كاملًا | 132 ملفًا · **2169 اجتازت** (2161 + 8 جديدة) · 2 متخطيان (المشروطان المعروفان) | [`vitest-full.txt`](vitest-full.txt) |
| `npm run build` و`lint:firefox` | الحزمتان؛ 0 أخطاء و0 ملاحظات و0 تحذيرات؛ `content.js` ‏1,387,854 بايتًا (كان 1,385,008) | [`build.txt`](build.txt) · [`web-ext-lint.txt`](web-ext-lint.txt) |
| فحص المساعد في المتصفحات (`tests/modules/f/template/browser/run.mjs`، `TEST-WRITE-02` و`03` و`05`) | Chrome وEdge وBrave وFirefox ‏45/45 في كلٍّ = **180/180** (القسم الثابت لا يتغير؛ والترجمة بتقنيع ومراجعة؛ وفشل المحرك يُبقي الأصل) | [`template-browser.txt`](template-browser.txt) |
| تكامل الحزمة المشحونة بكل وحداتها | 26/26 ×3 و25/25 = **103/103**، أخطاء الكونسول 0 | [`integration.txt`](integration.txt) |
| **الحزمة المشحونة في Chrome وBrave الحقيقيين** (حزمة اللغة `downloadable` في ملف تعريف جديد؛ [`real-browser-check.mjs`](real-browser-check.mjs)) | **10/10 في كلٍّ**: القسم جاهز وزر الترجمة ظاهر؛ نقرة فعلية تعرض البطاقة («الحجم: غير معلن من المتصفح») والحزمة ما زالت `downloadable`؛ «ليس الآن» تعيد الزر بلا تنزيل؛ «موافق» بنقرة فعلية تنزّل وتترجم (5.8 ث في Chrome و11.2 ث في Brave) فتصير الحزمة `available` والنتيجة «قم بتشغيل `npm test` في src/app.js واقرأ https://example.com/docs قبل الدمج.» برموزها؛ والنقرة التالية بلا بطاقة؛ ولا طلب شبكة خارجي | [`real-browser-chrome.txt`](real-browser-chrome.txt) · [`real-browser-brave.txt`](real-browser-brave.txt) |

## حدود

- Edge (`unavailable`) وFirefox (لا `Translator API`) لا يبلغان حالة `consent`؛ ما يخصهما في القسم لم يتغير (`المحرك غير متاح` بسببه) وتغطيه اختبارات الوحدة وفحص المساعد.
- لم أعالج `G-2` (فحص `isTrusted` في زري البطاقة): خارج هذا الأمر، وتبقى مسجَّلة.
- وثائق الموجة (`review.md` وسجل الموجات) لم تُمسّ في الفرع؛ حُدِّث وضع `G-1` فيهما بعد الدمج بأمر المالك.

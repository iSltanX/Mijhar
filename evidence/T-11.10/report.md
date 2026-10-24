# `T-11.10` — تعدد مزوّدي التحليل: سجل وصفي ومفاتيح مستقلة وواجهة موحّدة (`AC-E10`، `F-E9`)

- المرحلة `MJ23` (الموجة K)، الفرع `mj/23-multi-provider-core` من `main` (`cfd26dd`)، 2026-10-24. آخر التزام شيفرة: `79f429b`.
- **محاكاة لا اتصال حقيقي:** لا محوّل مزوّد حقيقي جديد هنا (OpenAI وGemini في `MJ24` و`MJ25`)، ولا طلب إلى مزوّد حقيقي. محوّلان وهميان لمزوّدين غير Anthropic (`MOCK_B` يعلن توافق مودلاته، و`MOCK_C` لا يعلنه ويدعم الفحص الصريح) في [`fixture-provider-mock.ts`](../../tests/modules/e/provider/fixture-provider-mock.ts)، ومحوّل Anthropic القائم على مضيف وهمي محلي.
- أدلة التطوير في هذا المجلد شُغّلت على `d25adea`؛ وبعدها تعديلان صغيران في الشيفرة (`79f429b`: تحديث حالة المفتاح في القسم بعد `no-key` و`model-changed`، واسم المزوّد في نص حالة مفتاحه)، فأُعيدت الفحوص كلها على الشيفرة النهائية في بوابة الموجة: [`evidence/wave-K/gate.md`](../wave-K/gate.md).

## ما بُني

| الجزء | الملفات | الأثر |
| :--- | :--- | :--- |
| السجل الوصفي | `src/modules/e/provider/catalog.ts` و`descriptors/anthropic.ts` و`types.ts` (`ProviderDescriptor`) | المعرّف والاسم والمضيف وصلاحيته وصيغة المفتاح وطلب التحقق المعلن ورابط السياسة الرسمية؛ بلا ترويسة ولا مسار. يستورده المحتوى واللوحة والإعدادات |
| سجل المحوّلات | `registry.ts` (`PROVIDER_ADAPTERS`) و`adapters/anthropic.ts` (`ANTHROPIC_ADAPTER`) | الخلفية وحدها؛ يرفض معرّفًا أو مضيفًا مكررًا ونمط صلاحية لا يطابق مضيفه. `index.ts` لم يعد يستورده (`I-2`) |
| المودلات | `models.ts` | المتوافق وحده (`declared` أو `checked`)، والافتراضي أول متوافق نشط بترتيب المزوّد، بلا اسم ولا فئة؛ وما ثبت بالفحص يبقى بعد إعادة التحقق |
| المفاتيح | `src/core/connections/keys.ts` (`providerSecretKeys`، `providerSecretStore`) | مفتاحان لكل مزوّد؛ Anthropic بمفتاحيه التاريخيين `mijhar.secret.providerKey` و`providerKey` بلا ترحيل؛ وغيره `mijhar.secret.providerKey.<id>` و`providerKey.<id>` |
| الصحة | `src/core/connections/service.ts` و`health.ts` | سجل صحة لكل مزوّد (`provider` في السجل)؛ و«مفتاح مزوّد التحليل» العام حالة مفتاح المختار، و`keyStatus(provider)` لكلٍّ |
| البوابة | `gate.ts` (`bindKey`، `ProviderHostPermission`) | مفتاح مزوّد لا يُرسل إلى مضيف غيره (يرمي قبل أي طلب)؛ صلاحية المضيف لمزوّدها والموافقة الواحدة للكل تُسحبان منفصلتين |
| الخدمة | `service.ts` و`port.ts` و`settings.ts` | `status(provider?)` و`verify(provider)` و`probe(provider, model)` و`analyze` بالمزوّد الذي عُرض (`provider-changed`)، ومودل لكل مزوّد (`modelSettingKey`، مودل Anthropic في `e.provider.model` التاريخي) |
| الواجهة | `ProviderCard.tsx` (بدل `KeySection.tsx` و`section.tsx` المحذوفين) و`src/options/main.tsx` و`sections.ts` (`SETTINGS_DEFINITIONS`) | بطاقة «مزوّد التحليل» واحدة (O-23 وO-24 وO-25 وO-27) |
| الموافقة | `ui/ConsentSheet.tsx` و`src/modules/d/analysis/controller.tsx` و`view.tsx` | الوجهة الفعلية ورابط السياسة؛ وتغيّر المزوّد أو المودل أو المحتوى بعد العرض يعيد العرض بسببه ولا يُرسل (P-59) |
| `PP-03` (`I-3`) | `src/modules/d/analysis/limits.ts` والأقسام الثلاثة (`d/analysis` و`d/pr-status` و`d/log-parser`) | السياق بحد الأسطر المخزَّن نفسه الذي يتبعه «نسخ البرومبت» |
| النصوص | `src/shared/onboarding/content.ts` و`src/options/guide/ProviderKeyGuide.tsx` و`TokenGuide.tsx` و`src/core/connections/definitions.ts` | الأسماء والمضيفات والسياسات من السجل؛ ولا ذكر لمزوّد لم يُدمج |
| التدقيق | `scripts/network-audit.mjs` (`providers`، `PROVIDER_ADAPTER_MARKERS`) | ترويسات المحوّلات ومساراتها في `background.js` وحده، ومخزن الأسرار في الخلفية والإعدادات وحدهما، بضابط إيجابي |

## معايير القبول (`AC-E10`)

| البند | الدليل | النتيجة |
| :--- | :--- | :--- |
| (١) سجل وصفي والمحوّلات في الخلفية | `static.test.ts` (علامات المحوّل في ملفه وحده من src، ولا يستورد السجل الوصفي محوّلًا، ولا يستورد سجلَّ المحوّلات إلا الخلفية والخدمة)؛ `multi-provider.test.ts` (السجل الوصفي يطابق المحوّلات)؛ [`provider-isolation.txt`](provider-isolation.txt) (الحزمتان: العلامات في `background.js` وحده) و[`provider-isolation-control.json`](provider-isolation-control.json) (علامة محقونة في `content.js` تُكشف) | ✓ |
| (٢) مفاتيح وإعدادات مستقلة | `multi-provider.test.ts` (`TEST-AI-04`: مفتاحان لكلٍّ بلا تشارك، والتاريخي يُقرأ بلا ترحيل، والتحقق يقرأ مخزن مزوّده وحده ويحمل مفتاحه وحده، والتبديل والحذف وسحب المضيف تخص مزوّدها، و`provider-changed` قبل أي قراءة)؛ `adapter.test.ts` (`bindKey`)؛ `card.test.tsx` (الحفظ والمسح في مخزن المختار وحده)؛ [`browser-sim-check.json`](browser-sim-check.json) (Chrome، محاكاة) | ✓ |
| (٣) واجهة موحّدة | `card.test.tsx`؛ [`browser-provider-check.json`](browser-provider-check.json) (بطاقة واحدة ولا قسم منفصل، الأربعة)؛ [`screens/`](screens/) (فاتح وداكن) | ✓ |
| (٤) المتوافق وحده، وBLK-MODEL-COMPAT | `adapter.test.ts` (Anthropic «معلن» من الواجهة الرسمية)؛ `multi-provider.test.ts` (C بلا مودل ولا إرسال، والفحص الصريح)؛ `card.test.tsx` (لا خيار معلَّلًا، وزر الفحص)؛ `static.test.ts` (لا اسم ولا فئة مودل في الشيفرة) | ✓ |
| (٥) الموافقة بالاختيار الفعلي | `analysis.test.tsx` (تغيّر المزوّد أو المودل أو محتوى الصفحة بعد العرض يعيدها ولا يُرسل، والطلب يحمل المزوّد المعروض)؛ `multi-provider.test.ts` (لا تحويل ولا إعادة)؛ `service.test.ts` (طلب جارٍ لكل قسم، وموعد إعادة المحاولة)؛ `ui.test.tsx` (الوجهة والسياسة وسبب الإعادة، و`isTrustedActivation`)؛ `browser-sim-check` (الموافقة تذكر Mock B ومضيفه، وطلب واحد إليه) | ✓ |
| (٦) الصلاحيات وFirefox | `card.test.tsx` (المضيف في نقرة الحفظ قبل أي `await`، والموافقة معه في Firefox، وسحبهما منفصلين)؛ `multi-provider.test.ts` (سحب الموافقة يوقف الكل)؛ [`firefox-native-consent/report.md`](firefox-native-consent/report.md) (21/21 بلا قبول آلي) | ✓ |
| (٧) النصوص من السجل | `ui.test.tsx` و`welcome.test.tsx` و`health.test.ts` (لا حصر في Anthropic، ولا مزوّد لم يُدمج)؛ `static.test.ts` (لا سعر ولا رابط أسعار، `AD-31`) | ✓ |
| (٨) `PP-03` | `analysis.test.tsx` (حد 20 يقتطع ما يُرسل ويُعلن، و5000 لا) | ✓ |
| (٩) لا تغيير لمن لا مفتاح له، والانحدار | [`browser-provider-check.json`](browser-provider-check.json) (100/100)؛ [`regression/`](regression/) («نسخ البرومبت» بلا مفتاح 87/87 وFirefox 28/28، وسجل الاتصالات 124/124)؛ [`vitest-full.txt`](vitest-full.txt) (2603 اجتازت)؛ `bundle-golden.test.ts` (`AD-28` 6/6) | ✓ |

## ما يختلف عن التصميم عمدًا

- O-23 يرسم قيمة المفتاح مقنّعة ببدايتها ونهايتها (`sk-ant-api03-••••Qm8`) وزري «استبدل» و«احذف». بقي سلوك `MJ21` و`AC-11.1`: لا يُعرض المفتاح ولا جزء منه بعد الحفظ، والحقل يُفرَّغ؛ والأزرار «احفظ وتحقق» و«تحقق من المفتاح» و«امسح المفتاح» و«اسحب صلاحية…» كما هي.
- ملخص «المزوّدون الآخرون في القائمة» (O-23) لا يظهر الآن: في السجل المشحون مزوّد واحد. يظهر حين يُدمج مزوّد ثانٍ، ومثبت في المحاكاة.

## خارج النطاق — مسجَّل لا منفَّذ

- محوّلا OpenAI وGoogle Gemini وصلاحيتا مضيفيهما وأنماط مفتاحيهما في قائمة الحجب: `MJ24` و`MJ25`، على العقد الذي بُني هنا (`ProviderDescriptor` و`ProviderAdapter.probe`)، ويضيف كلٌّ سطره في `PROVIDER_ADAPTER_MARKERS`.
- سجل صحة Anthropic المحفوظ في `storage.session` قبل التحديث (بلا حقل `provider`) لا يُقرأ بعده: يظهر المفتاح «غير متحقق منه» حتى أول تحقق أو استعمال في الجلسة نفسها، ولا يُمنع به التحليل (`isLinked`). لا ترحيل للمفتاح نفسه ولا لمودله.

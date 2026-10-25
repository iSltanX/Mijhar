# حزم مِجهَر للحاسوب وحده (`AD-40`)

> 2026-10-26، بُنيت في النسخة الرئيسية عند `6dec96f` (دمج `claude/mijhar-pages-repo-79d5c0`، والتزامه `ae384f4`). لم يُرفع شيء ولم يُقدَّم شيء إلى متجر. وهي **الحزم الحالية**، وتحلّ محل حزم `AD-39` في [`../store-name/report.md`](../store-name/report.md).

## ما تغيّر

- `src/manifest/firefox.json`: حُذف `browser_specific_settings.gecko_android` (كان `strict_min_version: "142.0"`). وجوده ولو فارغًا يعلن لـAMO توافق Firefox على أندرويد، وغيابه يجعل AMO يعدّ الإضافة للحاسوب وحده؛ ولم يُختبر مِجهَر على أندرويد. والحد الأدنى للحاسوب باقٍ `140.0`.
- لا تغيير في مانيفست عائلة Chromium ولا في شيفرة الإضافة: حزمة Chromium مطابقة بايتًا ببايت لحزمة `AD-39`.

## الحزم ومصدرها وتجزئاتها

بناها `npm run build` ثم `node scripts/package.mjs` في `release/packages/` بالنسخة الرئيسية، والسجل في [`package.txt`](package.txt):

| الحزمة | الحجم (بايت) | SHA-256 | مقابل `AD-39` |
| :--- | :--- | :--- | :--- |
| `release/packages/chromium/mijhar-1.0.0-chromium.zip` (Chrome وEdge وBrave) | 1,798,367 | `c611a68763dd05793e63c4321b6a1dafd66a390c38776370b1eeea9b9313e710` | بلا تغيير |
| `release/packages/firefox/mijhar-1.0.0-firefox.zip` | 1,798,459 | `e0ad5b03326f9cc957e55fccb604d80b10f087e640c3f180b2418824d0e94566` | جديدة (كانت `56e3f45a…`) |
| `release/packages/firefox/mijhar-1.0.0-source.zip` (لمراجعي AMO) | 1,837,406 | `773cc033e63851729d131e9d7351ccc2c7d1ac747145fdd41fac89b020a0b9d6` | جديدة (كانت `980c8bb1…`) |

و`SHA256SUMS` السابق في [`SHA256SUMS.before`](SHA256SUMS.before). ولا تُقدَّم حزمتا Firefox والمصدر السابقتان بوصفهما الحاليتين.

## ما فُحص

- **المانيفست داخل الأرشيفين** ([`manifests.txt`](manifests.txt)): الاسم «مِجهَر - مساعدك على GitHub» و`short_name` «مِجهَر» والنسخة 1.0.0 في الاثنين، وفي Firefox مفتاح `gecko` وحده بحد أدنى `140.0` وبلا `gecko_android`. و`src/manifest/firefox.json` داخل حزمة المصدر مطابق للمصدر عند `6dec96f`.
- `node scripts/package.mjs --check` (القائمة المسموحة، ولا أسرار ولا مسارات جهاز، وحزمتا التثبيت = `dist/`)، و`shasum -a 256 -c SHA256SUMS`، و`unzip -t`: سليمة.
- **إعادة البناء من حزمة المصدر وحدها** (`npm ci` ثم `npm run build` في مجلد مؤقت): `dist/chromium` و`dist/firefox` مطابقان بايتًا ببايت ([`source-rebuild.txt`](source-rebuild.txt)).
- **التحميل** في Firefox 158.0.1 وChrome 156 بملفات تعريف مؤقتة: نجح بلا أخطاء مانيفست ولا تشغيل ([`load-check.md`](load-check.md)). وEdge وBrave يحمّلان `dist/chromium` المطابق بايتًا ببايت لما نجح فيهما مع `AD-39`.
- **`web-ext lint`: 0 أخطاء و0 تنبيهات وتحذير واحد متوقَّع** (`KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION`): addons-linter يفحص توافق أندرويد دائمًا، وحين يغيب `gecko_android` يأخذ حد الحاسوب (140) حدًّا لأندرويد، فينبّه إلى أن `data_collection_permissions` يحتاج Firefox لأندرويد 142. وهو تحذير عن منصة لم تعد معلنة، لا خطأ ولا يمنع التقديم. ولا يُسكَت إلا بإعادة إعلان أندرويد (خلاف القرار) أو برفع حد الحاسوب إلى 142، وفي ذلك إسقاط Firefox ESR 140، وهو قرار منتج لم يُتخذ.
- على الفرع: `tests/build` و`manifest.test.ts` والاختبارات التي تقرأ المانيفست والوثائق (63)، و`npm run typecheck`، و`privacy --check`، وgitleaks بلا تسريب؛ وفي النسخة الرئيسية `node tools/build.mjs` و`node tools/check.mjs` أخضر.

## ما يلزم لاحقًا

- في نموذج AMO لا يُختار «Firefox for Android» في خطوة التوافق ([`release/listings/submission.md`](../../release/listings/submission.md#firefox-add-ons-وحده)).
- تاريخ سريان الخصوصية يُثبَّت يوم النشر الفعلي بـ`node scripts/privacy-effective.mjs --today` (بتوقيت السعودية)، ولا يمس ذلك الحزم (لا تحمل `PRIVACY.md` ولا `Docs/`).

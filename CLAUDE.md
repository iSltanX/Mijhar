# مِجهَر (Mijhar): تعليمات المشروع

إضافة متصفح (Manifest V3) بـTypeScript وPreact تُبنى بـVite لهدفين: `dist/chromium` (Chrome وEdge وBrave) و`dist/firefox`.

## الأوامر

- `npm ci` ثم `npm run build` (أو `node scripts/build.mjs chromium|firefox`) و`npm run typecheck` و`npm test` (Vitest على `tests/**/*.test.ts(x)`) و`npm run lint:firefox` (بعد البناء).
- `node scripts/package.mjs` يكتب الحزم في `release/packages/` (غير متتبَّع)، ثم `node scripts/package.mjs --check` يعيد الفحص دون كتابة؛ و`--check` وحده بلا حزم مكتوبة يفشل.
- `npm run load-check` يحمّل الحزمتين في المتصفحات المثبتة دون واجهة. Firefox 159 يتطلب `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` في البيئة، وإلا فشل فحصه.
- فحوص المتصفح الحقيقي في `tests/**/browser/*.mjs` (وبعض `tests/**/*-check.mjs`) تُشغَّل بـ`node` خارج Vitest، وتستعمل `scripts/spikes/lib.mjs` لتشغيل المتصفحات. بعضها يكتب نتائجه افتراضيًا في `evidence/`؛ مرّر `--out <مجلد مؤقت>` إن لم تقصد تحديث القياس المرجعي.
- اختبارات التوقيت (`PB-04` في `tests/modules/g/bookmarks/`) قد تفشل تحت حمل الجهاز وتنجح منفردة؛ أعد تشغيلها منفردة قبل الحكم.

## الملفات المولَّدة والمراجع

- `PRIVACY.md` مولَّد من `Docs/Site/privacy.md` بـ`node scripts/privacy.mjs`، و`THIRD_PARTY_NOTICES.txt` من `node scripts/notices.mjs`؛ لا يُحرَّران بيد، ويفشل `npm test` إن اختلفا عن مولّديهما. وتاريخ سريان الخصوصية يُثبَّت بـ`node scripts/privacy-effective.mjs`.
- `Docs/Site/privacy.md` و`Docs/Site/help.md` مصدر صفحتي الخصوصية والمساعدة في `bysltan.com/Mjhr`، يقرؤهما مولّد مستودع الموقع (`WebSiteSultan`)، وتشير شيفرته إلى `Docs/Site/mijhar.md` و`spec.md`؛ فلا تُنقل ولا يُعاد تسميتها.
- ما بقي في `evidence/` تقرؤه الاختبارات: قياسات مرجعية (`T-0.1` و`T-0.4` و`T-1.3`)، ووثيقتا استثناءات الاستعادة (`T-1.2` و`T-2.7`) اللتان يجب أن تذكرا كل معرّف في الشيفرة.
- أيقونات الحزمة من `release/icons/`، والخطوط من `assets/fonts/`.

## الاتفاقات

- **الخصوصية والصلاحيات:** معالجة محلية بلا خدمات سحابية؛ صلاحية `https://github.com/*` وحدها أساسية، و`api.github.com` ومضيفو مزوّدي التحليل وخادم البلاغات اختيارية تُطلب بنقر صريح من المستخدم.
- **التواصل:** كل ما يُوجَّه للمالك بالعربية؛ المصطلحات وأسماء الملفات والأوامر بصيغتها الأصلية. ورسائل الالتزام بالعربية.
- **بأمر المالك وحده:** الدفع والنشر في المتاجر ورفع رقم الإصدار، وكل ما يمس بيانات خاصة أو صلاحيات حساسة أو حذفًا لا يُسترجع.
- **البيئة:** إن فشل `node` برسالة `_load_nvm` فشغّل أولًا `unfunction node npm npx corepack 2>/dev/null; hash -r`.

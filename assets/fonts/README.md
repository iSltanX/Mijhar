# الخطوط المضمّنة (T-2.3، F-A3؛ وخطّا هوية الواجهة)

تُنسخ ملفات `woff2` و`txt` هنا كما هي إلى `fonts/` في كل حزمة (`scripts/build.mjs`)، ولا يُحمَّل أي خط من الإنترنت. والاستعمال:

- **خطوط القراءة** (الوحدة (أ)، `src/modules/a/fonts/fonts.ts`): Plex وCairo وNoto لنص صفحات GitHub العربي، بعائلات `Mijhar …` ونطاق حروف عربي.
- **خطّا هوية الواجهة** (`src/shared/ui/fonts.ts`): Cairo للعناوين وAlmarai للنص في كل واجهات مِجهَر، بعائلتي `Mijhar UI Cairo` و`Mijhar UI Almarai` تُسجَّلان بـ`FontFace` في `document.fonts`.

| الملف | الخط والإصدار | الرخصة | الاسم المحجوز | المصدر |
| :--- | :--- | :--- | :--- | :--- |
| `IBMPlexSansArabic-Regular.woff2`، `IBMPlexSansArabic-Bold.woff2` | IBM Plex Sans Arabic، Version 1.101 | `OFL-1.1` (`OFL-IBMPlexSansArabic.txt`) | `Plex` | ملفات TTF المثبتة عند المالك (توزيع Google Fonts) |
| `Cairo-Regular.woff2`، `Cairo-Bold.woff2` | Cairo، Version 3.130 | `OFL-1.1` (`OFL-Cairo.txt`) | — | كذلك (ومطابقة بايتًا ببايت لـ`Cairo/static/` في الملف الذي أرسله المالك في 2026-10-24) |
| `NotoSansArabic-Variable.woff2` | Noto Sans Arabic، Version 2.012 (متغير: wdth وwght) | `OFL-1.1` (`OFL-NotoSansArabic.txt`) | — | كذلك |
| `Almarai-Regular.woff2`، `Almarai-Bold.woff2` | Almarai، Version 1.10 | `OFL-1.1` (`OFL-Almarai.txt`) | — | `Almarai/` في ملف التنزيل من Google Fonts الذي أرسله المالك في 2026-10-24 (`Almarai,Cairo.zip`) |

- **ملفات الترخيص** منسوخة حرفيًا من `https://raw.githubusercontent.com/google/fonts/main/ofl/<الخط>/OFL.txt` بإذن المالك في 2026-10-23؛ و`OFL-Almarai.txt` منسوخ حرفيًا من `Almarai/OFL.txt` في ملف المالك.
- **سطر الحقوق في Almarai** يختلف في التوزيع نفسه: الخط (`nameID 0`) «Copyright (c) 2019 by Almarai» وملف الترخيص «Copyright 2019 The Almarai Project Authors»، وكلاهما المشروع نفسه. يقبله `verify.mjs` بالنصّين الحرفيين وحدهما ويسجّله ملاحظة؛ وأي نص غيرهما مشكلة.
- **التحويل** بـ`scripts/fonts/convert.py` (fontTools)، أو بـ`scripts/fonts/convert.mjs` (Node وحده، بالقيود نفسها؛ وناتجه لملفي Cairo مطابق بايتًا ببايت لناتج fontTools المضمَّن): لا تجزئة، ولا تحويل `glyf`/`loca`، ولا بيانات وصفية WOFF. فلا تُعد النسخة «Modified Version» ويبقى الاسم المحجوز (OFL-FAQ 2.2.1). وحُوّل Almarai بـ`convert.mjs`.
- **التحقق** بـ`node scripts/fonts/verify.mjs --source <مجلد TTF>`: كل جدول بعد فك WOFF2 يطابق TTF الأصلي بايتًا ببايت. يُستثنى حقلان يفرضهما ترميز WOFF2: `checkSumAdjustment` والبت 11 من `head.flags`. ونوع الرخصة يُقرأ من `nameID 13` في الخط ومن ملف ترخيصه. الدليل في `evidence/T-2.3/license-check.json`، وللسبعة معًا بعد إضافة Almarai في `evidence/wave-H/ui-fonts/fonts-verify.json`.

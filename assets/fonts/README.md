# الخطوط المضمّنة (T-2.3، F-A3)

تُنسخ ملفات `woff2` و`txt` هنا كما هي إلى `fonts/` في كل حزمة (`scripts/build.mjs`)، ولا يُحمَّل أي خط من الإنترنت.

| الملف | الخط والإصدار | الرخصة | الاسم المحجوز | المصدر |
| :--- | :--- | :--- | :--- | :--- |
| `IBMPlexSansArabic-Regular.woff2`، `IBMPlexSansArabic-Bold.woff2` | IBM Plex Sans Arabic، Version 1.101 | `OFL-1.1` (`OFL-IBMPlexSansArabic.txt`) | `Plex` | ملفات TTF المثبتة عند المالك (توزيع Google Fonts) |
| `Cairo-Regular.woff2`، `Cairo-Bold.woff2` | Cairo، Version 3.130 | `OFL-1.1` (`OFL-Cairo.txt`) | — | كذلك |
| `NotoSansArabic-Variable.woff2` | Noto Sans Arabic، Version 2.012 (متغير: wdth وwght) | `OFL-1.1` (`OFL-NotoSansArabic.txt`) | — | كذلك |

- **ملفات الترخيص** منسوخة حرفيًا من `https://raw.githubusercontent.com/google/fonts/main/ofl/<الخط>/OFL.txt` بإذن المالك في 2026-10-23.
- **التحويل** بـ`scripts/fonts/convert.py` (fontTools): لا تجزئة، ولا تحويل `glyf`/`loca`، ولا بيانات وصفية WOFF. فلا تُعد النسخة «Modified Version» ويبقى الاسم المحجوز (OFL-FAQ 2.2.1).
- **التحقق** بـ`node scripts/fonts/verify.mjs --source ~/Library/Fonts`: كل جدول بعد فك WOFF2 يطابق TTF الأصلي بايتًا ببايت. يُستثنى حقلان يفرضهما ترميز WOFF2: `checkSumAdjustment` والبت 11 من `head.flags`. ونوع الرخصة يُقرأ من `nameID 13` في الخط ومن ملف ترخيصه. الدليل في `evidence/T-2.3/license-check.json`.

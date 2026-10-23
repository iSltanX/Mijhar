#!/usr/bin/env python3
# تحويل خطوط T-2.3 من TTF إلى WOFF2 دون أي تعديل في بيانات الخط (أداة صيانة تُشغَّل مرة، لا جزء من البناء؛ تحتاج fontTools وbrotli).
# شرط OFL-FAQ 2.2.1 (https://openfontlicense.org/ofl-faq/) كي لا تُعد النسخة «Modified Version» فيبقى الاسم المحجوز
# (Reserved Font Name "Plex" في IBM Plex Sans Arabic): بيانات الخط كما هي عدا ضغط WOFF، وبلا بيانات وصفية WOFF.
# لذلك: لا تجزئة، ولا تحويل glyf/loca (transformedTables فارغة: الجداول تُضغط بـbrotli كما هي)، ولا إعادة حساب لأي جدول،
# ولا metadata ولا private. ويتحقق scripts/fonts/verify.mjs من تطابق كل جدول بايتًا ببايت مع الأصل.
# الاستعمال: python3 scripts/fonts/convert.py <مجلد المصدر> <مجلد الإخراج>
import sys
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import WOFF2FlavorData

FONTS = {
    'IBMPlexSansArabic-Regular.ttf': 'IBMPlexSansArabic-Regular.woff2',
    'IBMPlexSansArabic-Bold.ttf': 'IBMPlexSansArabic-Bold.woff2',
    'Cairo-Regular.ttf': 'Cairo-Regular.woff2',
    'Cairo-Bold.ttf': 'Cairo-Bold.woff2',
    'NotoSansArabic-VariableFont_wdth,wght.ttf': 'NotoSansArabic-Variable.woff2',
}

def main(src: str, out: str) -> None:
    for name, target in FONTS.items():
        font = TTFont(f'{src}/{name}', lazy=True, recalcBBoxes=False, recalcTimestamp=False)
        font.flavor = 'woff2'
        font.flavorData = WOFF2FlavorData(transformedTables=())
        font.save(f'{out}/{target}', reorderTables=False)
        print(f'{name} -> {target}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])

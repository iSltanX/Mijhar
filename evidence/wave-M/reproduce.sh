#!/bin/zsh
# AMO: يُبنى مِجهَر من حزمة المصدر وحدها في مجلد مؤقت (npm ci ثم npm run build)، ويُقارن الناتج بـdist من الشجرة نفسها ملفًا ملفًا.
unfunction node npm npx corepack 2>/dev/null
ROOT="${0:A:h}/../.."
SRC=$(ls "$ROOT"/release/packages/firefox/mijhar-*-source.zip | head -1)
TMP=$(mktemp -d "${TMPDIR:-/tmp}/mijhar-reproduce-XXXXXX")
cd "$TMP" || exit 1
unzip -q "$SRC" || exit 1
npm ci --ignore-scripts --no-audit --no-fund || exit 1
npm run build || exit 1
diff -r dist/firefox "$ROOT/dist/firefox" && echo "dist/firefox مطابق" || exit 1
diff -r dist/chromium "$ROOT/dist/chromium" && echo "dist/chromium مطابق" || exit 1
cd / && rm -rf "$TMP"

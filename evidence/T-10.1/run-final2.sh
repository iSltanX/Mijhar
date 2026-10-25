#!/bin/zsh
# الجولة الثانية على البناء نفسه بعد توحيد مصطلح الرمز: الفحوص المعلّقة بالأداة المصلحة، وإعادة axe في Edge وحده (انقطعت صفحته في الجولة الأولى).
# المخرجات في evidence/T-10.1/final/ وسجلها في final/steps.txt (تُلحق).
unfunction node npm npx corepack 2>/dev/null
cd "${0:A:h}/../.." || exit 1
F=evidence/T-10.1/final
echo "round2 $(git rev-parse --short HEAD) $(date '+%Y-%m-%d %H:%M') (+ شجرة العمل)" >> $F/steps.txt
step() {
  local name=$1 limit=$2; shift 2
  local t0=$(date +%s)
  perl -e 'alarm shift; exec @ARGV' $limit "$@" > $F/$name.txt 2>&1
  echo "$name exit=$? $(( $(date +%s) - t0 ))s" >> $F/steps.txt
}
step pending-chromium 1800 node evidence/T-10.1/pending/chromium-check.mjs chrome edge brave
step pending-firefox 1200 node evidence/T-10.1/pending/firefox-check.mjs
step axe-edge 900 node tests/shared/ui/browser/axe-check.mjs edge --extra-hash report --out $F/axe-edge.json
echo done2 >> $F/steps.txt

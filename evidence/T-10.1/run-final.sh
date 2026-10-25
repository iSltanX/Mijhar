#!/bin/zsh
# إعادة ما يلزم من T-10.1 على البناء النهائي (بعد شيفرة T-10.2: «حول» والبلاغ وزر شريط الأدوات والأيقونات والاختصارات النهائية وإصلاح 360 والتباين)،
# بالأداة المصلحة للفحوص المعلّقة. متسلسلة، ومخرج كل خطوة في evidence/T-10.1/final/<الخطوة>.txt وسجلها في final/steps.txt.
# الاستعمال من جذر المستودع بعد npm run build: zsh evidence/T-10.1/run-final.sh [اسم خطوة ...]
unfunction node npm npx corepack 2>/dev/null
cd "${0:A:h}/../.." || exit 1
F=evidence/T-10.1/final
mkdir -p $F
ONLY=("$@")
[[ ${#ONLY} -eq 0 ]] && echo "tree $(git rev-parse --short HEAD) $(date '+%Y-%m-%d %H:%M') (+ شجرة العمل)" > $F/steps.txt
step() {
  local name=$1 limit=$2; shift 2
  if [[ ${#ONLY} -gt 0 && ${ONLY[(Ie)$name]} -eq 0 ]]; then return; fi
  local t0=$(date +%s)
  perl -e 'alarm shift; exec @ARGV' $limit "$@" > $F/$name.txt 2>&1
  echo "$name exit=$? $(( $(date +%s) - t0 ))s" >> $F/steps.txt
}
step pending-chromium 1800 node evidence/T-10.1/pending/chromium-check.mjs chrome edge brave
step pending-firefox 1200 node evidence/T-10.1/pending/firefox-check.mjs
step memory-long 2400 node tests/content/browser/perf-check.mjs chrome edge brave --memory-only 10 60 --out $F/memory-long.json
step axe 1800 node tests/shared/ui/browser/axe-check.mjs chrome edge brave firefox --extra-hash report --out $F/axe.json
for b in chrome edge brave firefox; do step mj13-$b 900 node tests/modules/g/browser/mj13-check.mjs $b --out-dir $F/mj13-$b; done
step load-check 600 node scripts/load-check.mjs chrome edge brave firefox
step welcome-help 900 node evidence/wave-G/welcome-help/browser-check.mjs chrome edge brave
if [[ ${#ONLY} -eq 0 ]]; then
  git checkout -- evidence/wave-G/welcome-help 2>/dev/null
  git clean -fdq -- evidence/wave-G/welcome-help 2>/dev/null
  echo done >> $F/steps.txt
fi

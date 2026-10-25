#!/bin/zsh
# بقية T-10.1 بعد المصفوفة (MJ26): البناء بإصلاح PI-1، ثم الفحوص الحقيقية المعلّقة من تدقيق ما قبل الإصدار، والأداء، والوصول، وإعادة ما يمسّه PI-1
# من المصفوفة. متسلسلة، ومخرج كل خطوة في evidence/T-10.1/<الخطوة>.txt وسجلها في rest-steps.txt.
# الاستعمال من جذر المستودع: zsh evidence/T-10.1/run-rest.sh [اسم خطوة ...]
unfunction node npm npx corepack 2>/dev/null
cd "${0:A:h}/../.." || exit 1
E=evidence/T-10.1
ONLY=("$@")
[[ ${#ONLY} -eq 0 ]] && echo "tree $(git rev-parse --short HEAD) $(date '+%Y-%m-%d %H:%M') (+ شجرة العمل)" > $E/rest-steps.txt
step() {
  local name=$1 limit=$2; shift 2
  if [[ ${#ONLY} -gt 0 && ${ONLY[(Ie)$name]} -eq 0 ]]; then return; fi
  local t0=$(date +%s)
  perl -e 'alarm shift; exec @ARGV' $limit "$@" > $E/$name.txt 2>&1
  echo "$name exit=$? $(( $(date +%s) - t0 ))s" >> $E/rest-steps.txt
}
step build 600 npm run build
step pending-chromium 1500 node $E/pending/chromium-check.mjs chrome edge brave
step pending-firefox 1200 node $E/pending/firefox-check.mjs
step perf 3600 node tests/content/browser/perf-check.mjs chrome edge brave firefox --out $E/perf.json
step axe 1800 node tests/shared/ui/browser/axe-check.mjs chrome edge brave firefox --out $E/axe.json
step connections-check 1500 node tests/core/connections/browser/connections-check.mjs chrome edge brave firefox --out-dir $E/pi1/connections-check
step token-check 1500 node tests/modules/d/token/browser/token-check.mjs chrome edge brave firefox --out-dir $E/pi1/token-check
step exec-check 1500 node tests/modules/f/execution/browser/exec-check.mjs chrome edge brave firefox --out-dir $E/pi1/exec-check
[[ ${#ONLY} -eq 0 ]] && echo done >> $E/rest-steps.txt

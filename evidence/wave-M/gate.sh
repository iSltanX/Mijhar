#!/bin/zsh
# بوابة الموجة M (AD-34) على شجرة الفرع الملتزمة، متسلسلة: الطقم كاملًا مرة، والبناء والحزم وفحصها وإعادة بنائها من حزمة المصدر، وweb-ext lint،
# والتحميل في الأربعة، وتدقيق الشبكة (الساكن والحي ومضيفات المزوّدين الثلاثة)، والمزوّدون الثلاثة في الأربعة، وقناة البلاغ، والاختصارات وزر Firefox،
# والنسبة في «حول»، ومطابقة PRIVACY.md والإشعارات لمصادرها. كل خطوة في evidence/wave-M/gate/<الخطوة>.txt، وسجلها في gate/steps.txt.
# الاستعمال من جذر المستودع: zsh evidence/wave-M/gate.sh
unfunction node npm npx corepack 2>/dev/null
cd "${0:A:h}/../.." || exit 1
G=evidence/wave-M/gate
mkdir -p $G
ALL=(chrome edge brave firefox)
echo "tree $(git rev-parse --short HEAD) $(date '+%Y-%m-%d %H:%M') · dirty=$(git status --porcelain --untracked-files=no | wc -l | tr -d ' ')" > $G/steps.txt
step() {
  local name=$1 limit=$2; shift 2
  local t0=$(date +%s)
  perl -e 'alarm shift; exec @ARGV' $limit "$@" > $G/$name.txt 2>&1
  echo "$name exit=$? $(( $(date +%s) - t0 ))s" >> $G/steps.txt
}
step tsc 600 npx tsc --noEmit -p .
step vitest 1200 npx vitest run
step build 600 npm run build
step notices 120 node scripts/notices.mjs --check
step privacy 120 node scripts/privacy.mjs --check
step package 600 node scripts/package.mjs
step package-check 300 node scripts/package.mjs --check
step web-ext-lint 300 npm run lint:firefox
step reproduce 900 zsh evidence/wave-M/reproduce.sh
step load-check 600 node scripts/load-check.mjs $ALL
step network-static 600 node scripts/network-audit.mjs static --out-dir $G/network
step network-dynamic 1200 node scripts/network-audit.mjs dynamic chrome edge brave --out-dir $G/network
step network-providers 600 node scripts/network-audit.mjs providers --out-dir $G/network
step provider-check 1500 node tests/modules/e/provider/browser/provider-check.mjs $ALL --out-dir $G/provider-check
step openai-check 1500 node tests/modules/e/provider/browser/openai-check.mjs $ALL --out-dir $G/openai-check
step gemini-check 1500 node tests/modules/e/provider/gemini-browser-check.mjs $ALL --out-dir $G/gemini-check
step report-check 900 node evidence/T-10.2/report-check.mjs $ALL
step shortcuts 600 node evidence/T-10.2/shortcuts-check.mjs $ALL
step action-firefox 300 node evidence/T-10.2/action-check-firefox.mjs
step attribution 600 node evidence/wave-M/attribution-check.mjs $ALL
echo done >> $G/steps.txt

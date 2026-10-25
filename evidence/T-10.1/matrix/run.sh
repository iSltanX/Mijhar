#!/bin/zsh
# مصفوفة TEST-BROW-01 (T-10.1، MJ26): كل فحص متصفح قائم في المستودع يُعاد على الحزمة المبنية من الشجرة الحالية، في Chrome وEdge وBrave
# وFirefox 158 حيث يدعمه الفحص. الخطوات متسلسلة (المتصفحات والمنافذ لا تُشارَك)، ولكل خطوة مهلة، ومخرجها في matrix/<الخطوة>.txt
# وملفات JSON في matrix/<الخطوة>/ حيث يقبل الفحص --out-dir. والفحوص التي تكتب في مجلد دليل تاريخي ثابت (wave-C وMJ9 وwelcome-help)
# تُشغَّل كما هي ثم يُعاد ذلك المجلد إلى نسخته الملتزمة، فلا يتغير دليل سابق، ويبقى مخرجها النصي هنا.
# الاستعمال من جذر المستودع بعد npm run build: zsh evidence/T-10.1/matrix/run.sh [اسم خطوة ...]
unfunction node npm npx corepack 2>/dev/null
cd "${0:A:h}/../../.." || exit 1
M=evidence/T-10.1/matrix
ONLY=("$@")
[[ ${#ONLY} -eq 0 ]] && echo "tree $(git rev-parse --short HEAD) $(date '+%Y-%m-%d %H:%M')" > $M/steps.txt
step() {
  local name=$1 limit=$2; shift 2
  if [[ ${#ONLY} -gt 0 && ${ONLY[(Ie)$name]} -eq 0 ]]; then return; fi
  local t0=$(date +%s)
  perl -e 'alarm shift; exec @ARGV' $limit "$@" > $M/$name.txt 2>&1
  local code=$?
  echo "$name exit=$code $(( $(date +%s) - t0 ))s" >> $M/steps.txt
}
ALL=(chrome edge brave firefox)
CHROMIUM=(chrome edge brave)

# التحميل والاتصالات والمزوّدون الثلاثة (بوابة L كما هي على الشيفرة الحالية)
step load-check 600 node scripts/load-check.mjs $ALL
step provider-check 1500 node tests/modules/e/provider/browser/provider-check.mjs $ALL --out-dir $M/provider-check
step openai-check 1500 node tests/modules/e/provider/browser/openai-check.mjs $ALL --out-dir $M/openai-check
step gemini-check 1500 node tests/modules/e/provider/gemini-browser-check.mjs $ALL --out-dir $M/gemini-check
step model-field-check 1500 node tests/modules/e/provider/browser/model-field-check.mjs $ALL --out-dir $M/model-field-check
step sim-check 900 node tests/modules/e/provider/browser/sim-check.mjs --out-dir $M/sim-check
step copy-prompt-chromium 1500 node tests/modules/e/browser/copy-prompt-check.mjs $CHROMIUM --out-dir $M/copy-prompt-chromium
step copy-prompt-firefox 900 node tests/modules/e/browser/copy-prompt-check.mjs firefox --out-dir $M/copy-prompt-firefox
step connections-check 1500 node tests/core/connections/browser/connections-check.mjs $ALL --out-dir $M/connections-check
step token-check 1500 node tests/modules/d/token/browser/token-check.mjs $ALL --out-dir $M/token-check
step exec-check 1500 node tests/modules/f/execution/browser/exec-check.mjs $ALL --out-dir $M/exec-check
step builder-check 1500 node tests/modules/e/browser/builder-check.mjs $ALL --out-dir $M/builder-check
step templates-check 1500 node tests/modules/e/browser/templates-check.mjs $ALL --out-root $M/templates-check
step built-check 600 node tests/core/guardrails/built-check.mjs --out-dir $M/built-check
step fonts-check 900 node tests/shared/ui/browser/fonts-check.mjs $ALL --out $M/fonts-check.json

# تكامل الوحدات على الحزمة المشحونة نفسها
step mj7-extension 1200 node tests/modules/a/browser/extension-run.mjs $ALL --out $M/mj7-extension.json
step mj8-integration 1200 node tests/modules/browser/integration.mjs $ALL --out-dir $M/mj8-integration
step mj10-integration 1200 node tests/modules/browser/mj10-integration.mjs $ALL --out-dir $M/mj10-integration
step mj11-integration 1200 node tests/modules/d/browser/mj11-integration.mjs $ALL --out-dir $M/mj11-integration
for b in $ALL; do step mj12-$b 900 node tests/modules/g/browser/mj12-check.mjs $b --out-dir $M/mj12-$b; done
for b in $ALL; do step mj13-$b 900 node tests/modules/g/browser/mj13-check.mjs $b --out-dir $M/mj13-$b; done
for b in $CHROMIUM; do step background-api-$b 900 node tests/modules/h/browser/background-api-check.mjs $b --out-dir $M/background-api-$b; done
step wave-c-integration 1200 node evidence/wave-C/integration-check.mjs $ALL
step mj9-integration 1200 node evidence/MJ9/integration-check.mjs $ALL
step welcome-help 900 node evidence/wave-G/welcome-help/browser-check.mjs $CHROMIUM

# الوحدات منفردة: شيفرة الوحدة كما تُشحن في حزمة اختبار على عينات GitHub الحقيقية المحفوظة
step mj7-bundle 1500 node tests/modules/a/browser/bundle-run.mjs $ALL --out $M/mj7-bundle.json
step direction 1200 node tests/modules/a/direction/browser/run.mjs $ALL --out-dir $M/direction
step b-card 1200 node tests/modules/b/card/browser/run.mjs $ALL --out-dir $M/b-card
step b-access 1200 node tests/modules/b/access/browser/run.mjs $ALL --out-dir $M/b-access
step b-search 1200 node tests/modules/b/search/browser/run.mjs $ALL --out-dir $M/b-search
step b-tours 1200 node tests/modules/b/tours/browser/run.mjs $ALL --out-dir $M/b-tours
step c-ui 1200 node tests/modules/c/ui/browser/run.mjs $ALL --out-dir $M/c-ui
step c-model-manager 1200 node tests/modules/c/model-manager/browser/run.mjs $CHROMIUM --out-dir $M/c-model-manager
step d-modules 1200 node tests/modules/d/browser/run.mjs $ALL --out-dir $M/d-modules
step f-composer 1200 node tests/modules/f/composer/browser/run.mjs $ALL --out-dir $M/f-composer
step f-template 1200 node tests/modules/f/template/browser/run.mjs $ALL --out-dir $M/f-template
step ui-host 1500 node tests/core/ui-host/browser/run.mjs $ALL --out $M/ui-host
step storage 1200 node tests/core/storage/browser/run.mjs $ALL --out $M/storage

# تدقيق الشبكة: الساكن، والديناميكي لمسار الترجمة، وعزل المحوّلات
step network-static 600 node scripts/network-audit.mjs static --out-dir $M/network
step network-dynamic 1200 node scripts/network-audit.mjs dynamic $CHROMIUM --out-dir $M/network
step network-providers 600 node scripts/network-audit.mjs providers --out-dir $M/network

# الأدلة التاريخية التي تكتبها بعض الفحوص في مواضع ثابتة تُعاد إلى نسختها الملتزمة
if [[ ${#ONLY} -eq 0 ]]; then
  git checkout -- evidence/wave-C evidence/MJ9 evidence/wave-G/welcome-help 2>/dev/null
  git clean -fdq -- evidence/wave-C evidence/MJ9 evidence/wave-G/welcome-help 2>/dev/null
  echo done >> $M/steps.txt
fi

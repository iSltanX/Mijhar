#!/bin/zsh
# بوابة الموجة L على الشجرة المجمّعة (integration/mj-L): الخطوات متسلسلة (المتصفحات والمنافذ لا تُشارَك)، ومخرج كل خطوة في gate/<الخطوة>.txt.
# الاستعمال من جذر المستودع: zsh evidence/wave-L/gate/run.sh
unfunction node npm npx corepack 2>/dev/null; hash -r
cd "$(git rev-parse --show-toplevel)" || exit 1
G=evidence/wave-L/gate
echo "tree $(git rev-parse --short HEAD) main-ahead=$(git rev-list --count HEAD..main)" > $G/steps.txt
step() {
  local name=$1; shift
  local t0=$(date +%s)
  "$@" > $G/$name.txt 2>&1
  local code=$?
  echo "$name exit=$code $(( $(date +%s) - t0 ))s" >> $G/steps.txt
}
step build npm run build
step typecheck npx tsc --noEmit -p .
step vitest-gate npx vitest run tests/modules/e/provider tests/modules/e/context/openai-key.test.ts tests/modules/e/context/api-binding.test.ts tests/modules/e/wave-l-crossing.test.tsx tests/modules/e/wave-i-crossing.test.tsx tests/modules/d/analysis tests/core/connections tests/modules/e/copy-prompt tests/modules/c/network-audit tests/core/ui-host/manifest.test.ts tests/core/guardrails
step ad28 npx vitest run tests/modules/e/context/bundle-golden.test.ts --reporter=verbose
step vitest-full npx vitest run
step web-ext-lint npx web-ext lint --source-dir dist/firefox
step provider-isolation-run node scripts/network-audit.mjs providers --out-dir $G
step static-audit-run node scripts/network-audit.mjs static --out-dir $G
step load-check node scripts/load-check.mjs chrome edge brave firefox
step provider-check node tests/modules/e/provider/browser/provider-check.mjs chrome edge brave firefox --out-dir $G
step openai-check node tests/modules/e/provider/browser/openai-check.mjs chrome edge brave firefox --out-dir $G
step gemini-check node tests/modules/e/provider/gemini-browser-check.mjs chrome edge brave firefox --out-dir $G
step model-field-check node tests/modules/e/provider/browser/model-field-check.mjs chrome edge brave firefox --out-dir $G
step copy-prompt-chromium node tests/modules/e/browser/copy-prompt-check.mjs chrome edge brave --out-dir $G/copy-prompt-chromium
step copy-prompt-firefox node tests/modules/e/browser/copy-prompt-check.mjs firefox --out-dir $G/copy-prompt-firefox
step connections-check node tests/core/connections/browser/connections-check.mjs chrome edge brave firefox --out-dir $G
step sim-check node tests/modules/e/provider/browser/sim-check.mjs --out-dir $G
step firefox-native node $G/firefox-native-consent/check.mjs
echo done >> $G/steps.txt

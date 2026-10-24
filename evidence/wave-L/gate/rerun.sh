#!/bin/zsh
# إعادة ما يمسّه تعديل CSS في ModelField.tsx بعد البوابة (حزمة الإعدادات وحدها؛ لا تغيير في DOM ولا منطق): الخطوات متسلسلة.
unfunction node npm npx corepack 2>/dev/null; hash -r
cd "$(git rev-parse --show-toplevel)" || exit 1
G=evidence/wave-L/gate/rerun
mkdir -p $G
echo "tree $(git rev-parse --short HEAD)" > $G/steps.txt
step() { local name=$1; shift; local t0=$(date +%s); "$@" > $G/$name.txt 2>&1; echo "$name exit=$? $(( $(date +%s) - t0 ))s" >> $G/steps.txt; }
step build npm run build
step typecheck npx tsc --noEmit -p .
step vitest-provider npx vitest run tests/modules/e/provider tests/modules/e/wave-l-crossing.test.tsx tests/core/guardrails tests/shared
step web-ext-lint npx web-ext lint --source-dir dist/firefox
step provider-isolation-run node scripts/network-audit.mjs providers --out-dir $G
step static-audit-run node scripts/network-audit.mjs static --out-dir $G
step load-check node scripts/load-check.mjs chrome edge brave firefox
step model-field-check node tests/modules/e/provider/browser/model-field-check.mjs chrome edge brave firefox --out-dir $G
echo done >> $G/steps.txt

# -*- coding: utf-8 -*-
# تطفير ضوابط MJ22: كل طفرة تعطّل ضابطًا واحدًا، ثم تُشغَّل اختباراته، ويُعاد الملف كما كان. الطفرة «قُتلت» إن سقط اختبار.
import io, subprocess, sys, os
ROOT = sys.argv[1]
OUT = sys.argv[2]
M = [
 ('M1 موافقة النطاق بلا isTrustedActivation', 'src/modules/f/execution/ExecutionPath.tsx',
  "    if (!isTrustedActivation(event)) {\n      event.preventDefault();\n      return;\n    }\n    if (stage.step === 'scope') setStage",
  "    if (stage.step === 'scope') setStage",
  ['tests/modules/f/execution/path.test.tsx', 'tests/shared/user-activation.test.ts']),
 ('M2 «نفّذ» بلا isTrustedActivation', 'src/modules/f/execution/ExecutionPath.tsx',
  "if (!isTrustedActivation(event) || stage.step !== 'scope' || !stage.approved) return;",
  "if (stage.step !== 'scope' || !stage.approved) return;",
  ['tests/modules/f/execution/path.test.tsx', 'tests/shared/user-activation.test.ts']),
 ('M3 «نفّذ» بلا موافقة', 'src/modules/f/execution/ExecutionPath.tsx',
  "if (!isTrustedActivation(event) || stage.step !== 'scope' || !stage.approved) return;",
  "if (!isTrustedActivation(event) || stage.step !== 'scope') return;",
  ['tests/modules/f/execution/path.test.tsx']),
 ('M4 الخلفية تقبل التنفيذ من سكربت المحتوى', 'src/modules/f/execution/service.ts',
  "if (!fromExtensionPage) return notRun(",
  "if (false && !fromExtensionPage) return notRun(",
  ['tests/modules/f/execution/service.test.ts']),
 ('M5 لا مقارنة بين رمزي القراءة والكتابة', 'src/modules/f/execution/service.ts',
  "if (readToken && readToken === token) {",
  "if (false && readToken === token) {",
  ['tests/modules/f/execution/service.test.ts']),
 ('M6 عميل القراءة برمز الكتابة', 'src/background/main.ts',
  "const token = tokens ? async () => (await tokens.read())?.token ?? null : undefined;",
  "const token = writeToken ? async () => (await writeToken.read())?.token ?? null : undefined;",
  ['tests/modules/f/execution/service.test.ts', 'tests/core/guardrails/static.test.ts']),
 ('M7 الخطة بلا تحقق من المسار', 'src/core/guardrails/write-scope.ts',
  "  const pathIssue = pathProblem(p.path);\n  if (pathIssue) return fail(pathIssue);",
  "",
  ['tests/core/guardrails/write-scope.test.ts', 'tests/modules/f/execution/service.test.ts']),
 ('M8 البرومبت بلا حدود للأجزاء', 'src/modules/e/prompt-templates/render.ts',
  "spec.heading, bounded(part.body));",
  "spec.heading, part.body);",
  ['tests/core/guardrails/injection.test.tsx', 'tests/modules/e/prompt-templates/prompts.test.ts']),
 ('M9 الحدود بلا إبطال التزوير', 'src/core/guardrails/boundaries.ts',
  "lines.map(neutralize)",
  "lines.map((l) => l)",
  ['tests/core/guardrails/injection.test.tsx']),
 ('M10 download-prompt بلا isTrustedActivation', 'src/modules/e/copy-prompt/view.tsx',
  "onClick={(event) => isTrustedActivation(event) && props.onDownload()}",
  "onClick={() => props.onDownload()}",
  ['tests/core/guardrails/download-trust.test.tsx', 'tests/shared/user-activation.test.ts']),
 ('M11 builder-download بلا isTrustedActivation', 'src/modules/e/builder/view.tsx',
  "onClick={(event) => isTrustedActivation(event) && download()}",
  "onClick={() => download()}",
  ['tests/core/guardrails/download-trust.test.tsx', 'tests/shared/user-activation.test.ts']),
 ('M12 حفظ رمز الكتابة بلا isTrustedActivation', 'src/modules/f/execution/WriteTokenSection.tsx',
  "    if (!isTrustedActivation(event)) return;\n    const field = input.current;",
  "    const field = input.current;",
  ['tests/modules/f/execution/write-token.test.tsx', 'tests/shared/user-activation.test.ts']),
 ('M13 بوابة الكتابة بلا تحقق من الخطة', 'src/core/guardrails/write-gate.ts',
  "  if (!check.ok) throw new Error(`خطة كتابة غير صالحة: ${check.reason}`);",
  "",
  ['tests/core/guardrails/write-scope.test.ts']),
]
env = dict(os.environ)
lines = []
killed = 0
for name, path, old, new, tests in M:
    full = os.path.join(ROOT, path)
    orig = io.open(full, encoding='utf-8').read()
    if orig.count(old) != 1:
        lines.append(f'✗ {name}: لم يُطبَّق (النص غير موجود مرة واحدة)')
        continue
    io.open(full, 'w', encoding='utf-8').write(orig.replace(old, new, 1))
    try:
        r = subprocess.run(['npx', 'vitest', 'run', *tests], cwd=ROOT, capture_output=True, text=True, env=env)
        out = r.stdout + r.stderr
        failed = [l.strip() for l in out.splitlines() if l.strip().startswith('×')][:3]
        ok = r.returncode != 0
        killed += ok
        lines.append(f"{'✓ قُتلت' if ok else '✗ نجت'}: {name} — {path} — اختبارات ساقطة: {' | '.join(failed) if failed else '—'}")
    finally:
        io.open(full, 'w', encoding='utf-8').write(orig)
lines.append(f'المجموع: {killed}/{len(M)} طفرة قُتلت')
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('\n'.join(lines))

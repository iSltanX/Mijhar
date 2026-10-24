#!/usr/bin/env python3
"""تحقق للقراءة فقط من ثبات المصدر الأصلي وتطابق النسخة المعزولة."""
import argparse
import hashlib
import json
import pathlib
import subprocess
from datetime import datetime
from zoneinfo import ZoneInfo

parser = argparse.ArgumentParser()
parser.add_argument('--root', default='/Volumes/iSltanXx/Projects/Brave/Mijhar')
parser.add_argument('--baseline', default=str(pathlib.Path(__file__).with_name('baseline-sha256.json')))
parser.add_argument('--copy', default='/private/tmp/mijhar-independent-audit-q7h9_5vz/source')
parser.add_argument('--output')
args = parser.parse_args()
root = pathlib.Path(args.root)
copy = pathlib.Path(args.copy)
baseline = json.loads(pathlib.Path(args.baseline).read_text(encoding='utf-8'))

def git(*arguments):
    return subprocess.check_output(['git', *arguments], cwd=root).decode()

drift = []
for rel, digest in baseline.items():
    file = root / rel
    if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != digest:
        drift.append(rel)
production = list(filter(None, git('ls-files', '-z', 'src', 'scripts', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts').split('\0')))
copy_drift = [rel for rel in production if not (copy / rel).is_file() or (copy / rel).read_bytes() != (root / rel).read_bytes()]
data = {
    'checkedAt': datetime.now(ZoneInfo('Asia/Riyadh')).isoformat(),
    'branch': git('branch', '--show-current').strip(),
    'commit': git('rev-parse', 'HEAD').strip(),
    'statusPorcelain': git('status', '--porcelain=v1', '--untracked-files=all'),
    'baselineHashedFiles': len(baseline),
    'changedSinceStart': drift,
    'productionFilesComparedToIsolatedCopy': len(production),
    'isolatedSourceMismatch': copy_drift,
    'worktrees': git('worktree', 'list', '--porcelain'),
}
result = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
if args.output:
    output = pathlib.Path(args.output).resolve()
    roots = [pathlib.Path(line[9:]).resolve() for line in data['worktrees'].splitlines() if line.startswith('worktree ')]
    if any(output.is_relative_to(item) for item in roots):
        raise SystemExit('يجب أن تكون مخرجات التحقق خارج جميع worktrees')
    output.write_text(result, encoding='utf-8')
print(result)
assert data['branch'] == 'main'
assert data['commit'] == '6e333faa7a063042e0d541caca810dd48fef748e'
assert not data['statusPorcelain']
assert not drift
assert not copy_drift

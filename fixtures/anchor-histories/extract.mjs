#!/usr/bin/env node
// يستخرج تواريخ الملفات التسعة التي قاسها T-0.4 (AC-S4.4) من نسخ git --bare محلية، لقياس محرك المرساة (T-8.3) عليها نفسها.
// التاريخ من HEAD بتتبع إعادة التسمية (--follow) كما في scripts/spikes/t04-reanchor.mjs، ثم يُقصّ ما قبل «رأس الملف» المسجَّل في
// evidence/T-0.4/raw/reanchor-*.json (آخر التزام مسّ الملف وقت القياس) فيتكرر التاريخ نفسه وإن تقدّمت المستودعات بعده؛ ولا يبدأ
// السجل من الرأس نفسه لأن --follow من التزام بعينه قد يُسقط مراجعات (flask/README.md: 8 بدل 10). ويأخذ أول 46 مراجعة.
// المخرج JSON بجدول نصوص لكل ملف (المراجعة قائمة أرقام في الجدول)؛ null لمراجعة حُذف فيها الملف.
// الاستعمال: node fixtures/anchor-histories/extract.mjs --clones <dir-with-*.git> --out <file.json> [--only <repo>/<path>]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};
const clones = opt('--clones');
const out = opt('--out');
const only = opt('--only');
if (!clones || !out) throw new Error('الاستعمال: --clones <dir> --out <file.json> [--only repo/path]');

const MAX_REVS = 40;
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const files = [];
for (const name of fs.readdirSync(path.join(ROOT, 'evidence/T-0.4/raw')).filter((f) => f.startsWith('reanchor-'))) {
  for (const r of JSON.parse(fs.readFileSync(path.join(ROOT, 'evidence/T-0.4/raw', name), 'utf8')).results) files.push({ repo: r.repo, path: r.path, head: r.head });
}

const result = [];
for (const file of files) {
  if (only && only !== `${file.repo}/${file.path}`) continue;
  const dir = path.join(clones, `${file.repo}.git`);
  const git = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', maxBuffer: 256 * 2 ** 20 });
  const log = git('log', '--follow', '--format=@%H', '--name-only', 'HEAD', '--', file.path).trim().split('\n');
  const revs = [];
  for (const line of log) {
    if (line.startsWith('@')) revs.push({ sha: line.slice(1), path: null });
    else if (line && revs.length && !revs.at(-1).path) revs.at(-1).path = line;
  }
  const from = revs.findIndex((r) => r.sha.startsWith(file.head));
  if (from === -1) throw new Error(`${file.repo}/${file.path}: رأس T-0.4 ${file.head} ليس في التاريخ`);
  revs.splice(0, from);
  const table = [];
  const ids = new Map();
  const revisions = revs
    .filter((r) => r.path)
    .slice(0, MAX_REVS + 6)
    .map((rev) => {
      let text;
      try {
        text = git('show', `${rev.sha}:${rev.path}`);
      } catch {
        return { sha: rev.sha, path: rev.path, lines: null };
      }
      const lines = text.split('\n').map((l) => {
        if (!ids.has(l)) {
          ids.set(l, table.length);
          table.push(l);
        }
        return ids.get(l);
      });
      return { sha: rev.sha, path: rev.path, lines };
    });
  result.push({ repo: file.repo, path: file.path, head: file.head, revisions, table });
  console.error(`${file.repo}/${file.path}: ${revisions.length} مراجعة، ${table.length} سطرًا مختلفًا`);
}
fs.writeFileSync(out, JSON.stringify({ source: 'evidence/T-0.4/raw/reanchor-*.json (رأس كل ملف)', maxRevisions: MAX_REVS, files: result }) + '\n');

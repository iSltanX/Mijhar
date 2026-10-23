#!/usr/bin/env node
// تجربة T-0.4 (MJ4): محاكاة إعادة تثبيت مرساة السطر على تواريخ ملفات حقيقية (AC-S4.4).
// المرساة كما في T-8.3: نص السطر وسياقه ±2. لكل مراجعة قديمة من تاريخ الملف تُؤخذ كل أسطرها غير الفارغة مراسيَ،
// ويُعاد تثبيتها على مراجعة أحدث (التالية مباشرة، والخامسة بعدها، ورأس الفرع) بالنتائج الأربع:
//   A مطابق: السطر نفسه بنصه وسياقه في رقمه نفسه.
//   B منزاح بمرشح وحيد: ليس في رقمه، ويوجد موضع واحد فقط يطابق نصه وسياقه.
//   C ملتبس: أكثر من موضع يطابق النص والسياق.
//   D متغيّر: لا موضع يطابق النص والسياق معًا (ويُفصَّل: النص وحده باقٍ في موضع واحد، أو أكثر، أو زال).
// الاستعمال: node scripts/spikes/t04-reanchor.mjs <bare-repo> <path> [<path> ...] --out <file.json>
import { execFileSync } from 'node:child_process';
import { writeJson } from './lib.mjs';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
const [repoDir, ...paths] = args;

const git = (...a) => execFileSync('git', ['-C', repoDir, ...a], { encoding: 'utf8', maxBuffer: 256 * 2 ** 20 });
const normalize = (line) => line.replace(/\r$/, '').replace(/\s+$/, '');
const lineKind = (text) => (text.trim() === '' ? 'blank' : text.trim().length <= 3 ? 'short' : 'normal');

function history(path) {
  // أحدث أولًا؛ مع تتبع إعادة التسمية، ومسار الملف عند كل التزام.
  const out = git('log', '--follow', '--format=@%H', '--name-only', '--', path).trim().split('\n');
  const revs = [];
  for (const line of out) {
    if (line.startsWith('@')) revs.push({ sha: line.slice(1), path: null });
    else if (line && revs.length && !revs.at(-1).path) revs.at(-1).path = line;
  }
  return revs.filter((r) => r.path);
}

function content(rev) {
  try {
    return git('show', `${rev.sha}:${rev.path}`).split('\n').map(normalize);
  } catch {
    return null; // الملف محذوف في هذا الالتزام
  }
}

const context = (lines, i) => [-2, -1, 1, 2].map((d) => lines[i + d] ?? '\u0000').join('\n');

function reanchor(oldLines, newLines) {
  const counts = { A: 0, B: 0, C: 0, D: 0, D_textUnique: 0, D_textMulti: 0, D_textGone: 0 };
  const byKind = {};
  // فهرس النص ← المواضع في المراجعة الجديدة.
  const index = new Map();
  newLines.forEach((t, i) => {
    if (!index.has(t)) index.set(t, []);
    index.get(t).push(i);
  });
  oldLines.forEach((text, i) => {
    const kind = lineKind(text);
    if (kind === 'blank') return;
    const ctx = context(oldLines, i);
    const sameText = index.get(text) ?? [];
    const strict = sameText.filter((k) => context(newLines, k) === ctx);
    let result;
    if (newLines[i] === text && context(newLines, i) === ctx) result = 'A';
    else if (strict.length === 1) result = 'B';
    else if (strict.length > 1) result = 'C';
    else result = 'D';
    counts[result] += 1;
    if (result === 'D') counts[sameText.length === 1 ? 'D_textUnique' : sameText.length > 1 ? 'D_textMulti' : 'D_textGone'] += 1;
    byKind[kind] ??= { A: 0, B: 0, C: 0, D: 0 };
    byKind[kind][result] += 1;
  });
  return { counts, byKind };
}

const add = (acc, r) => {
  for (const [k, v] of Object.entries(r.counts)) acc.counts[k] = (acc.counts[k] ?? 0) + v;
  for (const [kind, c] of Object.entries(r.byKind)) {
    acc.byKind[kind] ??= { A: 0, B: 0, C: 0, D: 0 };
    for (const [k, v] of Object.entries(c)) acc.byKind[kind][k] += v;
  }
};

const MAX_REVS = 40;
const results = [];
for (const path of paths) {
  const revs = history(path).slice(0, MAX_REVS + 6);
  const head = revs[0];
  const headLines = content(head);
  const file = { repo: repoDir.split('/').pop(), path, revisions: revs.length, head: head.sha.slice(0, 10), gaps: {} };
  const cache = new Map();
  const get = (rev) => {
    if (!cache.has(rev.sha)) cache.set(rev.sha, content(rev));
    return cache.get(rev.sha);
  };
  for (const [gap, label] of [[1, 'التالية'], [5, 'الخامسة بعدها'], ['head', 'رأس الفرع']]) {
    const acc = { label, pairs: 0, counts: {}, byKind: {} };
    for (let i = 1; i < Math.min(revs.length, MAX_REVS); i += 1) {
      const older = revs[i];
      const newer = gap === 'head' ? head : revs[i - gap];
      if (!newer || newer.sha === older.sha) continue;
      const oldLines = get(older);
      const newLines = gap === 'head' ? headLines : get(newer);
      if (!oldLines || !newLines) continue;
      add(acc, reanchor(oldLines, newLines));
      acc.pairs += 1;
    }
    file.gaps[gap] = acc;
  }
  results.push(file);
  const g = file.gaps[1].counts;
  console.error(`${file.repo}/${path}: ${file.revisions} مراجعة · التالية A=${g.A} B=${g.B} C=${g.C} D=${g.D}`);
}
if (outFile) writeJson(outFile, { method: 'نص السطر بعد حذف المسافات الختامية + سياق ±2 (أربعة أسطر)؛ الأسطر الفارغة مستبعدة من المراسي', maxRevisionsPerFile: MAX_REVS, results });
else console.log(JSON.stringify(results, null, 2));

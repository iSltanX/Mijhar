#!/usr/bin/env node
// تجربة T-0.4 (MJ4): محاكاة إعادة تثبيت مرساة السطر على تواريخ ملفات حقيقية (AC-S4.4).
// المرساة كما في T-8.3: نص السطر وسياقه ±2. لكل مراجعة قديمة من تاريخ الملف تُؤخذ كل أسطرها غير الفارغة مراسيَ،
// ويُعاد تثبيتها على مراجعة أحدث (التالية مباشرة، والخامسة بعدها، ورأس الفرع) بالنتائج الأربع:
//   A مطابق: السطر نفسه بنصه وسياقه في رقمه نفسه.
//   B منزاح بمرشح وحيد: ليس في رقمه، ويوجد موضع واحد فقط يطابق نصه وسياقه.
//   C ملتبس: أكثر من موضع يطابق النص والسياق.
//   D متغيّر: لا موضع يطابق النص والسياق معًا (ويُفصَّل: النص وحده باقٍ في موضع واحد، أو أكثر، أو زال).
// وتُقارن كل نتيجة بالحقيقة الأرضية من git diff: هل A في موضعه فعلًا، وهل مرشح B هو السطر نفسه، وهل بين مرشحات C السطر الصحيح.
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

// الحقيقة الأرضية: ربط أرقام الأسطر غير المتغيرة بين المراجعتين من git diff -U0 (خوارزمية histogram).
// diff لا يكشف نقل الكتل، فالسطر المنقول يظهر محذوفًا ومضافًا.
function diffMap(older, newer, oldCount) {
  let out = '';
  try {
    out = git('diff', '-U0', '--no-color', '--diff-algorithm=histogram', `${older.sha}:${older.path}`, `${newer.sha}:${newer.path}`);
  } catch (e) {
    out = e.stdout ?? '';
  }
  const map = new Array(oldCount).fill(null);
  let oldPos = 0;
  let shift = 0;
  for (const m of out.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm)) {
    const a = Number(m[1]);
    const b = m[2] === undefined ? 1 : Number(m[2]);
    const c = Number(m[3]);
    const d = m[4] === undefined ? 1 : Number(m[4]);
    const start = b === 0 ? a : a - 1; // أول سطر متغير (صفري الأساس)
    for (; oldPos < start && oldPos < oldCount; oldPos += 1) map[oldPos] = oldPos + shift;
    oldPos = start + b;
    shift = (d === 0 ? c : c - 1) + d - oldPos;
  }
  for (; oldPos < oldCount; oldPos += 1) map[oldPos] = oldPos + shift;
  return map;
}

const context = (lines, i) => [-2, -1, 1, 2].map((d) => lines[i + d] ?? '\u0000').join('\n');

function reanchor(oldLines, newLines, truth) {
  const counts = { A: 0, B: 0, C: 0, D: 0, D_textUnique: 0, D_textMulti: 0, D_textGone: 0 };
  const check = { A_ok: 0, A_bad: 0, B_ok: 0, B_wrongLine: 0, B_noDiffMatch: 0, C_containsTrue: 0, C_noTrue: 0, D_lineSurvived: 0, D_lineChanged: 0 };
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
    const t = truth[i];
    if (result === 'A') check[t === i ? 'A_ok' : 'A_bad'] += 1;
    else if (result === 'B') check[t == null ? 'B_noDiffMatch' : t === strict[0] ? 'B_ok' : 'B_wrongLine'] += 1;
    else if (result === 'C') check[t != null && strict.includes(t) ? 'C_containsTrue' : 'C_noTrue'] += 1;
    else check[t == null ? 'D_lineChanged' : 'D_lineSurvived'] += 1;
    if (result === 'D') counts[sameText.length === 1 ? 'D_textUnique' : sameText.length > 1 ? 'D_textMulti' : 'D_textGone'] += 1;
    byKind[kind] ??= { A: 0, B: 0, C: 0, D: 0 };
    byKind[kind][result] += 1;
  });
  return { counts, byKind, check };
}

const add = (acc, r) => {
  for (const [k, v] of Object.entries(r.counts)) acc.counts[k] = (acc.counts[k] ?? 0) + v;
  for (const [k, v] of Object.entries(r.check)) acc.check[k] = (acc.check[k] ?? 0) + v;
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
    const acc = { label, pairs: 0, counts: {}, check: {}, byKind: {} };
    for (let i = 1; i < Math.min(revs.length, MAX_REVS); i += 1) {
      const older = revs[i];
      const newer = gap === 'head' ? head : revs[i - gap];
      if (!newer || newer.sha === older.sha) continue;
      const oldLines = get(older);
      const newLines = gap === 'head' ? headLines : get(newer);
      if (!oldLines || !newLines) continue;
      add(acc, reanchor(oldLines, newLines, diffMap(older, newer, oldLines.length)));
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

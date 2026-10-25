#!/usr/bin/env node
// يلخّص مخرجات run.sh: لكل خطوة رمز خروجها ومدتها، وأسطر النتيجة («N/M» أو «اجتاز · فشل»)، وكل سطر فشل (✗) بنصه. ← summary.md في المجلد نفسه.
// لا يحكم بنفسه: ما فشل يُصنَّف في report.md بيد المنفّذ (خلل في المنتج، أو توقع قديم في الفحص، أو قيد بيئة).
// الاستعمال: node evidence/T-10.1/matrix/summarize.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const steps = fs
  .readFileSync(path.join(HERE, 'steps.txt'), 'utf8')
  .split('\n')
  .map((l) => /^(\S+) exit=(\d+) (\d+)s$/.exec(l))
  .filter(Boolean)
  .map(([, name, code, secs]) => ({ name, code: Number(code), secs: Number(secs) }));
const head = fs.readFileSync(path.join(HERE, 'steps.txt'), 'utf8').split('\n')[0];
const RESULT = /(\d+)\s*\/\s*(\d+)|(\d+)\s*اجتاز|اجتاز|المجموع|فحصًا|passed|failed/;
const lines = [`# ملخص مصفوفة TEST-BROW-01 — ${head}`, '', '| الخطوة | الخروج | المدة | النتيجة كما طبعها الفحص | أسطر الفشل |', '| :--- | :---: | ---: | :--- | :---: |'];
const failures = [];
for (const s of steps) {
  const file = path.join(HERE, `${s.name}.txt`);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const results = text
    .split('\n')
    .filter((l) => RESULT.test(l) && !l.trim().startsWith('✓') && !l.trim().startsWith('✗') && l.length < 220)
    .slice(-6)
    .map((l) => l.trim().replace(/\|/g, '/'));
  const failed = text.split('\n').filter((l) => /^\s*✗/.test(l));
  for (const f of failed) failures.push(`- \`${s.name}\`: ${f.trim().slice(0, 400)}`);
  lines.push(`| \`${s.name}\` | ${s.code === 0 ? '0' : `**${s.code}**`} | ${s.secs}s | ${results.join('<br>') || '—'} | ${failed.length || '—'} |`);
}
lines.push('', `**المجموع:** ${steps.length} خطوة، ${steps.filter((s) => s.code === 0).length} خرجت بـ0، و${steps.filter((s) => s.code !== 0).length} بغيره.`, '', '## أسطر الفشل كما طُبعت', '', ...(failures.length ? failures : ['لا شيء.']), '');
fs.writeFileSync(path.join(HERE, 'summary.md'), lines.join('\n'));
console.log(lines.slice(-failures.length - 4).join('\n'));

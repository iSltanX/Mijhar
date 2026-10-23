#!/usr/bin/env node
// يفحص سلامة data/*.json وملفات المراحل Docs/MJ/stages/*.md وDocs/MJ/waves.json، ومطابقة EXECUTION_PLAN.md للبيانات،
// وأن الملفات المولَّدة المتتبَّعة محدَّثة.
// الاستعمال: node tools/check.mjs          (فحص كامل؛ في النسخة الرئيسية)
//            node tools/check.mjs --data   (البيانات والمراحل فقط دون تقادم الملفات المولَّدة؛ لجلسات المراحل في worktree)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDerive, loadData, render, applyRegions } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataOnly = process.argv.includes('--data');
const D = loadDerive();
const data = loadData();
const { out, validation, cross } = render(data, D);
const errors = [...validation.errors, ...cross];

if (!dataOnly) {
  for (const [k, v] of Object.entries(out)) {
    if (k.startsWith('@')) continue;
    const p = path.join(ROOT, k);
    if (!fs.existsSync(p)) errors.push(`ملف مولَّد مفقود: ${k} (شغّل node tools/build.mjs)`);
    else if (fs.readFileSync(p, 'utf8') !== v) errors.push(`ملف مولَّد قديم أو عُدِّل يدويًا: ${k} (شغّل node tools/build.mjs)`);
  }
  const md = fs.readFileSync(path.join(ROOT, 'EXECUTION_PLAN.md'), 'utf8');
  if (applyRegions(md, out) !== md) errors.push('المناطق المولَّدة في EXECUTION_PLAN.md قديمة (شغّل node tools/build.mjs)');
}
if (!data.naming) errors.push('data/naming.json غير موجود');

const f = validation.facts;
console.log(`الوحدات ${f.modules}، الميزات ${f.features}، المهام ${f.tasks}، معايير القبول ${f.acceptance}، الاختبارات ${f.tests}، القرارات ${f.decisions}، الموانع ${f.blockers}، الفرضيات ${f.hypotheses}، المقترحات ${f.proposals}.`);
console.log(`أطول سلسلة اعتماديات: ${f.maxLevel + 1} مهام؛ لا دورات. المراحل ${data.mj.stages.length} في ${data.waves.waves.length} موجات؛ المجلد: ${data.mj.repo.isMain ? 'النسخة الرئيسية' : 'worktree على ' + data.mj.repo.branch}.`);
if (errors.length) {
  console.error(`\nفشل الفحص: ${errors.length} خطأ`);
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
console.log(dataOnly ? 'اجتاز فحص البيانات والمراحل.' : 'اجتاز الفحص: البيانات والمراحل سليمة، والوثيقة المرجعية مطابقة، والملفات المولَّدة محدَّثة.');

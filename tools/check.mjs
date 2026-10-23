#!/usr/bin/env node
// يفحص سلامة data/*.json، ومطابقة EXECUTION_PLAN.md للبيانات، وأن الملفات المولَّدة محدَّثة.
// الاستعمال: node tools/check.mjs   (رمز خروج غير صفري عند أي خطأ)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDerive, loadData, render, applyRegions } from './build.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = loadDerive();
const data = loadData();
const { out, validation, cross } = render(data, D);
const errors = [...validation.errors, ...cross];

// تقادم الملفات المولَّدة
for (const [k, v] of Object.entries(out)) {
  if (k.startsWith('@')) continue;
  const p = path.join(ROOT, k);
  if (!fs.existsSync(p)) errors.push(`ملف مولَّد مفقود: ${k} (شغّل node tools/build.mjs)`);
  else if (fs.readFileSync(p, 'utf8') !== v) errors.push(`ملف مولَّد قديم أو عُدِّل يدويًا: ${k} (شغّل node tools/build.mjs)`);
}
const md = fs.readFileSync(path.join(ROOT, 'EXECUTION_PLAN.md'), 'utf8');
if (applyRegions(md, out) !== md) errors.push('المناطق المولَّدة في EXECUTION_PLAN.md قديمة (شغّل node tools/build.mjs)');
if (!data.naming) errors.push('data/naming.json غير موجود');

const f = validation.facts;
console.log(`الوحدات ${f.modules}، الميزات ${f.features}، المهام ${f.tasks}، معايير القبول ${f.acceptance}، الاختبارات ${f.tests}، القرارات ${f.decisions}، الموانع ${f.blockers}، الفرضيات ${f.hypotheses}، المقترحات ${f.proposals}.`);
console.log(`أطول سلسلة اعتماديات: ${f.maxLevel + 1} مهام؛ لا دورات.`);
if (errors.length) {
  console.error(`\nفشل الفحص: ${errors.length} خطأ`);
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
}
console.log('اجتاز الفحص: البيانات سليمة، والوثيقة المرجعية مطابقة، والملفات المولَّدة محدَّثة.');

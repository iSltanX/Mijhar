#!/usr/bin/env node
// يولّد ملفات التخطيط وبيانات لوحة المتابعة من data/plan.json وdata/status.json وdata/naming.json وملفات المراحل Docs/MJ/.
// الاستعمال: node tools/build.mjs          (النسخة الرئيسية: يكتب الوثائق المتتبَّعة وdashboard/data.js)
//            node tools/build.mjs --sync   (أي مجلد: يجمع أحدث نسخة من كل مرحلة عبر الفروع ويكتب dashboard/data.js هنا وفي النسخة الرئيسية فقط)
//            node tools/build.mjs --dry    (يعيد المحتوى دون كتابة)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validatePlan, crossCheck } from './lib/validate.mjs';
import { discoverStages, loadWaves, validateMJ, tasksFromStages, repoInfo } from './lib/mj.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

export function loadDerive() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(read('dashboard/derive.js'), ctx);
  return ctx.PlanDerive;
}

export function loadData({ live = true } = {}) {
  const plan = JSON.parse(read('data/plan.json'));
  const statusFile = JSON.parse(read('data/status.json'));
  const naming = fs.existsSync(path.join(ROOT, 'data/naming.json')) ? JSON.parse(read('data/naming.json')) : null;
  const waves = loadWaves(ROOT);
  const mj = discoverStages({ cwd: ROOT, live });
  // حالات المهام مشتقة من جداول «حالة المهام» في ملفات المراحل (أحدث نسخة عبر الفروع)؛ لا تُكتب في status.json.
  const status = { ...statusFile, tasks: tasksFromStages(mj.stages) };
  return { plan, status, naming, mj, waves };
}

// حمولة الموجات والمراحل للوحة ولمنطق الاشتقاق المشترك (derive.js).
export function mjPayload(mj, waves) {
  return {
    waves,
    stages: mj.stages.map((s) => ({ id: s.id, file: s.file, header: s.header, tasks: s.tasks, log: s.log, delivered: s.delivered, sections: s.sections, source: s.source, branchExists: s.branchExists })),
    branches: mj.branches, tags: mj.tags, repo: { isMain: mj.repo.isMain, branch: mj.repo.branch, head: mj.repo.head, main: mj.repo.main }, generatedAt: mj.generatedAt,
  };
}

// ---------- أدوات Markdown ----------
const c = (id) => `\`${id}\``;
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const none = 'لا يوجد';
const joinAr = (xs) => (xs.length ? xs.join('، ') : none);
const table = (head, rows) => [`| ${head.join(' | ')} |`, `| ${head.map(() => ':---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
const banner = (asOf) => `> **ملف مولَّد** من \`data/plan.json\` و\`data/status.json\` بالأمر \`node tools/build.mjs\`؛ لا تحرّره يدويًا، وعدّل البيانات ثم أعد التوليد. تاريخ البيانات: \`${asOf}\`. لا يحوي هذا الملف أي تقدير زمني.`;

export function render({ plan, status, naming, mj, waves: mjWaves }, D) {
  const MJP = mjPayload(mj, mjWaves);
  const MV = D.mjView(plan, status, MJP);
  const ix = D.index(plan);
  const lv = D.levels(plan);
  const pdeps = D.phaseDeps(plan);
  const sum = D.summary(plan, status);
  const asOf = status.asOf;
  const phaseOf = (tid) => ix.phases[ix.tasks[tid].phase];
  const relFrom = (fromDir) => (p) => (fromDir ? path.posix.relative(fromDir, p) || path.posix.basename(p) : p);
  const tLink = (tid, fromDir = '') => `[${c(tid)}](${relFrom(fromDir)(phaseOf(tid).file)}#${tid})`;
  const pLink = (pid, fromDir = '', label) => `[${label || `المرحلة ${ix.phases[pid].num}`}](${relFrom(fromDir)(ix.phases[pid].file)})`;
  const decState = (d) => (d.status === 'approved' ? `معتمد: ${d.chosen}${d.chosenLabel ? ` — ${d.chosenLabel}` : ''}${d.decidedOn ? ` (${d.decidedOn}${d.decidedBy ? `، ${d.decidedBy}` : ''})` : ''}${d.reason ? `؛ السبب: ${d.reason}` : ''}` : 'معلق');
  const tState = (t) => D.taskState(plan, status, t);
  const xState = (x) => D.testState(plan, status, x);
  const modName = (code) => (code === 'CORE' ? 'البنية والتكامل' : `(${ix.modules[code].letter}) ${ix.modules[code].title}`);
  const gateText = (t) => (t.decisions.length ? t.decisions.map((g) => `${c(g.id)} (${D.GATE_LABELS[g.gate]})`).join('، ') : '—');
  const appText = (a) => (a ? ` _(ينطبق في: ${a.label}${a.orPending ? '' : `؛ ${a.options.join(' أو ')}`})_` : '');

  // موجات البدء: أطول مسار اعتماد
  const waves = {};
  for (const t of plan.tasks) (waves[lv[t.id]] ||= []).push(t.id);
  const phaseLevel = {};
  const plevel = (pid) => (phaseLevel[pid] ??= pdeps[pid].length ? Math.max(...pdeps[pid].map(plevel)) + 1 : 0);
  plan.phases.forEach((p) => plevel(p.id));
  const crit = D.criticalPath(plan);
  const validation = validatePlan(plan, status, D);
  validation.errors.push(...validateMJ(plan, mj, mjWaves));
  const cross = crossCheck(plan, read('EXECUTION_PLAN.md'));

  const out = {};

  // ================= ROADMAP.md =================
  {
    const L = [];
    L.push('# خريطة الطريق: المراحل وترتيبها واعتمادياتها', '', banner(asOf), '');
    L.push('## قاعدة الترتيب', '');
    L.push('- **لا جدول زمني:** لا أيام ولا أسابيع ولا مدد ولا مواعيد. تبدأ المهمة حين تُستوفى معايير قبول المهام التي تعتمد عليها فعلًا، ولا تنتظر مرحلة لا تدخل في اعتمادياتها.');
    L.push('- **المراحل تجميع للعرض:** الاعتماد الحقيقي بين المهام، ولذلك تتداخل المراحل؛ فمثلًا تبدأ `T-9.4` حين تكتمل `T-1.4` وحدها دون انتظار بقية مهام الوحدة (ح).');
    L.push('- **القرار المعلق يوقف ما يتصل به فقط:** «يوقف البدء» يوقف المهمة الحاملة وما يعتمد عليها؛ و«يوقف جزءًا» يترك الجزء المستقل يبدأ ويوقف الإغلاق. تفصيل القرارات في [`DECISIONS.md`](DECISIONS.md).');
    L.push('- **مهمتا التكامل** `T-10.1` و`T-10.2`: يجوز العمل الجزئي فيهما مبكرًا (اختبار كل وحدة فور اكتمالها، وتجهيز التوثيق)، واعتمادياتهما تحكم الإغلاق.');
    L.push(`- **النطاق:** ${plan.meta.scopeRule}`, '');

    L.push('## المراحل', '');
    L.push(table(['المرحلة', 'الهدف', 'المهام', 'تعتمد على المراحل', 'قرارات تمسّها', 'موضعها في الترتيب'], plan.phases.map((p) => {
      const ts = plan.tasks.filter((t) => t.phase === p.id);
      const decs = [...new Set(ts.flatMap((t) => t.decisions.map((g) => g.id)))];
      return [pLink(p.id, '', `${p.num}. ${p.title}`), p.goal, `${ts.length}: ${ts.map((t) => c(t.id)).join('، ')}`, pdeps[p.id].length ? pdeps[p.id].map((x) => `المرحلة ${ix.phases[x].num}`).join('، ') : 'لا شيء', decs.length ? decs.map(c).join('، ') : '—', `الطبقة ${phaseLevel[p.id]}`];
    })), '');
    L.push('«الطبقة» = أطول سلسلة من المراحل قبلها. المراحل في الطبقة نفسها تجري بالتوازي، وأي مهمة فيها تبدأ قبل ذلك متى اكتملت اعتمادياتها الخاصة.', '');

    L.push('## ترتيب المراحل واعتمادياتها', '');
    L.push('```mermaid', 'flowchart RL');
    for (const p of plan.phases) L.push(`    ${p.id}["المرحلة ${p.num}: ${p.short}"]`);
    for (const p of plan.phases) for (const d of pdeps[p.id]) L.push(`    ${d} --> ${p.id}`);
    L.push('```', '');
    const byLevel = {};
    plan.phases.forEach((p) => (byLevel[phaseLevel[p.id]] ||= []).push(p));
    L.push(Object.keys(byLevel).sort((a, b) => a - b).map((k) => `${Number(k) + 1}. ${byLevel[k].map((p) => pLink(p.id, '', `المرحلة ${p.num} (${p.short})`)).join(' و')}`).join('\n'), '');

    L.push('## موجات البدء على مستوى المهام', '');
    L.push('الموجة = طول أطول سلسلة اعتماديات قبل المهمة: أبكر موضع يمكن أن تبدأ فيه، لا موعد. المهام في الموجة نفسها مستقلة عن بعضها.', '');
    L.push(table(['الموجة', 'المهام', 'قرارات يلزم حسمها قبل بدء مهام الموجة'], Object.keys(waves).sort((a, b) => a - b).map((k) => {
      const ids = waves[k];
      const decs = [...new Set(ids.flatMap((id) => ix.tasks[id].decisions.filter((g) => g.gate === 'start').map((g) => g.id)))];
      return [k, ids.map((id) => tLink(id)).join('، '), decs.length ? decs.map(c).join('، ') : '—'];
    })), '');

    L.push('## أطول سلسلة اعتماديات', '');
    L.push(crit.map((id) => tLink(id)).join(' ← '), '');
    L.push(`طولها ${crit.length} مهام، وتمر بالوحدة (ج): فاتجاه النص والعزل (\`T-2.1\` و\`T-2.2\`) يسبقان واجهة الترجمة (\`T-4.1\`)، ثم المحرك والتنزيل وتدقيق الشبكة (\`T-4.3\` إلى \`T-4.5\`). ويقع \`DEC-03\` على هذه السلسلة، فتأخيره بعد اكتمال \`T-4.1\` و\`T-0.2\` يؤخر إغلاق التكامل مباشرة.`, '');

    L.push('## نقاط القرار', '');
    L.push(table(['القرار', 'الموضوع', 'الحالة', 'يلزم حسمه', 'نوع الإيقاف', 'مدخلات تفيده', 'ما يستمر حتى حسمه'], plan.decisions.map((d) => [
      `[${c(d.id)}](DECISIONS.md#${d.id})`, d.topic, decState(d), `${d.neededBy.point}${d.neededBy.phase ? ` (${pLink(d.neededBy.phase)})` : ''}`, D.GATE_LABELS[d.gate], d.informedBy.length ? d.informedBy.map((x) => tLink(x)).join('، ') : '—', d.meanwhile,
    ])), '');

    L.push('## المسارات المتوازية بعد البنية', '');
    L.push('تبدأ تجارب الجدوى الأربع و`T-1.1` معًا. بعد `T-1.1` تبدأ مهام منطقية لا تنتظر إطار الواجهة: `T-1.2` و`T-1.3` و`T-3.1` و`T-4.2`، ثم `T-2.1` و`T-2.7`. وبعد `T-1.4` (بعد `DEC-01`) تنفتح مسارات الوحدات بالتوازي:', '');
    L.push('- **مسار القراءة والكتابة:** (أ) ← (ج) ← (و).');
    L.push('- **مسار العمل والسياق:** (د) ← (هـ).');
    L.push('- **مسار الملاحظات:** (ز).');
    L.push('- **مسار التعلم والمجتمع:** (ب) ← (ح).', '');
    L.push('## ملفات ذات صلة', '');
    L.push('- [`EXECUTION_PLAN.md`](EXECUTION_PLAN.md): الخطة المرجعية.', '- [`phases/`](phases/): ملف لكل مرحلة.', '- [`TRACEABILITY.md`](TRACEABILITY.md) و[`DECISIONS.md`](DECISIONS.md) و[`STATUS.md`](STATUS.md) و[`NAMING.md`](NAMING.md).', '- لوحة المتابعة: [`dashboard/index.html`](dashboard/index.html).', '');
    out['ROADMAP.md'] = L.join('\n');
  }

  // ================= phases/*.md =================
  for (const p of plan.phases) {
    const dir = 'phases';
    const ts = plan.tasks.filter((t) => t.phase === p.id);
    const tids = ts.map((t) => t.id);
    const extDeps = [...new Set(ts.flatMap((t) => t.deps).filter((d) => !tids.includes(d)))].sort((a, b) => lv[a] - lv[b]);
    const opens = [...new Set(ts.flatMap((t) => ix.dependents[t.id]).filter((d) => !tids.includes(d)))];
    const phaseTests = [...new Set(ts.flatMap((t) => t.tests))];
    const hyps = plan.hypotheses.filter((h) => tids.includes(h.task));
    const fixtures = [...new Set(phaseTests.flatMap((x) => ix.tests[x].fixtures))];
    const later = plan.phases.filter((q) => pdeps[q.id].includes(p.id));
    const L = [];
    L.push(`# المرحلة ${p.num}: ${p.title}`, '', banner(asOf), '');
    L.push(`**موضعها:** ${pdeps[p.id].length ? `تعتمد على ${pdeps[p.id].map((x) => pLink(x, dir)).join(' و')}` : 'لا تعتمد على مرحلة أخرى'}؛ ${later.length ? `وتعتمد عليها ${later.map((q) => pLink(q.id, dir)).join(' و')}` : 'ولا تعتمد عليها مرحلة أخرى'}. ملفات ذات صلة: [خريطة الطريق](../ROADMAP.md) و[التتبع](../TRACEABILITY.md) و[القرارات](../DECISIONS.md) و[الحالة](../STATUS.md).`, '');
    L.push('## الهدف', '', p.goal, '');
    L.push('## المهام ومعرّفاتها', '');
    L.push(table(['المعرّف', 'المهمة', 'النوع', 'الميزات', 'تعتمد على', 'قرار يخصها', 'الحالة الآن'], ts.map((t) => {
      const st = tState(t);
      return [`[${c(t.id)}](#${t.id})`, t.title, D.TYPE_LABELS[t.type], t.features.length ? t.features.map(c).join('، ') : '—', t.deps.length ? t.deps.map((d) => (tids.includes(d) ? `[${c(d)}](#${d})` : tLink(d, dir))).join('، ') : none, gateText(t), st.label];
    })), '');

    L.push('## المدخلات', '');
    p.inputs.forEach((x) => L.push(`- ${x}`));
    if (extDeps.length) {
      L.push('- **من مراحل أخرى** (يلزم اكتمالها بمعايير قبولها قبل بدء المهمة المعتمدة عليها):');
      extDeps.forEach((d) => L.push(`  - ${tLink(d, dir)} (${ix.phases[ix.tasks[d].phase].short}): ${ix.tasks[d].outputs.join(' ')}`));
    }
    if (hyps.length) L.push(`- **فرضيات تحسمها هذه المرحلة:** ${hyps.map((h) => `${c(h.id)} (${c(h.task)})`).join('، ')}.`);
    const relied = plan.hypotheses.filter((h) => !tids.includes(h.task) && ts.some((t) => t.deps.includes(h.task)));
    if (relied.length) L.push(`- **فرضيات تبني عليها بعد حسمها في مرحلة سابقة:** ${relied.map((h) => c(h.id)).join('، ')}.`);
    if (fixtures.length) L.push(`- **عينات اختبار محلية** في \`tests/fixtures/\`: ${fixtures.map(c).join('، ')}.`);
    L.push('');

    L.push('## المخرجات', '');
    ts.forEach((t) => L.push(`- ${c(t.id)}: ${t.outputs.join(' ')}`));
    L.push('');

    L.push('## الاختبارات', '');
    L.push('كلها **مخططة ولم تُنفَّذ**؛ لا يُعدّ أيٌّ منها نتيجة نجاح قبل تقرير تنفيذ بدليل.', '');
    L.push(table(['الاختبار', 'المستوى', 'يتحقق من', 'البيئة والبيانات', 'الحالة'], phaseTests.map((xid) => {
      const x = ix.tests[xid];
      const st = xState(x);
      return [c(x.id), x.level, x.ac.map(c).join('، '), x.env, `${st.label}${x.appliesIf ? ` (${x.appliesIf.label})` : ''}`];
    })), '');

    L.push('## تفاصيل المهام ومعايير القبول', '');
    for (const t of ts) {
      const st = tState(t);
      L.push(`<a id="${t.id}"></a>`, '', `### ${c(t.id)} — ${t.title}`, '');
      L.push(`- **النوع والوحدة:** ${D.TYPE_LABELS[t.type]}؛ ${t.modules.map(modName).join('، ')}${t.features.length ? `؛ الميزات: ${t.features.map(c).join('، ')}` : ''}.`);
      L.push(`- **الهدف:** ${t.goal}`);
      if (t.branches) L.push(`- **فرعا المهمة:** ${t.branches}`);
      L.push(`- **تعتمد على:** ${t.deps.length ? t.deps.map((d) => tLink(d, dir)).join('، ') : none}. **تفتح:** ${ix.dependents[t.id].length ? ix.dependents[t.id].map((d) => tLink(d, dir)).join('، ') : none}.`);
      L.push(`- **قرار يخصها:** ${t.decisions.length ? t.decisions.map((g) => `${c(g.id)} — ${D.GATE_LABELS[g.gate]}: ${g.note}`).join(' ') : none}${t.affectedBy.length ? ` **ويمسّ نطاقها:** ${t.affectedBy.map((a) => `${c(a.id)} — ${a.note}`).join(' ')}` : ''}`);
      L.push(`- **الحالة الآن:** ${st.label}${st.waitingOn.length ? ` (تنتظر: ${st.waitingOn.map(c).join('، ')})` : ''}${st.note ? `. ${st.note}` : ''}.`);
      L.push(`- **المخرجات:** ${t.outputs.join(' ')}`);
      L.push('- **معايير القبول:**');
      t.ac.forEach((a) => { const A = ix.ac[a]; L.push(`  - ${c(a)}${A.branch ? ` (${A.branch})` : ''}: ${A.text}${appText(A.appliesIf)}`); });
      L.push(`- **الاختبارات:** ${t.tests.map((x) => `${c(x)}${ix.tests[x].appliesIf ? ` (${ix.tests[x].appliesIf.label})` : ''}`).join('، ')}.`);
      if (t.blockers.length) L.push(`- **الموانع المسماة:** ${t.blockers.map((b) => `${c(b)}: ${plan.blockers.find((x) => x.id === b).text}`).join(' ')}`);
      if (t.note) L.push(`- **ملاحظة:** ${t.note}`);
      L.push('');
    }

    L.push('## التسليم', '');
    L.push(p.handoff, '');
    if (opens.length) L.push(`- **تفتح في مراحل أخرى:** ${opens.map((d) => tLink(d, dir)).join('، ')}.`);
    L.push(`- **دليل الإنجاز:** تقرير كل مهمة في \`${plan.meta.evidenceDir}<معرّف المهمة>/\` (نتائج الاختبارات أو وثائق القياس)، ويُسجَّل مساره في \`data/status.json\`؛ ولا تتحول مهمة إلى «مكتملة» دونه.`);
    L.push('- **إغلاق المرحلة:** كل مهامها «مكتملة» بمعايير قبولها المنطبقة، وكل اختباراتها المنطبقة «اجتاز» بدليل. ما يحجبه قرار معلق يبقى مفتوحًا ومعلنًا، ولا يوقف تسليم ما سواه.', '');
    out[p.file] = L.join('\n');
  }

  // ================= TRACEABILITY.md =================
  {
    const L = [];
    L.push('# التتبع: ميزة ← مهمة ← مرحلة ← معيار قبول ← اختبار', '', banner(asOf), '');
    L.push('## نتيجة الفحص الآلي', '');
    const ok = !validation.errors.length && !cross.length;
    L.push(`- **${ok ? 'اجتاز' : 'فشل'}** فحص \`tools/check.mjs\` لسلامة البيانات ومطابقة \`EXECUTION_PLAN.md\`${ok ? '' : `: ${[...validation.errors, ...cross].length} خطأ`}.`);
    L.push(`- ${validation.facts.features} ميزة في 8 وحدات؛ لكلٍّ منها مهمة منفِّذة واحدة تحمل معيار قبولها، واختبار محدد واحد على الأقل مرتبط بتلك المهمة.`);
    L.push(`- لا ميزة مكررة (${validation.facts.duplicateFeatures.length ? validation.facts.duplicateFeatures.join('، ') : 'صفر'})، ولا معرّف مذكور بلا تعريف، وكل معيار قبول (${validation.facts.acceptance}) يتحقق منه اختبار واحد على الأقل، وكل اختبار (${validation.facts.tests}) مربوط بمهمة.`);
    L.push(`- **لا اعتماد دائري:** رتّب الفحص المهام الـ${validation.facts.tasks} ترتيبًا طوبولوجيًا بلا دورة، وأطول سلسلة ${validation.facts.maxLevel + 1} مهام.`);
    L.push('- الزوج الشرطي في `T-5.5` متنافٍ: لكل خيار من `DEC-04` ينطبق معيار واحد بالضبط (`AC-5.5` أو `AC-5.5N`) وفرع اختبارات واحد.', '');

    for (const m of plan.modules.filter((x) => x.code !== 'CORE')) {
      const fs_ = plan.features.filter((f) => f.module === m.code);
      L.push(`## الوحدة (${m.letter}): ${m.title}`, '');
      L.push(table(['الميزة', 'الوصف', 'المرحلة', 'المهمة المنفِّذة', 'المهام الداعمة', 'معيار القبول', 'اختبارات القبول', 'قرار يمسّها'], fs_.map((f) => {
        const t = ix.tasks[f.task];
        const decs = [...new Set([...t.decisions.map((g) => g.id), ...f.supportTasks.flatMap((s) => ix.tasks[s].decisions.map((g) => g.id))])];
        return [c(f.id), f.title, pLink(t.phase), tLink(f.task), f.supportTasks.length ? f.supportTasks.map((s) => `${tLink(s)} (${pLink(ix.tasks[s].phase)})`).join('، ') : '—', f.ac.map(c).join('، '), f.tests.map((x) => `${c(x)}${ix.tests[x].appliesIf ? ' (مشروط)' : ''}`).join('، '), decs.length ? decs.map(c).join('، ') : '—'];
      })), '');
    }

    L.push('## مهام لا تنفذ ميزة بعينها', '');
    L.push(table(['المهمة', 'النوع', 'المرحلة', 'ما تدعمه', 'معيار القبول', 'الاختبارات'], plan.tasks.filter((t) => t.type !== 'feature').map((t) => [
      tLink(t.id), D.TYPE_LABELS[t.type], pLink(t.phase), t.features.length ? t.features.map(c).join('، ') : 'كل المهام المعتمدة عليها', t.ac.map((a) => `${c(a)}${ix.ac[a].appliesIf ? ` (${ix.ac[a].appliesIf.label})` : ''}`).join('، '), t.tests.map(c).join('، '),
    ])), '');

    L.push('## عناصر مشروطة بقرار', '');
    L.push(table(['العنصر', 'النوع', 'ينطبق في', 'الحالة الآن'], [...plan.acceptance.filter((a) => a.appliesIf).map((a) => [c(a.id), 'معيار قبول', `${a.appliesIf.label} (${c(a.appliesIf.decision)})`, D.applicability(plan, a.appliesIf) === 'applies' ? 'ينطبق' : D.applicability(plan, a.appliesIf) === 'conditional' ? 'مشروط حتى يُحسم القرار' : 'لا ينطبق']),
      ...plan.tests.filter((x) => x.appliesIf).map((x) => [c(x.id), 'اختبار', `${x.appliesIf.label} (${c(x.appliesIf.decision)})`, xState(x).label])]), '');
    L.push('`AC-S3.3` ينطبق ما دام `DEC-04` معلقًا، فإن اعتُمد د-4 قبل `T-0.3` صار «لا ينطبق». والفرضيتان `HYP-07` و`HYP-09` تسقطان إن اعتُمد د-4.', '');

    L.push('## فهرس الاختبارات', '');
    L.push(table(['الاختبار', 'المستوى', 'المهام', 'معايير القبول', 'الميزات'], plan.tests.map((x) => [c(x.id), x.level, x.tasks.map((t) => tLink(t)).join('، '), x.ac.map(c).join('، '), x.features.length ? x.features.map(c).join('، ') : '—'])), '');
    out['TRACEABILITY.md'] = L.join('\n');
  }

  // ================= DECISIONS.md =================
  {
    const L = [];
    L.push('# القرارات: المعتمدة والمعلّقة', '', banner(asOf), '');
    L.push('**كيف تعتمد قرارًا:** أخبرني بالخيار في المحادثة. يُسجَّل في `data/plan.json` (الحالة والخيار وتاريخ الاعتماد) ثم يُعاد التوليد، فتتحدث الحالات المشتقة وانطباق الاختبارات تلقائيًا. التوصية رأي هندسي غير ملزم، ولا يُنفَّذ أي خيار قبل اختيارك.', '');
    L.push('## ملخص القرارات المعلّقة', '');
    L.push(table(['القرار', 'الموضوع', 'الحالة', 'يلزم حسمه', 'نوع الإيقاف', 'توصيتي (غير ملزمة)'], plan.decisions.map((d) => [`[${c(d.id)}](#${d.id})`, d.topic, decState(d), `${d.neededBy.point}${d.neededBy.phase ? ` — ${pLink(d.neededBy.phase)}` : ''}`, D.GATE_LABELS[d.gate], d.recommendation ? d.recommendation.option : '—'])), '');
    {
      const pend = plan.decisions.filter((d) => d.status !== 'approved');
      const appr = plan.decisions.filter((d) => d.status === 'approved');
      L.push(`**ترتيب الحاجة إليها:** ${pend.map((d) => `${c(d.id)} ${d.neededBy.point}${d.informedBy.length ? ` (بعد وثيقة ${d.informedBy.map(c).join(' و')})` : ''}`).join('، ثم ')}. **محسومة:** ${appr.map((d) => `${c(d.id)} (${d.chosen}${d.decidedBy ? '، ' + d.decidedBy : ''})`).join('، ')}. القرارات المفوَّضة بـ\`AD-14\` تُحسم عند بدء مرحلتها بناءً على وثيقتها وتُسجَّل بسببها؛ وما يمس صلاحيات حساسة (\`DEC-04\`) أو النطاق (\`DEC-07\`) يبقى للمالك.`, '');
    }

    L.push('## القرارات المعتمدة', '');
    L.push(table(['المعرّف', 'القرار', 'النص', 'المصدر'], plan.approved.map((a) => [c(a.id), a.title, a.text, a.source])), '');

    L.push('## تفاصيل القرارات المعلّقة', '');
    for (const d of plan.decisions) {
      L.push(`<a id="${d.id}"></a>`, '', `### ${c(d.id)} — ${d.topic}`, '');
      L.push(`- **الحالة:** ${decState(d)}.`);
      if (d.history) for (const h of d.history) L.push(`- **قرار سابق حلّ محله هذا القرار:** ${h.chosen}${h.chosenLabel ? ` — ${h.chosenLabel}` : ''} (${h.decidedOn}${h.decidedBy ? `، ${h.decidedBy}` : ''})؛ سببه وقتها: ${h.reason} **نُسخ في ${h.supersededOn} بـ${h.supersededBy}**، ويبقى مسجلًا هنا ولا يُحذف.`);
      L.push(`- **النطاق:** ${d.scope}`);
      L.push(`- **يلزم حسمه:** ${d.neededBy.point}${d.neededBy.phase ? ` (${pLink(d.neededBy.phase)})` : ''}. ${d.neededBy.note}`);
      L.push(`- **نوع الإيقاف:** ${D.GATE_LABELS[d.gate]}${d.carriers.length ? `؛ المهام الحاملة: ${d.carriers.map((t) => tLink(t)).join('، ')}` : ''}.`);
      if (d.informedBy.length) L.push(`- **مدخلات تفيد القرار:** وثائق ${d.informedBy.map((t) => tLink(t)).join('، ')}.`);
      L.push(`- **ما يستمر حتى حسمه:** ${d.meanwhile}`, '');
      L.push(table(['الخيار', 'الوصف', 'الأثر'], d.options.map((o) => [`**${o.key}**`, o.title, o.impact])), '');
      L.push(`- **الأثر على الاختبارات:** ${d.testsImpact}`);
      if (d.recommendation) L.push(`- **توصيتي (غير ملزمة): ${d.recommendation.option}.** ${d.recommendation.text}`);
      if (d.sources) L.push(`- **مصادر:** ${d.sources.map((s) => `[${s.title}](${s.url}) (${s.note})`).join('؛ ')}`);
      if (d.id === 'DEC-07') {
        L.push('', '**تقييم كل مقترح (يُقرَّر منفردًا؛ كلها خارج النطاق حتى تعتمدها):**', '');
        L.push(table(['المقترح', 'الوصف', 'القيمة', 'الكلفة', 'المخاطرة', 'توصيتي', 'الحالة'], plan.proposals.map((p) => [c(p.id), `**${p.title}:** ${p.text}`, p.value, p.cost, p.risk, p.recommendation, p.status === 'approved' ? 'معتمد' : 'معلق — خارج النطاق'])));
      }
      L.push('');
    }
    out['DECISIONS.md'] = L.join('\n');
  }

  // ================= STATUS.md =================
  {
    const L = [];
    const ts = sum.tasks.byKey;
    const xs = sum.tests.byKey;
    L.push('# الحالة: ما أُنجز وما بقي والعوائق والخطوة التالية', '', banner(asOf), '');
    L.push('## قاعدة الأدلة', '');
    status.policy.forEach((x) => L.push(`- ${x}`));
    L.push('');
    L.push('## الخلاصة', '');
    const startedAny = ts.done + ts.in_progress + ts.implemented + ts.blocked > 0;
    L.push(`- **التنفيذ:** ${ts.done} من ${sum.tasks.total} مهمة مدمجة ومتحقق منها (${sum.pctTasks}%)${ts.implemented ? `، و${ts.implemented} منفّذة على فرع تنتظر الدمج` : ''}${ts.in_progress ? `، و${ts.in_progress} جارية` : ''}${ts.blocked ? `، و${ts.blocked} متوقفة` : ''}. ${startedAny ? 'التنفيذ يجري بنظام MJ أدناه.' : 'لم تبدأ برمجة الإضافة؛ وتبدأ بأمر «' + (MV && MV.current && MV.current.stages[0] ? MV.current.stages[0].startCmd : '/mj MJ1') + '» في جلسة مستقلة يفتحها المالك.'}`);
    L.push(`- **الاختبارات:** ${sum.tests.total} اختبارًا معرَّفًا؛ نُفِّذ منها ${sum.tests.executed} (اجتاز ${xs.passed}، وفشل ${xs.failed}). ${xs.planned} مخطط، و${xs.conditional} مشروط بقرار، و${xs.not_applicable} لا ينطبق. **لا يُعدّ أي اختبار نتيجة نجاح.**`);
    L.push(`- **القرارات:** ${sum.decisions.approved} من ${sum.decisions.total} معتمدة.`);
    L.push(`- **فحص البيانات:** ${!validation.errors.length && !cross.length ? 'يجتاز `tools/check.mjs` بلا أخطاء' : `${validation.errors.length + cross.length} خطأ في \`tools/check.mjs\``}.`, '');

    // ================= نظام MJ: الموجات والمراحل =================
    if (MV) {
      const stView = {};
      MV.waves.forEach((w) => w.stages.forEach((v) => { stView[v.stage.id] = v; }));
      const B = [];
      B.push(`- **المتبقي:** ${MV.stageCount - MV.waves.reduce((n, w) => n + w.stages.filter((v) => v.key === 'merged').length, 0)} من ${MV.stageCount} مرحلة · **الموجات:** ${MV.waves.length} · **أقصى توازٍ:** ${Math.max(...MV.waves.map((w) => w.stages.length))} · **المهام:** ${MV.counts.merged} من ${MV.counts.total} مدمجة${MV.counts.implemented ? `، و${MV.counts.implemented} منفّذة على فرع` : ''}${MV.counts.active ? `، و${MV.counts.active} جارية أو متوقفة` : ''}`);
      B.push(`- **الموجة الحالية:** ${MV.current ? `${MV.current.wave.id} — ${MV.current.wave.title}: ${MV.current.label}${MV.current.open ? ` على \`mj-${MV.current.wave.id}/base\`` : ''}` : 'لا شيء؛ اكتملت كل الموجات'}`);
      B.push(`- **الخطوة التالية:** ${MV.next.text}`, '');
      B.push('### الموجات', '');
      B.push(table(['الموجة', 'المراحل بترتيب الدمج', 'التوازي', 'الحالة', 'ما يمنع الدمج', 'مودل الدمج', 'أمر الدمج', 'لماذا معًا'], MV.waves.map((w) => [
        w.wave.id, w.wave.order.map((id) => `[${id}](stages/${id}.md)`).join(' · '), w.stages.length === 1 ? 'منفردة' : `${w.stages.length} معًا`, w.label, w.mergeBlockers.length ? w.mergeBlockers.join('؛ ') : '—', w.wave.merge_model + (w.wave.why_merge_model ? ` (${w.wave.why_merge_model})` : ''), `\`${w.mergeCmd}\``, w.wave.why_together,
      ])), '');
      B.push('### المراحل', '');
      B.push(table(['المرحلة', 'العنوان', 'الموجة', 'تعتمد على', 'المهام', 'المودل', 'الفرع', 'الحالة', 'ما يمنع البدء', 'الالتزام', 'أمر البدء'], MJP.stages.map((s) => {
        const v = stView[s.id]; const h = s.header;
        return [`[${s.id}](stages/${s.id}.md)`, h.title, h.wave, (h.depends || []).length ? h.depends.join(' · ') : '—', (h.tasks || []).map(c).join('، '), h.model + (h.model !== mjWaves.default_model ? ` (${h.why_model})` : ''), c(h.branch), v.label + (s.source.kind === 'branch' ? ' (من الفرع، لم يُدمج)' : ''), v.key === 'planned' || v.key === 'active' || v.key === 'blocked' ? (v.blockers.length ? v.blockers.map((b) => b.text).join('؛ ') : '—') : '—', h.commit ? c(h.commit) : '—', `\`${v.startCmd}\``];
      })), '');
      out['@mj-block'] = B.join('\n').replace(/\(stages\//g, '(stages/');
      L.push('## الموجات والمراحل (نظام MJ): التقدم الفعلي', '');
      L.push('المصدر: ترويسة كل ملف في `Docs/MJ/stages/` وجدول «حالة المهام» فيه، ومعها `Docs/MJ/waves.json`؛ والقواعد والأدوار والأوامر في [`Docs/MJ/README.md`](Docs/MJ/README.md). الصفحة `dashboard/index.html` تجمع تقدم الفروع قبل الدمج بـ`node tools/build.mjs --sync`.', '');
      L.push(B.join('\n').replace(/\]\(stages\//g, '](Docs/MJ/stages/'), '');
      const active = MJP.stages.filter((s) => s.header.status !== 'planned');
      if (active.length) {
        L.push('### المراحل التي بدأت: مهامها وما أُنجز', '');
        for (const s of active) {
          const v = stView[s.id];
          L.push(`#### ${s.id} — ${s.header.title} — ${v.label}${s.header.commit ? ` · الالتزام ${c(s.header.commit)}` : ''}`, '');
          L.push(table(['المهمة', 'الحالة', 'ما أُنجز', 'الدليل'], s.tasks.map((t) => [tLink(t.id), t.word + (t.note ? `: ${t.note}` : ''), t.summary || '—', t.evidence.length ? t.evidence.map(c).join('، ') : '—'])), '');
          L.push(`**نقطة الاستئناف:** ${s.header.resume}`, '');
        }
      }
    }

    L.push('## ما أُنجز', '');
    L.push(startedAny ? 'أعمال التخطيط، ودليلها وجود الملفات واجتياز الفحص الآلي؛ وما أُنجز من المراحل مفصَّل في قسم الموجات أعلاه وفي ملفات `Docs/MJ/stages/` بمراجعه:' : 'أعمال التخطيط فقط، ودليلها وجود الملفات واجتياز الفحص الآلي:', '');
    L.push(table(['المُخرَج', 'الدليل'], [
      ['`EXECUTION_PLAN.md` محدَّث (الإصلاحات 14 إلى 18 في القسم 0.1)', 'يطابق `data/plan.json` في فحص `tools/check.mjs`'],
      ['`data/plan.json` و`data/status.json` و`data/naming.json`: مصدر البيانات الموحد', 'تُولَّد منه الملفات أدناه ولوحة المتابعة'],
      [`\`ROADMAP.md\` و\`phases/\` (${plan.phases.length} ملفًا) و\`TRACEABILITY.md\` و\`DECISIONS.md\` و\`STATUS.md\` و\`NAMING.md\``, 'مولَّدة؛ ويفشل الفحص إن اختلفت عن البيانات'],
      ['لوحة المتابعة `dashboard/`', 'تقرأ `dashboard/data.js` المولَّد من البيانات نفسها'],
      [`اعتماد الاسم «${plan.meta.name.ar}» (\`${plan.meta.name.id}\`) في \`DEC-06\` وتطبيقه في الملفات (القسم 0.2 في الخطة)`, '`EV-04`؛ ولا يبقى المعرّف المؤقت إلا في سياق تاريخي'],
    ]), '');
    L.push('**أدلة الحالة الابتدائية:**', '');
    status.evidence.forEach((e) => L.push(`- ${c(e.id)} (${e.date}): ${e.text} — الطريقة: ${e.how}`));
    L.push('');

    L.push('## حالة المراحل', '');
    L.push(table(['المرحلة', 'المهام', 'مكتملة', 'جاهزة للبدء', 'بانتظار قرار', 'بانتظار اعتماديات', 'التقدم'], plan.phases.map((p) => {
      const pts = plan.tasks.filter((t) => t.phase === p.id).map(tState);
      const n = (k) => pts.filter((s) => s.key === k).length;
      const ps = sum.phases.find((x) => x.id === p.id);
      return [pLink(p.id, '', `${p.num}. ${p.short}`), pts.length, n('done'), n('ready') + n('ready_partial'), n('awaiting_decision'), n('waiting'), `${ps.pct}%`];
    })), '');

    L.push('## حالة المهام', '');
    L.push(table(['المهمة', 'العنوان', 'المرحلة', 'الحالة', 'تنتظر', 'الدليل'], plan.tasks.map((t) => {
      const st = tState(t);
      const ev = status.tasks[t.id].evidence;
      return [tLink(t.id), t.title, ix.phases[t.phase].num, st.label, [st.waitingOn.map(c).join('، '), st.pendingDecisions.map(c).join('، ')].filter(Boolean).join(' / ') || '—', ev.length ? ev.join('، ') : '—'];
    })), '');

    L.push('## ما بقي', '');
    L.push(`كل المهام الـ${sum.tasks.total} وكل الاختبارات المنطبقة. أقرب ما يمكن بدؤه الآن: ${plan.tasks.filter((t) => ['ready', 'ready_partial'].includes(tState(t).key)).map((t) => tLink(t.id)).join('، ')}.`, '');

    L.push('## العوائق', '');
    L.push('**قرارات معلّقة** (لا يوقف أيٌّ منها العمل الجاهز الآن):', '');
    plan.decisions.filter((d) => d.status !== 'approved').forEach((d) => L.push(`- [${c(d.id)}](DECISIONS.md#${d.id}) ${d.topic}: ${d.neededBy.point}${d.carriers.length ? `؛ يمس ${d.carriers.map(c).join('، ')}` : ''}.`));
    L.push('', '**متطلبات خارجية للمرحلة 0** (ليست في مساحة العمل الآن):', '');
    L.push('- Chrome وFirefox وEdge وBrave على سطح المكتب، وجهاز مرجعي تُسجَّل مواصفاته لقياسات الأداء.');
    L.push('- وصول إلى صفحات GitHub عامة حية ومستودعات مرجعية عامة.');
    L.push('- رمز تجريبي من المالك لمستودع تجريبي **فقط** إن بقي `DEC-04` معلقًا أو اختير فيه دعم الرمز قبل `T-0.3`.');
    L.push('- Firefox 158.0.1 مثبت الآن (`EV-09`)؛ بنوده تُجرى كغيرها، وما تعذّر يُسجَّل «لم يُجرَ» بسببه.');
    L.push('- جلسة مستقلة يفتحها المالك لكل مرحلة بأمر `/mj MJn`، وجلسة دمج لكل موجة بأمر `/mj-merge X`؛ ولا تبدأ مرحلة ولا تُدمج موجة تلقائيًا.', '');
    L.push('**موانع مسماة نشطة:** لا يوجد؛ الموانع الـ16 في الخطة شروط تظهر أثناء التنفيذ ولم يظهر منها شيء لأن التنفيذ لم يبدأ.', '');

    L.push('## الخطوة التالية', '');
    L.push(`1. ${MV ? MV.next.text : 'تجهيز نظام MJ.'}`);
    L.push('2. القرارات المفوَّضة الباقية (`AD-14`): `DEC-02` عند بدء `MJ7`، و`DEC-05` عند بدء `MJ12`، و`DEC-03` عند بدء `MJ14`؛ تُحسم بناءً على تقارير تجارب الجدوى وتُسجَّل بسببها. و`DEC-07` (المقترحات الستة) بيد المالك ولا يوقف شيئًا.');
    L.push('3. ما يحتاجه المالك لمراحل الطبقة المساعدة: رمز GitHub تجريبي للقراءة فقط ومستودع تجريبي لـ`T-0.5` في `MJ11` (ومفتاح مزوّد تجريبي إن أراد قياس مساره)، وصلاحية كتابة تجريبية لـ`TEST-EXEC-01` في `MJ22`؛ وقرار جعل مستودع مِجهَر عامًّا أو حجب رابطه قبل إغلاق `MJ23` (`AC-10.3`). وما لم يتوفر يُسجَّل «لم يُجرَ» بسببه ولا يُعدّ نجاحًا.');
    L.push(`4. اعتماد الاختصارات (\`DEC-08\`) في أي وقت قبل إغلاق التغليف. الاسم محسوم: «${plan.meta.name.ar}» (${plan.meta.name.latin})، ويبقى له قبل النشر ما في \`NAMING.md\`.`, '');
    out['STATUS.md'] = L.join('\n');
  }

  // ================= NAMING.md =================
  if (naming) {
    const L = [];
    L.push('# الأسماء المقترحة', '', banner(asOf), '');
    if (naming.approved) {
      L.push('## الاسم المعتمد', '');
      L.push(`**${naming.approved.ar} (${naming.approved.latin})** — اعتمده المالك في \`${naming.approved.decision}\` بتاريخ \`${naming.approved.decidedOn}\`، والمعرّف التقني \`${naming.approved.id}\`.`, '');
      L.push(naming.approved.note, '');
      L.push(`**ما يلزم قبل النشر:** ${naming.approved.before}`, '');
    } else L.push(`**الاسم المؤقت الآن:** ${naming.workingName.text}`, '');
    L.push('## ما تفعله الإضافة (أساس الترشيح)', '', naming.function, '');
    L.push('## معايير الترشيح', '');
    naming.criteria.forEach((x) => L.push(`- ${x}`));
    L.push('');
    L.push('## الأسماء الخمسة', '');
    L.push(table(['#', 'بالعربية', 'بالإنجليزية', 'المعنى', 'سبب الملاءمة', 'التعارضات الظاهرة', 'درجة التعارض'], naming.candidates.map((x, i) => [i + 1, `**${x.ar}**${naming.approved && x.latin === naming.approved.latin ? ' (المعتمد)' : ''}`, `**${x.latin}**${x.subtitle ? `<br>_${x.subtitle}_` : ''}`, x.meaning, x.fit, x.conflictsSummary, x.severityLabel])), '');
    L.push(naming.approved ? '## ترشيحي قبل الاعتماد' : '## الترشيح النهائي', '');
    L.push(`**${naming.recommendation.ar} (${naming.recommendation.latin})** — ${naming.recommendation.why}`, '');
    L.push(`**ما يبقى قبل اعتماده:** ${naming.recommendation.before}`, '');
    if (!naming.approved) L.push('لا يُعتمد الاسم ولا تُغيَّر المعرّفات قبل موافقتك في `DEC-06`.', '');
    L.push('## تفاصيل الفحص لكل اسم', '');
    for (const x of naming.candidates) {
      L.push(`### ${x.ar} — ${x.latin}`, '');
      L.push(`- **الصيغ المبحوث بها:** ${x.variants.map(c).join('، ')}`);
      x.findings.forEach((f) => L.push(`- **${f.where}:** ${f.text}${f.url ? ` ([رابط](${f.url}))` : ''}`));
      L.push('');
    }
    L.push('## أسماء فُحصت واستُبعدت', '');
    L.push(table(['الاسم', 'سبب الاستبعاد', 'الدليل'], naming.excluded.map((x) => [x.name, x.reason, x.urls && x.urls.length ? x.urls.map((u, i) => `[${i + 1}](${u})`).join(' ') : '—'])), '');
    L.push('## المنهج وحدوده', '');
    L.push(`- **تاريخ الفحص:** ${naming.checkedOn}.`);
    naming.methods.forEach((x) => L.push(`- ${x}`));
    L.push('', '**الحدود:**', '');
    naming.limits.forEach((x) => L.push(`- ${x}`));
    L.push('');
    out['NAMING.md'] = L.join('\n');
  }

  // ================= مناطق مولَّدة داخل EXECUTION_PLAN.md =================
  {
    const idx = [];
    const nPend = plan.decisions.filter((d) => d.status !== 'approved').length;
    idx.push(`القرارات ${plan.decisions.length}: ${plan.decisions.length - nPend} محسومة و${nPend} معلّقة، ولا يُنفَّذ خيار معلّق قبل اختيارك. هذا فهرس فقط؛ الخيارات وأثر كل خيار والتوصية غير الملزمة وما يستمر حتى الحسم في [\`DECISIONS.md\`](DECISIONS.md)، وما يتوقف على كل قرار في جدول 6.13.`, '');
    idx.push(table(['القرار', 'الموضوع', 'الحالة', 'يلزم حسمه', 'نوع الإيقاف', 'توصية غير ملزمة'], plan.decisions.map((d) => [c(d.id), d.topic, decState(d), d.neededBy.point, D.GATE_LABELS[d.gate], d.recommendation ? d.recommendation.option : '—'])));
    out['@decisions-index'] = idx.join('\n');
    const nm = [];
    if (naming) {
      nm.push(naming.approved ? `**الاسم المعتمد: «${naming.approved.ar}» (${naming.approved.latin})** في \`DEC-06\` بتاريخ \`${naming.approved.decidedOn}\`، والمعرّف التقني \`${naming.approved.id}\`. الأسماء الخمسة المقترحة وفحص تعارضها وحدوده وما يلزم قبل النشر في [\`NAMING.md\`](NAMING.md).` : `الأسماء الخمسة المقترحة ومعانيها وفحص تعارضها وحدوده والترشيح النهائي في [\`NAMING.md\`](NAMING.md). الاسم المؤقت \`${plan.meta.workingName}\` يبقى حتى تقرر، ولا يُغيَّر أي معرّف قبل موافقتك.`, '');
      nm.push(table(['#', 'الاسم', 'بالإنجليزية', 'درجة التعارض الظاهر'], naming.candidates.map((x, i) => [i + 1, naming.approved && x.latin === naming.approved.latin ? `**${x.ar}** (المعتمد)` : x.ar, x.latin, x.severityLabel])), '');
      nm.push(`**${naming.approved ? 'ترشيحي قبل الاعتماد' : 'الترشيح النهائي (غير ملزم)'}:** ${naming.recommendation.ar} (${naming.recommendation.latin}).`);
    } else nm.push('الأسماء في `NAMING.md` (قيد الإعداد).');
    out['@naming-index'] = nm.join('\n');
  }

  // ================= بيانات لوحة المتابعة =================
  // ملف البيانات غير متتبَّع ويُكتب بـ--sync من أي مجلد؛ لذا لا يدخل في فحص التقادم.
  out['@data.js'] = `/* مولَّد من data/plan.json وdata/status.json وdata/naming.json وDocs/MJ/ بالأمر node tools/build.mjs --sync — لا تحرّره يدويًا. */\nwindow.PLAN_DATA = ${JSON.stringify({ plan, status, naming, mj: MJP })};\n`;
  // الكتلة المشتقة في Docs/MJ/README.md بين علامتيها.
  {
    const readme = read('Docs/MJ/README.md');
    const a = '<!-- mj:begin -->', b = '<!-- mj:end -->';
    const i = readme.indexOf(a), j = readme.indexOf(b);
    if (i < 0 || j < 0) throw new Error('علامتا الكتلة المشتقة مفقودتان في Docs/MJ/README.md');
    out['Docs/MJ/README.md'] = readme.slice(0, i + a.length) + '\n' + out['@mj-block'] + '\n' + readme.slice(j);
  }

  for (const k of Object.keys(out)) if (!k.startsWith('@') && !k.endsWith('.js')) out[k] = out[k].replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';

  // بصمة محتوى لكل ملف تحمّله الصفحة، حتى لا يعرض المتصفح نسخة قديمة من البيانات أو الأنماط.
  const stamp = (name) => createHash('sha256').update(read(`dashboard/${name}`)).digest('hex').slice(0, 10);
  out['dashboard/index.html'] = read('dashboard/index.html').replace(/(href|src)="(styles\.css|app\.js|derive\.js)(\?v=[0-9a-f]+)?"/g, (_, attr, name) => `${attr}="${name}?v=${stamp(name)}"`);
  return { out, validation, cross };
}

export function applyRegions(md, out) {
  let s = md;
  for (const name of ['decisions-index', 'naming-index']) {
    const a = `<!-- BEGIN GENERATED: ${name} -->`;
    const b = `<!-- END GENERATED: ${name} -->`;
    const i = s.indexOf(a);
    const j = s.indexOf(b);
    if (i < 0 || j < 0) throw new Error(`منطقة مولَّدة مفقودة في EXECUTION_PLAN.md: ${name}`);
    s = s.slice(0, i + a.length) + '\n' + out[`@${name}`] + '\n' + s.slice(j);
  }
  return s;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const args = process.argv.slice(2);
  const sync = args.includes('--sync');
  const dry = args.includes('--dry');
  const D = loadDerive();
  const data = loadData();
  const { out, validation, cross } = render(data, D);
  const info = repoInfo(ROOT);
  const writeData = () => {
    const targets = [path.join(ROOT, 'dashboard/data.js')];
    if (!info.isMain && info.main && path.resolve(info.main) !== path.resolve(ROOT) && fs.existsSync(path.join(info.main, 'dashboard'))) targets.push(path.join(info.main, 'dashboard/data.js'));
    for (const t of targets) fs.writeFileSync(t, out['@data.js']);
    return targets;
  };
  if (sync) {
    const targets = dry ? [] : writeData();
    const v = D.mjView(data.plan, data.status, mjPayload(data.mj, data.waves));
    console.log(`تمت المزامنة: ${data.mj.stages.length} مرحلة (${data.mj.stages.filter((s) => s.source.kind === 'branch').length} منها من فروع لم تُدمج)؛ كُتب ${targets.length ? targets.join(' و') : 'لا شيء (--dry)'}.`);
    if (v && v.current) console.log(`الموجة الحالية ${v.current.wave.id}: ${v.current.label}. ${v.next.text}`);
  } else {
    if (!info.isMain && !args.includes('--force')) {
      console.error('هذا المجلد worktree لا النسخة الرئيسية: الوثائق المتتبَّعة يولّدها منسّق الدمج في النسخة الرئيسية. استعمل --sync هنا، أو --force إن كنت تعرف ما تفعل.');
      process.exit(2);
    }
    const plan = applyRegions(read('EXECUTION_PLAN.md'), out);
    if (!dry) {
      for (const [k, v] of Object.entries(out)) {
        if (k.startsWith('@')) continue;
        fs.mkdirSync(path.dirname(path.join(ROOT, k)), { recursive: true });
        fs.writeFileSync(path.join(ROOT, k), v);
      }
      fs.writeFileSync(path.join(ROOT, 'EXECUTION_PLAN.md'), plan);
      writeData();
    }
    console.log(`وُلِّد ${Object.keys(out).filter((k) => !k.startsWith('@')).length} ملفًا ومنطقتان في EXECUTION_PLAN.md وdashboard/data.js.`);
  }
  const errs = [...validation.errors, ...cross];
  if (errs.length) { console.error(`تحذير: ${errs.length} خطأ في البيانات؛ شغّل node tools/check.mjs${sync ? ' --data' : ''} للتفاصيل.`); process.exitCode = 1; }
}

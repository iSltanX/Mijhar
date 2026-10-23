// فحوص سلامة البيانات ومطابقة الوثيقة المرجعية. يستعملها build.mjs (لنشر النتيجة في TRACEABILITY.md وSTATUS.md)
// وcheck.mjs (للفشل عند أي خطأ).
import * as P from './plan-md.mjs';

const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
// أحجام الوحدات بعد توسيع النطاق في 2026-10-23 (`AD-23`): 47 ميزة الطلب الأصلي + 9 ميزات التوسيع في د وهـ وو.
const MODULE_SIZES = { A: 7, B: 7, C: 6, D: 9, E: 9, F: 7, G: 5, H: 6 };
const FEATURE_COUNT = Object.values(MODULE_SIZES).reduce((a, b) => a + b, 0);

export function validatePlan(plan, status, D) {
  const errors = [];
  const err = (m) => errors.push(m);
  const ix = D.index(plan);

  for (const [name, list] of Object.entries({ modules: plan.modules.map((m) => ({ id: m.code })), phases: plan.phases, features: plan.features, tasks: plan.tasks, acceptance: plan.acceptance, tests: plan.tests, decisions: plan.decisions, blockers: plan.blockers, hypotheses: plan.hypotheses })) {
    const seen = new Set();
    for (const x of list) {
      if (seen.has(x.id)) err(`${name}: معرّف مكرر ${x.id}`);
      seen.add(x.id);
    }
  }

  // الوحدات والميزات
  if (plan.modules.filter((m) => m.code !== 'CORE').length !== 8) err('عدد الوحدات ليس 8');
  if (plan.features.length !== FEATURE_COUNT) err(`عدد الميزات ${plan.features.length} وليس ${FEATURE_COUNT}`);
  for (const [code, n] of Object.entries(MODULE_SIZES)) {
    const got = plan.features.filter((f) => f.module === code).length;
    if (got !== n) err(`الوحدة ${code}: ${got} ميزة والمتوقع ${n}`);
  }

  // المهام والاعتماديات
  let levels = {};
  for (const t of plan.tasks) {
    if (!ix.phases[t.phase]) err(`${t.id}: مرحلة غير معرّفة ${t.phase}`);
    for (const d of t.deps) {
      if (!ix.tasks[d]) err(`${t.id}: تعتمد على مهمة غير معرّفة ${d}`);
      if (d === t.id) err(`${t.id}: تعتمد على نفسها`);
    }
    if (!t.ac.length) err(`${t.id}: بلا معيار قبول`);
    if (!t.tests.length) err(`${t.id}: بلا اختبار`);
  }
  try { levels = D.levels(plan); } catch (e) { err(e.message); }

  // الميزة ← مهمة ← معيار ← اختبار
  const featureSeen = {};
  for (const f of plan.features) {
    featureSeen[f.id] = (featureSeen[f.id] || 0) + 1;
    const t = ix.tasks[f.task];
    if (!t) { err(`${f.id}: المهمة المنفِّذة ${f.task} غير معرّفة`); continue; }
    if (!t.features.includes(f.id)) err(`${f.id}: المهمة ${f.task} لا تذكر الميزة`);
    if (!f.ac.length) err(`${f.id}: بلا معيار قبول`);
    for (const a of f.ac) {
      if (!ix.ac[a]) err(`${f.id}: معيار غير معرّف ${a}`);
      else if (ix.ac[a].task !== f.task) err(`${f.id}: المعيار ${a} ليس في مهمتها ${f.task}`);
    }
    if (!f.tests.length) err(`${f.id}: بلا اختبار`);
    for (const x of f.tests) {
      if (!ix.tests[x]) err(`${f.id}: اختبار غير معرّف ${x}`);
      else if (!ix.tests[x].tasks.includes(f.task)) err(`${f.id}: الاختبار ${x} لا يخص مهمتها ${f.task}`);
    }
    for (const s of f.supportTasks) {
      if (!ix.tasks[s]) err(`${f.id}: مهمة داعمة غير معرّفة ${s}`);
      else if (!ix.tasks[s].features.includes(f.id)) err(`${f.id}: المهمة الداعمة ${s} لا تذكر الميزة`);
      if (s === f.task) err(`${f.id}: المهمة الداعمة هي المنفِّذة نفسها`);
    }
  }
  for (const t of plan.tasks) for (const fid of t.features) {
    const f = ix.features[fid];
    if (!f) err(`${t.id}: ميزة غير معرّفة ${fid}`);
    else if (f.task !== t.id && !f.supportTasks.includes(t.id)) err(`${t.id}: تذكر ${fid} وليست منفِّذة لها ولا داعمة`);
  }

  // معايير القبول
  for (const a of plan.acceptance) {
    const t = ix.tasks[a.task];
    if (!t || !t.ac.includes(a.id)) err(`${a.id}: غير مدرج في مهمته ${a.task}`);
    if (!plan.tests.some((x) => x.ac.includes(a.id))) err(`${a.id}: لا يتحقق منه أي اختبار`);
  }
  for (const t of plan.tasks) for (const a of t.ac) if (!ix.ac[a]) err(`${t.id}: معيار غير معرّف ${a}`);

  // الاختبارات
  for (const x of plan.tests) {
    if (!x.tasks.length) err(`${x.id}: بلا مهمة`);
    for (const tid of x.tasks) if (!ix.tasks[tid]?.tests.includes(x.id)) err(`${x.id}: المهمة ${tid} لا تذكره`);
    for (const a of x.ac) if (!ix.ac[a]) err(`${x.id}: معيار غير معرّف ${a}`);
    for (const f of x.features) if (!ix.features[f]) err(`${x.id}: ميزة غير معرّفة ${f}`);
  }
  for (const t of plan.tasks) for (const x of t.tests) if (!ix.tests[x]?.tasks.includes(t.id)) err(`${t.id}: الاختبار ${x} لا يذكر المهمة`);

  // القرارات والموانع والانطباق
  for (const d of plan.decisions) {
    const carriers = plan.tasks.filter((t) => t.decisions.some((g) => g.id === d.id)).map((t) => t.id);
    if (!same(carriers, d.carriers)) err(`${d.id}: المهام الحاملة ${d.carriers} لا تطابق المهام ${carriers}`);
    if (!d.options.length) err(`${d.id}: بلا خيارات`);
    if (d.recommendation && !d.options.some((o) => o.key === d.recommendation.option)) err(`${d.id}: التوصية ${d.recommendation.option} ليست خيارًا`);
    if (d.status === 'approved' && !d.options.some((o) => o.key === d.chosen)) err(`${d.id}: الخيار المعتمد غير معرّف`);
  }
  const blk = Object.fromEntries(plan.blockers.map((b) => [b.id, b]));
  for (const t of plan.tasks) for (const b of t.blockers) {
    if (!blk[b]) err(`${t.id}: مانع غير مسجل ${b}`);
    else if (!blk[b].tasks.includes(t.id)) err(`${b}: لا يذكر ${t.id}`);
  }
  for (const item of [...plan.acceptance, ...plan.tests].filter((x) => x.appliesIf)) {
    const d = ix.decisions[item.appliesIf.decision];
    if (!d) err(`${item.id}: قرار شرطي غير معرّف`);
    else for (const o of item.appliesIf.options) if (!d.options.some((x) => x.key === o)) err(`${item.id}: خيار غير معرّف ${o}`);
  }
  // الزوج الشرطي: لكل خيار من DEC-04 ينطبق فرع واحد بالضبط
  const dec04 = ix.decisions['DEC-04'];
  if (dec04) for (const o of dec04.options) {
    const acN = ['AC-5.5', 'AC-5.5N'].filter((id) => ix.ac[id]?.appliesIf.options.includes(o.key)).length;
    const supportTests = ['TEST-SEC-01', 'TEST-SEC-02', 'TEST-SEC-03'].every((id) => ix.tests[id]?.appliesIf.options.includes(o.key));
    const noTest = ix.tests['TEST-SEC-04']?.appliesIf.options.includes(o.key);
    if (acN !== 1) err(`DEC-04/${o.key}: ينطبق ${acN} من معياري T-5.5 والمطلوب واحد`);
    if (supportTests === noTest) err(`DEC-04/${o.key}: فرعا اختبارات PAT غير متنافيين`);
  }

  // الحالة
  if (status) {
    for (const t of plan.tasks) {
      const s = status.tasks[t.id];
      if (!s) { err(`status: المهمة ${t.id} غائبة`); continue; }
      if (!D.STORED_TASK.includes(s.status)) err(`status: حالة غير صالحة ${t.id}=${s.status}`);
      if (s.status === 'done' && !(s.evidence || []).length) err(`status: ${t.id} مكتملة بلا دليل`);
      if (s.status === 'blocked' && !s.note) err(`status: ${t.id} متوقفة بلا سبب`);
      if (s.status === 'implemented' && !s.branch) err(`status: ${t.id} منفّذة بلا فرع`);
    }
    for (const x of plan.tests) {
      const s = status.tests[x.id];
      if (!s) { err(`status: الاختبار ${x.id} غائب`); continue; }
      if (!D.STORED_TEST.includes(s.status)) err(`status: حالة غير صالحة ${x.id}=${s.status}`);
      if ((s.status === 'passed' || s.status === 'failed') && !(s.evidence || []).length) err(`status: ${x.id} نتيجة بلا دليل`);
    }
    for (const k of Object.keys(status.tasks)) if (!ix.tasks[k]) err(`status: مهمة غير معرّفة ${k}`);
    for (const k of Object.keys(status.tests)) if (!ix.tests[k]) err(`status: اختبار غير معرّف ${k}`);
  }

  const facts = {
    modules: 8, features: plan.features.length, tasks: plan.tasks.length, acceptance: plan.acceptance.length,
    tests: plan.tests.length, decisions: plan.decisions.length, blockers: plan.blockers.length,
    hypotheses: plan.hypotheses.length, proposals: plan.proposals.length, budgets: plan.budgets.length, params: plan.params.length,
    maxLevel: Math.max(0, ...Object.values(levels)),
    duplicateFeatures: Object.entries(featureSeen).filter(([, n]) => n > 1).map(([k]) => k),
  };
  return { errors, facts };
}

export function crossCheck(plan, md) {
  const errors = [];
  const err = (m) => errors.push(`EXECUTION_PLAN.md: ${m}`);
  const byId = (l) => Object.fromEntries(l.map((x) => [x.id, x]));
  const T = byId(plan.tasks), F = byId(plan.features), X = byId(plan.tests);

  const fm = P.parseFeatureMatrix(md);
  if (fm.length !== plan.features.length) err(`المصفوفة 2.2 فيها ${fm.length} صفًا`);
  for (const r of fm) {
    const f = F[r.id];
    if (!f) { err(`ميزة في 2.2 غير موجودة في البيانات ${r.id}`); continue; }
    if (r.task !== f.task) err(`${r.id}: المهمة ${r.task} ≠ ${f.task}`);
    if (!same(r.supportTasks, f.supportTasks)) err(`${r.id}: المهام الداعمة تختلف`);
    if (!same(r.ac, f.ac)) err(`${r.id}: معايير القبول تختلف`);
    if (!same(r.tests, f.tests)) err(`${r.id}: الاختبارات تختلف`);
  }

  const pt = P.parseTasks(md);
  if (pt.length !== plan.tasks.length) err(`القسم 6 فيه ${pt.length} مهمة`);
  for (const r of pt) {
    const t = T[r.id];
    if (!t) { err(`مهمة في القسم 6 غير موجودة في البيانات ${r.id}`); continue; }
    if (!same(r.deps, t.deps)) err(`${r.id}: «تعتمد على» تختلف`);
    if (!same(r.decisions, t.decisions.map((g) => g.id))) err(`${r.id}: القرار المعلق يختلف`);
    if (!same(r.ac.map((a) => a.id), t.ac)) err(`${r.id}: معايير القبول تختلف`);
    if (!same(r.tests, t.tests)) err(`${r.id}: الاختبارات تختلف`);
    if (!same(r.features, t.features)) err(`${r.id}: الميزات تختلف`);
    if (!same(r.blockers.map((b) => b.id), t.blockers)) err(`${r.id}: الموانع تختلف`);
  }

  const dependents = {};
  plan.tasks.forEach((t) => { dependents[t.id] = []; });
  plan.tasks.forEach((t) => t.deps.forEach((d) => dependents[d].push(t.id)));
  const dt = P.parseDependencyTable(md);
  if (dt.length !== plan.tasks.length) err(`جدول 6.12 فيه ${dt.length} صفًا`);
  for (const r of dt) {
    const t = T[r.id];
    if (!t) { err(`صف غير معروف في 6.12 ${r.id}`); continue; }
    if (!same(r.deps, t.deps)) err(`6.12 ${r.id}: «تعتمد على» تختلف`);
    if (!same(r.opens, dependents[r.id])) err(`6.12 ${r.id}: «تفتح» لا تطابق المهام المعتمدة عليها`);
    if (!same(r.decisions, t.decisions.map((g) => g.id))) err(`6.12 ${r.id}: القرار يختلف`);
  }

  const tr = P.parseTests(md);
  if (!same(tr.map((x) => x.id), plan.tests.map((x) => x.id))) err('معرّفات سجل الاختبارات 7.3 تختلف عن البيانات');
  for (const r of tr) {
    const x = X[r.id];
    if (!x) continue;
    if (!same(r.tasks, x.tasks)) err(`${r.id}: المهام تختلف`);
    if (!same(r.features, x.features)) err(`${r.id}: الميزات تختلف`);
  }

  const br = P.parseBlockerRegistry(md);
  if (!same(br.map((b) => b.id), plan.blockers.map((b) => b.id))) err('سجل الموانع في 6.12 يختلف عن البيانات');
  for (const b of br) {
    const pb = plan.blockers.find((x) => x.id === b.id);
    if (pb && !same(b.tasks, pb.tasks)) err(`${b.id}: المهام تختلف`);
  }

  const counts = P.parseCounts(md);
  const want = {
    'الوحدات': 8, 'الميزات الفرعية': plan.features.length,
    'المهام (معرّفات `T-*`)': plan.tasks.length,
    'معايير القبول `AC-*`': plan.acceptance.length, 'الاختبارات `TEST-*`': plan.tests.length,
    'ميزانيات الأداء `PB-*` / معاملات المنتج `PP-*`': `${plan.budgets.length} / ${plan.params.length}`,
    'الفرضيات التي لم تثبت `HYP-*`': plan.hypotheses.length, 'القرارات `DEC-*`': plan.decisions.length,
    'الموانع المسماة `BLK-*`': plan.blockers.length, 'المقترحات الإضافية غير المعتمدة `P-OPT-*`': plan.proposals.length,
  };
  for (const [k, v] of Object.entries(want)) if (String(counts[k]) !== String(v)) err(`جدول 2.1: «${k}» = ${counts[k]} والمحسوب ${v}`);
  if (P.parseHypotheses(md).length !== plan.hypotheses.length) err('عدد الفرضيات في 8.2 يختلف');
  return errors;
}

/* منطق اشتقاق الحالات المشترك بين لوحة المتابعة وأداة التوليد (tools/build.mjs).
 * ملف عادي بلا وحدات حتى يعمل من file:// ومن Node عبر vm؛ يعرّف PlanDerive على الكائن العام. */
(function (root) {
  'use strict';

  var TASK_STATES = {
    done: { label: 'مكتملة', tone: 'ok' },
    implemented: { label: 'منفّذة وتنتظر الدمج', tone: 'info' },
    in_progress: { label: 'قيد التنفيذ', tone: 'info' },
    blocked: { label: 'متوقفة بمانع', tone: 'bad' },
    ready: { label: 'جاهزة للبدء', tone: 'ready' },
    ready_partial: { label: 'جاهزة جزئيًا', tone: 'ready' },
    awaiting_decision: { label: 'بانتظار قرار', tone: 'warn' },
    waiting: { label: 'بانتظار اعتماديات', tone: 'muted' }
  };
  var TEST_STATES = {
    planned: { label: 'مخطط (لم يُنفَّذ)', tone: 'muted' },
    conditional: { label: 'مشروط بقرار', tone: 'warn' },
    not_applicable: { label: 'لا ينطبق', tone: 'off' },
    passed: { label: 'اجتاز', tone: 'ok' },
    failed: { label: 'فشل', tone: 'bad' },
    blocked: { label: 'متوقف', tone: 'bad' }
  };
  var STORED_TASK = ['not_started', 'in_progress', 'implemented', 'done', 'blocked'];
  // صياغة حالات الموجة كما طلبها المالك: مكتوبة لا بالألوان وحدها.
  var WAVE_TASK_LABELS = { not_started: 'لم تبدأ', in_progress: 'جارٍ التنفيذ', blocked: 'متوقفة', implemented: 'منفّذة وتنتظر الدمج', done: 'مدمجة ومتحقق منها' };
  var STAGE_STATES = {
    not_started: { label: 'لم تبدأ', tone: 'muted' },
    in_progress: { label: 'جارٍ التنفيذ', tone: 'info' },
    blocked: { label: 'متوقفة', tone: 'bad' },
    ready_to_merge: { label: 'منفّذة وتنتظر الدمج', tone: 'ready' },
    merged: { label: 'مدمجة ومتحقق منها', tone: 'ok' }
  };
  var STORED_TEST = ['planned', 'passed', 'failed', 'blocked'];
  var TYPE_LABELS = { spike: 'تجربة جدوى', core: 'بنية', feature: 'ميزة', data: 'بيانات', enabler: 'تمكين', integration: 'تكامل' };
  var GATE_LABELS = { start: 'يوقف البدء', partial: 'يوقف جزءًا والإغلاق', none: 'لا يوقف شيئًا' };

  function byId(list) {
    var m = {};
    for (var i = 0; i < list.length; i++) m[list[i].id] = list[i];
    return m;
  }

  function index(plan) {
    if (plan.__ix) return plan.__ix;
    var ix = {
      tasks: byId(plan.tasks), features: byId(plan.features), tests: byId(plan.tests),
      ac: byId(plan.acceptance), decisions: byId(plan.decisions), phases: byId(plan.phases),
      modules: {}, dependents: {}
    };
    plan.modules.forEach(function (m) { ix.modules[m.code] = m; });
    plan.tasks.forEach(function (t) { ix.dependents[t.id] = []; });
    plan.tasks.forEach(function (t) { t.deps.forEach(function (d) { ix.dependents[d].push(t.id); }); });
    Object.defineProperty(plan, '__ix', { value: ix, enumerable: false });
    return ix;
  }

  function decisionChosen(plan, id) {
    var d = index(plan).decisions[id];
    return d && d.status === 'approved' && d.chosen ? d.chosen : null;
  }

  // هل ينطبق معيار أو اختبار؟ applies | conditional | not_applicable
  function applicability(plan, appliesIf) {
    if (!appliesIf) return 'applies';
    var chosen = decisionChosen(plan, appliesIf.decision);
    if (!chosen) return appliesIf.orPending ? 'applies' : 'conditional';
    // د-5 (تخيير المستخدم) يعني دعم الرمز؛ المجموعة المسموحة تُسجَّل مع القرار.
    return appliesIf.options.indexOf(chosen) >= 0 ? 'applies' : 'not_applicable';
  }

  function storedTask(status, id) {
    var s = status.tasks && status.tasks[id];
    return s && s.status ? s.status : 'not_started';
  }

  function taskState(plan, status, task) {
    var ix = index(plan);
    var stored = storedTask(status, task.id);
    var waitingOn = task.deps.filter(function (d) { return !depSatisfied(status, task.id, d); });
    var pending = task.decisions.filter(function (g) { return !decisionChosen(plan, g.id); });
    var startGates = pending.filter(function (g) { return g.gate === 'start'; });
    var partialGates = pending.filter(function (g) { return g.gate === 'partial'; });
    var key;
    if (stored === 'done' || stored === 'in_progress' || stored === 'blocked' || stored === 'implemented') key = stored;
    else if (waitingOn.length) key = 'waiting';
    else if (startGates.length) key = 'awaiting_decision';
    else if (partialGates.length) key = 'ready_partial';
    else key = 'ready';
    var note = '';
    if (key === 'waiting' && task.type === 'integration') note = 'يجوز العمل الجزئي فيها قبل اكتمال اعتمادياتها؛ والاعتماديات تحكم الإغلاق.';
    if (key === 'ready_partial') note = 'يبدأ الجزء المستقل؛ ويتوقف الإغلاق على: ' + partialGates.map(function (g) { return g.id; }).join('، ');
    return {
      key: key, label: TASK_STATES[key].label, tone: TASK_STATES[key].tone, stored: stored,
      waitingOn: waitingOn, pendingDecisions: pending.map(function (g) { return g.id; }), note: note,
      dependents: ix.dependents[task.id]
    };
  }

  function testState(plan, status, test) {
    var app = applicability(plan, test.appliesIf);
    var s = status.tests && status.tests[test.id];
    var stored = s && s.status ? s.status : 'planned';
    var key = app === 'not_applicable' ? 'not_applicable' : (app === 'conditional' && stored === 'planned' ? 'conditional' : stored);
    return { key: key, label: TEST_STATES[key].label, tone: TEST_STATES[key].tone, applicability: app, stored: stored };
  }

  // أطول مسار اعتماد لكل مهمة (موجة البدء الممكنة)؛ يرمي خطأ عند وجود دورة.
  function levels(plan) {
    var ix = index(plan), level = {}, visiting = {};
    function visit(id, trail) {
      if (level[id] !== undefined) return level[id];
      if (visiting[id]) throw new Error('اعتماد دائري: ' + trail.concat(id).join(' ← '));
      visiting[id] = true;
      var deps = ix.tasks[id].deps, l = 0;
      for (var i = 0; i < deps.length; i++) l = Math.max(l, visit(deps[i], trail.concat(id)) + 1);
      visiting[id] = false;
      level[id] = l;
      return l;
    }
    plan.tasks.forEach(function (t) { visit(t.id, []); });
    return level;
  }

  function criticalPath(plan) {
    var ix = index(plan), lv = levels(plan);
    var end = plan.tasks.reduce(function (a, t) { return lv[t.id] > lv[a.id] ? t : a; }, plan.tasks[0]);
    var path = [end.id], cur = end;
    while (cur.deps.length) {
      var next = cur.deps.reduce(function (a, d) { return lv[d] > lv[a] ? d : a; }, cur.deps[0]);
      path.unshift(next);
      cur = ix.tasks[next];
    }
    return path;
  }

  function phaseDeps(plan) {
    var ix = index(plan), out = {};
    plan.phases.forEach(function (p) { out[p.id] = []; });
    plan.tasks.forEach(function (t) {
      t.deps.forEach(function (d) {
        var from = ix.tasks[d].phase;
        if (from !== t.phase && out[t.phase].indexOf(from) < 0) out[t.phase].push(from);
      });
    });
    Object.keys(out).forEach(function (k) { out[k].sort(function (a, b) { return Number(a.slice(1)) - Number(b.slice(1)); }); });
    return out;
  }

  function summary(plan, status) {
    var tasks = { total: plan.tasks.length, byKey: {} };
    Object.keys(TASK_STATES).forEach(function (k) { tasks.byKey[k] = 0; });
    plan.tasks.forEach(function (t) { tasks.byKey[taskState(plan, status, t).key]++; });
    var tests = { total: plan.tests.length, byKey: {} };
    Object.keys(TEST_STATES).forEach(function (k) { tests.byKey[k] = 0; });
    plan.tests.forEach(function (t) { tests.byKey[testState(plan, status, t).key]++; });
    tests.executed = tests.byKey.passed + tests.byKey.failed;
    tests.inScope = tests.total - tests.byKey.not_applicable;
    var decisions = { total: plan.decisions.length, approved: plan.decisions.filter(function (d) { return d.status === 'approved'; }).length };
    var phases = plan.phases.map(function (p) {
      var ts = plan.tasks.filter(function (t) { return t.phase === p.id; });
      var done = ts.filter(function (t) { return storedTask(status, t.id) === 'done'; }).length;
      return { id: p.id, total: ts.length, done: done, pct: ts.length ? Math.round((100 * done) / ts.length) : 0 };
    });
    return {
      tasks: tasks, tests: tests, decisions: decisions, phases: phases,
      pctTasks: Math.round((100 * tasks.byKey.done) / tasks.total),
      pctTests: tests.inScope ? Math.round((100 * tests.byKey.passed) / tests.inScope) : 0
    };
  }

  // ---------- الموجات والمراحل ----------
  function stageIndex(status) {
    var pr = status.program;
    if (!pr) return null;
    if (pr.__six) return pr.__six;
    var six = { byTask: {}, stages: [] };
    pr.waves.forEach(function (w) { w.stages.forEach(function (s) { six.stages.push({ wave: w, stage: s }); s.tasks.forEach(function (t) { six.byTask[t] = s; }); }); });
    six.stages.sort(function (a, b) { return a.stage.num - b.stage.num; });
    Object.defineProperty(pr, '__six', { value: six, enumerable: false });
    return six;
  }
  function stageOf(status, id) { var six = stageIndex(status); return six ? six.byTask[id] || null : null; }
  // اعتمادية مستوفاة: مكتملة (مدمجة)، أو منفّذة على فرع المرحلة نفسها التي تضم المهمة.
  function depSatisfied(status, taskId, dep) {
    var st = storedTask(status, dep);
    if (st === 'done') return true;
    if (st === 'implemented') { var a = stageOf(status, taskId), b = stageOf(status, dep); return !!(a && b && a.id === b.id); }
    return false;
  }

  function stageState(plan, status, stage) {
    var entries = stage.tasks.map(function (id) { return status.tasks[id] || { status: 'not_started' }; });
    var has = function (k) { return entries.some(function (e) { return e.status === k; }); };
    var all = function (ks) { return entries.every(function (e) { return ks.indexOf(e.status) >= 0; }); };
    var key;
    if (stage.mergeCommit && all(['done'])) key = 'merged';
    else if (has('blocked')) key = 'blocked';
    else if (!stage.startedOn && all(['not_started'])) key = 'not_started';
    else if (all(['implemented', 'done']) && has('implemented')) key = 'ready_to_merge';
    else key = 'in_progress';
    var reasons = [];
    stage.tasks.forEach(function (id) { var e = status.tasks[id]; if (e && e.status === 'blocked') reasons.push(id + ': ' + (e.note || 'بلا سبب مسجَّل')); });
    return { key: key, label: STAGE_STATES[key].label, tone: STAGE_STATES[key].tone, blockedReasons: reasons };
  }

  // ما يمنع بدء المرحلة: مرحلة أسبق لم تُدمج، أو قرار معلّق يوقف بدء بعض مهامها أو إغلاقها.
  function stageBlockers(plan, status, x, stages) {
    var ix = index(plan), out = [], prev = null;
    stages.forEach(function (y) { if (y.stage.num < x.stage.num && y.state.key !== 'merged') prev = y; });
    if (prev) out.push({ kind: 'stage', text: 'تبدأ بعد دمج المرحلة ' + prev.stage.num + ' (' + prev.stage.title + ')' });
    var gates = {};
    x.stage.tasks.forEach(function (id) {
      ix.tasks[id].decisions.forEach(function (g) {
        if (decisionChosen(plan, g.id)) return;
        var e = gates[g.id] = gates[g.id] || { id: g.id, start: [], partial: [] };
        e[g.gate === 'start' ? 'start' : 'partial'].push(id);
      });
    });
    Object.keys(gates).forEach(function (k) {
      var g = gates[k];
      if (g.start.length) out.push({ kind: 'decision', id: k, text: '`' + k + '` معلّق: يوقف بدء ' + g.start.map(function (t) { return '`' + t + '`'; }).join(' و') + (g.start.length === x.stage.tasks.length ? ' (كل مهام المرحلة)' : ' فقط، وتبدأ البقية') });
      if (g.partial.length) out.push({ kind: 'decision', id: k, text: '`' + k + '` معلّق: يوقف إغلاق ' + g.partial.map(function (t) { return '`' + t + '`'; }).join(' و') + ' فقط' });
    });
    return out;
  }

  function fillCmd(tpl, n) { return String(tpl).replace('{n}', n); }

  // نظرة البرنامج: الموجات ومراحلها، والمرحلة الحالية، والخطوة التالية، ونص أمرَي البدء والدمج.
  function programView(plan, status) {
    var pr = status.program;
    if (!pr) return null;
    var six = stageIndex(status);
    var stages = six.stages.map(function (e) {
      return { wave: e.wave, stage: e.stage, state: stageState(plan, status, e.stage), startCmd: fillCmd(pr.commands.start, e.stage.num), mergeCmd: fillCmd(pr.commands.merge, e.stage.num) };
    });
    stages.forEach(function (x) { x.blockers = stageBlockers(plan, status, x, stages); });
    var current = null;
    for (var i = 0; i < stages.length; i++) { if (stages[i].state.key !== 'merged') { current = stages[i]; break; } }
    var count = function (ids) {
      var c = { total: ids.length, merged: 0, implemented: 0, active: 0 };
      ids.forEach(function (id) { var st = storedTask(status, id); if (st === 'done') c.merged++; else if (st === 'implemented') c.implemented++; else if (st === 'in_progress' || st === 'blocked') c.active++; });
      return c;
    };
    var waves = pr.waves.map(function (w) {
      var ws = stages.filter(function (x) { return x.wave.id === w.id; });
      var ids = []; w.stages.forEach(function (s) { ids = ids.concat(s.tasks); });
      var key = ws.every(function (x) { return x.state.key === 'merged'; }) ? 'merged' : ws.some(function (x) { return x.state.key !== 'not_started'; }) ? 'in_progress' : 'not_started';
      return { wave: w, stages: ws, counts: count(ids), state: { key: key, label: STAGE_STATES[key].label, tone: STAGE_STATES[key].tone }, isCurrent: !!(current && current.wave.id === w.id) };
    });
    var all = []; stages.forEach(function (x) { all = all.concat(x.stage.tasks); });
    var next;
    if (!current) next = { text: 'اكتملت كل الموجات: كل المراحل مدمجة ومتحقق منها.', cmd: null };
    else if (current.state.key === 'not_started') {
      var decBlk = current.blockers.filter(function (b) { return b.kind === 'decision'; });
      next = { text: 'أرسل في المحادثة: «' + current.startCmd + '»' + (current.stage.beforeStart && current.stage.beforeStart.length ? '، بعد قراءة ما يلزم قبل البدء' : '') + (decBlk.length ? '؛ والقرار المعلّق يوقف المهام المتأثرة به فقط' : '') + '.', cmd: current.startCmd };
    } else if (current.state.key === 'ready_to_merge') next = { text: 'المرحلة منفّذة على الفرع `' + current.stage.branch + '`. أرسل: «' + current.mergeCmd + '».', cmd: current.mergeCmd };
    else if (current.state.key === 'blocked') next = { text: 'المرحلة متوقفة: ' + current.state.blockedReasons.join('؛ ') + '. يلزم قرارك أو إزالة المانع.', cmd: null };
    else next = { text: 'التنفيذ جارٍ على الفرع `' + current.stage.branch + '`؛ لا يلزمك شيء الآن، وحدّث الصفحة لرؤية التقدم.', cmd: null };
    return { program: pr, waves: waves, stages: stages, current: current, next: next, counts: count(all) };
  }

  function taskModel(status, id) {
    var m = status.program && status.program.models;
    if (!m) return null;
    var ex = m.exceptions && m.exceptions[id];
    return ex ? { name: ex.name, id: ex.id, why: ex.why, isException: true } : { name: m.default.name, id: m.default.id, why: m.default.why, isException: false };
  }

  var api = {
    TASK_STATES: TASK_STATES, TEST_STATES: TEST_STATES, STORED_TASK: STORED_TASK, STORED_TEST: STORED_TEST,
    WAVE_TASK_LABELS: WAVE_TASK_LABELS, STAGE_STATES: STAGE_STATES, stageState: stageState, stageOf: stageOf, programView: programView, taskModel: taskModel,
    TYPE_LABELS: TYPE_LABELS, GATE_LABELS: GATE_LABELS,
    index: index, decisionChosen: decisionChosen, applicability: applicability, taskState: taskState,
    testState: testState, levels: levels, criticalPath: criticalPath, phaseDeps: phaseDeps, summary: summary
  };
  root.PlanDerive = api;
})(typeof window !== 'undefined' ? window : globalThis);

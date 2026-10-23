/* منطق اشتقاق الحالات المشترك بين لوحة المتابعة وأداة التوليد (tools/build.mjs).
 * ملف عادي بلا وحدات حتى يعمل من file:// ومن Node عبر vm؛ يعرّف PlanDerive على الكائن العام. */
(function (root) {
  'use strict';

  var TASK_STATES = {
    done: { label: 'مكتملة', tone: 'ok' },
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
  var STORED_TASK = ['not_started', 'in_progress', 'done', 'blocked'];
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
    var waitingOn = task.deps.filter(function (d) { return storedTask(status, d) !== 'done'; });
    var pending = task.decisions.filter(function (g) { return !decisionChosen(plan, g.id); });
    var startGates = pending.filter(function (g) { return g.gate === 'start'; });
    var partialGates = pending.filter(function (g) { return g.gate === 'partial'; });
    var key;
    if (stored === 'done' || stored === 'in_progress' || stored === 'blocked') key = stored;
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

  var api = {
    TASK_STATES: TASK_STATES, TEST_STATES: TEST_STATES, STORED_TASK: STORED_TASK, STORED_TEST: STORED_TEST,
    TYPE_LABELS: TYPE_LABELS, GATE_LABELS: GATE_LABELS,
    index: index, decisionChosen: decisionChosen, applicability: applicability, taskState: taskState,
    testState: testState, levels: levels, criticalPath: criticalPath, phaseDeps: phaseDeps, summary: summary
  };
  root.PlanDerive = api;
})(typeof window !== 'undefined' ? window : globalThis);

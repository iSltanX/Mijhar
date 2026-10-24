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

  // ---------- نظام MJ: الموجات والمراحل (من حمولة mj في data.js) ----------
  var STAGE_VIEW = {
    planned: { label: 'لم تبدأ', tone: 'muted', glyph: '○' },
    active: { label: 'جارٍ التنفيذ', tone: 'info', glyph: '◐' },
    blocked: { label: 'متوقفة', tone: 'bad', glyph: '✕' },
    ready: { label: 'جاهزة للدمج', tone: 'ready', glyph: '◉' },
    merged: { label: 'مدمجة ومتحقق منها', tone: 'ok', glyph: '✓' }
  };
  var WAVE_VIEW = {
    closed: { label: 'لم تُفتح', tone: 'muted' }, open: { label: 'مفتوحة', tone: 'ready' }, active: { label: 'جارية', tone: 'info' },
    ready: { label: 'جاهزة للدمج', tone: 'ready' }, merged: { label: 'مدمجة ومتحقق منها', tone: 'ok' }
  };
  // اعتمادية مستوفاة: مدمجة، أو منفّذة على فرع المرحلة نفسها التي تضم المهمة (حقل stage تضعه أداة التجميع).
  function depSatisfied(status, taskId, dep) {
    var a = status.tasks[taskId], b = status.tasks[dep];
    var st = b && b.status ? b.status : 'not_started';
    if (st === 'done') return true;
    if (st === 'implemented') return !!(a && b && a.stage && a.stage === b.stage);
    return false;
  }
  function stageKey(h) {
    if (h.delivery === 'merged') return 'merged';
    if (h.delivery === 'branch') return 'ready';
    if (h.status === 'blocked') return 'blocked';
    if (h.status === 'active') return 'active';
    return 'planned';
  }
  function fill(tpl, map) { return String(tpl).replace(/\{(\w+)\}/g, function (_, k) { return map[k] !== undefined ? map[k] : '{' + k + '}'; }); }
  function countTasks(status, ids) {
    var cnt = { total: ids.length, merged: 0, implemented: 0, active: 0 };
    ids.forEach(function (id) { var st = storedTask(status, id); if (st === 'done') cnt.merged++; else if (st === 'implemented') cnt.implemented++; else if (st === 'in_progress' || st === 'blocked') cnt.active++; });
    return cnt;
  }
  function tick(id) { return '`' + id + '`'; }
  function mjView(plan, status, mj) {
    if (!mj || !mj.waves || !mj.stages) return null;
    var ix = index(plan), W = mj.waves, letters = W.waves.map(function (w) { return w.id; });
    var byId = {}; mj.stages.forEach(function (s) { byId[s.id] = s; });
    var tagOf = {}; (mj.tags || []).forEach(function (t) { tagOf[t.name] = t.commit; });
    var waves = W.waves.map(function (w, wi) {
      var stages = w.order.map(function (id) { return byId[id]; }).filter(Boolean);
      var open = !!tagOf['mj-' + w.id + '/base'];
      // AD-34: الموجة ذات المرحلة الواحدة تُنفَّذ وتُراجَع ذاتيًا وتُدمج محليًا بأمر بدء مرحلتها؛ ولا أمر دمج منفصل.
      var oneSession = w.run === 'one-session';
      var views = stages.map(function (s) {
        var h = s.header, key = stageKey(h), blockers = [];
        if (!open) blockers.push({ kind: 'wave', text: 'الموجة ' + w.id + ' لم تُفتح بعد: لا وسم ' + tick('mj-' + w.id + '/base') + (wi > 0 ? '؛ يضعه منسّق الدمج عند إغلاق الموجة ' + letters[wi - 1] : '') });
        (h.depends || []).forEach(function (d) { var ds = byId[d]; if (ds && ds.header.delivery !== 'merged') blockers.push({ kind: 'stage', text: 'تنتظر دمج ' + tick(d) }); });
        var gates = {};
        (h.tasks || []).forEach(function (tid) {
          var t = ix.tasks[tid]; if (!t) return;
          t.decisions.forEach(function (g) { if (decisionChosen(plan, g.id)) return; var e = gates[g.id] = gates[g.id] || { start: [], partial: [] }; e[g.gate === 'start' ? 'start' : 'partial'].push(tid); });
        });
        Object.keys(gates).forEach(function (k) {
          var g = gates[k];
          if (g.start.length) blockers.push({ kind: 'decision', id: k, text: tick(k) + ' معلّق: يوقف بدء ' + g.start.map(tick).join(' و') + (g.start.length === (h.tasks || []).length ? ' (كل مهام المرحلة)' : ' فقط، وتبدأ البقية') });
          if (g.partial.length) blockers.push({ kind: 'decision', id: k, text: tick(k) + ' معلّق: يوقف إغلاق ' + g.partial.map(tick).join(' و') + ' فقط' });
        });
        var hard = blockers.filter(function (b) { return b.kind !== 'decision'; });
        var sv = STAGE_VIEW[key];
        return { stage: s, key: key, label: sv.label, tone: sv.tone, glyph: sv.glyph, blockers: blockers, canStart: key !== 'merged' && (key !== 'ready' || oneSession) && !hard.length, isResume: key === 'active' || key === 'blocked' || (oneSession && key === 'ready'), startCmd: fill(W.commands.start, { id: s.id }), source: s.source, counts: countTasks(status, h.tasks || []) };
      });
      var allMerged = views.length > 0 && views.every(function (v) { return v.key === 'merged'; });
      var allDelivered = views.length > 0 && views.every(function (v) { return v.key === 'merged' || v.key === 'ready'; });
      var anyStarted = views.some(function (v) { return v.key !== 'planned'; });
      var key = allMerged ? 'merged' : allDelivered ? 'ready' : anyStarted ? 'active' : open ? 'open' : 'closed';
      var mergeBlockers = [];
      var prevMerged = wi === 0 || W.waves[wi - 1].order.every(function (id) { return byId[id] && byId[id].header.delivery === 'merged'; });
      if (!prevMerged) mergeBlockers.push('تنتظر إغلاق الموجة ' + W.waves[wi - 1].id);
      else if (!open) mergeBlockers.push('الموجة لم تُفتح بعد (لا وسم ' + tick('mj-' + w.id + '/base') + ')');
      else views.forEach(function (v) { if (v.key !== 'ready' && v.key !== 'merged') mergeBlockers.push(tick(v.stage.id) + ' ' + v.label); });
      var ids = []; stages.forEach(function (s) { ids = ids.concat(s.header.tasks || []); });
      return { wave: w, stages: views, open: open, baseCommit: tagOf['mj-' + w.id + '/base'] || null, key: key, label: WAVE_VIEW[key].label, tone: WAVE_VIEW[key].tone, mergeBlockers: key === 'merged' ? [] : mergeBlockers, mergeCmd: oneSession ? null : fill(W.commands.merge, { wave: w.id }), oneSession: oneSession, counts: countTasks(status, ids), nextWave: letters[wi + 1] || null, isCurrent: false };
    });
    var current = null;
    for (var i = 0; i < waves.length; i++) { if (waves[i].key !== 'merged') { current = waves[i]; break; } }
    if (current) current.isCurrent = true;
    var all = []; mj.stages.forEach(function (s) { all = all.concat(s.header.tasks || []); });
    var next;
    if (!current) next = { kind: 'done', text: 'اكتملت كل الموجات: كل المراحل مدمجة ومتحقق منها.', cmd: null };
    else if (!current.open) next = { kind: 'wait', text: 'الموجة ' + current.wave.id + ' لم تُفتح بعد؛ يفتحها منسّق الدمج بوسم ' + tick('mj-' + current.wave.id + '/base') + ' عند إغلاق الموجة السابقة.', cmd: null };
    else if (current.key === 'ready' && current.oneSession) next = { kind: 'resume', text: tick(current.stages[0].stage.id) + ' سُلِّمت ولم تُدمج بعد: استأنف جلستها بأمرها «' + current.stages[0].startCmd + '» لتكمل المراجعة الذاتية والبوابة والدمج المحلي (AD-34)؛ لا جلسة دمج منفصلة.', cmd: current.stages[0].startCmd };
    else if (current.key === 'ready') next = { kind: 'merge', text: 'كل مراحل الموجة ' + current.wave.id + ' جاهزة للدمج. افتح جلسة في النسخة الرئيسية (بلا worktree) بمودل ' + current.wave.merge_model + ' وألصق: «' + current.mergeCmd + '». تراجع الجلسة الفروع بنفسها قبل الدمج؛ لا جلسة مراجعة لكل مرحلة.', cmd: current.mergeCmd };
    else {
      var startable = current.stages.filter(function (v) { return v.canStart; });
      var fresh = startable.filter(function (v) { return !v.isResume; }), resume = startable.filter(function (v) { return v.isResume; });
      var parts = [];
      if (fresh.length) parts.push('افتح جلسة worktree لكل من ' + fresh.map(function (v) { return tick(v.stage.id); }).join(' و') + ' بمودلها وألصق أمرها من صفها' + (fresh.length > 1 ? '؛ تعمل بالتوازي' : '') + (current.oneSession ? '. الموجة بجلسة واحدة (AD-34): تنفّذ الجلسة وتفحص وتراجع ذاتيًا ثم تدمج محليًا وتفتح الموجة التالية عند نجاح الفحوص، ولا جلسة دمج بعدها' : ''));
      if (resume.length) parts.push((fresh.length ? 'واستأنف ' : 'استأنف ') + resume.map(function (v) { return tick(v.stage.id); }).join(' و') + ' بإعادة أمرها في جلستها');
      next = { kind: 'start', text: (parts.length ? parts.join('؛ ') : 'مراحل الموجة ' + current.wave.id + ' كلها سُلِّمت أو تنتظر') + '.', cmd: startable.length === 1 ? startable[0].startCmd : null, startable: startable.map(function (v) { return v.stage.id; }) };
    }
    return { mj: mj, waves: waves, current: current, next: next, counts: countTasks(status, all), stageCount: mj.stages.length };
  }

  var api = {
    TASK_STATES: TASK_STATES, TEST_STATES: TEST_STATES, STORED_TASK: STORED_TASK, STORED_TEST: STORED_TEST,
    WAVE_TASK_LABELS: WAVE_TASK_LABELS, STAGE_VIEW: STAGE_VIEW, WAVE_VIEW: WAVE_VIEW, mjView: mjView, depSatisfied: depSatisfied,
    TYPE_LABELS: TYPE_LABELS, GATE_LABELS: GATE_LABELS,
    index: index, decisionChosen: decisionChosen, applicability: applicability, taskState: taskState,
    testState: testState, levels: levels, criticalPath: criticalPath, phaseDeps: phaseDeps, summary: summary
  };
  root.PlanDerive = api;
})(typeof window !== 'undefined' ? window : globalThis);

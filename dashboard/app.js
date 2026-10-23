/* لوحة متابعة الخطة. تقرأ window.PLAN_DATA (المولَّد) وتشتق الحالات بـ PlanDerive.
 * تعديلات الحالة تُحفظ في هذا المتصفح فقط، وتُصدَّر ملفًا يطبّقه المالك على data/status.json. */
(function () {
  'use strict';

  var DATA = window.PLAN_DATA;
  var D = window.PlanDerive;
  var main = document.getElementById('main');
  if (!DATA || !D) {
    main.innerHTML = '<p class="empty">تعذّر تحميل البيانات. شغّل <code dir="ltr">node tools/build.mjs</code> لتوليد <code dir="ltr">dashboard/data.js</code>.</p>';
    return;
  }
  var plan = DATA.plan;
  var projectStatus = DATA.status;
  var naming = DATA.naming;
  var ix = D.index(plan);
  var LS_OVERRIDES = 'mijhar-plan:status-overrides:v1';
  var LS_THEME = 'mijhar-plan:theme';

  // ---------- التخزين المحلي (محمي من الأخطاء) ----------
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { window.localStorage.removeItem(k); return true; } catch (e) { return false; } }
  function emptyOverrides() { return { tasks: {}, tests: {} }; }
  function loadOverrides() {
    try {
      var o = JSON.parse(lsGet(LS_OVERRIDES) || 'null');
      if (o && o.tasks && o.tests) return o;
    } catch (e) { /* ملف تالف: يُتجاهل */ }
    return emptyOverrides();
  }
  var saved = loadOverrides();
  var draft = emptyOverrides();
  var storageOk = lsSet('mijhar-plan:probe', '1') && lsDel('mijhar-plan:probe');

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function effectiveStatus() {
    var s = clone(projectStatus);
    [saved, draft].forEach(function (layer) {
      ['tasks', 'tests'].forEach(function (kind) {
        Object.keys(layer[kind]).forEach(function (id) { if (s[kind][id]) s[kind][id] = Object.assign({}, s[kind][id], layer[kind][id]); });
      });
    });
    return s;
  }
  function countKeys(o) { return Object.keys(o.tasks).length + Object.keys(o.tests).length; }

  // ---------- أدوات ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function routeFor(id) {
    if (/^T-\d+\.\d+$/.test(id)) return '#tasks/' + id;
    if (/^F-[A-H]\d$/.test(id)) return '#features/' + id;
    if (/^TEST-/.test(id)) return '#tests/' + id;
    if (/^DEC-\d+$/.test(id)) return '#decisions/' + id;
    if (/^P\d+$/.test(id)) return '#phases/' + id;
    return null;
  }
  function known(id) { return ix.tasks[id] || ix.features[id] || ix.tests[id] || ix.decisions[id]; }
  // تحويل محدود لنصوص Markdown داخل البيانات: `code` و**عريض** و_مائل_ والروابط.
  function md(s) {
    var h = esc(s);
    h = h.replace(/`([^`]+)`/g, function (_, x) {
      var raw = x.replace(/&amp;/g, '&');
      if (known(raw)) return '<a class="idlink" href="' + routeFor(raw) + '">' + x + '</a>';
      return '<code dir="ltr">' + x + '</code>';
    });
    h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[\s(])_([^_]+)_(?=[\s).،]|$)/g, '$1<em>$2</em>');
    h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    h = h.replace(/&lt;br&gt;/g, '<br>');
    return h;
  }
  function idLink(id) { var r = routeFor(id); return r ? '<a class="idlink" href="' + r + '">' + esc(id) + '</a>' : '<code dir="ltr">' + esc(id) + '</code>'; }
  function idLinks(ids) { return ids && ids.length ? '<span class="idlinks">' + ids.map(idLink).join('') + '</span>' : '<span class="muted">لا يوجد</span>'; }
  function chip(label, tone) { return '<span class="chip tone-' + tone + '">' + esc(label) + '</span>'; }
  function plainChip(label) { return '<span class="chip chip--plain">' + esc(label) + '</span>'; }
  function fileLink(path, label) { return '<a class="btn btn--ghost btn--sm" href="../' + esc(path) + '">' + esc(label) + '</a>'; }
  function moduleLabel(code) { var m = ix.modules[code]; return code === 'CORE' ? 'البنية والتكامل' : '(' + m.letter + ') ' + m.title; }
  function phaseLabel(pid) { var p = ix.phases[pid]; return 'المرحلة ' + p.num + ': ' + p.short; }
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[ً-ٰٟـ]/g, '')
      .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
  }
  function matches(hay, q) {
    if (!q) return true;
    var h = norm(hay);
    return norm(q).split(/\s+/).filter(Boolean).every(function (t) { return h.indexOf(t) >= 0; });
  }
  function today() { var d = new Date(); var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  // ---------- الحالة العامة للواجهة ----------
  var ui = { view: 'wave', target: null, q: '', phase: '', module: '', status: '', open: {} };
  var VIEWS = { wave: renderWave, summary: renderSummary, phases: renderPhases, tasks: renderTasks, features: renderFeatures, decisions: renderDecisions, tests: renderTests, names: renderNames };
  var FILTERABLE = { wave: false, phases: true, tasks: true, features: true, tests: true, decisions: 'search', names: 'search', summary: false };

  var qEl = document.getElementById('q');
  var fPhase = document.getElementById('fPhase');
  var fModule = document.getElementById('fModule');
  var fStatus = document.getElementById('fStatus');
  var countEl = document.getElementById('resultCount');

  function fillSelect(el, opts) { el.innerHTML = opts.map(function (o) { return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join(''); }
  fillSelect(fPhase, [['', 'كل المراحل']].concat(plan.phases.map(function (p) { return [p.id, p.num + '. ' + p.title]; })));
  fillSelect(fModule, [['', 'كل الوحدات']].concat(plan.modules.map(function (m) { return [m.code, moduleLabel(m.code)]; })));
  function fillStatus() {
    var states = ui.view === 'tests' ? D.TEST_STATES : D.TASK_STATES;
    fillSelect(fStatus, [['', 'كل الحالات']].concat(Object.keys(states).map(function (k) { return [k, states[k].label]; })));
    fStatus.value = states[ui.status] ? ui.status : '';
    ui.status = fStatus.value;
  }

  // ---------- مطابقة الفلاتر ----------
  function taskPasses(t, st) {
    if (ui.phase && t.phase !== ui.phase) return false;
    if (ui.module && t.modules.indexOf(ui.module) < 0) return false;
    if (ui.status && D.taskState(plan, st, t).key !== ui.status) return false;
    var hay = [t.id, t.title, t.goal, t.typeText, t.outputs.join(' '), t.ac.map(function (a) { return a + ' ' + ix.ac[a].text; }).join(' '), t.tests.join(' '), t.features.join(' '), t.decisions.map(function (g) { return g.id; }).join(' ')].join(' ');
    return matches(hay, ui.q);
  }
  function testPasses(x, st) {
    var tasks = x.tasks.map(function (id) { return ix.tasks[id]; });
    if (ui.phase && !tasks.some(function (t) { return t.phase === ui.phase; })) return false;
    if (ui.module && !tasks.some(function (t) { return t.modules.indexOf(ui.module) >= 0; })) return false;
    if (ui.status && D.testState(plan, st, x).key !== ui.status) return false;
    return matches([x.id, x.level, x.env, x.checks, x.tasks.join(' '), x.ac.join(' '), x.features.join(' ')].join(' '), ui.q);
  }
  function featurePasses(f, st) {
    var t = ix.tasks[f.task];
    if (ui.phase && t.phase !== ui.phase && !f.supportTasks.some(function (s) { return ix.tasks[s].phase === ui.phase; })) return false;
    if (ui.module && f.module !== ui.module) return false;
    if (ui.status && D.taskState(plan, st, t).key !== ui.status) return false;
    return matches([f.id, f.title, f.task, f.supportTasks.join(' '), f.ac.join(' '), f.tests.join(' '), f.statusText].join(' '), ui.q);
  }

  // ---------- مكوّنات العرض ----------
  function itemHead(id, title, metaHtml) {
    var open = !!ui.open[id];
    return '<button type="button" class="item__head" aria-expanded="' + open + '" aria-controls="b-' + esc(id) + '" data-toggle="' + esc(id) + '">' +
      '<span class="item__id">' + esc(id) + '</span><span class="item__title">' + md(title) + '</span>' +
      '<span class="item__meta">' + metaHtml + '<span class="item__chev" aria-hidden="true">▾</span></span></button>';
  }
  function itemWrap(id, head, body) {
    return '<article class="item' + (ui.target === id ? ' is-target' : '') + '" id="item-' + esc(id) + '">' + head +
      '<div class="item__body" id="b-' + esc(id) + '"' + (ui.open[id] ? '' : ' hidden') + '>' + (ui.open[id] ? body() : '') + '</div></article>';
  }
  function meter(label, done, total, note) {
    var pct = total ? Math.round((100 * done) / total) : 0;
    return '<div class="meter"><div class="meter__top"><span>' + esc(label) + '</span><strong>' + done + ' من ' + total + ' (' + pct + '%)</strong></div>' +
      '<div class="meter__bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + done + '" aria-label="' + esc(label) + '"><div class="meter__fill" style="width:' + pct + '%"></div></div>' +
      (note ? '<p class="muted" style="font-size:.85rem;margin:4px 0 0">' + md(note) + '</p>' : '') + '</div>';
  }
  function stackBar(counts, states) {
    var total = Object.keys(counts).reduce(function (a, k) { return a + counts[k]; }, 0) || 1;
    var bar = Object.keys(states).filter(function (k) { return counts[k]; }).map(function (k) {
      return '<span class="bg-' + states[k].tone + '" style="width:' + (100 * counts[k]) / total + '%" title="' + esc(states[k].label + ': ' + counts[k]) + '"></span>';
    }).join('');
    var legend = Object.keys(states).filter(function (k) { return counts[k]; }).map(function (k) {
      return '<li><i class="bg-' + states[k].tone + '"></i>' + esc(states[k].label) + ': ' + counts[k] + '</li>';
    }).join('');
    return '<div class="stack" aria-hidden="true">' + bar + '</div><ul class="legend">' + legend + '</ul>';
  }

  function editBox(kind, id, st) {
    var cur = st[kind][id];
    var opts = kind === 'tasks' ? D.STORED_TASK : D.STORED_TEST;
    var labels = kind === 'tasks'
      ? { not_started: 'لم تبدأ', in_progress: 'قيد التنفيذ', implemented: 'منفّذة وتنتظر الدمج', done: 'مكتملة', blocked: 'متوقفة بمانع' }
      : { planned: 'مخطط (لم يُنفَّذ)', passed: 'اجتاز', failed: 'فشل', blocked: 'متوقف' };
    var needEv = kind === 'tasks' ? cur.status === 'done' : (cur.status === 'passed' || cur.status === 'failed');
    var evEmpty = !(cur.evidence || []).length;
    var needNote = kind === 'tasks' && cur.status === 'blocked' && !cur.note;
    var err = needEv && evEmpty ? 'هذه الحالة تتطلب دليلًا: مسار تقرير في evidence/ أو رابط.' : (needNote ? '«متوقفة بمانع» تتطلب ذكر المانع في الملاحظة.' : '');
    return '<div class="edit" data-kind="' + kind + '" data-id="' + esc(id) + '">' +
      '<p class="edit__title">تسجيل الحالة (يُحفظ في هذا المتصفح فقط)</p>' +
      '<label class="field"><span class="field__label">الحالة المسجلة</span><select data-edit="status">' +
      opts.map(function (o) { return '<option value="' + o + '"' + (o === cur.status ? ' selected' : '') + '>' + labels[o] + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="field__label">الدليل (مسار أو رابط؛ افصل بفاصلة)</span><input type="text" dir="ltr" data-edit="evidence" value="' + esc((cur.evidence || []).join(', ')) + '" placeholder="evidence/' + esc(id) + '/report.md"></label>' +
      '<label class="field"><span class="field__label">ملاحظة</span><input type="text" data-edit="note" value="' + esc(cur.note || '') + '"></label>' +
      (err ? '<p class="edit__error" role="alert">' + esc(err) + '</p>' : '') +
      '<p class="edit__hint">الحالة المشتقة (جاهزة، بانتظار قرار…) تُحسب تلقائيًا ولا تُكتب يدويًا.</p></div>';
  }

  // ---------- الملخص ----------
  function decisionOrder() {
    return plan.decisions.map(function (d) {
      var phases = d.carriers.map(function (t) { return ix.phases[ix.tasks[t].phase].num; });
      plan.tasks.forEach(function (t) { (t.affectedBy || []).forEach(function (a) { if (a.id === d.id) phases.push(ix.phases[t.phase].num); }); });
      return { d: d, first: phases.length ? Math.min.apply(null, phases) : 99 };
    }).sort(function (a, b) { return a.first - b.first; });
  }
  function renderSummary(st) {
    var s = D.summary(plan, st);
    var ready = plan.tasks.filter(function (t) { var k = D.taskState(plan, st, t).key; return k === 'ready' || k === 'ready_partial'; });
    var lv = D.levels(plan);
    var crit = D.criticalPath(plan);
    var stats = [['8', 'وحدات'], [plan.features.length, 'ميزة فرعية'], [plan.tasks.length, 'مهمة'], [plan.acceptance.length, 'معيار قبول'], [plan.tests.length, 'اختبارًا معرَّفًا'], [plan.decisions.length, 'قرارات معلّقة']];
    var h = '';
    h += '<section class="section"><div class="card hero"><h1>مِجهَر <bdi class="ltr">(Mijhar)</bdi>: إضافة متصفح عربية مساعدة فوق صفحات GitHub</h1>' +
      '<p class="lead">طبقة تعمل داخل صفحات <bdi class="ltr">github.com</bdi> الحقيقية: اتجاه عربي وقراءة مريحة، وشرح المصطلحات والأزرار، وترجمة تقنية محلية تحفظ الكود، وفهم حالة طلبات الدمج والفحوص، وحزم سياق للنماذج والزملاء، ومساعدة في البلاغات والمراجعات، وملاحظات خاصة و«أكمل لاحقًا»، وإرشاد أول مساهمة. ثماني وحدات و47 ميزة كاملة دون تقليص.</p>' +
      '<p class="notice"><span aria-hidden="true">ⓘ</span><span><strong>مرحلة التخطيط:</strong> لم تبدأ برمجة الإضافة، ولم يُنفَّذ أي اختبار. كل رقم تقدّم هنا مشتق من الحالات المسجلة بأدلة، وهو صفر الآن.</span></p></div></section>';
    h += '<section class="section"><div class="grid grid--stats">' + stats.map(function (x) { return '<div class="card stat"><div class="stat__num">' + x[0] + '</div><p class="stat__label">' + x[1] + '</p></div>'; }).join('') + '</div></section>';
    h += '<section class="section grid grid--2">';
    h += '<div class="card"><h2>التقدم الفعلي</h2>' +
      meter('المهام المكتملة بدليل', s.tasks.byKey.done, s.tasks.total) +
      meter('الاختبارات المنفّذة (اجتاز أو فشل)', s.tests.executed, s.tests.inScope, 'من الاختبارات التي لا تُستبعد بقرار؛ منها ' + s.tests.byKey.conditional + ' مشروطة بـ`DEC-04`.') +
      meter('القرارات المعتمدة', s.decisions.approved, s.decisions.total) +
      '<h3 style="margin-top:18px">توزيع حالات المهام</h3>' + stackBar(s.tasks.byKey, D.TASK_STATES) + '</div>';
    h += '<div class="card"><h2>يمكن بدؤه الآن</h2><p class="muted">مهام اكتملت اعتمادياتها ولا يوقفها قرار؛ تبدأ بعد موافقتك على التنفيذ.</p><ul class="plain-list">' +
      ready.map(function (t) { return '<li>' + idLink(t.id) + ' ' + md(t.title) + '</li>'; }).join('') + '</ul>' +
      '<h3 style="margin-top:18px">القرارات حسب أبكر مرحلة تحتاجها</h3><ol class="plain-list">' +
      decisionOrder().map(function (o) { return '<li>' + idLink(o.d.id) + ' ' + md(o.d.topic) + ' — <span class="muted">' + md(o.d.neededBy.point) + '</span></li>'; }).join('') + '</ol></div>';
    h += '</section>';
    h += '<section class="section"><div class="section__head"><h2>تقدم المراحل</h2><p>الطبقة = موضع المرحلة في ترتيب الاعتماديات</p></div><div class="grid grid--3">';
    var pdeps = D.phaseDeps(plan), plv = {};
    function pl(id) { if (plv[id] === undefined) plv[id] = pdeps[id].length ? Math.max.apply(null, pdeps[id].map(pl)) + 1 : 0; return plv[id]; }
    plan.phases.forEach(function (p) {
      var ps = s.phases.filter(function (x) { return x.id === p.id; })[0];
      h += '<a class="card" style="text-decoration:none;color:inherit" href="#phases/' + p.id + '"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h3 style="margin:0">' + esc(p.num + '. ' + p.short) + '</h3>' + plainChip('الطبقة ' + pl(p.id)) + '</div>' +
        meter('مهام مكتملة', ps.done, ps.total) + '</a>';
    });
    h += '</div></section>';
    h += '<section class="section card"><h2>أطول سلسلة اعتماديات</h2><p class="muted">' + crit.length + ' مهام؛ أي تأخير عليها يؤخر إغلاق التكامل.</p><p class="idlinks">' + crit.map(idLink).join('<span aria-hidden="true">←</span>') + '</p>' +
      '<p class="muted" style="margin:0">أكبر موجة بدء: ' + (Math.max.apply(null, Object.keys(lv).map(function (k) { return lv[k]; })) + 1) + ' موجات؛ التفصيل في <a href="../ROADMAP.md">ROADMAP.md</a>.</p></section>';
    return { html: h, count: null };
  }

  // ---------- المراحل ----------
  function renderPhases(st) {
    var pdeps = D.phaseDeps(plan);
    var s = D.summary(plan, st);
    var shown = plan.phases.filter(function (p) {
      if (ui.phase && p.id !== ui.phase) return false;
      var ts = plan.tasks.filter(function (t) { return t.phase === p.id; });
      if (ui.module || ui.status) {
        if (!ts.some(function (t) { return (!ui.module || t.modules.indexOf(ui.module) >= 0) && (!ui.status || D.taskState(plan, st, t).key === ui.status); })) return false;
      }
      return matches([p.id, p.title, p.goal, p.inputs.join(' '), p.handoff, ts.map(function (t) { return t.id + ' ' + t.title; }).join(' ')].join(' '), ui.q);
    });
    var h = '<div class="section__head"><h1>المراحل</h1><p>المراحل تجميع للعرض؛ البدء الفعلي بالاعتماديات بين المهام.</p></div><div class="items">';
    shown.forEach(function (p) {
      var ts = plan.tasks.filter(function (t) { return t.phase === p.id; });
      var ps = s.phases.filter(function (x) { return x.id === p.id; })[0];
      var decs = []; ts.forEach(function (t) { t.decisions.forEach(function (g) { if (decs.indexOf(g.id) < 0) decs.push(g.id); }); });
      var meta = plainChip(ts.length + ' مهام') + chip(ps.done + '/' + ps.total + ' مكتملة', ps.done ? 'ok' : 'muted') + (decs.length ? chip(decs.join('، '), 'warn') : '');
      h += itemWrap(p.id, itemHead(p.id, p.title, meta), function () {
        var later = plan.phases.filter(function (q) { return pdeps[q.id].indexOf(p.id) >= 0; });
        return '<p>' + md(p.goal) + '</p>' + meter('التقدم', ps.done, ps.total) +
          '<dl class="kv"><dt>تعتمد على</dt><dd>' + (pdeps[p.id].length ? idLinks(pdeps[p.id]) : 'لا تعتمد على مرحلة أخرى') + '</dd>' +
          '<dt>تعتمد عليها</dt><dd>' + (later.length ? idLinks(later.map(function (q) { return q.id; })) : 'لا شيء') + '</dd>' +
          '<dt>المهام</dt><dd><ul>' + ts.map(function (t) { var k = D.taskState(plan, st, t); return '<li>' + idLink(t.id) + ' ' + md(t.title) + ' ' + chip(k.label, k.tone) + '</li>'; }).join('') + '</ul></dd>' +
          '<dt>المدخلات</dt><dd><ul>' + p.inputs.map(function (x) { return '<li>' + md(x) + '</li>'; }).join('') + '</ul></dd>' +
          '<dt>المخرجات</dt><dd><ul>' + ts.map(function (t) { return '<li>' + idLink(t.id) + ' ' + md(t.outputs.join(' ')) + '</li>'; }).join('') + '</ul></dd>' +
          '<dt>الاختبارات</dt><dd>' + idLinks(uniq(flat(ts.map(function (t) { return t.tests; })))) + '</dd>' +
          '<dt>التسليم</dt><dd>' + md(p.handoff) + '</dd></dl>' +
          '<div class="files">' + fileLink(p.file, 'ملف المرحلة') + fileLink('ROADMAP.md', 'خريطة الطريق') + '<a class="btn btn--ghost btn--sm" href="#tasks" data-setphase="' + p.id + '">مهام المرحلة</a></div>';
      });
    });
    h += '</div>';
    if (!shown.length) h += '<p class="empty">لا مراحل تطابق البحث والفلاتر.</p>';
    return { html: h, count: shown.length + ' من ' + plan.phases.length + ' مرحلة' };
  }
  function flat(a) { return a.reduce(function (x, y) { return x.concat(y); }, []); }
  function uniq(a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); }

  // ---------- المهام ----------
  function taskBody(t, st) {
    var k = D.taskState(plan, st, t);
    var acs = t.ac.map(function (a) {
      var A = ix.ac[a]; var app = D.applicability(plan, A.appliesIf);
      var tag = A.appliesIf ? ' ' + chip(app === 'applies' ? 'ينطبق' : app === 'conditional' ? 'مشروط: ' + A.appliesIf.label : 'لا ينطبق', app === 'applies' ? 'ok' : app === 'conditional' ? 'warn' : 'off') : '';
      return '<li><code dir="ltr">' + esc(a) + '</code>' + (A.branch ? ' (' + esc(A.branch) + ')' : '') + tag + ': ' + md(A.text) + '</li>';
    }).join('');
    var tests = t.tests.map(function (x) { var s = D.testState(plan, st, ix.tests[x]); return '<li>' + idLink(x) + ' ' + chip(s.label, s.tone) + ' <span class="muted">' + esc(ix.tests[x].level) + '</span></li>'; }).join('');
    return '<p>' + md(t.goal) + '</p>' + (t.branches ? '<p class="rec">' + md(t.branches) + '</p>' : '') +
      '<dl class="kv"><dt>الحالة</dt><dd>' + chip(k.label, k.tone) + (k.waitingOn.length ? ' تنتظر: ' + idLinks(k.waitingOn) : '') + (k.note ? '<br><span class="muted">' + md(k.note) + '</span>' : '') + '</dd>' +
      '<dt>المرحلة والوحدة</dt><dd>' + idLink(t.phase) + ' ' + esc(phaseLabel(t.phase)) + ' — ' + t.modules.map(function (m) { return esc(moduleLabel(m)); }).join('، ') + '</dd>' +
      '<dt>الميزات</dt><dd>' + idLinks(t.features) + '</dd>' +
      '<dt>تعتمد على</dt><dd>' + idLinks(t.deps) + '</dd>' +
      '<dt>تفتح</dt><dd>' + idLinks(ix.dependents[t.id]) + '</dd>' +
      '<dt>قرار يخصها</dt><dd>' + (t.decisions.length ? t.decisions.map(function (g) { return idLink(g.id) + ' ' + chip(D.GATE_LABELS[g.gate], 'warn') + ' ' + md(g.note); }).join('<br>') : 'لا يوجد') +
      ((t.affectedBy || []).length ? '<br><span class="muted">يمسّ نطاقها:</span> ' + t.affectedBy.map(function (a) { return idLink(a.id) + ' ' + md(a.note); }).join(' ') : '') + '</dd>' +
      '<dt>المخرجات</dt><dd><ul>' + t.outputs.map(function (o) { return '<li>' + md(o) + '</li>'; }).join('') + '</ul></dd>' +
      '<dt>معايير القبول</dt><dd><ul>' + acs + '</ul></dd>' +
      '<dt>الاختبارات</dt><dd><ul>' + tests + '</ul></dd>' +
      (t.blockers.length ? '<dt>الموانع المسماة</dt><dd><ul>' + t.blockers.map(function (b) { var B = plan.blockers.filter(function (x) { return x.id === b; })[0]; return '<li><code dir="ltr">' + esc(b) + '</code>: ' + md(B.text) + '</li>'; }).join('') + '</ul></dd>' : '') +
      (t.note ? '<dt>ملاحظة</dt><dd>' + md(t.note) + '</dd>' : '') + '</dl>' +
      editBox('tasks', t.id, st) +
      '<div class="files">' + fileLink(ix.phases[t.phase].file + '#' + t.id, 'في ملف المرحلة') + fileLink('TRACEABILITY.md', 'التتبع') + fileLink('STATUS.md', 'الحالة') + '</div>';
  }
  function renderTasks(st) {
    var h = '<div class="section__head"><h1>المهام واعتمادياتها</h1><p>اضغط مهمة لعرض تفاصيلها؛ والمعرّفات روابط تنقلك إليها.</p></div>';
    var n = 0;
    plan.phases.forEach(function (p) {
      var ts = plan.tasks.filter(function (t) { return t.phase === p.id && taskPasses(t, st); });
      if (!ts.length) return;
      n += ts.length;
      h += '<section class="group"><div class="group__title"><h2>' + esc(p.num + '. ' + p.title) + '</h2>' + plainChip(ts.length + ' مهام') + '</div><div class="items">';
      ts.forEach(function (t) {
        var k = D.taskState(plan, st, t);
        var meta = plainChip(D.TYPE_LABELS[t.type]) + (t.decisions.length ? chip(t.decisions.map(function (g) { return g.id; }).join('، '), 'warn') : '') + chip(k.label, k.tone);
        h += itemWrap(t.id, itemHead(t.id, t.title, meta), function () { return taskBody(t, st); });
      });
      h += '</div></section>';
    });
    if (!n) h += '<p class="empty">لا مهام تطابق البحث والفلاتر.</p>';
    return { html: h, count: n + ' من ' + plan.tasks.length + ' مهمة' };
  }

  // ---------- الميزات ----------
  function renderFeatures(st) {
    var h = '<div class="section__head"><h1>الميزات والتتبع</h1><p>كل ميزة ← مهمتها المنفِّذة ومرحلتها ← معيار القبول ← الاختبارات. الحالة هي حالة المهمة المنفِّذة.</p></div>';
    var n = 0;
    plan.modules.filter(function (m) { return m.code !== 'CORE'; }).forEach(function (m) {
      var fs = plan.features.filter(function (f) { return f.module === m.code && featurePasses(f, st); });
      if (!fs.length) return;
      n += fs.length;
      h += '<section class="group"><div class="group__title"><h2>الوحدة (' + esc(m.letter) + '): ' + esc(m.title) + '</h2>' + plainChip(fs.length + ' ميزات') + '</div><div class="items">';
      fs.forEach(function (f) {
        var t = ix.tasks[f.task]; var k = D.taskState(plan, st, t);
        var meta = '<span class="idlinks">' + idLink(f.task) + '</span>' + chip(k.label, k.tone);
        h += itemWrap(f.id, itemHead(f.id, f.title, meta), function () {
          return '<dl class="kv"><dt>الحالة في الخطة</dt><dd>' + md(f.statusText) + '</dd>' +
            '<dt>المهمة المنفِّذة</dt><dd>' + idLink(f.task) + ' ' + md(t.title) + ' — ' + esc(phaseLabel(t.phase)) + '</dd>' +
            '<dt>المهام الداعمة</dt><dd>' + idLinks(f.supportTasks) + '</dd>' +
            '<dt>معيار القبول</dt><dd><ul>' + f.ac.map(function (a) { return '<li><code dir="ltr">' + esc(a) + '</code>: ' + md(ix.ac[a].text) + '</li>'; }).join('') + '</ul></dd>' +
            '<dt>الاختبارات</dt><dd><ul>' + f.tests.map(function (x) { var s = D.testState(plan, st, ix.tests[x]); return '<li>' + idLink(x) + ' ' + chip(s.label, s.tone) + '</li>'; }).join('') + '</ul></dd>' +
            '<dt>المرجع</dt><dd>البند ' + esc(f.reqRef) + ' — ' + esc(f.specRef) + '</dd></dl>' +
            '<div class="files">' + fileLink('TRACEABILITY.md', 'التتبع') + fileLink(ix.phases[t.phase].file + '#' + t.id, 'المهمة في ملف المرحلة') + '</div>';
        });
      });
      h += '</div></section>';
    });
    if (!n) h += '<p class="empty">لا ميزات تطابق البحث والفلاتر.</p>';
    return { html: h, count: n + ' من ' + plan.features.length + ' ميزة' };
  }

  // ---------- القرارات ----------
  function renderDecisions() {
    var pend = plan.decisions.filter(function (d) {
      return matches([d.id, d.topic, d.scope, d.recommendation && d.recommendation.text, d.options.map(function (o) { return o.key + ' ' + o.title + ' ' + o.impact; }).join(' '), d.testsImpact].join(' '), ui.q);
    });
    var h = '<div class="section__head"><h1>القرارات</h1><p>التوصية رأي غير ملزم؛ لا يُنفَّذ أي خيار قبل اعتمادك. للاعتماد: أخبرني بالخيار.</p></div>';
    h += '<div class="items">';
    decisionOrder().map(function (o) { return o.d; }).filter(function (d) { return pend.indexOf(d) >= 0; }).forEach(function (d) {
      var meta = chip(d.status === 'approved' ? 'معتمد: ' + d.chosen + (d.chosenLabel ? ' — ' + d.chosenLabel : '') : 'معلق', d.status === 'approved' ? 'ok' : 'warn') + plainChip(D.GATE_LABELS[d.gate]);
      h += itemWrap(d.id, itemHead(d.id, d.topic, meta), function () {
        var opts = d.options.map(function (o) {
          var isRec = d.status === 'approved' ? d.chosen === o.key : d.recommendation && d.recommendation.option === o.key;
          return '<div class="option' + (isRec ? ' is-rec' : '') + '"><p style="margin:0 0 4px"><span class="option__key">' + esc(o.key) + '</span><strong>' + md(o.title) + '</strong>' + (isRec ? ' ' + chip(d.status === 'approved' ? 'المعتمد' : 'توصيتي', d.status === 'approved' ? 'ok' : 'ready') : '') + '</p><p style="margin:0" class="muted">' + md(o.impact) + '</p></div>';
        }).join('');
        var extra = '';
        if (d.id === 'DEC-07') {
          extra = '<h3 style="margin-top:16px">تقييم المقترحات الستة (كلها خارج النطاق حتى تعتمدها)</h3><table class="tbl"><thead><tr><th>المقترح</th><th>الوصف</th><th>القيمة</th><th>الكلفة</th><th>المخاطرة</th><th>توصيتي</th></tr></thead><tbody>' +
            plan.proposals.map(function (p) { return '<tr><td data-label="المقترح"><code dir="ltr">' + esc(p.id) + '</code> ' + chip(p.status === 'approved' ? 'معتمد' : 'معلق', p.status === 'approved' ? 'ok' : 'muted') + '</td><td data-label="الوصف"><strong>' + md(p.title) + ':</strong> ' + md(p.text) + '</td><td data-label="القيمة">' + md(p.value) + '</td><td data-label="الكلفة">' + md(p.cost) + '</td><td data-label="المخاطرة">' + md(p.risk) + '</td><td data-label="توصيتي">' + md(p.recommendation) + '</td></tr>'; }).join('') + '</tbody></table>';
        }
        return '<p>' + md(d.scope) + '</p><dl class="kv"><dt>يلزم حسمه</dt><dd>' + md(d.neededBy.point) + (d.neededBy.phase ? ' — ' + idLink(d.neededBy.phase) : '') + '<br><span class="muted">' + md(d.neededBy.note) + '</span></dd>' +
          '<dt>المهام الحاملة</dt><dd>' + idLinks(d.carriers) + '</dd>' +
          '<dt>مدخلات تفيده</dt><dd>' + idLinks(d.informedBy) + '</dd>' +
          '<dt>ما يستمر حتى حسمه</dt><dd>' + md(d.meanwhile) + '</dd>' +
          '<dt>أثره على الاختبارات</dt><dd>' + md(d.testsImpact) + '</dd></dl>' +
          '<h3 style="margin-top:16px">الخيارات وأثر كل خيار</h3>' + opts +
          (d.recommendation ? '<div class="rec"><strong>توصيتي (غير ملزمة): ' + esc(d.recommendation.option) + '.</strong> ' + md(d.recommendation.text) + '</div>' : '') +
          (d.sources ? '<p class="muted" style="margin-top:10px">مصادر: ' + d.sources.map(function (s) { return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener noreferrer">' + esc(s.title) + '</a> (' + md(s.note) + ')'; }).join('؛ ') + '</p>' : '') +
          extra + '<div class="files">' + fileLink('DECISIONS.md', 'DECISIONS.md') + (d.id === 'DEC-06' ? fileLink('NAMING.md', 'NAMING.md') : '') + '</div>';
      });
    });
    h += '</div>';
    var ad = plan.approved.filter(function (a) { return matches([a.id, a.title, a.text, a.source].join(' '), ui.q); });
    if (ad.length) {
      h += '<section class="section" style="margin-top:28px"><h2>القرارات المعتمدة</h2><table class="tbl"><thead><tr><th>المعرّف</th><th>القرار</th><th>النص</th><th>المصدر</th></tr></thead><tbody>' +
        ad.map(function (a) { return '<tr><td data-label="المعرّف"><code dir="ltr">' + esc(a.id) + '</code></td><td data-label="القرار"><strong>' + esc(a.title) + '</strong></td><td data-label="النص">' + md(a.text) + '</td><td data-label="المصدر">' + md(a.source) + '</td></tr>'; }).join('') + '</tbody></table></section>';
    }
    if (!pend.length && !ad.length) h += '<p class="empty">لا قرارات تطابق البحث.</p>';
    return { html: h, count: pend.length + ' من ' + plan.decisions.length + ' قرارات معلّقة' + (ui.q ? '، و' + ad.length + ' معتمدة' : '') };
  }

  // ---------- الاختبارات ----------
  function renderTests(st) {
    var shown = plan.tests.filter(function (x) { return testPasses(x, st); });
    var s = D.summary(plan, st);
    var h = '<div class="section__head"><h1>الاختبارات</h1><p>كلها <strong>مخططة لم تُنفَّذ</strong>؛ لا يُعدّ أيٌّ منها نتيجة نجاح قبل تقرير تنفيذ بدليل.</p></div>';
    h += '<div class="card" style="margin-bottom:16px">' + stackBar(s.tests.byKey, D.TEST_STATES) + '</div><div class="items">';
    shown.forEach(function (x) {
      var k = D.testState(plan, st, x);
      var meta = plainChip(x.level) + chip(k.label, k.tone);
      h += itemWrap(x.id, itemHead(x.id, x.checks.length > 140 ? x.checks.slice(0, 140) + '…' : x.checks, meta), function () {
        return '<dl class="kv"><dt>ما يُفحص</dt><dd>' + md(x.checks) + '</dd>' +
          '<dt>البيئة والبيانات</dt><dd>' + md(x.env) + '</dd>' +
          '<dt>المهام</dt><dd>' + idLinks(x.tasks) + '</dd>' +
          '<dt>معايير القبول</dt><dd>' + x.ac.map(function (a) { return '<code dir="ltr">' + esc(a) + '</code>'; }).join(' ') + '</dd>' +
          '<dt>الميزات</dt><dd>' + idLinks(x.features) + '</dd>' +
          (x.appliesIf ? '<dt>الانطباق</dt><dd>' + chip(x.appliesIf.label, 'warn') + ' بحسب ' + idLink(x.appliesIf.decision) + ' (' + esc(x.appliesIf.options.join('، ')) + ')</dd>' : '') +
          (x.fixtures.length ? '<dt>العينات</dt><dd>' + x.fixtures.map(function (f) { return '<code dir="ltr">' + esc(f) + '</code>'; }).join(' ') + '</dd>' : '') + '</dl>' +
          (k.key === 'not_applicable' ? '<p class="muted" style="margin-top:12px">لا ينطبق بحسب القرار المعتمد، فلا تُسجَّل له نتيجة.</p>' : editBox('tests', x.id, st));
      });
    });
    h += '</div>';
    if (!shown.length) h += '<p class="empty">لا اختبارات تطابق البحث والفلاتر.</p>';
    return { html: h, count: shown.length + ' من ' + plan.tests.length + ' اختبارًا' };
  }

  // ---------- الأسماء ----------
  function renderNames() {
    if (!naming) return { html: '<p class="empty">الأسماء قيد الإعداد؛ أعد التوليد بعد إضافة <code dir="ltr">data/naming.json</code>.</p>', count: null };
    var cands = naming.candidates.filter(function (c) { return matches([c.ar, c.latin, c.meaning, c.fit, c.conflictsSummary].join(' '), ui.q); });
    var rec = naming.recommendation;
    var ap = naming.approved;
    var h = '<div class="section__head"><h1>' + (ap ? 'اسم المشروع' : 'الأسماء المقترحة') + '</h1><p>' + (ap ? 'اعتمده المالك في ' + idLink(ap.decision) + ' بتاريخ ' + esc(ap.decidedOn) + '؛ والمعرّف التقني <bdi class="ltr">' + esc(ap.id) + '</bdi>.' : 'لا يُعتمد اسم ولا يُغيَّر معرّف قبل موافقتك؛ الاسم المؤقت <bdi class="ltr">' + esc(plan.meta.workingName) + '</bdi>.') + '</p></div>';
    if (ap) h += '<div class="card rec" style="margin-bottom:16px"><h2 style="margin-bottom:6px">الاسم المعتمد: ' + esc(ap.ar) + ' <bdi class="ltr">(' + esc(ap.latin) + ')</bdi></h2><p>' + md(ap.note) + '</p><p style="margin:0"><strong>ما يلزم قبل النشر:</strong> ' + md(ap.before) + '</p></div>';
    h += '<div class="card' + (ap ? '' : ' rec') + '" style="margin-bottom:16px"><h2 style="margin-bottom:6px">' + (ap ? 'ترشيحي قبل الاعتماد: ' : 'ترشيحي النهائي: ') + esc(rec.ar) + ' <bdi class="ltr">(' + esc(rec.latin) + ')</bdi></h2><p>' + md(rec.why) + '</p><p style="margin:0"><strong>قبل اعتماده:</strong> ' + md(rec.before) + '</p></div>';
    h += '<div class="grid grid--2">';
    cands.forEach(function (c) {
      var isRec = ap ? c.latin === ap.latin : c.latin === rec.latin;
      h += '<article class="card name-card' + (isRec ? ' is-rec' : '') + '"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><p class="name-card__ar">' + esc(c.ar) + '</p><p class="name-card__latin">' + esc(c.latin) + '</p></div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">' + (isRec ? chip(ap ? 'الاسم المعتمد' : 'الترشيح النهائي', ap ? 'ok' : 'ready') : '') + (ap && c.latin === rec.latin ? chip('ترشيحي قبل الاعتماد', 'muted') : '') + chip('تعارض ظاهر: ' + c.severityLabel, c.severity === 'low' ? 'ok' : c.severity === 'medium' ? 'warn' : 'bad') + '</div></div>' +
        (c.subtitle ? '<p class="muted" style="direction:ltr;text-align:end;margin-top:-6px">' + esc(c.subtitle) + '</p>' : '') +
        '<dl class="kv"><dt>المعنى</dt><dd>' + md(c.meaning) + '</dd><dt>سبب الملاءمة</dt><dd>' + md(c.fit) + '</dd><dt>ما ظهر في الفحص</dt><dd>' + md(c.conflictsSummary) + '</dd></dl>' +
        '<details style="margin-top:10px"><summary>تفاصيل الفحص والروابط</summary><ul class="plain-list" style="margin-top:8px">' +
        c.findings.map(function (f) { return '<li><strong>' + esc(f.where) + ':</strong> ' + md(f.text) + (f.url ? ' <a href="' + esc(f.url) + '" target="_blank" rel="noopener noreferrer">رابط</a>' : '') + '</li>'; }).join('') + '</ul></details></article>';
    });
    h += '</div>';
    if (!cands.length) h += '<p class="empty">لا أسماء تطابق البحث.</p>';
    h += '<section class="section card" style="margin-top:20px"><h2>أسماء استُبعدت</h2><table class="tbl"><thead><tr><th>الاسم</th><th>السبب</th></tr></thead><tbody>' +
      naming.excluded.map(function (x) { return '<tr><td data-label="الاسم"><strong>' + esc(x.name) + '</strong></td><td data-label="السبب">' + md(x.reason) + (x.urls && x.urls.length ? ' ' + x.urls.map(function (u, i) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">[' + (i + 1) + ']</a>'; }).join(' ') : '') + '</td></tr>'; }).join('') + '</tbody></table></section>';
    h += '<section class="section card"><h2>المنهج وحدوده</h2><p class="muted">تاريخ الفحص: ' + esc(naming.checkedOn) + '</p><ul class="plain-list">' + naming.methods.map(function (m) { return '<li>' + md(m) + '</li>'; }).join('') + '</ul><h3 style="margin-top:14px">الحدود</h3><ul class="plain-list">' + naming.limits.map(function (m) { return '<li>' + md(m) + '</li>'; }).join('') + '</ul><div class="files">' + fileLink('NAMING.md', 'NAMING.md') + '</div></section>';
    return { html: h, count: cands.length + ' من ' + naming.candidates.length + ' أسماء' };
  }

  // ---------- الموجات والمراحل ----------
  // تقرأ حالة الملف وحدها (projectStatus) لا التعديلات المحلية، فهي ما يحدّثه المنسّق بعد كل حدث.
  var GLYPH = { not_started: '○', in_progress: '◐', implemented: '◉', done: '✓', blocked: '✕', ready_to_merge: '◉', merged: '✓' };
  function statusText(key, label, tone) { return '<span class="status-text tone-' + tone + '"><span class="status-text__glyph" aria-hidden="true">' + (GLYPH[key] || '') + '</span>' + esc(label) + '</span>'; }
  function modelChip(m) { return m ? '<span class="model-chip' + (m.isException ? ' is-exception' : '') + '" title="' + esc(m.why) + '">' + esc(m.name) + (m.isException ? ' (استثناء)' : '') + '</span>' : ''; }
  function copyBtn(text, label) { return '<button type="button" class="btn btn--sm" data-copy="' + esc(text) + '">' + esc(label) + '</button>'; }
  function list(items) { return '<ul class="plain-list">' + items.map(function (k) { return '<li>' + md(k) + '</li>'; }).join('') + '</ul>'; }
  function stageCard(x, isCur) {
    var s = x.stage;
    var h = '<section class="card stage' + (isCur ? ' is-current' : '') + '" aria-labelledby="stage-' + esc(s.id) + '">' +
      '<div class="stage__head"><span class="stage__num" aria-hidden="true">' + s.num + '</span><div><h2 id="stage-' + esc(s.id) + '">المرحلة ' + s.num + ': ' + esc(s.title) + '</h2><p class="stage__goal">' + md(s.goal) + '</p></div>' +
      '<div class="stage__state">' + statusText(x.state.key, x.state.label + (x.state.blockedReasons.length ? ': ' + x.state.blockedReasons.join('؛ ') : ''), x.state.tone) + (isCur ? chip('المرحلة الحالية', 'ready') : '') + '<span class="muted" style="font-size:.82rem">الفرع <bdi class="ltr">' + esc(s.branch) + '</bdi>' + (s.mergeCommit ? ' · دُمج ' + esc(s.mergedOn) + ' <bdi class="ltr">' + esc(s.mergeCommit) + '</bdi>' : '') + '</span></div></div>';
    if (x.state.key === 'not_started' && x.blockers.length) h += '<p class="stage__blockers"><strong>ما يمنع البدء:</strong> ' + x.blockers.map(function (b) { return md(b.text); }).join('؛ ') + '.</p>';
    h += '<ul class="tasklist">';
    s.tasks.forEach(function (id) {
      var t = ix.tasks[id]; var e = projectStatus.tasks[id]; var m = D.taskModel(projectStatus, id);
      var lbl = D.WAVE_TASK_LABELS[e.status] + (e.status === 'blocked' ? ': ' + (e.note || 'بلا سبب مسجَّل') : '');
      var gates = t.decisions.filter(function (g) { return !D.decisionChosen(plan, g.id); }).map(function (g) { return chip(g.id + (g.gate === 'start' ? ' يوقف البدء' : ' يوقف الإغلاق'), 'warn'); }).join('');
      var refs = [];
      if (e.commit) refs.push('التزام <bdi class="ltr">' + esc(e.commit) + '</bdi>' + (e.branch ? ' على <bdi class="ltr">' + esc(e.branch) + '</bdi>' : ''));
      (e.evidence || []).forEach(function (ev) { refs.push(/^https?:/.test(ev) ? '<a href="' + esc(ev) + '" target="_blank" rel="noopener noreferrer">' + esc(ev) + '</a>' : '<a href="../' + esc(ev) + '"><bdi class="ltr">' + esc(ev) + '</bdi></a>'); });
      h += '<li><span class="item__id">' + idLink(id) + '</span><div class="task__line"><span class="task__title">' + md(t.title) + '</span>' + statusText(e.status, lbl, D.TASK_STATES[e.status === 'not_started' ? 'waiting' : e.status].tone) + gates + modelChip(m) + '</div>' +
        ((e.summary || refs.length) ? '<p class="task__done">' + (e.summary ? '<strong>ما أُنجز:</strong> ' + md(e.summary) : '') + (refs.length ? (e.summary ? ' · ' : '') + '<strong>المرجع:</strong> ' + refs.join('، ') : '') + '</p>' : '') + '</li>';
    });
    h += '</ul>';
    h += '<div class="copybar">' + copyBtn(x.startCmd, 'نسخ أمر البدء') + copyBtn(x.mergeCmd, 'نسخ أمر الدمج') + '<span class="copy-msg" aria-live="polite"></span><span class="muted" style="font-size:.82rem">الزران للنسخ فقط؛ تلصق النص في المحادثة ولا ينفّذ شيئًا.</span></div>';
    h += '<details class="stage__details"' + (isCur && s.beforeStart.length ? ' open' : '') + '><summary>التفاصيل: الفحوص والمراجعة' + (s.beforeStart.length ? ' وما قبل البدء' : '') + (s.openItems.length ? ' والبنود المفتوحة' : '') + '</summary><div>' +
      (s.beforeStart.length ? '<h3>قبل البدء</h3>' + list(s.beforeStart) : '') +
      (s.openItems.length ? '<h3>بنود مفتوحة</h3>' + list(s.openItems) : '') +
      '<h3>الفحوص بحسب الأثر</h3>' + list(s.checks) +
      '<h3>المراجعة</h3><p style="margin:0">' + md(s.review) + '</p>' +
      (s.summary ? '<h3>خلاصة المرحلة</h3><p style="margin:0">' + md(s.summary) + '</p>' : '') +
      '<h3>اختبارات مهام المرحلة</h3><ul class="plain-list">' + s.tasks.map(function (id) { return ix.tasks[id].tests.map(function (tid) { var ts = D.testState(plan, projectStatus, ix.tests[tid]); return '<li>' + idLink(tid) + ' ' + chip(ts.label, ts.tone) + ' <span class="muted">(' + esc(id) + ')</span></li>'; }).join(''); }).join('') + '</ul>' +
      '</div></details></section>';
    return h;
  }
  function renderWave() {
    var W = D.programView(plan, projectStatus);
    if (!W) return { html: '<p class="empty">لا قسم للموجات في <code dir="ltr">data/status.json</code> بعد.</p>', count: null };
    var pr = W.program; var cur = W.current;
    var h = '<div class="section__head"><h1>الموجات والمراحل</h1><p>' + md(pr.scope) + '</p></div>';
    h += '<section class="card hero"><div class="wave-hero__grid">' +
      '<div><p class="wave-hero__label">المرحلة الحالية</p><p class="wave-hero__value">' + (cur ? 'المرحلة ' + cur.stage.num + ': ' + esc(cur.stage.title) : 'اكتملت كل الموجات') + '</p>' + (cur ? '<p class="muted" style="margin:0 0 6px">في الموجة ' + cur.wave.num + ': ' + esc(cur.wave.title) + '</p>' + statusText(cur.state.key, cur.state.label, cur.state.tone) : statusText('merged', 'مدمجة ومتحقق منها', 'ok')) + '</div>' +
      '<div><p class="wave-hero__label">الخطوة التالية</p><p class="wave-hero__next">' + md(W.next.text) + '</p>' + (W.next.cmd ? '<div class="task__line">' + copyBtn(W.next.cmd, 'نسخ الأمر: ' + W.next.cmd) + '<span class="copy-msg" aria-live="polite"></span></div>' : '') + '</div>' +
      '<div><p class="wave-hero__label">التقدم</p><p class="wave-hero__value">' + W.counts.merged + ' من ' + W.counts.total + '</p><p class="muted" style="margin:0">مهمة مدمجة ومتحقق منها في <bdi class="ltr">main</bdi>' + (W.counts.implemented ? '؛ و' + W.counts.implemented + ' منفّذة على فرع تنتظر الدمج' : '') + (W.counts.active ? '؛ و' + W.counts.active + ' جارية أو متوقفة' : '') + '. ' + W.waves.length + ' موجات و' + W.stages.length + ' مراحل.</p></div></div>' +
      '<p class="wave-hero__foot"><span>آخر تحديث للحالة: <bdi class="ltr">' + esc(pr.updatedAt) + '</bdi></span><span>المصدر: <bdi class="ltr">data/status.json</bdi> عبر <bdi class="ltr">tools/build.mjs</bdi>؛ يكفي تحديث الصفحة لرؤية آخر تقدم.</span>' + (countKeys(saved) ? '<span style="color:var(--warn)">هذا التبويب يعرض حالة الملف فقط ويتجاهل التعديلات المحلية.</span>' : '') + '</p></section>';
    W.waves.forEach(function (w) {
      h += '<details class="wavebox' + (w.isCurrent ? ' is-current' : '') + '"' + (w.isCurrent ? ' open' : '') + '><summary class="wavebox__sum"><span class="wavebox__num" aria-hidden="true">' + w.wave.num + '</span><span class="wavebox__title">الموجة ' + w.wave.num + ': ' + esc(w.wave.title) + '</span><span class="wavebox__meta">' + statusText(w.state.key, w.state.label, w.state.tone) + plainChip(w.stages.length === 1 ? 'مرحلة واحدة' : w.stages.length + ' مراحل') + plainChip(w.counts.merged + ' من ' + w.counts.total + ' مهام مدمجة') + (w.isCurrent ? chip('الموجة الحالية', 'ready') : '') + '</span></summary>' +
        '<div class="wavebox__body"><p class="muted">' + md(w.wave.scope) + '</p>' + w.stages.map(function (x) { return stageCard(x, !!(cur && cur.stage.id === x.stage.id)); }).join('') + '</div></details>';
    });
    var mo = pr.models;
    h += '<details class="card stage__details wave-models" style="margin-top:20px"><summary>المودلات وطريقة العمل</summary><div>' +
      '<h3>توزيع المودلات</h3><p class="muted" style="margin:0 0 6px">تحقق التوفر: ' + idLink(mo.verifiedBy) + ' بتاريخ ' + esc(mo.verifiedOn) + '. ' + md(mo.rule) + '</p>' +
      '<table class="tbl"><thead><tr><th>الدور</th><th>المودل</th><th>السبب</th></tr></thead><tbody>' +
      '<tr><td data-label="الدور">افتراضي كل الموجات</td><td data-label="المودل">' + esc(mo.default.name) + '</td><td data-label="السبب">' + md(mo.default.why) + '</td></tr>' +
      '<tr><td data-label="الدور">الإدارة والدمج والحالة</td><td data-label="المودل">' + esc(mo.orchestrator.name) + '</td><td data-label="السبب">' + md(mo.orchestrator.why) + '</td></tr>' +
      '<tr><td data-label="الدور">مراجعة المرحلة</td><td data-label="المودل">' + esc(mo.review.name) + '</td><td data-label="السبب">' + md(mo.review.why) + '</td></tr>' +
      Object.keys(mo.exceptions).map(function (id) { var m = mo.exceptions[id]; return '<tr><td data-label="الدور">استثناء: ' + idLink(id) + '</td><td data-label="المودل">' + esc(m.name) + '</td><td data-label="السبب">' + md(m.why) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h3>طريقة العمل</h3>' + list(pr.flow) +
      '<div class="files">' + fileLink('STATUS.md', 'STATUS.md') + fileLink('ROADMAP.md', 'ROADMAP.md') + fileLink('DECISIONS.md', 'DECISIONS.md') + '</div></div></details>';
    return { html: h, count: null };
  }
  function copyText(text, msgEl) {
    function ok() { msgEl.className = 'copy-msg'; msgEl.textContent = 'نُسخ: ' + text; setTimeout(function () { if (msgEl.textContent.indexOf('نُسخ') === 0) msgEl.textContent = ''; }, 2500); }
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      var done = false; try { done = document.execCommand('copy'); } catch (e) { done = false; }
      ta.remove();
      if (done) ok(); else { msgEl.className = 'copy-msg is-error'; msgEl.innerHTML = 'تعذّر النسخ تلقائيًا؛ انسخ النص: <input class="copy-fallback" type="text" readonly value="' + esc(text) + '">'; var inp = msgEl.querySelector('input'); inp.focus(); inp.select(); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  }

  // ---------- اللافتات وشريط الحفظ ----------
  function renderChrome() {
    var n = countKeys(saved);
    var banner = document.getElementById('localBanner');
    if (n) {
      banner.hidden = false;
      banner.innerHTML = '<p><strong>تعرض الصفحة ' + n + ' تعديلًا محليًا</strong> محفوظًا في هذا المتصفح ويختلف عن <bdi class="ltr">data/status.json</bdi>. لا تتغير ملفات المشروع حتى تصدّر الملف وتستبدله وتشغّل أداة التوليد.</p>' +
        '<button type="button" class="btn btn--sm btn--primary" data-act="export">تصدير status.json</button><button type="button" class="btn btn--sm btn--ghost" data-act="dialog">كيف أطبّقها؟</button>';
    } else if (!storageOk) {
      banner.hidden = false;
      banner.className = 'banner banner--info';
      banner.innerHTML = '<p>التخزين المحلي غير متاح في هذا المتصفح، فلن تبقى تعديلات الحالة بعد إغلاق الصفحة. يبقى التصدير متاحًا.</p>';
    } else banner.hidden = true;
    var d = countKeys(draft);
    var bar = document.getElementById('savebar');
    bar.hidden = !d;
    var invalid = draftInvalid();
    document.getElementById('savebarText').innerHTML = d ? '<strong>' + d + ' تعديل غير محفوظ.</strong> الحفظ يبقيه في هذا المتصفح فقط ولا يغيّر ملفات المشروع.' + (invalid ? ' <span style="color:var(--bad)">أكمل الدليل أو الملاحظة المطلوبة قبل الحفظ.</span>' : '') : '';
    document.getElementById('saveDraft').disabled = invalid;
    document.getElementById('dialogState').textContent = 'التعديلات المحلية المحفوظة الآن: ' + n + '.' + (storageOk ? '' : ' (التخزين المحلي غير متاح)');
  }
  function draftInvalid() {
    var st = effectiveStatus();
    return Object.keys(draft.tasks).some(function (id) { var s = st.tasks[id]; return (s.status === 'done' && !(s.evidence || []).length) || (s.status === 'blocked' && !s.note); }) ||
      Object.keys(draft.tests).some(function (id) { var s = st.tests[id]; return (s.status === 'passed' || s.status === 'failed') && !(s.evidence || []).length; });
  }

  // ---------- العرض والتوجيه ----------
  function render(keepScroll) {
    var y = window.scrollY;
    var st = effectiveStatus();
    var filt = FILTERABLE[ui.view];
    document.getElementById('filters').hidden = !filt;
    ['phase', 'module', 'status'].forEach(function (k) { document.querySelector('[data-filter="' + k + '"]').hidden = filt !== true; });
    var r = VIEWS[ui.view](st);
    main.innerHTML = r.html;
    countEl.textContent = r.count ? 'النتائج: ' + r.count : '';
    document.querySelectorAll('#tabs a').forEach(function (a) { if (a.getAttribute('data-view') === ui.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    renderChrome();
    if (keepScroll) window.scrollTo(0, y);
  }

  function route() {
    var hash = decodeURIComponent((location.hash || '#wave').slice(1));
    var parts = hash.split('/');
    var view = VIEWS[parts[0]] ? parts[0] : 'wave';
    var changed = view !== ui.view;
    ui.view = view;
    ui.target = parts[1] || null;
    if (changed) fillStatus();
    if (ui.target) {
      // عند القفز إلى عنصر بعينه تُمسح الفلاتر حتى لا يُخفى.
      ui.q = ''; ui.phase = ''; ui.module = ''; ui.status = '';
      qEl.value = ''; fPhase.value = ''; fModule.value = ''; fStatus.value = '';
      ui.open[ui.target] = true;
    }
    render(false);
    if (ui.target) {
      var el = document.getElementById('item-' + ui.target);
      if (el) { el.scrollIntoView({ block: 'start' }); var b = el.querySelector('.item__head'); if (b) b.focus({ preventScroll: true }); }
    } else window.scrollTo(0, 0);
  }

  // ---------- الأحداث ----------
  main.addEventListener('click', function (e) {
    var cp = e.target.closest('[data-copy]');
    if (cp) { var wrap = cp.parentElement; copyText(cp.getAttribute('data-copy'), wrap.querySelector('.copy-msg')); return; }
    var tg = e.target.closest('[data-toggle]');
    if (tg) {
      var id = tg.getAttribute('data-toggle');
      ui.open[id] = !ui.open[id];
      var art = document.getElementById('item-' + id);
      var body = art.querySelector('.item__body');
      tg.setAttribute('aria-expanded', String(!!ui.open[id]));
      if (ui.open[id]) { body.hidden = false; renderItemBody(id, body); } else { body.hidden = true; body.innerHTML = ''; }
      return;
    }
    var sp = e.target.closest('[data-setphase]');
    if (sp) { ui.phase = sp.getAttribute('data-setphase'); ui.module = ''; ui.status = ''; ui.q = ''; qEl.value = ''; fPhase.value = ui.phase; fModule.value = ''; }
  });
  function renderItemBody(id, body) {
    // يعيد رسم الصفحة مع الحفاظ على الموضع؛ أبسط من إعادة بناء جسم عنصر واحد بمعزل عن سياقه.
    render(true);
  }
  main.addEventListener('change', onEdit);
  main.addEventListener('input', function (e) { if (e.target.matches('input[data-edit]')) onEdit(e, true); });
  function onEdit(e, typing) {
    var el = e.target;
    if (!el.matches('[data-edit]')) return;
    var box = el.closest('.edit');
    var kind = box.getAttribute('data-kind');
    var id = box.getAttribute('data-id');
    var base = clone(projectStatus[kind][id]);
    if (saved[kind][id]) base = Object.assign(base, saved[kind][id]);
    var cur = Object.assign({}, base, draft[kind][id] || {});
    var field = el.getAttribute('data-edit');
    if (field === 'status') cur.status = el.value;
    if (field === 'evidence') cur.evidence = el.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (field === 'note') cur.note = el.value;
    if (JSON.stringify(cur) === JSON.stringify(base)) delete draft[kind][id]; else draft[kind][id] = cur;
    if (typing) { renderChrome(); return; }
    render(true);
  }
  document.getElementById('saveDraft').addEventListener('click', function () {
    if (draftInvalid()) return;
    ['tasks', 'tests'].forEach(function (k) {
      Object.keys(draft[k]).forEach(function (id) {
        var merged = draft[k][id];
        if (JSON.stringify(merged) === JSON.stringify(projectStatus[k][id])) delete saved[k][id]; else saved[k][id] = merged;
      });
    });
    draft = emptyOverrides();
    lsSet(LS_OVERRIDES, JSON.stringify(saved));
    render(true);
  });
  document.getElementById('discardDraft').addEventListener('click', function () { draft = emptyOverrides(); render(true); });

  function setFilter() { ui.q = qEl.value.trim(); ui.phase = fPhase.value; ui.module = fModule.value; ui.status = fStatus.value; render(false); }
  var qTimer;
  qEl.addEventListener('input', function () { clearTimeout(qTimer); qTimer = setTimeout(setFilter, 120); });
  [fPhase, fModule, fStatus].forEach(function (el) { el.addEventListener('change', setFilter); });
  document.getElementById('resetFilters').addEventListener('click', function () { qEl.value = ''; fPhase.value = ''; fModule.value = ''; fStatus.value = ''; setFilter(); qEl.focus(); });
  window.addEventListener('hashchange', route);

  // ---------- الوضع الفاتح والداكن ----------
  var themeBtn = document.getElementById('themeBtn');
  var THEME_LABEL = { auto: 'الوضع: تلقائي', light: 'الوضع: فاتح', dark: 'الوضع: داكن' };
  function currentTheme() { var t = document.documentElement.getAttribute('data-theme'); return t === 'light' || t === 'dark' ? t : 'auto'; }
  function applyTheme(t) {
    if (t === 'auto') { document.documentElement.removeAttribute('data-theme'); lsDel(LS_THEME); } else { document.documentElement.setAttribute('data-theme', t); lsSet(LS_THEME, t); }
    themeBtn.textContent = THEME_LABEL[t];
    themeBtn.setAttribute('aria-label', THEME_LABEL[t] + '. اضغط للتبديل');
  }
  themeBtn.addEventListener('click', function () { applyTheme({ auto: 'light', light: 'dark', dark: 'auto' }[currentTheme()]); });
  applyTheme(currentTheme());

  // ---------- التصدير والاستيراد ----------
  var dialog = document.getElementById('statusDialog');
  var importMsg = document.getElementById('importMsg');
  function openDialog() { importMsg.textContent = ''; importMsg.className = 'msg'; renderChrome(); if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); }
  document.getElementById('statusPanelBtn').addEventListener('click', openDialog);
  document.getElementById('localBanner').addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.getAttribute('data-act') === 'export') exportStatus(); else openDialog();
  });
  function exportStatus() {
    var s = clone(projectStatus);
    ['tasks', 'tests'].forEach(function (k) { Object.keys(saved[k]).forEach(function (id) { s[k][id] = saved[k][id]; }); });
    if (countKeys(saved)) s.asOf = today();
    var blob = new Blob([JSON.stringify(s, null, 2) + '\n'], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'status.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    importMsg.className = 'msg is-ok';
    importMsg.textContent = 'صُدِّر status.json بتعديلاتك المحفوظة (' + countKeys(saved) + '). ضعه مكان data/status.json ثم شغّل أداة التوليد.';
  }
  document.getElementById('exportBtn').addEventListener('click', exportStatus);
  document.getElementById('clearLocalBtn').addEventListener('click', function () {
    if (!countKeys(saved) && !countKeys(draft)) { importMsg.className = 'msg'; importMsg.textContent = 'لا توجد تعديلات محلية.'; return; }
    if (!window.confirm('حذف كل التعديلات المحلية والعودة إلى حالات data/status.json؟')) return;
    saved = emptyOverrides(); draft = emptyOverrides(); lsDel(LS_OVERRIDES);
    importMsg.className = 'msg is-ok'; importMsg.textContent = 'حُذفت التعديلات المحلية.';
    render(true);
  });
  document.getElementById('importInput').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var errs = [];
      var s;
      try { s = JSON.parse(String(reader.result)); } catch (err) { errs.push('الملف ليس JSON صالحًا.'); }
      if (s && (!s.tasks || !s.tests)) errs.push('الملف لا يحوي tasks وtests.');
      var next = emptyOverrides();
      if (!errs.length) {
        [['tasks', D.STORED_TASK, ix.tasks], ['tests', D.STORED_TEST, ix.tests]].forEach(function (k) {
          Object.keys(s[k[0]]).forEach(function (id) {
            var v = s[k[0]][id];
            if (!k[2][id]) { errs.push('معرّف غير معروف: ' + id); return; }
            if (!v || k[1].indexOf(v.status) < 0) { errs.push('حالة غير صالحة لـ ' + id); return; }
            if (!Array.isArray(v.evidence)) { errs.push('الدليل ليس قائمة في ' + id); return; }
            if ((v.status === 'done' || v.status === 'passed' || v.status === 'failed') && !v.evidence.length) { errs.push(id + ': حالة بلا دليل'); return; }
            var item = { status: v.status, evidence: v.evidence, note: v.note || '' };
            ['branch', 'commit', 'summary'].forEach(function (f) { if (v[f]) item[f] = v[f]; });
            if (JSON.stringify(item) !== JSON.stringify(projectStatus[k[0]][id])) next[k[0]][id] = item;
          });
        });
      }
      if (errs.length) {
        importMsg.className = 'msg is-error';
        importMsg.textContent = 'لم يُستورد شيء: ' + errs.slice(0, 5).join('؛ ') + (errs.length > 5 ? '…' : '');
      } else {
        saved = next; draft = emptyOverrides(); lsSet(LS_OVERRIDES, JSON.stringify(saved));
        importMsg.className = 'msg is-ok';
        importMsg.textContent = 'استُورد الملف: ' + countKeys(saved) + ' حالة تختلف عن data/status.json وصارت تعديلات محلية في هذا المتصفح.';
        render(true);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  fillStatus();
  route();
})();

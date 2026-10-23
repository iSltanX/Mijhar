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
    var LS_THEME = 'mijhar-plan:theme';

  // ---------- التخزين المحلي: الوضع الفاتح/الداكن فقط (الحالة لا تُعدَّل من الصفحة) ----------
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { window.localStorage.removeItem(k); return true; } catch (e) { return false; } }

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
    var stats = [['8', 'وحدات'], [plan.features.length, 'ميزة فرعية'], [plan.tasks.length, 'مهمة'], [plan.acceptance.length, 'معيار قبول'], [plan.tests.length, 'اختبارًا معرَّفًا'], [plan.decisions.filter(function (d) { return d.status !== 'approved'; }).length, 'قرارات معلّقة']];
    var h = '';
    h += '<section class="section"><div class="card hero"><h1>مِجهَر <bdi class="ltr">(Mijhar)</bdi>: إضافة متصفح عربية مساعدة فوق صفحات GitHub</h1>' +
      '<p class="lead">طبقة تعمل داخل صفحات <bdi class="ltr">github.com</bdi> الحقيقية: اتجاه عربي وقراءة مريحة، وشرح المصطلحات والأزرار، وترجمة تقنية محلية تحفظ الكود، وفهم حالة طلبات الدمج والفحوص، وحزم سياق للنماذج والزملاء، ومساعدة في البلاغات والمراجعات، وملاحظات خاصة و«أكمل لاحقًا»، وإرشاد أول مساهمة. وفوقها طبقة مساعدة: جمع السياق في برومبت يُنسخ بضغطة، وتحليل اختياري بمفتاح يملكه المستخدم، ومسار إنجاز تدريجي بطلب صريح. ثماني وحدات و56 ميزة كاملة دون تقليص.</p>' +
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
      (t.note ? '<dt>ملاحظة</dt><dd>' + md(t.note) + '</dd>' : '') + '</dl>' + +
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
          (k.key === 'not_applicable' ? '<p class="muted" style="margin-top:12px">لا ينطبق بحسب القرار المعتمد، فلا تُسجَّل له نتيجة.</p>' : '');
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

  // ---------- نظام MJ: الموجات والمراحل (من حمولة mj التي تجمعها أداة المزامنة عبر الفروع) ----------
  function statusText(key, label, tone, glyph) { return '<span class="status-text tone-' + tone + '"><span class="status-text__glyph" aria-hidden="true">' + (glyph || '') + '</span>' + esc(label) + '</span>'; }
  var TASK_GLYPH = { not_started: '○', in_progress: '◐', blocked: '✕', implemented: '◉', done: '✓' };
  function copyBtn(text, label, primary) { return '<button type="button" class="btn btn--sm' + (primary ? ' btn--primary' : '') + '" data-copy="' + esc(text) + '">' + esc(label) + '</button>'; }
  function list(items) { return '<ul class="plain-list">' + items.map(function (k) { return '<li>' + md(k) + '</li>'; }).join('') + '</ul>'; }
  function mdBlock(text) {
    // تحويل مبسّط لأقسام ملف المرحلة: قوائم وفقرات وعناوين فرعية.
    var out = [], inList = false;
    String(text || '').split('\n').forEach(function (line) {
      var li = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if (li) { if (!inList) { out.push('<ul class="plain-list">'); inList = true; } out.push('<li>' + md(li[1]) + '</li>'); return; }
      if (inList) { out.push('</ul>'); inList = false; }
      if (!line.trim()) return;
      var h = line.match(/^\*\*(.+)\*\*$/);
      if (h) { out.push('<p class="muted" style="margin:10px 0 2px;font-weight:700">' + md(h[1]) + '</p>'); return; }
      out.push('<p style="margin:0 0 6px">' + md(line) + '</p>');
    });
    if (inList) out.push('</ul>');
    return out.join('');
  }
  function stagePrompt(v, W) {
    var s = v.stage, h = s.header, sec = s.sections || {};
    var wave = W.waves.filter(function (w) { return w.id === h.wave; })[0] || { order: [] };
    var parallel = wave.order.filter(function (x) { return x !== h.id; });
    return [
      'أنت في مستودع مجهر (Mijhar) المحلي، في جلسة مستقلة داخل worktree. الحاكم CLAUDE.md في الجذر، ثم Docs/MJ/README.md (القواعد ودور «جلسة مرحلة» وصيغة تقرير التسليم)، ثم ملف المرحلة Docs/MJ/stages/' + h.id + '.md. اقرأ الثلاثة قبل أي عمل، وكل التواصل مع المالك بالعربية.',
      '',
      'المرحلة: ' + h.id + ' — ' + h.title,
      'الموجة: ' + h.wave + ' · الأساس: الوسم ' + h.base + ' · الفرع: ' + h.branch + ' · المودل: ' + h.model + ' (' + h.why_model + ') · الجلسة: worktree مستقل',
      'المهام: ' + (h.tasks || []).join('، ') + ' · تعتمد على المراحل: ' + ((h.depends || []).length ? h.depends.join('، ') : 'لا شيء') + ' · تعمل بالتوازي مع: ' + (parallel.length ? parallel.join('، ') : 'لا شيء'),
      'نقطة الاستئناف: ' + h.resume,
      '',
      'الهدف: ' + (sec['الهدف'] || ''),
      '',
      'النطاق:', sec['النطاق'] || '', '',
      'المهام:', sec['المهام'] || '', '',
      'معايير القبول:', sec['معايير القبول'] || '', '',
      'الفحوص:', sec['الفحوص'] || '', '',
      'المخاطر:', sec['المخاطر'] || '', '',
      'نفّذ دور «جلسة مرحلة» حرفيًا: تحقق بالأوامر من worktree والفرع والأساس والاعتماديات، ثم نفّذ وافحص في هذه الجلسة بلا وكلاء تنفيذ داخليين، وحدّث ترويسة ملف المرحلة وجدول «حالة المهام» وresume عند كل انتقال ثم node tools/build.mjs --sync، وسلّم بتقرير التسليم بصيغته والتزام أخير، وتوقف. لا تدمج في main ولا تبدأ مرحلة أخرى ولا ترفع شيئًا.'
    ].join('\n');
  }
  function mergePrompt(wv) {
    var w = wv.wave;
    return [
      'أنت في مستودع مجهر (Mijhar) المحلي، في النسخة الرئيسية بلا worktree، على main. الحاكم CLAUDE.md ثم Docs/MJ/README.md (دور «منسّق دمج الموجة» والملكية ومناطق التعارض). كل التواصل مع المالك بالعربية.',
      '',
      'المهمة: إغلاق الموجة ' + w.id + ' (' + w.title + ') وفتح ' + (wv.nextWave || 'لا شيء؛ هذه الأخيرة') + '.',
      'المراحل بترتيب الدمج: ' + wv.stages.map(function (v) { return v.stage.id + ' (' + v.stage.header.branch + ')'; }).join(' ثم '),
      'الفحص (بوابة الموجة): ' + w.gate + ' · الجولة اليدوية: ' + (w.manual || 'لا شيء') + ' · المودل: ' + w.merge_model + (w.why_merge_model ? ' (' + w.why_merge_model + ')' : ''),
      '',
      'نفّذ الدور خطوة خطوة: اكتشف الفروع من ترويسات المراحل لا بأسماء يكتبها المالك، وتحقق من تسليم كل مرحلة، وادمج على فرع تكامل بالترتيب، وتأكد أن لا دمج أسقط غيره، وشغّل بوابة الموجة على الشجرة المجمّعة، ثم ثبّت الحالة وولّد الوثائق وانقل إلى main وضع وسم الموجة التالية وسجّل الصف في سجل الموجات، وتوقف. لا push ولا نشر، ولا تبدأ جلسات الموجة التالية.'
    ].join('\n');
  }
  // شارات مختصرة لما يمنع البدء؛ والتفسير الكامل داخل التفاصيل.
  function shortStageBadges(v, prevWave) {
    var out = [], seen = {};
    var add = function (text, tone) { if (!seen[text]) { seen[text] = 1; out.push(chip(text, tone)); } };
    var waveBlocked = v.blockers.some(function (b) { return b.kind === 'wave'; });
    v.blockers.forEach(function (b) {
      if (b.kind === 'wave') add(prevWave ? 'تنتظر دمج ' + prevWave : 'الموجة لم تُفتح', 'muted');
      else if (b.kind === 'stage' && !waveBlocked) add(b.text.replace(/`/g, ''), 'muted');
      else if (b.kind === 'decision') add('قرار ' + b.id, 'warn');
    });
    return out.join('');
  }
  function shortMergeBadge(wv, prevView) {
    if (wv.key === 'merged') return '';
    if (prevView && prevView.key !== 'merged') return chip('تنتظر دمج ' + prevView.wave.id, 'muted');
    if (!wv.open) return chip('الموجة لم تُفتح', 'muted');
    if (wv.key === 'ready') return chip('جاهزة للدمج', 'ok');
    var left = wv.stages.filter(function (v) { return v.key !== 'ready' && v.key !== 'merged'; }).length;
    return chip(left === 1 ? 'تنتظر تسليم مرحلة' : 'تنتظر تسليم ' + left + ' مراحل', 'muted');
  }
  function toggleBtn(id, label) {
    var open = !!ui.open['p-' + id];
    return '<button type="button" class="btn btn--sm btn--ghost row-toggle" data-row-toggle="' + esc(id) + '" aria-expanded="' + open + '" aria-controls="p-' + esc(id) + '">' + esc(label) + '<span class="row-toggle__chev" aria-hidden="true">▾</span></button>';
  }
  function cmdBtn(cmd, primary) { return '<button type="button" class="btn btn--sm cmd-btn' + (primary ? ' btn--primary' : '') + '" data-copy="' + esc(cmd) + '" aria-label="نسخ الأمر ' + esc(cmd) + '">نسخ <bdi class="ltr">' + esc(cmd) + '</bdi></button>'; }
  function stageRow(v, W, wv, prevWave) {
    var s = v.stage, h = s.header, isNext = wv.open && v.canStart;
    var isEx = h.model !== W.default_model;
    var pid = 'p-' + h.id, open = !!ui.open[pid];
    var src = s.source && s.source.kind === 'branch' ? 'من فرعها <bdi class="ltr">' + esc(s.source.ref) + (s.source.commit ? ' @' + esc(s.source.commit) : '') + '</bdi> قبل الدمج' : (s.source && s.source.kind === 'cwd' ? 'من مجلد العمل الحالي' : 'من النسخة الرئيسية');
    var r = '<li class="srow' + (isNext ? ' is-next' : '') + '">' +
      '<div class="srow__main" data-copy-scope>' +
        '<span class="srow__id"><bdi class="ltr">' + esc(h.id) + '</bdi></span>' +
        '<span class="srow__title">' + esc(h.title) + (v.key === 'planned' || v.key === 'blocked' || v.key === 'active' ? shortStageBadges(v, prevWave) : '') + (s.source && s.source.kind === 'branch' ? chip('من الفرع', 'info') : '') + '</span>' +
        '<span class="srow__status">' + statusText(v.key, v.label, v.tone, v.glyph) + '</span>' +
        '<span class="srow__meta">' +
          '<span class="srow__model' + (isEx ? ' is-exception' : '') + '" title="' + esc(h.why_model) + '">' + esc(h.model) + '</span>' +
          (v.key === 'merged' ? '<span class="muted srow__done">مدمجة</span>' : cmdBtn(v.startCmd, isNext)) +
          toggleBtn(h.id, 'التفاصيل') +
        '</span>' +
      '</div>' +
      '<div class="srow__panel" id="' + pid + '"' + (open ? '' : ' hidden') + '>' +
        '<p class="srow__goal">' + md((s.sections && s.sections['الهدف']) || '') + '</p>' +
        (v.key !== 'merged' && v.key !== 'ready' && v.blockers.length ? '<div class="srow__why"><strong>ما يمنع البدء:</strong><ul class="plain-list">' + v.blockers.map(function (b) { return '<li>' + md(b.text) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<dl class="kv kv--tight">' +
          '<dt>الجلسة</dt><dd>جلسة جديدة بخيار worktree، بمودل ' + esc(h.model) + (isEx ? ' <span class="muted">(' + md(h.why_model) + ')</span>' : '') + '</dd>' +
          '<dt>الفرع والأساس</dt><dd><bdi class="ltr">' + esc(h.branch) + '</bdi> من الوسم <bdi class="ltr">' + esc(h.base) + '</bdi>' + (h.commit ? ' · الالتزام <bdi class="ltr">' + esc(h.commit) + '</bdi>' : '') + '</dd>' +
          '<dt>تعتمد على</dt><dd>' + ((h.depends || []).length ? h.depends.map(function (d) { return '<bdi class="ltr">' + esc(d) + '</bdi>'; }).join('، ') : 'لا شيء') + '</dd>' +
          (v.key !== 'merged' ? '<dt>نقطة الاستئناف</dt><dd>' + md(h.resume) + '</dd>' : '') +
          '<dt>مصدر الحالة</dt><dd>' + src + '</dd>' +
        '</dl>' +
        '<ul class="tasklist tasklist--panel">' + (s.tasks || []).map(function (row) {
          var t = ix.tasks[row.id]; if (!t) return '';
          var st = row.status || 'not_started';
          var lbl = D.WAVE_TASK_LABELS[st] + (st === 'blocked' && row.note ? ': ' + row.note : '');
          var refs = (row.evidence || []).map(function (ev) { return /^https?:/.test(ev) ? '<a href="' + esc(ev) + '" target="_blank" rel="noopener noreferrer">' + esc(ev) + '</a>' : '<a href="../' + esc(ev) + '"><bdi class="ltr">' + esc(ev) + '</bdi></a>'; });
          return '<li><span class="item__id">' + idLink(row.id) + '</span><div class="task__line"><span class="task__title">' + md(t.title) + '</span>' + statusText(st, lbl, D.TASK_STATES[st === 'not_started' ? 'waiting' : st].tone, TASK_GLYPH[st]) + '</div>' +
            ((row.summary || refs.length) ? '<p class="task__done">' + (row.summary ? '<strong>ما أُنجز:</strong> ' + md(row.summary) : '') + (refs.length ? (row.summary ? ' · ' : '') + '<strong>الدليل:</strong> ' + refs.join('، ') : '') + '</p>' : '') + '</li>';
        }).join('') + '</ul>' +
        '<div class="srow__actions" data-copy-scope>' + (v.key === 'merged' ? '' : copyBtn(stagePrompt(v, W), 'نسخ البرومبت الكامل')) + fileLink('Docs/MJ/stages/' + h.id + '.md', 'ملف المرحلة') + '<span class="muted" style="font-size:.85rem">البرومبت لجلسة لا تُحمَّل فيها المهارات.</span></div>' +
        '<details class="stage__details srow__spec"><summary>المواصفة: النطاق والمعايير والفحوص والسجل</summary><div>' +
          ['النطاق', 'المهام', 'الاعتماديات', 'معايير القبول', 'الفحوص', 'المخاطر'].map(function (k) { return s.sections && s.sections[k] ? '<h3>' + esc(k) + '</h3>' + mdBlock(s.sections[k]) : ''; }).join('') +
          (s.log && s.log.length ? '<h3>سجل التنفيذ</h3><ul class="plain-list">' + s.log.map(function (l) { return '<li><span class="muted">' + esc(l.date) + '</span> ' + md(l.text) + (l.evidence && l.evidence !== '—' ? ' <span class="muted">(' + md(l.evidence) + ')</span>' : '') + '</li>'; }).join('') + '</ul>' : '') +
          '<h3>اختبارات مهام المرحلة</h3><ul class="plain-list">' + (h.tasks || []).map(function (id) { return (ix.tasks[id] ? ix.tasks[id].tests : []).map(function (tid) { var ts = D.testState(plan, projectStatus, ix.tests[tid]); return '<li>' + idLink(tid) + ' ' + chip(ts.label, ts.tone) + ' <span class="muted">(' + esc(id) + ')</span></li>'; }).join(''); }).join('') + '</ul>' +
        '</div></details>' +
      '</div></li>';
    return r;
  }
  function mergeRow(wv, W, prevView) {
    var w = wv.wave, pid = 'p-merge-' + w.id, open = !!ui.open[pid];
    var isEx = w.merge_model !== W.default_merge_model;
    return '<div class="mrow">' +
      '<div class="srow__main mrow__main" data-copy-scope>' +
        '<span class="srow__id mrow__id">دمج ' + esc(w.id) + '</span>' +
        '<span class="srow__title mrow__title">' + wv.stages.map(function (v) { return '<bdi class="ltr">' + esc(v.stage.id) + '</bdi>'; }).join(' ثم ') + ' <span class="muted mrow__where">· النسخة الرئيسية بلا worktree</span>' + shortMergeBadge(wv, prevView) + '</span>' +
        '<span class="srow__status">' + statusText(wv.key, wv.label, wv.tone, '') + '</span>' +
        '<span class="srow__meta">' +
          '<span class="srow__model' + (isEx ? ' is-exception' : '') + '" title="' + esc(w.why_merge_model || 'افتراضي الدمج') + '">' + esc(w.merge_model) + '</span>' +
          (wv.key === 'merged' ? '<span class="muted srow__done">مدمجة</span>' : cmdBtn(wv.mergeCmd, wv.key === 'ready')) +
          toggleBtn('merge-' + w.id, 'التفاصيل') +
        '</span>' +
      '</div>' +
      '<div class="srow__panel" id="' + pid + '"' + (open ? '' : ' hidden') + '>' +
        '<p class="srow__goal">' + md(w.why_together) + '</p>' +
        (wv.mergeBlockers.length ? '<div class="srow__why"><strong>ما يمنع الدمج:</strong><ul class="plain-list">' + wv.mergeBlockers.map(function (b) { return '<li>' + md(b) + '</li>'; }).join('') + '</ul></div>' : '') +
        '<dl class="kv kv--tight"><dt>الجلسة</dt><dd>جلسة في النسخة الرئيسية بلا worktree، بمودل ' + esc(w.merge_model) + (isEx ? ' <span class="muted">(' + md(w.why_merge_model || '') + ')</span>' : '') + '</dd>' +
          '<dt>ترتيب الدمج</dt><dd>' + wv.stages.map(function (v) { return '<bdi class="ltr">' + esc(v.stage.id) + '</bdi> (<bdi class="ltr">' + esc(v.stage.header.branch) + '</bdi>)'; }).join(' ثم ') + '</dd>' +
          '<dt>بوابة الموجة</dt><dd>' + md(w.gate) + '</dd>' +
          '<dt>الجولة اليدوية</dt><dd>' + md(w.manual || 'لا شيء.') + '</dd>' +
          '<dt>بعد الدمج</dt><dd>' + (wv.nextWave ? 'يُفتح وسم <bdi class="ltr">mj-' + esc(wv.nextWave) + '/base</bdi> للموجة ' + esc(wv.nextWave) : 'آخر موجة؛ لا وسم بعدها') + '</dd></dl>' +
        '<div class="srow__actions" data-copy-scope>' + (wv.key === 'merged' ? '' : copyBtn(mergePrompt(wv), 'نسخ برومبت الدمج الكامل')) + fileLink('Docs/MJ/README.md', 'دور منسّق الدمج') + '</div>' +
      '</div></div>';
  }
  function waveBox(wv, W, prevView, prevWave) {
    var w = wv.wave;
    return '<details class="wavebox' + (wv.isCurrent ? ' is-current' : '') + '"' + (wv.isCurrent ? ' open' : '') + '><summary class="wavebox__sum"><span class="wavebox__num" aria-hidden="true">' + esc(w.id) + '</span><span class="wavebox__title">الموجة ' + esc(w.id) + ': ' + esc(w.title) + ' <span class="wavebox__sub">' + wv.stages.map(function (v) { return v.stage.id; }).join(' · ') + '</span></span><span class="wavebox__meta">' + statusText(wv.key, wv.label, wv.tone, '') + plainChip(wv.counts.merged + ' من ' + wv.counts.total + ' مهام') + (wv.isCurrent ? chip('الحالية', 'ready') : '') + '</span></summary>' +
      '<div class="wavebox__body"><ul class="srows">' + wv.stages.map(function (v) { return stageRow(v, W, wv, prevWave); }).join('') + '</ul>' + mergeRow(wv, W, prevView) + '</div></details>';
  }
  function renderWave() {
    var MJ = DATA.mj;
    var V = D.mjView(plan, projectStatus, MJ);
    if (!V) return { html: '<p class="empty">لا بيانات موجات؛ شغّل <code dir="ltr">node tools/build.mjs --sync</code>.</p>', count: null };
    var W = MJ.waves, cur = V.current;
    var idxOf = {}; V.waves.forEach(function (wv, i) { idxOf[wv.wave.id] = i; });
    var box = function (wv) { var i = idxOf[wv.wave.id]; return waveBox(wv, W, i > 0 ? V.waves[i - 1] : null, i > 0 ? V.waves[i - 1].wave.id : null); };
    var h = '<div class="wave-head"><h1>الموجات والمراحل</h1><p>' + V.waves.length + ' موجات · ' + V.stageCount + ' مرحلة · ' + V.counts.total + ' مهمة. كل مرحلة جلسة worktree تفتحها أنت؛ وكل موجة تُغلق بجلسة دمج.</p></div>';
    h += '<section class="card nowbar" data-copy-scope>' +
      '<div class="nowbar__state"><span class="nowbar__label">الآن</span><strong class="nowbar__wave">' + (cur ? 'الموجة ' + esc(cur.wave.id) + ': ' + esc(cur.wave.title) : 'اكتملت كل الموجات') + '</strong>' + (cur ? statusText(cur.key, cur.label, cur.tone, '') : statusText('merged', 'مدمجة ومتحقق منها', 'ok', '✓')) + '<span class="nowbar__progress">' + V.counts.merged + ' من ' + V.counts.total + ' مهمة مدمجة' + (V.counts.implemented ? ' · ' + V.counts.implemented + ' على فرع' : '') + (V.counts.active ? ' · ' + V.counts.active + ' جارية' : '') + '</span></div>' +
      '<div class="nowbar__next"><span class="nowbar__label">الخطوة التالية</span><span>' + md(V.next.text) + '</span>' + (V.next.cmd ? cmdBtn(V.next.cmd, true) : '') + '</div>' +
      '<p class="nowbar__foot">آخر مزامنة <bdi class="ltr">' + esc(MJ.generatedAt) + '</bdi>' + (MJ.repo ? ' من ' + (MJ.repo.isMain ? 'النسخة الرئيسية' : 'worktree على <bdi class="ltr">' + esc(MJ.repo.branch) + '</bdi>') : '') + ' · تجمع تقدم الفروع قبل الدمج؛ يكفي تحديث الصفحة.</p></section>';
    // الموجة الحالية أولًا حتى تظهر مراحلها وأمر دمجها دون تمرير؛ ثم التالية، ثم المدمجة.
    if (cur) h += box(cur);
    var nextW = V.waves.filter(function (wv) { return cur && idxOf[wv.wave.id] > idxOf[cur.wave.id]; });
    var doneW = V.waves.filter(function (wv) { return wv.key === 'merged'; });
    if (nextW.length) h += '<h2 class="wave-group">الموجات التالية</h2>' + nextW.map(box).join('');
    if (doneW.length) h += '<h2 class="wave-group">الموجات المدمجة</h2>' + doneW.map(box).join('');
    h += '<details class="card stage__details wave-models" style="margin-top:20px"><summary>المودلات وطريقة العمل</summary><div>' +
      '<h3>المودلات</h3><p style="margin:0 0 6px">' + md(W.model_rule) + '</p>' +
      '<table class="tbl"><thead><tr><th>المرحلة أو الموجة</th><th>المودل</th><th>السبب</th></tr></thead><tbody>' +
      '<tr><td data-label="المرحلة أو الموجة">افتراضي المراحل والدمج</td><td data-label="المودل">' + esc(W.default_model) + '</td><td data-label="السبب">مهام محددة المواصفات بمعايير قبول واضحة.</td></tr>' +
      MJ.stages.filter(function (s) { return s.header.model !== W.default_model; }).map(function (s) { return '<tr><td data-label="المرحلة أو الموجة"><bdi class="ltr">' + esc(s.header.id) + '</bdi> ' + esc(s.header.title) + '</td><td data-label="المودل">' + esc(s.header.model) + '</td><td data-label="السبب">' + md(s.header.why_model) + '</td></tr>'; }).join('') +
      W.waves.filter(function (w) { return w.merge_model !== W.default_merge_model; }).map(function (w) { return '<tr><td data-label="المرحلة أو الموجة">دمج الموجة ' + esc(w.id) + '</td><td data-label="المودل">' + esc(w.merge_model) + '</td><td data-label="السبب">' + md(w.why_merge_model || '') + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h3>طريقة العمل</h3>' + list(['تفتح جلسة مستقلة بخيار worktree لكل مرحلة قابلة للبدء، تختار مودلها، وتلصق أمرها القصير `/mj MJn` أو البرومبت الكامل من تفاصيلها. المراحل المستقلة في الموجة تعمل بالتوازي.', 'جلسة المرحلة تتحقق من الفرع والأساس والاعتماديات، وتنفّذ وتفحص بنفسها، وتحدّث ملف مرحلتها وتزامن اللوحة، وتسلّم «جاهزة للدمج» بمرجع الالتزام وتتوقف.', 'بعد اكتمال التسليمات تفتح جلسة في النسخة الرئيسية وتلصق `/mj-merge X`: تكتشف الفروع وتدمجها بالترتيب على فرع تكامل وتفحص الشجرة المجمّعة وتنقلها إلى main وتفتح الموجة التالية بوسمها.', 'لا تبدأ مرحلة ولا تُدمج موجة إلا بأمرك؛ ولا رفع ولا نشر. القواعد كاملة في `Docs/MJ/README.md`.']) +
      '<div class="files">' + fileLink('Docs/MJ/README.md', 'Docs/MJ/README.md') + fileLink('STATUS.md', 'STATUS.md') + fileLink('DECISIONS.md', 'DECISIONS.md') + '</div></div></details>';
    return { html: h, count: null };
  }
  // النسخ: يتغير نص الزر نفسه لحظة للتأكيد؛ وعند تعذّر النسخ يظهر النص جاهزًا للتحديد تحت الصف.
  var liveEl = null;
  function announce(msg) {
    if (!liveEl) { liveEl = document.createElement('p'); liveEl.className = 'sr-only'; liveEl.setAttribute('aria-live', 'polite'); document.body.appendChild(liveEl); }
    liveEl.textContent = ''; setTimeout(function () { liveEl.textContent = msg; }, 30);
  }
  function copyText(text, btn) {
    var scope = btn.closest('[data-copy-scope]') || btn.parentElement;
    function ok() {
      if (!btn.getAttribute('data-label')) btn.setAttribute('data-label', btn.innerHTML);
      btn.innerHTML = '✓ نُسخ'; btn.classList.add('is-copied');
      announce('نُسخ إلى الحافظة');
      clearTimeout(btn._t); btn._t = setTimeout(function () { btn.innerHTML = btn.getAttribute('data-label'); btn.classList.remove('is-copied'); }, 1800);
      var old = scope.parentElement && scope.parentElement.querySelector(':scope > .copy-fallback-box'); if (old) old.remove();
    }
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      var done = false; try { done = document.execCommand('copy'); } catch (e) { done = false; }
      ta.remove();
      if (done) { ok(); return; }
      var box = scope.parentElement.querySelector(':scope > .copy-fallback-box');
      if (!box) { box = document.createElement('div'); box.className = 'copy-fallback-box'; scope.insertAdjacentElement('afterend', box); }
      box.innerHTML = '<p>تعذّر النسخ تلقائيًا؛ النص محدَّد، انسخه بـ<bdi class="ltr">Cmd+C</bdi> أو <bdi class="ltr">Ctrl+C</bdi>:</p><textarea readonly rows="' + Math.min(8, text.split('\n').length) + '" dir="auto"></textarea>';
      var inp = box.querySelector('textarea'); inp.value = text; inp.focus(); inp.select();
      announce('تعذّر النسخ تلقائيًا؛ النص محدَّد للنسخ اليدوي');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
  }

  // ---------- العرض والتوجيه ----------
  function render(keepScroll) {
    var y = window.scrollY;
    var st = projectStatus;
    var filt = FILTERABLE[ui.view];
    document.getElementById('filters').hidden = !filt;
    ['phase', 'module', 'status'].forEach(function (k) { document.querySelector('[data-filter="' + k + '"]').hidden = filt !== true; });
    var r = VIEWS[ui.view](st);
    main.innerHTML = r.html;
    countEl.textContent = r.count ? 'النتائج: ' + r.count : '';
    document.querySelectorAll('#tabs a').forEach(function (a) { if (a.getAttribute('data-view') === ui.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
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
    if (cp) { copyText(cp.getAttribute('data-copy'), cp); return; }
    var rt = e.target.closest('[data-row-toggle]');
    if (rt) {
      var pid = 'p-' + rt.getAttribute('data-row-toggle');
      var panel = document.getElementById(pid);
      ui.open[pid] = !ui.open[pid];
      rt.setAttribute('aria-expanded', String(!!ui.open[pid]));
      if (panel) panel.hidden = !ui.open[pid];
      return;
    }
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

  fillStatus();
  route();
})();

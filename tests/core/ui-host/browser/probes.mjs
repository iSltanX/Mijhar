// دوال قياس تُنفَّذ في عالم الصفحة (Playwright evaluate أو Marionette ExecuteScript)، فلا تستورد شيئًا.
// جذور الظل مفتوحة، فيُقرأ ما فيها من الصفحة.

export const UI_PROPS = [
  'display', 'position', 'visibility', 'opacity', 'z-index', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
  'color', 'background-color', 'letter-spacing', 'word-spacing', 'text-transform', 'text-shadow', 'text-align', 'direction', 'box-sizing',
  'padding-top', 'padding-left', 'margin-top', 'margin-left', 'border-top-width', 'border-top-style', 'border-top-color', 'border-top-left-radius',
  'height', 'width', 'cursor', 'outline-style', 'transition-duration', 'writing-mode', 'transform', 'filter', 'pointer-events', 'clip-path',
];

/** أنماط عناصر الواجهة المحقونة (الدرج وسطح الوحدة a) وموضع الدرج وما يعلوه. */
export function snapshotUi(props) {
  const pick = (el, skip = []) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const out = {};
    for (const p of props) if (!skip.includes(p)) out[p] = cs.getPropertyValue(p);
    return out;
  };
  const safe = (fn) => {
    try {
      return fn();
    } catch (error) {
      return `error: ${error.message}`;
    }
  };
  const hosts = [...document.querySelectorAll('mijhar-host')];
  const byName = (name) => hosts.find((h) => h.getAttribute('data-mijhar-host') === name);
  const out = { hostCount: hosts.length };
  const drawer = byName('drawer');
  if (drawer) {
    const s = drawer.shadowRoot;
    const r = drawer.getBoundingClientRect();
    out.drawerHost = pick(drawer);
    // الموضع نسبةً إلى الكتلة الحاوية الأولى (عرض المستند دون شريط التمرير): شريط Firefox الكلاسيكي يأخذ 15 بكسل حيث
    // يظهر، والصفحة المعادية تخفيه بـoverflow: hidden، فالقياس المطلق يختلف بلا تسرب نمط.
    const cw = document.documentElement.clientWidth;
    const ch = document.documentElement.clientHeight;
    out.drawerRect = { fromRight: Math.round(cw - r.right), top: Math.round(r.top), w: Math.round(r.width), fullHeight: Math.round(r.height) === Math.round(innerHeight) || Math.round(r.height) === ch };
    out.drawerMeta = { popoverOpen: safe(() => drawer.matches(':popover-open')), styleMode: drawer.getAttribute('data-mijhar-styles') };
    out.drawer = pick(s.querySelector('.drawer'));
    out.title = pick(s.querySelector('.drawer-header h1'));
    out.tabSelected = pick(s.querySelector('[role="tab"][aria-selected="true"]'));
    out.tab = pick(s.querySelector('[role="tab"][aria-selected="false"]'));
    out.close = pick(s.querySelector('.icon-btn'));
    out.empty = pick(s.querySelector('.empty'));
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    out.drawerHit = hit === drawer ? 'drawer' : hit ? `${hit.localName}${hit.id ? `#${hit.id}` : ''}${hit.className ? `.${String(hit.className).split(' ')[0]}` : ''}` : null;
  }
  const fake = byName('a');
  if (fake) {
    const s = fake.shadowRoot;
    // العرض يتبع عرض حاوية الصفحة (الوحدة جزء من سريانها)، فلا يُقارن.
    out.fakeHost = pick(fake, ['width']);
    out.fakeMeta = { styleMode: fake.getAttribute('data-mijhar-styles') };
    out.fake = pick(s.querySelector('.fake'), ['width']);
    out.fakeButton = pick(s.querySelector('.fake .btn'));
    out.fakeText = pick(s.querySelector('.fake p'), ['width']);
  }
  return out;
}

/** أنماط عناصر الصفحة التي تحمل أسماء أصناف الواجهة، وما في المستند من أوراق أنماط. */
export function snapshotPage(props) {
  const pick = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const out = { rect: `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}` };
    for (const p of props) out[p] = cs.getPropertyValue(p);
    return out;
  };
  const sel = {
    root: '#probe-root',
    tab: '#probe-tab',
    toggle: '#probe-toggle',
    drawer: '#probe-drawer',
    drawerTitle: '#probe-drawer h1',
    githubButton: '.js-new-comment-form .btn.btn-primary',
    title: '.gh-header-title',
    comment: '.comment-body p',
    body: 'body',
  };
  const out = {};
  for (const [k, s] of Object.entries(sel)) out[k] = pick(document.querySelector(s));
  out.documentSheets = {
    styleSheets: document.styleSheets.length,
    adopted: document.adoptedStyleSheets?.length ?? null,
    styleElements: document.querySelectorAll('style').length,
    linkElements: document.querySelectorAll('link[rel="stylesheet"]').length,
    headChildren: document.head.children.length,
  };
  return out;
}

/** معرّفات الوحدات الوهمية المركَّبة في الصفحة. */
export function mountedUnits() {
  return [...document.querySelectorAll('mijhar-host')]
    .map((h) => h.shadowRoot?.querySelector('[data-fake-unit]')?.getAttribute('data-fake-unit'))
    .filter(Boolean)
    .sort();
}

export function contentState() {
  const root = document.documentElement;
  return {
    content: root.getAttribute('data-mj-content'),
    drawer: root.getAttribute('data-mj-drawer'),
    page: root.getAttribute('data-mj-page'),
    error: root.getAttribute('data-mj-error'),
    units: [...document.querySelectorAll('mijhar-host')].map((h) => h.getAttribute('data-mijhar-host')),
    bodyOutline: getComputedStyle(document.body).outlineColor,
  };
}

/** العنصر النشط داخل الدرج (عبر جذر الظل). */
export function drawerFocus() {
  const drawer = [...document.querySelectorAll('mijhar-host')].find((h) => h.getAttribute('data-mijhar-host') === 'drawer');
  const active = drawer?.shadowRoot?.activeElement;
  return { documentActive: document.activeElement?.localName ?? null, inside: active ? `${active.localName}${active.id ? `#${active.id}` : ''}` : null };
}

/** يقارن قياسين: كل خاصية اختلفت بين عنصرين بالاسم نفسه. */
export function diffSnapshots(a, b, keys) {
  const diffs = [];
  for (const key of keys) {
    const x = a?.[key];
    const y = b?.[key];
    if (x === undefined && y === undefined) continue;
    if (!x || !y || typeof x !== 'object') {
      if (JSON.stringify(x) !== JSON.stringify(y)) diffs.push({ key, prop: '*', a: x ?? null, b: y ?? null });
      continue;
    }
    for (const prop of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (JSON.stringify(x[prop]) !== JSON.stringify(y[prop])) diffs.push({ key, prop, a: x[prop] ?? null, b: y[prop] ?? null });
    }
  }
  return diffs;
}

export const UI_KEYS = ['drawerHost', 'drawerRect', 'drawer', 'title', 'tabSelected', 'tab', 'close', 'empty', 'drawerHit', 'fakeHost', 'fake', 'fakeButton', 'fakeText'];
export const PAGE_KEYS = ['root', 'tab', 'toggle', 'drawer', 'drawerTitle', 'githubButton', 'title', 'comment', 'body', 'documentSheets'];

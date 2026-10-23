// سكربت محتوى تجربة T-0.5 (لا يُشحن): مضيف Shadow DOM في صفحة GitHub حية بأزرار تقيس الكتابة إلى الحافظة من السياق المحقون،
// وطلب مزوّد التحليل من سياق المحتوى، والوصول إلى التخزين قبل ضبط مستواه وبعده. النتائج في data-results على المضيف (يقرؤها المشغّل).
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  const host = document.createElement('mijhar-t05');
  host.id = 'mj-t05';
  const root = host.attachShadow({ mode: 'open' });
  const results = {};
  const save = () => host.setAttribute('data-results', JSON.stringify(results));
  const record = (name, value) => {
    results[name] = { ...value, at: Date.now() };
    save();
  };
  const err = (e) => ({ name: e?.name ?? null, message: String(e?.message ?? e).slice(0, 300) });
  const facts = () => ({ hasFocus: document.hasFocus(), visibility: document.visibilityState, activation: navigator.userActivation ? { isActive: navigator.userActivation.isActive, hasBeenActive: navigator.userActivation.hasBeenActive } : null, clipboardApi: typeof navigator.clipboard?.writeText });

  async function write(label, text) {
    const before = facts();
    try {
      await navigator.clipboard.writeText(text);
      record(label, { ok: true, text, ...before });
    } catch (e) {
      record(label, { ok: false, error: err(e), text, ...before });
    }
  }

  const buttons = {
    // نقر مستخدم ثم writeText مباشرة.
    write: () => write('write', `mijhar-t05:write:${Date.now()}`),
    // البديل القديم: textarea مؤقتة في الصفحة وexecCommand('copy') بنقر مستخدم.
    exec: () => {
      const before = facts();
      const text = `mijhar-t05:exec:${Date.now()}`;
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.append(area);
      area.select();
      let ok = null;
      let error = null;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        error = err(e);
      }
      area.remove();
      record('exec', { ok, error, text, ...before });
    },
    // البديل داخل جذر الظل نفسه (لا يمس DOM الصفحة).
    'exec-shadow': () => {
      const before = facts();
      const text = `mijhar-t05:exec-shadow:${Date.now()}`;
      const area = document.createElement('textarea');
      area.value = text;
      root.append(area);
      area.focus();
      area.select();
      let ok = null;
      let error = null;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        error = err(e);
      }
      area.remove();
      record('exec-shadow', { ok, error, text, ...before });
    },
    // نقر ثم انتظار 6 ثوانٍ (بعد انقضاء التفعيل العابر نحو 5 ثوانٍ) ثم writeText.
    late: () => {
      setTimeout(() => void write('late', `mijhar-t05:late:${Date.now()}`), 6000);
    },
    // الطلب من الخلفية: هل للحافظة واجهة هناك.
    background: async () => {
      const r = await api.runtime.sendMessage({ t05: 'bg-clipboard', text: `mijhar-t05:background:${Date.now()}` }).catch((e) => ({ messageError: err(e) }));
      record('background', r ?? { noReply: true });
    },
    // طلب المزوّد من سكربت المحتوى (أصل github.com): CORS والترويسات.
    provider: async () => {
      const probe = JSON.parse(host.getAttribute('data-provider-probe') ?? '{}');
      const out = [];
      for (const variant of probe.variants ?? []) {
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: variant.headers, body: JSON.stringify(probe.body) });
          let body = null;
          try {
            body = await response.json();
          } catch {}
          out.push({ variant: variant.name, status: response.status, type: response.type, error: body?.error ?? null, headers: { 'content-type': response.headers.get('content-type'), 'access-control-allow-origin': response.headers.get('access-control-allow-origin'), 'request-id': response.headers.get('request-id') ? 'موجود' : null } });
        } catch (e) {
          out.push({ variant: variant.name, threw: err(e) });
        }
      }
      record('provider', { results: out });
    },
    // قراءة التخزين من سكربت المحتوى (بعد أن تكتب الخلفية قيمة وتضبط مستوى الوصول).
    storage: async () => {
      const out = {};
      for (const area of ['local', 'session']) {
        try {
          const got = await api.storage[area].get('t05-secret');
          out[area] = { ok: true, visible: got['t05-secret'] !== undefined };
        } catch (e) {
          out[area] = { ok: false, error: err(e) };
        }
      }
      record(`storage-${host.getAttribute('data-storage-phase') ?? 'unknown'}`, out);
    },
  };

  root.innerHTML = '<style>:host{all:initial;position:fixed;inset-block-start:8px;inset-inline-start:8px;z-index:2147483647;display:flex;gap:4px;flex-wrap:wrap;background:#fff;padding:4px;border:1px solid #888}button{font:12px sans-serif}</style>';
  for (const name of Object.keys(buttons)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = `t05-${name}`;
    b.textContent = name;
    b.addEventListener('click', () => void buttons[name]());
    root.append(b);
  }
  document.documentElement.append(host);
  // بلا نقر: كتابة عند التحميل.
  void write('auto', `mijhar-t05:auto:${Date.now()}`);
  save();
})();

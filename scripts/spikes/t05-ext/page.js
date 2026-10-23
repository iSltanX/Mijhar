// صفحة إضافة تجربة T-0.5 (لا تُشحن): الكتابة إلى الحافظة من صفحة الإضافة بنقر، وطلب المزوّد من صفحة الإضافة. النتائج في data-results.
const results = {};
const err = (e) => ({ name: e?.name ?? null, message: String(e?.message ?? e).slice(0, 300) });
const save = () => document.body.setAttribute('data-results', JSON.stringify(results));

document.getElementById('write').addEventListener('click', async () => {
  const text = `mijhar-t05:page:${Date.now()}`;
  const facts = { hasFocus: document.hasFocus(), visibility: document.visibilityState };
  try {
    await navigator.clipboard.writeText(text);
    results.write = { ok: true, text, ...facts };
  } catch (e) {
    results.write = { ok: false, error: err(e), text, ...facts };
  }
  save();
});

// طلب المزوّد من صفحة الإضافة: الإعداد في data-provider-probe على body (يضعه المشغّل)، ولا يُعاد المفتاح في النتيجة.
document.getElementById('provider').addEventListener('click', async () => {
  const probe = JSON.parse(document.body.getAttribute('data-provider-probe') ?? '{}');
  document.body.removeAttribute('data-provider-probe');
  const out = [];
  for (const variant of probe.variants ?? []) {
    try {
      const response = await fetch(probe.url ?? 'https://api.anthropic.com/v1/messages', { method: 'POST', headers: variant.headers, body: JSON.stringify(probe.body) });
      let body = null;
      try {
        body = await response.json();
      } catch {}
      out.push({ variant: variant.name, status: response.status, type: response.type, error: body?.error ?? null, headers: { 'access-control-allow-origin': response.headers.get('access-control-allow-origin'), 'content-type': response.headers.get('content-type') } });
    } catch (e) {
      out.push({ variant: variant.name, threw: err(e) });
    }
  }
  results.provider = { results: out };
  save();
});
save();

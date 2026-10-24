// خلفية قياس MJ24 (T-11.11، HYP-20؛ لا تُشحن): طلب واجهة OpenAI مباشرة من خلفية الإضافة بمفتاح غير صالح عمدًا وبلا أي محتوى.
// لا يمر طلب بوسيط. تُقرأ حالة الرد ونوعه وترويسات CORS وجسم الخطأ المعلن، ولا يُخزَّن شيء.
const api = globalThis.browser ?? globalThis.chrome;
const HOST = 'https://api.openai.com';

async function probe(spec) {
  const started = Date.now();
  try {
    const response = await fetch(`${HOST}${spec.path}`, { method: spec.method, headers: spec.headers, body: spec.body ? JSON.stringify(spec.body) : undefined, credentials: 'omit', cache: 'no-store' });
    let body = null;
    try {
      body = await response.json();
    } catch {}
    const headers = {};
    for (const name of ['content-type', 'access-control-allow-origin', 'retry-after', 'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']) headers[name] = response.headers.get(name);
    headers['x-request-id'] = response.headers.get('x-request-id') ? 'موجود' : null;
    return { name: spec.name, ok: true, status: response.status, type: response.type, ms: Date.now() - started, headers, error: body?.error ? { type: body.error.type ?? null, code: body.error.code ?? null, message: String(body.error.message ?? '').slice(0, 200) } : null, bodyKeys: body && typeof body === 'object' ? Object.keys(body) : null };
  } catch (e) {
    return { name: spec.name, ok: false, threw: { name: e?.name ?? null, message: String(e?.message ?? e).slice(0, 200) }, ms: Date.now() - started };
  }
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.t1111) return undefined;
  (async () => {
    const out = [];
    for (const spec of message.probes) out.push(await probe(spec));
    return { context: typeof window === 'undefined' ? 'service-worker' : 'background-page', results: out };
  })().then(sendResponse, (e) => sendResponse({ threw: String(e?.message ?? e) }));
  return true;
});
